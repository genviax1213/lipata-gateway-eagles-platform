import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "../services/api";
import MemberModal from "../components/MemberModal";
import DeleteModal from "../components/DeleteModal";
import type { Member, Applicant, MemberForm, ValidationErrors } from "../types/member";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";

type MembersTab = "members" | "applications";

export default function Members() {
  const { user } = useAuth();
  const canViewMembers = hasPermission(user, "members.view");
  const canViewApplications = hasPermission(user, "applications.view") || hasPermission(user, "applications.review");
  const canApproveApplications = hasPermission(user, "applications.review");
  const canEditMembers = hasPermission(user, "members.update");
  const canDeleteMembers = hasPermission(user, "members.delete");

  const [activeTab, setActiveTab] = useState<MembersTab>("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [applications, setApplications] = useState<Applicant[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [emailVerifiedFilter, setEmailVerifiedFilter] = useState("");
  const [passwordSetFilter, setPasswordSetFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [applicationsLastPage, setApplicationsLastPage] = useState(1);

  const [editing, setEditing] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState<Member | null>(null);

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isWindowVisible, setIsWindowVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");

  const fetchMembers = useCallback(async (page = 1, filters?: { search: string; email_verified: string; password_set: string }) => {
    setError("");
    const activeFilters = filters ?? { search, email_verified: emailVerifiedFilter, password_set: passwordSetFilter };
    const res = await api.get("/members", {
      params: {
        page,
        search: activeFilters.search,
        email_verified: activeFilters.email_verified,
        password_set: activeFilters.password_set,
      },
    });

    setMembers(res.data.data);
    setCurrentPage(res.data.current_page);
    setLastPage(res.data.last_page);
    setMembersLoaded(true);
  }, [emailVerifiedFilter, passwordSetFilter, search]);

  const fetchApplications = useCallback(async (page = 1) => {
    if (!canViewApplications) return;
    const res = await api.get("/applicants", { params: { status: "under_review", page } });
    setApplications((res.data?.data ?? []) as Applicant[]);
    setApplicationsPage(Number(res.data?.current_page ?? 1));
    setApplicationsLastPage(Number(res.data?.last_page ?? 1));
    setApplicationsLoaded(true);
  }, [canViewApplications]);

  const refreshVisibleData = useCallback(() => {
    if (!isWindowVisible) return;

    if (activeTab === "members" && canViewMembers && membersLoaded && !editing && !deleting) {
      void fetchMembers(currentPage);
    }

    if (activeTab === "applications" && canViewApplications && applicationsLoaded) {
      void fetchApplications(applicationsPage);
    }
  }, [
    activeTab,
    applicationsLoaded,
    applicationsPage,
    canViewApplications,
    canViewMembers,
    currentPage,
    deleting,
    editing,
    fetchApplications,
    fetchMembers,
    isWindowVisible,
    membersLoaded,
  ]);

  useEffect(() => {
    if (!canViewMembers || membersLoaded) return;
    const timer = window.setTimeout(() => {
      void fetchMembers(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canViewMembers, fetchMembers, membersLoaded]);

  useEffect(() => {
    if (activeTab !== "applications" || !canViewApplications || applicationsLoaded) return;
    const timer = window.setTimeout(() => {
      void fetchApplications(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, applicationsLoaded, canViewApplications, fetchApplications]);

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
    if (!isWindowVisible) return;

    const interval = window.setInterval(() => {
      refreshVisibleData();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [isWindowVisible, refreshVisibleData]);

  async function handleUpdate(id: number, form: MemberForm) {
    try {
      setErrors({});
      setError("");
      await api.put(`/members/${id}`, form);
      setEditing(null);
      setNotice("Member updated.");
      if (membersLoaded) void fetchMembers(currentPage);
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
    if (membersLoaded) void fetchMembers(currentPage);
  }

  async function approveApplication(applicationId: number) {
    try {
      setError("");
      await api.post(`/applicants/${applicationId}/approve`);
      setNotice("Application approved. The applicant is now in the official applicant workflow and continues 5I, documents, and requirement tracking.");
      if (applicationsLoaded) {
        await fetchApplications(applicationsPage);
      }
      if (membersLoaded) {
        await fetchMembers(1, { search, email_verified: emailVerifiedFilter, password_set: passwordSetFilter });
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(((err.response?.data as { message?: string } | undefined)?.message) ?? "Failed to approve application.");
      }
    }
  }

  async function rejectApplication(applicationId: number) {
    try {
      setError("");
      await api.post(`/applicants/${applicationId}/reject`, {
        reason: "Rejected during review.",
      });
      setNotice("Application rejected.");
      if (applicationsLoaded) {
        await fetchApplications(applicationsPage);
      }
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

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={`rounded-md border px-4 py-2 text-sm ${activeTab === "members" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
        >
          Members
        </button>
        {canViewApplications && (
          <button
            type="button"
            onClick={() => setActiveTab("applications")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "applications" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Applicant Review
          </button>
        )}
      </div>

      {activeTab === "members" && (
        <>
          <div className="mb-6 grid gap-4 rounded-xl border border-white/20 bg-white/10 p-4 md:grid-cols-[1fr_220px_220px_auto]">
            <input
              aria-label="Search members"
              placeholder="Search by member no., name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
            />
            <select
              aria-label="Filter members by email verification"
              value={emailVerifiedFilter}
              onChange={(e) => setEmailVerifiedFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All</option>
              <option value="true" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Email Verified</option>
              <option value="false" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Email Not Verified</option>
            </select>
            <select
              aria-label="Filter members by password state"
              value={passwordSetFilter}
              onChange={(e) => setPasswordSetFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All</option>
              <option value="true" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Password Set</option>
              <option value="false" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Password Not Set</option>
            </select>
            <button
              onClick={() => {
                setCurrentPage(1);
                void fetchMembers(1);
              }}
              className="btn-primary"
            >
              Search
            </button>
          </div>

          {!membersLoaded && (
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-8 text-center text-sm text-mist/80">
              Loading members...
            </div>
          )}
          {membersLoaded && (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Batch</th>
                      <th className="px-4 py-3 text-left">Contact</th>
                      <th className="px-4 py-3 text-left">Email Verified</th>
                      <th className="px-4 py-3 text-left">Password Set</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-white/15">
                        <td className="px-4 py-3">{m.member_number}</td>
                        <td className="px-4 py-3">{m.first_name} {m.middle_name ? `${m.middle_name} ` : ""}{m.last_name}</td>
                        <td className="px-4 py-3">{m.email ?? "—"}</td>
                        <td className="px-4 py-3">{m.batch ?? "—"}</td>
                        <td className="px-4 py-3">{m.contact_number ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${m.email_verified ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-200" : "border-red-300/40 bg-red-400/10 text-red-200"}`}>
                            {m.email_verified ? "Verified" : "Not Verified"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${m.password_set ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-200" : "border-red-300/40 bg-red-400/10 text-red-200"}`}>
                            {m.password_set ? "Set" : "Not Set"}
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
                        <td colSpan={8} className="px-4 py-8 text-center text-mist/80">No members found for the current filters.</td>
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
            </>
          )}
        </>
      )}

      {activeTab === "applications" && canViewApplications && (
        <>
          <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
            <button
              type="button"
              onClick={() => void fetchApplications(1)}
              className="btn-primary"
            >
              Refresh Queue
            </button>
          </div>

          {!applicationsLoaded && (
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-8 text-center text-sm text-mist/80">
              Loading applicant review queue...
            </div>
          )}
          {applicationsLoaded && (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
                <div className="border-b border-white/15 px-4 py-3">
                  <h2 className="font-heading text-2xl text-offwhite">Applicants Under Review</h2>
                  {!canApproveApplications && (
                    <p className="mt-2 text-sm text-mist/80">
                      Read-only queue. Decisions remain restricted to the membership committee review workflow.
                    </p>
                  )}
                </div>
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Application Status</th>
                      <th className="px-4 py-3 text-left">{canApproveApplications ? "Actions" : "Access"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr key={app.id} className="border-b border-white/15">
                        <td className="px-4 py-3">{app.first_name} {app.middle_name ? `${app.middle_name} ` : ""}{app.last_name}</td>
                        <td className="px-4 py-3">{app.email}</td>
                        <td className="px-4 py-3 capitalize">{app.status.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 space-x-3">
                          {canApproveApplications ? (
                            <>
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
                            </>
                          ) : (
                            <span className="text-xs text-mist/80">View only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {applications.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-mist/80">No applicants are currently under review.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-center justify-center gap-4 text-sm text-mist/90">
                <button
                  disabled={applicationsPage === 1}
                  onClick={() => void fetchApplications(applicationsPage - 1)}
                  className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
                >
                  Prev
                </button>
                <span>Page {applicationsPage} of {applicationsLastPage}</span>
                <button
                  disabled={applicationsPage === applicationsLastPage}
                  onClick={() => void fetchApplications(applicationsPage + 1)}
                  className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}

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
