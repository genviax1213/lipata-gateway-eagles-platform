<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

abstract class Controller
{
    use AuthorizesRequests;

    protected function authenticatedUser(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthenticated.');
        }

        return $user;
    }

    protected function ensurePortalPermission(
        Request $request,
        string $permission,
        string $message = 'Insufficient privileges for this action.'
    ): User {
        $user = $this->authenticatedUser($request);

        if (!$user->hasPermission($permission)) {
            abort(403, $message);
        }

        return $user;
    }

    protected function ensureAnyPortalPermission(
        Request $request,
        array $permissions,
        string $message = 'Insufficient privileges for this action.'
    ): User {
        $user = $this->authenticatedUser($request);

        foreach ($permissions as $permission) {
            if (is_string($permission) && $user->hasPermission($permission)) {
                return $user;
            }
        }

        abort(403, $message);
    }
}
