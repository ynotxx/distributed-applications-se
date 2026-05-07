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
    $postId = validate_int_id('post_id', $_GET['post_id'] ?? null);
    $paging = build_paging();
    $sort = build_sort(['created_at', 'id'], 'created_at', 'asc');
    $query = "SELECT comments.*, UNIX_TIMESTAMP(comments.created_at) * 1000 as created_ts, users.username, users.avatar FROM comments JOIN users ON comments.user_id = users.id WHERE post_id = ? ORDER BY {$sort['by']} {$sort['dir']} LIMIT {$paging['limit']} OFFSET {$paging['offset']}";
    $stmt = $pdo->prepare($query);
    $stmt->execute([$postId]);
    send_json($stmt->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST') {
    $d = read_json_body();
    $parentId = isset($d['parent_id']) && is_numeric($d['parent_id']) ? (int)$d['parent_id'] : null;
    $content = trim((string)($d['content'] ?? ''));
    $postId = validate_int_id('post_id', $d['post_id'] ?? null);

    if ($content === '') {
        send_problem(400, 'Validation Error', 'Invalid comment', null, ['content' => 'required'], $_SERVER['REQUEST_URI'] ?? null);
    }

    $spamScore = 0;
    if (mb_strlen($content) < 5) $spamScore += 30;
    if (preg_match('/(http|www|\.com|spam|спам|free)/i', $content)) $spamScore += 50;
    if (mb_strtoupper($content, 'UTF-8') === $content && preg_match('/[A-ZА-Я]/u', $content)) $spamScore += 30;

    $isApproved = ($spamScore >= 50) ? 0 : 1;

    $stmt = $pdo->prepare('INSERT INTO comments (post_id, user_id, parent_id, content, spam_score, is_approved, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())');
    $stmt->execute([$postId, $authUserId, $parentId, $content, $spamScore, $isApproved]);
    $commentId = $pdo->lastInsertId();

    if ($isApproved == 1) {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 1 WHERE id = ?')->execute([$authUserId]);
    } else {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 3 WHERE id = ?')->execute([$authUserId]);
    }

    if ($isApproved == 1) {
        if ($parentId) {
            $targetStmt = $pdo->prepare('SELECT user_id FROM comments WHERE id = ?');
            $targetStmt->execute([$parentId]);
            $targetUserId = $targetStmt->fetchColumn();
            addNotification($pdo, $targetUserId, $authUserId, 'reply', 'Някой отговори на ваш коментар.', $postId, $commentId);
        } else {
            $postStmt = $pdo->prepare('SELECT author_id, title FROM posts WHERE id = ?');
            $postStmt->execute([$postId]);
            $post = $postStmt->fetch(PDO::FETCH_ASSOC);
            addNotification($pdo, $post['author_id'] ?? null, $authUserId, 'comment', 'Някой коментира публикацията ви: ' . ($post['title'] ?? ''), $postId, $commentId);
        }
    }

    send_json(['status' => 'ok', 'is_approved' => $isApproved]);
}

if ($method === 'PUT') {
    $d = read_json_body();
    $id = validate_int_id('id', $d['id'] ?? null);
    $stmt = $pdo->prepare('SELECT user_id FROM comments WHERE id = ?');
    $stmt->execute([$id]);
    $ownerId = $stmt->fetchColumn();
    if (!$ownerId) {
        send_problem(404, 'Not Found', 'Comment not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!$isAdmin && (int)$ownerId !== $authUserId) {
        send_problem(403, 'Forbidden', 'You cannot edit this comment', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $content = validate_required_string('content', $d['content'] ?? null, 1, 2000);
    $pdo->prepare('UPDATE comments SET content = ?, updated_at = NOW() WHERE id = ?')->execute([$content, $id]);
    send_json(['status' => 'updated']);
}

if ($method === 'DELETE') {
    $id = validate_int_id('id', $_GET['id'] ?? null);
    $oldStmt = $pdo->prepare('SELECT user_id, is_approved FROM comments WHERE id = ?');
    $oldStmt->execute([$id]);
    $old = $oldStmt->fetch(PDO::FETCH_ASSOC);
    if (!$old) {
        send_problem(404, 'Not Found', 'Comment not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!$isAdmin && (int)$old['user_id'] !== $authUserId) {
        send_problem(403, 'Forbidden', 'You cannot delete this comment', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $pdo->prepare('DELETE FROM comments WHERE id = ?')->execute([$id]);

    if ((int)$old['is_approved'] === 1) {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score - 1 WHERE id = ?')->execute([$old['user_id']]);
    } else {
        $pdo->prepare('UPDATE users SET reputation_score = reputation_score + 3 WHERE id = ?')->execute([$old['user_id']]);
    }

    send_json(['status' => 'deleted']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
