<?php

namespace App\Policies;

use App\Models\Role;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class AdminUserPolicy
{
    private const MAX_ADMINS_TOTAL = 3;

    public function manageAdminUsers(User $actor, string $permission): Response
    {
        $actor->loadMissing('role:id,name');

        if (optional($actor->role)->name === 'admin') {
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
        $actorIsAdmin = $actorRole === 'admin';

        if ($target) {
            $target->loadMissing('role:id,name');
            $targetRole = optional($target->role)->name;

            if ($action === 'delete' && $actor->id === $target->id) {
                return Response::denyWithStatus(422, 'You cannot delete your own account.');
            }

            if ($targetRole === 'admin' && !$actorIsAdmin) {
                return Response::deny('Only administrators can manage administrator accounts.');
            }

            if ($actorRole === 'officer' && $targetRole === 'officer') {
                return Response::deny('Officers cannot manage fellow officers.');
            }
        }

        if ($requestedRole && $requestedRole->name === 'admin') {
            if (!$actorIsAdmin) {
                return Response::deny('Only administrators can create or assign administrator accounts.');
            }

            $isPromotion = $target ? optional($target->role)->name !== 'admin' : true;
            if ($isPromotion) {
                $adminCount = User::query()
                    ->whereHas('role', fn ($q) => $q->where('name', 'admin'))
                    ->count();

                if ($adminCount >= self::MAX_ADMINS_TOTAL) {
                    return Response::denyWithStatus(422, 'Maximum administrator accounts reached.');
                }
            }
        }

        return Response::allow();
    }
}
