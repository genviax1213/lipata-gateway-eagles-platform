<?php

namespace App\Policies;

use App\Models\Member;
use App\Models\User;

class MemberPolicy
{
    public function viewMemberDirectory(User $user): bool
    {
        return $user->hasPermission('members.view');
    }

    public function viewFinanceDirectory(User $user): bool
    {
        return $user->hasPermission('finance.view');
    }

    public function viewFinancialContributions(User $user, Member $member): bool
    {
        // Allow if user is viewing their own member profile OR has explicit permission
        if ($user->memberProfile?->id === $member->id) {
            return true;
        }
        return $user->hasPermission('finance.view');
    }
}
