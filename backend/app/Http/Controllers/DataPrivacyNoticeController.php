<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class DataPrivacyNoticeController extends Controller
{
    public const CURRENT_NOTICE_VERSION = '2026-03-21';

    public function acknowledge(Request $request)
    {
        $validated = $request->validate([
            'acknowledged' => ['required', 'accepted'],
        ]);

        $user = $request->user();
        $user->forceFill([
            'data_privacy_notice_acknowledged_at' => now(),
            'data_privacy_notice_acknowledged_version' => self::CURRENT_NOTICE_VERSION,
        ])->saveQuietly();

        return response()->json([
            'message' => 'Data privacy notice acknowledged.',
            'acknowledged' => (bool) $validated['acknowledged'],
            'data_privacy_notice_acknowledged_at' => optional($user->data_privacy_notice_acknowledged_at)?->toIso8601String(),
            'data_privacy_notice_acknowledged_version' => $user->data_privacy_notice_acknowledged_version,
            'data_privacy_notice_version_required' => self::CURRENT_NOTICE_VERSION,
        ]);
    }
}
