<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CmsImageLibraryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        Storage::fake('public');
    }

    public function test_available_images_lists_only_unlinked_post_images(): void
    {
        $officer = $this->officerUser();

        Storage::disk('public')->put('posts/orphan.jpg', 'orphan');
        Storage::disk('public')->put('posts/used-main.jpg', 'main');
        Storage::disk('public')->put('posts/used-inline.jpg', 'inline');

        Post::query()->create([
            'title' => 'Connected Post',
            'slug' => 'connected-post',
            'section' => 'news',
            'excerpt' => 'Connected',
            'content' => '<p>Body</p><img src="/storage/posts/used-inline.jpg" alt="inline" />',
            'image_path' => 'posts/used-main.jpg',
            'status' => 'published',
            'author_id' => $officer->id,
        ]);

        Sanctum::actingAs($officer);

        $response = $this->getJson('/api/v1/cms/posts/available-images');

        $response->assertOk();
        $response->assertJsonFragment(['path' => 'posts/orphan.jpg']);
        $response->assertJsonMissing(['path' => 'posts/used-main.jpg']);
        $response->assertJsonMissing(['path' => 'posts/used-inline.jpg']);
    }

    public function test_store_post_can_attach_unlinked_selected_image_path(): void
    {
        $officer = $this->officerUser();

        Storage::disk('public')->put('posts/library.jpg', 'library');

        Sanctum::actingAs($officer);

        $response = $this->postJson('/api/v1/cms/posts', [
            'title' => 'Post With Library Image',
            'section' => 'news',
            'excerpt' => 'Excerpt',
            'content' => '<p>Content</p>',
            'status' => 'published',
            'selected_image_path' => 'posts/library.jpg',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('posts', [
            'title' => 'Post With Library Image',
            'image_path' => 'posts/library.jpg',
        ]);
    }

    public function test_store_post_rejects_selected_image_path_when_not_unlinked(): void
    {
        $officer = $this->officerUser();

        Storage::disk('public')->put('posts/in-use.jpg', 'in-use');

        Post::query()->create([
            'title' => 'Existing',
            'slug' => 'existing',
            'section' => 'news',
            'excerpt' => 'Existing',
            'content' => '<p>Existing</p>',
            'image_path' => 'posts/in-use.jpg',
            'status' => 'published',
            'author_id' => $officer->id,
        ]);

        Sanctum::actingAs($officer);

        $response = $this->postJson('/api/v1/cms/posts', [
            'title' => 'Another Post',
            'section' => 'news',
            'excerpt' => 'Excerpt',
            'content' => '<p>Content</p>',
            'status' => 'published',
            'selected_image_path' => 'posts/in-use.jpg',
        ]);

        $response->assertStatus(422);
        $response->assertJsonFragment([
            'message' => 'Selected image is not available. Please pick an unlinked image from the list.',
        ]);
    }

    private function officerUser(): User
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();

        return User::factory()->create([
            'role_id' => $officerRole->id,
        ]);
    }
}

