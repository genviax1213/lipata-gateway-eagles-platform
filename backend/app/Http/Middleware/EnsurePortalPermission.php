<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePortalPermission
{
    /**
     * Ensure the authenticated user has at least one required portal permission.
     */
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($permissions === []) {
            return response()->json(['message' => 'Permission configuration is missing for this route.'], 500);
        }

        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                return $next($request);
            }
        }

        return response()->json(['message' => 'Forbidden'], 403);
    }
}
