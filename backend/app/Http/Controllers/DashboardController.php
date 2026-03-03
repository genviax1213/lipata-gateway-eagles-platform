<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\ApplicationFeePayment;
use App\Models\ApplicationFeeRequirement;
use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\User;
use App\Support\RoleHierarchy;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function me(Request $request)
    {
        /** @var User $user */
        $user = $request->user()->loadMissing('role.permissions:id,name');

        $application = MemberApplication::query()
            ->where('user_id', $user->id)
            ->orWhereRaw('LOWER(TRIM(email)) = ?', [strtolower(trim((string) $user->email))])
            ->latest('id')
            ->first();

        if ($application && $user->hasPermission(Permissions::APPLICATIONS_DASHBOARD_VIEW)) {
            return response()->json([
                'view' => 'applicant',
                'can_upload_documents' => $user->hasPermission(Permissions::APPLICATIONS_DOCS_UPLOAD),
                'can_review_applications' => RoleHierarchy::canReviewApplications(optional($user->role)->name ?? ''),
                'can_set_fee' => $user->hasPermission(Permissions::APPLICATIONS_FEE_SET),
                'application' => [
                    'id' => $application->id,
                    'status' => $application->status,
                    'decision_status' => $application->decision_status,
                    'current_stage' => $application->current_stage,
                ],
            ]);
        }

        $member = $this->resolveActorMember($user);
        if (!$member) {
            return response()->json([
                'view' => 'general',
                'message' => 'No linked member profile found.',
            ]);
        }

        $rows = Contribution::query()
            ->where('member_id', $member->id)
            ->with(['encodedBy:id,name', 'beneficiaryMember:id,first_name,middle_name,last_name'])
            ->latest('contribution_date')
            ->latest('encoded_at')
            ->latest('id')
            ->get()
            ->map(function (Contribution $row) {
                return [
                    'id' => $row->id,
                    'amount' => $row->amount,
                    'category' => $row->category,
                    'contribution_date' => optional($row->contribution_date)?->toDateString(),
                    'recipient_name' => $row->recipient_name,
                ];
            });

        return response()->json([
            'view' => 'member',
            'member' => [
                'id' => $member->id,
                'member_number' => $member->member_number,
                'first_name' => $member->first_name,
                'middle_name' => $member->middle_name,
                'last_name' => $member->last_name,
            ],
            'contributions' => $rows,
        ]);
    }

    public function treasurer(Request $request)
    {
        /** @var User $user */
        $user = $request->user()->loadMissing('role.permissions:id,name');

        $today = Carbon::today();
        $monthStart = $today->copy()->startOfMonth();
        $monthEnd = $today->copy()->endOfMonth();
        $yearStart = $today->copy()->startOfYear();
        $yearEnd = $today->copy()->endOfYear();

        $contributionSummary = [
            'today' => [
                'count' => Contribution::query()->whereDate('contribution_date', $today)->count(),
                'total_amount' => (float) Contribution::query()->whereDate('contribution_date', $today)->sum('amount'),
            ],
            'month' => [
                'count' => Contribution::query()->whereBetween('contribution_date', [$monthStart->toDateString(), $monthEnd->toDateString()])->count(),
                'total_amount' => (float) Contribution::query()->whereBetween('contribution_date', [$monthStart->toDateString(), $monthEnd->toDateString()])->sum('amount'),
            ],
            'year' => [
                'count' => Contribution::query()->whereBetween('contribution_date', [$yearStart->toDateString(), $yearEnd->toDateString()])->count(),
                'total_amount' => (float) Contribution::query()->whereBetween('contribution_date', [$yearStart->toDateString(), $yearEnd->toDateString()])->sum('amount'),
            ],
        ];

        $categoryTotals = Contribution::query()
            ->selectRaw('category, SUM(amount) as total_amount')
            ->groupBy('category')
            ->get()
            ->mapWithKeys(fn ($row) => [(string) $row->category => (float) $row->total_amount])
            ->all();

        $applications = MemberApplication::query()
            ->with('feeRequirements.payments')
            ->whereIn('status', ['pending_approval', 'approved'])
            ->latest('id')
            ->get();

        $applicantsWithBalance = $applications->map(function (MemberApplication $application) {
            $required = (float) $application->feeRequirements->sum('required_amount');
            $paid = (float) $application->feeRequirements->flatMap->payments->sum('amount');
            $balance = max($required - $paid, 0.0);

            return [
                'id' => $application->id,
                'full_name' => trim($application->first_name . ' ' . ($application->middle_name ? $application->middle_name . ' ' : '') . $application->last_name),
                'email' => $application->email,
                'status' => $application->status,
                'decision_status' => $application->decision_status,
                'required_total' => $required,
                'paid_total' => $paid,
                'balance' => $balance,
            ];
        })
            ->filter(fn (array $row) => $row['required_total'] > 0 || $row['paid_total'] > 0)
            ->sortByDesc('balance')
            ->values();

        $requiredTotal = (float) ApplicationFeeRequirement::query()
            ->whereHas('application', fn ($query) => $query->whereIn('status', ['pending_approval', 'approved']))
            ->sum('required_amount');

        $paidTotal = (float) ApplicationFeePayment::query()
            ->whereHas('requirement.application', fn ($query) => $query->whereIn('status', ['pending_approval', 'approved']))
            ->sum('amount');

        return response()->json([
            'generated_at' => now()->toISOString(),
            'contributions' => [
                'summary' => $contributionSummary,
                'category_totals' => $categoryTotals,
            ],
            'application_fees' => [
                'required_total' => $requiredTotal,
                'paid_total' => $paidTotal,
                'balance_total' => max($requiredTotal - $paidTotal, 0.0),
                'active_applicant_count' => $applications->count(),
                'with_balance_count' => $applicantsWithBalance->where('balance', '>', 0)->count(),
                'applicants' => $applicantsWithBalance->take(20)->all(),
            ],
        ]);
    }

    private function resolveActorMember(User $user): ?Member
    {
        $user->loadMissing('memberProfile');
        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        return Member::query()->where('email', $user->email)->first();
    }
}
