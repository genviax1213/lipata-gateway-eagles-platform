<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Str;

class BootstrapSuperadminPrivacy
{
    public static function normalizeEmail(?string $value): string
    {
        return Str::of((string) $value)->lower()->trim()->value();
    }

    public static function bootstrapEmail(): string
    {
        return self::normalizeEmail((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'));
    }

    public static function isBootstrapEmail(?string $email): bool
    {
        return self::normalizeEmail($email) === self::bootstrapEmail();
    }

    public static function canViewBootstrapEmail(?User $viewer): bool
    {
        if (!$viewer) {
            return false;
        }

        $viewer->loadMissing('role:id,name');

        return self::isBootstrapEmail($viewer->email)
            && (string) optional($viewer->role)->name === RoleHierarchy::SUPERADMIN;
    }

    public static function shouldFilterBootstrapEmail(?User $viewer): bool
    {
        return !self::canViewBootstrapEmail($viewer);
    }

    public static function maskEmailForViewer(?User $viewer, ?string $email): ?string
    {
        if (self::isBootstrapEmail($email) && self::shouldFilterBootstrapEmail($viewer)) {
            return null;
        }

        return $email;
    }
}
