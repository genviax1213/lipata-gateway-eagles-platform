<?php

namespace Tests\Feature;

use Database\Seeders\RoleSeeder;
use App\Models\Role;
use App\Models\User;
use App\Notifications\BootstrapRecoveryToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BootstrapRecoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    private function bootstrapUser(): User
    {
        $role = Role::query()->where('name', 'superadmin')->firstOrFail();

        return User::factory()->create([
            'email' => 'admin@lipataeagles.ph',
            'password' => Hash::make('OldPassword123'),
            'role_id' => $role->id,
        ]);
    }

    public function test_bootstrap_recovery_request_sends_token_to_recovery_email(): void
    {
        Notification::fake();

        $this->bootstrapUser();

        $this->postJson('/api/v1/rll', [
            'email' => 'admin@lipataeagles.ph',
        ])->assertOk();

        Notification::assertSentOnDemand(BootstrapRecoveryToken::class);
    }

    public function test_bootstrap_recovery_request_stays_generic_for_non_bootstrap_email(): void
    {
        Notification::fake();

        $this->bootstrapUser();

        $this->postJson('/api/v1/rll', [
            'email' => 'someone@example.com',
        ])->assertOk()
            ->assertJsonPath('message', 'If the account is eligible, recovery instructions were sent.');

        Notification::assertNothingSent();
    }

    public function test_bootstrap_recovery_can_reset_password_with_valid_token(): void
    {
        Notification::fake();

        $user = $this->bootstrapUser();

        $this->postJson('/api/v1/rll', [
            'email' => 'admin@lipataeagles.ph',
        ])->assertOk();

        $notification = null;
        Notification::assertSentOnDemand(BootstrapRecoveryToken::class, function (BootstrapRecoveryToken $sentNotification) use (&$notification) {
            $notification = $sentNotification;
            return true;
        });

        $this->postJson('/api/v1/rll/verify', [
            'email' => 'admin@lipataeagles.ph',
            'token' => $notification->token(),
        ])->assertOk();

        $this->postJson('/api/v1/rll/reset', [
            'email' => 'admin@lipataeagles.ph',
            'token' => $notification->token(),
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk();

        $this->assertTrue(Hash::check('NewPassword123', (string) $user->fresh()->password));
    }
}
