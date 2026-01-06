<?php

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

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

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded', 'code' => isset($_FILES['file']) ? $_FILES['file']['error'] : 'no file']);
    exit;
}

$file = $_FILES['file'];
$maxSize = 100 * 1024 * 1024;

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large']);
    exit;
}

$boundary = '----WebKitFormBoundary' . bin2hex(random_bytes(16));
$fileContents = file_get_contents($file['tmp_name']);

$body = "--$boundary\r\n";
$body .= "Content-Disposition: form-data; name=\"file\"; filename=\"" . $file['name'] . "\"\r\n";
$body .= "Content-Type: " . ($file['type'] ?: 'application/octet-stream') . "\r\n\r\n";
$body .= $fileContents . "\r\n";
$body .= "--$boundary--\r\n";

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: multipart/form-data; boundary=$boundary\r\n" .
                    "Content-Length: " . strlen($body) . "\r\n" .
                    "User-Agent: CypherBay/1.0\r\n",
        'content' => $body,
        'timeout' => 120,
        'ignore_errors' => true
    ]
]);

$response = @file_get_contents('https://0x0.st', false, $context);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Upload to external service failed']);
    exit;
}

$url = trim($response);

if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(502);
    echo json_encode(['error' => 'Invalid response from external service', 'response' => substr($response, 0, 200)]);
    exit;
}

echo json_encode(['success' => true, 'url' => $url]);
