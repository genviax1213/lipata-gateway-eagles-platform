<?php

namespace App\Policies;

use App\Models\User;

class PostPolicy
{
    public function viewCmsIndex(User $user): bool
    {
        return $user->hasPermission('posts.create')
            || $user->hasPermission('posts.update')
            || $user->hasPermission('posts.delete');
    }
}
