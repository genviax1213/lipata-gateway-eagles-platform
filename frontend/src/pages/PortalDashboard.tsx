import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission, isAdminUser } from "../utils/auth";
import { roleGlossary } from "../content/portalCopy";
import type { ApplicantDecisionStatus, ApplicantStatus } from "../types/member";
import TaskHierarchyCard from "../components/TaskHierarchyCard";
import FileSelectionPreview from "../components/FileSelectionPreview";
import FormalPhotoCard from "../components/FormalPhotoCard";
import FormalPhotoStaffViewer from "../components/FormalPhotoStaffViewer";
import type { FormalPhotoRecord } from "../utils/formalPhoto";
import { notifyPortalDataRefresh } from "../utils/portalRefresh";
import {
  PORTAL_BUILTIN_THEMES,
  applyPortalTheme,
  createCustomPortalTheme,
  readStoredPortalTheme,
  resolvePortalTheme,
  saveStoredPortalTheme,
} from "../utils/portalTheme";

type DashboardView = "applicant" | "member" | "general";

interface DashboardPayload {
  view: DashboardView;
  message?: string;
  application_archive_available?: boolean;
  can_manage_batch_applicant_contributions?: boolean;
  formal_photo?: FormalPhotoRecord | null;
}

interface SelfMemberProfile {
  id: number;
  member_number: string;
  email: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  spouse_name: string | null;
  contact_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  batch: string | null;
  induction_date: string | null;
  membership_status: "active" | "inactive";
  email_verified: boolean;
  password_set: boolean;
  formal_photo?: FormalPhotoRecord | null;
}

interface ApplicantNotice {
  id: number;
  notice_text: string;
  visibility?: "applicant" | "internal";
  created_at: string;
  created_by?: { id: number; name: string } | null;
}

interface ApplicantTimelineEvent {
  event: string;
  label: string;
  occurred_at: string | null;
}

interface ApplicantDocument {
  id: number;
  original_name: string;
  document_label?: string | null;
  description?: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at?: string | null;
}

interface ApplicantBatchDocument {
  id: number;
  original_name: string;
  created_at: string;
  uploaded_by?: { id: number; name: string } | null;
}

interface ApplicantBatchSummary {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  batch_treasurer?: { id: number; name: string; email: string } | null;
  documents: ApplicantBatchDocument[];
}

interface ApplicantBatchListRow {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  applications_count: number;
  batch_treasurer?: { id: number; name: string; email: string } | null;
}

interface BatchTreasurerCandidate {
  application_id: number;
  user_id: number;
  full_name: string;
  email: string;
  status: ApplicantStatus;
}

interface ActivationReadiness {
  eligible: boolean;
  checks: {
    approved_for_official_applicant: boolean;
    stage_induction_complete: boolean;
    documents_fully_approved: boolean;
    requirements_fully_paid: boolean;
    member_not_yet_activated: boolean;
  };
}

interface ApplicantFeeRequirement {
  id: number | null;
  category: "project" | "community_service" | "fellowship" | "five_i_activities";
  category_label: string;
  target_payment: number;
  partial_payment_total: number;
  variance: number;
  required_amount: number | string;
  note: string | null;
  set_by?: { id: number; name: string } | null;
  payments: Array<{
    id: number;
    amount: number | string;
    partial_amount?: number;
    payment_date: string;
    encoded_by?: { id: number; name: string } | null;
  }>;
}

type RequirementReviewStatus = "approved" | "rejected" | "pending";

interface ReviewStatusCounts {
  approved: number;
  rejected: number;
  pending: number;
}

interface ApplicantDetails {
  id: number;
  member_id?: number | null;
  full_name: string;
  email: string;
  status: ApplicantStatus;
  decision_status: ApplicantDecisionStatus;
  current_stage: string | null;
  current_stage_label: string;
  activation_eligible?: boolean;
  activation_readiness?: ActivationReadiness;
  activated_by?: { id: number; name: string } | null;
  batch?: ApplicantBatchSummary | null;
  timeline: ApplicantTimelineEvent[];
  notices: ApplicantNotice[];
  documents: ApplicantDocument[];
  fees: {
    required_total: number;
    paid_total: number;
    balance: number;
    variance_total?: number;
    category_labels?: Record<string, string>;
    requirements: ApplicantFeeRequirement[];
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
  status: ApplicantStatus;
  decision_status: ApplicantDecisionStatus;
  current_stage: string | null;
  batch?: { id: number; name: string } | null;
}

function money(value: number | string): string {
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function appName(app: ApplicationRow): string {
  return `${app.first_name} ${app.middle_name ? `${app.middle_name} ` : ""}${app.last_name}`;
}

function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toUpperCase() ?? "FILE";
}

function isImageDocument(filename: string): boolean {
  const normalized = filename.toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"].some((extension) => normalized.endsWith(extension));
}

function formatReviewStatusLabel(status: "pending" | "approved" | "rejected" | RequirementReviewStatus): string {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Disapproved";
  return "Pending Review";
}

function reviewStatusClasses(status: "pending" | "approved" | "rejected" | RequirementReviewStatus): string {
  if (status === "approved") return "border-green-400/40 bg-green-400/10 text-green-100";
  if (status === "rejected") return "border-red-400/40 bg-red-400/10 text-red-100";
  return "border-amber-300/40 bg-amber-300/10 text-amber-100";
}

function formatTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "Upload date unavailable";
}

function inferRequirementReviewStatus(req: ApplicantFeeRequirement): RequirementReviewStatus {
  const target = Number(req.target_payment ?? req.required_amount ?? 0);
  const paid = Number(req.partial_payment_total ?? 0);

  if (target > 0 && paid >= target) {
    return "approved";
  }

  return "pending";
}

function countDocumentStatuses(documents: ApplicantDocument[]): ReviewStatusCounts {
  return documents.reduce<ReviewStatusCounts>((counts, doc) => {
    counts[doc.status] += 1;
    return counts;
  }, { approved: 0, rejected: 0, pending: 0 });
}

function countRequirementStatuses(requirements: ApplicantFeeRequirement[]): ReviewStatusCounts {
  return requirements.reduce<ReviewStatusCounts>((counts, req) => {
    counts[inferRequirementReviewStatus(req)] += 1;
    return counts;
  }, { approved: 0, rejected: 0, pending: 0 });
}

function DocumentThumbnail({ documentId, originalName }: { documentId: number; originalName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const imageDocument = isImageDocument(originalName);

  useEffect(() => {
    if (!imageDocument) return;

    let active = true;
    let objectUrl: string | null = null;

    void api.get(`/applicants/documents/${documentId}/view`, { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setPreviewUrl(objectUrl);
        setPreviewFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setPreviewFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [documentId, imageDocument]);

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-navy/45">
      {imageDocument && previewUrl && !previewFailed ? (
        <img src={previewUrl} alt={originalName} className="h-full w-full object-cover" />
      ) : (
        <div className="px-2 text-center">
          <span className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold text-gold-soft">
            {getFileExtension(originalName)}
          </span>
          <p className="mt-2 text-[10px] text-mist/70">
            {imageDocument ? (previewFailed ? "Preview unavailable" : "Preview loading...") : "File thumbnail"}
          </p>
        </div>
      )}
    </div>
  );
}

function ApplicantDocumentCard({
  document,
  onView,
  actions,
}: {
  document: ApplicantDocument;
  onView: (documentId: number, originalName: string) => void;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/5 p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <DocumentThumbnail documentId={document.id} originalName={document.original_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-offwhite">
                {document.document_label?.trim() || document.original_name}
              </p>
              <p className="truncate text-xs text-mist/75">Filename: {document.original_name}</p>
              <p className="text-xs text-mist/75">Uploaded: {formatTimestamp(document.created_at)}</p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${reviewStatusClasses(document.status)}`}>
              {formatReviewStatusLabel(document.status)}
            </span>
          </div>
          {document.description && <p className="mt-2 text-xs text-mist/85">{document.description}</p>}
          {document.review_note && <p className="mt-2 text-xs text-gold-soft">Review note: {document.review_note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-white/30 px-2 py-1 text-xs text-offwhite"
              onClick={() => onView(document.id, document.original_name)}
            >
              View
            </button>
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

function labelRole(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toCustomForm(input: {
  navy: string;
  ink: string;
  mist: string;
  offwhite: string;
  gold: string;
  goldSoft: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
}): CustomThemeForm {
  return {
    navy: input.navy,
    ink: input.ink,
    mist: input.mist,
    offwhite: input.offwhite,
    gold: input.gold,
    goldSoft: input.goldSoft,
    bgStart: input.bgStart,
    bgMid: input.bgMid,
    bgEnd: input.bgEnd,
  };
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

interface CustomThemeForm {
  navy: string;
  ink: string;
  mist: string;
  offwhite: string;
  gold: string;
  goldSoft: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
}

type PortalTab =
  | "overview"
  | "themes"
  | "glossary"
  | "chairman-notices"
  | "applicant-status"
  | "applicant-notices"
  | "applicant-docs"
  | "applicant-fees"
  | "batch-docs"
  | "application-archive"
  | "my-contributions"
  | "my-profile"
  | "formal-photo-viewer"
  | "committee";

const PAGE_SIZE = 10;
const READABLE_SELECT_CLASS = "rounded-md border border-gold/30 bg-offwhite px-2 py-1 text-ink focus:border-gold focus:outline-none";

export default function PortalDashboard() {
  const { user } = useAuth();
  const userRoleName = typeof user?.role === "object" && user?.role !== null && "name" in user.role
    ? String((user.role as { name?: string }).name ?? "")
    : "";
  const isMembershipChairman = userRoleName === "membership_chairman";
  const canViewApplicantDashboard = hasPermission(user, "applications.dashboard.view");
  const canUploadApplicantDocs = hasPermission(user, "applications.docs.upload");
  const canChairmanReview = hasPermission(user, "applications.review");
  const canChairmanSetNotice = hasPermission(user, "applications.notice.set");
  const canChairmanSetStage = hasPermission(user, "applications.stage.set");
  const canChairmanReviewDocs = hasPermission(user, "applications.docs.review");
  const canChairmanSetContributionTarget = hasPermission(user, "applications.fee.set");
  const canChairmanLogContributionPayment = hasPermission(user, "applications.fee.pay");
  const canViewFormalPhotos = hasPermission(user, "formal_photos.view_private");
  const isAdmin = isAdminUser(user);
  const canManageChairmanNotices = isMembershipChairman && canChairmanSetNotice;

  const [activeTab, setActiveTab] = useState<PortalTab>("overview");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [applicantDetails, setApplicantDetails] = useState<ApplicantDetails | null>(null);
  const [archiveDetails, setArchiveDetails] = useState<ApplicantDetails | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [memberData, setMemberData] = useState<MemberContributionPayload | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);
  const [selectedApplicationDetails, setSelectedApplicationDetails] = useState<ApplicantDetails | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [noticeVisibility, setNoticeVisibility] = useState<"applicant" | "internal">("applicant");
  const [stageValue, setStageValue] = useState("interview");
  const [selectedContributionCategory, setSelectedContributionCategory] = useState<"project" | "community_service" | "fellowship" | "five_i_activities">("project");
  const [requiredAmount, setRequiredAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentLabel, setDocumentLabel] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [batchDocumentFile, setBatchDocumentFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("");
  const [batchDescription, setBatchDescription] = useState("");
  const [batchStartDate, setBatchStartDate] = useState("");
  const [batchTargetDate, setBatchTargetDate] = useState("");
  const [batchTreasurerUserId, setBatchTreasurerUserId] = useState("");
  const [batchIdToAssign, setBatchIdToAssign] = useState("");
  const [batches, setBatches] = useState<ApplicantBatchListRow[]>([]);
  const [batchCandidates, setBatchCandidates] = useState<BatchTreasurerCandidate[]>([]);
  const [selectedTab, setSelectedTab] = useState<"alalayang_agila_contribution" | "monthly_contribution" | "extra_contribution">("monthly_contribution");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [contributionInfo, setContributionInfo] = useState("");
  const [linkingMemberProfile, setLinkingMemberProfile] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState<string>(() => readStoredPortalTheme().selectedThemeId);
  const [customThemeForm, setCustomThemeForm] = useState<CustomThemeForm>(() => {
    const stored = readStoredPortalTheme();
    const active = resolvePortalTheme(stored);
    return toCustomForm(active);
  });
  const [themeNotice, setThemeNotice] = useState("");
  const [contributionResultsVisible, setContributionResultsVisible] = useState(true);
  const [contributionsPage, setContributionsPage] = useState(1);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [noticesPage, setNoticesPage] = useState(1);
  const [documentsPage, setDocumentsPage] = useState(1);
  const [feesPage, setFeesPage] = useState(1);
  const [committeeDocumentsPage, setCommitteeDocumentsPage] = useState(1);
  const [profile, setProfile] = useState<SelfMemberProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    spouse_name: "",
    contact_number: "",
    address: "",
    date_of_birth: "",
    induction_date: "",
  });
  const canBatchTreasurerManagePayments = Boolean(dashboard?.can_manage_batch_applicant_contributions);
  const canSelfEditProfile = !isAdmin && dashboard?.view !== "applicant";

  const parseError = useCallback((err: unknown, fallback: string): string => {
    if (!axios.isAxiosError(err)) return fallback;
    const message = (err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined)?.message;
    if (message) {
      if (message.toLowerCase().includes("unauthenticated")) {
        return "Your session appears to have expired. Please log in again.";
      }
      return message;
    }
    const errors = (err.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors;
    if (errors) {
      const first = Object.values(errors).flat()[0];
      if (first) return first;
    }
    return fallback;
  }, []);

  const reportDashboardNotice = useCallback((message: string) => {
    setError("");
    setNotice(message);
  }, []);

  const reportDashboardError = useCallback((message: string) => {
    setNotice("");
    setError(message);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    setContributionInfo("");

    try {
      const dashRes = await api.get<DashboardPayload>("/dashboard/me");
      setDashboard(dashRes.data);
      setArchiveError("");

      if (dashRes.data.view === "applicant" && canViewApplicantDashboard) {
        const appRes = await api.get<ApplicantDetails>("/applicants/me");
        setApplicantDetails(appRes.data);
        setArchiveDetails(null);
        setArchiveError("");
      } else {
        setApplicantDetails(null);
        if (dashRes.data.application_archive_available) {
          try {
            const archiveRes = await api.get<ApplicantDetails>("/applicants/archive/me");
            setArchiveDetails(archiveRes.data);
            setArchiveError("");
          } catch (err) {
            setArchiveDetails(null);
            setArchiveError(parseError(err, "Application archive is temporarily unavailable."));
          }
        } else {
          setArchiveDetails(null);
          setArchiveError("");
        }
      }

      if (dashRes.data.view !== "applicant") {
        try {
          const memberRes = await api.get<MemberContributionPayload>("/finance/my-contributions");
          setMemberData(memberRes.data);
          setContributionInfo("");
        } catch {
          setMemberData(null);
          setContributionInfo(
            typeof dashRes.data.message === "string" && dashRes.data.message.trim() !== ""
              ? dashRes.data.message
              : "No linked member contribution profile found for this account yet.",
          );
        }
      } else {
        setMemberData(null);
        setContributionInfo("");
      }

      if (!isAdmin && dashRes.data.view !== "applicant") {
        try {
          const profileRes = await api.get<SelfMemberProfile>("/members/me/profile");
          setProfile(profileRes.data);
          setProfileLoaded(true);
          setProfileForm({
            first_name: profileRes.data.first_name ?? "",
            middle_name: profileRes.data.middle_name ?? "",
            last_name: profileRes.data.last_name ?? "",
            spouse_name: profileRes.data.spouse_name ?? "",
            contact_number: profileRes.data.contact_number ?? "",
            address: profileRes.data.address ?? "",
            date_of_birth: profileRes.data.date_of_birth ?? "",
            induction_date: profileRes.data.induction_date ?? "",
          });
        } catch {
          setProfile(null);
          setProfileLoaded(false);
        }
      } else {
        setProfile(null);
        setProfileLoaded(false);
      }

    } catch (err) {
      setError(parseError(err, "Unable to load dashboard."));
    } finally {
      setLoading(false);
    }
  }, [canViewApplicantDashboard, isAdmin, parseError]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!applicationsLoaded || !selectedApplicationId) {
      setSelectedApplicationDetails(null);
      return;
    }

    void (async () => {
      try {
        const res = await api.get<ApplicantDetails>(`/applicants/${selectedApplicationId}`);
        setSelectedApplicationDetails(res.data);
      } catch {
        setSelectedApplicationDetails(null);
      }
    })();
  }, [applicationsLoaded, selectedApplicationId]);

  const applyPresetTheme = (themeId: string) => {
    const preset = PORTAL_BUILTIN_THEMES.find((item) => item.id === themeId);
    if (!preset) return;

    const stored = readStoredPortalTheme();
    saveStoredPortalTheme({
      selectedThemeId: preset.id,
      customTheme: stored.customTheme,
    });
    applyPortalTheme(preset);
    setSelectedThemeId(preset.id);
    setCustomThemeForm(toCustomForm(preset));
    setThemeNotice(`Theme applied: ${preset.name}.`);
  };

  const saveCustomTheme = () => {
    const custom = createCustomPortalTheme(customThemeForm);
    saveStoredPortalTheme({
      selectedThemeId: "custom",
      customTheme: custom,
    });
    applyPortalTheme(custom);
    setSelectedThemeId("custom");
    setThemeNotice("Custom theme saved and applied.");
  };

  const resetCustomThemeForm = () => {
    const activeTheme = resolvePortalTheme(readStoredPortalTheme());
    setCustomThemeForm(toCustomForm(activeTheme));
    setThemeNotice("Custom theme form reset from active palette.");
  };

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
  const currentHistoryDetails = useMemo(
    () => (activeTab === "application-archive" ? archiveDetails : applicantDetails),
    [activeTab, applicantDetails, archiveDetails],
  );
  const pagedContributionRows = useMemo(() => {
    const start = (contributionsPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [contributionsPage, filteredRows]);
  const contributionsLastPage = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedApplicantNotices = useMemo(() => {
    const notices = currentHistoryDetails?.notices ?? [];
    const start = (noticesPage - 1) * PAGE_SIZE;
    return notices.slice(start, start + PAGE_SIZE);
  }, [currentHistoryDetails?.notices, noticesPage]);
  const noticesLastPage = Math.max(1, Math.ceil((currentHistoryDetails?.notices?.length ?? 0) / PAGE_SIZE));
  const pagedApplicantDocuments = useMemo(() => {
    const documents = currentHistoryDetails?.documents ?? [];
    const start = (documentsPage - 1) * PAGE_SIZE;
    return documents.slice(start, start + PAGE_SIZE);
  }, [currentHistoryDetails?.documents, documentsPage]);
  const documentsLastPage = Math.max(1, Math.ceil((currentHistoryDetails?.documents?.length ?? 0) / PAGE_SIZE));
  const pagedFeeRequirements = useMemo(() => {
    const requirements = currentHistoryDetails?.fees.requirements ?? [];
    const start = (feesPage - 1) * PAGE_SIZE;
    return requirements.slice(start, start + PAGE_SIZE);
  }, [currentHistoryDetails?.fees.requirements, feesPage]);
  const feesLastPage = Math.max(1, Math.ceil((currentHistoryDetails?.fees.requirements?.length ?? 0) / PAGE_SIZE));

  const userFullName = useMemo(() => {
    if (typeof user?.name === "string" && user.name.trim()) {
      return user.name;
    }

    if (typeof user?.email === "string" && user.email.trim()) {
      return user.email;
    }

    return "Portal Account";
  }, [user]);
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

    const forumRoleName = user?.forum_role;
    if (typeof forumRoleName === "string" && forumRoleName) {
      labels.push(labelRole(forumRoleName));
    }

    return labels.length > 0 ? labels : ["No Assigned Role"];
  }, [user]);

  const statusSummary = useMemo(() => {
    if (dashboard?.view === "applicant" && applicantDetails) {
      return `Application is ${applicantDetails.status}; current stage is ${applicantDetails.current_stage_label}.`;
    }
    if (dashboard?.view === "member") {
      return "Member dashboard is active and your contribution history is available.";
    }
    return "General portal view is active.";
  }, [applicantDetails, dashboard?.view]);

  const availableActionsSummary = useMemo(() => {
    const actions: string[] = [];
    if (dashboard?.view === "applicant") {
      if (canUploadApplicantDocs) actions.push("Upload required documents");
      if (canViewApplicantDashboard) actions.push("Track application notices and fee balance");
    } else {
      actions.push("Review personal contributions");
    }

    if (canChairmanReview) actions.push("Approve/probation/reject applicants");
    if (canChairmanSetContributionTarget || canChairmanLogContributionPayment) actions.push("Manage applicant journey contribution targets and payments");
    if (canChairmanReviewDocs) actions.push("Review applicant documents");

    return actions.length > 0 ? actions.join("; ") : "No additional actions assigned.";
  }, [
    canChairmanReview,
    canChairmanReviewDocs,
    canChairmanLogContributionPayment,
    canChairmanSetContributionTarget,
    canUploadApplicantDocs,
    canViewApplicantDashboard,
    dashboard?.view,
  ]);

  const nextStepSummary = useMemo(() => {
    if (dashboard?.view === "applicant") {
      if (applicantDetails?.status === "withdrawn") {
        return "This application has been withdrawn. The archive remains available for historical reference.";
      }
      if (applicantDetails?.status === "official_applicant" || applicantDetails?.status === "eligible_for_activation") {
        return "Track your batch, 5I progress, documents, and requirement contributions until the chairman activates you as a member.";
      }
      return "Complete verification, monitor chairman notices, and withdraw only if you no longer wish to continue.";
    }
    if (archiveDetails) {
      return "Review your archived application dossier for traceability while using your current member portal access.";
    }
    if (canChairmanReview || canChairmanSetContributionTarget || canChairmanLogContributionPayment || canBatchTreasurerManagePayments) {
      return canChairmanReview
        ? "Review official applicants, manage batch assignments, and complete contribution or activation actions for your scope."
        : "Support your assigned batch by encoding applicant journey contributions while the membership chairman manages batches and activation.";
    }
    return "Review your latest contribution records and check back for new notices.";
  }, [applicantDetails?.status, archiveDetails, canBatchTreasurerManagePayments, canChairmanLogContributionPayment, canChairmanReview, canChairmanSetContributionTarget, dashboard?.view]);

  const pagedApplications = useMemo(() => {
    const start = (applicationsPage - 1) * PAGE_SIZE;
    return applications.slice(start, start + PAGE_SIZE);
  }, [applications, applicationsPage]);
  const applicationsLastPage = Math.max(1, Math.ceil(applications.length / PAGE_SIZE));
  const pagedCommitteeDocuments = useMemo(() => {
    const documents = selectedApplicationDetails?.documents ?? [];
    const start = (committeeDocumentsPage - 1) * PAGE_SIZE;
    return documents.slice(start, start + PAGE_SIZE);
  }, [committeeDocumentsPage, selectedApplicationDetails?.documents]);
  const committeeDocumentsLastPage = Math.max(1, Math.ceil((selectedApplicationDetails?.documents?.length ?? 0) / PAGE_SIZE));
  const selectedApplicationReviewSummary = useMemo(() => {
    const documents = selectedApplicationDetails?.documents ?? [];
    const requirements = selectedApplicationDetails?.fees.requirements ?? [];

    return {
      documents: countDocumentStatuses(documents),
      requirements: countRequirementStatuses(requirements),
      totalDocuments: documents.length,
      totalRequirements: requirements.length,
    };
  }, [selectedApplicationDetails?.documents, selectedApplicationDetails?.fees.requirements]);

  const loadCommitteeApplications = useCallback(async () => {
    setError("");
    setNotice("");
    try {
      const rows = await api.get<{ data: ApplicationRow[] }>("/applicants", {
        params: {
          status: canChairmanReview ? "all" : "official_applicant",
        },
      });
      setApplications(rows.data.data ?? []);
      setApplicationsLoaded(true);
      setApplicationsPage(1);
    } catch (err) {
      setError(parseError(err, "Failed to load application committee list."));
    }
  }, [canChairmanReview, parseError]);

  const refreshSelectedCommitteeApplication = useCallback(async (applicationId: number) => {
    try {
      const res = await api.get<ApplicantDetails>(`/applicants/${applicationId}`);
      setSelectedApplicationDetails(res.data);
    } catch {
      setSelectedApplicationDetails(null);
    }
  }, []);

  const loadBatchSupportData = useCallback(async () => {
    if (!canChairmanReview) return;

    try {
      const [batchRes, candidateRes] = await Promise.all([
        api.get<{ data: ApplicantBatchListRow[] }>("/applicant-batches"),
        api.get<{ data: BatchTreasurerCandidate[] }>("/applicant-batch-treasurer-candidates"),
      ]);
      setBatches(batchRes.data.data ?? []);
      setBatchCandidates(candidateRes.data.data ?? []);
    } catch (err) {
      setError(parseError(err, "Failed to load batch support data."));
    }
  }, [canChairmanReview, parseError]);

  useEffect(() => {
    const needsApplicantWorkspace = activeTab === "committee" || activeTab === "chairman-notices";
    if (
      !needsApplicantWorkspace
      || applicationsLoaded
      || !(canChairmanReview || canChairmanSetContributionTarget || canChairmanLogContributionPayment || canManageChairmanNotices || canChairmanSetStage || canChairmanReviewDocs || canBatchTreasurerManagePayments)
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadCommitteeApplications();
      if (activeTab === "committee") {
        void loadBatchSupportData();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    applicationsLoaded,
    canChairmanLogContributionPayment,
    canChairmanReview,
    canChairmanReviewDocs,
    canChairmanSetContributionTarget,
    canManageChairmanNotices,
    canChairmanSetStage,
    canBatchTreasurerManagePayments,
    loadBatchSupportData,
    loadCommitteeApplications,
  ]);

  useEffect(() => {
    setCommitteeDocumentsPage(1);
  }, [selectedApplicationId]);

  const uploadDocument = async () => {
    if (!applicantDetails || !documentFile || !canUploadApplicantDocs || !documentLabel.trim() || !documentDescription.trim()) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const payload = new FormData();
      payload.append("document", documentFile);
      payload.append("document_label", documentLabel.trim());
      payload.append("description", documentDescription.trim());
      await api.post(`/applicants/${applicantDetails.id}/documents`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotice("Document uploaded.");
      setDocumentFile(null);
      setDocumentLabel("");
      setDocumentDescription("");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to upload document."));
    } finally {
      setLoading(false);
    }
  };

  const withdrawApplication = async () => {
    if (!applicantDetails) return;
    if (!window.confirm("Withdraw this membership application? The record will be archived and future login access will be blocked.")) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const res = await api.post<{ message?: string }>("/applicants/me/withdraw");
      setNotice(res.data?.message ?? "Application withdrawn.");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to withdraw application."));
    }
  };

  const chairmanAction = useCallback(async (path: string, payload?: Record<string, unknown>) => {
    if (!selectedApplication) return;
    setError("");
    setNotice("");

    try {
      const res = await api.post<{ message?: string; application?: Partial<ApplicationRow> & { id?: number } }>(
        `/applicants/${selectedApplication.id}/${path}`,
        payload ?? {},
      );
      const updatedApplication = res.data?.application;
      if (updatedApplication?.id) {
        setApplications((current) => current.map((item) => (
          item.id === updatedApplication.id
            ? {
                ...item,
                status: (updatedApplication.status as ApplicationRow["status"] | undefined) ?? item.status,
                decision_status: (updatedApplication.decision_status as ApplicationRow["decision_status"] | undefined) ?? item.decision_status,
                current_stage: (updatedApplication.current_stage as string | null | undefined) ?? item.current_stage,
              }
            : item
        )));
        await refreshSelectedCommitteeApplication(updatedApplication.id);
      } else {
        await refreshSelectedCommitteeApplication(selectedApplication.id);
      }
      setNotice("Application decision updated.");
    } catch (err) {
      setError(parseError(err, "Failed to update application."));
    }
  }, [parseError, refreshSelectedCommitteeApplication, selectedApplication]);

  const recoverPendingVerificationApplicant = useCallback(async () => {
    if (!selectedApplication || selectedApplication.status !== "pending_verification") return;
    if (!window.confirm(`Delete the pending verification record for ${appName(selectedApplication)} so they can register again using the correct email address?`)) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const res = await api.post<{ message?: string }>(`/applicants/${selectedApplication.id}/recover-pending-verification`);
      setNotice(res.data?.message ?? "Pending verification applicant removed.");
      setSelectedApplicationId(null);
      setSelectedApplicationDetails(null);
      await loadCommitteeApplications();
      notifyPortalDataRefresh("applicants");
    } catch (err) {
      setError(parseError(err, "Failed to remove the pending verification applicant."));
    }
  }, [loadCommitteeApplications, parseError, selectedApplication]);

  const setNoticeForApplicant = async () => {
    if (!selectedApplication || !noticeText.trim()) return;
    setError("");
    setNotice("");

    try {
      await api.post(`/applicants/${selectedApplication.id}/notice`, {
        notice_text: noticeText.trim(),
        visibility: noticeVisibility,
      });
      setNotice(noticeVisibility === "internal" ? "Internal committee note saved." : "Notice posted.");
      setNoticeText("");
      setNoticeVisibility("applicant");
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
      await api.post(`/applicants/${selectedApplication.id}/stage`, {
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
      await api.post(`/applicants/${selectedApplication.id}/fee-requirements`, {
        category: selectedContributionCategory,
        required_amount: Number(requiredAmount),
        note: "Membership chairman target contribution",
      });
      setNotice("Applicant target contribution set.");
      setRequiredAmount("");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to set required fee."));
    }
  };

  const addFeePayment = async () => {
    if (!selectedApplication || !paymentAmount) return;

    setError("");
    setNotice("");
    try {
      await api.post(`/applicants/${selectedApplication.id}/fee-payments`, {
        category: selectedContributionCategory,
        amount: Number(paymentAmount),
      });
      setNotice("Applicant partial/full payment logged.");
      setPaymentAmount("");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to log payment."));
    }
  };

  const createApplicantBatch = async () => {
    if (!batchName.trim()) return;
    setError("");
    setNotice("");
    try {
      const response = await api.post<{ batch?: { id: number; name: string } }>("/applicant-batches", {
        name: batchName.trim(),
        description: batchDescription.trim() || null,
        start_date: batchStartDate || null,
        target_completion_date: batchTargetDate || null,
        batch_treasurer_user_id: batchTreasurerUserId ? Number(batchTreasurerUserId) : null,
      });
      if (response.data?.batch?.id) {
        setBatchIdToAssign(String(response.data.batch.id));
      }
      setNotice(`Applicant batch created${response.data?.batch?.id ? ` (#${response.data.batch.id})` : ""}.`);
      setBatchName("");
      setBatchDescription("");
      setBatchStartDate("");
      setBatchTargetDate("");
      setBatchTreasurerUserId("");
      await loadCommitteeApplications();
      await loadBatchSupportData();
    } catch (err) {
      setError(parseError(err, "Failed to create applicant batch."));
    }
  };

  const assignBatchToApplication = async () => {
    if (!selectedApplication || !batchIdToAssign) return;
    setError("");
    setNotice("");
    try {
      await api.post(`/applicants/${selectedApplication.id}/assign-batch`, {
        batch_id: Number(batchIdToAssign),
      });
      setNotice("Applicant batch assigned.");
      setBatchIdToAssign("");
      await loadDashboard();
      await loadBatchSupportData();
    } catch (err) {
      setError(parseError(err, "Failed to assign applicant batch."));
    }
  };

  const uploadSharedBatchDocument = async () => {
    if (!selectedApplicationDetails?.batch?.id || !batchDocumentFile) return;
    setError("");
    setNotice("");
    try {
      const payload = new FormData();
      payload.append("document", batchDocumentFile);
      await api.post(`/applicant-batches/${selectedApplicationDetails.batch.id}/documents`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotice("Batch document uploaded.");
      setBatchDocumentFile(null);
      if (selectedApplicationId) {
        const res = await api.get<ApplicantDetails>(`/applicants/${selectedApplicationId}`);
        setSelectedApplicationDetails(res.data);
      }
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to upload batch document."));
    }
  };

  const activateApplicantAsMember = async () => {
    if (!selectedApplication) return;
    setError("");
    setNotice("");
    try {
      const res = await api.post<{ message?: string }>(`/applicants/${selectedApplication.id}/activate`);
      setNotice(res.data?.message ?? "Official applicant activated as member.");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to activate applicant as member."));
    }
  };

  const reviewDocument = async (documentId: number, status: "approved" | "rejected") => {
    setError("");
    setNotice("");
    try {
      await api.post(`/applicants/documents/${documentId}/review`, { status });
      setNotice(`Document ${status}.`);
      if (selectedApplicationId) {
        const res = await api.get<ApplicantDetails>(`/applicants/${selectedApplicationId}`);
        setSelectedApplicationDetails(res.data);
      }
    } catch (err) {
      setError(parseError(err, "Failed to review document."));
    }
  };

  const linkAdminMemberProfile = async () => {
    setError("");
    setNotice("");
    setLinkingMemberProfile(true);
    try {
      const res = await api.post<{ message?: string }>("/admin/users/me/link-member-profile");
      setNotice(res.data?.message ?? "Admin account linked to member profile.");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to link admin account to a member profile."));
    } finally {
      setLinkingMemberProfile(false);
    }
  };

  const saveOwnProfile = async () => {
    if (!canSelfEditProfile) return;

    setError("");
    setNotice("");
    setSavingProfile(true);

    try {
      const response = await api.put<{ message?: string; member?: SelfMemberProfile }>("/members/me/profile", profileForm);
      if (response.data?.member) {
        setProfile(response.data.member);
        setProfileForm({
          first_name: response.data.member.first_name ?? "",
          middle_name: response.data.member.middle_name ?? "",
          last_name: response.data.member.last_name ?? "",
          spouse_name: response.data.member.spouse_name ?? "",
          contact_number: response.data.member.contact_number ?? "",
          address: response.data.member.address ?? "",
          date_of_birth: response.data.member.date_of_birth ?? "",
          induction_date: response.data.member.induction_date ?? "",
        });
      }
      setNotice(response.data?.message ?? "Profile updated successfully.");
      await loadDashboard();
    } catch (err) {
      setError(parseError(err, "Failed to update profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const viewDocument = async (documentId: number, originalName: string) => {
    setError("");
    try {
      const response = await api.get(`/applicants/documents/${documentId}/view`, {
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

  const viewBatchDocument = async (documentId: number, originalName: string) => {
    setError("");
    try {
      const response = await api.get(`/applicant-batches/documents/${documentId}/view`, {
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(response.data as Blob);
      const tab = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!tab) {
        setError("Popup blocked. Allow popups to view the document.");
      }
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      setError(parseError(err, `Failed to open ${originalName}.`));
    }
  };

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Portal Dashboard</h1>
      <p className="mb-6 text-sm text-mist/85">
        Dashboard content adapts to your assigned role.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => setActiveTab("overview")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "overview" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Overview</button>
        {dashboard?.view === "applicant" && applicantDetails && <button type="button" onClick={() => setActiveTab("applicant-status")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "applicant-status" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Application Status</button>}
        {dashboard?.view === "applicant" && applicantDetails && <button type="button" onClick={() => setActiveTab("applicant-notices")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "applicant-notices" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Notices</button>}
        {dashboard?.view === "applicant" && applicantDetails && <button type="button" onClick={() => setActiveTab("applicant-docs")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "applicant-docs" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Documents</button>}
        {dashboard?.view === "applicant" && applicantDetails && <button type="button" onClick={() => setActiveTab("applicant-fees")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "applicant-fees" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Requirements</button>}
        {dashboard?.view === "applicant" && applicantDetails?.batch && <button type="button" onClick={() => setActiveTab("batch-docs")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "batch-docs" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Batch Materials</button>}
        {dashboard?.application_archive_available && <button type="button" onClick={() => setActiveTab("application-archive")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "application-archive" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Application Archive</button>}
        {dashboard?.view !== "applicant" && <button type="button" onClick={() => setActiveTab("my-contributions")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "my-contributions" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>My Contributions</button>}
        {canSelfEditProfile && <button type="button" onClick={() => setActiveTab("my-profile")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "my-profile" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>My Profile</button>}
        {canViewFormalPhotos && <button type="button" onClick={() => setActiveTab("formal-photo-viewer")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "formal-photo-viewer" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Formal Photos</button>}
        {isAdmin && <button type="button" onClick={() => setActiveTab("themes")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "themes" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Themes</button>}
        {isAdmin && <button type="button" onClick={() => setActiveTab("glossary")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "glossary" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Glossary</button>}
        {canManageChairmanNotices && <button type="button" onClick={() => setActiveTab("chairman-notices")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "chairman-notices" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Chairman Notices</button>}
        {(canChairmanReview || canChairmanSetContributionTarget || canChairmanLogContributionPayment || canChairmanSetStage || canChairmanReviewDocs || canBatchTreasurerManagePayments) && <button type="button" onClick={() => setActiveTab("committee")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "committee" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Application Review</button>}
      </div>

      {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200" role="alert" aria-live="polite">{error}</p>}
      {notice && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft" role="status" aria-live="polite">{notice}</p>}

      {loading && <p className="mb-4 text-sm text-mist/80">Loading dashboard...</p>}

      {activeTab === "overview" && (
        <>
          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-xl text-offwhite">User Session</h2>
            <p className="text-sm text-mist/85">Name: <span className="text-offwhite">{userFullName}</span></p>
            <p className="text-sm text-mist/85">Email: <span className="text-offwhite">{userEmail}</span></p>
            <p className="text-sm text-mist/85">Roles: <span className="text-gold-soft">{roleLabels.join(", ")}</span></p>
          </div>

          <div className="mt-4 rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-xl text-offwhite">Task Snapshot</h2>
            <TaskHierarchyCard status={statusSummary} actions={availableActionsSummary} nextStep={nextStepSummary} />
          </div>
        </>
      )}

      {activeTab === "themes" && isAdmin && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-xl text-offwhite">Theme Settings</h2>
          <p className="mb-3 text-sm text-mist/85">Choose one of 10 normal/dark colorful themes, or save your own custom palette.</p>
          {themeNotice ? (
            <p className="mb-3 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold-soft">{themeNotice}</p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label htmlFor="admin-theme-preset" className="text-xs font-semibold text-mist/85">Preset Theme</label>
            <select
              id="admin-theme-preset"
              value={selectedThemeId === "custom" ? "" : selectedThemeId}
              onChange={(e) => {
                if (e.target.value) {
                  applyPresetTheme(e.target.value);
                }
              }}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Select preset theme</option>
              {PORTAL_BUILTIN_THEMES.map((theme) => (
                <option
                  key={theme.id}
                  value={theme.id}
                  style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}
                >
                  {theme.name} ({theme.mode})
                </option>
              ))}
            </select>
            {selectedThemeId === "custom" ? (
              <span className="rounded border border-gold/40 bg-gold/10 px-2 py-1 text-xs text-gold-soft">Using Custom Theme</span>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {([
              ["navy", "Navy"],
              ["ink", "Ink"],
              ["mist", "Mist"],
              ["offwhite", "Off White"],
              ["gold", "Gold"],
              ["goldSoft", "Gold Soft"],
              ["bgStart", "BG Start"],
              ["bgMid", "BG Middle"],
              ["bgEnd", "BG End"],
            ] as Array<[keyof CustomThemeForm, string]>).map(([key, label]) => (
              <label key={key} className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs text-mist/85">
                <span className="mb-2 block font-semibold">{label}</span>
                <input
                  type="color"
                  value={customThemeForm[key]}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCustomThemeForm((prev) => ({ ...prev, [key]: next }));
                  }}
                  className="h-9 w-full cursor-pointer rounded border border-white/20 bg-transparent"
                />
                <span className="mt-1 block text-[11px] text-mist/70">{customThemeForm[key]}</span>
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary" type="button" onClick={() => saveCustomTheme()}>Save & Apply Custom Theme</button>
            <button className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10" type="button" onClick={() => resetCustomThemeForm()}>
              Reset Custom Form
            </button>
          </div>
        </div>
      )}

      {activeTab === "glossary" && isAdmin && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-xl text-offwhite">Role Glossary</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {roleGlossary.map((item) => (
              <div key={item.role} className="rounded border border-white/20 bg-white/5 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-soft">{item.role}</p>
                <p className="text-xs text-mist/85">{item.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "applicant-status" && dashboard?.view === "applicant" && applicantDetails && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Application Status</h2>
          <p className="text-sm text-mist/85">Decision: <span className="text-gold-soft">{applicantDetails.decision_status}</span></p>
          <p className="text-sm text-mist/85">Workflow: <span className="text-offwhite">{applicantDetails.current_stage_label}</span></p>
          <p className="text-sm text-mist/85">Applicant Status: <span className="text-offwhite">{applicantDetails.status}</span></p>
          {applicantDetails.batch && (
            <p className="text-sm text-mist/85">Batch: <span className="text-offwhite">{applicantDetails.batch.name}</span></p>
          )}
          {(applicantDetails.status === "pending_verification" || applicantDetails.status === "under_review" || applicantDetails.status === "official_applicant" || applicantDetails.status === "eligible_for_activation") && (
            <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-400/10 p-4">
              <h3 className="mb-2 font-heading text-lg text-offwhite">Official Applicant Progress</h3>
              <p className="text-sm text-mist/85">
                Your applicant dossier remains active through training and requirements. The membership committee chairman activates you as a member only after the 5I flow, documents, and applicant contributions are all complete.
              </p>
              {applicantDetails.activation_readiness && (
                <ul className="mt-3 space-y-1 text-xs text-mist/85">
                  <li>Approval: {applicantDetails.activation_readiness.checks.approved_for_official_applicant ? "Ready" : "Pending"}</li>
                  <li>Induction Stage: {applicantDetails.activation_readiness.checks.stage_induction_complete ? "Ready" : "Pending"}</li>
                  <li>Documents: {applicantDetails.activation_readiness.checks.documents_fully_approved ? "Ready" : "Pending"}</li>
                  <li>Requirements Paid: {applicantDetails.activation_readiness.checks.requirements_fully_paid ? "Ready" : "Pending"}</li>
                </ul>
              )}
              {(applicantDetails.status === "pending_verification" || applicantDetails.status === "under_review") && (
                <button type="button" className="mt-3 rounded-md border border-amber-300/40 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/10" onClick={() => void withdrawApplication()}>
                  Withdraw Application
                </button>
              )}
            </div>
          )}
          <div className="mt-4 rounded-xl border border-white/20 bg-white/5 p-4">
            <h2 className="mb-2 font-heading text-xl text-offwhite">Five I&apos;s Stage</h2>
            <p className="text-sm text-mist/85">
              Interview → Introduction → Indoctrination (Initiation) → Incubation → Induction
            </p>
            <p className="mt-2 text-sm text-gold-soft">Current: {applicantDetails.current_stage_label}</p>
          </div>
        </div>
      )}

      {activeTab === "applicant-notices" && dashboard?.view === "applicant" && applicantDetails && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Chairman Notices (History)</h2>
            {pagedApplicantNotices.map((item) => (
              <div key={item.id} className="mb-2 rounded-md border border-white/20 bg-white/5 p-3 text-sm text-mist/85">
                <p>{item.notice_text}</p>
                <p className="mt-1 text-xs text-mist/70">{new Date(item.created_at).toLocaleString()} by {item.created_by?.name ?? "System"}</p>
              </div>
            ))}
            {applicantDetails.notices.length === 0 && <p className="text-sm text-mist/70">No notices yet.</p>}
            <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
              <span>Page {noticesPage} of {noticesLastPage} | Total {applicantDetails.notices.length}</span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" disabled={noticesPage <= 1} onClick={() => setNoticesPage((current) => Math.max(1, current - 1))}>Prev</button>
                <button type="button" className="btn-secondary" disabled={noticesPage >= noticesLastPage} onClick={() => setNoticesPage((current) => Math.min(noticesLastPage, current + 1))}>Next</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "applicant-docs" && dashboard?.view === "applicant" && applicantDetails && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Required Documents</h2>
          <p className="mb-4 text-sm text-mist/80">
            Your uploads are visible to your applicant account, authorized officers handling applicant documents or reviews, and your assigned batch treasurer once a batch is linked.
          </p>
          {canUploadApplicantDocs && (
            <div className="mb-4 space-y-3">
              <FileSelectionPreview
                id="applicant-document-upload"
                label="Upload Document"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                capture="environment"
                file={documentFile}
                buttonLabel="Choose or Scan File"
                helperText="On Android, this can open camera/scanner or file picker depending on your browser."
                onChange={setDocumentFile}
                onClear={() => setDocumentFile(null)}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="applicant-document-label" className="text-xs font-semibold uppercase tracking-[0.18em] text-mist/85">
                    Document Label
                  </label>
                  <input
                    id="applicant-document-label"
                    value={documentLabel}
                    onChange={(e) => setDocumentLabel(e.target.value)}
                    maxLength={120}
                    placeholder="Example: Valid ID Front"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="applicant-document-description" className="text-xs font-semibold uppercase tracking-[0.18em] text-mist/85">
                    Description
                  </label>
                  <textarea
                    id="applicant-document-description"
                    value={documentDescription}
                    onChange={(e) => setDocumentDescription(e.target.value)}
                    maxLength={255}
                    placeholder="State what this file is and why it was uploaded."
                    className="min-h-[96px] w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite md:min-h-full"
                  />
                </div>
              </div>
              <p className="text-xs text-mist/70">Both label and description are required before upload so the chairman can identify each file clearly.</p>
              <button
                className="btn-secondary"
                onClick={() => void uploadDocument()}
                disabled={!documentFile || !documentLabel.trim() || !documentDescription.trim()}
              >
                Upload
              </button>
            </div>
          )}
          <div className="space-y-2">
            {pagedApplicantDocuments.map((doc) => (
              <ApplicantDocumentCard
                key={doc.id}
                document={doc}
                onView={(documentId, originalName) => void viewDocument(documentId, originalName)}
              />
            ))}
            {applicantDetails.documents.length === 0 && <p className="text-sm text-mist/70">No documents uploaded yet.</p>}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
            <span>Page {documentsPage} of {documentsLastPage} | Total {applicantDetails.documents.length}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={documentsPage <= 1} onClick={() => setDocumentsPage((current) => Math.max(1, current - 1))}>Prev</button>
              <button type="button" className="btn-secondary" disabled={documentsPage >= documentsLastPage} onClick={() => setDocumentsPage((current) => Math.min(documentsLastPage, current + 1))}>Next</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "applicant-fees" && dashboard?.view === "applicant" && applicantDetails && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Application Requirements</h2>
          <p className="text-sm text-mist/85">Target Total: <span className="text-offwhite">{money(applicantDetails.fees.required_total)}</span></p>
          <p className="text-sm text-mist/85">Partial/Full Paid Total: <span className="text-offwhite">{money(applicantDetails.fees.paid_total)}</span></p>
          <p className="text-sm text-mist/85">Variance: <span className="text-gold-soft">{money(applicantDetails.fees.variance_total ?? applicantDetails.fees.balance)}</span></p>
          {pagedFeeRequirements.map((req) => (
            <div key={req.category} className="mt-2 rounded-md border border-white/20 bg-white/5 p-3">
              <p className="text-sm text-offwhite">{req.category_label}</p>
              <p className="text-xs text-mist/70">Target: {money(req.target_payment)} | Paid: {money(req.partial_payment_total)} | Variance: {money(req.variance)}</p>
              <p className="text-xs text-mist/70">{req.note ?? "-"}</p>
              {req.payments.map((p) => (
                <p key={p.id} className="text-xs text-mist/80">{p.payment_date} - {money(p.amount)} by {p.encoded_by?.name ?? "Membership Chairman"}</p>
              ))}
            </div>
          ))}
          <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
            <span>Page {feesPage} of {feesLastPage} | Total {applicantDetails.fees.requirements.length}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={feesPage <= 1} onClick={() => setFeesPage((current) => Math.max(1, current - 1))}>Prev</button>
              <button type="button" className="btn-secondary" disabled={feesPage >= feesLastPage} onClick={() => setFeesPage((current) => Math.min(feesLastPage, current + 1))}>Next</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "batch-docs" && dashboard?.view === "applicant" && applicantDetails?.batch && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Batch Materials</h2>
          <p className="text-sm text-mist/85">Batch: <span className="text-offwhite">{applicantDetails.batch.name}</span></p>
          {applicantDetails.batch.batch_treasurer && (
            <p className="text-sm text-mist/85">Batch Treasurer: <span className="text-offwhite">{applicantDetails.batch.batch_treasurer.name}</span></p>
          )}
          <p className="mt-2 text-sm text-mist/85">{applicantDetails.batch.description ?? "Shared schedule, references, and documents for your applicant batch."}</p>
          <div className="mt-4 space-y-2">
            {applicantDetails.batch.documents.map((doc) => (
              <div key={doc.id} className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-mist/85">
                <p>{doc.original_name}</p>
                <button className="mt-2 rounded border border-white/30 px-2 py-1 text-xs text-offwhite" onClick={() => void viewBatchDocument(doc.id, doc.original_name)}>
                  View
                </button>
              </div>
            ))}
            {applicantDetails.batch.documents.length === 0 && <p className="text-sm text-mist/70">No shared batch materials yet.</p>}
          </div>
        </div>
      )}

      {activeTab === "application-archive" && dashboard?.application_archive_available && (
        <div className="space-y-4">
          {!archiveDetails && (
            <div className="rounded-xl border border-white/20 bg-white/10 p-4">
              <h2 className="mb-2 font-heading text-2xl text-offwhite">Application Archive</h2>
              <p className="text-sm text-mist/85">
                {archiveError || "Archive details are loading or temporarily unavailable. Refresh the dashboard to try again."}
              </p>
            </div>
          )}

          {archiveDetails && (
            <>
          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Application Archive</h2>
            <p className="text-sm text-mist/85">This dossier preserves your submitted membership application, related documents, notices, and requirement records after lifecycle completion.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <p className="text-sm text-mist/85">Archive Status: <span className="text-offwhite">{archiveDetails.status}</span></p>
              <p className="text-sm text-mist/85">Decision: <span className="text-gold-soft">{archiveDetails.decision_status}</span></p>
              <p className="text-sm text-mist/85">Final Stage: <span className="text-offwhite">{archiveDetails.current_stage_label}</span></p>
              <p className="text-sm text-mist/85">Linked Member Profile: <span className="text-offwhite">{archiveDetails.member_id ? `#${archiveDetails.member_id}` : "Not linked"}</span></p>
            </div>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h3 className="mb-2 font-heading text-xl text-offwhite">Lifecycle Timeline</h3>
            <div className="space-y-2">
              {archiveDetails.timeline.map((item) => (
                <div key={`${item.event}-${item.occurred_at ?? "unknown"}`} className="rounded-md border border-white/20 bg-white/5 px-3 py-2">
                  <p className="text-sm text-offwhite">{item.label}</p>
                  <p className="text-xs text-mist/75">{item.occurred_at ? new Date(item.occurred_at).toLocaleString() : "Timestamp unavailable"}</p>
                </div>
              ))}
            </div>
          </div>
            </>
          )}

          {archiveDetails && (
            <>
              <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                <h3 className="mb-2 font-heading text-xl text-offwhite">Archive Notices</h3>
                {pagedApplicantNotices.map((item) => (
                  <div key={item.id} className="mb-2 rounded-md border border-white/20 bg-white/5 p-3 text-sm text-mist/85">
                    <p>{item.notice_text}</p>
                    <p className="mt-1 text-xs text-mist/70">{new Date(item.created_at).toLocaleString()} by {item.created_by?.name ?? "System"}</p>
                  </div>
                ))}
                {archiveDetails.notices.length === 0 && <p className="text-sm text-mist/70">No archived notices.</p>}
                <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                  <span>Page {noticesPage} of {noticesLastPage} | Total {archiveDetails.notices.length}</span>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" disabled={noticesPage <= 1} onClick={() => setNoticesPage((current) => Math.max(1, current - 1))}>Prev</button>
                    <button type="button" className="btn-secondary" disabled={noticesPage >= noticesLastPage} onClick={() => setNoticesPage((current) => Math.min(noticesLastPage, current + 1))}>Next</button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                <h3 className="mb-2 font-heading text-xl text-offwhite">Archive Documents</h3>
                <div className="space-y-2">
                  {pagedApplicantDocuments.map((doc) => (
                    <ApplicantDocumentCard
                      key={doc.id}
                      document={doc}
                      onView={(documentId, originalName) => void viewDocument(documentId, originalName)}
                    />
                  ))}
                  {archiveDetails.documents.length === 0 && <p className="text-sm text-mist/70">No archived documents.</p>}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                  <span>Page {documentsPage} of {documentsLastPage} | Total {archiveDetails.documents.length}</span>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" disabled={documentsPage <= 1} onClick={() => setDocumentsPage((current) => Math.max(1, current - 1))}>Prev</button>
                    <button type="button" className="btn-secondary" disabled={documentsPage >= documentsLastPage} onClick={() => setDocumentsPage((current) => Math.min(documentsLastPage, current + 1))}>Next</button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                <h3 className="mb-2 font-heading text-xl text-offwhite">Archive Requirements</h3>
                <p className="text-sm text-mist/85">Target Total: <span className="text-offwhite">{money(archiveDetails.fees.required_total)}</span></p>
                <p className="text-sm text-mist/85">Paid Total: <span className="text-offwhite">{money(archiveDetails.fees.paid_total)}</span></p>
                <p className="text-sm text-mist/85">Variance: <span className="text-gold-soft">{money(archiveDetails.fees.variance_total ?? archiveDetails.fees.balance)}</span></p>
                {pagedFeeRequirements.map((req) => (
                  <div key={req.category} className="mt-2 rounded-md border border-white/20 bg-white/5 p-3">
                    <p className="text-sm text-offwhite">{req.category_label}</p>
                    <p className="text-xs text-mist/70">Target: {money(req.target_payment)} | Paid: {money(req.partial_payment_total)} | Variance: {money(req.variance)}</p>
                    <p className="text-xs text-mist/70">{req.note ?? "-"}</p>
                    {req.payments.map((p) => (
                      <p key={p.id} className="text-xs text-mist/80">{p.payment_date} - {money(p.amount)} by {p.encoded_by?.name ?? "Membership Chairman"}</p>
                    ))}
                  </div>
                ))}
                <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                  <span>Page {feesPage} of {feesLastPage} | Total {archiveDetails.fees.requirements.length}</span>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" disabled={feesPage <= 1} onClick={() => setFeesPage((current) => Math.max(1, current - 1))}>Prev</button>
                    <button type="button" className="btn-secondary" disabled={feesPage >= feesLastPage} onClick={() => setFeesPage((current) => Math.min(feesLastPage, current + 1))}>Next</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "my-contributions" && dashboard?.view !== "applicant" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">My Contributions</h2>
            {!memberData && contributionInfo && (
              <div className="mb-3 rounded-md border border-white/20 bg-white/5 px-3 py-2">
                <p className="text-sm text-mist/85">{contributionInfo}</p>
                {isAdmin && (
                  <button
                    className="mt-2 rounded border border-gold/40 px-3 py-1 text-xs text-gold-soft disabled:opacity-50"
                    onClick={() => void linkAdminMemberProfile()}
                    disabled={linkingMemberProfile}
                  >
                    {linkingMemberProfile ? "Linking..." : "Link My Admin Account to Member Profile"}
                  </button>
                )}
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button className={`rounded-md border px-3 py-1 text-sm ${selectedTab === "alalayang_agila_contribution" ? "border-gold text-gold-soft" : "border-white/30 text-offwhite"}`} onClick={() => setSelectedTab("alalayang_agila_contribution")}>Alalayang Agila</button>
              <button className={`rounded-md border px-3 py-1 text-sm ${selectedTab === "monthly_contribution" ? "border-gold text-gold-soft" : "border-white/30 text-offwhite"}`} onClick={() => setSelectedTab("monthly_contribution")}>Monthly Contribution</button>
              <button className={`rounded-md border px-3 py-1 text-sm ${selectedTab === "extra_contribution" ? "border-gold text-gold-soft" : "border-white/30 text-offwhite"}`} onClick={() => setSelectedTab("extra_contribution")}>Extra Contribution</button>
              <select
                aria-label="Filter contributions by year"
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
                aria-label="Filter contributions by month"
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
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setContributionsPage(1);
                  setContributionResultsVisible(true);
                }}
              >
                Search
              </button>
            </div>
            <p className="mb-2 text-sm text-mist/85">Filtered Total: <span className="text-gold-soft">{money(totalFiltered)}</span></p>
            {contributionResultsVisible && (
              <>
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
                      {pagedContributionRows.map((row) => (
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
                <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                  <span>Page {contributionsPage} of {contributionsLastPage} | Total {filteredRows.length}</span>
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary" disabled={contributionsPage <= 1} onClick={() => setContributionsPage((current) => Math.max(1, current - 1))}>Prev</button>
                    <button type="button" className="btn-secondary" disabled={contributionsPage >= contributionsLastPage} onClick={() => setContributionsPage((current) => Math.min(contributionsLastPage, current + 1))}>Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "chairman-notices" && canManageChairmanNotices && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <div className="mb-4">
            <h2 className="font-heading text-2xl text-offwhite">Chairman Notices</h2>
            <p className="mt-1 max-w-3xl text-sm text-mist/80">
              Select an applicant, then post either an applicant-facing notice or an internal committee note. This workspace is limited to the membership chairman.
            </p>
          </div>

          {!applicationsLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Loading applicants for notice posting...
            </div>
          ) : (
            <>
              <div className="mb-4 overflow-x-auto rounded-lg border border-white/20">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-3 py-2 text-left">Select</th>
                      <th className="px-3 py-2 text-left">Applicant</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Batch</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedApplications.map((app) => (
                      <tr key={app.id} className={`border-b border-white/15 ${selectedApplicationId === app.id ? "bg-gold/10" : ""}`}>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className={`rounded border px-2 py-1 text-xs ${selectedApplicationId === app.id ? "border-gold bg-gold text-ink" : "border-white/30 text-offwhite"}`}
                            onClick={() => setSelectedApplicationId((current) => (current === app.id ? null : app.id))}
                          >
                            {selectedApplicationId === app.id ? "Selected" : "Select"}
                          </button>
                        </td>
                        <td className="px-3 py-2">{appName(app)}</td>
                        <td className="px-3 py-2 text-mist/85">{app.email}</td>
                        <td className="px-3 py-2 text-mist/85">{app.batch?.name ?? "Unassigned"}</td>
                        <td className="px-3 py-2">{app.status}</td>
                        <td className="px-3 py-2">{app.decision_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mb-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {applicationsPage} of {applicationsLastPage} | Total {applications.length}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={applicationsPage <= 1} onClick={() => setApplicationsPage((current) => Math.max(1, current - 1))}>Prev</button>
                  <button type="button" className="btn-secondary" disabled={applicationsPage >= applicationsLastPage} onClick={() => setApplicationsPage((current) => Math.min(applicationsLastPage, current + 1))}>Next</button>
                </div>
              </div>
            </>
          )}

          {selectedApplication ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">Selected Applicant</p>
                  <h3 className="mt-2 font-heading text-xl text-offwhite">{appName(selectedApplication)}</h3>
                  <p className="mt-1 text-sm text-mist/75">
                    Status: <span className="text-offwhite">{selectedApplication.status}</span>
                    <span className="mx-2 text-mist/40">|</span>
                    Decision: <span className="text-offwhite">{selectedApplication.decision_status}</span>
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="chairman-notice-text" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">
                      Notice Message
                    </label>
                    <textarea
                      id="chairman-notice-text"
                      value={noticeText}
                      onChange={(e) => setNoticeText(e.target.value)}
                      placeholder="Write the applicant notice or internal committee note here."
                      className="min-h-[140px] w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-offwhite focus:border-gold focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="chairman-notice-visibility" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">
                        Visibility
                      </label>
                      <select
                        id="chairman-notice-visibility"
                        value={noticeVisibility}
                        onChange={(e) => setNoticeVisibility(e.target.value as "applicant" | "internal")}
                        className={`${READABLE_SELECT_CLASS} w-full`}
                      >
                        <option value="applicant" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Applicant Visible</option>
                        <option value="internal" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Internal Only</option>
                      </select>
                    </div>
                    <button className="btn-primary sm:self-end" onClick={() => void setNoticeForApplicant()} disabled={!noticeText.trim()}>
                      Post Notice
                    </button>
                  </div>

                  <p className="text-xs text-mist/70">
                    Applicant-visible notices appear in the applicant dashboard history. Internal notes stay inside chairman review surfaces only.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-heading text-lg text-offwhite">Notice History</h3>
                  <span className="text-xs text-mist/70">{selectedApplicationDetails?.notices.length ?? 0} total</span>
                </div>

                <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {selectedApplicationDetails?.notices.length ? selectedApplicationDetails.notices.map((item) => (
                    <div key={item.id} className="rounded-lg border border-white/15 bg-navy/35 px-3 py-3 text-sm text-mist/85">
                      <p>{item.notice_text}</p>
                      <p className="mt-2 text-xs text-mist/70">
                        {item.visibility === "internal" ? "Internal Only" : "Applicant Visible"} | {new Date(item.created_at).toLocaleString()} by {item.created_by?.name ?? "System"}
                      </p>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center text-sm text-mist/70">
                      No notices or internal notes yet for this applicant.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/15 px-4 py-10 text-center text-sm text-mist/70">
              Select an applicant above to post a chairman notice.
            </div>
          )}
        </div>
      )}

      {activeTab === "my-profile" && canSelfEditProfile && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">My Profile</h2>
          <p className="mb-4 text-sm text-mist/85">
            Update your personal member data here. Email, batch, member number, membership status, and account verification settings are managed separately.
          </p>

          {!profileLoaded || !profile ? (
            <p className="text-sm text-mist/80">No linked member profile found for this account.</p>
          ) : (
            <>
              <FormalPhotoCard
                formalPhoto={profile.formal_photo ?? null}
                onSaved={(formalPhoto) => {
                  setProfile((current) => (current ? { ...current, formal_photo: formalPhoto } : current));
                  setDashboard((current) => (current ? { ...current, formal_photo: formalPhoto } : current));
                }}
                onNotice={reportDashboardNotice}
                onError={reportDashboardError}
              />

              <div className="mb-6 grid gap-3 md:grid-cols-2">
                <p className="text-sm text-mist/85">Member Number: <span className="text-offwhite">{profile.member_number}</span></p>
                <p className="text-sm text-mist/85">Email: <span className="text-offwhite">{profile.email ?? "—"}</span></p>
                <p className="text-sm text-mist/85">Batch: <span className="text-offwhite">{profile.batch ?? "—"}</span></p>
                <p className="text-sm text-mist/85">Membership Status: <span className="text-offwhite">{profile.membership_status}</span></p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="self-first-name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">First Name</label>
                  <input id="self-first-name" value={profileForm.first_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="self-middle-name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Middle Name</label>
                  <input id="self-middle-name" value={profileForm.middle_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, middle_name: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="self-last-name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Last Name</label>
                  <input id="self-last-name" value={profileForm.last_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="self-spouse-name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Spouse Name</label>
                  <input id="self-spouse-name" value={profileForm.spouse_name} onChange={(e) => setProfileForm((prev) => ({ ...prev, spouse_name: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="self-contact-number" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Contact Number</label>
                  <input id="self-contact-number" value={profileForm.contact_number} onChange={(e) => setProfileForm((prev) => ({ ...prev, contact_number: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="self-date-of-birth" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Date of Birth</label>
                  <input id="self-date-of-birth" type="date" value={profileForm.date_of_birth} onChange={(e) => setProfileForm((prev) => ({ ...prev, date_of_birth: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="self-address" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Address</label>
                  <textarea id="self-address" value={profileForm.address} onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))} className="min-h-[96px] w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="self-induction-date" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Induction Date</label>
                  <input id="self-induction-date" type="date" value={profileForm.induction_date} onChange={(e) => setProfileForm((prev) => ({ ...prev, induction_date: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none" />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => void saveOwnProfile()} disabled={savingProfile} className="btn-primary disabled:opacity-50">
                  {savingProfile ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "formal-photo-viewer" && canViewFormalPhotos && (
        <FormalPhotoStaffViewer
          onNotice={reportDashboardNotice}
          onError={reportDashboardError}
        />
      )}

      {activeTab === "committee" && (canChairmanReview || canChairmanSetContributionTarget || canChairmanLogContributionPayment || canChairmanSetStage || canChairmanReviewDocs || canBatchTreasurerManagePayments) && (
        <div className="mt-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-3 font-heading text-2xl text-offwhite">Application Review Panel</h2>
          <div className="mb-3">
            <button type="button" className="btn-secondary" onClick={() => void loadCommitteeApplications()}>Search</button>
          </div>
          {!applicationsLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Loading applications under review...
            </div>
          ) : (
            <>
              <div className="mb-3 overflow-x-auto rounded-lg border border-white/20">
                <table className="min-w-[860px] text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-3 py-2 text-left">Select</th>
                      <th className="px-3 py-2 text-left">Applicant</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Batch</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedApplications.map((app) => (
                      <tr key={app.id} className={`border-b border-white/15 ${selectedApplicationId === app.id ? "bg-gold/10" : ""}`}>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className={`rounded border px-2 py-1 text-xs ${selectedApplicationId === app.id ? "border-gold bg-gold text-ink" : "border-white/30 text-offwhite"}`}
                            onClick={() => setSelectedApplicationId((current) => (current === app.id ? null : app.id))}
                          >
                            {selectedApplicationId === app.id ? "Selected" : "Select"}
                          </button>
                        </td>
                        <td className="px-3 py-2">{appName(app)}</td>
                        <td className="px-3 py-2 text-mist/85">{app.email}</td>
                        <td className="px-3 py-2 text-mist/85">{app.batch?.name ?? "Unassigned"}</td>
                        <td className="px-3 py-2">{app.status}</td>
                        <td className="px-3 py-2">{app.decision_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mb-2 text-[11px] text-mist/65 sm:text-xs">
                Scroll sideways on narrow screens to see all review columns.
              </div>
              <div className="mb-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {applicationsPage} of {applicationsLastPage} | Total {applications.length}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                    disabled={applications.length === 0 || applicationsPage <= 1}
                    onClick={() => setApplicationsPage((current) => Math.max(1, current - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="btn-secondary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                    disabled={applications.length === 0 || applicationsPage >= applicationsLastPage}
                    onClick={() => setApplicationsPage((current) => Math.min(applicationsLastPage, current + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}

          {selectedApplication && (
            <div className="space-y-3">
              <p className="text-sm text-mist/85">
                Selected: <span className="text-offwhite">{appName(selectedApplication)}</span>
                <span className="ml-2 text-xs text-mist/70">Use the Selected button again to clear this applicant.</span>
              </p>
              {selectedApplicationDetails?.batch && (
                <p className="text-sm text-mist/85">Assigned Batch: <span className="text-offwhite">{selectedApplicationDetails.batch.name}</span></p>
              )}

              {canChairmanReview && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => void chairmanAction("approve")}
                    disabled={selectedApplication.status !== "under_review"}
                  >
                    Approve
                  </button>
                  {selectedApplicationDetails?.activation_eligible && (
                    <button className="btn-secondary" onClick={() => void activateApplicantAsMember()}>Activate as Member</button>
                  )}
                  <button className="btn-secondary" onClick={() => void chairmanAction("probation")}>Set Probation</button>
                  <button className="btn-secondary" onClick={() => void chairmanAction("reject", { reason: "Rejected by chairman review." })}>Reject</button>
                </div>
              )}

              {canChairmanReview && selectedApplication.status === "pending_verification" && (
                <div className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-100">
                  <p className="font-semibold text-offwhite">Wrong Email Recovery</p>
                  <p className="mt-2 text-amber-100/90">
                    Use this only when the applicant entered a non-existent email and cannot receive the verification token. Deleting this pending record lets the person start a new registration with the correct email address.
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-md border border-amber-200/40 px-4 py-2 text-sm text-amber-50 transition hover:bg-amber-300/10"
                    onClick={() => void recoverPendingVerificationApplicant()}
                  >
                    Delete Pending Verification Record
                  </button>
                </div>
              )}

              {canChairmanReview && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/15 bg-navy/35 px-3 py-3 text-xs text-mist/75">
                    Batch creation and batch assignments also have a clearer sequence in <span className="text-gold-soft">Members &gt; Batch Workflow</span>. Use that workspace when you want a focused batch-only flow.
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/5 p-3">
                  <p className="mb-2 text-sm text-offwhite">Applicant Batch</p>
                  {batches.length > 0 ? (
                    <div className="mb-3 overflow-x-auto rounded-lg border border-white/15">
                      <table className="min-w-full text-xs text-offwhite">
                        <thead className="bg-navy/70 text-gold-soft">
                          <tr>
                            <th className="px-3 py-2 text-left">Batch</th>
                            <th className="px-3 py-2 text-left">Treasurer</th>
                            <th className="px-3 py-2 text-left">Applicants</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batches.map((batch) => (
                            <tr key={batch.id} className="border-b border-white/10">
                              <td className="px-3 py-2">#{batch.id} {batch.name}</td>
                              <td className="px-3 py-2">{batch.batch_treasurer?.name ?? "Unassigned"}</td>
                              <td className="px-3 py-2">{batch.applications_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mb-3 text-xs text-mist/75">No applicant batches yet.</p>
                  )}
                  <div className="grid gap-2 md:grid-cols-2">
                    <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Batch name" className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                    <select value={batchTreasurerUserId} onChange={(e) => setBatchTreasurerUserId(e.target.value)} className={READABLE_SELECT_CLASS}>
                      <option value="">Select batch treasurer</option>
                      {batchCandidates.map((candidate) => (
                        <option key={candidate.user_id} value={String(candidate.user_id)}>
                          {candidate.full_name} ({candidate.email})
                        </option>
                      ))}
                    </select>
                    <input value={batchStartDate} onChange={(e) => setBatchStartDate(e.target.value)} type="date" className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                    <input value={batchTargetDate} onChange={(e) => setBatchTargetDate(e.target.value)} type="date" className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                    <textarea value={batchDescription} onChange={(e) => setBatchDescription(e.target.value)} placeholder="Batch description" className="min-h-[80px] rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite md:col-span-2" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => void createApplicantBatch()}>Create Batch</button>
                    <select value={batchIdToAssign} onChange={(e) => setBatchIdToAssign(e.target.value)} className={READABLE_SELECT_CLASS}>
                      <option value="">Select batch to assign</option>
                      {batches.map((batch) => (
                        <option key={batch.id} value={String(batch.id)}>
                          #{batch.id} {batch.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn-secondary" onClick={() => void assignBatchToApplication()}>Assign Batch</button>
                  </div>
                </div>
                </div>
              )}

              {canChairmanSetStage && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="committee-stage" className="text-xs font-semibold text-mist/85">Set Stage</label>
                  <select id="committee-stage" value={stageValue} onChange={(e) => setStageValue(e.target.value)} className={READABLE_SELECT_CLASS}>
                    <option value="interview" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Interview</option>
                    <option value="introduction" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Introduction</option>
                    <option value="indoctrination_initiation" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Indoctrination (Initiation)</option>
                    <option value="incubation" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Incubation</option>
                    <option value="induction" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Induction</option>
                  </select>
                  <button className="btn-secondary" onClick={() => void setStageForApplicant()}>Update Stage</button>
                </div>
              )}

              {canManageChairmanNotices && (
                <div className="rounded-lg border border-white/15 bg-navy/35 px-3 py-3 text-xs text-mist/75">
                  Need to post an applicant-facing notice or internal note? Use the dedicated <span className="text-gold-soft">Chairman Notices</span> tab so communication stays separate from review actions.
                </div>
              )}

              {(canChairmanSetContributionTarget || canChairmanLogContributionPayment || canBatchTreasurerManagePayments) && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="committee-contribution-category" className="text-xs font-semibold text-mist/85">Category</label>
                  <select
                    id="committee-contribution-category"
                    value={selectedContributionCategory}
                    onChange={(e) => setSelectedContributionCategory(e.target.value as "project" | "community_service" | "fellowship" | "five_i_activities")}
                    className={READABLE_SELECT_CLASS}
                  >
                    <option value="project" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Projects</option>
                    <option value="community_service" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Community Service</option>
                    <option value="fellowship" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Fellowship</option>
                    <option value="five_i_activities" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>5I Activities</option>
                  </select>
                  {canChairmanSetContributionTarget && (
                    <>
                      <label htmlFor="committee-required-fee" className="text-xs font-semibold text-mist/85">Target Payment</label>
                      <input id="committee-required-fee" value={requiredAmount} onChange={(e) => setRequiredAmount(e.target.value)} type="number" step="0.01" placeholder="Target amount" className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                      <button className="btn-secondary" onClick={() => void setFeeRequirement()}>Set Target</button>
                    </>
                  )}
                  {(canChairmanLogContributionPayment || canBatchTreasurerManagePayments) && (
                    <>
                      <label htmlFor="committee-payment-amount" className="text-xs font-semibold text-mist/85">Partial/Full Payment</label>
                      <input id="committee-payment-amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} type="number" step="0.01" placeholder="Amount paid" className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-offwhite" />
                      <button className="btn-secondary" onClick={() => void addFeePayment()}>Log Payment</button>
                    </>
                  )}
                </div>
              )}

              {selectedApplicationDetails && (
                <div className="rounded-lg border border-white/20 bg-white/5 p-3">
                  <p className="mb-2 text-sm text-offwhite">Application Notes</p>
                  {selectedApplicationDetails.notices.map((item) => (
                    <div key={item.id} className="mb-2 rounded border border-white/20 px-2 py-2 text-xs text-mist/85">
                      <p>{item.notice_text}</p>
                      <p className="mt-1 text-mist/70">
                        {item.visibility === "internal" ? "Internal Only" : "Applicant Visible"} | {new Date(item.created_at).toLocaleString()} by {item.created_by?.name ?? "System"}
                      </p>
                    </div>
                  ))}
                  {selectedApplicationDetails.notices.length === 0 && <p className="text-xs text-mist/70">No notices or internal notes yet.</p>}
                </div>
              )}

              {selectedApplicationDetails?.batch && canChairmanReview && (
                <div className="rounded-lg border border-white/20 bg-white/5 p-3">
                  <p className="mb-2 text-sm text-offwhite">Batch Documents</p>
                  <div className="mb-3 space-y-3">
                    <FileSelectionPreview
                      id="batch-document-upload"
                      label="Shared Batch Document"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      file={batchDocumentFile}
                      buttonLabel="Choose Batch File"
                      helperText="Image files render a thumbnail here before upload. PDFs stay readable through file details."
                      onChange={setBatchDocumentFile}
                      onClear={() => setBatchDocumentFile(null)}
                    />
                    <button className="btn-secondary" onClick={() => void uploadSharedBatchDocument()} disabled={!batchDocumentFile}>Upload Batch Doc</button>
                  </div>
                  {selectedApplicationDetails.batch.documents.map((doc) => (
                    <div key={doc.id} className="mb-2 rounded border border-white/20 px-2 py-2 text-xs text-mist/85">
                      <p>{doc.original_name}</p>
                      <button className="mt-2 rounded border border-white/30 px-2 py-1 text-offwhite" onClick={() => void viewBatchDocument(doc.id, doc.original_name)}>View</button>
                    </div>
                  ))}
                  {selectedApplicationDetails.batch.documents.length === 0 && <p className="text-xs text-mist/70">No shared batch documents yet.</p>}
                </div>
              )}

              {canChairmanReviewDocs && selectedApplicationDetails && (
                <div className="rounded-lg border border-white/20 bg-white/5 p-3">
                  <div className="mb-3 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-mist/75">
                    Applicant-facing history includes only notices marked <span className="text-gold-soft">Applicant Visible</span>. Internal committee notes remain confined to this review workspace.
                  </div>
                  <div className="mb-3 rounded-md border border-white/15 bg-navy/40 p-3">
                    <p className="text-sm font-semibold text-offwhite">Applicant Record Access</p>
                    <p className="mt-2 text-xs text-mist/75">
                      Applicant owners can view their own documents and requirements. Committee-side access extends to authorized officers with applicant document or review access, plus assigned batch treasurers for their batch. Only document reviewers can approve or disapprove uploaded files.
                    </p>
                  </div>
                  <div className="mb-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                      <p className="text-sm font-semibold text-offwhite">Document Summary</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-md border border-green-400/30 bg-green-400/10 p-3 text-center">
                          <p className="text-xs uppercase tracking-[0.18em] text-green-100">Approved</p>
                          <p className="mt-1 text-lg font-semibold text-offwhite">{selectedApplicationReviewSummary.documents.approved}</p>
                        </div>
                        <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-center">
                          <p className="text-xs uppercase tracking-[0.18em] text-red-100">Disapproved</p>
                          <p className="mt-1 text-lg font-semibold text-offwhite">{selectedApplicationReviewSummary.documents.rejected}</p>
                        </div>
                        <div className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-center">
                          <p className="text-xs uppercase tracking-[0.18em] text-amber-100">Pending Review</p>
                          <p className="mt-1 text-lg font-semibold text-offwhite">{selectedApplicationReviewSummary.documents.pending}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-mist/70">Total uploaded documents: {selectedApplicationReviewSummary.totalDocuments}</p>
                    </div>
                    <div className="rounded-lg border border-white/15 bg-white/5 p-3">
                      <p className="text-sm font-semibold text-offwhite">Requirement Summary</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-md border border-green-400/30 bg-green-400/10 p-3 text-center">
                          <p className="text-xs uppercase tracking-[0.18em] text-green-100">Approved</p>
                          <p className="mt-1 text-lg font-semibold text-offwhite">{selectedApplicationReviewSummary.requirements.approved}</p>
                        </div>
                        <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-center">
                          <p className="text-xs uppercase tracking-[0.18em] text-red-100">Disapproved</p>
                          <p className="mt-1 text-lg font-semibold text-offwhite">{selectedApplicationReviewSummary.requirements.rejected}</p>
                        </div>
                        <div className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-center">
                          <p className="text-xs uppercase tracking-[0.18em] text-amber-100">Pending Review</p>
                          <p className="mt-1 text-lg font-semibold text-offwhite">{selectedApplicationReviewSummary.requirements.pending}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-mist/70">Requirement status is inferred from payment progress: fully paid counts as Approved; unpaid or partial balances stay Pending Review.</p>
                    </div>
                  </div>
                  <div className="mb-4 rounded-lg border border-white/15 bg-white/5 p-3">
                    <p className="mb-2 text-sm font-semibold text-offwhite">Requirement Progress</p>
                    <div className="space-y-2">
                      {selectedApplicationDetails.fees.requirements.map((req) => {
                        const requirementStatus = inferRequirementReviewStatus(req);

                        return (
                          <div key={req.category} className="rounded-md border border-white/15 bg-navy/35 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm text-offwhite">{req.category_label}</p>
                                <p className="text-xs text-mist/75">
                                  Target: {money(req.target_payment)} | Paid: {money(req.partial_payment_total)} | Variance: {money(req.variance)}
                                </p>
                              </div>
                              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${reviewStatusClasses(requirementStatus)}`}>
                                {formatReviewStatusLabel(requirementStatus)}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-mist/80">{req.note ?? "No requirement note yet."}</p>
                          </div>
                        );
                      })}
                      {selectedApplicationDetails.fees.requirements.length === 0 && <p className="text-xs text-mist/70">No fee requirements recorded yet.</p>}
                    </div>
                  </div>
                  <p className="mb-2 text-sm text-offwhite">Applicant Documents</p>
                  {pagedCommitteeDocuments.map((doc) => (
                    <ApplicantDocumentCard
                      key={doc.id}
                      document={doc}
                      onView={(documentId, originalName) => void viewDocument(documentId, originalName)}
                      actions={(
                        <>
                          <button className="rounded border border-green-400/40 px-2 py-1 text-xs text-green-200" onClick={() => void reviewDocument(doc.id, "approved")}>Approve</button>
                          <button className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-200" onClick={() => void reviewDocument(doc.id, "rejected")}>Reject</button>
                        </>
                      )}
                    />
                  ))}
                  {selectedApplicationDetails.documents.length === 0 && <p className="text-xs text-mist/70">No uploaded documents yet.</p>}
                  <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                    <span>Page {committeeDocumentsPage} of {committeeDocumentsLastPage} | Total {selectedApplicationDetails.documents.length}</span>
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary" disabled={committeeDocumentsPage <= 1} onClick={() => setCommitteeDocumentsPage((current) => Math.max(1, current - 1))}>Prev</button>
                      <button type="button" className="btn-secondary" disabled={committeeDocumentsPage >= committeeDocumentsLastPage} onClick={() => setCommitteeDocumentsPage((current) => Math.min(committeeDocumentsLastPage, current + 1))}>Next</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
