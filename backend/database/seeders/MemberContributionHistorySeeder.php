<?php

namespace Database\Seeders;

use App\Models\Contribution;
use App\Models\Member;
use App\Models\User;
use RuntimeException;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class MemberContributionHistorySeeder extends Seeder
{
    public function run(): void
    {
        $allowOutsideLocal = filter_var((string) env('ALLOW_MEMBER_HISTORY_SEEDER', false), FILTER_VALIDATE_BOOLEAN);
        if (!app()->environment(['local', 'testing']) && !$allowOutsideLocal) {
            throw new RuntimeException(
                'MemberContributionHistorySeeder is restricted to local/testing environments. ' .
                'Set ALLOW_MEMBER_HISTORY_SEEDER=true to run outside local/testing.'
            );
        }

        $encoder = $this->resolveEncoderUser();
        $this->ensureMembersForAllUserEmails();
        $members = Member::query()->orderBy('id')->get();

        if ($members->isEmpty()) {
            return;
        }

        foreach ($members as $member) {
            $email = $this->ensureMemberEmail($member);
            $this->syncLinkedUserEmail($member, $email);
            $this->syncMemberAuthFlags($member);
            $this->seedContributionHistory($member, $encoder->id);
        }
    }

    private function ensureMembersForAllUserEmails(): void
    {
        User::query()
            ->orderBy('id')
            ->each(function (User $user): void {
                $email = Str::of($user->email)->trim()->lower()->value();
                $member = Member::query()
                    ->where('user_id', $user->id)
                    ->orWhere('email', $email)
                    ->first();

                [$firstName, $middleName, $lastName] = $this->splitPersonName($user->name);
                $status = $user->role?->name === 'applicant' ? 'applicant' : 'active';
                $emailVerified = $user->email_verified_at !== null;
                $passwordSet = !empty($user->password);

                if ($member) {
                    $member->user_id = $member->user_id ?: $user->id;
                    $member->email = $member->email ?: $email;
                    $member->first_name = $member->first_name ?: $firstName;
                    $member->middle_name = $member->middle_name ?: $middleName;
                    $member->last_name = $member->last_name ?: $lastName;
                    $member->membership_status = $member->membership_status ?: $status;
                    $member->email_verified = $emailVerified;
                    $member->password_set = $passwordSet;
                    $member->save();

                    return;
                }

                Member::query()->create([
                    'member_number' => $this->nextMemberNumberForUser($user->id),
                    'first_name' => $firstName,
                    'middle_name' => $middleName,
                    'last_name' => $lastName,
                    'email' => $email,
                    'user_id' => $user->id,
                    'membership_status' => $status,
                    'email_verified' => $emailVerified,
                    'password_set' => $passwordSet,
                ]);
            });
    }

    private function resolveEncoderUser(): User
    {
        $existing = User::query()->orderBy('id')->first();
        if ($existing) {
            return $existing;
        }

        return User::query()->create([
            'name' => 'Seeder Encoder',
            'email' => 'seeder.encoder@lipataeagles.ph',
            'password' => Hash::make(Str::random(48)),
        ]);
    }

    private function ensureMemberEmail(Member $member): string
    {
        $current = $member->email ? Str::of($member->email)->trim()->lower()->value() : null;
        if ($current !== null && $current !== '') {
            return $current;
        }

        $base = Str::slug(trim(sprintf('%s %s', $member->first_name ?? '', $member->last_name ?? '')), '.');
        if ($base === '') {
            $base = 'member';
        }

        $suffix = str_pad((string) $member->id, 4, '0', STR_PAD_LEFT);
        $candidate = sprintf('%s.%s@members.lipataeagles.local', $base, $suffix);

        $counter = 1;
        while ($this->emailExistsForAnotherMember($candidate, $member->id) || $this->emailExistsForAnotherUser($candidate, $member->user_id)) {
            $candidate = sprintf('%s.%s.%d@members.lipataeagles.local', $base, $suffix, $counter);
            $counter++;
        }

        $member->email = $candidate;
        $member->save();

        return $candidate;
    }

    private function syncLinkedUserEmail(Member $member, string $email): void
    {
        if (!$member->user_id) {
            return;
        }

        $user = User::query()->find($member->user_id);
        if (!$user) {
            return;
        }

        if ($user->email === $email) {
            return;
        }

        $existsOnOtherUser = User::query()
            ->where('email', $email)
            ->where('id', '!=', $user->id)
            ->exists();

        if ($existsOnOtherUser) {
            return;
        }

        $user->email = $email;
        $user->save();
    }

    private function syncMemberAuthFlags(Member $member): void
    {
        if (!$member->user_id) {
            return;
        }

        $user = User::query()->find($member->user_id);
        if (!$user) {
            return;
        }

        $member->email_verified = $user->email_verified_at !== null;
        $member->password_set = !empty($user->password);
        $member->save();
    }

    private function seedContributionHistory(Member $member, int $encoderUserId): void
    {
        $startMonth = Carbon::now()->startOfMonth()->subMonths(35);
        $endMonth = $startMonth->copy()->addMonths(35)->toDateString();
        $startDate = $startMonth->toDateString();

        $existingKeys = Contribution::query()
            ->where('member_id', $member->id)
            ->whereBetween('contribution_date', [$startDate, $endMonth])
            ->whereIn('category', ['monthly_contribution', 'alalayang_agila_contribution', 'extra_contribution'])
            ->get(['category', 'contribution_date'])
            ->mapWithKeys(function (Contribution $row): array {
                return [sprintf('%s|%s', $row->category, $row->contribution_date?->toDateString() ?? '') => true];
            });

        $now = now();
        $inserts = [];

        for ($i = 0; $i < 36; $i++) {
            $monthDate = $startMonth->copy()->addMonths($i)->toDateString();
            $definitions = [
                [
                    'category' => 'monthly_contribution',
                    'amount' => random_int(300, 1200),
                    'note' => 'Seeded monthly contribution',
                    'recipient_name' => null,
                ],
                [
                    'category' => 'alalayang_agila_contribution',
                    'amount' => random_int(100, 800),
                    'note' => 'Seeded Alalayang Agila support',
                    'recipient_name' => 'Community Support',
                ],
                [
                    'category' => 'extra_contribution',
                    'amount' => random_int(200, 2500),
                    'note' => 'Seeded extra contribution',
                    'recipient_name' => null,
                ],
            ];

            foreach ($definitions as $definition) {
                $key = sprintf('%s|%s', $definition['category'], $monthDate);
                if ($existingKeys->has($key)) {
                    continue;
                }

                $inserts[] = [
                    'member_id' => $member->id,
                    'category' => $definition['category'],
                    'contribution_date' => $monthDate,
                    'amount' => $definition['amount'],
                    'note' => $definition['note'],
                    'beneficiary_member_id' => null,
                    'recipient_name' => $definition['recipient_name'],
                    'encoded_by_user_id' => $encoderUserId,
                    'encoded_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        if (!empty($inserts)) {
            Contribution::query()->insert($inserts);
        }
    }

    private function emailExistsForAnotherMember(string $email, int $memberId): bool
    {
        return Member::query()
            ->where('email', $email)
            ->where('id', '!=', $memberId)
            ->exists();
    }

    private function emailExistsForAnotherUser(string $email, ?int $userId): bool
    {
        $query = User::query()->where('email', $email);
        if ($userId) {
            $query->where('id', '!=', $userId);
        }

        return $query->exists();
    }

    private function splitPersonName(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name)) ?: [];
        $parts = array_values(array_filter($parts, static fn ($part) => $part !== ''));

        if (count($parts) === 0) {
            return ['Member', null, 'Account'];
        }

        if (count($parts) === 1) {
            return [Str::title($parts[0]), null, 'Member'];
        }

        if (count($parts) === 2) {
            return [Str::title($parts[0]), null, Str::title($parts[1])];
        }

        $firstName = Str::title(array_shift($parts));
        $lastName = Str::title(array_pop($parts));
        $middleName = Str::title(implode(' ', $parts));

        return [$firstName, $middleName, $lastName];
    }

    private function nextMemberNumberForUser(int $userId): string
    {
        $base = 'TMP-' . str_pad((string) $userId, 5, '0', STR_PAD_LEFT);
        $candidate = $base;
        $counter = 1;

        while (Member::query()->where('member_number', $candidate)->exists()) {
            $candidate = sprintf('%s-%d', $base, $counter);
            $counter++;
        }

        return $candidate;
    }
}
