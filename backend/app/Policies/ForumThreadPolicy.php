<?php

namespace App\Policies;

use App\Models\ForumThread;
use App\Models\User;

class ForumThreadPolicy
{
    public function viewHiddenPosts(User $user, ForumThread $thread): bool
    {
        return $user->hasPermission('forum.moderate');
    }

    public function setLock(User $user, ForumThread $thread): bool
    {
        return $user->hasPermission('forum.moderate');
    }

    public function delete(User $user, ForumThread $thread): bool
    {
        if ((int) $thread->created_by_user_id === (int) $user->id) {
            return true;
        }

        return $user->hasPermission('forum.moderate');
    }
}
