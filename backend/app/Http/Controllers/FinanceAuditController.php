<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\FinanceAuditNote;
use App\Models\Member;
use App\Models\User;
use App\Support\BootstrapSuperadminPrivacy;
use App\Support\RoleHierarchy;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class FinanceAuditController extends Controller
{
    private const CATEGORY_LABELS = [
        'monthly_contribution' => 'Monthly Contribution',
        'alalayang_agila_contribution' => 'Alalayang Agila Contribution',
        'project_contribution' => 'Project Contribution',
        'extra_contribution' => 'Extra Contribution',
    ];

    private const DISCREPANCY_LABELS = [
        'missing_monthly_payment' => 'Missing Monthly Payment',
        'monthly_below_required' => 'Monthly Below Required Amount',
        'duplicate_entry' => 'Duplicate-Looking Contribution Entry',
        'reversal_linked' => 'Reversal-Linked Entry',
        'missing_context' => 'Missing Required Context',
    ];

    private const STATUS_LABELS = [
        'clear' => 'Clear',
        'needs_followup' => 'Needs Follow-Up',
        'exception' => 'Exception',
    ];

    private const DISCREPANCY_ORDER = [
        'missing_monthly_payment' => 1,
        'monthly_below_required' => 2,
        'duplicate_entry' => 3,
        'reversal_linked' => 4,
        'missing_context' => 5,
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
            (string) $row['member_id'],
            (string) ($row['contribution_id'] ?? ''),
            (string) ($row['target_month'] ?? ''),
            (string) ($row['category'] ?? ''),
            (string) $row['discrepancy_type'],
        ]);
    }

    private function noteKeyFromModel(FinanceAuditNote $note): string
    {
        return implode('|', [
            (string) $note->member_id,
            (string) ($note->contribution_id ?? ''),
            (string) ($note->target_month ?? ''),
            (string) ($note->category ?? ''),
            (string) $note->discrepancy_type,
        ]);
    }

    private function formatMemberName(Member $member): string
    {
        return trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name);
    }

    public function report(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);

        $validated = $request->validate([
            'month' => 'required|date_format:Y-m',
            'category' => 'nullable|in:monthly_contribution,alalayang_agila_contribution,project_contribution,extra_contribution',
            'member_search' => 'nullable|string|max:50',
            'status' => 'nullable|in:clear,needs_followup,exception',
            'discrepancy_type' => 'nullable|in:missing_monthly_payment,monthly_below_required,duplicate_entry,reversal_linked,missing_context',
            'page' => 'nullable|integer|min:1',
        ]);

        $targetMonth = (string) $validated['month'];
        $monthStart = Carbon::createFromFormat('Y-m', $targetMonth)->startOfMonth()->toDateString();
        $monthEnd = Carbon::createFromFormat('Y-m', $targetMonth)->endOfMonth()->toDateString();
        $categoryFilter = $validated['category'] ?? null;
        $memberSearch = Str::of((string) ($validated['member_search'] ?? ''))->trim()->value();
        $statusFilter = $validated['status'] ?? null;
        $typeFilter = $validated['discrepancy_type'] ?? null;
        $page = max(1, (int) ($validated['page'] ?? 1));
        $requiredMonthlyAmount = (float) config('finance.required_monthly_amount', 500);

        $members = Member::query()
            ->select(['id', 'member_number', 'first_name', 'middle_name', 'last_name', 'email'])
            ->when(BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($request->user()), function ($query) {
                $query->whereRaw('LOWER(TRIM(COALESCE(email, ""))) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
            })
            ->when($memberSearch !== '', function ($query) use ($memberSearch): void {
                $query->where(function ($builder) use ($memberSearch): void {
                    $builder
                        ->where('member_number', 'like', "%{$memberSearch}%")
                        ->orWhere('first_name', 'like', "%{$memberSearch}%")
                        ->orWhere('middle_name', 'like', "%{$memberSearch}%")
                        ->orWhere('last_name', 'like', "%{$memberSearch}%")
                        ->orWhere('email', 'like', "%{$memberSearch}%");
                });
            })
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get()
            ->keyBy('id');

        $memberIds = $members->keys()->all();

        $monthlyTotals = Contribution::query()
            ->selectRaw('member_id, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as entry_count')
            ->whereIn('member_id', $memberIds)
            ->where('category', 'monthly_contribution')
            ->whereBetween('contribution_date', [$monthStart, $monthEnd])
            ->groupBy('member_id')
            ->get()
            ->keyBy('member_id');

        $rows = collect();

        if ($categoryFilter === null || $categoryFilter === 'monthly_contribution') {
            foreach ($members as $member) {
                $monthly = $monthlyTotals->get($member->id);
                $totalAmount = (float) ($monthly->total_amount ?? 0);

                if ($totalAmount <= 0) {
                    $rows->push([
                        'member_id' => $member->id,
                        'contribution_id' => null,
                        'target_month' => $targetMonth,
                        'category' => 'monthly_contribution',
                        'discrepancy_type' => 'missing_monthly_payment',
                        'details' => sprintf('No monthly contribution recorded for %s.', $targetMonth),
                        'amount' => 0,
                    ]);
                    continue;
                }

                if ($totalAmount < $requiredMonthlyAmount) {
                    $rows->push([
                        'member_id' => $member->id,
                        'contribution_id' => null,
                        'target_month' => $targetMonth,
                        'category' => 'monthly_contribution',
                        'discrepancy_type' => 'monthly_below_required',
                        'details' => sprintf(
                            'Monthly total for %s is %s, below required %s.',
                            $targetMonth,
                            number_format($totalAmount, 2),
                            number_format($requiredMonthlyAmount, 2)
                        ),
                        'amount' => $totalAmount,
                    ]);
                }
            }
        }

        $monthContributions = Contribution::query()
            ->with([
                'member:id,member_number,first_name,middle_name,last_name,email',
                'beneficiaryMember:id,first_name,middle_name,last_name',
                'reversals:id,reversal_of_contribution_id',
            ])
            ->whereIn('member_id', $memberIds)
            ->whereBetween('contribution_date', [$monthStart, $monthEnd])
            ->when($categoryFilter !== null, fn ($query) => $query->where('category', $categoryFilter))
            ->get();

        $duplicateGroups = $monthContributions
            ->where('reversal_of_contribution_id', null)
            ->groupBy(function (Contribution $row): string {
                return implode('|', [
                    $row->member_id,
                    $row->category,
                    optional($row->contribution_date)->toDateString() ?? '',
                    number_format((float) $row->amount, 2, '.', ''),
                    Str::of((string) $row->note)->trim()->lower()->value(),
                ]);
            })
            ->filter(fn (Collection $group) => $group->count() > 1);

        foreach ($duplicateGroups as $group) {
            /** @var Contribution $first */
            $first = $group->first();
            $rows->push([
                'member_id' => $first->member_id,
                'contribution_id' => $first->id,
                'target_month' => $targetMonth,
                'category' => $first->category,
                'discrepancy_type' => 'duplicate_entry',
                'details' => sprintf(
                    '%d entries share the same member, category, date, amount, and remarks.',
                    $group->count()
                ),
                'amount' => (float) $first->amount,
            ]);
        }

        $reversalLinked = $monthContributions->filter(function (Contribution $row): bool {
            return $row->reversal_of_contribution_id !== null || $row->reversals->isNotEmpty();
        });

        foreach ($reversalLinked as $row) {
            $rows->push([
                'member_id' => $row->member_id,
                'contribution_id' => $row->id,
                'target_month' => $targetMonth,
                'category' => $row->category,
                'discrepancy_type' => 'reversal_linked',
                'details' => $row->reversal_of_contribution_id !== null
                    ? sprintf('This row is a reversal of contribution #%d.', $row->reversal_of_contribution_id)
                    : sprintf('This original contribution has been offset by reversal entry #%d.', (int) $row->reversals->first()?->id),
                'amount' => (float) $row->amount,
            ]);
        }

        $missingContext = $monthContributions->filter(function (Contribution $row): bool {
            if ($row->category === 'project_contribution') {
                return Str::of((string) $row->note)->trim()->value() === '';
            }

            if ($row->category === 'alalayang_agila_contribution') {
                $hasRecipient = Str::of((string) $row->recipient_name)->trim()->value() !== ''
                    || $row->beneficiary_member_id !== null;
                return !$hasRecipient;
            }

            return false;
        });

        foreach ($missingContext as $row) {
            $rows->push([
                'member_id' => $row->member_id,
                'contribution_id' => $row->id,
                'target_month' => $targetMonth,
                'category' => $row->category,
                'discrepancy_type' => 'missing_context',
                'details' => $row->category === 'project_contribution'
                    ? 'Project contribution is missing project-name remarks.'
                    : 'Alalayang Agila contribution is missing recipient context.',
                'amount' => (float) $row->amount,
            ]);
        }

        if ($typeFilter !== null) {
            $rows = $rows->where('discrepancy_type', $typeFilter)->values();
        } else {
            $rows = $rows->values();
        }

        $rows = $rows->unique(fn (array $row) => $this->noteKey($row))->values();

        $notes = FinanceAuditNote::query()
            ->with('createdBy:id,name')
            ->whereIn('member_id', $memberIds)
            ->where('target_month', $targetMonth)
            ->when($categoryFilter !== null, fn ($query) => $query->where('category', $categoryFilter))
            ->when($typeFilter !== null, fn ($query) => $query->where('discrepancy_type', $typeFilter))
            ->latest('id')
            ->get()
            ->groupBy(fn (FinanceAuditNote $note) => $this->noteKeyFromModel($note));

        $rows = $rows->map(function (array $row) use ($members, $notes) {
            /** @var Member|null $member */
            $member = $members->get($row['member_id']);
            $noteRows = collect($notes->get($this->noteKey($row), []))
                ->map(function (FinanceAuditNote $note): array {
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
                'member' => $member ? [
                    'id' => $member->id,
                    'member_number' => $member->member_number,
                    'name' => $this->formatMemberName($member),
                    'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($request->user(), $member->email),
                ] : null,
                'contribution_id' => $row['contribution_id'],
                'target_month' => $row['target_month'],
                'category' => $row['category'],
                'category_label' => self::CATEGORY_LABELS[$row['category']] ?? $row['category'],
                'discrepancy_type' => $row['discrepancy_type'],
                'discrepancy_label' => self::DISCREPANCY_LABELS[$row['discrepancy_type']] ?? $row['discrepancy_type'],
                'details' => $row['details'],
                'amount' => $row['amount'],
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
            fn (array $row) => $row['member']['member_number'] ?? '',
            fn (array $row) => $row['category'] ?? '',
        ])->values();

        $totalRows = $rows->count();
        $paginated = $rows->slice(($page - 1) * 10, 10)->values();
        $lastPage = max(1, (int) ceil($totalRows / 10));

        return response()->json([
            'filters' => [
                'month' => $targetMonth,
                'category' => $categoryFilter,
                'member_search' => $memberSearch !== '' ? $memberSearch : null,
                'status' => $statusFilter,
                'discrepancy_type' => $typeFilter,
                'required_monthly_amount' => $requiredMonthlyAmount,
            ],
            'available_statuses' => self::STATUS_LABELS,
            'available_discrepancies' => self::DISCREPANCY_LABELS,
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
            return response()->json(['message' => 'Only an auditor can record audit notes.'], 403);
        }

        $validated = $request->validate([
            'member_id' => 'required|integer|exists:members,id',
            'contribution_id' => 'nullable|integer|exists:contributions,id',
            'target_month' => 'required|date_format:Y-m',
            'category' => 'required|in:monthly_contribution,alalayang_agila_contribution,project_contribution,extra_contribution',
            'discrepancy_type' => 'required|in:missing_monthly_payment,monthly_below_required,duplicate_entry,reversal_linked,missing_context',
            'status' => 'required|in:clear,needs_followup,exception',
            'note_text' => 'required|string|max:2000',
        ]);

        $created = FinanceAuditNote::query()->create([
            'member_id' => (int) $validated['member_id'],
            'contribution_id' => isset($validated['contribution_id']) ? (int) $validated['contribution_id'] : null,
            'target_month' => $validated['target_month'],
            'category' => $validated['category'],
            'discrepancy_type' => $validated['discrepancy_type'],
            'status' => $validated['status'],
            'note_text' => trim((string) $validated['note_text']),
            'created_by_user_id' => $actor->id,
        ]);

        Log::info('finance.audit_note_created', [
            'actor_user_id' => $actor->id,
            'finance_audit_note_id' => $created->id,
            'member_id' => $created->member_id,
            'contribution_id' => $created->contribution_id,
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
