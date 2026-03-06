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
}
