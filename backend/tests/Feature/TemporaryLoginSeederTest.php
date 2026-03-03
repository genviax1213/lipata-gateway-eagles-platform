<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RoleSeeder;
use Database\Seeders\TemporaryLoginSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class TemporaryLoginSeederTest extends TestCase
{
    use RefreshDatabase;

    private ?string $originalTempPassword = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->originalTempPassword = getenv('TEMP_LOGIN_PASSWORD') ?: null;
    }

    protected function tearDown(): void
    {
        $this->setTempPassword($this->originalTempPassword);
        parent::tearDown();
    }

    public function test_temporary_login_seeder_requires_temp_login_password_env(): void
    {
        $this->seed(RoleSeeder::class);
        $this->setTempPassword('');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('TEMP_LOGIN_PASSWORD must be set before running TemporaryLoginSeeder.');

        $this->seed(TemporaryLoginSeeder::class);
    }

    public function test_temporary_login_seeder_uses_env_password_for_seeded_accounts(): void
    {
        $this->seed(RoleSeeder::class);
        $this->setTempPassword('TempPass!2026');

        $this->seed(TemporaryLoginSeeder::class);

        $admin = User::query()->where('email', 'admin@lipataeagles.ph')->first();

        $this->assertNotNull($admin);
        $this->assertTrue(password_verify('TempPass!2026', (string) $admin->password));
    }

    private function setTempPassword(?string $value): void
    {
        if ($value === null) {
            putenv('TEMP_LOGIN_PASSWORD');
            unset($_ENV['TEMP_LOGIN_PASSWORD'], $_SERVER['TEMP_LOGIN_PASSWORD']);
            return;
        }

        putenv('TEMP_LOGIN_PASSWORD=' . $value);
        $_ENV['TEMP_LOGIN_PASSWORD'] = $value;
        $_SERVER['TEMP_LOGIN_PASSWORD'] = $value;
    }
}

