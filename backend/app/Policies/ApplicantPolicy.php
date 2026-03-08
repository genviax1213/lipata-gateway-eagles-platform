<?php

namespace App\Policies;

use App\Models\Applicant;
use App\Models\User;
use App\Support\Permissions;
use App\Support\RoleHierarchy;

class ApplicantPolicy
{
    public function uploadDocument(User $user, Applicant $applicant): bool
    {
        if (!$user->hasPermission('applications.docs.upload')) {
            return false;
        }

        if ($applicant->user_id === $user->id) {
            return true;
        }

        return strtolower(trim((string) $applicant->email)) === strtolower(trim((string) $user->email));
    }

    public function setStage(User $user, Applicant $applicant): bool
    {
        return $user->hasPermission('applications.stage.set');
    }

    public function setNotice(User $user, Applicant $applicant): bool
    {
        return $user->hasPermission('applications.notice.set');
    }

    public function setFeeRequirement(User $user, Applicant $applicant): bool
    {
        return $user->hasPermission('applications.fee.set');
    }

    public function recordFeePayment(User $user, Applicant $applicant): bool
    {
        if ($user->hasPermission(Permissions::APPLICATIONS_FEE_PAY)) {
            return true;
        }

        $applicant->loadMissing('batch');

        return $applicant->batch !== null
            && (int) $applicant->batch->batch_treasurer_user_id === (int) $user->id;
    }

    public function reviewDecision(User $user, Applicant $applicant): bool
    {
        return $user->hasPermission('applications.review');
    }

    public function delete(User $user, Applicant $applicant): bool
    {
        return (string) optional($user->role)->name === RoleHierarchy::SUPERADMIN;
    }
}
