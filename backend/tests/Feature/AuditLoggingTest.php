<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\Contribution;
use App\Models\ContributionEditRequest;
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

        $application = MemberApplication::query()->create([
            'first_name' => 'Notice',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'notice-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'notice-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/member-applications/{$application->id}/notice", [
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

        $application = MemberApplication::query()->create([
            'first_name' => 'Probation',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'probation-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'probation-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/member-applications/{$application->id}/probation")
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

        $application = MemberApplication::query()->create([
            'first_name' => 'Stage',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'stage-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'stage-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/member-applications/{$application->id}/stage", [
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

        $application = MemberApplication::query()->create([
            'first_name' => 'Document',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'document-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'document-audit-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicationDocument::query()->create([
            'member_application_id' => $application->id,
            'file_path' => 'application-docs/document-audit.pdf',
            'original_name' => 'document-audit.pdf',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/member-applications/documents/{$document->id}/review", [
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
            'email' => 'updated-target@example.com',
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
            'finance_role' => 'auditor',
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($actor, $candidate) {
                return $event === 'admin.role_assigned'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $actor->id
                    && (int) ($context['target_member_id'] ?? 0) === (int) $candidate->id
                    && ($context['primary_role'] ?? null) === 'member'
                    && ($context['finance_role'] ?? null) === 'auditor';
            })
            ->once();
    }

    public function test_setting_applicant_fee_requirement_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = MemberApplication::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Requirement',
            'last_name' => 'Audit',
            'email' => 'fee-requirement-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-requirement-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/member-applications/{$application->id}/fee-requirements", [
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

        $application = MemberApplication::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Payment',
            'last_name' => 'Audit',
            'email' => 'fee-payment-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-payment-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $requirementResponse = $this->postJson("/api/v1/member-applications/{$application->id}/fee-requirements", [
            'category' => 'project',
            'required_amount' => 1200,
            'note' => 'Payment audit requirement',
        ])->assertStatus(201);

        $requirementId = (int) $requirementResponse->json('requirement.id');
        $this->assertGreaterThan(0, $requirementId);

        $this->postJson("/api/v1/member-applications/{$application->id}/fee-payments", [
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

        $application = MemberApplication::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => 'Approve',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'approve-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'approve-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/member-applications/{$application->id}/approve")
            ->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($chairman, $application) {
                return $event === 'application.approved'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $chairman->id
                    && (int) ($context['application_id'] ?? 0) === (int) $application->id
                    && isset($context['member_id']);
            })
            ->once();
    }

    public function test_rejecting_application_emits_audit_log(): void
    {
        Log::spy();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = MemberApplication::query()->create([
            'first_name' => 'Reject',
            'middle_name' => 'Audit',
            'last_name' => 'Case',
            'email' => 'reject-audit@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'reject-audit-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/member-applications/{$application->id}/reject", [
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

    public function test_approving_finance_edit_request_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $encodedBy = User::factory()->create(['role_id' => $adminRole->id]);

        $member = Member::query()->create([
            'member_number' => 'M-FIN-001',
            'first_name' => 'Finance',
            'middle_name' => null,
            'last_name' => 'Approve',
            'email' => 'finance-approve@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 1000,
            'note' => 'Original amount',
            'encoded_by_user_id' => $encodedBy->id,
            'encoded_at' => now(),
        ]);

        $editRequest = ContributionEditRequest::query()->create([
            'contribution_id' => $contribution->id,
            'requested_amount' => 1200,
            'reason' => 'Correction',
            'requested_by_user_id' => $encodedBy->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson("/api/v1/finance/edit-requests/{$editRequest->id}/approve")
            ->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($auditor, $editRequest, $contribution) {
                return $event === 'finance.edit_request_approved'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $auditor->id
                    && (int) ($context['request_id'] ?? 0) === (int) $editRequest->id
                    && (int) ($context['contribution_id'] ?? 0) === (int) $contribution->id;
            })
            ->once();
    }

    public function test_rejecting_finance_edit_request_emits_audit_log(): void
    {
        Log::spy();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'auditor',
        ]);
        $encodedBy = User::factory()->create(['role_id' => $adminRole->id]);

        $member = Member::query()->create([
            'member_number' => 'M-FIN-002',
            'first_name' => 'Finance',
            'middle_name' => null,
            'last_name' => 'Reject',
            'email' => 'finance-reject@example.com',
            'membership_status' => 'active',
        ]);

        $contribution = Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 900,
            'note' => 'Original amount',
            'encoded_by_user_id' => $encodedBy->id,
            'encoded_at' => now(),
        ]);

        $editRequest = ContributionEditRequest::query()->create([
            'contribution_id' => $contribution->id,
            'requested_amount' => 1500,
            'reason' => 'Outlier request',
            'requested_by_user_id' => $encodedBy->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($auditor);

        $this->postJson("/api/v1/finance/edit-requests/{$editRequest->id}/reject", [
            'review_notes' => 'Insufficient basis for requested change.',
        ])->assertOk();

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context) use ($auditor, $editRequest, $contribution) {
                return $event === 'finance.edit_request_rejected'
                    && (int) ($context['actor_user_id'] ?? 0) === (int) $auditor->id
                    && (int) ($context['request_id'] ?? 0) === (int) $editRequest->id
                    && (int) ($context['contribution_id'] ?? 0) === (int) $contribution->id;
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

        $application = MemberApplication::query()->create([
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
}
