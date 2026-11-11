<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

// Pagination limits for list endpoints.

const DEFAULT_PAGE_SIZE = 50;

const MAX_PAGE_SIZE = 100;

// How many appointments and sales the history endpoint returns.

const HISTORY_LIMIT = 50;

// Maximum number of possible duplicates returned by check and create.

const MAX_PHONE_MATCHES = 10;

// Text length limits (they match the database columns).

const MIN_FULL_NAME_LENGTH = 2;

const MAX_FULL_NAME_LENGTH = 100;

const MAX_PHONE_LENGTH = 11;

const MAX_ADDRESS_LENGTH = 255;

const MAX_SEARCH_LENGTH = 100;

// Fields that nobody can change through the profile endpoints.

const PROFILE_BLOCKED_FIELDS = [

    'id',

    'user_id',

    'email',

    'password',

    'password_hash',

    'role',

    'is_active',

    'failed_attempts',

    'locked_until',

    'created_at',

    'updated_at',

];

// Fields that cannot be sent when linking a patient record.

const CREATE_BLOCKED_FIELDS = ['full_name', 'password', 'password_hash', 'role', 'is_active'];

// Fields that cannot be sent when registering a walk-in customer.

const WALK_IN_BLOCKED_FIELDS = ['password', 'password_hash', 'role', 'is_active'];

// Length of the generated temporary password.

const TEMPORARY_PASSWORD_LENGTH = 12;

// Base query used to load a patient profile. Only safe columns are selected:

// there is no password hash, token, or lockout data here.

const PATIENT_SELECT =

'SELECT p.id, p.user_id, u.full_name, u.email, u.is_active, p.phone, p.birth_date,

            p.address, p.created_at, p.updated_at

     FROM patients p

     INNER JOIN users u ON u.id = p.user_id ';

// ---------------------------------------------------------------------

// Small helper functions used only by this file

// ---------------------------------------------------------------------

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

/**

 * Escape the characters % _ and | so a search term is matched literally in LIKE.

 * The queries use "|" as the LIKE escape character.

 */

function escape_like(string $text): string

{

    return str_replace(['|', '%', '_'], ['||', '|%', '|_'], $text);
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

 * Convert a decimal string from the database (for example "1500.00") to centavos.

 */

function decimal_to_cents(string $value): int

{

    $parts = explode('.', trim($value), 2);

    $whole = (int)$parts[0];

    $fraction = (int)str_pad(substr($parts[1] ?? '', 0, 2), 2, '0');

    return $whole * 100 + $fraction;
}

/**

 * Convert centavos to a decimal string with two decimals (for example 150050 -> "1500.50").

 */

function cents_to_decimal(int $cents): string

{

    return sprintf('%d.%02d', intdiv($cents, 100), $cents % 100);
}

/**

 * Read the patient id from the query string (?id=5). Stops with 400 if invalid.

 */

function get_patient_id_from_query(): int

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

 * Read an optional text field from a request body.

 * Returns [provided, value, error]. An empty string or null clears the value (value = null).

 */

function read_optional_text(array $input, string $key, int $maxLength): array

{

    if (!array_key_exists($key, $input)) {

        return [false, null, null];
    }

    $value = $input[$key];

    if ($value === null) {

        return [true, null, null];
    }

    if (!is_string($value)) {

        return [false, null, $key . ' must be text.'];
    }

    $value = trim($value);

    if (mb_strlen($value) > $maxLength) {

        return [false, null, $key . ' cannot be longer than ' . $maxLength . ' characters.'];
    }

    return [true, $value === '' ? null : $value, null];
}

/**

 * Only the digits of a phone number.

 */

function phone_digits(string $phone): string

{

    return preg_replace('/\D+/', '', $phone) ?? '';
}

/**

 * The key used to compare phone numbers: the last 10 digits.

 * This way +63 917 123 4567 and 0917-123-4567 are treated as the same number.

 */

function phone_match_key(string $phone): string

{

    return substr(phone_digits($phone), -10);
}

/**

 * A valid mobile phone number contains exactly 11 digits and starts with 09.

 */

function is_valid_phone(string $phone): bool

{

    return preg_match('/^09[0-9]{9}$/D', $phone) === 1;
}

/**

 * Check a birth date in YYYY-MM-DD format. It cannot be in the future or before 1900.

 */

function is_valid_birth_date(string $value): bool

{

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    if ($date === false || $date->format('Y-m-d') !== $value) {

        return false;
    }

    return $value >= '1900-01-01' && $value <= date('Y-m-d');
}

/**

 * Validate the profile fields that staff and patients may change:

 * full_name, phone, birth_date, address.

 * Returns ['user' => [...], 'patient' => [...]] with only the fields that were sent and are valid

 * (column name => value). Problems are added to $errors.

 */

function read_profile_fields(array $input, array &$errors): array

{

    $user = [];

    $patient = [];

    if (array_key_exists('full_name', $input)) {

        $name = get_trimmed_string($input, 'full_name');

        if (mb_strlen($name) < MIN_FULL_NAME_LENGTH || mb_strlen($name) > MAX_FULL_NAME_LENGTH) {

            $errors['full_name'] = 'full_name must be between ' . MIN_FULL_NAME_LENGTH . ' and '

                . MAX_FULL_NAME_LENGTH . ' characters.';
        } else {

            $user['full_name'] = $name;
        }
    }

    [$provided, $value, $error] = read_optional_text($input, 'phone', MAX_PHONE_LENGTH);

    if ($error !== null) {

        $errors['phone'] = $error;
    } elseif ($provided) {

        if ($value === null || !is_valid_phone($value)) {

            $errors['phone'] = 'Phone number is required and must be exactly 11 digits starting with 09.';
        } else {

            $patient['phone'] = $value;
        }
    }

    if (array_key_exists('birth_date', $input)) {

        $birthDate = $input['birth_date'];

        if ($birthDate === null || (is_string($birthDate) && trim($birthDate) === '')) {

            $patient['birth_date'] = null;
        } elseif (!is_string($birthDate) || !is_valid_birth_date(trim($birthDate))) {

            $errors['birth_date'] = 'birth_date must be a valid date in YYYY-MM-DD format that is not in the future.';
        } else {

            $patient['birth_date'] = trim($birthDate);
        }
    }

    [$provided, $value, $error] = read_optional_text($input, 'address', MAX_ADDRESS_LENGTH);

    if ($error !== null) {

        $errors['address'] = $error;
    } elseif ($provided) {

        $patient['address'] = $value;
    }

    return ['user' => $user, 'patient' => $patient];
}

/**

 * Reject fields that must never be changed through a profile endpoint.

 */

function reject_blocked_fields(array $input, array $blockedFields, array &$errors): void

{

    foreach ($blockedFields as $field) {

        if (array_key_exists($field, $input)) {

            $errors[$field] = $field . ' cannot be changed here.';
        }
    }
}

/**

 * Read the optional confirm_shared_phone flag. It must be true or false.

 */

function read_confirm_shared_phone(array $input, array &$errors): bool

{

    if (!array_key_exists('confirm_shared_phone', $input)) {

        return false;
    }

    if (!is_bool($input['confirm_shared_phone'])) {

        $errors['confirm_shared_phone'] = 'confirm_shared_phone must be true or false.';

        return false;
    }

    return $input['confirm_shared_phone'];
}

/**

 * Generate a random temporary password with random_int() (a secure random source).

 * It has uppercase letters, lowercase letters, and numbers, so it passes the same rules as

 * registration. Look-alike characters (0, O, 1, l, I) are left out so it is easy to read aloud.

 */

function generate_temporary_password(): string

{

    $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

    $lower = 'abcdefghijkmnopqrstuvwxyz';

    $digits = '23456789';

    $all = $upper . $lower . $digits;

    // One character from each group first, then random characters from all groups.

    $chars = [

        $upper[random_int(0, strlen($upper) - 1)],

        $lower[random_int(0, strlen($lower) - 1)],

        $digits[random_int(0, strlen($digits) - 1)],

    ];

    while (count($chars) < TEMPORARY_PASSWORD_LENGTH) {

        $chars[] = $all[random_int(0, strlen($all) - 1)];
    }

    // Shuffle with random_int() so the first three characters are not predictable.

    for ($i = count($chars) - 1; $i > 0; $i--) {

        $j = random_int(0, $i);

        [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
    }

    return implode('', $chars);
}

/**

 * Shape one patient row into the JSON format sent to the app.

 */

function format_patient(array $row): array

{

    return [

        'id' => (int)$row['id'],

        'user_id' => (int)$row['user_id'],

        'full_name' => $row['full_name'],

        'email' => $row['email'],

        'phone' => $row['phone'],

        'birth_date' => $row['birth_date'],

        'address' => $row['address'],

        'is_active' => (int)$row['is_active'] === 1,

        'created_at' => $row['created_at'],

        'updated_at' => $row['updated_at'],

    ];
}

/**

 * Load one patient by patient id. Returns null if it does not exist.

 */

function fetch_patient(PDO $pdo, int $patientId): ?array

{

    $stmt = $pdo->prepare(PATIENT_SELECT . 'WHERE p.id = :id LIMIT 1');

    $stmt->execute(['id' => $patientId]);

    $row = $stmt->fetch();

    return $row ? $row : null;
}

/**

 * Find other patients with the same phone number (compared by the last 10 digits).

 * Returns a short list for the warning shown to staff.

 */

function find_phone_matches(PDO $pdo, string $phone, ?int $excludePatientId): array

{

    $key = phone_match_key($phone);

    if ($key === '') {

        return [];
    }

    $sql = "SELECT p.id, u.full_name, u.email, p.phone

            FROM patients p

            INNER JOIN users u ON u.id = p.user_id

            WHERE RIGHT(REGEXP_REPLACE(p.phone, '[^0-9]', ''), 10) = :key";

    $params = ['key' => $key];

    if ($excludePatientId !== null) {

        $sql .= ' AND p.id <> :exclude_id';

        $params['exclude_id'] = $excludePatientId;
    }

    $sql .= ' ORDER BY p.id LIMIT ' . MAX_PHONE_MATCHES;

    $stmt = $pdo->prepare($sql);

    $stmt->execute($params);

    $matches = [];

    foreach ($stmt->fetchAll() as $row) {

        $matches[] = [

            'id' => (int)$row['id'],

            'full_name' => $row['full_name'],

            'email' => $row['email'],

            'phone' => $row['phone'],

        ];
    }

    return $matches;
}

/**

 * The 409 result used when the phone number is already used by another patient.

 */

function shared_phone_result(array $matches): array

{

    return error_result(

        409,

        'This phone number is already registered. Please view the existing patient details.',

        ['requires_confirmation' => false, 'data' => ['matches' => $matches, 'existing_patient_id' => $matches[0]['id'] ?? null]]

    );
}

/**

 * Update a patient profile inside a transaction. Returns [HTTP status, JSON payload].

 * $checkSharedPhone is true for staff changes. A patient changing their own phone number

 * is never told whether someone else uses it.

 */

function update_patient_profile(

    PDO $pdo,

    int $patientId,

    array $userFields,

    array $patientFields,

    bool $checkSharedPhone,

    bool $confirmSharedPhone

): array {

    return run_in_transaction(

        $pdo,

        function () use ($pdo, $patientId, $userFields, $patientFields, $checkSharedPhone, $confirmSharedPhone) {

            $stmt = $pdo->prepare('SELECT id, user_id FROM patients WHERE id = :id FOR UPDATE');

            $stmt->execute(['id' => $patientId]);

            $patient = $stmt->fetch();

            if (!$patient) {

                return error_result(404, 'Patient not found.');
            }

            if (

                $checkSharedPhone

                && isset($patientFields['phone']) && $patientFields['phone'] !== null

            ) {

                $matches = find_phone_matches($pdo, $patientFields['phone'], $patientId);

                if ($matches) {

                    return shared_phone_result($matches);
                }
            }

            // The column names come from read_profile_fields(), never from the request.

            if ($userFields) {

                $assignments = [];

                $params = ['id' => (int)$patient['user_id']];

                foreach ($userFields as $column => $value) {

                    $assignments[] = $column . ' = :' . $column;

                    $params[$column] = $value;
                }

                $update = $pdo->prepare('UPDATE users SET ' . implode(', ', $assignments) . ' WHERE id = :id');

                $update->execute($params);
            }

            if ($patientFields) {

                $assignments = [];

                $params = ['id' => $patientId];

                foreach ($patientFields as $column => $value) {

                    $assignments[] = $column . ' = :' . $column;

                    $params[$column] = $value;
                }

                $update = $pdo->prepare('UPDATE patients SET ' . implode(', ', $assignments) . ' WHERE id = :id');

                $update->execute($params);
            }

            return [200, [

                'success' => true,

                'message' => 'Profile updated.',

                'data' => format_patient((array)fetch_patient($pdo, $patientId)),

            ]];
        }

    );
}

/**

 * Create the patient profile for an existing patient account. Returns [HTTP status, JSON payload].

 * No user account is created here, so no duplicate accounts are possible.

 */

function link_patient_profile(

    PDO $pdo,

    string $email,

    array $patientFields,

    bool $confirmSharedPhone

): array {

    return run_in_transaction(

        $pdo,

        function () use ($pdo, $email, $patientFields, $confirmSharedPhone) {

            $stmt = $pdo->prepare('SELECT id, role, is_active FROM users WHERE email = :email LIMIT 1 FOR UPDATE');

            $stmt->execute(['email' => $email]);

            $account = $stmt->fetch();

            if (!$account) {

                return error_result(422, 'Validation failed.', ['errors' => [

                    'email' => 'No patient account exists for this email. Use create_walk_in to register a new customer.',

                ]]);
            }

            if ($account['role'] !== 'patient') {

                return error_result(409, 'This email belongs to a clinic staff or owner account.');
            }

            if ((int)$account['is_active'] !== 1) {

                return error_result(409, 'This account is inactive.');
            }

            $userId = (int)$account['id'];

            $existing = $pdo->prepare('SELECT id FROM patients WHERE user_id = :user_id LIMIT 1');

            $existing->execute(['user_id' => $userId]);

            $existingId = $existing->fetchColumn();

            if ($existingId !== false) {

                return error_result(

                    409,

                    'A patient record already exists for this email.',

                    ['data' => ['existing_patient_id' => (int)$existingId]]

                );
            }

            $phone = $patientFields['phone'] ?? null;

            if ($phone !== null) {

                $matches = find_phone_matches($pdo, $phone, null);

                if ($matches) {

                    return shared_phone_result($matches);
                }
            }

            $insert = $pdo->prepare(

                'INSERT INTO patients (user_id, phone, birth_date, address)

                 VALUES (:user_id, :phone, :birth_date, :address)'

            );

            $insert->execute([

                'user_id' => $userId,

                'phone' => $phone,

                'birth_date' => $patientFields['birth_date'] ?? null,

                'address' => $patientFields['address'] ?? null,

            ]);

            $patientId = (int)$pdo->lastInsertId();

            return [201, [

                'success' => true,

                'message' => 'Patient record created.',

                'data' => format_patient((array)fetch_patient($pdo, $patientId)),

            ]];
        }

    );
}

/**

 * Create a new patient account and its patient record in one transaction.

 * Returns [HTTP status, JSON payload]. If any step fails, nothing is saved.

 * $passwordHash is already hashed. The plain password never reaches this function.

 */

function register_walk_in_patient(

    PDO $pdo,

    string $fullName,

    string $email,

    string $passwordHash,

    array $patientFields,

    bool $confirmSharedPhone

): array {

    return run_in_transaction(

        $pdo,

        function () use ($pdo, $fullName, $email, $passwordHash, $patientFields, $confirmSharedPhone) {

            $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');

            $stmt->execute(['email' => $email]);

            if ($stmt->fetchColumn() !== false) {

                return error_result(409, 'An account with this email already exists.');
            }

            $phone = $patientFields['phone'] ?? null;

            if ($phone !== null) {

                $matches = find_phone_matches($pdo, $phone, null);

                if ($matches) {

                    return shared_phone_result($matches);
                }
            }

            // The role is always "patient".

            $insertUser = $pdo->prepare(

                'INSERT INTO users (full_name, email, password_hash, role)

                 VALUES (:full_name, :email, :password_hash, :role)'

            );

            $insertUser->execute([

                'full_name' => $fullName,

                'email' => $email,

                'password_hash' => $passwordHash,

                'role' => 'patient',

            ]);

            $userId = (int)$pdo->lastInsertId();

            $insertPatient = $pdo->prepare(

                'INSERT INTO patients (user_id, phone, birth_date, address)

                 VALUES (:user_id, :phone, :birth_date, :address)'

            );

            $insertPatient->execute([

                'user_id' => $userId,

                'phone' => $phone,

                'birth_date' => $patientFields['birth_date'] ?? null,

                'address' => $patientFields['address'] ?? null,

            ]);

            $patientId = (int)$pdo->lastInsertId();

            return [201, [

                'success' => true,

                'message' => 'Walk-in customer registered.',

                'data' => format_patient((array)fetch_patient($pdo, $patientId)),

            ]];
        }

    );
}

// ---------------------------------------------------------------------

// Endpoint handlers

// ---------------------------------------------------------------------

/**

 * GET patients.php?action=list[&search=...][&is_active=1][&page=1][&limit=50]

 * Patient list with search (name, email, phone). Staff and owner only.

 */

function handle_list_patients(): void

{

    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $errors = [];

    $conditions = [];

    $params = [];

    $search = get_query_string('search');

    if ($search !== '') {

        if (mb_strlen($search) > MAX_SEARCH_LENGTH) {

            $errors['search'] = 'search cannot be longer than ' . MAX_SEARCH_LENGTH . ' characters.';
        } else {

            $pattern = '%' . escape_like($search) . '%';

            $conditions[] = "(u.full_name LIKE :search_name ESCAPE '|'"

                . " OR u.email LIKE :search_email ESCAPE '|'"

                . " OR p.phone LIKE :search_phone ESCAPE '|')";

            $params['search_name'] = $pattern;

            $params['search_email'] = $pattern;

            $params['search_phone'] = $pattern;
        }
    }

    $isActive = get_query_string('is_active');

    if ($isActive !== '') {

        if ($isActive !== '0' && $isActive !== '1') {

            $errors['is_active'] = 'is_active must be 0 or 1.';
        } else {

            $conditions[] = 'u.is_active = :is_active';

            $params['is_active'] = (int)$isActive;
        }
    }

    [$limit, $page] = read_pagination($errors);

    if ($errors) {

        respond_validation_error($errors);
    }

    $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) . ' ' : '';

    $countStmt = $pdo->prepare(

        'SELECT COUNT(*) FROM patients p INNER JOIN users u ON u.id = p.user_id ' . $where

    );

    $countStmt->execute($params);

    $total = (int)$countStmt->fetchColumn();

    // limit and offset are validated integers, so they are safe to write into the SQL.

    $offset = ($page - 1) * $limit;

    $stmt = $pdo->prepare(

        PATIENT_SELECT . $where . 'ORDER BY u.full_name ASC, p.id ASC LIMIT ' . $limit . ' OFFSET ' . $offset

    );

    $stmt->execute($params);

    $patients = [];

    foreach ($stmt->fetchAll() as $row) {

        $patients[] = format_patient($row);
    }

    respond(200, [

        'success' => true,

        'data' => [

            'patients' => $patients,

            'pagination' => [

                'page' => $page,

                'limit' => $limit,

                'total' => $total,

                'total_pages' => (int)ceil($total / $limit),

            ],

        ],

    ]);
}

/**

 * GET patients.php?action=get&id=5

 * One patient profile. Staff and owner only.

 */

function handle_get_patient(): void

{

    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $patientId = get_patient_id_from_query();

    $row = fetch_patient($pdo, $patientId);

    if ($row === null) {

        respond_error(404, 'Patient not found.');
    }

    respond(200, ['success' => true, 'data' => format_patient($row)]);
}

/**

 * GET patients.php?action=check[&email=...][&phone=...]

 * Check whether a customer already exists. Staff and owner only.

 * At least one of email or phone is required.

 */

function handle_check_patient(): void

{

    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $errors = [];

    $email = strtolower(get_query_string('email'));

    $phone = get_query_string('phone');

    if ($email === '' && $phone === '') {

        $errors['query'] = 'Provide an email or a phone number.';
    }

    if ($email !== '' && !is_valid_email($email)) {

        $errors['email'] = 'A valid email address is required.';
    }

    if ($phone !== '' && !is_valid_phone($phone)) {

        $errors['phone'] = 'Phone number format is invalid.';
    }

    if ($errors) {

        respond_validation_error($errors);
    }

    $emailMatch = null;

    $canCreate = false;

    if ($email !== '') {

        $stmt = $pdo->prepare(

            'SELECT u.id, u.full_name, u.role, u.is_active, p.id AS patient_id

             FROM users u

             LEFT JOIN patients p ON p.user_id = u.id

             WHERE u.email = :email

             LIMIT 1'

        );

        $stmt->execute(['email' => $email]);

        $row = $stmt->fetch();

        if ($row) {

            $hasProfile = $row['patient_id'] !== null;

            $emailMatch = [

                'user_id' => (int)$row['id'],

                'full_name' => $row['full_name'],

                'role' => $row['role'],

                'is_active' => (int)$row['is_active'] === 1,

                'has_patient_profile' => $hasProfile,

                'patient_id' => $hasProfile ? (int)$row['patient_id'] : null,

            ];

            // A patient record can be created only for an active patient account with no profile.

            $canCreate = $row['role'] === 'patient' && (int)$row['is_active'] === 1 && !$hasProfile;
        }
    }

    $phoneMatches = $phone !== '' ? find_phone_matches($pdo, $phone, null) : [];

    respond(200, [

        'success' => true,

        'data' => [

            'exists' => ($emailMatch !== null && $emailMatch['has_patient_profile']) || $phoneMatches !== [],

            'email_match' => $emailMatch,

            'phone_matches' => $phoneMatches,

            'can_create' => $canCreate,

        ],

    ]);
}

/**

 * POST patients.php?action=create

 * Create the patient record for an existing patient account that has no profile yet.

 * Staff and owner only. No user account is created.

 * Body: { "email": "...", "phone": "...", "birth_date": "YYYY-MM-DD", "address": "...",

 *         "confirm_shared_phone": true }

 * Required: email and phone.

 */

function handle_create_patient(): void

{

    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $input = read_json_body();

    $errors = [];

    foreach (CREATE_BLOCKED_FIELDS as $field) {

        if (array_key_exists($field, $input)) {

            $errors[$field] = $field . ' cannot be set here. It comes from the existing patient account.';
        }
    }

    $email = strtolower(get_trimmed_string($input, 'email'));

    if (!is_valid_email($email)) {

        $errors['email'] = 'A valid email address is required.';
    }

    $fields = read_profile_fields($input, $errors);

    if (!array_key_exists('phone', $input) && !isset($errors['phone'])) {

        $errors['phone'] = 'Phone number is required and must be exactly 11 digits starting with 09.';
    }

    $confirmSharedPhone = read_confirm_shared_phone($input, $errors);

    if ($errors) {

        respond_validation_error($errors);
    }

    try {

        [$status, $payload] = link_patient_profile($pdo, $email, $fields['patient'], $confirmSharedPhone);
    } catch (PDOException $e) {

        // The unique key on user_id rejected a second profile for the same account.

        if (is_duplicate_entry_error($e)) {

            respond_error(409, 'A patient record already exists for this email.');
        }

        throw $e;
    }

    respond($status, $payload);
}

/**

 * POST patients.php?action=create_walk_in

 * Register a new walk-in customer: creates the user account (role patient) and the patient

 * record in one transaction. Staff and owner only.

 * Body: { "full_name": "...", "email": "...", "phone": "...", "birth_date": "YYYY-MM-DD",

 *         "address": "...", "confirm_shared_phone": true }

 * Required: full_name, email, phone.

 * A temporary password is generated, stored only as a hash, and returned ONE TIME in this

 * response. It is not logged and cannot be shown again.

 * The database has no must_change_password column, so changing it after the first login

 * is NOT enforced.

 */

function handle_create_walk_in(): void

{

    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $input = read_json_body();

    $errors = [];

    reject_blocked_fields($input, WALK_IN_BLOCKED_FIELDS, $errors);

    $email = strtolower(get_trimmed_string($input, 'email'));

    if (!is_valid_email($email)) {

        $errors['email'] = 'A valid email address is required.';
    }

    $fields = read_profile_fields($input, $errors);

    if (!array_key_exists('phone', $input) && !isset($errors['phone'])) {

        $errors['phone'] = 'Phone number is required and must be exactly 11 digits starting with 09.';
    }

    if (!isset($fields['user']['full_name']) && !isset($errors['full_name'])) {

        $errors['full_name'] = 'full_name is required.';
    }

    $confirmSharedPhone = read_confirm_shared_phone($input, $errors);

    if ($errors) {

        respond_validation_error($errors);
    }

    // Generate and hash the password before the transaction, so the database locks stay short.

    $temporaryPassword = generate_temporary_password();

    $passwordHash = password_hash($temporaryPassword, PASSWORD_DEFAULT);

    try {

        [$status, $payload] = register_walk_in_patient(

            $pdo,

            $fields['user']['full_name'],

            $email,

            $passwordHash,

            $fields['patient'],

            $confirmSharedPhone

        );
    } catch (PDOException $e) {

        // The unique key on email rejected an account created at the same moment.

        if (is_duplicate_entry_error($e)) {

            respond_error(409, 'An account with this email already exists.');
        }

        throw $e;
    }

    if ($status === 201) {

        // Never let a browser or proxy keep a response that contains a password.

        header('Cache-Control: no-store');

        $payload['message'] = 'Walk-in customer registered. Give the temporary password to the customer now. '

            . 'It is shown only once and cannot be retrieved again.';

        $payload['data'] = [

            'patient' => $payload['data'],

            'temporary_password' => $temporaryPassword,

        ];
    }

    respond($status, $payload);
}

/**

 * PUT patients.php?action=update&id=5

 * Change a patient's details. Staff and owner only.

 * Send any of: full_name, phone, birth_date, address (and confirm_shared_phone).

 * Email, password, role, and account status cannot be changed here.

 */

function handle_update_patient(): void

{

    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $patientId = get_patient_id_from_query();

    $input = read_json_body();

    $errors = [];

    reject_blocked_fields($input, PROFILE_BLOCKED_FIELDS, $errors);

    $fields = read_profile_fields($input, $errors);

    if (!array_key_exists('phone', $input) && !isset($errors['phone'])) {

        $errors['phone'] = 'Phone number is required and must be exactly 11 digits starting with 09.';
    }

    $confirmSharedPhone = read_confirm_shared_phone($input, $errors);

    if (!$fields['user'] && !$fields['patient'] && !$errors) {

        $errors['body'] = 'Provide at least one of: full_name, phone, birth_date, address.';
    }

    if ($errors) {

        respond_validation_error($errors);
    }

    [$status, $payload] = update_patient_profile(

        $pdo,

        $patientId,

        $fields['user'],

        $fields['patient'],

        true,

        $confirmSharedPhone

    );

    respond($status, $payload);
}

/**

 * GET patients.php?action=history&id=5

 * Appointment and sales history of one patient (newest first, up to 50 each)

 * with a short summary. Staff and owner only.

 */

function handle_patient_history(): void

{

    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $patientId = get_patient_id_from_query();

    $patientRow = fetch_patient($pdo, $patientId);

    if ($patientRow === null) {

        respond_error(404, 'Patient not found.');
    }

    // Appointments.

    $stmt = $pdo->prepare(

        'SELECT a.id, a.slot_id, a.reason, a.status, a.staff_notes, a.created_at, a.updated_at,

                s.slot_date, s.slot_time

         FROM appointments a

         INNER JOIN appointment_slots s ON s.id = a.slot_id

         WHERE a.patient_id = :patient_id

         ORDER BY s.slot_date DESC, s.slot_time DESC, a.id DESC

         LIMIT ' . HISTORY_LIMIT

    );

    $stmt->execute(['patient_id' => $patientId]);

    $appointments = [];

    foreach ($stmt->fetchAll() as $row) {

        $appointments[] = [

            'id' => (int)$row['id'],

            'status' => $row['status'],

            'reason' => $row['reason'],

            'staff_notes' => $row['staff_notes'],

            'slot' => [

                'id' => (int)$row['slot_id'],

                'slot_date' => $row['slot_date'],

                'slot_time' => substr((string)$row['slot_time'], 0, 5),

                'slot_time_label' => date('g:i A', strtotime((string)$row['slot_time'])),

            ],

            'created_at' => $row['created_at'],

            'updated_at' => $row['updated_at'],

        ];
    }

    $stmt = $pdo->prepare('SELECT status, COUNT(*) AS total FROM appointments WHERE patient_id = :patient_id GROUP BY status');

    $stmt->execute(['patient_id' => $patientId]);

    $byStatus = [];

    $appointmentTotal = 0;

    foreach ($stmt->fetchAll() as $row) {

        $byStatus[$row['status']] = (int)$row['total'];

        $appointmentTotal += (int)$row['total'];
    }

    // Sales.

    $stmt = $pdo->prepare(

        'SELECT s.id, s.sale_date, s.total_amount, s.payment_status, s.status, s.notes,

                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count,

                (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.sale_id = s.id) AS amount_paid

         FROM sales s

         WHERE s.patient_id = :patient_id

         ORDER BY s.sale_date DESC, s.id DESC

         LIMIT ' . HISTORY_LIMIT

    );

    $stmt->execute(['patient_id' => $patientId]);

    $sales = [];

    foreach ($stmt->fetchAll() as $row) {

        $totalCents = decimal_to_cents((string)$row['total_amount']);

        $paidCents = decimal_to_cents((string)$row['amount_paid']);

        $sales[] = [

            'id' => (int)$row['id'],

            'sale_date' => $row['sale_date'],

            'status' => $row['status'],

            'payment_status' => $row['payment_status'],

            'total_amount' => cents_to_decimal($totalCents),

            'amount_paid' => cents_to_decimal($paidCents),

            'balance' => cents_to_decimal(max(0, $totalCents - $paidCents)),

            'item_count' => (int)$row['item_count'],

            'notes' => $row['notes'],

        ];
    }

    // Sales summary. Cancelled sales are counted but not added to the money totals.

    $stmt = $pdo->prepare(

        "SELECT COUNT(*) AS sale_count,

                COALESCE(SUM(status = 'Cancelled'), 0) AS cancelled_count,

                COALESCE(SUM(CASE WHEN status = 'Completed' THEN total_amount END), 0) AS total_billed

         FROM sales WHERE patient_id = :patient_id"

    );

    $stmt->execute(['patient_id' => $patientId]);

    $salesSummary = $stmt->fetch();

    $stmt = $pdo->prepare(

        "SELECT COALESCE(SUM(p.amount), 0)

         FROM payments p INNER JOIN sales s ON s.id = p.sale_id

         WHERE s.patient_id = :patient_id AND s.status = 'Completed'"

    );

    $stmt->execute(['patient_id' => $patientId]);

    $billedCents = decimal_to_cents((string)$salesSummary['total_billed']);

    $paidTotalCents = decimal_to_cents((string)$stmt->fetchColumn());

    respond(200, [

        'success' => true,

        'data' => [

            'patient' => format_patient($patientRow),

            'summary' => [

                'appointment_count' => $appointmentTotal,

                'appointments_by_status' => $byStatus,

                'sale_count' => (int)$salesSummary['sale_count'],

                'cancelled_sale_count' => (int)$salesSummary['cancelled_count'],

                'total_billed' => cents_to_decimal($billedCents),

                'total_paid' => cents_to_decimal($paidTotalCents),

                'outstanding_balance' => cents_to_decimal(max(0, $billedCents - $paidTotalCents)),

            ],

            'appointments' => $appointments,

            'sales' => $sales,

            'history_limit' => HISTORY_LIMIT,

        ],

    ]);
}

/**

 * GET patients.php?action=my_profile

 * The logged-in patient's own profile. Patients only.

 */

function handle_my_profile(): void

{

    $pdo = get_db_connection();

    $user = require_auth($pdo, ['patient']);

    $stmt = $pdo->prepare(PATIENT_SELECT . 'WHERE p.user_id = :user_id LIMIT 1');

    $stmt->execute(['user_id' => $user['id']]);

    $row = $stmt->fetch();

    if (!$row) {

        respond_error(404, 'Patient profile not found.');
    }

    respond(200, ['success' => true, 'data' => format_patient($row)]);
}

/**

 * PUT patients.php?action=update_my_profile

 * The logged-in patient changes their own details. Patients only.

 * Send any of: full_name, phone, birth_date, address.

 * The patient is always taken from the login token, never from the request.

 */

function handle_update_my_profile(): void

{

    $pdo = get_db_connection();

    $user = require_auth($pdo, ['patient']);

    $input = read_json_body();

    $errors = [];

    reject_blocked_fields($input, PROFILE_BLOCKED_FIELDS, $errors);

    $fields = read_profile_fields($input, $errors);

    if (!$fields['user'] && !$fields['patient'] && !$errors) {

        $errors['body'] = 'Provide at least one of: full_name, phone, birth_date, address.';
    }

    if ($errors) {

        respond_validation_error($errors);
    }

    $stmt = $pdo->prepare('SELECT id FROM patients WHERE user_id = :user_id LIMIT 1');

    $stmt->execute(['user_id' => $user['id']]);

    $patientId = $stmt->fetchColumn();

    if ($patientId === false) {

        respond_error(404, 'Patient profile not found.');
    }

    [$status, $payload] = update_patient_profile(

        $pdo,

        (int)$patientId,

        $fields['user'],

        $fields['patient'],

        false,

        false

    );

    respond($status, $payload);
}

// ROUTER

// patients.php?action=list | get | check | create | create_walk_in | update | history | my_profile | update_my_profile

try {

    $action = (isset($_GET['action']) && is_string($_GET['action'])) ? $_GET['action'] : '';

    switch ($action) {

        case 'list':

            require_http_method(['GET']);

            handle_list_patients();

            break;

        case 'get':

            require_http_method(['GET']);

            handle_get_patient();

            break;

        case 'check':

            require_http_method(['GET']);

            handle_check_patient();

            break;

        case 'create':

            require_http_method(['POST']);

            handle_create_patient();

            break;

        case 'create_walk_in':

            require_http_method(['POST']);

            handle_create_walk_in();

            break;

        case 'update':

            require_http_method(['PUT']);

            handle_update_patient();

            break;

        case 'history':

            require_http_method(['GET']);

            handle_patient_history();

            break;

        case 'my_profile':

            require_http_method(['GET']);

            handle_my_profile();

            break;

        case 'update_my_profile':

            require_http_method(['PUT']);

            handle_update_my_profile();

            break;

        default:

            respond_error(404, 'Unknown action.');
    }
} catch (Throwable $e) {

    respond_server_error($e, 'Patients API');
}
