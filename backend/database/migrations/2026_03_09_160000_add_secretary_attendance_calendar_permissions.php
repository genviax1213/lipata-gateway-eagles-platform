<?php

use App\Support\RoleHierarchy;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $permissions = [
            'identity.qr.view' => 'View personal QR code for attendance and club identification',
            'calendar.view' => 'View meeting, activity, and event notices with calendar schedule',
            'calendar.manage' => 'Create, update, and delete meeting, activity, and event notices until attendance exists',
            'attendance.view' => 'View attendance events and attendance rosters',
            'attendance.scan' => 'Scan QR codes and record attendance',
            'directory.export' => 'Export member and applicant directories for office workflows',
            'photos.export' => 'Export member formal-photo archives as ZIP files',
        ];

        $permissionIds = [];
        foreach ($permissions as $name => $description) {
            $permissionId = DB::table('permissions')->where('name', $name)->value('id');
            if (!$permissionId) {
                $permissionId = DB::table('permissions')->insertGetId([
                    'name' => $name,
                    'description' => $description,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            $permissionIds[$name] = $permissionId;
        }

        $secretaryRoleId = DB::table('roles')
            ->where('name', RoleHierarchy::SECRETARY)
            ->value('id');

        if (!$secretaryRoleId) {
            $secretaryRoleId = DB::table('roles')->insertGetId([
                'name' => RoleHierarchy::SECRETARY,
                'description' => 'Handles attendance, calendar notices, directory exports, and service reporting workflows',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $viewerRoles = DB::table('roles')
            ->whereIn('name', [
                RoleHierarchy::SUPERADMIN,
                RoleHierarchy::ADMIN,
                RoleHierarchy::OFFICER,
                RoleHierarchy::SECRETARY,
                RoleHierarchy::MEMBERSHIP_CHAIRMAN,
                RoleHierarchy::MEMBER,
                RoleHierarchy::APPLICANT,
            ])
            ->pluck('id');

        foreach ($viewerRoles as $roleId) {
            foreach (['identity.qr.view', 'calendar.view'] as $permissionName) {
                $exists = DB::table('role_permissions')
                    ->where('role_id', $roleId)
                    ->where('permission_id', $permissionIds[$permissionName])
                    ->exists();

                if (!$exists) {
                    DB::table('role_permissions')->insert([
                        'role_id' => $roleId,
                        'permission_id' => $permissionIds[$permissionName],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        $elevatedRoleIds = DB::table('roles')
            ->whereIn('name', [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN, RoleHierarchy::SECRETARY])
            ->pluck('id');

        foreach ($elevatedRoleIds as $roleId) {
            foreach ([
                'calendar.manage',
                'attendance.view',
                'attendance.scan',
                'directory.export',
                'photos.export',
                'formal_photos.view_private',
                'members.view',
                'applications.view',
                'forum.view',
                'forum.create_thread',
                'forum.reply',
            ] as $permissionName) {
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
    }

    public function down(): void
    {
        $permissionNames = [
            'identity.qr.view',
            'calendar.view',
            'calendar.manage',
            'attendance.view',
            'attendance.scan',
            'directory.export',
            'photos.export',
        ];

        $permissionIds = DB::table('permissions')
            ->whereIn('name', $permissionNames)
            ->pluck('id');

        if ($permissionIds->isNotEmpty()) {
            DB::table('role_permissions')
                ->whereIn('permission_id', $permissionIds)
                ->delete();

            DB::table('permissions')
                ->whereIn('id', $permissionIds)
                ->delete();
        }
    }
};
