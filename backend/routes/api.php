<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PostController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\ApplicantController;
use App\Http\Controllers\MemberRegistrationController;
use App\Http\Controllers\FinanceController;
use App\Http\Controllers\FinanceAuditController;
use App\Http\Controllers\ExpenseAuditController;
use App\Http\Controllers\FinanceExpenseController;
use App\Http\Controllers\ForumController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FormalPhotoController;
use App\Http\Controllers\LogManagementController;
use App\Http\Controllers\BootstrapRecoveryController;
use App\Http\Controllers\GoogleOAuthController;
use App\Http\Controllers\IdentityQrController;
use App\Http\Controllers\CalendarEventController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\DirectoryExportController;

Route::prefix('v1')->group(function () {
    Route::get('/content/homepage-community', [PostController::class, 'publicHomepageCommunity']);
    Route::get('/content/{section}', [PostController::class, 'publicBySection']);
    Route::get('/content/post/{slug}', [PostController::class, 'publicBySlug']);
    Route::post('/applicant-registrations', [ApplicantController::class, 'submit'])
        ->middleware('throttle:application-submit');
    Route::post('/applicant-registrations/reapply', [ApplicantController::class, 'reapply'])
        ->middleware('throttle:application-submit');
    Route::post('/applicant-registrations/verify', [ApplicantController::class, 'verify'])
        ->middleware('throttle:application-verify');
    Route::post('/member-registrations', [MemberRegistrationController::class, 'register'])
        ->middleware('throttle:application-submit');
    Route::post('/member-registrations/verify', [MemberRegistrationController::class, 'verify'])
        ->middleware('throttle:application-verify');
    Route::get('/oauth/google/status', [GoogleOAuthController::class, 'status']);
    Route::get('/oauth/google/claim', [GoogleOAuthController::class, 'claim']);
    Route::post('/rll', [BootstrapRecoveryController::class, 'request'])
        ->middleware('throttle:bootstrap-recovery-request');
    Route::post('/rll/verify', [BootstrapRecoveryController::class, 'verify'])
        ->middleware('throttle:bootstrap-recovery-verify');
    Route::post('/rll/reset', [BootstrapRecoveryController::class, 'reset'])
        ->middleware('throttle:bootstrap-recovery-reset');

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
        Route::get('/admin/logs', [LogManagementController::class, 'index'])->middleware('portal.permission:users.view');
        Route::get('/admin/logs/current/download', [LogManagementController::class, 'downloadCurrent'])->middleware('portal.permission:users.view');
        Route::delete('/admin/logs/current', [LogManagementController::class, 'clearCurrent'])->middleware('portal.permission:users.manage');
        Route::post('/admin/logs/compress', [LogManagementController::class, 'compressCurrent'])->middleware('portal.permission:users.manage');
        Route::get('/admin/logs/archives', [LogManagementController::class, 'archives'])->middleware('portal.permission:users.view');
        Route::get('/admin/logs/archives/{archive}/content', [LogManagementController::class, 'archiveContent'])->middleware('portal.permission:users.view');
        Route::get('/admin/logs/archives/{archive}/download', [LogManagementController::class, 'downloadArchive'])->middleware('portal.permission:users.view');
        Route::delete('/admin/logs/archives/{archive}', [LogManagementController::class, 'deleteArchive'])->middleware('portal.permission:users.manage');
        Route::get('/dashboard/me', [DashboardController::class, 'me']);
        Route::get('/identity/my-qr', [IdentityQrController::class, 'showMine'])->middleware('portal.permission:identity.qr.view');
        Route::get('/calendar/events', [CalendarEventController::class, 'index'])->middleware('portal.permission:calendar.view');
        Route::post('/calendar/events', [CalendarEventController::class, 'store'])->middleware('portal.permission:calendar.manage');
        Route::put('/calendar/events/{calendarEvent}', [CalendarEventController::class, 'update'])->middleware('portal.permission:calendar.manage');
        Route::delete('/calendar/events/{calendarEvent}', [CalendarEventController::class, 'destroy'])->middleware('portal.permission:calendar.manage');
        Route::get('/attendance/events/{calendarEvent}/records', [AttendanceController::class, 'roster'])->middleware('portal.permission:attendance.view');
        Route::post('/attendance/events/{calendarEvent}/scan', [AttendanceController::class, 'scan'])->middleware('portal.permission:attendance.scan');
        Route::get('/directory/exports/members', [DirectoryExportController::class, 'exportMembers'])->middleware('portal.permission:directory.export');
        Route::get('/directory/exports/applicants', [DirectoryExportController::class, 'exportApplicants'])->middleware('portal.permission:directory.export');
        Route::get('/directory/exports/member-photos', [DirectoryExportController::class, 'exportMemberPhotosZip'])->middleware('portal.permission:photos.export');
        Route::get('/formal-photos/me', [FormalPhotoController::class, 'showMine'])->name('formal-photos.my');
        Route::post('/formal-photos/me', [FormalPhotoController::class, 'storeMine'])->middleware('throttle:members-write')->name('formal-photos.store');
        Route::get('/formal-photos/me/image', [FormalPhotoController::class, 'showMineImage'])->name('formal-photos.my-image');
        Route::get('/formal-photos/directory', [FormalPhotoController::class, 'indexDirectory'])->name('formal-photos.directory');
        Route::get('/formal-photos/{formalPhoto}/image', [FormalPhotoController::class, 'showImage'])->name('formal-photos.show-image');

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
        Route::get('/members/{member}', [MemberController::class, 'show'])->middleware('portal.permission:members.view');
        Route::get('/members/me/profile', [MemberController::class, 'myProfile']);
        Route::get('/members/{member}/formal-photo', [FormalPhotoController::class, 'showForMember'])->name('formal-photos.members.show');
        Route::post('/members/{member}/assign-applicant-batch', [MemberController::class, 'assignApplicantBatch'])->middleware('throttle:members-write', 'portal.permission:applications.review');
        Route::put('/members/me/profile', [MemberController::class, 'updateMyProfile']);
        Route::post('/members', [MemberController::class, 'store'])->middleware('throttle:members-write', 'portal.permission:members.create');
        Route::put('/members/{member}', [MemberController::class, 'update'])->middleware('throttle:members-write', 'portal.permission:members.update');
        Route::delete('/members/{member}', [MemberController::class, 'destroy'])->middleware('throttle:members-write', 'portal.permission:users.manage');
        Route::get('/applicants', [ApplicantController::class, 'index']);
        Route::get('/applicants/me', [ApplicantController::class, 'myApplication'])->middleware('portal.permission:applications.dashboard.view');
        Route::post('/applicants/me/withdraw', [ApplicantController::class, 'withdraw']);
        Route::get('/applicants/archive/me', [ApplicantController::class, 'myArchive']);
        Route::get('/applicants/{applicant}/formal-photo', [FormalPhotoController::class, 'showForApplicant'])->name('formal-photos.applicants.show');
        Route::get('/applicants/{applicant}', [ApplicantController::class, 'show']);
        Route::delete('/applicants/{applicant}', [ApplicantController::class, 'destroy']);
        Route::post('/applicants/{applicant}/documents', [ApplicantController::class, 'uploadDocument'])->middleware('portal.permission:applications.docs.upload');
        Route::get('/applicants/documents/{document}/view', [ApplicantController::class, 'viewDocument']);
        Route::post('/applicants/documents/{document}/review', [ApplicantController::class, 'reviewDocument'])->middleware('portal.permission:applications.docs.review');
        Route::post('/applicants/{applicant}/stage', [ApplicantController::class, 'setStage'])->middleware('portal.permission:applications.stage.set');
        Route::post('/applicants/{applicant}/notice', [ApplicantController::class, 'setNotice'])->middleware('portal.permission:applications.notice.set');
        Route::post('/applicants/{applicant}/fee-requirements', [ApplicantController::class, 'setFeeRequirement'])->middleware('portal.permission:applications.fee.set');
        Route::post('/applicants/{applicant}/fee-payments', [ApplicantController::class, 'addCategoryFeePayment']);
        Route::post('/applicants/fee-requirements/{applicantFeeRequirement}/payments', [ApplicantController::class, 'addFeePayment']);
        Route::post('/applicants/{applicant}/approve', [ApplicantController::class, 'approve'])->middleware('portal.permission:applications.review');
        Route::post('/applicants/{applicant}/activate', [ApplicantController::class, 'activate'])->middleware('portal.permission:applications.review');
        Route::post('/applicants/{applicant}/probation', [ApplicantController::class, 'setProbation'])->middleware('portal.permission:applications.review');
        Route::post('/applicants/{applicant}/reject', [ApplicantController::class, 'reject'])->middleware('portal.permission:applications.review');
        Route::post('/applicants/{applicant}/recover-pending-verification', [ApplicantController::class, 'recoverPendingVerification'])->middleware('portal.permission:applications.review');
        Route::post('/applicants/{applicant}/assign-batch', [ApplicantController::class, 'assignBatch'])->middleware('portal.permission:applications.review');
        Route::get('/applicant-batches', [ApplicantController::class, 'listBatches'])->middleware('portal.permission:applications.review');
        Route::get('/applicant-batch-treasurer-candidates', [ApplicantController::class, 'batchTreasurerCandidates'])->middleware('portal.permission:applications.review');
        Route::post('/applicant-batches', [ApplicantController::class, 'createBatch'])->middleware('portal.permission:applications.review');
        Route::put('/applicant-batches/{applicantBatch}', [ApplicantController::class, 'updateBatch'])->middleware('portal.permission:applications.review');
        Route::post('/applicant-batches/{applicantBatch}/documents', [ApplicantController::class, 'uploadBatchDocument'])->middleware('portal.permission:applications.review');
        Route::get('/applicant-batches/documents/{document}/view', [ApplicantController::class, 'viewBatchDocument']);

        Route::get('/admin/roles', [AdminUserController::class, 'roles'])->middleware('portal.permission:users.view');
        Route::get('/admin/members', [AdminUserController::class, 'members'])->middleware('portal.permission:users.view');
        Route::put('/admin/members/{member}/role', [AdminUserController::class, 'assignRoleToMember'])->middleware('portal.permission:roles.delegate');
        Route::get('/admin/users', [AdminUserController::class, 'index'])->middleware('portal.permission:users.view');
        Route::post('/admin/users', [AdminUserController::class, 'store'])->middleware('portal.permission:users.manage');
        Route::put('/admin/users/{user}', [AdminUserController::class, 'update'])->middleware('portal.permission:users.manage');
        Route::delete('/admin/users/{user}', [AdminUserController::class, 'destroy'])->middleware('portal.permission:users.manage');
        Route::put('/admin/users/{user}/role', [AdminUserController::class, 'updateRole'])->middleware('portal.permission:users.manage');
        Route::put('/admin/users/{user}/password', [AdminUserController::class, 'resetPassword'])->middleware('portal.permission:users.password.reset');
        Route::post('/admin/users/me/link-member-profile', [AdminUserController::class, 'linkCurrentUserMemberProfile'])->middleware('portal.permission:users.manage');

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
