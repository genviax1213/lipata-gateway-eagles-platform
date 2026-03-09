<?php

namespace App\Support;

/**
 * Central registry of all permission constants used throughout the application.
 * This eliminates magic strings and provides a single source of truth for permission names.
 */
class Permissions
{
    // CMS Permissions
    public const POSTS_VIEW = 'posts.view';
    public const POSTS_CREATE = 'posts.create';
    public const POSTS_UPDATE = 'posts.update';
    public const POSTS_DELETE = 'posts.delete';

    // Member Management Permissions
    public const MEMBERS_VIEW = 'members.view';
    public const MEMBERS_CREATE = 'members.create';
    public const MEMBERS_UPDATE = 'members.update';
    public const MEMBERS_DELETE = 'members.delete';

    // Finance Permissions
    public const FINANCE_VIEW = 'finance.view';
    public const FINANCE_INPUT = 'finance.input';

    // Applications & Fees Permissions
    public const APPLICATIONS_VIEW = 'applications.view';
    public const APPLICATIONS_DOCS_VIEW = 'applications.docs.view';
    public const APPLICATIONS_FEE_SET = 'applications.fee.set';
    public const APPLICATIONS_FEE_PAY = 'applications.fee.pay';
    public const APPLICATIONS_REVIEW = 'applications.review';
    public const APPLICATIONS_NOTICE_VIEW = 'applications.notice.view';
    public const APPLICATIONS_NOTICE_SET = 'applications.notice.set';
    public const APPLICATIONS_STAGE_SET = 'applications.stage.set';
    public const APPLICATIONS_DASHBOARD_VIEW = 'applications.dashboard.view';
    public const APPLICATIONS_DOCS_UPLOAD = 'applications.docs.upload';
    public const APPLICATIONS_DOCS_REVIEW = 'applications.docs.review';

    // Roles & Admin Permissions
    public const ROLES_DELEGATE = 'roles.delegate';
    public const USERS_VIEW = 'users.view';
    public const USERS_MANAGE = 'users.manage';
    public const USERS_PASSWORD_RESET = 'users.password.reset';
    public const FORMAL_PHOTOS_VIEW_PRIVATE = 'formal_photos.view_private';
    public const IDENTITY_QR_VIEW = 'identity.qr.view';
    public const CALENDAR_VIEW = 'calendar.view';
    public const CALENDAR_MANAGE = 'calendar.manage';
    public const ATTENDANCE_VIEW = 'attendance.view';
    public const ATTENDANCE_SCAN = 'attendance.scan';
    public const DIRECTORY_EXPORT = 'directory.export';
    public const PHOTOS_EXPORT = 'photos.export';

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
            'posts' => [
                self::POSTS_VIEW,
                self::POSTS_CREATE,
                self::POSTS_UPDATE,
                self::POSTS_DELETE,
            ],
            'members' => self::memberManagement(),
            'finance' => self::finance(),
            'applications' => [
                self::APPLICATIONS_VIEW,
                self::APPLICATIONS_DOCS_VIEW,
                self::APPLICATIONS_REVIEW,
                self::APPLICATIONS_NOTICE_VIEW,
                self::APPLICATIONS_NOTICE_SET,
                self::APPLICATIONS_STAGE_SET,
                self::APPLICATIONS_FEE_SET,
                self::APPLICATIONS_FEE_PAY,
                self::APPLICATIONS_DASHBOARD_VIEW,
                self::APPLICATIONS_DOCS_UPLOAD,
                self::APPLICATIONS_DOCS_REVIEW,
            ],
            'roles' => [self::ROLES_DELEGATE],
            'users' => [self::USERS_VIEW, self::USERS_MANAGE, self::USERS_PASSWORD_RESET],
            'formal_photos' => [self::FORMAL_PHOTOS_VIEW_PRIVATE],
            'identity' => [self::IDENTITY_QR_VIEW],
            'calendar' => [self::CALENDAR_VIEW, self::CALENDAR_MANAGE],
            'attendance' => [self::ATTENDANCE_VIEW, self::ATTENDANCE_SCAN],
            'directory' => [self::DIRECTORY_EXPORT, self::PHOTOS_EXPORT],
            'forum' => self::forum(),
        ];
    }
}
