<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

## Portal Auth Configuration

- API authentication supports both:
  - Sanctum SPA session/cookie flow (default for frontend)
  - Legacy bearer token flow (for backward compatibility)
- Public sensitive routes are throttled:
  - `/api/v1/login`
  - `/api/v1/forgot-password`
  - `/api/v1/reset-password`
  - `/api/v1/member-applications`
  - `/api/v1/member-applications/verify`
  - Implemented with named rate limiters keyed by `ip|email`
- Logout endpoint:
  - `POST /api/v1/logout` (revokes current token/session)
- Member-application verification:
  - Verification token is emailed to the applicant
  - Submit endpoint no longer returns verification token in API response
  - Verification token is stored hashed at rest
- Incident response logging:
  - API responses include `X-Request-Id`
  - Structured audit events are available for auth, admin role/user changes, applicant decisions, finance reversals, and finance audit-note creation
  - Finance direction now covers both contribution and expense review activity, with account-aware visibility across bank, GCash, and cash on hand
  - Query playbook: `docs/incident-response-logging.md`

## Authorization Policy Map

- `MemberApplicationPolicy`
  - `uploadDocument`: applicant can upload only to their own application and must have `applications.docs.upload`.
- `ApplicationDocumentPolicy`
  - `view`: owner, membership reviewers, or users with `members.view`.
  - `review`: membership chairman role only.
- `ForumThreadPolicy`
  - `setLock`: requires forum moderation capability.
  - `delete`: thread starter or forum moderator.
- `ForumPostPolicy`
  - `setVisibility`: requires forum moderation capability.
  - `delete`: requires forum moderation capability.
- `AdminUserPolicy`
  - `manageAdminUsers`: enforces capability checks plus admin-only restrictions for admin-account management.
  - `manageRoleAssignment`: enforces admin-assignment constraints and max-admin guardrails.
- `ContributionPolicy`
  - `reverse`: requires `finance.input`.
- Finance route/policy baseline
  - Finance read scope covers contribution ledgers, expense ledgers, discrepancy findings, account balances, and live report previews.
  - Treasurer mutation scope covers immutable contribution entry/reversal, immutable expense entry/reversal, and immutable opening-balance entry/reversal.
  - Auditor scope remains read/review-oriented with note-based follow-up rather than approval-state ownership.
  - Expense review keeps support-reference and approval-reference fields visible for audit follow-up.
  - Opening-balance review expects effective-date, remarks, and account traceability rather than editable static account values.
- `FinanceAuditController`
  - `report`: requires `finance.view`.
  - `storeNote`: finance route requires `finance.view`, but controller enforces auditor-only note creation.
- `ExpenseAuditController`
  - `report`: requires `finance.view`.
  - `storeNote`: finance route requires `finance.view`, but controller enforces auditor-only note creation.
- `MemberPolicy`
  - `viewMemberDirectory`: requires `members.view`.
  - `viewFinanceDirectory`: requires `finance.view`.
  - `viewFinancialContributions`: requires `finance.view`.
- `PostPolicy`
  - `viewCmsIndex`: requires any of `posts.create`, `posts.update`, or `posts.delete`.

### Required env variables

- `FRONTEND_URL`
- `SANCTUM_STATEFUL_DOMAINS`
- `CORS_ALLOWED_ORIGINS`
- `MAIL_MAILER`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM_ADDRESS`
- `MAIL_FROM_NAME`
- `ADMIN_INITIAL_PASSWORD` (optional; if unset, seeder generates a random admin password)
- `TEMP_LOGIN_PASSWORD` (required when running `TemporaryLoginSeeder`)
- `ALLOW_MEMBER_HISTORY_SEEDER` (default `false`; set to `true` only when intentionally running member history seeding outside local/testing)
- `ALLOW_FINANCE_WORKFLOW_DEMO_SEEDER` (default `false`; set to `true` only when intentionally running finance workflow demo seeding outside local/testing)

### Mail delivery readiness

- Local development currently uses `MAIL_MAILER=log`, so verification tokens are written to `backend/storage/logs/laravel.log` instead of being delivered to a real inbox.
- Production/host delivery is SMTP-ready. Set these host env values before deployment:
  - `APP_NAME="Lipata Gateway Eagles Club"`
  - `APP_URL=https://lgec.org`
  - `FRONTEND_URL=https://lgec.org`
  - `MAIL_MAILER=smtp`
  - `MAIL_SCHEME=tls`
  - `MAIL_HOST=<your SMTP host>`
  - `MAIL_PORT=<your SMTP port>`
  - `MAIL_USERNAME=<your SMTP username>`
  - `MAIL_PASSWORD=<your SMTP password>`
  - `MAIL_FROM_ADDRESS=<verified sender address>`
  - `MAIL_FROM_NAME="Lipata Gateway Eagles Club"`
  - optional: `MAIL_EHLO_DOMAIN=<your mail domain>`
- After those env changes are applied on the host, refresh Laravel config on deploy/host:
  - `cd backend && php artisan optimize:clear`
  - `cd backend && php artisan config:cache`
- Verification emails for both `member-registration` and `applicant-registration` now read the frontend base URL from `config('app.frontend_url')`, so production links will follow `FRONTEND_URL` consistently.

Seeder note:
- `AdminSeeder` sets initial admin password only when admin account does not yet exist.
- Re-running seeders will not rotate an existing admin password.
- `MemberContributionHistorySeeder` is restricted to `local`/`testing` by default and will throw outside those environments unless `ALLOW_MEMBER_HISTORY_SEEDER=true`.
- `FinanceWorkflowDemoSeeder` is restricted to `local`/`testing` by default and seeds Treasurer/Auditor workflow examples, including opening balances, expenses, and follow-up notes.
- Workflow reference: [docs/finance-workflows.md](/mnt/rll/projects/lipata-gateway-eagles-platform/docs/finance-workflows.md)

### Migration Release Note

- `2026_03_02_090000_normalize_existing_email_identity_data.php` lowercases and trims email data in `users`, `members`, and `member_applications`.
- This normalization is intentionally irreversible (`down()` is a no-op). Before production rollout, take a database backup/snapshot and include this migration in your release checklist.

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework. You can also check out [Laravel Learn](https://laravel.com/learn), where you will be guided through building a modern Laravel application.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com)**
- **[Tighten Co.](https://tighten.co)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Redberry](https://redberry.international/laravel-development)**
- **[Active Logic](https://activelogic.com)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
