<?php

declare(strict_types=1);

// Database settings for local XAMPP development.
// XAMPP's default MySQL user is "root" with an empty password.
// Never put real production credentials in this file or share it publicly.
const DB_HOST = 'localhost';
const DB_NAME = 'optimum_vision_db';
const DB_USER = 'root';
const DB_PASS = '';

// Use one time zone everywhere so PHP and MySQL agree on "now".
// This matters for the 30-second login lockout and appointment dates.
const APP_TIMEZONE = 'Asia/Manila';
const DB_TIMEZONE_OFFSET = '+08:00';

date_default_timezone_set(APP_TIMEZONE);

/**
 * Create and return a new PDO connection to the MySQL database.
 * Throws a PDOException if the connection fails; callers must catch it.
 */
function get_db_connection(): PDO
{
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    // Make MySQL functions such as NOW() use the same time zone as PHP.
    $pdo->exec("SET time_zone = '" . DB_TIMEZONE_OFFSET . "'");

    return $pdo;
}
