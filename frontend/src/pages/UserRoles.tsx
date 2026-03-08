import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission, isAdminUser } from "../utils/auth";

interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions?: Array<{ id: number; name: string }>;
}

interface MemberRow {
  id: number;
  member_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  membership_status: string;
  user_id: number | null;
  user?: {
    id: number;
    forum_role?: "forum_moderator" | null;
    role?: { id: number; name: string } | null;
  } | null;
}

interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  finance_role: string | null;
  forum_role: "forum_moderator" | null;
  role?: { id: number; name: string } | null;
  created_at: string;
}

interface PaginatedMembers {
  data: MemberRow[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

interface PaginatedUsers {
  data: AdminUserRow[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

type UserRolesTab = "members" | "assign" | "passwords" | "roles";

const ROLES_PER_PAGE = 6;

function labelCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function isManuallyAssignableRole(roleName: string): boolean {
  return roleName !== "applicant";
}

function fullName(member: MemberRow): string {
  return `${member.first_name} ${member.middle_name ? `${member.middle_name} ` : ""}${member.last_name}`;
}

function extractRoleName(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const role = (user as { role?: unknown }).role;
  if (!role || typeof role !== "object") return null;

  const maybeName = (role as { name?: unknown }).name;
  return typeof maybeName === "string" ? maybeName : null;
}

export default function UserRoles() {
  const { user } = useAuth();
  const canDelegateRoles = isAdminUser(user) || hasPermission(user, "roles.delegate");
  const canResetPasswords = isAdminUser(user) || hasPermission(user, "users.password.reset");
  const actorRoleName = extractRoleName(user);
  const isSuperadmin = actorRoleName === "superadmin";

  const [activeTab, setActiveTab] = useState<UserRolesTab>("members");
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | "">("");
  const [selectedForumRole, setSelectedForumRole] = useState<"" | "forum_moderator">("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalMembers, setTotalMembers] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLastPage, setUsersLastPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [rolesPage, setRolesPage] = useState(1);
  const [rolesLastPage, setRolesLastPage] = useState(1);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedMember = useMemo(
    () => members.find((item) => item.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const selectedUser = useMemo(
    () => adminUsers.find((item) => item.id === selectedUserId) ?? null,
    [adminUsers, selectedUserId],
  );

  const assignablePrimaryRoles = useMemo(() => {
    if (isSuperadmin) {
      return roles.filter((role) => isManuallyAssignableRole(role.name));
    }

    return roles.filter((role) => role.name !== "superadmin" && role.name !== "admin" && isManuallyAssignableRole(role.name));
  }, [isSuperadmin, roles]);

  const pagedRoles = useMemo(() => {
    const start = (rolesPage - 1) * ROLES_PER_PAGE;
    return roles.slice(start, start + ROLES_PER_PAGE);
  }, [roles, rolesPage]);

  const canResetSelectedUserPassword = useMemo(() => {
    if (!canResetPasswords || !selectedUser) return false;

    const targetRole = selectedUser.role?.name ?? null;
    if (selectedUser.id === (user as { id?: number } | null)?.id) {
      return false;
    }

    if (isSuperadmin) {
      return true;
    }

    return targetRole !== "superadmin" && targetRole !== "admin";
  }, [canResetPasswords, isSuperadmin, selectedUser, user]);

  const fetchMembers = useCallback(async (nextPage = 1) => {
    if (!canDelegateRoles) {
      return;
    }

    setLoadingMembers(true);
    setError("");

    try {
      const membersRes = await api.get<PaginatedMembers>("/admin/members", { params: { search, page: nextPage } });
      setMembers(membersRes.data.data);
      setLastPage(membersRes.data.last_page ?? 1);
      setTotalMembers(membersRes.data.total ?? membersRes.data.data.length);
      setPage(membersRes.data.current_page ?? nextPage);
      setMembersLoaded(true);
    } catch {
      setError("Unable to load members.");
    } finally {
      setLoadingMembers(false);
    }
  }, [canDelegateRoles, search]);

  const fetchUsers = useCallback(async (nextPage = 1) => {
    if (!canResetPasswords) {
      return;
    }

    setLoadingUsers(true);
    setError("");

    try {
      const usersRes = await api.get<PaginatedUsers>("/admin/users", { params: { search: userSearch, page: nextPage } });
      setAdminUsers(usersRes.data.data);
      setUsersLastPage(usersRes.data.last_page ?? 1);
      setTotalUsers(usersRes.data.total ?? usersRes.data.data.length);
      setUsersPage(usersRes.data.current_page ?? nextPage);
      setUsersLoaded(true);
    } catch {
      setError("Unable to load users.");
    } finally {
      setLoadingUsers(false);
    }
  }, [canResetPasswords, userSearch]);

  const fetchRoles = useCallback(async () => {
    if (!canDelegateRoles) {
      return;
    }

    setLoadingRoles(true);
    setError("");

    try {
      const rolesRes = await api.get<Role[]>("/admin/roles");
      setRoles(rolesRes.data);
      const computedLastPage = Math.max(1, Math.ceil(rolesRes.data.length / ROLES_PER_PAGE));
      setRolesLastPage(computedLastPage);
      setRolesPage(1);
      setRolesLoaded(true);
    } catch {
      setError("Unable to load roles.");
    } finally {
      setLoadingRoles(false);
    }
  }, [canDelegateRoles]);

  useEffect(() => {
    if (!canDelegateRoles || membersLoaded) return;
    void fetchMembers(1);
  }, [canDelegateRoles, fetchMembers, membersLoaded]);

  useEffect(() => {
    if (!canResetPasswords || activeTab !== "passwords" || usersLoaded) return;
    void fetchUsers(1);
  }, [activeTab, canResetPasswords, fetchUsers, usersLoaded]);

  useEffect(() => {
    if (!canDelegateRoles) return;
    if ((activeTab === "assign" || activeTab === "roles") && !rolesLoaded) {
      void fetchRoles();
    }
  }, [activeTab, canDelegateRoles, fetchRoles, rolesLoaded]);

  useEffect(() => {
    if (!selectedMemberId) return;
    if (!members.some((item) => item.id === selectedMemberId)) {
      setSelectedMemberId(null);
    }
  }, [members, selectedMemberId]);

  useEffect(() => {
    if (!selectedUserId) return;
    if (!adminUsers.some((item) => item.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [adminUsers, selectedUserId]);

  useEffect(() => {
    if (!selectedMember) {
      setSelectedRoleId("");
      setSelectedForumRole("");
      return;
    }

    const currentRoleId = selectedMember.user?.role?.id ?? "";
    setSelectedRoleId(currentRoleId);
    setSelectedForumRole(selectedMember.user?.forum_role ?? "");
  }, [selectedMember]);

  const assignRole = async () => {
    if (!selectedMember || !selectedRoleId) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.put(`/admin/members/${selectedMember.id}/role`, {
        role_id: selectedRoleId,
        forum_role: selectedForumRole || null,
      });
      setNotice(`Assigned role to ${fullName(selectedMember)}.`);
      if (membersLoaded) {
        await fetchMembers(page);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string })?.message;
        setError(message ?? "Failed to assign role.");
      } else {
        setError("Failed to assign role.");
      }
    } finally {
      setSaving(false);
    }
  };

  const resetSelectedUserPassword = async () => {
    if (!selectedUser || !canResetSelectedUserPassword) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.put(`/admin/users/${selectedUser.id}/password`, {
        password,
        password_confirmation: passwordConfirmation,
      });
      setPassword("");
      setPasswordConfirmation("");
      setNotice(`Updated password for ${selectedUser.name}.`);
      if (usersLoaded) {
        await fetchUsers(usersPage);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const responseData = err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
        const firstValidationError = responseData?.errors ? Object.values(responseData.errors)[0]?.[0] : undefined;
        setError(firstValidationError ?? responseData?.message ?? "Failed to update password.");
      } else {
        setError("Failed to update password.");
      }
    } finally {
      setSaving(false);
    }
  };

  const resetRoleSelection = () => {
    setSelectedMemberId(null);
    setSelectedRoleId("");
    setSelectedForumRole("");
    setError("");
    setNotice("");
  };

  const resetPasswordSelection = () => {
    setSelectedUserId(null);
    setPassword("");
    setPasswordConfirmation("");
    setError("");
    setNotice("");
  };

  if (!canDelegateRoles && !canResetPasswords) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Member Role Provisioning</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to manage roles or reset user passwords.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="mb-2 font-heading text-4xl text-offwhite">Member Role Provisioning</h1>
        <p className="text-sm text-mist/85">
          Primary role controls portal access. Superadmin manages the platform account hierarchy. Admin password resets are blocked from superadmin and peer admin targets.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {notice && (
        <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">
          {notice}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {canDelegateRoles && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab("members")}
              className={`rounded-md border px-4 py-2 text-sm ${activeTab === "members" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
            >
              Members
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("assign")}
              className={`rounded-md border px-4 py-2 text-sm ${activeTab === "assign" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
            >
              Assign
            </button>
          </>
        )}
        {canResetPasswords && (
          <button
            type="button"
            onClick={() => setActiveTab("passwords")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "passwords" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Passwords
          </button>
        )}
        {canDelegateRoles && (
          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "roles" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Roles
          </button>
        )}
      </div>

      {activeTab === "members" && canDelegateRoles && (
        <>
          <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-white/20 bg-white/10 p-4">
            <input
              aria-label="Search members by name, member number, or email"
              placeholder="Search members (wildcard by name/member no./email)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <button
              type="button"
              onClick={() => {
                setPage(1);
                void fetchMembers(1);
              }}
              className="btn-secondary"
            >
              Search
            </button>
          </div>

          {!membersLoaded ? (
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-8 text-center text-sm text-mist/80">
              Loading members...
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Select</th>
                      <th className="px-4 py-3 text-left">Member No.</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Primary Role</th>
                      <th className="px-4 py-3 text-left">Forum Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loadingMembers && members.map((item) => (
                      <tr key={item.id} className={`border-b border-white/15 ${selectedMemberId === item.id ? "bg-gold/10" : ""}`}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedMemberId(item.id)}
                            className="rounded-md border border-white/30 px-2 py-1 text-xs"
                          >
                            {selectedMemberId === item.id ? "Selected" : "Select"}
                          </button>
                        </td>
                        <td className="px-4 py-3">{item.member_number}</td>
                        <td className="px-4 py-3">{fullName(item)}</td>
                        <td className="px-4 py-3">{item.email ?? "No email"}</td>
                        <td className="px-4 py-3">{item.user?.role?.name ? labelCase(item.user.role.name) : "No access"}</td>
                        <td className="px-4 py-3">{item.user?.forum_role ? labelCase(item.user.forum_role) : "-"}</td>
                      </tr>
                    ))}

                    {loadingMembers && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-mist/80">
                          Loading members...
                        </td>
                      </tr>
                    )}

                    {!loadingMembers && members.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-mist/80">
                          No members found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-mist/80">
                <p>Total members: {totalMembers} | Page {page} of {lastPage}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loadingMembers}
                    onClick={() => void fetchMembers(Math.max(1, page - 1))}
                    className="rounded-md border border-white/30 px-2 py-1 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= lastPage || loadingMembers}
                    onClick={() => void fetchMembers(Math.min(lastPage, page + 1))}
                    className="rounded-md border border-white/30 px-2 py-1 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "assign" && canDelegateRoles && (
        <div className="rounded-xl border border-gold/30 bg-white/10 p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-mist/85">
              Selected member: {selectedMember ? fullName(selectedMember) : "None"}
            </p>
            <button
              type="button"
              onClick={() => void fetchRoles()}
              className="btn-secondary"
              disabled={loadingRoles}
            >
              {loadingRoles ? "Loading..." : "Refresh Roles"}
            </button>
          </div>

          {!selectedMember ? (
            <p className="rounded-md border border-white/20 bg-white/5 px-4 py-3 text-sm text-mist/80">
              Select a member from the Members tab before assigning roles.
            </p>
          ) : !rolesLoaded ? (
            <p className="rounded-md border border-white/20 bg-white/5 px-4 py-3 text-sm text-mist/80">
              Loading assignable roles...
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Select primary role"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              >
                <option value="" disabled style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  Select Primary Role
                </option>
                {assignablePrimaryRoles.map((role) => (
                  <option key={role.id} value={role.id} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {labelCase(role.name)}
                  </option>
                ))}
              </select>

              <select
                aria-label="Select forum role"
                value={selectedForumRole}
                onChange={(e) => setSelectedForumRole(e.target.value as "" | "forum_moderator")}
                disabled={!selectedRoleId}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite disabled:opacity-45"
              >
                <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  No Forum Role
                </option>
                <option value="forum_moderator" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  Forum Moderator
                </option>
              </select>

              <button
                type="button"
                onClick={() => void assignRole()}
                disabled={!selectedMember || !selectedRoleId || saving}
                className="btn-primary disabled:opacity-45"
              >
                {saving ? "Saving..." : "Save Roles"}
              </button>
              <button
                type="button"
                onClick={resetRoleSelection}
                disabled={saving}
                className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10 disabled:opacity-45"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "passwords" && canResetPasswords && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-xl border border-white/20 bg-white/10 p-4">
            <input
              aria-label="Search users by name or email"
              placeholder="Search users by name or email"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <button
              type="button"
              onClick={() => {
                setUsersPage(1);
                void fetchUsers(1);
              }}
              className="btn-secondary"
            >
              Search
            </button>
          </div>

          {!usersLoaded ? (
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-8 text-center text-sm text-mist/80">
              Loading user accounts...
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Select</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Role</th>
                      <th className="px-4 py-3 text-left">Password Reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loadingUsers && adminUsers.map((item) => {
                      const targetRole = item.role?.name ?? null;
                      const actorId = (user as { id?: number } | null)?.id;
                      const canResetTarget = isSuperadmin
                        ? item.id !== actorId
                        : item.id !== actorId && targetRole !== "superadmin" && targetRole !== "admin";

                      return (
                        <tr key={item.id} className={`border-b border-white/15 ${selectedUserId === item.id ? "bg-gold/10" : ""}`}>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setSelectedUserId(item.id)}
                              className="rounded-md border border-white/30 px-2 py-1 text-xs"
                            >
                              {selectedUserId === item.id ? "Selected" : "Select"}
                            </button>
                          </td>
                          <td className="px-4 py-3">{item.name}</td>
                          <td className="px-4 py-3">{item.email}</td>
                          <td className="px-4 py-3">{item.role?.name ? labelCase(item.role.name) : "No role"}</td>
                          <td className="px-4 py-3">{canResetTarget ? "Allowed" : "Blocked"}</td>
                        </tr>
                      );
                    })}

                    {loadingUsers && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-mist/80">
                          Loading users...
                        </td>
                      </tr>
                    )}

                    {!loadingUsers && adminUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-mist/80">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-mist/80">
                <p>Total users: {totalUsers} | Page {usersPage} of {usersLastPage}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={usersPage <= 1 || loadingUsers}
                    onClick={() => void fetchUsers(Math.max(1, usersPage - 1))}
                    className="rounded-md border border-white/30 px-2 py-1 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={usersPage >= usersLastPage || loadingUsers}
                    onClick={() => void fetchUsers(Math.min(usersLastPage, usersPage + 1))}
                    className="rounded-md border border-white/30 px-2 py-1 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="rounded-xl border border-gold/30 bg-white/10 p-4">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-mist/85">
                Selected user: {selectedUser ? `${selectedUser.name} (${selectedUser.role?.name ? labelCase(selectedUser.role.name) : "No role"})` : "None"}
              </p>
            </div>

            {!selectedUser ? (
              <p className="rounded-md border border-white/20 bg-white/5 px-4 py-3 text-sm text-mist/80">
                Select a user from the list before changing a password.
              </p>
            ) : !canResetSelectedUserPassword ? (
              <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                This account cannot be reset from your role. Admins are blocked from superadmin and fellow admin accounts.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="password"
                  aria-label="New password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
                <input
                  type="password"
                  aria-label="Confirm new password"
                  placeholder="Confirm new password"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
                <div className="md:col-span-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void resetSelectedUserPassword()}
                    disabled={!password || password !== passwordConfirmation || saving}
                    className="btn-primary disabled:opacity-45"
                  >
                    {saving ? "Saving..." : "Update Password"}
                  </button>
                  <button
                    type="button"
                    onClick={resetPasswordSelection}
                    disabled={saving}
                    className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10 disabled:opacity-45"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "roles" && canDelegateRoles && (
        <>
          <div className="mb-4 rounded-xl border border-white/20 bg-white/10 p-4">
            <button
              type="button"
              onClick={() => void fetchRoles()}
              className="btn-secondary"
              disabled={loadingRoles}
            >
              {loadingRoles ? "Loading..." : "Refresh Roles"}
            </button>
          </div>

          {!rolesLoaded ? (
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-8 text-center text-sm text-mist/80">
              Loading roles...
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                {pagedRoles.map((role) => (
                  <article key={role.id} className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <p className="text-sm font-semibold uppercase tracking-wide text-gold-soft">{labelCase(role.name)}</p>
                    <p className="mt-1 text-xs text-mist/80">{role.description ?? "No description."}</p>
                    <p className="mt-3 text-xs text-mist/70">Permissions</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(role.permissions ?? []).map((permission) => (
                        <span
                          key={`${role.id}-${permission.id}`}
                          className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-offwhite"
                        >
                          {permission.name}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-mist/80">
                <p>Total roles: {roles.length} | Page {rolesPage} of {rolesLastPage}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={rolesPage <= 1 || loadingRoles}
                    onClick={() => setRolesPage((current) => Math.max(1, current - 1))}
                    className="rounded-md border border-white/30 px-2 py-1 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={rolesPage >= rolesLastPage || loadingRoles}
                    onClick={() => setRolesPage((current) => Math.min(rolesLastPage, current + 1))}
                    className="rounded-md border border-white/30 px-2 py-1 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
