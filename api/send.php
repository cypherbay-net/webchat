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

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['sessionId'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request']);
    exit;
}

$sessionId = $data['sessionId'];
$isTyping = isset($data['typing']) && is_string($data['typing']);

if (!$isTyping) {
    require_once __DIR__ . '/ratelimit.php';
    if (!enforceRateLimit(40, 60)) {
        http_response_code(429);
        echo json_encode(['error' => 'Too many requests']);
        exit;
    }
}
$payload = isset($data['payload']) ? $data['payload'] : null;

if (!$isTyping && !$payload) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request']);
    exit;
}

if (!preg_match('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', $sessionId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid session ID']);
    exit;
}

if (!$isTyping && (!is_string($payload) || strlen($payload) > 100000)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid payload']);
    exit;
}

if ($isTyping && strlen($data['typing']) > 5000) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid typing data']);
    exit;
}

$dataDir = __DIR__ . '/../data/sessions';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0700, true);
}

$sessionFile = $dataDir . '/' . $sessionId . '.json';

$fp = fopen($sessionFile, 'c+');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
    exit;
}

if (!flock($fp, LOCK_EX)) {
    fclose($fp);
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
    exit;
}

$sessionData = ['messages' => [], 'lastActivity' => time()];
$content = stream_get_contents($fp);
if ($content) {
    $saved = json_decode($content, true);
    if ($saved !== null && is_array($saved)) {
        $sessionData = array_merge($sessionData, $saved);
        if (!is_array($sessionData['messages'])) {
            $sessionData['messages'] = [];
        }
    }
}

if ($isTyping) {
    $sessionData['typing'] = [
        'payload' => $data['typing'],
        'timestamp' => round(microtime(true) * 1000)
    ];
} else {
    $message = [
        'payload' => $payload,
        'timestamp' => round(microtime(true) * 1000)
    ];
    $sessionData['messages'][] = $message;

    if (count($sessionData['messages']) > 100) {
        $sessionData['messages'] = array_slice($sessionData['messages'], -100);
    }

    $oneHourAgo = (microtime(true) * 1000) - (3600 * 1000);
    $sessionData['messages'] = array_values(array_filter($sessionData['messages'], function($msg) use ($oneHourAgo) {
        return $msg['timestamp'] > $oneHourAgo;
    }));
}

$sessionData['lastActivity'] = time();

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($sessionData));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

if ($isTyping) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => true, 'timestamp' => $message['timestamp']]);
}
