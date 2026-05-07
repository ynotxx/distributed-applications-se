<?php

function send_json($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function send_problem(int $statusCode, string $title, ?string $detail = null, $errors = null, $extra = null, ?string $instance = null): void {
    http_response_code($statusCode);
    header('Content-Type: application/problem+json; charset=UTF-8');

    $payload = [
        'type' => 'about:blank',
        'title' => $title,
        'status' => $statusCode,
    ];

    if ($detail !== null) {
        $payload['detail'] = $detail;
    }

    if ($instance !== null) {
        $payload['instance'] = $instance;
    }

    if ($errors !== null) {
        $payload['errors'] = $errors;
    }

    if ($extra !== null) {
        $payload['extra'] = $extra;
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        send_problem(400, 'Bad Request', 'Invalid JSON body', null, null, $_SERVER['REQUEST_URI'] ?? null);
    }

    return $decoded;
}

function build_paging(): array {
    $page = isset($_GET['page']) && is_numeric($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $pageSize = isset($_GET['pageSize']) && is_numeric($_GET['pageSize']) ? (int)$_GET['pageSize'] : 20;
    $pageSize = max(1, min(100, $pageSize));

    return [
        'page' => $page,
        'pageSize' => $pageSize,
        'offset' => ($page - 1) * $pageSize,
        'limit' => $pageSize,
    ];
}

function build_sort(array $allowedFields, string $defaultField, string $defaultDirection = 'desc'): array {
    $by = $_GET['sortBy'] ?? $defaultField;
    if (!in_array($by, $allowedFields, true)) {
        $by = $defaultField;
    }

    $dir = strtolower((string)($_GET['sortDir'] ?? $defaultDirection));
    $dir = $dir === 'asc' ? 'asc' : 'desc';

    return ['by' => $by, 'dir' => $dir];
}

function str_param($value, string $default = ''): string {
    if ($value === null) return $default;
    return trim((string)$value);
}
