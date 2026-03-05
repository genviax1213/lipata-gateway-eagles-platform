<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthSessionTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_logout_revokes_current_access_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('auth_token')->plainTextToken;

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/v1/logout')->assertOk();

        $this->assertSame(0, $user->fresh()->tokens()->count());
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

    public function test_inactive_token_is_forced_logged_out_after_thirty_minutes(): void
    {
        $user = User::factory()->create();
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
}
