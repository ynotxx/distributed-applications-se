<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    
    if (isset($_GET['blocked_id']) && is_numeric($_GET['blocked_id'])) {
        $blockedId = (int)$_GET['blocked_id'];
        $check = $pdo->prepare('SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?');
        $check->execute([$authUserId, $blockedId]);
        send_json(['blocked' => (bool)$check->fetch()]);
    }

    $paging = build_paging();
    $limit = min(100, $paging['limit']);
    $stmt = $pdo->prepare('SELECT b.*, u.username as blocked_username, UNIX_TIMESTAMP(b.created_at) * 1000 as created_ts FROM blocks b JOIN users u ON b.blocked_id = u.id WHERE b.blocker_id = ? ORDER BY b.created_at DESC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$paging['offset']);
    $stmt->execute([$authUserId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM blocks WHERE blocker_id = ?');
    $countStmt->execute([$authUserId]);
    $total = (int)$countStmt->fetchColumn();

    foreach ($rows as &$r) {
        if (isset($r['created_ts'])) $r['created_at'] = iso8601_or_null($r['created_ts']);
    }

    send_list_json($rows, ['page' => $paging['page'], 'pageSize' => $paging['pageSize'], 'total' => $total]);
}

if ($method === 'POST') {
    $d = read_json_body();
    $blockedId = isset($d['blocked_id']) && is_numeric($d['blocked_id']) ? (int)$d['blocked_id'] : 0;
    if ($blockedId <= 0) send_problem(400, 'Bad Request', 'Missing blocked_id', null, null, $_SERVER['REQUEST_URI'] ?? null);
    if ($blockedId === $authUserId) send_problem(400, 'Bad Request', 'Cannot block yourself', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $check = $pdo->prepare('SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?');
    $check->execute([$authUserId, $blockedId]);
    if ($check->fetch()) send_problem(409, 'Conflict', 'Already blocked', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $stmt = $pdo->prepare('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, UTC_TIMESTAMP())');
    $stmt->execute([$authUserId, $blockedId]);
    $newId = $pdo->lastInsertId();

    $stmt = $pdo->prepare('SELECT b.id, b.blocker_id, b.blocked_id, u.username as blocked_username, b.created_at FROM blocks b JOIN users u ON b.blocked_id = u.id WHERE b.id = ?');
    $stmt->execute([$newId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) $row['created_at'] = iso8601_or_null($row['created_at']);
    send_json($row, 201);
}

if ($method === 'DELETE') {
    $blockedId = isset($_GET['blocked_id']) && is_numeric($_GET['blocked_id']) ? (int)$_GET['blocked_id'] : null;
    if (!$blockedId) send_problem(400, 'Bad Request', 'Missing blocked_id', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $stmt = $pdo->prepare('SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?');
    $stmt->execute([$authUserId, $blockedId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) send_problem(404, 'Not Found', 'Block not found', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $pdo->prepare('DELETE FROM blocks WHERE id = ?')->execute([$row['id']]);
    send_json(['status' => 'deleted']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
