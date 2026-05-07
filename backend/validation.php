<?php

require_once __DIR__ . '/response.php';

function validate_required_string(string $field, $value, int $minLength, int $maxLength): string {
    $value = trim((string)($value ?? ''));
    $len = mb_strlen($value);

    if ($value === '' || $len < $minLength || $len > $maxLength) {
        send_problem(400, 'Validation Error', 'Invalid ' . $field, null, [$field => 'invalid'], $_SERVER['REQUEST_URI'] ?? null);
    }

    return $value;
}

function validate_optional_string(string $field, $value, int $maxLength): string {
    $value = trim((string)($value ?? ''));
    if ($value === '') return '';
    if (mb_strlen($value) > $maxLength) {
        send_problem(400, 'Validation Error', 'Invalid ' . $field, null, [$field => 'too_long'], $_SERVER['REQUEST_URI'] ?? null);
    }

    return $value;
}

function validate_email(string $field, $value, int $maxLength): string {
    $value = validate_required_string($field, $value, 3, $maxLength);
    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
        send_problem(400, 'Validation Error', 'Invalid ' . $field, null, [$field => 'invalid'], $_SERVER['REQUEST_URI'] ?? null);
    }

    return $value;
}

function validate_int_id(string $field, $value): int {
    if (!is_numeric($value) || (int)$value <= 0) {
        send_problem(400, 'Validation Error', 'Invalid ' . $field, null, [$field => 'invalid'], $_SERVER['REQUEST_URI'] ?? null);
    }

    return (int)$value;
}
