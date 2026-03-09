<?php

use App\Support\RoleHierarchy;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')
            ->where('name', RoleHierarchy::MEMBERSHIP_CHAIRMAN)
            ->value('id');

        if (!$roleId) {
            return;
        }

        $now = now();

        foreach (['formal_photos.view_private', 'calendar.manage'] as $permissionName) {
            $permissionId = DB::table('permissions')->where('name', $permissionName)->value('id');
            if (!$permissionId) {
                continue;
            }

            $exists = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission_id', $permissionId)
                ->exists();

            if (!$exists) {
                DB::table('role_permissions')->insert([
                    'role_id' => $roleId,
                    'permission_id' => $permissionId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        $roleId = DB::table('roles')
            ->where('name', RoleHierarchy::MEMBERSHIP_CHAIRMAN)
            ->value('id');

        if (!$roleId) {
            return;
        }

        $permissionIds = DB::table('permissions')
            ->whereIn('name', ['formal_photos.view_private', 'calendar.manage'])
            ->pluck('id');

        if ($permissionIds->isEmpty()) {
            return;
        }

        DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->whereIn('permission_id', $permissionIds)
            ->delete();
    }
};
