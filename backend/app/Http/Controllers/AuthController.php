<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\User;
use App\Models\Applicant;
use App\Notifications\MobilePasswordRecoveryToken;
use App\Notifications\PortalPasswordRecoveryToken;
use App\Support\RoleHierarchy;
use App\Support\VerificationToken;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\TransientToken;

class AuthController extends Controller
{
    private function userPayload(User $user): array
    {
        return array_merge($user->toArray(), [
            'data_privacy_notice_version_required' => DataPrivacyNoticeController::CURRENT_NOTICE_VERSION,
        ]);
    }

    private function mobileUserPayload(User $user): array
    {
        $user->loadMissing('role.permissions:id,name', 'memberProfile:id,user_id,email');

        return array_merge($this->userPayload($user), [
            'has_authored_posts' => \App\Models\Post::query()->where('author_id', $user->id)->exists(),
            'has_member_profile' => $user->memberProfile !== null,
            'mobile_access_enabled' => (bool) $user->mobile_access_enabled,
            'mobile_chat_enabled' => (bool) $user->mobile_chat_enabled,
            'must_change_password' => (bool) $user->must_change_password,
            'permissions' => $user->role?->permissions?->pluck('name')->values()->all() ?? [],
        ]);
    }

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

    private function mobileRecoveryTtlMinutes(): int
    {
        return 15;
    }

    private function portalRecoveryTtlMinutes(): int
    {
        return 15;
    }

    private function resolveRecoveryMember(User $user): ?Member
    {
        $user->loadMissing('memberProfile');
        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        return Member::query()
            ->where('user_id', $user->id)
            ->first();
    }

    private function resolveRecoveryEmailForUser(User $user): string
    {
        $member = $this->resolveRecoveryMember($user);

        $recovery = $this->normalizeEmail((string) ($user->recovery_email ?? ''));
        if ($recovery !== '') {
            return $recovery;
        }

        return $this->normalizeEmail((string) ($member?->email ?? ''));
    }

    private function personalMobileEligibilityMessage(User $user): ?string
    {
        if (!$user->mobile_access_enabled) {
            return 'Mobile access is not enabled for this account.';
        }

        if ($this->isBootstrapEmail($user->email)) {
            return 'Bootstrap account is not available through the mobile app.';
        }

        $user->loadMissing('role:id,name', 'memberProfile:id,user_id,email');
        if ((string) ($user->role?->name ?? '') !== RoleHierarchy::MEMBER) {
            return 'This mobile app is only available for personal member accounts.';
        }

        if (!empty($user->finance_role)) {
            return 'This mobile app is only available for personal member accounts.';
        }

        if ($this->resolveRecoveryMember($user) === null) {
            return 'This mobile app requires a linked member profile.';
        }

        return null;
    }

    private function validMobileRecoveryRow(string $email, string $token): ?object
    {
        return DB::table('mobile_password_recovery_tokens')
            ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
            ->where('token', hash('sha256', VerificationToken::normalize($token)))
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();
    }

    private function validPortalRecoveryRow(string $email, string $token): ?object
    {
        return DB::table('portal_password_recovery_tokens')
            ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
            ->where('token', hash('sha256', VerificationToken::normalize($token)))
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();
    }

    private function issueLoginPayload(Request $request, User $user, bool $mobileMode = false): array
    {
        $token = null;
        $activeTokenId = null;
        if ($mobileMode || strtolower((string) $request->header('X-Auth-Mode', '')) === 'token') {
            $createdToken = $user->createToken('auth_token');
            $token = $createdToken->plainTextToken;
            $activeTokenId = $createdToken->accessToken->id;
        }

        $activeSessionId = $request->hasSession() && !$mobileMode ? $request->session()->getId() : null;
        $user->forceFill([
            'active_session_id' => $activeSessionId,
            'active_token_id' => $activeTokenId,
            'last_activity_at' => now(),
        ])->saveQuietly();

        $payload = [
            'user' => $mobileMode ? $this->mobileUserPayload($user) : $this->userPayload($user),
        ];

        if ($token) {
            $payload['token'] = $token;
        }

        return $payload;
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required'
        ]);
        $credentials['email'] = $this->normalizeEmail((string) $credentials['email']);

        $recoveryOwner = User::query()
            ->whereRaw('LOWER(TRIM(recovery_email)) = ?', [$credentials['email']])
            ->first();
        if ($recoveryOwner && !$this->isBootstrapEmail($recoveryOwner->email)) {
            Log::warning('auth.login_blocked_recovery_email', [
                'email' => $credentials['email'],
                'recovery_owner_user_id' => $recoveryOwner->id,
                'ip' => $request->ip(),
            ]);

            return response()->json([
                'message' => 'Use your login alias (@lgec.org). Recovery email cannot be used to sign in.',
            ], 403);
        }

        if (!Auth::attempt($credentials)) {
            Log::warning('auth.login_failed', [
                'email' => strtolower(trim((string) ($credentials['email'] ?? ''))),
                'ip' => $request->ip(),
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        /** @var User $user */
        $user = Auth::user()->load('role.permissions:id,name');

        if ((bool) $user->login_email_locked) {
            Auth::logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            Log::warning('auth.login_locked_alias', [
                'user_id' => $user->id,
                'ip' => $request->ip(),
            ]);

            return response()->json([
                'message' => 'Login is locked for this alias. Ask an admin to generate credentials for your account.',
            ], 403);
        }

        // Enforce single active login across devices/browsers.
        $user->tokens()->delete();

        $applicationLookupEmail = $this->normalizeEmail((string) ($user->recovery_email ?: $user->email));

        $application = Applicant::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$applicationLookupEmail])
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

        Log::info('auth.login_success', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
            'auth_mode' => strtolower((string) $request->header('X-Auth-Mode', '')) === 'token' ? 'token' : 'session',
        ]);

        return response()->json($this->issueLoginPayload($request, $user));
    }

    public function mobileLogin(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);
        $credentials['email'] = $this->normalizeEmail((string) $credentials['email']);

        if (!Auth::attempt($credentials)) {
            Log::warning('auth.mobile_login_failed', [
                'email' => strtolower(trim((string) ($credentials['email'] ?? ''))),
                'ip' => $request->ip(),
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        /** @var User $user */
        $user = Auth::user()->load('role.permissions:id,name', 'memberProfile:id,user_id,email');

        if ($message = $this->personalMobileEligibilityMessage($user)) {
            Auth::logout();
            return response()->json([
                'message' => $message,
            ], 403);
        }

        $user->tokens()->delete();

        Log::info('auth.mobile_login_success', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
        ]);

        return response()->json($this->issueLoginPayload($request, $user, true));
    }

    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);
        $validated['email'] = $this->normalizeEmail((string) $validated['email']);

        $user = User::query()->where('email', $validated['email'])->first();
        if ($user && !$this->isBootstrapEmail($user->email) && !(bool) $user->login_email_locked) {
            $recoveryEmail = $this->resolveRecoveryEmailForUser($user);

            if ($recoveryEmail !== '') {
                $token = VerificationToken::generate();

                DB::table('portal_password_recovery_tokens')
                    ->whereRaw('LOWER(TRIM(email)) = ?', [$validated['email']])
                    ->delete();

                DB::table('portal_password_recovery_tokens')->insert([
                    'email' => $validated['email'],
                    'recovery_email' => $recoveryEmail,
                    'token' => hash('sha256', $token),
                    'expires_at' => now()->addMinutes($this->portalRecoveryTtlMinutes()),
                    'consumed_at' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                Notification::route('mail', $recoveryEmail)
                    ->notify(new PortalPasswordRecoveryToken($token, $validated['email']));
            }

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
            'message' => 'If an eligible account exists, recovery instructions were sent.',
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

        $user = User::query()->where('email', $validated['email'])->first();
        $recovery = $this->validPortalRecoveryRow($validated['email'], (string) $validated['token']);

        if (
            !$user
            || (bool) $user->login_email_locked
            || !$recovery
            || $this->resolveRecoveryEmailForUser($user) !== $this->normalizeEmail((string) $recovery->recovery_email)
        ) {
            Log::warning('auth.password_reset_failed', [
                'email' => $validated['email'],
                'ip' => $request->ip(),
                'status' => 'invalid_or_expired_token',
            ]);

            return response()->json([
                'message' => 'Invalid or expired recovery token.',
            ], 422);
        }

        DB::transaction(function () use ($validated, $user, $recovery): void {
            $user->forceFill([
                'password' => Hash::make((string) $validated['password']),
                'remember_token' => Str::random(60),
                'login_email_locked' => false,
                'must_change_password' => false,
                'last_password_changed_at' => now(),
            ])->save();

            DB::table('portal_password_recovery_tokens')
                ->where('id', $recovery->id)
                ->update([
                    'consumed_at' => now(),
                    'updated_at' => now(),
                ]);
        });

        event(new PasswordReset($user));

        Log::info('auth.password_reset_completed', [
            'user_id' => $user->id,
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

            User::query()->whereKey($user->id)->update([
                'active_session_id' => null,
                'active_token_id' => null,
                'last_activity_at' => null,
            ]);
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
            'must_change_password' => false,
            'last_password_changed_at' => now(),
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

    public function mobileMe(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        if ($message = $this->personalMobileEligibilityMessage($user)) {
            return response()->json([
                'message' => $message,
            ], 403);
        }

        return response()->json($this->mobileUserPayload($user));
    }

    public function mobileLogout(Request $request)
    {
        return $this->logout($request);
    }

    public function mobileChangePassword(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        if ($message = $this->personalMobileEligibilityMessage($user)) {
            return response()->json([
                'message' => $message,
            ], 403);
        }

        return $this->changePassword($request);
    }

    public function mobileForgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);
        $validated['email'] = $this->normalizeEmail((string) $validated['email']);

        $user = User::query()->where('email', $validated['email'])->first();

        if ($user && $this->personalMobileEligibilityMessage($user) === null) {
            $recoveryEmail = $this->resolveRecoveryEmailForUser($user);

            if ($recoveryEmail !== '') {
                $token = VerificationToken::generate();

                DB::table('mobile_password_recovery_tokens')
                    ->whereRaw('LOWER(TRIM(email)) = ?', [$validated['email']])
                    ->delete();

                DB::table('mobile_password_recovery_tokens')->insert([
                    'email' => $validated['email'],
                    'recovery_email' => $recoveryEmail,
                    'token' => hash('sha256', $token),
                    'expires_at' => now()->addMinutes($this->mobileRecoveryTtlMinutes()),
                    'consumed_at' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                Notification::route('mail', $recoveryEmail)
                    ->notify(new MobilePasswordRecoveryToken($token, $validated['email']));
            }
        }

        return response()->json([
            'message' => 'If an eligible mobile account exists, recovery instructions were sent.',
        ]);
    }

    public function mobileResetPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'token' => VerificationToken::validationRules(),
            'password' => 'required|string|min:8|confirmed',
        ]);
        $validated['email'] = $this->normalizeEmail((string) $validated['email']);

        $user = User::query()->where('email', $validated['email'])->first();
        $recovery = $this->validMobileRecoveryRow($validated['email'], (string) $validated['token']);

        if (
            !$user
            || $this->personalMobileEligibilityMessage($user) !== null
            || !$recovery
        ) {
            return response()->json([
                'message' => 'Invalid or expired recovery token.',
            ], 422);
        }

        $member = $this->resolveRecoveryMember($user);
        $memberEmail = $this->resolveRecoveryEmailForUser($user);

        if (!$member || $memberEmail === '' || $memberEmail !== $this->normalizeEmail((string) $recovery->recovery_email)) {
            return response()->json([
                'message' => 'Invalid or expired recovery token.',
            ], 422);
        }

        DB::transaction(function () use ($user, $validated, $recovery): void {
            $user->forceFill([
                'password' => Hash::make((string) $validated['password']),
                'remember_token' => Str::random(60),
                'active_session_id' => null,
                'active_token_id' => null,
                'last_activity_at' => null,
                'must_change_password' => false,
                'last_password_changed_at' => now(),
            ])->save();

            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();

            DB::table('mobile_password_recovery_tokens')
                ->where('id', $recovery->id)
                ->update([
                    'consumed_at' => now(),
                    'updated_at' => now(),
                ]);
        });

        event(new PasswordReset($user));

        return response()->json([
            'message' => 'Password reset successful. You can now log in with your new password.',
        ]);
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

    public function activity(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'last_activity_at' => optional($user->last_activity_at)->toISOString(),
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
