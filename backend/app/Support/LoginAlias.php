<?php

namespace App\Support;

use Illuminate\Support\Str;

class LoginAlias
{
    public static function normalizeEmail(string $value): string
    {
        return Str::of($value)->trim()->lower()->value();
    }

    public static function defaultDomain(): string
    {
        return 'lgec.org';
    }

    public static function isAliasFormat(string $email): bool
    {
        $normalized = self::normalizeEmail($email);
        return (bool) preg_match('/^[a-z0-9]+(?:\.[a-z0-9]+)+(?:[0-9]+)?@' . preg_quote(self::defaultDomain(), '/') . '$/', $normalized);
    }

    public static function buildLocalPart(string $firstName, string $lastName): string
    {
        $first = self::slugPart($firstName);
        $last = self::slugPart($lastName);

        if ($first === '' || $last === '') {
            return '';
        }

        return "{$first}.{$last}";
    }

    public static function build(string $firstName, string $lastName): string
    {
        $local = self::buildLocalPart($firstName, $lastName);
        if ($local === '') {
            return '';
        }

        return $local . '@' . self::defaultDomain();
    }

    private static function slugPart(string $value): string
    {
        $ascii = Str::of($value)
            ->ascii()
            ->lower()
            ->replaceMatches('/[^a-z0-9]+/', '')
            ->trim()
            ->value();

        return $ascii;
    }
}

