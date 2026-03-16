<?php

namespace Tests\Feature;

use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_push_config_is_disabled_without_vapid_keys(): void
    {
        config()->set('services.webpush.public_key', null);
        config()->set('services.webpush.private_key', null);
        config()->set('services.webpush.subject', null);

        $this->getJson('/api/v1/notifications/push/config')
            ->assertOk()
            ->assertJsonPath('enabled', false)
            ->assertJsonPath('public_key', null);
    }

    public function test_public_client_can_subscribe_and_unsubscribe_for_browser_alerts(): void
    {
        $payload = [
            'endpoint' => 'https://updates.push.services.mozilla.com/wpush/v2/test-subscription',
            'expirationTime' => null,
            'keys' => [
                'p256dh' => 'BI0_2A3vMlQW0U14nq6Oa_BmM0G4-y1xKQ0l5g-9sI0nZ5tI9lO6n7vR0vV9xY8O9nB6iD4dRjR4t6hQ2xLJZ2A',
                'auth' => 'A1b2C3d4E5f6G7h8',
            ],
        ];

        $this->postJson('/api/v1/notifications/push/subscriptions', $payload)
            ->assertCreated()
            ->assertJsonPath('message', 'Browser alerts enabled for this device.');

        $this->assertDatabaseHas('push_subscriptions', [
            'endpoint_hash' => hash('sha256', $payload['endpoint']),
        ]);

        $subscription = PushSubscription::query()->firstOrFail();
        $this->assertSame($payload['endpoint'], $subscription->endpoint);

        $this->deleteJson('/api/v1/notifications/push/subscriptions', [
            'endpoint' => $payload['endpoint'],
        ])->assertOk()
            ->assertJsonPath('message', 'Browser alerts disabled for this device.');

        $this->assertDatabaseCount('push_subscriptions', 0);
    }
}
