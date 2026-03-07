<?php

namespace App\Policies;

use App\Models\MemberApplication;
use App\Models\User;

class MemberApplicationPolicy
{
    public function uploadDocument(User $user, MemberApplication $memberApplication): bool
    {
        if (!$user->hasPermission('applications.docs.upload')) {
            return false;
        }

        if ($memberApplication->user_id === $user->id) {
            return true;
        }

        return strtolower(trim((string) $memberApplication->email)) === strtolower(trim((string) $user->email));
    }

    public function setStage(User $user, MemberApplication $memberApplication): bool
    {
        return $user->hasPermission('applications.stage.set');
    }

    public function setNotice(User $user, MemberApplication $memberApplication): bool
    {
        return $user->hasPermission('applications.notice.set');
    }

    public function setFeeRequirement(User $user, MemberApplication $memberApplication): bool
    {
        return $user->hasPermission('applications.fee.set');
    }

    public function recordFeePayment(User $user, MemberApplication $memberApplication): bool
    {
        return $user->hasPermission('applications.fee.pay');
    }

    public function reviewDecision(User $user, MemberApplication $memberApplication): bool
    {
        return $user->hasPermission('applications.review');
    }
}
