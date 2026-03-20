<?php

namespace App\Http\Controllers;

use App\Models\VisitorPageView;
use App\Models\VisitorSession;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class VisitorAnalyticsController extends Controller
{
    private const LIVE_WINDOW_MINUTES = 5;

    public function track(Request $request)
    {
        $validated = $request->validate([
            'visitor_token' => ['required', 'string', 'max:100'],
            'session_token' => ['required', 'string', 'max:100'],
            'path' => ['required', 'string', 'max:512'],
            'title' => ['nullable', 'string', 'max:255'],
            'referrer' => ['nullable', 'string', 'max:1024'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'screen_width' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'screen_height' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'occurred_at' => ['nullable', 'date'],
            'event_type' => ['required', Rule::in(['page_view', 'heartbeat'])],
        ]);

        $occurredAt = isset($validated['occurred_at'])
            ? CarbonImmutable::parse((string) $validated['occurred_at'])
            : CarbonImmutable::now();

        $user = $request->user();
        $session = VisitorSession::query()->firstOrNew([
            'session_token' => $validated['session_token'],
        ]);

        if (!$session->exists) {
            $session->first_seen_at = $occurredAt;
            $session->total_page_views = 0;
        }

        $session->fill([
            'visitor_token' => $validated['visitor_token'],
            'user_id' => $user?->id,
            'is_authenticated' => $user !== null,
            'ip_hash' => $this->hashIp($request),
            'user_agent' => $request->userAgent(),
            'timezone' => $validated['timezone'] ?? null,
            'screen_width' => $validated['screen_width'] ?? null,
            'screen_height' => $validated['screen_height'] ?? null,
            'last_page_path' => $validated['path'],
            'last_page_title' => $validated['title'] ?? null,
            'last_referrer' => $validated['referrer'] ?? null,
            'last_seen_at' => $occurredAt,
        ]);
        $session->save();

        if ($validated['event_type'] === 'page_view') {
            VisitorPageView::query()->create([
                'visitor_session_id' => $session->id,
                'visitor_token' => $validated['visitor_token'],
                'user_id' => $user?->id,
                'path' => $validated['path'],
                'page_title' => $validated['title'] ?? null,
                'referrer' => $validated['referrer'] ?? null,
                'event_type' => 'page_view',
                'viewed_at' => $occurredAt,
                'is_authenticated' => $user !== null,
            ]);

            $session->increment('total_page_views');
        }

        return response()->json([
            'ok' => true,
            'tracked_at' => $occurredAt->toIso8601String(),
        ], 202);
    }

    public function overview(Request $request)
    {
        $validated = $request->validate([
            'window_days' => ['nullable', 'integer', 'min:1', 'max:90'],
        ]);

        $windowDays = (int) ($validated['window_days'] ?? 7);
        $now = CarbonImmutable::now();
        $liveThreshold = $now->subMinutes(self::LIVE_WINDOW_MINUTES);
        $todayStart = $now->startOfDay();
        $windowStart = $now->subDays($windowDays - 1)->startOfDay();

        $liveSessionsQuery = VisitorSession::query()
            ->with(['user.role:id,name', 'user:id,name,email,role_id'])
            ->where('last_seen_at', '>=', $liveThreshold);

        $liveSessions = (clone $liveSessionsQuery)
            ->orderByDesc('is_authenticated')
            ->orderByDesc('last_seen_at')
            ->limit(25)
            ->get();

        $liveAuthenticatedUsers = (clone $liveSessionsQuery)
            ->whereNotNull('user_id')
            ->whereHas('user')
            ->get()
            ->groupBy('user_id')
            ->map(function ($sessions) {
                /** @var \App\Models\VisitorSession $latest */
                $latest = $sessions->sortByDesc('last_seen_at')->first();

                return [
                    'user_id' => $latest->user_id,
                    'name' => $latest->user?->name,
                    'email' => $latest->user?->email,
                    'role' => $latest->user?->role?->name,
                    'last_page_path' => $latest->last_page_path,
                    'last_page_title' => $latest->last_page_title,
                    'last_seen_at' => optional($latest->last_seen_at)?->toIso8601String(),
                    'open_sessions' => $sessions->count(),
                ];
            })
            ->sortByDesc('last_seen_at')
            ->values();

        $topPages = VisitorPageView::query()
            ->select([
                'path',
                DB::raw('COUNT(*) as views'),
                DB::raw('COUNT(DISTINCT visitor_token) as unique_visitors'),
                DB::raw('MAX(viewed_at) as last_viewed_at'),
            ])
            ->where('viewed_at', '>=', $windowStart)
            ->groupBy('path')
            ->orderByDesc('views')
            ->limit(10)
            ->get()
            ->map(fn (VisitorPageView $view) => [
                'path' => $view->path,
                'views' => (int) $view->views,
                'unique_visitors' => (int) $view->unique_visitors,
                'last_viewed_at' => $view->last_viewed_at,
            ]);

        $recentActivity = VisitorPageView::query()
            ->with(['user.role:id,name', 'user:id,name,email,role_id', 'session:id,session_token,visitor_token'])
            ->latest('viewed_at')
            ->limit(20)
            ->get()
            ->map(function (VisitorPageView $pageView) {
                return [
                    'id' => $pageView->id,
                    'path' => $pageView->path,
                    'page_title' => $pageView->page_title,
                    'referrer' => $pageView->referrer,
                    'viewed_at' => optional($pageView->viewed_at)?->toIso8601String(),
                    'visitor_token' => $pageView->visitor_token,
                    'session_token' => $pageView->session?->session_token,
                    'is_authenticated' => $pageView->is_authenticated,
                    'user' => $pageView->user ? [
                        'id' => $pageView->user->id,
                        'name' => $pageView->user->name,
                        'email' => $pageView->user->email,
                        'role' => $pageView->user->role?->name,
                    ] : null,
                ];
            });

        return response()->json([
            'summary' => [
                'live_visitors' => VisitorSession::query()->where('last_seen_at', '>=', $liveThreshold)->count(),
                'live_authenticated_visitors' => VisitorSession::query()->where('last_seen_at', '>=', $liveThreshold)->whereNotNull('user_id')->count(),
                'today_page_views' => VisitorPageView::query()->where('viewed_at', '>=', $todayStart)->count(),
                'today_unique_visitors' => (int) VisitorPageView::query()->where('viewed_at', '>=', $todayStart)->distinct('visitor_token')->count('visitor_token'),
                'window_days' => $windowDays,
                'window_page_views' => VisitorPageView::query()->where('viewed_at', '>=', $windowStart)->count(),
                'window_unique_visitors' => (int) VisitorPageView::query()->where('viewed_at', '>=', $windowStart)->distinct('visitor_token')->count('visitor_token'),
            ],
            'live_sessions' => $liveSessions->map(function (VisitorSession $session) {
                return [
                    'id' => $session->id,
                    'visitor_token' => $session->visitor_token,
                    'session_token' => $session->session_token,
                    'user_id' => $session->user_id,
                    'is_authenticated' => $session->is_authenticated,
                    'current_page_path' => $session->last_page_path,
                    'current_page_title' => $session->last_page_title,
                    'referrer' => $session->last_referrer,
                    'timezone' => $session->timezone,
                    'screen_width' => $session->screen_width,
                    'screen_height' => $session->screen_height,
                    'first_seen_at' => optional($session->first_seen_at)?->toIso8601String(),
                    'last_seen_at' => optional($session->last_seen_at)?->toIso8601String(),
                    'total_page_views' => $session->total_page_views,
                    'user' => $session->user ? [
                        'id' => $session->user->id,
                        'name' => $session->user->name,
                        'email' => $session->user->email,
                        'role' => $session->user->role?->name,
                    ] : null,
                ];
            })->values(),
            'live_authenticated_users' => $liveAuthenticatedUsers,
            'top_pages' => $topPages,
            'recent_activity' => $recentActivity,
            'meta' => [
                'generated_at' => $now->toIso8601String(),
                'live_window_minutes' => self::LIVE_WINDOW_MINUTES,
            ],
        ]);
    }

    private function hashIp(Request $request): ?string
    {
        $ip = $request->ip();
        $key = (string) config('app.key');

        if (!$ip || $key === '') {
            return null;
        }

        return hash_hmac('sha256', $ip, $key);
    }
}
