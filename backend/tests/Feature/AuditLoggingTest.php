<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Applicant;
use App\Models\Contribution;
use App\Models\Expense;
use App\Models\FinanceAccount;
use App\Models\FinanceAccountOpeningBalance;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditLoggingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function financeAccount(string $code = 'gcash'): FinanceAccount
    {
        return FinanceAccount::query()->where('code', $code)->firstOrFail();
    }

    public function test_admin_role_update_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $actor = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/admin/users/{$target->id}/role", [
            'role_id' => $memberRole->id,
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($actor, $target) {
                return $event === 'admin.role_updated'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $actor->id
                    && (int) ($context['target_user_id'] ?? 0) === (int) $target->id
                    && ($context['new_role'] ?? null) === 'member';
            })
            ->once();
    }

    public function test_setting_applicant_notice_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Notice',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'notice-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'notice-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/notice", [
            'notice_text' => 'Submit remaining requirements this week.',
        ])->assertStatus(201);

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application) {
                return $event === 'application.notice_set'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && isset($context['notice_id']);
            })
            ->once();
    }

    public function test_setting_probation_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Probation',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'probation-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'probation-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/probation")
            ->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application) {
                return $event === 'application.probation_set'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id;
            })
            ->once();
    }

    public function test_setting_stage_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Stage',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'stage-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'stage-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/stage", [
            'current_stage' => 'incubation',
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application) {
                return $event === 'application.stage_updated'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && ($context['current_stage'] ?? null) === 'incubation';
            })
            ->once();
    }

    public function test_reviewing_application_document_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Document',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'document-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'document-audit-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicantDocument::query()->create([
            'applicant_id' => $application->id,
            'file_path' => 'application-docs/document-audit.pdf',
            'original_name' => 'document-audit.pdf',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/documents/{$document->id}/review", [
            'status' => 'approved',
            'review_note' => 'Validated',
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $document, $application) {
                return $event === 'application.document_reviewed'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['document_id'] ?? 0) === (int) $document->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && ($context['status'] ?? null) === 'approved';
            })
            ->once();
    }

    public function test_admin_user_create_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $adminRole->id]);

        Sanctum::actingAs($actor);

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Log Create',
            'email' => 'log-create@example.com',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ])->assertStatus(201);

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($actor) {
                return $event === 'admin.user_created'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $actor->id
                    && isset($context['target_user_id']);
            })
            ->once();
    }

    public function test_admin_user_delete_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($actor);

        $this->deleteJson("/api/v1/admin/users/{$target->id}")
            ->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($actor, $target) {
                return $event === 'admin.user_deleted'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $actor->id
                    && (int) ($context['target_user_id'] ?? 0) === (int) $target->id;
            })
            ->once();
    }

    public function test_admin_user_update_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $actor = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => 'Updated Target',
            'email' => $target->email,
            'role_id' => $memberRole->id,
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($actor, $target) {
                return $event === 'admin.user_updated'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $actor->id
                    && (int) ($context['target_user_id'] ?? 0) === (int) $target->id
                    && ($context['previous_role'] ?? null) === 'officer'
                    && ($context['new_role'] ?? null) === 'member';
            })
            ->once();
    }

    public function test_assigning_role_to_member_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $adminRole->id]);

        $candidate = Member::query()->create([
            'member_number' => 'M-LOG-001',
            'first_name' => 'Role',
            'middle_name' => null,
            'last_name' => 'Assigned',
            'email' => 'role-assigned-audit@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $memberRole->id,
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($actor, $candidate) {
                return $event === 'admin.role_assigned'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $actor->id
                    && (int) ($context['target_member_id'] ?? 0) === (int) $candidate->id
                    && ($context['primary_role'] ?? null) === 'member';
            })
            ->once();
    }

    public function test_setting_applicant_fee_requirement_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Requirement',
            'last_name' => 'Audit',
            'email' => 'fee-requirement-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-requirement-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/fee-requirements", [
            'category' => 'project',
            'required_amount' => 1500,
            'note' => 'Initial applicant contribution target',
        ])->assertStatus(201);

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application) {
                return $event === 'application.fee_requirement_set'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && ($context['category'] ?? null) === 'project'
                    && isset($context['requirement_id'])
                    && (float) ($context['required_amount'] ?? 0) === 1500.0;
            })
            ->once();
    }

    public function test_recording_applicant_fee_payment_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Payment',
            'last_name' => 'Audit',
            'email' => 'fee-payment-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-payment-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $requirementResponse = $this->postJson("/api/v1/applicants/{$application->id}/fee-requirements", [
            'category' => 'project',
            'required_amount' => 1200,
            'note' => 'Payment audit requirement',
        ])->assertStatus(201);

        $requirementId = (int) $requirementResponse->json('requirement.id');
        $this->assertGreaterThan(0, $requirementId);

        $this->postJson("/api/v1/applicants/{$application->id}/fee-payments", [
            'category' => 'project',
            'amount' => 1200,
            'note' => 'Paid in full',
        ])->assertStatus(201);

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application, $requirementId) {
                return $event === 'application.fee_payment_recorded'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && ($context['category'] ?? null) === 'project'
                    && (int) ($context['requirement_id'] ?? 0) === $requirementId
                    && isset($context['payment_id'])
                    && (float) ($context['amount'] ?? 0) === 1200.0;
            })
            ->once();
    }

    public function test_approving_application_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);
        $applicantUser = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'approve-audit@applicant.test',
        ]);

        $application = Applicant::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => 'Approve',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'approve-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'approve-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/approve")
            ->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application) {
                return $event === 'application.approved'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && ($context['outcome'] ?? null) === 'official_applicant';
            })
            ->once();
    }

    public function test_rejecting_application_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Reject',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'reject-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'reject-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/reject", [
            'reason' => 'Insufficient documentary requirements',
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application) {
                return $event === 'application.rejected'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && ($context['reason'] ?? null) === 'Insufficient documentary requirements';
            })
            ->once();
    }

    public function test_withdrawing_application_emits_audit_log(): void
    {
        Log::spy();

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'withdraw-audit@applicant.test',
        ]);

        $application = Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Withdraw',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'withdraw-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'withdraw-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($applicant);

        $this->postJson('/api/v1/applicants/me/withdraw')
            ->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($applicant, $application) {
                return $event === 'application.withdrawn'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $applicant->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id;
            })
            ->once();
    }

    public function test_reapplying_emits_audit_log(): void
    {
        Log::spy();

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'reapply-audit@applicant.test',
        ]);

        $archived = Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Reapply',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'reapply-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'withdrawn',
            'decision_status' => 'withdrawn',
            'current_stage' => 'interview',
            'is_login_blocked' => true,
            'verification_token' => hash('sha256', 'reapply-audit-old-token'),
            'email_verified_at' => now(),
            'reviewed_at' => now(),
        ]);

        $this->postJson('/api/v1/applicant-registrations/reapply', [
            'email' => 'reapply-audit@applicant.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(201);

        $newApplication = Applicant::query()
            ->where('email', 'reapply-audit@applicant.test')
            ->latest('id')
            ->firstOrFail();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($archived, $newApplication) {
                return $event === 'application.reapplied'
                    && (int) ($context['previous_application_id'] ?? 0) === (int) $archived->id
                    && (int) ($context['new_application_id'] ?? 0) === (int) $newApplication->id
                    && ($context['email'] ?? null) === 'reapply-audit@applicant.test';
            })
            ->once();
    }

    public function test_failed_login_emits_audit_log(): void
    {
        Log::spy();

        $this->postJson('/api/v1/login', [
            'email' => 'missing-user@example.com',
            'password' => 'InvalidPassword',
        ])->assertStatus(401);

        Log::shouldHaveReceived('warning')
            ->withArgs(function (string $event, array $context) {
                return $event === 'auth.login_failed'
                    && ($context['email'] ?? null) === 'missing-user@example.com';
            })
            ->once();
    }

    public function test_successful_login_emits_audit_log(): void
    {
        Log::spy();

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        User::factory()->create([
            'email' => 'login-success@example.com',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'login-success@example.com',
            'password' => 'Password123',
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) {
                return $event === 'auth.login_success'
                    && isset($context['user_id'])
                    && ($context['auth_mode'] ?? null) === 'session';
            })
            ->once();
    }

    public function test_logout_emits_audit_log(): void
    {
        Log::spy();

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/v1/logout')->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($user) {
                return $event === 'auth.logout'
                    && (int) ($context['user_id'] ?? 0) === (int) $user->id;
            })
            ->once();
    }

    public function test_blocked_login_emits_audit_log(): void
    {
        Log::spy();

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'email' => 'blocked-login@example.com',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ]);

        $application = Applicant::query()->create([
            'user_id' => $user->id,
            'first_name' => 'Blocked',
            'middle_name' => 'Login',
            'last_name' => 'Case',
            'email' => 'blocked-login@example.com',
            'membership_status' => 'applicant',
            'status' => 'rejected',
            'decision_status' => 'rejected',
            'current_stage' => 'interview',
            'is_login_blocked' => true,
            'verification_token' => hash('sha256', 'blocked-login-token'),
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'blocked-login@example.com',
            'password' => 'Password123',
        ])->assertStatus(403);

        Log::shouldHaveReceived('warning')
            ->withArgs(function (string $event, array $context) use ($user, $application) {
                return $event === 'auth.login_blocked'
                    && (int) ($context['user_id'] ?? 0) === (int) $user->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && ($context['reason'] ?? null) === 'rejected';
            })
            ->once();
    }

    public function test_token_mode_login_emits_auth_mode_token(): void
    {
        Log::spy();

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        User::factory()->create([
            'email' => 'token-mode-login@example.com',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ]);

        $this->withHeaders([
            'X-Auth-Mode' => 'token',
        ])->postJson('/api/v1/login', [
            'email' => 'token-mode-login@example.com',
            'password' => 'Password123',
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) {
                return $event === 'auth.login_success'
                    && ($context['auth_mode'] ?? null) === 'token'
                    && isset($context['user_id']);
            })
            ->once();
    }

    public function test_finance_reversal_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount();

        $member = Member::query()->create([
            'member_number' => 'M-REV-001',
            'first_name' => 'Ledger',
            'middle_name' => null,
            'last_name' => 'Audit',
            'email' => 'ledger-audit@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 500,
            'note' => 'Initial ledger value',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/contributions/{$contribution->id}/reverse", [
            'remarks' => 'Duplicate ledger entry',
            'finance_account_id' => $account->id,
        ])->assertCreated();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($treasurer, $contribution) {
                return $event === 'finance.contribution_reversed'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $treasurer->id
                    && (int) ($context['contribution_id'] ?? 0) === (int) $contribution->id
                    && isset($context['reversal_contribution_id']);
            })
            ->once();
    }

    public function test_finance_audit_note_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-AUDLOG-001',
            'first_name' => 'Audit',
            'middle_name' => null,
            'last_name' => 'Logging',
            'email' => 'audit-log@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson('/api/v1/finance/audit-notes', [
            'member_id' => $member->id,
            'target_month' => '2026-03',
            'category' => 'monthly_contribution',
            'discrepancy_type' => 'missing_monthly_payment',
            'status' => 'needs_followup',
            'note_text' => 'Missing March payment needs review.',
        ])->assertCreated();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($auditor, $member) {
                return $event === 'finance.audit_note_created'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $auditor->id
                    && (int) ($context['member_id'] ?? 0) === (int) $member->id
                    && ($context['discrepancy_type'] ?? null) === 'missing_monthly_payment'
                    && ($context['status'] ?? null) === 'needs_followup';
            })
            ->once();
    }

    public function test_finance_expense_reversal_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('bank');

        $expense = Expense::query()->create([
            'category' => 'project_expense',
            'expense_date' => '2026-03-07',
            'amount' => 1200,
            'note' => 'Project materials',
            'payee_name' => 'Build Supply',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/expenses/{$expense->id}/reverse", [
            'remarks' => 'Duplicate expense entry',
            'finance_account_id' => $account->id,
        ])->assertCreated();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($treasurer, $expense) {
                return $event === 'finance.expense_reversed'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $treasurer->id
                    && (int) ($context['expense_id'] ?? 0) === (int) $expense->id
                    && isset($context['reversal_expense_id']);
            })
            ->once();
    }

    public function test_finance_expense_audit_note_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $account = $this->financeAccount('cash_on_hand');

        $expense = Expense::query()->create([
            'category' => 'administrative_expense',
            'expense_date' => '2026-03-05',
            'amount' => 310,
            'note' => 'Meeting supplies',
            'payee_name' => 'Stationery Shop',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $auditor->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson('/api/v1/finance/expense-audit-notes', [
            'expense_id' => $expense->id,
            'target_month' => '2026-03',
            'category' => 'administrative_expense',
            'discrepancy_type' => 'missing_support_reference',
            'status' => 'needs_followup',
            'note_text' => 'Receipt attachment is missing.',
        ])->assertCreated();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($auditor, $expense) {
                return $event === 'finance.expense_audit_note_created'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $auditor->id
                    && (int) ($context['expense_id'] ?? 0) === (int) $expense->id
                    && ($context['discrepancy_type'] ?? null) === 'missing_support_reference'
                    && ($context['status'] ?? null) === 'needs_followup';
            })
            ->once();
    }

    public function test_finance_opening_balance_recorded_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('bank');

        Sanctum::actingAs($treasurer);

        $this->postJson('/api/v1/finance/opening-balances', [
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 5000,
            'note' => 'Opening bank balance',
        ])->assertCreated();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($treasurer, $account) {
                return $event === 'finance.opening_balance_recorded'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $treasurer->id
                    && (int) ($context['finance_account_id'] ?? 0) === (int) $account->id
                    && (float) ($context['amount'] ?? 0) === 5000.0
                    && isset($context['opening_balance_id']);
            })
            ->once();
    }

    public function test_finance_opening_balance_reversed_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('gcash');

        $openingBalance = FinanceAccountOpeningBalance::query()->create([
            'finance_account_id' => $account->id,
            'effective_date' => '2026-01-01',
            'amount' => 4200,
            'note' => 'Initial GCash float',
            'encoded_by_user_id' => $treasurer->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/finance/opening-balances/{$openingBalance->id}/reverse", [
            'remarks' => 'Opening amount encoded incorrectly',
            'finance_account_id' => $account->id,
        ])->assertCreated();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($treasurer, $openingBalance) {
                return $event === 'finance.opening_balance_reversed'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $treasurer->id
                    && (int) ($context['opening_balance_id'] ?? 0) === (int) $openingBalance->id
                    && ($context['remarks'] ?? null) === 'Opening Amount Encoded Incorrectly'
                    && isset($context['effective_date'])
                    && isset($context['reversal_opening_balance_id']);
            })
            ->once();
    }

}
