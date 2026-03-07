<?php

namespace App\Policies;

use App\Models\Role;
use App\Models\User;
use App\Support\RoleHierarchy;
use Illuminate\Auth\Access\Response;

class AdminUserPolicy
{
    public function manageAdminUsers(User $actor, string $permission): Response
    {
        $actor->loadMissing('role:id,name');
        $actorRole = optional($actor->role)->name;

        if (RoleHierarchy::canManageUsers((string) $actorRole) && $actor->hasPermission($permission)) {
            return Response::allow();
        }

        if (!$actor->hasPermission($permission)) {
            return Response::deny('Insufficient privileges for this action.');
        }

        return Response::allow();
    }

    public function manageRoleAssignment(
        User $actor,
        ?User $target = null,
        ?Role $requestedRole = null,
        string $action = 'update'
    ): Response {
        $actor->loadMissing('role:id,name');
        $actorRole = optional($actor->role)->name;
        $actorIsSuperadmin = $actorRole === RoleHierarchy::SUPERADMIN;
        $actorIsAdmin = $actorRole === RoleHierarchy::ADMIN;
        $actorCanManageTopRoles = $actorIsSuperadmin;

        if ($target) {
            $target->loadMissing('role:id,name');
            $targetRole = optional($target->role)->name;

            if ($action === 'delete' && $actor->id === $target->id) {
                return Response::denyWithStatus(422, 'You cannot delete your own account.');
            }

            if ($targetRole === RoleHierarchy::SUPERADMIN && !$actorIsSuperadmin) {
                return Response::deny('Only the superadmin can manage superadmin accounts.');
            }

            if ($targetRole === RoleHierarchy::ADMIN && !$actorCanManageTopRoles) {
                return Response::deny('Only the superadmin can manage administrator accounts.');
            }

            if ($actorRole === 'officer' && $targetRole === 'officer') {
                return Response::deny('Officers cannot manage fellow officers.');
            }
        }

        if ($requestedRole && $requestedRole->name === RoleHierarchy::SUPERADMIN) {
            if (!$actorIsSuperadmin) {
                return Response::deny('Only the superadmin can create or assign the superadmin account.');
            }

            $isPromotion = $target ? optional($target->role)->name !== RoleHierarchy::SUPERADMIN : true;
            if ($isPromotion) {
                $superadminCount = User::query()
                    ->whereHas('role', fn ($q) => $q->where('name', RoleHierarchy::SUPERADMIN))
                    ->count();

                if ($superadminCount >= RoleHierarchy::MAX_SUPERADMIN_ACCOUNTS) {
                    return Response::denyWithStatus(422, 'Maximum superadmin accounts reached.');
                }
            }
        }

        if ($requestedRole && $requestedRole->name === RoleHierarchy::ADMIN) {
            if (!$actorIsSuperadmin) {
                return Response::deny('Only the superadmin can create or assign administrator accounts.');
            }

            $isPromotion = $target ? optional($target->role)->name !== RoleHierarchy::ADMIN : true;
            if ($isPromotion) {
                $adminCount = User::query()
                    ->whereHas('role', fn ($q) => $q->where('name', RoleHierarchy::ADMIN))
                    ->count();

                if ($adminCount >= RoleHierarchy::MAX_ADMIN_ACCOUNTS) {
                    return Response::denyWithStatus(422, 'Maximum administrator accounts reached.');
                }
            }
        }

        return Response::allow();
    }

    public function resetUserPassword(User $actor, User $target): Response
    {
        $actor->loadMissing('role:id,name');
        $target->loadMissing('role:id,name');

        $actorRole = optional($actor->role)->name;
        $targetRole = optional($target->role)->name;

        if (!RoleHierarchy::canResetUserPasswords((string) $actorRole) || !$actor->hasPermission('users.password.reset')) {
            return Response::deny('Insufficient privileges for password reset.');
        }

        if ($actor->id === $target->id) {
            return Response::denyWithStatus(422, 'Use your own password settings to change your password.');
        }

        if ($actorRole === RoleHierarchy::SUPERADMIN) {
            return Response::allow();
        }

        if ($targetRole === RoleHierarchy::SUPERADMIN) {
            return Response::deny('Administrators cannot reset the superadmin password.');
        }

        if ($targetRole === RoleHierarchy::ADMIN) {
            return Response::deny('Administrators cannot reset fellow administrator passwords.');
        }

        return Response::allow();
    }
}
