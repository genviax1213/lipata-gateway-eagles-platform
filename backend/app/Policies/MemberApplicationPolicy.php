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
}
