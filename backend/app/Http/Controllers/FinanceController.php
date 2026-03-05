<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\ContributionEditRequest;
use App\Models\Member;
use App\Models\Post;
use App\Models\User;
use App\Support\RoleHierarchy;
use App\Support\TextCase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class FinanceController extends Controller
{
    private const CATEGORY_LABELS = [
        'monthly_contribution' => 'Monthly Contribution',
        'alalayang_agila_contribution' => 'Alalayang Agila Contribution',
        'project_contribution' => 'Project Contribution',
        'extra_contribution' => 'Extra Contribution',
    ];

    private function resolveActorMember(User $user): ?Member
    {
        $user->loadMissing('memberProfile');
        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        return Member::query()->where('email', $user->email)->first();
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

    private function contributionDataForMember(Member $member): array
    {
        $rows = Contribution::query()
            ->where('member_id', $member->id)
            ->with([
                'encodedBy:id,name',
                'beneficiaryMember:id,first_name,middle_name,last_name',
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

    private function uniquePostSlug(string $base): string
    {
        $slug = $base !== '' ? $base : Str::random(8);
        $candidate = $slug;
        $i = 2;

        while (Post::query()->where('slug', $candidate)->exists()) {
            $candidate = $slug . '-' . $i;
            $i++;
        }

        return $candidate;
    }

    private function publishExtraContributionNews(Contribution $contribution, User $actor): void
    {
        $contribution->loadMissing('member:id,member_number,first_name,middle_name,last_name');
        $member = $contribution->member;
        if (!$member) {
            return;
        }

        $memberName = $this->formatMemberName($member);
        $title = sprintf(
            'Extra Contribution Received: %s (%s)',
            $memberName,
            number_format((float) $contribution->amount, 2)
        );

        $content = sprintf(
            "An extra contribution was recorded to support fraternity initiatives.\n\nMember: %s\nMember No.: %s\nAmount: PHP %s\nDate: %s\n\nThank you for supporting the projects and programs.",
            $memberName,
            $member->member_number,
            number_format((float) $contribution->amount, 2),
            optional($contribution->contribution_date)->toDateString() ?? now()->toDateString()
        );

        Post::query()->create([
            'title' => $title,
            'slug' => $this->uniquePostSlug(Str::slug($title)),
            'section' => 'news',
            'excerpt' => 'Extra contribution update to encourage member participation.',
            'content' => $content,
            'status' => 'published',
            'published_at' => now(),
            'author_id' => $actor->id,
            'is_featured' => false,
        ]);
    }

    public function searchMembers(Request $request)
    {
        $this->authorize('viewFinanceDirectory', Member::class);

        $search = (string) $request->query('search', '');
        // Limit search string length to prevent performance issues
        $search = substr(trim($search), 0, 50);
        $query = Member::query()->with('user.role:id,name');

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
        $nonCompliantOnly = isset($validated['non_compliant_only'])
            ? in_array((string) $validated['non_compliant_only'], ['1', 'true'], true)
            : true;

        $monthStart = Carbon::createFromFormat('Y-m', $month)->startOfMonth()->toDateString();
        $monthEnd = Carbon::createFromFormat('Y-m', $month)->endOfMonth()->toDateString();

        $members = Member::query()
            ->select(['id', 'member_number', 'first_name', 'middle_name', 'last_name', 'email'])
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

        $monthlyCompliantMemberIds = Contribution::query()
            ->where('category', 'monthly_contribution')
            ->whereBetween('contribution_date', [$monthStart, $monthEnd])
            ->pluck('member_id')
            ->unique()
            ->values();
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

        $rows = $members->map(function (Member $member) use ($month, $monthlyCompliantMemberIds, $monthlyStatsByMember, $projectByMemberYear, $effectiveYears) {
            $hasMonthlyForMonth = $monthlyCompliantMemberIds->contains($member->id);
            $monthlyStats = $monthlyStatsByMember->get($member->id);
            $memberProjectYears = collect($projectByMemberYear->get($member->id, []))
                ->map(static fn ($year) => (int) $year)
                ->all();
            $missingProjectYears = collect($effectiveYears)
                ->reject(fn ($year) => in_array((int) $year, $memberProjectYears, true))
                ->values()
                ->all();

            $projectCompliant = empty($effectiveYears) ? true : empty($missingProjectYears);
            $isNonCompliant = !$hasMonthlyForMonth || !$projectCompliant;

            return [
                'member' => [
                    'id' => $member->id,
                    'member_number' => $member->member_number,
                    'first_name' => $member->first_name,
                    'middle_name' => $member->middle_name,
                    'last_name' => $member->last_name,
                    'email' => $member->email,
                ],
                'month' => $month,
                'has_monthly_for_month' => $hasMonthlyForMonth,
                'monthly_entry_count' => (int) ($monthlyStats->monthly_entry_count ?? 0),
                'monthly_total_amount' => (float) ($monthlyStats->monthly_total_amount ?? 0),
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
                'non_compliant_only' => $nonCompliantOnly,
            ],
            'available_project_years' => $availableYears,
            'data' => $rows,
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

    public function storeContribution(Request $request)
    {
        $validated = $request->validate([
            'member_id' => 'nullable|integer|exists:members,id|required_without:member_email',
            'member_email' => 'nullable|email|max:255|required_without:member_id',
            'amount' => 'required|numeric|min:0.01',
            'note' => 'nullable|string|max:255',
            'category' => 'required|in:monthly_contribution,alalayang_agila_contribution,project_contribution,extra_contribution',
            'contribution_date' => 'nullable|date',
            'beneficiary_member_id' => 'nullable|integer|exists:members,id',
            'beneficiary_member_email' => 'nullable|email|max:255',
            'recipient_name' => 'nullable|string|max:255',
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
            'note' => isset($validated['note']) ? TextCase::title($validated['note']) : null,
            'beneficiary_member_id' => $beneficiary?->id,
            'recipient_name' => $recipientName,
            'encoded_by_user_id' => $request->user()->id,
            'encoded_at' => now(),
        ]);

        if ($created->category === 'extra_contribution') {
            $this->publishExtraContributionNews($created, $request->user());
        }

        return response()->json($created->load(['encodedBy:id,name', 'beneficiaryMember:id,first_name,middle_name,last_name']), 201);
    }

    public function requestContributionEdit(Request $request, Contribution $contribution)
    {
        $this->authorize('requestEdit', $contribution);

        $validated = $request->validate([
            'requested_amount' => 'required|numeric|min:0.01',
            'reason' => 'required|string|max:255',
        ]);

        $pending = ContributionEditRequest::query()
            ->where('contribution_id', $contribution->id)
            ->where('status', 'pending')
            ->exists();

        if ($pending) {
            return response()->json([
                'message' => 'There is already a pending edit request for this contribution.',
            ], 422);
        }

        $created = ContributionEditRequest::query()->create([
            'contribution_id' => $contribution->id,
            'requested_amount' => $validated['requested_amount'],
            'reason' => $validated['reason'],
            'requested_by_user_id' => $request->user()->id,
            'status' => 'pending',
        ]);

        return response()->json($created, 201);
    }

    public function editRequests(Request $request)
    {
        $this->authorize('viewEditRequests', ContributionEditRequest::class);

        $status = (string) $request->query('status', 'pending');
        $allowed = ['pending', 'approved', 'rejected'];
        if (!in_array($status, $allowed, true)) {
            $status = 'pending';
        }

        $rows = ContributionEditRequest::query()
            ->with([
                'requestedBy:id,name',
                'reviewedBy:id,name',
                'contribution.member:id,member_number,first_name,middle_name,last_name',
            ])
            ->where('status', $status)
            ->latest('id')
            ->paginate(20);

        return response()->json($rows);
    }

    public function approveEditRequest(Request $request, ContributionEditRequest $contributionEditRequest)
    {
        $this->authorize('approve', $contributionEditRequest);

        if ($contributionEditRequest->status !== 'pending') {
            return response()->json(['message' => 'Edit request is already reviewed.'], 422);
        }

        $contribution = $contributionEditRequest->contribution;
        $contribution->amount = $contributionEditRequest->requested_amount;
        $contribution->save();

        $contributionEditRequest->status = 'approved';
        $contributionEditRequest->reviewed_by_user_id = $request->user()->id;
        $contributionEditRequest->reviewed_at = now();
        $contributionEditRequest->review_notes = null;
        $contributionEditRequest->save();

        Log::info('finance.edit_request_approved', [
            'actor_user_id' => $request->user()->id,
            'request_id' => $contributionEditRequest->id,
            'contribution_id' => $contribution->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Contribution edit request approved.',
            'request' => $contributionEditRequest->fresh(),
            'contribution' => $contribution->fresh(),
        ]);
    }

    public function rejectEditRequest(Request $request, ContributionEditRequest $contributionEditRequest)
    {
        $this->authorize('reject', $contributionEditRequest);

        if ($contributionEditRequest->status !== 'pending') {
            return response()->json(['message' => 'Edit request is already reviewed.'], 422);
        }

        $validated = $request->validate([
            'review_notes' => 'nullable|string|max:255',
        ]);

        $contributionEditRequest->status = 'rejected';
        $contributionEditRequest->reviewed_by_user_id = $request->user()->id;
        $contributionEditRequest->reviewed_at = now();
        $contributionEditRequest->review_notes = $validated['review_notes'] ?? null;
        $contributionEditRequest->save();

        Log::info('finance.edit_request_rejected', [
            'actor_user_id' => $request->user()->id,
            'request_id' => $contributionEditRequest->id,
            'contribution_id' => $contributionEditRequest->contribution_id,
            'review_notes' => $contributionEditRequest->review_notes,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Contribution edit request rejected.',
            'request' => $contributionEditRequest->fresh(),
        ]);
    }
}
