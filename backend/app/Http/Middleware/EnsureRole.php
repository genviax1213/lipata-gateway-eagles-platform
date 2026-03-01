<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($roles === []) {
            return response()->json(['message' => 'Role configuration is missing for this route.'], 500);
        }

        $user->loadMissing('role:id,name');
        $roleName = optional($user->role)->name;

        if (!in_array($roleName, $roles, true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
