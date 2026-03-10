<?php

namespace App\Http\Controllers;

use App\Models\SiteSetting;
use App\Support\EmbeddedVideo;
use App\Support\RoleHierarchy;
use Illuminate\Http\Request;

class HomepageVideoController extends Controller
{
    private const SETTING_KEY = 'homepage_reputation_video';
    private const MAX_VIDEOS = 3;

    public function show(): \Illuminate\Http\JsonResponse
    {
        return response()->json($this->payload());
    }

    public function update(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->user()->loadMissing('role:id,name');
        if (!RoleHierarchy::canManageUsers((string) optional($request->user()->role)->name)) {
            return response()->json([
                'message' => 'Only superadmin and admin can manage the homepage reputation video.',
            ], 403);
        }

        $validated = $request->validate([
            'videos' => 'nullable|array|max:' . self::MAX_VIDEOS,
            'videos.*.video_url' => 'nullable|string|max:2048',
            'videos.*.title' => 'nullable|string|max:120',
            'videos.*.caption' => 'nullable|string|max:220',
            'videos.*.thumbnail_url' => 'nullable|url|max:2048',
        ]);

        $videos = [];
        foreach (($validated['videos'] ?? []) as $item) {
            $videoUrl = trim((string) ($item['video_url'] ?? ''));
            $title = trim((string) ($item['title'] ?? ''));
            $caption = trim((string) ($item['caption'] ?? ''));
            $thumbnailUrl = trim((string) ($item['thumbnail_url'] ?? ''));

            if ($videoUrl === '' && $title === '' && $caption === '' && $thumbnailUrl === '') {
                continue;
            }

            $video = EmbeddedVideo::fromInputUrl($videoUrl);
            if (!$video) {
                return response()->json([
                    'message' => 'Only YouTube and Facebook video links are allowed for the homepage reputation video.',
                ], 422);
            }

            $videos[] = [
                'title' => $title !== '' ? $title : null,
                'caption' => $caption !== '' ? $caption : null,
                'thumbnail_url' => $thumbnailUrl !== '' ? $thumbnailUrl : null,
                'provider' => $video['provider'] ?? null,
                'source_url' => $video['source_url'] ?? null,
                'embed_url' => $video['embed_url'] ?? null,
            ];
        }

        if ($videos === []) {
            SiteSetting::query()->where('key', self::SETTING_KEY)->delete();

            return response()->json($this->payload());
        }

        $value = [
            'videos' => array_slice($videos, 0, self::MAX_VIDEOS),
        ];

        SiteSetting::query()->updateOrCreate(
            ['key' => self::SETTING_KEY],
            ['value' => $value, 'updated_at' => now()]
        );

        return response()->json($this->payload());
    }

    private function payload(): array
    {
        /** @var SiteSetting|null $setting */
        $setting = SiteSetting::query()->where('key', self::SETTING_KEY)->first();
        $value = is_array($setting?->value) ? $setting->value : [];

        $videos = [];
        if (isset($value['videos']) && is_array($value['videos'])) {
            foreach ($value['videos'] as $item) {
                if (!is_array($item)) {
                    continue;
                }

                if (!isset($item['embed_url']) || !is_string($item['embed_url']) || trim($item['embed_url']) === '') {
                    continue;
                }

                $videos[] = [
                    'title' => $item['title'] ?? null,
                    'caption' => $item['caption'] ?? null,
                    'thumbnail_url' => $item['thumbnail_url'] ?? null,
                    'provider' => $item['provider'] ?? null,
                    'source_url' => $item['source_url'] ?? null,
                    'embed_url' => $item['embed_url'] ?? null,
                ];
            }
        } elseif (($value['embed_url'] ?? null) || ($value['source_url'] ?? null)) {
            $videos[] = [
                'title' => $value['title'] ?? null,
                'caption' => $value['caption'] ?? null,
                'thumbnail_url' => $value['thumbnail_url'] ?? null,
                'provider' => $value['provider'] ?? null,
                'source_url' => $value['source_url'] ?? null,
                'embed_url' => $value['embed_url'] ?? null,
            ];
        }

        return [
            'videos' => array_slice($videos, 0, self::MAX_VIDEOS),
            'updated_at' => optional($setting?->updated_at)?->toISOString(),
        ];
    }
}
