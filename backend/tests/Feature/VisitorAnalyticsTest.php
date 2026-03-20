<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VisitorAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_it_tracks_anonymous_and_authenticated_visitors_and_reports_admin_overview(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'visitor-admin@example.com',
        ]);

        $member = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'visitor-member@example.com',
            'name' => 'Tracked Member',
        ]);

        $this->postJson('/api/v1/visitor-analytics/track', [
            'visitor_token' => 'anon-visitor-token',
            'session_token' => 'anon-session-token',
            'path' => '/',
            'title' => 'Landing',
            'referrer' => 'https://example.com/',
            'timezone' => 'Asia/Manila',
            'screen_width' => 1440,
            'screen_height' => 900,
            'event_type' => 'page_view',
            'occurred_at' => now()->toIso8601String(),
        ])->assertStatus(202);

        Sanctum::actingAs($member);

        $this->postJson('/api/v1/visitor-analytics/track', [
            'visitor_token' => 'member-visitor-token',
            'session_token' => 'member-session-token',
            'path' => '/portal',
            'title' => 'Portal Dashboard',
            'referrer' => 'https://lgec.test/login',
            'timezone' => 'Asia/Manila',
            'screen_width' => 1440,
            'screen_height' => 900,
            'event_type' => 'page_view',
            'occurred_at' => now()->toIso8601String(),
        ])->assertStatus(202);

        $this->postJson('/api/v1/visitor-analytics/track', [
            'visitor_token' => 'member-visitor-token',
            'session_token' => 'member-session-token',
            'path' => '/portal/visitors',
            'title' => 'Visitors',
            'timezone' => 'Asia/Manila',
            'screen_width' => 1440,
            'screen_height' => 900,
            'event_type' => 'page_view',
            'occurred_at' => now()->toIso8601String(),
        ])->assertStatus(202);

        $this->assertDatabaseHas('visitor_sessions', [
            'session_token' => 'anon-session-token',
            'visitor_token' => 'anon-visitor-token',
            'user_id' => null,
            'total_page_views' => 1,
        ]);

        $this->assertDatabaseHas('visitor_sessions', [
            'session_token' => 'member-session-token',
            'visitor_token' => 'member-visitor-token',
            'user_id' => $member->id,
            'is_authenticated' => true,
            'total_page_views' => 2,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/visitors/overview?window_days=7');

        $response->assertOk()
            ->assertJsonPath('summary.live_visitors', 2)
            ->assertJsonPath('summary.live_authenticated_visitors', 1)
            ->assertJsonPath('summary.today_page_views', 3)
            ->assertJsonPath('summary.today_unique_visitors', 2)
            ->assertJsonPath('summary.window_page_views', 3)
            ->assertJsonPath('summary.window_unique_visitors', 2)
            ->assertJsonFragment([
                'path' => '/portal',
                'views' => 1,
            ])
            ->assertJsonFragment([
                'path' => '/portal/visitors',
                'views' => 1,
            ])
            ->assertJsonFragment([
                'email' => 'visitor-member@example.com',
                'name' => 'Tracked Member',
            ]);
    }

    public function test_member_without_users_view_permission_cannot_access_admin_overview(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/admin/visitors/overview')
            ->assertStatus(403);
    }
}
