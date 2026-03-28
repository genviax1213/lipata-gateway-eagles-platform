# Alias Email Login Conversion Plan

Date: 2026-03-26
Scope: Login identity model conversion (no code implementation in this document)

## Requirements (Confirmed 1-6)

1. Login must use alias email only, not the real email.
2. Alias format is `firstname.lastname@lgec.org`.
3. Alias maps to real email as recovery email.
4. Real email login is blocked for all users, except bootstrap login identifier `admin@lipataeagles.ph`.
5. Bootstrap login `admin@lipataeagles.ph` is virtual (non-mailbox) and recovery email is `r.lanugon@gmail.com`.
6. Existing users with real emails are converted so:
- current real email becomes recovery email
- alias is auto-generated from existing first name + last name
- usable password is not pre-issued; superadmin/admin generates/reset credentials via dashboard action button.

## Identity Model

- `login_email`: primary credential used for authentication (alias only)
- `recovery_email`: actual mailbox used for account recovery and account notices
- `bootstrap_login_email`: reserved value `admin@lipataeagles.ph` for bootstrap account only
- `login_email_locked`: true for converted accounts until credential generation/reset occurs
- `alias_generation_source`: first name + last name canonicalized for alias creation

## Alias Rules

- Normalize as lowercase.
- Format as `firstname.lastname@lgec.org`.
- Strip spaces and unsupported symbols from names.
- Replace internal spaces or punctuation with a single dot boundary only between first and last segment.
- Enforce uniqueness.
- Collision policy: append numeric suffix to local part (`firstname.lastname2@lgec.org`, `firstname.lastname3@lgec.org`, ...).
- Reserved aliases cannot be assigned to regular users (`admin@lipataeagles.ph`, system/internal aliases).

## Authentication Policy

- Allow login by `login_email` only.
- Deny login by `recovery_email` for all non-bootstrap accounts.
- Bootstrap exception:
- login identifier: `admin@lipataeagles.ph`
- recovery email target: `r.lanugon@gmail.com`
- Keep full audit trail for login attempt type:
- alias login success/failure
- blocked recovery-email login attempt
- bootstrap login attempt

## Existing User Conversion Policy

- For each existing account with first name + last name:
- copy old real email into `recovery_email`
- generate unique alias into `login_email`
- mark account `login_email_locked = true` until admin issues credentials
- invalidate previous password-based login path that used real email
- For existing records with incomplete names:
- route to exception queue for manual alias assignment by superadmin/admin
- For existing records with duplicate candidate aliases:
- auto-apply numeric suffix policy and log assignment decision

## Password/Credential Policy (Post-Conversion)

- No shared/default password should be distributed.
- Superadmin/admin can trigger `Generate Credentials` or `Reset Credentials` action per user.
- Generated credential output must be shown once and treated as sensitive.
- Force password change on first successful login after generated credential issuance.
- Log actor, timestamp, target user, and action type for each generation/reset.

## Superadmin/Admin Dashboard Workflow (End-to-End)

### A. Preparation

1. Open `Identity Conversion` dashboard module.
2. Review readiness checks:
- total users
- users with valid first+last names
- missing-name records
- alias collision forecast
- bootstrap account validation status
3. Confirm policy toggles:
- `Block recovery-email login`
- `Enable alias-only login`
- `Allow bootstrap exception`

### B. Dry Run

1. Run `Preview Conversion`.
2. System produces preview table:
- current email
- proposed alias
- proposed recovery email
- collision status
- lock status after migration
3. Export preview report for approval.
4. Resolve exception queue (missing names, protected/system users, malformed records).

### C. Execute Conversion

1. Authorized actor (superadmin/admin with elevated permission) clicks `Run Conversion`.
2. System applies transactional migration:
- moves real email to recovery email
- writes alias to login email
- sets login lock until credentials are generated
- enforces bootstrap mapping (`admin@lipataeagles.ph` -> `r.lanugon@gmail.com`)
3. System outputs summary:
- converted count
- skipped count
- exception count
- collision-resolved count

### D. Credential Issuance

1. In `Converted Users` list, superadmin/admin selects users.
2. Click `Generate Credentials` (single or batch).
3. System creates one-time credential material and displays once.
4. Admin delivers credentials via approved out-of-band process.
5. User signs in using alias and is forced to set a new password.

### E. Recovery and Support

1. Recovery flow always targets `recovery_email`, never alias mailbox.
2. If user attempts real-email login, system shows blocked message with instruction to use alias.
3. Support staff can search by alias or recovery email but only trigger recovery to registered recovery email.

### F. Governance and Audit

1. Add `Identity Conversion Audit` page with filters:
- date range
- actor
- action type
- target user
2. Log events:
- conversion run start/end
- alias assignment
- collision resolution
- credential generation/reset
- blocked real-email login attempts
- bootstrap login attempts
3. Require reconfirmation prompt for high-risk actions (`Run Conversion`, batch credential reset).

## Permissions Matrix

- Superadmin:
- full conversion controls, exception overrides, batch credential generation/reset
- Admin:
- conversion run (if granted), user-level credential generation/reset, exception handling within assigned scope
- Other roles:
- no access to conversion module or credential generation actions

## Rollout Sequence

1. Publish policy notice internally (alias-only login cutover date).
2. Complete dry run and sign-off.
3. Execute conversion during low-traffic window.
4. Enable alias-only enforcement.
5. Issue credentials in waves.
6. Monitor logs for blocked real-email login attempts and support tickets.
7. Close conversion when exception queue reaches zero.

## Acceptance Criteria

- All converted users can authenticate only with alias emails.
- Real email login is blocked except bootstrap path.
- Bootstrap login identifier functions and recovery maps to `r.lanugon@gmail.com`.
- Every converted user has recovery email populated.
- Credential generation/reset actions are available only to superadmin/admin and fully audited.
- Dashboard provides preview, execute, exception handling, and audit visibility.

## Open Implementation Notes

- Decide whether alias local-part normalization should preserve middle initials when available.
- Decide batch size and retry strategy for very large user sets.
- Confirm exact user-facing copy for blocked real-email login and first-login password reset.
- Confirm whether admin role requires a second approval for full conversion execution.
