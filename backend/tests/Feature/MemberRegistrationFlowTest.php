<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\MemberRegistration;
use App\Models\Role;
use App\Models\User;
use App\Notifications\MemberRegistrationVerificationToken;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MemberRegistrationFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_member_registration_verification_creates_verified_portal_user(): void
    {
        Notification::fake();

        $submit = $this->postJson('/api/v1/member-registrations', [
            'first_name' => 'Rolando',
            'middle_name' => 'Luib',
            'last_name' => 'Lanugon',
            'email' => 'rolando.member@test.local',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $submit->assertCreated();

        $registration = MemberRegistration::query()
            ->where('email', 'rolando.member@test.local')
            ->firstOrFail();

        $token = '';
        Notification::assertSentTo(
            $registration,
            MemberRegistrationVerificationToken::class,
            function (MemberRegistrationVerificationToken $notification) use (&$token): bool {
                $token = $notification->token();
                return true;
            }
        );

        $verify = $this->postJson('/api/v1/member-registrations/verify', [
            'email' => 'rolando.member@test.local',
            'verification_token' => $token,
        ]);

        $verify->assertOk();

        $user = User::query()->where('email', 'rolando.member@test.local')->firstOrFail();
        $member = Member::query()->where('email', 'rolando.member@test.local')->firstOrFail();

        $this->assertNotNull($user->email_verified_at);
        $this->assertTrue($member->email_verified);
        $this->assertSame($user->id, $member->user_id);
    }

    public function test_assigning_member_role_provisions_verified_portal_user(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $superadmin = User::factory()->create([
            'email' => 'superadmin@test.local',
            'role_id' => $superadminRole->id,
            'email_verified_at' => now(),
        ]);

        $candidate = Member::query()->create([
            'member_number' => 'LGEC-TST-0001',
            'first_name' => 'Provisioned',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'provisioned.member@test.local',
            'membership_status' => 'active',
            'email_verified' => false,
            'password_set' => false,
        ]);

        Sanctum::actingAs($superadmin);

        $response = $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $memberRole->id,
        ]);

        $response->assertOk();

        $user = User::query()->where('email', 'provisioned.member@test.local')->firstOrFail();
        $member = $candidate->fresh();

        $this->assertNotNull($user->email_verified_at);
        $this->assertTrue($member->email_verified);
        $this->assertSame($user->id, $member->user_id);
    }
}
