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
if (!enforceRateLimit(5, 60, 'create')) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many requests']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['sessionId'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request']);
    exit;
}

$sessionId = $data['sessionId'];

if (!preg_match('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', $sessionId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid session ID']);
    exit;
}

$dataDir = __DIR__ . '/../data/sessions';

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0700, true);
}
if (!is_dir($dataDir)) {
    http_response_code(500);
    echo json_encode(['error' => 'Server storage not available']);
    exit;
}

$sessionFile = $dataDir . '/' . $sessionId . '.json';

// режим 'x': эксклюзивное создание — ошибка, если файл уже существует
$fp = @fopen($sessionFile, 'x');
if (!$fp) {
    http_response_code(409);
    echo json_encode(['error' => 'Session already exists']);
    exit;
}

$sessionData = ['messages' => [], 'lastActivity' => time(), 'created' => time()];
fwrite($fp, json_encode($sessionData));
fclose($fp);

http_response_code(201);
echo json_encode(['success' => true]);
