<?php

namespace Tests\Feature;

use App\Models\Applicant;
use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use App\Support\GoogleOAuthClaimStore;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Tests\TestCase;

class GoogleOAuthFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        config([
            'app.frontend_url' => 'http://frontend.test',
            'services.google.client_id' => 'google-client-id',
            'services.google.client_secret' => 'google-client-secret',
            'services.google.redirect' => 'http://backend.test/oauth/google/callback',
        ]);
    }

    public function test_google_oauth_login_fails_for_unregistered_email(): void
    {
        $googleUser = new SocialiteUser();
        $googleUser->map([
            'sub' => 'google-user-1',
            'email' => 'missing@example.com',
            'email_verified' => true,
            'given_name' => 'Missing',
            'family_name' => 'User',
            'name' => 'Missing User',
        ]);
        $googleUser->user = [
            'sub' => 'google-user-1',
            'email' => 'missing@example.com',
            'email_verified' => true,
            'given_name' => 'Missing',
            'family_name' => 'User',
            'name' => 'Missing User',
        ];

        Socialite::shouldReceive('driver')->once()->with('google')->andReturnSelf();
        Socialite::shouldReceive('user')->once()->andReturn($googleUser);

        $response = $this
            ->withSession(['google_oauth_intent' => GoogleOAuthClaimStore::INTENT_LOGIN])
            ->get('/oauth/google/callback');

        $response->assertRedirect('http://frontend.test/login?oauth_error=Google+account+is+not+registered+in+this+portal.');
        $this->assertGuest();
    }

    public function test_google_claim_can_complete_member_registration_without_manual_verification(): void
    {
        $token = GoogleOAuthClaimStore::issue(GoogleOAuthClaimStore::INTENT_MEMBER_REGISTRATION, [
            'email' => 'member.google@test.local',
            'first_name' => 'Member',
            'last_name' => 'Google',
            'full_name' => 'Member Google',
            'provider' => 'google',
        ]);

        $response = $this
            ->postJson('/api/v1/member-registrations', [
                'first_name' => 'Member',
                'middle_name' => 'Verified',
                'last_name' => 'Google',
                'email' => 'member.google@test.local',
                'password' => 'Password123!',
                'password_confirmation' => 'Password123!',
                'oauth_provider' => 'google',
                'oauth_claim_token' => $token,
            ]);

        $response->assertCreated()
            ->assertJsonPath('message', 'Google verified your email. Your member account is now active.');

        $user = User::query()->where('email', 'member.google@test.local')->firstOrFail();
        $member = Member::query()->where('email', 'member.google@test.local')->firstOrFail();

        $this->assertNotNull($user->email_verified_at);
        $this->assertTrue($member->email_verified);
        $this->assertSame($user->id, $member->user_id);
    }

    public function test_google_claim_can_submit_applicant_registration_directly_to_review(): void
    {
        $token = GoogleOAuthClaimStore::issue(GoogleOAuthClaimStore::INTENT_APPLICANT_REGISTRATION, [
            'email' => 'applicant.google@test.local',
            'first_name' => 'Applicant',
            'last_name' => 'Google',
            'full_name' => 'Applicant Google',
            'provider' => 'google',
        ]);

        $response = $this
            ->postJson('/api/v1/applicant-registrations', [
                'first_name' => 'Applicant',
                'middle_name' => 'Verified',
                'last_name' => 'Google',
                'email' => 'applicant.google@test.local',
                'password' => 'Password123!',
                'password_confirmation' => 'Password123!',
                'oauth_provider' => 'google',
                'oauth_claim_token' => $token,
            ]);

        $response->assertCreated()
            ->assertJsonPath('message', 'Google verified your email. Your application is now under review.');

        $application = Applicant::query()->where('email', 'applicant.google@test.local')->firstOrFail();
        $user = User::query()->where('email', 'applicant.google@test.local')->firstOrFail();

        $this->assertSame(Applicant::STATUS_UNDER_REVIEW, $application->status);
        $this->assertNotNull($application->email_verified_at);
        $this->assertNotNull($user->email_verified_at);
    }
}
