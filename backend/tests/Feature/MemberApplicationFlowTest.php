<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use App\Notifications\MemberApplicationVerificationToken;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
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
        Notification::fake();

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
        $submit->assertJsonMissingPath('verification_token');
        $applicantUser = User::query()->where('email', 'juan@applicant.test')->firstOrFail();
        $token = '';
        Notification::assertSentTo($applicantUser, MemberApplicationVerificationToken::class, function (MemberApplicationVerificationToken $notification) use (&$token) {
            $token = $notification->token();
            return true;
        });
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

    public function test_non_chairman_cannot_approve_verified_application(): void
    {
        Notification::fake();

        $submit = $this->postJson('/api/v1/member-applications', [
            'first_name' => 'Pedro',
            'middle_name' => 'Salazar',
            'last_name' => 'Cruz',
            'email' => 'pedro@applicant.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'membership_status' => 'applicant',
        ]);
        $submit->assertStatus(201);
        $applicationId = (int) $submit->json('application_id');

        $applicantUser = User::query()->where('email', 'pedro@applicant.test')->firstOrFail();
        $token = '';
        Notification::assertSentTo($applicantUser, MemberApplicationVerificationToken::class, function (MemberApplicationVerificationToken $notification) use (&$token) {
            $token = $notification->token();
            return true;
        });
        $this->assertNotEmpty($token);

        $this->postJson('/api/v1/member-applications/verify', [
            'email' => 'pedro@applicant.test',
            'verification_token' => $token,
        ])->assertOk();

        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/member-applications/{$applicationId}/approve")
            ->assertStatus(403);
    }

    public function test_treasurer_cannot_approve_verified_application(): void
    {
        Notification::fake();

        $submit = $this->postJson('/api/v1/member-applications', [
            'first_name' => 'Luis',
            'middle_name' => 'Soriano',
            'last_name' => 'Delos Reyes',
            'email' => 'luis@applicant.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'membership_status' => 'applicant',
        ]);
        $submit->assertStatus(201);
        $applicationId = (int) $submit->json('application_id');

        $applicantUser = User::query()->where('email', 'luis@applicant.test')->firstOrFail();
        $token = '';
        Notification::assertSentTo($applicantUser, MemberApplicationVerificationToken::class, function (MemberApplicationVerificationToken $notification) use (&$token) {
            $token = $notification->token();
            return true;
        });
        $this->assertNotEmpty($token);

        $this->postJson('/api/v1/member-applications/verify', [
            'email' => 'luis@applicant.test',
            'verification_token' => $token,
        ])->assertOk();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/member-applications/{$applicationId}/approve")
            ->assertStatus(403);
    }

    public function test_non_chairman_cannot_set_application_stage(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();

        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $applicant = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'stage-guard@applicant.test',
        ]);

        $application = \App\Models\MemberApplication::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Stage',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'stage-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'stage-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/member-applications/{$application->id}/stage", [
            'current_stage' => 'incubation',
        ])->assertStatus(403);
    }

    public function test_non_chairman_cannot_post_application_notice(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\MemberApplication::query()->create([
            'first_name' => 'Notice',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'notice-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'notice-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/member-applications/{$application->id}/notice", [
            'notice_text' => 'This should be denied for non-chairman.',
        ])->assertStatus(403);
    }

    public function test_non_treasurer_cannot_set_applicant_fee_requirement(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\MemberApplication::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'fee-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/member-applications/{$application->id}/fee-requirements", [
            'required_amount' => 1000,
            'note' => 'Should be blocked for non-treasurer',
        ])->assertStatus(403);
    }

    public function test_treasurer_can_set_and_pay_applicant_fee_requirement(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);

        $application = \App\Models\MemberApplication::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Flow',
            'last_name' => 'Applicant',
            'email' => 'fee-flow@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-flow-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $setRequirement = $this->postJson("/api/v1/member-applications/{$application->id}/fee-requirements", [
            'required_amount' => 2000,
            'note' => 'Required applicant processing fee',
        ]);

        $setRequirement->assertStatus(201);
        $requirementId = (int) $setRequirement->json('requirement.id');
        $this->assertGreaterThan(0, $requirementId);

        $addPayment = $this->postJson("/api/v1/member-applications/fee-requirements/{$requirementId}/payments", [
            'amount' => 500,
            'note' => 'Partial payment',
        ]);

        $addPayment->assertStatus(201);
        $this->assertSame('500.00', (string) $addPayment->json('payment.amount'));
    }

    public function test_non_chairman_cannot_reject_application(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\MemberApplication::query()->create([
            'first_name' => 'Reject',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'reject-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'reject-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/member-applications/{$application->id}/reject", [
            'reason' => 'Should be blocked',
        ])->assertStatus(403);
    }

    public function test_non_chairman_cannot_set_probation(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\MemberApplication::query()->create([
            'first_name' => 'Probation',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'probation-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'probation-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/member-applications/{$application->id}/probation")
            ->assertStatus(403);
    }

    public function test_non_chairman_cannot_review_application_document(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\MemberApplication::query()->create([
            'first_name' => 'Document',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'document-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'document-guard-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicationDocument::query()->create([
            'member_application_id' => $application->id,
            'file_path' => 'application-docs/sample.pdf',
            'original_name' => 'sample.pdf',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/member-applications/documents/{$document->id}/review", [
            'status' => 'approved',
            'review_note' => 'Should be blocked for non-chairman',
        ])->assertStatus(403);
    }

    public function test_user_cannot_upload_document_to_other_users_application(): void
    {
        Storage::fake('public');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $owner = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'owner-upload@applicant.test',
        ]);
        $otherApplicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'other-upload@applicant.test',
        ]);

        $application = \App\Models\MemberApplication::query()->create([
            'user_id' => $owner->id,
            'first_name' => 'Owner',
            'middle_name' => 'Upload',
            'last_name' => 'Applicant',
            'email' => 'owner-upload@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'owner-upload-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($otherApplicant);

        $this->postJson("/api/v1/member-applications/{$application->id}/documents", [
            'document' => UploadedFile::fake()->image('id-card.png'),
        ])->assertStatus(403);
    }

    public function test_application_owner_can_view_own_document(): void
    {
        Storage::fake('public');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'doc-owner@applicant.test',
        ]);

        $application = \App\Models\MemberApplication::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Doc',
            'middle_name' => 'Owner',
            'last_name' => 'Applicant',
            'email' => 'doc-owner@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'doc-owner-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicationDocument::query()->create([
            'member_application_id' => $application->id,
            'file_path' => 'application-docs/doc-owner.pdf',
            'original_name' => 'doc-owner.pdf',
            'status' => 'pending',
        ]);
        Storage::disk('public')->put('application-docs/doc-owner.pdf', 'dummy-pdf-content');

        Sanctum::actingAs($applicant);

        $this->get("/api/v1/member-applications/documents/{$document->id}/view")
            ->assertStatus(200);
    }

    public function test_unrelated_user_cannot_view_application_document_without_permission(): void
    {
        Storage::fake('public');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $owner = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'doc-guard-owner@applicant.test',
        ]);
        $other = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'doc-guard-other@applicant.test',
        ]);

        $application = \App\Models\MemberApplication::query()->create([
            'user_id' => $owner->id,
            'first_name' => 'Doc',
            'middle_name' => 'Guard',
            'last_name' => 'Owner',
            'email' => 'doc-guard-owner@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_approval',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'doc-guard-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicationDocument::query()->create([
            'member_application_id' => $application->id,
            'file_path' => 'application-docs/doc-guard.pdf',
            'original_name' => 'doc-guard.pdf',
            'status' => 'pending',
        ]);
        Storage::disk('public')->put('application-docs/doc-guard.pdf', 'dummy-pdf-content');

        Sanctum::actingAs($other);

        $this->get("/api/v1/member-applications/documents/{$document->id}/view")
            ->assertStatus(403);
    }
}
