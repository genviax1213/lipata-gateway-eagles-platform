<?php

namespace Tests\Feature;

use App\Models\Contribution;
use App\Models\Member;
use App\Models\Post;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileFinanceAndAnnouncementsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_mobile_my_contributions_returns_personal_member_payload(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'finance.member@lgec.org',
            'mobile_access_enabled' => true,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-MFIN-001',
            'first_name' => 'Personal',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'finance-dashboard-personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 500,
            'note' => 'Monthly contribution',
            'encoded_by_user_id' => $user->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/mobile/finance/my-contributions')
            ->assertOk()
            ->assertJsonPath('total_amount', 500)
            ->assertJsonPath('data.0.note', 'Monthly contribution');
    }

    public function test_mobile_finance_endpoints_reject_finance_officer_mobile_account(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'finance.summary@lgec.org',
            'finance_role' => 'treasurer',
            'mobile_access_enabled' => true,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/mobile/finance/dashboard')
            ->assertStatus(403)
            ->assertJsonPath('message', 'This mobile app is only available for personal member accounts.');
    }

    public function test_mobile_announcements_list_and_detail_work_for_mobile_enabled_member(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'announcements.mobile@lgec.org',
            'mobile_access_enabled' => true,
        ]);

        Member::query()->create([
            'member_number' => 'M-MANN-001',
            'first_name' => 'Announcement',
            'middle_name' => null,
            'last_name' => 'Mobile',
            'email' => 'announcement-mobile-personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        $post = Post::query()->create([
            'title' => 'Mobile Internal Notice',
            'slug' => 'mobile-internal-notice',
            'section' => 'activities',
            'post_type' => 'article',
            'excerpt' => 'Internal mobile notice.',
            'content' => 'Internal mobile notice body.',
            'show_on_homepage_community' => false,
            'show_on_announcement_bar' => true,
            'announcement_text' => 'Mobile internal notice',
            'announcement_audience' => 'members',
            'announcement_expires_at' => now()->addWeek(),
            'send_push_notification' => false,
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'author_id' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/mobile/announcements')
            ->assertOk()
            ->assertJsonPath('0.id', $post->id);

        $this->getJson('/api/v1/mobile/announcements/mobile-internal-notice')
            ->assertOk()
            ->assertJsonPath('id', $post->id);
    }

    public function test_mobile_endpoints_reject_web_only_user_without_mobile_access(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'web.only@lgec.org',
            'mobile_access_enabled' => false,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/mobile/finance/my-contributions')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Mobile access is not enabled for this account.');
    }
}
