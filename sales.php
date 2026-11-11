<?php

declare(strict_types=1);
require_once __DIR__ . '/helpers.php';
// Pagination limits for list endpoints.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
// Sale rules.
const MAX_ITEMS_PER_SALE = 50;
const MAX_ITEM_QUANTITY = 1000000;
// sales.total_amount is DECIMAL(12,2), so the largest total is 9,999,999,999.99 (in centavos).
const MAX_SALE_TOTAL_CENTS = 999999999999;
// Text length limits (they match the database columns, except the sale notes).
// Sale notes are limited to 200 characters so there is always room to add a cancellation reason.
const MAX_SALE_NOTES_LENGTH = 200;
const MAX_NOTES_LENGTH = 255;
const MAX_REFERENCE_NUMBER_LENGTH = 100;
// Allowed values (they match the ENUM columns in the database).
const PAYMENT_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Other'];
const SALE_STATUSES = ['Completed', 'Cancelled'];
const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];
// Fields the client may never send when creating a sale. The server calculates them.
const CREATE_BLOCKED_FIELDS = [
    'total_amount' => 'The total is calculated by the server from the product prices.',
    'payment_status' => 'The payment status is calculated by the server.',
    'status' => 'New sales are always Completed.',
    'processed_by' => 'The staff member is taken from the login token.',
    'sale_date' => 'The sale date is set by the server.',
];
// Base query used to load sales with patient name, staff name, item count, and amount paid.
const SALE_SELECT =
'SELECT s.id, s.patient_id, s.processed_by, s.sale_date, s.total_amount, s.payment_status,
            s.status, s.notes, s.created_at, s.updated_at,
            pu.full_name AS patient_name, u.full_name AS processed_by_name,
            (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.sale_id = s.id) AS amount_paid
     FROM sales s
     LEFT JOIN patients pt ON pt.id = s.patient_id
     LEFT JOIN users pu ON pu.id = pt.user_id
     LEFT JOIN users u ON u.id = s.processed_by ';
const SALE_ITEM_SELECT =
'SELECT si.id, si.inventory_id, si.quantity, si.unit_price, si.subtotal,
            i.product_name, i.sku
     FROM sale_items si
     INNER JOIN inventory i ON i.id = si.inventory_id ';
const PAYMENT_SELECT =
'SELECT p.id, p.sale_id, p.amount, p.payment_method, p.reference_number, p.received_by,
            p.payment_date, p.notes, p.created_at, u.full_name AS received_by_name
     FROM payments p
     LEFT JOIN users u ON u.id = p.received_by ';
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
 * Convert a money value to a string with exactly two decimals (for example "1500.00").
 * Accepts numbers and numeric strings from 0 to 99999999.99. Otherwise null.
 */
function parse_price($value): ?string
{
    if (is_int($value)) {
        $text = (string)$value;
    } elseif (is_float($value)) {
        $text = rtrim(rtrim(sprintf('%.4F', $value), '0'), '.');
    } elseif (is_string($value)) {
        $text = trim($value);
    } else {
        return null;
    }
    if (preg_match('/^(\d{1,8})(?:\.(\d{1,2}))?$/', $text, $matches) !== 1) {
        return null;
    }
    return (string)(int)$matches[1] . '.' . str_pad($matches[2] ?? '', 2, '0');
}
/**
 * Convert a decimal string from the database (for example "1500.00" or "0") to centavos.
 * All money math in this file uses whole centavos, never floating point numbers.
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
 * Payment status from the sale total and the amount paid so far (both in centavos).
 */
function get_payment_status(int $totalCents, int $paidCents): string
{
    if ($paidCents >= $totalCents) {
        return 'Paid';
    }
    return $paidCents > 0 ? 'Partial' : 'Unpaid';
}
function get_query_string(string $key): string
{
    return (isset($_GET[$key]) && is_string($_GET[$key])) ? trim($_GET[$key]) : '';
}
/**
 * Read the sale id from the query string (?id=5). Stops with 400 if invalid.
 */
function get_sale_id_from_query(): int
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
 * Read an optional text field from an array.
 * Returns [provided, value, error]. An empty string or null clears the value (value = null).
 * $label is the field name used in the error message.
 */
function read_optional_text(array $input, string $key, int $maxLength, string $label = ''): array
{
    $label = $label !== '' ? $label : $key;
    if (!array_key_exists($key, $input)) {
        return [false, null, null];
    }
    $value = $input[$key];
    if ($value === null) {
        return [true, null, null];
    }
    if (!is_string($value)) {
        return [false, null, $label . ' must be text.'];
    }
    $value = trim($value);
    if (mb_strlen($value) > $maxLength) {
        return [false, null, $label . ' cannot be longer than ' . $maxLength . ' characters.'];
    }
    return [true, $value === '' ? null : $value, null];
}
/**
 * Validate a payment object: payment_method, amount, reference_number, notes.
 * $prefix is added to error keys (for example "payment." when the payment is nested in a sale).
 * Returns the clean payment data, or null when there are errors.
 */
function read_payment_fields(array $data, string $prefix, array &$errors): ?array
{
    $hasErrors = false;
    $method = get_trimmed_string($data, 'payment_method');
    if (!in_array($method, PAYMENT_METHODS, true)) {
        $errors[$prefix . 'payment_method'] = 'payment_method must be one of: ' . implode(', ', PAYMENT_METHODS) . '.';
        $hasErrors = true;
    }
    $amount = parse_price($data['amount'] ?? null);
    $amountCents = 0;
    if ($amount === null) {
        $errors[$prefix . 'amount'] = 'amount is required and must be a number with at most 2 decimal places (maximum 99999999.99).';
        $hasErrors = true;
    } else {
        $amountCents = decimal_to_cents($amount);
        if ($amountCents <= 0) {
            $errors[$prefix . 'amount'] = 'amount must be greater than 0.';
            $hasErrors = true;
        }
    }
    [, $reference, $referenceError] = read_optional_text(
        $data,
        'reference_number',
        MAX_REFERENCE_NUMBER_LENGTH,
        $prefix . 'reference_number'
    );
    if ($referenceError !== null) {
        $errors[$prefix . 'reference_number'] = $referenceError;
        $hasErrors = true;
    }
    [, $notes, $notesError] = read_optional_text($data, 'notes', MAX_NOTES_LENGTH, $prefix . 'notes');
    if ($notesError !== null) {
        $errors[$prefix . 'notes'] = $notesError;
        $hasErrors = true;
    }
    if ($hasErrors) {
        return null;
    }
    return [
        'payment_method' => $method,
        'amount_cents' => $amountCents,
        'reference_number' => $reference,
        'notes' => $notes,
    ];
}
/**
 * Validate the items list of a new sale.
 * Returns a list of ['inventory_id' => int, 'quantity' => int]. Problems are added to $errors.
 * The same product cannot appear twice.
 */
function read_sale_items($rawItems, array &$errors): array
{
    if (!is_array($rawItems) || $rawItems === [] || !array_is_list($rawItems)) {
        $errors['items'] = 'items must be a non-empty list of products.';
        return [];
    }
    if (count($rawItems) > MAX_ITEMS_PER_SALE) {
        $errors['items'] = 'A sale cannot have more than ' . MAX_ITEMS_PER_SALE . ' items.';
        return [];
    }
    $items = [];
    $seen = [];
    foreach ($rawItems as $index => $rawItem) {
        $key = 'items[' . $index . ']';
        if (!is_array($rawItem)) {
            $errors[$key] = 'Each item must be an object with inventory_id and quantity.';
            continue;
        }
        if (array_key_exists('unit_price', $rawItem) || array_key_exists('subtotal', $rawItem)) {
            $errors[$key] = 'Prices are taken from the product list. Do not send unit_price or subtotal.';
            continue;
        }
        $inventoryId = parse_positive_int($rawItem['inventory_id'] ?? null);
        $quantity = parse_positive_int($rawItem['quantity'] ?? null);
        $itemHasError = false;
        if ($inventoryId === null) {
            $errors[$key . '.inventory_id'] = 'inventory_id must be a positive whole number.';
            $itemHasError = true;
        }
        if ($quantity === null || $quantity > MAX_ITEM_QUANTITY) {
            $errors[$key . '.quantity'] = 'quantity must be a whole number from 1 to ' . MAX_ITEM_QUANTITY . '.';
            $itemHasError = true;
        }
        if ($itemHasError) {
            continue;
        }
        if (isset($seen[$inventoryId])) {
            $errors[$key . '.inventory_id'] = 'This product is already in the list. Combine the quantities into one item.';
            continue;
        }
        $seen[$inventoryId] = true;
        $items[] = ['inventory_id' => $inventoryId, 'quantity' => $quantity];
    }
    return $items;
}
/**
 * Shape one sale row into the JSON format sent to the app.
 */
function format_sale(array $row): array
{
    $totalCents = decimal_to_cents((string)$row['total_amount']);
    $paidCents = decimal_to_cents((string)$row['amount_paid']);
    return [
        'id' => (int)$row['id'],
        'sale_date' => $row['sale_date'],
        'status' => $row['status'],
        'payment_status' => $row['payment_status'],
        'total_amount' => cents_to_decimal($totalCents),
        'amount_paid' => cents_to_decimal($paidCents),
        'balance' => cents_to_decimal(max(0, $totalCents - $paidCents)),
        'item_count' => (int)$row['item_count'],
        'notes' => $row['notes'],
        'patient' => $row['patient_id'] !== null
            ? ['id' => (int)$row['patient_id'], 'full_name' => $row['patient_name']]
            : null,
        'processed_by' => $row['processed_by'] !== null
            ? ['id' => (int)$row['processed_by'], 'full_name' => $row['processed_by_name']]
            : null,
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ];
}
function format_sale_item(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'inventory_id' => (int)$row['inventory_id'],
        'product_name' => $row['product_name'],
        'sku' => $row['sku'],
        'quantity' => (int)$row['quantity'],
        'unit_price' => (string)$row['unit_price'],
        'subtotal' => (string)$row['subtotal'],
    ];
}
function format_payment(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'sale_id' => (int)$row['sale_id'],
        'amount' => (string)$row['amount'],
        'payment_method' => $row['payment_method'],
        'reference_number' => $row['reference_number'],
        'payment_date' => $row['payment_date'],
        'notes' => $row['notes'],
        'received_by' => $row['received_by'] !== null
            ? ['id' => (int)$row['received_by'], 'full_name' => $row['received_by_name']]
            : null,
        'created_at' => $row['created_at'],
    ];
}
/**
 * Load one sale row by id. Returns null if it does not exist.
 */
function fetch_sale(PDO $pdo, int $saleId): ?array
{
    $stmt = $pdo->prepare(SALE_SELECT . 'WHERE s.id = :id LIMIT 1');
    $stmt->execute(['id' => $saleId]);
    $row = $stmt->fetch();
    return $row ? $row : null;
}
/**
 * Load the payments of one sale, oldest first.
 */
function fetch_sale_payments(PDO $pdo, int $saleId): array
{
    $stmt = $pdo->prepare(PAYMENT_SELECT . 'WHERE p.sale_id = :sale_id ORDER BY p.payment_date ASC, p.id ASC');
    $stmt->execute(['sale_id' => $saleId]);
    $payments = [];
    foreach ($stmt->fetchAll() as $row) {
        $payments[] = format_payment($row);
    }
    return $payments;
}
/**
 * Load one sale with its items and payments. Returns null if it does not exist.
 */
function build_sale_detail(PDO $pdo, int $saleId): ?array
{
    $row = fetch_sale($pdo, $saleId);
    if ($row === null) {
        return null;
    }
    $stmt = $pdo->prepare(SALE_ITEM_SELECT . 'WHERE si.sale_id = :sale_id ORDER BY si.id ASC');
    $stmt->execute(['sale_id' => $saleId]);
    $items = [];
    foreach ($stmt->fetchAll() as $itemRow) {
        $items[] = format_sale_item($itemRow);
    }
    $sale = format_sale($row);
    $sale['items'] = $items;
    $sale['payments'] = fetch_sale_payments($pdo, $saleId);
    return $sale;
}
/**
 * Save one row in the stock movement history for a sale. Returns the new movement id.
 * reference_id is the sale id.
 */
function insert_sale_movement(
    PDO $pdo,
    int $productId,
    string $movementType,
    int $quantityChange,
    int $stockBefore,
    int $stockAfter,
    int $saleId,
    string $remarks,
    int $userId
): int {
    $stmt = $pdo->prepare(
        'INSERT INTO inventory_stock_movements
            (inventory_id, movement_type, quantity_change, stock_before, stock_after, reference_id, remarks, performed_by)
         VALUES
            (:inventory_id, :movement_type, :quantity_change, :stock_before, :stock_after, :reference_id, :remarks, :performed_by)'
    );
    $stmt->execute([
        'inventory_id' => $productId,
        'movement_type' => $movementType,
        'quantity_change' => $quantityChange,
        'stock_before' => $stockBefore,
        'stock_after' => $stockAfter,
        'reference_id' => $saleId,
        'remarks' => $remarks,
        'performed_by' => $userId,
    ]);
    return (int)$pdo->lastInsertId();
}
/**
 * Check if a payment reference number was already used with the same payment method.
 * A real GCash, Maya, or bank reference number should never be recorded twice.
 */
function payment_reference_exists(PDO $pdo, string $method, string $reference): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1 FROM payments WHERE payment_method = :method AND reference_number = :reference LIMIT 1'
    );
    $stmt->execute(['method' => $method, 'reference' => $reference]);
    return $stmt->fetchColumn() !== false;
}
/**
 * Save one payment row. Returns the new payment id.
 */
function insert_payment(PDO $pdo, int $saleId, array $payment, int $userId): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO payments (sale_id, amount, payment_method, reference_number, received_by, notes)
         VALUES (:sale_id, :amount, :payment_method, :reference_number, :received_by, :notes)'
    );
    $stmt->execute([
        'sale_id' => $saleId,
        'amount' => cents_to_decimal($payment['amount_cents']),
        'payment_method' => $payment['payment_method'],
        'reference_number' => $payment['reference_number'],
        'received_by' => $userId,
        'notes' => $payment['notes'],
    ]);
    return (int)$pdo->lastInsertId();
}
/**
 * Create a sale inside a transaction. Returns [HTTP status, JSON payload].
 * Product rows are locked in id order, so two sales cannot take the same stock.
 */
function create_sale(PDO $pdo, int $userId, ?int $patientId, ?string $notes, array $items, ?array $payment): array
{
    return run_in_transaction($pdo, function () use ($pdo, $userId, $patientId, $notes, $items, $payment) {
        if ($patientId !== null) {
            $stmt = $pdo->prepare('SELECT id FROM patients WHERE id = :id');
            $stmt->execute(['id' => $patientId]);
            if ($stmt->fetchColumn() === false) {
                return error_result(422, 'Validation failed.', ['errors' => ['patient_id' => 'Patient not found.']]);
            }
        }
        // Lock every product in the sale (in id order, to avoid deadlocks).
        $productIds = array_column($items, 'inventory_id');
        sort($productIds);
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $stmt = $pdo->prepare(
            'SELECT id, product_name, price, stock_quantity, status
             FROM inventory WHERE id IN (' . $placeholders . ') ORDER BY id FOR UPDATE'
        );
        $stmt->execute($productIds);
        $products = [];
        foreach ($stmt->fetchAll() as $row) {
            $products[(int)$row['id']] = $row;
        }
        // Check each item against the locked rows and calculate the total from database prices.
        $totalCents = 0;
        $lines = [];
        foreach ($items as $index => $item) {
            $product = $products[$item['inventory_id']] ?? null;
            if ($product === null) {
                return error_result(422, 'Validation failed.', ['errors' => [
                    'items[' . $index . '].inventory_id' => 'Product not found.',
                ]]);
            }
            if ($product['status'] !== 'Active') {
                return error_result(409, 'Product "' . $product['product_name'] . '" is inactive and cannot be sold.');
            }
            $available = (int)$product['stock_quantity'];
            // Exclude expired batch units even before the expiration job runs.
            $expiredStmt = $pdo->prepare('SELECT COALESCE(SUM(quantity_remaining), 0) FROM inventory_batches WHERE inventory_id = :id AND expiration_date < CURDATE()');
            $expiredStmt->execute(['id' => $item['inventory_id']]);
            $expiredQty = (int)$expiredStmt->fetchColumn();
            $availableForSale = max(0, $available - $expiredQty);
            if ($item['quantity'] > $availableForSale) {
                return error_result(
                    409,
                    'Not enough stock for "' . $product['product_name'] . '". Available: ' . $availableForSale
                        . ', requested: ' . $item['quantity'] . '.'
                );
            }
            $unitPriceCents = decimal_to_cents((string)$product['price']);
            $totalCents += $unitPriceCents * $item['quantity'];
            $lines[] = [
                'inventory_id' => $item['inventory_id'],
                'quantity' => $item['quantity'],
                'unit_price' => cents_to_decimal($unitPriceCents),
                'stock_before' => $available,
            ];
        }
        if ($totalCents > MAX_SALE_TOTAL_CENTS) {
            return error_result(422, 'Validation failed.', ['errors' => ['items' => 'The sale total is too large.']]);
        }
        // Check the optional first payment before anything is saved.
        $paidCents = 0;
        if ($payment !== null) {
            if ($payment['amount_cents'] > $totalCents) {
                return error_result(
                    409,
                    'Payment exceeds the sale total. Remaining balance: ' . cents_to_decimal($totalCents) . '.'
                );
            }
            if (
                $payment['reference_number'] !== null
                && payment_reference_exists($pdo, $payment['payment_method'], $payment['reference_number'])
            ) {
                return error_result(409, 'A payment with this reference number already exists.');
            }
            $paidCents = $payment['amount_cents'];
        }
        // Save the sale.
        $insert = $pdo->prepare(
            'INSERT INTO sales (patient_id, processed_by, total_amount, payment_status, status, notes)
             VALUES (:patient_id, :processed_by, :total_amount, :payment_status, :status, :notes)'
        );
        $insert->execute([
            'patient_id' => $patientId,
            'processed_by' => $userId,
            'total_amount' => cents_to_decimal($totalCents),
            'payment_status' => get_payment_status($totalCents, $paidCents),
            'status' => 'Completed',
            'notes' => $notes,
        ]);
        $saleId = (int)$pdo->lastInsertId();
        // Save the items, deduct the stock, and write one Sale movement per item.
        // The generated subtotal column is calculated by MySQL, so it is not inserted.
        $insertItem = $pdo->prepare(
            'INSERT INTO sale_items (sale_id, inventory_id, quantity, unit_price)
             VALUES (:sale_id, :inventory_id, :quantity, :unit_price)'
        );
        $updateStock = $pdo->prepare('UPDATE inventory SET stock_quantity = :stock_quantity WHERE id = :id');
        foreach ($lines as $line) {
            $insertItem->execute([
                'sale_id' => $saleId,
                'inventory_id' => $line['inventory_id'],
                'quantity' => $line['quantity'],
                'unit_price' => $line['unit_price'],
            ]);
            $saleItemId = (int)$pdo->lastInsertId();
            // FEFO: consume earliest-expiring valid batches first.
            // Unbatched legacy inventory may cover the remaining quantity.
            $remainingToAllocate = $line['quantity'];
            $batchStmt = $pdo->prepare(
                'SELECT id, quantity_remaining FROM inventory_batches
                 WHERE inventory_id = :id AND quantity_remaining > 0
                   AND (expiration_date IS NULL OR expiration_date >= CURDATE())
                 ORDER BY (expiration_date IS NULL) ASC, expiration_date ASC, date_received ASC, id ASC FOR UPDATE'
            );
            $batchStmt->execute(['id' => $line['inventory_id']]);
            $batchRows = $batchStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($batchRows as $batchRow) {
                if ($remainingToAllocate === 0) break;
                $take = min($remainingToAllocate, (int)$batchRow['quantity_remaining']);
                $updateBatch = $pdo->prepare('UPDATE inventory_batches SET quantity_remaining = quantity_remaining - :qty WHERE id = :id');
                $updateBatch->execute(['qty' => $take, 'id' => $batchRow['id']]);
                $alloc = $pdo->prepare('INSERT INTO sale_item_batch_allocations (sale_item_id, batch_id, quantity) VALUES (:item, :batch, :qty)');
                $alloc->execute(['item' => $saleItemId, 'batch' => $batchRow['id'], 'qty' => $take]);
                $remainingToAllocate -= $take;
            }
            // Do not silently treat expired or inconsistent batch quantities as legacy stock.
            $allBatchStmt = $pdo->prepare('SELECT COALESCE(SUM(quantity_remaining),0) FROM inventory_batches WHERE inventory_id = :id');
            $allBatchStmt->execute(['id' => $line['inventory_id']]);
            $batchRemaining = (int)$allBatchStmt->fetchColumn();
            $legacyAvailable = $line['stock_before'] - ($line['quantity'] - $remainingToAllocate) - $batchRemaining;
            if ($remainingToAllocate > max(0, $legacyAvailable)) {
                throw new RuntimeException('Batch inventory reconciliation failed; sale rolled back.');
            }

            $stockAfter = $line['stock_before'] - $line['quantity'];
            $updateStock->execute(['stock_quantity' => $stockAfter, 'id' => $line['inventory_id']]);
            insert_sale_movement(
                $pdo,
                $line['inventory_id'],
                'Sale',
                -$line['quantity'],
                $line['stock_before'],
                $stockAfter,
                $saleId,
                'Sale #' . $saleId,
                $userId
            );
        }
        if ($payment !== null) {
            insert_payment($pdo, $saleId, $payment, $userId);
        }
        return [201, [
            'success' => true,
            'message' => 'Sale created.',
            'data' => build_sale_detail($pdo, $saleId),
        ]];
    });
}
/**
 * Add a payment to a sale inside a transaction. Returns [HTTP status, JSON payload].
 * The sale row is locked, so two payments cannot together go over the sale total.
 */
function add_sale_payment(PDO $pdo, int $saleId, array $payment, int $userId): array
{
    return run_in_transaction($pdo, function () use ($pdo, $saleId, $payment, $userId) {
        $stmt = $pdo->prepare('SELECT id, total_amount, status FROM sales WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $saleId]);
        $sale = $stmt->fetch();
        if (!$sale) {
            return error_result(404, 'Sale not found.');
        }
        if ($sale['status'] !== 'Completed') {
            return error_result(409, 'Payments cannot be added to a cancelled sale.');
        }
        $paidStmt = $pdo->prepare('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE sale_id = :sale_id');
        $paidStmt->execute(['sale_id' => $saleId]);
        $totalCents = decimal_to_cents((string)$sale['total_amount']);
        $paidCents = decimal_to_cents((string)$paidStmt->fetchColumn());
        $balanceCents = $totalCents - $paidCents;
        if ($balanceCents <= 0) {
            return error_result(409, 'This sale is already fully paid.');
        }
        if ($payment['amount_cents'] > $balanceCents) {
            return error_result(
                409,
                'Payment exceeds the remaining balance. Remaining balance: ' . cents_to_decimal($balanceCents) . '.'
            );
        }
        if (
            $payment['reference_number'] !== null
            && payment_reference_exists($pdo, $payment['payment_method'], $payment['reference_number'])
        ) {
            return error_result(409, 'A payment with this reference number already exists.');
        }
        $paymentId = insert_payment($pdo, $saleId, $payment, $userId);
        $newStatus = get_payment_status($totalCents, $paidCents + $payment['amount_cents']);
        $update = $pdo->prepare('UPDATE sales SET payment_status = :payment_status WHERE id = :id');
        $update->execute(['payment_status' => $newStatus, 'id' => $saleId]);
        $paymentRow = $pdo->prepare(PAYMENT_SELECT . 'WHERE p.id = :id LIMIT 1');
        $paymentRow->execute(['id' => $paymentId]);
        return [201, [
            'success' => true,
            'message' => 'Payment recorded.',
            'data' => [
                'sale' => build_sale_detail($pdo, $saleId),
                'payment' => format_payment((array)$paymentRow->fetch()),
            ],
        ]];
    });
}
/**
 * Cancel a sale inside a transaction and put the stock back. Returns [HTTP status, JSON payload].
 * Nothing is deleted: the sale stays as Cancelled and a Return movement is written per product.
 */
function cancel_sale(PDO $pdo, int $saleId, string $reason, int $userId): array
{
    return run_in_transaction($pdo, function () use ($pdo, $saleId, $reason, $userId) {
        // Lock the sale first. add_payment locks the same row, so a payment cannot slip in.
        $stmt = $pdo->prepare('SELECT id, status, notes FROM sales WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $saleId]);
        $sale = $stmt->fetch();
        if (!$sale) {
            return error_result(404, 'Sale not found.');
        }
        if ($sale['status'] === 'Cancelled') {
            return error_result(409, 'This sale is already cancelled.');
        }
        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM payments WHERE sale_id = :sale_id');
        $countStmt->execute(['sale_id' => $saleId]);
        if ((int)$countStmt->fetchColumn() > 0) {
            return error_result(409, 'A sale with recorded payments cannot be cancelled. There is no refund workflow.');
        }
        // Keep the existing notes and add the reason, within the 255 character column limit.
        $existingNotes = $sale['notes'] !== null ? trim((string)$sale['notes']) : '';
        $prefix = $existingNotes !== '' ? $existingNotes . ' | Cancelled: ' : 'Cancelled: ';
        $maxReasonLength = MAX_NOTES_LENGTH - mb_strlen($prefix);
        if ($maxReasonLength < 1) {
            return error_result(422, 'Validation failed.', ['errors' => [
                'reason' => 'The existing notes of this sale are too long to add a cancellation reason.',
            ]]);
        }
        if (mb_strlen($reason) > $maxReasonLength) {
            return error_result(422, 'Validation failed.', ['errors' => [
                'reason' => 'reason cannot be longer than ' . $maxReasonLength . ' characters for this sale.',
            ]]);
        }
        // Total quantity per product, in id order.
        $itemStmt = $pdo->prepare(
            'SELECT inventory_id, SUM(quantity) AS total_quantity
             FROM sale_items WHERE sale_id = :sale_id
             GROUP BY inventory_id ORDER BY inventory_id'
        );
        $itemStmt->execute(['sale_id' => $saleId]);
        $lockStmt = $pdo->prepare('SELECT stock_quantity FROM inventory WHERE id = :id FOR UPDATE');
        $updateStock = $pdo->prepare('UPDATE inventory SET stock_quantity = :stock_quantity WHERE id = :id');
        foreach ($itemStmt->fetchAll() as $item) {
            $productId = (int)$item['inventory_id'];
            $quantity = (int)$item['total_quantity'];
            // Stock is restored even if the product is inactive now, so the history stays correct.
            $lockStmt->execute(['id' => $productId]);
            $stockBefore = (int)$lockStmt->fetchColumn();
            // Restore only nonexpired allocated batches. Expired units stay unusable.
            $allocStmt = $pdo->prepare(
                'SELECT a.batch_id, a.quantity, b.expiration_date
                 FROM sale_item_batch_allocations a
                 INNER JOIN sale_items si ON si.id = a.sale_item_id
                 INNER JOIN inventory_batches b ON b.id = a.batch_id
                 WHERE si.sale_id = :sale AND si.inventory_id = :product
                 ORDER BY b.id FOR UPDATE'
            );
            $allocStmt->execute(['sale' => $saleId, 'product' => $productId]);
            $allocated = 0;
            $restorable = 0;
            $today = date('Y-m-d');
            foreach ($allocStmt->fetchAll(PDO::FETCH_ASSOC) as $a) {
                $q = (int)$a['quantity'];
                $allocated += $q;
                if ($a['expiration_date'] !== null && $a['expiration_date'] < $today) continue;
                $restore = $pdo->prepare('UPDATE inventory_batches SET quantity_remaining = quantity_remaining + :qty WHERE id = :id');
                $restore->execute(['qty' => $q, 'id' => $a['batch_id']]);
                $restorable += $q;
            }
            // Unallocated items were sold from legacy (non-batch) stock.
            $restorable += $quantity - $allocated;
            $stockAfter = $stockBefore + $restorable;

            $updateStock->execute(['stock_quantity' => $stockAfter, 'id' => $productId]);
            insert_sale_movement(
                $pdo,
                $productId,
                'Return',
                $restorable,
                $stockBefore,
                $stockAfter,
                $saleId,
                'Return from cancelled sale #' . $saleId . ' (expired units not restocked)',
                $userId
            );
        }
        $update = $pdo->prepare('UPDATE sales SET status = :status, notes = :notes WHERE id = :id');
        $update->execute(['status' => 'Cancelled', 'notes' => $prefix . $reason, 'id' => $saleId]);
        return [200, [
            'success' => true,
            'message' => 'Sale cancelled and stock restored.',
            'data' => build_sale_detail($pdo, $saleId),
        ]];
    });
}
// ---------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------
/**
 * POST sales.php?action=create
 * Create a completed sale and deduct the stock. Staff and owner only.
 * Body: { "patient_id": 1 (optional), "notes": "..." (optional),
 *         "items": [ { "inventory_id": 5, "quantity": 2 } ],
 *         "payment": { "payment_method": "Cash", "amount": 500, "reference_number": "...", "notes": "..." } (optional) }
 */
function handle_create_sale(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, STAFF_ROLES);
    $input = read_json_body();
    $errors = [];
    foreach (CREATE_BLOCKED_FIELDS as $field => $message) {
        if (array_key_exists($field, $input)) {
            $errors[$field] = $message;
        }
    }
    $patientId = null;
    if (array_key_exists('patient_id', $input) && $input['patient_id'] !== null) {
        $patientId = parse_positive_int($input['patient_id']);
        if ($patientId === null) {
            $errors['patient_id'] = 'patient_id must be a positive whole number or null.';
        }
    }
    [, $notes, $notesError] = read_optional_text($input, 'notes', MAX_SALE_NOTES_LENGTH);
    if ($notesError !== null) {
        $errors['notes'] = $notesError;
    }
    $items = read_sale_items($input['items'] ?? null, $errors);
    $payment = null;
    if (array_key_exists('payment', $input) && $input['payment'] !== null) {
        if (!is_array($input['payment']) || array_is_list($input['payment'])) {
            $errors['payment'] = 'payment must be an object.';
        } else {
            $payment = read_payment_fields($input['payment'], 'payment.', $errors);
        }
    }
    if ($errors) {
        respond_validation_error($errors);
    }
    [$status, $payload] = create_sale($pdo, $user['id'], $patientId, $notes, $items, $payment);
    respond($status, $payload);
}
/**
 * GET sales.php?action=list[&status=...][&payment_status=...][&patient_id=...]
 *     [&date_from=YYYY-MM-DD][&date_to=YYYY-MM-DD][&page=1][&limit=50]
 * Sales list, newest first. Staff and owner only.
 */
function handle_list_sales(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);
    $errors = [];
    $conditions = [];
    $params = [];
    $status = get_query_string('status');
    if ($status !== '') {
        if (!in_array($status, SALE_STATUSES, true)) {
            $errors['status'] = 'status must be one of: ' . implode(', ', SALE_STATUSES) . '.';
        } else {
            $conditions[] = 's.status = :status';
            $params['status'] = $status;
        }
    }
    $paymentStatus = get_query_string('payment_status');
    if ($paymentStatus !== '') {
        if (!in_array($paymentStatus, PAYMENT_STATUSES, true)) {
            $errors['payment_status'] = 'payment_status must be one of: ' . implode(', ', PAYMENT_STATUSES) . '.';
        } else {
            $conditions[] = 's.payment_status = :payment_status';
            $params['payment_status'] = $paymentStatus;
        }
    }
    $patientIdText = get_query_string('patient_id');
    if ($patientIdText !== '') {
        $patientId = parse_positive_int($patientIdText);
        if ($patientId === null) {
            $errors['patient_id'] = 'patient_id must be a positive whole number.';
        } else {
            $conditions[] = 's.patient_id = :patient_id';
            $params['patient_id'] = $patientId;
        }
    }
    $dateFrom = get_query_string('date_from');
    $dateTo = get_query_string('date_to');
    $fromDate = null;
    $toDate = null;
    if ($dateFrom !== '') {
        $fromDate = DateTimeImmutable::createFromFormat('!Y-m-d', $dateFrom);
        if ($fromDate === false || $fromDate->format('Y-m-d') !== $dateFrom) {
            $errors['date_from'] = 'date_from must be a valid date in YYYY-MM-DD format.';
            $fromDate = null;
        }
    }
    if ($dateTo !== '') {
        $toDate = DateTimeImmutable::createFromFormat('!Y-m-d', $dateTo);
        if ($toDate === false || $toDate->format('Y-m-d') !== $dateTo) {
            $errors['date_to'] = 'date_to must be a valid date in YYYY-MM-DD format.';
            $toDate = null;
        }
    }
    if ($fromDate !== null && $toDate !== null && $fromDate > $toDate) {
        $errors['date_to'] = 'date_to cannot be earlier than date_from.';
    }
    if ($fromDate !== null && !isset($errors['date_from'])) {
        $conditions[] = 's.sale_date >= :date_from';
        $params['date_from'] = $fromDate->format('Y-m-d') . ' 00:00:00';
    }
    if ($toDate !== null && !isset($errors['date_to'])) {
        // Include the whole last day: everything before the start of the next day.
        $conditions[] = 's.sale_date < :date_to_next';
        $params['date_to_next'] = $toDate->modify('+1 day')->format('Y-m-d') . ' 00:00:00';
    }
    [$limit, $page] = read_pagination($errors);
    if ($errors) {
        respond_validation_error($errors);
    }
    $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) . ' ' : '';
    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM sales s ' . $where);
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();
    // limit and offset are validated integers, so they are safe to write into the SQL.
    $offset = ($page - 1) * $limit;
    $stmt = $pdo->prepare(
        SALE_SELECT . $where . 'ORDER BY s.sale_date DESC, s.id DESC LIMIT ' . $limit . ' OFFSET ' . $offset
    );
    $stmt->execute($params);
    $sales = [];
    foreach ($stmt->fetchAll() as $row) {
        $sales[] = format_sale($row);
    }
    respond(200, [
        'success' => true,
        'data' => [
            'sales' => $sales,
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
 * GET sales.php?action=get&id=5
 * One sale with its items and payment history. Staff and owner only.
 */
function handle_get_sale(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);
    $saleId = get_sale_id_from_query();
    $sale = build_sale_detail($pdo, $saleId);
    if ($sale === null) {
        respond_error(404, 'Sale not found.');
    }
    respond(200, ['success' => true, 'data' => $sale]);
}
/**
 * POST sales.php?action=add_payment&id=5
 * Record a payment for a sale. Staff and owner only.
 * Body: { "payment_method": "Cash", "amount": 500, "reference_number": "...", "notes": "..." }
 */
function handle_add_payment(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, STAFF_ROLES);
    $saleId = get_sale_id_from_query();
    $input = read_json_body();
    $errors = [];
    $payment = read_payment_fields($input, '', $errors);
    if ($errors || $payment === null) {
        respond_validation_error($errors);
    }
    [$status, $payload] = add_sale_payment($pdo, $saleId, $payment, $user['id']);
    respond($status, $payload);
}
/**
 * GET sales.php?action=payments&id=5
 * Payment history and balance of one sale. Staff and owner only.
 */
function handle_sale_payments(): void
{
    $pdo = get_db_connection();
    require_auth($pdo, STAFF_ROLES);
    $saleId = get_sale_id_from_query();
    $row = fetch_sale($pdo, $saleId);
    if ($row === null) {
        respond_error(404, 'Sale not found.');
    }
    $sale = format_sale($row);
    respond(200, [
        'success' => true,
        'data' => [
            'sale' => [
                'id' => $sale['id'],
                'status' => $sale['status'],
                'payment_status' => $sale['payment_status'],
                'total_amount' => $sale['total_amount'],
                'amount_paid' => $sale['amount_paid'],
                'balance' => $sale['balance'],
            ],
            'payments' => fetch_sale_payments($pdo, $saleId),
        ],
    ]);
}
/**
 * PUT sales.php?action=cancel&id=5
 * Cancel a sale that has no payments and restore the stock. Staff and owner only.
 * Body: { "reason": "..." } (required)
 */
function handle_cancel_sale(): void
{
    $pdo = get_db_connection();
    $user = require_auth($pdo, STAFF_ROLES);
    $saleId = get_sale_id_from_query();
    $input = read_json_body();
    // The reason is required. The pattern also catches non-breaking and invisible characters.
    $reason = get_trimmed_string($input, 'reason');
    if ($reason === '' || preg_match('/^[\p{Z}\p{C}\s]*$/u', $reason) === 1) {
        respond_validation_error(['reason' => 'A cancellation reason is required.']);
    }
    [$status, $payload] = cancel_sale($pdo, $saleId, $reason, $user['id']);
    respond($status, $payload);
}
// ROUTER
// sales.php?action=create | list | get | add_payment | payments | cancel
try {
    $action = (isset($_GET['action']) && is_string($_GET['action'])) ? $_GET['action'] : '';
    switch ($action) {
        case 'create':
            require_http_method(['POST']);
            handle_create_sale();
            break;
        case 'list':
            require_http_method(['GET']);
            handle_list_sales();
            break;
        case 'get':
            require_http_method(['GET']);
            handle_get_sale();
            break;
        case 'add_payment':
            require_http_method(['POST']);
            handle_add_payment();
            break;
        case 'payments':
            require_http_method(['GET']);
            handle_sale_payments();
            break;
        case 'cancel':
            require_http_method(['PUT']);
            handle_cancel_sale();
            break;
        default:
            respond_error(404, 'Unknown action.');
    }
} catch (Throwable $e) {
    respond_server_error($e, 'Sales API');
}
