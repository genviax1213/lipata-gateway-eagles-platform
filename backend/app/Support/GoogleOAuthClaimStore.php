<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class GoogleOAuthClaimStore
{
    private const TTL_SECONDS = 900;

    public const INTENT_LOGIN = 'login';
    public const INTENT_MEMBER_REGISTRATION = 'member_registration';
    public const INTENT_APPLICANT_REGISTRATION = 'applicant_registration';

    public static function issue(string $intent, array $claim): string
    {
        $token = Str::random(48);

        Cache::put(self::cacheKey($intent, $token), array_merge($claim, [
            'intent' => $intent,
            'issued_at' => time(),
        ]), now()->addSeconds(self::TTL_SECONDS));

        return $token;
    }

    public static function get(string $intent, string $token): ?array
    {
        $claim = Cache::get(self::cacheKey($intent, $token));
        return is_array($claim) ? $claim : null;
    }

    public static function consume(string $intent, string $token): ?array
    {
        $claim = self::get($intent, $token);
        if ($claim) {
            Cache::forget(self::cacheKey($intent, $token));
        }

        return $claim;
    }

    public static function ttlSeconds(): int
    {
        return self::TTL_SECONDS;
    }

    private static function cacheKey(string $intent, string $token): string
    {
        return "google_oauth_claim:{$intent}:{$token}";
    }
}
