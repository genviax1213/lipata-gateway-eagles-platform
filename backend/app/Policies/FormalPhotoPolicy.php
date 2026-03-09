<?php

namespace App\Policies;

use App\Models\FormalPhoto;
use App\Models\User;
use App\Support\Permissions;

class FormalPhotoPolicy
{
    public function view(User $user, FormalPhoto $formalPhoto): bool
    {
        if ((int) $formalPhoto->user_id === (int) $user->id) {
            return true;
        }

        return $user->hasPermission(Permissions::FORMAL_PHOTOS_VIEW_PRIVATE);
    }
}
