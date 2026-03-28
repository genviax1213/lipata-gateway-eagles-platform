<?php

namespace Tests\Feature;

use App\Models\Contribution;
use App\Models\Expense;
use App\Models\FinanceAccount;
use App\Models\FinanceAccountOpeningBalance;
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

    private function financeAccount(string $code = 'gcash'): FinanceAccount
    {
        return FinanceAccount::query()->where('code', $code)->firstOrFail();
    }

    public function test_member_without_finance_role_cannot_reverse_contribution(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);
        $account = $this->financeAccount();

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
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $member->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($member);

        $this->postJson("/api/v1/finance/contributions/{$contribution->id}/reverse", [
            'remarks' => 'Should be denied.',
            'finance_account_id' => $account->id,
        ])->assertStatus(403);
    }

    public function test_treasurer_can_reverse_contribution_with_required_remarks(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

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
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $response = $this->postJson("/api/v1/finance/contributions/{$contribution->id}/reverse", [
            'remarks' => 'Duplicate encoding for March collection.',
            'finance_account_id' => $account->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('contribution.reversal_of_contribution_id', $contribution->id)
            ->assertJsonPath('contribution.amount', '-1200.00');

        $this->assertDatabaseHas('contributions', [
            'reversal_of_contribution_id' => $contribution->id,
            'member_id' => $owner->id,
            'amount' => -1200.00,
            'note' => 'Duplicate Encoding For March Collection.',
            'finance_account_id' => $account->id,
        ]);
    }

    public function test_treasurer_cannot_reverse_contribution_without_remarks(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

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
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/contributions/{$contribution->id}/reverse", [
            'remarks' => '',
            'finance_account_id' => $account->id,
        ])->assertStatus(422);
    }

    public function test_auditor_cannot_reverse_contribution(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $account = $this->financeAccount();

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
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson("/api/v1/finance/contributions/{$contribution->id}/reverse", [
            'remarks' => 'Auditor should not reverse.',
            'finance_account_id' => $account->id,
        ])->assertStatus(403);
    }

    public function test_cannot_reverse_same_contribution_twice(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

        $owner = Member::query()->create([
            'member_number' => 'M-POL-005A',
            'first_name' => 'Already',
            'middle_name' => null,
            'last_name' => 'Reversed',
            'email' => 'already-reversed@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 1000,
            'note' => 'Monthly due',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => -1000,
            'note' => 'Prior reversal',
            'finance_account_id' => $account->id,
            'reversal_of_contribution_id' => $contribution->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/contributions/{$contribution->id}/reverse", [
            'remarks' => 'Second reversal attempt.',
            'finance_account_id' => $account->id,
        ])->assertStatus(422);
    }

    public function test_cannot_reverse_a_reversal_entry(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

        $owner = Member::query()->create([
            'member_number' => 'M-POL-005B',
            'first_name' => 'Reversal',
            'middle_name' => null,
            'last_name' => 'Entry',
            'email' => 'reversal-entry@example.com',
            'membership_status' => 'active',
        ]);

        $original = Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 700,
            'note' => 'Monthly due',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        $reversal = Contribution::query()->create([
            'member_id' => $owner->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => -700,
            'note' => 'Prior reversal',
            'finance_account_id' => $account->id,
            'reversal_of_contribution_id' => $original->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/contributions/{$reversal->id}/reverse", [
            'remarks' => 'Should not reverse a reversal.',
            'finance_account_id' => $account->id,
        ])->assertStatus(422);
    }

    public function test_treasurer_can_view_member_contributions(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

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
            'finance_account_id' => $account->id,
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

    public function test_member_without_finance_input_cannot_view_report_preview(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/finance/report-preview?category=monthly_contribution')
            ->assertStatus(403);
    }

    public function test_treasurer_can_view_live_report_preview_with_total(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

        $member = Member::query()->create([
            'member_number' => 'M-REP-001',
            'first_name' => 'Preview',
            'middle_name' => null,
            'last_name' => 'Target',
            'email' => 'preview-target@example.com',
            'membership_status' => 'active',
        ]);

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'project_contribution',
            'contribution_date' => '2026-03-05',
            'amount' => 1200,
            'note' => 'Bridge repair project',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'project_contribution',
            'contribution_date' => '2026-03-12',
            'amount' => 800,
            'note' => 'Bridge repair materials',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/finance/report-preview?category=project_contribution&year=2026&month=03&project_query=Bridge')
            ->assertOk()
            ->assertJsonPath('category_label', 'Project Contribution')
            ->assertJsonPath('total_amount', 2000)
            ->assertJsonPath('total_records', 2)
            ->assertJsonPath('data.0.member.member_number', 'M-REP-001');
    }

    public function test_auditor_can_record_audit_note_and_treasurer_can_view_it(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $account = $this->financeAccount();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-AUD-001',
            'first_name' => 'Audit',
            'middle_name' => null,
            'last_name' => 'Target',
            'email' => 'audit-target-note@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson('/api/v1/finance/audit-notes', [
            'member_id' => $member->id,
            'target_month' => '2026-03',
            'category' => 'monthly_contribution',
            'discrepancy_type' => 'missing_monthly_payment',
            'status' => 'needs_followup',
            'note_text' => 'Follow up on missing March monthly payment.',
        ])->assertCreated();

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/finance/audit-findings?month=2026-03')
            ->assertOk()
            ->assertJsonPath('data.0.member.member_number', 'M-AUD-001')
            ->assertJsonPath('data.0.latest_status', 'needs_followup')
            ->assertJsonPath('data.0.notes.0.note_text', 'Follow up on missing March monthly payment.');
    }

    public function test_treasurer_cannot_record_audit_note(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-AUD-002',
            'first_name' => 'Treasurer',
            'middle_name' => null,
            'last_name' => 'Blocked',
            'email' => 'treasurer-blocked-note@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson('/api/v1/finance/audit-notes', [
            'member_id' => $member->id,
            'target_month' => '2026-03',
            'category' => 'monthly_contribution',
            'discrepancy_type' => 'missing_monthly_payment',
            'status' => 'needs_followup',
            'note_text' => 'Treasurer should not be able to create this note.',
        ])->assertStatus(403);
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
        $account = $this->financeAccount();

        $memberCompliant = Member::query()->create([
            'member_number' => 'M-COMP-001',
            'first_name' => 'Compliant',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'compliant-member@example.com',
            'membership_status' => 'active',
        ]);

        $memberBelowRequired = Member::query()->create([
            'member_number' => 'M-COMP-003',
            'first_name' => 'Below',
            'middle_name' => null,
            'last_name' => 'Required',
            'email' => 'below-required-member@example.com',
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
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);
        Contribution::query()->create([
            'member_id' => $memberCompliant->id,
            'category' => 'project_contribution',
            'contribution_date' => '2026-01-15',
            'amount' => 1000,
            'note' => 'Project support',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);
        Contribution::query()->create([
            'member_id' => $memberBelowRequired->id,
            'category' => 'monthly_contribution',
            'contribution_date' => '2026-03-10',
            'amount' => 250,
            'note' => 'Partial monthly payment',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $response = $this->getJson('/api/v1/finance/compliance?month=2026-03&years[]=2026&non_compliant_only=false');

        $response->assertStatus(200)
            ->assertJsonPath('filters.month', '2026-03')
            ->assertJsonPath('filters.years.0', 2026)
            ->assertJsonPath('filters.required_monthly_amount', 500);

        $rows = collect($response->json('data'));
        $compliantRow = $rows->firstWhere('member.id', $memberCompliant->id);
        $belowRequiredRow = $rows->firstWhere('member.id', $memberBelowRequired->id);
        $nonCompliantRow = $rows->firstWhere('member.id', $memberNonCompliant->id);

        $this->assertNotNull($compliantRow);
        $this->assertNotNull($belowRequiredRow);
        $this->assertNotNull($nonCompliantRow);
        $this->assertTrue((bool) $compliantRow['has_monthly_for_month']);
        $this->assertTrue((bool) $compliantRow['meets_required_monthly_amount']);
        $this->assertSame([], $compliantRow['missing_project_years']);
        $this->assertFalse((bool) $compliantRow['is_non_compliant']);
        $this->assertTrue((bool) $belowRequiredRow['has_monthly_for_month']);
        $this->assertFalse((bool) $belowRequiredRow['meets_required_monthly_amount']);
        $this->assertTrue((bool) $belowRequiredRow['is_non_compliant']);
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
        $account = $this->financeAccount();

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
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $checker->id,
            'encoded_at' => now(),
        ]);

        Contribution::query()->create([
            'member_id' => $otherMember->id,
            'category' => 'monthly_contribution',
            'contribution_date' => '2026-03-01',
            'amount' => 100,
            'finance_account_id' => $account->id,
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

    public function test_member_without_finance_role_cannot_create_expense(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);
        $account = $this->financeAccount('cash_on_hand');

        Sanctum::actingAs($member);

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'administrative_expense',
            'expense_date' => '2026-03-07',
            'amount' => 250,
            'note' => 'Paper and ink',
            'payee_name' => 'Office Depot',
            'finance_account_id' => $account->id,
        ])->assertStatus(403);
    }

    public function test_member_without_finance_role_cannot_create_opening_balance(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);
        $account = $this->financeAccount('bank');

        Sanctum::actingAs($member);

        $this->postJson('/api/v1/finance/opening-balances', [
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 10000,
            'note' => 'Starting bank balance',
        ])->assertStatus(403);
    }

    public function test_treasurer_can_create_and_reverse_opening_balance(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('cash_on_hand');

        Sanctum::actingAs($treasurer);

        $createResponse = $this->postJson('/api/v1/finance/opening-balances', [
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 2500,
            'note' => 'Cash box opening count',
        ])->assertCreated();

        $openingBalanceId = (int) $createResponse->json('opening_balance.id');

        $this->postJson("/api/v1/finance/opening-balances/{$openingBalanceId}/reverse", [
            'remarks' => 'Incorrect opening count',
            'finance_account_id' => $account->id,
        ])->assertCreated()
            ->assertJsonPath('opening_balance.reversal_of_opening_balance_id', $openingBalanceId)
            ->assertJsonPath('opening_balance.amount', '-2500.00');

        $this->assertDatabaseHas('finance_account_opening_balances', [
            'reversal_of_opening_balance_id' => $openingBalanceId,
            'finance_account_id' => $account->id,
            'amount' => '-2500.00',
        ]);
    }

    public function test_auditor_cannot_create_or_reverse_opening_balance(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $account = $this->financeAccount('bank');

        $openingBalance = FinanceAccountOpeningBalance::query()->create([
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 3000,
            'note' => 'Bank baseline',
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson('/api/v1/finance/opening-balances', [
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 1000,
            'note' => 'Auditor should not create this',
        ])->assertStatus(403);

        $this->postJson("/api/v1/finance/opening-balances/{$openingBalance->id}/reverse", [
            'remarks' => 'Auditor should not reverse this',
            'finance_account_id' => $account->id,
        ])->assertStatus(403);
    }

    public function test_finance_viewers_can_list_opening_balances(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $account = $this->financeAccount('gcash');

        FinanceAccountOpeningBalance::query()->create([
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 1800,
            'note' => 'GCash baseline',
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $this->getJson('/api/v1/finance/opening-balances')
            ->assertOk()
            ->assertJsonPath('data.0.finance_account.code', 'gcash');
    }

    public function test_future_dated_opening_balance_does_not_affect_current_balance(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('bank');

        FinanceAccountOpeningBalance::query()->create([
            'finance_account_id' => $account->id,
            'effective_date' => now()->addMonth()->startOfMonth()->toDateString(),
            'amount' => 9900,
            'note' => 'Future baseline',
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/finance/account-balances')
            ->assertOk()
            ->assertJsonPath('data.0.account.code', 'bank')
            ->assertJsonPath('data.0.opening_balance_total', 0)
            ->assertJsonPath('data.0.net_balance', 0);
    }

    public function test_treasurer_can_create_and_reverse_expense(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('bank');

        Sanctum::actingAs($treasurer);

        $createResponse = $this->postJson('/api/v1/finance/expenses', [
            'category' => 'project_expense',
            'expense_date' => '2026-03-07',
            'amount' => 1500,
            'note' => 'Project tarpaulin printing',
            'payee_name' => 'Print House',
            'finance_account_id' => $account->id,
            'support_reference' => 'OR-9911',
            'approval_reference' => 'BOARD-2026-03',
        ])->assertCreated();

        $expenseId = (int) $createResponse->json('id');

        $this->postJson("/api/v1/finance/expenses/{$expenseId}/reverse", [
            'remarks' => 'Void duplicate payout',
            'finance_account_id' => $account->id,
        ])->assertCreated()
            ->assertJsonPath('expense.reversal_of_expense_id', $expenseId)
            ->assertJsonPath('expense.amount', '-1500.00');

        $this->assertDatabaseHas('expenses', [
            'reversal_of_expense_id' => $expenseId,
            'finance_account_id' => $account->id,
            'amount' => '-1500.00',
        ]);
    }

    public function test_auditor_cannot_reverse_expense(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $account = $this->financeAccount('gcash');

        $expense = Expense::query()->create([
            'category' => 'administrative_expense',
            'expense_date' => '2026-03-07',
            'amount' => 500,
            'note' => 'Snacks for meeting',
            'payee_name' => 'Corner Store',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson("/api/v1/finance/expenses/{$expense->id}/reverse", [
            'remarks' => 'Auditor should not reverse.',
            'finance_account_id' => $account->id,
        ])->assertStatus(403);
    }

    public function test_treasurer_can_view_account_balances(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('bank');

        $member = Member::query()->create([
            'member_number' => 'M-ACC-001',
            'first_name' => 'Balance',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'balance-member@example.com',
            'membership_status' => 'active',
        ]);

        FinanceAccountOpeningBalance::query()->create([
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 1000,
            'note' => 'Opening bank baseline',
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => '2026-03-02',
            'amount' => 900,
            'note' => 'Monthly due',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Expense::query()->create([
            'category' => 'administrative_expense',
            'expense_date' => '2026-03-03',
            'amount' => 250,
            'note' => 'Supplies',
            'payee_name' => 'Supply Hub',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/finance/account-balances')
            ->assertOk()
            ->assertJsonPath('data.0.account.code', 'bank')
            ->assertJsonPath('data.0.opening_balance_total', 1000)
            ->assertJsonPath('data.0.total_inflows', 900)
            ->assertJsonPath('data.0.total_outflows', 250)
            ->assertJsonPath('data.0.net_balance', 1650);
    }

    public function test_auditor_can_record_expense_audit_note_and_treasurer_can_view_it(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('cash_on_hand');

        $expense = Expense::query()->create([
            'category' => 'administrative_expense',
            'expense_date' => '2026-03-05',
            'amount' => 330,
            'note' => 'Markers and folders',
            'payee_name' => 'School Supplies',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson('/api/v1/finance/expense-audit-notes', [
            'expense_id' => $expense->id,
            'target_month' => '2026-03',
            'category' => 'administrative_expense',
            'discrepancy_type' => 'missing_support_reference',
            'status' => 'needs_followup',
            'note_text' => 'Missing official receipt attachment.',
        ])->assertCreated();

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/finance/expense-audit-findings?month=2026-03&discrepancy_type=missing_support_reference')
            ->assertOk()
            ->assertJsonPath('data.0.expense_id', $expense->id)
            ->assertJsonPath('data.0.latest_status', 'needs_followup')
            ->assertJsonPath('data.0.notes.0.note_text', 'Missing official receipt attachment.');
    }

    public function test_treasurer_cannot_record_expense_audit_note(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

        $expense = Expense::query()->create([
            'category' => 'misc_expense',
            'expense_date' => '2026-03-06',
            'amount' => 99,
            'note' => 'Miscellaneous payout',
            'payee_name' => 'Petty Cash Vendor',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson('/api/v1/finance/expense-audit-notes', [
            'expense_id' => $expense->id,
            'target_month' => '2026-03',
            'category' => 'misc_expense',
            'discrepancy_type' => 'missing_support_reference',
            'status' => 'needs_followup',
            'note_text' => 'Treasurer cannot create expense audit notes.',
        ])->assertStatus(403);
    }

    public function test_treasurer_can_view_expense_report_preview(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('gcash');

        Expense::query()->create([
            'category' => 'aid_expense',
            'expense_date' => '2026-03-04',
            'amount' => 700,
            'note' => 'Hospital aid support',
            'payee_name' => 'Aid Beneficiary',
            'finance_account_id' => $account->id,
            'support_reference' => 'AID-001',
            'approval_reference' => 'AID-APP-001',
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/finance/expense-report-preview?category=aid_expense&finance_account_id=' . $account->id)
            ->assertOk()
            ->assertJsonPath('filters.category', 'aid_expense')
            ->assertJsonPath('filters.finance_account_id', $account->id)
            ->assertJsonPath('total_amount', 700)
            ->assertJsonPath('data.0.finance_account.code', 'gcash');
    }
}
