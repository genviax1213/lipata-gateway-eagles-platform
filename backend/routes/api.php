<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PostController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\MemberApplicationController;
use App\Http\Controllers\FinanceController;
use App\Http\Controllers\FinanceAuditController;
use App\Http\Controllers\ExpenseAuditController;
use App\Http\Controllers\FinanceExpenseController;
use App\Http\Controllers\ForumController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\LogManagementController;

Route::prefix('v1')->group(function () {
    Route::get('/content/homepage-community', [PostController::class, 'publicHomepageCommunity']);
    Route::get('/content/{section}', [PostController::class, 'publicBySection']);
    Route::get('/content/post/{slug}', [PostController::class, 'publicBySlug']);
    Route::post('/member-applications', [MemberApplicationController::class, 'submit'])
        ->middleware('throttle:application-submit');
    Route::post('/member-applications/verify', [MemberApplicationController::class, 'verify'])
        ->middleware('throttle:application-verify');

    // Login route
    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:auth-login');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
        ->middleware('throttle:auth-forgot-password');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])
        ->middleware('throttle:auth-reset-password');

    // Protected routes
    Route::middleware(['auth:sanctum', 'active.session'])->group(function () {

        Route::get('/user', function (Request $request) {
            return $request->user()->load('role.permissions:id,name');
        });
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::post('/auth/change-password', [AuthController::class, 'changePassword']);
        Route::get('/auth/sessions', [AuthController::class, 'sessions']);
        Route::delete('/auth/sessions/{tokenId}', [AuthController::class, 'revokeSession']);
        Route::get('/admin/logs', [LogManagementController::class, 'index'])->middleware('portal.permission:members.view');
        Route::get('/admin/logs/current/download', [LogManagementController::class, 'downloadCurrent'])->middleware('portal.permission:members.view');
        Route::delete('/admin/logs/current', [LogManagementController::class, 'clearCurrent'])->middleware('portal.permission:members.delete');
        Route::post('/admin/logs/compress', [LogManagementController::class, 'compressCurrent'])->middleware('portal.permission:members.delete');
        Route::get('/admin/logs/archives', [LogManagementController::class, 'archives'])->middleware('portal.permission:members.view');
        Route::get('/admin/logs/archives/{archive}/content', [LogManagementController::class, 'archiveContent'])->middleware('portal.permission:members.view');
        Route::get('/admin/logs/archives/{archive}/download', [LogManagementController::class, 'downloadArchive'])->middleware('portal.permission:members.view');
        Route::delete('/admin/logs/archives/{archive}', [LogManagementController::class, 'deleteArchive'])->middleware('portal.permission:members.delete');
        Route::get('/dashboard/me', [DashboardController::class, 'me']);

        Route::get('/cms/posts', [PostController::class, 'index'])->middleware('portal.permission:posts.create,posts.update,posts.delete');
        Route::get('/cms/posts/available-images', [PostController::class, 'availableImages'])->middleware('portal.permission:posts.create,posts.update,posts.delete');
        Route::get('/cms/posts/image-library', [PostController::class, 'imageLibrary'])->middleware('portal.permission:posts.create,posts.update,posts.delete');
        Route::delete('/cms/posts/image-library', [PostController::class, 'deleteLibraryImage'])->middleware('portal.permission:posts.delete');
        Route::post('/cms/posts', [PostController::class, 'store'])->middleware('portal.permission:posts.create');
        Route::post('/cms/uploads/inline-image', [PostController::class, 'uploadInlineImage'])->middleware('portal.permission:posts.create');
        Route::post('/cms/posts/{post}', [PostController::class, 'update'])->middleware('portal.permission:posts.update');
        Route::put('/cms/posts/{post}', [PostController::class, 'update'])->middleware('portal.permission:posts.update');
        Route::delete('/cms/posts/{post}', [PostController::class, 'destroy'])->middleware('portal.permission:posts.delete');

        Route::get('/members', [MemberController::class, 'index'])->middleware('portal.permission:members.view');
        Route::post('/members', [MemberController::class, 'store'])->middleware('throttle:members-write');
        Route::put('/members/{member}', [MemberController::class, 'update'])->middleware('throttle:members-write', 'portal.permission:members.update');
        Route::delete('/members/{member}', [MemberController::class, 'destroy'])->middleware('throttle:members-write', 'portal.permission:members.delete');
        Route::get('/member-applications', [MemberApplicationController::class, 'index'])->middleware('portal.permission:members.view');
        Route::get('/member-applications/me', [MemberApplicationController::class, 'myApplication'])->middleware('portal.permission:applications.dashboard.view');
        Route::get('/member-applications/{memberApplication}', [MemberApplicationController::class, 'show'])->middleware('portal.permission:members.view');
        Route::post('/member-applications/{memberApplication}/documents', [MemberApplicationController::class, 'uploadDocument'])->middleware('portal.permission:applications.docs.upload');
        Route::get('/member-applications/documents/{document}/view', [MemberApplicationController::class, 'viewDocument']);
        Route::post('/member-applications/documents/{document}/review', [MemberApplicationController::class, 'reviewDocument'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/{memberApplication}/stage', [MemberApplicationController::class, 'setStage'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/{memberApplication}/notice', [MemberApplicationController::class, 'setNotice'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/{memberApplication}/fee-requirements', [MemberApplicationController::class, 'setFeeRequirement'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/{memberApplication}/fee-payments', [MemberApplicationController::class, 'addCategoryFeePayment'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/fee-requirements/{applicationFeeRequirement}/payments', [MemberApplicationController::class, 'addFeePayment'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/{memberApplication}/approve', [MemberApplicationController::class, 'approve'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/{memberApplication}/probation', [MemberApplicationController::class, 'setProbation'])->middleware('role.required:membership_chairman');
        Route::post('/member-applications/{memberApplication}/reject', [MemberApplicationController::class, 'reject'])->middleware('role.required:membership_chairman');

        Route::get('/admin/roles', [AdminUserController::class, 'roles'])->middleware('portal.permission:members.view,members.create,members.update,members.delete');
        Route::get('/admin/members', [AdminUserController::class, 'members'])->middleware('portal.permission:members.view,members.create,members.update,members.delete');
        Route::put('/admin/members/{member}/role', [AdminUserController::class, 'assignRoleToMember'])->middleware('portal.permission:roles.delegate');
        Route::get('/admin/users', [AdminUserController::class, 'index'])->middleware('portal.permission:members.view,members.create,members.update,members.delete');
        Route::post('/admin/users', [AdminUserController::class, 'store'])->middleware('portal.permission:members.create');
        Route::put('/admin/users/{user}', [AdminUserController::class, 'update'])->middleware('portal.permission:members.update');
        Route::delete('/admin/users/{user}', [AdminUserController::class, 'destroy'])->middleware('portal.permission:members.delete');
        Route::put('/admin/users/{user}/role', [AdminUserController::class, 'updateRole'])->middleware('portal.permission:roles.delegate');
        Route::put('/admin/users/{user}/password', [AdminUserController::class, 'resetPassword'])->middleware('portal.permission:users.password.reset');
        Route::post('/admin/users/me/link-member-profile', [AdminUserController::class, 'linkCurrentUserMemberProfile'])->middleware('portal.permission:members.update');

        Route::get('/finance/members', [FinanceController::class, 'searchMembers'])->middleware('portal.permission:finance.view');
        Route::get('/finance/compliance', [FinanceController::class, 'complianceReport'])->middleware('portal.permission:finance.view');
        Route::get('/finance/accounts', [FinanceExpenseController::class, 'accounts'])->middleware('portal.permission:finance.view');
        Route::get('/finance/account-balances', [FinanceExpenseController::class, 'accountBalances'])->middleware('portal.permission:finance.view');
        Route::get('/finance/opening-balances', [FinanceExpenseController::class, 'openingBalances'])->middleware('portal.permission:finance.view');
        Route::post('/finance/opening-balances', [FinanceExpenseController::class, 'storeOpeningBalance'])->middleware('portal.permission:finance.input');
        Route::post('/finance/opening-balances/{openingBalance}/reverse', [FinanceExpenseController::class, 'reverseOpeningBalance'])->middleware('portal.permission:finance.input');
        Route::get('/finance/audit-findings', [FinanceAuditController::class, 'report'])->middleware('portal.permission:finance.view');
        Route::post('/finance/audit-notes', [FinanceAuditController::class, 'storeNote'])->middleware('portal.permission:finance.view');
        Route::get('/finance/expense-audit-findings', [ExpenseAuditController::class, 'report'])->middleware('portal.permission:finance.view');
        Route::post('/finance/expense-audit-notes', [ExpenseAuditController::class, 'storeNote'])->middleware('portal.permission:finance.view');
        Route::get('/finance/my-contributions', [FinanceController::class, 'myContributions']);
        Route::get('/finance/members/{member}/contributions', [FinanceController::class, 'memberContributions'])->middleware('portal.permission:finance.view');
        Route::get('/finance/report-preview', [FinanceController::class, 'reportPreview'])->middleware('portal.permission:finance.input');
        Route::post('/finance/contributions', [FinanceController::class, 'storeContribution'])->middleware('portal.permission:finance.input');
        Route::post('/finance/contributions/{contribution}/reverse', [FinanceController::class, 'reverseContribution'])->middleware('portal.permission:finance.input');
        Route::get('/finance/expenses', [FinanceExpenseController::class, 'expenses'])->middleware('portal.permission:finance.view');
        Route::get('/finance/expense-report-preview', [FinanceExpenseController::class, 'reportPreview'])->middleware('portal.permission:finance.input');
        Route::post('/finance/expenses', [FinanceExpenseController::class, 'storeExpense'])->middleware('portal.permission:finance.input');
        Route::post('/finance/expenses/{expense}/reverse', [FinanceExpenseController::class, 'reverseExpense'])->middleware('portal.permission:finance.input');

        Route::get('/forum/threads', [ForumController::class, 'index'])->middleware('forum.permission:forum.view');
        Route::post('/forum/threads', [ForumController::class, 'storeThread'])->middleware('forum.permission:forum.create_thread');
        Route::post('/forum/uploads/inline-image', [ForumController::class, 'uploadInlineImage'])->middleware('forum.permission:forum.reply');
        Route::get('/forum/threads/{thread}', [ForumController::class, 'show'])->middleware('forum.permission:forum.view');
        Route::post('/forum/threads/{thread}/posts', [ForumController::class, 'storeReply'])->middleware('forum.permission:forum.reply');
        Route::post('/forum/threads/{thread}/lock', [ForumController::class, 'setThreadLock'])->middleware('forum.permission:forum.moderate');
        Route::delete('/forum/threads/{thread}', [ForumController::class, 'destroyThread']);
        Route::post('/forum/posts/{post}/visibility', [ForumController::class, 'setPostVisibility'])->middleware('forum.permission:forum.moderate');
        Route::delete('/forum/posts/{post}', [ForumController::class, 'destroyPost']);

    });

});
