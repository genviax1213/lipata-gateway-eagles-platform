import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";

type DashboardView = "applicant" | "member" | "general";

interface DashboardPayload {
  view: DashboardView;
  message?: string;
}

interface ApplicationNotice {
  id: number;
  notice_text: string;
  created_at: string;
  created_by?: { id: number; name: string } | null;
}

interface ApplicationDocument {
  id: number;
  original_name: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
}

interface ApplicationFeeRequirement {
  id: number;
  required_amount: number | string;
  note: string | null;
  payments: Array<{
    id: number;
    amount: number | string;
    payment_date: string;
    encoded_by?: { id: number; name: string } | null;
  }>;
}

interface ApplicantDetails {
  id: number;
  full_name: string;
  email: string;
  status: string;
  decision_status: "pending" | "probation" | "approved" | "rejected";
  current_stage: string | null;
  current_stage_label: string;
  notices: ApplicationNotice[];
  documents: ApplicationDocument[];
  fees: {
    required_total: number;
    paid_total: number;
    balance: number;
    requirements: ApplicationFeeRequirement[];
  };
}

interface MemberContributionPayload {
  member: { id: number; member_number: string; first_name: string; middle_name: string | null; last_name: string };
  category_labels: Record<string, string>;
  category_totals: Record<string, number>;
  monthly_summary: Array<{ period: string; total_amount: number }>;
  yearly_summary: Array<{ period: string; total_amount: number }>;
  data: Array<{ id: number; contribution_date: string; amount: string; category: string; category_label: string; recipient_indicator: string | null }>;
}

interface ApplicationRow {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  status: string;
  decision_status: string;
  current_stage: string | null;
}

function money(value: number | string): string {
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function appName(app: ApplicationRow): string {
  return `${app.first_name} ${app.middle_name ? `${app.middle_name} ` : ""}${app.last_name}`;
}

function labelRole(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const YEAR_OPTIONS = Array.from({ length: 20 }, (_, idx) => String(2021 + idx));
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

export default function PortalDashboard() {
  const { user } = useAuth();
  const canViewApplicantDashboard = hasPermission(user, "applications.dashboard.view");
  const canUploadApplicantDocs = hasPermission(user, "applications.docs.upload");
  const canChairmanReview = hasPermission(user, "applications.review");
  const canChairmanSetNotice = hasPermission(user, "applications.notice.set");
  const canChairmanSetStage = hasPermission(user, "applications.stage.set");
  const canChairmanReviewDocs = hasPermission(user, "applications.docs.review");
  const canTreasurerSetFee = hasPermission(user, "applications.fee.set");
  const canTreasurerPay = hasPermission(user, "applications.fee.pay");

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [applicantDetails, setApplicantDetails] = useState<ApplicantDetails | null>(null);
  const [memberData, setMemberData] = useState<MemberContributionPayload | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);
  const [selectedApplicationDetails, setSelectedApplicationDetails] = useState<ApplicantDetails | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [stageValue, setStageValue] = useState("interview");
  const [requiredAmount, setRequiredAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [selectedFeeRequirementId, setSelectedFeeRequirementId] = useState<number | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selectedTab, setSelectedTab] = useState<"alalayang_agila_contribution" | "monthly_contribution" | "extra_contribution">("monthly_contribution");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const parseError = (err: unknown, fallback: string): string => {
    if (!axios.isAxiosError(err)) return fallback;
    const message = (err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)?.message;
    if (message) return message;
    const errors = (err.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors;
    if (errors) {
      const first = Object.values(errors).flat()[0];
      if (first) return first;
    }
    return fallback;
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const dashRes = await api.get<DashboardPayload>("/dashboard/me");
      setDashboard(dashRes.data);

      if (dashRes.data.view === "applicant" && canViewApplicantDashboard) {
        const appRes = await api.get<ApplicantDetails>("/member-applications/me");
        setApplicantDetails(appRes.data);
      } else {
        setApplicantDetails(null);
      }

      if (dashRes.data.view !== "applicant") {
        try {
          const memberRes = await api.get<MemberContributionPayload>("/finance/my-contributions");
          setMemberData(memberRes.data);
        } catch {
          setMemberData(null);
        }
      } else {
        setMemberData(null);
      }

      if (canChairmanReview || canTreasurerSetFee || canTreasurerPay) {
        const rows = await api.get<{ data: ApplicationRow[] }>("/member-applications", { params: { status: "all" } });
        setApplications(rows.data.data ?? []);
      } else {
        setApplications([]);
      }
    } catch (err) {
      setError(parseError(err, "Unable to load dashboard."));
    } finally {
      setLoading(false);
    }
  }, [canChairmanReview, canTreasurerPay, canTreasurerSetFee, canViewApplicantDashboard]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!selectedApplicationId) {
      setSelectedApplicationDetails(null);
      return;
    }

    void (async () => {
      try {
        const res = await api.get<ApplicantDetails>(`/member-applications/${selectedApplicationId}`);
        setSelectedApplicationDetails(res.data);
      } catch {
        setSelectedApplicationDetails(null);
      }
    })();
  }, [selectedApplicationId]);

  const selectedApplication = useMemo(
    () => applications.find((row) => row.id === selectedApplicationId) ?? null,
    [applications, selectedApplicationId],
  );

  const filteredRows = useMemo(() => {
    if (!memberData) return [];

    return memberData.data.filter((row) => {
      if (row.category !== selectedTab) return false;

      if (yearFilter && !row.contribution_date.startsWith(yearFilter)) return false;
      if (monthFilter) {
        const month = row.contribution_date.slice(5, 7);
        if (month !== monthFilter.padStart(2, "0")) return false;
      }

      return true;
    });
  }, [memberData, monthFilter, selectedTab, yearFilter]);

  const totalFiltered = useMemo(
    () => filteredRows.reduce((acc, row) => acc + Number(row.amount), 0),
    [filteredRows],
  );

  const userFullName = useMemo(
    () => (typeof user?.name === "string" ? user.name : "Unknown User"),
    [user],
  );
  const userEmail = useMemo(
    () => (typeof user?.email === "string" ? user.email : "-"),
    [user],
  );
  const roleLabels = useMemo(() => {
    const labels: string[] = [];
    const primaryRoleName = (user?.role as { name?: unknown } | undefined)?.name;
    if (typeof primaryRoleName === "string" && primaryRoleName) {
      labels.push(labelRole(primaryRoleName));
    }

    const financeRoleName = user?.finance_role;
    if (typeof financeRoleName === "string" && financeRoleName) {
      labels.push(labelRole(financeRoleName));
    }

    const forumRoleName = user?.forum_role;
    if (typeof forumRoleName === "string" && forumRoleName) {
      labels.push(labelRole(forumRoleName));
    }

    return labels.length > 0 ? labels : ["No Assigned Role"];
  }, [user]);

  const uploadDocument = async () => {
    if (!applicantDetails || !documentFile || !canUploadApplicantDocs) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const payload = new FormData();
      payload.append("document", documentFile);
      await api.post(`/member-applications/${applicantDetails.id}/documents`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotice("Document uploaded.");
      setDocumentFile(null);
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to upload document."));
    } finally {
      setLoading(false);
    }
  };

  const chairmanAction = async (path: string, payload?: Record<string, unknown>) => {
    if (!selectedApplication) return;
    setError("");
    setNotice("");

    try {
      await api.post(`/member-applications/${selectedApplication.id}/${path}`, payload ?? {});
      setNotice("Application decision updated.");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to update application."));
    }
  };

  const setNoticeForApplicant = async () => {
    if (!selectedApplication || !noticeText.trim()) return;
    setError("");
    setNotice("");

    try {
      await api.post(`/member-applications/${selectedApplication.id}/notice`, {
        notice_text: noticeText.trim(),
      });
      setNotice("Notice posted.");
      setNoticeText("");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to post notice."));
    }
  };

  const setStageForApplicant = async () => {
    if (!selectedApplication) return;
    setError("");
    setNotice("");

    try {
      await api.post(`/member-applications/${selectedApplication.id}/stage`, {
        current_stage: stageValue,
      });
      setNotice("Applicant stage updated.");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to update stage."));
    }
  };

  const setFeeRequirement = async () => {
    if (!selectedApplication || !requiredAmount) return;

    setError("");
    setNotice("");
    try {
      await api.post(`/member-applications/${selectedApplication.id}/fee-requirements`, {
        required_amount: Number(requiredAmount),
        note: "Treasurer mandated fee",
      });
      setNotice("Required applicant fee set.");
      setRequiredAmount("");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to set required fee."));
    }
  };

  const addFeePayment = async () => {
    if (!selectedFeeRequirementId || !paymentAmount) return;

    setError("");
    setNotice("");
    try {
      await api.post(`/member-applications/fee-requirements/${selectedFeeRequirementId}/payments`, {
        amount: Number(paymentAmount),
      });
      setNotice("Applicant payment logged.");
      setPaymentAmount("");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to log payment."));
    }
  };

  const reviewDocument = async (documentId: number, status: "approved" | "rejected") => {
    setError("");
    setNotice("");
    try {
      await api.post(`/member-applications/documents/${documentId}/review`, { status });
      setNotice(`Document ${status}.`);
      if (selectedApplicationId) {
        const res = await api.get<ApplicantDetails>(`/member-applications/${selectedApplicationId}`);
        setSelectedApplicationDetails(res.data);
      }
    } catch (err) {
      setError(parseError(err, "Failed to review document."));
    }
  };

  const viewDocument = async (documentId: number, originalName: string) => {
    setError("");
    try {
      const response = await api.get(`/member-applications/documents/${documentId}/view`, {
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(response.data as Blob);
      const tab = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!tab) {
        setError("Popup blocked. Allow popups to view the document.");
      }
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      setError(parseError(err, `Failed to view ${originalName}.`));
    }
  };

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Portal Dashboard</h1>
      <p className="mb-6 text-sm text-mist/85">
        Dashboard content adapts to your assigned role.
      </p>

      <div className="mb-4 rounded-xl border border-white/20 bg-white/10 p-4">
        <h2 className="mb-2 font-heading text-xl text-offwhite">User Session</h2>
        <p className="text-sm text-mist/85">Name: <span className="text-offwhite">{userFullName}</span></p>
        <p className="text-sm text-mist/85">Email: <span className="text-offwhite">{userEmail}</span></p>
        <p className="text-sm text-mist/85">Roles: <span className="text-gold-soft">{roleLabels.join(", ")}</span></p>
      </div>

      {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {notice && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{notice}</p>}

      {loading && <p className="mb-4 text-sm text-mist/80">Loading dashboard...</p>}

      {dashboard?.view === "applicant" && applicantDetails && (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Applicant Status</h2>
            <p className="text-sm text-mist/85">Decision: <span className="text-gold-soft">{applicantDetails.decision_status}</span></p>
            <p className="text-sm text-mist/85">Workflow: <span className="text-offwhite">{applicantDetails.current_stage_label}</span></p>
            <p className="text-sm text-mist/85">Verification State: <span className="text-offwhite">{applicantDetails.status}</span></p>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Five I&apos;s Stage</h2>
            <p className="text-sm text-mist/85">
              Interview → Introduction → Indoctrination (Initiation) → Incubation → Induction
            </p>
            <p className="mt-2 text-sm text-gold-soft">Current: {applicantDetails.current_stage_label}</p>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Chairman Notices (History)</h2>
            {applicantDetails.notices.map((item) => (
              <div key={item.id} className="mb-2 rounded-md border border-white/20 bg-white/5 p-3 text-sm text-mist/85">
                <p>{item.notice_text}</p>
                <p className="mt-1 text-xs text-mist/70">{new Date(item.created_at).toLocaleString()} by {item.created_by?.name ?? "System"}</p>
              </div>
            ))}
            {applicantDetails.notices.length === 0 && <p className="text-sm text-mist/70">No notices yet.</p>}
          </div>

          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Required Documents</h2>
            {canUploadApplicantDocs && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  capture="environment"
                  onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
                />
                <button className="btn-secondary" onClick={() => void uploadDocument()} disabled={!documentFile}>Upload</button>
                <p className="text-xs text-mist/70">On Android, this can open camera/scanner or file picker depending on your browser.</p>
              </div>
            )}
            <div className="space-y-2">
              {applicantDetails.documents.map((doc) => (
                <div key={doc.id} className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-mist/85">
                  <p>
                    {doc.original_name} - <span className="text-gold-soft">{doc.status}</span> {doc.review_note ? `(${doc.review_note})` : ""}
                  </p>
                  <button
                    className="mt-2 rounded border border-white/30 px-2 py-1 text-xs text-offwhite"
                    onClick={() => void viewDocument(doc.id, doc.original_name)}
                  >
                    View
                  </button>
                </div>
              ))}
              {applicantDetails.documents.length === 0 && <p className="text-sm text-mist/70">No documents uploaded yet.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Mandated Contributions / Fees</h2>
            <p className="text-sm text-mist/85">Required Total: <span className="text-offwhite">{money(applicantDetails.fees.required_total)}</span></p>
            <p className="text-sm text-mist/85">Paid Total: <span className="text-offwhite">{money(applicantDetails.fees.paid_total)}</span></p>
            <p className="text-sm text-mist/85">Balance: <span className="text-gold-soft">{money(applicantDetails.fees.balance)}</span></p>
            {applicantDetails.fees.requirements.map((req) => (
              <div key={req.id} className="mt-2 rounded-md border border-white/20 bg-white/5 p-3">
                <p className="text-sm text-offwhite">Requirement: {money(req.required_amount)}</p>
                <p className="text-xs text-mist/70">{req.note ?? "-"}</p>
                {req.payments.map((p) => (
                  <p key={p.id} className="text-xs text-mist/80">{p.payment_date} - {money(p.amount)} by {p.encoded_by?.name ?? "Treasurer"}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {dashboard?.view !== "applicant" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">My Contributions</h2>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button className={`rounded-md border px-3 py-1 text-sm ${selectedTab === "alalayang_agila_contribution" ? "border-gold text-gold-soft" : "border-white/30 text-offwhite"}`} onClick={() => setSelectedTab("alalayang_agila_contribution")}>Alalayang Agila</button>
              <button className={`rounded-md border px-3 py-1 text-sm ${selectedTab === "monthly_contribution" ? "border-gold text-gold-soft" : "border-white/30 text-offwhite"}`} onClick={() => setSelectedTab("monthly_contribution")}>Monthly Contribution</button>
              <button className={`rounded-md border px-3 py-1 text-sm ${selectedTab === "extra_contribution" ? "border-gold text-gold-soft" : "border-white/30 text-offwhite"}`} onClick={() => setSelectedTab("extra_contribution")}>Extra Contribution</button>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-sm text-offwhite"
              >
                <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Years</option>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {year}
                  </option>
                ))}
              </select>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-sm text-offwhite"
              >
                <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Months</option>
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="mb-2 text-sm text-mist/85">Filtered Total: <span className="text-gold-soft">{money(totalFiltered)}</span></p>
            <div className="overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Amount</th>
                    <th className="px-3 py-2 text-left">Recipient</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-white/15">
                      <td className="px-3 py-2">{row.contribution_date}</td>
                      <td className="px-3 py-2">{money(row.amount)}</td>
                      <td className="px-3 py-2">{selectedTab === "monthly_contribution" ? "-" : (row.recipient_indicator ?? "-")}</td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center text-mist/70">No records found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(canChairmanReview || canTreasurerSetFee || canTreasurerPay || canChairmanSetNotice || canChairmanSetStage || canChairmanReviewDocs) && (
        <div className="mt-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-3 font-heading text-2xl text-offwhite">Application Committee Panel</h2>
          <div className="mb-3 overflow-x-auto rounded-lg border border-white/20">
            <table className="min-w-full text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-3 py-2 text-left">Select</th>
                  <th className="px-3 py-2 text-left">Applicant</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Decision</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className={`border-b border-white/15 ${selectedApplicationId === app.id ? "bg-gold/10" : ""}`}>
                    <td className="px-3 py-2"><button className="rounded border border-white/30 px-2 py-1 text-xs" onClick={() => setSelectedApplicationId(app.id)}>Select</button></td>
                    <td className="px-3 py-2">{appName(app)}</td>
                    <td className="px-3 py-2">{app.status}</td>
                    <td className="px-3 py-2">{app.decision_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedApplication && (
            <div className="space-y-3">
              <p className="text-sm text-mist/85">Selected: <span className="text-offwhite">{appName(selectedApplication)}</span></p>

              {canChairmanReview && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => void chairmanAction("approve")}>Approve</button>
                  <button className="btn-secondary" onClick={() => void chairmanAction("probation")}>Set Probation</button>
                  <button className="btn-secondary" onClick={() => void chairmanAction("reject", { reason: "Rejected by chairman review." })}>Reject</button>
                </div>
              )}

              {canChairmanSetStage && (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={stageValue} onChange={(e) => setStageValue(e.target.value)} className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite">
                    <option value="interview" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Interview</option>
                    <option value="introduction" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Introduction</option>
                    <option value="indoctrination_initiation" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Indoctrination (Initiation)</option>
                    <option value="incubation" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Incubation</option>
                    <option value="induction" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Induction</option>
                  </select>
                  <button className="btn-secondary" onClick={() => void setStageForApplicant()}>Update Stage</button>
                </div>
              )}

              {canChairmanSetNotice && (
                <div className="flex flex-wrap items-center gap-2">
                  <input value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="Chairman notice text" className="min-w-[20rem] rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                  <button className="btn-secondary" onClick={() => void setNoticeForApplicant()}>Post Notice</button>
                </div>
              )}

              {(canTreasurerSetFee || canTreasurerPay) && (
                <div className="flex flex-wrap items-center gap-2">
                  {canTreasurerSetFee && (
                    <>
                      <input value={requiredAmount} onChange={(e) => setRequiredAmount(e.target.value)} type="number" step="0.01" placeholder="Required fee amount" className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                      <button className="btn-secondary" onClick={() => void setFeeRequirement()}>Set Fee</button>
                    </>
                  )}
                  {canTreasurerPay && (
                    <>
                      <input value={selectedFeeRequirementId ?? ""} onChange={(e) => setSelectedFeeRequirementId(Number(e.target.value) || null)} placeholder="Requirement ID" className="w-[8rem] rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                      <input value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} type="number" step="0.01" placeholder="Payment amount" className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                      <button className="btn-secondary" onClick={() => void addFeePayment()}>Log Payment</button>
                    </>
                  )}
                </div>
              )}

              {canChairmanReviewDocs && selectedApplicationDetails && (
                <div className="rounded-lg border border-white/20 bg-white/5 p-3">
                  <p className="mb-2 text-sm text-offwhite">Applicant Documents</p>
                  {selectedApplicationDetails.documents.map((doc) => (
                    <div key={doc.id} className="mb-2 rounded border border-white/20 px-2 py-2 text-xs text-mist/85">
                      <p>{doc.original_name} - <span className="text-gold-soft">{doc.status}</span></p>
                      <div className="mt-1 flex gap-2">
                        <button className="rounded border border-white/30 px-2 py-1 text-offwhite" onClick={() => void viewDocument(doc.id, doc.original_name)}>View</button>
                        <button className="rounded border border-green-400/40 px-2 py-1 text-green-200" onClick={() => void reviewDocument(doc.id, "approved")}>Approve</button>
                        <button className="rounded border border-red-400/40 px-2 py-1 text-red-200" onClick={() => void reviewDocument(doc.id, "rejected")}>Reject</button>
                      </div>
                    </div>
                  ))}
                  {selectedApplicationDetails.documents.length === 0 && <p className="text-xs text-mist/70">No uploaded documents yet.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
