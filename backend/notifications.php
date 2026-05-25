<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    $paging = build_paging();
    $limit = min(100, $paging['limit']);
    $stmt = $pdo->prepare('SELECT n.*, UNIX_TIMESTAMP(n.created_at) * 1000 as created_ts, u.username as actor_name FROM notifications n LEFT JOIN users u ON n.actor_id = u.id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$paging['offset']);
    $stmt->execute([$authUserId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ?');
    $countStmt->execute([$authUserId]);
    $total = (int)$countStmt->fetchColumn();

    $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
    $unreadStmt->execute([$authUserId]);
    $unread = (int)$unreadStmt->fetchColumn();

    foreach ($rows as &$r) {
        if (isset($r['created_ts'])) $r['created_at'] = iso8601_or_null($r['created_ts']);
    }

    send_list_json($rows, ['page' => $paging['page'], 'pageSize' => $paging['pageSize'], 'total' => $total, 'meta' => ['unread_count' => $unread]]);
}

if ($method === 'POST') {
    $d = read_json_body();
    if (($d['action'] ?? '') === 'mark_read') {
        $nid = isset($d['notification_id']) && is_numeric($d['notification_id']) ? (int)$d['notification_id'] : null;
        if ($nid) {
            $stmtOwner = $pdo->prepare('SELECT user_id FROM notifications WHERE id = ?');
            $stmtOwner->execute([$nid]);
            $ownerId = $stmtOwner->fetchColumn();
            if ((int)$ownerId !== $authUserId) send_problem(403, 'Forbidden', 'You cannot modify this notification', null, null, $_SERVER['REQUEST_URI'] ?? null);
            $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')->execute([$nid]);
        } else {
            $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')->execute([$authUserId]);
        }
        $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
        $unreadStmt->execute([$authUserId]);
        $unread = (int)$unreadStmt->fetchColumn();
        send_json(['status' => 'ok', 'unread_count' => $unread]);
    }

    if (($d['action'] ?? '') === 'mark_unread') {
        $nid = isset($d['notification_id']) && is_numeric($d['notification_id']) ? (int)$d['notification_id'] : null;
        if (!$nid) send_problem(400, 'Bad Request', 'Missing notification_id', null, null, $_SERVER['REQUEST_URI'] ?? null);
        $stmtOwner = $pdo->prepare('SELECT user_id FROM notifications WHERE id = ?');
        $stmtOwner->execute([$nid]);
        $ownerId = $stmtOwner->fetchColumn();
        if ((int)$ownerId !== $authUserId) send_problem(403, 'Forbidden', 'You cannot modify this notification', null, null, $_SERVER['REQUEST_URI'] ?? null);
        $pdo->prepare('UPDATE notifications SET is_read = 0 WHERE id = ?')->execute([$nid]);
        $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
        $unreadStmt->execute([$authUserId]);
        $unread = (int)$unreadStmt->fetchColumn();
        send_json(['status' => 'ok', 'unread_count' => $unread]);
    }

    $userId = isset($d['user_id']) && is_numeric($d['user_id']) ? (int)$d['user_id'] : null;
    $type = isset($d['type']) ? (string)$d['type'] : null;
    $message = isset($d['message']) ? (string)$d['message'] : null;
    $postId = isset($d['post_id']) && is_numeric($d['post_id']) ? (int)$d['post_id'] : null;
    $commentId = isset($d['comment_id']) && is_numeric($d['comment_id']) ? (int)$d['comment_id'] : null;

    if (!$userId || !$type || !$message) send_problem(400, 'Bad Request', 'Missing fields', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $stmt = $pdo->prepare('INSERT INTO notifications (user_id, actor_id, type, message, post_id, comment_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, UTC_TIMESTAMP())');
    $stmt->execute([$userId, $authUserId, $type, $message, $postId, $commentId]);
    $newId = $pdo->lastInsertId();

    $notifStmt = $pdo->prepare('SELECT id, user_id, actor_id, type, message, post_id, comment_id, is_read, created_at FROM notifications WHERE id = ?');
    $notifStmt->execute([$newId]);
    $notif = $notifStmt->fetch(PDO::FETCH_ASSOC);
    if ($notif) $notif['created_at'] = iso8601_or_null($notif['created_at']);
    $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
    $unreadStmt->execute([$userId]);
    $unread = (int)$unreadStmt->fetchColumn();
    send_json(['notification' => $notif, 'unread_count' => $unread], 201);
}

if ($method === 'PUT') {
    $d = read_json_body();
    $id = isset($d['id']) && is_numeric($d['id']) ? (int)$d['id'] : null;
    if (!$id) send_problem(400, 'Bad Request', 'Missing id', null, null, $_SERVER['REQUEST_URI'] ?? null);

    if (!isset($d['is_read'])) send_problem(400, 'Bad Request', 'Missing is_read', null, null, $_SERVER['REQUEST_URI'] ?? null);
    $isRead = $d['is_read'] ? 1 : 0;

    $stmtOwner = $pdo->prepare('SELECT user_id FROM notifications WHERE id = ?');
    $stmtOwner->execute([$id]);
    $ownerId = $stmtOwner->fetchColumn();
    if (!$ownerId) send_problem(404, 'Not Found', 'Notification not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    if ((int)$ownerId !== $authUserId) send_problem(403, 'Forbidden', 'You cannot modify this notification', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $pdo->prepare('UPDATE notifications SET is_read = ? WHERE id = ?')->execute([$isRead, $id]);
    $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
    $unreadStmt->execute([$authUserId]);
    $unread = (int)$unreadStmt->fetchColumn();
    send_json(['status' => 'updated', 'unread_count' => $unread]);
}

if ($method === 'DELETE') {
    $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : null;
    if ($id) {
        $stmtOwner = $pdo->prepare('SELECT user_id FROM notifications WHERE id = ?');
        $stmtOwner->execute([$id]);
        $ownerId = $stmtOwner->fetchColumn();
        if (!$ownerId) send_problem(404, 'Not Found', 'Notification not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
        if ((int)$ownerId !== $authUserId) send_problem(403, 'Forbidden', 'You cannot delete this notification', null, null, $_SERVER['REQUEST_URI'] ?? null);

        $pdo->prepare('DELETE FROM notifications WHERE id = ?')->execute([$id]);
        $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
        $unreadStmt->execute([$authUserId]);
        $unread = (int)$unreadStmt->fetchColumn();
        send_json(['status' => 'deleted', 'unread_count' => $unread]);
    }

    $pdo->prepare('DELETE FROM notifications WHERE user_id = ?')->execute([$authUserId]);
    send_json(['status' => 'deleted_all', 'unread_count' => 0]);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
