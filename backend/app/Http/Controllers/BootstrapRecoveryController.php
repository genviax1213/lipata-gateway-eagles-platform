<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Notifications\BootstrapRecoveryToken;
use App\Support\VerificationToken;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

class BootstrapRecoveryController extends Controller
{
    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function bootstrapEmail(): string
    {
        return $this->normalizeEmail((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'));
    }

    private function recoveryEmail(): string
    {
        return $this->normalizeEmail((string) config('app.bootstrap_superadmin_recovery_email', 'r.lanugon@gmail.com'));
    }

    private function tokenTtlMinutes(): int
    {
        return max(1, (int) config('app.bootstrap_superadmin_recovery_token_ttl', 15));
    }

    private function resolveBootstrapUser(): ?User
    {
        return User::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$this->bootstrapEmail()])
            ->whereHas('role', fn ($query) => $query->where('name', 'superadmin'))
            ->first();
    }

    private function validRecoveryRow(string $email, string $token): ?object
    {
        return DB::table('bootstrap_recovery_tokens')
            ->whereRaw('LOWER(TRIM(email)) = ?', [$email])
            ->where('token', hash('sha256', VerificationToken::normalize($token)))
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();
    }

    public function request(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        $requestedEmail = $this->normalizeEmail((string) $validated['email']);
        $bootstrapUser = $this->resolveBootstrapUser();

        if ($bootstrapUser && $requestedEmail === $this->bootstrapEmail()) {
            $token = VerificationToken::generate();

            DB::table('bootstrap_recovery_tokens')
                ->whereRaw('LOWER(TRIM(email)) = ?', [$requestedEmail])
                ->delete();

            DB::table('bootstrap_recovery_tokens')->insert([
                'email' => $requestedEmail,
                'recovery_email' => $this->recoveryEmail(),
                'token' => hash('sha256', $token),
                'expires_at' => now()->addMinutes($this->tokenTtlMinutes()),
                'consumed_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            Notification::route('mail', $this->recoveryEmail())
                ->notify(new BootstrapRecoveryToken($token, $requestedEmail));
        }

        Log::info('auth.bootstrap_recovery_requested', [
            'requested_email' => $requestedEmail,
            'ip' => $request->ip(),
            'eligible' => $bootstrapUser !== null && $requestedEmail === $this->bootstrapEmail(),
        ]);

        return response()->json([
            'message' => 'If the account is eligible, recovery instructions were sent.',
        ]);
    }

    public function verify(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'token' => VerificationToken::validationRules(),
        ]);

        $email = $this->normalizeEmail((string) $validated['email']);
        $token = (string) $validated['token'];
        $recovery = $this->validRecoveryRow($email, $token);

        if (!$recovery || $email !== $this->bootstrapEmail() || !$this->resolveBootstrapUser()) {
            return response()->json([
                'message' => 'Invalid or expired recovery token.',
            ], 422);
        }

        Log::info('auth.bootstrap_recovery_verified', [
            'email' => $email,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Recovery token verified.',
        ]);
    }

    public function reset(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'token' => VerificationToken::validationRules(),
            'password' => 'required|string|min:8|confirmed',
        ]);

        $email = $this->normalizeEmail((string) $validated['email']);
        $token = (string) $validated['token'];
        $recovery = $this->validRecoveryRow($email, $token);
        $bootstrapUser = $this->resolveBootstrapUser();

        if (!$recovery || !$bootstrapUser || $email !== $this->bootstrapEmail()) {
            return response()->json([
                'message' => 'Invalid or expired recovery token.',
            ], 422);
        }

        DB::transaction(function () use ($bootstrapUser, $validated, $recovery): void {
            $bootstrapUser->forceFill([
                'password' => Hash::make((string) $validated['password']),
                'remember_token' => Str::random(60),
                'active_session_id' => null,
                'active_token_id' => null,
                'last_activity_at' => null,
            ])->save();

            $bootstrapUser->tokens()->delete();
            DB::table('sessions')->where('user_id', $bootstrapUser->id)->delete();

            DB::table('bootstrap_recovery_tokens')
                ->where('id', $recovery->id)
                ->update([
                    'consumed_at' => now(),
                    'updated_at' => now(),
                ]);
        });

        event(new PasswordReset($bootstrapUser));

        Log::info('auth.bootstrap_recovery_reset', [
            'user_id' => $bootstrapUser->id,
            'email' => $email,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Bootstrap password reset successful.',
        ]);
    }
}
