<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\AddRequestContext;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\EnsurePortalPermission;
use App\Http\Middleware\EnsureForumPermission;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnforceSingleActiveSession;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Enable Sanctum SPA (cookie/session) authentication flow for API routes.
        $middleware->statefulApi();
        // Avoid route('login') resolution when no named login route exists.
        $middleware->redirectGuestsTo('/');
        $middleware->alias([
            'portal.permission' => EnsurePortalPermission::class,
            'forum.permission' => EnsureForumPermission::class,
            'role.required' => EnsureRole::class,
            'active.session' => EnforceSingleActiveSession::class,
        ]);
        $middleware->append(SecurityHeaders::class);
        $middleware->append(AddRequestContext::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
