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
}
