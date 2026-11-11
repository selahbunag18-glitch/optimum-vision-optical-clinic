<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

try {
    require_http_method(['GET']);

    $pdo = get_db_connection();

    // Reports are restricted to the clinic owner.
    require_auth($pdo, ['owner']);

    $period = $_GET['period'] ?? 'month';

    if (
        !is_string($period) ||
        !in_array($period, ['day', 'month', 'year', 'custom'], true)
    ) {
        respond_error(422, 'Invalid reporting period.');
    }

    $today = new DateTimeImmutable('today');

    switch ($period) {
        case 'day':
            $start = $today;
            $end = $today;
            break;

        case 'year':
            $start = $today->modify('first day of January');
            $end = $today->modify('last day of December');
            break;

        case 'custom':
            $from = $_GET['start_date'] ?? '';
            $to = $_GET['end_date'] ?? '';

            if (!is_string($from) || !is_string($to)) {
                respond_error(422, 'Invalid date values.');
            }

            $start = DateTimeImmutable::createFromFormat(
                '!Y-m-d',
                $from
            );
            $end = DateTimeImmutable::createFromFormat(
                '!Y-m-d',
                $to
            );

            if (
                !$start || !$end ||
                $start->format('Y-m-d') !== $from ||
                $end->format('Y-m-d') !== $to ||
                $start > $end
            ) {
                respond_error(422, 'Invalid date range.');
            }

            if ($start->diff($end)->days > 366) {
                respond_error(
                    422,
                    'Custom date range cannot exceed 366 days.'
                );
            }
            break;

        default:
            $start = $today->modify('first day of this month');
            $end = $today->modify('last day of this month');
    }

    $startDate = $start->format('Y-m-d');
    $endDate = $end->format('Y-m-d');

    // Half-open range includes the complete last day.
    $fromDateTime = $startDate . ' 00:00:00';
    $toDateTime = $end->modify('+1 day')
        ->format('Y-m-d') . ' 00:00:00';

    $saleParams = [
        ':start_date' => $fromDateTime,
        ':end_date' => $toDateTime
    ];

    // Completed sales only, no duplicated totals from joins.
    $summarySql = "
        SELECT
            COUNT(*) AS total_transactions,
            COALESCE(SUM(total_amount), 0) AS total_sales
        FROM sales
        WHERE status = 'Completed'
          AND sale_date >= :start_date
          AND sale_date < :end_date
    ";

    $stmt = $pdo->prepare($summarySql);
    $stmt->execute($saleParams);
    $summary = $stmt->fetch(PDO::FETCH_ASSOC);

    // Collections are grouped by payment date, not sale date.
    $collectionsSql = "
        SELECT
            COALESCE(SUM(p.amount), 0) AS total_collections,
            COUNT(*) AS payment_count
        FROM payments p
        INNER JOIN sales s ON s.id = p.sale_id
        WHERE s.status = 'Completed'
          AND p.payment_date >= :start_date
          AND p.payment_date < :end_date
    ";

    $stmt = $pdo->prepare($collectionsSql);
    $stmt->execute($saleParams);
    $collections = $stmt->fetch(PDO::FETCH_ASSOC);

    // Outstanding balance as of now for sales in the period.
    $balanceSql = "
        SELECT
            COALESCE(SUM(
                GREATEST(
                    s.total_amount -
                    COALESCE(
                        (
                            SELECT SUM(p.amount)
                            FROM payments p
                            WHERE p.sale_id = s.id
                        ), 0
                    ),
                    0
                )
            ), 0) AS outstanding_balance,
            SUM(
                CASE
                    WHEN s.payment_status = 'Unpaid' THEN 1
                    ELSE 0
                END
            ) AS unpaid_sales,
            SUM(
                CASE
                    WHEN s.payment_status = 'Partial' THEN 1
                    ELSE 0
                END
            ) AS partial_sales,
            SUM(
                CASE
                    WHEN s.payment_status = 'Paid' THEN 1
                    ELSE 0
                END
            ) AS paid_sales
        FROM sales s
        WHERE s.status = 'Completed'
          AND s.sale_date >= :start_date
          AND s.sale_date < :end_date
    ";

    $stmt = $pdo->prepare($balanceSql);
    $stmt->execute($saleParams);
    $balances = $stmt->fetch(PDO::FETCH_ASSOC);

    // Daily sales chart.
    $dailySql = "
        SELECT
            DATE(sale_date) AS report_date,
            COUNT(*) AS transactions,
            COALESCE(SUM(total_amount), 0) AS sales
        FROM sales
        WHERE status = 'Completed'
          AND sale_date >= :start_date
          AND sale_date < :end_date
        GROUP BY DATE(sale_date)
        ORDER BY report_date ASC
    ";

    $stmt = $pdo->prepare($dailySql);
    $stmt->execute($saleParams);
    $dailySales = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Monthly sales chart.
    $monthlySql = "
        SELECT
            DATE_FORMAT(sale_date, '%Y-%m') AS report_month,
            COUNT(*) AS transactions,
            COALESCE(SUM(total_amount), 0) AS sales
        FROM sales
        WHERE status = 'Completed'
          AND sale_date >= :start_date
          AND sale_date < :end_date
        GROUP BY DATE_FORMAT(sale_date, '%Y-%m')
        ORDER BY report_month ASC
    ";

    $stmt = $pdo->prepare($monthlySql);
    $stmt->execute($saleParams);
    $monthlySales = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Best-selling products by quantity.
    $productsSql = "
        SELECT
            i.id AS inventory_id,
            i.product_name,
            i.category,
            SUM(si.quantity) AS quantity_sold,
            COALESCE(SUM(si.subtotal), 0) AS total_revenue
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        INNER JOIN inventory i ON i.id = si.inventory_id
        WHERE s.status = 'Completed'
          AND s.sale_date >= :start_date
          AND s.sale_date < :end_date
        GROUP BY i.id, i.product_name, i.category
        ORDER BY quantity_sold DESC, total_revenue DESC
        LIMIT 10
    ";

    $stmt = $pdo->prepare($productsSql);
    $stmt->execute($saleParams);
    $topProducts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Payment methods by actual collection date.
    $methodsSql = "
        SELECT
            p.payment_method,
            COUNT(*) AS payment_count,
            COALESCE(SUM(p.amount), 0) AS total_amount
        FROM payments p
        INNER JOIN sales s ON s.id = p.sale_id
        WHERE s.status = 'Completed'
          AND p.payment_date >= :start_date
          AND p.payment_date < :end_date
        GROUP BY p.payment_method
        ORDER BY total_amount DESC
    ";

    $stmt = $pdo->prepare($methodsSql);
    $stmt->execute($saleParams);
    $paymentMethods = $stmt->fetchAll(PDO::FETCH_ASSOC);

    respond(200, [
        'success' => true,
        'data' => [
            'period' => $period,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'summary' => [
                'total_sales' => (float) $summary['total_sales'],
                'total_transactions' =>
                (int) $summary['total_transactions'],
                'total_collections' =>
                (float) $collections['total_collections'],
                'payment_count' =>
                (int) $collections['payment_count'],
                'outstanding_balance' =>
                (float) $balances['outstanding_balance'],
                'unpaid_sales' =>
                (int) $balances['unpaid_sales'],
                'partial_sales' =>
                (int) $balances['partial_sales'],
                'paid_sales' =>
                (int) $balances['paid_sales']
            ],
            'daily_sales' => $dailySales,
            'monthly_sales' => $monthlySales,
            'top_products' => $topProducts,
            'payment_methods' => $paymentMethods
        ]
    ]);
} catch (Throwable $e) {
    respond_server_error($e, 'Sales Reports API');
}
