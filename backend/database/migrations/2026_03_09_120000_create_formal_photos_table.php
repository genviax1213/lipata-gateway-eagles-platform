<?php

use App\Support\RoleHierarchy;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('formal_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('disk', 40)->default('local');
            $table->string('file_path');
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('template_key', 80)->nullable();
            $table->timestamps();

            $table->unique('user_id');
        });

        $now = now();

        $permissionId = DB::table('permissions')
            ->where('name', 'formal_photos.view_private')
            ->value('id');

        if (!$permissionId) {
            $permissionId = DB::table('permissions')->insertGetId([
                'name' => 'formal_photos.view_private',
                'description' => 'View private user formal-photo records for reporting and service workflows',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $secretaryRoleId = DB::table('roles')
            ->where('name', RoleHierarchy::SECRETARY)
            ->value('id');

        if (!$secretaryRoleId) {
            $secretaryRoleId = DB::table('roles')->insertGetId([
                'name' => RoleHierarchy::SECRETARY,
                'description' => 'Can access private formal-photo records for reporting and service workflows',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $roleIds = DB::table('roles')
            ->whereIn('name', [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN, RoleHierarchy::SECRETARY])
            ->pluck('id');

        foreach ($roleIds as $roleId) {
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
        Schema::dropIfExists('formal_photos');

        $permissionId = DB::table('permissions')
            ->where('name', 'formal_photos.view_private')
            ->value('id');

        if ($permissionId) {
            DB::table('role_permissions')
                ->where('permission_id', $permissionId)
                ->delete();

            DB::table('permissions')
                ->where('id', $permissionId)
                ->delete();
        }

        $secretaryRoleId = DB::table('roles')
            ->where('name', RoleHierarchy::SECRETARY)
            ->value('id');

        if ($secretaryRoleId) {
            $hasUsers = DB::table('users')
                ->where('role_id', $secretaryRoleId)
                ->exists();

            if (!$hasUsers) {
                DB::table('roles')
                    ->where('id', $secretaryRoleId)
                    ->delete();
            }
        }
    }
};
