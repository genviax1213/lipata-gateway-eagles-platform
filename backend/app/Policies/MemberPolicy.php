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

    public function manageOwnProfile(User $user, Member $member): bool
    {
        $roleName = (string) optional($user->role)->name;
        if (in_array($roleName, ['superadmin', 'admin'], true)) {
            return false;
        }

        if ($user->memberProfile?->id === $member->id) {
            return true;
        }

        return strtolower(trim((string) $member->email)) !== ''
            && strtolower(trim((string) $member->email)) === strtolower(trim((string) $user->email));
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
