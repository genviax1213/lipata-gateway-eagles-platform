<?php

namespace Database\Seeders;

use App\Models\Contribution;
use App\Models\Expense;
use App\Models\ExpenseAuditNote;
use App\Models\FinanceAccount;
use App\Models\FinanceAccountOpeningBalance;
use App\Models\FinanceAuditNote;
use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use App\Support\RoleHierarchy;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class FinanceWorkflowDemoSeeder extends Seeder
{
    public function run(): void
    {
        $allowOutsideLocal = filter_var((string) env('ALLOW_FINANCE_WORKFLOW_DEMO_SEEDER', false), FILTER_VALIDATE_BOOLEAN);
        if (!app()->environment(['local', 'testing']) && !$allowOutsideLocal) {
            throw new RuntimeException(
                'FinanceWorkflowDemoSeeder is restricted to local/testing environments. ' .
                'Set ALLOW_FINANCE_WORKFLOW_DEMO_SEEDER=true to run outside local/testing.'
            );
        }

        $accounts = $this->ensureFinanceAccounts();
        $memberRoleId = (int) Role::query()->where('name', RoleHierarchy::MEMBER)->value('id');
        if ($memberRoleId <= 0) {
            throw new RuntimeException('Member role must exist before running FinanceWorkflowDemoSeeder.');
        }

        $treasurer = $this->ensureFinanceUser(
            'temp.finance.treasurer@lipataeagles.ph',
            'Temp Finance Treasurer (Secondary)',
            RoleHierarchy::FINANCE_TREASURER,
            $memberRoleId
        );
        $auditor = $this->ensureFinanceUser(
            'temp.finance.auditor@lipataeagles.ph',
            'Temp Finance Auditor (Secondary)',
            RoleHierarchy::FINANCE_AUDITOR,
            $memberRoleId
        );

        $memberOne = $this->ensureMember('WF-001', 'Alfred', null, 'Bankson', 'workflow.member.one@lipataeagles.ph');
        $memberTwo = $this->ensureMember('WF-002', 'Gina', null, 'GCash', 'workflow.member.two@lipataeagles.ph');
        $memberThree = $this->ensureMember('WF-003', 'Carlos', null, 'Cashon', 'workflow.member.three@lipataeagles.ph');
        $recipient = $this->ensureMember('WF-004', 'Ramon', null, 'Aid', 'workflow.recipient@lipataeagles.ph');

        $month = Carbon::now()->format('Y-m');
        $dates = [
            'month_02' => Carbon::now()->startOfMonth()->addDay()->toDateString(),
            'month_04' => Carbon::now()->startOfMonth()->addDays(3)->toDateString(),
            'month_05' => Carbon::now()->startOfMonth()->addDays(4)->toDateString(),
            'month_06' => Carbon::now()->startOfMonth()->addDays(5)->toDateString(),
            'month_07' => Carbon::now()->startOfMonth()->addDays(6)->toDateString(),
        ];

        $this->seedContributions($treasurer, $auditor, $accounts, $memberOne, $memberTwo, $memberThree, $recipient, $month, $dates);
        $this->seedExpenses($treasurer, $auditor, $accounts, $month, $dates);
        $this->seedOpeningBalances($treasurer, $accounts);
    }

    private function ensureFinanceAccounts(): array
    {
        $definitions = [
            'bank' => ['name' => 'Bank Account', 'account_type' => 'bank'],
            'gcash' => ['name' => 'GCash', 'account_type' => 'gcash'],
            'cash_on_hand' => ['name' => 'Cash On Hand', 'account_type' => 'cash_on_hand'],
        ];

        $accounts = [];
        foreach ($definitions as $code => $definition) {
            $accounts[$code] = FinanceAccount::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name' => $definition['name'],
                    'account_type' => $definition['account_type'],
                    'is_active' => true,
                ]
            );
        }

        return $accounts;
    }

    private function ensureFinanceUser(string $email, string $name, string $financeRole, int $memberRoleId): User
    {
        $password = trim((string) env('TEMP_LOGIN_PASSWORD', ''));

        return User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($password !== '' ? $password : Str::random(40)),
                'email_verified_at' => now(),
                'role_id' => $memberRoleId,
                'finance_role' => $financeRole,
            ]
        );
    }

    private function ensureMember(
        string $memberNumber,
        string $firstName,
        ?string $middleName,
        string $lastName,
        string $email,
        ?int $userId = null
    ): Member {
        return Member::query()->updateOrCreate(
            ['email' => $email],
            [
                'member_number' => $memberNumber,
                'first_name' => $firstName,
                'middle_name' => $middleName,
                'last_name' => $lastName,
                'user_id' => $userId,
                'membership_status' => 'active',
                'email_verified' => true,
                'password_set' => $userId !== null,
            ]
        );
    }

    private function ensureContribution(array $attributes): Contribution
    {
        return Contribution::query()->firstOrCreate($attributes, [
            'encoded_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function ensureContributionCount(array $attributes, int $count): void
    {
        $existing = Contribution::query()->where($attributes)->count();
        while ($existing < $count) {
            Contribution::query()->create(array_merge($attributes, [
                'encoded_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]));
            $existing++;
        }
    }

    private function ensureExpense(array $attributes): Expense
    {
        return Expense::query()->firstOrCreate($attributes, [
            'encoded_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function ensureOpeningBalance(array $attributes): FinanceAccountOpeningBalance
    {
        return FinanceAccountOpeningBalance::query()->firstOrCreate($attributes, [
            'encoded_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function ensureExpenseCount(array $attributes, int $count): void
    {
        $existing = Expense::query()->where($attributes)->count();
        while ($existing < $count) {
            Expense::query()->create(array_merge($attributes, [
                'encoded_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]));
            $existing++;
        }
    }

    private function seedContributions(
        User $treasurer,
        User $auditor,
        array $accounts,
        Member $memberOne,
        Member $memberTwo,
        Member $memberThree,
        Member $recipient,
        string $month,
        array $dates
    ): void {
        $this->ensureMember('WF-TREASURER', 'Temp', 'Finance', 'Treasurer', $treasurer->email, $treasurer->id);
        $this->ensureMember('WF-AUDITOR', 'Temp', 'Finance', 'Auditor', $auditor->email, $auditor->id);

        $this->ensureContribution([
            'member_id' => $memberOne->id,
            'category' => 'monthly_contribution',
            'contribution_date' => $dates['month_02'],
            'amount' => 600,
            'note' => 'Demo Workflow: Monthly Bank Payment',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['bank']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureContribution([
            'member_id' => $memberOne->id,
            'category' => 'project_contribution',
            'contribution_date' => $dates['month_04'],
            'amount' => 1500,
            'note' => 'Demo Workflow: Bridge Repair Project',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['gcash']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureContribution([
            'member_id' => $memberTwo->id,
            'category' => 'monthly_contribution',
            'contribution_date' => $dates['month_02'],
            'amount' => 250,
            'note' => 'Demo Workflow: Partial Monthly GCash',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['gcash']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureContribution([
            'member_id' => $memberThree->id,
            'category' => 'project_contribution',
            'contribution_date' => $dates['month_05'],
            'amount' => 900,
            'note' => 'Demo Workflow: Hall Repair Project',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['cash_on_hand']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureContribution([
            'member_id' => $memberOne->id,
            'category' => 'extra_contribution',
            'contribution_date' => $dates['month_06'],
            'amount' => 400,
            'note' => 'Demo Workflow: Extra Cash Support',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['cash_on_hand']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureContributionCount([
            'member_id' => $memberTwo->id,
            'category' => 'project_contribution',
            'contribution_date' => $dates['month_05'],
            'amount' => 500,
            'note' => 'Demo Workflow: Duplicate Event Banner',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['bank']->id,
            'encoded_by_user_id' => $treasurer->id,
        ], 2);

        $original = $this->ensureContribution([
            'member_id' => $memberOne->id,
            'category' => 'extra_contribution',
            'contribution_date' => $dates['month_07'],
            'amount' => 350,
            'note' => 'Demo Workflow: Reversed Extra Support',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['bank']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureContribution([
            'member_id' => $memberOne->id,
            'category' => 'extra_contribution',
            'contribution_date' => $dates['month_07'],
            'amount' => -350,
            'note' => 'Demo Workflow: Reversal Offset Extra Support',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['bank']->id,
            'reversal_of_contribution_id' => $original->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $missingContext = $this->ensureContribution([
            'member_id' => $memberThree->id,
            'category' => 'alalayang_agila_contribution',
            'contribution_date' => $dates['month_06'],
            'amount' => 300,
            'note' => 'Demo Workflow: Missing Recipient Context',
            'beneficiary_member_id' => null,
            'recipient_name' => null,
            'finance_account_id' => $accounts['gcash']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureContribution([
            'member_id' => $memberOne->id,
            'category' => 'alalayang_agila_contribution',
            'contribution_date' => $dates['month_06'],
            'amount' => 450,
            'note' => 'Demo Workflow: Aid For Brother Ramon',
            'beneficiary_member_id' => $recipient->id,
            'recipient_name' => $recipient->first_name . ' ' . $recipient->last_name,
            'finance_account_id' => $accounts['gcash']->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        FinanceAuditNote::query()->firstOrCreate([
            'member_id' => $memberTwo->id,
            'contribution_id' => null,
            'target_month' => $month,
            'category' => 'monthly_contribution',
            'discrepancy_type' => 'monthly_below_required',
            'status' => 'needs_followup',
            'note_text' => 'Demo workflow: follow up on remaining monthly dues for this month.',
            'created_by_user_id' => $auditor->id,
        ]);

        FinanceAuditNote::query()->firstOrCreate([
            'member_id' => $memberThree->id,
            'contribution_id' => null,
            'target_month' => $month,
            'category' => 'monthly_contribution',
            'discrepancy_type' => 'missing_monthly_payment',
            'status' => 'exception',
            'note_text' => 'Demo workflow: no monthly payment found for the selected month.',
            'created_by_user_id' => $auditor->id,
        ]);

        FinanceAuditNote::query()->firstOrCreate([
            'member_id' => $memberThree->id,
            'contribution_id' => $missingContext->id,
            'target_month' => $month,
            'category' => 'alalayang_agila_contribution',
            'discrepancy_type' => 'missing_context',
            'status' => 'needs_followup',
            'note_text' => 'Demo workflow: add recipient context or beneficiary linkage for this support entry.',
            'created_by_user_id' => $auditor->id,
        ]);
    }

    private function seedExpenses(
        User $treasurer,
        User $auditor,
        array $accounts,
        string $month,
        array $dates
    ): void {
        $this->ensureExpense([
            'category' => 'project_expense',
            'expense_date' => $dates['month_04'],
            'amount' => 2200,
            'note' => 'Demo Workflow: Project Materials',
            'payee_name' => 'Ace Hardware',
            'finance_account_id' => $accounts['bank']->id,
            'support_reference' => 'OR-DEMO-2200',
            'approval_reference' => 'BOARD-DEMO-01',
            'beneficiary_member_id' => null,
            'reversal_of_expense_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $missingSupport = $this->ensureExpense([
            'category' => 'administrative_expense',
            'expense_date' => $dates['month_05'],
            'amount' => 480,
            'note' => 'Demo Workflow: Office Supplies',
            'payee_name' => 'Office Depot',
            'finance_account_id' => $accounts['gcash']->id,
            'support_reference' => null,
            'approval_reference' => 'APPROVED-DEMO-02',
            'beneficiary_member_id' => null,
            'reversal_of_expense_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $missingApproval = $this->ensureExpense([
            'category' => 'reimbursement_expense',
            'expense_date' => $dates['month_06'],
            'amount' => 300,
            'note' => 'Demo Workflow: Volunteer Reimbursement',
            'payee_name' => 'Brother Volunteer',
            'finance_account_id' => $accounts['cash_on_hand']->id,
            'support_reference' => 'RCPT-DEMO-300',
            'approval_reference' => null,
            'beneficiary_member_id' => null,
            'reversal_of_expense_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureExpenseCount([
            'category' => 'misc_expense',
            'expense_date' => $dates['month_06'],
            'amount' => 150,
            'note' => 'Demo Workflow: Duplicate Snack Expense',
            'payee_name' => 'Snack Corner',
            'finance_account_id' => $accounts['cash_on_hand']->id,
            'support_reference' => 'SNACK-DEMO-150',
            'approval_reference' => 'APPROVED-DEMO-03',
            'beneficiary_member_id' => null,
            'reversal_of_expense_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ], 2);

        $reversedOriginal = $this->ensureExpense([
            'category' => 'event_expense',
            'expense_date' => $dates['month_07'],
            'amount' => 700,
            'note' => 'Demo Workflow: Reversed Venue Downpayment',
            'payee_name' => 'Town Hall',
            'finance_account_id' => $accounts['bank']->id,
            'support_reference' => 'DOWNPAY-DEMO-700',
            'approval_reference' => 'APPROVED-DEMO-04',
            'beneficiary_member_id' => null,
            'reversal_of_expense_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureExpense([
            'category' => 'event_expense',
            'expense_date' => $dates['month_07'],
            'amount' => -700,
            'note' => 'Demo Workflow: Reversal Offset Venue Downpayment',
            'payee_name' => 'Town Hall',
            'finance_account_id' => $accounts['bank']->id,
            'support_reference' => 'DOWNPAY-DEMO-700',
            'approval_reference' => 'APPROVED-DEMO-04',
            'beneficiary_member_id' => null,
            'reversal_of_expense_id' => $reversedOriginal->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        ExpenseAuditNote::query()->firstOrCreate([
            'expense_id' => $missingSupport->id,
            'target_month' => $month,
            'category' => $missingSupport->category,
            'discrepancy_type' => 'missing_support_reference',
            'status' => 'needs_followup',
            'note_text' => 'Demo workflow: attach the receipt or voucher reference.',
            'created_by_user_id' => $auditor->id,
        ]);

        ExpenseAuditNote::query()->firstOrCreate([
            'expense_id' => $missingApproval->id,
            'target_month' => $month,
            'category' => $missingApproval->category,
            'discrepancy_type' => 'missing_approval_reference',
            'status' => 'exception',
            'note_text' => 'Demo workflow: approval reference is still missing for this reimbursement.',
            'created_by_user_id' => $auditor->id,
        ]);

        ExpenseAuditNote::query()->firstOrCreate([
            'expense_id' => $reversedOriginal->id,
            'target_month' => $month,
            'category' => $reversedOriginal->category,
            'discrepancy_type' => 'reversal_linked',
            'status' => 'clear',
            'note_text' => 'Demo workflow: reversal linkage reviewed and documented.',
            'created_by_user_id' => $auditor->id,
        ]);
    }

    private function seedOpeningBalances(User $treasurer, array $accounts): void
    {
        $this->ensureOpeningBalance([
            'finance_account_id' => $accounts['bank']->id,
            'effective_date' => Carbon::now()->startOfYear()->toDateString(),
            'amount' => 15000,
            'note' => 'Demo Workflow: Opening Bank Balance',
            'reversal_of_opening_balance_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureOpeningBalance([
            'finance_account_id' => $accounts['gcash']->id,
            'effective_date' => Carbon::now()->startOfYear()->toDateString(),
            'amount' => 4200,
            'note' => 'Demo Workflow: Opening GCash Balance',
            'reversal_of_opening_balance_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $cashOpening = $this->ensureOpeningBalance([
            'finance_account_id' => $accounts['cash_on_hand']->id,
            'effective_date' => Carbon::now()->startOfYear()->toDateString(),
            'amount' => 2800,
            'note' => 'Demo Workflow: Opening Cash On Hand',
            'reversal_of_opening_balance_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureOpeningBalance([
            'finance_account_id' => $accounts['cash_on_hand']->id,
            'effective_date' => Carbon::now()->startOfYear()->addDay()->toDateString(),
            'amount' => -2800,
            'note' => 'Demo Workflow: Reversal Opening Cash On Hand',
            'reversal_of_opening_balance_id' => $cashOpening->id,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureOpeningBalance([
            'finance_account_id' => $accounts['cash_on_hand']->id,
            'effective_date' => Carbon::now()->startOfYear()->addDays(2)->toDateString(),
            'amount' => 3000,
            'note' => 'Demo Workflow: Corrected Opening Cash On Hand',
            'reversal_of_opening_balance_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);

        $this->ensureOpeningBalance([
            'finance_account_id' => $accounts['bank']->id,
            'effective_date' => Carbon::now()->startOfYear()->addDays(3)->toDateString(),
            'amount' => 500,
            'note' => 'Demo Workflow: Bank Baseline Adjustment',
            'reversal_of_opening_balance_id' => null,
            'encoded_by_user_id' => $treasurer->id,
        ]);
    }
}
