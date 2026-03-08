<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Applicant;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\TransientToken;

class AuthController extends Controller
{
    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function bootstrapEmail(): string
    {
        return $this->normalizeEmail((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'));
    }

    private function isBootstrapEmail(?string $email): bool
    {
        return $this->normalizeEmail((string) $email) === $this->bootstrapEmail();
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required'
        ]);
        $credentials['email'] = $this->normalizeEmail((string) $credentials['email']);

        if (!Auth::attempt($credentials)) {
            Log::warning('auth.login_failed', [
                'email' => strtolower(trim((string) ($credentials['email'] ?? ''))),
                'ip' => $request->ip(),
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        /** @var User $user */
        $user = Auth::user()->load('role.permissions:id,name');

        // Enforce single active login across devices/browsers.
        $user->tokens()->delete();
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        $application = Applicant::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [strtolower(trim((string) $user->email))])
            ->latest('id')
            ->first();

        if ($application && (($application->decision_status ?? null) === 'rejected' || ($application->decision_status ?? null) === 'withdrawn' || $application->is_login_blocked)) {
            Auth::logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }
            $blockedMessage = match ($application->decision_status) {
                'withdrawn' => 'Your membership application was withdrawn. Login access is blocked.',
                'rejected' => 'Your application was rejected. Login access is blocked.',
                default => 'Login access is blocked for this account.',
            };
            Log::warning('auth.login_blocked', [
                'user_id' => $user->id,
                'application_id' => $application->id,
                'reason' => $application->decision_status,
                'ip' => $request->ip(),
            ]);
            return response()->json([
                'message' => $blockedMessage,
            ], 403);
        }

        $token = null;
        $activeTokenId = null;
        if (strtolower((string) $request->header('X-Auth-Mode', '')) === 'token') {
            $createdToken = $user->createToken('auth_token');
            $token = $createdToken->plainTextToken;
            $activeTokenId = $createdToken->accessToken->id;
        }

        $activeSessionId = $request->hasSession() ? $request->session()->getId() : null;
        $user->forceFill([
            'active_session_id' => $activeSessionId,
            'active_token_id' => $activeTokenId,
            'last_activity_at' => now(),
        ])->saveQuietly();

        Log::info('auth.login_success', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
            'auth_mode' => $token ? 'token' : 'session',
        ]);

        $payload = [
            'user' => $user,
        ];
        if ($token) {
            $payload['token'] = $token;
        }

        return response()->json($payload);
    }

    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);
        $validated['email'] = $this->normalizeEmail((string) $validated['email']);

        $user = User::query()->where('email', $validated['email'])->first();
        if ($user && !$this->isBootstrapEmail($user->email)) {
            $token = Password::broker()->createToken($user);
            $user->sendPasswordResetNotification($token);
            Log::info('auth.password_reset_requested', [
                'user_id' => $user->id,
                'email' => $validated['email'],
                'ip' => $request->ip(),
            ]);
        } elseif ($user) {
            Log::warning('auth.password_reset_blocked_bootstrap', [
                'user_id' => $user->id,
                'email' => $validated['email'],
                'ip' => $request->ip(),
                'path' => 'forgot_password',
            ]);
        }

        return response()->json([
            'message' => 'If an account exists for this email, a password reset link was sent.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string|min:8|confirmed',
        ]);
        $validated['email'] = $this->normalizeEmail((string) $validated['email']);

        if ($this->isBootstrapEmail($validated['email'])) {
            $bootstrapUser = User::query()->where('email', $validated['email'])->first();

            Log::warning('auth.password_reset_blocked_bootstrap', [
                'user_id' => $bootstrapUser?->id,
                'email' => $validated['email'],
                'ip' => $request->ip(),
                'path' => 'reset_password',
            ]);

            return response()->json([
                'message' => 'Bootstrap password reset is only available through the protected recovery flow.',
            ], 403);
        }

        $status = Password::reset(
            $validated,
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            Log::warning('auth.password_reset_failed', [
                'email' => $validated['email'],
                'ip' => $request->ip(),
                'status' => $status,
            ]);

            return response()->json([
                'message' => __($status),
            ], 422);
        }

        $resetUser = User::query()->where('email', $validated['email'])->first();
        Log::info('auth.password_reset_completed', [
            'user_id' => $resetUser?->id,
            'email' => $validated['email'],
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Password reset successful. You can now log in with your new password.',
        ]);
    }

    public function logout(Request $request)
    {
        /** @var User|null $user */
        $user = $request->user();
        if ($user) {
            $currentToken = $user->currentAccessToken();
            if ($currentToken && !$currentToken instanceof TransientToken) {
                $currentToken->delete();
            } else {
                $user->tokens()->delete();
            }

            $user->forceFill([
                'active_session_id' => null,
                'active_token_id' => null,
                'last_activity_at' => null,
            ])->saveQuietly();
        }
        Log::info('auth.logout', [
            'user_id' => $user?->id,
            'ip' => $request->ip(),
        ]);
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    public function changePassword(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:8|different:current_password|confirmed',
        ]);

        if (!Hash::check($validated['current_password'], (string) $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->forceFill([
            'password' => Hash::make($validated['new_password']),
            'remember_token' => Str::random(60),
        ])->save();

        $user->tokens()->delete();

        $token = null;
        $activeTokenId = null;
        if (strtolower((string) $request->header('X-Auth-Mode', '')) === 'token') {
            $createdToken = $user->createToken('auth_token');
            $token = $createdToken->plainTextToken;
            $activeTokenId = $createdToken->accessToken->id;
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        $activeSessionId = $request->hasSession() ? $request->session()->getId() : null;
        $user->forceFill([
            'active_session_id' => $activeSessionId,
            'active_token_id' => $activeTokenId,
            'last_activity_at' => now(),
        ])->saveQuietly();

        Log::info('auth.password_changed', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
            'auth_mode' => $token ? 'token' : 'session',
        ]);

        $payload = [
            'message' => 'Password updated successfully.',
        ];

        if ($token) {
            $payload['token'] = $token;
        }

        return response()->json($payload);
    }

    public function sessions(Request $request)
    {
        /** @var User $user */
        $user = $request->user();
        $currentToken = $user->currentAccessToken();
        $currentTokenId = ($currentToken && !$currentToken instanceof TransientToken) ? (int) $currentToken->id : null;
        $activeSessionId = $user->active_session_id ?: ($request->hasSession() ? $request->session()->getId() : null);

        $tokens = $user->tokens()
            ->orderByRaw('last_used_at IS NULL, last_used_at DESC')
            ->orderByDesc('created_at')
            ->get(['id', 'name', 'created_at', 'last_used_at'])
            ->map(function ($token) use ($currentTokenId) {
                return [
                    'id' => (int) $token->id,
                    'name' => (string) ($token->name ?? 'session'),
                    'created_at' => optional($token->created_at)->toISOString(),
                    'last_used_at' => optional($token->last_used_at)->toISOString(),
                    'is_current' => $currentTokenId !== null && (int) $token->id === $currentTokenId,
                ];
            })
            ->values()
            ->all();

        if ($activeSessionId !== null && $currentTokenId === null) {
            array_unshift($tokens, [
                'id' => null,
                'name' => 'Current browser session',
                'created_at' => null,
                'last_used_at' => optional($user->last_activity_at)->toISOString(),
                'is_current' => true,
                'session_id' => $activeSessionId,
                'kind' => 'browser_session',
            ]);
        } else {
            $tokens = array_map(static function (array $token): array {
                $token['session_id'] = null;
                $token['kind'] = 'token';

                return $token;
            }, $tokens);
        }

        return response()->json([
            'active_token_id' => $user->active_token_id ? (int) $user->active_token_id : null,
            'active_session_id' => $activeSessionId,
            'last_activity_at' => optional($user->last_activity_at)->toISOString(),
            'tokens' => $tokens,
        ]);
    }

    public function revokeSession(Request $request, int $tokenId)
    {
        /** @var User $user */
        $user = $request->user();
        $currentToken = $user->currentAccessToken();
        $currentTokenId = ($currentToken && !$currentToken instanceof TransientToken) ? (int) $currentToken->id : null;

        if ($currentTokenId !== null && $tokenId === $currentTokenId) {
            return response()->json([
                'message' => 'Cannot revoke current active session from this action.',
            ], 422);
        }

        $deleted = $user->tokens()->whereKey($tokenId)->delete();
        if ($deleted < 1) {
            return response()->json([
                'message' => 'Session token not found.',
            ], 404);
        }

        Log::info('auth.session_revoked', [
            'user_id' => $user->id,
            'revoked_token_id' => $tokenId,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Session revoked successfully.',
        ]);
    }
}
