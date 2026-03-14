<?php

namespace App\Support;

class EmbeddedVideo
{
    public static function extractYoutubeVideoId(?string $url): ?string
    {
        $value = trim((string) $url);
        if ($value === '') {
            return null;
        }

        $parts = parse_url($value);
        if (!$parts || !isset($parts['host'])) {
            return null;
        }

        $host = strtolower((string) $parts['host']);
        $path = trim((string) ($parts['path'] ?? ''), '/');
        parse_str((string) ($parts['query'] ?? ''), $query);

        if (!in_array($host, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'], true)) {
            return null;
        }

        $videoId = null;

        if ($host === 'youtu.be' && $path !== '') {
            $videoId = explode('/', $path)[0];
        } elseif ($path === 'watch' && isset($query['v'])) {
            $videoId = (string) $query['v'];
        } elseif (str_starts_with($path, 'embed/')) {
            $videoId = explode('/', substr($path, strlen('embed/')))[0] ?: null;
        } elseif (str_starts_with($path, 'shorts/')) {
            $videoId = explode('/', substr($path, strlen('shorts/')))[0] ?: null;
        } elseif (str_starts_with($path, 'live/')) {
            $videoId = explode('/', substr($path, strlen('live/')))[0] ?: null;
        }

        return $videoId && preg_match('/^[A-Za-z0-9_-]{6,20}$/', $videoId) ? $videoId : null;
    }

    public static function youtubeThumbnailUrl(?string $sourceUrl, ?string $embedUrl = null): ?string
    {
        $videoId = self::extractYoutubeVideoId($sourceUrl) ?? self::extractYoutubeVideoId($embedUrl);

        return $videoId ? 'https://i.ytimg.com/vi/' . $videoId . '/hqdefault.jpg' : null;
    }

    public static function fromInputUrl(?string $url): ?array
    {
        $value = trim((string) $url);
        if ($value === '') {
            return null;
        }

        $parts = parse_url($value);
        if (!$parts || !isset($parts['host'])) {
            return null;
        }

        $host = strtolower((string) $parts['host']);
        $path = trim((string) ($parts['path'] ?? ''), '/');
        parse_str((string) ($parts['query'] ?? ''), $query);

        if (in_array($host, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'], true)) {
            $videoId = self::extractYoutubeVideoId($value);

            if ($videoId) {
                return [
                    'provider' => 'youtube',
                    'source_url' => $value,
                    'embed_url' => 'https://www.youtube.com/embed/' . $videoId,
                ];
            }
        }

        if (in_array($host, ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'], true)) {
            $encoded = rawurlencode($value);

            return [
                'provider' => 'facebook',
                'source_url' => $value,
                'embed_url' => 'https://www.facebook.com/plugins/video.php?href=' . $encoded . '&show_text=false',
            ];
        }

        return null;
    }

    public static function fromEmbedUrl(?string $url): ?array
    {
        $value = trim((string) $url);
        if ($value === '') {
            return null;
        }

        $parts = parse_url($value);
        if (!$parts || !isset($parts['host'])) {
            return null;
        }

        $host = strtolower((string) $parts['host']);
        $path = trim((string) ($parts['path'] ?? ''), '/');
        parse_str((string) ($parts['query'] ?? ''), $query);

        if (in_array($host, ['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'], true)
            && str_starts_with($path, 'embed/')) {
            $videoId = self::extractYoutubeVideoId($value);
            if ($videoId) {
                return [
                    'provider' => 'youtube',
                    'source_url' => 'https://www.youtube.com/watch?v=' . $videoId,
                    'embed_url' => 'https://www.youtube.com/embed/' . $videoId,
                ];
            }
        }

        if (in_array($host, ['facebook.com', 'www.facebook.com'], true) && $path === 'plugins/video.php') {
            $href = isset($query['href']) ? urldecode((string) $query['href']) : '';
            return self::fromInputUrl($href);
        }

        return null;
    }
}
