<?php

namespace Tests\Unit;

use App\Support\MailTransportConfig;
use PHPUnit\Framework\TestCase;

class MailTransportConfigTest extends TestCase
{
    public function test_it_accepts_plain_smtp_scheme(): void
    {
        $this->assertSame('smtp', MailTransportConfig::normalizeScheme('smtp'));
    }

    public function test_it_maps_tls_like_values_to_smtp(): void
    {
        $this->assertSame('smtp', MailTransportConfig::normalizeScheme('tls'));
        $this->assertSame('smtp', MailTransportConfig::normalizeScheme('starttls'));
    }

    public function test_it_maps_ssl_like_values_to_smtps(): void
    {
        $this->assertSame('smtps', MailTransportConfig::normalizeScheme('ssl'));
        $this->assertSame('smtps', MailTransportConfig::normalizeScheme('smtps'));
    }

    public function test_it_uses_encryption_fallback_when_scheme_is_missing(): void
    {
        $this->assertSame('smtp', MailTransportConfig::normalizeScheme(null, 'tls'));
        $this->assertSame('smtps', MailTransportConfig::normalizeScheme('', 'ssl'));
    }

    public function test_it_treats_blank_and_null_like_strings_as_null(): void
    {
        $this->assertNull(MailTransportConfig::normalizeScheme(null));
        $this->assertNull(MailTransportConfig::normalizeScheme(''));
        $this->assertNull(MailTransportConfig::normalizeScheme('null'));
    }
}
