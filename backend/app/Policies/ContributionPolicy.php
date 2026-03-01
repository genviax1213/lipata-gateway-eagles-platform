<?php

namespace App\Policies;

use App\Models\Contribution;
use App\Models\User;

class ContributionPolicy
{
    public function requestEdit(User $user, Contribution $contribution): bool
    {
        return $user->hasPermission('finance.request_edit');
    }
}
