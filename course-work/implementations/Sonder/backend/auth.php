<?php

require_once __DIR__ . '/response.php';

const AUTH_TOKEN_BYTES = 32;

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function sha256_hex(string $data): string {
    return hash('sha256', $data);
}

function get_bearer_token(): ?string {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$hdr && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $hdr = $headers['Authorization'] ?? '';
    }

    if (!$hdr || stripos($hdr, 'Bearer ') !== 0) {
        return null;
    }

    return trim(substr($hdr, 7));
}

function issue_token(PDO $pdo, int $userId, string $userAgent = '', string $ip = ''): string {
    $token = base64url_encode(random_bytes(AUTH_TOKEN_BYTES));
    $hash = sha256_hex($token);
    $expiresAt = gmdate('Y-m-d H:i:s', time() + 7 * 24 * 60 * 60);
    $createdAt = gmdate('Y-m-d H:i:s');

    $stmt = $pdo->prepare('INSERT INTO auth_tokens (user_id, token_hash, created_at, expires_at, revoked_at, user_agent, ip_address) VALUES (?, ?, ?, ?, NULL, ?, ?)');
    $stmt->execute([$userId, $hash, $createdAt, $expiresAt, $userAgent, $ip]);

    return $token;
}

function require_auth(PDO $pdo): array {
    $token = get_bearer_token();
    if (!$token) {
        send_problem(401, 'Unauthorized', 'Missing Bearer token', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $hash = sha256_hex($token);
    $stmt = $pdo->prepare('SELECT u.id, u.username, u.email, u.avatar, u.reputation_score, u.is_author, u.is_admin, UNIX_TIMESTAMP(u.registered_on) * 1000 as registered_ts FROM auth_tokens t JOIN users u ON t.user_id = u.id WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > UTC_TIMESTAMP()');
    $stmt->execute([$hash]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        send_problem(401, 'Unauthorized', 'Invalid or expired token', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    return $user;
}

function require_admin(array $user): void {
    if ((int)($user['is_admin'] ?? 0) !== 1) {
        send_problem(403, 'Forbidden', 'Admin only', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }
}
