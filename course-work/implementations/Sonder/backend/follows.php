<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/notification_helper.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    
    if (isset($_GET['profile_id'])) {
        $profileId = isset($_GET['profile_id']) && is_numeric($_GET['profile_id']) ? (int)$_GET['profile_id'] : 0;
        if ($profileId <= 0) {
            send_json(['is_following' => false]);
        }

        $stmt = $pdo->prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?');
        $stmt->execute([$authUserId, $profileId]);
        $followId = $stmt->fetchColumn();
        send_json(['is_following' => (bool)$followId, 'follow_id' => $followId ? (int)$followId : null]);
    }

    
    $paging = build_paging();
    $where = [];
    $params = [];
    $followerFilter = null;
    $queryText = trim((string)($_GET['q'] ?? ''));
    $statusFilter = trim((string)($_GET['status'] ?? ''));

    if (isset($_GET['follower_id']) && is_numeric($_GET['follower_id'])) { $followerFilter = (int)$_GET['follower_id']; $where[] = 'f.follower_id = ?'; $params[] = $followerFilter; }
    if (isset($_GET['following_id']) && is_numeric($_GET['following_id'])) { $where[] = 'f.following_id = ?'; $params[] = (int)$_GET['following_id']; }

    $whereSql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';

    if ($followerFilter !== null) {
        $baseSelect = "SELECT f.*, UNIX_TIMESTAMP(f.created_at) * 1000 as created_ts, u_other.username as other_username, u_other.id as other_id, UNIX_TIMESTAMP(u_other.last_login_at) * 1000 as other_last_login_ts, CASE WHEN b.id IS NOT NULL THEN 1 ELSE 0 END as is_blocked, CASE WHEN b.id IS NOT NULL THEN 'blocked' WHEN u_other.last_login_at IS NOT NULL AND UNIX_TIMESTAMP(UTC_TIMESTAMP()) - UNIX_TIMESTAMP(u_other.last_login_at) <= 300 THEN 'active' ELSE 'offline' END as status_display FROM follows f LEFT JOIN users u_other ON f.following_id = u_other.id LEFT JOIN blocks b ON b.blocker_id = ? AND b.blocked_id = u_other.id WHERE f.follower_id = ?";
        $filterSql = '';
        $filterParams = [$authUserId, $followerFilter];

        if ($queryText !== '') {
            $filterSql .= " AND (u_other.username LIKE ? OR COALESCE(f.note, '') LIKE ? OR COALESCE(f.status, '') LIKE ?)";
            $like = '%' . $queryText . '%';
            $filterParams[] = $like;
            $filterParams[] = $like;
            $filterParams[] = $like;
        }

        if ($statusFilter !== '') {
            if (in_array($statusFilter, ['active', 'offline', 'blocked'], true)) {
                $filterSql .= " AND CASE WHEN b.id IS NOT NULL THEN 'blocked' WHEN u_other.last_login_at IS NOT NULL AND UNIX_TIMESTAMP(UTC_TIMESTAMP()) - UNIX_TIMESTAMP(u_other.last_login_at) <= 300 THEN 'active' ELSE 'offline' END = ?";
                $filterParams[] = $statusFilter;
            }
        }

        $sql = $baseSelect . $filterSql . " ORDER BY f.created_at DESC LIMIT {$paging['limit']} OFFSET {$paging['offset']}";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($filterParams);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countSql = "SELECT COUNT(*) FROM follows f LEFT JOIN users u_other ON f.following_id = u_other.id LEFT JOIN blocks b ON b.blocker_id = ? AND b.blocked_id = u_other.id WHERE f.follower_id = ?" . $filterSql;
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($filterParams);
        $total = (int)$countStmt->fetchColumn();
    } else {
        $sql = "SELECT f.*, UNIX_TIMESTAMP(f.created_at) * 1000 as created_ts FROM follows f $whereSql ORDER BY f.created_at DESC LIMIT {$paging['limit']} OFFSET {$paging['offset']}";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $countSql = "SELECT COUNT(*) FROM follows f $whereSql";
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();
    }

    foreach ($rows as &$r) {
        if (isset($r['created_ts'])) $r['created_at'] = iso8601_or_null($r['created_ts']);
    }

    send_list_json($rows, ['page' => $paging['page'], 'pageSize' => $paging['pageSize'], 'total' => $total]);
}

if ($method === 'POST') {
    $d = read_json_body();
    $followingId = isset($d['following_id']) && is_numeric($d['following_id']) ? (int)$d['following_id'] : 0;

    if ($followingId <= 0 || $followingId === $authUserId) {
        send_problem(400, 'Validation Error', 'Invalid follow request', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $check = $pdo->prepare('SELECT id, following_id FROM follows WHERE follower_id = ? AND following_id = ?');
    $check->execute([$authUserId, $followingId]);
    $existing = $check->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        addNotification($pdo, (int)$existing['following_id'], $authUserId, 'unfollow', 'Някой спря да ви следва.');
        $pdo->prepare('DELETE FROM follows WHERE id = ?')->execute([$existing['id']]);
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 2 WHERE id = ?')->execute([$followingId]);
        send_json(['following' => false]);
        return;
    }

    $stmt = $pdo->prepare('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, NOW())');
    $stmt->execute([$authUserId, $followingId]);
    $newId = $pdo->lastInsertId();
    $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 2 WHERE id = ?')->execute([$followingId]);
    addNotification($pdo, $followingId, $authUserId, 'follow', 'Някой започна да ви следва.');

    $followStmt = $pdo->prepare('SELECT id, follower_id, following_id, status, note, is_close_friend, created_at, updated_at FROM follows WHERE id = ?');
    $followStmt->execute([$newId]);
    $follow = $followStmt->fetch(PDO::FETCH_ASSOC);
    if ($follow) {
        $follow['created_at'] = iso8601_or_null($follow['created_at']);
        $follow['updated_at'] = iso8601_or_null($follow['updated_at']);
    }
    send_json($follow, 201);
}

if ($method === 'PUT') {
    $d = read_json_body();
    $id = validate_int_id('id', $d['id'] ?? null);

    $stmt = $pdo->prepare('SELECT follower_id FROM follows WHERE id = ?');
    $stmt->execute([$id]);
    $followerId = $stmt->fetchColumn();
    if (!$followerId) send_problem(404, 'Not Found', 'Follow not found', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!$isAdmin && (int)$followerId !== $authUserId) send_problem(403, 'Forbidden', 'You cannot modify this follow', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $status = isset($d['status']) ? (string)$d['status'] : null;
    $note = isset($d['note']) ? (string)$d['note'] : null;
    $isClose = isset($d['is_close_friend']) ? (int)($d['is_close_friend'] ? 1 : 0) : null;

    $sets = [];
    $params = [];
    if ($status !== null) { $sets[] = 'status = ?'; $params[] = $status; }
    if ($note !== null) { $sets[] = 'note = ?'; $params[] = $note; }
    if ($isClose !== null) { $sets[] = 'is_close_friend = ?'; $params[] = $isClose; }
    if (count($sets) === 0) send_problem(400, 'Bad Request', 'No fields to update', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $params[] = $id;
    $pdo->prepare('UPDATE follows SET ' . implode(', ', $sets) . ', updated_at = UTC_TIMESTAMP() WHERE id = ?')->execute($params);

    $followStmt = $pdo->prepare('SELECT id, follower_id, following_id, status, note, is_close_friend, created_at, updated_at FROM follows WHERE id = ?');
    $followStmt->execute([$id]);
    $follow = $followStmt->fetch(PDO::FETCH_ASSOC);
    if ($follow) {
        $follow['created_at'] = iso8601_or_null($follow['created_at']);
        $follow['updated_at'] = iso8601_or_null($follow['updated_at']);
    }
    send_json($follow);
}

if ($method === 'DELETE') {
    $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : null;
    if (!$id) send_problem(400, 'Bad Request', 'Missing id', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $stmt = $pdo->prepare('SELECT follower_id, following_id FROM follows WHERE id = ?');
    $stmt->execute([$id]);
    $followRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$followRow) send_problem(404, 'Not Found', 'Follow not found', null, null, $_SERVER['REQUEST_URI'] ?? null);

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!$isAdmin && (int)$followRow['follower_id'] !== $authUserId) send_problem(403, 'Forbidden', 'You cannot delete this follow', null, null, $_SERVER['REQUEST_URI'] ?? null);

    addNotification($pdo, (int)$followRow['following_id'], $authUserId, 'unfollow', 'Някой спря да ви следва.');
    $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 2 WHERE id = ?')->execute([(int)$followRow['following_id']]);
    $pdo->prepare('DELETE FROM follows WHERE id = ?')->execute([$id]);
    send_json(['status' => 'deleted']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
