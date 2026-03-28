<?php

namespace App\Http\Controllers;

use App\Models\Expense;
use App\Models\FinanceAccount;
use App\Models\FinanceAccountOpeningBalance;
use App\Models\Member;
use App\Models\User;
use App\Support\TextCase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class FinanceExpenseController extends Controller
{
    private const EXPENSE_CATEGORY_LABELS = [
        'administrative_expense' => 'Administrative Expense',
        'event_expense' => 'Event Expense',
        'project_expense' => 'Project Expense',
        'aid_expense' => 'Aid Expense',
        'reimbursement_expense' => 'Reimbursement Expense',
        'misc_expense' => 'Miscellaneous Expense',
    ];

    private function serializeFinanceAccount(FinanceAccount $account): array
    {
        return [
            'id' => $account->id,
            'code' => $account->code,
            'name' => $account->name,
            'account_type' => $account->account_type,
            'account_label' => $account->name,
        ];
    }

    private function expenseCategoryLabels(): array
    {
        return self::EXPENSE_CATEGORY_LABELS;
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function ensureMobileFinanceAccess(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        if (!$user->mobile_access_enabled) {
            return response()->json([
                'message' => 'Mobile access is not enabled for this account.',
            ], 403);
        }

        if ($this->normalizeEmail((string) $user->email) === $this->normalizeEmail((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'))) {
            return response()->json([
                'message' => 'Bootstrap account is not available through the mobile app.',
            ], 403);
        }

        if (!$user->hasPermission('finance.view')) {
            return response()->json([
                'message' => 'Forbidden',
            ], 403);
        }

        return null;
    }

    private function formatMemberName(Member $member): string
    {
        return trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name);
    }

    private function accountsCollection()
    {
        return FinanceAccount::query()
            ->where('is_active', true)
            ->orderByRaw("CASE code WHEN 'bank' THEN 1 WHEN 'gcash' THEN 2 WHEN 'cash_on_hand' THEN 3 ELSE 9 END")
            ->orderBy('name')
            ->get();
    }

    public function accounts(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);

        return response()->json(
            $this->accountsCollection()->map(fn (FinanceAccount $account) => [
                'id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'account_type' => $account->account_type,
                'account_label' => $account->name,
                'is_active' => $account->is_active,
            ])->values()
        );
    }

    public function accountBalances(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);

        $accounts = $this->accountsCollection()->keyBy('id');
        $openingTotals = DB::table('finance_account_opening_balances')
            ->selectRaw('finance_account_id, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as total_count')
            ->whereDate('effective_date', '<=', now()->toDateString())
            ->groupBy('finance_account_id')
            ->get()
            ->keyBy('finance_account_id');

        $contributionTotals = DB::table('contributions')
            ->selectRaw('finance_account_id, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as total_count')
            ->groupBy('finance_account_id')
            ->get()
            ->keyBy('finance_account_id');

        $expenseTotals = DB::table('expenses')
            ->selectRaw('finance_account_id, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as total_count')
            ->groupBy('finance_account_id')
            ->get()
            ->keyBy('finance_account_id');

        $rows = $accounts->map(function (FinanceAccount $account) use ($openingTotals, $contributionTotals, $expenseTotals) {
            $opening = $openingTotals->get($account->id);
            $contribution = $contributionTotals->get($account->id);
            $expense = $expenseTotals->get($account->id);

            $openingAmount = (float) ($opening->total_amount ?? 0);
            $inflows = (float) ($contribution->total_amount ?? 0);
            $outflows = (float) ($expense->total_amount ?? 0);

            return [
                'account' => $this->serializeFinanceAccount($account),
                'opening_balance_total' => $openingAmount,
                'total_inflows' => $inflows,
                'total_outflows' => $outflows,
                'net_balance' => round($openingAmount + $inflows - $outflows, 2),
                'opening_balance_count' => (int) ($opening->total_count ?? 0),
                'contribution_count' => (int) ($contribution->total_count ?? 0),
                'expense_count' => (int) ($expense->total_count ?? 0),
            ];
        })->values();

        $unassignedContributionTotal = (float) DB::table('contributions')
            ->whereNull('finance_account_id')
            ->sum('amount');

        return response()->json([
            'data' => $rows,
            'unassigned_contribution_total' => $unassignedContributionTotal,
        ]);
    }

    public function mobileAccounts(Request $request)
    {
        if ($response = $this->ensureMobileFinanceAccess($request)) {
            return $response;
        }

        return $this->accounts($request);
    }

    public function openingBalances(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);

        $validated = $request->validate([
            'finance_account_id' => 'nullable|integer|exists:finance_accounts,id',
        ]);

        $rows = FinanceAccountOpeningBalance::query()
            ->with([
                'financeAccount:id,code,name,account_type',
                'encodedBy:id,name',
                'reversals:id,reversal_of_opening_balance_id',
            ])
            ->when(
                isset($validated['finance_account_id']),
                fn ($query) => $query->where('finance_account_id', (int) $validated['finance_account_id'])
            )
            ->latest('effective_date')
            ->latest('encoded_at')
            ->latest('id')
            ->get()
            ->map(function (FinanceAccountOpeningBalance $row): array {
                return [
                    'id' => $row->id,
                    'effective_date' => optional($row->effective_date)?->toDateString() ?? (string) $row->effective_date,
                    'amount' => (float) $row->amount,
                    'note' => $row->note,
                    'finance_account' => $row->financeAccount ? $this->serializeFinanceAccount($row->financeAccount) : null,
                    'is_reversal' => $row->reversal_of_opening_balance_id !== null,
                    'reversal_of_opening_balance_id' => $row->reversal_of_opening_balance_id,
                    'reversed_by_entry_id' => $row->reversals->first()?->id,
                    'encoded_at' => optional($row->encoded_at)?->toISOString(),
                    'encoded_by' => $row->encodedBy ? ['id' => $row->encodedBy->id, 'name' => $row->encodedBy->name] : null,
                ];
            })
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function storeOpeningBalance(Request $request)
    {
        $validated = $request->validate([
            'finance_account_id' => 'required|integer|exists:finance_accounts,id',
            'effective_date' => 'required|date',
            'amount' => 'required|numeric|min:0.01',
            'note' => 'required|string|max:255',
        ]);

        $created = FinanceAccountOpeningBalance::query()->create([
            'finance_account_id' => (int) $validated['finance_account_id'],
            'effective_date' => $validated['effective_date'],
            'amount' => $validated['amount'],
            'note' => TextCase::title($validated['note']),
            'encoded_by_user_id' => $request->user()->id,
            'encoded_at' => now(),
        ]);

        Log::info('finance.opening_balance_recorded', [
            'actor_user_id' => $request->user()->id,
            'opening_balance_id' => $created->id,
            'finance_account_id' => $created->finance_account_id,
            'amount' => (float) $created->amount,
            'effective_date' => optional($created->effective_date)?->toDateString(),
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Opening balance recorded. Use a reversal if this baseline was entered incorrectly.',
            'opening_balance' => $created->load(['financeAccount:id,code,name,account_type', 'encodedBy:id,name']),
        ], 201);
    }

    public function reverseOpeningBalance(Request $request, FinanceAccountOpeningBalance $openingBalance)
    {
        if (!$request->user()->hasPermission('finance.input')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'remarks' => 'required|string|max:255',
            'effective_date' => 'nullable|date',
            'finance_account_id' => 'required|integer|exists:finance_accounts,id',
        ]);

        if ($openingBalance->reversal_of_opening_balance_id !== null) {
            return response()->json([
                'message' => 'A reversal opening balance cannot be reversed again.',
            ], 422);
        }

        $openingBalance->loadMissing('reversals:id,reversal_of_opening_balance_id');
        if ($openingBalance->reversals->isNotEmpty()) {
            return response()->json([
                'message' => 'This opening balance already has a reversal entry.',
            ], 422);
        }

        if ((int) $validated['finance_account_id'] !== (int) $openingBalance->finance_account_id) {
            return response()->json([
                'message' => 'Reversal must use the same finance account as the original opening balance.',
            ], 422);
        }

        $created = FinanceAccountOpeningBalance::query()->create([
            'finance_account_id' => $openingBalance->finance_account_id,
            'effective_date' => $validated['effective_date'] ?? now()->toDateString(),
            'amount' => round(((float) $openingBalance->amount) * -1, 2),
            'note' => TextCase::title($validated['remarks']),
            'reversal_of_opening_balance_id' => $openingBalance->id,
            'encoded_by_user_id' => $request->user()->id,
            'encoded_at' => now(),
        ]);

        Log::info('finance.opening_balance_reversed', [
            'actor_user_id' => $request->user()->id,
            'opening_balance_id' => $openingBalance->id,
            'reversal_opening_balance_id' => $created->id,
            'finance_account_id' => $created->finance_account_id,
            'remarks' => $created->note,
            'effective_date' => optional($created->effective_date)?->toDateString(),
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Opening balance reversal recorded. The original baseline remains visible and the net balance is offset.',
            'opening_balance' => $created->load(['financeAccount:id,code,name,account_type', 'encodedBy:id,name']),
        ], 201);
    }

    public function expenses(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);

        $validated = $request->validate([
            'category' => 'nullable|in:administrative_expense,event_expense,project_expense,aid_expense,reimbursement_expense,misc_expense',
            'finance_account_id' => 'nullable|integer|exists:finance_accounts,id',
            'search' => 'nullable|string|max:80',
            'payee_query' => 'nullable|string|max:80',
            'support_state' => 'nullable|in:all,with_support,missing_support',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'page' => 'nullable|integer|min:1',
        ]);

        $search = Str::of((string) ($validated['search'] ?? ''))->trim()->value();
        $payeeQuery = Str::of((string) ($validated['payee_query'] ?? ''))->trim()->value();
        $supportState = $validated['support_state'] ?? 'all';

        $query = Expense::query()
            ->with([
                'financeAccount:id,code,name,account_type',
                'beneficiaryMember:id,first_name,middle_name,last_name',
                'encodedBy:id,name',
                'reversals:id,reversal_of_expense_id',
            ]);

        if (!empty($validated['category'])) {
            $query->where('category', $validated['category']);
        }

        if (!empty($validated['finance_account_id'])) {
            $query->where('finance_account_id', (int) $validated['finance_account_id']);
        }

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('note', 'like', "%{$search}%")
                    ->orWhere('payee_name', 'like', "%{$search}%")
                    ->orWhere('support_reference', 'like', "%{$search}%")
                    ->orWhere('approval_reference', 'like', "%{$search}%");
            });
        }

        if ($payeeQuery !== '') {
            $query->where('payee_name', 'like', "%{$payeeQuery}%");
        }

        if ($supportState === 'with_support') {
            $query->whereNotNull('support_reference')->where('support_reference', '!=', '');
        } elseif ($supportState === 'missing_support') {
            $query->where(function ($builder): void {
                $builder->whereNull('support_reference')->orWhere('support_reference', '');
            });
        }

        if (!empty($validated['date_from'])) {
            $query->whereDate('expense_date', '>=', (string) $validated['date_from']);
        }

        if (!empty($validated['date_to'])) {
            $query->whereDate('expense_date', '<=', (string) $validated['date_to']);
        }

        $totalAmount = (float) (clone $query)->sum('amount');
        $rows = $query
            ->latest('expense_date')
            ->latest('encoded_at')
            ->latest('id')
            ->paginate(10);

        $labels = $this->expenseCategoryLabels();

        $rows->setCollection(
            $rows->getCollection()->map(function (Expense $row) use ($labels) {
                return [
                    'id' => $row->id,
                    'expense_date' => optional($row->expense_date)?->toDateString() ?? (string) $row->expense_date,
                    'category' => $row->category,
                    'category_label' => $labels[$row->category] ?? $row->category,
                    'amount' => (float) $row->amount,
                    'payee_name' => $row->payee_name,
                    'note' => $row->note,
                    'support_reference' => $row->support_reference,
                    'approval_reference' => $row->approval_reference,
                    'beneficiary_member' => $row->beneficiaryMember ? [
                        'id' => $row->beneficiaryMember->id,
                        'name' => $this->formatMemberName($row->beneficiaryMember),
                    ] : null,
                    'finance_account' => $row->financeAccount ? [
                        'id' => $row->financeAccount->id,
                        'code' => $row->financeAccount->code,
                        'name' => $row->financeAccount->name,
                        'account_type' => $row->financeAccount->account_type,
                        'account_label' => $row->financeAccount->name,
                    ] : null,
                    'is_reversal' => $row->reversal_of_expense_id !== null,
                    'reversal_of_expense_id' => $row->reversal_of_expense_id,
                    'reversed_by_entry_id' => $row->reversals->first()?->id,
                    'encoded_at' => optional($row->encoded_at)?->toISOString(),
                    'encoded_by' => $row->encodedBy ? ['id' => $row->encodedBy->id, 'name' => $row->encodedBy->name] : null,
                ];
            })
        );

        return response()->json([
            'filters' => [
                'category' => $validated['category'] ?? null,
                'finance_account_id' => isset($validated['finance_account_id']) ? (int) $validated['finance_account_id'] : null,
                'search' => $search !== '' ? $search : null,
                'payee_query' => $payeeQuery !== '' ? $payeeQuery : null,
                'support_state' => $supportState,
                'date_from' => $validated['date_from'] ?? null,
                'date_to' => $validated['date_to'] ?? null,
            ],
            'available_categories' => $labels,
            'category_labels' => $labels,
            'total_amount' => $totalAmount,
            'total_records' => $rows->total(),
            'data' => $rows->items(),
            'current_page' => $rows->currentPage(),
            'last_page' => $rows->lastPage(),
        ]);
    }

    public function reportPreview(Request $request)
    {
        return $this->expenses($request);
    }

    public function storeExpense(Request $request)
    {
        $validated = $request->validate([
            'category' => 'required|in:administrative_expense,event_expense,project_expense,aid_expense,reimbursement_expense,misc_expense',
            'expense_date' => 'nullable|date',
            'amount' => 'required|numeric|min:0.01',
            'note' => 'required|string|max:255',
            'payee_name' => 'required|string|max:255',
            'finance_account_id' => 'required|integer|exists:finance_accounts,id',
            'support_reference' => 'nullable|string|max:255',
            'approval_reference' => 'nullable|string|max:255',
            'beneficiary_member_id' => 'nullable|integer|exists:members,id',
        ]);

        $created = Expense::query()->create([
            'category' => $validated['category'],
            'expense_date' => $validated['expense_date'] ?? now()->toDateString(),
            'amount' => $validated['amount'],
            'note' => TextCase::title($validated['note']),
            'payee_name' => TextCase::title($validated['payee_name']),
            'finance_account_id' => (int) $validated['finance_account_id'],
            'support_reference' => isset($validated['support_reference']) ? trim((string) $validated['support_reference']) : null,
            'approval_reference' => isset($validated['approval_reference']) ? trim((string) $validated['approval_reference']) : null,
            'beneficiary_member_id' => isset($validated['beneficiary_member_id']) ? (int) $validated['beneficiary_member_id'] : null,
            'encoded_by_user_id' => $request->user()->id,
            'encoded_at' => now(),
        ]);

        return response()->json(
            $created->load(['financeAccount:id,code,name,account_type', 'beneficiaryMember:id,first_name,middle_name,last_name', 'encodedBy:id,name']),
            201
        );
    }

    public function mobileStoreExpense(Request $request)
    {
        if ($response = $this->ensureMobileFinanceAccess($request)) {
            return $response;
        }

        if (!$request->user()->hasPermission('finance.input')) {
            return response()->json([
                'message' => 'Forbidden',
            ], 403);
        }

        return $this->storeExpense($request);
    }

    public function reverseExpense(Request $request, Expense $expense)
    {
        if (!$request->user()->hasPermission('finance.input')) {
            return response()->json(['message' => 'This action is unauthorized.'], 403);
        }

        $validated = $request->validate([
            'remarks' => 'required|string|max:255',
            'expense_date' => 'nullable|date',
            'finance_account_id' => 'required|integer|exists:finance_accounts,id',
        ]);

        if ($expense->reversal_of_expense_id !== null) {
            return response()->json([
                'message' => 'A reversal expense cannot be reversed again.',
            ], 422);
        }

        $expense->loadMissing('reversals:id,reversal_of_expense_id');
        if ($expense->reversals->isNotEmpty()) {
            return response()->json([
                'message' => 'This expense already has a reversal entry.',
            ], 422);
        }

        if ($expense->finance_account_id !== null && (int) $validated['finance_account_id'] !== (int) $expense->finance_account_id) {
            return response()->json([
                'message' => 'Reversal must use the same finance account as the original expense.',
            ], 422);
        }

        $created = Expense::query()->create([
            'category' => $expense->category,
            'expense_date' => $validated['expense_date'] ?? now()->toDateString(),
            'amount' => round(((float) $expense->amount) * -1, 2),
            'note' => TextCase::title($validated['remarks']),
            'payee_name' => $expense->payee_name,
            'finance_account_id' => (int) $validated['finance_account_id'],
            'support_reference' => $expense->support_reference,
            'approval_reference' => $expense->approval_reference,
            'beneficiary_member_id' => $expense->beneficiary_member_id,
            'reversal_of_expense_id' => $expense->id,
            'encoded_by_user_id' => $request->user()->id,
            'encoded_at' => now(),
        ]);

        Log::info('finance.expense_reversed', [
            'actor_user_id' => $request->user()->id,
            'expense_id' => $expense->id,
            'reversal_expense_id' => $created->id,
            'remarks' => $created->note,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Reversal expense recorded. The original amount is now offset in totals.',
            'expense' => $created->load(['financeAccount:id,code,name,account_type', 'beneficiaryMember:id,first_name,middle_name,last_name', 'encodedBy:id,name']),
        ], 201);
    }
}
