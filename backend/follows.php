<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

function addNotification($pdo, $userId, $actorId, $type, $message) {
    if (!$userId || (string)$userId === (string)$actorId) return;
    $stmt = $pdo->prepare('INSERT INTO notifications (user_id, actor_id, type, message, is_read, created_at) VALUES (?, ?, ?, ?, 0, NOW())');
    $stmt->execute([$userId, $actorId, $type, $message]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$authUser = require_auth($pdo);
$authUserId = (int)$authUser['id'];

if ($method === 'GET') {
    $profileId = isset($_GET['profile_id']) && is_numeric($_GET['profile_id']) ? (int)$_GET['profile_id'] : 0;
    if ($profileId <= 0) {
        send_json(['is_following' => false]);
    }

    $stmt = $pdo->prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?');
    $stmt->execute([$authUserId, $profileId]);
    send_json(['is_following' => (bool)$stmt->fetch()]);
}

if ($method === 'POST') {
    $d = read_json_body();
    $followingId = isset($d['following_id']) && is_numeric($d['following_id']) ? (int)$d['following_id'] : 0;

    if ($followingId <= 0 || $followingId === $authUserId) {
        send_problem(400, 'Validation Error', 'Invalid follow request', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $check = $pdo->prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?');
    $check->execute([$authUserId, $followingId]);
    $existing = $check->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        $pdo->prepare('DELETE FROM follows WHERE id = ?')->execute([$existing['id']]);
        send_json(['following' => false]);
    }

    $pdo->prepare('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, NOW())')->execute([$authUserId, $followingId]);
    addNotification($pdo, $followingId, $authUserId, 'follow', 'Някой започна да ви следва.');
    send_json(['following' => true]);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
