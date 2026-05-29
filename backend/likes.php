<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/validation.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    $paging = build_paging();
    $postId = isset($_GET['post_id']) && is_numeric($_GET['post_id']) ? (int)$_GET['post_id'] : null;
    $userId = isset($_GET['user_id']) && is_numeric($_GET['user_id']) ? (int)$_GET['user_id'] : null;

    $where = [];
    $params = [];
    if ($postId !== null) { $where[] = 'pl.post_id = ?'; $params[] = $postId; }
    if ($userId !== null) { $where[] = 'pl.user_id = ?'; $params[] = $userId; }

    $whereSql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';
    $sql = "SELECT pl.*, UNIX_TIMESTAMP(pl.created_at) * 1000 as created_ts, u.username FROM post_likes pl JOIN users u ON pl.user_id = u.id $whereSql ORDER BY pl.created_at DESC LIMIT {$paging['limit']} OFFSET {$paging['offset']}";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countWhere = [];
    $countParams = [];
    if ($postId !== null) { $countWhere[] = 'pl.post_id = ?'; $countParams[] = $postId; }
    if ($userId !== null) { $countWhere[] = 'pl.user_id = ?'; $countParams[] = $userId; }
    $countWhereSql = count($countWhere) ? ('WHERE ' . implode(' AND ', $countWhere)) : '';
    $countSql = "SELECT COUNT(*) FROM post_likes pl $countWhereSql";
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
    $postId = null;
    if (isset($d['post_id']) && is_numeric($d['post_id'])) $postId = (int)$d['post_id'];
    if (isset($d['postId']) && is_numeric($d['postId'])) $postId = (int)$d['postId'];
    $postId = validate_int_id('post_id', $postId ?? null);

    $rootStmt = $pdo->prepare('SELECT p.id, COALESCE(p.original_post_id, p.id) AS target_post_id, COALESCE(original.author_id, p.author_id) AS target_author_id, COALESCE(original.title, p.title) AS target_title FROM posts p LEFT JOIN posts original ON p.original_post_id = original.id WHERE p.id = ?');
    $rootStmt->execute([$postId]);
    $rootPost = $rootStmt->fetch(PDO::FETCH_ASSOC);
    if (!$rootPost) send_problem(404, 'Not Found', 'Post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    $targetId = (int)$rootPost['target_post_id'];

    $check = $pdo->prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?');
    $check->execute([$targetId, $authUserId]);
    if ($check->fetch()) {
        send_problem(409, 'Conflict', 'Already liked', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $pdo->prepare('INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, UTC_TIMESTAMP())')->execute([$targetId, $authUserId]);

    $authorId = $rootPost['target_author_id'] ?? null;
    if ($authorId && (string)$authorId !== (string)$authUserId) {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 1 WHERE id = ?')->execute([$authorId]);
        $stmt = $pdo->prepare('INSERT INTO notifications (user_id, actor_id, type, message, post_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, NOW())');
        $stmt->execute([$authorId, $authUserId, 'like', 'Някой хареса публикацията ви: ' . ($rootPost['target_title'] ?? ''), $targetId]);
    }

    $likeStmt = $pdo->prepare('SELECT id, post_id, user_id, created_at, reaction_type, weight, source FROM post_likes WHERE post_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1');
    $likeStmt->execute([$targetId, $authUserId]);
    $like = $likeStmt->fetch(PDO::FETCH_ASSOC);
    if ($like) {
        $like['created_at'] = iso8601_or_null($like['created_at']);
    } else {
        $like = [
            'id' => $pdo->lastInsertId(),
            'post_id' => $targetId,
            'user_id' => $authUserId,
            'created_at' => gmdate(DATE_ATOM),
            'reaction_type' => 'like',
            'weight' => 1,
            'source' => 'web',
        ];
    }
    send_json($like, 201);
}

if ($method === 'DELETE') {
    $postId = isset($_GET['post_id']) && is_numeric($_GET['post_id']) ? (int)$_GET['post_id'] : null;
    if (!$postId) send_problem(400, 'Bad Request', 'Missing post_id', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $rootStmt = $pdo->prepare('SELECT p.id, COALESCE(p.original_post_id, p.id) AS target_post_id, COALESCE(original.author_id, p.author_id) AS target_author_id FROM posts p LEFT JOIN posts original ON p.original_post_id = original.id WHERE p.id = ?');
    $rootStmt->execute([$postId]);
    $rootPost = $rootStmt->fetch(PDO::FETCH_ASSOC);
    if (!$rootPost) send_problem(404, 'Not Found', 'Post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    $targetId = (int)$rootPost['target_post_id'];

    $stmt = $pdo->prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?');
    $stmt->execute([$targetId, $authUserId]);

    $authorId = $rootPost['target_author_id'] ?? null;
    if ($authorId && (string)$authorId !== (string)$authUserId) {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 1 WHERE id = ?')->execute([$authorId]);
    }

    send_json(['status' => 'unliked']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
