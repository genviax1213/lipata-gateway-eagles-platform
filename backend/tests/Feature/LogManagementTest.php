<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LogManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_admin_can_view_compress_and_manage_archived_logs(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        Sanctum::actingAs($admin);

        $logsDir = storage_path('logs');
        File::ensureDirectoryExists($logsDir);
        File::put($logsDir . '/laravel.log', implode("\n", [
            '[2026-03-05 10:00:00] local.INFO: auth.login_success {"user_id":1}',
            '[2026-03-05 10:01:00] local.WARNING: auth.login_failed {"email":"test@example.com"}',
        ]));

        $this->getJson('/api/v1/admin/logs')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);

        $this->get('/api/v1/admin/logs/current/download')
            ->assertOk()
            ->assertHeader('content-type', 'text/plain; charset=UTF-8');

        $this->postJson('/api/v1/admin/logs/compress')
            ->assertOk()
            ->assertJsonPath('message', 'Current logs compressed and archived.');

        $this->deleteJson('/api/v1/admin/logs/current')
            ->assertOk()
            ->assertJsonPath('message', 'Current log files cleared.');

        $archives = $this->getJson('/api/v1/admin/logs/archives')
            ->assertOk();
        $this->assertGreaterThanOrEqual(1, count($archives->json('data') ?? []));

        $archiveName = $archives->json('data.0.name');
        $this->assertIsString($archiveName);

        $archiveContent = $this->getJson('/api/v1/admin/logs/archives/' . urlencode((string) $archiveName) . '/content')
            ->assertOk();
        $this->assertGreaterThanOrEqual(2, (int) $archiveContent->json('meta.total'));

        $this->get('/api/v1/admin/logs/archives/' . urlencode((string) $archiveName) . '/download')
            ->assertOk()
            ->assertHeader('content-type', 'application/gzip');

        $this->deleteJson('/api/v1/admin/logs/archives/' . urlencode((string) $archiveName))
            ->assertOk()
            ->assertJsonPath('message', 'Archive deleted.');
    }

    public function test_member_cannot_view_logs(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);
        Sanctum::actingAs($member);

        $this->getJson('/api/v1/admin/logs')
            ->assertStatus(403);
    }
}
