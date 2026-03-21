<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\Role;
use App\Models\User;
use App\Support\RoleHierarchy;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_login_creates_session_for_follow_up_user_request(): void
    {
        $password = 'Password123';
        $user = User::factory()->create([
            'password' => $password,
        ]);

        $login = $this->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => $password,
        ])->assertOk();

        $login->assertJsonMissingPath('token');

        $this->getJson('/api/v1/user')
            ->assertOk()
            ->assertJsonPath('id', $user->id);
    }

    public function test_login_returns_token_when_legacy_token_mode_requested(): void
    {
        $password = 'Password123';
        $user = User::factory()->create([
            'password' => $password,
        ]);

        $login = $this->withHeaders([
            'X-Auth-Mode' => 'token',
        ])->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => $password,
        ])->assertOk();

        $token = (string) $login->json('token');
        $this->assertNotEmpty($token);
    }

    public function test_user_payload_exposes_data_privacy_notice_status_and_can_be_acknowledged(): void
    {
        $password = 'Password123';
        $user = User::factory()->create([
            'password' => $password,
        ]);

        $this->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => $password,
        ])->assertOk();

        $userResponse = $this->getJson('/api/v1/user')
            ->assertOk()
            ->assertJsonPath('data_privacy_notice_acknowledged_at', null)
            ->assertJsonPath('data_privacy_notice_acknowledged_version', null)
            ->assertJsonPath('data_privacy_notice_version_required', '2026-03-21');

        $this->assertSame('2026-03-21', $userResponse->json('data_privacy_notice_version_required'));

        $this->postJson('/api/v1/auth/data-privacy/acknowledge', [
            'acknowledged' => true,
        ])->assertOk()
            ->assertJsonPath('data_privacy_notice_acknowledged_version', '2026-03-21')
            ->assertJsonPath('data_privacy_notice_version_required', '2026-03-21');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'data_privacy_notice_acknowledged_version' => '2026-03-21',
        ]);
    }

    public function test_withdrawn_application_blocks_login(): void
    {
        $password = 'Password123';
        $user = User::factory()->create([
            'email' => 'withdrawn-login@example.com',
            'password' => $password,
        ]);

        Applicant::query()->create([
            'user_id' => $user->id,
            'first_name' => 'Withdrawn',
            'middle_name' => 'Login',
            'last_name' => 'User',
            'email' => 'withdrawn-login@example.com',
            'membership_status' => 'applicant',
            'status' => 'withdrawn',
            'decision_status' => 'withdrawn',
            'current_stage' => 'interview',
            'is_login_blocked' => true,
            'verification_token' => hash('sha256', 'withdrawn-login-token'),
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'withdrawn-login@example.com',
            'password' => $password,
        ])->assertStatus(403)
            ->assertJsonPath('message', 'Your membership application was withdrawn. Login access is blocked.');
    }

    public function test_logout_revokes_current_access_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('auth_token')->plainTextToken;

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/v1/logout')->assertOk();

        $this->assertSame(0, $user->fresh()->tokens()->count());
    }

    public function test_session_logout_invalidates_authenticated_browser_session(): void
    {
        $password = 'Password123';
        $user = User::factory()->create([
            'password' => $password,
        ]);

        $this->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => $password,
        ])->assertOk();

        $this->getJson('/api/v1/user')
            ->assertOk()
            ->assertJsonPath('id', $user->id);

        $this->postJson('/api/v1/logout')->assertOk();

        $this->assertNull($user->fresh()->active_session_id);
        $this->assertNull($user->fresh()->active_token_id);
    }

    public function test_login_revokes_previous_device_tokens_and_sets_new_active_token(): void
    {
        $password = 'Password123';
        $user = User::factory()->create([
            'password' => $password,
        ]);

        $previous = $user->createToken('auth_token');

        $login = $this->withHeaders([
            'X-Auth-Mode' => 'token',
        ])->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => $password,
        ])->assertOk();

        $this->assertNotEmpty((string) $login->json('token'));
        $this->assertFalse($user->fresh()->tokens()->whereKey($previous->accessToken->id)->exists());
        $this->assertSame(1, $user->fresh()->tokens()->count());
        $this->assertNotNull($user->fresh()->active_token_id);
    }

    public function test_replaced_token_is_forced_logged_out_with_notice_code(): void
    {
        $user = User::factory()->create();

        $oldToken = $user->createToken('old');
        $currentToken = $user->createToken('current');

        $user->forceFill([
            'active_token_id' => $currentToken->accessToken->id,
            'last_activity_at' => now(),
        ])->save();

        $this->withToken($oldToken->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertStatus(401)
            ->assertJsonPath('code', 'session_replaced');
    }

    public function test_admin_token_is_forced_logged_out_after_ten_minutes_of_inactivity(): void
    {
        $user = User::factory()->create([
            'role_id' => $this->roleId(RoleHierarchy::ADMIN),
        ]);
        $token = $user->createToken('auth_token');

        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => Carbon::now()->subMinutes(11),
        ])->save();

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertStatus(401)
            ->assertJsonPath('code', 'session_inactive')
            ->assertJsonPath('message', 'You have been logged out due to 10 minutes of inactivity.');

        $this->assertFalse($user->fresh()->tokens()->whereKey($token->accessToken->id)->exists());
    }

    public function test_superadmin_token_is_forced_logged_out_after_ten_minutes_of_inactivity(): void
    {
        $user = User::factory()->create([
            'role_id' => $this->roleId(RoleHierarchy::SUPERADMIN),
        ]);
        $token = $user->createToken('auth_token');

        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => Carbon::now()->subMinutes(11),
        ])->save();

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertStatus(401)
            ->assertJsonPath('code', 'session_inactive')
            ->assertJsonPath('message', 'You have been logged out due to 10 minutes of inactivity.');

        $this->assertFalse($user->fresh()->tokens()->whereKey($token->accessToken->id)->exists());
    }

    public function test_superadmin_activity_heartbeat_extends_session_before_timeout_cutoff(): void
    {
        Carbon::setTestNow('2026-03-21 10:00:00');

        try {
            $user = User::factory()->create([
                'role_id' => $this->roleId(RoleHierarchy::SUPERADMIN),
            ]);
            $token = $user->createToken('auth_token');

            $user->forceFill([
                'active_token_id' => $token->accessToken->id,
                'last_activity_at' => Carbon::now()->subMinutes(9),
            ])->save();

            $this->withToken($token->plainTextToken)
                ->postJson('/api/v1/auth/activity')
                ->assertOk();

            Carbon::setTestNow('2026-03-21 10:02:00');

            $this->withToken($token->plainTextToken)
                ->getJson('/api/v1/user')
                ->assertOk()
                ->assertJsonPath('id', $user->id);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_inactive_token_does_not_force_logout_for_applicant_accounts(): void
    {
        $user = User::factory()->create([
            'role_id' => $this->roleId(RoleHierarchy::APPLICANT),
        ]);
        $token = $user->createToken('auth_token');

        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => Carbon::now()->subMinutes(31),
        ])->save();

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertOk()
            ->assertJsonPath('id', $user->id);

        $this->assertTrue($user->fresh()->tokens()->whereKey($token->accessToken->id)->exists());
    }

    public function test_inactive_token_does_not_force_logout_for_non_admin_member_accounts(): void
    {
        $user = User::factory()->create([
            'role_id' => $this->roleId(RoleHierarchy::MEMBER),
        ]);
        $token = $user->createToken('auth_token');

        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => Carbon::now()->subMinutes(31),
        ])->save();

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertOk()
            ->assertJsonPath('id', $user->id);

        $this->assertTrue($user->fresh()->tokens()->whereKey($token->accessToken->id)->exists());
    }

    public function test_inactive_token_is_forced_logged_out_for_treasurer_accounts(): void
    {
        $user = User::factory()->create([
            'role_id' => $this->roleId(RoleHierarchy::MEMBER),
            'finance_role' => RoleHierarchy::FINANCE_TREASURER,
        ]);
        $token = $user->createToken('auth_token');

        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => Carbon::now()->subMinutes(31),
        ])->save();

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertStatus(401)
            ->assertJsonPath('code', 'session_inactive');

        $this->assertFalse($user->fresh()->tokens()->whereKey($token->accessToken->id)->exists());
    }

    private function roleId(string $roleName): int
    {
        return (int) Role::query()->where('name', $roleName)->value('id');
    }

    public function test_authenticated_user_can_change_password_and_rotate_token(): void
    {
        $user = User::factory()->create([
            'password' => 'OldPass123',
        ]);
        $token = $user->createToken('auth_token');

        $user->forceFill([
            'active_token_id' => $token->accessToken->id,
            'last_activity_at' => now(),
        ])->save();

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token->plainTextToken,
            'X-Auth-Mode' => 'token',
        ])->postJson('/api/v1/auth/change-password', [
            'current_password' => 'OldPass123',
            'new_password' => 'NewPass456',
            'new_password_confirmation' => 'NewPass456',
        ])->assertOk();

        $newToken = (string) $response->json('token');
        $this->assertNotEmpty($newToken);

        $fresh = $user->fresh();
        $this->assertTrue(Hash::check('NewPass456', (string) $fresh->password));
        $this->assertSame(1, $fresh->tokens()->count());
        $this->assertSame((int) $fresh->active_token_id, (int) $fresh->tokens()->first()->id);
    }

    public function test_user_can_list_and_revoke_other_sessions(): void
    {
        $user = User::factory()->create();
        $current = $user->createToken('current');
        $other = $user->createToken('other');

        $user->forceFill([
            'active_token_id' => $current->accessToken->id,
            'last_activity_at' => now(),
        ])->save();

        $list = $this->withHeaders([
            'Authorization' => 'Bearer ' . $current->plainTextToken,
        ])->getJson('/api/v1/auth/sessions')->assertOk();

        $tokens = collect($list->json('tokens'));
        $this->assertCount(2, $tokens);
        $this->assertTrue($tokens->pluck('id')->contains((int) $current->accessToken->id));
        $this->assertTrue($tokens->pluck('id')->contains((int) $other->accessToken->id));

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $current->plainTextToken,
        ])->deleteJson('/api/v1/auth/sessions/' . $other->accessToken->id)->assertOk();

        $this->assertFalse($user->fresh()->tokens()->whereKey($other->accessToken->id)->exists());
    }

    public function test_session_mode_lists_current_browser_session_when_no_tokens_exist(): void
    {
        $user = User::factory()->create();
        $user->forceFill([
            'active_session_id' => 'browser-session-123',
            'last_activity_at' => now(),
        ])->save();

        $response = $this->actingAs($user)
            ->getJson('/api/v1/auth/sessions')
            ->assertOk();

        $response->assertJsonPath('tokens.0.kind', 'browser_session');
        $response->assertJsonPath('tokens.0.is_current', true);
        $response->assertJsonPath('tokens.0.id', null);
        $response->assertJsonPath('tokens.0.session_id', 'browser-session-123');
    }

    public function test_terminate_current_session_does_not_call_delete_on_transient_token(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $middleware = new \App\Http\Middleware\EnforceSingleActiveSession();
        $request = Request::create('/api/v1/user', 'GET');
        $request->setUserResolver(fn () => $user);

        $method = new \ReflectionMethod($middleware, 'terminateCurrentSession');
        $method->setAccessible(true);

        $method->invoke($middleware, $request, $user, false);

        $this->assertTrue(true);
    }
}
