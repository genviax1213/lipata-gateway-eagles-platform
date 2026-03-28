# Revision Notes

## Mobile App Identity Model

This document records the current approved direction for the Flutter mobile app work.

Scope:

- internal mobile app only
- finance
- announcements

No hosting updates for this initiative unless the user explicitly authorizes them.

## Account And Email Rules

Use a two-email model only.

### 1. `users.email`

- this is the login identity
- assigned by admin
- should be recognizable and formatted like `firstname.lastname@lgec.org`
- it may be fictitious
- it does not need to exist as a real mailbox

### 2. `members.email`

- this is the real personal email of the member
- it is used for contact and password recovery
- it is not the login email for the mobile app

## Password Recovery Rule

Password recovery must not depend on sending mail to `users.email`.

Required behavior:

- user logs in with `users.email`
- forgot-password flow uses the actual member email from `members.email`
- admin password reset remains an allowed fallback

Implication:

- do not use the default Laravel password reset flow as-is if it assumes reset mail goes to `users.email`
- implement a custom recovery flow tied to the linked member profile

## Linking Rule

The `User` and `Member` relationship must remain correct and explicit.

Required design direction:

- do not assume `users.email == members.email`
- do not keep forcing both emails to match
- `users.email` and `members.email` now have different purposes

## Bootstrap Superadmin Rule

Do not alter the existing bootstrap superadmin model.

This means:

- the current bootstrap superadmin remains the bootstrap account
- do not migrate it into the new mobile identity pattern
- do not change its recovery behavior as part of the mobile-app identity redesign
- bootstrap superadmin must not log in through the mobile app
- do not treat the bootstrap account as a normal member/mobile-provisioned account for member-linking or recovery unless the user explicitly says so

## Mobile Access Rule

The mobile app is personal-member only.

Allowed mobile experience:

- My Contributions
- Announcements

Blocked from mobile login/use:

- bootstrap superadmin
- admin
- officer
- secretary
- membership chairman
- treasurer
- auditor
- any other non-personal/elevated account path

Required design direction:

- mobile login is only for linked personal member accounts
- `mobile_access_enabled` is necessary but not sufficient by itself
- elevated or finance-role accounts must still be rejected even if `mobile_access_enabled = true`

## Admin Provisioning Rule

For the mobile app:

- no registration
- admin assigns `users.email`
- admin assigns the initial password
- user changes password after first login if that rule is implemented

## Implementation Guidance

When implementing the mobile-auth redesign:

1. preserve bootstrap superadmin behavior
2. keep bootstrap superadmin blocked from the personal mobile app
3. separate login identity from member contact email
4. keep `members.email` as the recovery/contact email
5. build custom recovery around the member-linked email
6. do not deploy to hosting until explicitly authorized
