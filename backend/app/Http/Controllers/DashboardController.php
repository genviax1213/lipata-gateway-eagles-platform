<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\User;
use Illuminate\Http\Request;

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

        if ($application && $user->hasPermission('applications.dashboard.view')) {
            return response()->json([
                'view' => 'applicant',
                'can_upload_documents' => $user->hasPermission('applications.docs.upload'),
                'can_review_applications' => optional($user->role)->name === 'membership_chairman',
                'can_set_fee' => $user->hasPermission('applications.fee.set'),
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

    private function resolveActorMember(User $user): ?Member
    {
        $user->loadMissing('memberProfile');
        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        return Member::query()->where('email', $user->email)->first();
    }
}
