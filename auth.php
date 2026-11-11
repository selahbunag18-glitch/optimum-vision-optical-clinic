<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

// Login lockout rules (enforced on the server).
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

// Password rules.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes.

// A valid bcrypt hash of a throwaway password. It is checked when the email
// does not exist, so the response time looks the same as for a real account.
const DUMMY_PASSWORD_HASH = '$2y$10$4PWR3mFe9P5Nz1rtNyLwl.SNmvM4yix90i2TU8ntop0V8cvFuXscO';

/**
 * POST auth.php?action=register
 * Register a new patient account. The role is always "patient";
 * any "role" value sent by the client is ignored.
 */
function handle_register(): void
{
    $input = read_json_body();

    $fullName = get_trimmed_string($input, 'full_name');
    $email = strtolower(get_trimmed_string($input, 'email'));
    $password = (isset($input['password']) && is_string($input['password'])) ? $input['password'] : '';
    $phone = get_trimmed_string($input, 'phone');

    $errors = [];
    if (mb_strlen($fullName) < 2 || mb_strlen($fullName) > 100) {
        $errors['full_name'] = 'Full name must be between 2 and 100 characters.';
    }
    if (!is_valid_email($email)) {
        $errors['email'] = 'A valid email address is required.';
    }
    if (
        strlen($password) < MIN_PASSWORD_LENGTH
        || strlen($password) > MAX_PASSWORD_BYTES
        || !preg_match('/[A-Za-z]/', $password)
        || !preg_match('/[0-9]/', $password)
    ) {
        $errors['password'] = 'Password must be 8 to 72 characters and include at least one letter and one number.';
    }
    if ($phone !== '' && !preg_match('/^[0-9+\-\s()]{7,20}$/', $phone)) {
        $errors['phone'] = 'Phone number format is invalid.';
    }
    if ($errors) {
        respond_validation_error($errors);
    }

    $pdo = get_db_connection();
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare(
            'INSERT INTO users (full_name, email, password_hash, role)
             VALUES (:full_name, :email, :password_hash, :role)'
        );
        $stmt->execute([
            'full_name' => $fullName,
            'email' => $email,
            'password_hash' => $passwordHash,
            'role' => 'patient',
        ]);
        $userId = (int)$pdo->lastInsertId();

        $stmt = $pdo->prepare('INSERT INTO patients (user_id, phone) VALUES (:user_id, :phone)');
        $stmt->execute([
            'user_id' => $userId,
            'phone' => $phone !== '' ? $phone : null,
        ]);

        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // MySQL error 1062 = duplicate entry (the email is already registered).
        if (($e->errorInfo[1] ?? 0) === 1062) {
            respond_error(409, 'An account with this email already exists.');
        }
        throw $e;
    }

    respond(201, [
        'success' => true,
        'message' => 'Registration successful. You can now log in.',
        'data' => [
            'id' => $userId,
            'full_name' => $fullName,
            'email' => $email,
            'role' => 'patient',
        ],
    ]);
}

/**
 * POST auth.php?action=login
 * Log in a patient, clinic owner, or clinic staff member.
 * After 3 failed attempts the account is locked for 30 seconds.
 */
function handle_login(): void
{
    $input = read_json_body();

    $email = strtolower(get_trimmed_string($input, 'email'));
    $password = (isset($input['password']) && is_string($input['password'])) ? $input['password'] : '';

    $errors = [];
    if (!is_valid_email($email)) {
        $errors['email'] = 'A valid email address is required.';
    }
    if ($password === '') {
        $errors['password'] = 'Password is required.';
    }
    if ($errors) {
        respond_validation_error($errors);
    }

    $pdo = get_db_connection();

    $status = 500;
    $payload = ['success' => false, 'message' => 'Internal server error.'];
    $retryAfter = null;

    // The transaction and FOR UPDATE row lock make sure two requests for the
    // same account cannot bypass the attempt counter at the same time.
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'SELECT id, full_name, email, password_hash, role, is_active, failed_attempts,
                    (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
                    (locked_until IS NOT NULL AND locked_until <= NOW()) AS lock_expired,
                    GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) AS lock_seconds_remaining
             FROM users
             WHERE email = :email
             LIMIT 1
             FOR UPDATE'
        );
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if (!$user) {
            // Unknown email: same generic message as a wrong password.
            password_verify($password, DUMMY_PASSWORD_HASH);
            $status = 401;
            $payload = ['success' => false, 'message' => 'Invalid email or password.'];
        } elseif ((int)$user['is_locked'] === 1) {
            // The account is still locked. Do not even check the password.
            $retryAfter = max(1, (int)$user['lock_seconds_remaining']);
            $status = 429;
            $payload = [
                'success' => false,
                'message' => 'Too many failed login attempts. Please try again in ' . $retryAfter . ' seconds.',
                'retry_after_seconds' => $retryAfter,
            ];
        } else {
            $userId = (int)$user['id'];
            $failedAttempts = (int)$user['failed_attempts'];

            // The lockout has expired, so the failed attempt counter starts again.
            if ((int)$user['lock_expired'] === 1) {
                $failedAttempts = 0;
            }

            if (!password_verify($password, $user['password_hash'])) {
                $failedAttempts++;

                if ($failedAttempts >= MAX_FAILED_ATTEMPTS) {
                    $update = $pdo->prepare(
                        'UPDATE users
                         SET failed_attempts = :failed_attempts,
                             locked_until = DATE_ADD(NOW(), INTERVAL ' . (int)LOCKOUT_SECONDS . ' SECOND)
                         WHERE id = :id'
                    );
                    $update->execute(['failed_attempts' => $failedAttempts, 'id' => $userId]);

                    $retryAfter = LOCKOUT_SECONDS;
                    $status = 429;
                    $payload = [
                        'success' => false,
                        'message' => 'Too many failed login attempts. Please try again in ' . LOCKOUT_SECONDS . ' seconds.',
                        'retry_after_seconds' => LOCKOUT_SECONDS,
                    ];
                } else {
                    $update = $pdo->prepare(
                        'UPDATE users
                         SET failed_attempts = :failed_attempts, locked_until = NULL
                         WHERE id = :id'
                    );
                    $update->execute(['failed_attempts' => $failedAttempts, 'id' => $userId]);

                    $status = 401;
                    $payload = [
                        'success' => false,
                        'message' => 'Invalid email or password.',
                        'attempts_remaining' => MAX_FAILED_ATTEMPTS - $failedAttempts,
                    ];
                }
            } else {
                // Correct password: clear the failed attempt counter and any old lock.
                $update = $pdo->prepare(
                    'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = :id'
                );
                $update->execute(['id' => $userId]);

                if ((int)$user['is_active'] !== 1) {
                    $status = 403;
                    $payload = ['success' => false, 'message' => 'This account is inactive.'];
                } else {
                    // Remove this user's expired tokens, then create a new one.
                    $cleanup = $pdo->prepare(
                        'DELETE FROM auth_tokens WHERE user_id = :user_id AND expires_at <= NOW()'
                    );
                    $cleanup->execute(['user_id' => $userId]);

                    $token = generate_token();
                    $expiresAt = date('Y-m-d H:i:s', time() + TOKEN_LIFETIME_HOURS * 3600);

                    $insert = $pdo->prepare(
                        'INSERT INTO auth_tokens (user_id, token_hash, expires_at)
                         VALUES (:user_id, :token_hash, :expires_at)'
                    );
                    $insert->execute([
                        'user_id' => $userId,
                        'token_hash' => hash_token($token),
                        'expires_at' => $expiresAt,
                    ]);

                    $status = 200;
                    $payload = [
                        'success' => true,
                        'message' => 'Login successful.',
                        'data' => [
                            'token' => $token,
                            'token_type' => 'Bearer',
                            'expires_at' => $expiresAt,
                            'user' => [
                                'id' => $userId,
                                'full_name' => $user['full_name'],
                                'email' => $user['email'],
                                'role' => $user['role'],
                            ],
                        ],
                    ];
                }
            }
        }

        // Commit before responding, because respond() stops the script.
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    if ($retryAfter !== null) {
        header('Retry-After: ' . $retryAfter);
    }
    respond($status, $payload);
}

/**
 * POST auth.php?action=logout
 * Delete the token that was used for this request.
 */
function handle_logout(): void
{
    $pdo = get_db_connection();
    require_auth($pdo);

    $token = get_bearer_token();
    $stmt = $pdo->prepare('DELETE FROM auth_tokens WHERE token_hash = :token_hash');
    $stmt->execute(['token_hash' => hash_token((string)$token)]);

    respond(200, ['success' => true, 'message' => 'Logged out successfully.']);
}

/**
 * GET auth.php?action=me
 * Return the logged-in user. Patients also get their profile details.
 */
function handle_me(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo);

    $patient = null;
    if ($user['role'] === 'patient') {
        $stmt = $pdo->prepare(
            'SELECT id, phone, birth_date, address FROM patients WHERE user_id = :user_id LIMIT 1'
        );
        $stmt->execute(['user_id' => $user['id']]);
        $row = $stmt->fetch();
        if ($row) {
            $row['id'] = (int)$row['id'];
            $patient = $row;
        }
    }

    $user['patient'] = $patient;
    respond(200, ['success' => true, 'data' => $user]);
}

/**
 * POST auth.php?action=change_password
 * Change the password of the logged-in user.
 * Body: { "current_password": "...", "new_password": "..." }
 * The current password must be correct. A wrong current password counts as a failed
 * attempt, with the same lockout as login (3 failures, then 30 seconds), so a stolen
 * token cannot be used to guess the password.
 * On success, every other login token of this user is deleted. The token used for
 * this request stays valid, so the current device stays logged in.
 */
function handle_change_password(): void
{
    $pdo = get_db_connection();
    $authUser = require_auth($pdo);

    $input = read_json_body();

    $currentPassword = (isset($input['current_password']) && is_string($input['current_password']))
        ? $input['current_password'] : '';
    $newPassword = (isset($input['new_password']) && is_string($input['new_password']))
        ? $input['new_password'] : '';

    // The new password follows the same rules as registration.
    $errors = [];
    if ($currentPassword === '') {
        $errors['current_password'] = 'Current password is required.';
    }
    if (
        strlen($newPassword) < MIN_PASSWORD_LENGTH
        || strlen($newPassword) > MAX_PASSWORD_BYTES
        || !preg_match('/[A-Za-z]/', $newPassword)
        || !preg_match('/[0-9]/', $newPassword)
    ) {
        $errors['new_password'] = 'Password must be 8 to 72 characters and include at least one letter and one number.';
    }
    if ($errors) {
        respond_validation_error($errors);
    }

    $userId = $authUser['id'];
    $currentTokenHash = hash_token((string)get_bearer_token());

    $status = 500;
    $payload = ['success' => false, 'message' => 'Internal server error.'];
    $retryAfter = null;

    // The transaction and FOR UPDATE row lock make sure two requests for the
    // same account cannot bypass the attempt counter at the same time.
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'SELECT id, password_hash, failed_attempts,
                    (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
                    (locked_until IS NOT NULL AND locked_until <= NOW()) AS lock_expired,
                    GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) AS lock_seconds_remaining
             FROM users
             WHERE id = :id
             LIMIT 1
             FOR UPDATE'
        );
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();

        if (!$user) {
            $status = 401;
            $payload = ['success' => false, 'message' => 'Invalid or expired token.'];
        } elseif ((int)$user['is_locked'] === 1) {
            $retryAfter = max(1, (int)$user['lock_seconds_remaining']);
            $status = 429;
            $payload = [
                'success' => false,
                'message' => 'Too many failed attempts. Please try again in ' . $retryAfter . ' seconds.',
                'retry_after_seconds' => $retryAfter,
            ];
        } else {
            $failedAttempts = (int)$user['failed_attempts'];

            // The lockout has expired, so the failed attempt counter starts again.
            if ((int)$user['lock_expired'] === 1) {
                $failedAttempts = 0;
            }

            if (!password_verify($currentPassword, $user['password_hash'])) {
                $failedAttempts++;

                if ($failedAttempts >= MAX_FAILED_ATTEMPTS) {
                    $update = $pdo->prepare(
                        'UPDATE users
                         SET failed_attempts = :failed_attempts,
                             locked_until = DATE_ADD(NOW(), INTERVAL ' . (int)LOCKOUT_SECONDS . ' SECOND)
                         WHERE id = :id'
                    );
                    $update->execute(['failed_attempts' => $failedAttempts, 'id' => $userId]);

                    $retryAfter = LOCKOUT_SECONDS;
                    $status = 429;
                    $payload = [
                        'success' => false,
                        'message' => 'Too many failed attempts. Please try again in ' . LOCKOUT_SECONDS . ' seconds.',
                        'retry_after_seconds' => LOCKOUT_SECONDS,
                    ];
                } else {
                    $update = $pdo->prepare(
                        'UPDATE users
                         SET failed_attempts = :failed_attempts, locked_until = NULL
                         WHERE id = :id'
                    );
                    $update->execute(['failed_attempts' => $failedAttempts, 'id' => $userId]);

                    // 422 (not 401), so the app does not treat this as an expired login.
                    $status = 422;
                    $payload = [
                        'success' => false,
                        'message' => 'Validation failed.',
                        'errors' => ['current_password' => 'Current password is incorrect.'],
                        'attempts_remaining' => MAX_FAILED_ATTEMPTS - $failedAttempts,
                    ];
                }
            } elseif (password_verify($newPassword, $user['password_hash'])) {
                $status = 422;
                $payload = [
                    'success' => false,
                    'message' => 'Validation failed.',
                    'errors' => ['new_password' => 'New password must be different from the current password.'],
                ];
            } else {
                // Correct current password: save the new hash and clear the attempt counter.
                $update = $pdo->prepare(
                    'UPDATE users
                     SET password_hash = :password_hash, failed_attempts = 0, locked_until = NULL
                     WHERE id = :id'
                );
                $update->execute([
                    'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
                    'id' => $userId,
                ]);

                // Log out every other device. The token of this request is kept.
                $revoke = $pdo->prepare(
                    'DELETE FROM auth_tokens WHERE user_id = :user_id AND token_hash <> :current_token_hash'
                );
                $revoke->execute(['user_id' => $userId, 'current_token_hash' => $currentTokenHash]);

                $status = 200;
                $payload = [
                    'success' => true,
                    'message' => 'Password changed. Other devices were logged out.',
                    'data' => ['other_sessions_revoked' => $revoke->rowCount()],
                ];
            }
        }

        // Commit before responding, because respond() stops the script.
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    if ($retryAfter !== null) {
        header('Retry-After: ' . $retryAfter);
    }
    respond($status, $payload);
}


/**
 * POST auth.php?action=update_profile
 * Update the personal information of the authenticated patient.
 * Body: { "full_name": "...", "email": "...", "phone": "..." }
 */
function handle_update_profile(): void
{
    $pdo = get_db_connection();
    $authUser = require_auth($pdo);

    if (($authUser['role'] ?? '') !== 'patient') {
        respond_error(403, 'Only patient accounts can update this profile.');
    }

    $input = read_json_body();

    $fullName = get_trimmed_string($input, 'full_name');
    $email = strtolower(get_trimmed_string($input, 'email'));
    $phone = get_trimmed_string($input, 'phone');

    $errors = [];

    if (mb_strlen($fullName) < 2 || mb_strlen($fullName) > 100) {
        $errors['full_name'] = 'Full name must be between 2 and 100 characters.';
    }

    if (!is_valid_email($email)) {
        $errors['email'] = 'A valid email address is required.';
    }

    if ($phone !== '' && !preg_match('/^[0-9+\-\s()]{7,20}$/', $phone)) {
        $errors['phone'] = 'Phone number format is invalid.';
    }

    if ($errors) {
        respond_validation_error($errors);
    }

    $userId = (int)$authUser['id'];

    try {
        $pdo->beginTransaction();

        // Prevent another account from using the same email address.
        $checkEmail = $pdo->prepare(
            'SELECT id
             FROM users
             WHERE email = :email AND id <> :id
             LIMIT 1'
        );

        $checkEmail->execute([
            'email' => $email,
            'id' => $userId
        ]);

        if ($checkEmail->fetch()) {
            $pdo->rollBack();

            respond_validation_error([
                'email' => 'This email address is already registered.'
            ]);
        }

        // Update the authenticated patient's account information.
        $updateUser = $pdo->prepare(
            'UPDATE users
             SET full_name = :full_name,
                 email = :email
             WHERE id = :id AND role = :role'
        );

        $updateUser->execute([
            'full_name' => $fullName,
            'email' => $email,
            'id' => $userId,
            'role' => 'patient'
        ]);

        // Update the phone number in the related patient record.
        $checkPatient = $pdo->prepare(
            'SELECT id
             FROM patients
             WHERE user_id = :user_id
             LIMIT 1'
        );

        $checkPatient->execute(['user_id' => $userId]);
        $patient = $checkPatient->fetch();

        if ($patient) {
            $updatePatient = $pdo->prepare(
                'UPDATE patients
                 SET phone = :phone
                 WHERE user_id = :user_id'
            );

            $updatePatient->execute([
                'phone' => $phone !== '' ? $phone : null,
                'user_id' => $userId
            ]);
        } else {
            // Normally registration already creates this record.
            $insertPatient = $pdo->prepare(
                'INSERT INTO patients (user_id, phone)
                 VALUES (:user_id, :phone)'
            );

            $insertPatient->execute([
                'user_id' => $userId,
                'phone' => $phone !== '' ? $phone : null
            ]);
        }

        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        // MySQL error 1062 means a unique value (usually email) already exists.
        if (($e->errorInfo[1] ?? 0) === 1062) {
            respond_validation_error([
                'email' => 'This email address is already registered.'
            ]);
        }

        throw $e;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $e;
    }

    respond(200, [
        'success' => true,
        'message' => 'Profile updated successfully.',
        'data' => [
            'id' => $userId,
            'full_name' => $fullName,
            'email' => $email,
            'role' => 'patient',
            'phone' => $phone !== '' ? $phone : null
        ]
    ]);
}

// ---------------------------------------------------------------------
// Router: auth.php?action=register | login | logout | me | change_password | update_profile
// ---------------------------------------------------------------------
try {
    $action = (isset($_GET['action']) && is_string($_GET['action'])) ? $_GET['action'] : '';

    switch ($action) {
        case 'register':
            require_http_method(['POST']);
            handle_register();
            break;

        case 'login':
            require_http_method(['POST']);
            handle_login();
            break;

        case 'logout':
            require_http_method(['POST']);
            handle_logout();
            break;

        case 'me':
            require_http_method(['GET']);
            handle_me();
            break;

        case 'change_password':
            require_http_method(['POST']);
            handle_change_password();
            break;

        case 'update_profile':
            require_http_method(['POST']);
            handle_update_profile();
            break;

        default:
            respond_error(404, 'Unknown action.');
    }
} catch (Throwable $e) {
    respond_server_error($e, 'Auth API');
}
