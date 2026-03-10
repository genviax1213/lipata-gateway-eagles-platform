Task: Update local repo state, remote branch, and deployed host with the recent hero-loading fix. Do not seed or change existing account passwords.
Plan step: Inspect git/deploy context, commit changed files, push branch, then deploy to host if target is discoverable.
Branch/commit: recovery/applicant-member-flow @ current HEAD before commit
Expected files: frontend/src/pages/Landing.tsx, frontend/src/components/landing/HeroFeatureCard.tsx, frontend/src/index.css, .codex/continuity-checkpoint.md
Verification: frontend build passed; targeted eslint passed; repo-wide lint has unrelated pre-existing issue in frontend/src/components/SecretaryAttendancePanel.tsx.
Next action: Discover deployment host/process, then commit and push hero fix before updating the host.
