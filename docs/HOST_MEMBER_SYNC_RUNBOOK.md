# HOST_MEMBER_SYNC_RUNBOOK

Date: 2026-03-03

## Goal

Seed production host from **local members data only**, then sync host `users` and `members` links, while keeping temporary accounts untouched.

## New Artisan Commands

- `php artisan members:export-json {path}`
- `php artisan members:import-json {path} --sync-users --skip-temp-users --default-password="..."`

## Temporary User Protection

`members:import-json` with `--skip-temp-users` will not alter:

- `temp.*@lipataeagles.ph`
- `admin@lipataeagles.ph`

This protects temporary/demo/admin temporary login setup from accidental overwrite.

## Recommended Execution

### 1. Local: export members-only data

```bash
cd backend
php artisan members:export-json storage/app/seed/members-only.json
```

### 2. Transfer JSON to host backend

Use SCP/rsync to copy:

- local: `backend/storage/app/seed/members-only.json`
- host: `~/backend/storage/app/seed/members-only.json`

### 3. Host: run host-side baseline seeders

Seed role/permission and host-native defaults directly on host.

```bash
cd ~/backend
/usr/php84/usr/bin/php artisan db:seed --class=RoleSeeder --force --no-interaction
/usr/php84/usr/bin/php artisan db:seed --class=AdminSeeder --force --no-interaction
```

Run additional host-only seeders as needed.

### 4. Host: import members-only dataset + sync users/members

```bash
cd ~/backend
/usr/php84/usr/bin/php artisan members:import-json storage/app/seed/members-only.json \
  --sync-users \
  --skip-temp-users \
  --default-password="<strong-initial-password>"
```

Notes:
- `--default-password` is only used for newly created member users.
- Existing users are linked/updated by member email and `member.user_id` sync.

### 5. Host: clear/cache Laravel config

```bash
cd ~/backend
/usr/php84/usr/bin/php artisan optimize:clear
/usr/php84/usr/bin/php artisan config:cache
```

## Verification Checklist

1. Members count matches expected source count.
2. For sampled records, `members.user_id` is populated and points to correct `users.id`.
3. Temporary users can still log in with existing temp credentials.
4. Applicant and member portals still load expected data.
