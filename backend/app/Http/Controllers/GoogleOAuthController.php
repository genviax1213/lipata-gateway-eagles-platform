<?php

namespace App\Http\Controllers;

use App\Models\Applicant;
use App\Models\User;
use App\Support\GoogleOAuthClaimStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Sanctum\TransientToken;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\RedirectResponse;

class GoogleOAuthController extends Controller
{
    private function frontendUrl(string $path, array $query = []): string
    {
        $base = rtrim((string) config('app.frontend_url', 'http://127.0.0.1:5173'), '/');
        $target = $base . $path;

        if ($query !== []) {
            $target .= '?' . http_build_query($query);
        }

        return $target;
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function googleConfigured(): bool
    {
        return (bool) config('services.google.client_id')
            && (bool) config('services.google.client_secret')
            && (bool) config('services.google.redirect');
    }

    private function errorRedirect(string $intent, string $message): RedirectResponse
    {
        $path = match ($intent) {
            GoogleOAuthClaimStore::INTENT_MEMBER_REGISTRATION => '/member-registration',
            GoogleOAuthClaimStore::INTENT_APPLICANT_REGISTRATION => '/applicant-registration',
            default => '/login',
        };

        return redirect()->away($this->frontendUrl($path, ['oauth_error' => $message]));
    }

    public function status()
    {
        return response()->json([
            'enabled' => $this->googleConfigured(),
        ]);
    }

    public function redirect(Request $request): RedirectResponse
    {
        abort_unless($this->googleConfigured(), 503, 'Google OAuth is not configured.');

        $validated = $request->validate([
            'intent' => 'required|in:login,member_registration,applicant_registration',
        ]);

        $request->session()->put('google_oauth_intent', $validated['intent']);

        return Socialite::driver('google')
            ->scopes(['openid', 'email', 'profile'])
            ->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        abort_unless($this->googleConfigured(), 503, 'Google OAuth is not configured.');

        $intent = (string) $request->session()->pull('google_oauth_intent', '');
        if (!in_array($intent, [
            GoogleOAuthClaimStore::INTENT_LOGIN,
            GoogleOAuthClaimStore::INTENT_MEMBER_REGISTRATION,
            GoogleOAuthClaimStore::INTENT_APPLICANT_REGISTRATION,
        ], true)) {
            return $this->errorRedirect(GoogleOAuthClaimStore::INTENT_LOGIN, 'Google sign-in session expired. Please try again.');
        }

        $googleUser = Socialite::driver('google')->user();
        $raw = is_array($googleUser->user ?? null) ? $googleUser->user : [];
        $email = $this->normalizeEmail((string) ($googleUser->getEmail() ?? ''));
        $emailVerified = filter_var($raw['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if ($email === '' || !$emailVerified) {
            return $this->errorRedirect($intent, 'Google account email is unavailable or not verified.');
        }

        if ($intent === GoogleOAuthClaimStore::INTENT_LOGIN) {
            return $this->handleLoginCallback($request, $email);
        }

        $claimToken = GoogleOAuthClaimStore::issue($intent, [
            'provider' => 'google',
            'email' => $email,
            'first_name' => (string) ($raw['given_name'] ?? ''),
            'last_name' => (string) ($raw['family_name'] ?? ''),
            'full_name' => (string) ($googleUser->getName() ?? ''),
        ]);

        $path = $intent === GoogleOAuthClaimStore::INTENT_MEMBER_REGISTRATION
            ? '/member-registration'
            : '/applicant-registration';

        return redirect()->away($this->frontendUrl($path, [
            'google' => '1',
            'google_claim' => $claimToken,
        ]));
    }

    private function handleLoginCallback(Request $request, string $email): RedirectResponse
    {
        $user = User::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
            ->first();

        if (!$user) {
            return $this->errorRedirect(GoogleOAuthClaimStore::INTENT_LOGIN, 'Google account is not registered in this portal.');
        }

        Auth::login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        /** @var User $user */
        $user = Auth::user()->load('role.permissions:id,name');
        $user->tokens()->delete();

        $application = Applicant::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
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

            Log::warning('auth.google_login_blocked', [
                'user_id' => $user->id,
                'application_id' => $application->id,
                'reason' => $application->decision_status,
                'ip' => $request->ip(),
            ]);

            return $this->errorRedirect(GoogleOAuthClaimStore::INTENT_LOGIN, $blockedMessage);
        }

        $activeSessionId = $request->hasSession() ? $request->session()->getId() : null;
        $currentToken = $user->currentAccessToken();
        $activeTokenId = ($currentToken && !$currentToken instanceof TransientToken) ? (int) $currentToken->id : null;

        $user->forceFill([
            'active_session_id' => $activeSessionId,
            'active_token_id' => $activeTokenId,
            'last_activity_at' => now(),
        ])->saveQuietly();

        Log::info('auth.google_login_success', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
        ]);

        return redirect()->away($this->frontendUrl('/portal', ['oauth' => 'google']));
    }

    public function claim(Request $request)
    {
        $validated = $request->validate([
            'intent' => 'required|in:member_registration,applicant_registration',
            'token' => 'required|string',
        ]);

        $claim = GoogleOAuthClaimStore::get($validated['intent'], $validated['token']);
        if (!$claim) {
            return response()->json([
                'message' => 'No Google OAuth registration claim is available.',
            ], 404);
        }

        return response()->json([
            'provider' => 'google',
            'email' => $claim['email'],
            'first_name' => $claim['first_name'],
            'last_name' => $claim['last_name'],
            'full_name' => $claim['full_name'],
            'ttl_seconds' => GoogleOAuthClaimStore::ttlSeconds(),
        ]);
    }
}
