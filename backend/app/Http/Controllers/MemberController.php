<?php

namespace App\Http\Controllers;

use App\Models\ApplicantBatch;
use App\Models\ClubPosition;
use App\Models\FormalPhoto;
use App\Models\Member;
use App\Models\MemberClubPosition;
use App\Models\MemberDependent;
use App\Models\MemberEducation;
use App\Models\MemberEmployment;
use App\Models\Applicant;
use App\Models\MemberRegistration;
use App\Models\MemberSponsorship;
use App\Models\User;
use App\Support\BootstrapSuperadminPrivacy;
use App\Support\Permissions;
use App\Support\RoleHierarchy;
use App\Support\TextCase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MemberController extends Controller
{
    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function bootstrapEmail(): string
    {
        return $this->normalizeEmail((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'));
    }

    private function emailImmutableMessage(): string
    {
        return 'Registration email is the canonical account identity and cannot be changed.';
    }

    private function baseMemberValidationRules(bool $allowAdminFlags = false): array
    {
        $clubPositionIdRule = ['nullable', 'integer'];
        if ($this->hasTable('club_positions')) {
            $clubPositionIdRule[] = 'exists:club_positions,id';
        }

        $rules = [
            'first_name' => 'required|string|max:120',
            'nickname' => 'nullable|string|max:120',
            'middle_name' => ['required', 'string', 'min:2', 'max:120', 'not_regex:/\./'],
            'last_name' => 'required|string|max:120',
            'spouse_name' => 'nullable|string|max:180',
            'contact_number' => 'nullable|string|max:50',
            'telephone_number' => 'nullable|string|max:50',
            'emergency_contact_number' => 'nullable|string|max:50',
            'address' => 'nullable|string|max:65535',
            'address_line' => 'nullable|string|max:255',
            'street_no' => 'nullable|string|max:120',
            'barangay' => 'nullable|string|max:120',
            'city_municipality' => 'nullable|string|max:120',
            'province' => 'nullable|string|max:120',
            'zip_code' => 'nullable|string|max:20',
            'date_of_birth' => 'nullable|date',
            'place_of_birth' => 'nullable|string|max:180',
            'civil_status' => 'nullable|string|max:50',
            'height_cm' => 'nullable|numeric|min:0|max:999.99',
            'weight_kg' => 'nullable|numeric|min:0|max:999.99',
            'citizenship' => 'nullable|string|max:120',
            'religion' => 'nullable|string|max:120',
            'blood_type' => 'nullable|string|max:20',
            'region' => 'nullable|string|max:120',
            'batch' => 'nullable|string|max:120',
            'induction_date' => 'nullable|date',
            'hobbies' => 'nullable|string|max:65535',
            'special_skills' => 'nullable|string|max:65535',
            'employments' => 'nullable|array',
            'employments.*.id' => 'nullable|integer',
            'employments.*.office_name' => 'nullable|string|max:180',
            'employments.*.line_of_business' => 'nullable|string|max:180',
            'employments.*.office_address' => 'nullable|string|max:255',
            'employments.*.job_title' => 'nullable|string|max:180',
            'employments.*.office_telephone' => 'nullable|string|max:50',
            'employments.*.office_fax' => 'nullable|string|max:50',
            'employments.*.is_current' => 'nullable|boolean',
            'dependents' => 'nullable|array',
            'dependents.*.id' => 'nullable|integer',
            'dependents.*.relationship' => 'required_with:dependents|string|in:spouse,child,dependent,other',
            'dependents.*.name' => 'required_with:dependents|string|max:180',
            'dependents.*.contact_number' => 'nullable|string|max:50',
            'dependents.*.age' => 'nullable|integer|min:0|max:150',
            'dependents.*.sort_order' => 'nullable|integer|min:0|max:999',
            'education_entries' => 'nullable|array',
            'education_entries.*.id' => 'nullable|integer',
            'education_entries.*.level' => 'required_with:education_entries|string|in:elementary,high_school,college,post_graduate,other',
            'education_entries.*.school_name' => 'nullable|string|max:180',
            'education_entries.*.date_graduated' => 'nullable|date',
            'education_entries.*.course' => 'nullable|string|max:180',
            'sponsorship' => 'nullable|array',
            'sponsorship.sponsor_member_id' => 'nullable|integer|exists:members,id',
            'sponsorship.sponsor_name' => 'nullable|string|max:180',
            'sponsorship.sponsor_date' => 'nullable|date',
            'sponsorship.sponsor_signature_name' => 'nullable|string|max:180',
            'sponsorship.applicant_signature_name' => 'nullable|string|max:180',
            'sponsorship.applicant_signed_at' => 'nullable|date',
            'club_positions' => 'nullable|array',
            'club_positions.*.id' => 'nullable|integer',
            'club_positions.*.club_position_id' => $clubPositionIdRule,
            'club_positions.*.position_name' => 'nullable|string|max:180',
            'club_positions.*.position_code' => 'nullable|string|max:80',
            'club_positions.*.eagle_year' => 'nullable|string|max:50',
            'club_positions.*.started_at' => 'nullable|date',
            'club_positions.*.ended_at' => 'nullable|date',
            'club_positions.*.is_current' => 'nullable|boolean',
        ];

        if ($allowAdminFlags) {
            $rules += [
                'member_number' => 'required|string|max:50',
                'email' => 'sometimes|nullable|email|max:255',
                'membership_status' => 'sometimes|required|in:active,inactive',
                'email_verified' => 'sometimes|boolean',
                'password_set' => 'sometimes|boolean',
            ];
        }

        return $rules;
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

        if ($parts === []) {
            return null;
        }

        return implode(', ', $parts);
    }

    private function normalizeMemberPayload(array $validated, bool $allowAdminFlags = false): array
    {
        $normalized = [
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
            'batch' => $this->titleOrNull($validated['batch'] ?? null),
            'induction_date' => $validated['induction_date'] ?? null,
            'hobbies' => $this->trimOrNull($validated['hobbies'] ?? null),
            'special_skills' => $this->trimOrNull($validated['special_skills'] ?? null),
        ];

        if ($allowAdminFlags) {
            $normalized['member_number'] = (string) TextCase::upper($validated['member_number']);
            $normalized['email'] = isset($validated['email']) && $validated['email'] !== ''
                ? $this->normalizeEmail((string) $validated['email'])
                : null;
        }

        return $normalized;
    }

    private function resolveActorMember(User $user): ?Member
    {
        $user->loadMissing('memberProfile', 'role:id,name');

        if ($user->memberProfile) {
            return $user->memberProfile;
        }

        $email = $this->normalizeEmail((string) $user->email);
        if ($email === '') {
            return null;
        }

        return Member::query()->where('email', $email)->first();
    }

    public function index(Request $request)
    {
        $this->authorize('viewMemberDirectory', Member::class);
        /** @var User $viewer */
        $viewer = $request->user()->loadMissing('role:id,name');

        $search = (string) $request->query('search', '');
        $status = (string) $request->query('status', '');
        $groupBy = (string) $request->query('group_by', '');
        $emailVerified = $request->query('email_verified');
        $passwordSet = $request->query('password_set');

        $query = Member::query();
        if (BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($viewer)) {
            $query->whereRaw('LOWER(TRIM(COALESCE(email, ""))) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
        }

        if (optional($viewer->role)->name !== RoleHierarchy::SUPERADMIN) {
            $query->where(function ($builder) {
                $builder->whereNull('user_id')
                    ->orWhereDoesntHave('user.role', function ($roleQuery) {
                        $roleQuery->where('name', RoleHierarchy::SUPERADMIN);
                    });
            });
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('member_number', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('middle_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('spouse_name', 'like', "%{$search}%")
                  ->orWhere('contact_number', 'like', "%{$search}%")
                  ->orWhere('batch', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%");
            });
        }

        if ($status !== '') {
            $query->where('membership_status', $status);
        }
        if ($emailVerified !== null && $emailVerified !== '') {
            $query->where('email_verified', filter_var($emailVerified, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false);
        }
        if ($passwordSet !== null && $passwordSet !== '') {
            $query->where('password_set', filter_var($passwordSet, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false);
        }

        if ($groupBy === 'batch') {
            $query
                ->orderByRaw("CASE WHEN batch IS NULL OR TRIM(batch) = '' THEN 1 ELSE 0 END")
                ->orderBy('batch')
                ->orderBy('last_name')
                ->orderBy('first_name');
        } else {
            $query->orderBy('last_name')->orderBy('first_name');
        }

        return response()->json($query->paginate(10));
    }

    public function store(Request $request)
    {
        return response()->json([
            'message' => 'Direct member creation is disabled. Use member application approval workflow.',
        ], 422);
    }

    public function show(Request $request, Member $member)
    {
        $this->authorize('viewMemberDirectory', Member::class);

        /** @var User $viewer */
        $viewer = $request->user()->loadMissing('role:id,name');
        $member->loadMissing('user.role:id,name', 'user.formalPhoto');

        $normalizedEmail = $this->normalizeEmail((string) ($member->email ?? ''));
        if ($normalizedEmail === $this->bootstrapEmail() && BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($viewer)) {
            abort(404);
        }

        if (
            optional($viewer->role)->name !== RoleHierarchy::SUPERADMIN
            && $member->user
            && optional($member->user->role)->name === RoleHierarchy::SUPERADMIN
        ) {
            abort(404);
        }

        $canViewLinkedAccount = in_array(optional($viewer->role)->name, [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN], true);

        return response()->json([
            ...$this->serializeMember($member),
            'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($viewer, $member->email),
            'user' => $canViewLinkedAccount && $member->user ? [
                'id' => $member->user->id,
                'name' => $member->user->name,
                'email' => BootstrapSuperadminPrivacy::maskEmailForViewer($viewer, $member->user->email),
                'role' => $member->user->role ? [
                    'id' => $member->user->role->id,
                    'name' => $member->user->role->name,
                ] : null,
            ] : null,
            'formal_photo' => $request->user()->hasPermission(Permissions::FORMAL_PHOTOS_VIEW_PRIVATE)
                ? $this->formalPhotoPayload($member->user?->formalPhoto)
                : null,
        ]);
    }

    public function myProfile(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user();
        $member = $this->resolveActorMember($actor);

        if (!$member) {
            return response()->json([
                'message' => 'No linked member profile found for this account.',
            ], 404);
        }

        $this->authorize('manageOwnProfile', $member);

        $actor->loadMissing('formalPhoto');

        return response()->json([
            ...$this->serializeMember($member),
            'formal_photo' => $this->formalPhotoPayload($actor->formalPhoto, true),
        ]);
    }

    public function updateMyProfile(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user();
        $member = $this->resolveActorMember($actor);

        if (!$member) {
            return response()->json([
                'message' => 'No linked member profile found for this account.',
            ], 404);
        }

        $this->authorize('manageOwnProfile', $member);

        if ($request->exists('email')) {
            $request->request->remove('email');
        }

        if ($request->exists('batch')) {
            $request->merge(['batch' => $member->batch]);
        }

        $validated = $request->validate($this->baseMemberValidationRules());
        $profileData = $this->normalizeMemberPayload($validated);

        DB::transaction(function () use ($member, $profileData, $validated): void {
            $member->fill($profileData);
            $member->save();

            $this->syncEmployments($member, $validated['employments'] ?? null);
            $this->syncDependents($member, $validated['dependents'] ?? null);
            $this->syncEducationEntries($member, $validated['education_entries'] ?? null);
        });

        if ($member->user_id) {
            User::query()
                ->where('id', $member->user_id)
                ->update([
                    'name' => (string) TextCase::title(trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name)),
                ]);
        }

        return response()->json([
            'message' => 'Profile updated successfully.',
            'member' => [
                ...$this->serializeMember($member->fresh()),
                'formal_photo' => $this->formalPhotoPayload($actor->fresh('formalPhoto')->formalPhoto, true),
            ],
        ]);
    }

    public function update(Request $request, Member $member)
    {
        /** @var User $actor */
        $actor = $request->user();

        if ($request->filled('email')) {
            $request->merge(['email' => $this->normalizeEmail((string) $request->input('email', ''))]);
        }

        $rules = $this->baseMemberValidationRules(true);
        $rules['member_number'] .= '|unique:members,member_number,' . $member->id;
        $validated = $request->validate($rules);
        $profileData = $this->normalizeMemberPayload($validated, true);

        $currentBatch = isset($member->batch) && $member->batch !== ''
            ? (string) TextCase::title((string) $member->batch)
            : null;
        if (($profileData['batch'] ?? null) !== $currentBatch && !$actor->hasPermission('applications.review')) {
            return response()->json([
                'message' => 'Batch assignment is managed by the membership chairman through the applicant batch workflow.',
            ], 422);
        }

        $currentEmail = $this->normalizeEmail((string) ($member->email ?? ''));
        $requestedEmail = $this->normalizeEmail((string) ($profileData['email'] ?? ''));
        if ($requestedEmail !== '' && $requestedEmail !== $currentEmail) {
            return response()->json([
                'message' => $this->emailImmutableMessage(),
            ], 422);
        }

        DB::transaction(function () use ($member, $validated, $profileData): void {
            $member->fill($profileData);
            $member->membership_status = $validated['membership_status'] ?? $member->membership_status;
            $member->save();

            if ($member->user_id) {
                User::query()
                    ->where('id', $member->user_id)
                    ->update([
                        'email_verified_at' => ($validated['email_verified'] ?? $member->email_verified) ? now() : null,
                    ]);
            }

            $member->email_verified = (bool) ($validated['email_verified'] ?? $member->email_verified);
            $member->password_set = (bool) ($validated['password_set'] ?? $member->password_set);
            $member->save();

            $this->syncEmployments($member, $validated['employments'] ?? null);
            $this->syncDependents($member, $validated['dependents'] ?? null);
            $this->syncEducationEntries($member, $validated['education_entries'] ?? null);
            $this->syncSponsorship($member, $validated['sponsorship'] ?? null);
            $this->syncClubPositions($member, $validated['club_positions'] ?? null);
        });

        return response()->json($this->serializeMember($member->fresh()));
    }

    public function assignApplicantBatch(Request $request, Member $member)
    {
        $this->authorize('assignBatch', $member);

        $validated = $request->validate([
            'batch_id' => 'required|integer|exists:applicant_batches,id',
        ]);

        $batch = ApplicantBatch::query()->findOrFail((int) $validated['batch_id']);
        $member->batch = $batch->name;
        $member->save();

        return response()->json([
            'message' => 'Member batch assigned.',
            'member' => $member->fresh(),
            'batch' => [
                'id' => $batch->id,
                'name' => $batch->name,
            ],
        ]);
    }

    public function destroy(Request $request, Member $member)
    {
        $this->authorize('manageAdminUsers', [User::class, 'users.manage']);

        /** @var User $actor */
        $actor = $request->user()->loadMissing('role:id,name');
        $linkedUser = $member->user()->with('role:id,name')->first();

        if ($linkedUser && $actor->id === $linkedUser->id) {
            return response()->json([
                'message' => 'Use user management for your own account lifecycle. Self-deletion is not allowed through the member directory.',
            ], 422);
        }

        if ($linkedUser && in_array(optional($linkedUser->role)->name, [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN], true)) {
            return response()->json([
                'message' => 'Protected administrative accounts cannot be removed through the member directory.',
            ], 422);
        }

        $this->purgeMemberRecord($member, $linkedUser);

        return response()->json(['message' => 'Member deleted']);
    }

    public function destroyMine(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user()->loadMissing('role:id,name');

        if (in_array(optional($actor->role)->name, [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN], true)) {
            return response()->json([
                'message' => 'Protected administrative accounts cannot be removed through self-service deletion.',
            ], 422);
        }

        $member = $this->resolveActorMember($actor);
        if (!$member) {
            return response()->json([
                'message' => 'No member record is linked to this account.',
            ], 404);
        }

        $this->purgeMemberRecord($member, $actor);

        return response()->json([
            'message' => 'Member account data deleted.',
        ]);
    }

    private function formalPhotoPayload(?FormalPhoto $formalPhoto, bool $includeOwnerRoute = false): ?array
    {
        return $formalPhoto?->toMetadataArray($includeOwnerRoute);
    }

    private function purgeMemberRecord(Member $member, ?User $linkedUser): void
    {
        DB::transaction(function () use ($member, $linkedUser): void {
            $memberEmail = strtolower(trim((string) $member->email));
            $linkedUserId = $linkedUser?->id;

            $applicants = Applicant::query()
                ->with(['documents', 'feeRequirements.payments'])
                ->where(function ($query) use ($member, $linkedUserId, $memberEmail): void {
                    $query->where('member_id', $member->id);

                    if ($linkedUserId) {
                        $query->orWhere('user_id', $linkedUserId);
                    }

                    if ($memberEmail !== '') {
                        $query->orWhereRaw('LOWER(TRIM(email)) = ?', [$memberEmail]);
                    }
                })
                ->get();

            foreach ($applicants as $applicant) {
                foreach ($applicant->documents as $document) {
                    if (Storage::disk('local')->exists($document->file_path)) {
                        Storage::disk('local')->delete($document->file_path);
                    }
                }

                $applicant->notices()->delete();
                $applicant->documents()->delete();
                foreach ($applicant->feeRequirements as $requirement) {
                    $requirement->payments()->delete();
                }
                $applicant->feeRequirements()->delete();
                $applicant->delete();
            }

            MemberRegistration::query()
                ->where(function ($query) use ($member, $linkedUserId, $memberEmail): void {
                    $query->where('member_id', $member->id);

                    if ($linkedUserId) {
                        $query->orWhere('user_id', $linkedUserId);
                    }

                    if ($memberEmail !== '') {
                        $query->orWhereRaw('LOWER(TRIM(email)) = ?', [$memberEmail]);
                    }
                })
                ->delete();

            if ($linkedUser) {
                $linkedUser->delete();
            }

            $member->delete();
        });
    }

    private function syncEmployments(Member $member, ?array $items): void
    {
        if ($items === null || !$this->hasTable('member_employments')) {
            return;
        }

        $existingIds = $member->employments()->pluck('id')->all();
        $keptIds = [];

        foreach ($items as $item) {
            $payload = [
                'office_name' => $this->titleOrNull($item['office_name'] ?? null),
                'line_of_business' => $this->titleOrNull($item['line_of_business'] ?? null),
                'office_address' => $this->trimOrNull($item['office_address'] ?? null),
                'job_title' => $this->titleOrNull($item['job_title'] ?? null),
                'office_telephone' => $this->compactPhone($item['office_telephone'] ?? null),
                'office_fax' => $this->compactPhone($item['office_fax'] ?? null),
                'is_current' => (bool) ($item['is_current'] ?? true),
            ];

            if (count(array_filter($payload, fn ($value) => $value !== null && $value !== false)) === 0) {
                continue;
            }

            if (!empty($item['id'])) {
                $employment = $member->employments()->whereKey((int) $item['id'])->first();
                if ($employment) {
                    $employment->fill($payload)->save();
                    $keptIds[] = $employment->id;
                }
                continue;
            }

            $employment = $member->employments()->create($payload);
            $keptIds[] = $employment->id;
        }

        $member->employments()->whereIn('id', array_diff($existingIds, $keptIds))->delete();
    }

    private function syncDependents(Member $member, ?array $items): void
    {
        if ($items === null || !$this->hasTable('member_dependents')) {
            return;
        }

        $existingIds = $member->dependents()->pluck('id')->all();
        $keptIds = [];

        foreach ($items as $index => $item) {
            $payload = [
                'relationship' => (string) ($item['relationship'] ?? 'dependent'),
                'name' => $this->titleOrNull($item['name'] ?? null),
                'contact_number' => $this->compactPhone($item['contact_number'] ?? null),
                'age' => isset($item['age']) && $item['age'] !== '' ? (int) $item['age'] : null,
                'sort_order' => isset($item['sort_order']) ? (int) $item['sort_order'] : $index,
            ];

            if ($payload['name'] === null) {
                continue;
            }

            if (!empty($item['id'])) {
                $dependent = $member->dependents()->whereKey((int) $item['id'])->first();
                if ($dependent) {
                    $dependent->fill($payload)->save();
                    $keptIds[] = $dependent->id;
                }
                continue;
            }

            $dependent = $member->dependents()->create($payload);
            $keptIds[] = $dependent->id;
        }

        $member->dependents()->whereIn('id', array_diff($existingIds, $keptIds))->delete();
    }

    private function syncEducationEntries(Member $member, ?array $items): void
    {
        if ($items === null || !$this->hasTable('member_education')) {
            return;
        }

        $existingIds = $member->educationEntries()->pluck('id')->all();
        $keptIds = [];

        foreach ($items as $item) {
            $payload = [
                'level' => (string) ($item['level'] ?? ''),
                'school_name' => $this->titleOrNull($item['school_name'] ?? null),
                'date_graduated' => $item['date_graduated'] ?? null,
                'course' => $this->titleOrNull($item['course'] ?? null),
            ];

            if ($payload['level'] === '') {
                continue;
            }

            if (!empty($item['id'])) {
                $education = $member->educationEntries()->whereKey((int) $item['id'])->first();
                if ($education) {
                    $education->fill($payload)->save();
                    $keptIds[] = $education->id;
                }
                continue;
            }

            $education = $member->educationEntries()->create($payload);
            $keptIds[] = $education->id;
        }

        $member->educationEntries()->whereIn('id', array_diff($existingIds, $keptIds))->delete();
    }

    private function syncSponsorship(Member $member, ?array $payload): void
    {
        if ($payload === null || !$this->hasTable('member_sponsorships')) {
            return;
        }

        $normalized = [
            'sponsor_member_id' => !empty($payload['sponsor_member_id']) ? (int) $payload['sponsor_member_id'] : null,
            'sponsor_name' => $this->titleOrNull($payload['sponsor_name'] ?? null),
            'sponsor_date' => $payload['sponsor_date'] ?? null,
            'sponsor_signature_name' => $this->titleOrNull($payload['sponsor_signature_name'] ?? null),
            'applicant_signature_name' => $this->titleOrNull($payload['applicant_signature_name'] ?? null),
            'applicant_signed_at' => $payload['applicant_signed_at'] ?? null,
        ];

        if (count(array_filter($normalized, fn ($value) => $value !== null && $value !== '')) === 0) {
            $member->sponsorship()?->delete();
            return;
        }

        $member->sponsorship()->updateOrCreate([], $normalized);
    }

    private function syncClubPositions(Member $member, ?array $items): void
    {
        if ($items === null || !$this->hasTable('member_club_positions') || !$this->hasTable('club_positions')) {
            return;
        }

        $existingIds = $member->clubPositionAssignments()->pluck('id')->all();
        $keptIds = [];

        foreach ($items as $item) {
            $positionId = !empty($item['club_position_id']) ? (int) $item['club_position_id'] : null;
            if ($positionId === null && !empty($item['position_name'])) {
                $positionCode = $this->upperOrNull($item['position_code'] ?? null);
                $position = ClubPosition::query()->firstOrCreate(
                    ['name' => (string) TextCase::title((string) $item['position_name'])],
                    ['code' => $positionCode, 'sort_order' => 0]
                );
                if ($positionCode !== null && blank($position->code)) {
                    $position->forceFill(['code' => $positionCode])->save();
                }
                $positionId = $position->id;
            }

            if ($positionId === null) {
                continue;
            }

            $payload = [
                'club_position_id' => $positionId,
                'eagle_year' => $this->trimOrNull($item['eagle_year'] ?? null),
                'started_at' => $item['started_at'] ?? null,
                'ended_at' => $item['ended_at'] ?? null,
                'is_current' => (bool) ($item['is_current'] ?? empty($item['ended_at'])),
            ];

            if (!empty($item['id'])) {
                $assignment = $member->clubPositionAssignments()->whereKey((int) $item['id'])->first();
                if ($assignment) {
                    $assignment->fill($payload)->save();
                    $keptIds[] = $assignment->id;
                }
                continue;
            }

            $assignment = $member->clubPositionAssignments()->create($payload);
            $keptIds[] = $assignment->id;
        }

        $member->clubPositionAssignments()->whereIn('id', array_diff($existingIds, $keptIds))->delete();
    }

    private function serializeMember(Member $member): array
    {
        $this->loadOptionalMemberRelations($member);

        $employments = $member->relationLoaded('employments')
            ? $member->employments
            : collect();
        $dependents = $member->relationLoaded('dependents')
            ? $member->dependents
            : collect();
        $educationEntries = $member->relationLoaded('educationEntries')
            ? $member->educationEntries
            : collect();
        $sponsorship = $member->relationLoaded('sponsorship')
            ? $member->sponsorship
            : null;
        $clubPositionAssignments = $member->relationLoaded('clubPositionAssignments')
            ? $member->clubPositionAssignments
            : collect();

        return [
            ...$member->toArray(),
            'employments' => $employments->map(fn (MemberEmployment $employment) => [
                'id' => $employment->id,
                'office_name' => $employment->office_name,
                'line_of_business' => $employment->line_of_business,
                'office_address' => $employment->office_address,
                'job_title' => $employment->job_title,
                'office_telephone' => $employment->office_telephone,
                'office_fax' => $employment->office_fax,
                'is_current' => (bool) $employment->is_current,
            ])->values()->all(),
            'dependents' => $dependents->map(fn (MemberDependent $dependent) => [
                'id' => $dependent->id,
                'relationship' => $dependent->relationship,
                'name' => $dependent->name,
                'contact_number' => $dependent->contact_number,
                'age' => $dependent->age,
                'sort_order' => $dependent->sort_order,
            ])->values()->all(),
            'education_entries' => $educationEntries->map(fn (MemberEducation $education) => [
                'id' => $education->id,
                'level' => $education->level,
                'school_name' => $education->school_name,
                'date_graduated' => optional($education->date_graduated)?->toDateString(),
                'course' => $education->course,
            ])->values()->all(),
            'sponsorship' => $sponsorship ? [
                'id' => $sponsorship->id,
                'sponsor_member_id' => $sponsorship->sponsor_member_id,
                'sponsor_name' => $sponsorship->sponsor_name,
                'sponsor_date' => optional($sponsorship->sponsor_date)?->toDateString(),
                'sponsor_signature_name' => $sponsorship->sponsor_signature_name,
                'applicant_signature_name' => $sponsorship->applicant_signature_name,
                'applicant_signed_at' => optional($sponsorship->applicant_signed_at)?->toDateString(),
                'sponsor_member' => $sponsorship->sponsorMember ? [
                    'id' => $sponsorship->sponsorMember->id,
                    'name' => trim(implode(' ', array_filter([
                        $sponsorship->sponsorMember->first_name,
                        $sponsorship->sponsorMember->middle_name,
                        $sponsorship->sponsorMember->last_name,
                    ]))),
                ] : null,
            ] : null,
            'club_positions' => $clubPositionAssignments->map(fn (MemberClubPosition $assignment) => [
                'id' => $assignment->id,
                'club_position_id' => $assignment->club_position_id,
                'position_name' => $assignment->clubPosition?->name,
                'position_code' => $assignment->clubPosition?->code,
                'eagle_year' => $assignment->eagle_year,
                'started_at' => optional($assignment->started_at)?->toDateString(),
                'ended_at' => optional($assignment->ended_at)?->toDateString(),
                'is_current' => (bool) $assignment->is_current,
            ])->values()->all(),
            'current_club_positions' => $clubPositionAssignments
                ->filter(fn (MemberClubPosition $assignment) => $assignment->is_current || $assignment->ended_at === null)
                ->map(fn (MemberClubPosition $assignment) => [
                    'id' => $assignment->id,
                    'club_position_id' => $assignment->club_position_id,
                    'position_name' => $assignment->clubPosition?->name,
                    'position_code' => $assignment->clubPosition?->code,
                    'eagle_year' => $assignment->eagle_year,
                ])->values()->all(),
        ];
    }

    private function loadOptionalMemberRelations(Member $member): Member
    {
        $relations = [];

        if ($this->hasTable('member_employments')) {
            $relations[] = 'employments';
        }

        if ($this->hasTable('member_dependents')) {
            $relations[] = 'dependents';
        }

        if ($this->hasTable('member_education')) {
            $relations[] = 'educationEntries';
        }

        if ($this->hasTable('member_sponsorships')) {
            $relations[] = 'sponsorship.sponsorMember:id,first_name,middle_name,last_name';
        }

        if ($this->hasTable('member_club_positions') && $this->hasTable('club_positions')) {
            $relations[] = 'clubPositionAssignments.clubPosition';
        }

        if ($relations !== []) {
            $member->loadMissing($relations);
        }

        return $member;
    }

    private function hasTable(string $table): bool
    {
        static $cache = [];

        if (!array_key_exists($table, $cache)) {
            $cache[$table] = Schema::hasTable($table);
        }

        return $cache[$table];
    }
}
