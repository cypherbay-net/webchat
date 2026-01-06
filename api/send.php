<?php

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['sessionId']) || !isset($data['payload'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request']);
    exit;
}

$sessionId = $data['sessionId'];
$payload = $data['payload'];

if (!preg_match('/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/', $sessionId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid session ID']);
    exit;
}

if (!is_string($payload) || strlen($payload) > 100000) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid payload']);
    exit;
}

$dataDir = __DIR__ . '/../data/sessions';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0700, true);
}

$sessionFile = $dataDir . '/' . $sessionId . '.json';

$messages = [];
if (file_exists($sessionFile)) {
    $content = file_get_contents($sessionFile);
    $sessionData = json_decode($content, true);
    if ($sessionData && isset($sessionData['messages'])) {
        $messages = $sessionData['messages'];
    }
}

$message = [
    'payload' => $payload,
    'timestamp' => round(microtime(true) * 1000)
];

$messages[] = $message;

if (count($messages) > 100) {
    $messages = array_slice($messages, -100);
}

$oneHourAgo = (microtime(true) * 1000) - (3600 * 1000);
$messages = array_filter($messages, function($msg) use ($oneHourAgo) {
    return $msg['timestamp'] > $oneHourAgo;
});
$messages = array_values($messages);

$sessionData = [
    'messages' => $messages,
    'lastActivity' => time()
];

$fp = fopen($sessionFile, 'c');
if (flock($fp, LOCK_EX)) {
    ftruncate($fp, 0);
    fwrite($fp, json_encode($sessionData));
    fflush($fp);
    flock($fp, LOCK_UN);
}
fclose($fp);

echo json_encode(['success' => true, 'timestamp' => $message['timestamp']]);
