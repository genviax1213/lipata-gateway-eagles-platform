import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";

interface MemberOption {
  id: number;
  member_number: string;
  email: string | null;
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

interface ComplianceRow {
  member: MemberOption;
  month: string;
  has_monthly_for_month: boolean;
  monthly_entry_count: number;
  monthly_total_amount: number;
  selected_project_years: number[];
  missing_project_years: number[];
  is_non_compliant: boolean;
}

interface CompliancePayload {
  filters: {
    month: string;
    years: number[];
    effective_years: number[];
    non_compliant_only: boolean;
  };
  available_project_years: number[];
  data: ComplianceRow[];
}

const CATEGORY_OPTIONS = [
  { value: "monthly_contribution", label: "Monthly Contribution" },
  { value: "alalayang_agila_contribution", label: "Alalayang Agila Contribution" },
  { value: "project_contribution", label: "Project Contribution" },
  { value: "extra_contribution", label: "Extra Contribution" },
];

const CATEGORY_COLORS: Record<string, string> = {
  monthly_contribution: "#166534",
  alalayang_agila_contribution: "#92400e",
  project_contribution: "#1e3a8a",
  extra_contribution: "#581c87",
};

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function nameOf(member: MemberOption): string {
  const name = `${member.first_name} ${member.middle_name ? `${member.middle_name} ` : ""}${member.last_name}`;
  return member.email ? `${name} (${member.email})` : name;
}

function money(value: number | string): string {
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function categoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

interface ChartItem {
  label: string;
  color: string;
  total: number;
}

function VerticalBarChart({ items, valueFormatter, emptyText }: { items: ChartItem[]; valueFormatter: (value: number) => string; emptyText: string }) {
  const maxValue = items.length > 0 ? Math.max(...items.map((item) => item.total)) : 0;
  const plotHeight = 140;

  if (items.length === 0) {
    return <p className="text-xs text-mist/70">{emptyText}</p>;
  }

  return (
    <>
      <div className="mb-3 rounded-md border border-white/15 bg-white/5 p-3">
        <div className="flex items-end gap-3" style={{ height: `${plotHeight + 34}px` }}>
        {items.map((item) => {
          const ratio = maxValue > 0 ? item.total / maxValue : 0;
          const barHeight = Math.max(8, Math.round(ratio * plotHeight));
          return (
            <div key={`bar-${item.label}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-mist/85">{valueFormatter(item.total)}</span>
              <div className="w-full rounded-t" style={{ height: `${barHeight}px`, backgroundColor: item.color }} />
              <span className="line-clamp-2 text-center text-[10px] text-offwhite">{item.label}</span>
            </div>
          );
        })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <span key={`legend-${item.label}`} className="inline-flex items-center gap-2 text-xs text-offwhite">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </>
  );
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
  const [errorContext, setErrorContext] = useState<"global" | "member-search" | "selected-member" | "edit-requests">("global");
  const [notice, setNotice] = useState("");
  const [complianceMonth, setComplianceMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [complianceYearSelect, setComplianceYearSelect] = useState("");
  const [complianceYears, setComplianceYears] = useState<number[]>([]);
  const [complianceNonCompliantOnly, setComplianceNonCompliantOnly] = useState(true);
  const [complianceRows, setComplianceRows] = useState<ComplianceRow[]>([]);
  const [complianceYearOptions, setComplianceYearOptions] = useState<number[]>([]);
  const [complianceEffectiveYears, setComplianceEffectiveYears] = useState<number[]>([]);
  const [myCategoryFilter, setMyCategoryFilter] = useState("");
  const [myYearFilter, setMyYearFilter] = useState("");
  const [myMonthFilter, setMyMonthFilter] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [selectedYearFilter, setSelectedYearFilter] = useState("");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState("");

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

  const setScopedError = (
    message: string,
    context: "global" | "member-search" | "selected-member" | "edit-requests",
  ) => {
    setError(message);
    setErrorContext(context);
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
      setScopedError(parseError(err, "Unable to load your contribution records."), "global");
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!canViewFinance) return;

    setLoading(true);
    setError("");
    setErrorContext("member-search");

    try {
      const res = await api.get<MemberOption[]>("/finance/members", { params: { search } });
      setMembers(res.data);
    } catch (err) {
      setScopedError(parseError(err, "Unable to search members."), "member-search");
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, search]);

  const fetchContributions = useCallback(async (memberId: number) => {
    if (!canViewFinance) return;

    setLoading(true);
    setError("");
    setErrorContext("selected-member");

    try {
      const res = await api.get<ContributionPayload>(`/finance/members/${memberId}/contributions`);
      setContributionRows(res.data.data ?? []);
      setTotalAmount(Number(res.data.total_amount ?? 0));
    } catch (err) {
      setScopedError(parseError(err, "Unable to load member contributions."), "selected-member");
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
      setScopedError(parseError(err, "Unable to load edit requests."), "edit-requests");
    }
  }, [canApproveEdits]);

  const fetchCompliance = useCallback(async () => {
    if (!canViewFinance) return;

    setError("");
    setErrorContext("member-search");

    try {
      const res = await api.get<CompliancePayload>("/finance/compliance", {
        params: {
          month: complianceMonth,
          years: complianceYears,
          non_compliant_only: complianceNonCompliantOnly,
        },
      });
      setComplianceRows(res.data.data ?? []);
      setComplianceYearOptions(res.data.available_project_years ?? []);
      setComplianceEffectiveYears(res.data.filters?.effective_years ?? []);
    } catch (err) {
      setScopedError(parseError(err, "Unable to load compliance report."), "member-search");
    }
  }, [canViewFinance, complianceMonth, complianceNonCompliantOnly, complianceYears]);

  useEffect(() => {
    void fetchMyContributions();
  }, [fetchMyContributions]);

  useEffect(() => {
    if (!canViewFinance) return;
    void fetchMembers();
    void fetchEditRequests();
    void fetchCompliance();
  }, [canViewFinance, fetchCompliance, fetchEditRequests, fetchMembers]);

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
    setErrorContext("selected-member");
    setNotice("");

    try {
      await api.post("/finance/contributions", {
        member_id: selectedMemberId,
        member_email: selectedMember?.email ?? null,
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
      setScopedError(parseError(err, "Failed to save contribution."), "selected-member");
    }
  };

  const submitEditRequest = async () => {
    if (!canRequestEdit || !selectedContributionId) return;

    setError("");
    setErrorContext("selected-member");
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
      setScopedError(parseError(err, "Failed to submit edit request."), "selected-member");
    }
  };

  const approveRequest = async (requestId: number) => {
    setError("");
    setErrorContext("edit-requests");
    setNotice("");

    try {
      await api.post(`/finance/edit-requests/${requestId}/approve`);
      setNotice("Edit request approved.");
      await fetchEditRequests();
      if (selectedMemberId) await fetchContributions(selectedMemberId);
      await fetchMyContributions();
    } catch (err) {
      setScopedError(parseError(err, "Failed to approve request."), "edit-requests");
    }
  };

  const rejectRequest = async (requestId: number) => {
    setError("");
    setErrorContext("edit-requests");
    setNotice("");

    try {
      await api.post(`/finance/edit-requests/${requestId}/reject`, {
        review_notes: "Rejected by auditor.",
      });
      setNotice("Edit request rejected.");
      await fetchEditRequests();
    } catch (err) {
      setScopedError(parseError(err, "Failed to reject request."), "edit-requests");
    }
  };

  const myYearOptions = useMemo(
    () => [...new Set((myData?.data ?? []).map((row) => row.contribution_date.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [myData],
  );
  const selectedYearOptions = useMemo(
    () => [...new Set(contributionRows.map((row) => row.contribution_date.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [contributionRows],
  );
  const filteredMyRows = useMemo(() => {
    if (!myData) return [];

    return myData.data.filter((row) => {
      if (myCategoryFilter && row.category !== myCategoryFilter) return false;
      if (myYearFilter && !row.contribution_date.startsWith(myYearFilter)) return false;
      if (myMonthFilter && row.contribution_date.slice(5, 7) !== myMonthFilter) return false;
      return true;
    });
  }, [myCategoryFilter, myData, myMonthFilter, myYearFilter]);
  const filteredMyTotal = useMemo(
    () => filteredMyRows.reduce((sum, row) => sum + Number(row.amount), 0),
    [filteredMyRows],
  );
  const filteredSelectedRows = useMemo(
    () =>
      contributionRows.filter((row) => {
        if (selectedCategoryFilter && row.category !== selectedCategoryFilter) return false;
        if (selectedYearFilter && !row.contribution_date.startsWith(selectedYearFilter)) return false;
        if (selectedMonthFilter && row.contribution_date.slice(5, 7) !== selectedMonthFilter) return false;
        return true;
      }),
    [contributionRows, selectedCategoryFilter, selectedMonthFilter, selectedYearFilter],
  );
  const filteredSelectedTotal = useMemo(
    () => filteredSelectedRows.reduce((sum, row) => sum + Number(row.amount), 0),
    [filteredSelectedRows],
  );
  const myCategoryGraph = useMemo(() => {
    const totals = filteredMyRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.category] = (acc[row.category] ?? 0) + Number(row.amount);
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([category, total]) => ({
        category,
        label: categoryLabel(category),
        color: CATEGORY_COLORS[category] ?? "#94a3b8",
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredMyRows]);
  const selectedCategoryGraph = useMemo(() => {
    const totals = filteredSelectedRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.category] = (acc[row.category] ?? 0) + Number(row.amount);
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([category, total]) => ({
        category,
        label: categoryLabel(category),
        color: CATEGORY_COLORS[category] ?? "#94a3b8",
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredSelectedRows]);
  const complianceGraph = useMemo(() => {
    const compliant = complianceRows.filter((row) => !row.is_non_compliant).length;
    const nonCompliant = complianceRows.filter((row) => row.is_non_compliant).length;
    return [
      { label: "Compliant", color: "#14532d", total: compliant },
      { label: "Non-Compliant", color: "#7f1d1d", total: nonCompliant },
    ];
  }, [complianceRows]);
  const complianceYearSelectOptions = useMemo(() => {
    const currentYear = Number(complianceMonth.slice(0, 4)) || new Date().getFullYear();
    const fallback = Array.from({ length: 8 }, (_, index) => currentYear - index);
    return [...new Set([...complianceYearOptions, ...fallback, ...complianceYears])].sort((a, b) => b - a);
  }, [complianceMonth, complianceYearOptions, complianceYears]);

  const resetContributionForm = () => {
    setAmountInput("");
    setNoteInput("");
    setCategoryInput("monthly_contribution");
    setContributionDateInput("");
    setRecipientIndicatorInput("");
  };

  const addComplianceYear = () => {
    if (!complianceYearSelect) return;
    const year = Number(complianceYearSelect);
    if (!Number.isFinite(year)) return;
    setComplianceYears((prev) => (prev.includes(year) ? prev : [...prev, year].sort((a, b) => b - a)));
    setComplianceYearSelect("");
  };

  const removeComplianceYear = (year: number) => {
    setComplianceYears((prev) => prev.filter((value) => value !== year));
  };

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Contributions</h1>
      <p className="mb-6 text-sm text-mist/85">
        Members can view personal contribution history by month, year, and category. Treasurer and auditor can manage finance workflows.
      </p>

      {error && errorContext === "global" && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
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
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <select
                aria-label="Filter my contributions by type"
                value={myCategoryFilter}
                onChange={(e) => setMyCategoryFilter(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              >
                <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Types</option>
                {CATEGORY_OPTIONS.map((item) => (
                  <option key={`my-cat-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter my contributions by year"
                value={myYearFilter}
                onChange={(e) => setMyYearFilter(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              >
                <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Years</option>
                {myYearOptions.map((year) => (
                  <option key={`my-year-${year}`} value={year} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {year}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter my contributions by month"
                value={myMonthFilter}
                onChange={(e) => setMyMonthFilter(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              >
                <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Months</option>
                {MONTH_OPTIONS.map((month) => (
                  <option key={`my-month-${month.value}`} value={month.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="mb-4 text-sm text-mist/85">
              Filtered Total: <span className="font-semibold text-gold-soft">{money(filteredMyTotal)}</span> ({filteredMyRows.length} record{filteredMyRows.length === 1 ? "" : "s"})
            </p>

            <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-4">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Filtered Contributions Graph</p>
              <VerticalBarChart
                items={myCategoryGraph}
                valueFormatter={(value) => money(value)}
                emptyText="No data to graph for current filters."
              />
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
                  {filteredMyRows.map((row) => (
                    <tr key={`mine-${row.id}`} className="border-b border-white/15">
                      <td className="px-4 py-3">{row.contribution_date}</td>
                      <td className="px-4 py-3">{row.category_label}</td>
                      <td className="px-4 py-3">{money(row.amount)}</td>
                      <td className="px-4 py-3">{row.recipient_indicator ?? "-"}</td>
                      <td className="px-4 py-3">{row.note ?? "-"}</td>
                    </tr>
                  ))}
                  {filteredMyRows.length === 0 && (
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
          {error && errorContext === "member-search" && (
            <p className="mt-3 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}
        </div>
      )}

      {canViewFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Compliance Checker</h2>
          <p className="mb-3 text-sm text-mist/85">
            Monthly contribution is mandatory. Filter non-compliance for a target month and selected project-contribution years.
          </p>

          <div className="mb-3 grid gap-3 md:grid-cols-[180px_1fr_auto]">
            <input
              aria-label="Compliance month"
              type="month"
              value={complianceMonth}
              onChange={(e) => setComplianceMonth(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
              <input
                type="checkbox"
                checked={complianceNonCompliantOnly}
                onChange={(e) => setComplianceNonCompliantOnly(e.target.checked)}
              />
              Show Non-Compliant Only
            </label>
            <button onClick={() => void fetchCompliance()} className="btn-secondary">Run</button>
          </div>

          <div className="mb-3 rounded-md border border-white/20 bg-white/5 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-gold-soft">Project Year Filter</p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="Select project year"
                value={complianceYearSelect}
                onChange={(e) => setComplianceYearSelect(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
              >
                <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Select Year</option>
                {complianceYearSelectOptions.map((year) => (
                  <option key={`comp-year-opt-${year}`} value={String(year)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {year}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addComplianceYear} className="btn-secondary">Add Year</button>
              <button type="button" onClick={() => setComplianceYears([])} className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10">
                Clear Years
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {complianceYears.map((year) => (
                <button
                  key={`selected-year-${year}`}
                  type="button"
                  onClick={() => removeComplianceYear(year)}
                  className="rounded-md border border-white/20 px-2 py-1 text-xs text-offwhite hover:bg-white/10"
                  title="Remove year"
                >
                  {year} x
                </button>
              ))}
              {complianceYears.length === 0 && (
                <span className="text-xs text-mist/70">No specific year selected. All available project years are applied.</span>
              )}
            </div>
            {complianceEffectiveYears.length > 0 && (
              <p className="mt-2 text-xs text-mist/75">
                Applied project years: {complianceEffectiveYears.join(", ")}
              </p>
            )}
          </div>

          <div className="mb-3 rounded-lg border border-white/20 bg-white/5 p-4">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Compliance Graph</p>
            <VerticalBarChart
              items={complianceGraph}
              valueFormatter={(value) => String(value)}
              emptyText="No compliance data to graph."
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/20">
            <table className="min-w-full text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Monthly ({complianceMonth})</th>
                  <th className="px-4 py-3 text-left">Monthly Amount</th>
                  <th className="px-4 py-3 text-left">Missing Project Years</th>
                  {!complianceNonCompliantOnly && <th className="px-4 py-3 text-left">Status</th>}
                </tr>
              </thead>
              <tbody>
                {complianceRows.map((row) => (
                  <tr key={`compliance-${row.member.id}`} className="border-b border-white/15">
                    <td className="px-4 py-3">{nameOf(row.member)}</td>
                    <td className="px-4 py-3">
                      <span className={row.has_monthly_for_month ? "text-emerald-200" : "text-red-200"}>
                        {row.has_monthly_for_month ? "Paid" : "Missing"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.monthly_entry_count > 0 ? money(row.monthly_total_amount) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {row.missing_project_years.length > 0 ? row.missing_project_years.join(", ") : "Complete"}
                    </td>
                    {!complianceNonCompliantOnly && (
                      <td className="px-4 py-3">
                        <span className={row.is_non_compliant ? "text-red-200" : "text-emerald-200"}>
                          {row.is_non_compliant ? "Non-Compliant" : "Compliant"}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
                {complianceRows.length === 0 && (
                  <tr>
                    <td colSpan={complianceNonCompliantOnly ? 4 : 5} className="px-4 py-6 text-center text-mist/80">No records for current compliance filter.</td>
                  </tr>
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
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <select
              aria-label="Filter selected member contributions by type"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Types</option>
              {CATEGORY_OPTIONS.map((item) => (
                <option key={`sel-cat-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter selected member contributions by year"
              value={selectedYearFilter}
              onChange={(e) => setSelectedYearFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Years</option>
              {selectedYearOptions.map((year) => (
                <option key={`sel-year-${year}`} value={year} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {year}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter selected member contributions by month"
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Months</option>
              {MONTH_OPTIONS.map((month) => (
                <option key={`sel-month-${month.value}`} value={month.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-4 text-sm text-mist/85">
            Filtered Total: <span className="font-semibold text-gold-soft">{money(filteredSelectedTotal)}</span>
          </p>
          <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-4">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Filtered Contributions Graph</p>
            <VerticalBarChart
              items={selectedCategoryGraph}
              valueFormatter={(value) => money(value)}
              emptyText="No data to graph for current filters."
            />
          </div>
          {error && errorContext === "selected-member" && (
            <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}

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
              <div className="md:col-span-2 flex gap-2">
                <button className="btn-primary" onClick={() => void createContribution()}>Save</button>
                <button
                  type="button"
                  onClick={resetContributionForm}
                  className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
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
                {filteredSelectedRows.map((row) => (
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
                {filteredSelectedRows.length === 0 && (
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
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => void submitEditRequest()}>Submit</button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContributionId(null);
                    setRequestAmount("");
                    setRequestReason("");
                  }}
                  className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canApproveEdits && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-3 font-heading text-2xl text-offwhite">Pending Edit Requests (Auditor)</h2>
          {error && errorContext === "edit-requests" && (
            <p className="mb-3 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}
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
