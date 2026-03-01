import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";

interface MemberOption {
  id: number;
  member_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
}

interface ContributionRow {
  id: number;
  member_id: number;
  amount: string;
  note: string | null;
  category: string;
  category_label: string;
  contribution_date: string;
  recipient_indicator: string | null;
  encoded_at: string;
  encoded_by?: { id: number; name: string } | null;
}

interface SummaryRow {
  period: string;
  total_amount: number;
  categories: Record<string, number>;
}

interface ContributionPayload {
  member: MemberOption;
  total_amount: number;
  category_totals: Record<string, number>;
  category_labels: Record<string, string>;
  monthly_summary: SummaryRow[];
  yearly_summary: SummaryRow[];
  data: ContributionRow[];
}

interface EditRequestRow {
  id: number;
  requested_amount: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  contribution: {
    id: number;
    amount: string;
    member: MemberOption;
  };
  requested_by?: { id: number; name: string } | null;
}

const CATEGORY_OPTIONS = [
  { value: "monthly_contribution", label: "Monthly Contribution" },
  { value: "alalayang_agila_contribution", label: "Alalayang Agila Contribution" },
  { value: "project_contribution", label: "Project Contribution" },
  { value: "extra_contribution", label: "Extra Contribution" },
];

function nameOf(member: MemberOption): string {
  return `${member.first_name} ${member.middle_name ? `${member.middle_name} ` : ""}${member.last_name}`;
}

function money(value: number | string): string {
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Contributions() {
  const { user } = useAuth();
  const canViewFinance = hasPermission(user, "finance.view");
  const canInputFinance = hasPermission(user, "finance.input");
  const canRequestEdit = hasPermission(user, "finance.request_edit");
  const canApproveEdits = hasPermission(user, "finance.approve_edits");

  const [myData, setMyData] = useState<ContributionPayload | null>(null);
  const [myDataNotice, setMyDataNotice] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [contributionRows, setContributionRows] = useState<ContributionRow[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("monthly_contribution");
  const [contributionDateInput, setContributionDateInput] = useState("");
  const [recipientIndicatorInput, setRecipientIndicatorInput] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [selectedContributionId, setSelectedContributionId] = useState<number | null>(null);
  const [editRequests, setEditRequests] = useState<EditRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const parseError = (err: unknown, fallback: string) => {
    if (!axios.isAxiosError(err)) return fallback;
    const message = (err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)?.message;
    const errors = (err.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors;
    if (message) return message;
    if (errors) {
      const first = Object.values(errors).flat()[0];
      if (first) return first;
    }
    return fallback;
  };

  const fetchMyContributions = useCallback(async () => {
    setMyDataNotice("");
    try {
      const res = await api.get<ContributionPayload>("/finance/my-contributions");
      setMyData(res.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setMyData(null);
        setMyDataNotice("No linked member profile found for your account.");
        return;
      }
      setError(parseError(err, "Unable to load your contribution records."));
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!canViewFinance) return;

    setLoading(true);
    setError("");

    try {
      const res = await api.get<MemberOption[]>("/finance/members", { params: { search } });
      setMembers(res.data);
    } catch (err) {
      setError(parseError(err, "Unable to search members."));
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, search]);

  const fetchContributions = useCallback(async (memberId: number) => {
    if (!canViewFinance) return;

    setLoading(true);
    setError("");

    try {
      const res = await api.get<ContributionPayload>(`/finance/members/${memberId}/contributions`);
      setContributionRows(res.data.data ?? []);
      setTotalAmount(Number(res.data.total_amount ?? 0));
    } catch (err) {
      setError(parseError(err, "Unable to load member contributions."));
    } finally {
      setLoading(false);
    }
  }, [canViewFinance]);

  const fetchEditRequests = useCallback(async () => {
    if (!canApproveEdits) return;

    try {
      const res = await api.get<{ data: EditRequestRow[] }>("/finance/edit-requests", {
        params: { status: "pending" },
      });
      setEditRequests(res.data.data ?? []);
    } catch (err) {
      setError(parseError(err, "Unable to load edit requests."));
    }
  }, [canApproveEdits]);

  useEffect(() => {
    void fetchMyContributions();
  }, [fetchMyContributions]);

  useEffect(() => {
    if (!canViewFinance) return;
    void fetchMembers();
    void fetchEditRequests();
  }, [canViewFinance, fetchMembers, fetchEditRequests]);

  useEffect(() => {
    if (!selectedMemberId || !canViewFinance) {
      setContributionRows([]);
      setTotalAmount(0);
      return;
    }

    void fetchContributions(selectedMemberId);
  }, [canViewFinance, selectedMemberId, fetchContributions]);

  const createContribution = async () => {
    if (!canInputFinance || !selectedMemberId) return;

    setError("");
    setNotice("");

    try {
      await api.post("/finance/contributions", {
        member_id: selectedMemberId,
        amount: Number(amountInput),
        note: noteInput || null,
        category: categoryInput,
        contribution_date: contributionDateInput || null,
        recipient_name: recipientIndicatorInput || null,
      });
      setNotice("Contribution saved. This record is immutable; use edit request if changes are needed.");
      setAmountInput("");
      setNoteInput("");
      setRecipientIndicatorInput("");
      setContributionDateInput("");
      await fetchContributions(selectedMemberId);
      await fetchMyContributions();
    } catch (err) {
      setError(parseError(err, "Failed to save contribution."));
    }
  };

  const submitEditRequest = async () => {
    if (!canRequestEdit || !selectedContributionId) return;

    setError("");
    setNotice("");

    try {
      await api.post(`/finance/contributions/${selectedContributionId}/edit-requests`, {
        requested_amount: Number(requestAmount),
        reason: requestReason,
      });
      setNotice("Edit request submitted for auditor approval.");
      setSelectedContributionId(null);
      setRequestAmount("");
      setRequestReason("");
      await fetchEditRequests();
    } catch (err) {
      setError(parseError(err, "Failed to submit edit request."));
    }
  };

  const approveRequest = async (requestId: number) => {
    setError("");
    setNotice("");

    try {
      await api.post(`/finance/edit-requests/${requestId}/approve`);
      setNotice("Edit request approved.");
      await fetchEditRequests();
      if (selectedMemberId) await fetchContributions(selectedMemberId);
      await fetchMyContributions();
    } catch (err) {
      setError(parseError(err, "Failed to approve request."));
    }
  };

  const rejectRequest = async (requestId: number) => {
    setError("");
    setNotice("");

    try {
      await api.post(`/finance/edit-requests/${requestId}/reject`, {
        review_notes: "Rejected by auditor.",
      });
      setNotice("Edit request rejected.");
      await fetchEditRequests();
    } catch (err) {
      setError(parseError(err, "Failed to reject request."));
    }
  };

  const categoryLabels = myData?.category_labels ?? Object.fromEntries(CATEGORY_OPTIONS.map((item) => [item.value, item.label]));

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Contributions</h1>
      <p className="mb-6 text-sm text-mist/85">
        Members can view personal contribution history by month, year, and category. Treasurer and auditor can manage finance workflows.
      </p>

      {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {notice && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{notice}</p>}

      <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
        <h2 className="mb-2 font-heading text-2xl text-offwhite">My Contributions</h2>
        {myDataNotice && (
          <p className="rounded-md border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
            {myDataNotice}
          </p>
        )}

        {myData && (
          <>
            <p className="mb-3 text-sm text-mist/85">Member: <span className="text-offwhite">{nameOf(myData.member)}</span></p>
            <p className="mb-4 text-sm text-mist/85">
              Total Contributions: <span className="font-semibold text-gold-soft">{money(myData.total_amount)}</span>
            </p>

            <div className="mb-4 overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(myData.category_totals).map(([category, value]) => (
                    <tr key={`cat-${category}`} className="border-b border-white/15">
                      <td className="px-4 py-3">{categoryLabels[category] ?? category}</td>
                      <td className="px-4 py-3">{money(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-4 overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-4 py-3 text-left">Month</th>
                    <th className="px-4 py-3 text-left">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {myData.monthly_summary.map((row) => (
                    <tr key={`mon-${row.period}`} className="border-b border-white/15">
                      <td className="px-4 py-3">{row.period}</td>
                      <td className="px-4 py-3">{money(row.total_amount)}</td>
                    </tr>
                  ))}
                  {myData.monthly_summary.length === 0 && (
                    <tr><td colSpan={2} className="px-4 py-4 text-center text-mist/80">No monthly data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mb-4 overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-4 py-3 text-left">Year</th>
                    <th className="px-4 py-3 text-left">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {myData.yearly_summary.map((row) => (
                    <tr key={`yr-${row.period}`} className="border-b border-white/15">
                      <td className="px-4 py-3">{row.period}</td>
                      <td className="px-4 py-3">{money(row.total_amount)}</td>
                    </tr>
                  ))}
                  {myData.yearly_summary.length === 0 && (
                    <tr><td colSpan={2} className="px-4 py-4 text-center text-mist/80">No yearly data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Amount</th>
                    <th className="px-4 py-3 text-left">Recipient Indicator</th>
                    <th className="px-4 py-3 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {myData.data.map((row) => (
                    <tr key={`mine-${row.id}`} className="border-b border-white/15">
                      <td className="px-4 py-3">{row.contribution_date}</td>
                      <td className="px-4 py-3">{row.category_label}</td>
                      <td className="px-4 py-3">{money(row.amount)}</td>
                      <td className="px-4 py-3">{row.recipient_indicator ?? "-"}</td>
                      <td className="px-4 py-3">{row.note ?? "-"}</td>
                    </tr>
                  ))}
                  {myData.data.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-4 text-center text-mist/80">No contribution records yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {canViewFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.22em] text-gold-soft">Find Member</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              aria-label="Search member by number or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Wildcard search by member no. or name"
              className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <button onClick={() => void fetchMembers()} className="btn-secondary">Search</button>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-white/20">
            <table className="min-w-full text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-4 py-3 text-left">Select</th>
                  <th className="px-4 py-3 text-left">Member No.</th>
                  <th className="px-4 py-3 text-left">Name</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className={`border-b border-white/15 ${selectedMemberId === member.id ? "bg-gold/10" : ""}`}>
                    <td className="px-4 py-3">
                      <button className="rounded-md border border-white/30 px-2 py-1 text-xs" onClick={() => setSelectedMemberId(member.id)}>
                        {selectedMemberId === member.id ? "Selected" : "Select"}
                      </button>
                    </td>
                    <td className="px-4 py-3">{member.member_number}</td>
                    <td className="px-4 py-3">{nameOf(member)}</td>
                  </tr>
                ))}
                {!loading && members.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-mist/80">No members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canViewFinance && selectedMember && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Selected: {nameOf(selectedMember)}</h2>
          <p className="mb-4 text-sm text-mist/85">
            Total Contributions: <span className="font-semibold text-gold-soft">{money(totalAmount)}</span>
          </p>

          {canInputFinance && (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <select
                aria-label="Contribution category"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              >
                {CATEGORY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Contribution date"
                value={contributionDateInput}
                onChange={(e) => setContributionDateInput(e.target.value)}
                type="date"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Contribution amount"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="Amount"
                type="number"
                min="0"
                step="0.01"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Contribution recipient indicator"
                value={recipientIndicatorInput}
                onChange={(e) => setRecipientIndicatorInput(e.target.value)}
                placeholder="Recipient indicator (required for Alalayang Agila)"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Contribution note"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Note (optional)"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite md:col-span-2"
              />
              <button className="btn-primary md:col-span-2" onClick={() => void createContribution()}>Save</button>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-white/20">
            <table className="min-w-full text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Recipient</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-left">Encoded By</th>
                  {canRequestEdit && <th className="px-4 py-3 text-left">Edit Request</th>}
                </tr>
              </thead>
              <tbody>
                {contributionRows.map((row) => (
                  <tr key={row.id} className="border-b border-white/15">
                    <td className="px-4 py-3">{row.contribution_date}</td>
                    <td className="px-4 py-3">{row.category_label}</td>
                    <td className="px-4 py-3">{money(row.amount)}</td>
                    <td className="px-4 py-3">{row.recipient_indicator ?? "-"}</td>
                    <td className="px-4 py-3">{row.note ?? "-"}</td>
                    <td className="px-4 py-3">{row.encoded_by?.name ?? "System"}</td>
                    {canRequestEdit && (
                      <td className="px-4 py-3">
                        <button
                          className="rounded-md border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                          onClick={() => setSelectedContributionId(row.id)}
                        >
                          Request Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {contributionRows.length === 0 && (
                  <tr><td colSpan={canRequestEdit ? 7 : 6} className="px-4 py-6 text-center text-mist/80">No contributions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {canRequestEdit && selectedContributionId && (
            <div className="mt-4 grid gap-3 rounded-lg border border-white/20 bg-white/10 p-4 md:grid-cols-[180px_1fr_auto]">
              <input
                aria-label="Requested contribution amount"
                value={requestAmount}
                onChange={(e) => setRequestAmount(e.target.value)}
                placeholder="Requested amount"
                type="number"
                min="0"
                step="0.01"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Edit request reason"
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Reason for edit"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <button className="btn-secondary" onClick={() => void submitEditRequest()}>Submit</button>
            </div>
          )}
        </div>
      )}

      {canApproveEdits && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-3 font-heading text-2xl text-offwhite">Pending Edit Requests (Auditor)</h2>
          <div className="overflow-x-auto rounded-lg border border-white/20">
            <table className="min-w-full text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Current Amount</th>
                  <th className="px-4 py-3 text-left">Requested Amount</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-left">Requested By</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {editRequests.map((row) => (
                  <tr key={row.id} className="border-b border-white/15">
                    <td className="px-4 py-3">{nameOf(row.contribution.member)}</td>
                    <td className="px-4 py-3">{money(row.contribution.amount)}</td>
                    <td className="px-4 py-3">{money(row.requested_amount)}</td>
                    <td className="px-4 py-3">{row.reason}</td>
                    <td className="px-4 py-3">{row.requested_by?.name ?? "Unknown"}</td>
                    <td className="px-4 py-3 space-x-2">
                      <button className="rounded-md border border-green-400/50 px-3 py-1 text-xs text-green-300 hover:bg-green-500/10" onClick={() => void approveRequest(row.id)}>
                        Approve
                      </button>
                      <button className="rounded-md border border-red-400/50 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10" onClick={() => void rejectRequest(row.id)}>
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
                {editRequests.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-mist/80">No pending edit requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
