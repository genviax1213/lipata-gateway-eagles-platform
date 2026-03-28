<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\Applicant;
use App\Models\Role;
use App\Models\User;
use App\Support\LoginAlias;
use App\Support\BootstrapSuperadminPrivacy;
use App\Support\RoleHierarchy;
use App\Support\TextCase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    private const FORUM_ROLES = ['forum_moderator'];
    private const FINANCE_ROLES = ['treasurer', 'auditor'];

    private function bootstrapEmail(): string
    {
        return $this->normalizeEmail((string) config('app.bootstrap_superadmin_email', 'admin@lipataeagles.ph'));
    }

    private function isBootstrapEmail(?string $email): bool
    {
        return $this->normalizeEmail((string) $email) === $this->bootstrapEmail();
    }

    private function isProtectedAdminRole(?string $roleName): bool
    {
        return in_array($roleName, [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN], true);
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    private function isAliasEmail(string $value): bool
    {
        return LoginAlias::isAliasFormat($value);
    }

    private function aliasSeedForMember(Member $member): string
    {
        return LoginAlias::build((string) $member->first_name, (string) $member->last_name);
    }

    private function generateUniqueAliasForMember(Member $member, ?int $ignoreUserId = null): string
    {
        $seed = $this->aliasSeedForMember($member);
        if ($seed === '') {
            return '';
        }

        $domain = '@' . LoginAlias::defaultDomain();
        $local = Str::before($seed, $domain);
        $counter = 1;

        do {
            $candidate = $counter === 1 ? $local . $domain : ($local . $counter . $domain);
            $exists = User::query()
                ->whereRaw('LOWER(TRIM(email)) = ?', [$candidate])
                ->when($ignoreUserId, fn ($query) => $query->where('id', '!=', $ignoreUserId))
                ->exists();
            $counter++;
        } while ($exists || $this->isBootstrapEmail($candidate));

        return $candidate;
    }

    private function generateTemporaryPassword(int $length = 18): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*';
        $max = strlen($alphabet) - 1;
        $password = '';
        for ($i = 0; $i < $length; $i++) {
            $password .= $alphabet[random_int(0, $max)];
        }

        return $password;
    }

    private function markMemberPasswordState(User $user): void
    {
        $member = $user->memberProfile ?? Member::query()->where('user_id', $user->id)->first();
        if (!$member) {
            return;
        }

        $member->password_set = !(bool) $user->login_email_locked;
        $member->save();
    }

    private function bootstrapEmailImmutableMessage(): string
    {
        return 'Bootstrap login email is protected and cannot be changed from admin user management.';
    }

    private function preserveVerifiedEmailState(User $user, Member $member): void
    {
        if ($user->email_verified_at !== null || !(bool) $member->email_verified) {
            return;
        }

        $user->forceFill(['email_verified_at' => now()])->saveQuietly();
    }

    private function rejectLifecycleManagedRole(Role $role)
    {
        if (!RoleHierarchy::isLifecycleManagedPrimaryRole($role->name)) {
            return null;
        }

        return response()->json([
            'message' => 'Applicant role is lifecycle-managed and can only be created through applicant registration and activation workflows.',
        ], 422);
    }

    public function index(Request $request)
    {
        $this->authorize('manageAdminUsers', [User::class, 'users.view']);
        $search = (string) $request->query('search', '');
        /** @var User $viewer */
        $viewer = $request->user()->loadMissing('role:id,name');

        $users = User::query()
            ->with('role:id,name')
            ->select([
                'id',
                'name',
                'email',
                'recovery_email',
                'role_id',
                'finance_role',
                'forum_role',
                'must_change_password',
                'login_email_locked',
                'mobile_access_enabled',
                'mobile_chat_enabled',
                'last_password_changed_at',
                'created_at',
            ])
            ->when(BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($viewer), function ($query) {
                $query->whereRaw('LOWER(TRIM(email)) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
            })
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->when(optional($viewer->role)->name !== RoleHierarchy::SUPERADMIN, function ($query) {
                $query->whereDoesntHave('role', function ($roleQuery) {
                    $roleQuery->where('name', RoleHierarchy::SUPERADMIN);
                });
            })
            ->orderBy('name')
            ->paginate(20);

        return response()->json($users);
    }

    public function roles(Request $request)
    {
        $this->authorize('manageAdminUsers', [User::class, 'users.view']);
        $roles = Role::query()
            ->with('permissions:id,name')
            ->select(['id', 'name', 'description'])
            ->orderBy('name')
            ->get();

        return response()->json($roles);
    }

    public function members(Request $request)
    {
        $this->authorize('manageAdminUsers', [User::class, 'users.view']);
        $search = (string) $request->query('search', '');
        /** @var User $viewer */
        $viewer = $request->user()->loadMissing('role:id,name');
        $query = Member::query()
            ->with([
                'user:id,email,recovery_email,login_email_locked,role_id,forum_role,finance_role,must_change_password,mobile_access_enabled,mobile_chat_enabled',
                'user.role:id,name',
            ])
            ->select(['id', 'member_number', 'first_name', 'middle_name', 'last_name', 'email', 'membership_status', 'email_verified', 'password_set', 'user_id'])
            ->when(BootstrapSuperadminPrivacy::shouldFilterBootstrapEmail($viewer), function ($builder) {
                $builder->whereRaw('LOWER(TRIM(COALESCE(email, ""))) <> ?', [BootstrapSuperadminPrivacy::bootstrapEmail()]);
            })
            ->when(optional($viewer->role)->name !== RoleHierarchy::SUPERADMIN, function ($builder) {
                $builder->where(function ($query) {
                    $query->whereNull('user_id')
                        ->orWhereDoesntHave('user.role', function ($roleQuery) {
                            $roleQuery->where('name', RoleHierarchy::SUPERADMIN);
                        });
                });
            })
            ->orderBy('last_name')
            ->orderBy('first_name');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('member_number', 'like', "%{$search}%")
                    ->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        return response()->json($query->paginate(20));
    }

    public function assignRoleToMember(Request $request, Member $member)
    {
        $validated = $request->validate([
            'role_id' => 'required|integer|exists:roles,id',
            'finance_role' => 'nullable|in:treasurer,auditor',
            'forum_role' => 'nullable|in:forum_moderator',
            'login_email' => 'nullable|email|max:255',
            'mobile_access_enabled' => 'nullable|boolean',
            'mobile_chat_enabled' => 'nullable|boolean',
            'must_change_password' => 'nullable|boolean',
        ]);

        $selectedRole = Role::query()
            ->select(['id', 'name'])
            ->findOrFail($validated['role_id']);
        $isMemberPrimaryRole = $selectedRole->name === RoleHierarchy::MEMBER;
        $forumRole = $validated['forum_role'] ?? null;

        if ($response = $this->rejectLifecycleManagedRole($selectedRole)) {
            return $response;
        }

        /** @var User $authUser */
        $authUser = $request->user()->loadMissing('role:id,name');

        if (!$member->email) {
            return response()->json([
                'message' => 'Selected member has no email on file. Cannot provision portal access.',
            ], 422);
        }
        $memberEmail = $this->normalizeEmail((string) $member->email);

        $linkedUser = $member->user;
        if (!$linkedUser) {
            $linkedUser = User::query()->where('email', $memberEmail)->first();
        }

        if ($linkedUser) {
            $memberUsingUser = Member::query()
                ->where('user_id', $linkedUser->id)
                ->where('id', '!=', $member->id)
                ->first();

            if ($memberUsingUser) {
                return response()->json([
                    'message' => 'Duplicate account mapping detected for this person/email. Use authenticated Edit Email flow: verify new email token, then admin/officer approves the update.',
                ], 422);
            }
        }

        if (
            $linkedUser
            && $authUser->id === $linkedUser->id
            && $this->isProtectedAdminRole(optional($authUser->role)->name)
            && !$this->isProtectedAdminRole($selectedRole->name)
        ) {
            return response()->json([
                'message' => 'You cannot remove your own top-level administrative role.',
            ], 422);
        }

        $this->authorize('manageRoleAssignment', [User::class, $linkedUser, $selectedRole, 'update']);

        $hasExplicitLoginEmail = array_key_exists('login_email', $validated) && $validated['login_email'] !== null;
        $requestedLoginEmail = $this->normalizeEmail((string) ($validated['login_email'] ?? ''));
        if ($requestedLoginEmail !== '' && !$this->isAliasEmail($requestedLoginEmail) && !$this->isBootstrapEmail($requestedLoginEmail)) {
            return response()->json([
                'message' => 'Login alias must follow firstname.lastname@lgec.org format.',
            ], 422);
        }

        $provisionEmail = $requestedLoginEmail;
        if ($provisionEmail === '') {
            $provisionEmail = $linkedUser?->email
                ? $this->normalizeEmail((string) $linkedUser->email)
                : $memberEmail;
        }

        if ($provisionEmail === '') {
            return response()->json([
                'message' => 'Unable to determine a login email for this member.',
            ], 422);
        }
        if ($hasExplicitLoginEmail && !$this->isBootstrapEmail($provisionEmail) && !$this->isAliasEmail($provisionEmail)) {
            return response()->json([
                'message' => 'Login alias must follow firstname.lastname@lgec.org format.',
            ], 422);
        }

        $existingOwner = User::query()
            ->whereRaw('LOWER(TRIM(email)) = ?', [$provisionEmail])
            ->when($linkedUser, fn ($query) => $query->where('id', '!=', $linkedUser->id))
            ->first();

        if ($existingOwner) {
            return response()->json([
                'message' => 'That login email is already assigned to another user account.',
            ], 422);
        }

        if (!$linkedUser) {
            $linkedUser = User::query()->create([
                'name' => (string) TextCase::title(trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name)),
                'email' => $provisionEmail,
                'recovery_email' => $memberEmail,
                'login_email_locked' => true,
                'email_verified_at' => now(),
                'password' => Hash::make(Str::random(48)),
                'role_id' => $selectedRole->id,
                'finance_role' => $isMemberPrimaryRole
                    ? null
                    : (in_array(($validated['finance_role'] ?? null), self::FINANCE_ROLES, true) ? $validated['finance_role'] : null),
                'forum_role' => in_array(($validated['forum_role'] ?? null), self::FORUM_ROLES, true) ? $validated['forum_role'] : null,
                'must_change_password' => (bool) ($validated['must_change_password'] ?? false),
                'mobile_access_enabled' => (bool) ($validated['mobile_access_enabled'] ?? false),
                'mobile_chat_enabled' => (bool) ($validated['mobile_chat_enabled'] ?? false),
                'last_password_changed_at' => now(),
            ]);
        } else {
            $linkedUser->role_id = $selectedRole->id;
            $linkedUser->email = $provisionEmail;
            if (!$this->isBootstrapEmail($linkedUser->email)) {
                $linkedUser->recovery_email = $memberEmail;
            }
            if ($linkedUser->email_verified_at === null) {
                $linkedUser->email_verified_at = now();
            }
        }

        $this->preserveVerifiedEmailState($linkedUser, $member);
        $linkedUser->finance_role = $isMemberPrimaryRole
            ? null
            : (in_array(($validated['finance_role'] ?? null), self::FINANCE_ROLES, true) ? $validated['finance_role'] : null);
        $linkedUser->forum_role = in_array($forumRole, self::FORUM_ROLES, true) ? $forumRole : null;
        $linkedUser->must_change_password = (bool) ($validated['must_change_password'] ?? $linkedUser->must_change_password);
        $linkedUser->mobile_access_enabled = (bool) ($validated['mobile_access_enabled'] ?? $linkedUser->mobile_access_enabled);
        $linkedUser->mobile_chat_enabled = (bool) ($validated['mobile_chat_enabled'] ?? $linkedUser->mobile_chat_enabled);
        $linkedUser->save();

        if (!$member->user_id || $member->user_id !== $linkedUser->id) {
            $member->user_id = $linkedUser->id;
        }
        if ($member->email !== $memberEmail) {
            $member->email = $memberEmail;
        }
        $member->email_verified = $member->email_verified || (bool) $linkedUser->email_verified_at;
        $member->password_set = !((bool) $linkedUser->login_email_locked);
        $member->save();

        Log::info('admin.role_assigned', [
            'actor_user_id' => $authUser->id,
            'target_user_id' => $linkedUser->id,
            'target_member_id' => $member->id,
            'primary_role' => $selectedRole->name,
            'forum_role' => $linkedUser->forum_role,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'member' => $member->fresh()->load('user.role:id,name'),
            'user' => $linkedUser->fresh()->load('role:id,name'),
            'message' => 'Role assigned successfully to selected member.',
        ]);
    }

    public function updateRole(Request $request, User $user)
    {
        $validated = $request->validate([
            'role_id' => 'required|integer|exists:roles,id',
        ]);

        $selectedRole = Role::query()
            ->select(['id', 'name'])
            ->findOrFail($validated['role_id']);

        if ($response = $this->rejectLifecycleManagedRole($selectedRole)) {
            return $response;
        }

        /** @var User $authUser */
        $authUser = $request->user()->loadMissing('role:id,name');

        if (
            $authUser->id === $user->id
            && $this->isProtectedAdminRole(optional($authUser->role)->name)
            && !$this->isProtectedAdminRole($selectedRole->name)
        ) {
            return response()->json([
                'message' => 'You cannot remove your own top-level administrative role.',
            ], 422);
        }

        $this->authorize('manageRoleAssignment', [User::class, $user, $selectedRole, 'update']);

        $previousRole = optional($user->role)->name;
        $user->role_id = $validated['role_id'];
        $user->save();

        Log::info('admin.role_updated', [
            'actor_user_id' => $authUser->id,
            'target_user_id' => $user->id,
            'previous_role' => $previousRole,
            'new_role' => $selectedRole->name,
            'ip' => $request->ip(),
        ]);

        return response()->json(
            $user->fresh()->load('role:id,name')
        );
    }

    public function store(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->authorize('manageAdminUsers', [User::class, 'users.manage']);
        $request->merge(['email' => $this->normalizeEmail((string) $request->input('email', ''))]);

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|max:255',
            'role_id' => 'required|integer|exists:roles,id',
            'finance_role' => 'nullable|in:treasurer,auditor',
            'forum_role' => 'nullable|in:forum_moderator',
            'must_change_password' => 'nullable|boolean',
            'mobile_access_enabled' => 'nullable|boolean',
            'mobile_chat_enabled' => 'nullable|boolean',
        ]);

        $selectedRole = Role::query()->select(['id', 'name'])->findOrFail($validated['role_id']);

        if ($response = $this->rejectLifecycleManagedRole($selectedRole)) {
            return $response;
        }
        $this->authorize('manageRoleAssignment', [User::class, null, $selectedRole, 'create']);

        $created = User::query()->create([
            'name' => (string) TextCase::title($validated['name']),
            'email' => $validated['email'],
            'recovery_email' => null,
            'login_email_locked' => false,
            'password' => Hash::make($validated['password']),
            'role_id' => $validated['role_id'],
            'finance_role' => in_array(($validated['finance_role'] ?? null), self::FINANCE_ROLES, true) ? $validated['finance_role'] : null,
            'forum_role' => in_array(($validated['forum_role'] ?? null), self::FORUM_ROLES, true) ? $validated['forum_role'] : null,
            'must_change_password' => (bool) ($validated['must_change_password'] ?? false),
            'mobile_access_enabled' => (bool) ($validated['mobile_access_enabled'] ?? false),
            'mobile_chat_enabled' => (bool) ($validated['mobile_chat_enabled'] ?? false),
            'last_password_changed_at' => now(),
        ])->load('role:id,name');

        Log::info('admin.user_created', [
            'actor_user_id' => $actor->id,
            'target_user_id' => $created->id,
            'target_role' => optional($created->role)->name,
            'ip' => $request->ip(),
        ]);

        return response()->json($created, 201);
    }

    public function update(Request $request, User $user)
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->authorize('manageAdminUsers', [User::class, 'users.manage']);

        if ($request->filled('email')) {
            $request->merge(['email' => $this->normalizeEmail((string) $request->input('email', ''))]);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => 'nullable|string|min:8|max:255',
            'role_id' => 'required|integer|exists:roles,id',
            'finance_role' => 'nullable|in:treasurer,auditor',
            'forum_role' => 'nullable|in:forum_moderator',
            'must_change_password' => 'nullable|boolean',
            'mobile_access_enabled' => 'nullable|boolean',
            'mobile_chat_enabled' => 'nullable|boolean',
        ]);

        $selectedRole = Role::query()->select(['id', 'name'])->findOrFail($validated['role_id']);

        if ($response = $this->rejectLifecycleManagedRole($selectedRole)) {
            return $response;
        }
        $this->authorize('manageRoleAssignment', [User::class, $user, $selectedRole, 'update']);

        $currentEmail = $this->normalizeEmail((string) $user->email);
        $requestedEmail = $this->normalizeEmail((string) ($validated['email'] ?? $currentEmail));
        if ($this->isBootstrapEmail($currentEmail) && $requestedEmail !== $currentEmail) {
            return response()->json([
                'message' => $this->bootstrapEmailImmutableMessage(),
            ], 422);
        }
        $previousRole = optional($user->role)->name;
        DB::transaction(function () use ($user, $validated): void {
            $user->name = (string) TextCase::title($validated['name']);
            if (array_key_exists('email', $validated)) {
                $user->email = $validated['email'];
                if ($user->email_verified_at === null) {
                    $user->email_verified_at = now();
                }
            }
            $user->role_id = $validated['role_id'];
            $user->finance_role = in_array(($validated['finance_role'] ?? null), self::FINANCE_ROLES, true) ? $validated['finance_role'] : null;
            $user->forum_role = in_array(($validated['forum_role'] ?? null), self::FORUM_ROLES, true) ? $validated['forum_role'] : null;
            $user->must_change_password = (bool) ($validated['must_change_password'] ?? $user->must_change_password);
            $user->mobile_access_enabled = (bool) ($validated['mobile_access_enabled'] ?? $user->mobile_access_enabled);
            $user->mobile_chat_enabled = (bool) ($validated['mobile_chat_enabled'] ?? $user->mobile_chat_enabled);
            if (!empty($validated['password'])) {
                $user->password = Hash::make($validated['password']);
                $user->last_password_changed_at = now();
            }
            $user->save();
        });

        Log::info('admin.user_updated', [
            'actor_user_id' => $actor->id,
            'target_user_id' => $user->id,
            'previous_role' => $previousRole,
            'new_role' => $selectedRole->name,
            'ip' => $request->ip(),
        ]);

        return response()->json($user->fresh()->load('role:id,name'));
    }

    public function destroy(Request $request, User $user)
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->authorize('manageAdminUsers', [User::class, 'users.manage']);
        $this->authorize('manageRoleAssignment', [User::class, $user, null, 'delete']);

        $targetUserId = $user->id;
        $user->delete();

        Log::info('admin.user_deleted', [
            'actor_user_id' => $actor->id,
            'target_user_id' => $targetUserId,
            'ip' => $request->ip(),
        ]);

        return response()->json(['message' => 'User deleted']);
    }

    public function resetPassword(Request $request, User $user)
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->authorize('resetUserPassword', [User::class, $user]);

        if ($this->normalizeEmail((string) $user->email) === $this->bootstrapEmail()) {
            Log::warning('admin.user_password_reset_blocked_bootstrap', [
                'actor_user_id' => $actor->id,
                'target_user_id' => $user->id,
                'ip' => $request->ip(),
            ]);

            return response()->json([
                'message' => 'Bootstrap password reset is only available through the protected recovery flow.',
            ], 403);
        }

        $validated = $request->validate([
            'password' => 'required|string|min:8|confirmed|max:255',
        ]);

        $user->password = Hash::make($validated['password']);
        $user->login_email_locked = false;
        $user->must_change_password = true;
        $user->last_password_changed_at = now();
        $user->save();
        $this->markMemberPasswordState($user);

        Log::info('admin.user_password_reset', [
            'actor_user_id' => $actor->id,
            'target_user_id' => $user->id,
            'target_role' => optional($user->role)->name,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Password updated successfully.',
        ]);
    }

    public function generateCredentials(Request $request, User $user)
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->authorize('resetUserPassword', [User::class, $user]);

        if ($this->normalizeEmail((string) $user->email) === $this->bootstrapEmail()) {
            return response()->json([
                'message' => 'Bootstrap password reset is only available through the protected recovery flow.',
            ], 403);
        }

        $generatedPassword = $this->generateTemporaryPassword();

        DB::transaction(function () use ($user, $generatedPassword): void {
            $user->forceFill([
                'password' => Hash::make($generatedPassword),
                'remember_token' => Str::random(60),
                'login_email_locked' => false,
                'must_change_password' => true,
                'last_password_changed_at' => now(),
            ])->save();

            $this->markMemberPasswordState($user);
        });

        Log::info('admin.user_credentials_generated', [
            'actor_user_id' => $actor->id,
            'target_user_id' => $user->id,
            'target_role' => optional($user->role)->name,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Credentials generated successfully.',
            'generated_password' => $generatedPassword,
            'user' => $user->fresh()->load('role:id,name'),
        ]);
    }

    public function aliasConversionPreview(Request $request)
    {
        $this->authorize('manageAdminUsers', [User::class, 'users.view']);

        $members = Member::query()
            ->with(['user:id,email,recovery_email,login_email_locked,role_id', 'user.role:id,name'])
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        $rows = [];
        $summary = [
            'total_members' => $members->count(),
            'convertible' => 0,
            'missing_name' => 0,
            'missing_recovery_email' => 0,
            'missing_user_link' => 0,
            'already_alias' => 0,
            'locked' => 0,
        ];

        foreach ($members as $member) {
            $user = $member->user;
            if (!$user) {
                $summary['missing_user_link']++;
                continue;
            }

            if ($this->isBootstrapEmail((string) $user->email)) {
                continue;
            }

            $first = trim((string) $member->first_name);
            $last = trim((string) $member->last_name);
            $recoveryEmail = $this->normalizeEmail((string) ($member->email ?: $user->recovery_email));
            $candidate = $this->aliasSeedForMember($member);

            $status = 'convertible';
            if ($first === '' || $last === '' || $candidate === '') {
                $status = 'missing_name';
                $summary['missing_name']++;
            } elseif ($recoveryEmail === '') {
                $status = 'missing_recovery_email';
                $summary['missing_recovery_email']++;
            } elseif ($this->isAliasEmail((string) $user->email)) {
                $status = 'already_alias';
                $summary['already_alias']++;
            } else {
                $summary['convertible']++;
            }

            if ((bool) $user->login_email_locked) {
                $summary['locked']++;
            }

            $rows[] = [
                'member_id' => $member->id,
                'user_id' => $user->id,
                'member_name' => trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name),
                'current_login_email' => $user->email,
                'current_recovery_email' => $user->recovery_email,
                'member_email' => $member->email,
                'proposed_alias' => $candidate !== '' ? $this->generateUniqueAliasForMember($member, $user->id) : null,
                'proposed_recovery_email' => $recoveryEmail !== '' ? $recoveryEmail : null,
                'login_email_locked' => (bool) $user->login_email_locked,
                'status' => $status,
            ];
        }

        return response()->json([
            'summary' => $summary,
            'data' => $rows,
        ]);
    }

    public function runAliasConversion(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->authorize('manageAdminUsers', [User::class, 'users.manage']);

        $request->validate([
            'confirm' => 'required|accepted',
        ]);

        $converted = 0;
        $skipped = 0;
        $exceptions = [];

        $members = Member::query()
            ->with('user:id,email,recovery_email,login_email_locked')
            ->orderBy('id')
            ->get();

        DB::transaction(function () use ($members, &$converted, &$skipped, &$exceptions): void {
            foreach ($members as $member) {
                $user = $member->user;
                if (!$user || $this->isBootstrapEmail((string) $user->email)) {
                    continue;
                }

                $first = trim((string) $member->first_name);
                $last = trim((string) $member->last_name);
                $recoveryEmail = $this->normalizeEmail((string) ($member->email ?: $user->recovery_email));
                $alias = $this->generateUniqueAliasForMember($member, $user->id);

                if ($first === '' || $last === '' || $recoveryEmail === '' || $alias === '') {
                    $skipped++;
                    $exceptions[] = [
                        'member_id' => $member->id,
                        'user_id' => $user->id,
                        'reason' => $first === '' || $last === '' ? 'missing_name' : 'missing_recovery_email',
                    ];
                    continue;
                }

                $user->forceFill([
                    'email' => $alias,
                    'recovery_email' => $recoveryEmail,
                    'login_email_locked' => true,
                    'password' => Hash::make(Str::random(64)),
                    'must_change_password' => true,
                ])->save();

                $member->password_set = false;
                $member->save();

                $converted++;
            }

            $bootstrap = User::query()
                ->whereRaw('LOWER(TRIM(email)) = ?', [$this->bootstrapEmail()])
                ->first();
            if ($bootstrap) {
                $bootstrap->recovery_email = $this->normalizeEmail((string) config('app.bootstrap_superadmin_recovery_email', 'r.lanugon@gmail.com'));
                $bootstrap->save();
            }
        });

        Log::info('admin.alias_conversion_run', [
            'actor_user_id' => $actor->id,
            'converted' => $converted,
            'skipped' => $skipped,
            'exceptions_count' => count($exceptions),
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Alias conversion completed.',
            'summary' => [
                'converted' => $converted,
                'skipped' => $skipped,
                'exceptions_count' => count($exceptions),
            ],
            'exceptions' => $exceptions,
        ]);
    }

    public function linkCurrentUserMemberProfile(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user()->loadMissing('role:id,name');
        $this->authorize('manageAdminUsers', [User::class, 'users.manage']);

        if (!RoleHierarchy::canManageUsers((string) optional($actor->role)->name)) {
            return response()->json([
                'message' => 'Only top-level administrators can use this utility.',
            ], 403);
        }

        $normalizedEmail = $this->normalizeEmail((string) $actor->email);
        if ($normalizedEmail === '') {
            return response()->json([
                'message' => 'Current admin account has no valid email.',
            ], 422);
        }

        $member = Member::query()
            ->where('user_id', $actor->id)
            ->first();

        if (!$member) {
            $member = Member::query()
                ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
                ->first();
        }

        if (!$member) {
            return response()->json([
                'message' => 'No member profile found for your admin email. Add/import member data first, then try again.',
            ], 404);
        }

        if ($member->user_id !== null && (int) $member->user_id !== (int) $actor->id) {
            return response()->json([
                'message' => 'Matched member profile is already linked to a different user account.',
            ], 409);
        }

        $this->preserveVerifiedEmailState($actor, $member);

        $member->user_id = $actor->id;
        $member->email = $normalizedEmail;
        $member->email_verified = $member->email_verified || (bool) $actor->email_verified_at;
        $member->password_set = !empty($actor->password);
        $member->save();

        Log::info('admin.self_member_linked', [
            'actor_user_id' => $actor->id,
            'member_id' => $member->id,
            'ip' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Admin account linked to member profile.',
            'member' => $member->fresh(),
        ]);
    }
}
