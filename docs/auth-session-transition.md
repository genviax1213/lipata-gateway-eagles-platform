# Auth Session Transition Notes

## Current default
- Frontend now uses Sanctum SPA session authentication by default.
- Client initializes CSRF cookie from `/sanctum/csrf-cookie`, then calls `/api/v1/login`.
- Authenticated state is resolved via `/api/v1/user` (cookie-backed session).

## Backward compatibility
- Legacy bearer tokens are still accepted by API routes through `auth:sanctum`.
- Frontend still supports legacy token mode for transitional environments:
  - Set `VITE_AUTH_MODE=token` to store and send `auth_token` as bearer token.

## Required backend environment alignment
- `FRONTEND_URL` should point to the SPA origin.
- `SANCTUM_STATEFUL_DOMAINS` must include SPA host:port (or use provided defaults).
- `CORS_ALLOWED_ORIGINS` must include SPA origin(s).
- CORS credentials must stay enabled.

## Security posture improvements in this transition
- Added logout endpoint with token/session revocation.
- Added throttling on public auth and application verification endpoints.
- Removed hardcoded super-admin email bypasses in controllers.
- Member-application verification token is delivered by email notification and is no longer returned by API response payload.
- Added request correlation IDs (`X-Request-Id`) for API responses and log context.
