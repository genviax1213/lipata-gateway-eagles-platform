<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PostController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\MemberApplicationController;
use App\Http\Controllers\FinanceController;
use App\Http\Controllers\ForumController;
use App\Http\Controllers\DashboardController;

Route::prefix('v1')->group(function () {
    Route::get('/content/{section}', [PostController::class, 'publicBySection']);
    Route::get('/content/post/{slug}', [PostController::class, 'publicBySlug']);
    Route::post('/member-applications', [MemberApplicationController::class, 'submit']);
    Route::post('/member-applications/verify', [MemberApplicationController::class, 'verify']);

    // Login route
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);

    // Protected routes
    Route::middleware('auth:sanctum')->group(function () {

        Route::get('/user', function (Request $request) {
            return $request->user()->load('role.permissions:id,name');
        });
        Route::get('/dashboard/me', [DashboardController::class, 'me']);

        Route::get('/cms/posts', [PostController::class, 'index']);
        Route::post('/cms/posts', [PostController::class, 'store']);
        Route::post('/cms/posts/{post}', [PostController::class, 'update']);
        Route::put('/cms/posts/{post}', [PostController::class, 'update']);
        Route::delete('/cms/posts/{post}', [PostController::class, 'destroy']);

        Route::get('/members', [MemberController::class, 'index']);
        Route::post('/members', [MemberController::class, 'store']);
        Route::put('/members/{member}', [MemberController::class, 'update']);
        Route::delete('/members/{member}', [MemberController::class, 'destroy']);
        Route::get('/member-applications', [MemberApplicationController::class, 'index']);
        Route::get('/member-applications/me', [MemberApplicationController::class, 'myApplication']);
        Route::get('/member-applications/{memberApplication}', [MemberApplicationController::class, 'show']);
        Route::post('/member-applications/{memberApplication}/documents', [MemberApplicationController::class, 'uploadDocument']);
        Route::get('/member-applications/documents/{document}/view', [MemberApplicationController::class, 'viewDocument']);
        Route::post('/member-applications/documents/{document}/review', [MemberApplicationController::class, 'reviewDocument']);
        Route::post('/member-applications/{memberApplication}/stage', [MemberApplicationController::class, 'setStage']);
        Route::post('/member-applications/{memberApplication}/notice', [MemberApplicationController::class, 'setNotice']);
        Route::post('/member-applications/{memberApplication}/fee-requirements', [MemberApplicationController::class, 'setFeeRequirement']);
        Route::post('/member-applications/fee-requirements/{applicationFeeRequirement}/payments', [MemberApplicationController::class, 'addFeePayment']);
        Route::post('/member-applications/{memberApplication}/approve', [MemberApplicationController::class, 'approve']);
        Route::post('/member-applications/{memberApplication}/probation', [MemberApplicationController::class, 'setProbation']);
        Route::post('/member-applications/{memberApplication}/reject', [MemberApplicationController::class, 'reject']);

        Route::get('/admin/roles', [AdminUserController::class, 'roles']);
        Route::get('/admin/members', [AdminUserController::class, 'members']);
        Route::put('/admin/members/{member}/role', [AdminUserController::class, 'assignRoleToMember']);
        Route::get('/admin/users', [AdminUserController::class, 'index']);
        Route::put('/admin/users/{user}', [AdminUserController::class, 'update']);
        Route::delete('/admin/users/{user}', [AdminUserController::class, 'destroy']);
        Route::put('/admin/users/{user}/role', [AdminUserController::class, 'updateRole']);

        Route::get('/finance/members', [FinanceController::class, 'searchMembers']);
        Route::get('/finance/my-contributions', [FinanceController::class, 'myContributions']);
        Route::get('/finance/members/{member}/contributions', [FinanceController::class, 'memberContributions']);
        Route::post('/finance/contributions', [FinanceController::class, 'storeContribution']);
        Route::post('/finance/contributions/{contribution}/edit-requests', [FinanceController::class, 'requestContributionEdit']);
        Route::get('/finance/edit-requests', [FinanceController::class, 'editRequests']);
        Route::post('/finance/edit-requests/{contributionEditRequest}/approve', [FinanceController::class, 'approveEditRequest']);
        Route::post('/finance/edit-requests/{contributionEditRequest}/reject', [FinanceController::class, 'rejectEditRequest']);

        Route::get('/forum/threads', [ForumController::class, 'index']);
        Route::post('/forum/threads', [ForumController::class, 'storeThread']);
        Route::get('/forum/threads/{thread}', [ForumController::class, 'show']);
        Route::post('/forum/threads/{thread}/posts', [ForumController::class, 'storeReply']);
        Route::post('/forum/threads/{thread}/lock', [ForumController::class, 'setThreadLock']);
        Route::delete('/forum/threads/{thread}', [ForumController::class, 'destroyThread']);
        Route::post('/forum/posts/{post}/visibility', [ForumController::class, 'setPostVisibility']);
        Route::delete('/forum/posts/{post}', [ForumController::class, 'destroyPost']);

    });

});
