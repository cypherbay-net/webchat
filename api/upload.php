<?php

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'");

if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
    if (empty($_SERVER['HTTP_X_FORWARDED_PROTO']) || $_SERVER['HTTP_X_FORWARDED_PROTO'] !== 'https') {
        http_response_code(403);
        echo json_encode(['error' => 'HTTPS required']);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/ratelimit.php';
if (!enforceRateLimit(5, 60, 'upload')) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many uploads. Try again in a minute.']);
    exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $code = isset($_FILES['file']) ? $_FILES['file']['error'] : 'no_file';
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded', 'code' => $code]);
    exit;
}

$file = $_FILES['file'];
$maxSize = 25 * 1024 * 1024;

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large (max 25 MB)']);
    exit;
}

$uploadDir = __DIR__ . '/../data/uploads';
if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0755, true);
}
if (!is_dir($uploadDir)) {
    http_response_code(500);
    echo json_encode(['error' => 'Server storage not available']);
    exit;
}

// удаляем зашифрованные файлы старше 7 дней при каждой загрузке
$cutoff = time() - 7 * 24 * 3600;
foreach (glob($uploadDir . '/*') ?: [] as $f) {
    if (is_file($f) && filemtime($f) < $cutoff) @unlink($f);
}

$id       = bin2hex(random_bytes(16));
$dataPath = $uploadDir . '/' . $id;

if (!move_uploaded_file($file['tmp_name'], $dataPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save file on server']);
    exit;
}

$scheme  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host    = $_SERVER['HTTP_HOST'];
$url     = $scheme . '://' . $host . '/api/file.php?id=' . $id;

echo json_encode(['success' => true, 'url' => $url]);
