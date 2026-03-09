<?php

namespace Tests\Feature;

use App\Models\ApplicantBatch;
use App\Models\ApplicantDocument;
use App\Models\ApplicantFeeRequirement;
use App\Models\Member;
use App\Models\Applicant;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Notifications\ApplicantVerificationToken;
use App\Support\VerificationToken;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApplicantFlowTest extends TestCase
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

        $submit = $this->postJson('/api/v1/applicant-registrations', [
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
        Notification::assertSentTo($applicantUser, ApplicantVerificationToken::class, function (ApplicantVerificationToken $notification) use (&$token) {
            $token = $notification->token();
            return true;
        });
        $this->assertNotEmpty($token);
        $this->assertSame(VerificationToken::LENGTH, strlen($token));
        $this->assertMatchesRegularExpression('/^[A-Z0-9]{' . VerificationToken::LENGTH . '}$/', $token);

        $verify = $this->postJson('/api/v1/applicant-registrations/verify', [
            'email' => 'juan@applicant.test',
            'verification_token' => $token,
        ]);
        $verify->assertOk();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);
        Sanctum::actingAs($chairman);

        $applications = $this->getJson('/api/v1/applicants');
        $applications->assertOk();
        $applications->assertJsonPath('data.0.id', $applicationId);

        $approve = $this->postJson("/api/v1/applicants/{$applicationId}/approve");
        $approve->assertOk();
        $approve->assertJsonPath('application.status', 'official_applicant');
        $approve->assertJsonPath('application.member_id', null);
        $this->assertSame('applicant', User::query()->findOrFail($applicantUser->id)->role->name);
    }

    public function test_only_under_review_applicant_can_be_approved_by_membership_chairman(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();

        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);
        $applicantUser = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'not-ready@applicant.test',
        ]);

        $application = Applicant::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => 'Not',
            'middle_name' => 'Yet',
            'last_name' => 'Reviewable',
            'email' => 'not-ready@applicant.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_PENDING_VERIFICATION,
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', 'not-ready-token'),
            'email_verified_at' => null,
            'is_login_blocked' => false,
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/approve")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Only verified applications under review can be approved.');

        $application->refresh();
        $this->assertSame(Applicant::STATUS_PENDING_VERIFICATION, $application->status);
        $this->assertSame('pending', $application->decision_status);
    }

    public function test_eligible_official_applicant_can_be_activated_as_member_by_chairman(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();

        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);
        $applicantUser = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'activate@applicant.test',
        ]);

        $application = Applicant::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => 'Activate',
            'middle_name' => 'Official',
            'last_name' => 'Applicant',
            'email' => 'activate@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'eligible_for_activation',
            'decision_status' => 'approved',
            'current_stage' => 'induction',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'activate-token'),
            'email_verified_at' => now(),
            'reviewed_at' => now(),
        ]);

        ApplicantDocument::query()->create([
            'applicant_id' => $application->id,
            'file_path' => 'application-docs/activate.pdf',
            'original_name' => 'activate.pdf',
            'status' => 'approved',
        ]);

        $requirement = ApplicantFeeRequirement::query()->create([
            'applicant_id' => $application->id,
            'category' => ApplicantFeeRequirement::CATEGORY_PROJECT,
            'required_amount' => 500,
            'set_by_user_id' => $chairman->id,
        ]);

        $requirement->payments()->create([
            'amount' => 500,
            'payment_date' => now()->toDateString(),
            'encoded_by_user_id' => $chairman->id,
        ]);

        Sanctum::actingAs($chairman);

        $response = $this->postJson("/api/v1/applicants/{$application->id}/activate");
        $response->assertOk()
            ->assertJsonPath('application.status', 'activated');

        $application->refresh();
        $applicantUser->refresh();

        $this->assertNotNull($application->member_id);
        $this->assertNotNull($application->activated_at);
        $this->assertSame('member', $applicantUser->role->name);
        $this->assertDatabaseHas('members', [
            'id' => $application->member_id,
            'email' => 'activate@applicant.test',
        ]);
    }

    public function test_batch_treasurer_can_log_applicant_payment_for_assigned_batch(): void
    {
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $treasurer = User::factory()->create([
            'email' => 'batch-treasurer@example.test',
        ]);
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'batch-applicant@example.test',
        ]);

        $batch = ApplicantBatch::query()->create([
            'name' => 'Batch Marilag',
            'batch_treasurer_user_id' => $treasurer->id,
        ]);

        $application = Applicant::query()->create([
            'user_id' => $applicant->id,
            'batch_id' => $batch->id,
            'first_name' => 'Batch',
            'middle_name' => 'Track',
            'last_name' => 'Applicant',
            'email' => 'batch-applicant@example.test',
            'membership_status' => 'applicant',
            'status' => 'official_applicant',
            'decision_status' => 'approved',
            'current_stage' => 'incubation',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'batch-pay-token'),
            'email_verified_at' => now(),
            'reviewed_at' => now(),
        ]);

        ApplicantFeeRequirement::query()->create([
            'applicant_id' => $application->id,
            'category' => ApplicantFeeRequirement::CATEGORY_PROJECT,
            'required_amount' => 500,
            'set_by_user_id' => $treasurer->id,
        ]);

        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/applicants/{$application->id}/fee-payments", [
            'category' => ApplicantFeeRequirement::CATEGORY_PROJECT,
            'amount' => 250,
        ])->assertStatus(201);
    }

    public function test_archived_withdrawn_applicant_can_start_reapplication(): void
    {
        Notification::fake();

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'reapply@applicant.test',
        ]);

        Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Reapply',
            'middle_name' => 'Flow',
            'last_name' => 'Applicant',
            'email' => 'reapply@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'withdrawn',
            'decision_status' => 'withdrawn',
            'current_stage' => 'interview',
            'is_login_blocked' => true,
            'verification_token' => hash('sha256', 'reapply-old-token'),
            'email_verified_at' => now(),
            'reviewed_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/applicant-registrations/reapply', [
            'email' => 'reapply@applicant.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonFragment([
                'message' => 'Reapplication started. Verify your email to continue to review.',
            ]);

        $newApplication = Applicant::query()
            ->where('email', 'reapply@applicant.test')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('pending_verification', $newApplication->status);
        $this->assertSame('pending', $newApplication->decision_status);
        $this->assertFalse($newApplication->is_login_blocked);
        $this->assertNotSame('reapply-old-token', $newApplication->verification_token);

        Notification::assertSentTo($applicant->fresh(), ApplicantVerificationToken::class);
    }

    public function test_reapplication_is_rejected_when_open_application_exists(): void
    {
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'reapply-open@applicant.test',
        ]);

        Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Reapply',
            'middle_name' => 'Open',
            'last_name' => 'Applicant',
            'email' => 'reapply-open@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'reapply-open-token'),
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/v1/applicant-registrations/reapply', [
            'email' => 'reapply-open@applicant.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(422);
    }

    public function test_applicant_can_withdraw_own_open_application(): void
    {
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'withdraw-self@applicant.test',
        ]);

        $application = \App\Models\Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Withdraw',
            'middle_name' => 'Self',
            'last_name' => 'Applicant',
            'email' => 'withdraw-self@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'withdraw-self-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($applicant);

        $this->postJson('/api/v1/applicants/me/withdraw')
            ->assertOk()
            ->assertJsonPath('application.status', 'withdrawn')
            ->assertJsonPath('application.decision_status', 'withdrawn');

        $application->refresh();
        $this->assertSame('withdrawn', $application->status);
        $this->assertSame('withdrawn', $application->decision_status);
        $this->assertTrue($application->is_login_blocked);
    }

    public function test_applicant_cannot_withdraw_activated_application(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'archive-member@applicant.test',
        ]);

        $member = Member::query()->create([
            'member_number' => 'LGEC-2026-00021',
            'first_name' => 'Archive',
            'middle_name' => 'Member',
            'last_name' => 'User',
            'email' => 'archive-member@applicant.test',
            'membership_status' => 'active',
            'user_id' => $memberUser->id,
        ]);

        \App\Models\Applicant::query()->create([
            'user_id' => $memberUser->id,
            'member_id' => $member->id,
            'first_name' => 'Archive',
            'middle_name' => 'Member',
            'last_name' => 'User',
            'email' => 'archive-member@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'activated',
            'decision_status' => 'approved',
            'current_stage' => 'induction',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'archive-member-token'),
            'email_verified_at' => now(),
            'activated_at' => now(),
        ]);

        Sanctum::actingAs($memberUser);

        $this->postJson('/api/v1/applicants/me/withdraw')
            ->assertStatus(422);
    }

    public function test_activated_member_can_view_application_archive(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'archive-view@applicant.test',
        ]);

        $member = Member::query()->create([
            'member_number' => 'LGEC-2026-00022',
            'first_name' => 'Archive',
            'middle_name' => 'View',
            'last_name' => 'User',
            'email' => 'archive-view@applicant.test',
            'membership_status' => 'active',
            'user_id' => $memberUser->id,
        ]);

        $application = \App\Models\Applicant::query()->create([
            'user_id' => $memberUser->id,
            'member_id' => $member->id,
            'first_name' => 'Archive',
            'middle_name' => 'View',
            'last_name' => 'User',
            'email' => 'archive-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'activated',
            'decision_status' => 'approved',
            'current_stage' => 'induction',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'archive-view-token'),
            'email_verified_at' => now(),
            'activated_at' => now(),
        ]);

        Sanctum::actingAs($memberUser);

        $this->getJson('/api/v1/applicants/archive/me')
            ->assertOk()
            ->assertJsonPath('id', $application->id)
            ->assertJsonPath('member_id', $member->id)
            ->assertJsonPath('status', 'activated')
            ->assertJsonPath('decision_status', 'approved');
    }

    public function test_internal_committee_notes_are_hidden_from_applicant_and_archive_views(): void
    {
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();

        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'internal-note@applicant.test',
        ]);
        $chairman = User::factory()->create([
            'role_id' => $chairmanRole->id,
        ]);

        $application = \App\Models\Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Internal',
            'middle_name' => 'Note',
            'last_name' => 'Applicant',
            'email' => 'internal-note@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'internal-note-token'),
            'email_verified_at' => now(),
        ]);

        \App\Models\ApplicantNotice::query()->create([
            'applicant_id' => $application->id,
            'notice_text' => 'Public applicant notice',
            'visibility' => 'applicant',
            'created_by_user_id' => $chairman->id,
        ]);

        \App\Models\ApplicantNotice::query()->create([
            'applicant_id' => $application->id,
            'notice_text' => 'Internal committee-only note',
            'visibility' => 'internal',
            'created_by_user_id' => $chairman->id,
        ]);

        Sanctum::actingAs($applicant);

        $this->getJson('/api/v1/applicants/me')
            ->assertOk()
            ->assertJsonCount(1, 'notices')
            ->assertJsonMissing(['notice_text' => 'Internal committee-only note']);

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $applicant->update(['role_id' => $memberRole->id]);
        $member = Member::query()->create([
            'member_number' => 'LGEC-2026-00023',
            'first_name' => 'Internal',
            'middle_name' => 'Note',
            'last_name' => 'Applicant',
            'email' => 'internal-note@applicant.test',
            'membership_status' => 'active',
            'user_id' => $applicant->id,
        ]);
        $application->update([
            'member_id' => $member->id,
            'status' => 'activated',
            'decision_status' => 'approved',
            'reviewed_at' => now(),
            'activated_at' => now(),
        ]);

        $this->getJson('/api/v1/applicants/archive/me')
            ->assertOk()
            ->assertJsonCount(1, 'notices')
            ->assertJsonMissing(['notice_text' => 'Internal committee-only note']);

        Sanctum::actingAs($chairman);

        $this->getJson("/api/v1/applicants/{$application->id}")
            ->assertOk()
            ->assertJsonCount(2, 'notices');
    }

    public function test_direct_member_create_route_is_not_available(): void
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

        $response->assertStatus(405);
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

        $submit = $this->postJson('/api/v1/applicant-registrations', [
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

        $submit = $this->postJson('/api/v1/applicant-registrations', [
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
        $submit = $this->postJson('/api/v1/applicant-registrations', [
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
        ]);
    }

    public function test_non_chairman_cannot_approve_verified_application(): void
    {
        Notification::fake();

        $submit = $this->postJson('/api/v1/applicant-registrations', [
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
        Notification::assertSentTo($applicantUser, ApplicantVerificationToken::class, function (ApplicantVerificationToken $notification) use (&$token) {
            $token = $notification->token();
            return true;
        });
        $this->assertSame(VerificationToken::LENGTH, strlen($token));
        $this->assertMatchesRegularExpression('/^[A-Z0-9]{' . VerificationToken::LENGTH . '}$/', $token);
        $this->assertNotEmpty($token);

        $this->postJson('/api/v1/applicant-registrations/verify', [
            'email' => 'pedro@applicant.test',
            'verification_token' => $token,
        ])->assertOk();

        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/applicants/{$applicationId}/approve")
            ->assertStatus(403);
    }

    public function test_treasurer_cannot_approve_verified_application(): void
    {
        Notification::fake();

        $submit = $this->postJson('/api/v1/applicant-registrations', [
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
        Notification::assertSentTo($applicantUser, ApplicantVerificationToken::class, function (ApplicantVerificationToken $notification) use (&$token) {
            $token = $notification->token();
            return true;
        });
        $this->assertSame(VerificationToken::LENGTH, strlen($token));
        $this->assertMatchesRegularExpression('/^[A-Z0-9]{' . VerificationToken::LENGTH . '}$/', $token);
        $this->assertNotEmpty($token);

        $this->postJson('/api/v1/applicant-registrations/verify', [
            'email' => 'luis@applicant.test',
            'verification_token' => $token,
        ])->assertOk();

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        Sanctum::actingAs($treasurer);

        $this->postJson("/api/v1/applicants/{$applicationId}/approve")
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

        $application = \App\Models\Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Stage',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'stage-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'stage-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/applicants/{$application->id}/stage", [
            'current_stage' => 'incubation',
        ])->assertStatus(403);
    }

    public function test_non_chairman_cannot_post_application_notice(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\Applicant::query()->create([
            'first_name' => 'Notice',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'notice-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'notice-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/applicants/{$application->id}/notice", [
            'notice_text' => 'This should be denied for non-chairman.',
        ])->assertStatus(403);
    }

    public function test_non_chairman_with_notice_permission_still_cannot_post_application_notice(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $noticePermission = Permission::query()->where('name', 'applications.notice.set')->firstOrFail();
        $admin->role->permissions()->syncWithoutDetaching([$noticePermission->id]);

        $application = \App\Models\Applicant::query()->create([
            'first_name' => 'Guarded',
            'middle_name' => 'Notice',
            'last_name' => 'Applicant',
            'email' => 'guarded-notice@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'guarded-notice-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($admin->fresh('role.permissions'));

        $this->postJson("/api/v1/applicants/{$application->id}/notice", [
            'notice_text' => 'This should still be denied.',
        ])->assertStatus(403);
    }

    public function test_membership_chairman_can_remove_pending_verification_applicant_with_wrong_email(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $linkedUser = User::factory()->create([
            'role_id' => Role::query()->where('name', 'applicant')->firstOrFail()->id,
            'email' => 'wrong-email@applicant.test',
            'email_verified_at' => null,
        ]);

        $application = Applicant::query()->create([
            'user_id' => $linkedUser->id,
            'first_name' => 'Wrong',
            'middle_name' => 'Email',
            'last_name' => 'Applicant',
            'email' => 'wrong-email@applicant.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_PENDING_VERIFICATION,
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', 'wrong-email-token'),
            'email_verified_at' => null,
            'is_login_blocked' => false,
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/recover-pending-verification")
            ->assertOk()
            ->assertJsonPath('message', 'Pending verification applicant deleted. The person may register again using the correct email address.');

        $this->assertDatabaseMissing('applicants', ['id' => $application->id]);
        $this->assertDatabaseMissing('users', ['id' => $linkedUser->id]);
    }

    public function test_membership_chairman_cannot_remove_under_review_applicant_through_wrong_email_recovery(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Reviewed',
            'middle_name' => 'Queue',
            'last_name' => 'Applicant',
            'email' => 'reviewed@applicant.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_UNDER_REVIEW,
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', 'reviewed-token'),
            'email_verified_at' => now(),
            'is_login_blocked' => false,
        ]);

        Sanctum::actingAs($chairman);

        $this->postJson("/api/v1/applicants/{$application->id}/recover-pending-verification")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Only pending verification applicants with unreachable email tokens can be removed through this chairman recovery workflow.');

        $this->assertDatabaseHas('applicants', ['id' => $application->id]);
    }

    public function test_non_chairman_with_review_permission_cannot_use_wrong_email_recovery(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $reviewPermission = Permission::query()->where('name', 'applications.review')->firstOrFail();
        $adminRole->permissions()->syncWithoutDetaching([$reviewPermission->id]);
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Blocked',
            'middle_name' => 'Recovery',
            'last_name' => 'Applicant',
            'email' => 'blocked-recovery@applicant.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_PENDING_VERIFICATION,
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', 'blocked-recovery-token'),
            'email_verified_at' => null,
            'is_login_blocked' => false,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/applicants/{$application->id}/recover-pending-verification")
            ->assertStatus(403);

        $this->assertDatabaseHas('applicants', ['id' => $application->id]);
    }

    public function test_non_chairman_cannot_set_applicant_contribution_target(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\Applicant::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'fee-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/applicants/{$application->id}/fee-requirements", [
            'required_amount' => 1000,
            'category' => 'project',
            'note' => 'Should be blocked for non-chairman',
        ])->assertStatus(403);
    }

    public function test_membership_chairman_can_set_and_pay_applicant_contribution_target(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = \App\Models\Applicant::query()->create([
            'first_name' => 'Fee',
            'middle_name' => 'Flow',
            'last_name' => 'Applicant',
            'email' => 'fee-flow@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'fee-flow-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $setRequirement = $this->postJson("/api/v1/applicants/{$application->id}/fee-requirements", [
            'category' => 'project',
            'required_amount' => 2000,
            'note' => 'Applicant project target',
        ]);

        $setRequirement->assertStatus(201);
        $requirementId = (int) $setRequirement->json('requirement.id');
        $this->assertGreaterThan(0, $requirementId);

        $addPayment = $this->postJson("/api/v1/applicants/{$application->id}/fee-payments", [
            'category' => 'project',
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

        $application = \App\Models\Applicant::query()->create([
            'first_name' => 'Reject',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'reject-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'reject-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/applicants/{$application->id}/reject", [
            'reason' => 'Should be blocked',
        ])->assertStatus(403);
    }

    public function test_non_chairman_cannot_set_probation(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\Applicant::query()->create([
            'first_name' => 'Probation',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'probation-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'probation-guard-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/applicants/{$application->id}/probation")
            ->assertStatus(403);
    }

    public function test_non_chairman_cannot_review_application_document(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = \App\Models\Applicant::query()->create([
            'first_name' => 'Document',
            'middle_name' => 'Guard',
            'last_name' => 'Applicant',
            'email' => 'document-guard@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'document-guard-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicantDocument::query()->create([
            'applicant_id' => $application->id,
            'file_path' => 'application-docs/sample.pdf',
            'original_name' => 'sample.pdf',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($officer);

        $this->postJson("/api/v1/applicants/documents/{$document->id}/review", [
            'status' => 'approved',
            'review_note' => 'Should be blocked for non-chairman',
        ])->assertStatus(403);
    }

    public function test_user_cannot_upload_document_to_other_users_application(): void
    {
        Storage::fake('local');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $owner = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'owner-upload@applicant.test',
        ]);
        $otherApplicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'other-upload@applicant.test',
        ]);

        $application = \App\Models\Applicant::query()->create([
            'user_id' => $owner->id,
            'first_name' => 'Owner',
            'middle_name' => 'Upload',
            'last_name' => 'Applicant',
            'email' => 'owner-upload@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'owner-upload-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($otherApplicant);

        $this->postJson("/api/v1/applicants/{$application->id}/documents", [
            'document' => UploadedFile::fake()->image('id-card.png'),
            'document_label' => 'Government ID',
            'description' => 'Front image of the submitted government ID.',
        ])->assertStatus(403);
    }

    public function test_application_document_upload_requires_label_and_description(): void
    {
        Storage::fake('local');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'doc-metadata@applicant.test',
        ]);

        $application = Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Meta',
            'middle_name' => 'Data',
            'last_name' => 'Applicant',
            'email' => 'doc-metadata@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'doc-metadata-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($applicant);

        $this->postJson("/api/v1/applicants/{$application->id}/documents", [
            'document' => UploadedFile::fake()->image('proof.png'),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['document_label', 'description']);
    }

    public function test_application_document_upload_stores_label_and_description(): void
    {
        Storage::fake('local');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'doc-upload@applicant.test',
        ]);

        $application = Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Upload',
            'middle_name' => 'Meta',
            'last_name' => 'Applicant',
            'email' => 'doc-upload@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'doc-upload-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($applicant);

        $this->postJson("/api/v1/applicants/{$application->id}/documents", [
            'document' => UploadedFile::fake()->image('proof.png'),
            'document_label' => 'Barangay Clearance',
            'description' => 'Scanned barangay clearance for membership verification.',
        ])->assertStatus(201)
            ->assertJsonPath('document.document_label', 'Barangay Clearance')
            ->assertJsonPath('document.description', 'Scanned barangay clearance for membership verification.');

        $this->assertDatabaseHas('applicant_documents', [
            'applicant_id' => $application->id,
            'document_label' => 'Barangay Clearance',
            'description' => 'Scanned barangay clearance for membership verification.',
        ]);
    }

    public function test_application_owner_can_view_own_document(): void
    {
        Storage::fake('public');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicant = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'doc-owner@applicant.test',
        ]);

        $application = \App\Models\Applicant::query()->create([
            'user_id' => $applicant->id,
            'first_name' => 'Doc',
            'middle_name' => 'Owner',
            'last_name' => 'Applicant',
            'email' => 'doc-owner@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'doc-owner-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicantDocument::query()->create([
            'applicant_id' => $application->id,
            'file_path' => 'application-docs/doc-owner.pdf',
            'original_name' => 'doc-owner.pdf',
            'status' => 'pending',
        ]);
        Storage::disk('public')->put('application-docs/doc-owner.pdf', 'dummy-pdf-content');

        Sanctum::actingAs($applicant);

        $this->get("/api/v1/applicants/documents/{$document->id}/view")
            ->assertStatus(200);
    }

    public function test_membership_chairman_applicant_detail_includes_document_view_url(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Preview',
            'middle_name' => 'Link',
            'last_name' => 'Applicant',
            'email' => 'preview-link@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'preview-link-token'),
            'email_verified_at' => now(),
        ]);

        $document = ApplicantDocument::query()->create([
            'applicant_id' => $application->id,
            'file_path' => 'application-docs/preview-link.png',
            'original_name' => 'preview-link.png',
            'document_label' => 'Government ID',
            'description' => 'Scanned government ID for review.',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($chairman);

        $this->getJson("/api/v1/applicants/{$application->id}")
            ->assertOk()
            ->assertJsonPath('documents.0.id', $document->id)
            ->assertJsonPath('documents.0.view_url', "/api/v1/applicants/documents/{$document->id}/view");
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

        $application = \App\Models\Applicant::query()->create([
            'user_id' => $owner->id,
            'first_name' => 'Doc',
            'middle_name' => 'Guard',
            'last_name' => 'Owner',
            'email' => 'doc-guard-owner@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'doc-guard-token'),
            'email_verified_at' => now(),
        ]);

        $document = \App\Models\ApplicantDocument::query()->create([
            'applicant_id' => $application->id,
            'file_path' => 'application-docs/doc-guard.pdf',
            'original_name' => 'doc-guard.pdf',
            'status' => 'pending',
        ]);
        Storage::disk('public')->put('application-docs/doc-guard.pdf', 'dummy-pdf-content');

        Sanctum::actingAs($other);

        $this->get("/api/v1/applicants/documents/{$document->id}/view")
            ->assertStatus(403);
    }
}
