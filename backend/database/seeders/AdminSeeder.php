<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Role;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $adminRole = Role::where('name', 'admin')->first();
        $admin = User::query()->where('email', 'admin@lipataeagles.ph')->first();

        if (!$admin) {
            User::query()->create([
                'name' => 'System Administrator',
                'email' => 'admin@lipataeagles.ph',
                'password' => Hash::make((string) env('ADMIN_INITIAL_PASSWORD', Str::random(48))),
                'role_id' => $adminRole?->id,
            ]);
            return;
        }

        $admin->name = 'System Administrator';
        $admin->role_id = $adminRole?->id;
        $admin->save();
    }
}
