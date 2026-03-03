<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminSelfMemberLinkTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_admin_can_link_self_to_member_profile_by_email(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'admin@lipataeagles.ph',
        ]);

        $member = Member::query()->create([
            'member_number' => 'LGEC-2026-09999',
            'first_name' => 'System',
            'middle_name' => null,
            'last_name' => 'Administrator',
            'email' => 'admin@lipataeagles.ph',
            'membership_status' => 'active',
            'user_id' => null,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/users/me/link-member-profile');

        $response->assertOk()->assertJsonPath('member.id', $member->id);
        $this->assertSame($admin->id, (int) $member->fresh()->user_id);
    }

    public function test_admin_link_returns_404_if_no_matching_member_profile(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'admin@lipataeagles.ph',
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/users/me/link-member-profile')
            ->assertStatus(404);
    }
}
