<?php

namespace App\Support;

final class MailTransportConfig
{
    public static function normalizeScheme(?string $scheme, ?string $encryption = null): ?string
    {
        $normalized = self::clean($scheme);

        if ($normalized === null) {
            $normalized = self::clean($encryption);
        }

        return match ($normalized) {
            null => null,
            'smtp', 'tls', 'starttls' => 'smtp',
            'smtps', 'ssl' => 'smtps',
            default => $normalized,
        };
    }

    private static function clean(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = strtolower(trim($value));

        return $normalized === '' || $normalized === 'null'
            ? null
            : $normalized;
    }
}
