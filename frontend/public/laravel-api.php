<?php

define('LARAVEL_START', microtime(true));

$candidates = [
    __DIR__ . '/../../../app/lipata-gateway-eagles-platform/backend/public/index.php',
    __DIR__ . '/../app/lipata-gateway-eagles-platform/backend/public/index.php',
];

foreach ($candidates as $indexPath) {
    if (is_file($indexPath)) {
        require $indexPath;
        return;
    }
}

http_response_code(500);
header('Content-Type: application/json');
echo json_encode([
    'message' => 'Laravel API front controller is missing.',
]);
