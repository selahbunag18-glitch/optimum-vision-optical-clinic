<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

// Patients can only see slots from today up to this many days ahead.
const MAX_DAYS_AHEAD = 30;

// Maximum number of days that staff can request in a single list call.
const MAX_LIST_RANGE_DAYS = 92;

// ---------------------------------------------------------------------
// Small helper functions used only by this file
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
 * Return the time as HH:MM:00 if the value is HH:MM or HH:MM:00, otherwise null.
 */
function parse_time_string(string $value): ?string
{
    if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/', $value, $matches) !== 1) {
        return null;
    }
    return $matches[1] . ':' . $matches[2] . ':00';
}

/**
 * Convert a true/false or 1/0 value to 1 or 0. Returns null if it is not valid.
 */
function parse_availability_flag($value): ?int
{
    if (is_bool($value)) {
        return $value ? 1 : 0;
    }
    if (is_int($value) && ($value === 0 || $value === 1)) {
        return $value;
    }
    if (is_string($value)) {
        $text = strtolower(trim($value));
        if (in_array($text, ['1', 'true'], true)) {
            return 1;
        }
        if (in_array($text, ['0', 'false'], true)) {
            return 0;
        }
    }
    return null;
}

/**
 * Today's date in YYYY-MM-DD format (clinic time zone from config.php).
 */
function today_string(): string
{
    return date('Y-m-d');
}

/**
 * Add a number of days to a YYYY-MM-DD date and return the new date.
 */
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

/**
 * Read a trimmed string from the query string. Returns '' if it is missing.
 */
function get_query_string(string $key): string
{
    return (isset($_GET[$key]) && is_string($_GET[$key])) ? trim($_GET[$key]) : '';
}

/**
 * Read the slot id from the query string (?id=5). Stops with 400 if it is invalid.
 */
function get_slot_id_from_query(): int
{
    $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
    if ($id === false || $id === null || $id < 1) {
        respond_error(400, 'The id parameter must be a positive integer.');
    }
    return $id;
}

/**
 * Shape one database row into the JSON format sent to the app.
 */
function format_slot(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'slot_date' => $row['slot_date'],
        'slot_time' => substr((string)$row['slot_time'], 0, 5),
        'slot_time_label' => date('g:i A', strtotime((string)$row['slot_time'])),
        'is_available' => (int)$row['is_available'] === 1,
    ];
}

/**
 * Load one slot by id. Returns null if it does not exist.
 */
function fetch_slot(PDO $pdo, int $slotId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, slot_date, slot_time, is_available FROM appointment_slots WHERE id = :id'
    );
    $stmt->execute(['id' => $slotId]);
    $row = $stmt->fetch();
    return $row ? $row : null;
}

/**
 * Count appointments linked to a slot.
 * activeOnly = true counts only Pending and Confirmed appointments.
 */
function count_slot_appointments(PDO $pdo, int $slotId, bool $activeOnly): int
{
    if ($activeOnly) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM appointments WHERE active_slot_id = :id');
    } else {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM appointments WHERE slot_id = :id');
    }
    $stmt->execute(['id' => $slotId]);
    return (int)$stmt->fetchColumn();
}

/**
 * Check whether a PDOException is a MySQL duplicate entry error (1062).
 */
function is_duplicate_entry_error(Throwable $e): bool
{
    return $e instanceof PDOException && ($e->errorInfo[1] ?? 0) === 1062;
}

// ---------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------

/**
 * GET slots.php?action=dates
 * Dates (today up to 30 days ahead) that still have at least one bookable slot.
 * Allowed for any logged-in user.
 */
function handle_dates(): void
{
    $pdo = get_db_connection();
    require_auth($pdo);

    $dateFrom = today_string();
    $dateTo = add_days_to_date($dateFrom, MAX_DAYS_AHEAD);

    // A slot is bookable when it is enabled, in the future, and has no
    // active (Pending or Confirmed) appointment.
    $stmt = $pdo->prepare(
        'SELECT s.slot_date, COUNT(*) AS available_slots
         FROM appointment_slots s
         LEFT JOIN appointments a ON a.active_slot_id = s.id
         WHERE s.slot_date BETWEEN :date_from AND :date_to
           AND s.is_available = 1
           AND a.id IS NULL
           AND TIMESTAMP(s.slot_date, s.slot_time) > NOW()
         GROUP BY s.slot_date
         ORDER BY s.slot_date'
    );
    $stmt->execute(['date_from' => $dateFrom, 'date_to' => $dateTo]);

    $dates = [];
    foreach ($stmt->fetchAll() as $row) {
        $dates[] = [
            'date' => $row['slot_date'],
            'available_slots' => (int)$row['available_slots'],
        ];
    }

    respond(200, [
        'success' => true,
        'data' => [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'dates' => $dates,
        ],
    ]);
}

/**
 * GET slots.php?action=available&date=YYYY-MM-DD
 * Bookable time slots for one date. Allowed for any logged-in user.
 */
function handle_available(): void
{
    $pdo = get_db_connection();
    require_auth($pdo);

    $date = get_query_string('date');
    $today = today_string();

    $errors = [];
    if ($date === '') {
        $errors['date'] = 'Date is required (format YYYY-MM-DD).';
    } elseif (parse_date_string($date) === null) {
        $errors['date'] = 'Date must be a valid date in the format YYYY-MM-DD.';
    } elseif ($date < $today) {
        $errors['date'] = 'Date cannot be in the past.';
    } elseif ($date > add_days_to_date($today, MAX_DAYS_AHEAD)) {
        $errors['date'] = 'Date cannot be more than ' . MAX_DAYS_AHEAD . ' days ahead.';
    }
    if ($errors) {
        respond_validation_error($errors);
    }

    $stmt = $pdo->prepare(
        'SELECT s.id, s.slot_date, s.slot_time, s.is_available
         FROM appointment_slots s
         LEFT JOIN appointments a ON a.active_slot_id = s.id
         WHERE s.slot_date = :slot_date
           AND s.is_available = 1
           AND a.id IS NULL
           AND TIMESTAMP(s.slot_date, s.slot_time) > NOW()
         ORDER BY s.slot_time'
    );
    $stmt->execute(['slot_date' => $date]);

    $slots = array_map('format_slot', $stmt->fetchAll());

    respond(200, [
        'success' => true,
        'data' => [
            'date' => $date,
            'total' => count($slots),
            'slots' => $slots,
        ],
    ]);
}

/**
 * GET slots.php?action=list&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
 * All slots with their status. Staff and owner only.
 * Both dates are optional. Default range: today up to 30 days ahead.
 */
function handle_list_slots(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);

    $dateFrom = get_query_string('date_from');
    $dateTo = get_query_string('date_to');

    $errors = [];
    if ($dateFrom === '') {
        $dateFrom = today_string();
    } elseif (parse_date_string($dateFrom) === null) {
        $errors['date_from'] = 'date_from must be a valid date in the format YYYY-MM-DD.';
    }

    if ($dateTo === '') {
        if (!$errors) {
            $dateTo = add_days_to_date($dateFrom, MAX_DAYS_AHEAD);
        }
    } elseif (parse_date_string($dateTo) === null) {
        $errors['date_to'] = 'date_to must be a valid date in the format YYYY-MM-DD.';
    }

    if (!$errors) {
        if ($dateTo < $dateFrom) {
            $errors['date_to'] = 'date_to cannot be earlier than date_from.';
        } elseif (add_days_to_date($dateFrom, MAX_LIST_RANGE_DAYS) < $dateTo) {
            $errors['date_to'] = 'The date range cannot be longer than ' . MAX_LIST_RANGE_DAYS . ' days.';
        }
    }
    if ($errors) {
        respond_validation_error($errors);
    }

    $stmt = $pdo->prepare(
        'SELECT s.id, s.slot_date, s.slot_time, s.is_available,
                a.id AS appointment_id, a.status AS appointment_status
         FROM appointment_slots s
         LEFT JOIN appointments a ON a.active_slot_id = s.id
         WHERE s.slot_date BETWEEN :date_from AND :date_to
         ORDER BY s.slot_date, s.slot_time'
    );
    $stmt->execute(['date_from' => $dateFrom, 'date_to' => $dateTo]);

    $slots = [];
    foreach ($stmt->fetchAll() as $row) {
        $slot = format_slot($row);

        if ($row['appointment_id'] !== null) {
            $slot['status'] = 'booked';
            $slot['appointment_id'] = (int)$row['appointment_id'];
            $slot['appointment_status'] = $row['appointment_status'];
        } elseif (!$slot['is_available']) {
            $slot['status'] = 'disabled';
            $slot['appointment_id'] = null;
            $slot['appointment_status'] = null;
        } else {
            $slot['status'] = 'available';
            $slot['appointment_id'] = null;
            $slot['appointment_status'] = null;
        }

        $slot['is_past'] = is_in_the_past($row['slot_date'], $row['slot_time']);
        $slots[] = $slot;
    }

    respond(200, [
        'success' => true,
        'data' => [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'total' => count($slots),
            'slots' => $slots,
        ],
    ]);
}

/**
 * POST slots.php?action=create
 * Create one appointment slot. Staff and owner only.
 * Body: { "slot_date": "YYYY-MM-DD", "slot_time": "HH:MM", "is_available": true }
 */
function handle_create_slot(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);

    $input = read_json_body();

    $errors = [];

    $slotDate = parse_date_string(get_trimmed_string($input, 'slot_date'));
    if ($slotDate === null) {
        $errors['slot_date'] = 'slot_date is required and must use the format YYYY-MM-DD.';
    }

    $slotTime = parse_time_string(get_trimmed_string($input, 'slot_time'));
    if ($slotTime === null) {
        $errors['slot_time'] = 'slot_time is required and must use the format HH:MM (24-hour).';
    }

    if ($slotDate !== null && $slotTime !== null && is_in_the_past($slotDate, $slotTime)) {
        $errors['slot_date'] = 'The slot date and time must be in the future.';
    }

    $isAvailable = 1;
    if (array_key_exists('is_available', $input)) {
        $parsedFlag = parse_availability_flag($input['is_available']);
        if ($parsedFlag === null) {
            $errors['is_available'] = 'is_available must be true or false.';
        } else {
            $isAvailable = $parsedFlag;
        }
    }

    if ($errors) {
        respond_validation_error($errors);
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO appointment_slots (slot_date, slot_time, is_available)
             VALUES (:slot_date, :slot_time, :is_available)'
        );
        $stmt->execute([
            'slot_date' => $slotDate,
            'slot_time' => $slotTime,
            'is_available' => $isAvailable,
        ]);
        $slotId = (int)$pdo->lastInsertId();
    } catch (PDOException $e) {
        if (is_duplicate_entry_error($e)) {
            respond_error(409, 'A slot already exists for this date and time.');
        }
        throw $e;
    }

    $slot = fetch_slot($pdo, $slotId);

    respond(201, [
        'success' => true,
        'message' => 'Slot created.',
        'data' => format_slot((array)$slot),
    ]);
}

/**
 * PUT slots.php?action=update&id=5
 * Change the date, time, or availability of a slot. Staff and owner only.
 * Body (send at least one): { "slot_date": "...", "slot_time": "...", "is_available": false }
 *
 * Rules:
 * - A slot that has any appointment record cannot change its date or time.
 * - A slot with an active (Pending or Confirmed) appointment cannot be disabled.
 */
function handle_update_slot(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);

    $slotId = get_slot_id_from_query();
    $input = read_json_body();

    $hasDate = array_key_exists('slot_date', $input);
    $hasTime = array_key_exists('slot_time', $input);
    $hasAvailability = array_key_exists('is_available', $input);

    $errors = [];
    $newDate = null;
    $newTime = null;
    $newAvailability = null;

    if (!$hasDate && !$hasTime && !$hasAvailability) {
        $errors['body'] = 'Provide at least one of: slot_date, slot_time, is_available.';
    }

    if ($hasDate) {
        $newDate = parse_date_string(get_trimmed_string($input, 'slot_date'));
        if ($newDate === null) {
            $errors['slot_date'] = 'slot_date must use the format YYYY-MM-DD.';
        }
    }

    if ($hasTime) {
        $newTime = parse_time_string(get_trimmed_string($input, 'slot_time'));
        if ($newTime === null) {
            $errors['slot_time'] = 'slot_time must use the format HH:MM (24-hour).';
        }
    }

    if ($hasAvailability) {
        $newAvailability = parse_availability_flag($input['is_available']);
        if ($newAvailability === null) {
            $errors['is_available'] = 'is_available must be true or false.';
        }
    }

    if ($errors) {
        respond_validation_error($errors);
    }

    $status = 500;
    $payload = ['success' => false, 'message' => 'Internal server error.'];

    // The transaction and FOR UPDATE row lock stop other requests from
    // changing or booking this slot while it is being updated.
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'SELECT id, slot_date, slot_time, is_available
             FROM appointment_slots
             WHERE id = :id
             FOR UPDATE'
        );
        $stmt->execute(['id' => $slotId]);
        $slot = $stmt->fetch();

        if (!$slot) {
            $status = 404;
            $payload = ['success' => false, 'message' => 'Slot not found.'];
        } else {
            $finalDate = $newDate ?? $slot['slot_date'];
            $finalTime = $newTime ?? $slot['slot_time'];
            $finalAvailability = $newAvailability ?? (int)$slot['is_available'];

            $dateTimeChanged = ($finalDate !== $slot['slot_date'] || $finalTime !== $slot['slot_time']);
            $availabilityChanged = ($finalAvailability !== (int)$slot['is_available']);

            if (!$dateTimeChanged && !$availabilityChanged) {
                $status = 200;
                $payload = [
                    'success' => true,
                    'message' => 'No changes were made.',
                    'data' => format_slot($slot),
                ];
            } elseif ($dateTimeChanged && is_in_the_past($finalDate, $finalTime)) {
                $status = 422;
                $payload = [
                    'success' => false,
                    'message' => 'Validation failed.',
                    'errors' => ['slot_date' => 'The new slot date and time must be in the future.'],
                ];
            } elseif ($dateTimeChanged && count_slot_appointments($pdo, $slotId, false) > 0) {
                $status = 409;
                $payload = [
                    'success' => false,
                    'message' => 'This slot has appointment records, so its date and time cannot be changed. '
                        . 'Disable it and create a new slot instead.',
                ];
            } elseif ($finalAvailability === 0 && count_slot_appointments($pdo, $slotId, true) > 0) {
                $status = 409;
                $payload = [
                    'success' => false,
                    'message' => 'This slot has an active appointment and cannot be disabled. '
                        . 'Cancel or reschedule the appointment first.',
                ];
            } else {
                $update = $pdo->prepare(
                    'UPDATE appointment_slots
                     SET slot_date = :slot_date, slot_time = :slot_time, is_available = :is_available
                     WHERE id = :id'
                );
                $update->execute([
                    'slot_date' => $finalDate,
                    'slot_time' => $finalTime,
                    'is_available' => $finalAvailability,
                    'id' => $slotId,
                ]);

                $updated = fetch_slot($pdo, $slotId);

                $status = 200;
                $payload = [
                    'success' => true,
                    'message' => 'Slot updated.',
                    'data' => format_slot((array)$updated),
                ];
            }
        }

        // Commit before responding, because respond() stops the script.
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (is_duplicate_entry_error($e)) {
            respond_error(409, 'A slot already exists for this date and time.');
        }
        throw $e;
    }

    respond($status, $payload);
}

// ROUTER
// slots.php?action=dates | available | list | create | update
try {
    $action = (isset($_GET['action']) && is_string($_GET['action'])) ? $_GET['action'] : '';

    switch ($action) {
        case 'dates':
            require_http_method(['GET']);
            handle_dates();
            break;

        case 'available':
            require_http_method(['GET']);
            handle_available();
            break;

        case 'list':
            require_http_method(['GET']);
            handle_list_slots();
            break;

        case 'create':
            require_http_method(['POST']);
            handle_create_slot();
            break;

        case 'update':
            require_http_method(['PUT']);
            handle_update_slot();
            break;

        default:
            respond_error(404, 'Unknown action.');
    }
} catch (Throwable $e) {
    respond_server_error($e, 'Slots API');
}
