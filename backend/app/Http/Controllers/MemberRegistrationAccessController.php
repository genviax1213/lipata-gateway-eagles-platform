<?php

namespace App\Http\Controllers;

use App\Models\MemberRegistration;
use App\Models\MemberRegistrationAccessEvent;
use App\Models\User;
use App\Support\RoleHierarchy;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class MemberRegistrationAccessController extends Controller
{
    public function track(Request $request)
    {
        $validated = $request->validate([
            'visitor_token' => ['nullable', 'string', 'max:100'],
            'session_token' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'event_type' => ['required', 'string', 'max:50'],
            'status' => ['required', 'string', 'max:40'],
            'route_path' => ['nullable', 'string', 'max:255'],
            'tab' => ['nullable', 'string', 'max:30'],
            'message' => ['nullable', 'string', 'max:2000'],
            'occurred_at' => ['nullable', 'date'],
        ]);

        $normalizedEmail = isset($validated['email'])
            ? $this->normalizeEmail((string) $validated['email'])
            : null;
        $occurredAt = isset($validated['occurred_at'])
            ? CarbonImmutable::parse((string) $validated['occurred_at'])
            : CarbonImmutable::now();
        $registration = $normalizedEmail
            ? MemberRegistration::query()->where('email', $normalizedEmail)->latest('id')->first()
            : null;

        MemberRegistrationAccessEvent::query()->create([
            'user_id' => $request->user()?->id,
            'member_registration_id' => $registration?->id,
            'visitor_token' => $validated['visitor_token'] ?? null,
            'session_token' => $validated['session_token'] ?? null,
            'email' => $normalizedEmail,
            'event_type' => (string) $validated['event_type'],
            'status' => (string) $validated['status'],
            'route_path' => (string) ($validated['route_path'] ?? '/member-registration'),
            'tab' => $validated['tab'] ?? null,
            'message' => $validated['message'] ?? null,
            'ip_hash' => $this->hashIp($request),
            'user_agent' => substr((string) $request->userAgent(), 0, 512),
            'occurred_at' => $occurredAt,
        ]);

        return response()->json([
            'ok' => true,
            'tracked_at' => $occurredAt->toIso8601String(),
        ], 202);
    }

    public function index(Request $request)
    {
        /** @var User $user */
        $user = $request->user()->loadMissing('role');
        abort_unless(($user->role?->name ?? null) === RoleHierarchy::SUPERADMIN, 403);

        $limit = max(10, min(200, (int) $request->query('limit', 50)));
        $events = MemberRegistrationAccessEvent::query()
            ->with(['memberRegistration:id,email,status,completed_at,email_verified_at', 'user:id,name,email'])
            ->latest('occurred_at')
            ->latest('id')
            ->limit($limit)
            ->get();

        $actors = $events
            ->groupBy(function (MemberRegistrationAccessEvent $event): string {
                if ($event->email) {
                    return 'email:' . $event->email;
                }

                if ($event->session_token) {
                    return 'session:' . $event->session_token;
                }

                return 'event:' . $event->id;
            })
            ->map(function ($group) {
                /** @var MemberRegistrationAccessEvent $latest */
                $latest = $group->sortByDesc('occurred_at')->sortByDesc('id')->first();
                $registration = $latest->memberRegistration;
                $currentStatus = $registration?->status === MemberRegistration::STATUS_COMPLETED
                    ? 'completed'
                    : ($registration?->status === MemberRegistration::STATUS_PENDING_VERIFICATION
                        ? 'pending_verification'
                        : $latest->status);

                return [
                    'actor_key' => $latest->email ?: ($latest->session_token ?: ('event-' . $latest->id)),
                    'display_name' => $latest->user?->name ?: ($latest->email ?: ('Anonymous ' . substr((string) ($latest->visitor_token ?: $latest->session_token ?: $latest->id), 0, 8))),
                    'email' => $latest->email,
                    'current_status' => $currentStatus,
                    'latest_event_type' => $latest->event_type,
                    'latest_message' => $latest->message,
                    'last_accessed_at' => optional($latest->occurred_at)?->toIso8601String(),
                    'route_path' => $latest->route_path,
                    'tab' => $latest->tab,
                    'registration' => $registration ? [
                        'id' => $registration->id,
                        'status' => $registration->status,
                        'completed_at' => optional($registration->completed_at)?->toIso8601String(),
                        'email_verified_at' => optional($registration->email_verified_at)?->toIso8601String(),
                    ] : null,
                    'event_count' => $group->count(),
                ];
            })
            ->sortByDesc('last_accessed_at')
            ->values();

        $summary = [
            'total_access_records' => $events->count(),
            'unique_actors' => $actors->count(),
            'completed' => $actors->where('current_status', 'completed')->count(),
            'pending_verification' => $actors->where('current_status', 'pending_verification')->count(),
            'not_verified' => $actors->where('current_status', 'not_verified')->count(),
            'error' => $actors->where('current_status', 'error')->count(),
            'viewed' => $actors->where('current_status', 'viewed')->count(),
        ];

        return response()->json([
            'summary' => $summary,
            'actors' => $actors,
            'events' => $events->map(function (MemberRegistrationAccessEvent $event) {
                return [
                    'id' => $event->id,
                    'email' => $event->email,
                    'event_type' => $event->event_type,
                    'status' => $event->status,
                    'message' => $event->message,
                    'tab' => $event->tab,
                    'route_path' => $event->route_path,
                    'occurred_at' => optional($event->occurred_at)?->toIso8601String(),
                    'user' => $event->user ? [
                        'id' => $event->user->id,
                        'name' => $event->user->name,
                        'email' => $event->user->email,
                    ] : null,
                ];
            }),
        ]);
    }

    private function normalizeEmail(string $value): string
    {
        return mb_strtolower(trim($value));
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
