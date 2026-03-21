<?php

namespace App\Services;

use App\Models\Post;
use App\Models\PushSubscription;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Throwable;

class WebPushAnnouncementService
{
    public function isConfigured(): bool
    {
        return $this->vapidPublicKey() !== ''
            && $this->vapidPrivateKey() !== ''
            && $this->vapidSubject() !== '';
    }

    public function sendAnnouncement(Post $post): int
    {
        if (!$this->isConfigured()) {
            return 0;
        }

        $subscriptions = $this->eligibleSubscriptions($post)->get();
        if ($subscriptions->isEmpty()) {
            return 0;
        }

        $webPush = new WebPush([
            'VAPID' => [
                'subject' => $this->vapidSubject(),
                'publicKey' => $this->vapidPublicKey(),
                'privateKey' => $this->vapidPrivateKey(),
            ],
        ]);
        $webPush->setReuseVAPIDHeaders(true);

        $payload = json_encode([
            'title' => $post->title,
            'body' => $post->announcement_text ?: ($post->excerpt ?: 'New club announcement'),
            'url' => rtrim((string) config('app.frontend_url'), '/') . '/news/' . $post->slug,
            'tag' => 'announcement-' . $post->id,
            'icon' => rtrim((string) config('app.frontend_url'), '/') . '/images/tfoe-logo.png',
        ], JSON_UNESCAPED_SLASHES);

        if (!is_string($payload)) {
            return 0;
        }

        foreach ($subscriptions as $subscription) {
            $webPush->queueNotification(
                Subscription::create([
                    'endpoint' => $subscription->endpoint,
                    'publicKey' => $subscription->public_key,
                    'authToken' => $subscription->auth_token,
                    'contentEncoding' => $subscription->content_encoding ?: 'aes128gcm',
                ]),
                $payload
            );
        }

        $sent = 0;

        foreach ($webPush->flush() as $report) {
            $endpoint = $report->getRequest()->getUri()->__toString();
            $subscription = $subscriptions->firstWhere('endpoint', $endpoint);

            if (!$subscription) {
                continue;
            }

            if ($report->isSuccess()) {
                $subscription->forceFill([
                    'last_notified_at' => now(),
                ])->save();
                $sent++;
                continue;
            }

            if (in_array($report->getResponse()?->getStatusCode(), [404, 410], true)) {
                $subscription->delete();
                continue;
            }

            Log::warning('Web push announcement delivery failed.', [
                'post_id' => $post->id,
                'subscription_id' => $subscription->id,
                'reason' => $report->getReason(),
            ]);
        }

        return $sent;
    }

    private function eligibleSubscriptions(Post $post): Builder
    {
        $query = PushSubscription::query();

        if (($post->announcement_audience ?? 'public') !== 'members') {
            return $query;
        }

        return $query
            ->whereNotNull('user_id')
            ->whereHas('user', function (Builder $userQuery): void {
                $userQuery->where(function (Builder $memberQuery): void {
                    $memberQuery
                        ->whereHas('memberProfile')
                        ->orWhereExists(function ($subQuery): void {
                            $subQuery
                                ->selectRaw('1')
                                ->from('members')
                                ->whereRaw('LOWER(TRIM(members.email)) = LOWER(TRIM(users.email))');
                        });
                });
            })
            ->whereDoesntHave('user.postAcknowledgements', function (Builder $ackQuery) use ($post): void {
                $ackQuery->where('post_id', $post->id);
            });
    }

    private function vapidSubject(): string
    {
        return trim((string) config('services.webpush.subject'));
    }

    private function vapidPublicKey(): string
    {
        return trim((string) config('services.webpush.public_key'));
    }

    private function vapidPrivateKey(): string
    {
        return trim((string) config('services.webpush.private_key'));
    }
}
