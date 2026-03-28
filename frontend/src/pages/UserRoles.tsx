import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission, isAdminUser } from "../utils/auth";
import PasswordField from "../components/PasswordField";
import {
  PORTAL_DATA_REFRESH_EVENT,
  isPortalDataRefreshScope,
  parsePortalDataRefresh,
} from "../utils/portalRefresh";

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
    email?: string | null;
    recovery_email?: string | null;
    login_email_locked?: boolean;
    finance_role?: string | null;
    forum_role?: "forum_moderator" | null;
    must_change_password?: boolean;
    mobile_access_enabled?: boolean;
    mobile_chat_enabled?: boolean;
    role?: { id: number; name: string } | null;
  } | null;
}

interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  recovery_email?: string | null;
  login_email_locked?: boolean;
  finance_role: string | null;
  forum_role: "forum_moderator" | null;
  must_change_password?: boolean;
  mobile_access_enabled?: boolean;
  mobile_chat_enabled?: boolean;
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

type UserRolesTab = "members" | "assign" | "passwords" | "roles" | "conversion";

interface ConversionRow {
  member_id: number;
  user_id: number;
  member_name: string;
  current_login_email: string;
  current_recovery_email: string | null;
  member_email: string | null;
  proposed_alias: string | null;
  proposed_recovery_email: string | null;
  login_email_locked: boolean;
  status: string;
}

interface ConversionSummary {
  total_members: number;
  convertible: number;
  missing_name: number;
  missing_recovery_email: number;
  missing_user_link: number;
  already_alias: number;
  locked: number;
}

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
  const canManageUsers = isAdminUser(user) || hasPermission(user, "users.manage");
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
  const [selectedLoginEmail, setSelectedLoginEmail] = useState("");
  const [selectedUserLoginEmail, setSelectedUserLoginEmail] = useState("");
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
  const [loadingConversion, setLoadingConversion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generatedCredential, setGeneratedCredential] = useState<{ login: string; password: string } | null>(null);
  const [conversionRows, setConversionRows] = useState<ConversionRow[]>([]);
  const [conversionSummary, setConversionSummary] = useState<ConversionSummary | null>(null);
  const [isWindowVisible, setIsWindowVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");

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

  const fetchConversionPreview = useCallback(async () => {
    if (!canManageUsers) return;

    setLoadingConversion(true);
    setError("");

    try {
      const response = await api.get<{ summary: ConversionSummary; data: ConversionRow[] }>("/admin/identity-conversion/preview");
      setConversionSummary(response.data.summary);
      setConversionRows(response.data.data ?? []);
    } catch {
      setError("Unable to load conversion preview.");
    } finally {
      setLoadingConversion(false);
    }
  }, [canManageUsers]);

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
    if (!canManageUsers || activeTab !== "conversion") return;
    if (!conversionSummary && conversionRows.length === 0 && !loadingConversion) {
      void fetchConversionPreview();
    }
  }, [activeTab, canManageUsers, conversionRows.length, conversionSummary, fetchConversionPreview, loadingConversion]);

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
      setSelectedLoginEmail("");
      return;
    }

    const currentRoleId = selectedMember.user?.role?.id ?? "";
    setSelectedRoleId(currentRoleId);
    setSelectedForumRole(selectedMember.user?.forum_role ?? "");
    setSelectedLoginEmail(selectedMember.user?.email ?? "");
  }, [selectedMember]);

  useEffect(() => {
    setSelectedUserLoginEmail(selectedUser?.email ?? "");
  }, [selectedUser]);

  const refreshVisibleData = useCallback(() => {
    if (!isWindowVisible || saving) return;

    if (canDelegateRoles && membersLoaded) {
      void fetchMembers(page);
    }

    if (canResetPasswords && activeTab === "passwords" && usersLoaded) {
      void fetchUsers(usersPage);
    }
  }, [
    activeTab,
    canDelegateRoles,
    canResetPasswords,
    fetchMembers,
    fetchUsers,
    isWindowVisible,
    membersLoaded,
    page,
    saving,
    usersLoaded,
    usersPage,
  ]);

  useEffect(() => {
    const handleFocus = () => {
      setIsWindowVisible(true);
      window.setTimeout(() => {
        refreshVisibleData();
      }, 0);
    };

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsWindowVisible(visible);

      if (visible) {
        window.setTimeout(() => {
          refreshVisibleData();
        }, 0);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshVisibleData]);

  useEffect(() => {
    const handlePortalDataRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!isPortalDataRefreshScope(detail, ["members"])) return;
      refreshVisibleData();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "lgec:portal-data-refresh") return;
      const detail = parsePortalDataRefresh(event.newValue);
      if (!isPortalDataRefreshScope(detail, ["members"])) return;
      refreshVisibleData();
    };

    window.addEventListener(PORTAL_DATA_REFRESH_EVENT, handlePortalDataRefresh as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(PORTAL_DATA_REFRESH_EVENT, handlePortalDataRefresh as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshVisibleData]);

  const assignRole = async () => {
    if (!selectedMember || !selectedRoleId) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.put(`/admin/members/${selectedMember.id}/role`, {
        role_id: selectedRoleId,
        forum_role: selectedForumRole || null,
        login_email: selectedLoginEmail.trim() || null,
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

  const generateSelectedUserCredentials = async () => {
    if (!selectedUser || !canResetSelectedUserPassword) return;

    setSaving(true);
    setError("");
    setNotice("");
    setGeneratedCredential(null);

    try {
      const response = await api.post<{ message?: string; generated_password?: string; user?: AdminUserRow }>(
        `/admin/users/${selectedUser.id}/generate-credentials`,
      );
      const password = response.data.generated_password ?? "";
      if (password) {
        setGeneratedCredential({
          login: selectedUser.email,
          password,
        });
      }
      setNotice(response.data.message ?? `Generated credentials for ${selectedUser.name}.`);
      if (usersLoaded) {
        await fetchUsers(usersPage);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string })?.message;
        setError(message ?? "Failed to generate credentials.");
      } else {
        setError("Failed to generate credentials.");
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
    setSelectedUserLoginEmail("");
    setPassword("");
    setPasswordConfirmation("");
    setError("");
    setNotice("");
    setGeneratedCredential(null);
  };

  const saveSelectedUserAlias = async () => {
    if (!selectedUser || !selectedUser.role?.id || !selectedUserLoginEmail.trim()) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.put(`/admin/users/${selectedUser.id}`, {
        name: selectedUser.name,
        email: selectedUserLoginEmail.trim(),
        role_id: selectedUser.role.id,
        finance_role: selectedUser.finance_role,
        forum_role: selectedUser.forum_role,
        must_change_password: selectedUser.must_change_password ?? false,
        mobile_access_enabled: selectedUser.mobile_access_enabled ?? false,
        mobile_chat_enabled: selectedUser.mobile_chat_enabled ?? false,
      });
      setNotice(`Updated login alias for ${selectedUser.name}.`);
      if (usersLoaded) {
        await fetchUsers(usersPage);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const responseData = err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
        const firstValidationError = responseData?.errors ? Object.values(responseData.errors)[0]?.[0] : undefined;
        setError(firstValidationError ?? responseData?.message ?? "Failed to update login alias.");
      } else {
        setError("Failed to update login alias.");
      }
    } finally {
      setSaving(false);
    }
  };

  const runAliasConversion = async () => {
    if (!canManageUsers) return;
    if (!window.confirm("Run alias conversion now? This will convert existing login emails to @lgec.org aliases and lock affected accounts until credentials are generated.")) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await api.post<{
        message?: string;
        summary?: { converted?: number; skipped?: number; exceptions_count?: number };
      }>("/admin/identity-conversion/run", { confirm: true });
      const summary = response.data.summary;
      setNotice(
        response.data.message
          ?? `Alias conversion completed. Converted: ${summary?.converted ?? 0}, skipped: ${summary?.skipped ?? 0}, exceptions: ${summary?.exceptions_count ?? 0}.`,
      );
      await fetchConversionPreview();
      if (usersLoaded) {
        await fetchUsers(usersPage);
      }
      if (membersLoaded) {
        await fetchMembers(page);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string })?.message;
        setError(message ?? "Failed to run alias conversion.");
      } else {
        setError("Failed to run alias conversion.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!canDelegateRoles && !canResetPasswords && !canManageUsers) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Member Role Provisioning</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to manage roles, conversion, or user credentials.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="mb-2 font-heading text-4xl text-offwhite">Member Role Provisioning</h1>
        <p className="text-sm text-mist/85">
          Primary role controls portal access. `users.email` is the assigned login alias and `members.email` remains the real member contact/recovery email.
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
        {canManageUsers && (
          <button
            type="button"
            onClick={() => setActiveTab("conversion")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "conversion" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Conversion
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
                <table className="min-w-[780px] text-sm text-offwhite">
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
              <input
                aria-label="Assigned login alias"
                placeholder="firstname.lastname@lgec.org"
                value={selectedLoginEmail}
                onChange={(e) => setSelectedLoginEmail(e.target.value)}
                className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
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
                disabled={!selectedMember || !selectedRoleId || !selectedLoginEmail.trim() || saving}
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
                <table className="min-w-[760px] text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Select</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Login Alias</th>
                      <th className="px-4 py-3 text-left">Recovery Email</th>
                      <th className="px-4 py-3 text-left">Role</th>
                      <th className="px-4 py-3 text-left">Login Lock</th>
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
                          <td className="px-4 py-3">{item.recovery_email ?? "—"}</td>
                          <td className="px-4 py-3">{item.role?.name ? labelCase(item.role.name) : "No role"}</td>
                          <td className="px-4 py-3">{item.login_email_locked ? "Locked" : "Open"}</td>
                          <td className="px-4 py-3">{canResetTarget ? "Allowed" : "Blocked"}</td>
                        </tr>
                      );
                    })}

                    {loadingUsers && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-mist/80">
                          Loading users...
                        </td>
                      </tr>
                    )}

                    {!loadingUsers && adminUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-mist/80">
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
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-mist/80">
                  Login lock: <span className="text-offwhite">{selectedUser.login_email_locked ? "Locked" : "Open"}</span>
                </p>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    aria-label="Assigned login alias"
                    placeholder="firstname.lastname@lgec.org"
                    value={selectedUserLoginEmail}
                    onChange={(e) => setSelectedUserLoginEmail(e.target.value)}
                    className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                  <button
                    type="button"
                    onClick={() => void saveSelectedUserAlias()}
                    disabled={!selectedUserLoginEmail.trim() || saving}
                    className="btn-secondary disabled:opacity-45"
                  >
                    {saving ? "Saving..." : "Save Login Alias"}
                  </button>
                </div>
                <p className="text-xs text-mist/80">
                  Assign the recognizable `@lgec.org` login here. Member recovery stays on the linked member email.
                </p>

                {!canResetSelectedUserPassword ? (
                  <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    This account cannot be reset from your role. Admins are blocked from superadmin and fellow admin accounts.
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <PasswordField
                      ariaLabel="New password"
                      placeholder="New password"
                      value={password}
                      onChange={setPassword}
                      className="rounded-md border border-white/25 bg-white/10 px-3 py-2 pr-12 text-offwhite"
                    />
                    <PasswordField
                      ariaLabel="Confirm new password"
                      placeholder="Confirm new password"
                      value={passwordConfirmation}
                      onChange={setPasswordConfirmation}
                      className="rounded-md border border-white/25 bg-white/10 px-3 py-2 pr-12 text-offwhite"
                    />
                    <div className="md:col-span-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void generateSelectedUserCredentials()}
                        disabled={saving}
                        className="btn-secondary disabled:opacity-45"
                      >
                        {saving ? "Saving..." : "Generate Credentials"}
                      </button>
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
                {generatedCredential && (
                  <div className="rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold-soft">
                    <p>Temporary credential generated (show once):</p>
                    <p className="mt-1">Login: <span className="text-offwhite">{generatedCredential.login}</span></p>
                    <p>Password: <span className="text-offwhite">{generatedCredential.password}</span></p>
                  </div>
                )}
                {!canResetSelectedUserPassword && (
                  <button
                    type="button"
                    onClick={resetPasswordSelection}
                    disabled={saving}
                    className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10 disabled:opacity-45"
                  >
                    Cancel
                  </button>
                )}
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

      {activeTab === "conversion" && canManageUsers && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gold/30 bg-white/10 p-4">
            <p className="text-sm text-mist/85">
              Run alias conversion to enforce `firstname.lastname@lgec.org` login and move existing real emails to recovery.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void fetchConversionPreview()}
                className="btn-secondary"
                disabled={loadingConversion || saving}
              >
                {loadingConversion ? "Loading..." : "Refresh Preview"}
              </button>
              <button
                type="button"
                onClick={() => void runAliasConversion()}
                className="btn-primary disabled:opacity-45"
                disabled={loadingConversion || saving}
              >
                {saving ? "Running..." : "Run Conversion"}
              </button>
            </div>
          </div>

          {conversionSummary && (
            <div className="grid gap-3 md:grid-cols-3">
              <article className="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-offwhite">
                <p>Total Members</p>
                <p className="mt-1 text-xl font-semibold text-gold-soft">{conversionSummary.total_members}</p>
              </article>
              <article className="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-offwhite">
                <p>Convertible</p>
                <p className="mt-1 text-xl font-semibold text-gold-soft">{conversionSummary.convertible}</p>
              </article>
              <article className="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-offwhite">
                <p>Locked</p>
                <p className="mt-1 text-xl font-semibold text-gold-soft">{conversionSummary.locked}</p>
              </article>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
            <table className="min-w-[980px] text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-3 py-2 text-left">Member</th>
                  <th className="px-3 py-2 text-left">Current Login</th>
                  <th className="px-3 py-2 text-left">Current Recovery</th>
                  <th className="px-3 py-2 text-left">Proposed Alias</th>
                  <th className="px-3 py-2 text-left">Proposed Recovery</th>
                  <th className="px-3 py-2 text-left">Lock</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingConversion && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-mist/80">Loading conversion preview...</td>
                  </tr>
                )}
                {!loadingConversion && conversionRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-mist/80">No conversion rows available.</td>
                  </tr>
                )}
                {!loadingConversion && conversionRows.map((row) => (
                  <tr key={`${row.member_id}-${row.user_id}`} className="border-b border-white/15">
                    <td className="px-3 py-2">{row.member_name}</td>
                    <td className="px-3 py-2">{row.current_login_email}</td>
                    <td className="px-3 py-2">{row.current_recovery_email ?? row.member_email ?? "—"}</td>
                    <td className="px-3 py-2">{row.proposed_alias ?? "—"}</td>
                    <td className="px-3 py-2">{row.proposed_recovery_email ?? "—"}</td>
                    <td className="px-3 py-2">{row.login_email_locked ? "Locked" : "Open"}</td>
                    <td className="px-3 py-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
