<?php

namespace Tests\Feature;

use App\Models\Contribution;
use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardMeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_applicant_with_application_sees_applicant_dashboard_view(): void
    {
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'dashboard-applicant@example.com',
        ]);

        MemberApplication::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Dashboard',
            'middle_name' => 'Applicant',
            'last_name' => 'User',
            'email' => 'dashboard-applicant@example.com',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'dashboard-applicant-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($applicant);

        $response = $this->getJson('/api/v1/dashboard/me');

        $response->assertOk()
            ->assertJsonPath('view', 'applicant')
            ->assertJsonPath('application.status', 'pending_approval');
    }

    public function test_member_with_profile_sees_member_dashboard_view(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'dashboard-member@example.com',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-DASH-001',
            'first_name' => 'Dashboard',
            'middle_name' => 'Member',
            'last_name' => 'User',
            'email' => 'dashboard-member@example.com',
            'membership_status' => 'active',
            'user_id' => $memberUser->id,
        ]);

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 750,
            'note' => 'Dashboard contribution',
            'encoded_by_user_id' => $memberUser->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($memberUser);

        $response = $this->getJson('/api/v1/dashboard/me');

        $response->assertOk()
            ->assertJsonPath('view', 'member')
            ->assertJsonPath('member.member_number', 'M-DASH-001');
    }

    public function test_user_without_application_or_member_profile_sees_general_dashboard_view(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'dashboard-general@example.com',
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/dashboard/me');

        $response->assertOk()
            ->assertJsonPath('view', 'general');
    }
}
