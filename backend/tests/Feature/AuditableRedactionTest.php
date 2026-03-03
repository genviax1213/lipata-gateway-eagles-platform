<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class AuditableRedactionTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_audit_log_redacts_sensitive_fields(): void
    {
        $user = User::factory()->create([
            'password' => 'OldPassword123',
        ]);

        Log::spy();

        $user->update([
            'name' => 'Updated User',
            'password' => 'NewPassword123',
        ]);

        Log::shouldHaveReceived('info')
            ->withArgs(function (string $event, array $context): bool {
                return $event === 'model.updated'
                    && ($context['model'] ?? null) === 'User'
                    && ($context['changes']['password'] ?? null) === '[REDACTED]'
                    && ($context['original']['password'] ?? null) === '[REDACTED]'
                    && ($context['changes']['name'] ?? null) === 'Updated User';
            })
            ->once();
    }
}

