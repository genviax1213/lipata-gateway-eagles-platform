<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Post;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MemberAnnouncementAcknowledgementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_member_announcements_include_acknowledgement_state_and_can_be_acknowledged_once(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'announcement-member@example.com',
        ]);

        Member::query()->create([
            'member_number' => 'M-ANN-001',
            'first_name' => 'Announcement',
            'middle_name' => 'Portal',
            'last_name' => 'Member',
            'email' => 'announcement-member@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        $post = Post::query()->create([
            'title' => 'Member Notice',
            'slug' => 'member-notice',
            'section' => 'activities',
            'post_type' => 'article',
            'excerpt' => 'Important one-time member notice.',
            'content' => 'Important one-time member notice.',
            'show_on_homepage_community' => false,
            'show_on_announcement_bar' => true,
            'announcement_text' => 'Important member notice',
            'announcement_audience' => 'members',
            'announcement_expires_at' => now()->addWeek(),
            'send_push_notification' => false,
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'author_id' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/member-content/announcements')
            ->assertOk()
            ->assertJsonPath('0.id', $post->id)
            ->assertJsonPath('0.acknowledged_at', null);

        $response = $this->postJson("/api/v1/member-content/announcements/{$post->id}/acknowledge");

        $response->assertOk()
            ->assertJsonPath('message', 'Announcement acknowledged.');

        $acknowledgedAt = $response->json('acknowledged_at');
        $this->assertIsString($acknowledgedAt);

        $this->assertDatabaseHas('post_acknowledgements', [
            'post_id' => $post->id,
            'user_id' => $user->id,
        ]);

        $this->getJson('/api/v1/member-content/announcements')
            ->assertOk()
            ->assertJsonPath('0.id', $post->id)
            ->assertJsonPath('0.acknowledged_at', $acknowledgedAt);
    }

    public function test_member_announcement_access_uses_linked_member_when_emails_differ(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'announcement.member@lgec.org',
        ]);

        Member::query()->create([
            'member_number' => 'M-ANN-002',
            'first_name' => 'Announcement',
            'middle_name' => 'Linked',
            'last_name' => 'Member',
            'email' => 'announcement-member-personal@example.com',
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);

        $post = Post::query()->create([
            'title' => 'Linked Member Notice',
            'slug' => 'linked-member-notice',
            'section' => 'activities',
            'post_type' => 'article',
            'excerpt' => 'Member notice for linked profile.',
            'content' => 'Member notice for linked profile.',
            'show_on_homepage_community' => false,
            'show_on_announcement_bar' => true,
            'announcement_text' => 'Linked member notice',
            'announcement_audience' => 'members',
            'announcement_expires_at' => now()->addWeek(),
            'send_push_notification' => false,
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'author_id' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/member-content/announcements')
            ->assertOk()
            ->assertJsonPath('0.id', $post->id);
    }
}
