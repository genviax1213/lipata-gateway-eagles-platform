<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
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

        $response->assertStatus(403);
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

        $response->assertStatus(403);
    }

    public function test_only_superadmin_can_create_admin_account(): void
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

        $response->assertStatus(403);
    }

    public function test_only_superadmin_can_assign_admin_account(): void
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

        $response->assertStatus(403);
    }

    public function test_officer_cannot_create_non_admin_user_account(): void
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

        $response->assertStatus(403);
    }

    public function test_superadmin_can_promote_user_to_admin_within_limit(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create();

        Sanctum::actingAs($superadmin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('role.name', 'admin');
    }

    public function test_superadmin_cannot_exceed_max_admin_count(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        User::factory()->create(['role_id' => $adminRole->id]);
        User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create();

        Sanctum::actingAs($superadmin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Maximum administrator accounts reached.');
    }

    public function test_superadmin_can_reset_admin_password(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create([
            'role_id' => $adminRole->id,
            'password' => Hash::make('OldPass123'),
        ]);

        Sanctum::actingAs($superadmin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/password", [
            'password' => 'NewPass456',
            'password_confirmation' => 'NewPass456',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Password updated successfully.');
        $this->assertTrue(Hash::check('NewPass456', (string) $target->fresh()->password));
    }

    public function test_admin_cannot_reset_superadmin_password(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create([
            'role_id' => $superadminRole->id,
            'password' => Hash::make('OldPass123'),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/password", [
            'password' => 'NewPass456',
            'password_confirmation' => 'NewPass456',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Administrators cannot reset the superadmin password.');
    }

    public function test_admin_cannot_reset_fellow_admin_password(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create([
            'role_id' => $adminRole->id,
            'password' => Hash::make('OldPass123'),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/password", [
            'password' => 'NewPass456',
            'password_confirmation' => 'NewPass456',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Administrators cannot reset fellow administrator passwords.');
    }

    public function test_admin_can_reset_member_password(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create([
            'role_id' => $memberRole->id,
            'password' => Hash::make('OldPass123'),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/password", [
            'password' => 'NewPass456',
            'password_confirmation' => 'NewPass456',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Password updated successfully.');
        $this->assertTrue(Hash::check('NewPass456', (string) $target->fresh()->password));
    }

    public function test_superadmin_cannot_reset_bootstrap_superadmin_password_via_admin_endpoint(): void
    {
        config()->set('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph');

        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $actor = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'second-superadmin@example.com',
        ]);
        $bootstrap = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'admin@lipataeagles.ph',
            'password' => Hash::make('Intent$0811'),
        ]);

        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/admin/users/{$bootstrap->id}/password", [
            'password' => 'NewPass456',
            'password_confirmation' => 'NewPass456',
        ])->assertStatus(403)
            ->assertJsonPath('message', 'Bootstrap password reset is only available through the protected recovery flow.');

        $this->assertTrue(Hash::check('Intent$0811', (string) $bootstrap->fresh()->password));
    }

    public function test_registered_user_email_cannot_be_changed_via_user_update(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'locked-account@example.com',
        ]);

        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => 'changed-bootstrap@example.com',
            'role_id' => $superadminRole->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Registration email is the canonical account identity and cannot be changed.');
    }
}
