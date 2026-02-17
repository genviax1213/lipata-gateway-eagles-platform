<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $adminRole = Role::where('name', 'admin')->first();

        User::query()->updateOrCreate(
            ['email' => 'admin@lipataeagles.ph'],
            [
                'name' => 'System Administrator',
                'password' => Hash::make('password123'),
                'role_id' => $adminRole?->id,
            ]
        );
    }
}
