<?php

namespace App\Providers;

use App\Models\ApplicationDocument;
use App\Models\Contribution;
use App\Models\ContributionEditRequest;
use App\Models\ForumPost;
use App\Models\ForumThread;
use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\Post;
use App\Models\User;
use App\Policies\AdminUserPolicy;
use App\Policies\ApplicationDocumentPolicy;
use App\Policies\ContributionEditRequestPolicy;
use App\Policies\ContributionPolicy;
use App\Policies\ForumPostPolicy;
use App\Policies\ForumThreadPolicy;
use App\Policies\MemberPolicy;
use App\Policies\MemberApplicationPolicy;
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
        Gate::policy(MemberApplication::class, MemberApplicationPolicy::class);
        Gate::policy(ApplicationDocument::class, ApplicationDocumentPolicy::class);
        Gate::policy(Member::class, MemberPolicy::class);
        Gate::policy(User::class, AdminUserPolicy::class);
        Gate::policy(Post::class, PostPolicy::class);
        Gate::policy(Contribution::class, ContributionPolicy::class);
        Gate::policy(ContributionEditRequest::class, ContributionEditRequestPolicy::class);
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

        RateLimiter::for('application-submit', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });

        RateLimiter::for('application-verify', function (Request $request) {
            $email = strtolower((string) $request->input('email', ''));
            return Limit::perMinute(5)->by($request->ip() . '|' . $email);
        });
    }
}
