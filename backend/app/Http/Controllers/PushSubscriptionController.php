<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    public function config()
    {
        $publicKey = trim((string) config('services.webpush.public_key'));
        $privateKey = trim((string) config('services.webpush.private_key'));
        $subject = trim((string) config('services.webpush.subject'));

        return response()->json([
            'enabled' => $publicKey !== '' && $privateKey !== '' && $subject !== '',
            'public_key' => $publicKey !== '' ? $publicKey : null,
            'service_worker_path' => '/announcement-sw.js',
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'endpoint' => 'required|url|max:4000',
            'expirationTime' => 'nullable|numeric',
            'keys.p256dh' => 'required|string|max:4096',
            'keys.auth' => 'required|string|max:1024',
        ]);

        $endpoint = (string) $validated['endpoint'];
        $subscription = PushSubscription::query()->updateOrCreate(
            ['endpoint_hash' => hash('sha256', $endpoint)],
            [
                'endpoint' => $endpoint,
                'public_key' => (string) data_get($validated, 'keys.p256dh'),
                'auth_token' => (string) data_get($validated, 'keys.auth'),
                'content_encoding' => 'aes128gcm',
                'subscribed_at' => now(),
                'user_agent' => substr((string) $request->userAgent(), 0, 512),
            ]
        );

        return response()->json([
            'id' => $subscription->id,
            'message' => 'Browser alerts enabled for this device.',
        ], 201);
    }

    public function destroy(Request $request)
    {
        $validated = $request->validate([
            'endpoint' => 'required|url|max:4000',
        ]);

        PushSubscription::query()
            ->where('endpoint_hash', hash('sha256', (string) $validated['endpoint']))
            ->delete();

        return response()->json([
            'message' => 'Browser alerts disabled for this device.',
        ]);
    }
}
