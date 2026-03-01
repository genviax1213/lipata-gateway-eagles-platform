<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\MemberApplication;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required'
        ]);

        if (!Auth::attempt($credentials)) {
            Log::warning('auth.login_failed', [
                'email' => strtolower(trim((string) ($credentials['email'] ?? ''))),
                'ip' => $request->ip(),
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        /** @var User $user */
        $user = Auth::user()->load('role.permissions:id,name');

        $application = MemberApplication::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [strtolower(trim((string) $user->email))])
            ->latest('id')
            ->first();

        if ($application && ($application->decision_status === 'rejected' || $application->is_login_blocked)) {
            Auth::logout();
            Log::warning('auth.login_blocked', [
                'user_id' => $user->id,
                'application_id' => $application->id,
                'reason' => $application->decision_status,
                'ip' => $request->ip(),
            ]);
            return response()->json([
                'message' => 'Your application was rejected. Login access is blocked.',
            ], 403);
        }

        $token = null;
        if (strtolower((string) $request->header('X-Auth-Mode', '')) === 'token') {
            $token = $user->createToken('auth_token')->plainTextToken;
        }
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

        $user = User::query()->where('email', $validated['email'])->first();
        if ($user) {
            $token = Password::broker()->createToken($user);
            $user->sendPasswordResetNotification($token);
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
            return response()->json([
                'message' => __($status),
            ], 422);
        }

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
            if ($currentToken) {
                $currentToken->delete();
            } else {
                $user->tokens()->delete();
            }
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
}
