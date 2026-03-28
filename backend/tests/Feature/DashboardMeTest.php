<?php

namespace Tests\Feature;

use App\Models\Contribution;
use App\Models\Member;
use App\Models\Applicant;
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

        Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Dashboard',
            'middle_name' => 'Applicant',
            'last_name' => 'User',
            'email' => 'dashboard-applicant@example.com',
            'membership_status' => 'applicant',
            'status' => 'under_review',
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
            ->assertJsonPath('application.status', 'under_review');
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

    public function test_member_dashboard_uses_linked_profile_even_when_account_and_member_emails_differ(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'dashboard.member@lgec.org',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-DASH-002',
            'first_name' => 'Dashboard',
            'middle_name' => 'Linked',
            'last_name' => 'Member',
            'email' => 'dashboard-member-personal@example.com',
            'membership_status' => 'active',
            'user_id' => $memberUser->id,
        ]);

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 500,
            'note' => 'Linked profile contribution',
            'encoded_by_user_id' => $memberUser->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($memberUser);

        $this->getJson('/api/v1/dashboard/me')
            ->assertOk()
            ->assertJsonPath('view', 'member')
            ->assertJsonPath('member.member_number', 'M-DASH-002');
    }

    public function test_member_dashboard_reports_application_archive_availability(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'dashboard-archive@example.com',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-DASH-ARCHIVE',
            'first_name' => 'Dashboard',
            'middle_name' => 'Archive',
            'last_name' => 'User',
            'email' => 'dashboard-archive@example.com',
            'membership_status' => 'active',
            'user_id' => $memberUser->id,
        ]);

        Applicant::query()->create([
            'user_id' => $memberUser->id,
            'member_id' => $member->id,
            'first_name' => 'Dashboard',
            'middle_name' => 'Archive',
            'last_name' => 'User',
            'email' => 'dashboard-archive@example.com',
            'membership_status' => 'applicant',
            'status' => 'activated',
            'decision_status' => 'approved',
            'current_stage' => 'induction',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'dashboard-archive-token'),
            'email_verified_at' => now(),
            'activated_at' => now(),
        ]);

        Sanctum::actingAs($memberUser);

        $this->getJson('/api/v1/dashboard/me')
            ->assertOk()
            ->assertJsonPath('view', 'member')
            ->assertJsonPath('application_archive_available', true);
    }

    public function test_archived_applicant_application_does_not_reopen_applicant_dashboard(): void
    {
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'dashboard-archived-applicant@example.com',
        ]);

        Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Archived',
            'middle_name' => 'Applicant',
            'last_name' => 'User',
            'email' => 'dashboard-archived-applicant@example.com',
            'membership_status' => 'applicant',
            'status' => 'withdrawn',
            'decision_status' => 'withdrawn',
            'current_stage' => 'interview',
            'is_login_blocked' => true,
            'verification_token' => hash('sha256', 'dashboard-archived-applicant-token'),
            'email_verified_at' => now(),
            'reviewed_at' => now(),
        ]);

        Sanctum::actingAs($applicant);

        $this->getJson('/api/v1/dashboard/me')
            ->assertOk()
            ->assertJsonPath('view', 'general')
            ->assertJsonPath('application_archive_available', true);
    }

    public function test_official_applicant_stays_in_applicant_dashboard_until_activation(): void
    {
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'dashboard-official@applicant.test',
        ]);

        Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Official',
            'middle_name' => 'Applicant',
            'last_name' => 'User',
            'email' => 'dashboard-official@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'official_applicant',
            'decision_status' => 'approved',
            'current_stage' => 'incubation',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'dashboard-official-token'),
            'email_verified_at' => now(),
            'reviewed_at' => now(),
        ]);

        Sanctum::actingAs($applicant);

        $this->getJson('/api/v1/dashboard/me')
            ->assertOk()
            ->assertJsonPath('view', 'applicant')
            ->assertJsonPath('application.status', 'official_applicant');
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
