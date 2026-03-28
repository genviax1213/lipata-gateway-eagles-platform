<?php

namespace Tests\Feature;

use Database\Seeders\RoleSeeder;
use App\Models\Role;
use App\Models\Member;
use App\Models\User;
use App\Notifications\PortalPasswordRecoveryToken;
use App\Support\VerificationToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_forgot_password_sends_recovery_token_to_recovery_email_when_user_exists(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'member.alias@lgec.org',
            'recovery_email' => 'member.real@example.com',
        ]);
        Member::query()->create([
            'member_number' => 'M-RESET-001',
            'first_name' => 'Reset',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'member.real@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        $response = $this->postJson('/api/v1/forgot-password', [
            'email' => 'member.alias@lgec.org',
        ]);

        $response->assertStatus(200);
        Notification::assertSentOnDemand(PortalPasswordRecoveryToken::class);
        $this->assertDatabaseHas('portal_password_recovery_tokens', [
            'email' => 'member.alias@lgec.org',
            'recovery_email' => 'member.real@example.com',
        ]);
    }

    public function test_reset_password_updates_user_credentials_with_valid_token(): void
    {
        $user = User::factory()->create([
            'email' => 'member.reset@lgec.org',
            'recovery_email' => 'member.reset.real@example.com',
            'password' => Hash::make('OldPassword123'),
        ]);
        Member::query()->create([
            'member_number' => 'M-RESET-002',
            'first_name' => 'Reset',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'member.reset.real@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);
        $token = VerificationToken::generate();

        DB::table('portal_password_recovery_tokens')->insert([
            'email' => 'member.reset@lgec.org',
            'recovery_email' => 'member.reset.real@example.com',
            'token' => hash('sha256', $token),
            'expires_at' => now()->addMinutes(15),
            'consumed_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

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
            ->assertJsonPath('message', 'If an eligible account exists, recovery instructions were sent.');

        Notification::assertNothingSent();
    }

    public function test_reset_password_rejects_bootstrap_account_outside_protected_recovery_flow(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $bootstrap = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'password' => Hash::make('Intent$0811'),
            'role_id' => $superadminRole->id,
        ]);
        $token = VerificationToken::generate();
        DB::table('portal_password_recovery_tokens')->insert([
            'email' => 'admin@lipataeagles.ph',
            'recovery_email' => 'r.lanugon@gmail.com',
            'token' => hash('sha256', $token),
            'expires_at' => now()->addMinutes(15),
            'consumed_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

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
