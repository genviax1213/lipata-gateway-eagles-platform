<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Post;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
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

    public function test_store_post_can_reuse_selected_image_path_even_when_linked(): void
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

        $response->assertCreated();
        $this->assertDatabaseHas('posts', [
            'title' => 'Another Post',
            'image_path' => 'posts/in-use.jpg',
        ]);
    }

    public function test_store_post_mirrors_uploaded_image_when_public_mirror_root_is_configured(): void
    {
        $officer = $this->officerUser();
        $mirrorRoot = storage_path('framework/testing/cms-public-mirror');
        File::deleteDirectory($mirrorRoot);
        Config::set('app.cms_public_image_mirror_root', $mirrorRoot);

        Sanctum::actingAs($officer);

        $response = $this->post('/api/v1/cms/posts', [
            'title' => 'Mirrored Image Post',
            'section' => 'news',
            'excerpt' => 'Excerpt',
            'content' => '<p>Content</p>',
            'status' => 'published',
            'image' => UploadedFile::fake()->image('cover.jpg'),
        ]);

        $response->assertCreated();

        $post = Post::query()->where('title', 'Mirrored Image Post')->firstOrFail();
        $this->assertNotNull($post->image_path);
        $this->assertFileExists($mirrorRoot . '/' . $post->image_path);

        File::deleteDirectory($mirrorRoot);
    }

    public function test_delete_library_image_removes_unlinked_image(): void
    {
        $admin = $this->adminUser();

        Storage::disk('public')->put('posts/remove-me.jpg', 'remove');

        Sanctum::actingAs($admin);

        $response = $this->deleteJson('/api/v1/cms/posts/image-library', [
            'path' => 'posts/remove-me.jpg',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Image deleted from library.');
        Storage::disk('public')->assertMissing('posts/remove-me.jpg');
    }

    public function test_delete_library_image_rejects_linked_image(): void
    {
        $admin = $this->adminUser();

        Storage::disk('public')->put('posts/in-use-delete.jpg', 'in-use');

        Post::query()->create([
            'title' => 'Using Image',
            'slug' => 'using-image',
            'section' => 'news',
            'excerpt' => 'Using',
            'content' => '<p>Content</p>',
            'image_path' => 'posts/in-use-delete.jpg',
            'status' => 'published',
            'author_id' => $admin->id,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->deleteJson('/api/v1/cms/posts/image-library', [
            'path' => 'posts/in-use-delete.jpg',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Linked images cannot be deleted. Remove the image from linked posts first.');
        Storage::disk('public')->assertExists('posts/in-use-delete.jpg');
    }

    public function test_update_post_with_reused_cover_image_does_not_delete_shared_file(): void
    {
        $officer = $this->officerUser();

        Storage::disk('public')->put('posts/shared-cover.jpg', 'shared');

        $firstPost = Post::query()->create([
            'title' => 'First Post',
            'slug' => 'first-post',
            'section' => 'news',
            'excerpt' => 'First',
            'content' => '<p>First</p>',
            'image_path' => 'posts/shared-cover.jpg',
            'status' => 'published',
            'author_id' => $officer->id,
        ]);

        Post::query()->create([
            'title' => 'Second Post',
            'slug' => 'second-post',
            'section' => 'news',
            'excerpt' => 'Second',
            'content' => '<p>Second</p>',
            'image_path' => 'posts/shared-cover.jpg',
            'status' => 'published',
            'author_id' => $officer->id,
        ]);

        Sanctum::actingAs($officer);

        $response = $this->postJson("/api/v1/cms/posts/{$firstPost->id}", [
            '_method' => 'PUT',
            'title' => 'First Post Updated',
            'section' => 'news',
            'excerpt' => 'Updated',
            'content' => '<p>Updated</p>',
            'status' => 'published',
            'image' => UploadedFile::fake()->image('replacement.jpg'),
        ]);

        $response->assertOk();
        Storage::disk('public')->assertExists('posts/shared-cover.jpg');
    }

    public function test_destroy_post_with_reused_cover_image_does_not_delete_shared_file(): void
    {
        $admin = $this->adminUser();

        Storage::disk('public')->put('posts/shared-delete.jpg', 'shared');

        $post = Post::query()->create([
            'title' => 'Delete Me',
            'slug' => 'delete-me',
            'section' => 'news',
            'excerpt' => 'Delete Me',
            'content' => '<p>Delete</p>',
            'image_path' => 'posts/shared-delete.jpg',
            'status' => 'published',
            'author_id' => $admin->id,
        ]);

        Post::query()->create([
            'title' => 'Keep Me',
            'slug' => 'keep-me',
            'section' => 'news',
            'excerpt' => 'Keep',
            'content' => '<p>Keep</p>',
            'image_path' => 'posts/shared-delete.jpg',
            'status' => 'published',
            'author_id' => $admin->id,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->deleteJson("/api/v1/cms/posts/{$post->id}");

        $response->assertOk()
            ->assertJsonPath('message', 'Post deleted');
        Storage::disk('public')->assertExists('posts/shared-delete.jpg');
    }

    public function test_posts_delete_permission_can_access_image_library_without_posts_create(): void
    {
        $permission = Permission::query()->where('name', 'posts.delete')->firstOrFail();
        $role = Role::query()->create([
            'name' => 'cms_image_cleanup_only',
            'description' => 'Can delete CMS images without creating posts.',
        ]);
        $role->permissions()->attach($permission->id);

        $user = User::factory()->create([
            'role_id' => $role->id,
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/cms/posts/image-library');

        $response->assertOk();
    }

    private function officerUser(): User
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();

        return User::factory()->create([
            'role_id' => $officerRole->id,
        ]);
    }

    private function adminUser(): User
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();

        return User::factory()->create([
            'role_id' => $adminRole->id,
        ]);
    }
}
