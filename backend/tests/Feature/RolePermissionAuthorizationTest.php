<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\Role;
use App\Models\Member;
use App\Models\Applicant;
use App\Models\Contribution;
use App\Models\FinanceAccount;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RolePermissionAuthorizationTest extends TestCase
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

    public function test_member_cannot_create_post(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->postJson('/api/v1/cms/posts', [
            'title' => 'Unauthorized Post',
            'section' => 'news',
            'content' => 'Body content',
            'status' => 'published',
        ]);

        $response->assertStatus(403);
    }

    public function test_member_cannot_view_cms_posts_list(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/cms/posts');

        $response->assertStatus(403);
    }

    public function test_officer_can_update_post_but_cannot_delete_post(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $author = User::factory()->create(['role_id' => $adminRole->id]);

        $post = Post::query()->create([
            'title' => 'Initial title',
            'slug' => 'initial-title',
            'section' => 'news',
            'excerpt' => 'Initial excerpt',
            'content' => 'Initial content',
            'status' => 'draft',
            'author_id' => $author->id,
        ]);

        Sanctum::actingAs($officer);

        $updateResponse = $this->putJson("/api/v1/cms/posts/{$post->id}", [
            'title' => 'Updated title',
            'section' => 'news',
            'excerpt' => 'Updated excerpt',
            'content' => 'Updated content',
            'status' => 'published',
        ]);

        $updateResponse->assertOk();

        $deleteResponse = $this->deleteJson("/api/v1/cms/posts/{$post->id}");
        $deleteResponse->assertStatus(403);
    }

    public function test_member_cannot_view_members_endpoint(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/members');

        $response->assertStatus(403);
    }

    public function test_officer_can_view_members_endpoint(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->getJson('/api/v1/members');

        $response->assertStatus(200);
    }

    public function test_member_cannot_access_admin_users_list(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/admin/users');

        $response->assertStatus(403);
    }

    public function test_member_can_view_applicant_queue_but_not_dossier(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Member View',
            'email' => 'queued-member-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'pending_verification',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-member-view-token'),
            'email_verified_at' => null,
        ]);

        Sanctum::actingAs($member);

        $this->getJson('/api/v1/applicants?status=all')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-member-view@applicant.test');

        $this->getJson("/api/v1/applicants/{$application->id}")
            ->assertStatus(403);
    }

    public function test_officer_cannot_access_admin_users_list(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->getJson('/api/v1/admin/users');

        $response->assertStatus(403);
    }

    public function test_admin_can_access_admin_users_list(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/admin/users');

        $response->assertStatus(200);
    }

    public function test_superadmin_user_list_hides_bootstrap_row_but_shows_other_superadmin_rows(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();

        $viewer = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'viewer-superadmin@test.local',
        ]);
        $bootstrap = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'admin@lipataeagles.ph',
        ]);
        $managed = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'managed-superadmin@test.local',
        ]);

        Sanctum::actingAs($viewer);

        $response = $this->getJson('/api/v1/admin/users')
            ->assertOk();

        $rows = collect($response->json('data'));

        $this->assertNull($rows->firstWhere('id', $bootstrap->id));
        $this->assertSame('managed-superadmin@test.local', $rows->firstWhere('id', $managed->id)['email'] ?? null);
    }

    public function test_admin_user_list_hides_all_superadmin_rows(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();

        $viewer = User::factory()->create(['role_id' => $adminRole->id]);
        $bootstrap = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'admin@lipataeagles.ph',
        ]);
        $managed = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'managed-superadmin@test.local',
        ]);

        Sanctum::actingAs($viewer);

        $response = $this->getJson('/api/v1/admin/users')
            ->assertOk();

        $rows = collect($response->json('data'));

        $this->assertNull($rows->firstWhere('id', $bootstrap->id));
        $this->assertNull($rows->firstWhere('id', $managed->id));
    }

    public function test_officer_member_directory_hides_bootstrap_and_superadmin_rows(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $viewer = User::factory()->create(['role_id' => $officerRole->id]);
        $bootstrapUser = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'admin@lipataeagles.ph',
        ]);
        $managedSuperadminUser = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'managed-superadmin@test.local',
        ]);
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'visible-member@test.local',
        ]);

        $bootstrapMember = Member::query()->create([
            'member_number' => 'BOOTSTRAP-001',
            'first_name' => 'Bootstrap',
            'middle_name' => 'Root',
            'last_name' => 'Admin',
            'email' => 'admin@lipataeagles.ph',
            'membership_status' => 'active',
            'user_id' => $bootstrapUser->id,
        ]);
        $managedSuperadminMember = Member::query()->create([
            'member_number' => 'SUPERADMIN-002',
            'first_name' => 'Managed',
            'middle_name' => 'Peer',
            'last_name' => 'Admin',
            'email' => 'managed-superadmin@test.local',
            'membership_status' => 'active',
            'user_id' => $managedSuperadminUser->id,
        ]);
        $normalMember = Member::query()->create([
            'member_number' => 'MEMBER-003',
            'first_name' => 'Visible',
            'middle_name' => 'Regular',
            'last_name' => 'Member',
            'email' => 'visible-member@test.local',
            'membership_status' => 'active',
            'user_id' => $memberUser->id,
        ]);

        Sanctum::actingAs($viewer);

        $response = $this->getJson('/api/v1/members')
            ->assertOk();

        $rows = collect($response->json('data'));

        $this->assertNull($rows->firstWhere('id', $bootstrapMember->id));
        $this->assertNull($rows->firstWhere('id', $managedSuperadminMember->id));
        $this->assertSame('visible-member@test.local', $rows->firstWhere('id', $normalMember->id)['email'] ?? null);
    }

    public function test_admin_cannot_change_member_batch_through_member_update(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        $member = Member::query()->create([
            'member_number' => 'M-BATCH-001',
            'first_name' => 'Batch',
            'middle_name' => 'Target',
            'last_name' => 'Member',
            'membership_status' => 'active',
            'batch' => 'Alpha Batch',
            'email' => 'batch-target@test.local',
        ]);

        Sanctum::actingAs($admin);

        $this->putJson("/api/v1/members/{$member->id}", [
            'member_number' => $member->member_number,
            'email' => $member->email,
            'first_name' => $member->first_name,
            'middle_name' => $member->middle_name,
            'last_name' => $member->last_name,
            'membership_status' => $member->membership_status,
            'email_verified' => (bool) $member->email_verified,
            'password_set' => (bool) $member->password_set,
            'spouse_name' => $member->spouse_name,
            'contact_number' => $member->contact_number,
            'address' => $member->address,
            'date_of_birth' => optional($member->date_of_birth)?->toDateString(),
            'batch' => 'Beta Batch',
            'induction_date' => optional($member->induction_date)?->toDateString(),
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Batch assignment is managed by the membership chairman through the applicant batch workflow.');
    }

    public function test_assigning_role_to_verified_member_preserves_verified_state(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $linkedUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'verified-member@test.local',
            'email_verified_at' => null,
        ]);

        $member = Member::query()->create([
            'member_number' => 'LGEC-VERIFY-001',
            'first_name' => 'Verified',
            'middle_name' => 'Existing',
            'last_name' => 'Member',
            'email' => 'verified-member@test.local',
            'membership_status' => 'active',
            'email_verified' => true,
            'password_set' => true,
            'user_id' => $linkedUser->id,
        ]);

        Sanctum::actingAs($superadmin);

        $this->putJson("/api/v1/admin/members/{$member->id}/role", [
            'role_id' => $officerRole->id,
        ])->assertOk();

        $this->assertNotNull($linkedUser->fresh()->email_verified_at);
        $this->assertTrue((bool) $member->fresh()->email_verified);
    }

    public function test_membership_chairman_can_create_and_assign_applicant_batch(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();

        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);
        $treasurerCandidate = User::factory()->create(['role_id' => $applicantRole->id, 'email' => 'batch-treasurer@applicant.test']);

        $applicant = Applicant::query()->create([
            'first_name' => 'Batch',
            'middle_name' => 'Official',
            'last_name' => 'Applicant',
            'email' => 'official@applicant.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_OFFICIAL_APPLICANT,
            'decision_status' => 'approved',
            'current_stage' => 'introduction',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'official-applicant-token'),
            'email_verified_at' => now(),
        ]);

        Applicant::query()->create([
            'user_id' => $treasurerCandidate->id,
            'first_name' => 'Treasurer',
            'middle_name' => 'Candidate',
            'last_name' => 'Applicant',
            'email' => 'batch-treasurer@applicant.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_OFFICIAL_APPLICANT,
            'decision_status' => 'approved',
            'current_stage' => 'introduction',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'batch-treasurer-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($chairman);

        $batchResponse = $this->postJson('/api/v1/applicant-batches', [
            'name' => 'Batch Mabini',
            'batch_treasurer_user_id' => $treasurerCandidate->id,
        ])->assertCreated();

        $batchId = $batchResponse->json('batch.id');

        $this->postJson("/api/v1/applicants/{$applicant->id}/assign-batch", [
            'batch_id' => $batchId,
        ])->assertOk();

        $this->assertDatabaseHas('applicant_batches', [
            'id' => $batchId,
            'name' => 'Batch Mabini',
            'batch_treasurer_user_id' => $treasurerCandidate->id,
        ]);

        $this->assertDatabaseHas('applicants', [
            'id' => $applicant->id,
            'batch_id' => $batchId,
        ]);
    }

    public function test_admin_can_view_applicant_review_queue(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        Applicant::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Admin View',
            'email' => 'queued-admin-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-admin-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/applicants')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-admin-view@applicant.test');
    }

    public function test_superadmin_can_view_applicant_review_queue(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);

        Applicant::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Superadmin View',
            'email' => 'queued-superadmin-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-superadmin-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($superadmin);

        $this->getJson('/api/v1/applicants')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-superadmin-view@applicant.test');
    }

    public function test_superadmin_can_delete_non_activated_applicant(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $linkedUser = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'deleteable-applicant@test.local',
        ]);

        $application = Applicant::query()->create([
            'user_id' => $linkedUser->id,
            'first_name' => 'Deleteable',
            'middle_name' => 'Applicant',
            'last_name' => 'Queue',
            'email' => 'deleteable-applicant@test.local',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'deleteable-applicant-token'),
            'email_verified_at' => now(),
        ]);

        \App\Models\MemberRegistration::query()->create([
            'first_name' => 'Deleteable',
            'middle_name' => 'Applicant',
            'last_name' => 'Queue',
            'email' => 'deleteable-applicant@test.local',
            'password' => bcrypt('Password123!'),
            'status' => 'pending_verification',
            'verification_token' => hash('sha256', 'registration-token'),
            'user_id' => $linkedUser->id,
        ]);

        Sanctum::actingAs($superadmin);

        $this->deleteJson("/api/v1/applicants/{$application->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Applicant deleted.');

        $this->assertDatabaseMissing('applicants', ['id' => $application->id]);
        $this->assertDatabaseMissing('users', ['id' => $linkedUser->id]);
        $this->assertDatabaseMissing('member_registrations', ['email' => 'deleteable-applicant@test.local']);
    }

    public function test_admin_cannot_delete_applicant(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Protected',
            'middle_name' => 'Applicant',
            'last_name' => 'Queue',
            'email' => 'protected-applicant@test.local',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'protected-applicant-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/applicants/{$application->id}")
            ->assertStatus(403);
    }

    public function test_superadmin_cannot_delete_activated_applicant_from_queue(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $member = Member::query()->create([
            'member_number' => 'LGEC-TEST-99999',
            'first_name' => 'Activated',
            'middle_name' => 'Member',
            'last_name' => 'Linked',
            'email' => 'activated-member-linked@test.local',
            'membership_status' => 'active',
            'email_verified' => true,
            'password_set' => true,
        ]);

        $application = Applicant::query()->create([
            'member_id' => $member->id,
            'first_name' => 'Activated',
            'middle_name' => 'Applicant',
            'last_name' => 'Queue',
            'email' => 'activated-applicant@test.local',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_ACTIVATED,
            'decision_status' => 'approved',
            'current_stage' => 'induction',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'activated-applicant-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($superadmin);

        $this->deleteJson("/api/v1/applicants/{$application->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Activated applicants must be managed through the member workflow and cannot be deleted from the applicant queue.');
    }

    public function test_officer_can_view_applicant_queue_but_not_dossier(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Officer View',
            'email' => 'queued-officer-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-officer-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($officer);

        $this->getJson('/api/v1/applicants')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-officer-view@applicant.test');

        $this->getJson("/api/v1/applicants/{$application->id}")
            ->assertStatus(403);
    }

    public function test_treasurer_can_view_applicant_queue_but_not_dossier(): void
    {
        $treasurerRole = Role::query()->where('name', 'treasurer')->firstOrFail();
        $treasurer = User::factory()->create(['role_id' => $treasurerRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Treasurer View',
            'email' => 'queued-treasurer-view@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-treasurer-view-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($treasurer);

        $this->getJson('/api/v1/applicants')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'queued-treasurer-view@applicant.test');

        $this->getJson("/api/v1/applicants/{$application->id}")
            ->assertStatus(403);
    }

    public function test_admin_can_view_applicant_dossier(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Admin Dossier',
            'email' => 'queued-admin-dossier@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-admin-dossier-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/v1/applicants/{$application->id}")
            ->assertOk()
            ->assertJsonPath('email', 'queued-admin-dossier@applicant.test');
    }

    public function test_superadmin_can_view_applicant_dossier_but_cannot_review_decisions(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $superadmin = User::factory()->create(['role_id' => $superadminRole->id]);

        $application = Applicant::query()->create([
            'first_name' => 'Queued',
            'middle_name' => 'Applicant',
            'last_name' => 'Superadmin Dossier',
            'email' => 'queued-superadmin-dossier@applicant.test',
            'membership_status' => 'applicant',
            'status' => 'under_review',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'is_login_blocked' => false,
            'verification_token' => hash('sha256', 'queued-superadmin-dossier-token'),
            'email_verified_at' => now(),
        ]);

        Sanctum::actingAs($superadmin);

        $this->getJson("/api/v1/applicants/{$application->id}")
            ->assertOk()
            ->assertJsonPath('email', 'queued-superadmin-dossier@applicant.test');

        $this->postJson("/api/v1/applicants/{$application->id}/approve")
            ->assertStatus(403);
    }

    public function test_officer_can_view_cms_posts_list(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->getJson('/api/v1/cms/posts');

        $response->assertStatus(200);
    }

    public function test_officer_cannot_delegate_member_role(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        $candidate = Member::query()->create([
            'member_number' => 'M-OFF-001',
            'first_name' => 'Candidate',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'candidate-member@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($officer);

        $response = $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $memberRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_officer_cannot_update_user_role_via_admin_role_endpoint(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $target = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/role", [
            'role_id' => $officerRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_admin_cannot_assign_applicant_role_to_existing_member(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);

        $candidate = Member::query()->create([
            'member_number' => 'M-APP-001',
            'first_name' => 'Existing',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'existing-member@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $applicantRole->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Applicant role is lifecycle-managed and can only be created through applicant registration and activation workflows.');
    }

    public function test_admin_cannot_update_user_role_to_applicant(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}/role", [
            'role_id' => $applicantRole->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Applicant role is lifecycle-managed and can only be created through applicant registration and activation workflows.');
    }

    public function test_member_cannot_create_admin_user_account(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);

        Sanctum::actingAs($member);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Blocked Member Create',
            'email' => 'blocked-member-create@example.com',
            'password' => 'Password123',
            'role_id' => $officerRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_officer_cannot_create_user_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($officer);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Created By Officer',
            'email' => 'created-by-officer@example.com',
            'password' => 'Password123',
            'role_id' => $memberRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_officer_cannot_delete_member_record(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $officer = User::factory()->create(['role_id' => $officerRole->id]);
        $member = Member::query()->create([
            'member_number' => 'M-DEL-001',
            'first_name' => 'Delete',
            'middle_name' => 'Guard',
            'last_name' => 'Target',
            'email' => 'delete-guard@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($officer);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertStatus(403);
    }

    public function test_admin_deleting_member_removes_linked_portal_user_and_sessions(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $target = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'orphan-cleanup@example.com',
            'active_session_id' => 'session-cleanup-1',
        ]);

        DB::table('sessions')->insert([
            'id' => 'session-cleanup-1',
            'user_id' => $target->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit',
            'payload' => base64_encode('payload'),
            'last_activity' => now()->timestamp,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-DEL-USER-001',
            'first_name' => 'Delete',
            'middle_name' => 'Portal',
            'last_name' => 'User',
            'email' => $target->email,
            'membership_status' => 'active',
            'user_id' => $target->id,
        ]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Member deleted');

        $this->assertDatabaseMissing('members', ['id' => $member->id]);
        $this->assertDatabaseMissing('users', ['id' => $target->id]);
        $this->assertDatabaseMissing('sessions', ['id' => 'session-cleanup-1']);
    }

    public function test_admin_cannot_delete_protected_admin_member_record_through_member_directory(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $adminRole->id]);
        $protected = User::factory()->create([
            'role_id' => $superadminRole->id,
            'email' => 'protected-admin-member@example.com',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-PROT-001',
            'first_name' => 'Protected',
            'middle_name' => 'Admin',
            'last_name' => 'Member',
            'email' => $protected->email,
            'membership_status' => 'active',
            'user_id' => $protected->id,
        ]);

        Sanctum::actingAs($actor);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Protected administrative accounts cannot be removed through the member directory.');

        $this->assertDatabaseHas('members', ['id' => $member->id]);
        $this->assertDatabaseHas('users', ['id' => $protected->id]);
    }

    public function test_admin_cannot_delete_own_member_record_through_member_directory(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $actor = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'self-delete-guard@example.com',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-SELF-001',
            'first_name' => 'Self',
            'middle_name' => 'Delete',
            'last_name' => 'Guard',
            'email' => $actor->email,
            'membership_status' => 'active',
            'user_id' => $actor->id,
        ]);

        Sanctum::actingAs($actor);

        $this->deleteJson("/api/v1/members/{$member->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Use user management for your own account lifecycle. Self-deletion is not allowed through the member directory.');

        $this->assertDatabaseHas('members', ['id' => $member->id]);
        $this->assertDatabaseHas('users', ['id' => $actor->id]);
    }

    public function test_officer_cannot_update_fellow_officer_account(): void
    {
        $officerRole = Role::query()->where('name', 'officer')->firstOrFail();
        $actor = User::factory()->create(['role_id' => $officerRole->id]);
        $target = User::factory()->create(['role_id' => $officerRole->id]);

        Sanctum::actingAs($actor);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => 'Target Officer Updated',
            'email' => $target->email,
            'role_id' => $officerRole->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_superadmin_can_promote_user_to_admin_within_limit(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();

        $createdAdmin = User::factory()->create(['role_id' => $superadminRole->id]);
        $target = User::factory()->create();

        Sanctum::actingAs($createdAdmin);

        $response = $this->putJson("/api/v1/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('role.name', 'admin');
    }

    public function test_superadmin_cannot_exceed_max_admin_count_when_assigning_member_role(): void
    {
        $superadminRole = Role::query()->where('name', 'superadmin')->firstOrFail();
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $adminActor = User::factory()->create([
            'role_id' => $superadminRole->id,
        ]);
        User::factory()->create(['role_id' => $adminRole->id]);
        User::factory()->create(['role_id' => $adminRole->id]);

        Sanctum::actingAs($adminActor);

        $candidateForAdmin = Member::query()->create([
            'member_number' => 'M-ADM-001',
            'first_name' => 'Should',
            'middle_name' => null,
            'last_name' => 'Fail Admin',
            'email' => 'newadmin@example.com',
            'membership_status' => 'active',
        ]);

        $response = $this->putJson("/api/v1/admin/members/{$candidateForAdmin->id}/role", [
            'role_id' => $adminRole->id,
        ]);

        $response->assertStatus(422);

        $candidateForMember = Member::query()->create([
            'member_number' => 'M-MEM-001',
            'first_name' => 'Allowed',
            'middle_name' => null,
            'last_name' => 'Member',
            'email' => 'allowed-member@example.com',
            'membership_status' => 'active',
        ]);

        $memberCreate = $this->putJson("/api/v1/admin/members/{$candidateForMember->id}/role", [
            'role_id' => $memberRole->id,
        ]);

        $memberCreate->assertStatus(200);
    }

    public function test_admin_can_view_finance_members_without_finance_secondary_role(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/finance/members');

        $response->assertStatus(200);
    }

    public function test_admin_cannot_input_contribution_without_finance_secondary_role(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin-view-only@lipataeagles.ph',
            'role_id' => $adminRole->id,
            'finance_role' => null,
        ]);
        $account = $this->financeAccount();
        $target = Member::query()->create([
            'member_number' => 'M-ADM-VIEW-001',
            'first_name' => 'View',
            'middle_name' => null,
            'last_name' => 'Only',
            'email' => 'view-only-target@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/finance/contributions', [
            'member_id' => $target->id,
            'member_email' => $target->email,
            'amount' => 500,
            'note' => 'Admin without finance role should be blocked.',
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'finance_account_id' => $account->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_member_can_view_own_contributions_without_finance_role(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create(['role_id' => $memberRole->id]);

        $member = Member::query()->create([
            'member_number' => 'M-OWN-001',
            'first_name' => 'Own',
            'middle_name' => 'Member',
            'last_name' => 'User',
            'email' => $memberUser->email,
            'user_id' => $memberUser->id,
            'membership_status' => 'active',
        ]);
        $account = $this->financeAccount();

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 500,
            'note' => 'Monthly due',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $memberUser->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($memberUser);

        $response = $this->getJson('/api/v1/finance/my-contributions');

        $response->assertStatus(200)->assertJsonStructure([
            'member' => ['id', 'member_number'],
            'total_amount',
            'category_totals',
            'monthly_summary',
            'yearly_summary',
            'data',
        ]);
    }

    public function test_admin_can_view_own_contributions_without_finance_permissions(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $adminUser = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-ADM-OWN-001',
            'first_name' => 'Original',
            'middle_name' => null,
            'last_name' => 'Admin',
            'email' => $adminUser->email,
            'user_id' => $adminUser->id,
            'membership_status' => 'active',
        ]);
        $account = $this->financeAccount();

        Contribution::query()->create([
            'member_id' => $member->id,
            'category' => 'project_contribution',
            'contribution_date' => now()->toDateString(),
            'amount' => 1000,
            'note' => 'Project support',
            'finance_account_id' => $account->id,
            'encoded_by_user_id' => $adminUser->id,
            'encoded_at' => now(),
        ]);

        Sanctum::actingAs($adminUser);

        $response = $this->getJson('/api/v1/finance/my-contributions');

        $response->assertStatus(200)->assertJsonPath('member.id', $member->id);
    }

    public function test_admin_with_treasurer_secondary_role_can_access_finance_endpoints(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
            'finance_role' => 'treasurer',
        ]);
        $account = $this->financeAccount('bank');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/finance/members');

        $response->assertStatus(200);

        $target = Member::query()->create([
            'member_number' => 'M-FIN-001',
            'first_name' => 'Finance',
            'middle_name' => null,
            'last_name' => 'Target',
            'email' => 'finance-target@example.com',
            'membership_status' => 'active',
        ]);

        $this->postJson('/api/v1/finance/contributions', [
            'member_id' => $target->id,
            'member_email' => $target->email,
            'amount' => 500,
            'note' => 'Secondary treasurer contribution',
            'category' => 'monthly_contribution',
            'contribution_date' => now()->toDateString(),
            'finance_account_id' => $account->id,
        ])->assertCreated();

        $this->postJson('/api/v1/finance/expenses', [
            'category' => 'administrative_expense',
            'expense_date' => now()->toDateString(),
            'amount' => 200,
            'note' => 'Printer ink',
            'payee_name' => 'Office Hub',
            'finance_account_id' => $account->id,
        ])->assertCreated();

        $this->getJson('/api/v1/finance/account-balances')->assertOk();
    }

    public function test_member_primary_role_cannot_receive_secondary_finance_role(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
        ]);

        $candidate = Member::query()->create([
            'member_number' => 'M-SEC-001',
            'first_name' => 'Secondary',
            'middle_name' => null,
            'last_name' => 'Role',
            'email' => 'secondary-role@example.com',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/admin/members/{$candidate->id}/role", [
            'role_id' => $memberRole->id,
            'finance_role' => 'auditor',
        ]);

        $response->assertStatus(200);
        $this->assertSame('', (string) $response->json('user.finance_role'));
    }

    public function test_admin_can_update_member_extended_profile_fields_except_batch(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'role_id' => $adminRole->id,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-EXT-001',
            'first_name' => 'Mario',
            'middle_name' => 'Santos',
            'last_name' => 'Reyes',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->putJson("/api/v1/members/{$member->id}", [
            'member_number' => 'm-ext-001',
            'first_name' => 'mario',
            'middle_name' => 'santos',
            'last_name' => 'reyes',
            'membership_status' => 'active',
            'spouse_name' => 'ana maria reyes',
            'contact_number' => '0917 123 4567',
            'address' => 'Purok 1, Surigao City',
            'date_of_birth' => '1988-06-10',
            'induction_date' => '2023-07-24',
        ]);

        $response->assertOk()
            ->assertJsonPath('member_number', 'M-EXT-001')
            ->assertJsonPath('spouse_name', 'Ana Maria Reyes')
            ->assertJsonPath('contact_number', '09171234567');

        $member->refresh();
        $this->assertSame('Ana Maria Reyes', $member->spouse_name);
        $this->assertSame('09171234567', $member->contact_number);
        $this->assertNull($member->batch);
        $this->assertSame('1988-06-10', $member->date_of_birth);
        $this->assertSame('2023-07-24', $member->induction_date);
    }

    public function test_bootstrap_superadmin_email_cannot_be_changed_via_member_profile_update(): void
    {
        config()->set('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph');

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-BOOT-001',
            'first_name' => 'System',
            'middle_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'admin@lipataeagles.ph',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($admin);

        $this->putJson("/api/v1/members/{$member->id}", [
            'member_number' => 'M-BOOT-001',
            'email' => 'new-bootstrap@example.com',
            'first_name' => 'System',
            'middle_name' => 'Super',
            'last_name' => 'Admin',
            'membership_status' => 'active',
        ])->assertStatus(422)
            ->assertJsonPath('message', 'The bootstrap superadmin email cannot be changed.');
    }

    public function test_member_can_update_own_profile_without_email_or_batch_edit(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $user = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'member-self@example.com',
            'name' => 'Old Member Name',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-SELF-001',
            'first_name' => 'Old',
            'middle_name' => 'Member',
            'last_name' => 'Name',
            'email' => 'member-self@example.com',
            'membership_status' => 'active',
            'batch' => 'Alpha Batch',
            'user_id' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $response = $this->putJson('/api/v1/members/me/profile', [
            'first_name' => 'new',
            'middle_name' => 'middle',
            'last_name' => 'member',
            'spouse_name' => 'jane member',
            'contact_number' => '0917 222 3344',
            'address' => 'Purok 2, Surigao City',
            'date_of_birth' => '1991-02-14',
            'induction_date' => '2024-01-15',
            'email' => 'blocked-change@example.com',
            'batch' => 'Beta Batch',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Profile updated successfully.')
            ->assertJsonPath('member.first_name', 'New')
            ->assertJsonPath('member.middle_name', 'Middle')
            ->assertJsonPath('member.last_name', 'Member')
            ->assertJsonPath('member.spouse_name', 'Jane Member')
            ->assertJsonPath('member.contact_number', '09172223344')
            ->assertJsonPath('member.email', 'member-self@example.com')
            ->assertJsonPath('member.batch', 'Alpha Batch');

        $member->refresh();
        $user->refresh();

        $this->assertSame('member-self@example.com', $member->email);
        $this->assertSame('Alpha Batch', $member->batch);
        $this->assertSame('New Middle Member', $user->name);
    }

    public function test_admin_cannot_use_member_self_profile_endpoint(): void
    {
        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create([
            'role_id' => $adminRole->id,
            'email' => 'admin-self-profile@example.com',
        ]);

        Member::query()->create([
            'member_number' => 'M-ADMIN-SELF-001',
            'first_name' => 'Admin',
            'middle_name' => 'Portal',
            'last_name' => 'User',
            'email' => 'admin-self-profile@example.com',
            'membership_status' => 'active',
            'user_id' => $admin->id,
        ]);

        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/members/me/profile', [
            'first_name' => 'Changed',
            'middle_name' => 'Portal',
            'last_name' => 'User',
        ])->assertStatus(403);
    }
}
