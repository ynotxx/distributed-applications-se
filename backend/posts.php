<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/validation.php';

function addNotification($pdo, $userId, $actorId, $type, $message, $postId = null, $commentId = null) {
    if (!$userId || (string)$userId === (string)$actorId) return;
    $stmt = $pdo->prepare("INSERT INTO notifications (user_id, actor_id, type, message, post_id, comment_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())");
    $stmt->execute([$userId, $actorId, $type, $message, $postId, $commentId]);
}

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

    $query = "SELECT p.*, UNIX_TIMESTAMP(p.created_at) * 1000 as created_ts, u.username as author_name, u.avatar as author_avatar, u.reputation_score as author_reputation, orig_u.username as original_author_name, orig_u.avatar as original_author_avatar, UNIX_TIMESTAMP(original.created_at) * 1000 as original_created_ts, EXISTS(SELECT 1 FROM posts rp WHERE rp.author_id = ? AND COALESCE(rp.original_post_id, rp.id) = COALESCE(p.original_post_id, p.id)) as is_reblogged_by_me, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = COALESCE(p.original_post_id, p.id)) as likes_count, (SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = COALESCE(p.original_post_id, p.id) AND pl2.user_id = ?) as is_liked, (SELECT COUNT(*) FROM posts pp WHERE pp.original_post_id = COALESCE(p.original_post_id, p.id) OR pp.id = COALESCE(p.original_post_id, p.id)) - 1 as reblogs_count FROM posts p JOIN users u ON p.author_id = u.id LEFT JOIN posts original ON p.original_post_id = original.id LEFT JOIN users orig_u ON original.author_id = orig_u.id $whereSql ORDER BY {$sort['by']} {$sort['dir']} LIMIT {$paging['limit']} OFFSET {$paging['offset']}";

    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    send_json($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST') {
    $d = read_json_body();

    if (($d['action'] ?? '') === 'view') {
        $postId = validate_int_id('post_id', $d['post_id'] ?? null);
        $pdo->prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?')->execute([$postId]);
        send_json(['status' => 'ok']);
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

        $findStmt = $pdo->prepare('SELECT id, original_post_id FROM posts WHERE author_id = ? AND COALESCE(original_post_id, id) = ? LIMIT 1');
        $findStmt->execute([$authUserId, $originalRootId]);
        $reblog = $findStmt->fetch(PDO::FETCH_ASSOC);
        if (!$reblog) send_problem(404, 'Not Found', 'Reblog not found', null, null, $_SERVER['REQUEST_URI'] ?? null);

        $delStmt = $pdo->prepare('DELETE FROM posts WHERE id = ?');
        $delStmt->execute([(int)$reblog['id']]);

        $origAuthorStmt = $pdo->prepare('SELECT author_id FROM posts WHERE id = ?');
        $origAuthorStmt->execute([$originalRootId]);
        $origAuthorId = $origAuthorStmt->fetchColumn();
        if ($origAuthorId && (string)$origAuthorId !== (string)$authUserId) {
            $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 3 WHERE id = ?')->execute([$origAuthorId]);
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

        $authorStmt = $pdo->prepare('SELECT p.author_id, u.username, p.title FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?');
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

    if ($origId) {
        $sourceStmt = $pdo->prepare('SELECT id, author_id, original_post_id FROM posts WHERE id = ?');
        $sourceStmt->execute([$origId]);
        $sourcePost = $sourceStmt->fetch(PDO::FETCH_ASSOC);

        if (!$sourcePost) {
            send_problem(404, 'Not Found', 'Original post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
        }

        $originalRootId = (int)($sourcePost['original_post_id'] ?? 0) > 0 ? (int)$sourcePost['original_post_id'] : (int)$sourcePost['id'];
        $alreadyReblogged = $pdo->prepare('SELECT id FROM posts WHERE author_id = ? AND COALESCE(original_post_id, id) = ? LIMIT 1');
        $alreadyReblogged->execute([$authUserId, $originalRootId]);

        if ($alreadyReblogged->fetch()) {
            send_problem(409, 'Conflict', 'You can only reblog this post once', null, ['original_post_id' => 'already_reblogged'], $_SERVER['REQUEST_URI'] ?? null);
        }

        $origId = $originalRootId;
    }

    $wordCount = str_word_count(strip_tags($content));
    $readingTime = max(1, ceil($wordCount / 200));

    $stmt = $pdo->prepare('INSERT INTO posts (title, content, author_id, original_post_id, reading_time_minutes, view_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, UTC_TIMESTAMP(), NULL)');
    $stmt->execute([$title, $content, $authUserId, $origId, $readingTime]);
    $newPostId = $pdo->lastInsertId();

    if ($origId) {
        $authorStmt = $pdo->prepare('SELECT p.author_id, p.title FROM posts p WHERE p.id = ?');
        $authorStmt->execute([$origId]);
        $original = $authorStmt->fetch(PDO::FETCH_ASSOC);
        $originalAuthorId = $original['author_id'] ?? null;

        if ($originalAuthorId && (string)$originalAuthorId !== (string)$authUserId) {
            $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 3 WHERE id = ?')->execute([$originalAuthorId]);
            addNotification($pdo, $originalAuthorId, $authUserId, 'reblog', 'Някой реблогна публикацията ви: ' . $original['title'], $origId);
        }
    }

    send_json(['id' => $newPostId], 201);
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
    if (!$isAdmin && (int)$row['author_id'] !== $authUserId) {
        send_problem(403, 'Forbidden', 'You cannot edit this post', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }
    if (!$isAdmin && !empty($row['original_post_id'])) {
        send_problem(403, 'Forbidden', 'You cannot edit this post', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $title = validate_required_string('title', $d['title'] ?? null, 1, 200);
    $content = validate_required_string('content', $d['content'] ?? null, 1, 10000);
    $stmt = $pdo->prepare('UPDATE posts SET title = ?, content = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?');
    $stmt->execute([$title, $content, $id]);
    send_json(['status' => 'updated']);
}

if ($method === 'DELETE') {
    $id = validate_int_id('id', $_GET['id'] ?? null);
    $stmtCheck = $pdo->prepare('SELECT author_id FROM posts WHERE id = ?');
    $stmtCheck->execute([$id]);
    $authorId = $stmtCheck->fetchColumn();
    if (!$authorId) {
        send_problem(404, 'Not Found', 'Post not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!$isAdmin && (int)$authorId !== $authUserId) {
        send_problem(403, 'Forbidden', 'You cannot delete this post', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $pdo->prepare('DELETE FROM posts WHERE id = ?')->execute([$id]);
    send_json(['status' => 'deleted']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
