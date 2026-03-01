# Incident Response Log Queries

Use these queries to investigate auth, role, finance, and applicant workflow events emitted by the API.

## Required context
- Response header: `X-Request-Id`
- Core actor fields in logs: `actor_user_id`, `target_user_id`/`application_id`/`request_id`

## Local file query examples

Find all events for a request correlation ID:
```bash
rg 'request_id":"<REQUEST_ID>"' backend/storage/logs/laravel.log
```

Find authentication events:
```bash
rg 'auth\\.(login_failed|login_blocked|login_success|logout)' backend/storage/logs/laravel.log
```

Find role and user administration changes:
```bash
rg 'admin\\.(role_assigned|role_updated|user_created|user_updated|user_deleted)' backend/storage/logs/laravel.log
```

Find applicant decision lifecycle:
```bash
rg 'application\\.(document_reviewed|stage_updated|notice_set|approved|probation_set|rejected)' backend/storage/logs/laravel.log
```

Find applicant fee operations:
```bash
rg 'application\\.(fee_requirement_set|fee_payment_recorded)' backend/storage/logs/laravel.log
```

Find finance edit approvals/rejections:
```bash
rg 'finance\\.edit_request_(approved|rejected)' backend/storage/logs/laravel.log
```

## Investigation sequence
1. Capture `X-Request-Id` from failing or suspicious API response.
2. Query by `request_id` first to reconstruct single-request timeline.
3. Expand by `actor_user_id` to identify adjacent actions.
4. Expand by `application_id` or `request_id` (finance edit request) for workflow history.
