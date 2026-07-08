<?php
function enforceRateLimit($maxRequests, $windowSeconds, $key = '') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $hash = hash('sha256', $ip . $key);
    $dir = __DIR__ . '/../data/ratelimit';

    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    if (!is_dir($dir)) {
        return true; // не удалось создать директорию — пропускаем запрос, а не падаем
    }

    $file = $dir . '/' . substr($hash, 0, 40) . '.json';
    $now = time();

    $fp = @fopen($file, 'c+');
    if (!$fp) {
        return true;
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return true;
    }

    $content = stream_get_contents($fp);
    $data = $content ? json_decode($content, true) : null;

    if (!$data || ($now - $data['window_start']) >= $windowSeconds) {
        $data = ['count' => 0, 'window_start' => $now];
    }

    $data['count']++;
    $allowed = $data['count'] <= $maxRequests;

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    return $allowed;
}
