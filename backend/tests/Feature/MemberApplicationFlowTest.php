<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MemberApplicationFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_verified_application_can_be_approved_by_membership_chairman(): void
    {
        $submit = $this->postJson('/api/v1/member-applications', [
            'first_name' => 'Juan',
            'middle_name' => 'Santos',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@applicant.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'membership_status' => 'applicant',
        ]);
        $submit->assertStatus(201);
        $applicationId = $submit->json('application_id');
        $this->assertNotNull($applicationId);

        $token = $submit->json('verification_token');
        $this->assertNotEmpty($token);

        $verify = $this->postJson('/api/v1/member-applications/verify', [
            'email' => 'juan@applicant.test',
            'verification_token' => $token,
        ]);
        $verify->assertOk();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);
        Sanctum::actingAs($chairman);

        $applications = $this->getJson('/api/v1/member-applications');
        $applications->assertOk();
        $applications->assertJsonPath('data.0.id', $applicationId);

        $approve = $this->postJson("/api/v1/member-applications/{$applicationId}/approve");
        $approve->assertOk();
        $memberNumber = (string) $approve->json('member.member_number');
        $this->assertMatchesRegularExpression('/^LGEC-\d{4}-\d{5}$/', $memberNumber);
    }

    public function test_direct_member_create_endpoint_is_disabled(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
        ]);
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/members', [
            'member_number' => 'DIRECT-1',
            'first_name' => 'Direct',
            'last_name' => 'Create',
            'membership_status' => 'active',
        ]);

        $response->assertStatus(422);
    }

    public function test_duplicate_person_application_is_blocked_with_email_edit_guidance(): void
    {
        Member::query()->create([
            'member_number' => 'LGEC-2026-00001',
            'first_name' => 'Juan',
            'middle_name' => 'Santos',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@existing.test',
            'membership_status' => 'active',
        ]);

        $submit = $this->postJson('/api/v1/member-applications', [
            'first_name' => 'Juan',
            'middle_name' => 'Santos',
            'last_name' => 'Dela Cruz',
            'email' => 'different-email@applicant.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'membership_status' => 'applicant',
        ]);

        $submit->assertStatus(422);
        $submit->assertJsonFragment([
            'next_step' => 'Use "Edit Email" authenticated procedure: 1) confirm current email ownership, 2) verify new email via token, 3) admin/officer reviews and approves the change.',
        ]);
    }

    public function test_submission_is_blocked_when_member_email_already_exists(): void
    {
        Member::query()->create([
            'member_number' => 'LGEC-2026-00001',
            'first_name' => 'Existing',
            'middle_name' => 'Alpha',
            'last_name' => 'Member',
            'email' => 'existing@email.test',
            'membership_status' => 'active',
        ]);

        $submit = $this->postJson('/api/v1/member-applications', [
            'first_name' => 'New',
            'middle_name' => 'Bravo',
            'last_name' => 'Applicant',
            'email' => 'existing@email.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'membership_status' => 'applicant',
        ]);
        $submit->assertStatus(422);
    }

    public function test_application_requires_all_fields(): void
    {
        $submit = $this->postJson('/api/v1/member-applications', [
            'first_name' => '   ',
            'middle_name' => '',
            'last_name' => 'Applicant',
            'email' => '',
            'password' => '',
            'password_confirmation' => '',
        ]);

        $submit->assertStatus(422);
        $submit->assertJsonValidationErrors([
            'first_name',
            'middle_name',
            'email',
            'password',
            'membership_status',
        ]);
    }
}
