<?php

use App\Models\Member;
use App\Models\FormalPhoto;
use App\Models\Role;
use App\Models\User;
use App\Models\ApplicantDocument;
use App\Support\TextCase;
use Carbon\Carbon;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('members:import-sheet {path : Absolute or relative CSV path}', function (string $path) {
    $csvPath = Str::startsWith($path, DIRECTORY_SEPARATOR)
        ? $path
        : base_path($path);

    if (!is_file($csvPath)) {
        $this->error("CSV file not found: {$csvPath}");
        return 1;
    }

    $handle = fopen($csvPath, 'r');
    if ($handle === false) {
        $this->error("Unable to open CSV file: {$csvPath}");
        return 1;
    }

    $header = fgetcsv($handle);
    if (!is_array($header)) {
        fclose($handle);
        $this->error('CSV header row is missing.');
        return 1;
    }

    $normalizedHeader = array_map(static fn ($value) => Str::lower(trim((string) $value)), $header);
    $index = static fn (string $column) => array_search(Str::lower($column), $normalizedHeader, true);

    $requiredColumns = [
        'name',
        'spouse',
        'contact number',
        'address',
        'date of birth',
        'batch',
        'induction date',
        'timestamp',
    ];

    foreach ($requiredColumns as $column) {
        if ($index($column) === false) {
            fclose($handle);
            $this->error("Missing required CSV column: {$column}");
            return 1;
        }
    }

    $parseDate = static function (?string $raw): ?string {
        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    };

    $parseTimestamp = static function (?string $raw): ?string {
        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->toDateTimeString();
        } catch (\Throwable) {
            return null;
        }
    };

    $nextNumberSeed = (int) Member::query()->count() + 1;
    $created = 0;
    $updated = 0;
    $row = 1;

    while (($data = fgetcsv($handle)) !== false) {
        $row++;
        if (!is_array($data)) {
            continue;
        }

        $fullName = trim((string) ($data[$index('name')] ?? ''));
        if ($fullName === '') {
            continue;
        }

        $parts = preg_split('/\s+/', $fullName) ?: [];
        $parts = array_values(array_filter($parts, static fn ($part) => $part !== ''));
        if ($parts === []) {
            continue;
        }

        $first = (string) TextCase::title(array_shift($parts));
        $last = (string) TextCase::title((string) array_pop($parts));
        $middle = $parts !== []
            ? (string) TextCase::title(implode(' ', $parts))
            : null;

        if ($last === '') {
            $last = $first;
        }

        $spouse = trim((string) ($data[$index('spouse')] ?? ''));
        $contact = trim((string) ($data[$index('contact number')] ?? ''));
        $normalizedContact = $contact !== '' ? preg_replace('/\s+/', '', $contact) : null;
        $address = trim((string) ($data[$index('address')] ?? ''));
        $batch = trim((string) ($data[$index('batch')] ?? ''));

        $attributes = [
            'first_name' => $first,
            'middle_name' => $middle !== '' ? $middle : null,
            'last_name' => $last,
        ];

        $member = null;

        if ($normalizedContact !== null && $normalizedContact !== '') {
            $member = Member::query()
                ->where('contact_number', $normalizedContact)
                ->first();
        }

        if (!$member) {
            $member = Member::query()->where($attributes)->first();
        }

        if (!$member) {
            $member = Member::query()
                ->where('first_name', $first)
                ->where('last_name', $last)
                ->where(function ($query) use ($batch) {
                    $query->where('batch', (string) TextCase::title($batch))
                        ->orWhereNull('batch');
                })
                ->first();
        }

        if (!$member) {
            do {
                $candidate = 'IMP-'.now()->format('Ymd').'-'.str_pad((string) $nextNumberSeed, 4, '0', STR_PAD_LEFT);
                $nextNumberSeed++;
            } while (Member::query()->where('member_number', $candidate)->exists());

            $member = new Member([
                ...$attributes,
                'member_number' => $candidate,
                'membership_status' => 'active',
            ]);
            $created++;
        } else {
            $updated++;
        }

        $member->fill([
            'spouse_name' => ($spouse === '' || Str::lower($spouse) === 'n/a') ? null : (string) TextCase::title($spouse),
            'contact_number' => $normalizedContact,
            'address' => $address !== '' ? $address : null,
            'date_of_birth' => $parseDate((string) ($data[$index('date of birth')] ?? '')),
            'batch' => $batch !== '' ? (string) TextCase::title($batch) : null,
            'induction_date' => $parseDate((string) ($data[$index('induction date')] ?? '')),
            'source_submitted_at' => $parseTimestamp((string) ($data[$index('timestamp')] ?? '')),
        ]);
        $member->save();
    }

    fclose($handle);

    $this->info("Members import complete. Created: {$created}, Updated: {$updated}");
    $this->line('Profile picture column was intentionally ignored per instruction.');

    return 0;
})->purpose('Import members from a Google Sheet CSV export');

Artisan::command('documents:migrate-applicant-storage {--dry-run : Show migration results without writing changes} {--chunk=200 : Chunk size}', function () {
    $dryRun = (bool) $this->option('dry-run');
    $chunkSize = max(1, (int) $this->option('chunk'));

    $stats = [
        'scanned' => 0,
        'already_local' => 0,
        'migrated' => 0,
        'missing_public' => 0,
        'failed' => 0,
    ];

    ApplicantDocument::query()
        ->where('file_path', 'like', 'application-docs/%')
        ->orderBy('id')
        ->chunkById($chunkSize, function ($documents) use (&$stats, $dryRun) {
            foreach ($documents as $document) {
                $stats['scanned']++;
                $path = (string) $document->file_path;

                if (Storage::disk('local')->exists($path)) {
                    $stats['already_local']++;
                    continue;
                }

                if (!Storage::disk('public')->exists($path)) {
                    $stats['missing_public']++;
                    continue;
                }

                if ($dryRun) {
                    $stats['migrated']++;
                    continue;
                }

                try {
                    $stream = Storage::disk('public')->readStream($path);
                    if (!is_resource($stream)) {
                        throw new RuntimeException("Unable to open source stream for {$path}");
                    }

                    $written = Storage::disk('local')->writeStream($path, $stream);
                    if (is_resource($stream)) {
                        fclose($stream);
                    }
                    if (!$written) {
                        throw new RuntimeException("Unable to write destination stream for {$path}");
                    }

                    Storage::disk('public')->delete($path);
                    $stats['migrated']++;
                } catch (\Throwable $exception) {
                    $stats['failed']++;
                    $this->warn("Failed migrating document #{$document->id} ({$path}): {$exception->getMessage()}");
                }
            }
        });

    $mode = $dryRun ? 'DRY RUN' : 'EXECUTION';
    $this->info("Applicant document migration ({$mode}) complete.");
    $this->line("Scanned: {$stats['scanned']}");
    $this->line("Already local: {$stats['already_local']}");
    $this->line($dryRun ? "Would migrate: {$stats['migrated']}" : "Migrated: {$stats['migrated']}");
    $this->line("Missing in public disk: {$stats['missing_public']}");
    $this->line("Failed: {$stats['failed']}");

    return $stats['failed'] > 0 ? 1 : 0;
})->purpose('Migrate applicant documents from public disk to local private disk');

Artisan::command('members:export-json {path : Target JSON path (absolute or relative to backend base)}', function (string $path) {
    $outputPath = Str::startsWith($path, DIRECTORY_SEPARATOR)
        ? $path
        : base_path($path);

    $dir = dirname($outputPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    $members = Member::query()
        ->orderBy('id')
        ->get([
            'member_number',
            'first_name',
            'middle_name',
            'last_name',
            'spouse_name',
            'email',
            'membership_status',
            'contact_number',
            'address',
            'date_of_birth',
            'batch',
            'induction_date',
            'source_submitted_at',
        ])
        ->map(fn (Member $member) => [
            'member_number' => $member->member_number,
            'first_name' => $member->first_name,
            'middle_name' => $member->middle_name,
            'last_name' => $member->last_name,
            'spouse_name' => $member->spouse_name,
            'email' => $member->email,
            'membership_status' => $member->membership_status,
            'contact_number' => $member->contact_number,
            'address' => $member->address,
            'date_of_birth' => $member->date_of_birth,
            'batch' => $member->batch,
            'induction_date' => $member->induction_date,
            'source_submitted_at' => $member->source_submitted_at,
        ])
        ->values()
        ->all();

    file_put_contents($outputPath, json_encode($members, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    $this->info('Exported members: '.count($members));
    $this->line("Path: {$outputPath}");

    return 0;
})->purpose('Export members-only dataset to JSON for host sync');

Artisan::command('members:import-json {path : Source JSON path (absolute or relative to backend base)} {--sync-users : Create/link member users after import} {--default-password= : Initial password for newly created member users} {--skip-temp-users : Do not alter temporary accounts}', function (string $path) {
    $sourcePath = Str::startsWith($path, DIRECTORY_SEPARATOR)
        ? $path
        : base_path($path);

    if (!is_file($sourcePath)) {
        $this->error("JSON file not found: {$sourcePath}");
        return 1;
    }

    $json = file_get_contents($sourcePath);
    $rows = json_decode((string) $json, true);
    if (!is_array($rows)) {
        $this->error('Invalid JSON payload.');
        return 1;
    }

    $syncUsers = (bool) $this->option('sync-users');
    $skipTempUsers = (bool) $this->option('skip-temp-users');
    $defaultPassword = trim((string) $this->option('default-password'));
    if ($syncUsers && $defaultPassword === '') {
        $defaultPassword = (string) env('MEMBER_SYNC_DEFAULT_PASSWORD', '');
    }

    $memberRoleId = Role::query()->where('name', 'member')->value('id');

    $stats = [
        'members_created' => 0,
        'members_updated' => 0,
        'users_created' => 0,
        'users_linked' => 0,
        'users_updated' => 0,
        'users_skipped_temp' => 0,
        'rows_skipped' => 0,
    ];

    foreach ($rows as $row) {
        if (!is_array($row)) {
            $stats['rows_skipped']++;
            continue;
        }

        $memberNumber = trim((string) ($row['member_number'] ?? ''));
        $email = Str::of((string) ($row['email'] ?? ''))->trim()->lower()->value();
        $firstName = trim((string) ($row['first_name'] ?? ''));
        $lastName = trim((string) ($row['last_name'] ?? ''));
        if ($memberNumber === '' || $firstName === '' || $lastName === '') {
            $stats['rows_skipped']++;
            continue;
        }

        $member = Member::query()->firstOrNew(['member_number' => $memberNumber]);

        $member->fill([
            'first_name' => $firstName,
            'middle_name' => trim((string) ($row['middle_name'] ?? '')) ?: null,
            'last_name' => $lastName,
            'spouse_name' => trim((string) ($row['spouse_name'] ?? '')) ?: null,
            'email' => $email !== '' ? $email : null,
            'membership_status' => in_array(($row['membership_status'] ?? ''), ['active', 'inactive', 'applicant'], true)
                ? $row['membership_status']
                : 'active',
            'contact_number' => trim((string) ($row['contact_number'] ?? '')) ?: null,
            'address' => trim((string) ($row['address'] ?? '')) ?: null,
            'date_of_birth' => $row['date_of_birth'] ?? null,
            'batch' => trim((string) ($row['batch'] ?? '')) ?: null,
            'induction_date' => $row['induction_date'] ?? null,
            'source_submitted_at' => $row['source_submitted_at'] ?? null,
        ]);
        $member->save();
        $stats[$member->wasRecentlyCreated ? 'members_created' : 'members_updated']++;

        if (!$syncUsers || $email === '') {
            continue;
        }

        $bootstrapEmail = Str::of((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'))->trim()->lower()->value();
        $isTempAccount = Str::startsWith($email, 'temp.') || $email === $bootstrapEmail;
        if ($skipTempUsers && $isTempAccount) {
            $stats['users_skipped_temp']++;
            continue;
        }

        $user = null;
        if ($member->user_id) {
            $user = User::query()->find($member->user_id);
        }
        if (!$user) {
            $user = User::query()->where('email', $email)->first();
        }

        if (!$user) {
            if ($defaultPassword === '') {
                $defaultPassword = Str::random(24);
            }

            $user = User::query()->create([
                'name' => trim($firstName.' '.($member->middle_name ? $member->middle_name.' ' : '').$lastName),
                'email' => $email,
                'password' => Hash::make($defaultPassword),
                'role_id' => $memberRoleId,
            ]);
            $stats['users_created']++;
        } else {
            $updates = [];
            $fullName = trim($firstName.' '.($member->middle_name ? $member->middle_name.' ' : '').$lastName);
            if ($user->name !== $fullName) {
                $updates['name'] = $fullName;
            }
            if ($user->email !== $email && Str::of((string) $user->email)->trim()->lower()->value() !== $bootstrapEmail) {
                $updates['email'] = $email;
            }
            if ($user->role_id === null && $memberRoleId) {
                $updates['role_id'] = $memberRoleId;
            }
            if ($updates !== []) {
                $user->fill($updates)->save();
                $stats['users_updated']++;
            }
        }

        if ($member->user_id !== $user->id) {
            $member->user_id = $user->id;
            $member->email_verified = $user->email_verified_at !== null;
            $member->password_set = !empty($user->password);
            $member->save();
            $stats['users_linked']++;
        }
    }

    $this->info('Members import/sync complete.');
    foreach ($stats as $key => $value) {
        $this->line("{$key}: {$value}");
    }

    return 0;
})->purpose('Import members-only dataset and optionally sync users/member links without touching temp accounts');

Artisan::command('formal-photos:audit {--missing-only : Show only rows whose backing file is missing}', function () {
    $missingOnly = (bool) $this->option('missing-only');

    $rows = FormalPhoto::query()
        ->with('user:id,email')
        ->orderBy('id')
        ->get()
        ->map(function (FormalPhoto $photo): array {
            $disk = $photo->disk ?: 'local';
            $exists = $photo->file_path
                ? Storage::disk($disk)->exists($photo->file_path)
                : false;

            return [
                'id' => $photo->id,
                'user_id' => $photo->user_id,
                'email' => $photo->user?->email ?? 'unknown',
                'disk' => $disk,
                'exists' => $exists ? 'yes' : 'no',
                'updated_at' => optional($photo->updated_at)?->toDateTimeString() ?? 'n/a',
                'file_path' => (string) $photo->file_path,
            ];
        });

    if ($missingOnly) {
        $rows = $rows->filter(fn (array $row): bool => $row['exists'] === 'no')->values();
    }

    if ($rows->isEmpty()) {
        $this->info($missingOnly ? 'No missing formal-photo files found.' : 'No formal-photo records found.');
        return 0;
    }

    $this->table(
        ['ID', 'User ID', 'Email', 'Disk', 'Exists', 'Updated At', 'File Path'],
        $rows->map(fn (array $row): array => [
            $row['id'],
            $row['user_id'],
            $row['email'],
            $row['disk'],
            $row['exists'],
            $row['updated_at'],
            $row['file_path'],
        ])->all()
    );

    $missingCount = $rows->where('exists', 'no')->count();
    $this->line("Total rows: {$rows->count()}");
    $this->line("Missing files: {$missingCount}");

    return $missingCount > 0 ? 1 : 0;
})->purpose('Audit formal-photo records against host storage');
