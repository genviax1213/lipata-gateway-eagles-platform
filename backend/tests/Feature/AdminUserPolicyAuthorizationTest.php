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

    public function test_superadmin_can_create_mobile_enabled_user_with_flags(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);

        Sanctum::actingAs($superadmin);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Mobile Treasurer',
            'email' => 'mobile.treasurer@lgec.org',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
            'finance_role' => 'treasurer',
            'must_change_password' => true,
            'mobile_access_enabled' => true,
            'mobile_chat_enabled' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('email', 'mobile.treasurer@lgec.org')
            ->assertJsonPath('finance_role', 'treasurer')
            ->assertJsonPath('must_change_password', true)
            ->assertJsonPath('mobile_access_enabled', true)
            ->assertJsonPath('mobile_chat_enabled', true);
    }

    public function test_superadmin_can_update_mobile_flags_without_changing_email(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'finance.user@lgec.org',
        ]);

        Sanctum::actingAs($superadmin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'role_id' => $memberRole->id,
            'finance_role' => 'auditor',
            'must_change_password' => true,
            'mobile_access_enabled' => true,
            'mobile_chat_enabled' => false,
        ]);

        $response->assertOk()
            ->assertJsonPath('finance_role', 'auditor')
            ->assertJsonPath('must_change_password', true)
            ->assertJsonPath('mobile_access_enabled', true)
            ->assertJsonPath('mobile_chat_enabled', false);
    }

    public function test_superadmin_can_update_member_login_alias_email(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'old.login@example.com',
        ]);

        Sanctum::actingAs($superadmin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => 'rolando.lanugon@lgec.org',
            'role_id' => $memberRole->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('email', 'rolando.lanugon@lgec.org');
    }

    public function test_superadmin_cannot_change_bootstrap_login_alias_email(): void
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
        ]);

        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/admin/users/{$bootstrap->id}", [
            'name' => $bootstrap->name,
            'email' => 'renamed.bootstrap@lgec.org',
            'role_id' => $superadminRole->id,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Bootstrap login email is protected and cannot be changed from admin user management.');
    }

    public function test_superadmin_can_generate_credentials_and_unlock_alias_login(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'locked.member@lgec.org',
            'login_email_locked' => true,
        ]);

        Sanctum::actingAs($superadmin);

        $response = $this->postJson("/api/v1/admin/users/{$target->id}/generate-credentials");

        $response->assertOk()
            ->assertJsonPath('message', 'Credentials generated successfully.');

        $this->assertFalse((bool) $target->fresh()->login_email_locked);
        $this->assertTrue((bool) $target->fresh()->must_change_password);
    }

    public function test_superadmin_can_run_alias_conversion_for_member_linked_user(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id, 'email' => 'admin.primary@lgec.org']);
        $target = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'old.member.real@example.com',
            'recovery_email' => null,
        ]);

        \App\Models\Member::query()->create([
            'member_number' => 'M-ALIAS-001',
            'first_name' => 'Juan',
            'middle_name' => null,
            'last_name' => 'Dela Cruz',
            'email' => 'juan.real@example.com',
            'membership_status' => 'active',
            'user_id' => $target->id,
        ]);

        Sanctum::actingAs($superadmin);

        $response = $this->postJson('/api/v1/admin/identity-conversion/run', [
            'confirm' => true,
        ]);

        $response->assertOk()
            ->assertJsonPath('summary.converted', 1);

        $target->refresh();
        $this->assertSame('juan.delacruz@lgec.org', $target->email);
        $this->assertSame('juan.real@example.com', $target->recovery_email);
        $this->assertTrue((bool) $target->login_email_locked);
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
        $this->assertTrue((bool) $target->fresh()->must_change_password);
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

    public function test_superadmin_can_change_registered_user_email_via_user_update(): void
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
        ])->assertOk()
            ->assertJsonPath('email', 'changed-bootstrap@example.com');
    }
}
