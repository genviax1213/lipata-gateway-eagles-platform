<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TreasurerDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_member_without_treasurer_permissions_cannot_access_treasurer_dashboard(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $member = User::factory()->create(['role_id' => $memberRole->id]);
        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/dashboard/treasurer');

        $response->assertStatus(403);
    }

    public function test_member_with_treasurer_secondary_role_can_access_treasurer_dashboard(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $treasurer = User::factory()->create([
            'role_id' => $memberRole->id,
            'finance_role' => 'treasurer',
        ]);
        Sanctum::actingAs($treasurer);

        $response = $this->getJson('/api/v1/dashboard/treasurer');

        $response->assertOk()->assertJsonStructure([
            'generated_at',
            'contributions' => [
                'summary' => [
                    'today' => ['count', 'total_amount'],
                    'month' => ['count', 'total_amount'],
                    'year' => ['count', 'total_amount'],
                ],
                'category_totals',
            ],
            'application_fees' => [
                'required_total',
                'paid_total',
                'balance_total',
                'active_applicant_count',
                'with_balance_count',
                'applicants',
            ],
        ]);
    }

    public function test_member_with_auditor_secondary_role_cannot_access_treasurer_dashboard(): void
    {
        $memberRole = Role::query()->where('name', 'member')->firstOrFail();
        $auditor = User::factory()->create([
            'role_id' => $memberRole->id,
            'finance_role' => 'auditor',
        ]);
        Sanctum::actingAs($auditor);

        $response = $this->getJson('/api/v1/dashboard/treasurer');

        $response->assertStatus(403);
    }
}
