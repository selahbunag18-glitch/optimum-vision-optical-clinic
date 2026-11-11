<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/*
 * Optimum Vision - Inventory Batch API
 *
 * GET  ?action=list
 * GET  ?action=new_arrivals
 * GET  ?action=expiring_soon
 * GET  ?action=expired
 * POST ?action=stock_in
 *
 * Owner and Staff only.
 */

const BATCH_MAX_STOCK = 1000000;

const BATCH_REQUIRED_EXPIRY = [
    'Contact Lenses',
    'Eyedrops'
];

const BATCH_NO_EXPIRY = [
    'Eyeglass Frames',
    'Lenses'
];

// -------------------------------
// VALIDATION HELPERS
// -------------------------------

function batch_positive_integer($value): ?int
{
    if (is_int($value)) {
        $number = $value;
    } elseif (
        is_string($value) &&
        preg_match('/^[0-9]{1,10}$/', $value)
    ) {
        $number = (int)$value;
    } else {
        return null;
    }

    return $number >= 1 ? $number : null;
}

function batch_date($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $date = DateTimeImmutable::createFromFormat(
        '!Y-m-d',
        $value
    );

    if (
        !$date ||
        $date->format('Y-m-d') !== $value
    ) {
        return null;
    }

    return $value;
}

function batch_error(
    int $status,
    string $message
): array {
    return [
        $status,
        [
            'success' => false,
            'message' => $message
        ]
    ];
}

// -------------------------------
// BATCH LIST / MONITORING
// -------------------------------

function batch_list(string $filter): void
{
    $pdo = get_db_connection();

    require_auth($pdo, STAFF_ROLES);

    $conditions = [];

    switch ($filter) {

        case 'new_arrivals':
            $conditions[] =
                'b.date_received >=
                 DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
            break;

        case 'expiring_soon':
            $conditions[] =
                'b.expiration_date >= CURDATE()';

            $conditions[] =
                'b.expiration_date <=
                 DATE_ADD(CURDATE(), INTERVAL 30 DAY)';

            $conditions[] =
                'b.quantity_remaining > 0';
            break;

        case 'expired':
            $conditions[] =
                'b.expiration_date < CURDATE()';
            break;
    }

    $where = $conditions
        ? 'WHERE ' . implode(' AND ', $conditions)
        : '';

    $sql = "
        SELECT
            b.id,
            b.inventory_id,
            b.batch_number,
            b.quantity_received,
            b.quantity_remaining,
            b.date_received,
            b.expiration_date,
            b.received_by,
            b.created_at,

            i.product_name,
            i.category,
            i.brand,
            i.sku,

            u.full_name AS received_by_name,

            CASE
                WHEN b.expiration_date < CURDATE()
                    THEN 'Expired'

                WHEN b.expiration_date BETWEEN
                    CURDATE()
                    AND DATE_ADD(
                        CURDATE(),
                        INTERVAL 30 DAY
                    )
                    THEN 'Expiring Soon'

                ELSE 'Available'
            END AS expiration_status

        FROM inventory_batches b

        INNER JOIN inventory i
            ON i.id = b.inventory_id

        LEFT JOIN users u
            ON u.id = b.received_by

        $where

        ORDER BY
            b.date_received DESC,
            b.id DESC

        LIMIT 100
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute();

    $batches = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($batches as &$batch) {

        $batch['id'] = (int)$batch['id'];

        $batch['inventory_id'] =
            (int)$batch['inventory_id'];

        $batch['quantity_received'] =
            (int)$batch['quantity_received'];

        $batch['quantity_remaining'] =
            (int)$batch['quantity_remaining'];

        $batch['received_by'] =
            $batch['received_by'] !== null
            ? (int)$batch['received_by']
            : null;
    }

    unset($batch);

    respond(200, [
        'success' => true,
        'data' => [
            'batches' => $batches,
            'total' => count($batches)
        ]
    ]);
}

// -------------------------------
// STOCK IN WITH BATCH TRACKING
// -------------------------------

function batch_stock_in(): void
{
    $pdo = get_db_connection();

    $user = require_auth($pdo, STAFF_ROLES);

    $input = read_json_body();

    $productId = batch_positive_integer(
        $input['inventory_id'] ?? null
    );

    $quantity = batch_positive_integer(
        $input['quantity'] ?? null
    );

    $batchNumber = $input['batch_number'] ?? null;

    $dateReceived = batch_date(
        $input['date_received'] ?? null
    );

    $expirationInput =
        $input['expiration_date'] ?? null;

    $expirationDate = null;

    $errors = [];

    if ($productId === null) {
        $errors['inventory_id'] =
            'Select a valid product.';
    }

    if (
        $quantity === null ||
        $quantity > BATCH_MAX_STOCK
    ) {
        $errors['quantity'] =
            'Quantity must be between 1 and 1000000.';
    }

    if (
        !is_string($batchNumber) ||
        trim($batchNumber) === '' ||
        strlen(trim($batchNumber)) > 100
    ) {
        $errors['batch_number'] =
            'Batch number is required (maximum 100 characters).';
    } else {
        $batchNumber = trim($batchNumber);
    }

    $today = date('Y-m-d');

    if (
        $dateReceived === null ||
        $dateReceived > $today
    ) {
        $errors['date_received'] =
            'Enter a valid date received, not in the future.';
    }

    if (
        $expirationInput !== null &&
        $expirationInput !== ''
    ) {
        $expirationDate = batch_date(
            $expirationInput
        );

        if ($expirationDate === null) {
            $errors['expiration_date'] =
                'Invalid expiration date.';
        }
    }

    if ($errors) {
        respond_validation_error($errors);
    }

    // Fetch category before validating expiry.
    $productStmt = $pdo->prepare(
        'SELECT id, category
         FROM inventory
         WHERE id = :id'
    );

    $productStmt->execute([
        'id' => $productId
    ]);

    $productInfo = $productStmt->fetch(
        PDO::FETCH_ASSOC
    );

    if (!$productInfo) {
        respond_error(404, 'Product not found.');
    }

    $category = $productInfo['category'];

    if (
        in_array(
            $category,
            BATCH_REQUIRED_EXPIRY,
            true
        ) &&
        $expirationDate === null
    ) {
        $errors['expiration_date'] =
            'Expiration date is required for this category.';
    }

    if (
        in_array(
            $category,
            BATCH_NO_EXPIRY,
            true
        ) &&
        $expirationDate !== null
    ) {
        $errors['expiration_date'] =
            'This category does not require an expiration date.';
    }

    if ($expirationDate !== null) {

        if (
            $expirationDate < $dateReceived ||
            $expirationDate < $today
        ) {
            $errors['expiration_date'] =
                'Expiration date cannot be before the received date or today.';
        }
    }

    if ($errors) {
        respond_validation_error($errors);
    }

    // Begin atomic stock update.
    $pdo->beginTransaction();

    try {

        $lock = $pdo->prepare(
            'SELECT id, stock_quantity, status
             FROM inventory
             WHERE id = :id
             FOR UPDATE'
        );

        $lock->execute([
            'id' => $productId
        ]);

        $product = $lock->fetch(
            PDO::FETCH_ASSOC
        );

        if (!$product) {
            $pdo->rollBack();

            respond_error(
                404,
                'Product not found.'
            );
        }

        if ($product['status'] !== 'Active') {
            $pdo->rollBack();

            respond_error(
                409,
                'Activate the product before receiving stock.'
            );
        }

        // Avoid accidentally recording the same
        // delivery batch twice for one product.
        $duplicate = $pdo->prepare(
            'SELECT id
             FROM inventory_batches
             WHERE inventory_id = :inventory_id
               AND batch_number = :batch_number
             LIMIT 1'
        );

        $duplicate->execute([
            'inventory_id' => $productId,
            'batch_number' => $batchNumber
        ]);

        if ($duplicate->fetch()) {
            $pdo->rollBack();

            respond_error(
                409,
                'This batch number already exists for this product.'
            );
        }

        $stockBefore =
            (int)$product['stock_quantity'];

        $stockAfter = $stockBefore + $quantity;

        if ($stockAfter > BATCH_MAX_STOCK) {
            $pdo->rollBack();

            respond_error(
                409,
                'Maximum stock quantity exceeded.'
            );
        }

        // Insert delivery batch.
        $insertBatch = $pdo->prepare(
            'INSERT INTO inventory_batches (
                inventory_id,
                batch_number,
                quantity_received,
                quantity_remaining,
                date_received,
                expiration_date,
                received_by
            ) VALUES (
                :inventory_id,
                :batch_number,
                :quantity_received,
                :quantity_remaining,
                :date_received,
                :expiration_date,
                :received_by
            )'
        );

        $insertBatch->execute([
            'inventory_id' => $productId,
            'batch_number' => $batchNumber,
            'quantity_received' => $quantity,
            'quantity_remaining' => $quantity,
            'date_received' => $dateReceived,
            'expiration_date' => $expirationDate,
            'received_by' => (int)$user['id']
        ]);

        $batchId = (int)$pdo->lastInsertId();

        // Update existing inventory stock.
        $updateStock = $pdo->prepare(
            'UPDATE inventory
             SET stock_quantity = :quantity
             WHERE id = :id'
        );

        $updateStock->execute([
            'quantity' => $stockAfter,
            'id' => $productId
        ]);

        // Record movement history.
        $insertMovement = $pdo->prepare(
            'INSERT INTO inventory_stock_movements (
                inventory_id,
                movement_type,
                quantity_change,
                stock_before,
                stock_after,
                remarks,
                performed_by
            ) VALUES (
                :inventory_id,
                :movement_type,
                :quantity_change,
                :stock_before,
                :stock_after,
                :remarks,
                :performed_by
            )'
        );

        $insertMovement->execute([
            'inventory_id' => $productId,
            'movement_type' => 'Stock In',
            'quantity_change' => $quantity,
            'stock_before' => $stockBefore,
            'stock_after' => $stockAfter,
            'remarks' => 'New delivery - Batch ' . $batchNumber,
            'performed_by' => (int)$user['id']
        ]);

        $pdo->commit();

        respond(201, [
            'success' => true,
            'message' => 'New stock delivery recorded.',
            'data' => [
                'batch_id' => $batchId,
                'inventory_id' => $productId,
                'batch_number' => $batchNumber,
                'quantity_received' => $quantity,
                'date_received' => $dateReceived,
                'expiration_date' => $expirationDate,
                'stock_before' => $stockBefore,
                'stock_after' => $stockAfter
            ]
        ]);
    } catch (Throwable $e) {

        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $e;
    }
}

// -------------------------------
// API ROUTER
// -------------------------------

try {

    $action = isset($_GET['action'])
        && is_string($_GET['action'])
        ? $_GET['action']
        : '';

    switch ($action) {

        case 'list':
            require_http_method(['GET']);
            batch_list('list');
            break;

        case 'new_arrivals':
            require_http_method(['GET']);
            batch_list('new_arrivals');
            break;

        case 'expiring_soon':
            require_http_method(['GET']);
            batch_list('expiring_soon');
            break;

        case 'expired':
            require_http_method(['GET']);
            batch_list('expired');
            break;

        case 'stock_in':
            require_http_method(['POST']);
            batch_stock_in();
            break;

        default:
            respond_error(
                404,
                'Unknown batch action.'
            );
    }
} catch (Throwable $e) {

    respond_server_error(
        $e,
        'Inventory Batch API'
    );
}
