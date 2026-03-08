# Applicant-to-Member Lifecycle Audit

Status: Active audit baseline  
Purpose: Record the current applicant/member lifecycle, identified UX and data-model gaps, and future progress updates.  
Update rule: Append future changes and follow-up implementation notes to this file instead of replacing the baseline audit.

## Scope
- Public membership application flow
- Applicant dashboard flow
- Membership chairman review flow
- Conversion from applicant to club member
- Handling of applicant data, documents, notices, and fee records after approval/rejection

## Baseline Findings

### 1. Applicant meaning is currently mixed with member status
Current code allows `applicant`, `active`, and `inactive` as values on the public application form.

Relevant code:
- [frontend/src/pages/MemberApplication.tsx](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/src/pages/MemberApplication.tsx#L14)
- [backend/app/Http/Controllers/MemberApplicationController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/MemberApplicationController.php#L254)

Problem:
- This conflicts with the intended business rule that an applicant is not yet a club member.
- A non-member should not be choosing `active` or `inactive` during public application.

Required business interpretation:
- `Applicant` = non-member seeking admission into the club.
- `Member` = person already admitted into the club.
- `Active` and `inactive` should belong to member lifecycle, not public application entry.

### 2. Direct member creation is intentionally disabled
The current system does not allow direct member creation through the member management endpoint.

Relevant code:
- [backend/app/Http/Controllers/MemberController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/MemberController.php#L61)

Current behavior:
- `POST /members` returns a validation-style rejection.
- The effective system rule today is that a member enters the system through application approval, not direct manual entry.

This is good and should remain unless a separate admin-only intake workflow is intentionally added later.

### 3. Approval does automatically create the member record
When an applicant is approved, the system creates a new member record and changes the linked user role from `applicant` to `member`.

Relevant code:
- [backend/app/Http/Controllers/MemberApplicationController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/MemberApplicationController.php#L586)
- [backend/app/Http/Controllers/MemberApplicationController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/MemberApplicationController.php#L619)
- [backend/app/Http/Controllers/MemberApplicationController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/MemberApplicationController.php#L633)

Current approval result:
- new `members` row is created
- member number is generated automatically
- `membership_status` is set to `active`
- linked portal user role is changed to `member`
- application is marked `approved`

Answer to the business question:
- Yes, the successful applicant is automatically registered in the member list.
- Yes, the portal account status effectively changes from applicant account to member account through role change.

### 4. Applicant data is preserved, but not unified under the member dossier
The current system keeps the application record and supporting workflow data after approval.

Relevant code:
- [backend/app/Http/Controllers/MemberApplicationController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/MemberApplicationController.php#L636)
- [backend/app/Models/MemberApplication.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Models/MemberApplication.php#L12)

What is preserved:
- application identity data
- application status history
- notices
- uploaded documents
- applicant fee requirements
- applicant fee payments

What is not currently done:
- no explicit link from approved application to the created `members` row
- no migration/copy of applicant documents into a member-owned archive
- no unified member dossier that exposes approved application history from the member record

Conclusion:
- Data is not lost.
- Data remains in the application subsystem.
- The approved member record is created, but the historical dossier remains separate.

### 5. After approval, the former applicant stops using the applicant dashboard
The dashboard logic gives applicant view only when the user still has applicant dashboard permission.

Relevant code:
- [backend/app/Http/Controllers/DashboardController.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Http/Controllers/DashboardController.php#L20)
- [backend/database/seeders/RoleSeeder.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/database/seeders/RoleSeeder.php#L138)

Current behavior:
- applicant users have `applications.dashboard.view`
- approved users are moved to role `member`
- `member` role does not have `applications.dashboard.view`
- approved users therefore stop seeing the applicant dashboard and enter the member dashboard path

Implication:
- application history still exists for admins/committee
- the newly approved member no longer has applicant-side visibility into the application dashboard by default

### 6. Review ownership is labeled and gated inconsistently
The applications review tab in member management is currently tied to `members.create` instead of the more accurate applicant-review permission.

Relevant code:
- [frontend/src/pages/Members.tsx](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/src/pages/Members.tsx#L15)
- [frontend/src/pages/Members.tsx](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/src/pages/Members.tsx#L57)
- [backend/routes/api.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/routes/api.php#L78)

Problem:
- The workflow feels like member creation instead of applicant review.
- This blurs responsibility between applicant processing and member administration.

Preferred rule:
- Application review surfaces should be controlled by `applications.review` and related application permissions.
- Member list maintenance should remain a separate responsibility.

### 7. Applicant document visibility is broader than it should be
Any user with `members.view` can currently view applicant documents.

Relevant code:
- [backend/app/Policies/ApplicationDocumentPolicy.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/app/Policies/ApplicationDocumentPolicy.php#L24)

Problem:
- Applicant documents are usually more sensitive than general member-directory access.
- Visibility should normally be limited to:
  - the applicant
  - the membership review team
  - possibly specific admins

Current risk:
- directory viewers can see applicant documents even when they are not part of application review.

## Current Real Flow

### Public Applicant Flow
1. User opens the public membership application page.
2. User submits name, email, password, and current misleading `membership_status` choice.
3. System creates:
   - a `users` record with role `applicant`
   - a `member_applications` record with `status = pending_verification`
4. System sends an email verification token.
5. User verifies the application email.
6. Application becomes `pending_approval`.

### Applicant Portal Flow
1. Applicant logs in using the created portal account.
2. Applicant dashboard can show:
   - application status
   - notices
   - uploaded documents
   - applicant fee targets and payments
3. Applicant can upload required documents while still in the applicant lifecycle.

### Membership Chairman Flow
1. Reviewer opens the application queue.
2. Reviewer checks:
   - identity
   - status
   - stage
   - notices
   - document review results
   - applicant fee targets and payments
3. Reviewer may:
   - set stage
   - post notices
   - review documents
   - set fee requirements
   - record payments
   - approve
   - move to probation
   - reject

### Approval Flow
1. Application must be verified and pending approval.
2. System checks for duplicate member by name and email.
3. System creates a member record.
4. System generates a member number.
5. System links the new member to the same portal user.
6. System changes the user role to `member`.
7. System marks the application as approved.

### Rejection Flow
1. Application is marked `rejected`.
2. Reason may be stored.
3. Login can be blocked for that application account.
4. Record remains for historical/admin access.

## Data Handling After Approval

### What happens today
- Applicant account is reused as the member account.
- New member record is created automatically.
- Approved application record remains in `member_applications`.
- Application documents remain attached to the application record.
- Notices remain attached to the application record.
- Applicant fee data remains attached to the application record.

### What does not happen today
- No explicit application-to-member archive link
- No migration of application documents into a member archive
- No member-facing “application history” section
- No unified lifecycle timeline across applicant and member phases

## Required Target Interpretation

The intended business rule should be treated as:

1. `Applicant` is not yet a club member.
2. Public application should only create applicant records.
3. If the application succeeds and requirements are fulfilled:
   - applicant becomes a member
   - applicant status ends
   - member status begins
4. Historical application data should remain preserved for traceability.
5. The system should make it explicit whether the new member may still view their archived application documents and notices.

## Recommended Target Flow

### Clean lifecycle states
- `applicant`
- `pending_verification`
- `pending_approval`
- `probation`
- `approved`
- `rejected`
- `member_active`
- `member_inactive`

### Recommended business flow
1. Public user submits `Applicant` application only.
2. System creates applicant account and application dossier.
3. User verifies email.
4. Reviewer processes application.
5. On approval:
   - create member record automatically
   - assign member number automatically
   - change user role to member
   - freeze application dossier as historical source
   - link approved application to created member record
6. Member signs in and sees member dashboard, not applicant dashboard.
7. Historical application materials remain available according to policy.

## Navigation / Interface Recommendations

### Public-facing labels
- Replace `Member Application` with `Membership Application` or `Apply for Membership`
- Remove `active` and `inactive` from the public application form
- Keep `Verify Email` as a second step of the same application journey

### Applicant portal structure
- `Application Status`
- `Required Documents`
- `Notices`
- `Fees`

### Reviewer / membership chairman structure
- `Applicant Queue`
- `Applicant Detail`
- `Documents`
- `Stages`
- `Fees`
- `Decision`

### Member portal structure
- `Member Profile`
- `Contributions`
- `Club Services`
- optional `Application Archive`

## UI / Navigation Risks

### Route and label ambiguity
- Current application page mixes applicant and member status concepts.
- Application review appears under member-management framing.
- “Applicant” is treated both as a lifecycle state and as a selectable membership status value.

### Data visibility ambiguity
- It is not explicit whether approved members can still see their application documents.
- It is not explicit whether committee-only materials remain visible post-approval.

### Workflow ambiguity
- The system does perform automatic member creation on approval, but the UI does not explain that clearly.
- The system preserves applicant records, but the UI does not show where that historical data lives after conversion.

## Web Interface / UX Review Notes

### [frontend/src/pages/MemberApplication.tsx](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/src/pages/MemberApplication.tsx)
- `frontend/src/pages/MemberApplication.tsx:14` - applicant form model includes `active` and `inactive`; lifecycle concept is ambiguous
- `frontend/src/pages/MemberApplication.tsx:42` - explanatory copy correctly defines applicant, but the form still offers conflicting member-status choices
- `frontend/src/pages/MemberApplication.tsx:171` - tab labels are acceptable, but the page title should be more explicit about membership intake

### [frontend/src/pages/Members.tsx](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/src/pages/Members.tsx)
- `frontend/src/pages/Members.tsx:15` - applications review access tied to `members.create` instead of `applications.review`
- `frontend/src/pages/Members.tsx:171` - applications are presented as a sub-view of member management; consider a clearer review-domain label

### [frontend/src/pages/PortalDashboard.tsx](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/src/pages/PortalDashboard.tsx)
- `frontend/src/pages/PortalDashboard.tsx:179` - applicant dashboard visibility depends on applicant permissions, so approved members lose that route immediately after role conversion
- `frontend/src/pages/PortalDashboard.tsx:249` - dashboard branching is functional but does not explain lifecycle transitions to the user

## Recommended Follow-up Changes
- Restrict public application submission to `applicant` only
- Move `active` and `inactive` to member-only lifecycle management
- Gate application review UI with `applications.review`
- Add explicit link from approved application to created member record
- Decide and document whether approved members may access archived application documents
- Tighten application-document visibility away from generic `members.view`
- Add member-facing lifecycle copy that explains what happens after approval

## Progress Append Section

Append future implementation notes below this section.

### Progress Log
- 2026-03-07: Baseline applicant/member lifecycle audit created from current repo behavior and UI review.
- 2026-03-08: Added industry-standard workflow recommendations, target lifecycle model, and principle-to-implementation mapping.

## Industry-Standard Workflow Recommendations

### Core Target Model

The recommended industry-standard approach is to separate the following concerns clearly:

- `person lifecycle`
  - `applicant`
  - `member`
- `application status`
  - `draft`
  - `submitted`
  - `email_verified`
  - `under_review`
  - `probation`
  - `approved`
  - `rejected`
  - `withdrawn`
- `member status`
  - `active`
  - `inactive`
  - `suspended`

This avoids mixing:
- whether the person is already a club member
- where the membership application currently stands

### Recommended End-to-End Workflow

1. Public user submits a membership application.
2. System creates:
   - a portal user with role `applicant`
   - an application dossier
3. Applicant verifies email.
4. Application moves to `under_review`.
5. Reviewer checks:
   - identity
   - submitted documents
   - notices and remarks
   - fees and requirements
   - stage/interview progression
6. Reviewer decides:
   - `probation`
   - `approved`
   - `rejected`
7. On approval:
   - create member profile automatically
   - assign member number automatically
   - change portal role from `applicant` to `member`
   - mark application `approved`
   - preserve the dossier as a historical archive
8. Applicant dashboard ends for that user.
9. Member dashboard becomes the active portal view.

### Recommended Data Handling

Industry-standard handling of submitted data and documents:

- do not delete the application dossier after approval
- do not flatten all application history into the member row
- keep the application as the admissions archive
- link the approved application to the created member profile

Recommended data model direction:
- `member_applications.member_id` should be nullable and filled on approval
- application documents should remain attached to the application dossier
- member profile may expose a read-only `Admission Record` or `Application Archive`
- internal committee notes should remain internal unless explicitly designed otherwise

### Recommended UI / Navigation Structure

#### Public
- `Apply for Membership`
- `Verify Application Email`

#### Applicant Portal
- `Application Status`
- `Documents`
- `Fees / Requirements`
- `Notices`

#### Reviewer / Membership Chairman
- `Applicant Queue`
- `Applicant Details`
- `Document Review`
- `Requirements`
- `Decision`

#### Member Portal
- `Profile`
- `Contributions`
- `Club Services`
- optional `Admission Archive`

## Recommended Concrete Improvements For This Repo

1. Remove `active` and `inactive` from the public application form.
2. Rename the page to `Membership Application`.
3. Change application review gating from `members.create` to `applications.review`.
4. Add `member_id` on applications when approved.
5. Keep applicant documents, notices, and fee records attached to the application archive.
6. Decide explicit archive visibility rules for approved members versus reviewer/admin access.
7. Add `under_review` instead of overloading `pending_approval`.
8. Add `withdrawn` so applicants can cancel before approval.
9. Add complete decision timestamps and actor tracking for lifecycle actions.
10. Show a clear post-approval transition message that the person is now a member.

## Foundational Principles vs Implementation Steps

The strongest recommended foundation is:

1. Separate `application status` from `member status`.
2. Make approval create-and-link the member record formally.
3. Preserve application data as an archive.

The concrete implementation steps above are derived from those three principles.

### Principle 1: Separate application status from member status

This principle drives:
- Step 1: remove `active` and `inactive` from the public application form
- Step 2: rename the page to `Membership Application`
- Step 7: add a real review state such as `under_review`
- Step 8: add `withdrawn`

Meaning:
- the public intake flow should deal with applicants and application states only
- member statuses should begin only after approval and conversion

### Principle 2: Formal applicant-to-member conversion

This principle drives:
- Step 3: gate review with `applications.review`
- Step 4: add `member_id` on approved applications
- Step 9: add timestamps and actor tracking
- Step 10: show explicit post-approval conversion messaging

Meaning:
- approval should be treated as a formal transition event
- the system should clearly record when that transition happened, who performed it, and what record was created

### Principle 3: Preserve the application dossier as archive

This principle drives:
- Step 5: keep documents/notices/fees attached to the application archive
- Step 6: define access rules for archived dossier visibility

Meaning:
- applicant materials should remain historically traceable
- the system should preserve admissions evidence without confusing it with the live member profile

## Summary Interpretation

The three foundational principles are the architectural decisions.

The ten recommended changes are the repo-level implementation plan that realizes those decisions.

Mapping summary:
- Principle A: separate statuses
  - Steps `1, 2, 7, 8`
- Principle B: formal applicant-to-member conversion
  - Steps `3, 4, 9, 10`
- Principle C: preserve application archive
  - Steps `5, 6`

## Progress Log

### 2026-03-08 - Local implementation slice 1

Implemented locally:
- public application is now applicant-only
- public page terminology now uses `Membership Application`
- review state changed from `pending_approval` to `under_review`
- application review surfaces are gated by `applications.review`
- approved applications now store `member_id` linking the created member record
- applicant document visibility was tightened away from generic member-directory access

Verified locally:
- `cd backend && php artisan migrate --force`
- `cd backend && composer test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

### 2026-03-08 - Local implementation slice 2

Implemented locally:
- applicant self-withdraw flow via `POST /api/v1/member-applications/me/withdraw`
- archived application access for the same account via `GET /api/v1/member-applications/archive/me`
- member/general dashboard payload now signals archive availability
- portal now exposes a read-only `Application Archive` tab for approved-member history
- applicant portal now has an explicit `Withdraw Application` action while status is still open
- withdrawal now uses explicit lifecycle status `withdrawn`
- blocked login messaging now distinguishes withdrawn vs rejected application outcomes
- public/applicant microcopy updated to reflect `under_review` and archive-aware flow

Verified locally:
- `cd backend && php artisan migrate --force`
- `cd backend && composer test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

Still not implemented in this slice:
- dedicated member-facing dossier timeline beyond the read-only archive tab
- committee/internal note separation beyond current document/notices access rules
- optional applicant `withdrawn` re-entry guidance or reapply shortcut in the public portal

### 2026-03-08 - Local implementation slice 3

Implemented locally:
- applicant notices now support explicit visibility split:
  - `applicant`
  - `internal`
- applicant and archive views now exclude internal committee notes
- committee review view now shows both applicant-visible notices and internal-only notes with visibility labels
- archive now includes a read-only lifecycle timeline derived from submission, verification, review, and member-profile creation events
- public membership application page now includes reapply guidance for previously withdrawn or closed applications
- committee review panel now defaults to `under_review` items instead of mixing archive states into the active review queue
- applicant document visibility was tightened further by removing generic `users.view` access

Verified locally:
- `cd backend && php artisan migrate --force`
- `cd backend && composer test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

Residual gap after slice 3:
- there is still no dedicated reapply shortcut or workflow transfer from an archived application into a new draft; re-entry guidance is now explicit, but the system still expects a fresh new submission

### 2026-03-08 - Local implementation slice 4

Implemented locally:
- public reapply shortcut via `POST /api/v1/member-applications/reapply`
- reapply uses the archived application email to start a fresh `pending_verification` application
- archived application remains immutable; the new reapplication creates a separate new record
- reapply resets the applicant account back into a fresh verification cycle using a new password and verification token
- public membership application page now includes a dedicated `Reapply` tab instead of guidance-only copy

Verified locally:
- `cd backend && php artisan migrate --force`
- `cd backend && composer test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

Current lifecycle state after slice 4:
- public intake supports fresh application
- public intake supports archived withdrawal/rejection reapplication
- active applicant lifecycle supports verification, review, and self-withdraw
- approved/rejected/withdrawn lifecycle outcomes preserve a read-only archive

### 2026-03-08 - Local refinement slice 5

Implemented locally:
- dashboard resolver now treats only `pending_verification` and `under_review` as active applicant workflow states
- archived applications no longer reopen the active applicant dashboard path
- archived applicants without a linked member profile now resolve to general view plus archive availability instead of active applicant view
- portal dashboard applicant lifecycle fields now use explicit shared status unions instead of generic strings
- member-application ownership and archive/open status rules were consolidated so dashboard and applicant endpoints follow the same lifecycle split
- archive tab visibility now follows the dashboard contract instead of disappearing silently on archive fetch failure
- regression coverage now checks that archived applicant records stay out of the active applicant dashboard flow

Verified locally:
- `cd backend && php artisan migrate --force`
- `cd backend && composer test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

### 2026-03-08 - Rebaseline after remote history rewrite

Direction change:
- The recovered branch is now based on rewritten `origin/main` (`a80a8fa6d1154e6557bd09b5e6c7d5075e7623c1`) and must not reintroduce purged internal documentation.
- Public intake must be split into two distinct flows:
  - `member-registration`
  - `applicant-registration`

Revised business rules:
- `member-registration` is for existing club members who are not yet included in the system.
- `applicant-registration` is for outsiders applying to join.
- Approval in the applicant flow does **not** immediately convert the user into a full member.
- Approved applicants become **official applicants** first, not members.
- Official applicants must be able to see, in their dashboard:
  - requirements
  - 5I progress:
    - Interview
    - Introduction (Balloting)
    - Initiation
    - Incubation
    - Induction
  - uploaded documents
  - applicant contribution/requirement progress
- Official applicants must be able to upload scanned documents, including mobile-friendly capture/upload behavior.
- Applicant contribution tracking must support a selected batch treasurer assigned by the membership chairman.
- The selected batch treasurer should have an applicant-finance workspace similar to the club treasurer for applicant-side contribution input/correction.

UI/route rules:
- `member-registration` page copy should address existing club-member registration only.
- `applicant-registration` page copy should address outsiders/applicants only.
- Neither page should appear in the public navbar by default.

Recommended exposure rule:
- Keep both routes off-navbar.
- `applicant-registration` may be distributed through direct links or targeted calls-to-action.
- `member-registration` should remain controlled/semi-private and preferably issued through internal onboarding instructions.

Implementation impact:
- The previous local assumption `approved applicant -> member conversion` is no longer the target model.
- Applicant lifecycle code must be refactored so approval produces an official-applicant state with continued dashboard access.
- Member conversion should move to a later stage in the lifecycle, likely after induction or explicit committee completion criteria.

### 2026-03-08 - Local implementation slice 6

Implemented locally:
- applicant lifecycle now distinguishes:
  - `pending_verification`
  - `under_review`
  - `official_applicant`
  - `eligible_for_activation`
  - `activated`
  - `rejected`
  - `withdrawn`
- chairman approval now moves an applicant into `official_applicant` instead of creating a member immediately
- activation readiness is now computed from:
  - approved official-applicant decision
  - current 5I stage at `Induction`
  - all uploaded applicant documents approved
  - all configured applicant contribution/requirement targets fully paid
  - no existing linked member profile
- chairman now has a separate activation action that creates the member profile, assigns the member number, switches the user role to `member`, and archives the applicant dossier as `activated`
- applicant batches are now first-class records with:
  - batch name
  - description
  - start date
  - target completion date
  - assigned batch treasurer
- applicants can be assigned to a batch from committee review
- applicant dashboards now show assigned batch context and shared batch materials
- applicant batch documents are stored separately from applicant-submitted personal documents
- batch treasurers can now log applicant contribution payments for applicants in their assigned batch without gaining chairman review authority
- public routes are now split for intake:
  - applicant flow:
    - `POST /api/v1/applicant-registrations`
    - `POST /api/v1/applicant-registrations/reapply`
    - `POST /api/v1/applicant-registrations/verify`
  - member registration flow:
    - `POST /api/v1/member-registrations`
    - `POST /api/v1/member-registrations/verify`
- frontend public routes are now split:
  - `/applicant-registration`
  - `/member-registration`
  - legacy `/member-application` redirects to `/applicant-registration`

Behavioral outcome:
- outsider applicant:
  - applies
  - verifies email
  - enters review
  - if approved, becomes an official applicant
  - continues months-long training and requirements tracking in-app
  - is activated as a member only when readiness checks pass and the chairman confirms activation
- existing club member not yet in system:
  - uses member registration
  - verifies email
  - gets immediate member portal activation

Data handling rule:
- applicant personal documents stay attached to the applicant dossier
- shared batch materials stay attached to the applicant batch
- activation creates the member profile but does not flatten or overwrite the applicant dossier history
