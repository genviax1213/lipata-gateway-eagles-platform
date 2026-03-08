<?php

namespace Tests\Unit;

use App\Support\VerificationToken;
use PHPUnit\Framework\TestCase;

class VerificationTokenTest extends TestCase
{
    public function test_generated_token_is_ten_uppercase_alphanumeric_characters(): void
    {
        $token = VerificationToken::generate();

        $this->assertSame(VerificationToken::LENGTH, strlen($token));
        $this->assertMatchesRegularExpression('/^[A-Z0-9]{10}$/', $token);
    }

    public function test_normalize_uppercases_and_trims_input(): void
    {
        $this->assertSame('AB12CD34EF', VerificationToken::normalize(' ab12cd34ef '));
    }
}
