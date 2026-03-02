<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class TemporaryLoginSeeder extends Seeder
{
    public function run(): void
    {
        $tempPassword = (string) env('TEMP_LOGIN_PASSWORD', 'TempPass!2026');

        $roles = Role::query()
            ->whereIn('name', ['admin', 'officer', 'member', 'treasurer', 'auditor', 'applicant', 'membership_chairman'])
            ->pluck('id', 'name');

        $accounts = [
            [
                'name' => 'Temp Admin',
                'email' => 'admin@lipataeagles.ph',
                'role' => 'admin',
                'finance_role' => null,
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Officer',
                'email' => 'temp.officer@lipataeagles.ph',
                'role' => 'officer',
                'finance_role' => null,
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Member',
                'email' => 'temp.member@lipataeagles.ph',
                'role' => 'member',
                'finance_role' => null,
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Treasurer',
                'email' => 'temp.treasurer@lipataeagles.ph',
                'role' => 'treasurer',
                'finance_role' => null,
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Auditor',
                'email' => 'temp.auditor@lipataeagles.ph',
                'role' => 'auditor',
                'finance_role' => null,
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Applicant',
                'email' => 'temp.applicant@lipataeagles.ph',
                'role' => 'applicant',
                'finance_role' => null,
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Membership Chairman',
                'email' => 'temp.membership.chairman@lipataeagles.ph',
                'role' => 'membership_chairman',
                'finance_role' => null,
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Finance Treasurer (Secondary)',
                'email' => 'temp.finance.treasurer@lipataeagles.ph',
                'role' => 'member',
                'finance_role' => 'treasurer',
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Finance Auditor (Secondary)',
                'email' => 'temp.finance.auditor@lipataeagles.ph',
                'role' => 'member',
                'finance_role' => 'auditor',
                'forum_role' => null,
            ],
            [
                'name' => 'Temp Forum Moderator (Secondary)',
                'email' => 'temp.forum.moderator@lipataeagles.ph',
                'role' => 'member',
                'finance_role' => null,
                'forum_role' => 'forum_moderator',
            ],
        ];

        foreach ($accounts as $account) {
            $roleId = $roles->get($account['role']);
            if (!$roleId) {
                continue;
            }

            User::query()->updateOrCreate(
                ['email' => $account['email']],
                [
                    'name' => $account['name'],
                    'password' => Hash::make($tempPassword),
                    'role_id' => $roleId,
                    'finance_role' => $account['finance_role'],
                    'forum_role' => $account['forum_role'],
                ]
            );
        }
    }
}
