<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserMemberSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_creation_links_existing_member_profile_by_email(): void
    {
        $member = Member::query()->create([
            'member_number' => 'M-LINK-001',
            'first_name' => 'Juan',
            'middle_name' => null,
            'last_name' => 'Dela Cruz',
            'email' => 'juan.dela.cruz@example.com',
            'membership_status' => 'active',
        ]);

        $user = User::factory()->create([
            'name' => 'Juan Dela Cruz',
            'email' => 'JUAN.DELA.CRUZ@example.com',
        ]);

        $member->refresh();

        $this->assertSame($user->id, $member->user_id);
        $this->assertSame('juan.dela.cruz@example.com', $member->email);
    }

    public function test_user_email_update_propagates_to_linked_member(): void
    {
        $user = User::factory()->create([
            'name' => 'Maria Santos',
            'email' => 'maria.santos@example.com',
        ]);

        $member = Member::query()->create([
            'member_number' => 'M-LINK-002',
            'first_name' => 'Maria',
            'middle_name' => null,
            'last_name' => 'Santos',
            'email' => 'maria.santos@example.com',
            'user_id' => $user->id,
            'membership_status' => 'active',
        ]);

        $user->update([
            'email' => 'MARIA.SANTOS+NEW@example.com',
        ]);

        $member->refresh();
        $this->assertSame('maria.santos+new@example.com', $member->email);
    }
}
