<?php

namespace App\Providers;

use App\Models\ApplicantDocument;
use App\Models\Contribution;
use App\Models\FormalPhoto;
use App\Models\ForumPost;
use App\Models\ForumThread;
use App\Models\Member;
use App\Models\Applicant;
use App\Models\Post;
use App\Models\User;
use App\Policies\AdminUserPolicy;
use App\Policies\ApplicantDocumentPolicy;
use App\Policies\ContributionPolicy;
use App\Policies\FormalPhotoPolicy;
use App\Policies\ForumPostPolicy;
use App\Policies\ForumThreadPolicy;
use App\Policies\MemberPolicy;
use App\Policies\ApplicantPolicy;
use App\Policies\PostPolicy;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Applicant::class, ApplicantPolicy::class);
        Gate::policy(ApplicantDocument::class, ApplicantDocumentPolicy::class);
        Gate::policy(Member::class, MemberPolicy::class);
        Gate::policy(FormalPhoto::class, FormalPhotoPolicy::class);
        Gate::policy(User::class, AdminUserPolicy::class);
        Gate::policy(Post::class, PostPolicy::class);
        Gate::policy(Contribution::class, ContributionPolicy::class);
        Gate::policy(ForumThread::class, ForumThreadPolicy::class);
        Gate::policy(ForumPost::class, ForumPostPolicy::class);

        ResetPassword::createUrlUsing(function (User $user, string $token) {
            $frontendUrl = rtrim((string) env('FRONTEND_URL', 'http://127.0.0.1:5173'), '/');
            return $frontendUrl . '/member-reset-password?token=' . urlencode($token) . '&email=' . urlencode((string) $user->email);
        });

        RateLimiter::for('auth-login', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('auth-forgot-password', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('auth-reset-password', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('mobile-auth-forgot-password', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('mobile-auth-reset-password', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('bootstrap-recovery-request', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(3)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('bootstrap-recovery-verify', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('bootstrap-recovery-reset', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('application-submit', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('application-verify', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('members-write', function (Request $request) {
            return Limit::perMinute(20)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('google-oauth', function (Request $request) {
            $intent = strtolower((string) $request->query('intent', ''));
            return Limit::perMinute(10)->by($request->ip() . '|' . $intent);
        });
    }
}
