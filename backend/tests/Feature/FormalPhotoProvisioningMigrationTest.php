<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FormalPhotoProvisioningMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_formal_photo_permission_and_secretary_role_are_provisioned_without_seeders(): void
    {
        $permissionId = DB::table('permissions')
            ->where('name', 'formal_photos.view_private')
            ->value('id');
        $secretaryRoleId = DB::table('roles')
            ->where('name', 'secretary')
            ->value('id');

        $this->assertNotNull($permissionId);
        $this->assertNotNull($secretaryRoleId);

        $this->assertTrue(
            DB::table('role_permissions')
                ->where('role_id', $secretaryRoleId)
                ->where('permission_id', $permissionId)
                ->exists()
        );
    }
}
