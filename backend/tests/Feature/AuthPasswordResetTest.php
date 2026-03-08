<?php

namespace Tests\Feature;

use Database\Seeders\RoleSeeder;
use App\Models\Role;
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

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

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

    public function test_forgot_password_does_not_send_generic_reset_notification_for_bootstrap_account(): void
    {
        Notification::fake();

        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $bootstrap = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $superadminRole->id,
        ]);

        $this->postJson('/api/v1/forgot-password', [
            'email' => 'admin@lipataeagles.ph',
        ])->assertOk()
            ->assertJsonPath('message', 'If an account exists for this email, a password reset link was sent.');

        Notification::assertNotSentTo($bootstrap, ResetPassword::class);
    }

    public function test_reset_password_rejects_bootstrap_account_outside_protected_recovery_flow(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $bootstrap = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'password' => Hash::make('Intent$0811'),
            'role_id' => $superadminRole->id,
        ]);
        $token = Password::broker()->createToken($bootstrap);

        $this->postJson('/api/v1/reset-password', [
            'email' => 'admin@lipataeagles.ph',
            'token' => $token,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertStatus(403)
            ->assertJsonPath('message', 'Bootstrap password reset is only available through the protected recovery flow.');

        $this->assertTrue(Hash::check('Intent$0811', (string) $bootstrap->fresh()->password));
    }
}
