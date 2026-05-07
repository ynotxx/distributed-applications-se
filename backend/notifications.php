<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    $paging = build_paging();
    $limit = min(20, $paging['limit']);
    $stmt = $pdo->prepare('SELECT n.*, UNIX_TIMESTAMP(n.created_at) * 1000 as created_ts, u.username as actor_name FROM notifications n LEFT JOIN users u ON n.actor_id = u.id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ' . (int)$limit);
    $stmt->execute([$authUserId]);
    send_json($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST') {
    $d = read_json_body();
    if (($d['action'] ?? '') === 'mark_read') {
        $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')->execute([$authUserId]);
        send_json(['status' => 'ok']);
    }
}

if ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM notifications WHERE user_id = ?')->execute([$authUserId]);
    send_json(['status' => 'deleted']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
