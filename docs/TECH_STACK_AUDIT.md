# Technology Stack Audit

Date: 2026-03-02  
Repository: `lipata-gateway-eagles-platform`

## Scope
This audit inventories the technology stack actually used in the repository across frontend, backend, data, auth/security, testing, CI/CD, and deployment.

## Sources Reviewed
- [CLAUDE.md](/mnt/rll/projects/lipata-gateway-eagles-platform/CLAUDE.md)
- [backend/composer.json](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/composer.json)
- [backend/package.json](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/package.json)
- [backend/phpunit.xml](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/phpunit.xml)
- [backend/.env.example](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/.env.example)
- [backend/routes/api.php](/mnt/rll/projects/lipata-gateway-eagles-platform/backend/routes/api.php)
- [frontend/package.json](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/package.json)
- [frontend/vite.config.ts](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/vite.config.ts)
- [frontend/.env.example](/mnt/rll/projects/lipata-gateway-eagles-platform/frontend/.env.example)
- [.github/workflows/ci.yml](/mnt/rll/projects/lipata-gateway-eagles-platform/.github/workflows/ci.yml)
- [.github/workflows/deploy.yml](/mnt/rll/projects/lipata-gateway-eagles-platform/.github/workflows/deploy.yml)

## Stack Inventory

### 1) Frontend Application Stack
- Framework: React 19
- Language: TypeScript 5.9
- Build tool: Vite 7
- Routing: `react-router-dom` 7
- Styling: Tailwind CSS 4 (+ PostCSS + Autoprefixer)
- HTTP client: Axios
- Rich text editor: TipTap v3 (`@tiptap/react`, starter-kit, image/link/placeholder extensions)
- Sanitization: DOMPurify
- Realtime client libs present: `laravel-echo`, `pusher-js`
- Visualization libs present: `@nivo/heatmap`, `react-countup`, `react-grid-layout`

### 2) Backend API Stack
- Framework: Laravel 12
- Language runtime: PHP 8.2+
- Auth: Laravel Sanctum (`auth:sanctum`)
- Runtime/dev tools: Tinker, Pail, Pint, Sail (dev dependency)
- Realtime server library present: `pusher/pusher-php-server`

### 3) Data Layer Stack
- ORM/query layer: Eloquent + Laravel query builder
- Migrations/seeders: Laravel native
- Runtime DB in local repo reality: MySQL (`backend/.env` shows `DB_CONNECTION=mysql`)
- Test DB: in-memory SQLite (`backend/phpunit.xml` sets `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`)
- Cache/session/queue stores configured (default local): database-backed (`CACHE_STORE=database`, `SESSION_DRIVER=database`, `QUEUE_CONNECTION=database`)

### 4) Authentication and Security Stack
- Auth modes supported:
  - Session/cookie (Sanctum SPA mode)
  - Legacy token mode (backward-compatible)
- API versioning/prefix: `/api/v1`
- Public sensitive route throttling in place (login/reset/application endpoints)
- Role/permission authorization + policy coverage (member, posts, forum, finance, admin-user scopes)
- Structured audit logging and request-correlation support documented in backend docs

### 5) Testing and Quality Stack
- Backend tests: PHPUnit 11 (`php artisan test`)
- Frontend checks: ESLint + TypeScript build (`npm run lint`, `npm run build`)
- CI (GitHub Actions):
  - PHP 8.2 backend tests on Ubuntu
  - Node 22 frontend lint/build on Ubuntu

### 6) Build and Tooling Stack
- Frontend package manager: npm (`package-lock.json`)
- Backend dependency manager: Composer (`composer.lock`)
- Backend frontend-assets bundling: Vite + `laravel-vite-plugin` + Tailwind Vite plugin
- Development concurrency (backend): `concurrently` via `composer dev`

### 7) Deployment Stack (from workflow)
- CI/CD platform: GitHub Actions
- Deploy target: SSH-based remote host (`serverbyt.net` default fallback)
- Frontend deploy: rsync static `frontend/dist` to remote directory
- Backend deploy: git pull + composer install (no-dev) + migrate + cache optimize on remote

## Reconciliation Notes (CLAUDE.md vs Repo Reality)
- `CLAUDE.md` mentions backend SQLite in project overview.
- Current repository runtime reality is mixed:
  - Local app runtime uses MySQL (`backend/.env`).
  - Automated tests use in-memory SQLite (`backend/phpunit.xml`).
- This dual-database setup should be treated as the authoritative stack baseline unless changed by explicit migration strategy.

## Recommended Documentation Policy
- Keep this file as the canonical stack inventory.
- Update this file when any of the following change:
  - framework major versions
  - auth mode strategy
  - runtime database engine
  - CI/CD runtime versions
  - deployment mechanism
