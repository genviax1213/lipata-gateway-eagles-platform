<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Permission;
use App\Models\Role;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $permissionMap = [
            'posts.view' => 'View CMS posts list',
            'posts.create' => 'Create/publish new CMS posts',
            'posts.update' => 'Edit existing CMS posts',
            'posts.delete' => 'Delete CMS posts',
            'members.view' => 'View members list',
            'members.create' => 'Create members',
            'members.update' => 'Edit members',
            'members.delete' => 'Delete members',
            'roles.delegate' => 'Delegate roles to members/users',
            'finance.view' => 'View finance records',
            'finance.input' => 'Create and reverse contribution, expense, and opening-balance ledger entries',
            'forum.view' => 'View forum threads and posts',
            'forum.create_thread' => 'Create forum threads',
            'forum.reply' => 'Reply to forum threads',
            'forum.moderate' => 'Moderate forum threads and posts',
            'applications.view' => 'View applicant queue',
            'applications.docs.view' => 'View applicant documents and dossier details without workflow control',
            'applications.review' => 'Review applicant decisions (approve/probation/reject)',
            'applications.notice.view' => 'View applicant notices',
            'applications.notice.set' => 'Set applicant notices',
            'applications.stage.set' => 'Set applicant stage',
            'applications.docs.review' => 'Approve/reject applicant documents',
            'applications.docs.upload' => 'Upload applicant documents',
            'applications.dashboard.view' => 'View applicant dashboard',
            'applications.fee.set' => 'Set applicant journey contribution target payments',
            'applications.fee.pay' => 'Log applicant journey contribution partial/full payments',
            'users.view' => 'View portal users, roles, and user-role mappings',
            'users.manage' => 'Create, update, and delete portal users and destructive member records',
            'users.password.reset' => 'Reset passwords for other portal users within role policy limits',
            'formal_photos.view_private' => 'View private user formal-photo records for reporting and service workflows',
            'identity.qr.view' => 'View personal QR code for attendance and club identification',
            'calendar.view' => 'View meeting, activity, and event notices with calendar schedule',
            'calendar.manage' => 'Create, update, and delete meeting, activity, and event notices until attendance exists',
            'attendance.view' => 'View attendance events and attendance rosters',
            'attendance.scan' => 'Scan QR codes and record attendance',
            'directory.export' => 'Export member and applicant directories for office workflows',
            'photos.export' => 'Export member formal-photo archives as ZIP files',
        ];

        $permissionIds = [];
        foreach ($permissionMap as $name => $description) {
            $permission = Permission::query()->updateOrCreate(
                ['name' => $name],
                ['description' => $description]
            );
            $permissionIds[$name] = $permission->id;
        }

        $superadmin = Role::query()->updateOrCreate(
            ['name' => 'superadmin'],
            ['description' => 'System super administrator with top-level role and password management authority']
        );

        $admin = Role::query()->updateOrCreate(
            ['name' => 'admin'],
            ['description' => 'Administrative access with role delegation and scoped password management']
        );

        $officer = Role::query()->updateOrCreate(
            ['name' => 'officer'],
            ['description' => 'Can create and edit posts and members']
        );

        $secretary = Role::query()->updateOrCreate(
            ['name' => 'secretary'],
            ['description' => 'Handles attendance, calendar notices, directory exports, and service reporting workflows']
        );

        $member = Role::query()->updateOrCreate(
            ['name' => 'member'],
            ['description' => 'Can view content only']
        );

        $treasurer = Role::query()->updateOrCreate(
            ['name' => 'treasurer'],
            ['description' => 'Can encode finance data and create reversal entries']
        );

        $auditor = Role::query()->updateOrCreate(
            ['name' => 'auditor'],
            ['description' => 'Can review finance records and compliance reports']
        );

        $applicant = Role::query()->updateOrCreate(
            ['name' => 'applicant'],
            ['description' => 'Applicant account with application workflow access']
        );

        $membershipChairman = Role::query()->updateOrCreate(
            ['name' => 'membership_chairman'],
            ['description' => 'Membership committee chairman with applicant lifecycle authority']
        );

        $superadmin->permissions()->sync([
            $permissionIds['posts.view'],
            $permissionIds['posts.create'],
            $permissionIds['posts.update'],
            $permissionIds['posts.delete'],
            $permissionIds['members.view'],
            $permissionIds['members.create'],
            $permissionIds['members.update'],
            $permissionIds['members.delete'],
            $permissionIds['roles.delegate'],
            $permissionIds['finance.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['forum.moderate'],
            $permissionIds['applications.view'],
            $permissionIds['applications.docs.view'],
            $permissionIds['applications.notice.view'],
            $permissionIds['applications.dashboard.view'],
            $permissionIds['users.view'],
            $permissionIds['users.manage'],
            $permissionIds['users.password.reset'],
            $permissionIds['formal_photos.view_private'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
            $permissionIds['calendar.manage'],
            $permissionIds['attendance.view'],
            $permissionIds['attendance.scan'],
            $permissionIds['directory.export'],
            $permissionIds['photos.export'],
        ]);
        $admin->permissions()->sync([
            $permissionIds['posts.view'],
            $permissionIds['posts.create'],
            $permissionIds['posts.update'],
            $permissionIds['posts.delete'],
            $permissionIds['members.view'],
            $permissionIds['members.create'],
            $permissionIds['members.update'],
            $permissionIds['members.delete'],
            $permissionIds['roles.delegate'],
            $permissionIds['finance.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['forum.moderate'],
            $permissionIds['applications.view'],
            $permissionIds['applications.docs.view'],
            $permissionIds['applications.notice.view'],
            $permissionIds['applications.dashboard.view'],
            $permissionIds['users.view'],
            $permissionIds['users.manage'],
            $permissionIds['users.password.reset'],
            $permissionIds['formal_photos.view_private'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
            $permissionIds['calendar.manage'],
            $permissionIds['attendance.view'],
            $permissionIds['attendance.scan'],
            $permissionIds['directory.export'],
            $permissionIds['photos.export'],
        ]);
        $officer->permissions()->sync([
            $permissionIds['posts.view'],
            $permissionIds['posts.create'],
            $permissionIds['posts.update'],
            $permissionIds['members.view'],
            $permissionIds['members.create'],
            $permissionIds['members.update'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['applications.view'],
            $permissionIds['applications.notice.view'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
        ]);
        $secretary->permissions()->sync([
            $permissionIds['formal_photos.view_private'],
            $permissionIds['members.view'],
            $permissionIds['applications.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
            $permissionIds['calendar.manage'],
            $permissionIds['attendance.view'],
            $permissionIds['attendance.scan'],
            $permissionIds['directory.export'],
            $permissionIds['photos.export'],
        ]);
        $member->permissions()->sync([
            $permissionIds['applications.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
        ]);

        $treasurer->permissions()->sync([
            $permissionIds['finance.view'],
            $permissionIds['finance.input'],
            $permissionIds['members.view'],
            $permissionIds['applications.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
        ]);

        $auditor->permissions()->sync([
            $permissionIds['finance.view'],
            $permissionIds['members.view'],
            $permissionIds['applications.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
        ]);

        $applicant->permissions()->sync([
            $permissionIds['applications.dashboard.view'],
            $permissionIds['applications.docs.upload'],
            $permissionIds['applications.notice.view'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
        ]);

        $membershipChairman->permissions()->sync([
            $permissionIds['members.view'],
            $permissionIds['applications.view'],
            $permissionIds['applications.docs.view'],
            $permissionIds['applications.review'],
            $permissionIds['applications.notice.view'],
            $permissionIds['applications.notice.set'],
            $permissionIds['applications.stage.set'],
            $permissionIds['applications.docs.review'],
            $permissionIds['applications.fee.set'],
            $permissionIds['applications.fee.pay'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
            $permissionIds['formal_photos.view_private'],
            $permissionIds['identity.qr.view'],
            $permissionIds['calendar.view'],
            $permissionIds['calendar.manage'],
        ]);
    }
}
