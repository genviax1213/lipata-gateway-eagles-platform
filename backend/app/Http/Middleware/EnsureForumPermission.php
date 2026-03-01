<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureForumPermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if (
            in_array($permission, ['forum.view', 'forum.create_thread', 'forum.reply'], true)
            && optional($user->role)->name !== 'applicant'
        ) {
            return $next($request);
        }

        if (!$user->hasPermission($permission)) {
            return response()->json(['message' => 'Insufficient forum privileges.'], 403);
        }

        return $next($request);
    }
}
