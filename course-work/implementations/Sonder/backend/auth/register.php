<?php

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../validation.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
}

$d = read_json_body();

$username = validate_required_string('username', $d['username'] ?? null, 3, 50);
$email = validate_email('email', $d['email'] ?? null, 255);
$password = validate_required_string('password', $d['password'] ?? null, 8, 128);

if (!preg_match('/[A-Z]/', $password) || !preg_match('/[0-9]/', $password)) {
    send_problem(400, 'Validation Error', 'Password must contain at least one uppercase letter and one digit', null, ['password' => 'weak'], $_SERVER['REQUEST_URI'] ?? null);
}

$check = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
$check->execute([$username, $email]);
if ($check->fetch()) {
    send_problem(409, 'Conflict', 'Username or email already exists', null, null, $_SERVER['REQUEST_URI'] ?? null);
}

$hashedPassword = password_hash($password, PASSWORD_DEFAULT);
$stmt = $pdo->prepare("INSERT INTO users (username, email, password, registered_on, is_author, is_admin, avatar, reputation_score, last_login_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), 1, 0, '', 0, NULL)");
$stmt->execute([$username, $email, $hashedPassword]);
$newId = (int)$pdo->lastInsertId();

$userStmt = $pdo->prepare('SELECT id, username, email, avatar, reputation_score, is_author, is_admin, UNIX_TIMESTAMP(DATE_ADD(registered_on, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)) * 1000 as registered_ts FROM users WHERE id = ?');
$userStmt->execute([$newId]);
$user = $userStmt->fetch(PDO::FETCH_ASSOC);
$token = issue_token($pdo, $newId, substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200), $_SERVER['REMOTE_ADDR'] ?? '');
if ($user && isset($user['registered_ts'])) {
    $user['registered_on'] = iso8601_or_null($user['registered_ts']);
    $user['last_login_at'] = null;
}
send_json(['token' => $token, 'user' => $user], 201);
