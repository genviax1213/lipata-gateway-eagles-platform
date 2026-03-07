<?php

namespace App\Http\Controllers;

use App\Models\ApplicationDocument;
use App\Models\ApplicationFeePayment;
use App\Models\ApplicationFeeRequirement;
use App\Models\ApplicationNotice;
use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\Role;
use App\Models\User;
use App\Notifications\MemberApplicationVerificationToken;
use App\Support\ImageUploadOptimizer;
use App\Support\TextCase;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MemberApplicationController extends Controller
{
    private function applicantContributionCategoryLabels(): array
    {
        return ApplicationFeeRequirement::CATEGORY_LABELS;
    }

    private function resolveCategoryRequirement(MemberApplication $application, string $category): ?ApplicationFeeRequirement
    {
        return $application->feeRequirements
            ->first(fn (ApplicationFeeRequirement $req) => $req->category === $category);
    }

    private function normalizeName(string $value): string
    {
        return Str::of($value)->lower()->squish()->value();
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function applyPersonMatch(Builder $query, string $firstName, ?string $middleName, string $lastName): Builder
    {
        $first = $this->normalizeName($firstName);
        $middle = $this->normalizeName((string) ($middleName ?? ''));
        $last = $this->normalizeName($lastName);

        return $query
            ->whereRaw('LOWER(TRIM(first_name)) = ?', [$first])
            ->whereRaw('LOWER(TRIM(COALESCE(middle_name, ""))) = ?', [$middle])
            ->whereRaw('LOWER(TRIM(last_name)) = ?', [$last]);
    }

    private function duplicateIdentityGuidance(string $context): array
    {
        return [
            'message' => 'Possible duplicate person detected. ' . $context,
            'next_step' => 'Use "Edit Email" authenticated procedure: 1) confirm current email ownership, 2) verify new email via token, 3) admin/officer reviews and approves the change.',
        ];
    }

    private function fiveIStageLabel(?string $stage): string
    {
        $labels = [
            'interview' => 'Interview',
            'introduction' => 'Introduction',
            'indoctrination_initiation' => 'Indoctrination (Initiation)',
            'incubation' => 'Incubation',
            'induction' => 'Induction',
        ];

        return $labels[$stage ?? ''] ?? 'Not Set';
    }

    private function applicantPayload(MemberApplication $application): array
    {
        $application->loadMissing([
            'reviewer:id,name',
            'notices.createdBy:id,name',
            'documents.reviewedBy:id,name',
            'feeRequirements.setBy:id,name',
            'feeRequirements.payments.encodedBy:id,name',
        ]);

        $requiredAmount = 0.0;
        $paidAmount = 0.0;
        $categoryLabels = $this->applicantContributionCategoryLabels();

        $feeRequirements = collect($categoryLabels)->map(function (string $label, string $category) use ($application, &$requiredAmount, &$paidAmount) {
            $requirement = $this->resolveCategoryRequirement($application, $category);
            $targetAmount = $requirement ? (float) $requirement->required_amount : 0.0;
            $requiredAmount += $targetAmount;

            $payments = ($requirement?->payments ?? collect())->map(function (ApplicationFeePayment $payment) use (&$paidAmount) {
                $paid = (float) $payment->amount;
                $paidAmount += (float) $payment->amount;
                return [
                    'id' => $payment->id,
                    'amount' => $payment->amount,
                    'partial_amount' => $paid,
                    'payment_date' => optional($payment->payment_date)->toDateString(),
                    'note' => $payment->note,
                    'encoded_by' => $payment->encodedBy ? ['id' => $payment->encodedBy->id, 'name' => $payment->encodedBy->name] : null,
                ];
            })->values();

            $partialTotal = (float) $payments->sum('partial_amount');
            $variance = $targetAmount - $partialTotal;

            return [
                'id' => $requirement?->id,
                'category' => $category,
                'category_label' => $label,
                'target_payment' => round($targetAmount, 2),
                'partial_payment_total' => round($partialTotal, 2),
                'variance' => round($variance, 2),
                'required_amount' => round($targetAmount, 2),
                'paid_amount' => round($partialTotal, 2),
                'note' => $requirement?->note,
                'set_by' => $requirement?->setBy ? ['id' => $requirement->setBy->id, 'name' => $requirement->setBy->name] : null,
                'payments' => $payments,
            ];
        })->values();

        return [
            'id' => $application->id,
            'full_name' => trim($application->first_name . ' ' . ($application->middle_name ? $application->middle_name . ' ' : '') . $application->last_name),
            'email' => $application->email,
            'status' => $application->status,
            'decision_status' => $application->decision_status,
            'current_stage' => $application->current_stage,
            'current_stage_label' => $this->fiveIStageLabel($application->current_stage),
            'is_login_blocked' => $application->is_login_blocked,
            'reviewer' => $application->reviewer ? ['id' => $application->reviewer->id, 'name' => $application->reviewer->name] : null,
            'notices' => $application->notices
                ->sortByDesc('id')
                ->values()
                ->map(fn (ApplicationNotice $notice) => [
                    'id' => $notice->id,
                    'notice_text' => $notice->notice_text,
                    'created_at' => optional($notice->created_at)?->toISOString(),
                    'created_by' => $notice->createdBy ? ['id' => $notice->createdBy->id, 'name' => $notice->createdBy->name] : null,
                ]),
            'documents' => $application->documents
                ->sortByDesc('id')
                ->values()
                ->map(fn (ApplicationDocument $doc) => [
                    'id' => $doc->id,
                    'original_name' => $doc->original_name,
                    'status' => $doc->status,
                    'review_note' => $doc->review_note,
                    'reviewed_at' => optional($doc->reviewed_at)?->toISOString(),
                    'reviewed_by' => $doc->reviewedBy ? ['id' => $doc->reviewedBy->id, 'name' => $doc->reviewedBy->name] : null,
                ]),
            'fees' => [
                'required_total' => $requiredAmount,
                'paid_total' => $paidAmount,
                'balance' => max($requiredAmount - $paidAmount, 0),
                'variance_total' => round($requiredAmount - $paidAmount, 2),
                'category_labels' => $categoryLabels,
                'requirements' => $feeRequirements,
            ],
        ];
    }

    public function submit(Request $request)
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'last_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'email' => 'required|email|max:255',
            'password' => 'required|string|min:8|confirmed',
            'membership_status' => 'required|in:active,inactive,applicant',
        ]);

        $normalizedEmail = $this->normalizeEmail($validated['email']);
        $normalizedFirstName = (string) TextCase::title($validated['first_name']);
        $normalizedMiddleName = (string) TextCase::title($validated['middle_name']);
        $normalizedLastName = (string) TextCase::title($validated['last_name']);

        $existingMemberByName = $this->applyPersonMatch(
            Member::query(),
            $normalizedFirstName,
            $normalizedMiddleName,
            $normalizedLastName
        )->first();
        if ($existingMemberByName) {
            return response()->json(
                $this->duplicateIdentityGuidance('A member record with the same full name already exists.'),
                422
            );
        }

        $existingMemberByEmail = Member::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->first();
        if ($existingMemberByEmail) {
            return response()->json(
                $this->duplicateIdentityGuidance('This email is already linked to an existing member record.'),
                422
            );
        }

        $existingApplicationByName = $this->applyPersonMatch(
            MemberApplication::query(),
            $normalizedFirstName,
            $normalizedMiddleName,
            $normalizedLastName
        )->whereIn('status', ['pending_verification', 'pending_approval', 'approved'])
            ->first();
        if ($existingApplicationByName) {
            return response()->json(
                $this->duplicateIdentityGuidance('An application with the same full name is already on file.'),
                422
            );
        }

        $existingApplicationByEmail = MemberApplication::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->whereIn('status', ['pending_verification', 'pending_approval', 'approved'])
            ->first();
        if ($existingApplicationByEmail) {
            return response()->json(
                $this->duplicateIdentityGuidance('An application already exists for this email.'),
                422
            );
        }

        $applicantRole = Role::query()->where('name', 'applicant')->first();
        $applicantUser = User::query()->updateOrCreate(
            ['email' => $normalizedEmail],
            [
                'name' => trim($normalizedFirstName . ' ' . $normalizedMiddleName . ' ' . $normalizedLastName),
                'password' => Hash::make($validated['password']),
                'role_id' => $applicantRole?->id,
                'finance_role' => null,
                'forum_role' => null,
            ]
        );

        $token = Str::random(48);

        $application = MemberApplication::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => $normalizedFirstName,
            'middle_name' => $normalizedMiddleName,
            'last_name' => $normalizedLastName,
            'email' => $normalizedEmail,
            'membership_status' => $validated['membership_status'],
            'status' => 'pending_verification',
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', $token),
            'is_login_blocked' => false,
        ]);

        $applicantUser->notify(new MemberApplicationVerificationToken($token, $normalizedEmail));

        return response()->json([
            'message' => 'Application submitted. Verify your email to continue to chairman review.',
            'application_id' => $application->id,
        ], 201);
    }

    public function verify(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:255',
            'verification_token' => 'required|string|min:12|max:120',
        ]);

        $normalizedEmail = $this->normalizeEmail($validated['email']);

        $application = MemberApplication::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->where('verification_token', hash('sha256', (string) $validated['verification_token']))
            ->where('status', 'pending_verification')
            ->first();

        if (!$application) {
            return response()->json([
                'message' => 'Invalid verification details or application already verified.',
            ], 422);
        }

        $application->email_verified_at = now();
        $application->status = 'pending_approval';
        $application->decision_status = 'pending';
        $application->save();

        return response()->json([
            'message' => 'Email verified. Your application is now pending membership chairman review.',
        ]);
    }

    public function index(Request $request)
    {
        $status = (string) $request->query('status', 'pending_approval');
        $allowed = ['pending_verification', 'pending_approval', 'approved', 'rejected', 'all'];
        if (!in_array($status, $allowed, true)) {
            $status = 'pending_approval';
        }

        $query = MemberApplication::query()
            ->with('reviewer:id,name')
            ->withCount([
                'documents as approved_documents_count' => fn ($q) => $q->where('status', 'approved'),
                'documents as pending_documents_count' => fn ($q) => $q->where('status', 'pending'),
            ]);

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        return response()->json($query->latest('id')->paginate(20));
    }

    public function myApplication(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        $application = MemberApplication::query()
            ->where('user_id', $user->id)
            ->orWhereRaw('LOWER(TRIM(email)) = ?', [strtolower(trim((string) $user->email))])
            ->latest('id')
            ->first();

        if (!$application) {
            return response()->json(['message' => 'No application found for this account.'], 404);
        }

        return response()->json($this->applicantPayload($application));
    }

    public function show(Request $request, MemberApplication $memberApplication)
    {
        return response()->json($this->applicantPayload($memberApplication));
    }

    public function uploadDocument(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('uploadDocument', $memberApplication);

        $validated = $request->validate([
            'document' => 'required|file|mimes:jpg,jpeg,png,webp,pdf|max:10240',
        ]);

        $uploadedFile = $request->file('document');
        $path = ImageUploadOptimizer::storeOptimizedOrOriginal(
            $uploadedFile,
            'application-docs',
            'local',
            2000,
            2000,
            82,
            false
        );

        $document = ApplicationDocument::query()->create([
            'member_application_id' => $memberApplication->id,
            'file_path' => $path,
            'original_name' => $uploadedFile->getClientOriginalName(),
            'status' => 'pending',
        ]);

        return response()->json(['message' => 'Document uploaded and pending review.', 'document' => $document], 201);
    }

    public function reviewDocument(Request $request, ApplicationDocument $document)
    {
        $this->authorize('review', $document);

        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'review_note' => 'nullable|string|max:255',
        ]);

        $document->status = $validated['status'];
        $document->review_note = $validated['review_note'] ?? null;
        $document->reviewed_by_user_id = $request->user()->id;
        $document->reviewed_at = now();
        $document->save();

        Log::info('application.document_reviewed', [
            'actor_user_id' => $request->user()->id,
            'document_id' => $document->id,
            'application_id' => $document->member_application_id,
            'status' => $document->status,
            'ip' => $request->ip(),
        ]);

        return response()->json(['message' => 'Document review updated.', 'document' => $document->fresh()]);
    }

    public function viewDocument(Request $request, ApplicationDocument $document)
    {
        $this->authorize('view', $document);

        $disk = $this->resolveDocumentDisk($document);
        if (!Storage::disk($disk)->exists($document->file_path)) {
            abort(404, 'Document file not found.');
        }

        return Storage::disk($disk)->response(
            $document->file_path,
            $document->original_name
        );
    }

    public function setStage(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('setStage', $memberApplication);

        $validated = $request->validate([
            'current_stage' => 'required|in:interview,introduction,indoctrination_initiation,incubation,induction',
        ]);

        $memberApplication->current_stage = $validated['current_stage'];
        $memberApplication->save();

        Log::info('application.stage_updated', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $memberApplication->id,
            'current_stage' => $memberApplication->current_stage,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Applicant stage updated.',
            'application' => $memberApplication->fresh(),
        ]);
    }

    public function setNotice(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('setNotice', $memberApplication);

        $validated = $request->validate([
            'notice_text' => 'required|string|min:3|max:3000',
        ]);

        $notice = ApplicationNotice::query()->create([
            'member_application_id' => $memberApplication->id,
            'notice_text' => trim($validated['notice_text']),
            'created_by_user_id' => $request->user()->id,
        ]);

        Log::info('application.notice_set', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $memberApplication->id,
            'notice_id' => $notice->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Notice posted for applicant.',
            'notice' => $notice->fresh(),
        ], 201);
    }

    public function setFeeRequirement(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('setFeeRequirement', $memberApplication);

        $validated = $request->validate([
            'category' => 'required|in:project,community_service,fellowship,five_i_activities',
            'required_amount' => 'required|numeric|min:0.01',
            'note' => 'nullable|string|max:255',
        ]);

        $requirement = ApplicationFeeRequirement::query()->updateOrCreate(
            [
                'member_application_id' => $memberApplication->id,
                'category' => $validated['category'],
            ],
            [
            'member_application_id' => $memberApplication->id,
            'category' => $validated['category'],
            'required_amount' => $validated['required_amount'],
            'note' => $validated['note'] ?? null,
            'set_by_user_id' => $request->user()->id,
            ]
        );

        Log::info('application.fee_requirement_set', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $memberApplication->id,
            'category' => $requirement->category,
            'requirement_id' => $requirement->id,
            'required_amount' => $requirement->required_amount,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Applicant fee requirement set.',
            'requirement' => $requirement->fresh(),
        ], 201);
    }

    public function addFeePayment(Request $request, ApplicationFeeRequirement $applicationFeeRequirement)
    {
        $this->authorize('recordFeePayment', $applicationFeeRequirement->memberApplication);

        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'nullable|date',
            'note' => 'nullable|string|max:255',
        ]);

        $payment = ApplicationFeePayment::query()->create([
            'application_fee_requirement_id' => $applicationFeeRequirement->id,
            'amount' => $validated['amount'],
            'payment_date' => $validated['payment_date'] ?? now()->toDateString(),
            'note' => $validated['note'] ?? null,
            'encoded_by_user_id' => $request->user()->id,
        ]);

        Log::info('application.fee_payment_recorded', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicationFeeRequirement->member_application_id,
            'requirement_id' => $applicationFeeRequirement->id,
            'payment_id' => $payment->id,
            'amount' => $payment->amount,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Applicant fee payment recorded.',
            'payment' => $payment->fresh(),
        ], 201);
    }

    public function addCategoryFeePayment(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('recordFeePayment', $memberApplication);

        $validated = $request->validate([
            'category' => 'required|in:project,community_service,fellowship,five_i_activities',
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'nullable|date',
            'note' => 'nullable|string|max:255',
        ]);

        $requirement = ApplicationFeeRequirement::query()
            ->where('member_application_id', $memberApplication->id)
            ->where('category', $validated['category'])
            ->first();

        if (!$requirement) {
            return response()->json([
                'message' => 'Set target payment for this category before encoding a partial/full payment.',
            ], 422);
        }

        $payment = ApplicationFeePayment::query()->create([
            'application_fee_requirement_id' => $requirement->id,
            'amount' => $validated['amount'],
            'payment_date' => $validated['payment_date'] ?? now()->toDateString(),
            'note' => $validated['note'] ?? null,
            'encoded_by_user_id' => $request->user()->id,
        ]);

        Log::info('application.fee_payment_recorded', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $memberApplication->id,
            'category' => $requirement->category,
            'requirement_id' => $requirement->id,
            'payment_id' => $payment->id,
            'amount' => $payment->amount,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Applicant fee payment recorded.',
            'payment' => $payment->fresh(),
            'requirement' => $requirement->fresh(),
        ], 201);
    }

    public function approve(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('reviewDecision', $memberApplication);

        if ($memberApplication->status !== 'pending_approval' || !$memberApplication->email_verified_at) {
            return response()->json([
                'message' => 'Only verified applications pending approval can be approved.',
            ], 422);
        }

        $existingMemberByName = $this->applyPersonMatch(
            Member::query(),
            $memberApplication->first_name,
            $memberApplication->middle_name,
            $memberApplication->last_name
        )->first();
        if ($existingMemberByName) {
            return response()->json(
                $this->duplicateIdentityGuidance('A member record with the same full name already exists.'),
                422
            );
        }

        $existingMemberByEmail = Member::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$this->normalizeEmail((string) $memberApplication->email)])
            ->first();
        if ($existingMemberByEmail) {
            return response()->json(
                $this->duplicateIdentityGuidance('This email is already used by another member record.'),
                422
            );
        }

        $member = Member::query()->create([
            'member_number' => $this->generateMemberNumber(),
            'first_name' => $memberApplication->first_name,
            'middle_name' => $memberApplication->middle_name,
            'last_name' => $memberApplication->last_name,
            'email' => $memberApplication->email,
            'email_verified' => true,
            'password_set' => true,
            'membership_status' => 'active',
            'user_id' => $memberApplication->user_id,
        ]);

        $memberRole = Role::query()->where('name', 'member')->first();
        if ($memberRole && $memberApplication->user_id) {
            User::query()->where('id', $memberApplication->user_id)->update(['role_id' => $memberRole->id]);
        }

        $memberApplication->status = 'approved';
        $memberApplication->decision_status = 'approved';
        $memberApplication->is_login_blocked = false;
        $memberApplication->reviewed_by_user_id = $request->user()->id;
        $memberApplication->reviewed_at = now();
        $memberApplication->rejection_reason = null;
        $memberApplication->save();

        Log::info('application.approved', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $memberApplication->id,
            'member_id' => $member->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Application approved and member record created.',
            'member' => $member,
            'application' => $memberApplication->fresh(),
        ]);
    }

    public function setProbation(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('reviewDecision', $memberApplication);

        if (!in_array($memberApplication->status, ['pending_verification', 'pending_approval'], true)) {
            return response()->json([
                'message' => 'Only pending applications can be moved to probation.',
            ], 422);
        }

        $memberApplication->decision_status = 'probation';
        $memberApplication->status = 'pending_approval';
        $memberApplication->is_login_blocked = false;
        $memberApplication->reviewed_by_user_id = $request->user()->id;
        $memberApplication->reviewed_at = now();
        $memberApplication->save();

        Log::info('application.probation_set', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $memberApplication->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Application moved to probation.',
            'application' => $memberApplication->fresh(),
        ]);
    }

    public function reject(Request $request, MemberApplication $memberApplication)
    {
        $this->authorize('reviewDecision', $memberApplication);

        if (!in_array($memberApplication->status, ['pending_approval', 'pending_verification'], true)) {
            return response()->json([
                'message' => 'This application has already been reviewed.',
            ], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:255',
        ]);

        $memberApplication->status = 'rejected';
        $memberApplication->decision_status = 'rejected';
        $memberApplication->is_login_blocked = true;
        $memberApplication->reviewed_by_user_id = $request->user()->id;
        $memberApplication->reviewed_at = now();
        $memberApplication->rejection_reason = $validated['reason'] ?? null;
        $memberApplication->save();

        Log::info('application.rejected', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $memberApplication->id,
            'reason' => $memberApplication->rejection_reason,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Application rejected. Record kept for historical/admin access.',
            'application' => $memberApplication->fresh(),
        ]);
    }

    private function resolveDocumentDisk(ApplicationDocument $document): string
    {
        // Backward compatible: existing records may still point to legacy public storage.
        if (Storage::disk('local')->exists($document->file_path)) {
            return 'local';
        }

        if (Storage::disk('public')->exists($document->file_path)) {
            return 'public';
        }

        return 'local';
    }

    private function generateMemberNumber(): string
    {
        $prefix = 'LGEC-' . now()->format('Y') . '-';
        $next = 1;

        do {
            $candidate = $prefix . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
            $exists = Member::query()->where('member_number', $candidate)->exists();
            $next++;
        } while ($exists);

        return $candidate;
    }
}
