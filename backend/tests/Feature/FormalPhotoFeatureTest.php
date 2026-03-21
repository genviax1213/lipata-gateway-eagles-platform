<?php

namespace Tests\Feature;

use App\Models\FormalPhoto;
use App\Models\Applicant;
use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FormalPhotoFeatureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->seed(RoleSeeder::class);
    }

    public function test_owner_can_upload_replace_and_read_private_formal_photo(): void
    {
        $memberUser = $this->memberUser('formal-owner@example.com');
        $member = $this->memberProfile($memberUser, 'M-FORMAL-001');

        Sanctum::actingAs($memberUser);

        $firstResponse = $this->post('/api/v1/formal-photos/me', [
            'photo' => UploadedFile::fake()->image('formal-one.jpg', 480, 640),
            'template_key' => 'classic-black',
        ], ['Accept' => 'application/json']);

        $firstResponse->assertCreated()
            ->assertJsonPath('formal_photo.template_key', 'classic-black');

        $firstPath = FormalPhoto::query()->firstOrFail()->file_path;
        Storage::disk('local')->assertExists($firstPath);

        $secondResponse = $this->post('/api/v1/formal-photos/me', [
            'photo' => UploadedFile::fake()->image('formal-two.jpg', 640, 640),
            'template_key' => 'navy-standard',
        ], ['Accept' => 'application/json']);

        $secondResponse->assertOk()
            ->assertJsonPath('formal_photo.template_key', 'navy-standard')
            ->assertJsonPath('formal_photo.owner_image_url', '/api/v1/formal-photos/me/image');

        $this->assertSame(1, FormalPhoto::query()->count());
        Storage::disk('local')->assertMissing($firstPath);

        $formalPhoto = FormalPhoto::query()->firstOrFail();
        Storage::disk('local')->assertExists($formalPhoto->file_path);

        $this->getJson('/api/v1/formal-photos/me')
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $formalPhoto->id)
            ->assertJsonPath('formal_photo.image_url', "/api/v1/formal-photos/{$formalPhoto->id}/image");

        $this->get('/api/v1/formal-photos/me/image')
            ->assertOk();

        $this->getJson('/api/v1/dashboard/me')
            ->assertOk()
            ->assertJsonPath('view', 'member')
            ->assertJsonPath('formal_photo.id', $formalPhoto->id)
            ->assertJsonPath('formal_photo.image_url', "/api/v1/formal-photos/{$formalPhoto->id}/image");

        $this->getJson('/api/v1/members/me/profile')
            ->assertOk()
            ->assertJsonPath('id', $member->id)
            ->assertJsonPath('formal_photo.id', $formalPhoto->id)
            ->assertJsonPath('formal_photo.owner_image_url', '/api/v1/formal-photos/me/image');

        $this->assertStringNotContainsString('/storage/', $formalPhoto->toMetadataArray(true)['image_url']);
    }

    public function test_non_staff_cannot_view_another_members_formal_photo(): void
    {
        $owner = $this->memberUser('formal-target@example.com');
        $member = $this->memberProfile($owner, 'M-FORMAL-002');
        $photo = FormalPhoto::query()->create([
            'user_id' => $owner->id,
            'disk' => 'local',
            'file_path' => 'formal-photos/' . $owner->id . '/manual.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 480,
            'height' => 640,
            'template_key' => 'classic-black',
        ]);
        Storage::disk('local')->put($photo->file_path, 'fake-image');

        $otherMember = $this->memberUser('formal-other@example.com');
        Sanctum::actingAs($otherMember);

        $this->getJson("/api/v1/members/{$member->id}/formal-photo")
            ->assertForbidden();

        $this->get("/api/v1/formal-photos/{$photo->id}/image")
            ->assertForbidden();
    }

    public function test_admin_secretary_and_chairman_can_lookup_private_member_and_applicant_formal_photos(): void
    {
        $owner = $this->memberUser('formal-staff-target@example.com');
        $member = $this->memberProfile($owner, 'M-FORMAL-003');
        $photo = FormalPhoto::query()->create([
            'user_id' => $owner->id,
            'disk' => 'local',
            'file_path' => 'formal-photos/' . $owner->id . '/staff.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 480,
            'height' => 640,
            'template_key' => 'staff-template',
        ]);
        Storage::disk('local')->put($photo->file_path, 'fake-image');

        $applicantRole = Role::query()->where('name', 'applicant')->firstOrFail();
        $applicantUser = User::factory()->create([
            'role_id' => $applicantRole->id,
            'email' => 'formal-applicant-target@example.com',
        ]);
        $applicant = Applicant::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => 'Formal',
            'middle_name' => 'Applicant',
            'last_name' => 'Viewer',
            'email' => 'formal-applicant-target@example.com',
            'membership_status' => 'applicant',
            'status' => Applicant::STATUS_UNDER_REVIEW,
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', 'formal-applicant-viewer-token'),
            'email_verified_at' => now(),
            'is_login_blocked' => false,
        ]);
        $applicantPhoto = FormalPhoto::query()->create([
            'user_id' => $applicantUser->id,
            'disk' => 'local',
            'file_path' => 'formal-photos/' . $applicantUser->id . '/staff-applicant.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'width' => 480,
            'height' => 640,
            'template_key' => 'staff-template',
        ]);
        Storage::disk('local')->put($applicantPhoto->file_path, 'fake-applicant-image');

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        Sanctum::actingAs($admin);

        $this->getJson("/api/v1/members/{$member->id}/formal-photo")
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $photo->id);

        $this->getJson('/api/v1/formal-photos/directory?search=viewer')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.subject_type', 'applicant')
            ->assertJsonPath('data.0.has_formal_photo', true);

        $this->getJson("/api/v1/applicants/{$applicant->id}/formal-photo")
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $applicantPhoto->id);

        $this->get("/api/v1/formal-photos/{$photo->id}/image")
            ->assertOk();

        $secretaryRole = Role::query()->where('name', 'secretary')->firstOrFail();
        $secretary = User::factory()->create(['role_id' => $secretaryRole->id]);
        Sanctum::actingAs($secretary);

        $this->getJson("/api/v1/members/{$member->id}/formal-photo")
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $photo->id);

        $this->get("/api/v1/formal-photos/{$photo->id}/image")
            ->assertOk();

        $chairmanRole = Role::query()->where('name', 'membership_chairman')->firstOrFail();
        $chairman = User::factory()->create(['role_id' => $chairmanRole->id]);
        Sanctum::actingAs($chairman);

        $this->getJson("/api/v1/members/{$member->id}/formal-photo")
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $photo->id);

        $this->getJson("/api/v1/applicants/{$applicant->id}/formal-photo")
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $applicantPhoto->id);

        $this->getJson('/api/v1/formal-photos/directory?search=formal')
            ->assertOk()
            ->assertJsonPath('data.0.has_formal_photo', true);
    }

    public function test_lookup_returns_null_formal_photo_when_member_has_no_saved_image(): void
    {
        $owner = $this->memberUser('formal-empty@example.com');
        $member = $this->memberProfile($owner, 'M-FORMAL-004');

        $secretaryRole = Role::query()->where('name', 'secretary')->firstOrFail();
        $secretary = User::factory()->create(['role_id' => $secretaryRole->id]);
        Sanctum::actingAs($secretary);

        $this->getJson("/api/v1/members/{$member->id}/formal-photo")
            ->assertOk()
            ->assertJsonPath('member.id', $member->id)
            ->assertJsonPath('formal_photo', null);
    }

    public function test_formal_photo_payload_reports_missing_file_status_when_row_exists_but_file_is_gone(): void
    {
        $owner = $this->memberUser('formal-missing@example.com');
        $member = $this->memberProfile($owner, 'M-FORMAL-005');
        $photo = FormalPhoto::query()->create([
            'user_id' => $owner->id,
            'disk' => 'local',
            'file_path' => 'formal-photos/' . $owner->id . '/missing.webp',
            'mime_type' => 'image/webp',
            'file_size' => 1024,
            'width' => 480,
            'height' => 640,
            'template_key' => 'missing-template',
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/v1/formal-photos/me')
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $photo->id)
            ->assertJsonPath('formal_photo.status', 'missing_file')
            ->assertJsonPath('formal_photo.file_exists', false);

        $this->getJson('/api/v1/dashboard/me')
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $photo->id)
            ->assertJsonPath('formal_photo.status', 'missing_file')
            ->assertJsonPath('formal_photo.file_exists', false);

        $secretaryRole = Role::query()->where('name', 'secretary')->firstOrFail();
        $secretary = User::factory()->create(['role_id' => $secretaryRole->id]);
        Sanctum::actingAs($secretary);

        $this->getJson("/api/v1/members/{$member->id}/formal-photo")
            ->assertOk()
            ->assertJsonPath('formal_photo.id', $photo->id)
            ->assertJsonPath('formal_photo.status', 'missing_file')
            ->assertJsonPath('formal_photo.file_exists', false);
    }

    private function memberUser(string $email): User
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        return User::factory()->create([
            'role_id' => $memberRole->id,
            'email' => $email,
        ]);
    }

    private function memberProfile(User $user, string $memberNumber): Member
    {
        return Member::query()->create([
            'member_number' => $memberNumber,
            'first_name' => 'Formal',
            'middle_name' => 'Photo',
            'last_name' => 'User',
            'email' => $user->email,
            'membership_status' => 'active',
            'user_id' => $user->id,
        ]);
    }
}
