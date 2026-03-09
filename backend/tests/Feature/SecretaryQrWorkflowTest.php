<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\ApplicantBatch;
use App\Models\CalendarEvent;
use App\Models\FormalPhoto;
use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecretaryQrWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_member_can_fetch_personal_qr_code(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'qr-member@example.test',
        ]);

        Member::query()->create([
            'user_id' => $memberUser->id,
            'member_number' => 'M-QR-001',
            'first_name' => 'Qr',
            'middle_name' => 'Member',
            'last_name' => 'Holder',
            'email' => 'qr-member@example.test',
            'membership_status' => 'active',
            'email_verified' => true,
            'password_set' => true,
        ]);

        Sanctum::actingAs($memberUser);

        $this->getJson('/api/v1/identity/my-qr')
            ->assertOk()
            ->assertJsonPath('subject_type', 'member')
            ->assertJsonPath('subject_name', 'Qr Member Holder')
            ->assertJsonPath('member_number', 'M-QR-001')
            ->assertJsonPath('email', 'qr-member@example.test');
    }

    public function test_secretary_can_create_event_scan_qr_and_event_becomes_immutable(): void
    {
        $secretaryRole = Role::query()->where('name', 'secretary')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        $secretary = User::factory()->create([
            'role_id' => $secretaryRole->id,
            'email' => 'secretary@example.test',
        ]);
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'attendance-member@example.test',
        ]);

        Member::query()->create([
            'user_id' => $memberUser->id,
            'member_number' => 'M-ATT-001',
            'first_name' => 'Attendance',
            'middle_name' => 'Flow',
            'last_name' => 'Member',
            'email' => 'attendance-member@example.test',
            'membership_status' => 'active',
            'batch' => 'Batch A',
            'email_verified' => true,
            'password_set' => true,
        ]);

        Sanctum::actingAs($secretary);

        $createResponse = $this->postJson('/api/v1/calendar/events', [
            'title' => 'Monthly Fellowship',
            'event_type' => 'meeting',
            'starts_at' => '2026-03-15 18:00:00',
            'ends_at' => '2026-03-15 20:00:00',
            'location' => 'LGEC Hall',
            'description' => 'Attendance-enabled monthly meeting',
        ])->assertCreated();

        $eventId = $createResponse->json('event.id');
        $this->assertNotNull($eventId);

        Sanctum::actingAs($memberUser);
        $qrToken = $this->getJson('/api/v1/identity/my-qr')
            ->assertOk()
            ->json('token');

        $this->assertIsString($qrToken);
        $this->assertNotSame('', trim($qrToken));

        Sanctum::actingAs($secretary);

        $this->postJson("/api/v1/attendance/events/{$eventId}/scan", [
            'qr_token' => $qrToken,
        ])->assertCreated()
            ->assertJsonPath('record.subject_name', 'Attendance Flow Member')
            ->assertJsonPath('record.batch', 'Batch A');

        $this->postJson("/api/v1/attendance/events/{$eventId}/scan", [
            'qr_token' => $qrToken,
        ])->assertOk()
            ->assertJsonPath('message', 'Attendance already recorded for this user.');

        $this->getJson("/api/v1/attendance/events/{$eventId}/records")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.subject_name', 'Attendance Flow Member');

        $this->putJson("/api/v1/calendar/events/{$eventId}", [
            'title' => 'Edited Title',
            'event_type' => 'meeting',
            'starts_at' => '2026-03-15 18:00:00',
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Events with attendance records are immutable and cannot be edited.');

        $this->deleteJson("/api/v1/calendar/events/{$eventId}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Events with attendance records are immutable and cannot be deleted.');
    }

    public function test_membership_chairman_can_manage_calendar_events(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create([
            'role_id' => $chairmanRole->id,
            'email' => 'chairman-calendar@example.test',
        ]);

        Sanctum::actingAs($chairman);

        $response = $this->postJson('/api/v1/calendar/events', [
            'title' => 'Chairman Planning Meeting',
            'event_type' => 'meeting',
            'starts_at' => '2026-03-20 19:00:00',
            'location' => 'Board Room',
            'description' => 'Chairman-created schedule',
        ])->assertCreated();

        $eventId = $response->json('event.id');
        $this->assertNotNull($eventId);

        $this->putJson("/api/v1/calendar/events/{$eventId}", [
            'title' => 'Chairman Planning Meeting Updated',
            'event_type' => 'meeting',
            'starts_at' => '2026-03-20 19:30:00',
            'location' => 'Board Room',
            'description' => 'Updated by chairman',
        ])->assertOk()
            ->assertJsonPath('event.title', 'Chairman Planning Meeting Updated');
    }

    public function test_secretary_can_access_forum_and_directory_exports(): void
    {
        Storage::fake('local');

        $secretaryRole = Role::query()->where('name', 'secretary')->firstOrFail();
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();

        $secretary = User::factory()->create([
            'role_id' => $secretaryRole->id,
            'email' => 'secretary-exports@example.test',
        ]);
        $memberUser = User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => 'member-export@example.test',
        ]);
        $applicantUser = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'applicant-export@example.test',
        ]);

        Member::query()->create([
            'user_id' => $memberUser->id,
            'member_number' => 'M-EXP-001',
            'first_name' => 'Export',
            'middle_name' => 'Member',
            'last_name' => 'Person',
            'email' => 'member-export@example.test',
            'membership_status' => 'active',
            'email_verified' => true,
            'password_set' => true,
        ]);

        Applicant::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => 'Export',
            'middle_name' => 'Applicant',
            'last_name' => 'Person',
            'email' => 'applicant-export@example.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_UNDER_REVIEW,
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', 'applicant-export-token'),
            'email_verified_at' => now(),
            'is_login_blocked' => false,
        ]);

        Storage::disk('local')->put('formal-photos/member-export.webp', 'fake-image');
        FormalPhoto::query()->create([
            'user_id' => $memberUser->id,
            'disk' => 'local',
            'file_path' => 'formal-photos/member-export.webp',
            'mime_type' => 'image/webp',
            'file_size' => 10,
            'width' => 600,
            'height' => 750,
        ]);

        Sanctum::actingAs($secretary);

        $this->getJson('/api/v1/forum/threads')
            ->assertOk();

        $this->postJson('/api/v1/forum/threads', [
            'title' => 'Secretary Forum Access',
            'body' => '<p>Secretary can participate in the forum.</p>',
        ])->assertCreated();

        $membersCsv = $this->get('/api/v1/directory/exports/members?target=excel')
            ->assertOk();
        $this->assertStringContainsString('Email,Batch', $membersCsv->streamedContent());

        $applicantsCsv = $this->get('/api/v1/directory/exports/applicants?target=google_sheets')
            ->assertOk();
        $this->assertStringContainsString('Email,Batch,"Current Stage",Status,"Decision Status"', $applicantsCsv->streamedContent());

        $zipResponse = $this->get('/api/v1/directory/exports/member-photos')
            ->assertOk();
        $this->assertStringContainsString('lgec_members_' . now()->format('Y') . '.zip', (string) $zipResponse->headers->get('content-disposition'));
    }

    public function test_membership_chairman_can_rename_batch_and_existing_member_batch_updates(): void
    {
        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $officialApplicantRole = Role::query()->where('name', 'applicant')->firstOrFail();

        $chairman = User::factory()->create([
            'role_id' => $chairmanRole->id,
        ]);
        $batchTreasurer = User::factory()->create([
            'role_id' => $officialApplicantRole->id,
            'email' => 'batch-treasurer-update@example.test',
        ]);

        Applicant::query()->create([
            'user_id' => $batchTreasurer->id,
            'first_name' => 'Batch',
            'middle_name' => 'Treasurer',
            'last_name' => 'Candidate',
            'email' => 'batch-treasurer-update@example.test',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_OFFICIAL_APPLICANT,
            'decision_status' => 'approved',
            'current_stage' => 'incubation',
            'verification_token' => hash('sha256', 'batch-treasurer-update-token'),
            'email_verified_at' => now(),
            'is_login_blocked' => false,
        ]);

        $batch = ApplicantBatch::query()->create([
            'name' => 'Batch Legacy',
            'created_by_user_id' => $chairman->id,
            'batch_treasurer_user_id' => $batchTreasurer->id,
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-BATCH-001',
            'first_name' => 'Legacy',
            'middle_name' => 'Batch',
            'last_name' => 'Member',
            'email' => 'legacy-batch-member@example.test',
            'batch' => 'Batch Legacy',
            'membership_status' => 'active',
        ]);

        Sanctum::actingAs($chairman);

        $this->putJson("/api/v1/applicant-batches/{$batch->id}", [
            'name' => 'Batch Renewal',
            'description' => 'Renamed batch',
            'start_date' => '2026-03-01',
            'target_completion_date' => '2026-06-01',
            'batch_treasurer_user_id' => $batchTreasurer->id,
        ])->assertOk()
            ->assertJsonPath('batch.name', 'Batch Renewal');

        $this->assertSame('Batch Renewal', $member->fresh()->batch);
    }
}
