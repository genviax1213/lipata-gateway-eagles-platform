<?php

namespace Tests\Feature;

use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RouteThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_login_route_is_throttled_after_limit(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $response = $this->postJson('/api/v1/login', [
                'email' => 'nobody@example.com',
                'password' => 'InvalidPassword',
            ]);

            $this->assertContains($response->status(), [401, 422]);
        }

        $blocked = $this->postJson('/api/v1/login', [
            'email' => 'nobody@example.com',
            'password' => 'InvalidPassword',
        ]);

        $blocked->assertStatus(429);
    }

    public function test_member_application_submit_route_is_throttled_after_limit(): void
    {
        $email = 'throttle-submit@applicant.test';

        for ($i = 0; $i < 5; $i++) {
            $response = $this->postJson('/api/v1/applicant-registrations', [
                'first_name' => 'Juan',
                'middle_name' => 'Santos',
                'last_name' => 'Dela Cruz',
                'email' => $email,
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
                'membership_status' => 'applicant',
            ]);

            $this->assertContains($response->status(), [201, 422]);
        }

        $blocked = $this->postJson('/api/v1/applicant-registrations', [
            'first_name' => 'Juan',
            'middle_name' => 'Santos',
            'last_name' => 'Dela Cruz',
            'email' => $email,
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'membership_status' => 'applicant',
        ]);

        $blocked->assertStatus(429);
    }

    public function test_forgot_password_route_is_throttled_after_limit(): void
    {
        $email = 'throttle-forgot@example.test';

        for ($i = 0; $i < 5; $i++) {
            $response = $this->postJson('/api/v1/forgot-password', [
                'email' => $email,
            ]);

            $this->assertSame(200, $response->status());
        }

        $blocked = $this->postJson('/api/v1/forgot-password', [
            'email' => $email,
        ]);

        $blocked->assertStatus(429);
    }

    public function test_member_application_verify_route_is_throttled_after_limit(): void
    {
        $email = 'throttle-verify@example.test';

        for ($i = 0; $i < 5; $i++) {
            $response = $this->postJson('/api/v1/applicant-registrations/verify', [
                'email' => $email,
                'verification_token' => 'INVALID123',
            ]);

            $this->assertSame(422, $response->status());
        }

        $blocked = $this->postJson('/api/v1/applicant-registrations/verify', [
            'email' => $email,
            'verification_token' => 'INVALID123',
        ]);

        $blocked->assertStatus(429);
    }

    public function test_reset_password_route_is_throttled_after_limit(): void
    {
        $email = 'throttle-reset@example.test';

        for ($i = 0; $i < 5; $i++) {
            $response = $this->postJson('/api/v1/reset-password', [
                'email' => $email,
                'token' => 'invalid-reset-token',
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
            ]);

            $this->assertSame(422, $response->status());
        }

        $blocked = $this->postJson('/api/v1/reset-password', [
            'email' => $email,
            'token' => 'invalid-reset-token',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ]);

        $blocked->assertStatus(429);
    }
}
