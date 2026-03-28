<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use App\Notifications\MobilePasswordRecoveryToken;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class MobileAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_mobile_login_returns_token_and_mobile_flags_for_enabled_user(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'finance.member@lgec.org',
            'password' => Hash::make('Password123'),
            'mobile_access_enabled' => true,
            'mobile_chat_enabled' => true,
            'must_change_password' => true,
        ]);
        Member::query()->create([
            'member_number' => 'M-MOBILE-LOGIN-001',
            'first_name' => 'Finance',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'finance.member.personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'finance.member@lgec.org',
            'password' => 'Password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.mobile_access_enabled', true)
            ->assertJsonPath('user.mobile_chat_enabled', true)
            ->assertJsonPath('user.must_change_password', true);

        $this->assertNotEmpty((string) $response->json('token'));
    }

    public function test_mobile_login_rejects_user_without_mobile_access(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'blocked.mobile@lgec.org',
            'password' => Hash::make('Password123'),
            'mobile_access_enabled' => false,
        ]);

        $this->postJson('/api/v1/mobile/login', [
            'email' => 'blocked.mobile@lgec.org',
            'password' => 'Password123',
        ])->assertStatus(403)
            ->assertJsonPath('message', 'Mobile access is not enabled for this account.');
    }

    public function test_mobile_login_rejects_bootstrap_account_even_when_mobile_access_is_enabled(): void
    {
        config()->set('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph');

        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'admin@lipataeagles.ph',
            'password' => Hash::make('Intent$0811'),
            'mobile_access_enabled' => true,
        ]);

        $this->postJson('/api/v1/mobile/login', [
            'email' => 'admin@lipataeagles.ph',
            'password' => 'Intent$0811',
        ])->assertStatus(403)
            ->assertJsonPath('message', 'Bootstrap account is not available through the mobile app.');
    }

    public function test_mobile_login_rejects_finance_officer_account(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'treasurer.mobile@lgec.org',
            'password' => Hash::make('Password123'),
            'finance_role' => 'treasurer',
            'mobile_access_enabled' => true,
        ]);

        $this->postJson('/api/v1/mobile/login', [
            'email' => 'treasurer.mobile@lgec.org',
            'password' => 'Password123',
        ])->assertStatus(403)
            ->assertJsonPath('message', 'This mobile app is only available for personal member accounts.');
    }

    public function test_mobile_login_rejects_officer_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        User::factory()->create([
            'role_id' => $officerRole->id,
            'email' => 'officer.mobile@lgec.org',
            'password' => Hash::make('Password123'),
            'mobile_access_enabled' => true,
        ]);

        $this->postJson('/api/v1/mobile/login', [
            'email' => 'officer.mobile@lgec.org',
            'password' => 'Password123',
        ])->assertStatus(403)
            ->assertJsonPath('message', 'This mobile app is only available for personal member accounts.');
    }

    public function test_mobile_me_returns_mobile_payload_for_enabled_user(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'mobile.me@lgec.org',
            'mobile_access_enabled' => true,
            'mobile_chat_enabled' => false,
            'must_change_password' => true,
        ]);
        Member::query()->create([
            'member_number' => 'M-MOBILE-ME-001',
            'first_name' => 'Mobile',
            'middle_name' => null,
            'last_name' => 'Me',
            'email' => 'mobile.me.personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);
        $token = $user->createToken('auth_token');
        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => now(),
        ])->save();

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/mobile/me')
            ->assertOk()
            ->assertJsonPath('id', $user->id)
            ->assertJsonPath('mobile_access_enabled', true)
            ->assertJsonPath('must_change_password', true);
    }

    public function test_mobile_change_password_clears_must_change_password(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'mobile.password@lgec.org',
            'password' => Hash::make('OldPassword123'),
            'mobile_access_enabled' => true,
            'must_change_password' => true,
        ]);
        Member::query()->create([
            'member_number' => 'M-MOBILE-PASSWORD-001',
            'first_name' => 'Mobile',
            'middle_name' => null,
            'last_name' => 'Password',
            'email' => 'mobile.password.personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);
        $token = $user->createToken('auth_token');
        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => now(),
        ])->save();

        $response = $this->withToken($token->plainTextToken)
            ->postJson('/api/v1/mobile/change-password', [
                'current_password' => 'OldPassword123',
                'new_password' => 'NewPassword123',
                'new_password_confirmation' => 'NewPassword123',
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Password updated successfully.');

        $this->assertTrue(Hash::check('NewPassword123', (string) $user->fresh()->password));
        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }

    public function test_mobile_forgot_password_sends_recovery_to_member_email(): void
    {
        Notification::fake();

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'rolando.lanugon@lgec.org',
            'mobile_access_enabled' => true,
        ]);

        Member::query()->create([
            'member_number' => 'M-MOBILE-001',
            'first_name' => 'Rolando',
            'middle_name' => null,
            'last_name' => 'Lanugon',
            'email' => 'rolando.personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        $this->postJson('/api/v1/mobile/forgot-password', [
            'email' => 'rolando.lanugon@lgec.org',
        ])->assertOk()
            ->assertJsonPath('message', 'If an eligible mobile account exists, recovery instructions were sent.');

        Notification::assertSentOnDemand(MobilePasswordRecoveryToken::class);
        $this->assertDatabaseHas('mobile_password_recovery_tokens', [
            'email' => 'rolando.lanugon@lgec.org',
            'recovery_email' => 'rolando.personal@example.com',
        ]);
    }

    public function test_mobile_forgot_password_does_not_send_for_bootstrap_account(): void
    {
        Notification::fake();
        config()->set('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph');

        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'admin@lipataeagles.ph',
            'mobile_access_enabled' => true,
        ]);

        $this->postJson('/api/v1/mobile/forgot-password', [
            'email' => 'admin@lipataeagles.ph',
        ])->assertOk();

        Notification::assertNothingSent();
    }

    public function test_mobile_reset_password_updates_password_using_member_recovery_token(): void
    {
        Notification::fake();

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'mobile.reset@lgec.org',
            'password' => Hash::make('OldPassword123'),
            'mobile_access_enabled' => true,
            'must_change_password' => true,
        ]);

        Member::query()->create([
            'member_number' => 'M-MOBILE-002',
            'first_name' => 'Mobile',
            'middle_name' => null,
            'last_name' => 'Reset',
            'email' => 'mobile-reset-personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        $this->postJson('/api/v1/mobile/forgot-password', [
            'email' => 'mobile.reset@lgec.org',
        ])->assertOk();

        $notification = null;
        Notification::assertSentOnDemand(MobilePasswordRecoveryToken::class, function (MobilePasswordRecoveryToken $sentNotification) use (&$notification) {
            $notification = $sentNotification;
            return true;
        });

        $this->postJson('/api/v1/mobile/reset-password', [
            'email' => 'mobile.reset@lgec.org',
            'token' => $notification->token(),
            'password' => 'BrandNewPassword123',
            'password_confirmation' => 'BrandNewPassword123',
        ])->assertOk()
            ->assertJsonPath('message', 'Password reset successful. You can now log in with your new password.');

        $this->assertTrue(Hash::check('BrandNewPassword123', (string) $user->fresh()->password));
        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }
}
