<?php
require_once __DIR__ . '/helpers.php';

/*
|--------------------------------------------------------------------------
| Eye Examination and Prescription Management API
|--------------------------------------------------------------------------
|
| GET  ?action=list&patient_id=1
| GET  ?action=get&id=1
| POST ?action=create
| PUT  ?action=update&id=1
| PUT  ?action=save_prescription&id=1
|
| Access: owner and staff
|
*/

/*
|--------------------------------------------------------------------------
| Response Helpers
|--------------------------------------------------------------------------
*/

function eye_response(
    int $status,
    array $payload
): void {
    http_response_code($status);

    header('Content-Type: application/json; charset=utf-8');

    echo json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES
    );

    exit;
}

function eye_success(
    int $status,
    array $data,
    string $message = 'Success.'
): void {
    eye_response($status, [
        'success' => true,
        'message' => $message,
        'data' => $data
    ]);
}

function eye_error(
    int $status,
    string $message,
    array $extra = []
): void {
    eye_response($status, array_merge([
        'success' => false,
        'message' => $message
    ], $extra));
}

function eye_validation_error(array $errors): void
{
    eye_error(422, 'Validation failed.', [
        'errors' => $errors
    ]);
}

function eye_server_error(Throwable $e): void
{
    error_log(
        'Eye Examinations API: ' . $e->getMessage()
    );

    eye_error(
        500,
        'Internal server error.'
    );
}

/*
|--------------------------------------------------------------------------
| Request Validation
|--------------------------------------------------------------------------
*/

function eye_require_method(array $methods): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? '';

    if (!in_array($method, $methods, true)) {
        header(
            'Allow: ' . implode(', ', $methods) . ', OPTIONS'
        );

        eye_error(405, 'Method not allowed.');
    }
}

function eye_read_body(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === false || trim($raw) === '') {
        eye_error(400, 'Request body is required.');
    }

    $data = json_decode($raw, true);

    if (!is_array($data) || array_is_list($data)) {
        eye_error(400, 'Invalid JSON object.');
    }

    return $data;
}

function eye_id($value): ?int
{
    if (
        !is_int($value) &&
        !is_string($value)
    ) {
        return null;
    }

    $id = filter_var(
        $value,
        FILTER_VALIDATE_INT,
        ['options' => ['min_range' => 1]]
    );

    return $id === false ? null : $id;
}

function eye_query_id(string $name): int
{
    $id = eye_id($_GET[$name] ?? null);

    if ($id === null) {
        eye_validation_error([
            $name => 'A valid positive ID is required.'
        ]);
    }

    return $id;
}

function eye_valid_date(string $value): bool
{
    $date = DateTimeImmutable::createFromFormat(
        '!Y-m-d',
        $value
    );

    return $date !== false
        && $date->format('Y-m-d') === $value
        && $value >= '1900-01-01'
        && $value <= date('Y-m-d');
}

function eye_text(
    array $input,
    string $key,
    int $maximum,
    array &$errors
): ?string {
    if (
        !array_key_exists($key, $input) ||
        $input[$key] === null ||
        $input[$key] === ''
    ) {
        return null;
    }

    if (!is_string($input[$key])) {
        $errors[$key] = 'Must be text.';
        return null;
    }

    $value = trim($input[$key]);

    if (strlen($value) > $maximum) {
        $errors[$key] =
            "Cannot exceed {$maximum} characters.";
    }

    return $value === '' ? null : $value;
}

/*
|--------------------------------------------------------------------------
| Database Helpers
|--------------------------------------------------------------------------
*/

function eye_patient_exists(
    PDO $pdo,
    int $patientId
): bool {
    $stmt = $pdo->prepare(
        'SELECT id
         FROM patients
         WHERE id = :id
         LIMIT 1'
    );

    $stmt->execute([
        'id' => $patientId
    ]);

    return $stmt->fetchColumn() !== false;
}

function eye_examination_exists(
    PDO $pdo,
    int $id
): bool {
    $stmt = $pdo->prepare(
        'SELECT id
         FROM eye_examinations
         WHERE id = :id
         LIMIT 1'
    );

    $stmt->execute([
        'id' => $id
    ]);

    return $stmt->fetchColumn() !== false;
}

/*
|--------------------------------------------------------------------------
| Examination Validation
|--------------------------------------------------------------------------
*/

function eye_validate_examination(
    array $input,
    bool $creating = true
): array {
    $errors = [];
    $data = [];

    if (
        $creating ||
        array_key_exists('examination_date', $input)
    ) {
        $date = $input['examination_date'] ?? null;

        if (
            !is_string($date) ||
            !eye_valid_date(trim($date))
        ) {
            $errors['examination_date'] =
                'Enter a valid examination date.';
        } else {
            $data['examination_date'] = trim($date);
        }
    }

    $fields = [
        'chief_complaint' => 5000,
        'visual_acuity_od' => 20,
        'visual_acuity_os' => 20,
        'findings' => 5000,
        'remarks' => 5000
    ];

    foreach ($fields as $field => $maximum) {
        if (
            $creating ||
            array_key_exists($field, $input)
        ) {
            $data[$field] = eye_text(
                $input,
                $field,
                $maximum,
                $errors
            );
        }
    }

    if ($errors !== []) {
        eye_validation_error($errors);
    }

    return $data;
}

/*
|--------------------------------------------------------------------------
| Prescription Validation
|--------------------------------------------------------------------------
*/

function eye_validate_prescription(
    array $input
): array {
    $errors = [];
    $data = [];

    $decimalFields = [
        'od_sph',
        'od_cyl',
        'od_add',
        'os_sph',
        'os_cyl',
        'os_add'
    ];

    foreach ($decimalFields as $field) {
        $value = $input[$field] ?? null;

        if ($value === null || $value === '') {
            $data[$field] = null;
            continue;
        }

        if (
            !is_numeric($value) ||
            !is_finite((float)$value) ||
            (float)$value < -99.99 ||
            (float)$value > 99.99
        ) {
            $errors[$field] = 'Invalid lens power.';
            continue;
        }

        $data[$field] = round((float)$value, 2);
    }

    foreach (['od_axis', 'os_axis'] as $field) {
        $value = $input[$field] ?? null;

        if ($value === null || $value === '') {
            $data[$field] = null;
            continue;
        }

        $axis = filter_var(
            $value,
            FILTER_VALIDATE_INT
        );

        if (
            $axis === false ||
            $axis < 0 ||
            $axis > 180
        ) {
            $errors[$field] =
                'Axis must be between 0 and 180.';
        } else {
            $data[$field] = $axis;
        }
    }

    $pd = $input['pd'] ?? null;

    if ($pd === null || $pd === '') {
        $data['pd'] = null;
    } elseif (
        !is_numeric($pd) ||
        !is_finite((float)$pd) ||
        (float)$pd <= 0 ||
        (float)$pd > 99.99
    ) {
        $errors['pd'] =
            'Invalid pupillary distance.';
    } else {
        $data['pd'] = round((float)$pd, 2);
    }

    $data['lens_type'] = eye_text(
        $input,
        'lens_type',
        100,
        $errors
    );

    $data['prescription_notes'] = eye_text(
        $input,
        'prescription_notes',
        5000,
        $errors
    );

    if ($errors !== []) {
        eye_validation_error($errors);
    }

    return $data;
}

/*
|--------------------------------------------------------------------------
| Fetch Examination with Prescription
|--------------------------------------------------------------------------
*/

function eye_fetch(
    PDO $pdo,
    int $id
): ?array {
    $stmt = $pdo->prepare(
        'SELECT
            e.*,
            u.full_name AS patient_name,
            u.email AS patient_email,
            p.phone AS patient_phone
         FROM eye_examinations e
         INNER JOIN patients p
            ON p.id = e.patient_id
         INNER JOIN users u
            ON u.id = p.user_id
         WHERE e.id = :id
         LIMIT 1'
    );

    $stmt->execute(['id' => $id]);

    $examination = $stmt->fetch(
        PDO::FETCH_ASSOC
    );

    if (!$examination) {
        return null;
    }

    $prescriptionStmt = $pdo->prepare(
        'SELECT *
         FROM prescriptions
         WHERE examination_id = :id
         LIMIT 1'
    );

    $prescriptionStmt->execute([
        'id' => $id
    ]);

    $prescription = $prescriptionStmt->fetch(
        PDO::FETCH_ASSOC
    );

    $examination['id'] =
        (int)$examination['id'];

    $examination['patient_id'] =
        (int)$examination['patient_id'];

    $examination['examined_by'] =
        $examination['examined_by'] === null
        ? null
        : (int)$examination['examined_by'];

    $examination['prescription'] =
        $prescription ?: null;

    if ($prescription) {
        $examination['prescription']['id'] =
            (int)$prescription['id'];

        $examination['prescription']['patient_id'] =
            (int)$prescription['patient_id'];

        $examination['prescription']['examination_id'] =
            (int)$prescription['examination_id'];
    }

    return $examination;
}

/*
|--------------------------------------------------------------------------
| List Patient Examinations
|--------------------------------------------------------------------------
*/

function eye_list(PDO $pdo): void
{
    $patientId = eye_query_id('patient_id');

    if (!eye_patient_exists($pdo, $patientId)) {
        eye_error(
            404,
            'Patient not found.'
        );
    }

    $stmt = $pdo->prepare(
        'SELECT
            e.id,
            e.patient_id,
            e.examination_date,
            e.chief_complaint,
            e.visual_acuity_od,
            e.visual_acuity_os,
            e.findings,
            e.remarks,
            e.examined_by,
            e.created_at,
            e.updated_at,
            CASE
                WHEN pr.id IS NULL THEN 0
                ELSE 1
            END AS has_prescription
         FROM eye_examinations e
         LEFT JOIN prescriptions pr
            ON pr.examination_id = e.id
         WHERE e.patient_id = :patient_id
         ORDER BY
            e.examination_date DESC,
            e.id DESC'
    );

    $stmt->execute([
        'patient_id' => $patientId
    ]);

    $rows = $stmt->fetchAll(
        PDO::FETCH_ASSOC
    );

    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];

        $row['patient_id'] =
            (int)$row['patient_id'];

        $row['has_prescription'] =
            (bool)$row['has_prescription'];

        $row['examined_by'] =
            $row['examined_by'] === null
            ? null
            : (int)$row['examined_by'];
    }

    unset($row);

    eye_success(
        200,
        [
            'examinations' => $rows,
            'total' => count($rows)
        ],
        'Examinations retrieved.'
    );
}

/*
|--------------------------------------------------------------------------
| Get Examination
|--------------------------------------------------------------------------
*/

function eye_get(PDO $pdo): void
{
    $id = eye_query_id('id');

    $examination = eye_fetch(
        $pdo,
        $id
    );

    if (!$examination) {
        eye_error(
            404,
            'Examination not found.'
        );
    }

    eye_success(
        200,
        $examination,
        'Examination retrieved.'
    );
}

/*
|--------------------------------------------------------------------------
| Create Examination
|--------------------------------------------------------------------------
*/

function eye_create(
    PDO $pdo,
    array $user
): void {
    $input = eye_read_body();

    $patientId = eye_id(
        $input['patient_id'] ?? null
    );

    if ($patientId === null) {
        eye_validation_error([
            'patient_id' =>
            'A valid patient ID is required.'
        ]);
    }

    if (!eye_patient_exists($pdo, $patientId)) {
        eye_error(
            404,
            'Patient not found.'
        );
    }

    $data = eye_validate_examination(
        $input,
        true
    );

    $stmt = $pdo->prepare(
        'INSERT INTO eye_examinations (
            patient_id,
            examination_date,
            chief_complaint,
            visual_acuity_od,
            visual_acuity_os,
            findings,
            remarks,
            examined_by
        ) VALUES (
            :patient_id,
            :examination_date,
            :chief_complaint,
            :visual_acuity_od,
            :visual_acuity_os,
            :findings,
            :remarks,
            :examined_by
        )'
    );

    $stmt->execute([
        'patient_id' => $patientId,
        'examination_date' =>
        $data['examination_date'],
        'chief_complaint' =>
        $data['chief_complaint'],
        'visual_acuity_od' =>
        $data['visual_acuity_od'],
        'visual_acuity_os' =>
        $data['visual_acuity_os'],
        'findings' =>
        $data['findings'],
        'remarks' =>
        $data['remarks'],
        'examined_by' =>
        $user['id']
    ]);

    $id = (int)$pdo->lastInsertId();

    eye_success(
        201,
        eye_fetch($pdo, $id),
        'Eye examination created successfully.'
    );
}

/*
|--------------------------------------------------------------------------
| Update Examination
|--------------------------------------------------------------------------
*/

function eye_update(PDO $pdo): void
{
    $id = eye_query_id('id');

    if (!eye_examination_exists($pdo, $id)) {
        eye_error(
            404,
            'Examination not found.'
        );
    }

    $input = eye_read_body();

    foreach (
        ['id', 'patient_id', 'examined_by']
        as $protected
    ) {
        if (array_key_exists($protected, $input)) {
            eye_validation_error([
                $protected =>
                'This field cannot be changed.'
            ]);
        }
    }

    $data = eye_validate_examination(
        $input,
        false
    );

    if ($data === []) {
        eye_validation_error([
            'body' =>
            'Provide at least one field to update.'
        ]);
    }

    $assignments = [];
    $params = ['id' => $id];

    foreach ($data as $field => $value) {
        $assignments[] =
            $field . ' = :' . $field;

        $params[$field] = $value;
    }

    $sql =
        'UPDATE eye_examinations SET ' .
        implode(', ', $assignments) .
        ' WHERE id = :id';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    eye_success(
        200,
        eye_fetch($pdo, $id),
        'Eye examination updated successfully.'
    );
}

/*
|--------------------------------------------------------------------------
| Save or Update Prescription
|--------------------------------------------------------------------------
*/

function eye_save_prescription(
    PDO $pdo
): void {
    $id = eye_query_id('id');

    $input = eye_read_body();

    $data = eye_validate_prescription(
        $input
    );

    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare(
            'SELECT id, patient_id
             FROM eye_examinations
             WHERE id = :id
             FOR UPDATE'
        );

        $stmt->execute([
            'id' => $id
        ]);

        $examination = $stmt->fetch(
            PDO::FETCH_ASSOC
        );

        if (!$examination) {
            $pdo->rollBack();

            eye_error(
                404,
                'Examination not found.'
            );
        }

        $patientId =
            (int)$examination['patient_id'];

        $sql = '
            INSERT INTO prescriptions (
                examination_id,
                patient_id,
                od_sph,
                od_cyl,
                od_axis,
                od_add,
                os_sph,
                os_cyl,
                os_axis,
                os_add,
                pd,
                lens_type,
                prescription_notes
            ) VALUES (
                :examination_id,
                :patient_id,
                :od_sph,
                :od_cyl,
                :od_axis,
                :od_add,
                :os_sph,
                :os_cyl,
                :os_axis,
                :os_add,
                :pd,
                :lens_type,
                :prescription_notes
            )
            ON DUPLICATE KEY UPDATE
                od_sph = VALUES(od_sph),
                od_cyl = VALUES(od_cyl),
                od_axis = VALUES(od_axis),
                od_add = VALUES(od_add),
                os_sph = VALUES(os_sph),
                os_cyl = VALUES(os_cyl),
                os_axis = VALUES(os_axis),
                os_add = VALUES(os_add),
                pd = VALUES(pd),
                lens_type = VALUES(lens_type),
                prescription_notes =
                    VALUES(prescription_notes)
        ';

        $params = array_merge(
            [
                'examination_id' => $id,
                'patient_id' => $patientId
            ],
            $data
        );

        $insert = $pdo->prepare($sql);
        $insert->execute($params);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $e;
    }

    eye_success(
        200,
        eye_fetch($pdo, $id),
        'Prescription saved successfully.'
    );
}

/*
|--------------------------------------------------------------------------
| API Router
|--------------------------------------------------------------------------
*/

try {
    // Uses the existing config.php database function.
    $pdo = get_db_connection();

    // Existing authentication and role checking.
    $user = require_auth(
        $pdo,
        ['owner', 'staff']
    );

    $action = $_GET['action'] ?? '';

    if (!is_string($action)) {
        eye_error(
            400,
            'Invalid action.'
        );
    }

    switch ($action) {
        case 'list':
            eye_require_method(['GET']);
            eye_list($pdo);
            break;

        case 'get':
            eye_require_method(['GET']);
            eye_get($pdo);
            break;

        case 'create':
            eye_require_method(['POST']);
            eye_create($pdo, $user);
            break;

        case 'update':
            eye_require_method(['PUT']);
            eye_update($pdo);
            break;

        case 'save_prescription':
            eye_require_method(['PUT']);
            eye_save_prescription($pdo);
            break;

        default:
            eye_error(
                404,
                'Unknown action.'
            );
    }
} catch (Throwable $e) {
    eye_server_error($e);
}
