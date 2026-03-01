<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUserPolicyAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_officer_cannot_manage_fellow_officer_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $officerRole->id]);
        $target = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($actor);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => 'Target Officer Updated',
            'email' => $target->email,
            'role_id' => $officerRole->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Officers cannot manage fellow officers.');
    }

    public function test_officer_cannot_manage_admin_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $actor = User::factory()->create(['role_id' => $officerRole->id]);
        $adminTarget = User::factory()->create(['role_id' => $adminRole->id]);

        Sanctum::actingAs($actor);

        $response = $this->putJson("/api/v1/admin/users/{$adminTarget->id}", [
            'name' => 'Attempt Demote Admin',
            'email' => $adminTarget->email,
            'role_id' => $memberRole->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Only administrators can manage administrator accounts.');
    }

    public function test_only_admin_can_create_admin_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Blocked Admin Create',
            'email' => 'blocked-admin-create@example.com',
            'password' => 'Password123',
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Only administrators can create or assign administrator accounts.');
    }

    public function test_only_admin_can_assign_admin_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $target = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Only administrators can create or assign administrator accounts.');
    }

    public function test_officer_can_still_create_non_admin_user_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Created By Officer',
            'email' => 'officer-created-member@example.com',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('role.name', 'member');
    }
}
