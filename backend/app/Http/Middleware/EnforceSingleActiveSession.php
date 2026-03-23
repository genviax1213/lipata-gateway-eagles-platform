<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\RoleHierarchy;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\TransientToken;
use Symfony\Component\HttpFoundation\Response;

class EnforceSingleActiveSession
{
    private const DEFAULT_INACTIVITY_MINUTES = 30;
    private const PRIVILEGED_INACTIVITY_MINUTES = 10;

    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();
        if (!$user) {
            return $next($request);
        }

        if ($this->isInactive($user)) {
            $minutes = $this->inactivityTimeoutMinutes($user);
            Log::warning('auth.session_inactive', [
                'user_id' => $user->id,
                'path' => $request->path(),
                'minutes' => $minutes,
                'last_activity_at' => optional($user->last_activity_at)->toISOString(),
                'has_session' => $request->hasSession(),
            ]);
            $this->terminateCurrentSession($request, $user, true);

            return response()->json([
                'message' => "You have been logged out due to {$minutes} minutes of inactivity.",
                'code' => 'session_inactive',
            ], 401);
        }

        if ($this->wasReplacedByAnotherLogin($request, $user)) {
            Log::warning('auth.session_replaced', [
                'user_id' => $user->id,
                'path' => $request->path(),
                'active_session_id' => (string) ($user->active_session_id ?? ''),
                'current_session_id' => $request->hasSession() ? (string) $request->session()->getId() : '',
                'active_token_id' => (int) ($user->active_token_id ?? 0),
                'has_session' => $request->hasSession(),
            ]);
            $this->terminateCurrentSession($request, $user, false);

            return response()->json([
                'message' => 'You have been logged out because this account logged in on another device or browser.',
                'code' => 'session_replaced',
            ], 401);
        }

        $timestamp = now();
        User::query()->whereKey($user->id)->update([
            'last_activity_at' => $timestamp,
        ]);
        $user->setAttribute('last_activity_at', $timestamp);

        return $next($request);
    }

    private function isInactive(User $user): bool
    {
        if (!$this->shouldEnforceInactivityTimeout($user)) {
            return false;
        }

        if (!$user->last_activity_at) {
            return false;
        }

        $last = $user->last_activity_at instanceof Carbon
            ? $user->last_activity_at
            : Carbon::parse((string) $user->last_activity_at);

        return now()->diffInMinutes($last, true) >= $this->inactivityTimeoutMinutes($user);
    }

    private function inactivityTimeoutMinutes(User $user): int
    {
        $user->loadMissing('role:id,name');

        $primaryRole = (string) ($user->role?->name ?? '');
        if (in_array($primaryRole, [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN], true)) {
            return self::PRIVILEGED_INACTIVITY_MINUTES;
        }

        if (in_array((string) ($user->finance_role ?? ''), [
            RoleHierarchy::FINANCE_TREASURER,
            RoleHierarchy::FINANCE_AUDITOR,
        ], true)) {
            return self::DEFAULT_INACTIVITY_MINUTES;
        }

        return 0;
    }

    private function shouldEnforceInactivityTimeout(User $user): bool
    {
        return $this->inactivityTimeoutMinutes($user) > 0;
    }

    private function wasReplacedByAnotherLogin(Request $request, User $user): bool
    {
        $token = $user->currentAccessToken();
        if ($token && !$token instanceof TransientToken) {
            if ((int) ($user->active_token_id ?? 0) === 0) {
                return false;
            }

            return (int) ($user->active_token_id ?? 0) !== (int) $token->id;
        }

        if (!$request->hasSession()) {
            return false;
        }

        $currentSessionId = (string) $request->session()->getId();
        $activeSessionId = (string) ($user->active_session_id ?? '');

        if ($activeSessionId === '' || $currentSessionId === '') {
            return false;
        }

        if (!hash_equals($activeSessionId, $currentSessionId) && $this->shouldHealBrowserSessionId($activeSessionId, $currentSessionId)) {
            Log::info('auth.session_id_healed', [
                'active_session_id' => $activeSessionId,
                'current_session_id' => $currentSessionId,
            ]);
            User::query()->whereKey($user->id)->update([
                'active_session_id' => $currentSessionId,
            ]);
            $user->setAttribute('active_session_id', $currentSessionId);

            return false;
        }

        return !hash_equals($activeSessionId, $currentSessionId);
    }

    private function shouldHealBrowserSessionId(string $activeSessionId, string $currentSessionId): bool
    {
        $sessionTable = (string) config('session.table', 'sessions');

        $activeSessionExists = DB::table($sessionTable)
            ->where('id', $activeSessionId)
            ->exists();

        if ($activeSessionExists) {
            return false;
        }

        return DB::table($sessionTable)
            ->where('id', $currentSessionId)
            ->exists();
    }

    private function terminateCurrentSession(Request $request, User $user, bool $clearAllTokens): void
    {
        $token = $user->currentAccessToken();
        if ($token && !$token instanceof TransientToken) {
            $token->delete();
        } elseif ($clearAllTokens) {
            $user->tokens()->delete();
        }

        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }
}
