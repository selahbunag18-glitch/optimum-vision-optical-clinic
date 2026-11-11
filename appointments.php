<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

// Patients can only book slots from today up to this many days ahead.
// This matches the limit used by slots.php.
const MAX_DAYS_AHEAD = 30;

// Pagination limits for list endpoints.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// Maximum length of the reason and staff notes fields (matches the database columns).
const MAX_TEXT_LENGTH = 255;

// All appointment statuses stored in the database.
const ALL_STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'Rejected', 'No-Show'];

// Statuses that staff can set through the status endpoint.
const STAFF_TARGET_STATUSES = ['Confirmed', 'Rejected', 'Completed', 'No-Show', 'Cancelled'];

// Allowed status changes. Completed, Cancelled, Rejected, and No-Show are final.
const STATUS_TRANSITIONS = [
    'Pending' => ['Confirmed', 'Rejected', 'Cancelled'],
    'Confirmed' => ['Completed', 'No-Show', 'Cancelled'],
];

// Base query used to load appointments together with slot and patient details.
const APPOINTMENT_SELECT =
'SELECT a.id, a.patient_id, a.slot_id, a.reason, a.status, a.staff_notes,
            a.created_at, a.updated_at,
            s.slot_date, s.slot_time,
            u.full_name, u.email, p.phone
     FROM appointments a
     INNER JOIN appointment_slots s ON s.id = a.slot_id
     INNER JOIN patients p ON p.id = a.patient_id
     INNER JOIN users u ON u.id = p.user_id ';

// ---------------------------------------------------------------------
// Small helper functions used only by this file
// (some are the same as in slots.php, which is a separate endpoint file)
// ---------------------------------------------------------------------

/**
 * Return the date string if it is a real date in YYYY-MM-DD format, otherwise null.
 */
function parse_date_string(string $value): ?string
{
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if ($date === false || $date->format('Y-m-d') !== $value) {
        return null;
    }
    return $value;
}

/**
 * Convert a whole number (int or digit string) to a positive int. Otherwise null.
 * Booleans, decimals, and arrays are rejected on purpose.
 */
function parse_positive_int($value): ?int
{
    if (is_int($value)) {
        $number = $value;
    } elseif (is_string($value) && preg_match('/^[0-9]{1,10}$/', trim($value)) === 1) {
        $number = (int)trim($value);
    } else {
        return null;
    }
    return $number >= 1 ? $number : null;
}

function today_string(): string
{
    return date('Y-m-d');
}

function add_days_to_date(string $date, int $days): string
{
    return (new DateTimeImmutable($date))->modify('+' . $days . ' days')->format('Y-m-d');
}

/**
 * Check whether a date and time have already passed.
 */
function is_in_the_past(string $date, string $time): bool
{
    return strtotime($date . ' ' . $time) <= time();
}

function get_query_string(string $key): string
{
    return (isset($_GET[$key]) && is_string($_GET[$key])) ? trim($_GET[$key]) : '';
}

function is_duplicate_entry_error(Throwable $e): bool
{
    return $e instanceof PDOException && ($e->errorInfo[1] ?? 0) === 1062;
}

/**
 * Read the JSON body if there is one. Returns an empty array when the body is empty.
 */
function read_optional_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond_error(400, 'Invalid JSON request body.');
    }
    return $decoded;
}

/**
 * Read the appointment id from the query string (?id=5). Stops with 400 if invalid.
 */
function get_appointment_id_from_query(): int
{
    $id = parse_positive_int($_GET['id'] ?? null);
    if ($id === null) {
        respond_error(400, 'The id parameter must be a positive integer.');
    }
    return $id;
}

/**
 * Build an error result: [HTTP status, JSON payload].
 */
function error_result(int $status, string $message, array $extra = []): array
{
    return [$status, array_merge(['success' => false, 'message' => $message], $extra)];
}

/**
 * Run a function inside a database transaction and return its result.
 * The function must return [HTTP status, JSON payload]. Any exception rolls back.
 */
function run_in_transaction(PDO $pdo, callable $work): array
{
    $pdo->beginTransaction();
    try {
        $result = $work();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/**
 * Find the patient id that belongs to a logged-in user. Returns null if none.
 */
function find_patient_id(PDO $pdo, int $userId): ?int
{
    $stmt = $pdo->prepare('SELECT id FROM patients WHERE user_id = :user_id LIMIT 1');
    $stmt->execute(['user_id' => $userId]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int)$id;
}

/**
 * Return the patient id for a logged-in patient, or stop with 403.
 */
function require_patient_id(PDO $pdo, array $user): int
{
    $patientId = find_patient_id($pdo, $user['id']);
    if ($patientId === null) {
        respond_error(403, 'No patient profile is linked to this account.');
    }
    return $patientId;
}

/**
 * Load one appointment with slot and patient details. Returns null if not found.
 */
function fetch_appointment(PDO $pdo, int $appointmentId): ?array
{
    $stmt = $pdo->prepare(APPOINTMENT_SELECT . 'WHERE a.id = :id LIMIT 1');
    $stmt->execute(['id' => $appointmentId]);
    $row = $stmt->fetch();
    return $row ? $row : null;
}

/**
 * Shape one database row into the JSON format sent to the app.
 * Staff notes and patient contact details are only included for staff.
 */
function format_appointment(array $row, bool $forStaff): array
{
    $appointment = [
        'id' => (int)$row['id'],
        'status' => $row['status'],
        'reason' => $row['reason'],
        'slot' => [
            'id' => (int)$row['slot_id'],
            'slot_date' => $row['slot_date'],
            'slot_time' => substr((string)$row['slot_time'], 0, 5),
            'slot_time_label' => date('g:i A', strtotime((string)$row['slot_time'])),
        ],
        'is_past' => is_in_the_past($row['slot_date'], $row['slot_time']),
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];

    if ($forStaff) {
        $appointment['staff_notes'] = $row['staff_notes'];
        $appointment['patient'] = [
            'id' => (int)$row['patient_id'],
            'full_name' => $row['full_name'],
            'email' => $row['email'],
            'phone' => $row['phone'],
        ];
    }

    return $appointment;
}

/**
 * Lock one slot row so no one else can book or change it until the transaction ends.
 */
function lock_slot(PDO $pdo, int $slotId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, slot_date, slot_time, is_available
         FROM appointment_slots
         WHERE id = :id
         FOR UPDATE'
    );
    $stmt->execute(['id' => $slotId]);
    $row = $stmt->fetch();
    return $row ? $row : null;
}

/**
 * Check whether a (locked) slot can be booked.
 * Returns null if it can be booked, or an error result [status, payload] if not.
 * enforceWindow = true applies the 30-day booking limit (used for patients).
 */
function get_slot_booking_problem(PDO $pdo, ?array $slot, bool $enforceWindow): ?array
{
    if ($slot === null) {
        return error_result(404, 'Slot not found.');
    }
    if ((int)$slot['is_available'] !== 1) {
        return error_result(409, 'This slot is not available for booking.');
    }
    if (is_in_the_past($slot['slot_date'], $slot['slot_time'])) {
        return error_result(409, 'This slot is in the past and cannot be booked.');
    }
    if ($enforceWindow && $slot['slot_date'] > add_days_to_date(today_string(), MAX_DAYS_AHEAD)) {
        return error_result(
            409,
            'This slot is more than ' . MAX_DAYS_AHEAD . ' days ahead and cannot be booked yet.'
        );
    }

    // Only one Pending or Confirmed appointment may use a slot.
    $stmt = $pdo->prepare('SELECT id FROM appointments WHERE active_slot_id = :slot_id LIMIT 1');
    $stmt->execute(['slot_id' => (int)$slot['id']]);
    if ($stmt->fetch()) {
        return error_result(409, 'This slot is already booked. Please choose another time.');
    }

    return null;
}

/**
 * Read the optional staff_notes field from a request body.
 * Returns [provided, value]. An empty string clears the notes (value = null).
 */
function read_staff_notes(array $input, array &$errors): array
{
    if (!array_key_exists('staff_notes', $input)) {
        return [false, null];
    }

    $value = $input['staff_notes'];
    if ($value === null) {
        return [true, null];
    }
    if (!is_string($value)) {
        $errors['staff_notes'] = 'staff_notes must be text.';
        return [false, null];
    }

    $value = trim($value);
    if (mb_strlen($value) > MAX_TEXT_LENGTH) {
        $errors['staff_notes'] = 'staff_notes cannot be longer than ' . MAX_TEXT_LENGTH . ' characters.';
        return [false, null];
    }

    return [true, $value === '' ? null : $value];
}

/**
 * Read page and limit from the query string.
 * Returns [limit, page]. Validation problems are added to $errors.
 */
function read_pagination(array &$errors): array
{
    $limit = DEFAULT_PAGE_SIZE;
    $page = 1;

    $limitText = get_query_string('limit');
    if ($limitText !== '') {
        $parsed = parse_positive_int($limitText);
        if ($parsed === null || $parsed > MAX_PAGE_SIZE) {
            $errors['limit'] = 'limit must be a whole number from 1 to ' . MAX_PAGE_SIZE . '.';
        } else {
            $limit = $parsed;
        }
    }

    $pageText = get_query_string('page');
    if ($pageText !== '') {
        $parsed = parse_positive_int($pageText);
        if ($parsed === null) {
            $errors['page'] = 'page must be a whole number of 1 or more.';
        } else {
            $page = $parsed;
        }
    }

    return [$limit, $page];
}

/**
 * Run a filtered, paginated appointment query.
 * $conditions and $params must only contain fixed SQL text and bound values.
 * $orderBy must be one of the fixed strings written in this file.
 */
function query_appointments(
    PDO $pdo,
    array $conditions,
    array $params,
    string $orderBy,
    int $limit,
    int $page,
    bool $forStaff
): array {
    $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) . ' ' : '';

    $countStmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM appointments a
         INNER JOIN appointment_slots s ON s.id = a.slot_id ' . $where
    );
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    // limit and offset are validated integers, so they are safe to write into the SQL.
    $offset = ($page - 1) * $limit;
    $stmt = $pdo->prepare(
        APPOINTMENT_SELECT . $where . 'ORDER BY ' . $orderBy . ' LIMIT ' . $limit . ' OFFSET ' . $offset
    );
    $stmt->execute($params);

    $appointments = [];
    foreach ($stmt->fetchAll() as $row) {
        $appointments[] = format_appointment($row, $forStaff);
    }

    return [
        'appointments' => $appointments,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => $total,
            'total_pages' => (int)ceil($total / $limit),
        ],
    ];
}

/**
 * Change the status of an appointment (used for cancel, confirm, reject, and so on).
 * If $restrictToPatientId is set, the appointment must belong to that patient.
 * $setNotes = true also updates staff_notes with $notesValue (null clears it).
 * Returns [HTTP status, JSON payload].
 */
function change_appointment_status(
    PDO $pdo,
    int $appointmentId,
    string $newStatus,
    ?int $restrictToPatientId,
    bool $setNotes,
    ?string $notesValue,
    string $successMessage
): array {
    $forStaff = ($restrictToPatientId === null);

    return run_in_transaction($pdo, function () use (
        $pdo,
        $appointmentId,
        $newStatus,
        $restrictToPatientId,
        $setNotes,
        $notesValue,
        $successMessage,
        $forStaff
    ) {
        // Lock the appointment row so two requests cannot change it at the same time.
        $stmt = $pdo->prepare(
            'SELECT id, patient_id, slot_id, status FROM appointments WHERE id = :id FOR UPDATE'
        );
        $stmt->execute(['id' => $appointmentId]);
        $appointment = $stmt->fetch();

        // A patient asking for someone else's appointment gets the same answer as a missing one.
        if (
            !$appointment
            || ($restrictToPatientId !== null && (int)$appointment['patient_id'] !== $restrictToPatientId)
        ) {
            return error_result(404, 'Appointment not found.');
        }

        $currentStatus = $appointment['status'];
        $allowedNext = STATUS_TRANSITIONS[$currentStatus] ?? [];
        if (!in_array($newStatus, $allowedNext, true)) {
            return error_result(
                409,
                'Cannot change the status from ' . $currentStatus . ' to ' . $newStatus . '.'
            );
        }

        // Time rules: confirm only upcoming appointments; complete or mark
        // no-show only after the appointment time has started.
        $slotStmt = $pdo->prepare('SELECT slot_date, slot_time FROM appointment_slots WHERE id = :id');
        $slotStmt->execute(['id' => (int)$appointment['slot_id']]);
        $slot = $slotStmt->fetch();
        $isPast = $slot ? is_in_the_past($slot['slot_date'], $slot['slot_time']) : false;

        if ($newStatus === 'Confirmed' && $isPast) {
            return error_result(409, 'This appointment time has already passed and cannot be confirmed.');
        }
        if (($newStatus === 'Completed' || $newStatus === 'No-Show') && !$isPast) {
            return error_result(
                409,
                'An appointment cannot be marked as ' . $newStatus . ' before its scheduled time.'
            );
        }

        // active_slot_id is a generated column, so it updates itself from the status.
        if ($setNotes) {
            $update = $pdo->prepare(
                'UPDATE appointments SET status = :status, staff_notes = :staff_notes WHERE id = :id'
            );
            $update->execute([
                'status' => $newStatus,
                'staff_notes' => $notesValue,
                'id' => $appointmentId,
            ]);
        } else {
            $update = $pdo->prepare('UPDATE appointments SET status = :status WHERE id = :id');
            $update->execute(['status' => $newStatus, 'id' => $appointmentId]);
        }

        return [200, [
            'success' => true,
            'message' => $successMessage,
            'data' => format_appointment((array)fetch_appointment($pdo, $appointmentId), $forStaff),
        ]];
    });
}

// ---------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------

/**
 * POST appointments.php?action=book
 * A patient requests an appointment for an available slot.
 * Body: { "slot_id": 12, "reason": "Routine eye examination" }
 * Both slot_id and reason are required.
 */
function handle_book(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, ['patient']);
    $patientId = require_patient_id($pdo, $user);

    $input = read_json_body();

    $errors = [];

    $slotId = parse_positive_int($input['slot_id'] ?? null);
    if ($slotId === null) {
        $errors['slot_id'] = 'slot_id is required and must be a positive whole number.';
    }

    // The reason is required. A missing, null, empty, or whitespace-only value is rejected.
    // The pattern also catches non-breaking and invisible characters such as a zero-width space.
    $reason = get_trimmed_string($input, 'reason');
    if ($reason === '' || preg_match('/^[\p{Z}\p{C}\s]*$/u', $reason) === 1) {
        $errors['reason'] = 'Reason for appointment is required.';
    } elseif (mb_strlen($reason) > MAX_TEXT_LENGTH) {
        $errors['reason'] = 'reason cannot be longer than ' . MAX_TEXT_LENGTH . ' characters.';
    }

    if ($errors) {
        respond_validation_error($errors);
    }

    try {
        [$status, $payload] = run_in_transaction($pdo, function () use ($pdo, $patientId, $slotId, $reason) {
            // Locking the slot makes two patients wait for each other instead of
            // booking the same slot at the same time.
            $slot = lock_slot($pdo, $slotId);
            $problem = get_slot_booking_problem($pdo, $slot, true);
            if ($problem !== null) {
                return $problem;
            }

            $insert = $pdo->prepare(
                'INSERT INTO appointments (patient_id, slot_id, reason, status)
                 VALUES (:patient_id, :slot_id, :reason, :status)'
            );
            $insert->execute([
                'patient_id' => $patientId,
                'slot_id' => $slotId,
                'reason' => $reason !== '' ? $reason : null,
                'status' => 'Pending',
            ]);
            $appointmentId = (int)$pdo->lastInsertId();

            return [201, [
                'success' => true,
                'message' => 'Appointment request submitted. Please wait for the clinic to confirm it.',
                'data' => format_appointment((array)fetch_appointment($pdo, $appointmentId), false),
            ]];
        });
    } catch (Throwable $e) {
        // Safety net: the unique key on active_slot_id rejected a second active booking.
        if (is_duplicate_entry_error($e)) {
            respond_error(409, 'This slot is already booked. Please choose another time.');
        }
        throw $e;
    }

    respond($status, $payload);
}

/**
 * GET appointments.php?action=my[&status=Pending][&page=1][&limit=50]
 * A patient's own appointments, newest date first.
 */
function handle_my_appointments(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, ['patient']);
    $patientId = require_patient_id($pdo, $user);

    $errors = [];

    $conditions = ['a.patient_id = :patient_id'];
    $params = ['patient_id' => $patientId];

    $statusFilter = get_query_string('status');
    if ($statusFilter !== '') {
        if (!in_array($statusFilter, ALL_STATUSES, true)) {
            $errors['status'] = 'status must be one of: ' . implode(', ', ALL_STATUSES) . '.';
        } else {
            $conditions[] = 'a.status = :status';
            $params['status'] = $statusFilter;
        }
    }

    [$limit, $page] = read_pagination($errors);

    if ($errors) {
        respond_validation_error($errors);
    }

    $data = query_appointments(
        $pdo,
        $conditions,
        $params,
        's.slot_date DESC, s.slot_time DESC, a.id DESC',
        $limit,
        $page,
        false
    );

    respond(200, ['success' => true, 'data' => $data]);
}

/**
 * GET appointments.php?action=list[&date=...][&date_from=...][&date_to=...][&status=...]
 * All appointments with patient details. Staff and owner only.
 * Sorted by slot date and time, earliest first.
 */
function handle_list_appointments(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);

    $errors = [];
    $conditions = [];
    $params = [];

    $statusFilter = get_query_string('status');
    if ($statusFilter !== '') {
        if (!in_array($statusFilter, ALL_STATUSES, true)) {
            $errors['status'] = 'status must be one of: ' . implode(', ', ALL_STATUSES) . '.';
        } else {
            $conditions[] = 'a.status = :status';
            $params['status'] = $statusFilter;
        }
    }

    $date = get_query_string('date');
    $dateFrom = get_query_string('date_from');
    $dateTo = get_query_string('date_to');

    if ($date !== '' && ($dateFrom !== '' || $dateTo !== '')) {
        $errors['date'] = 'Use either date, or date_from and date_to, not both.';
    } elseif ($date !== '') {
        if (parse_date_string($date) === null) {
            $errors['date'] = 'date must be a valid date in the format YYYY-MM-DD.';
        } else {
            $conditions[] = 's.slot_date = :date';
            $params['date'] = $date;
        }
    } else {
        if ($dateFrom !== '') {
            if (parse_date_string($dateFrom) === null) {
                $errors['date_from'] = 'date_from must be a valid date in the format YYYY-MM-DD.';
            } else {
                $conditions[] = 's.slot_date >= :date_from';
                $params['date_from'] = $dateFrom;
            }
        }
        if ($dateTo !== '') {
            if (parse_date_string($dateTo) === null) {
                $errors['date_to'] = 'date_to must be a valid date in the format YYYY-MM-DD.';
            } else {
                $conditions[] = 's.slot_date <= :date_to';
                $params['date_to'] = $dateTo;
            }
        }
        if (
            $dateFrom !== '' && $dateTo !== '' && !isset($errors['date_from']) && !isset($errors['date_to'])
            && $dateTo < $dateFrom
        ) {
            $errors['date_to'] = 'date_to cannot be earlier than date_from.';
        }
    }

    [$limit, $page] = read_pagination($errors);

    if ($errors) {
        respond_validation_error($errors);
    }

    $data = query_appointments(
        $pdo,
        $conditions,
        $params,
        's.slot_date ASC, s.slot_time ASC, a.id ASC',
        $limit,
        $page,
        true
    );

    respond(200, ['success' => true, 'data' => $data]);
}

/**
 * GET appointments.php?action=get&id=5
 * Appointment details. A patient can only see their own appointment.
 * Staff and owner can see any appointment, with patient details.
 */
function handle_get_appointment(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, array_merge(['patient'], STAFF_ROLES));
    $appointmentId = get_appointment_id_from_query();

    $forStaff = ($user['role'] !== 'patient');
    $row = fetch_appointment($pdo, $appointmentId);

    if ($row !== null && !$forStaff) {
        // A patient asking for someone else's appointment gets the same answer as a missing one.
        $patientId = require_patient_id($pdo, $user);
        if ((int)$row['patient_id'] !== $patientId) {
            $row = null;
        }
    }

    if ($row === null) {
        respond_error(404, 'Appointment not found.');
    }

    respond(200, ['success' => true, 'data' => format_appointment($row, $forStaff)]);
}

/**
 * PUT appointments.php?action=reschedule&id=5
 * Move a Pending or Confirmed appointment to another available slot.
 * Body: { "slot_id": 20 }
 * - Patients can only reschedule their own appointments. A rescheduled
 *   appointment goes back to Pending so the clinic can confirm the new time.
 * - Staff and owner can reschedule any appointment and its status stays the same.
 */
function handle_reschedule(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, array_merge(['patient'], STAFF_ROLES));
    $appointmentId = get_appointment_id_from_query();

    $isPatient = ($user['role'] === 'patient');
    $restrictToPatientId = $isPatient ? require_patient_id($pdo, $user) : null;

    $input = read_json_body();

    $newSlotId = parse_positive_int($input['slot_id'] ?? null);
    if ($newSlotId === null) {
        respond_validation_error(['slot_id' => 'slot_id is required and must be a positive whole number.']);
    }

    try {
        [$status, $payload] = run_in_transaction(
            $pdo,
            function () use ($pdo, $appointmentId, $newSlotId, $isPatient, $restrictToPatientId) {
                // Lock the appointment first, then the new slot.
                $stmt = $pdo->prepare(
                    'SELECT id, patient_id, slot_id, status FROM appointments WHERE id = :id FOR UPDATE'
                );
                $stmt->execute(['id' => $appointmentId]);
                $appointment = $stmt->fetch();

                if (
                    !$appointment
                    || ($restrictToPatientId !== null && (int)$appointment['patient_id'] !== $restrictToPatientId)
                ) {
                    return error_result(404, 'Appointment not found.');
                }

                if (!in_array($appointment['status'], ['Pending', 'Confirmed'], true)) {
                    return error_result(409, 'Only Pending or Confirmed appointments can be rescheduled.');
                }

                if ((int)$appointment['slot_id'] === $newSlotId) {
                    return error_result(422, 'Validation failed.', [
                        'errors' => ['slot_id' => 'The new slot must be different from the current slot.'],
                    ]);
                }

                $currentStmt = $pdo->prepare('SELECT slot_date, slot_time FROM appointment_slots WHERE id = :id');
                $currentStmt->execute(['id' => (int)$appointment['slot_id']]);
                $currentSlot = $currentStmt->fetch();
                if ($currentSlot && is_in_the_past($currentSlot['slot_date'], $currentSlot['slot_time'])) {
                    return error_result(409, 'Past appointments cannot be rescheduled.');
                }

                $newSlot = lock_slot($pdo, $newSlotId);
                $problem = get_slot_booking_problem($pdo, $newSlot, $isPatient);
                if ($problem !== null) {
                    return $problem;
                }

                $newStatus = $isPatient ? 'Pending' : $appointment['status'];
                $update = $pdo->prepare(
                    'UPDATE appointments SET slot_id = :slot_id, status = :status WHERE id = :id'
                );
                $update->execute([
                    'slot_id' => $newSlotId,
                    'status' => $newStatus,
                    'id' => $appointmentId,
                ]);

                $message = $isPatient
                    ? 'Appointment rescheduled. It is now Pending until the clinic confirms the new time.'
                    : 'Appointment rescheduled.';

                return [200, [
                    'success' => true,
                    'message' => $message,
                    'data' => format_appointment((array)fetch_appointment($pdo, $appointmentId), !$isPatient),
                ]];
            }
        );
    } catch (Throwable $e) {
        if (is_duplicate_entry_error($e)) {
            respond_error(409, 'This slot is already booked. Please choose another time.');
        }
        throw $e;
    }

    respond($status, $payload);
}

/**
 * PUT appointments.php?action=cancel&id=5
 * Cancel a Pending or Confirmed appointment.
 * Patients can cancel their own appointments. Staff and owner can cancel any
 * appointment and may send an optional body: { "staff_notes": "..." }
 */
function handle_cancel(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, array_merge(['patient'], STAFF_ROLES));
    $appointmentId = get_appointment_id_from_query();

    if ($user['role'] === 'patient') {
        $patientId = require_patient_id($pdo, $user);
        [$status, $payload] = change_appointment_status(
            $pdo,
            $appointmentId,
            'Cancelled',
            $patientId,
            false,
            null,
            'Appointment cancelled.'
        );
        respond($status, $payload);
    }

    $input = read_optional_json_body();
    $errors = [];
    [$setNotes, $notesValue] = read_staff_notes($input, $errors);
    if ($errors) {
        respond_validation_error($errors);
    }

    [$status, $payload] = change_appointment_status(
        $pdo,
        $appointmentId,
        'Cancelled',
        null,
        $setNotes,
        $notesValue,
        'Appointment cancelled.'
    );
    respond($status, $payload);
}

/**
 * PUT appointments.php?action=status&id=5
 * Staff and owner change the status of an appointment.
 * Body: { "status": "Confirmed", "staff_notes": "optional note" }
 *
 * Allowed changes:
 *   Pending   -> Confirmed, Rejected, Cancelled
 *   Confirmed -> Completed, No-Show, Cancelled
 */
function handle_change_status(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);
    $appointmentId = get_appointment_id_from_query();

    $input = read_json_body();

    $errors = [];

    $newStatus = get_trimmed_string($input, 'status');
    if (!in_array($newStatus, STAFF_TARGET_STATUSES, true)) {
        $errors['status'] = 'status must be one of: ' . implode(', ', STAFF_TARGET_STATUSES) . '.';
    }

    [$setNotes, $notesValue] = read_staff_notes($input, $errors);

    if ($errors) {
        respond_validation_error($errors);
    }

    [$status, $payload] = change_appointment_status(
        $pdo,
        $appointmentId,
        $newStatus,
        null,
        $setNotes,
        $notesValue,
        'Appointment status updated to ' . $newStatus . '.'
    );
    respond($status, $payload);
}

/**
 * PUT appointments.php?action=notes&id=5
 * Add, change, or clear the staff notes of an appointment (any status).
 * Body: { "staff_notes": "text" }  (an empty string clears the notes)
 */
function handle_update_notes(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);
    $appointmentId = get_appointment_id_from_query();

    $input = read_json_body();

    $errors = [];
    [$provided, $notesValue] = read_staff_notes($input, $errors);
    if (!$provided && !$errors) {
        $errors['staff_notes'] = 'staff_notes is required.';
    }
    if ($errors) {
        respond_validation_error($errors);
    }

    if (fetch_appointment($pdo, $appointmentId) === null) {
        respond_error(404, 'Appointment not found.');
    }

    $stmt = $pdo->prepare('UPDATE appointments SET staff_notes = :staff_notes WHERE id = :id');
    $stmt->execute(['staff_notes' => $notesValue, 'id' => $appointmentId]);

    respond(200, [
        'success' => true,
        'message' => 'Staff notes updated.',
        'data' => format_appointment((array)fetch_appointment($pdo, $appointmentId), true),
    ]);
}

// ROUTER
// appointments.php?action=book | my | list | get | reschedule | cancel | status | notes
try {
    $action = (isset($_GET['action']) && is_string($_GET['action'])) ? $_GET['action'] : '';

    switch ($action) {
        case 'book':
            require_http_method(['POST']);
            handle_book();
            break;

        case 'my':
            require_http_method(['GET']);
            handle_my_appointments();
            break;

        case 'list':
            require_http_method(['GET']);
            handle_list_appointments();
            break;

        case 'get':
            require_http_method(['GET']);
            handle_get_appointment();
            break;

        case 'reschedule':
            require_http_method(['PUT']);
            handle_reschedule();
            break;

        case 'cancel':
            require_http_method(['PUT']);
            handle_cancel();
            break;

        case 'status':
            require_http_method(['PUT']);
            handle_change_status();
            break;

        case 'notes':
            require_http_method(['PUT']);
            handle_update_notes();
            break;

        default:
            respond_error(404, 'Unknown action.');
    }
} catch (Throwable $e) {
    respond_server_error($e, 'Appointments API');
}
