<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/validation.php';

function addNotification($pdo, $userId, $actorId, $type, $message, $postId = null, $commentId = null) {
    if (!$userId || (string)$userId === (string)$actorId) return;
    $stmt = $pdo->prepare('INSERT INTO notifications (user_id, actor_id, type, message, post_id, comment_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())');
    $stmt->execute([$userId, $actorId, $type, $message, $postId, $commentId]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    $paging = build_paging();
    $commentId = isset($_GET['comment_id']) && is_numeric($_GET['comment_id']) ? (int)$_GET['comment_id'] : null;
    $userId = isset($_GET['user_id']) && is_numeric($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    $where = [];
    $params = [];
    if ($commentId !== null) { $where[] = 'cl.comment_id = ?'; $params[] = $commentId; }
    if ($userId !== null) { $where[] = 'cl.user_id = ?'; $params[] = $userId; }

    $whereSql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';
    $sql = "SELECT cl.*, UNIX_TIMESTAMP(cl.created_at) * 1000 as created_ts, u.username FROM comment_likes cl JOIN users u ON cl.user_id = u.id $whereSql ORDER BY cl.created_at DESC LIMIT {$paging['limit']} OFFSET {$paging['offset']}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countWhere = [];
    $countParams = [];
    if ($commentId !== null) { $countWhere[] = 'cl.comment_id = ?'; $countParams[] = $commentId; }
    if ($userId !== null) { $countWhere[] = 'cl.user_id = ?'; $countParams[] = $userId; }
    $countWhereSql = count($countWhere) ? ('WHERE ' . implode(' AND ', $countWhere)) : '';
    $countSql = "SELECT COUNT(*) FROM comment_likes cl $countWhereSql";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($countParams);
    $total = (int)$countStmt->fetchColumn();

    foreach ($rows as &$r) {
        if (isset($r['created_ts'])) $r['created_at'] = iso8601_or_null($r['created_ts']);
    }

    send_list_json($rows, ['page' => $paging['page'], 'pageSize' => $paging['pageSize'], 'total' => $total]);
}

if ($method === 'POST') {
    $d = read_json_body();
    $commentId = null;
    if (isset($d['comment_id']) && is_numeric($d['comment_id'])) $commentId = (int)$d['comment_id'];
    if (isset($d['commentId']) && is_numeric($d['commentId'])) $commentId = (int)$d['commentId'];
    $commentId = validate_int_id('comment_id', $commentId ?? null);

    $check = $pdo->prepare('SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?');
    $check->execute([$commentId, $authUserId]);
    if ($check->fetch()) {
        send_problem(409, 'Conflict', 'Already liked', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $pdo->prepare('INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, UTC_TIMESTAMP())')->execute([$commentId, $authUserId]);

    $authorStmt = $pdo->prepare('SELECT c.user_id, c.content, c.post_id FROM comments c WHERE c.id = ?');
    $authorStmt->execute([$commentId]);
    $commentInfo = $authorStmt->fetch(PDO::FETCH_ASSOC);
    $authorId = $commentInfo['user_id'] ?? null;
    if ($authorId && (string)$authorId !== (string)$authUserId) {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 1 WHERE id = ?')->execute([$authorId]);
        $stmt = $pdo->prepare('INSERT INTO notifications (user_id, actor_id, type, message, post_id, comment_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())');
        $stmt->execute([$authorId, $authUserId, 'comment_like', 'Някой хареса коментара ви.', $commentInfo['post_id'], $commentId]);
    }

    $likeId = $pdo->lastInsertId();
    $likeStmt = $pdo->prepare('SELECT id, comment_id, user_id, created_at FROM comment_likes WHERE id = ?');
    $likeStmt->execute([$likeId]);
    $like = $likeStmt->fetch(PDO::FETCH_ASSOC);
    if ($like) $like['created_at'] = iso8601_or_null($like['created_at']);
    send_json($like, 201);
}

if ($method === 'DELETE') {
    $d = read_json_body();
    $commentId = isset($_GET['comment_id']) && is_numeric($_GET['comment_id']) ? (int)$_GET['comment_id'] : null;
    if (!$commentId && isset($d['comment_id']) && is_numeric($d['comment_id'])) $commentId = (int)$d['comment_id'];
    if (!$commentId && isset($d['commentId']) && is_numeric($d['commentId'])) $commentId = (int)$d['commentId'];
    if (!$commentId) send_problem(400, 'Bad Request', 'Missing comment_id', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $stmt = $pdo->prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?');
    $stmt->execute([$commentId, $authUserId]);

    $authorStmt = $pdo->prepare('SELECT user_id FROM comments WHERE id = ?');
    $authorStmt->execute([$commentId]);
    $authorId = $authorStmt->fetchColumn();
    if ($authorId && (string)$authorId !== (string)$authUserId) {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 1 WHERE id = ?')->execute([$authorId]);
    }

    send_json(['status' => 'unliked']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
?>
