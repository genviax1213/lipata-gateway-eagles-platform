# Flutter Finance and Announcements Plan

## Scope

This plan defines a separate Flutter mobile app for authenticated internal use only.

Included:

- finance
- announcements

Excluded:

- public website pages
- applicant registration
- member registration
- public content browsing

Deployment rule for this initiative:

- no hosting or live-server updates until the mobile app is finished or the user explicitly authorizes it
- local work and git updates only

## Current Backend Facts

Observed in the current Laravel backend:

- mobile-friendly token login already exists in [api.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/routes/api.php) and [AuthController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/AuthController.php)
- token mode is triggered by request header `X-Auth-Mode: token`
- Sanctum personal access tokens already exist
- finance APIs are already substantial
- member announcements already exist through the post/CMS system
- admin user provisioning already exists, but it is tied to the current member email model
- the current password reset flow assumes recovery through the account email

Relevant existing endpoints:

- `POST /api/v1/login`
- `POST /api/v1/logout`
- `GET /api/v1/user`
- `POST /api/v1/forgot-password`
- `POST /api/v1/reset-password`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/member-content/announcements`
- `POST /api/v1/member-content/announcements/{post}/acknowledge`
- `GET /api/v1/finance/members`
- `GET /api/v1/finance/compliance`
- `GET /api/v1/finance/my-contributions`
- `GET /api/v1/finance/members/{member}/contributions`
- `GET /api/v1/finance/accounts`
- `GET /api/v1/finance/account-balances`
- `GET /api/v1/finance/expenses`
- `POST /api/v1/finance/contributions`
- `POST /api/v1/finance/expenses`

## Product Direction

The internal mobile app should use the following identity model:

- every active internal app user gets an official `@lgec.org` login email
- the member's real personal email remains in `members.email`
- password recovery uses `members.email`
- admin assigns the official email and the initial password
- self-registration is removed from the mobile product model
- first login should force password change
- access remains role-based
- the existing bootstrap superadmin must remain untouched

The app itself is not a full portal replacement. It is a focused operational client.

## Recommended V1 Features

### 1. Authentication

- login with official `@lgec.org` email and password
- token-based mobile auth only
- first-login password change
- forgot-password flow using recovery email
- logout
- session/device listing and revoke later if needed

### 2. Finance

- finance dashboard
- contribution history
- member finance lookup
- balances
- account balances
- expense list
- compliance report

For V1, finance entry and reversal actions should be optional. If needed, include them only for treasurer-authorized users after read flows are stable.

### 3. Announcements

- list of internal announcements
- announcement detail
- read/unread or acknowledged status
- push notification readiness

## Recommended Role Model For Mobile

Use the existing backend permissions and add a mobile access gate.

Recommended initial mobile-eligible users:

- admin
- treasurer
- auditor
- finance-role users

Optional later:

- secretary or officer users for announcements only

Recommended additional user flags:

- `must_change_password`
- `mobile_access_enabled`

## Required Backend Changes

## A. Identity And Provisioning

The current account model treats `email` as the canonical identity and links it to member records. For the new mobile workflow, this should be made explicit instead of overloading existing assumptions.

Recommended changes:

1. Add user/account fields

- `users.must_change_password`
- `users.mobile_access_enabled`
- optional `users.last_password_changed_at`

2. Keep `users.email` as the official login email

- this becomes the `@lgec.org` account email for internal app users
- it remains the canonical login identity

3. Preserve member personal email in `members.email`

Current risk:

- the system heavily links `users.email` and `members.email`
- if `users.email` becomes official `@lgec.org` while `members.email` stays personal, current sync logic in [User.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Models/User.php) will conflict

Recommended model change:

- keep `members.email` as personal/contact email
- stop auto-forcing `members.email = users.email` for mobile-provisioned accounts

Safer long-term design:

- `users.email` = official login email
- `members.email` = personal/member contact email
- `members.email` is also the recovery destination for forgot-password

4. Add an admin provisioning flow

New admin actions:

- create internal mobile account for a member
- assign official `@lgec.org` email
- set initial password
- set finance role / primary role
- enable mobile access
- reset password

Bootstrap exception:

- do not migrate or redesign the existing bootstrap superadmin account under this model
- keep bootstrap recovery behavior separate from the member/mobile account flow

5. Remove registration from the mobile product

Do not use:

- applicant registration
- member self-registration

Those web flows can continue to exist for the website if needed, but they are out of scope for the mobile app.

## B. Mobile Authentication Contract

The backend already supports token mode. Standardize it for Flutter.

Recommended mobile auth contract:

- `POST /api/v1/mobile/login`
- `POST /api/v1/mobile/logout`
- `GET /api/v1/mobile/me`
- `POST /api/v1/mobile/change-password`
- `POST /api/v1/mobile/forgot-password`
- `POST /api/v1/mobile/reset-password`

These may wrap existing auth logic instead of replacing it.

Required behaviors:

- reject users without `mobile_access_enabled`
- reject non-official email domains if policy requires only `@lgec.org`
- return token + user payload + permission summary
- return `must_change_password`
- return allowed app modules
- keep bootstrap superadmin auth behavior untouched unless explicitly approved otherwise

Recommended login response shape:

```json
{
  "token": "sanctum-token",
  "user": {
    "id": 1,
    "name": "Example User",
    "email": "name@lgec.org",
    "must_change_password": true,
    "mobile_access_enabled": true,
    "primary_role": "admin",
    "finance_role": "treasurer",
    "permissions": ["finance.view", "finance.input"]
  }
}
```

Recovery design note:

- the user logs in with `users.email`
- forgot-password accepts the login ID, resolves the linked member, and sends reset instructions to `members.email`
- do not rely on the default Laravel broker behavior if it sends mail to `users.email`

## C. Finance API Tightening For Mobile

Most finance data already exists. The mobile app should avoid directly depending on the entire web portal response surface where possible.

Recommended mobile-focused endpoints:

- `GET /api/v1/mobile/finance/dashboard`
- `GET /api/v1/mobile/finance/members`
- `GET /api/v1/mobile/finance/members/{member}/summary`
- `GET /api/v1/mobile/finance/members/{member}/contributions`
- `GET /api/v1/mobile/finance/account-balances`
- `GET /api/v1/mobile/finance/expenses`
- optional `POST /api/v1/mobile/finance/contributions`
- optional `POST /api/v1/mobile/finance/expenses`

Recommended dashboard payload:

- total collections this month
- total expenses this month
- current cash/account balances
- members with dues gaps
- latest transactions

This will let Flutter avoid assembling too many screens from many small requests.

## D. Announcements API For Mobile

The current member announcement endpoints are already close to what the app needs.

Recommended mobile endpoints:

- `GET /api/v1/mobile/announcements`
- `GET /api/v1/mobile/announcements/{id}`
- `POST /api/v1/mobile/announcements/{id}/acknowledge`

Optional later:

- `POST /api/v1/mobile/announcements`
- `PUT /api/v1/mobile/announcements/{id}`

Recommendation:

- V1 should be read-only for most users
- creation/editing should stay web-admin first unless a mobile editorial workflow is explicitly needed

## Security Rules

1. Do not use web session auth in Flutter

- use token-based auth only

2. Gate mobile access explicitly

- not every portal user should automatically access the mobile app

3. Enforce official-email policy only where intended

- login email can be restricted to `@lgec.org`
- `members.email` must not be used as a direct login

4. Force password rotation

- admin-set password must be temporary
- first login must require password change

5. Audit sensitive actions

- finance posting
- finance reversal
- account provisioning
- password reset
- announcement publish

## Flutter App Structure

Recommended app modules:

- `lib/app`
- `lib/core`
- `lib/features/auth`
- `lib/features/finance`
- `lib/features/announcements`
- `lib/features/settings`

Recommended technical stack:

- `dio` for API client
- `flutter_riverpod` or `bloc` for state management
- `go_router` for navigation
- `flutter_secure_storage` for token storage
- `freezed` + `json_serializable` for models

Recommended screen set for V1:

- splash/session restore
- login
- force change password
- home dashboard
- finance dashboard
- member finance search
- member finance detail
- contributions list
- expenses list
- announcements list
- announcement detail
- account/settings

## Phased Delivery

### Phase 0. Backend Preparation

- finalize identity model
- implement recovery through `members.email`
- add `must_change_password`
- add mobile access flags
- define mobile auth responses

### Phase 1. Finance + Announcements Mobile MVP

- Flutter scaffold
- login
- session restore
- finance dashboard
- member search
- member contribution detail
- expenses
- announcements

### Phase 2. Controlled Write Actions

- finance encoding for treasurer
- expense encoding
- reversals if explicitly approved for mobile

### Phase 3. Polish

- push notifications
- offline cache
- biometric unlock
- export/share support

## Recommended Immediate Work Order

1. Normalize the account model first

- this is the highest-risk part because current code assumes account email and member email should stay aligned

2. Introduce mobile-specific auth endpoints and payloads

- keep existing web auth stable

3. Add announcement mobile wrappers

- easiest early win

4. Add finance mobile dashboard endpoints

- shape payloads for mobile instead of reusing large web responses blindly

5. Scaffold the Flutter app

- after backend contract is clear

## Decisions Recommended For Approval Before Coding

These decisions should be locked before implementation starts:

1. Official email rule

- should every mobile-enabled internal user be required to use `@lgec.org`, or only finance/admin users?

2. Recovery rule

- should password recovery always use `members.email`, or should there ever be a separate account-level recovery field later?

3. Mobile eligibility

- finance-only users, or broader internal roles too?

## Recommendation Summary

Recommended implementation choices:

- separate Flutter app
- token auth only
- admin-provisioned official `@lgec.org` logins
- `members.email` used as recovery destination
- first-login password change required
- finance and announcements first
- bootstrap superadmin left untouched
- no live-host deployment during development until explicitly approved
