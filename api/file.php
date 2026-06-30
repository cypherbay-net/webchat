<?php

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'");

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit;
}

$id = isset($_GET['id']) ? $_GET['id'] : '';
if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
    http_response_code(400);
    exit('Invalid file ID');
}

$uploadDir = __DIR__ . '/../data/uploads';
$dataPath  = $uploadDir . '/' . $id;

if (!file_exists($dataPath)) {
    http_response_code(404);
    exit('File not found or expired');
}

// Serve raw encrypted blob — client decrypts in browser
header('Content-Type: application/octet-stream');
header('Content-Length: ' . filesize($dataPath));
header('Content-Disposition: attachment; filename="' . $id . '.bin"');
header('Cache-Control: private, max-age=604800');

readfile($dataPath);
