<?php

namespace App\Support;

/**
 * Central registry for role names, hierarchy rules, and role-specific permissions.
 * This eliminates hardcoded role name strings scattered throughout the codebase.
 */
class RoleHierarchy
{
    // Primary role names (must match Role model names in database)
    public const SUPERADMIN = 'superadmin';
    public const ADMIN = 'admin';
    public const OFFICER = 'officer';
    public const MEMBERSHIP_CHAIRMAN = 'membership_chairman';
    public const MEMBER = 'member';
    public const APPLICANT = 'applicant';

    // Finance role names (secondary role field on User model)
    public const FINANCE_TREASURER = 'treasurer';
    public const FINANCE_AUDITOR = 'auditor';

    // Forum role names (secondary role field on User model)
    public const FORUM_MODERATOR = 'forum_moderator';

    /**
     * Maximum number of admin accounts allowed in the system.
     */
    public const MAX_SUPERADMIN_ACCOUNTS = 1;
    public const MAX_ADMIN_ACCOUNTS = 2;

    /**
     * Finance permissions granted by treasurer role.
     */
    public static function treasurerPermissions(): array
    {
        return [
            Permissions::FINANCE_VIEW,
            Permissions::FINANCE_INPUT,
        ];
    }

    /**
     * Finance permissions granted by auditor role.
     */
    public static function auditorPermissions(): array
    {
        return [
            Permissions::FINANCE_VIEW,
        ];
    }

    /**
     * Forum permissions granted by forum_moderator role.
     */
    public static function forumModeratorPermissions(): array
    {
        return [
            Permissions::FORUM_VIEW,
            Permissions::FORUM_CREATE_THREAD,
            Permissions::FORUM_REPLY,
            Permissions::FORUM_MODERATE,
        ];
    }

    /**
     * Check if a role is considered an admin or officer with elevated privileges.
     */
    public static function isElevatedRole(string $roleName): bool
    {
        return in_array($roleName, [self::SUPERADMIN, self::ADMIN, self::OFFICER], true);
    }

    /**
     * Check if a role can manage other users (admin only).
     */
    public static function canManageUsers(string $roleName): bool
    {
        return in_array($roleName, [self::SUPERADMIN, self::ADMIN], true);
    }

    /**
     * Check if a role can reset other users' passwords.
     */
    public static function canResetUserPasswords(string $roleName): bool
    {
        return in_array($roleName, [self::SUPERADMIN, self::ADMIN], true);
    }

    /**
     * Check if a role can review member applications (membership chairman only).
     */
    public static function canReviewApplications(string $roleName): bool
    {
        return $roleName === self::MEMBERSHIP_CHAIRMAN;
    }

    /**
     * Check if a user with this role is allowed to access forum without special permission.
     * Applicant role is excluded from forum access by default.
     */
    public static function hasForumAccessByRole(string $roleName): bool
    {
        return $roleName !== self::APPLICANT;
    }

    /**
     * Get all valid primary role names.
     */
    public static function allPrimaryRoles(): array
    {
        return [
            self::SUPERADMIN,
            self::ADMIN,
            self::OFFICER,
            self::MEMBERSHIP_CHAIRMAN,
            self::MEMBER,
            self::APPLICANT,
        ];
    }

    /**
     * Get all valid finance role names.
     */
    public static function allFinanceRoles(): array
    {
        return [
            self::FINANCE_TREASURER,
            self::FINANCE_AUDITOR,
        ];
    }

    /**
     * Get all valid forum role names.
     */
    public static function allForumRoles(): array
    {
        return [
            self::FORUM_MODERATOR,
        ];
    }
}
