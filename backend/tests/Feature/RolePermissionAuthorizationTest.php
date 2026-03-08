<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\Role;
use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\Contribution;
use App\Models\FinanceAccount;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RolePermissionAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    private function financeAccount(string $code = 'gcash'): FinanceAccount
    {
        return FinanceAccount::query()->where('code', $code)->firstOrFail();
    }

    public function test_member_cannot_create_post(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->postJson('/api/v1/cms/posts', [
            'title' => 'Unauthorized Post',
            'section' => 'news',
            'content' => 'Body content',
            'status' => 'published',
        ]);

        $response->assertStatus(403);
    }

    public function test_member_cannot_view_cms_posts_list(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/cms/posts');

        $response->assertStatus(403);
    }

    public function test_officer_can_update_post_but_cannot_delete_post(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $author = User::factory()->create(['role_id' => $adminRole->id]);

        $post = Post::query()->create([
            'title' => 'Initial title',
            'slug' => 'initial-title',
            'section' => 'news',
            'excerpt' => 'Initial excerpt',
            'content' => 'Initial content',
            'status' => 'draft',
            'author_id' => $author->id,
        ]);

        Sanctum::actingAs($officer);

        $updateResponse = $this->putJson("/api/v1/cms/posts/{$post->id}", [
            'title' => 'Updated title',
            'section' => 'news',
            'excerpt' => 'Updated excerpt',
            'content' => 'Updated content',
            'status' => 'published',
        ]);

        $updateResponse->assertOk();

        $deleteResponse = $this->deleteJson("/api/v1/cms/posts/{$post->id}");
        $deleteResponse->assertStatus(403);
    }

    public function test_member_cannot_view_members_endpoint(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/members');

        $response->assertStatus(403);
    }

    public function test_officer_can_view_members_endpoint(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->getJson('/api/v1/members');

        $response->assertStatus(200);
    }

    public function test_member_cannot_access_admin_users_list(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/admin/users');

        $response->assertStatus(403);
    }

    public function test_officer_cannot_access_admin_users_list(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->getJson('/api/v1/admin/users');

        $response->assertStatus(403);
    }

    public function test_admin_can_access_admin_users_list(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/users');

        $response->assertStatus(200);
    }

    public function test_admin_can_view_applicant_review_queue(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        MemberApplication::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Admin View',
            'email' => 'queued-admin-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-admin-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/member-applications')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-admin-view@applicant.test');
    }

    public function test_superadmin_can_view_applicant_review_queue(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);

        MemberApplication::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Superadmin View',
            'email' => 'queued-superadmin-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-superadmin-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($superadmin);

        $this->getJson('/api/v1/member-applications')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-superadmin-view@applicant.test');
    }

    public function test_officer_can_view_applicant_queue_but_not_dossier(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = MemberApplication::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Officer View',
            'email' => 'queued-officer-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-officer-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->getJson('/api/v1/member-applications')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-officer-view@applicant.test');

        $this->getJson("/api/v1/member-applications/{$application->id}")
            ->assertStatus(403);
    }

    public function test_treasurer_can_view_applicant_queue_but_not_dossier(): void
    {
        $treasurerRole = Role::query()->where('name', 'treasurer')->firstOrFail();
        $treasurer = User::factory()->create(['role_id' => $treasurerRole->id]);

        $application = MemberApplication::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Treasurer View',
            'email' => 'queued-treasurer-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-treasurer-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/member-applications')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-treasurer-view@applicant.test');

        $this->getJson("/api/v1/member-applications/{$application->id}")
            ->assertStatus(403);
    }

    public function test_admin_can_view_applicant_dossier(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        $application = MemberApplication::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Admin Dossier',
            'email' => 'queued-admin-dossier@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-admin-dossier-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/v1/member-applications/{$application->id}")
            ->assertOk()
            ->assertJsonPath('email', 'queued-admin-dossier@applicant.test');
    }

    public function test_superadmin_can_view_applicant_dossier_but_cannot_review_decisions(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);

        $application = MemberApplication::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Superadmin Dossier',
            'email' => 'queued-superadmin-dossier@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-superadmin-dossier-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($superadmin);

        $this->getJson("/api/v1/member-applications/{$application->id}")
            ->assertOk()
            ->assertJsonPath('email', 'queued-superadmin-dossier@applicant.test');

        $this->postJson("/api/v1/member-applications/{$application->id}/approve")
            ->assertStatus(403);
    }

    public function test_officer_can_view_cms_posts_list(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->getJson('/api/v1/cms/posts');

        $response->assertStatus(200);
    }

    public function test_officer_cannot_delegate_member_role(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $candidate = Member::query()->create([
            'member_number' => 'M-OFF-001',
            'first_name' => 'Candidate',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'candidate-member@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($officer);

        $response = $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $memberRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_officer_cannot_update_user_role_via_admin_role_endpoint(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $target = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/role", [
            'role_id' => $officerRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_admin_cannot_assign_applicant_role_to_existing_member(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        $candidate = Member::query()->create([
            'member_number' => 'M-APP-001',
            'first_name' => 'Existing',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'existing-member@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $applicantRole->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Applicant role is lifecycle-managed and can only be created through applicant registration and activation workflows.');
    }

    public function test_admin_cannot_update_user_role_to_applicant(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/role", [
            'role_id' => $applicantRole->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Applicant role is lifecycle-managed and can only be created through applicant registration and activation workflows.');
    }

    public function test_member_cannot_create_admin_user_account(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Blocked Member Create',
            'email' => 'blocked-member-create@example.com',
            'password' => 'Password123',
            'role_id' => $officerRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_officer_cannot_create_user_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Created By Officer',
            'email' => 'created-by-officer@example.com',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_officer_cannot_delete_member_record(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $member = Member::query()->create([
            'member_number' => 'M-DEL-001',
            'first_name' => 'Delete',
            'middle_name' => 'Guard',
            'last_name' => 'Target',
            'email' => 'delete-guard@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($officer);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertStatus(403);
    }

    public function test_admin_deleting_member_removes_linked_portal_user_and_sessions(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'orphan-cleanup@example.com',
            'active_session_id' => 'session-cleanup-1',
        ]);

        DB::table('sessions')->insert([
            'id' => 'session-cleanup-1',
            'user_id' => $target->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit',
            'payload' => base64_encode('payload'),
            'last_activity' => now()->timestamp,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-DEL-USER-001',
            'first_name' => 'Delete',
            'middle_name' => 'Portal',
            'last_name' => 'User',
            'email' => $target->email,
            'membership_status' => 'active',
            'user_id' => $target->id,
        ]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Member deleted');

        $this->assertDatabaseMissing('members', ['id' => $member->id]);
        $this->assertDatabaseMissing('users', ['id' => $target->id]);
        $this->assertDatabaseMissing('sessions', ['id' => 'session-cleanup-1']);
    }

    public function test_admin_cannot_delete_protected_admin_member_record_through_member_directory(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $adminRole->id]);
        $protected = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'protected-admin-member@example.com',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-PROT-001',
            'first_name' => 'Protected',
            'middle_name' => 'Admin',
            'last_name' => 'Member',
            'email' => $protected->email,
            'membership_status' => 'active',
            'user_id' => $protected->id,
        ]);

        Sanctum::actingAs($actor);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Protected administrative accounts cannot be removed through the member directory.');

        $this->assertDatabaseHas('members', ['id' => $member->id]);
        $this->assertDatabaseHas('users', ['id' => $protected->id]);
    }

    public function test_admin_cannot_delete_own_member_record_through_member_directory(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $actor = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'self-delete-guard@example.com',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-SELF-001',
            'first_name' => 'Self',
            'middle_name' => 'Delete',
            'last_name' => 'Guard',
            'email' => $actor->email,
            'membership_status' => 'active',
            'user_id' => $actor->id,
        ]);

        Sanctum::actingAs($actor);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Use user management for your own account lifecycle. Self-deletion is not allowed through the member directory.');

        $this->assertDatabaseHas('members', ['id' => $member->id]);
        $this->assertDatabaseHas('users', ['id' => $actor->id]);
    }

    public function test_officer_cannot_update_fellow_officer_account(): void
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

    public function test_superadmin_can_promote_user_to_admin_within_limit(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();

        $createdAdmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create();

        Sanctum::actingAs($createdAdmin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('role.name', 'admin');
    }

    public function test_superadmin_cannot_exceed_max_admin_count_when_assigning_member_role(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $adminActor = User::factory()->create([
            'role_id' => $superadminRole->id,
        ]);
        User::factory()->create(['role_id' => $adminRole->id]);
        User::factory()->create(['role_id' => $adminRole->id]);

        Sanctum::actingAs($adminActor);

        $candidateForAdmin = Member::query()->create([
            'member_number' => 'M-ADM-001',
            'first_name' => 'Should',
            'middle_name' => null,
            'last_name' => 'Fail Admin',
            'email' => 'newadmin@example.com',
            'membership_status' => 'active',
        ]);

        $response = $this->putJson("/api/v1/admin/members/{$candidateForAdmin->id}/role", [
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(422);

        $candidateForMember = Member::query()->create([
            'member_number' => 'M-MEM-001',
            'first_name' => 'Allowed',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'allowed-member@example.com',
            'membership_status' => 'active',
        ]);

        $memberCreate = $this->putJson("/api/v1/admin/members/{$candidateForMember->id}/role", [
            'role_id' => $memberRole->id,
        ]);

        $memberCreate->assertStatus(200);
    }

    public function test_admin_can_view_finance_members_without_finance_secondary_role(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/finance/members');

        $response->assertStatus(200);
    }

    public function test_admin_cannot_input_contribution_without_finance_secondary_role(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin-view-only@lipataeagles.ph',
            'role_id' => $adminRole->id,
            'finance_role' => null,
        ]);
        $account = $this->financeAccount();
        $target = Member::query()->create([
            'member_number' => 'M-ADM-VIEW-001',
            'first_name' => 'View',
            'middle_name' => null,
            'last_name' => 'Only',
            'email' => 'view-only-target@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/finance/contributions', [
            'member_id' => $target->id,
            'member_email' => $target->email,
            'amount' => 500,
            'note' => 'Admin without finance role should be blocked.',
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'finance_account_id' => $account->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_member_can_view_own_contributions_without_finance_role(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create(['role_id' => $memberRole->id]);

        $member = Member::query()->create([
            'member_number' => 'M-OWN-001',
            'first_name' => 'Own',
            'middle_name' => 'Member',
            'last_name' => 'User',
            'email' => $memberUser->email,
            'user_id' => $memberUser->id,
            'membership_status' => 'active',
        ]);
        $account = $this->financeAccount();

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 500,
            'note' => 'Monthly due',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $memberUser->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($memberUser);

        $response = $this->getJson('/api/v1/finance/my-contributions');

        $response->assertStatus(200)->assertJsonStructure([
            'member' => ['id', 'member_number'],
            'total_amount',
            'category_totals',
            'monthly_summary',
            'yearly_summary',
            'data',
        ]);
    }

    public function test_admin_can_view_own_contributions_without_finance_permissions(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $adminUser = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-ADM-OWN-001',
            'first_name' => 'Original',
            'middle_name' => null,
            'last_name' => 'Admin',
            'email' => $adminUser->email,
            'user_id' => $adminUser->id,
            'membership_status' => 'active',
        ]);
        $account = $this->financeAccount();

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'project_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 1000,
            'note' => 'Project support',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $adminUser->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($adminUser);

        $response = $this->getJson('/api/v1/finance/my-contributions');

        $response->assertStatus(200)->assertJsonPath('member.id', $member->id);
    }

    public function test_admin_with_treasurer_secondary_role_can_access_finance_endpoints(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('bank');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/finance/members');

        $response->assertStatus(200);

        $target = Member::query()->create([
            'member_number' => 'M-FIN-001',
            'first_name' => 'Finance',
            'middle_name' => null,
            'last_name' => 'Target',
            'email' => 'finance-target@example.com',
            'membership_status' => 'active',
        ]);

        $this->postJson('/api/v1/finance/contributions', [
            'member_id' => $target->id,
            'member_email' => $target->email,
            'amount' => 500,
            'note' => 'Secondary treasurer contribution',
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'finance_account_id' => $account->id,
        ])->assertCreated();

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'administrative_expense',
            'expense_date' => now()->toDateString(),
            'amount' => 200,
            'note' => 'Printer ink',
            'payee_name' => 'Office Hub',
            'finance_account_id' => $account->id,
        ])->assertCreated();

        $this->getJson('/api/v1/finance/account-balances')->assertOk();
    }

    public function test_member_primary_role_cannot_receive_secondary_finance_role(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
        ]);

        $candidate = Member::query()->create([
            'member_number' => 'M-SEC-001',
            'first_name' => 'Secondary',
            'middle_name' => null,
            'last_name' => 'Role',
            'email' => 'secondary-role@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $memberRole->id,
            'finance_role' => 'auditor',
        ]);

        $response->assertStatus(200);
        $this->assertSame('', (string) $response->json('user.finance_role'));
    }

    public function test_admin_can_update_member_extended_profile_fields(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-EXT-001',
            'first_name' => 'Mario',
            'middle_name' => 'Santos',
            'last_name' => 'Reyes',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/members/{$member->id}", [
            'member_number' => 'm-ext-001',
            'first_name' => 'mario',
            'middle_name' => 'santos',
            'last_name' => 'reyes',
            'membership_status' => 'active',
            'spouse_name' => 'ana maria reyes',
            'contact_number' => '0917 123 4567',
            'address' => 'Purok 1, Surigao City',
            'date_of_birth' => '1988-06-10',
            'batch' => 'marilag',
            'induction_date' => '2023-07-24',
        ]);

        $response->assertOk()
            ->assertJsonPath('member_number', 'M-EXT-001')
            ->assertJsonPath('spouse_name', 'Ana Maria Reyes')
            ->assertJsonPath('contact_number', '09171234567')
            ->assertJsonPath('batch', 'Marilag');

        $member->refresh();
        $this->assertSame('Ana Maria Reyes', $member->spouse_name);
        $this->assertSame('09171234567', $member->contact_number);
        $this->assertSame('Marilag', $member->batch);
        $this->assertSame('1988-06-10', $member->date_of_birth);
        $this->assertSame('2023-07-24', $member->induction_date);
    }
}
