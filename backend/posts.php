<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/notification_helper.php';
require_once __DIR__ . '/validation.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    $paging = build_paging();
    $sort = build_sort(['id', 'created_at', 'view_count', 'likes_count'], 'id', 'desc');

    $feed = str_param($_GET['feed'] ?? null, 'global');
    $q = str_param($_GET['q'] ?? null, '');
    $authorId = $_GET['author_id'] ?? null;
    $authorIdVal = (is_numeric($authorId) && (int)$authorId > 0) ? (int)$authorId : null;

    $where = [];
    $params = [$authUserId, $authUserId];

    if ($feed === 'following') {
        $where[] = 'p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)';
        $params[] = $authUserId;
    }
    if ($q !== '') {
        $where[] = '(p.title LIKE ? OR p.content LIKE ?)';
        $params[] = '%' . $q . '%';
        $params[] = '%' . $q . '%';
    }
    if ($authorIdVal !== null) {
        $where[] = 'p.author_id = ?';
        $params[] = $authorIdVal;
    }

    $whereSql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';

    $createdTsExpr = "UNIX_TIMESTAMP(DATE_ADD(p.created_at, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)) * 1000 as created_ts";
    $originalCreatedTsExpr = "UNIX_TIMESTAMP(DATE_ADD(original.created_at, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)) * 1000 as original_created_ts";

    $query = "SELECT p.*, {$createdTsExpr}, u.username as author_name, u.avatar as author_avatar, u.reputation_score as author_reputation, orig_u.id as original_author_id, orig_u.username as original_author_name, orig_u.avatar as original_author_avatar, original.title as original_title, original.content as original_content, {$originalCreatedTsExpr}, EXISTS(SELECT 1 FROM posts rp WHERE rp.author_id = ? AND rp.original_post_id IS NOT NULL AND COALESCE(rp.original_post_id, rp.id) = COALESCE(p.original_post_id, p.id)) as is_reblogged_by_me, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = COALESCE(p.original_post_id, p.id)) as likes_count, (SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = COALESCE(p.original_post_id, p.id) AND pl2.user_id = ?) as is_liked, (SELECT COUNT(*) FROM posts pp WHERE pp.original_post_id = COALESCE(p.original_post_id, p.id) OR pp.id = COALESCE(p.original_post_id, p.id)) - 1 as reblogs_count FROM posts p JOIN users u ON p.author_id = u.id LEFT JOIN posts original ON p.original_post_id = original.id LEFT JOIN users orig_u ON original.author_id = orig_u.id $whereSql ORDER BY {$sort['by']} {$sort['dir']} LIMIT {$paging['limit']} OFFSET {$paging['offset']}";

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $blockedStmt = $pdo->prepare('SELECT blocked_id FROM blocks WHERE blocker_id = ?');
    $blockedStmt->execute([$authUserId]);
    $blockedRows = $blockedStmt->fetchAll(PDO::FETCH_COLUMN, 0);

    $blockedByStmt = $pdo->prepare('SELECT blocker_id FROM blocks WHERE blocked_id = ?');
    $blockedByStmt->execute([$authUserId]);
    $blockedByRows = $blockedByStmt->fetchAll(PDO::FETCH_COLUMN, 0);

    $countWhere = [];
    $countParams = [];
    if ($feed === 'following') {
        $countWhere[] = 'p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)';
        $countParams[] = $authUserId;
    }
    if ($q !== '') {
        $countWhere[] = '(p.title LIKE ? OR p.content LIKE ?)';
        $countParams[] = '%' . $q . '%';
        $countParams[] = '%' . $q . '%';
    }
    if ($authorIdVal !== null) {
        $countWhere[] = 'p.author_id = ?';
        $countParams[] = $authorIdVal;
    }
    $countWhereSql = count($countWhere) ? ('WHERE ' . implode(' AND ', $countWhere)) : '';
    $countSql = "SELECT COUNT(*) FROM posts p $countWhereSql";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($countParams);
    $total = (int)$countStmt->fetchColumn();

    $filtered = [];
    foreach ($rows as $r) {
        if (isset($r['created_ts'])) $r['created_at'] = iso8601_or_null($r['created_ts']);
        if (isset($r['original_created_ts'])) $r['original_created_at'] = iso8601_or_null($r['original_created_ts']);
        $authorId = (int)($r['author_id'] ?? 0);
        $origAuthorId = (int)($r['original_author_id'] ?? 0);

        if (in_array($authorId, $blockedByRows, true) || ($origAuthorId && in_array($origAuthorId, $blockedByRows, true))) {
            continue;
        }

        if (in_array($authorId, $blockedRows, true)) {
            $r['is_blocked'] = 1;
            $r['title'] = 'Потребителят @' . ($r['author_name'] ?? 'потребител') . ' е блокиран';
            $r['content'] = '';
        } else {
            $r['is_blocked'] = 0;
        }

        $filtered[] = $r;
    }
    $hiddenCount = count($rows) - count($filtered);
    $total = max(0, $total - $hiddenCount);

    send_list_json($filtered, ['page' => $paging['page'], 'pageSize' => $paging['pageSize'], 'total' => $total]);
}

if ($method === 'POST') {
    $d = read_json_body();

    if (($d['action'] ?? '') === 'view') {
        $postId = validate_int_id('post_id', $d['post_id'] ?? null);
        $pdo->prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?')->execute([$postId]);
        send_json(['status' => 'ok']);
    }

    if (($d['action'] ?? '') === 'reblog') {
        $title = validate_required_string('title', $d['title'] ?? null, 1, 200);
        $content = validate_required_string('content', $d['content'] ?? null, 1, 10000);
        $origIdRaw = $d['original_post_id'] ?? null;
        $origId = (is_numeric($origIdRaw) && (int)$origIdRaw > 0) ? (int)$origIdRaw : null;

        if (!$origId) {
            send_problem(400, 'Bad Request', 'Missing original_post_id', null, null, $_SERVER['REQUEST_URI'] ?? null);
        }

        $sourceStmt = $pdo->prepare('SELECT id, author_id, original_post_id, title, content FROM posts WHERE id = ?');
        $sourceStmt->execute([$origId]);
        $sourcePost = $sourceStmt->fetch(PDO::FETCH_ASSOC);

        if (!$sourcePost) {
            send_problem(404, 'Not Found', 'Original post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
        }

        $originalRootId = (int)($sourcePost['original_post_id'] ?? 0) > 0 ? (int)$sourcePost['original_post_id'] : (int)$sourcePost['id'];
        $alreadyReblogged = $pdo->prepare('SELECT id FROM posts WHERE author_id = ? AND original_post_id IS NOT NULL AND COALESCE(original_post_id, id) = ? LIMIT 1');
        $alreadyReblogged->execute([$authUserId, $originalRootId]);

        if ($alreadyReblogged->fetch()) {
            send_problem(409, 'Conflict', 'You can only reblog this post once', null, ['original_post_id' => 'already_reblogged'], $_SERVER['REQUEST_URI'] ?? null);
        }

        $charCount = mb_strlen(strip_tags($content));
        $readingTime = max(1, round($charCount / 5.75 / 180));
        $stmt = $pdo->prepare('INSERT INTO posts (title, content, author_id, original_post_id, reading_time_minutes, view_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, UTC_TIMESTAMP(), NULL)');
        $stmt->execute([$title, $content, $authUserId, $originalRootId, $readingTime]);
        $newPostId = $pdo->lastInsertId();

        $originalAuthorId = $sourcePost['author_id'] ?? null;
        if ($originalAuthorId && (string)$originalAuthorId !== (string)$authUserId) {
            $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 1 WHERE id = ?')->execute([$originalAuthorId]);
            addNotification($pdo, $originalAuthorId, $authUserId, 'reblog', 'Някой реблогна публикацията ви: ' . $sourcePost['title'], $originalRootId);
        }

        send_json(['id' => $newPostId], 201);
    }

    if (($d['action'] ?? '') === 'unreblog') {
        $origIdRaw = $d['original_post_id'] ?? null;
        $origId = (is_numeric($origIdRaw) && (int)$origIdRaw > 0) ? (int)$origIdRaw : null;
        if (!$origId) send_problem(400, 'Bad Request', 'Missing original_post_id', null, null, $_SERVER['REQUEST_URI'] ?? null);

        $sourceStmt = $pdo->prepare('SELECT id, original_post_id FROM posts WHERE id = ?');
        $sourceStmt->execute([$origId]);
        $sourcePost = $sourceStmt->fetch(PDO::FETCH_ASSOC);
        if (!$sourcePost) send_problem(404, 'Not Found', 'Original post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
        $originalRootId = (int)($sourcePost['original_post_id'] ?? 0) > 0 ? (int)$sourcePost['original_post_id'] : (int)$sourcePost['id'];

        $findStmt = $pdo->prepare('SELECT id, original_post_id FROM posts WHERE author_id = ? AND original_post_id IS NOT NULL AND COALESCE(original_post_id, id) = ? LIMIT 1');
        $findStmt->execute([$authUserId, $originalRootId]);
        $reblog = $findStmt->fetch(PDO::FETCH_ASSOC);
        if (!$reblog) send_problem(404, 'Not Found', 'Reblog not found', null, null, $_SERVER['REQUEST_URI'] ?? null);

        if ((int)($reblog['id'] ?? 0) === (int)$originalRootId) {
            send_problem(400, 'Bad Request', 'Cannot remove the original post via unreblog', null, null, $_SERVER['REQUEST_URI'] ?? null);
        }

        $delStmt = $pdo->prepare('DELETE FROM posts WHERE id = ?');
        $delStmt->execute([(int)$reblog['id']]);

        $origAuthorStmt = $pdo->prepare('SELECT author_id FROM posts WHERE id = ?');
        $origAuthorStmt->execute([$originalRootId]);
        $origAuthorId = $origAuthorStmt->fetchColumn();
        if ($origAuthorId && (string)$origAuthorId !== (string)$authUserId) {
            $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 1 WHERE id = ?')->execute([$origAuthorId]);
        }

        send_json(['status' => 'deleted']);
    }

    if (($d['action'] ?? '') === 'like') {
        $postId = validate_int_id('post_id', $d['post_id'] ?? null);
        $originalPostId = $d['original_post_id'] ?? null;
        $targetId = ($originalPostId && is_numeric($originalPostId) && (int)$originalPostId > 0) ? (int)$originalPostId : $postId;
        $userId = $authUserId;

        $check = $pdo->prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?');
        $check->execute([$targetId, $userId]);

        $authorStmt = $pdo->prepare('SELECT p.author_id, p.title FROM posts p WHERE p.id = ?');
        $authorStmt->execute([$targetId]);
        $postInfo = $authorStmt->fetch(PDO::FETCH_ASSOC);
        if (!$postInfo) {
            send_problem(404, 'Not Found', 'Post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
        }

        $authorId = $postInfo['author_id'] ?? null;
        if ($check->fetch()) {
            $pdo->prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')->execute([$targetId, $userId]);
            if ($authorId && (string)$authorId !== (string)$userId) {
                $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 1 WHERE id = ?')->execute([$authorId]);
            }
        } else {
            $pdo->prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)")->execute([$targetId, $userId]);
            if ($authorId && (string)$authorId !== (string)$userId) {
                $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 1 WHERE id = ?')->execute([$authorId]);
                addNotification($pdo, $authorId, $userId, 'like', 'Някой хареса публикацията ви: ' . $postInfo['title'], $targetId);
            }
        }
        send_json(['status' => 'ok']);
    }

    $title = validate_required_string('title', $d['title'] ?? null, 1, 200);
    $content = validate_required_string('content', $d['content'] ?? null, 1, 10000);
    $origIdRaw = $d['original_post_id'] ?? null;
    $origId = (is_numeric($origIdRaw) && (int)$origIdRaw > 0) ? (int)$origIdRaw : null;

    $charCount = mb_strlen(strip_tags($content));
    $readingTime = max(1, round($charCount / 5.75 / 180));

    $stmt = $pdo->prepare('INSERT INTO posts (title, content, author_id, original_post_id, reading_time_minutes, view_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, UTC_TIMESTAMP(), NULL)');
    $stmt->execute([$title, $content, $authUserId, $origId, $readingTime]);
    $newPostId = $pdo->lastInsertId();

    if ($origId) {
        $authorStmt = $pdo->prepare('SELECT p.author_id, p.title FROM posts p WHERE p.id = ?');
        $authorStmt->execute([$origId]);
        $original = $authorStmt->fetch(PDO::FETCH_ASSOC);
        $originalAuthorId = $original['author_id'] ?? null;

        if ($originalAuthorId && (string)$originalAuthorId !== (string)$authUserId) {
            $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 1 WHERE id = ?')->execute([$originalAuthorId]);
            addNotification($pdo, $originalAuthorId, $authUserId, 'reblog', 'Някой реблогна публикацията ви: ' . $original['title'], $origId);
        }
    }

    $postStmt = $pdo->prepare('SELECT id, title, content, author_id, original_post_id, reading_time_minutes, is_published, view_count, created_at, updated_at FROM posts WHERE id = ?');
    $postStmt->execute([$newPostId]);
    $post = $postStmt->fetch(PDO::FETCH_ASSOC);
    if ($post) {
        $post['created_at'] = iso8601_or_null($post['created_at']);
        $post['updated_at'] = iso8601_or_null($post['updated_at']);
    }
    send_json($post, 201);
}

if ($method === 'PUT') {
    $d = read_json_body();
    $id = validate_int_id('id', $d['id'] ?? null);

    $stmtCheck = $pdo->prepare('SELECT author_id, original_post_id FROM posts WHERE id = ?');
    $stmtCheck->execute([$id]);
    $row = $stmtCheck->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        send_problem(404, 'Not Found', 'Post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!empty($row['original_post_id'])) {
        send_problem(403, 'Forbidden', 'You cannot edit this post', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }
    if (!$isAdmin && (int)$row['author_id'] !== $authUserId) {
        send_problem(403, 'Forbidden', 'You cannot edit this post', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $title = validate_required_string('title', $d['title'] ?? null, 1, 200);
    $content = validate_required_string('content', $d['content'] ?? null, 1, 10000);
    $stmt = $pdo->prepare('UPDATE posts SET title = ?, content = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?');
    $stmt->execute([$title, $content, $id]);

    $postStmt = $pdo->prepare('SELECT id, title, content, author_id, original_post_id, reading_time_minutes, is_published, view_count, created_at, updated_at FROM posts WHERE id = ?');
    $postStmt->execute([$id]);
    $post = $postStmt->fetch(PDO::FETCH_ASSOC);
    if ($post) {
        $post['created_at'] = iso8601_or_null($post['created_at']);
        $post['updated_at'] = iso8601_or_null($post['updated_at']);
    }
    send_json($post);
}

if ($method === 'DELETE') {
    $id = validate_int_id('id', $_GET['id'] ?? null);
    $stmtCheck = $pdo->prepare('SELECT author_id, original_post_id FROM posts WHERE id = ?');
    $stmtCheck->execute([$id]);
    $row = $stmtCheck->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        send_problem(404, 'Not Found', 'Post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $authorId = $row['author_id'];
    $originalPostId = $row['original_post_id'] ?? null;

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!$isAdmin && (int)$authorId !== $authUserId) {
        send_problem(403, 'Forbidden', 'You cannot delete this post', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    if (!empty($originalPostId)) {
        $pdo->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]);
        $origAuthorStmt = $pdo->prepare('SELECT author_id FROM posts WHERE id = ?');
        $origAuthorStmt->execute([(int)$originalPostId]);
        $origAuthorId = $origAuthorStmt->fetchColumn();
        if ($origAuthorId) {
            $pdo->prepare('UPDATE users SET reputation_score = GREATEST(0, reputation_score - 1) WHERE id = ?')->execute([$origAuthorId]);
        }
        send_json(['status' => 'deleted']);
    }

    $findReblogs = $pdo->prepare('SELECT id FROM posts WHERE original_post_id = ?');
    $findReblogs->execute([$id]);
    $reblogIds = $findReblogs->fetchAll(PDO::FETCH_COLUMN, 0);
    $removed = 0;
    if (!empty($reblogIds)) {
        $delStmt = $pdo->prepare('DELETE FROM posts WHERE original_post_id = ?');
        $delStmt->execute([$id]);
        $removed = count($reblogIds);
        $pdo->prepare('UPDATE users SET reputation_score = GREATEST(0, reputation_score - ?) WHERE id = ?')->execute([$removed, $authorId]);
    }

    $pdo->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]);
    send_json(['status' => 'deleted', 'removed_reblogs' => $removed]);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
