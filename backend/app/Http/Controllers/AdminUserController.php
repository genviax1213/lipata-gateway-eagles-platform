<?php

namespace App\Http\Controllers;

use App\Models\Member;
use App\Models\Role;
use App\Models\User;
use App\Support\TextCase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AdminUserController extends Controller
{
    private const ORIGINAL_ADMIN_EMAIL = 'admin@lipataeagles.ph';
    private const MAX_ADMINS_TOTAL = 3;
    private const FINANCE_ROLES = ['auditor', 'treasurer'];
    private const FORUM_ROLES = ['forum_moderator'];

    private function isOriginalAdmin(User $user): bool
    {
        return (string) $user->email === self::ORIGINAL_ADMIN_EMAIL;
    }

    private function isAdmin(User $user): bool
    {
        $user->loadMissing('role:id,name');
        return $this->isOriginalAdmin($user) || optional($user->role)->name === 'admin';
    }

    private function ensureCanAccessUserManagement(Request $request): void
    {
        /** @var User $actor */
        $actor = $request->user()->loadMissing('role.permissions:id,name');

        if ($this->isAdmin($actor)) {
            return;
        }

        if (
            $actor->hasPermission('members.create') ||
            $actor->hasPermission('members.update') ||
            $actor->hasPermission('members.delete') ||
            $actor->hasPermission('members.view')
        ) {
            return;
        }

        abort(403, 'You do not have access to user management.');
    }

    private function ensureCanDelegateRoles(Request $request): void
    {
        /** @var User $actor */
        $actor = $request->user()->loadMissing('role.permissions:id,name');

        if ($this->isAdmin($actor) && $actor->hasPermission('roles.delegate')) {
            return;
        }

        if ($this->isOriginalAdmin($actor)) {
            return;
        }

        abort(403, 'Only administrators can delegate roles.');
    }

    private function ensureCapability(User $actor, string $permission): void
    {
        if ($this->isAdmin($actor)) {
            return;
        }

        if (!$actor->hasPermission($permission)) {
            abort(403, 'Insufficient privileges for this action.');
        }
    }

    private function enforceTargetRestrictions(User $actor, ?User $target = null, ?Role $requestedRole = null, string $action = 'update'): void
    {
        $actor->loadMissing('role:id,name');
        $actorRole = optional($actor->role)->name;
        $actorIsOriginalAdmin = $this->isOriginalAdmin($actor);

        if ($target) {
            $target->loadMissing('role:id,name');
            $targetRole = optional($target->role)->name;

            if ($action === 'delete' && $actor->id === $target->id) {
                abort(422, 'You cannot delete your own account.');
            }

            if ($this->isOriginalAdmin($target) && !$actorIsOriginalAdmin) {
                abort(403, 'Only the original admin can manage the original admin account.');
            }

            if ($targetRole === 'admin' && !$actorIsOriginalAdmin) {
                abort(403, 'Only the original admin can manage administrator accounts.');
            }

            if ($actorRole === 'officer' && $targetRole === 'officer') {
                abort(403, 'Officers cannot manage fellow officers.');
            }
        }

        if ($requestedRole && $requestedRole->name === 'admin') {
            if (!$actorIsOriginalAdmin) {
                abort(403, 'Only the original admin can create or assign administrator accounts.');
            }

            $isPromotion = $target ? optional($target->role)->name !== 'admin' : true;
            if ($isPromotion) {
                $adminCount = User::query()
                    ->whereHas('role', fn ($q) => $q->where('name', 'admin'))
                    ->count();

                if ($adminCount >= self::MAX_ADMINS_TOTAL) {
                    abort(422, 'Maximum administrator accounts reached.');
                }
            }
        }
    }

    public function index(Request $request)
    {
        $this->ensureCanAccessUserManagement($request);

        $users = User::query()
            ->with('role:id,name')
            ->select(['id', 'name', 'email', 'role_id', 'finance_role', 'forum_role', 'created_at'])
            ->orderBy('name')
            ->paginate(20);

        return response()->json($users);
    }

    public function roles(Request $request)
    {
        $this->ensureCanAccessUserManagement($request);

        $roles = Role::query()
            ->with('permissions:id,name')
            ->select(['id', 'name', 'description'])
            ->orderBy('name')
            ->get();

        return response()->json($roles);
    }

    public function members(Request $request)
    {
        $this->ensureCanAccessUserManagement($request);

        $search = (string) $request->query('search', '');
        $query = Member::query()
            ->with(['user.role:id,name'])
            ->select(['id', 'member_number', 'first_name', 'middle_name', 'last_name', 'email', 'membership_status', 'user_id'])
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
        $this->ensureCanDelegateRoles($request);

        $validated = $request->validate([
            'role_id' => 'required|integer|exists:roles,id',
            'finance_role' => 'nullable|in:auditor,treasurer',
            'forum_role' => 'nullable|in:forum_moderator',
        ]);

        $selectedRole = Role::query()
            ->select(['id', 'name'])
            ->findOrFail($validated['role_id']);
        $financeRole = $validated['finance_role'] ?? null;
        $forumRole = $validated['forum_role'] ?? null;

        if (in_array($selectedRole->name, self::FINANCE_ROLES, true)) {
            return response()->json([
                'message' => 'Auditor/Treasurer are secondary finance roles only. Assign a non-finance primary role first.',
            ], 422);
        }

        /** @var User $authUser */
        $authUser = $request->user()->loadMissing('role:id,name');

        if (!$member->email) {
            return response()->json([
                'message' => 'Selected member has no email on file. Cannot provision portal access.',
            ], 422);
        }

        $linkedUser = $member->user;
        if (!$linkedUser) {
            $linkedUser = User::query()->where('email', $member->email)->first();
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

        if ($linkedUser && $authUser->id === $linkedUser->id && $selectedRole->name !== 'admin') {
            return response()->json([
                'message' => 'You cannot remove your own admin role.',
            ], 422);
        }

        $this->enforceTargetRestrictions($authUser, $linkedUser, $selectedRole, 'update');

        if (!$linkedUser) {
            $linkedUser = User::query()->create([
                'name' => (string) TextCase::title(trim($member->first_name . ' ' . ($member->middle_name ? $member->middle_name . ' ' : '') . $member->last_name)),
                'email' => $member->email,
                'password' => Hash::make('password123'),
                'role_id' => $selectedRole->id,
                'finance_role' => null,
                'forum_role' => null,
            ]);
        } else {
            $linkedUser->role_id = $selectedRole->id;
        }

        $linkedUser->finance_role = $financeRole;
        $linkedUser->forum_role = in_array($forumRole, self::FORUM_ROLES, true) ? $forumRole : null;
        $linkedUser->save();

        if (!$member->user_id || $member->user_id !== $linkedUser->id) {
            $member->user_id = $linkedUser->id;
            $member->save();
        }

        return response()->json([
            'member' => $member->fresh()->load('user.role:id,name'),
            'user' => $linkedUser->fresh()->load('role:id,name'),
            'message' => 'Role assigned successfully to selected member.',
        ]);
    }

    public function updateRole(Request $request, User $user)
    {
        $this->ensureCanDelegateRoles($request);

        $validated = $request->validate([
            'role_id' => 'required|integer|exists:roles,id',
        ]);

        $selectedRole = Role::query()
            ->select(['id', 'name'])
            ->findOrFail($validated['role_id']);

        /** @var User $authUser */
        $authUser = $request->user()->loadMissing('role:id,name');

        if ($authUser->id === $user->id && $selectedRole->name !== 'admin') {
            return response()->json([
                'message' => 'You cannot remove your own admin role.',
            ], 422);
        }

        $this->enforceTargetRestrictions($authUser, $user, $selectedRole, 'update');

        $user->role_id = $validated['role_id'];
        $user->save();

        return response()->json(
            $user->fresh()->load('role:id,name')
        );
    }

    public function store(Request $request)
    {
        $this->ensureCanAccessUserManagement($request);

        /** @var User $actor */
        $actor = $request->user();
        $this->ensureCapability($actor, 'members.create');

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|max:255',
            'role_id' => 'required|integer|exists:roles,id',
        ]);

        $selectedRole = Role::query()->select(['id', 'name'])->findOrFail($validated['role_id']);
        $this->enforceTargetRestrictions($actor, null, $selectedRole, 'create');

        $created = User::query()->create([
            'name' => (string) TextCase::title($validated['name']),
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role_id' => $validated['role_id'],
        ])->load('role:id,name');

        return response()->json($created, 201);
    }

    public function update(Request $request, User $user)
    {
        $this->ensureCanAccessUserManagement($request);

        /** @var User $actor */
        $actor = $request->user();
        $this->ensureCapability($actor, 'members.update');

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:8|max:255',
            'role_id' => 'required|integer|exists:roles,id',
        ]);

        $selectedRole = Role::query()->select(['id', 'name'])->findOrFail($validated['role_id']);
        $this->enforceTargetRestrictions($actor, $user, $selectedRole, 'update');

        $user->name = (string) TextCase::title($validated['name']);
        $user->email = $validated['email'];
        $user->role_id = $validated['role_id'];
        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }
        $user->save();

        return response()->json($user->fresh()->load('role:id,name'));
    }

    public function destroy(Request $request, User $user)
    {
        $this->ensureCanAccessUserManagement($request);

        /** @var User $actor */
        $actor = $request->user();
        $this->ensureCapability($actor, 'members.delete');
        $this->enforceTargetRestrictions($actor, $user, null, 'delete');

        $user->delete();

        return response()->json(['message' => 'User deleted']);
    }
}
