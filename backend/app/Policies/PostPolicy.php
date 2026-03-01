<?php

namespace App\Policies;

use App\Models\User;

class PostPolicy
{
    public function viewCmsIndex(User $user): bool
    {
        return $user->hasPermission('posts.create');
    }
}
