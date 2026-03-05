<?php

namespace Tests\Feature;

use App\Models\Contribution;
use App\Models\ContributionEditRequest;
use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinancePolicyAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_member_without_finance_role_cannot_request_contribution_edit(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        $owner = Member::query()->create([
            'member_number' => 'M-POL-001',
            'first_name' => 'Policy',
            'middle_name' => null,
            'last_name' => 'Owner',
            'email' => 'policy-owner@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 500,
            'note' => 'Monthly due',
            'encoded_by_user_id' => $member->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($member);

        $this->postJson("/api/v1/finance/contributions/{$contribution->id}/edit-requests", [
            'requested_amount' => 450,
            'reason' => 'Adjustment request should be denied.',
        ])->assertStatus(403);
    }

    public function test_treasurer_cannot_request_contribution_edit(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        $owner = Member::query()->create([
            'member_number' => 'M-POL-002',
            'first_name' => 'Finance',
            'middle_name' => null,
            'last_name' => 'Owner',
            'email' => 'finance-owner@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 1200,
            'note' => 'Monthly due',
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/contributions/{$contribution->id}/edit-requests", [
            'requested_amount' => 1000,
            'reason' => 'Policy coverage request.',
        ])->assertStatus(403);
    }

    public function test_treasurer_cannot_approve_edit_request(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $requester = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        $owner = Member::query()->create([
            'member_number' => 'M-POL-003',
            'first_name' => 'Approve',
            'middle_name' => null,
            'last_name' => 'Guard',
            'email' => 'approve-guard@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 800,
            'note' => 'Monthly due',
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        $editRequest = ContributionEditRequest::query()->create([
            'contribution_id' => $contribution->id,
            'requested_amount' => 700,
            'reason' => 'Needs correction',
            'requested_by_user_id' => $requester->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/edit-requests/{$editRequest->id}/approve")
            ->assertStatus(403);
    }

    public function test_auditor_cannot_approve_and_reject_edit_requests(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $requester = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        $owner = Member::query()->create([
            'member_number' => 'M-POL-004',
            'first_name' => 'Audit',
            'middle_name' => null,
            'last_name' => 'Target',
            'email' => 'audit-target@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 2000,
            'note' => 'Monthly due',
            'encoded_by_user_id' => $requester->id,
            'encoded_at' => now(),
        ]);

        $approveRequest = ContributionEditRequest::query()->create([
            'contribution_id' => $contribution->id,
            'requested_amount' => 1800,
            'reason' => 'Approved adjustment',
            'requested_by_user_id' => $requester->id,
            'status' => 'pending',
        ]);

        $rejectRequest = ContributionEditRequest::query()->create([
            'contribution_id' => $contribution->id,
            'requested_amount' => 1500,
            'reason' => 'Rejected adjustment',
            'requested_by_user_id' => $requester->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson("/api/v1/finance/edit-requests/{$approveRequest->id}/approve")
            ->assertStatus(403);

        $this->postJson("/api/v1/finance/edit-requests/{$rejectRequest->id}/reject", [
            'review_notes' => 'Insufficient basis for large adjustment.',
        ])->assertStatus(403);
    }

    public function test_treasurer_cannot_list_edit_requests(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/finance/edit-requests')
            ->assertStatus(403);
    }

    public function test_auditor_cannot_list_edit_requests(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);

        Sanctum::actingAs($auditor);

        $this->getJson('/api/v1/finance/edit-requests')
            ->assertStatus(403);
    }

    public function test_treasurer_can_view_member_contributions(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-POL-005',
            'first_name' => 'Read',
            'middle_name' => null,
            'last_name' => 'Only',
            'email' => 'read-only-member@example.com',
            'membership_status' => 'active',
        ]);

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'project_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 900,
            'note' => 'Project support',
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson("/api/v1/finance/members/{$member->id}/contributions")
            ->assertStatus(200)
            ->assertJsonPath('member.id', $member->id);
    }

    public function test_member_without_finance_role_cannot_search_finance_members(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/finance/members')
            ->assertStatus(403);
    }

    public function test_member_without_finance_role_cannot_view_member_contributions(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        $target = Member::query()->create([
            'member_number' => 'M-POL-006',
            'first_name' => 'Protected',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'protected-member@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($member);

        $this->getJson("/api/v1/finance/members/{$target->id}/contributions")
            ->assertStatus(403);
    }

    public function test_auditor_can_search_finance_members(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);

        Sanctum::actingAs($auditor);

        $this->getJson('/api/v1/finance/members')
            ->assertStatus(200);
    }

    public function test_member_without_finance_role_cannot_view_compliance_report(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/finance/compliance?month=2026-03&years[]=2026')
            ->assertStatus(403);
    }

    public function test_auditor_can_view_compliance_report_and_non_compliance_flags(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);

        $memberCompliant = Member::query()->create([
            'member_number' => 'M-COMP-001',
            'first_name' => 'Compliant',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'compliant-member@example.com',
            'membership_status' => 'active',
        ]);

        $memberNonCompliant = Member::query()->create([
            'member_number' => 'M-COMP-002',
            'first_name' => 'Non',
            'middle_name' => null,
            'last_name' => 'Compliant',
            'email' => 'noncompliant-member@example.com',
            'membership_status' => 'active',
        ]);

        Contribution::query()->create([
            'member_id' => $memberCompliant->id,
            'category' => 'monthly_contribution',
            'contribution_date' => '2026-03-01',
            'amount' => 500,
            'note' => 'Monthly due',
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);
        Contribution::query()->create([
            'member_id' => $memberCompliant->id,
            'category' => 'project_contribution',
            'contribution_date' => '2026-01-15',
            'amount' => 1000,
            'note' => 'Project support',
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $response = $this->getJson('/api/v1/finance/compliance?month=2026-03&years[]=2026&non_compliant_only=false');

        $response->assertStatus(200)
            ->assertJsonPath('filters.month', '2026-03')
            ->assertJsonPath('filters.years.0', 2026);

        $rows = collect($response->json('data'));
        $compliantRow = $rows->firstWhere('member.id', $memberCompliant->id);
        $nonCompliantRow = $rows->firstWhere('member.id', $memberNonCompliant->id);

        $this->assertNotNull($compliantRow);
        $this->assertNotNull($nonCompliantRow);
        $this->assertTrue((bool) $compliantRow['has_monthly_for_month']);
        $this->assertSame([], $compliantRow['missing_project_years']);
        $this->assertFalse((bool) $compliantRow['is_non_compliant']);
        $this->assertFalse((bool) $nonCompliantRow['has_monthly_for_month']);
        $this->assertSame([2026], $nonCompliantRow['missing_project_years']);
        $this->assertTrue((bool) $nonCompliantRow['is_non_compliant']);
    }

    public function test_non_treasurer_compliance_checker_is_scoped_to_own_member_only(): void
    {
        $auditorRole = Role::query()->where('name', 'auditor')->firstOrFail();
        $checker = User::factory()->create([
            'role_id' => $auditorRole->id,
            'email' => 'checker.scope@example.com',
        ]);

        $ownMember = Member::query()->create([
            'member_number' => 'M-SCOPE-001',
            'first_name' => 'Own',
            'middle_name' => null,
            'last_name' => 'Checker',
            'email' => 'checker.scope@example.com',
            'membership_status' => 'active',
        ]);

        $otherMember = Member::query()->create([
            'member_number' => 'M-SCOPE-002',
            'first_name' => 'Other',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'other.scope@example.com',
            'membership_status' => 'active',
        ]);

        Contribution::query()->create([
            'member_id' => $ownMember->id,
            'category' => 'monthly_contribution',
            'contribution_date' => '2026-03-01',
            'amount' => 100,
            'encoded_by_user_id' => $checker->id,
            'encoded_at' => now(),
        ]);

        Contribution::query()->create([
            'member_id' => $otherMember->id,
            'category' => 'monthly_contribution',
            'contribution_date' => '2026-03-01',
            'amount' => 100,
            'encoded_by_user_id' => $checker->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($checker);

        $response = $this->getJson('/api/v1/finance/compliance?month=2026-03&years[]=2026&non_compliant_only=false')
            ->assertOk();

        $rows = collect($response->json('data'));
        $this->assertCount(1, $rows);
        $this->assertSame($ownMember->id, (int) $rows->first()['member']['id']);
    }

    public function test_treasurer_compliance_checker_can_view_all_members(): void
    {
        $treasurerRole = Role::query()->where('name', 'treasurer')->firstOrFail();
        $treasurerChecker = User::factory()->create([
            'role_id' => $treasurerRole->id,
            'email' => 'treasurer.scope@example.com',
        ]);

        Member::query()->create([
            'member_number' => 'M-SCOPE-101',
            'first_name' => 'Member',
            'middle_name' => null,
            'last_name' => 'One',
            'email' => 'member.one.scope@example.com',
            'membership_status' => 'active',
        ]);

        Member::query()->create([
            'member_number' => 'M-SCOPE-102',
            'first_name' => 'Member',
            'middle_name' => null,
            'last_name' => 'Two',
            'email' => 'member.two.scope@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($treasurerChecker);

        $response = $this->getJson('/api/v1/finance/compliance?month=2026-03&non_compliant_only=false')
            ->assertOk();

        $rows = collect($response->json('data'));
        $this->assertCount(2, $rows);
    }
}
