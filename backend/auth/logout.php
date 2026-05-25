<?php

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../auth.php';

$authUser = require_auth($pdo);
$token = get_bearer_token();
if (!$token) {
    send_problem(401, 'Unauthorized', 'Missing Bearer token', null, null, $_SERVER['REQUEST_URI'] ?? null);
}

$hash = sha256_hex($token);
$stmt = $pdo->prepare('UPDATE auth_tokens SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL');
$stmt->execute([$hash, (int)$authUser['id']]);

send_json(['status' => 'revoked']);
