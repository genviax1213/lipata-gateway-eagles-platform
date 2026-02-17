<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class AuthPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_sends_reset_notification_when_user_exists(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'member@example.com',
        ]);

        $response = $this->postJson('/api/v1/forgot-password', [
            'email' => 'member@example.com',
        ]);

        $response->assertStatus(200);
        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_reset_password_updates_user_credentials_with_valid_token(): void
    {
        $user = User::factory()->create([
            'email' => 'member-reset@example.com',
            'password' => Hash::make('OldPassword123'),
        ]);
        $token = Password::broker()->createToken($user);

        $response = $this->postJson('/api/v1/reset-password', [
            'email' => $user->email,
            'token' => $token,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ]);

        $response->assertStatus(200);
        $this->assertTrue(Hash::check('NewPassword123', (string) $user->fresh()->password));
    }
}
