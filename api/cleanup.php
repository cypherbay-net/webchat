<?php
if (php_sapi_name() !== 'cli') {
    http_response_code(404);
    exit;
}

$dataDir = __DIR__ . '/../data/sessions';

if (!is_dir($dataDir)) {
    exit;
}

$files = glob($dataDir . '/*.json');

$now = time();
$maxAge = 3600;

foreach ($files as $file) {
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    
    if ($data && isset($data['lastActivity'])) {
        $age = $now - $data['lastActivity'];
        
        if ($age > $maxAge) {
            unlink($file);
        }
    } else {
        $fileAge = $now - filemtime($file);
        
        if ($fileAge > $maxAge) {
            unlink($file);
        }
    }
}

$ratelimitDir = __DIR__ . '/../data/ratelimit';
if (is_dir($ratelimitDir)) {
    foreach (glob($ratelimitDir . '/*.json') as $file) {
        if ($now - filemtime($file) > 3600) {
            unlink($file);
        }
    }
}

echo "Cleanup completed\n";
