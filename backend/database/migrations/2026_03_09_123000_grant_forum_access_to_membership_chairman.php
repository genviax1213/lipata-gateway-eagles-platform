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

        $permissionIds = DB::table('permissions')
            ->whereIn('name', ['forum.view', 'forum.create_thread', 'forum.reply'])
            ->pluck('id', 'name');

        $now = now();

        foreach ($permissionIds as $permissionId) {
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
            ->whereIn('name', ['forum.view', 'forum.create_thread', 'forum.reply'])
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
