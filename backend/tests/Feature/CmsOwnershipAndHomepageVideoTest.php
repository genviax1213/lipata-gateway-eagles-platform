<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\CalendarEvent;
use App\Models\Post;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CmsOwnershipAndHomepageVideoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_secretary_can_create_cms_posts_without_admin_delete_power(): void
    {
        $secretaryRole = Role::query()->where('name', 'secretary')->firstOrFail();
        $secretary = User::factory()->create([
            'role_id' => $secretaryRole->id,
            'email' => 'secretary-cms@example.test',
        ]);

        Sanctum::actingAs($secretary);

        $this->postJson('/api/v1/cms/posts', [
            'title' => 'Secretary Post',
            'section' => 'news',
            'excerpt' => 'Secretary excerpt',
            'content' => '<p>Secretary content</p>',
            'status' => 'published',
        ])->assertCreated()
            ->assertJsonPath('title', 'Secretary Post');
    }

    public function test_former_author_can_only_list_and_delete_own_posts(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $author = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'former-author@example.test',
        ]);
        $other = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'other-author@example.test',
        ]);

        $ownPost = Post::query()->create([
            'title' => 'Own Post',
            'slug' => 'own-post',
            'section' => 'news',
            'excerpt' => 'Own excerpt',
            'content' => '<p>Own body</p>',
            'status' => 'published',
            'author_id' => $author->id,
        ]);

        $otherPost = Post::query()->create([
            'title' => 'Other Post',
            'slug' => 'other-post',
            'section' => 'news',
            'excerpt' => 'Other excerpt',
            'content' => '<p>Other body</p>',
            'status' => 'published',
            'author_id' => $other->id,
        ]);

        Sanctum::actingAs($author);

        $this->getJson('/api/v1/cms/posts')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Own Post')
            ->assertJsonMissing(['title' => 'Other Post']);

        $this->deleteJson("/api/v1/cms/posts/{$otherPost->id}")
            ->assertForbidden();

        $this->deleteJson("/api/v1/cms/posts/{$ownPost->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Post deleted');
    }

    public function test_homepage_reputation_video_is_admin_managed_and_publicly_visible(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'video-admin@example.test',
        ]);
        $member = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'video-member@example.test',
        ]);

        Sanctum::actingAs($member);
        $this->putJson('/api/v1/homepage/reputation-video', [
            'videos' => [
                ['video_url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
            ],
        ])->assertForbidden();

        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/homepage/reputation-video', [
            'videos' => [
                [
                    'video_url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    'title' => 'LGEC Reputation',
                    'caption' => 'Service and brotherhood in action',
                ],
                [
                    'video_url' => 'https://www.youtube.com/watch?v=9bZkp7q19f0',
                    'title' => 'LGEC Community',
                    'caption' => 'Second video',
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('videos.0.provider', 'youtube')
            ->assertJsonPath('videos.0.embed_url', 'https://www.youtube.com/embed/dQw4w9WgXcQ')
            ->assertJsonPath('videos.1.embed_url', 'https://www.youtube.com/embed/9bZkp7q19f0');

        $this->getJson('/api/v1/content/homepage-reputation-video')
            ->assertOk()
            ->assertJsonPath('videos.0.title', 'LGEC Reputation')
            ->assertJsonPath('videos.0.provider', 'youtube')
            ->assertJsonCount(2, 'videos');
    }

    public function test_post_sanitization_keeps_allowed_video_embeds_and_rejects_unapproved_iframes(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create([
            'role_id' => $officerRole->id,
            'email' => 'officer-embed@example.test',
        ]);

        Sanctum::actingAs($officer);

        $allowed = $this->postJson('/api/v1/cms/posts', [
            'title' => 'Video Embed Post',
            'section' => 'news',
            'excerpt' => 'Allowed embed',
            'content' => '<p>Intro</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
            'status' => 'published',
        ])->assertCreated();

        $this->assertStringContainsString('youtube.com/embed/dQw4w9WgXcQ', (string) $allowed->json('content'));
        $this->assertStringContainsString('<iframe', (string) $allowed->json('content'));

        $blocked = $this->postJson('/api/v1/cms/posts', [
            'title' => 'Blocked Embed Post',
            'section' => 'news',
            'excerpt' => 'Blocked embed',
            'content' => '<p>Intro</p><iframe src="https://evil.example/embed/123"></iframe>',
            'status' => 'published',
        ])->assertCreated();

        $this->assertStringNotContainsString('<iframe', (string) $blocked->json('content'));
    }

    public function test_admin_can_delete_attendance_roster_for_event(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'attendance-admin@example.test',
        ]);
        $member = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'attendance-member@example.test',
        ]);

        $event = CalendarEvent::query()->create([
            'title' => 'Attendance Cleanup',
            'event_type' => 'meeting',
            'starts_at' => now()->addDay(),
            'created_by_user_id' => $admin->id,
        ]);

        AttendanceRecord::query()->create([
            'calendar_event_id' => $event->id,
            'attendee_user_id' => $member->id,
            'scanned_by_user_id' => $admin->id,
            'source' => 'qr',
            'scanned_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/attendance/events/{$event->id}/records")
            ->assertOk()
            ->assertJsonPath('deleted_count', 1);

        $this->assertDatabaseMissing('attendance_records', [
            'calendar_event_id' => $event->id,
        ]);
    }
}
