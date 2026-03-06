<?php

namespace App\Http\Controllers;

use App\Models\Expense;
use App\Models\ExpenseAuditNote;
use App\Models\Member;
use App\Models\User;
use App\Support\RoleHierarchy;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ExpenseAuditController extends Controller
{
    private const CATEGORY_LABELS = [
        'administrative_expense' => 'Administrative Expense',
        'event_expense' => 'Event Expense',
        'project_expense' => 'Project Expense',
        'aid_expense' => 'Aid Expense',
        'reimbursement_expense' => 'Reimbursement Expense',
        'misc_expense' => 'Miscellaneous Expense',
    ];

    private const DISCREPANCY_LABELS = [
        'missing_support_reference' => 'Missing Support Reference',
        'missing_approval_reference' => 'Missing Approval Reference',
        'duplicate_expense' => 'Duplicate-Looking Expense Entry',
        'reversal_linked' => 'Reversal-Linked Expense',
    ];

    private const STATUS_LABELS = [
        'clear' => 'Clear',
        'needs_followup' => 'Needs Follow-Up',
        'exception' => 'Exception',
    ];

    private const DISCREPANCY_ORDER = [
        'missing_support_reference' => 1,
        'missing_approval_reference' => 2,
        'duplicate_expense' => 3,
        'reversal_linked' => 4,
    ];

    private function isAuditor(User $user): bool
    {
        $user->loadMissing('role:id,name');
        $roleName = (string) ($user->role->name ?? '');

        return $roleName === RoleHierarchy::FINANCE_AUDITOR
            || $user->finance_role === RoleHierarchy::FINANCE_AUDITOR;
    }

    private function noteKey(array $row): string
    {
        return implode('|', [
            (string) ($row['expense_id'] ?? ''),
            (string) ($row['target_month'] ?? ''),
            (string) ($row['category'] ?? ''),
            (string) $row['discrepancy_type'],
        ]);
    }

    private function noteKeyFromModel(ExpenseAuditNote $note): string
    {
        return implode('|', [
            (string) ($note->expense_id ?? ''),
            (string) ($note->target_month ?? ''),
            (string) ($note->category ?? ''),
            (string) $note->discrepancy_type,
        ]);
    }

    public function report(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);

        $validated = $request->validate([
            'month' => 'required|date_format:Y-m',
            'category' => 'nullable|in:administrative_expense,event_expense,project_expense,aid_expense,reimbursement_expense,misc_expense',
            'finance_account_id' => 'nullable|integer|exists:finance_accounts,id',
            'search' => 'nullable|string|max:80',
            'status' => 'nullable|in:clear,needs_followup,exception',
            'discrepancy_type' => 'nullable|in:missing_support_reference,missing_approval_reference,duplicate_expense,reversal_linked',
            'page' => 'nullable|integer|min:1',
        ]);

        $targetMonth = (string) $validated['month'];
        $monthStart = Carbon::createFromFormat('Y-m', $targetMonth)->startOfMonth()->toDateString();
        $monthEnd = Carbon::createFromFormat('Y-m', $targetMonth)->endOfMonth()->toDateString();
        $categoryFilter = $validated['category'] ?? null;
        $accountFilter = isset($validated['finance_account_id']) ? (int) $validated['finance_account_id'] : null;
        $search = Str::of((string) ($validated['search'] ?? ''))->trim()->value();
        $statusFilter = $validated['status'] ?? null;
        $typeFilter = $validated['discrepancy_type'] ?? null;
        $page = max(1, (int) ($validated['page'] ?? 1));

        $expenses = Expense::query()
            ->with([
                'financeAccount:id,code,name,account_type',
                'reversals:id,reversal_of_expense_id',
            ])
            ->whereBetween('expense_date', [$monthStart, $monthEnd])
            ->when($categoryFilter !== null, fn ($query) => $query->where('category', $categoryFilter))
            ->when($accountFilter !== null, fn ($query) => $query->where('finance_account_id', $accountFilter))
            ->when($search !== '', function ($query) use ($search): void {
                $query->where(function ($builder) use ($search): void {
                    $builder
                        ->where('payee_name', 'like', "%{$search}%")
                        ->orWhere('note', 'like', "%{$search}%")
                        ->orWhere('support_reference', 'like', "%{$search}%")
                        ->orWhere('approval_reference', 'like', "%{$search}%");
                });
            })
            ->get();

        $rows = collect();

        foreach ($expenses->filter(fn (Expense $row): bool => Str::of((string) $row->support_reference)->trim()->value() === '') as $row) {
            $rows->push([
                'expense_id' => $row->id,
                'target_month' => $targetMonth,
                'category' => $row->category,
                'discrepancy_type' => 'missing_support_reference',
                'details' => 'Expense is missing receipt, voucher, or support reference.',
                'amount' => (float) $row->amount,
                'payee_name' => $row->payee_name,
                'finance_account' => $row->financeAccount ? [
                    'id' => $row->financeAccount->id,
                    'code' => $row->financeAccount->code,
                    'name' => $row->financeAccount->name,
                    'account_type' => $row->financeAccount->account_type,
                    'account_label' => $row->financeAccount->name,
                ] : null,
            ]);
        }

        foreach ($expenses->filter(fn (Expense $row): bool => Str::of((string) $row->approval_reference)->trim()->value() === '') as $row) {
            $rows->push([
                'expense_id' => $row->id,
                'target_month' => $targetMonth,
                'category' => $row->category,
                'discrepancy_type' => 'missing_approval_reference',
                'details' => 'Expense is missing approval reference or authorization note.',
                'amount' => (float) $row->amount,
                'payee_name' => $row->payee_name,
                'finance_account' => $row->financeAccount ? [
                    'id' => $row->financeAccount->id,
                    'code' => $row->financeAccount->code,
                    'name' => $row->financeAccount->name,
                    'account_type' => $row->financeAccount->account_type,
                    'account_label' => $row->financeAccount->name,
                ] : null,
            ]);
        }

        $duplicateGroups = $expenses
            ->where('reversal_of_expense_id', null)
            ->groupBy(function (Expense $row): string {
                return implode('|', [
                    $row->category,
                    $row->finance_account_id,
                    optional($row->expense_date)->toDateString() ?? '',
                    number_format((float) $row->amount, 2, '.', ''),
                    Str::of((string) $row->payee_name)->trim()->lower()->value(),
                    Str::of((string) $row->note)->trim()->lower()->value(),
                ]);
            })
            ->filter(fn (Collection $group) => $group->count() > 1);

        foreach ($duplicateGroups as $group) {
            /** @var Expense $first */
            $first = $group->first();
            $rows->push([
                'expense_id' => $first->id,
                'target_month' => $targetMonth,
                'category' => $first->category,
                'discrepancy_type' => 'duplicate_expense',
                'details' => sprintf('%d expense rows share account, category, date, amount, payee, and remarks.', $group->count()),
                'amount' => (float) $first->amount,
                'payee_name' => $first->payee_name,
                'finance_account' => $first->financeAccount ? [
                    'id' => $first->financeAccount->id,
                    'code' => $first->financeAccount->code,
                    'name' => $first->financeAccount->name,
                    'account_type' => $first->financeAccount->account_type,
                    'account_label' => $first->financeAccount->name,
                ] : null,
            ]);
        }

        foreach ($expenses->filter(fn (Expense $row): bool => $row->reversal_of_expense_id !== null || $row->reversals->isNotEmpty()) as $row) {
            $rows->push([
                'expense_id' => $row->id,
                'target_month' => $targetMonth,
                'category' => $row->category,
                'discrepancy_type' => 'reversal_linked',
                'details' => $row->reversal_of_expense_id !== null
                    ? sprintf('This row is a reversal of expense #%d.', $row->reversal_of_expense_id)
                    : sprintf('This original expense has been offset by reversal entry #%d.', (int) $row->reversals->first()?->id),
                'amount' => (float) $row->amount,
                'payee_name' => $row->payee_name,
                'finance_account' => $row->financeAccount ? [
                    'id' => $row->financeAccount->id,
                    'code' => $row->financeAccount->code,
                    'name' => $row->financeAccount->name,
                    'account_type' => $row->financeAccount->account_type,
                    'account_label' => $row->financeAccount->name,
                ] : null,
            ]);
        }

        if ($typeFilter !== null) {
            $rows = $rows->where('discrepancy_type', $typeFilter)->values();
        } else {
            $rows = $rows->values();
        }

        $rows = $rows->unique(fn (array $row) => $this->noteKey($row))->values();

        $notes = ExpenseAuditNote::query()
            ->with('createdBy:id,name')
            ->where('target_month', $targetMonth)
            ->when($categoryFilter !== null, fn ($query) => $query->where('category', $categoryFilter))
            ->when($typeFilter !== null, fn ($query) => $query->where('discrepancy_type', $typeFilter))
            ->latest('id')
            ->get()
            ->groupBy(fn (ExpenseAuditNote $note) => $this->noteKeyFromModel($note));

        $rows = $rows->map(function (array $row) use ($notes) {
            $noteRows = collect($notes->get($this->noteKey($row), []))
                ->map(function (ExpenseAuditNote $note): array {
                    return [
                        'id' => $note->id,
                        'status' => $note->status,
                        'status_label' => self::STATUS_LABELS[$note->status] ?? $note->status,
                        'note_text' => $note->note_text,
                        'created_at' => optional($note->created_at)?->toISOString(),
                        'created_by' => $note->createdBy ? ['id' => $note->createdBy->id, 'name' => $note->createdBy->name] : null,
                    ];
                })
                ->values();

            $latestNote = $noteRows->first();

            return [
                'expense_id' => $row['expense_id'],
                'target_month' => $row['target_month'],
                'category' => $row['category'],
                'category_label' => self::CATEGORY_LABELS[$row['category']] ?? $row['category'],
                'discrepancy_type' => $row['discrepancy_type'],
                'discrepancy_label' => self::DISCREPANCY_LABELS[$row['discrepancy_type']] ?? $row['discrepancy_type'],
                'details' => $row['details'],
                'amount' => $row['amount'],
                'payee_name' => $row['payee_name'],
                'finance_account' => $row['finance_account'],
                'latest_status' => $latestNote['status'] ?? null,
                'latest_status_label' => $latestNote['status_label'] ?? null,
                'notes' => $noteRows,
            ];
        });

        if ($statusFilter !== null) {
            $rows = $rows->where('latest_status', $statusFilter)->values();
        } else {
            $rows = $rows->values();
        }

        $rows = $rows->sortBy([
            fn (array $row) => self::DISCREPANCY_ORDER[$row['discrepancy_type']] ?? 99,
            fn (array $row) => $row['payee_name'] ?? '',
            fn (array $row) => $row['category'] ?? '',
        ])->values();

        $totalRows = $rows->count();
        $paginated = $rows->slice(($page - 1) * 10, 10)->values();
        $lastPage = max(1, (int) ceil($totalRows / 10));

        return response()->json([
            'filters' => [
                'month' => $targetMonth,
                'category' => $categoryFilter,
                'finance_account_id' => $accountFilter,
                'search' => $search !== '' ? $search : null,
                'status' => $statusFilter,
                'discrepancy_type' => $typeFilter,
            ],
            'available_statuses' => self::STATUS_LABELS,
            'available_discrepancies' => self::DISCREPANCY_LABELS,
            'available_categories' => self::CATEGORY_LABELS,
            'current_page' => $page,
            'last_page' => $lastPage,
            'total' => $totalRows,
            'data' => $paginated,
        ]);
    }

    public function storeNote(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user();

        if (!$this->isAuditor($actor)) {
            return response()->json(['message' => 'Only an auditor can record expense audit notes.'], 403);
        }

        $validated = $request->validate([
            'expense_id' => 'required|integer|exists:expenses,id',
            'target_month' => 'required|date_format:Y-m',
            'category' => 'required|in:administrative_expense,event_expense,project_expense,aid_expense,reimbursement_expense,misc_expense',
            'discrepancy_type' => 'required|in:missing_support_reference,missing_approval_reference,duplicate_expense,reversal_linked',
            'status' => 'required|in:clear,needs_followup,exception',
            'note_text' => 'required|string|max:2000',
        ]);

        $created = ExpenseAuditNote::query()->create([
            'expense_id' => (int) $validated['expense_id'],
            'target_month' => $validated['target_month'],
            'category' => $validated['category'],
            'discrepancy_type' => $validated['discrepancy_type'],
            'status' => $validated['status'],
            'note_text' => trim((string) $validated['note_text']),
            'created_by_user_id' => $actor->id,
        ]);

        Log::info('finance.expense_audit_note_created', [
            'actor_user_id' => $actor->id,
            'expense_audit_note_id' => $created->id,
            'expense_id' => $created->expense_id,
            'discrepancy_type' => $created->discrepancy_type,
            'status' => $created->status,
            'ip' => $request->ip(),
        ]);

        return response()->json(
            $created->load('createdBy:id,name'),
            201
        );
    }
}
