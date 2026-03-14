<?php

namespace App\Http\Controllers;

use App\Models\ApplicantDocument;
use App\Models\ApplicantFeePayment;
use App\Models\ApplicantFeeRequirement;
use App\Models\ApplicantNotice;
use App\Models\ApplicantBatch;
use App\Models\ApplicantBatchDocument;
use App\Models\Member;
use App\Models\Applicant;
use App\Models\MemberRegistration;
use App\Models\Role;
use App\Models\User;
use App\Notifications\ApplicantVerificationToken;
use App\Support\ImageUploadOptimizer;
use App\Support\GoogleOAuthClaimStore;
use App\Support\Permissions;
use App\Support\TextCase;
use App\Support\VerificationToken;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ApplicantController extends Controller
{
    private const DOCUMENT_REUSE_GRACE_MONTHS = 3;

    private function createApplicantAccountAndApplication(
        string $email,
        string $firstName,
        string $middleName,
        string $lastName,
        string $password,
        bool $emailVerified = false
    ): array {
        $applicantRole = Role::query()->where('name', 'applicant')->first();
        $applicantUser = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => trim($firstName . ' ' . $middleName . ' ' . $lastName),
                'password' => Hash::make($password),
                'role_id' => $applicantRole?->id,
                'finance_role' => null,
                'forum_role' => null,
                'email_verified_at' => $emailVerified ? now() : null,
            ]
        );
        $token = VerificationToken::generate();

        $application = Applicant::query()->create([
            'user_id' => $applicantUser->id,
            'first_name' => $firstName,
            'middle_name' => $middleName,
            'last_name' => $lastName,
            'email' => $email,
            'membership_status' => 'applicant',
            'status' => $emailVerified ? Applicant::STATUS_UNDER_REVIEW : Applicant::STATUS_PENDING_VERIFICATION,
            'decision_status' => 'pending',
            'current_stage' => 'interview',
            'verification_token' => hash('sha256', $token),
            'email_verified_at' => $emailVerified ? now() : null,
            'is_login_blocked' => false,
        ]);

        if (!$emailVerified) {
            $applicantUser->notify(new ApplicantVerificationToken($token, $email));
        }

        return [$applicantUser, $application];
    }

    private function consumeGoogleClaim(Request $request, string $email): ?array
    {
        if ($request->input('oauth_provider') !== 'google') {
            return null;
        }

        $token = (string) $request->input('oauth_claim_token', '');
        $claim = GoogleOAuthClaimStore::consume(GoogleOAuthClaimStore::INTENT_APPLICANT_REGISTRATION, $token);
        if (!$claim) {
            throw ValidationException::withMessages([
                'oauth_provider' => ['Google registration session expired. Start Google registration again.'],
            ]);
        }

        if ($this->normalizeEmail((string) $claim['email']) !== $email) {
            throw ValidationException::withMessages([
                'email' => ['Google verified email must match the application email.'],
            ]);
        }

        return $claim;
    }

    private function resolveOwnedApplication(User $user): ?Applicant
    {
        return Applicant::query()
            ->ownedByUser($user)
            ->latest('id')
            ->first();
    }

    private function applicantContributionCategoryLabels(): array
    {
        return ApplicantFeeRequirement::CATEGORY_LABELS;
    }

    private function resolveCategoryRequirement(Applicant $application, string $category): ?ApplicantFeeRequirement
    {
        return $application->feeRequirements
            ->first(fn (ApplicantFeeRequirement $req) => $req->category === $category);
    }

    private function normalizeName(string $value): string
    {
        return Str::of($value)->lower()->squish()->value();
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function titleOrNull(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : (string) TextCase::title($value);
    }

    private function upperOrNull(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : (string) TextCase::upper($value);
    }

    private function compactPhone(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : preg_replace('/\s+/', '', $value);
    }

    private function trimOrNull(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private function buildLegacyAddress(array $payload): ?string
    {
        $explicit = $this->trimOrNull($payload['address'] ?? null);
        if ($explicit !== null) {
            return $explicit;
        }

        $parts = array_filter([
            $this->trimOrNull($payload['address_line'] ?? null),
            $this->trimOrNull($payload['street_no'] ?? null),
            $this->trimOrNull($payload['barangay'] ?? null),
            $this->trimOrNull($payload['city_municipality'] ?? null),
            $this->trimOrNull($payload['province'] ?? null),
            $this->trimOrNull($payload['zip_code'] ?? null),
        ], fn (?string $value) => $value !== null);

        return $parts === [] ? null : implode(', ', $parts);
    }

    private function applicantProfileRules(): array
    {
        return [
            'first_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'nickname' => 'nullable|string|max:120',
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'last_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'spouse_name' => 'nullable|string|max:180',
            'contact_number' => 'nullable|string|max:50',
            'telephone_number' => 'nullable|string|max:50',
            'emergency_contact_number' => 'nullable|string|max:50',
            'address' => 'nullable|string|max:1000',
            'address_line' => 'nullable|string|max:255',
            'street_no' => 'nullable|string|max:120',
            'barangay' => 'nullable|string|max:120',
            'city_municipality' => 'nullable|string|max:120',
            'province' => 'nullable|string|max:120',
            'zip_code' => 'nullable|string|max:20',
            'date_of_birth' => 'nullable|date',
            'place_of_birth' => 'nullable|string|max:180',
            'civil_status' => 'nullable|string|max:50',
            'height_cm' => 'nullable|numeric|min:0|max:400',
            'weight_kg' => 'nullable|numeric|min:0|max:500',
            'citizenship' => 'nullable|string|max:120',
            'religion' => 'nullable|string|max:120',
            'blood_type' => 'nullable|string|max:20',
            'region' => 'nullable|string|max:120',
            'hobbies' => 'nullable|string|max:5000',
            'special_skills' => 'nullable|string|max:5000',
        ];
    }

    private function normalizeApplicantProfilePayload(array $validated): array
    {
        return [
            'first_name' => (string) TextCase::title($validated['first_name']),
            'nickname' => $this->titleOrNull($validated['nickname'] ?? null),
            'middle_name' => (string) TextCase::title($validated['middle_name']),
            'last_name' => (string) TextCase::title($validated['last_name']),
            'spouse_name' => $this->titleOrNull($validated['spouse_name'] ?? null),
            'contact_number' => $this->compactPhone($validated['contact_number'] ?? null),
            'telephone_number' => $this->compactPhone($validated['telephone_number'] ?? null),
            'emergency_contact_number' => $this->compactPhone($validated['emergency_contact_number'] ?? null),
            'address_line' => $this->trimOrNull($validated['address_line'] ?? null),
            'street_no' => $this->trimOrNull($validated['street_no'] ?? null),
            'barangay' => $this->titleOrNull($validated['barangay'] ?? null),
            'city_municipality' => $this->titleOrNull($validated['city_municipality'] ?? null),
            'province' => $this->titleOrNull($validated['province'] ?? null),
            'zip_code' => $this->upperOrNull($validated['zip_code'] ?? null),
            'address' => $this->buildLegacyAddress($validated),
            'date_of_birth' => $validated['date_of_birth'] ?? null,
            'place_of_birth' => $this->titleOrNull($validated['place_of_birth'] ?? null),
            'civil_status' => $this->titleOrNull($validated['civil_status'] ?? null),
            'height_cm' => isset($validated['height_cm']) && $validated['height_cm'] !== '' ? (float) $validated['height_cm'] : null,
            'weight_kg' => isset($validated['weight_kg']) && $validated['weight_kg'] !== '' ? (float) $validated['weight_kg'] : null,
            'citizenship' => $this->titleOrNull($validated['citizenship'] ?? null),
            'religion' => $this->titleOrNull($validated['religion'] ?? null),
            'blood_type' => $this->upperOrNull($validated['blood_type'] ?? null),
            'region' => $this->titleOrNull($validated['region'] ?? null),
            'hobbies' => $this->trimOrNull($validated['hobbies'] ?? null),
            'special_skills' => $this->trimOrNull($validated['special_skills'] ?? null),
        ];
    }

    private function applicantProfilePayload(Applicant $application): array
    {
        $application->loadMissing('batch:id,name', 'user.formalPhoto');

        return [
            'id' => $application->id,
            'portal_subject' => 'applicant',
            'member_number' => null,
            'email' => $application->email,
            'first_name' => $application->first_name,
            'nickname' => $application->nickname,
            'middle_name' => $application->middle_name,
            'last_name' => $application->last_name,
            'spouse_name' => $application->spouse_name,
            'contact_number' => $application->contact_number,
            'telephone_number' => $application->telephone_number,
            'emergency_contact_number' => $application->emergency_contact_number,
            'address' => $application->address,
            'address_line' => $application->address_line,
            'street_no' => $application->street_no,
            'barangay' => $application->barangay,
            'city_municipality' => $application->city_municipality,
            'province' => $application->province,
            'zip_code' => $application->zip_code,
            'date_of_birth' => optional($application->date_of_birth)?->toDateString(),
            'place_of_birth' => $application->place_of_birth,
            'civil_status' => $application->civil_status,
            'height_cm' => $application->height_cm,
            'weight_kg' => $application->weight_kg,
            'citizenship' => $application->citizenship,
            'religion' => $application->religion,
            'blood_type' => $application->blood_type,
            'region' => $application->region,
            'hobbies' => $application->hobbies,
            'special_skills' => $application->special_skills,
            'batch' => $application->batch?->name,
            'induction_date' => null,
            'membership_status' => 'applicant',
            'applicant_status' => $application->status,
            'current_stage' => $application->current_stage,
            'current_stage_label' => $this->fiveIStageLabel($application->current_stage),
            'email_verified' => $application->email_verified_at !== null,
            'password_set' => !empty($application->user?->password),
            'current_club_positions' => [],
            'formal_photo' => $application->user?->formalPhoto?->toMetadataArray(true),
        ];
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

    private function canRecoverPendingVerificationApplicant(Applicant $applicant): bool
    {
        return $applicant->status === Applicant::STATUS_PENDING_VERIFICATION
            && $applicant->email_verified_at === null
            && $applicant->reviewed_at === null
            && $applicant->member_id === null;
    }

    private function purgeApplicantRecord(Applicant $applicant, bool $purgeLinkedRegistrations = true): void
    {
        $applicant->loadMissing(['documents', 'feeRequirements.payments', 'user.role:id,name']);

        DB::transaction(function () use ($applicant, $purgeLinkedRegistrations): void {
            $normalizedEmail = $this->normalizeEmail((string) $applicant->email);
            $linkedUser = $applicant->user;

            foreach ($applicant->documents as $document) {
                $disk = $this->resolveDocumentDisk($document);
                if (Storage::disk($disk)->exists($document->file_path)) {
                    Storage::disk($disk)->delete($document->file_path);
                }
            }

            ApplicantNotice::query()->where('applicant_id', $applicant->id)->delete();
            ApplicantDocument::query()->where('applicant_id', $applicant->id)->delete();

            $requirementIds = ApplicantFeeRequirement::query()
                ->where('applicant_id', $applicant->id)
                ->pluck('id');

            if ($requirementIds->isNotEmpty()) {
                ApplicantFeePayment::query()
                    ->whereIn('applicant_fee_requirement_id', $requirementIds)
                    ->delete();
            }

            ApplicantFeeRequirement::query()->where('applicant_id', $applicant->id)->delete();

            if ($purgeLinkedRegistrations) {
                MemberRegistration::query()
                    ->where(function ($query) use ($linkedUser, $normalizedEmail): void {
                        if ($linkedUser) {
                            $query->where('user_id', $linkedUser->id);
                        }

                        if ($normalizedEmail !== '') {
                            $method = $linkedUser ? 'orWhereRaw' : 'whereRaw';
                            $query->{$method}('LOWER(TRIM(email)) = ?', [$normalizedEmail]);
                        }
                    })
                    ->whereNull('member_id')
                    ->delete();
            }

            $applicant->delete();

            if ($linkedUser
                && (string) optional($linkedUser->role)->name === 'applicant'
                && !Applicant::query()->where('user_id', $linkedUser->id)->exists()
                && !Member::query()->where('user_id', $linkedUser->id)->exists()
                && !MemberRegistration::query()->where('user_id', $linkedUser->id)->exists()
            ) {
                $linkedUser->delete();
            }
        });
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

    private function lifecycleTimeline(Applicant $application): array
    {
        $timeline = [
            [
                'event' => 'submitted',
                'label' => 'Application Submitted',
                'occurred_at' => optional($application->created_at)?->toISOString(),
            ],
        ];

        if ($application->email_verified_at) {
            $timeline[] = [
                'event' => 'email_verified',
                'label' => 'Email Verified',
                'occurred_at' => $application->email_verified_at?->toISOString(),
            ];
        }

        if ($application->reviewed_at && $application->decision_status === 'approved') {
            $timeline[] = [
                'event' => 'official_applicant',
                'label' => 'Applicant Approved For Official Applicant Workflow',
                'occurred_at' => $application->reviewed_at?->toISOString(),
            ];
        } elseif ($application->reviewed_at && $application->decision_status === 'rejected') {
            $timeline[] = [
                'event' => 'rejected',
                'label' => 'Application Rejected',
                'occurred_at' => $application->reviewed_at?->toISOString(),
            ];
        } elseif ($application->reviewed_at && $application->decision_status === 'withdrawn') {
            $timeline[] = [
                'event' => 'withdrawn',
                'label' => 'Application Withdrawn',
                'occurred_at' => $application->reviewed_at?->toISOString(),
            ];
        } elseif ($application->reviewed_at && $application->decision_status === 'probation') {
            $timeline[] = [
                'event' => 'probation',
                'label' => 'Application Moved To Probation',
                'occurred_at' => $application->reviewed_at?->toISOString(),
            ];
        }

        if ($application->status === Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION) {
            $timeline[] = [
                'event' => 'eligible_for_activation',
                'label' => 'Eligible For Member Activation',
                'occurred_at' => $application->reviewed_at?->toISOString(),
            ];
        }

        if ($application->member && $application->member_id) {
            $timeline[] = [
                'event' => 'member_activated',
                'label' => 'Activated As Member',
                'occurred_at' => optional($application->activated_at)?->toISOString() ?? optional($application->member->created_at)?->toISOString(),
            ];
        }

        return $timeline;
    }

    private function applicantPayload(Applicant $application, bool $includeInternalNotices = false): array
    {
        $application->loadMissing([
            'reviewer:id,name',
            'activatedBy:id,name',
            'notices.createdBy:id,name',
            'documents.reviewedBy:id,name',
            'feeRequirements.setBy:id,name',
            'feeRequirements.payments.encodedBy:id,name',
            'member:id,created_at',
            'batch.batchTreasurer:id,name,email',
            'batch.documents.uploadedBy:id,name',
        ]);

        $requiredAmount = 0.0;
        $paidAmount = 0.0;
        $categoryLabels = $this->applicantContributionCategoryLabels();

        $feeRequirements = collect($categoryLabels)->map(function (string $label, string $category) use ($application, &$requiredAmount, &$paidAmount) {
            $requirement = $this->resolveCategoryRequirement($application, $category);
            $targetAmount = $requirement ? (float) $requirement->required_amount : 0.0;
            $requiredAmount += $targetAmount;

            $payments = ($requirement?->payments ?? collect())->map(function (ApplicantFeePayment $payment) use (&$paidAmount) {
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
            'member_id' => $application->member_id,
            'full_name' => trim($application->first_name . ' ' . ($application->middle_name ? $application->middle_name . ' ' : '') . $application->last_name),
            'email' => $application->email,
            'first_name' => $application->first_name,
            'nickname' => $application->nickname,
            'middle_name' => $application->middle_name,
            'last_name' => $application->last_name,
            'spouse_name' => $application->spouse_name,
            'contact_number' => $application->contact_number,
            'telephone_number' => $application->telephone_number,
            'emergency_contact_number' => $application->emergency_contact_number,
            'address' => $application->address,
            'address_line' => $application->address_line,
            'street_no' => $application->street_no,
            'barangay' => $application->barangay,
            'city_municipality' => $application->city_municipality,
            'province' => $application->province,
            'zip_code' => $application->zip_code,
            'date_of_birth' => optional($application->date_of_birth)?->toDateString(),
            'place_of_birth' => $application->place_of_birth,
            'civil_status' => $application->civil_status,
            'height_cm' => $application->height_cm,
            'weight_kg' => $application->weight_kg,
            'citizenship' => $application->citizenship,
            'religion' => $application->religion,
            'blood_type' => $application->blood_type,
            'region' => $application->region,
            'hobbies' => $application->hobbies,
            'special_skills' => $application->special_skills,
            'status' => $application->status,
            'decision_status' => $application->decision_status,
            'current_stage' => $application->current_stage,
            'current_stage_label' => $this->fiveIStageLabel($application->current_stage),
            'is_login_blocked' => $application->is_login_blocked,
            'withdrawn_at' => optional($application->withdrawn_at)?->toISOString(),
            'document_reuse_until' => optional($application->document_reuse_until)?->toISOString(),
            'rejoined_from_application_id' => $application->rejoined_from_application_id,
            'document_reuse_policy' => [
                'grace_months' => self::DOCUMENT_REUSE_GRACE_MONTHS,
                'eligible' => $this->canReuseWithdrawnDocuments($application),
                'rule_summary' => 'Membership chairman may reopen a withdrawn applicant within 3 months and reuse the prior documents. Prior contribution payments remain on the old withdrawn record and are not credited to the new batch.',
            ],
            'activation_eligible' => $this->determineActivationEligibility($application)['eligible'],
            'activation_readiness' => $this->determineActivationEligibility($application),
            'reviewer' => $application->reviewer ? ['id' => $application->reviewer->id, 'name' => $application->reviewer->name] : null,
            'activated_by' => $application->activatedBy ? ['id' => $application->activatedBy->id, 'name' => $application->activatedBy->name] : null,
            'timeline' => $this->lifecycleTimeline($application),
            'batch' => $application->batch ? [
                'id' => $application->batch->id,
                'name' => $application->batch->name,
                'description' => $application->batch->description,
                'start_date' => optional($application->batch->start_date)?->toDateString(),
                'target_completion_date' => optional($application->batch->target_completion_date)?->toDateString(),
                'batch_treasurer' => $application->batch->batchTreasurer ? [
                    'id' => $application->batch->batchTreasurer->id,
                    'name' => $application->batch->batchTreasurer->name,
                    'email' => $application->batch->batchTreasurer->email,
                ] : null,
                'documents' => $application->batch->documents
                    ->sortByDesc('id')
                    ->values()
                    ->map(fn (ApplicantBatchDocument $doc) => [
                        'id' => $doc->id,
                        'original_name' => $doc->original_name,
                        'uploaded_by' => $doc->uploadedBy ? ['id' => $doc->uploadedBy->id, 'name' => $doc->uploadedBy->name] : null,
                        'created_at' => optional($doc->created_at)?->toISOString(),
                    ]),
            ] : null,
            'notices' => $application->notices
                ->filter(fn (ApplicantNotice $notice) => $includeInternalNotices || $notice->visibility === 'applicant')
                ->sortByDesc('id')
                ->values()
                ->map(fn (ApplicantNotice $notice) => [
                    'id' => $notice->id,
                    'notice_text' => $notice->notice_text,
                    'visibility' => $notice->visibility,
                    'created_at' => optional($notice->created_at)?->toISOString(),
                    'created_by' => $notice->createdBy ? ['id' => $notice->createdBy->id, 'name' => $notice->createdBy->name] : null,
                ]),
            'documents' => $application->documents
                ->sortByDesc('id')
                ->values()
                ->map(fn (ApplicantDocument $doc) => [
                    'id' => $doc->id,
                    'original_name' => $doc->original_name,
                    'document_label' => $doc->document_label,
                    'description' => $doc->description,
                    'view_url' => "/api/v1/applicants/documents/{$doc->id}/view",
                    'reused_from_document_id' => $doc->reused_from_document_id,
                    'reused_under_grace_period' => (bool) $doc->reused_under_grace_period,
                    'reused_at' => optional($doc->reused_at)?->toISOString(),
                    'status' => $doc->status,
                    'review_note' => $doc->review_note,
                    'created_at' => optional($doc->created_at)?->toISOString(),
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

    private function determineActivationEligibility(Applicant $application): array
    {
        $application->loadMissing([
            'documents',
            'feeRequirements.payments',
        ]);

        $stageReady = $application->current_stage === 'induction';
        $documentsCount = $application->documents->count();
        $documentsApproved = $documentsCount > 0
            && $application->documents->every(fn (ApplicantDocument $document) => $document->status === 'approved');

        $requirements = $application->feeRequirements;
        $requirementsCount = $requirements->count();
        $paymentsSatisfied = $requirementsCount > 0
            && $requirements->every(function (ApplicantFeeRequirement $requirement): bool {
                $paid = (float) $requirement->payments->sum('amount');
                return $paid >= (float) $requirement->required_amount;
            });

        $approved = $application->decision_status === 'approved';
        $noMemberLinked = $application->member_id === null;
        $eligible = $approved && $noMemberLinked && $stageReady && $documentsApproved && $paymentsSatisfied;

        return [
            'eligible' => $eligible,
            'checks' => [
                'approved_for_official_applicant' => $approved,
                'stage_induction_complete' => $stageReady,
                'documents_fully_approved' => $documentsApproved,
                'requirements_fully_paid' => $paymentsSatisfied,
                'member_not_yet_activated' => $noMemberLinked,
            ],
        ];
    }

    private function syncOfficialApplicantStatus(Applicant $application): void
    {
        if ($application->decision_status !== 'approved' || $application->member_id !== null) {
            return;
        }

        $readiness = $this->determineActivationEligibility($application);
        $targetStatus = $readiness['eligible']
            ? Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION
            : Applicant::STATUS_OFFICIAL_APPLICANT;

        if ($application->status !== $targetStatus) {
            $application->status = $targetStatus;
            $application->save();
        }
    }

    private function isBatchTreasurer(User $user, Applicant $application): bool
    {
        $application->loadMissing('batch');

        return $application->batch !== null
            && (int) $application->batch->batch_treasurer_user_id === (int) $user->id;
    }

    private function canReviewApplication(User $user, Applicant $application): bool
    {
        return $user->hasPermission(Permissions::APPLICATIONS_REVIEW)
            || $this->isBatchTreasurer($user, $application);
    }

    private function canViewApplicationQueue(User $user): bool
    {
        return $user->hasPermission(Permissions::APPLICATIONS_VIEW)
            || $user->hasPermission(Permissions::APPLICATIONS_REVIEW)
            || ApplicantBatch::query()
                ->where('batch_treasurer_user_id', $user->id)
                ->exists();
    }

    private function canViewApplication(User $user, Applicant $application): bool
    {
        return $user->hasPermission(Permissions::APPLICATIONS_DOCS_VIEW)
            || $this->canReviewApplication($user, $application);
    }

    private function applicantListQueryFor(User $user): Builder
    {
        $query = Applicant::query()
            ->with('reviewer:id,name')
            ->with('batch:id,name,batch_treasurer_user_id')
            ->withCount([
                'documents as approved_documents_count' => fn ($q) => $q->where('status', 'approved'),
                'documents as pending_documents_count' => fn ($q) => $q->where('status', 'pending'),
            ]);

        if ($this->canViewApplicationQueue($user)) {
            return $query;
        }

        return $query->whereHas('batch', function (Builder $batchQuery) use ($user): void {
            $batchQuery->where('batch_treasurer_user_id', $user->id);
        });
    }

    private function canReuseWithdrawnDocuments(Applicant $application): bool
    {
        return $application->status === Applicant::STATUS_WITHDRAWN
            && $application->document_reuse_until !== null
            && $application->document_reuse_until->isFuture();
    }

    private function copyWithdrawnDocumentsForRejoin(Applicant $source, Applicant $target): void
    {
        $source->loadMissing('documents');

        foreach ($source->documents as $document) {
            $disk = $this->resolveDocumentDisk($document);
            $sourcePath = $document->file_path;
            $targetPath = $sourcePath;

            if (Storage::disk($disk)->exists($sourcePath)) {
                $extension = pathinfo($sourcePath, PATHINFO_EXTENSION);
                $targetPath = 'application-docs/' . Str::uuid() . ($extension !== '' ? '.' . strtolower($extension) : '');
                Storage::disk($disk)->copy($sourcePath, $targetPath);
            }

            ApplicantDocument::query()->create([
                'applicant_id' => $target->id,
                'reused_from_document_id' => $document->id,
                'file_path' => $targetPath,
                'original_name' => $document->original_name,
                'document_label' => $document->document_label,
                'description' => $document->description,
                'reused_under_grace_period' => true,
                'reused_at' => now(),
                'status' => $document->status,
                'review_note' => $document->review_note,
                'reviewed_by_user_id' => $document->reviewed_by_user_id,
                'reviewed_at' => $document->reviewed_at,
            ]);
        }
    }

    public function submit(Request $request)
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'last_name' => ['required', 'string', 'min:2', 'max:120', 'regex:/^(?=.*[A-Za-z])[A-Za-z\s\'\-]+$/'],
            'email' => 'required|email|max:255',
            'password' => 'required|string|min:8|confirmed',
            'membership_status' => 'nullable|in:applicant',
            'oauth_provider' => 'nullable|in:google',
            'oauth_claim_token' => 'nullable|string',
        ]);

        $normalizedEmail = $this->normalizeEmail($validated['email']);
        $googleClaim = $this->consumeGoogleClaim($request, $normalizedEmail);
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

        $existingMemberRegistration = MemberRegistration::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->first();
        if ($existingMemberRegistration) {
            return response()->json([
                'message' => 'This email is already in use by the member registration flow.',
            ], 422);
        }

        $existingApplicationByName = $this->applyPersonMatch(
            Applicant::query(),
            $normalizedFirstName,
            $normalizedMiddleName,
            $normalizedLastName
        )->whereIn('status', Applicant::OPEN_STATUSES)
            ->first();
        if ($existingApplicationByName) {
            return response()->json(
                $this->duplicateIdentityGuidance('An application with the same full name is already on file.'),
                422
            );
        }

        $existingApplicationByEmail = Applicant::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->whereIn('status', Applicant::OPEN_STATUSES)
            ->first();
        if ($existingApplicationByEmail) {
            return response()->json(
                $this->duplicateIdentityGuidance('An application already exists for this email.'),
                422
            );
        }

        [, $application] = $this->createApplicantAccountAndApplication(
            $normalizedEmail,
            $normalizedFirstName,
            $normalizedMiddleName,
            $normalizedLastName,
            (string) $validated['password'],
            $googleClaim !== null
        );

        return response()->json([
            'message' => $googleClaim
                ? 'Google verified your email. Your application is now under review.'
                : 'Application submitted. Verify your email to continue to review.',
            'application_id' => $application->id,
        ], 201);
    }

    public function reapply(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:255',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $normalizedEmail = $this->normalizeEmail($validated['email']);

        $archivedApplication = Applicant::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->whereIn('status', Applicant::ARCHIVED_STATUSES)
            ->latest('id')
            ->first();

        if (!$archivedApplication) {
            return response()->json([
                'message' => 'No archived application eligible for reapplication was found for this email.',
            ], 422);
        }

        $openOrApprovedApplication = Applicant::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->whereIn('status', Applicant::OPEN_STATUSES)
            ->exists();

        if ($openOrApprovedApplication) {
            return response()->json([
                'message' => 'An open or approved application already exists for this email.',
            ], 422);
        }

        $existingMemberByEmail = Member::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->exists();

        if ($existingMemberByEmail) {
            return response()->json(
                $this->duplicateIdentityGuidance('This email is already linked to an existing member record.'),
                422
            );
        }

        [, $application] = $this->createApplicantAccountAndApplication(
            $normalizedEmail,
            (string) $archivedApplication->first_name,
            (string) $archivedApplication->middle_name,
            (string) $archivedApplication->last_name,
            (string) $validated['password']
        );

        Log::info('application.reapplied', [
            'previous_application_id' => $archivedApplication->id,
            'new_application_id' => $application->id,
            'email' => $normalizedEmail,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Reapplication started. Verify your email to continue to review.',
            'application_id' => $application->id,
        ], 201);
    }

    public function verify(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:255',
            'verification_token' => VerificationToken::validationRules(),
        ]);

        $normalizedEmail = $this->normalizeEmail($validated['email']);
        $normalizedToken = VerificationToken::normalize((string) $validated['verification_token']);

        $application = Applicant::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->where('verification_token', hash('sha256', $normalizedToken))
            ->where('status', 'pending_verification')
            ->first();

        if (!$application) {
            return response()->json([
                'message' => 'Invalid verification details or application already verified.',
            ], 422);
        }

        $application->email_verified_at = now();
        $application->status = Applicant::STATUS_UNDER_REVIEW;
        $application->decision_status = 'pending';
        $application->save();

        return response()->json([
            'message' => 'Email verified. Your application is now under review.',
        ]);
    }

    public function index(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        if (!$this->canViewApplicationQueue($user)) {
            abort(403);
        }

        $status = (string) $request->query('status', Applicant::STATUS_UNDER_REVIEW);
        $search = trim((string) $request->query('search', ''));
        $allowed = [
            Applicant::STATUS_PENDING_VERIFICATION,
            Applicant::STATUS_UNDER_REVIEW,
            Applicant::STATUS_OFFICIAL_APPLICANT,
            Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION,
            Applicant::STATUS_ACTIVATED,
            Applicant::STATUS_REJECTED,
            Applicant::STATUS_WITHDRAWN,
            'all',
        ];
        if (!in_array($status, $allowed, true)) {
            $status = Applicant::STATUS_UNDER_REVIEW;
        }

        $query = $this->applicantListQueryFor($user);

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        if ($search !== '') {
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhereHas('batch', function ($batchQuery) use ($search): void {
                        $batchQuery->where('name', 'like', "%{$search}%");
                    });
            });
        }

        return response()->json($query->latest('id')->paginate(20));
    }

    public function myApplication(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        $application = $this->resolveOwnedApplication($user);

        if (!$application || !in_array($application->status, Applicant::OPEN_STATUSES, true)) {
            return response()->json(['message' => 'No application found for this account.'], 404);
        }

        return response()->json($this->applicantPayload($application));
    }

    public function myProfile(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        $application = $this->resolveOwnedApplication($user);

        if (!$application || !in_array($application->status, Applicant::OPEN_STATUSES, true)) {
            return response()->json(['message' => 'No application found for this account.'], 404);
        }

        return response()->json($this->applicantProfilePayload($application));
    }

    public function updateMyProfile(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        $application = $this->resolveOwnedApplication($user);

        if (!$application || !in_array($application->status, Applicant::OPEN_STATUSES, true)) {
            return response()->json(['message' => 'No application found for this account.'], 404);
        }

        $validated = $request->validate($this->applicantProfileRules());
        $profileData = $this->normalizeApplicantProfilePayload($validated);

        DB::transaction(function () use ($application, $profileData): void {
            $application->fill($profileData);
            $application->save();
        });

        return response()->json([
            'message' => 'Profile updated successfully.',
            'member' => $this->applicantProfilePayload($application->fresh()),
        ]);
    }

    public function myArchive(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        $application = $this->resolveOwnedApplication($user);

        if (!$application || !in_array($application->status, Applicant::ARCHIVED_STATUSES, true)) {
            return response()->json(['message' => 'No archived application found for this account.'], 404);
        }

        return response()->json($this->applicantPayload($application));
    }

    public function show(Request $request, Applicant $applicant)
    {
        /** @var User $user */
        $user = $request->user();

        if (!$this->canViewApplication($user, $applicant)) {
            abort(403);
        }

        $includeInternal = $user->hasPermission(Permissions::APPLICATIONS_REVIEW);

        return response()->json($this->applicantPayload($applicant, $includeInternal));
    }

    public function uploadDocument(Request $request, Applicant $applicant)
    {
        $this->authorize('uploadDocument', $applicant);

        $validated = $request->validate([
            'document' => 'required|file|mimes:jpg,jpeg,png,webp,pdf|max:10240',
            'document_label' => 'required|string|max:120',
            'description' => 'required|string|max:255',
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

        $document = ApplicantDocument::query()->create([
            'applicant_id' => $applicant->id,
            'file_path' => $path,
            'original_name' => $uploadedFile->getClientOriginalName(),
            'document_label' => trim((string) $validated['document_label']),
            'description' => trim((string) $validated['description']),
            'status' => 'pending',
        ]);

        return response()->json(['message' => 'Document uploaded and pending review.', 'document' => $document], 201);
    }

    public function reviewDocument(Request $request, ApplicantDocument $document)
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
        $this->syncOfficialApplicantStatus($document->applicant);

        Log::info('application.document_reviewed', [
            'actor_user_id' => $request->user()->id,
            'document_id' => $document->id,
            'application_id' => $document->applicant_id,
            'status' => $document->status,
            'ip' => $request->ip(),
        ]);

        return response()->json(['message' => 'Document review updated.', 'document' => $document->fresh()]);
    }

    public function viewDocument(Request $request, ApplicantDocument $document)
    {
        $this->authorize('view', $document);

        $disk = $this->resolveDocumentDisk($document);
        if (!Storage::disk($disk)->exists($document->file_path)) {
            abort(404, 'Document file not found.');
        }

        $path = Storage::disk($disk)->path($document->file_path);

        return response()->file($path, [
            'Content-Disposition' => 'inline; filename="' . addslashes($document->original_name) . '"',
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    public function setStage(Request $request, Applicant $applicant)
    {
        $this->authorize('setStage', $applicant);

        $validated = $request->validate([
            'current_stage' => 'required|in:interview,introduction,indoctrination_initiation,incubation,induction',
        ]);

        $applicant->current_stage = $validated['current_stage'];
        $applicant->save();
        $this->syncOfficialApplicantStatus($applicant);

        Log::info('application.stage_updated', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
            'current_stage' => $applicant->current_stage,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Applicant stage updated.',
            'application' => $applicant->fresh(),
        ]);
    }

    public function setNotice(Request $request, Applicant $applicant)
    {
        $this->authorize('setNotice', $applicant);

        $validated = $request->validate([
            'notice_text' => 'required|string|min:3|max:3000',
            'visibility' => 'nullable|in:applicant,internal',
        ]);

        $notice = ApplicantNotice::query()->create([
            'applicant_id' => $applicant->id,
            'notice_text' => trim($validated['notice_text']),
            'visibility' => $validated['visibility'] ?? 'applicant',
            'created_by_user_id' => $request->user()->id,
        ]);

        Log::info('application.notice_set', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
            'notice_id' => $notice->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => $notice->visibility === 'internal'
                ? 'Internal committee note saved.'
                : 'Notice posted for applicant.',
            'notice' => $notice->fresh(),
        ], 201);
    }

    public function setFeeRequirement(Request $request, Applicant $applicant)
    {
        $this->authorize('setFeeRequirement', $applicant);

        $validated = $request->validate([
            'category' => 'required|in:project,community_service,fellowship,five_i_activities',
            'required_amount' => 'required|numeric|min:0.01',
            'note' => 'nullable|string|max:255',
        ]);

        $requirement = ApplicantFeeRequirement::query()->updateOrCreate(
            [
                'applicant_id' => $applicant->id,
                'category' => $validated['category'],
            ],
            [
            'applicant_id' => $applicant->id,
            'category' => $validated['category'],
            'required_amount' => $validated['required_amount'],
            'note' => $validated['note'] ?? null,
            'set_by_user_id' => $request->user()->id,
            ]
        );
        $this->syncOfficialApplicantStatus($applicant);

        Log::info('application.fee_requirement_set', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
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

    public function addFeePayment(Request $request, ApplicantFeeRequirement $applicantFeeRequirement)
    {
        $this->authorize('recordFeePayment', $applicantFeeRequirement->applicant);

        $validated = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'nullable|date',
            'note' => 'nullable|string|max:255',
        ]);

        $payment = ApplicantFeePayment::query()->create([
            'applicant_fee_requirement_id' => $applicantFeeRequirement->id,
            'amount' => $validated['amount'],
            'payment_date' => $validated['payment_date'] ?? now()->toDateString(),
            'note' => $validated['note'] ?? null,
            'encoded_by_user_id' => $request->user()->id,
        ]);
        $this->syncOfficialApplicantStatus($applicantFeeRequirement->applicant);

        Log::info('application.fee_payment_recorded', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicantFeeRequirement->applicant_id,
            'requirement_id' => $applicantFeeRequirement->id,
            'payment_id' => $payment->id,
            'amount' => $payment->amount,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Applicant fee payment recorded.',
            'payment' => $payment->fresh(),
        ], 201);
    }

    public function addCategoryFeePayment(Request $request, Applicant $applicant)
    {
        $this->authorize('recordFeePayment', $applicant);

        $validated = $request->validate([
            'category' => 'required|in:project,community_service,fellowship,five_i_activities',
            'amount' => 'required|numeric|min:0.01',
            'payment_date' => 'nullable|date',
            'note' => 'nullable|string|max:255',
        ]);

        $requirement = ApplicantFeeRequirement::query()
            ->where('applicant_id', $applicant->id)
            ->where('category', $validated['category'])
            ->first();

        if (!$requirement) {
            return response()->json([
                'message' => 'Set target payment for this category before encoding a partial/full payment.',
            ], 422);
        }

        $payment = ApplicantFeePayment::query()->create([
            'applicant_fee_requirement_id' => $requirement->id,
            'amount' => $validated['amount'],
            'payment_date' => $validated['payment_date'] ?? now()->toDateString(),
            'note' => $validated['note'] ?? null,
            'encoded_by_user_id' => $request->user()->id,
        ]);
        $this->syncOfficialApplicantStatus($applicant);

        Log::info('application.fee_payment_recorded', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
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

    public function approve(Request $request, Applicant $applicant)
    {
        $this->authorize('reviewDecision', $applicant);

        if ($applicant->status !== 'under_review' || !$applicant->email_verified_at) {
            return response()->json([
                'message' => 'Only verified applications under review can be approved.',
            ], 422);
        }

        $applicant->status = Applicant::STATUS_OFFICIAL_APPLICANT;
        $applicant->decision_status = 'approved';
        $applicant->member_id = null;
        $applicant->is_login_blocked = false;
        $applicant->reviewed_by_user_id = $request->user()->id;
        $applicant->reviewed_at = now();
        $applicant->rejection_reason = null;
        $applicant->save();
        $this->syncOfficialApplicantStatus($applicant);

        Log::info('application.approved', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
            'outcome' => 'official_applicant',
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Application approved. The applicant is now an official applicant and continues through the 5I and requirement workflow.',
            'application' => $applicant->fresh(),
        ]);
    }

    public function withdraw(Request $request)
    {
        /** @var User $user */
        $user = $request->user();

        $applicant = $this->resolveOwnedApplication($user);

        if (!$applicant) {
            return response()->json(['message' => 'No application found for this account.'], 404);
        }

        if (!in_array($applicant->status, [
            Applicant::STATUS_PENDING_VERIFICATION,
            Applicant::STATUS_UNDER_REVIEW,
            Applicant::STATUS_OFFICIAL_APPLICANT,
            Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION,
        ], true)) {
            return response()->json([
                'message' => 'Only open membership applications can be withdrawn.',
            ], 422);
        }

        $applicant->status = Applicant::STATUS_WITHDRAWN;
        $applicant->decision_status = 'withdrawn';
        $applicant->is_login_blocked = true;
        $applicant->reviewed_at = now();
        $applicant->withdrawn_at = now();
        $applicant->document_reuse_until = now()->addMonthsNoOverflow(self::DOCUMENT_REUSE_GRACE_MONTHS);
        $applicant->save();

        Log::info('application.withdrawn', [
            'actor_user_id' => $user->id,
            'application_id' => $applicant->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Application withdrawn. The record is preserved as archive history, and the membership chairman may reuse your documents for 3 months if you rejoin. Prior contribution payments remain on the withdrawn record and do not transfer to a new batch.',
            'application' => $applicant->fresh(),
        ]);
    }

    public function rejoin(Request $request, Applicant $applicant)
    {
        $this->authorize('rejoin', $applicant);

        if ($applicant->status !== Applicant::STATUS_WITHDRAWN) {
            return response()->json([
                'message' => 'Only withdrawn applicants can be rejoined through the chairman workflow.',
            ], 422);
        }

        if (!$this->canReuseWithdrawnDocuments($applicant)) {
            return response()->json([
                'message' => 'The 3-month document reuse grace period has ended. The applicant must restart with fresh document submission.',
            ], 422);
        }

        $openApplicationExists = Applicant::query()
            ->where('id', '!=', $applicant->id)
            ->where(function (Builder $query) use ($applicant): void {
                $query->where('user_id', $applicant->user_id)
                    ->orWhereRaw('LOWER(TRIM(email)) = ?', [$this->normalizeEmail((string) $applicant->email)]);
            })
            ->whereIn('status', Applicant::OPEN_STATUSES)
            ->exists();

        if ($openApplicationExists) {
            return response()->json([
                'message' => 'An open application already exists for this applicant. Close or use that active record instead.',
            ], 422);
        }

        $newApplication = DB::transaction(function () use ($applicant, $request): Applicant {
            $newApplication = Applicant::query()->create([
                'user_id' => $applicant->user_id,
                'batch_id' => null,
                'rejoined_from_application_id' => $applicant->id,
                'first_name' => $applicant->first_name,
                'middle_name' => $applicant->middle_name,
                'last_name' => $applicant->last_name,
                'email' => $applicant->email,
                'membership_status' => $applicant->membership_status,
                'status' => Applicant::STATUS_OFFICIAL_APPLICANT,
                'decision_status' => 'approved',
                'current_stage' => $applicant->current_stage ?: 'interview',
                'is_login_blocked' => false,
                'verification_token' => hash('sha256', VerificationToken::generate()),
                'email_verified_at' => $applicant->email_verified_at ?? now(),
                'reviewed_by_user_id' => $request->user()->id,
                'reviewed_at' => now(),
                'withdrawn_at' => null,
                'document_reuse_until' => null,
                'rejection_reason' => null,
            ]);

            $this->copyWithdrawnDocumentsForRejoin($applicant, $newApplication);

            ApplicantNotice::query()->create([
                'applicant_id' => $newApplication->id,
                'notice_text' => 'Chairman-only rejoin workflow: documents were reused from withdrawn application #' . $applicant->id . ' within the 3-month grace period. Prior contribution payments remain on the withdrawn record and are not credited to this rejoined application or to any new batch.',
                'visibility' => 'internal',
                'created_by_user_id' => $request->user()->id,
            ]);

            return $newApplication;
        });

        Log::info('application.rejoined_by_chairman', [
            'actor_user_id' => $request->user()->id,
            'previous_application_id' => $applicant->id,
            'new_application_id' => $newApplication->id,
            'reused_documents' => $newApplication->documents()->count(),
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Withdrawn applicant rejoined. Prior documents were reused under the 3-month grace period. Previous contribution payments remain on the withdrawn record and are not credited to the new batch.',
            'application' => $this->applicantPayload($newApplication->fresh(), true),
        ], 201);
    }

    public function setProbation(Request $request, Applicant $applicant)
    {
        $this->authorize('reviewDecision', $applicant);

        if (!in_array($applicant->status, [Applicant::STATUS_PENDING_VERIFICATION, Applicant::STATUS_UNDER_REVIEW], true)) {
            return response()->json([
                'message' => 'Only pending applications can be moved to probation.',
            ], 422);
        }

        $applicant->decision_status = 'probation';
        $applicant->status = 'under_review';
        $applicant->is_login_blocked = false;
        $applicant->reviewed_by_user_id = $request->user()->id;
        $applicant->reviewed_at = now();
        $applicant->save();

        Log::info('application.probation_set', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Application moved to probation.',
            'application' => $applicant->fresh(),
        ]);
    }

    public function reject(Request $request, Applicant $applicant)
    {
        $this->authorize('reviewDecision', $applicant);

        if (!in_array($applicant->status, [Applicant::STATUS_UNDER_REVIEW, Applicant::STATUS_PENDING_VERIFICATION], true)) {
            return response()->json([
                'message' => 'This application has already been reviewed.',
            ], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:255',
        ]);

        $applicant->status = Applicant::STATUS_REJECTED;
        $applicant->decision_status = 'rejected';
        $applicant->is_login_blocked = true;
        $applicant->reviewed_by_user_id = $request->user()->id;
        $applicant->reviewed_at = now();
        $applicant->rejection_reason = $validated['reason'] ?? null;
        $applicant->save();

        Log::info('application.rejected', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
            'reason' => $applicant->rejection_reason,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Application rejected. Record kept for historical/admin access.',
            'application' => $applicant->fresh(),
        ]);
    }

    public function destroy(Request $request, Applicant $applicant)
    {
        $this->authorize('delete', $applicant);

        if ($applicant->status === Applicant::STATUS_ACTIVATED || $applicant->member_id) {
            return response()->json([
                'message' => 'Activated applicants must be managed through the member workflow and cannot be deleted from the applicant queue.',
            ], 422);
        }

        $this->purgeApplicantRecord($applicant);

        Log::info('application.deleted', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
            'email' => $applicant->email,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Applicant deleted.',
        ]);
    }

    public function recoverPendingVerification(Request $request, Applicant $applicant)
    {
        $this->authorize('recoverPendingVerification', $applicant);

        if (!$this->canRecoverPendingVerificationApplicant($applicant)) {
            return response()->json([
                'message' => 'Only pending verification applicants with unreachable email tokens can be removed through this chairman recovery workflow.',
            ], 422);
        }

        $applicationId = $applicant->id;
        $normalizedEmail = $this->normalizeEmail((string) $applicant->email);
        $nameLabel = trim($applicant->first_name . ' ' . ($applicant->middle_name ? $applicant->middle_name . ' ' : '') . $applicant->last_name);

        $this->purgeApplicantRecord($applicant, false);

        Log::info('application.pending_verification_recovered', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicationId,
            'email' => $normalizedEmail,
            'name' => $nameLabel,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Pending verification applicant deleted. The person may register again using the correct email address.',
        ]);
    }

    public function createBatch(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|min:2|max:120|unique:applicant_batches,name',
            'description' => 'nullable|string|max:3000',
            'start_date' => 'nullable|date',
            'target_completion_date' => 'nullable|date|after_or_equal:start_date',
            'batch_treasurer_user_id' => 'nullable|integer|exists:users,id',
        ]);

        if (!empty($validated['batch_treasurer_user_id'])) {
            $isOfficialApplicant = Applicant::query()
                ->where('user_id', (int) $validated['batch_treasurer_user_id'])
                ->whereIn('status', [
                    Applicant::STATUS_OFFICIAL_APPLICANT,
                    Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION,
                ])
                ->exists();

            if (!$isOfficialApplicant) {
                return response()->json([
                    'message' => 'Batch treasurer must be selected from official applicants.',
                ], 422);
            }
        }

        $batch = ApplicantBatch::query()->create([
            'name' => trim((string) $validated['name']),
            'description' => isset($validated['description']) ? trim((string) $validated['description']) : null,
            'start_date' => $validated['start_date'] ?? null,
            'target_completion_date' => $validated['target_completion_date'] ?? null,
            'batch_treasurer_user_id' => $validated['batch_treasurer_user_id'] ?? null,
            'created_by_user_id' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Applicant batch created.',
            'batch' => $batch->load('batchTreasurer:id,name,email'),
        ], 201);
    }

    public function updateBatch(Request $request, ApplicantBatch $applicantBatch)
    {
        $validated = $request->validate([
            'name' => 'required|string|min:2|max:120|unique:applicant_batches,name,' . $applicantBatch->id,
            'description' => 'nullable|string|max:3000',
            'start_date' => 'nullable|date',
            'target_completion_date' => 'nullable|date|after_or_equal:start_date',
            'batch_treasurer_user_id' => 'nullable|integer|exists:users,id',
        ]);

        if (!empty($validated['batch_treasurer_user_id'])) {
            $isOfficialApplicant = Applicant::query()
                ->where('user_id', (int) $validated['batch_treasurer_user_id'])
                ->whereIn('status', [
                    Applicant::STATUS_OFFICIAL_APPLICANT,
                    Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION,
                ])
                ->exists();

            if (!$isOfficialApplicant) {
                return response()->json([
                    'message' => 'Batch treasurer must be selected from official applicants.',
                ], 422);
            }
        }

        $previousName = trim((string) $applicantBatch->name);

        DB::transaction(function () use ($applicantBatch, $validated, $request, $previousName): void {
            $applicantBatch->fill([
                'name' => trim((string) $validated['name']),
                'description' => isset($validated['description']) ? trim((string) $validated['description']) : null,
                'start_date' => $validated['start_date'] ?? null,
                'target_completion_date' => $validated['target_completion_date'] ?? null,
                'batch_treasurer_user_id' => $validated['batch_treasurer_user_id'] ?? null,
            ]);
            $applicantBatch->save();

            if (strcasecmp($previousName, $applicantBatch->name) !== 0) {
                Member::query()
                    ->whereRaw('LOWER(TRIM(batch)) = ?', [strtolower($previousName)])
                    ->update(['batch' => $applicantBatch->name]);
            }
        });

        return response()->json([
            'message' => 'Applicant batch updated.',
            'batch' => $applicantBatch->fresh()->load('batchTreasurer:id,name,email'),
        ]);
    }

    public function listBatches()
    {
        $memberCounts = Member::query()
            ->selectRaw('LOWER(TRIM(batch)) as batch_key, COUNT(*) as total')
            ->whereNotNull('batch')
            ->whereRaw('TRIM(batch) <> ""')
            ->groupBy('batch_key')
            ->pluck('total', 'batch_key');

        $batches = ApplicantBatch::query()
            ->with('batchTreasurer:id,name,email')
            ->withCount('applications')
            ->orderBy('name')
            ->get()
            ->map(fn (ApplicantBatch $batch) => [
                'id' => $batch->id,
                'name' => $batch->name,
                'description' => $batch->description,
                'start_date' => optional($batch->start_date)?->toDateString(),
                'target_completion_date' => optional($batch->target_completion_date)?->toDateString(),
                'applications_count' => $batch->applications_count,
                'members_count' => (int) ($memberCounts[strtolower(trim((string) $batch->name))] ?? 0),
                'batch_treasurer' => $batch->batchTreasurer ? [
                    'id' => $batch->batchTreasurer->id,
                    'name' => $batch->batchTreasurer->name,
                    'email' => $batch->batchTreasurer->email,
                ] : null,
            ]);

        return response()->json(['data' => $batches]);
    }

    public function batchTreasurerCandidates()
    {
        $rows = Applicant::query()
            ->with('user:id,name,email')
            ->whereIn('status', [
                Applicant::STATUS_OFFICIAL_APPLICANT,
                Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION,
            ])
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get()
            ->map(fn (Applicant $application) => [
                'application_id' => $application->id,
                'user_id' => $application->user_id,
                'full_name' => trim($application->first_name . ' ' . ($application->middle_name ? $application->middle_name . ' ' : '') . $application->last_name),
                'email' => $application->email,
                'status' => $application->status,
            ]);

        return response()->json(['data' => $rows]);
    }

    public function assignBatch(Request $request, Applicant $applicant)
    {
        $this->authorize('reviewDecision', $applicant);

        if (!in_array($applicant->status, Applicant::OPEN_STATUSES, true)) {
            return response()->json([
                'message' => 'Only open applicant records can be assigned to a batch.',
            ], 422);
        }

        $validated = $request->validate([
            'batch_id' => 'required|integer|exists:applicant_batches,id',
        ]);

        $applicant->batch_id = (int) $validated['batch_id'];
        $applicant->save();
        $this->syncOfficialApplicantStatus($applicant);

        return response()->json([
            'message' => 'Applicant batch assigned.',
            'application' => $this->applicantPayload($applicant->fresh(), true),
        ]);
    }

    public function uploadBatchDocument(Request $request, ApplicantBatch $applicantBatch)
    {
        $validated = $request->validate([
            'document' => 'required|file|mimes:jpg,jpeg,png,webp,pdf|max:10240',
        ]);

        $uploadedFile = $request->file('document');
        $path = ImageUploadOptimizer::storeOptimizedOrOriginal(
            $uploadedFile,
            'applicant-batch-docs',
            'local',
            2000,
            2000,
            82,
            false
        );

        $document = ApplicantBatchDocument::query()->create([
            'applicant_batch_id' => $applicantBatch->id,
            'file_path' => $path,
            'original_name' => $uploadedFile->getClientOriginalName(),
            'uploaded_by_user_id' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Batch document uploaded.',
            'document' => $document->fresh(),
        ], 201);
    }

    public function viewBatchDocument(Request $request, ApplicantBatchDocument $document)
    {
        /** @var User $user */
        $user = $request->user();
        $document->loadMissing('batch');

        $canView = $user->hasPermission(Permissions::APPLICATIONS_DOCS_VIEW)
            || $user->hasPermission(Permissions::APPLICATIONS_REVIEW)
            || ((int) $document->batch?->batch_treasurer_user_id === (int) $user->id)
            || Applicant::query()
                ->ownedByUser($user)
                ->where('batch_id', $document->applicant_batch_id)
                ->whereIn('status', Applicant::OPEN_STATUSES)
                ->exists();

        if (!$canView) {
            abort(403);
        }

        if (!Storage::disk('local')->exists($document->file_path)) {
            abort(404, 'Document file not found.');
        }

        return Storage::disk('local')->response($document->file_path, $document->original_name);
    }

    public function activate(Request $request, Applicant $applicant)
    {
        $this->authorize('reviewDecision', $applicant);

        if ($applicant->status !== Applicant::STATUS_ELIGIBLE_FOR_ACTIVATION) {
            return response()->json([
                'message' => 'Only eligible official applicants can be activated as members.',
            ], 422);
        }

        $readiness = $this->determineActivationEligibility($applicant);
        if (!$readiness['eligible']) {
            $this->syncOfficialApplicantStatus($applicant);
            return response()->json([
                'message' => 'Applicant is not yet eligible for member activation.',
                'activation_readiness' => $readiness,
            ], 422);
        }

        $memberRole = Role::query()->where('name', 'member')->firstOrFail();

        DB::transaction(function () use ($applicant, $memberRole, $request): void {
            $user = $applicant->user()->firstOrFail();
            $user->role_id = $memberRole->id;
            $user->save();

            $member = Member::query()->create([
                'member_number' => $this->generateMemberNumber(),
                'first_name' => $applicant->first_name,
                'nickname' => $applicant->nickname,
                'middle_name' => $applicant->middle_name,
                'last_name' => $applicant->last_name,
                'spouse_name' => $applicant->spouse_name,
                'email' => $applicant->email,
                'email_verified' => $applicant->email_verified_at !== null,
                'password_set' => !empty($user->password),
                'membership_status' => 'active',
                'contact_number' => $applicant->contact_number,
                'telephone_number' => $applicant->telephone_number,
                'emergency_contact_number' => $applicant->emergency_contact_number,
                'address' => $applicant->address,
                'address_line' => $applicant->address_line,
                'street_no' => $applicant->street_no,
                'barangay' => $applicant->barangay,
                'city_municipality' => $applicant->city_municipality,
                'province' => $applicant->province,
                'zip_code' => $applicant->zip_code,
                'date_of_birth' => $applicant->date_of_birth,
                'place_of_birth' => $applicant->place_of_birth,
                'civil_status' => $applicant->civil_status,
                'height_cm' => $applicant->height_cm,
                'weight_kg' => $applicant->weight_kg,
                'citizenship' => $applicant->citizenship,
                'religion' => $applicant->religion,
                'blood_type' => $applicant->blood_type,
                'region' => $applicant->region,
                'hobbies' => $applicant->hobbies,
                'special_skills' => $applicant->special_skills,
                'batch' => $applicant->batch?->name,
                'user_id' => $user->id,
            ]);

            $applicant->member_id = $member->id;
            $applicant->status = Applicant::STATUS_ACTIVATED;
            $applicant->activated_at = now();
            $applicant->activated_by_user_id = $request->user()->id;
            $applicant->is_login_blocked = false;
            $applicant->save();
        });

        Log::info('application.activated', [
            'actor_user_id' => $request->user()->id,
            'application_id' => $applicant->id,
            'member_id' => $applicant->fresh()->member_id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Official applicant activated as member.',
            'application' => $this->applicantPayload($applicant->fresh(), true),
        ]);
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

    private function resolveDocumentDisk(ApplicantDocument $document): string
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
}
