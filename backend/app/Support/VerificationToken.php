<?php

namespace App\Support;

final class VerificationToken
{
    public const LENGTH = 10;

    public static function generate(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $maxIndex = strlen($alphabet) - 1;
        $token = '';

        for ($i = 0; $i < self::LENGTH; $i++) {
            $token .= $alphabet[random_int(0, $maxIndex)];
        }

        return $token;
    }

    public static function validationRules(): array
    {
        return [
            'required',
            'string',
            'size:' . self::LENGTH,
            'regex:/^[A-Za-z0-9]{' . self::LENGTH . '}$/',
        ];
    }

    public static function normalize(string $token): string
    {
        return strtoupper(trim($token));
    }
}
