<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\MemberApplication;
use App\Models\Role;
use App\Models\User;
use App\Support\RoleHierarchy;
use App\Support\TextCase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class AdminUserController extends Controller
{
    private const FORUM_ROLES = ['forum_moderator'];

    private function isProtectedAdminRole(?string $roleName): bool
    {
        return in_array($roleName, [RoleHierarchy::SUPERADMIN, RoleHierarchy::ADMIN], true);
    }

    private function normalizeEmail(string $value): string
    {
        return Str::of($value)->lower()->trim()->value();
    }

    public function index(Request $request)
    {
        $search = (string) $request->query('search', '');

        $users = User::query()
            ->with('role:id,name')
            ->select(['id', 'name', 'email', 'role_id', 'finance_role', 'forum_role', 'created_at'])
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->orderBy('name')
            ->paginate(20);

        return response()->json($users);
    }

    public function roles(Request $request)
    {
        $roles = Role::query()
            ->with('permissions:id,name')
            ->select(['id', 'name', 'description'])
            ->orderBy('name')
            ->get();

        return response()->json($roles);
    }

    public function members(Request $request)
    {
        $search = (string) $request->query('search', '');
        $query = Member::query()
            ->with(['user.role:id,name'])
            ->select(['id', 'member_number', 'first_name', 'middle_name', 'last_name', 'email', 'membership_status', 'email_verified', 'password_set', 'user_id'])
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
            'forum_role' => 'nullable|in:forum_moderator',
        ]);

        $selectedRole = Role::query()
            ->select(['id', 'name'])
            ->findOrFail($validated['role_id']);
        $forumRole = $validated['forum_role'] ?? null;

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

        if (!$linkedUser) {
            $linkedUser = User::query()->create([
                'name' => (string) TextCase::title(trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name)),
                'email' => $memberEmail,
                'email_verified_at' => now(),
                'password' => Hash::make(Str::random(48)),
                'role_id' => $selectedRole->id,
                'finance_role' => null,
                'forum_role' => null,
            ]);
        } else {
            $linkedUser->role_id = $selectedRole->id;
        }

        $linkedUser->finance_role = null;
        $linkedUser->forum_role = in_array($forumRole, self::FORUM_ROLES, true) ? $forumRole : null;
        $linkedUser->save();

        if (!$member->user_id || $member->user_id !== $linkedUser->id) {
            $member->user_id = $linkedUser->id;
        }
        if ($member->email !== $memberEmail) {
            $member->email = $memberEmail;
        }
        $member->email_verified = (bool) $linkedUser->email_verified_at;
        $member->password_set = !empty($linkedUser->password);
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
        $this->authorize('manageAdminUsers', [User::class, 'members.create']);
        $request->merge(['email' => $this->normalizeEmail((string) $request->input('email', ''))]);

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|max:255',
            'role_id' => 'required|integer|exists:roles,id',
        ]);

        $selectedRole = Role::query()->select(['id', 'name'])->findOrFail($validated['role_id']);
        $this->authorize('manageRoleAssignment', [User::class, null, $selectedRole, 'create']);

        $created = User::query()->create([
            'name' => (string) TextCase::title($validated['name']),
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role_id' => $validated['role_id'],
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
        $this->authorize('manageAdminUsers', [User::class, 'members.update']);
        $request->merge(['email' => $this->normalizeEmail((string) $request->input('email', ''))]);

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:8|max:255',
            'role_id' => 'required|integer|exists:roles,id',
        ]);

        $selectedRole = Role::query()->select(['id', 'name'])->findOrFail($validated['role_id']);
        $this->authorize('manageRoleAssignment', [User::class, $user, $selectedRole, 'update']);

        $previousRole = optional($user->role)->name;
        DB::transaction(function () use ($user, $validated): void {
            $previousEmail = (string) $user->email;

            $user->name = (string) TextCase::title($validated['name']);
            $user->email = $validated['email'];
            $user->role_id = $validated['role_id'];
            if (!empty($validated['password'])) {
                $user->password = Hash::make($validated['password']);
            }
            $user->save();

            Member::query()
                ->where('user_id', $user->id)
                ->orWhereRaw('LOWER(TRIM(email)) = ?', [$previousEmail])
                ->update(['email' => $validated['email']]);

            MemberApplication::query()
                ->where('user_id', $user->id)
                ->orWhereRaw('LOWER(TRIM(email)) = ?', [$previousEmail])
                ->update(['email' => $validated['email']]);
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
        $this->authorize('manageAdminUsers', [User::class, 'members.delete']);
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

        $validated = $request->validate([
            'password' => 'required|string|min:8|confirmed|max:255',
        ]);

        $user->password = Hash::make($validated['password']);
        $user->save();

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

    public function linkCurrentUserMemberProfile(Request $request)
    {
        /** @var User $actor */
        $actor = $request->user()->loadMissing('role:id,name');
        $this->authorize('manageAdminUsers', [User::class, 'members.update']);

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

        $member->user_id = $actor->id;
        $member->email = $normalizedEmail;
        $member->email_verified = (bool) $actor->email_verified_at;
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
