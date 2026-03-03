<?php

namespace App\Support;

/**
 * Central registry of all permission constants used throughout the application.
 * This eliminates magic strings and provides a single source of truth for permission names.
 */
class Permissions
{
    // Member Management Permissions
    public const MEMBERS_VIEW = 'members.view';
    public const MEMBERS_CREATE = 'members.create';
    public const MEMBERS_UPDATE = 'members.update';
    public const MEMBERS_DELETE = 'members.delete';

    // Finance Permissions
    public const FINANCE_VIEW = 'finance.view';
    public const FINANCE_INPUT = 'finance.input';
    public const FINANCE_REQUEST_EDIT = 'finance.request_edit';
    public const FINANCE_APPROVE_EDITS = 'finance.approve_edits';

    // Applications & Fees Permissions
    public const APPLICATIONS_FEE_SET = 'applications.fee.set';
    public const APPLICATIONS_FEE_PAY = 'applications.fee.pay';
    public const APPLICATIONS_DASHBOARD_VIEW = 'applications.dashboard.view';
    public const APPLICATIONS_DOCS_UPLOAD = 'applications.docs.upload';
    public const APPLICATIONS_DOCS_REVIEW = 'applications.docs.review';

    // Posts (CMS) Permissions
    public const POSTS_CREATE = 'posts.create';
    public const POSTS_UPDATE = 'posts.update';
    public const POSTS_DELETE = 'posts.delete';

    // Roles & Admin Permissions
    public const ROLES_DELEGATE = 'roles.delegate';

    // Forum Permissions
    public const FORUM_VIEW = 'forum.view';
    public const FORUM_CREATE_THREAD = 'forum.create_thread';
    public const FORUM_REPLY = 'forum.reply';
    public const FORUM_MODERATE = 'forum.moderate';

    /**
     * Get all member management permissions as array.
     */
    public static function memberManagement(): array
    {
        return [
            self::MEMBERS_VIEW,
            self::MEMBERS_CREATE,
            self::MEMBERS_UPDATE,
            self::MEMBERS_DELETE,
        ];
    }

    /**
     * Get all finance permissions as array.
     */
    public static function finance(): array
    {
        return [
            self::FINANCE_VIEW,
            self::FINANCE_INPUT,
            self::FINANCE_REQUEST_EDIT,
            self::FINANCE_APPROVE_EDITS,
        ];
    }

    /**
     * Get all forum permissions as array.
     */
    public static function forum(): array
    {
        return [
            self::FORUM_VIEW,
            self::FORUM_CREATE_THREAD,
            self::FORUM_REPLY,
            self::FORUM_MODERATE,
        ];
    }

    /**
     * Get all permissions grouped by category.
     */
    public static function all(): array
    {
        return [
            'members' => self::memberManagement(),
            'finance' => self::finance(),
            'applications' => [
                self::APPLICATIONS_FEE_SET,
                self::APPLICATIONS_FEE_PAY,
                self::APPLICATIONS_DASHBOARD_VIEW,
                self::APPLICATIONS_DOCS_UPLOAD,
                self::APPLICATIONS_DOCS_REVIEW,
            ],
            'posts' => [
                self::POSTS_CREATE,
                self::POSTS_UPDATE,
                self::POSTS_DELETE,
            ],
            'roles' => [self::ROLES_DELEGATE],
            'forum' => self::forum(),
        ];
    }
}
