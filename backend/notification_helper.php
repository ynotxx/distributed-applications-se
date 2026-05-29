<?php

function addNotification($pdo, $userId, $actorId, $type, $message, $postId = null, $commentId = null) {
    if (!$userId || (string)$userId === (string)$actorId) {
        return;
    }

    $stmt = $pdo->prepare('INSERT INTO notifications (user_id, actor_id, type, message, post_id, comment_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())');
    $stmt->execute([$userId, $actorId, $type, $message, $postId, $commentId]);
}