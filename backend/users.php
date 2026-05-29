<?php

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/validation.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$authUser = require_auth($pdo);

if ($method === 'POST') {
    require_admin($authUser);
    $d = read_json_body();

    $username = validate_required_string('username', $d['username'] ?? null, 3, 50);
    $email = validate_email('email', $d['email'] ?? null, 255);
    $password = validate_required_string('password', $d['password'] ?? null, 8, 128);

    if (!preg_match('/[A-Z]/', $password) || !preg_match('/[0-9]/', $password)) {
        send_problem(400, 'Validation Error', 'Password must contain at least one uppercase letter and one digit', null, ['password' => 'weak'], $_SERVER['REQUEST_URI'] ?? null);
    }

    $check = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    $check->execute([$username, $email]);
    if ($check->fetch()) {
        send_problem(409, 'Conflict', 'Username or email already exists', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("INSERT INTO users (username, email, password, registered_on, is_author, is_admin, avatar, reputation_score, last_login_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), 1, 0, '', 0, NULL)");
    $stmt->execute([$username, $email, $hashedPassword]);
    $newId = (int)$pdo->lastInsertId();

    $userStmt = $pdo->prepare('SELECT id, username, email, avatar, reputation_score, is_author, is_admin, registered_on, last_login_at FROM users WHERE id = ?');
    $userStmt->execute([$newId]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);
    if ($user) {
        $user['registered_on'] = iso8601_or_null($user['registered_on']);
        $user['last_login_at'] = iso8601_or_null($user['last_login_at']);
    }
    send_json($user, 201);
}

if ($method === 'GET') {
    if (isset($_GET['username']) || isset($_GET['id'])) {
        $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
        $selectEmail = $isAdmin ? 'u.email' : "'' as email";
        $registeredTsExpr = "UNIX_TIMESTAMP(DATE_ADD(u.registered_on, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)) * 1000 as registered_ts";

        if (isset($_GET['username'])) {
            $username = str_param($_GET['username'] ?? null, '');
            if ($username === '') {
                send_problem(400, 'Validation Error', 'Invalid username', null, ['username' => 'invalid'], $_SERVER['REQUEST_URI'] ?? null);
            }

            $lastLoginExpr = "UNIX_TIMESTAMP(u.last_login_at) * 1000 as last_login_ts";
            $stmt = $pdo->prepare("SELECT u.id, u.username, $selectEmail, $registeredTsExpr, $lastLoginExpr, u.avatar, u.reputation_score, u.is_author, u.is_admin,
                (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) as followers_count,
                (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) as following_count
                FROM users u
                WHERE u.username = ?");
            $stmt->execute([$username]);
        } else {
            $id = validate_int_id('id', $_GET['id'] ?? null);

            $stmt = $pdo->prepare("SELECT u.id, u.username, $selectEmail, $registeredTsExpr, u.avatar, u.reputation_score, u.is_author, u.is_admin,
                (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) as followers_count,
                (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) as following_count
                FROM users u
                WHERE u.id = ?");
            $stmt->execute([$id]);
        }

        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            send_problem(404, 'Not Found', 'User not found', null, null, $_SERVER['REQUEST_URI'] ?? null);
        }

        $checkBlockedYou = $pdo->prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1');
        $checkBlockedYou->execute([$user['id'], $authUser['id']]);
        $user['blocked_you'] = $checkBlockedYou->fetchColumn() ? 1 : 0;

        if (isset($user['registered_ts'])) $user['registered_on'] = iso8601_or_null($user['registered_ts']);
        send_json($user);
    }

    $paging = build_paging();
    $sort = build_sort(['id', 'username', 'reputation_score', 'registered_on'], 'id', 'asc');

    $q = str_param($_GET['q'] ?? null, '');
    $where = [];
    $params = [];
    if ($q !== '') {
        $where[] = '(u.username LIKE ? OR u.email LIKE ?)';
        $params[] = '%' . $q . '%';
        $params[] = '%' . $q . '%';
    }

    $whereSql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';
    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    $selectEmail = $isAdmin ? 'u.email' : "'' as email";
    $registeredTsExpr = "UNIX_TIMESTAMP(DATE_ADD(u.registered_on, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)) * 1000 as registered_ts";
    $lastLoginExpr = "UNIX_TIMESTAMP(DATE_ADD(u.last_login_at, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)) * 1000 as last_login_ts";

    $sql = "SELECT u.id, u.username, $selectEmail, $registeredTsExpr, $lastLoginExpr, u.avatar, u.reputation_score, u.is_author, u.is_admin,
        (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) as following_count
        FROM users u
        $whereSql
        ORDER BY {$sort['by']} {$sort['dir']}
        LIMIT {$paging['limit']} OFFSET {$paging['offset']}";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countSql = "SELECT COUNT(*) FROM users u $whereSql";
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    foreach ($rows as &$r) {
        if (isset($r['registered_ts'])) {
            $r['registered_on'] = iso8601_or_null($r['registered_ts']);
        }
    }

    send_list_json($rows, ['page' => $paging['page'], 'pageSize' => $paging['pageSize'], 'total' => $total]);
}

if ($method === 'PUT') {
    $data = read_json_body();
    $id = validate_int_id('id', $data['id'] ?? null);

    $isAdmin = (int)($authUser['is_admin'] ?? 0) === 1;
    if (!$isAdmin && (int)$authUser['id'] !== $id) {
        send_problem(403, 'Forbidden', 'You can only edit your own profile', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    $username = validate_required_string('username', $data['username'] ?? null, 3, 50);
    $avatar = validate_optional_string('avatar', $data['avatar'] ?? '', 255);

    $check = $pdo->prepare('SELECT id FROM users WHERE username = ? AND id != ?');
    $check->execute([$username, $id]);
    if ($check->fetch()) {
        send_problem(409, 'Conflict', 'Username already taken', null, ['username' => 'taken'], $_SERVER['REQUEST_URI'] ?? null);
    }

    $stmt = $pdo->prepare('UPDATE users SET username = ?, avatar = ? WHERE id = ?');
    $stmt->execute([$username, $avatar, $id]);

    $userStmt = $pdo->prepare('SELECT id, username, email, avatar, reputation_score, is_author, is_admin, registered_on, last_login_at FROM users WHERE id = ?');
    $userStmt->execute([$id]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);
    if ($user) {
        $user['registered_on'] = iso8601_or_null($user['registered_on']);
        $user['last_login_at'] = iso8601_or_null($user['last_login_at']);
    }
    send_json($user);
}

if ($method === 'DELETE') {
    require_admin($authUser);
    $id = validate_int_id('id', $_GET['id'] ?? null);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    send_json(['status' => 'deleted']);
}

send_problem(405, 'Method Not Allowed', null, null, null, $_SERVER['REQUEST_URI'] ?? null);
