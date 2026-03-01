<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
