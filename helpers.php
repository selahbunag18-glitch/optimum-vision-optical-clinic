<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Roles that may use clinic management features.
// The clinic owner and clinic staff share the same access.
const STAFF_ROLES = ['owner', 'staff'];

// Origins that are allowed to call this API during development.
// Add your exact app origin here if your browser or device uses a different one.
const ALLOWED_ORIGINS = [
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost:8100',
    'http://127.0.0.1:8100',
    'http://localhost:4200',
];

// How long a login token stays valid (in hours).
const TOKEN_LIFETIME_HOURS = 24;

/**
 * Send CORS and JSON headers, and answer browser preflight (OPTIONS) requests.
 * This runs automatically when helpers.php is included.
 */
function init_api(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 600');
    header('Content-Type: application/json; charset=utf-8');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Send a JSON response and stop the script.
 */
function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Send a JSON error response in the standard format.
 */
function respond_error(int $status, string $message, array $extra = []): void
{
    respond($status, array_merge(['success' => false, 'message' => $message], $extra));
}

/**
 * Send a 422 response that lists which fields failed validation.
 */
function respond_validation_error(array $errors): void
{
    respond_error(422, 'Validation failed.', ['errors' => $errors]);
}

/**
 * Log the real error on the server and send a generic 500 response.
 * Internal details are never sent to the client.
 */
function respond_server_error(Throwable $e, string $context): void
{
    error_log($context . ': ' . $e->getMessage());
    respond_error(500, 'Internal server error.');
}

/**
 * Allow only the listed HTTP methods; otherwise respond with 405.
 */
function require_http_method(array $allowedMethods): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, $allowedMethods, true)) {
        header('Allow: ' . implode(', ', $allowedMethods) . ', OPTIONS');
        respond_error(405, 'Method not allowed.');
    }
}

/**
 * Read and decode the JSON request body into an array.
 */
function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        respond_error(400, 'Request body is required.');
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond_error(400, 'Invalid JSON request body.');
    }

    return $decoded;
}

/**
 * Get a trimmed string value from the input array.
 * Returns an empty string if the key is missing or is not a scalar value.
 */
function get_trimmed_string(array $input, string $key): string
{
    $value = $input[$key] ?? '';
    return is_scalar($value) ? trim((string)$value) : '';
}

/**
 * Check that a string is a valid email address.
 */
function is_valid_email(string $email): bool
{
    return strlen($email) <= 150 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Generate a random login token (64 hexadecimal characters).
 */
function generate_token(): string
{
    return bin2hex(random_bytes(32));
}

/**
 * Hash a token with SHA-256. Only the hash is stored in the database.
 */
function hash_token(string $token): string
{
    return hash('sha256', $token);
}

/**
 * Read the Authorization header from the request.
 * Some server setups hide it from $_SERVER, so a few fallbacks are checked.
 */
function get_authorization_header(): string
{
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return (string)$_SERVER['HTTP_AUTHORIZATION'];
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return (string)$_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strtolower((string)$name) === 'authorization') {
                return (string)$value;
            }
        }
    }
    return '';
}

/**
 * Extract the bearer token from the Authorization header.
 * Returns null if the header is missing or has the wrong format.
 */
function get_bearer_token(): ?string
{
    $header = get_authorization_header();
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim($header), $matches) === 1) {
        return strtolower($matches[1]);
    }
    return null;
}

/**
 * Require a valid login token. Optionally restrict access to certain roles.
 * Returns the authenticated user as an array: id, full_name, email, role.
 */
function require_auth(PDO $pdo, array $allowedRoles = []): array
{
    $token = get_bearer_token();
    if ($token === null) {
        respond_error(401, 'Authentication required.');
    }

    $stmt = $pdo->prepare(
        'SELECT u.id, u.full_name, u.email, u.role
         FROM auth_tokens t
         INNER JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = :token_hash
           AND t.expires_at > NOW()
           AND u.is_active = 1
         LIMIT 1'
    );
    $stmt->execute(['token_hash' => hash_token($token)]);
    $user = $stmt->fetch();

    if (!$user) {
        respond_error(401, 'Invalid or expired token.');
    }

    if ($allowedRoles !== [] && !in_array($user['role'], $allowedRoles, true)) {
        respond_error(403, 'You do not have permission to perform this action.');
    }

    $user['id'] = (int)$user['id'];
    return $user;
}

init_api();
