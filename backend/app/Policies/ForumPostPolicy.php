<?php

namespace App\Policies;

use App\Models\ForumPost;
use App\Models\User;

class ForumPostPolicy
{
    public function setVisibility(User $user, ForumPost $post): bool
    {
        return $user->hasPermission('forum.moderate');
    }

    public function delete(User $user, ForumPost $post): bool
    {
        return $user->hasPermission('forum.moderate');
    }
}
