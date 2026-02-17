<?php

namespace Tests\Feature;

use App\Models\ForumPost;
use App\Models\ForumThread;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ForumSystemTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_member_can_create_thread_and_reply(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $createResponse = $this->postJson('/api/v1/forum/threads', [
            'title' => 'Forum Launch Discussion',
            'body' => 'Let us discuss moderation policy.',
        ]);

        $createResponse->assertStatus(201);
        $threadId = (int) $createResponse->json('id');
        $this->assertGreaterThan(0, $threadId);

        $replyResponse = $this->postJson("/api/v1/forum/threads/{$threadId}/posts", [
            'body' => 'I support this launch.',
        ]);

        $replyResponse->assertStatus(201);
        $this->assertDatabaseHas('forum_posts', [
            'thread_id' => $threadId,
            'body' => 'I support this launch.',
        ]);
    }

    public function test_member_cannot_moderate_thread_without_forum_role(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        $thread = ForumThread::query()->create([
            'title' => 'General Thread',
            'slug' => 'general-thread',
            'body' => 'Initial content',
            'created_by_user_id' => $member->id,
            'last_posted_at' => now(),
        ]);

        Sanctum::actingAs($member);

        $response = $this->postJson("/api/v1/forum/threads/{$thread->id}/lock", [
            'locked' => true,
        ]);

        $response->assertStatus(403);
    }

    public function test_forum_moderator_can_lock_thread_and_hide_post(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $moderator = User::factory()->create([
            'role_id' => $memberRole->id,
            'forum_role' => 'forum_moderator',
        ]);
        $author = User::factory()->create(['role_id' => $memberRole->id]);

        $thread = ForumThread::query()->create([
            'title' => 'Moderation Thread',
            'slug' => 'moderation-thread',
            'body' => 'Original message',
            'created_by_user_id' => $author->id,
            'last_posted_at' => now(),
        ]);
        $post = ForumPost::query()->create([
            'thread_id' => $thread->id,
            'body' => 'Reply to moderate',
            'created_by_user_id' => $author->id,
        ]);

        Sanctum::actingAs($moderator);

        $lockResponse = $this->postJson("/api/v1/forum/threads/{$thread->id}/lock", [
            'locked' => true,
        ]);
        $lockResponse->assertStatus(200)->assertJsonPath('thread.is_locked', true);

        $hideResponse = $this->postJson("/api/v1/forum/posts/{$post->id}/visibility", [
            'hidden' => true,
        ]);
        $hideResponse->assertStatus(200)->assertJsonPath('post.is_hidden', true);
    }

    public function test_thread_starter_can_delete_own_thread(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $starter = User::factory()->create(['role_id' => $memberRole->id]);

        $thread = ForumThread::query()->create([
            'title' => 'Starter Owned Thread',
            'slug' => 'starter-owned-thread',
            'body' => 'Initial content',
            'created_by_user_id' => $starter->id,
            'last_posted_at' => now(),
        ]);
        ForumPost::query()->create([
            'thread_id' => $thread->id,
            'body' => 'Initial post',
            'created_by_user_id' => $starter->id,
        ]);

        Sanctum::actingAs($starter);

        $response = $this->deleteJson("/api/v1/forum/threads/{$thread->id}");
        $response->assertStatus(200);

        $this->assertDatabaseMissing('forum_threads', ['id' => $thread->id]);
    }

    public function test_moderator_can_delete_post_but_member_cannot(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $moderator = User::factory()->create([
            'role_id' => $memberRole->id,
            'forum_role' => 'forum_moderator',
        ]);
        $member = User::factory()->create(['role_id' => $memberRole->id]);
        $author = User::factory()->create(['role_id' => $memberRole->id]);

        $thread = ForumThread::query()->create([
            'title' => 'Delete Reply Thread',
            'slug' => 'delete-reply-thread',
            'body' => 'Initial content',
            'created_by_user_id' => $author->id,
            'last_posted_at' => now(),
        ]);
        $post = ForumPost::query()->create([
            'thread_id' => $thread->id,
            'body' => 'Reply to delete',
            'created_by_user_id' => $author->id,
        ]);

        Sanctum::actingAs($member);
        $memberDeleteResponse = $this->deleteJson("/api/v1/forum/posts/{$post->id}");
        $memberDeleteResponse->assertStatus(403);

        Sanctum::actingAs($moderator);
        $moderatorDeleteResponse = $this->deleteJson("/api/v1/forum/posts/{$post->id}");
        $moderatorDeleteResponse->assertStatus(200);

        $this->assertDatabaseMissing('forum_posts', ['id' => $post->id]);
    }
}
