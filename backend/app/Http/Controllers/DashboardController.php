<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\ApplicantBatch;
use App\Models\Member;
use App\Models\Applicant;
use App\Models\User;
use App\Support\RoleHierarchy;
use App\Support\Permissions;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function me(Request $request)
    {
        /** @var User $user */
        $user = $request->user()->loadMissing('role.permissions:id,name');

        $application = Applicant::query()
            ->ownedByUser($user)
            ->latest('id')
            ->first();
        $applicationArchiveAvailable = $application
            && in_array($application->status, Applicant::ARCHIVED_STATUSES, true);
        $hasOpenApplication = $application
            && in_array($application->status, Applicant::OPEN_STATUSES, true);
        $canManageBatchApplicantContributions = ApplicantBatch::query()
            ->where('batch_treasurer_user_id', $user->id)
            ->exists();

        if ($hasOpenApplication && $user->hasPermission(Permissions::APPLICATIONS_DASHBOARD_VIEW)) {
            return response()->json([
                'view' => 'applicant',
                'can_upload_documents' => $user->hasPermission(Permissions::APPLICATIONS_DOCS_UPLOAD),
                'can_review_applications' => RoleHierarchy::canReviewApplications(optional($user->role)->name ?? ''),
                'can_set_fee' => $user->hasPermission(Permissions::APPLICATIONS_FEE_SET),
                'can_manage_batch_applicant_contributions' => $canManageBatchApplicantContributions,
                'application' => [
                    'id' => $application->id,
                    'member_id' => $application->member_id,
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
                'application_archive_available' => $applicationArchiveAvailable,
                'can_manage_batch_applicant_contributions' => $canManageBatchApplicantContributions,
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
            'application_archive_available' => $applicationArchiveAvailable,
            'can_manage_batch_applicant_contributions' => $canManageBatchApplicantContributions,
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

    private function resolveActorMember(User $user): ?Member
    {
        $user->loadMissing('memberProfile');
        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        return Member::query()->where('email', $user->email)->first();
    }
}
