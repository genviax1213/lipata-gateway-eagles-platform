<?php

namespace App\Policies;

use App\Models\ContributionEditRequest;
use App\Models\User;

class ContributionEditRequestPolicy
{
    public function viewEditRequests(User $user): bool
    {
        return $user->hasPermission('finance.approve_edits');
    }

    public function approve(User $user, ContributionEditRequest $contributionEditRequest): bool
    {
        return $user->hasPermission('finance.approve_edits');
    }

    public function reject(User $user, ContributionEditRequest $contributionEditRequest): bool
    {
        return $user->hasPermission('finance.approve_edits');
    }
}
