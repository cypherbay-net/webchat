<?php

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

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

$content = file_get_contents($sessionFile);
$sessionData = json_decode($content, true);

if (!$sessionData || !isset($sessionData['messages'])) {
    echo json_encode(['messages' => []]);
    exit;
}

$messages = array_filter($sessionData['messages'], function($msg) use ($since) {
    return $msg['timestamp'] > $since;
});

$messages = array_values($messages);

echo json_encode(['messages' => $messages]);
