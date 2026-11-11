<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
/*
 * Optimum Vision Optical Clinic
 * Product Inventory API
 *
 * GET  ?action=list
 * GET  ?action=get&id=1
 * POST ?action=create
 * PUT  ?action=update&id=1
 * PUT  ?action=activate&id=1
 * PUT  ?action=deactivate&id=1
 * POST ?action=stock&id=1
 * GET  ?action=low_stock
 * GET  ?action=movements
 */

function inventory_json(): array
{
    $data = json_decode(
        file_get_contents('php://input') ?: '{}',
        true
    );

    if (!is_array($data)) {
        respond_error(400, 'Invalid JSON body.');
    }

    return $data;
}

function inventory_id(): int
{
    $id = filter_input(
        INPUT_GET,
        'id',
        FILTER_VALIDATE_INT
    );

    if (!$id || $id < 1) {
        respond_error(400, 'Invalid product ID.');
    }

    return $id;
}

function inventory_pagination(): array
{
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));

    return [
        $page,
        $limit,
        ($page - 1) * $limit
    ];
}

function inventory_availability_sql(): string
{
    return "
        CASE
            WHEN stock_quantity <= 0
                THEN 'Out of Stock'
            WHEN stock_quantity <= low_stock_threshold
                THEN 'Low Stock'
            ELSE 'In Stock'
        END
    ";
}

function inventory_product(
    PDO $pdo,
    int $id
): array {
    $availability = inventory_availability_sql();

    $stmt = $pdo->prepare("
        SELECT
            *,
            $availability AS availability
        FROM inventory
        WHERE id = ?
        LIMIT 1
    ");

    $stmt->execute([$id]);

    $product = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$product) {
        respond_error(404, 'Product not found.');
    }

    $product['id'] = (int)$product['id'];
    $product['stock_quantity'] =
        (int)$product['stock_quantity'];
    $product['low_stock_threshold'] =
        (int)$product['low_stock_threshold'];

    return $product;
}

function inventory_list(
    PDO $pdo,
    bool $lowStock = false
): void {
    [$page, $limit, $offset] = inventory_pagination();

    $conditions = [];
    $params = [];

    $search = trim((string)($_GET['search'] ?? ''));
    $category = trim((string)($_GET['category'] ?? ''));
    $status = trim((string)($_GET['status'] ?? ''));

    if ($search !== '') {
        $conditions[] = "
            (product_name LIKE ?
             OR brand LIKE ?
             OR sku LIKE ?)
        ";

        $term = "%$search%";

        array_push($params, $term, $term, $term);
    }

    if ($category !== '') {
        $conditions[] = 'category = ?';
        $params[] = $category;
    }

    if ($status !== '') {
        $conditions[] = 'status = ?';
        $params[] = $status;
    }

    if ($lowStock) {
        $conditions[] =
            'stock_quantity <= low_stock_threshold';
        $conditions[] = "status = 'Active'";
    }

    $where = $conditions
        ? 'WHERE ' . implode(' AND ', $conditions)
        : '';

    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM inventory
        $where
    ");

    $countStmt->execute($params);

    $total = (int)$countStmt->fetchColumn();

    $availability = inventory_availability_sql();

    $sql = "
        SELECT
            id,
            product_name,
            category,
            brand,
            description,
            sku,
            price,
            stock_quantity,
            low_stock_threshold,
            status,
            created_at,
            updated_at,
            $availability AS availability
        FROM inventory
        $where
        ORDER BY created_at DESC, id DESC
        LIMIT $limit OFFSET $offset
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $products = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($products as &$product) {
        $product['id'] = (int)$product['id'];
        $product['stock_quantity'] =
            (int)$product['stock_quantity'];
        $product['low_stock_threshold'] =
            (int)$product['low_stock_threshold'];
    }

    unset($product);

    respond(200, [
        'success' => true,
        'data' => [
            'products' => $products,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'total_pages' => (int)ceil(
                    $total / $limit
                )
            ]
        ]
    ]);
}

function inventory_validate_product(
    array $data
): array {
    $categories = [
        'Eyeglass Frames',
        'Contact Lenses',
        'Eyedrops',
        'Lenses',
        'Accessories',
        'Others'
    ];

    $name = trim((string)($data['product_name'] ?? ''));
    $category = (string)($data['category'] ?? '');
    $price = $data['price'] ?? null;

    if ($name === '' || strlen($name) > 150) {
        respond_error(400, 'Invalid product name.');
    }

    if (!in_array($category, $categories, true)) {
        respond_error(400, 'Invalid category.');
    }

    if (
        !is_numeric($price) ||
        !is_finite((float)$price) ||
        (float)$price < 0 ||
        (float)$price > 99999999.99
    ) {
        respond_error(400, 'Invalid price.');
    }

    $threshold = $data['low_stock_threshold'] ?? 5;

    if (
        filter_var(
            $threshold,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        ) === false
    ) {
        respond_error(400, 'Invalid low stock threshold.');
    }

    $brand = trim((string)($data['brand'] ?? ''));
    $sku = trim((string)($data['sku'] ?? ''));
    $description = trim(
        (string)($data['description'] ?? '')
    );

    if (strlen($brand) > 100 || strlen($sku) > 50) {
        respond_error(400, 'Brand or SKU is too long.');
    }

    return [
        'product_name' => $name,
        'category' => $category,
        'brand' => $brand !== '' ? $brand : null,
        'description' => $description !== ''
            ? $description
            : null,
        'sku' => $sku !== '' ? $sku : null,
        'price' => (float)$price,
        'low_stock_threshold' => (int)$threshold
    ];
}

function inventory_create(PDO $pdo): void
{
    $data = inventory_json();
    $product = inventory_validate_product($data);

    $initialStock = $data['initial_stock'] ?? 0;

    if (
        filter_var(
            $initialStock,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        ) === false
    ) {
        respond_error(400, 'Invalid initial stock.');
    }

    $stmt = $pdo->prepare("
        INSERT INTO inventory (
            product_name,
            category,
            brand,
            description,
            sku,
            price,
            stock_quantity,
            low_stock_threshold,
            status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    ");

    $stmt->execute([
        $product['product_name'],
        $product['category'],
        $product['brand'],
        $product['description'],
        $product['sku'],
        $product['price'],
        (int)$initialStock,
        $product['low_stock_threshold']
    ]);

    $id = (int)$pdo->lastInsertId();

    respond(201, [
        'success' => true,
        'message' => 'Product created successfully.',
        'data' => inventory_product($pdo, $id)
    ]);
}

function inventory_update(
    PDO $pdo,
    int $id
): void {
    $existing = inventory_product($pdo, $id);
    $data = inventory_json();

    $merged = array_merge($existing, $data);
    $product = inventory_validate_product($merged);

    $stmt = $pdo->prepare("
        UPDATE inventory
        SET
            product_name = ?,
            category = ?,
            brand = ?,
            description = ?,
            sku = ?,
            price = ?,
            low_stock_threshold = ?
        WHERE id = ?
    ");

    $stmt->execute([
        $product['product_name'],
        $product['category'],
        $product['brand'],
        $product['description'],
        $product['sku'],
        $product['price'],
        $product['low_stock_threshold'],
        $id
    ]);

    respond(200, [
        'success' => true,
        'message' => 'Product updated successfully.',
        'data' => inventory_product($pdo, $id)
    ]);
}

function inventory_status(
    PDO $pdo,
    int $id,
    string $status
): void {
    inventory_product($pdo, $id);

    $stmt = $pdo->prepare("
        UPDATE inventory
        SET status = ?
        WHERE id = ?
    ");

    $stmt->execute([$status, $id]);

    respond(200, [
        'success' => true,
        'message' => 'Product status updated.',
        'data' => inventory_product($pdo, $id)
    ]);
}

// =====================================
// MAIN ROUTER
// =====================================

try {
    $pdo = get_db_connection();

    $action = (string)($_GET['action'] ?? '');

    switch ($action) {

        case 'list':
            require_http_method(['GET']);
            require_auth($pdo, STAFF_ROLES);
            inventory_list($pdo);
            break;

        case 'get':
            require_http_method(['GET']);
            require_auth($pdo, STAFF_ROLES);

            respond(200, [
                'success' => true,
                'data' => inventory_product(
                    $pdo,
                    inventory_id()
                )
            ]);
            break;

        case 'create':
            require_http_method(['POST']);
            require_auth($pdo, STAFF_ROLES);
            inventory_create($pdo);
            break;

        case 'update':
            require_http_method(['PUT']);
            require_auth($pdo, STAFF_ROLES);
            inventory_update($pdo, inventory_id());
            break;

        case 'activate':
            require_http_method(['PUT']);
            require_auth($pdo, STAFF_ROLES);
            inventory_status(
                $pdo,
                inventory_id(),
                'Active'
            );
            break;

        case 'deactivate':
            require_http_method(['PUT']);
            require_auth($pdo, STAFF_ROLES);
            inventory_status(
                $pdo,
                inventory_id(),
                'Inactive'
            );
            break;

        case 'low_stock':
            require_http_method(['GET']);
            require_auth($pdo, STAFF_ROLES);
            inventory_list($pdo, true);
            break;

        case 'stock':
        case 'movements':
            respond_error(
                501,
                'Stock adjustment and movement history require the original inventory implementation.'
            );
            break;

        default:
            respond_error(
                404,
                'Unknown inventory action.'
            );
    }
} catch (Throwable $e) {
    respond_server_error(
        $e,
        'Inventory API'
    );
}
