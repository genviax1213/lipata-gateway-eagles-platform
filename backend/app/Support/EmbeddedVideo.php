<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;

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

    public static function facebookThumbnailUrl(?string $sourceUrl): ?string
    {
        $value = trim((string) $sourceUrl);
        if ($value === '') {
            return null;
        }

        try {
            $response = Http::timeout(5)
                ->withHeaders([
                    'User-Agent' => 'LGEC-CMS/1.0 (+https://lgec.org)',
                    'Accept-Language' => 'en-US,en;q=0.9',
                ])
                ->get($value);
        } catch (\Throwable) {
            return null;
        }

        if (!$response->successful()) {
            return null;
        }

        return self::extractThumbnailFromHtml((string) $response->body());
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

    private static function extractThumbnailFromHtml(string $html): ?string
    {
        if ($html === '') {
            return null;
        }

        $patterns = [
            '/<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']/i',
            '/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::secure_url)?["\']/i',
            '/<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)["\']/i',
            '/<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image(?::src)?["\']/i',
        ];

        foreach ($patterns as $pattern) {
            if (!preg_match($pattern, $html, $matches)) {
                continue;
            }

            $candidate = html_entity_decode(trim((string) ($matches[1] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if (filter_var($candidate, FILTER_VALIDATE_URL)) {
                return $candidate;
            }
        }

        return null;
    }
}
