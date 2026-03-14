<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicContentSectionsTest extends TestCase
{
    use RefreshDatabase;

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
}
