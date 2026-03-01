<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AddRequestContext
{
    /**
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = (string) ($request->headers->get('X-Request-Id') ?: Str::uuid()->toString());

        $request->attributes->set('request_id', $requestId);
        Log::withContext([
            'request_id' => $requestId,
            'request_path' => $request->path(),
            'request_method' => $request->method(),
            'ip' => $request->ip(),
        ]);

        $response = $next($request);
        $response->headers->set('X-Request-Id', $requestId);

        return $response;
    }
}
