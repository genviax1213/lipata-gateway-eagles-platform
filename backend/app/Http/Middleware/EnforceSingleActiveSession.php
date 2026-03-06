<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\TransientToken;
use Symfony\Component\HttpFoundation\Response;

class EnforceSingleActiveSession
{
    private const INACTIVITY_MINUTES = 30;

    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $user */
        $user = $request->user();
        if (!$user) {
            return $next($request);
        }

        if ($this->isInactive($user)) {
            $this->terminateCurrentSession($request, $user, true);

            return response()->json([
                'message' => 'You have been logged out due to 30 minutes of inactivity.',
                'code' => 'session_inactive',
            ], 401);
        }

        if ($this->wasReplacedByAnotherLogin($request, $user)) {
            $this->terminateCurrentSession($request, $user, false);

            return response()->json([
                'message' => 'You have been logged out because this account logged in on another device or browser.',
                'code' => 'session_replaced',
            ], 401);
        }

        $user->forceFill([
            'last_activity_at' => now(),
        ])->saveQuietly();

        return $next($request);
    }

    private function isInactive(User $user): bool
    {
        if (!$user->last_activity_at) {
            return false;
        }

        $last = $user->last_activity_at instanceof Carbon
            ? $user->last_activity_at
            : Carbon::parse((string) $user->last_activity_at);

        return now()->diffInMinutes($last, true) >= self::INACTIVITY_MINUTES;
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

        return !hash_equals($activeSessionId, $currentSessionId);
    }

    private function terminateCurrentSession(Request $request, User $user, bool $clearAllTokens): void
    {
        $token = $user->currentAccessToken();
        if ($token) {
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
