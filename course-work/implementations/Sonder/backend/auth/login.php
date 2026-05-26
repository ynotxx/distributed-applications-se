<?php

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../validation.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
}

$d = read_json_body();
$usernameOrEmail = trim((string)($d['username'] ?? $d['email'] ?? ''));
$password = $d['password'] ?? '';

if ($usernameOrEmail === '' || $password === '') {
    send_problem(400, 'Validation Error', 'Missing credentials', null, null, $_SERVER['REQUEST_URI'] ?? null);
}

$stmt = $pdo->prepare('SELECT id, username, email, password, avatar, reputation_score, is_author, is_admin, UNIX_TIMESTAMP(DATE_ADD(registered_on, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)) * 1000 as registered_ts FROM users WHERE username = ? OR email = ?');
$stmt->execute([$usernameOrEmail, $usernameOrEmail]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password'])) {
    send_problem(401, 'Unauthorized', 'Invalid username or password', null, null, $_SERVER['REQUEST_URI'] ?? null);
}

$pdo->prepare('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?')->execute([(int)$user['id']]);
$token = issue_token($pdo, (int)$user['id'], substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200), $_SERVER['REMOTE_ADDR'] ?? '');
unset($user['password']);
if (isset($user['registered_ts'])) $user['registered_on'] = iso8601_or_null($user['registered_ts']);
$user['last_login_at'] = gmdate(DATE_ATOM);
send_json(['token' => $token, 'user' => $user]);
