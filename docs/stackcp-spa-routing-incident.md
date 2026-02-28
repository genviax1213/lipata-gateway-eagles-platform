# StackCP Incident: React Routes Return 404 on Refresh/Direct URL

Date: 2026-02-28
Environment: `https://lgec.org` (Apache on StackCP)

## Fault Observed

- Homepage loads at `/`.
- Navigating in-app to routes like `/activities` works (client-side navigation).
- Refreshing browser or opening a direct URL like `/activities` returns server `404 Not Found`.
- Scope: affects all React client routes (`/about`, `/history`, `/activities`, `/news`, `/contact`, `/portal/*`, etc.), not only `/activities`.

## Evidence

- `curl https://lgec.org/` => `200`
- `curl https://lgec.org/activities` => `404`
- Response headers identify Apache web server.

## Root Cause

The frontend uses `BrowserRouter` (History API). Direct URL requests hit Apache first.  
Apache was not configured with SPA fallback rewrite to `index.html`, so non-file/non-directory routes are treated as missing server paths and return 404.

## Solution Applied

Added Apache rewrite fallback file in repo:

- `frontend/public/.htaccess`

Rules added:

1. Serve existing files/directories normally.
2. Exclude backend endpoints (`/api/*`, `/sanctum/*`) from SPA rewrite.
3. Rewrite all other requests to `index.html` so React Router resolves routes client-side.

Also applied live on host via SSH in the active web root:

- `/home/sites/35b/4/4ffed8199b/home/3088588/public_html/.htaccess`

The live `.htaccess` now keeps API passthrough and adds SPA fallback for all non-file routes.

## Validation Results (Live)

- `https://lgec.org/` => `200`
- `https://lgec.org/about` => `200`
- `https://lgec.org/activities` => `200`
- `https://lgec.org/history` => `200`
- `https://lgec.org/news` => `200`
- `https://lgec.org/portal/forum` => `200`

## Deployment Notes (If Re-Deploying Frontend)

1. Build frontend: `cd frontend && npm run build`
2. Upload built artifacts from `frontend/dist/` to web root.
3. Ensure `frontend/public/.htaccess` is present in deployed root as `.htaccess`.
4. Purge CDN/cache after deploy.
5. Validate:
   - `https://lgec.org/activities` loads (no 404)
   - refresh on `/portal/...` routes works

Keep `.htaccess` in the deployed web root after every frontend upload, otherwise route-refresh 404 will return.

## Follow-up Fault: Homepage Shows "Set Homepage Hero in CMS"

Date: 2026-02-28

### Fault Observed

- Homepage sometimes displays fallback text:
  - `Set Homepage Hero in CMS`
  - `Create a published post in section homepage_hero...`

### Checks Performed

- Live content endpoint is healthy and returns data:
  - `GET https://lgec.org/api/index.php/api/v1/content/homepage_hero` => `200` with published record(s).
- Deployed frontend bundle is current and points to production API base:
  - `https://lgec.org/assets/index-CVCcakpS.js` contains `https://lgec.org/api/index.php/api/v1`.
- Same result verified for `www` host:
  - `https://www.lgec.org/api/index.php/api/v1/content/homepage_hero` => `200`.

### Cause

Most likely client/CDN cache inconsistency (older JS or stale runtime state) rather than missing CMS content or broken API.

### Fix

1. Purge CDN cache for `lgec.org` and `www.lgec.org`.
2. Hard refresh browser (`Ctrl+Shift+R`) or clear site data for the domain.
3. Re-open homepage and verify hero title/excerpt loads from API.

### Verification Snapshot

- `https://lgec.org/` and `https://www.lgec.org/` both serve the same current bundle file (`index-CVCcakpS.js`).
- API hero endpoint responds with published `homepage_hero` data.

## Follow-up Remediation Applied: Remove CMS Placeholder Text

Date: 2026-02-28

### Change

Updated homepage fallback copy so user-facing CMS setup prompts are never shown.

File changed:

- `frontend/src/pages/Landing.tsx`

Updated fallback values:

- Title fallback: `Lipata Gateway Eagles Club`
- Excerpt fallback: `Service Through Strong Brotherhood.`

### Deployment

- Built frontend bundle and deployed to live docroot:
  - `/home/sites/35b/4/4ffed8199b/home/3088588/public_html`
- Live homepage now serves updated bundle:
  - `index-CaHKf2Ge.js`

## Follow-up Deployment Incident: API 404/500 After Frontend Sync

Date: 2026-02-28

### Fault Observed

- After syncing `frontend/dist` with `rsync --delete` into `public_html`, frontend routes loaded but API calls failed.
- `GET https://lgec.org/api/index.php/api/v1/content/homepage_hero` returned `404`, then `500`.
- Browser symptom included homepage fallback behavior due failed hero API fetch.

### Root Cause

1. `rsync --delete` removed non-frontend runtime entries in docroot (`api`, `backend`, `storage` links).
2. Recreated API bridge initially executed under Apache PHP `7.0.33`, while Laravel runtime required newer PHP.
3. API path was restored but failed with platform/runtime mismatch until PHP handler was pinned.

### Solution Applied

1. Restored docroot runtime links:
   - `public_html/backend -> ../../../backend`
   - `public_html/storage -> ../../../backend/storage/app/public`
   - `public_html/api -> ../../../backend/public`
2. Pinned backend public PHP handler to 8.4 by adding at top of:
   - `backend/public/.htaccess`
   - `AddHandler x-httpd-php84 .php`
3. Re-ran Laravel maintenance using PHP 8.4 CLI:
   - `/usr/php84/usr/bin/php artisan migrate --force --no-interaction`
   - `/usr/php84/usr/bin/php artisan optimize:clear`
   - `/usr/php84/usr/bin/php artisan config:cache`
   - `/usr/php84/usr/bin/php artisan route:cache`
   - `/usr/php84/usr/bin/php artisan view:cache`

### Live Validation

- `https://lgec.org/` => `200`
- `https://lgec.org/activities` => `200`
- `https://lgec.org/api/index.php/api/v1/content/homepage_hero` => `200`
- Live frontend bundle: `assets/index-qW__G2M6.js`

### Prevent Recurrence

- Do not run docroot sync with unqualified `--delete` unless preserving runtime links.
- If using `rsync --delete`, include protect/exclude rules for `api`, `backend`, and `storage`.
- Keep API handler pinned to required PHP runtime in `backend/public/.htaccess`.

## Follow-up Editor Incident: Image Resize Handle Not Visible

Date: 2026-03-01

### Fault Observed

- In CMS/forum rich-text editor, selecting an image showed width buttons but no visible drag handle for direct resize.

### Root Cause

1. Resize handle element existed in editor JSX but had no CSS rule, so it had no visible rendered style.
2. Editor container needed reliable relative positioning for absolute handle placement.

### Solution Applied

1. Added editor container positioning:
   - `frontend/src/index.css`
   - `.rich-editor-container { position: relative; }`
2. Added visible resize handle style:
   - `.rich-editor-container .image-resize-handle { ... }`
   - includes `position: absolute`, size, color, border, `cursor: se-resize`, and `touch-action: none`.
3. Added selected-image visual outline to confirm active image target:
   - `.rich-editor-container .ProseMirror img.ProseMirror-selectednode { ... }`
4. Rebuilt frontend and deployed to StackCP docroot without destructive delete.

### Verification

- Frontend checks:
  - `cd frontend && npm run lint` => pass
  - `cd frontend && npm run build` => pass
- Live routes/API:
  - `https://lgec.org/` => `200`
  - `https://lgec.org/activities` => `200`
  - `https://lgec.org/api/index.php/api/v1/content/homepage_hero` => `200`
- Live assets updated:
  - `assets/index-uvk7Sq4P.js`
  - `assets/index-CsUQqFrA.css`
