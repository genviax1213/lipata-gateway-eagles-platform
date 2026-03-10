<?php

namespace App\Http\Controllers;

use App\Models\SiteSetting;
use App\Support\EmbeddedVideo;
use App\Support\RoleHierarchy;
use Illuminate\Http\Request;

class HomepageVideoController extends Controller
{
    private const SETTING_KEY = 'homepage_reputation_video';

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
            'video_url' => 'nullable|string|max:2048',
            'title' => 'nullable|string|max:120',
            'caption' => 'nullable|string|max:220',
            'thumbnail_url' => 'nullable|url|max:2048',
        ]);

        $video = EmbeddedVideo::fromInputUrl($validated['video_url'] ?? null);
        if (($validated['video_url'] ?? null) && !$video) {
            return response()->json([
                'message' => 'Only YouTube and Facebook video links are allowed for the homepage reputation video.',
            ], 422);
        }

        if (!$video && trim((string) ($validated['title'] ?? '')) === '' && trim((string) ($validated['caption'] ?? '')) === '' && trim((string) ($validated['thumbnail_url'] ?? '')) === '') {
            SiteSetting::query()->where('key', self::SETTING_KEY)->delete();

            return response()->json($this->payload());
        }

        $value = [
            'title' => trim((string) ($validated['title'] ?? '')) ?: null,
            'caption' => trim((string) ($validated['caption'] ?? '')) ?: null,
            'thumbnail_url' => trim((string) ($validated['thumbnail_url'] ?? '')) ?: null,
            'provider' => $video['provider'] ?? null,
            'source_url' => $video['source_url'] ?? null,
            'embed_url' => $video['embed_url'] ?? null,
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

        return [
            'title' => $value['title'] ?? null,
            'caption' => $value['caption'] ?? null,
            'thumbnail_url' => $value['thumbnail_url'] ?? null,
            'provider' => $value['provider'] ?? null,
            'source_url' => $value['source_url'] ?? null,
            'embed_url' => $value['embed_url'] ?? null,
            'updated_at' => optional($setting?->updated_at)?->toISOString(),
        ];
    }
}
