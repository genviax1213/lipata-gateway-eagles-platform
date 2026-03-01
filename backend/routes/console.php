<?php

use App\Models\Member;
use App\Support\TextCase;
use Carbon\Carbon;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
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
