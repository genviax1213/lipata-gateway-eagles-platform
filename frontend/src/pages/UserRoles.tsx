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
    finance_role?: "auditor" | "treasurer" | null;
    forum_role?: "forum_moderator" | null;
    role?: { id: number; name: string } | null;
  } | null;
}

interface PaginatedMembers {
  data: MemberRow[];
}

function labelCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fullName(member: MemberRow): string {
  return `${member.first_name} ${member.middle_name ? `${member.middle_name} ` : ""}${member.last_name}`;
}

export default function UserRoles() {
  const { user } = useAuth();
  const canDelegateRoles = isAdminUser(user) || hasPermission(user, "roles.delegate");

  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | "">("");
  const [selectedFinanceRole, setSelectedFinanceRole] = useState<"" | "auditor" | "treasurer">("");
  const [selectedForumRole, setSelectedForumRole] = useState<"" | "forum_moderator">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedMember = useMemo(
    () => members.find((item) => item.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const assignablePrimaryRoles = useMemo(
    () => roles.filter((role) => role.name !== "auditor" && role.name !== "treasurer"),
    [roles],
  );

  const selectedRoleName = useMemo(
    () => assignablePrimaryRoles.find((item) => item.id === selectedRoleId)?.name ?? "",
    [assignablePrimaryRoles, selectedRoleId],
  );

  const fetchData = useCallback(async () => {
    if (!canDelegateRoles) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [rolesRes, membersRes] = await Promise.all([
        api.get<Role[]>("/admin/roles"),
        api.get<PaginatedMembers>("/admin/members", { params: { search } }),
      ]);

      setRoles(rolesRes.data);
      setMembers(membersRes.data.data);
    } catch {
      setError("Unable to load roles and members.");
    } finally {
      setLoading(false);
    }
  }, [canDelegateRoles, search]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedMember) {
      setSelectedRoleId("");
      setSelectedFinanceRole("");
      setSelectedForumRole("");
      return;
    }

    const currentRoleId = selectedMember.user?.role?.id ?? "";
    setSelectedRoleId(currentRoleId);
    setSelectedFinanceRole(selectedMember.user?.finance_role ?? "");
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
        finance_role: selectedFinanceRole || null,
        forum_role: selectedForumRole || null,
      });
      setNotice(`Assigned role to ${fullName(selectedMember)}.`);
      await fetchData();
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

  const resetRoleSelection = () => {
    setSelectedMemberId(null);
    setSelectedRoleId("");
    setSelectedFinanceRole("");
    setSelectedForumRole("");
    setError("");
    setNotice("");
  };

  if (!canDelegateRoles) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Member Role Provisioning</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to manage member roles.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="mb-2 font-heading text-4xl text-offwhite">Member Role Provisioning</h1>
        <p className="text-sm text-mist/85">
          Primary role is for portal access. Any member account can be assigned one secondary finance role (Auditor/Treasurer) and one forum role (Forum Moderator).
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

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          aria-label="Search members by name, member number, or email"
          placeholder="Search members (wildcard by name/member no./email)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
        />
        <button type="button" onClick={() => void fetchData()} className="btn-secondary">
          Search
        </button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {roles.map((role) => (
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

      <div className="mb-5 rounded-xl border border-gold/30 bg-white/10 p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.22em] text-gold-soft">Assign Roles</p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-mist/85">
            Selected member: {selectedMember ? fullName(selectedMember) : "None"}
          </p>
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
            aria-label="Select finance role"
            value={selectedFinanceRole}
            onChange={(e) => setSelectedFinanceRole(e.target.value as "" | "auditor" | "treasurer")}
            disabled={!selectedRoleName}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite disabled:opacity-45"
          >
            <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
              No Finance Role
            </option>
            <option value="treasurer" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
              Treasurer
            </option>
            <option value="auditor" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
              Auditor
            </option>
          </select>

          <select
            aria-label="Select forum role"
            value={selectedForumRole}
            onChange={(e) => setSelectedForumRole(e.target.value as "" | "forum_moderator")}
            disabled={!selectedRoleName}
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
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
        <table className="min-w-full text-sm text-offwhite">
          <thead className="bg-navy/70 text-gold-soft">
            <tr>
              <th className="px-4 py-3 text-left">Select</th>
              <th className="px-4 py-3 text-left">Member No.</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Primary Role</th>
              <th className="px-4 py-3 text-left">Finance Role</th>
              <th className="px-4 py-3 text-left">Forum Role</th>
            </tr>
          </thead>
          <tbody>
            {!loading && members.map((item) => (
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
                <td className="px-4 py-3">{item.user?.finance_role ? labelCase(item.user.finance_role) : "-"}</td>
                <td className="px-4 py-3">{item.user?.forum_role ? labelCase(item.user.forum_role.replace("_", " ")) : "-"}</td>
              </tr>
            ))}

            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-mist/80">
                  Loading members and roles...
                </td>
              </tr>
            )}

            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-mist/80">
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
