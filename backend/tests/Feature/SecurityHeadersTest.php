<?php

namespace Tests\Feature;

use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    public function test_root_response_allows_same_origin_camera_policy(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    }
}
