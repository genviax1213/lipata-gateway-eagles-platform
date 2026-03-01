<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RequestContextTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_api_response_contains_request_id_header(): void
    {
        $response = $this->getJson('/api/v1/content/news');

        $response->assertOk();
        $this->assertNotEmpty((string) $response->headers->get('X-Request-Id'));
    }

    public function test_throttled_response_contains_request_id_header(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $response = $this->postJson('/api/v1/login', [
                'email' => 'request-id-throttle@example.test',
                'password' => 'InvalidPassword',
            ]);
        }

        $response->assertStatus(429);
        $this->assertNotEmpty((string) $response->headers->get('X-Request-Id'));
    }

    public function test_unauthenticated_response_contains_request_id_header(): void
    {
        $response = $this->getJson('/api/v1/user');

        $response->assertStatus(401);
        $this->assertNotEmpty((string) $response->headers->get('X-Request-Id'));
    }

    public function test_forbidden_response_contains_request_id_header(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);
        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/admin/users');

        $response->assertStatus(403);
        $this->assertNotEmpty((string) $response->headers->get('X-Request-Id'));
    }
}
