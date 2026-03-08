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
        ]);
        $member->permissions()->sync([
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
        ]);

        $treasurer->permissions()->sync([
            $permissionIds['finance.view'],
            $permissionIds['finance.input'],
            $permissionIds['members.view'],
            $permissionIds['applications.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
        ]);

        $auditor->permissions()->sync([
            $permissionIds['finance.view'],
            $permissionIds['members.view'],
            $permissionIds['applications.view'],
            $permissionIds['forum.view'],
            $permissionIds['forum.create_thread'],
            $permissionIds['forum.reply'],
        ]);

        $applicant->permissions()->sync([
            $permissionIds['applications.dashboard.view'],
            $permissionIds['applications.docs.upload'],
            $permissionIds['applications.notice.view'],
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
        ]);
    }
}
