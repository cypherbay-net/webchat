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

require_once __DIR__ . '/ratelimit.php';
if (!enforceRateLimit(180, 60)) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many requests']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$sessionId = isset($_GET['sessionId']) ? $_GET['sessionId'] : '';
$since = isset($_GET['since']) ? (int)$_GET['since'] : 0;

if (!preg_match('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', $sessionId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid session ID']);
    exit;
}

$dataDir = __DIR__ . '/../data/sessions';
$sessionFile = $dataDir . '/' . $sessionId . '.json';

if (!file_exists($sessionFile)) {
    echo json_encode(['messages' => []]);
    exit;
}

$fp = fopen($sessionFile, 'r');
if (!$fp) {
    echo json_encode(['messages' => []]);
    exit;
}
flock($fp, LOCK_SH);
$content = stream_get_contents($fp);
flock($fp, LOCK_UN);
fclose($fp);

$sessionData = json_decode($content, true);

if (!$sessionData || !isset($sessionData['messages'])) {
    echo json_encode(['messages' => []]);
    exit;
}

$messages = array_filter($sessionData['messages'], function($msg) use ($since) {
    return $msg['timestamp'] > $since;
});

$messages = array_values($messages);

$response = ['messages' => $messages];

if (isset($sessionData['typing'])) {
    $typingAge = round(microtime(true) * 1000) - $sessionData['typing']['timestamp'];
    if ($typingAge < 4000) {
        $response['typing'] = $sessionData['typing'];
    }
}

echo json_encode($response);
