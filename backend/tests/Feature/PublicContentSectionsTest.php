<?php

namespace Tests\Feature;

use App\Models\CalendarEvent;
use App\Models\Post;
use App\Models\Role;
use App\Models\User;
use App\Notifications\ContactInquiryNotification;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PublicContentSectionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_homepage_community_endpoint_reads_flagged_activities_only(): void
    {
        $author = User::factory()->create();

        $visible = Post::query()->create([
            'title' => 'Visible Activity',
            'slug' => 'visible-activity',
            'section' => 'activities',
            'excerpt' => 'Visible',
            'content' => '<p>Visible</p>',
            'status' => 'published',
            'show_on_homepage_community' => true,
            'published_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        Post::query()->create([
            'title' => 'Hidden Activity',
            'slug' => 'hidden-activity',
            'section' => 'activities',
            'excerpt' => 'Hidden',
            'content' => '<p>Hidden</p>',
            'status' => 'published',
            'show_on_homepage_community' => false,
            'published_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        Post::query()->create([
            'title' => 'Draft Activity',
            'slug' => 'draft-activity',
            'section' => 'activities',
            'excerpt' => 'Draft',
            'content' => '<p>Draft</p>',
            'status' => 'draft',
            'show_on_homepage_community' => true,
            'published_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        $response = $this->getJson('/api/v1/content/homepage-community');

        $response
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $visible->id)
            ->assertJsonPath('0.section', 'activities')
            ->assertJsonPath('0.show_on_homepage_community', true);
    }

    public function test_public_section_search_can_return_video_posts(): void
    {
        $author = User::factory()->create();

        Post::query()->create([
            'title' => 'Service Recap Video',
            'slug' => 'service-recap-video',
            'section' => 'activities',
            'post_type' => 'video',
            'excerpt' => 'Short recap',
            'content' => '',
            'video_provider' => 'youtube',
            'video_source_url' => 'https://www.youtube.com/watch?v=xRMB5GmM-sk',
            'video_embed_url' => 'https://www.youtube.com/embed/xRMB5GmM-sk',
            'video_thumbnail_text' => 'Anniversary recap',
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        $response = $this->getJson('/api/v1/content/activities?q=recap');

        $response
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.post_type', 'video')
            ->assertJsonPath('0.video_url', 'https://www.youtube.com/watch?v=xRMB5GmM-sk')
            ->assertJsonPath('0.video_embed_url', 'https://www.youtube.com/embed/xRMB5GmM-sk')
            ->assertJsonPath('0.video_thumbnail_url', 'https://i.ytimg.com/vi/xRMB5GmM-sk/hqdefault.jpg')
            ->assertJsonPath('0.video_thumbnail_text', 'Anniversary recap');
    }

    public function test_public_activities_feed_hides_members_only_announcement_articles(): void
    {
        $author = User::factory()->create();

        Post::query()->create([
            'title' => 'Public Activity',
            'slug' => 'public-activity',
            'section' => 'activities',
            'excerpt' => 'Public',
            'content' => '<p>Public</p>',
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        Post::query()->create([
            'title' => 'Members Activity',
            'slug' => 'members-activity',
            'section' => 'activities',
            'excerpt' => 'Members',
            'content' => '<p>Members</p>',
            'status' => 'published',
            'show_on_announcement_bar' => true,
            'announcement_text' => 'Members only',
            'announcement_audience' => 'members',
            'published_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        $this->getJson('/api/v1/content/activities')
            ->assertOk()
            ->assertJsonMissing(['slug' => 'members-activity'])
            ->assertJsonFragment(['slug' => 'public-activity']);
    }

    public function test_public_announcements_endpoint_returns_only_active_flagged_activity_posts(): void
    {
        $author = User::factory()->create();

        $visible = Post::query()->create([
            'title' => 'Assembly Reminder',
            'slug' => 'assembly-reminder',
            'section' => 'activities',
            'excerpt' => 'Please arrive before 7:00 PM.',
            'content' => '<p>Assembly notice.</p>',
            'announcement_text' => 'General assembly tonight',
            'show_on_announcement_bar' => true,
            'announcement_audience' => 'public',
            'status' => 'published',
            'published_at' => now()->subHour(),
            'announcement_expires_at' => now()->addWeek(),
            'author_id' => $author->id,
        ]);

        Post::query()->create([
            'title' => 'Expired Notice',
            'slug' => 'expired-notice',
            'section' => 'activities',
            'excerpt' => 'Expired announcement.',
            'content' => '<p>Expired.</p>',
            'announcement_text' => 'Expired',
            'show_on_announcement_bar' => true,
            'announcement_audience' => 'public',
            'status' => 'published',
            'published_at' => now()->subDays(10),
            'announcement_expires_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        Post::query()->create([
            'title' => 'News Story',
            'slug' => 'news-story',
            'section' => 'news',
            'excerpt' => 'Wrong section.',
            'content' => '<p>Wrong section.</p>',
            'announcement_text' => 'Wrong section',
            'show_on_announcement_bar' => true,
            'announcement_audience' => 'public',
            'status' => 'published',
            'published_at' => now()->subHour(),
            'announcement_expires_at' => now()->addWeek(),
            'author_id' => $author->id,
        ]);

        Post::query()->create([
            'title' => 'Members Notice',
            'slug' => 'members-notice',
            'section' => 'activities',
            'excerpt' => 'Members only.',
            'content' => '<p>Members only.</p>',
            'announcement_text' => 'Private alert',
            'show_on_announcement_bar' => true,
            'announcement_audience' => 'members',
            'status' => 'published',
            'published_at' => now()->subHour(),
            'announcement_expires_at' => now()->addWeek(),
            'author_id' => $author->id,
        ]);

        $this->getJson('/api/v1/content/announcements')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $visible->id)
            ->assertJsonPath('0.show_on_announcement_bar', true)
            ->assertJsonPath('0.announcement_text', 'General assembly tonight')
            ->assertJsonMissing(['announcement_text' => 'Private alert']);
    }

    public function test_authenticated_member_announcements_include_members_only_items(): void
    {
        $author = User::factory()->create();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'announcement-member@example.test',
        ]);

        Post::query()->create([
            'title' => 'Public Reminder',
            'slug' => 'public-reminder',
            'section' => 'activities',
            'excerpt' => 'Public.',
            'content' => '<p>Public.</p>',
            'announcement_text' => 'Public alert',
            'show_on_announcement_bar' => true,
            'announcement_audience' => 'public',
            'status' => 'published',
            'published_at' => now()->subHour(),
            'announcement_expires_at' => now()->addWeek(),
            'author_id' => $author->id,
        ]);

        $private = Post::query()->create([
            'title' => 'Members Reminder',
            'slug' => 'members-reminder',
            'section' => 'activities',
            'excerpt' => 'Members.',
            'content' => '<p>Members.</p>',
            'announcement_text' => 'Members alert',
            'show_on_announcement_bar' => true,
            'announcement_audience' => 'members',
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'announcement_expires_at' => now()->addWeek(),
            'author_id' => $author->id,
        ]);

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/member-content/announcements')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.id', $private->id)
            ->assertJsonPath('0.announcement_audience', 'members');
    }

    public function test_members_only_announcement_article_is_hidden_from_public_but_available_to_authenticated_member(): void
    {
        $author = User::factory()->create();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'private-article-member@example.test',
        ]);

        Post::query()->create([
            'title' => 'Members Activity Article',
            'slug' => 'members-activity-article',
            'section' => 'activities',
            'excerpt' => 'Members only article.',
            'content' => '<p>Members only article.</p>',
            'announcement_text' => 'Members article',
            'show_on_announcement_bar' => true,
            'announcement_audience' => 'members',
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'announcement_expires_at' => now()->addWeek(),
            'author_id' => $author->id,
        ]);

        $this->getJson('/api/v1/content/post/members-activity-article')->assertNotFound();

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/member-content/post/members-activity-article')
            ->assertOk()
            ->assertJsonPath('slug', 'members-activity-article')
            ->assertJsonPath('announcement_audience', 'members');
    }

    public function test_public_schedules_endpoint_returns_upcoming_calendar_entries(): void
    {
        $creator = User::factory()->create();

        CalendarEvent::query()->create([
            'title' => 'Older Notice',
            'event_type' => 'meeting',
            'starts_at' => now()->subDays(3),
            'ends_at' => now()->subDays(3)->addHour(),
            'location' => 'Old Hall',
            'description' => 'Old schedule',
            'created_by_user_id' => $creator->id,
            'updated_by_user_id' => $creator->id,
        ]);

        $visible = CalendarEvent::query()->create([
            'title' => 'Community Service Drive',
            'event_type' => 'activity',
            'starts_at' => now()->addDays(2),
            'ends_at' => now()->addDays(2)->addHours(3),
            'location' => 'City Plaza',
            'description' => 'Bring the club shirt.',
            'created_by_user_id' => $creator->id,
            'updated_by_user_id' => $creator->id,
        ]);

        $this->getJson('/api/v1/content/schedules')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $visible->id)
            ->assertJsonPath('data.0.title', 'Community Service Drive')
            ->assertJsonPath('data.0.location', 'City Plaza');
    }

    public function test_contact_inquiry_notifies_superadmins_admins_secretaries_and_officers(): void
    {
        Notification::fake();

        $targetRoles = ['superadmin', 'admin', 'secretary', 'officer'];
        $recipients = collect($targetRoles)->map(function (string $roleName, int $index) {
            $role = Role::query()->where('name', $roleName)->firstOrFail();

            return User::factory()->create([
                'role_id' => $role->id,
                'email' => "{$roleName}{$index}@example.test",
            ]);
        });

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'member-contact@example.test',
        ]);

        $this->postJson('/api/v1/contact/inquiries', [
            'name' => 'Public Sender',
            'email' => 'sender@example.test',
            'subject' => 'Need assistance',
            'message' => 'Please send me the current membership requirements.',
        ])->assertCreated()
            ->assertJsonPath('message', 'Inquiry sent successfully.');

        foreach ($recipients as $recipient) {
            Notification::assertSentTo(
                $recipient,
                ContactInquiryNotification::class
            );
        }

        Notification::assertNotSentTo($member, ContactInquiryNotification::class);
    }

    public function test_resolutions_are_hidden_from_public_endpoints_but_available_to_authenticated_members(): void
    {
        $author = User::factory()->create();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'member-resolution-reader@example.test',
        ]);

        $resolution = Post::query()->create([
            'title' => 'Board Resolution 2026-01',
            'slug' => 'board-resolution-2026-01',
            'section' => 'resolutions',
            'excerpt' => 'Approved resolution.',
            'content' => '<p>Resolved.</p>',
            'status' => 'published',
            'published_at' => now()->subMinute(),
            'author_id' => $author->id,
        ]);

        $this->getJson('/api/v1/content/resolutions')->assertNotFound();
        $this->getJson('/api/v1/content/post/board-resolution-2026-01')->assertNotFound();

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/member-content/resolutions')
            ->assertOk()
            ->assertJsonPath('data.0.id', $resolution->id)
            ->assertJsonPath('data.0.section', 'resolutions')
            ->assertJsonPath('data.0.title', 'Board Resolution 2026-01');
    }
}
