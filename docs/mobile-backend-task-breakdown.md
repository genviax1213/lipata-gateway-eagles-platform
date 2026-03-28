# Mobile Backend Task Breakdown

This document converts the approved mobile-app revision into concrete backend work items.

Reference:

- [revision.md](/mnt/rll/projects/lipata-gateway-eagles-platform/revision.md)
- [flutter-finance-announcements-plan.md](/mnt/rll/projects/lipata-gateway-eagles-platform/docs/flutter-finance-announcements-plan.md)

This task list is local-only planning and implementation guidance.

## Goal

Support a Flutter internal mobile app for:

- finance
- announcements

Identity model:

- `users.email` = admin-assigned login ID, usually `firstname.lastname@lgec.org`
- `members.email` = real personal email and password recovery email
- bootstrap superadmin remains unchanged

## Highest-Risk Areas

These are the parts most likely to break if changed carelessly:

1. `User::syncMemberProfile()`

- currently assumes `users.email` and `members.email` should align

2. `AuthController`

- current forgot/reset password flow assumes the account email is the recovery destination

3. `AdminUserController`

- current user creation and role assignment flows assume account email and member email are effectively the same identity

4. any feature resolving member identity by email

- current code often finds a member by `user->email`

## Concrete Backend Work Packages

## Package 1. Account Model Stabilization

### Objective

Allow `users.email` and `members.email` to hold different values for linked accounts without breaking the rest of the system.

### Files to change

- [User.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Models/User.php)
- [AdminUserController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AdminUserController.php)
- [MemberController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/MemberController.php)
- any policy/controller resolving members by account email

### Required changes

1. Introduce an explicit mobile-aware linking rule

- linked member lookup should prefer `members.user_id`
- fallback by email should be restricted to legacy situations only

2. Refactor `User::syncMemberProfile()`

Current behavior to remove for mobile-linked users:

- forcing `members.email = users.email`

New behavior:

- if a member is already linked by `user_id`, do not overwrite `members.email` from `users.email`
- preserve `members.email` as the personal/member contact email
- continue syncing safe fields such as:
  - `password_set`
  - verified flags where still valid

3. Define legacy-safe compatibility behavior

- older linked records may still have matching emails
- fallback matching by email should remain only for migration/legacy reconciliation
- once linked, the relationship should use `user_id` as the source of truth

### Acceptance criteria

- a linked user can have `users.email != members.email`
- saving the user no longer rewrites `members.email`
- finance/member lookups still work for linked records

## Package 2. Mobile Access Flags

### Objective

Explicitly gate who can use the mobile app.

### Database change

Add fields to `users`:

- `must_change_password` boolean default `false`
- `mobile_access_enabled` boolean default `false`
- optional `last_password_changed_at` datetime nullable

### Files to change

- new migration under [backend/database/migrations](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/database/migrations)
- [User.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Models/User.php)
- [AdminUserController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AdminUserController.php)

### Required changes

1. add casts/fillable support in `User`
2. expose the new flags in admin user APIs
3. allow admin to provision mobile access intentionally

### Acceptance criteria

- mobile access is off by default
- admin can enable mobile access per user

## Package 3. Admin Provisioning Flow

### Objective

Support the approved account provisioning workflow:

- no registration
- admin assigns login ID
- admin assigns initial password

### Files to change

- [AdminUserController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AdminUserController.php)
- possibly related policies/validation rules

### Required changes

1. add/update provisioning endpoints for linked member accounts

Capabilities needed:

- assign `users.email` in `firstname.lastname@lgec.org` format
- set initial password
- set `must_change_password = true`
- enable mobile access
- preserve member personal email

2. relax current email immutability only where intended

Current behavior:

- [AdminUserController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AdminUserController.php) blocks changing `users.email`

New behavior:

- keep bootstrap protected
- allow controlled reassignment of `users.email` for normal mobile-provisioned accounts through admin-only flow

3. preserve bootstrap exception

- bootstrap superadmin remains excluded from this redesign

### Acceptance criteria

- admin can provision a member account with an official login ID
- member personal email remains unchanged
- bootstrap superadmin behavior remains unchanged

## Package 4. Mobile Login Contract

### Objective

Provide a stable mobile auth surface for Flutter using token auth.

### Files to change

- [api.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/routes/api.php)
- [AuthController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AuthController.php)

### Required changes

1. add mobile wrappers or dedicated endpoints

Recommended:

- `POST /api/v1/mobile/login`
- `POST /api/v1/mobile/logout`
- `GET /api/v1/mobile/me`
- `POST /api/v1/mobile/change-password`

2. enforce mobile access gate

- reject users with `mobile_access_enabled = false`

3. return mobile-specific payload fields

- `must_change_password`
- mobile feature flags
- permission summary

4. keep token mode

- continue using Sanctum token auth
- do not use browser-session flow for Flutter

### Acceptance criteria

- mobile login returns a token and stable user payload
- users without mobile access are blocked
- bootstrap superadmin is not implicitly pulled into the mobile path

## Package 5. Custom Password Recovery

### Objective

Recover accounts using `members.email`, not `users.email`.

### Files to change

- [AuthController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AuthController.php)
- [AppServiceProvider.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Providers/AppServiceProvider.php)
- possibly a new notification or recovery service
- possibly new migration/table for custom recovery tokens if the default broker is not reused safely

### Required changes

1. replace or wrap forgot-password behavior

Current behavior:

- reset flows target `users.email`

New behavior:

- user submits login ID (`users.email`)
- system finds the linked `Member`
- system sends recovery instructions to `members.email`

2. define reset token strategy

Two options:

- reuse Laravel password broker but send custom notification to `members.email`
- create dedicated mobile recovery token flow

Recommended:

- use a dedicated custom recovery flow to avoid coupling to default account-email assumptions

3. preserve bootstrap recovery exception

- bootstrap superadmin continues to use its protected recovery flow

### Acceptance criteria

- password recovery for mobile-linked users sends to `members.email`
- no reset mail is sent to fictitious `users.email`
- bootstrap recovery remains separate

## Package 6. First-Login Password Change

### Objective

Force admin-assigned passwords to be temporary.

### Files to change

- [AuthController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AuthController.php)
- mobile auth payload logic

### Required changes

1. on admin password assignment:

- set `must_change_password = true`

2. on successful user password change:

- clear `must_change_password`
- update `last_password_changed_at`

3. on mobile login:

- expose `must_change_password` in the response

### Acceptance criteria

- newly provisioned mobile users are forced through password change
- normal subsequent logins do not re-trigger it

## Package 7. Finance Mobile Endpoints

### Objective

Provide stable mobile-shaped responses without forcing Flutter to reuse every web-portal payload directly.

### Files to change

- [FinanceController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/FinanceController.php)
- [FinanceExpenseController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/FinanceExpenseController.php)
- [api.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/routes/api.php)

### Required changes

1. add a finance dashboard endpoint

Suggested:

- `GET /api/v1/mobile/finance/dashboard`

Payload should include:

- current month collections
- current month expenses
- account balances
- latest transactions
- compliance highlights

2. add mobile-friendly member finance endpoints

- summary endpoint
- contributions endpoint

3. keep existing permissions

- `finance.view`
- `finance.input`

### Acceptance criteria

- Flutter can load the finance home screen from one primary request
- finance list/detail screens do not require portal-only assumptions

## Package 8. Announcements Mobile Endpoints

### Objective

Wrap the current announcement system for mobile use.

### Files to change

- [PostController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/PostController.php)
- [api.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/routes/api.php)

### Required changes

1. add mobile aliases/wrappers for:

- list announcements
- get announcement detail
- acknowledge announcement

2. keep content shaping minimal

- title
- excerpt
- body/content
- published date
- acknowledgement state

### Acceptance criteria

- Flutter announcement list/detail can work without CMS-specific assumptions

## Package 9. Test Coverage

### Required tests

1. identity tests

- user/member linked with different emails
- `syncMemberProfile()` no longer overwrites member email

2. auth tests

- mobile login success
- mobile login blocked when `mobile_access_enabled = false`
- must-change-password behavior
- forgot-password uses `members.email`
- bootstrap recovery remains isolated

3. finance tests

- finance mobile dashboard authorization
- finance member summary authorization

## Recommended Implementation Order

1. Package 1: account model stabilization
2. Package 2: mobile access flags
3. Package 3: admin provisioning flow
4. Package 4: mobile login contract
5. Package 5: custom password recovery
6. Package 6: first-login password change
7. Package 7: finance mobile endpoints
8. Package 8: announcements mobile endpoints
9. Package 9: tests

## Definition Of Done For Backend

Backend is ready for Flutter when:

- linked accounts can safely use different `users.email` and `members.email`
- mobile login works with token auth
- forgot-password recovers through `members.email`
- bootstrap superadmin remains untouched
- finance mobile endpoints are stable
- announcement mobile endpoints are stable
- automated tests cover the new identity and auth behavior
