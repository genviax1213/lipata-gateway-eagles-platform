<?php

namespace App\Support;

use App\Models\Member;
use App\Models\User;
use Illuminate\Support\Str;

class ProtectedEmailVisibility
{
    public static function forUser(?User $viewer, ?User $target, ?string $email): ?string
    {
        $normalizedEmail = self::normalize($email);
        if ($normalizedEmail === null) {
            return null;
        }

        if ($normalizedEmail === self::bootstrapEmail()) {
            return null;
        }

        $targetRole = optional($target?->role)->name;
        if ($targetRole === RoleHierarchy::SUPERADMIN && !self::viewerCanSeeSuperadminEmails($viewer)) {
            return null;
        }

        return $normalizedEmail;
    }

    public static function forMember(?User $viewer, Member $member): ?string
    {
        $normalizedEmail = self::normalize($member->email);
        if ($normalizedEmail === null) {
            return null;
        }

        if ($normalizedEmail === self::bootstrapEmail()) {
            return null;
        }

        $targetRole = optional(optional($member->user)->role)->name;
        if ($targetRole === RoleHierarchy::SUPERADMIN && !self::viewerCanSeeSuperadminEmails($viewer)) {
            return null;
        }

        return $normalizedEmail;
    }

    private static function viewerCanSeeSuperadminEmails(?User $viewer): bool
    {
        return optional(optional($viewer)->role)->name === RoleHierarchy::SUPERADMIN;
    }

    private static function bootstrapEmail(): string
    {
        return Str::of((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'))
            ->trim()
            ->lower()
            ->value();
    }

    private static function normalize(?string $email): ?string
    {
        $normalized = Str::of((string) $email)->trim()->lower()->value();

        return $normalized === '' ? null : $normalized;
    }
}
