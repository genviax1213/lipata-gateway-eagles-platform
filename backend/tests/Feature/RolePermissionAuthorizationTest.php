<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\Role;
use App\Models\Member;
use App\Models\Contribution;
use App\Models\FinanceAccount;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
