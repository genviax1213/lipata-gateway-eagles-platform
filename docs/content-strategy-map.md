# Content Strategy Map

## Audit Outcome (Content Quality)
- Redundancy: previously present in login entry points and repeated auth/onboarding copy; now reduced via canonical routes and shared microcopy constants.
- Low-quality design risk: previously present in trust-critical flow clarity; now improved by enforcing consistent page hierarchy (`Current Status` -> `Available Actions` -> `Next Step`) and role-aware task language.
- Remaining quality target: continue tightening non-critical admin utility screens to the same hierarchy and microcopy standard.

## Canonical Journeys

### Applicant
- Entry: `/member-application`
- Steps: Submit application -> verify email/token -> track dashboard notices/documents/fees -> chairman decision
- Primary page structure: `Current Status` -> `Available Actions` -> `Next Step`

### Member
- Entry: `/login` -> `/portal`
- Steps: Authenticate -> review personal contribution records -> follow notices/assigned tasks
- Primary page structure: `Current Status` -> `Available Actions` -> `Next Step`

### Officer/Admin/Chairman/Treasurer/Auditor
- Entry: `/login` -> `/portal`
- Steps: Authenticate -> review task snapshot -> use committee/finance/admin panels per assigned permissions
- Primary page structure: `Current Status` -> `Available Actions` -> `Next Step`

## Route Intent
- Canonical login: `/login`
- Legacy aliases: `/member-login`, `/portal-login` (redirect to canonical login)
- Canonical password reset: `/member-reset-password`

## Homepage vs Activities Intent
- Homepage `Community In Action` (featured `activities`):
  - Purpose: curated highlights and high-impact teaser stories.
  - Scope: limited subset designed to drive exploration.
  - Primary CTA: `Read Article` and `View Activities`.
- Activities page (`activities`):
  - Purpose: full archive and timeline for activity/community project content.
  - Scope: comprehensive paginated listing, including older and less-promoted records.
  - Primary CTA: deep reading and historical reference.

Editorial rule:
- Publish activity content to `activities`.
- Mark selected `activities` posts as featured to surface them in homepage highlights.
- Activities remains the canonical archive; homepage remains the teaser surface.

## Microcopy Standards
- Errors: short, specific, action-oriented
- Success: confirm outcome + immediate next action
- Next-step prompts: always present for auth and onboarding flows
