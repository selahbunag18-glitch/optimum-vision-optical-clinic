<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/*
 * Optimum Vision Optical Clinic
 * Expired Inventory Processing
 *
 * POST ?action=process
 *
 * Owner and Staff only.
 *
 * Uses database transactions and row locks.
 * Each batch can only be processed once.
 */

function process_expired_inventory(PDO $pdo): array
{
    $processed = [];
    $totalExpired = 0;

    // Get products that have expired, unprocessed batches.
    $stmt = $pdo->query("
        SELECT DISTINCT b.inventory_id
        FROM inventory_batches b
        LEFT JOIN inventory_expired_records er
            ON er.batch_id = b.id
        WHERE b.expiration_date < CURDATE()
          AND b.quantity_remaining > 0
          AND er.id IS NULL
        ORDER BY b.inventory_id ASC
    ");

    $productIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    foreach ($productIds as $productIdValue) {
        $productId = (int)$productIdValue;

        $pdo->beginTransaction();

        try {
            // Lock product first, consistent with Stock In.
            $productStmt = $pdo->prepare("
                SELECT id, product_name, stock_quantity
                FROM inventory
                WHERE id = ?
                FOR UPDATE
            ");

            $productStmt->execute([$productId]);
            $product = $productStmt->fetch(PDO::FETCH_ASSOC);

            if (!$product) {
                throw new RuntimeException(
                    'Inventory product not found: ' . $productId
                );
            }

            // Lock expired batches belonging to this product.
            $batchStmt = $pdo->prepare("
                SELECT
                    b.id,
                    b.batch_number,
                    b.quantity_remaining,
                    b.expiration_date
                FROM inventory_batches b
                WHERE b.inventory_id = ?
                  AND b.expiration_date < CURDATE()
                  AND b.quantity_remaining > 0
                  AND NOT EXISTS (
                      SELECT 1
                      FROM inventory_expired_records er
                      WHERE er.batch_id = b.id
                  )
                ORDER BY b.expiration_date ASC, b.id ASC
                FOR UPDATE
            ");

            $batchStmt->execute([$productId]);
            $batches = $batchStmt->fetchAll(PDO::FETCH_ASSOC);

            if (!$batches) {
                $pdo->commit();
                continue;
            }

            $stockBefore = (int)$product['stock_quantity'];

            $expiredQuantity = array_sum(
                array_map(
                    static fn(array $batch): int =>
                    (int)$batch['quantity_remaining'],
                    $batches
                )
            );

            // Stop rather than silently corrupt stock totals.
            if ($expiredQuantity > $stockBefore) {
                throw new RuntimeException(
                    'Stock mismatch for product ID ' . $productId .
                        '. Expired quantity exceeds inventory stock.'
                );
            }

            $stockAfter = $stockBefore - $expiredQuantity;

            $insertExpired = $pdo->prepare("
                INSERT INTO inventory_expired_records (
                    batch_id,
                    inventory_id,
                    expired_quantity,
                    expiration_date
                ) VALUES (?, ?, ?, ?)
            ");

            $zeroBatch = $pdo->prepare("
                UPDATE inventory_batches
                SET quantity_remaining = 0
                WHERE id = ?
            ");

            foreach ($batches as $batch) {
                $batchId = (int)$batch['id'];
                $quantity = (int)$batch['quantity_remaining'];

                $insertExpired->execute([
                    $batchId,
                    $productId,
                    $quantity,
                    $batch['expiration_date']
                ]);

                $zeroBatch->execute([$batchId]);

                $processed[] = [
                    'batch_id' => $batchId,
                    'inventory_id' => $productId,
                    'product_name' => $product['product_name'],
                    'batch_number' => $batch['batch_number'],
                    'expired_quantity' => $quantity
                ];
            }

            // Deduct total expired quantity.
            $updateInventory = $pdo->prepare("
                UPDATE inventory
                SET stock_quantity = ?
                WHERE id = ?
            ");

            $updateInventory->execute([
                $stockAfter,
                $productId
            ]);

            // Record expiration movement.
            $movement = $pdo->prepare("
                INSERT INTO inventory_stock_movements (
                    inventory_id,
                    movement_type,
                    quantity_change,
                    stock_before,
                    stock_after,
                    remarks,
                    performed_by
                ) VALUES (?, 'Expired', ?, ?, ?, ?, NULL)
            ");

            $movement->execute([
                $productId,
                -$expiredQuantity,
                $stockBefore,
                $stockAfter,
                'Automatic expired stock deduction'
            ]);

            $pdo->commit();
            $totalExpired += $expiredQuantity;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            throw $e;
        }
    }

    return [
        'processed_batches' => count($processed),
        'total_expired_quantity' => $totalExpired,
        'batches' => $processed
    ];
}

try {
    require_http_method(['POST']);

    $pdo = get_db_connection();

    // Only authenticated Owner / Staff.
    require_auth($pdo, STAFF_ROLES);

    $action = (string)($_GET['action'] ?? '');

    if ($action !== 'process') {
        respond_error(404, 'Unknown expiration action.');
    }

    $result = process_expired_inventory($pdo);

    respond(200, [
        'success' => true,
        'message' => 'Expiration processing completed.',
        'data' => $result
    ]);
} catch (Throwable $e) {
    respond_server_error($e, 'Inventory Expiration API');
}
