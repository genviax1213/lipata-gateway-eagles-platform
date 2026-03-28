<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\FinanceAccount;
use App\Models\Member;
use App\Models\User;
use App\Support\BootstrapSuperadminPrivacy;
use App\Support\RoleHierarchy;
use App\Support\TextCase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class FinanceController extends Controller
{
    private const CATEGORY_LABELS = [
        'monthly_contribution' => 'Monthly Contribution',
        'alalayang_agila_contribution' => 'Alalayang Agila Contribution',
        'project_contribution' => 'Project Contribution',
        'extra_contribution' => 'Extra Contribution',
    ];

    private const EXPENSE_CATEGORY_LABELS = [
        'administrative_expense' => 'Administrative Expense',
        'event_expense' => 'Event Expense',
        'project_expense' => 'Project Expense',
        'aid_expense' => 'Aid Expense',
        'reimbursement_expense' => 'Reimbursement Expense',
        'misc_expense' => 'Miscellaneous Expense',
    ];

    private function resolveActorMember(User $user): ?Member
    {
        $user->loadMissing('memberProfile');
        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        return Member::query()
            ->whereNull('user_id')
            ->whereRaw('LOWER(TRIM(email)) = ?', [$this->normalizeEmail((string) ($user->recovery_email ?: $user->email))])
            ->first();
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function resolveMemberIdentity(?int $memberId, ?string $memberEmail): ?Member
    {
        $resolvedById = $memberId ? Member::query()->find($memberId) : null;
        $resolvedByEmail = $memberEmail
            ? Member::query()->whereRaw('LOWER(TRIM(email)) = ?', [$this->normalizeEmail($memberEmail)])->first()
            : null;

        if ($resolvedById && $resolvedByEmail && $resolvedById->id !== $resolvedByEmail->id) {
            return null;
        }

        return $resolvedById ?? $resolvedByEmail;
    }

    private function categoryLabels(): array
    {
        return self::CATEGORY_LABELS;
    }

    private function expenseCategoryLabels(): array
    {
        return self::EXPENSE_CATEGORY_LABELS;
    }

    private function serializeFinanceAccount(?FinanceAccount $account): ?array
    {
        if (!$account) {
            return null;
        }

        return [
            'id' => $account->id,
            'code' => $account->code,
            'name' => $account->name,
            'account_type' => $account->account_type,
            'account_label' => $account->name,
        ];
    }

    private function canViewComplianceForAllMembers(User $user): bool
    {
        $user->loadMissing('role:id,name');
        $roleName = (string) ($user->role->name ?? '');

        return $roleName === RoleHierarchy::ADMIN
            || $roleName === RoleHierarchy::FINANCE_TREASURER
            || $user->finance_role === RoleHierarchy::FINANCE_TREASURER;
    }

    private function formatMemberName(Member $member): string
    {
        return trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name);
    }

    private function ensureMobileFinanceAccess(Request $request): ?Response
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

        $user->loadMissing('role:id,name');
        if ((string) ($user->role?->name ?? '') !== RoleHierarchy::MEMBER || !empty($user->finance_role)) {
            return response()->json([
                'message' => 'This mobile app is only available for personal member accounts.',
            ], 403);
        }

        if (!$user->hasPermission('finance.view')) {
            return response()->json([
                'message' => 'Forbidden',
            ], 403);
        }

        return null;
    }

    private function resolveEligiblePersonalMobileMember(Request $request): Member|Response
    {
        /** @var User $user */
        $user = $request->user();
        $user->loadMissing('role:id,name', 'memberProfile');

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

        if ((string) ($user->role?->name ?? '') !== RoleHierarchy::MEMBER || !empty($user->finance_role)) {
            return response()->json([
                'message' => 'This mobile app is only available for personal member accounts.',
            ], 403);
        }

        $member = $this->resolveActorMember($user);
        if (!$member) {
            return response()->json([
                'message' => 'This mobile app requires a linked member profile.',
            ], 403);
        }

        return $member;
    }

    private function contributionDataForMember(Member $member): array
    {
        $rows = Contribution::query()
            ->where('member_id', $member->id)
            ->with([
                'encodedBy:id,name',
                'beneficiaryMember:id,first_name,middle_name,last_name',
                'financeAccount:id,code,name,account_type',
                'reversals:id,reversal_of_contribution_id',
            ])
            ->latest('contribution_date')
            ->latest('encoded_at')
            ->latest('id')
            ->get();

        $totalAmount = 0.0;
        $categoryTotals = [];
        $monthlySummary = [];
        $yearlySummary = [];
        $labels = $this->categoryLabels();

        foreach (array_keys($labels) as $category) {
            $categoryTotals[$category] = 0.0;
        }

        $transformedRows = $rows->map(function (Contribution $row) use (&$totalAmount, &$categoryTotals, &$monthlySummary, &$yearlySummary, $labels) {
            $amount = (float) $row->amount;
            $category = $row->category ?: 'monthly_contribution';
            $date = $row->contribution_date ?? optional($row->encoded_at)?->toDateString();
            $dateObject = $date ? \Carbon\Carbon::parse($date) : now();
            $periodMonth = $dateObject->format('Y-m');
            $periodYear = $dateObject->format('Y');

            $totalAmount += $amount;
            if (!array_key_exists($category, $categoryTotals)) {
                $categoryTotals[$category] = 0.0;
            }
            $categoryTotals[$category] += $amount;

            if (!isset($monthlySummary[$periodMonth])) {
                $monthlySummary[$periodMonth] = [
                    'period' => $periodMonth,
                    'total_amount' => 0.0,
                    'categories' => array_fill_keys(array_keys($labels), 0.0),
                ];
            }
            $monthlySummary[$periodMonth]['total_amount'] += $amount;
            if (!array_key_exists($category, $monthlySummary[$periodMonth]['categories'])) {
                $monthlySummary[$periodMonth]['categories'][$category] = 0.0;
            }
            $monthlySummary[$periodMonth]['categories'][$category] += $amount;

            if (!isset($yearlySummary[$periodYear])) {
                $yearlySummary[$periodYear] = [
                    'period' => $periodYear,
                    'total_amount' => 0.0,
                    'categories' => array_fill_keys(array_keys($labels), 0.0),
                ];
            }
            $yearlySummary[$periodYear]['total_amount'] += $amount;
            if (!array_key_exists($category, $yearlySummary[$periodYear]['categories'])) {
                $yearlySummary[$periodYear]['categories'][$category] = 0.0;
            }
            $yearlySummary[$periodYear]['categories'][$category] += $amount;

            $beneficiaryName = null;
            if ($row->beneficiaryMember) {
                $beneficiaryName = $this->formatMemberName($row->beneficiaryMember);
            } elseif ($row->recipient_name) {
                $beneficiaryName = $row->recipient_name;
            }

            return [
                'id' => $row->id,
                'member_id' => $row->member_id,
                'amount' => $row->amount,
                'note' => $row->note,
                'category' => $category,
                'category_label' => $labels[$category] ?? Str::title(str_replace('_', ' ', $category)),
                'contribution_date' => $dateObject->toDateString(),
                'beneficiary_member_id' => $row->beneficiary_member_id,
                'recipient_name' => $row->recipient_name,
                'recipient_indicator' => $beneficiaryName,
                'finance_account' => $this->serializeFinanceAccount($row->financeAccount),
                'is_reversal' => $row->reversal_of_contribution_id !== null,
                'reversal_of_contribution_id' => $row->reversal_of_contribution_id,
                'reversed_by_entry_id' => $row->reversals->first()?->id,
                'encoded_at' => optional($row->encoded_at)?->toISOString(),
                'encoded_by' => $row->encodedBy ? ['id' => $row->encodedBy->id, 'name' => $row->encodedBy->name] : null,
            ];
        })->values();

        krsort($monthlySummary);
        krsort($yearlySummary);

        return [
            'member' => $member,
            'total_amount' => $totalAmount,
            'category_totals' => $categoryTotals,
            'category_labels' => $labels,
            'monthly_summary' => array_values($monthlySummary),
            'yearly_summary' => array_values($yearlySummary),
            'data' => $transformedRows,
        ];
    }

    public function searchMembers(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);
        $viewer = $request->user();

        $search = (string) $request->query('search', '');
        // Limit search string length to prevent performance issues
        $search = substr(trim($search), 0, 50);
        $query = Member::query()->with('user.role:id,name');

        if (BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($viewer)) {
            $query->whereRaw('LOWER(TRIM(COALESCE(email, ""))) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('member_number', 'like', "%{$search}%")
                    ->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query->orderBy('last_name')->orderBy('first_name')->limit(20)->get()
        );
    }

    public function complianceReport(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);
        /** @var User $actor */
        $actor = $request->user();

        $validated = $request->validate([
            'month' => 'required|date_format:Y-m',
            'years' => 'nullable|array',
            'years.*' => 'integer|min:2000|max:2100',
            'non_compliant_only' => 'nullable|in:true,false,1,0',
        ]);

        $month = (string) $validated['month'];
        $selectedYears = collect($validated['years'] ?? [])
            ->map(static fn ($year) => (int) $year)
            ->unique()
            ->values()
            ->all();
        $requiredMonthlyAmount = (float) config('finance.required_monthly_amount', 500);
        $nonCompliantOnly = isset($validated['non_compliant_only'])
            ? in_array((string) $validated['non_compliant_only'], ['1', 'true'], true)
            : true;

        $monthStart = Carbon::createFromFormat('Y-m', $month)->startOfMonth()->toDateString();
        $monthEnd = Carbon::createFromFormat('Y-m', $month)->endOfMonth()->toDateString();

        $members = Member::query()
            ->select(['id', 'member_number', 'first_name', 'middle_name', 'last_name', 'email'])
            ->when(BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($actor), function ($query) {
                $query->whereRaw('LOWER(TRIM(COALESCE(email, ""))) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
            })
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        if (!$this->canViewComplianceForAllMembers($actor)) {
            $actorMember = $this->resolveActorMember($actor);
            if (!$actorMember) {
                $members = collect();
            } else {
                $members = $members->where('id', $actorMember->id)->values();
            }
        }

        $monthlyStatsByMember = Contribution::query()
            ->selectRaw('member_id, COUNT(*) as monthly_entry_count, COALESCE(SUM(amount), 0) as monthly_total_amount')
            ->where('category', 'monthly_contribution')
            ->whereBetween('contribution_date', [$monthStart, $monthEnd])
            ->groupBy('member_id')
            ->get()
            ->keyBy('member_id');

        $driver = DB::connection()->getDriverName();
        $yearExpr = $driver === 'sqlite'
            ? "CAST(strftime('%Y', contribution_date) AS INTEGER)"
            : 'YEAR(contribution_date)';

        $availableYears = Contribution::query()
            ->selectRaw("{$yearExpr} as year")
            ->where('category', 'project_contribution')
            ->whereNotNull('contribution_date')
            ->groupByRaw($yearExpr)
            ->orderByRaw("{$yearExpr} DESC")
            ->pluck('year')
            ->map(static fn ($year) => (int) $year)
            ->values()
            ->all();

        $effectiveYears = !empty($selectedYears) ? $selectedYears : $availableYears;

        $projectByMemberYear = collect();
        if (!empty($effectiveYears)) {
            $projectByMemberYear = Contribution::query()
                ->selectRaw("member_id, {$yearExpr} as year")
                ->where('category', 'project_contribution')
                ->whereNotNull('contribution_date')
                ->whereRaw("{$yearExpr} in (" . implode(',', array_fill(0, count($effectiveYears), '?')) . ')', $effectiveYears)
                ->groupByRaw("member_id, {$yearExpr}")
                ->get()
                ->groupBy('member_id')
                ->map(function ($rows) {
                    return collect($rows)->pluck('year')->map(static fn ($year) => (int) $year)->unique()->values()->all();
                });
        }

        $rows = $members->map(function (Member $member) use ($actor, $month, $monthlyStatsByMember, $projectByMemberYear, $effectiveYears, $requiredMonthlyAmount) {
            $monthlyStats = $monthlyStatsByMember->get($member->id);
            $monthlyEntryCount = (int) ($monthlyStats->monthly_entry_count ?? 0);
            $monthlyTotalAmount = round((float) ($monthlyStats->monthly_total_amount ?? 0), 2);
            $hasMonthlyForMonth = $monthlyEntryCount > 0;
            $meetsRequiredMonthlyAmount = $monthlyTotalAmount >= $requiredMonthlyAmount;
            $memberProjectYears = collect($projectByMemberYear->get($member->id, []))
                ->map(static fn ($year) => (int) $year)
                ->all();
            $missingProjectYears = collect($effectiveYears)
                ->reject(fn ($year) => in_array((int) $year, $memberProjectYears, true))
                ->values()
                ->all();

            $projectCompliant = empty($effectiveYears) ? true : empty($missingProjectYears);
            $isNonCompliant = !$hasMonthlyForMonth || !$meetsRequiredMonthlyAmount || !$projectCompliant;

            return [
                'member' => [
                    'id' => $member->id,
                    'member_number' => $member->member_number,
                    'first_name' => $member->first_name,
                    'middle_name' => $member->middle_name,
                    'last_name' => $member->last_name,
                    'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($actor, $member->email),
                ],
                'month' => $month,
                'has_monthly_for_month' => $hasMonthlyForMonth,
                'monthly_entry_count' => $monthlyEntryCount,
                'monthly_total_amount' => $monthlyTotalAmount,
                'required_monthly_amount' => $requiredMonthlyAmount,
                'meets_required_monthly_amount' => $meetsRequiredMonthlyAmount,
                'selected_project_years' => $effectiveYears,
                'missing_project_years' => $missingProjectYears,
                'is_non_compliant' => $isNonCompliant,
            ];
        });

        if ($nonCompliantOnly) {
            $rows = $rows->where('is_non_compliant', true)->values();
        } else {
            $rows = $rows->values();
        }

        return response()->json([
            'filters' => [
                'month' => $month,
                'years' => $selectedYears,
                'effective_years' => $effectiveYears,
                'required_monthly_amount' => $requiredMonthlyAmount,
                'non_compliant_only' => $nonCompliantOnly,
            ],
            'available_project_years' => $availableYears,
            'data' => $rows,
        ]);
    }

    public function reportPreview(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user();
        $validated = $request->validate([
            'category' => 'required|in:monthly_contribution,alalayang_agila_contribution,project_contribution,extra_contribution',
            'finance_account_id' => 'nullable|integer|exists:finance_accounts,id',
            'search' => 'nullable|string|max:80',
            'year' => 'nullable|integer|min:2000|max:2100',
            'month' => 'nullable|digits:2|in:01,02,03,04,05,06,07,08,09,10,11,12',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'project_query' => 'nullable|string|max:80',
            'recipient_query' => 'nullable|string|max:80',
            'page' => 'nullable|integer|min:1',
        ]);

        $category = (string) $validated['category'];
        $search = Str::of((string) ($validated['search'] ?? ''))->trim()->value();
        $projectQuery = Str::of((string) ($validated['project_query'] ?? ''))->trim()->value();
        $recipientQuery = Str::of((string) ($validated['recipient_query'] ?? ''))->trim()->value();

        $query = Contribution::query()
            ->where('category', $category)
            ->with([
                'member:id,member_number,first_name,middle_name,last_name,email',
                'encodedBy:id,name',
                'beneficiaryMember:id,first_name,middle_name,last_name',
                'financeAccount:id,code,name,account_type',
                'reversals:id,reversal_of_contribution_id',
            ]);

        if (BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($actor)) {
            $query->where(function ($builder): void {
                $builder
                    ->whereNull('member_id')
                    ->orWhereHas('member', function ($memberQuery): void {
                        $memberQuery->whereRaw('LOWER(TRIM(COALESCE(email, ""))) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
                    });
            });
        }

        if (isset($validated['finance_account_id'])) {
            $query->where('finance_account_id', (int) $validated['finance_account_id']);
        }

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('note', 'like', "%{$search}%")
                    ->orWhere('recipient_name', 'like', "%{$search}%")
                    ->orWhereHas('member', function ($memberQuery) use ($search): void {
                        $memberQuery
                            ->where('member_number', 'like', "%{$search}%")
                            ->orWhere('first_name', 'like', "%{$search}%")
                            ->orWhere('middle_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        if (isset($validated['year'])) {
            $query->whereYear('contribution_date', (int) $validated['year']);
        }

        if (isset($validated['month'])) {
            $query->whereMonth('contribution_date', (string) $validated['month']);
        }

        if (!empty($validated['date_from'])) {
            $query->whereDate('contribution_date', '>=', (string) $validated['date_from']);
        }

        if (!empty($validated['date_to'])) {
            $query->whereDate('contribution_date', '<=', (string) $validated['date_to']);
        }

        if ($category === 'project_contribution' && $projectQuery !== '') {
            $query->where('note', 'like', "%{$projectQuery}%");
        }

        if ($category === 'alalayang_agila_contribution' && $recipientQuery !== '') {
            $query->where(function ($builder) use ($recipientQuery): void {
                $builder
                    ->where('recipient_name', 'like', "%{$recipientQuery}%")
                    ->orWhereHas('beneficiaryMember', function ($memberQuery) use ($recipientQuery): void {
                        $memberQuery
                            ->where('first_name', 'like', "%{$recipientQuery}%")
                            ->orWhere('middle_name', 'like', "%{$recipientQuery}%")
                            ->orWhere('last_name', 'like', "%{$recipientQuery}%");
                    });
            });
        }

        $totalAmount = (float) (clone $query)->sum('amount');
        $totalRecords = (int) (clone $query)->count();

        $rows = $query
            ->latest('contribution_date')
            ->latest('encoded_at')
            ->latest('id')
            ->paginate(10);

        $labels = $this->categoryLabels();

        $rows->setCollection(
            $rows->getCollection()->map(function (Contribution $row) use ($actor, $labels) {
                $member = $row->member;
                $beneficiaryName = null;
                if ($row->beneficiaryMember) {
                    $beneficiaryName = $this->formatMemberName($row->beneficiaryMember);
                } elseif ($row->recipient_name) {
                    $beneficiaryName = $row->recipient_name;
                }

                return [
                    'id' => $row->id,
                    'member' => $member ? [
                        'id' => $member->id,
                        'member_number' => $member->member_number,
                        'name' => $this->formatMemberName($member),
                        'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($actor, $member->email),
                    ] : null,
                    'amount' => (float) $row->amount,
                    'note' => $row->note,
                    'category' => $row->category,
                    'category_label' => $labels[$row->category] ?? $row->category,
                    'contribution_date' => optional($row->contribution_date)?->toDateString() ?? (string) $row->contribution_date,
                    'recipient_indicator' => $beneficiaryName,
                    'finance_account' => $this->serializeFinanceAccount($row->financeAccount),
                    'is_reversal' => $row->reversal_of_contribution_id !== null,
                    'reversed_by_entry_id' => $row->reversals->first()?->id,
                    'encoded_by' => $row->encodedBy ? ['id' => $row->encodedBy->id, 'name' => $row->encodedBy->name] : null,
                ];
            })
        );

        return response()->json([
            'filters' => [
                'category' => $category,
                'finance_account_id' => isset($validated['finance_account_id']) ? (int) $validated['finance_account_id'] : null,
                'search' => $search,
                'year' => $validated['year'] ?? null,
                'month' => $validated['month'] ?? null,
                'date_from' => $validated['date_from'] ?? null,
                'date_to' => $validated['date_to'] ?? null,
                'project_query' => $projectQuery !== '' ? $projectQuery : null,
                'recipient_query' => $recipientQuery !== '' ? $recipientQuery : null,
            ],
            'category_label' => $labels[$category] ?? $category,
            'total_amount' => $totalAmount,
            'total_records' => $totalRecords,
            'data' => $rows->items(),
            'current_page' => $rows->currentPage(),
            'last_page' => $rows->lastPage(),
        ]);
    }

    public function memberContributions(Request $request, Member $member)
    {
        $this->authorize('viewFinancialContributions', $member);

        return response()->json($this->contributionDataForMember($member));
    }

    public function myContributions(Request $request)
    {
        /** @var User $user */
        $user = $request->user();
        $member = $this->resolveActorMember($user);

        if (!$member) {
            return response()->json([
                'message' => 'No linked member profile found for this account.',
            ], 404);
        }

        return response()->json($this->contributionDataForMember($member));
    }

    public function mobileMyContributions(Request $request)
    {
        $member = $this->resolveEligiblePersonalMobileMember($request);
        if ($member instanceof Response) {
            return $member;
        }

        return response()->json($this->contributionDataForMember($member));
    }

    public function mobileDashboard(Request $request)
    {
        if ($response = $this->ensureMobileFinanceAccess($request)) {
            return $response;
        }

        $monthStart = now()->startOfMonth()->toDateString();
        $monthEnd = now()->endOfMonth()->toDateString();

        $collectionsThisMonth = (float) Contribution::query()
            ->whereBetween('contribution_date', [$monthStart, $monthEnd])
            ->sum('amount');

        $expensesThisMonth = (float) \App\Models\Expense::query()
            ->whereBetween('expense_date', [$monthStart, $monthEnd])
            ->sum('amount');

        $latestContributions = Contribution::query()
            ->with(['member:id,member_number,first_name,middle_name,last_name', 'financeAccount:id,code,name,account_type'])
            ->latest('contribution_date')
            ->latest('encoded_at')
            ->latest('id')
            ->limit(5)
            ->get()
            ->map(function (Contribution $row) {
                return [
                    'id' => $row->id,
                    'type' => 'contribution',
                    'amount' => (float) $row->amount,
                    'date' => optional($row->contribution_date)?->toDateString(),
                    'category' => $row->category,
                    'member' => $row->member ? [
                        'id' => $row->member->id,
                        'member_number' => $row->member->member_number,
                        'name' => $this->formatMemberName($row->member),
                    ] : null,
                    'finance_account' => $this->serializeFinanceAccount($row->financeAccount),
                ];
            });

        $latestExpenses = \App\Models\Expense::query()
            ->with(['financeAccount:id,code,name,account_type'])
            ->latest('expense_date')
            ->latest('encoded_at')
            ->latest('id')
            ->limit(5)
            ->get()
            ->map(function (\App\Models\Expense $row) {
                return [
                    'id' => $row->id,
                    'type' => 'expense',
                    'amount' => (float) $row->amount,
                    'date' => optional($row->expense_date)?->toDateString(),
                    'category' => $row->category,
                    'payee_name' => $row->payee_name,
                    'finance_account' => $row->financeAccount ? $this->serializeFinanceAccount($row->financeAccount) : null,
                ];
            });

        $latestTransactions = $latestContributions
            ->concat($latestExpenses)
            ->sortByDesc('date')
            ->take(8)
            ->values();

        $accountBalances = app(FinanceExpenseController::class)->accountBalances($request)->getData(true);
        $complianceRequest = new Request([
            'month' => now()->format('Y-m'),
            'non_compliant_only' => 'true',
        ]);
        $complianceRequest->setUserResolver(fn () => $request->user());
        $compliance = $this->complianceReport($complianceRequest)->getData(true);

        return response()->json([
            'period' => [
                'month' => now()->format('Y-m'),
                'month_start' => $monthStart,
                'month_end' => $monthEnd,
            ],
            'totals' => [
                'collections_this_month' => round($collectionsThisMonth, 2),
                'expenses_this_month' => round($expensesThisMonth, 2),
            ],
            'account_balances' => $accountBalances['data'] ?? [],
            'unassigned_contribution_total' => $accountBalances['unassigned_contribution_total'] ?? 0,
            'compliance' => [
                'filters' => $compliance['filters'] ?? null,
                'available_project_years' => $compliance['available_project_years'] ?? [],
                'non_compliant_members' => $compliance['data'] ?? [],
            ],
            'latest_transactions' => $latestTransactions,
        ]);
    }

    public function mobileMembers(Request $request)
    {
        if ($response = $this->ensureMobileFinanceAccess($request)) {
            return $response;
        }

        return $this->searchMembers($request);
    }

    public function mobileMemberSummary(Request $request, Member $member)
    {
        if ($response = $this->ensureMobileFinanceAccess($request)) {
            return $response;
        }

        $this->authorize('viewFinancialContributions', $member);

        $payload = $this->contributionDataForMember($member);

        return response()->json([
            'member' => [
                'id' => $member->id,
                'member_number' => $member->member_number,
                'name' => $this->formatMemberName($member),
                'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($request->user(), $member->email),
            ],
            'total_amount' => $payload['total_amount'],
            'category_totals' => $payload['category_totals'],
            'category_labels' => $payload['category_labels'],
            'monthly_summary' => $payload['monthly_summary'],
            'yearly_summary' => $payload['yearly_summary'],
            'latest_entries' => collect($payload['data'])->take(10)->values(),
        ]);
    }

    public function mobileMemberContributions(Request $request, Member $member)
    {
        if ($response = $this->ensureMobileFinanceAccess($request)) {
            return $response;
        }

        return $this->memberContributions($request, $member);
    }

    public function mobileStoreContribution(Request $request)
    {
        if ($response = $this->ensureMobileFinanceAccess($request)) {
            return $response;
        }

        if (!$request->user()->hasPermission('finance.input')) {
            return response()->json([
                'message' => 'Forbidden',
            ], 403);
        }

        return $this->storeContribution($request);
    }

    public function storeContribution(Request $request)
    {
        $validated = $request->validate([
            'member_id' => 'nullable|integer|exists:members,id|required_without:member_email',
            'member_email' => 'nullable|email|max:255|required_without:member_id',
            'amount' => 'required|numeric|min:0.01',
            'note' => 'required|string|max:255',
            'category' => 'required|in:monthly_contribution,alalayang_agila_contribution,project_contribution,extra_contribution',
            'contribution_date' => 'nullable|date',
            'beneficiary_member_id' => 'nullable|integer|exists:members,id',
            'beneficiary_member_email' => 'nullable|email|max:255',
            'recipient_name' => 'nullable|string|max:255',
            'finance_account_id' => 'required|integer|exists:finance_accounts,id',
        ]);

        $member = $this->resolveMemberIdentity(
            isset($validated['member_id']) ? (int) $validated['member_id'] : null,
            $validated['member_email'] ?? null,
        );
        if (!$member) {
            return response()->json([
                'message' => 'Member identity mismatch. Ensure member ID and email refer to the same record.',
            ], 422);
        }

        $beneficiary = $this->resolveMemberIdentity(
            isset($validated['beneficiary_member_id']) ? (int) $validated['beneficiary_member_id'] : null,
            $validated['beneficiary_member_email'] ?? null,
        );
        if (($validated['beneficiary_member_id'] ?? null) || ($validated['beneficiary_member_email'] ?? null)) {
            if (!$beneficiary) {
                return response()->json([
                    'message' => 'Beneficiary identity mismatch. Ensure beneficiary ID and email refer to the same record.',
                ], 422);
            }
        }

        if (
            $validated['category'] === 'alalayang_agila_contribution' &&
            empty($validated['beneficiary_member_id']) &&
            empty($validated['recipient_name'])
        ) {
            return response()->json([
                'message' => 'Alalayang Agila contribution requires a recipient indicator.',
            ], 422);
        }

        $recipientName = isset($validated['recipient_name']) ? TextCase::title($validated['recipient_name']) : null;
        if ($beneficiary && empty($recipientName)) {
            $recipientName = $this->formatMemberName($beneficiary);
        }

        $created = Contribution::query()->create([
            'member_id' => $member->id,
            'category' => $validated['category'],
            'contribution_date' => $validated['contribution_date'] ?? now()->toDateString(),
            'amount' => $validated['amount'],
            'note' => TextCase::title($validated['note']),
            'beneficiary_member_id' => $beneficiary?->id,
            'recipient_name' => $recipientName,
            'finance_account_id' => (int) $validated['finance_account_id'],
            'encoded_by_user_id' => $request->user()->id,
            'encoded_at' => now(),
        ]);

        return response()->json($created->load(['encodedBy:id,name', 'beneficiaryMember:id,first_name,middle_name,last_name', 'financeAccount:id,code,name,account_type']), 201);
    }

    public function reverseContribution(Request $request, Contribution $contribution)
    {
        $this->authorize('reverse', $contribution);

        $validated = $request->validate([
            'remarks' => 'required|string|max:255',
            'contribution_date' => 'nullable|date',
            'finance_account_id' => 'required|integer|exists:finance_accounts,id',
        ]);

        if ($contribution->reversal_of_contribution_id !== null) {
            return response()->json([
                'message' => 'A reversal entry cannot be reversed again.',
            ], 422);
        }

        $contribution->loadMissing('reversals:id,reversal_of_contribution_id');
        if ($contribution->reversals->isNotEmpty()) {
            return response()->json([
                'message' => 'This contribution already has a reversal entry.',
            ], 422);
        }

        if ($contribution->finance_account_id !== null && (int) $validated['finance_account_id'] !== (int) $contribution->finance_account_id) {
            return response()->json([
                'message' => 'Reversal must use the same finance account as the original contribution.',
            ], 422);
        }

        $created = Contribution::query()->create([
            'member_id' => $contribution->member_id,
            'category' => $contribution->category,
            'contribution_date' => $validated['contribution_date'] ?? now()->toDateString(),
            'amount' => round(((float) $contribution->amount) * -1, 2),
            'note' => TextCase::title($validated['remarks']),
            'beneficiary_member_id' => $contribution->beneficiary_member_id,
            'recipient_name' => $contribution->recipient_name,
            'finance_account_id' => (int) $validated['finance_account_id'],
            'reversal_of_contribution_id' => $contribution->id,
            'encoded_by_user_id' => $request->user()->id,
            'encoded_at' => now(),
        ]);

        Log::info('finance.contribution_reversed', [
            'actor_user_id' => $request->user()->id,
            'contribution_id' => $contribution->id,
            'reversal_contribution_id' => $created->id,
            'remarks' => $created->note,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Reversal entry recorded. The original amount is now offset in totals.',
            'contribution' => $created->load(['encodedBy:id,name', 'beneficiaryMember:id,first_name,middle_name,last_name', 'financeAccount:id,code,name,account_type']),
        ], 201);
    }
}
