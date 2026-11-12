<?php

declare(strict_types=1);

// Local XAMPP defaults; online credentials come from environment variables.
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_NAME', getenv('DB_NAME') ?: 'optimum_vision_db');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');

const APP_TIMEZONE = 'Asia/Manila';
const DB_TIMEZONE_OFFSET = '+08:00';

date_default_timezone_set(APP_TIMEZONE);

function get_db_connection(): PDO
{
    $dsn = 'mysql:host=' . DB_HOST
        . ';port=' . DB_PORT
        . ';dbname=' . DB_NAME
        . ';charset=utf8mb4';

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $pdo->exec("SET time_zone = '" . DB_TIMEZONE_OFFSET . "'");

    return $pdo;
}
