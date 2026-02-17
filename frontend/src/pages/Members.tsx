import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "../services/api";
import MemberModal from "../components/MemberModal";
import DeleteModal from "../components/DeleteModal";
import type { Member, MemberApplication, MemberForm, ValidationErrors } from "../types/member";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";

export default function Members() {
  const { user } = useAuth();
  const canViewMembers = hasPermission(user, "members.view");
  const canApproveApplications = hasPermission(user, "members.create");
  const canEditMembers = hasPermission(user, "members.update");
  const canDeleteMembers = hasPermission(user, "members.delete");

  const [members, setMembers] = useState<Member[]>([]);
  const [applications, setApplications] = useState<MemberApplication[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  const [editing, setEditing] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState<Member | null>(null);

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchMembers = useCallback(async (page = 1, filters?: { search: string; status: string }) => {
    const activeFilters = filters ?? { search, status };
    const res = await api.get("/members", {
      params: { page, search: activeFilters.search, status: activeFilters.status },
    });

    setMembers(res.data.data);
    setCurrentPage(res.data.current_page);
    setLastPage(res.data.last_page);
  }, [search, status]);

  const fetchApplications = useCallback(async () => {
    if (!canApproveApplications) return;
    const res = await api.get("/member-applications", { params: { status: "pending_approval" } });
    setApplications((res.data?.data ?? []) as MemberApplication[]);
  }, [canApproveApplications]);

  useEffect(() => {
    if (!canViewMembers) return;

    setError("");
    void fetchMembers(1, { search: "", status: "" }).catch(() => {
      setError("Unable to load members.");
    });

    if (canApproveApplications) {
      void fetchApplications().catch(() => {
        setError("Unable to load member applications.");
      });
    }
  }, [canViewMembers, canApproveApplications, fetchApplications, fetchMembers]);

  async function handleUpdate(id: number, form: MemberForm) {
    try {
      setErrors({});
      setError("");
      await api.put(`/members/${id}`, form);
      setEditing(null);
      setNotice("Member updated.");
      void fetchMembers(currentPage);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setErrors((err.response?.data as { errors?: ValidationErrors })?.errors || {});
        const message = (err.response?.data as { message?: string } | undefined)?.message;
        if (message) setError(message);
      }
    }
  }

  async function handleDelete(id: number) {
    setError("");
    await api.delete(`/members/${id}`);
    setDeleting(null);
    setNotice("Member deleted.");
    void fetchMembers(currentPage);
  }

  async function approveApplication(applicationId: number) {
    try {
      setError("");
      await api.post(`/member-applications/${applicationId}/approve`);
      setNotice("Application approved and member created.");
      await fetchApplications();
      await fetchMembers(1, { search, status });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(((err.response?.data as { message?: string } | undefined)?.message) ?? "Failed to approve application.");
      }
    }
  }

  async function rejectApplication(applicationId: number) {
    try {
      setError("");
      await api.post(`/member-applications/${applicationId}/reject`, {
        reason: "Rejected during review.",
      });
      setNotice("Application rejected.");
      await fetchApplications();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(((err.response?.data as { message?: string } | undefined)?.message) ?? "Failed to reject application.");
      }
    }
  }

  if (!canViewMembers) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Members Management</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to view members.
        </p>
      </section>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-4xl text-offwhite">Members Management</h1>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {notice && (
        <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">
          {notice}
        </p>
      )}

      {canApproveApplications && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
          <div className="border-b border-white/15 px-4 py-3">
            <h2 className="font-heading text-2xl text-offwhite">Pending Member Applications (Verified)</h2>
          </div>
          <table className="min-w-full text-sm text-offwhite">
            <thead className="bg-navy/70 text-gold-soft">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Requested Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-white/15">
                  <td className="px-4 py-3">{app.first_name} {app.middle_name ? `${app.middle_name} ` : ""}{app.last_name}</td>
                  <td className="px-4 py-3">{app.email}</td>
                  <td className="px-4 py-3 capitalize">{app.membership_status}</td>
                  <td className="px-4 py-3 space-x-3">
                    <button
                      onClick={() => void approveApplication(app.id)}
                      className="rounded-md border border-green-400/50 px-3 py-1.5 text-xs text-green-300 hover:bg-green-500/10"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void rejectApplication(app.id)}
                      className="rounded-md border border-red-400/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-mist/80">No pending verified applications.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-6 grid gap-4 rounded-xl border border-white/20 bg-white/10 p-4 md:grid-cols-[1fr_220px_auto]">
        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
        >
          <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All</option>
          <option value="active" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Active</option>
          <option value="inactive" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Inactive</option>
          <option value="applicant" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Applicant</option>
        </select>
        <button onClick={() => void fetchMembers(1)} className="btn-primary">Apply</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
        <table className="min-w-full text-sm text-offwhite">
          <thead className="bg-navy/70 text-gold-soft">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-white/15">
                <td className="px-4 py-3">{m.member_number}</td>
                <td className="px-4 py-3">{m.first_name} {m.middle_name ? `${m.middle_name} ` : ""}{m.last_name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs capitalize text-gold-soft">
                    {m.membership_status}
                  </span>
                </td>
                <td className="px-4 py-3 space-x-3">
                  {canEditMembers && (
                    <button onClick={() => setEditing(m)} className="text-gold hover:text-gold-soft hover:underline">
                      Edit
                    </button>
                  )}
                  {canDeleteMembers && (
                    <button onClick={() => setDeleting(m)} className="text-red-300 hover:underline">
                      Delete
                    </button>
                  )}
                  {!canEditMembers && !canDeleteMembers && (
                    <span className="text-xs text-mist/70">Read only</span>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-mist/80">No members found for the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4 text-sm text-mist/90">
        <button
          disabled={currentPage === 1}
          onClick={() => void fetchMembers(currentPage - 1)}
          className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
        >
          Prev
        </button>
        <span>Page {currentPage} of {lastPage}</span>
        <button
          disabled={currentPage === lastPage}
          onClick={() => void fetchMembers(currentPage + 1)}
          className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
        >
          Next
        </button>
      </div>

      {editing && canEditMembers && (
        <MemberModal
          member={editing}
          errors={errors}
          onClose={() => setEditing(null)}
          onSubmit={(data) => handleUpdate(editing.id, data)}
        />
      )}

      {deleting && canDeleteMembers && (
        <DeleteModal
          member={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void handleDelete(deleting.id)}
        />
      )}
    </div>
  );
}
