<?php

namespace App\Policies;

use App\Models\Post;
use App\Models\User;
use App\Support\RoleHierarchy;

class PostPolicy
{
    public function viewCmsIndex(User $user): bool
    {
        return $this->hasOfficerCmsAccess($user)
            || Post::query()->where('author_id', $user->id)->exists();
    }

    public function manageGlobal(User $user): bool
    {
        return $this->hasOfficerCmsAccess($user)
            || $user->hasPermission('posts.delete');
    }

    public function create(User $user): bool
    {
        return $this->hasOfficerCmsAccess($user);
    }

    public function uploadInlineAsset(User $user): bool
    {
        return $this->viewCmsIndex($user);
    }

    public function update(User $user, Post $post): bool
    {
        return $this->hasOfficerCmsAccess($user)
            || $post->author_id === $user->id;
    }

    public function delete(User $user, Post $post): bool
    {
        return $user->hasPermission('posts.delete')
            || $post->author_id === $user->id;
    }

    private function hasOfficerCmsAccess(User $user): bool
    {
        $user->loadMissing('role:id,name');
        $primaryRole = (string) optional($user->role)->name;
        $financeRole = (string) ($user->finance_role ?? '');

        return in_array($primaryRole, [
            RoleHierarchy::SUPERADMIN,
            RoleHierarchy::ADMIN,
            RoleHierarchy::OFFICER,
            RoleHierarchy::SECRETARY,
            RoleHierarchy::MEMBERSHIP_CHAIRMAN,
            RoleHierarchy::FINANCE_TREASURER,
            RoleHierarchy::FINANCE_AUDITOR,
        ], true) || in_array($financeRole, [
            RoleHierarchy::FINANCE_TREASURER,
            RoleHierarchy::FINANCE_AUDITOR,
        ], true);
    }
}
