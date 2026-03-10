import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import MemberModal from "../components/MemberModal";
import DeleteModal from "../components/DeleteModal";
import MemberDetailModal from "../components/MemberDetailModal";
import type {
  Applicant,
  ApplicantStatus,
  Member,
  MemberForm,
  ValidationErrors,
} from "../types/member";
import { useAuth } from "../contexts/useAuth";
import { hasPermission, isAdminUser, type AuthUser } from "../utils/auth";
import {
  PORTAL_DATA_REFRESH_EVENT,
  isPortalDataRefreshScope,
  notifyPortalDataRefresh,
  parsePortalDataRefresh,
} from "../utils/portalRefresh";
import { useSearchParams } from "react-router-dom";

type MembersTab = "members" | "applications" | "batch-workflow";
type MemberListGrouping = "flat" | "batch";
type BatchWorkflowStep = 1 | 2 | 3;

const ASSIGNABLE_APPLICANT_BATCH_STATUSES: ReadonlySet<ApplicantStatus> = new Set([
  "pending_verification",
  "under_review",
  "official_applicant",
  "eligible_for_activation",
]);

interface ApplicantBatchListRow {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  applications_count: number;
  members_count: number;
  batch_treasurer?: { id: number; name: string; email: string } | null;
}

interface BatchTreasurerCandidate {
  application_id: number;
  user_id: number;
  full_name: string;
  email: string;
  status: ApplicantStatus;
}

interface MemberDetailRecord {
  id: number;
  member_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  spouse_name: string | null;
  contact_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  batch: string | null;
  induction_date: string | null;
  membership_status: string;
  email_verified: boolean;
  password_set: boolean;
  formal_photo?: {
    image_url?: string | null;
  } | null;
  user?: {
    id: number;
    name: string;
    email: string | null;
    role?: { id: number; name: string } | null;
  } | null;
}

function roleNameOf(user: AuthUser): string | null {
  if (!user || typeof user !== "object") return null;
  const role = (user as { role?: unknown }).role;
  if (!role || typeof role !== "object") return null;
  const name = (role as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function applicantName(applicant: Applicant): string {
  return `${applicant.first_name} ${applicant.middle_name ? `${applicant.middle_name} ` : ""}${applicant.last_name}`;
}

function memberName(member: Member): string {
  return `${member.first_name} ${member.middle_name ? `${member.middle_name} ` : ""}${member.last_name}`;
}

function canAssignApplicantToBatch(applicant: Applicant): boolean {
  return ASSIGNABLE_APPLICANT_BATCH_STATUSES.has(applicant.status);
}

function fallbackExportFilename(path: string): string {
  if (path.includes("member-photos")) return "lgec_member_photos.zip";
  if (path.includes("applicants")) return "lgec_applicants.csv";
  return "lgec_members.csv";
}

function resolveDownloadFilename(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const simpleMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return simpleMatch?.[1] ?? fallback;
}

export default function Members() {
  const { user } = useAuth();
  const userRoleName = roleNameOf(user);
  const canViewMembers = hasPermission(user, "members.view");
  const canViewApplications = hasPermission(user, "applications.view") || hasPermission(user, "applications.review");
  const canApproveApplications = hasPermission(user, "applications.review");
  const canManageMembers = isAdminUser(user);
  const canEditMembers = canManageMembers;
  const canDeleteMembers = canManageMembers;
  const canManageBatchWorkflow = userRoleName === "membership_chairman" && hasPermission(user, "applications.review");
  const canViewMemberDetails = canViewMembers;
  const canExportDirectory = hasPermission(user, "directory.export");
  const canExportPhotos = hasPermission(user, "photos.export");
  const canUseExports = canExportDirectory || canExportPhotos;
  const [searchParams, setSearchParams] = useSearchParams();

  const resolveActiveTab = useCallback((rawTab: string | null): MembersTab => {
    if (rawTab === "members" && canViewMembers) return "members";
    if (rawTab === "applications" && canViewApplications) return "applications";
    if (rawTab === "batch-workflow" && canManageBatchWorkflow) return "batch-workflow";

    if (canViewMembers) return "members";
    if (canManageBatchWorkflow) return "batch-workflow";
    if (canViewApplications) return "applications";

    return "members";
  }, [canManageBatchWorkflow, canViewApplications, canViewMembers]);

  const [activeTab, setActiveTab] = useState<MembersTab>(() => resolveActiveTab(searchParams.get("tab")));
  const [batchWorkflowStep, setBatchWorkflowStep] = useState<BatchWorkflowStep>(1);

  const setActiveTabWithRoute = (nextTab: MembersTab) => {
    setActiveTab(nextTab);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (nextTab === "members") {
        next.delete("tab");
      } else {
        next.set("tab", nextTab);
      }
      return next;
    }, { replace: true });
  };

  const [members, setMembers] = useState<Member[]>([]);
  const [applications, setApplications] = useState<Applicant[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [memberGrouping, setMemberGrouping] = useState<MemberListGrouping>("flat");
  const [emailVerifiedFilter, setEmailVerifiedFilter] = useState("");
  const [passwordSetFilter, setPasswordSetFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalMembers, setTotalMembers] = useState(0);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [applicationsLastPage, setApplicationsLastPage] = useState(1);
  const [totalApplications, setTotalApplications] = useState(0);

  const [workflowSupportLoaded, setWorkflowSupportLoaded] = useState(false);
  const [workflowApplicants, setWorkflowApplicants] = useState<Applicant[]>([]);
  const [workflowApplicantsLoaded, setWorkflowApplicantsLoaded] = useState(false);
  const [workflowApplicantSearch, setWorkflowApplicantSearch] = useState("");
  const [workflowApplicantStatus, setWorkflowApplicantStatus] = useState<ApplicantStatus | "all">("under_review");
  const [workflowApplicantsPage, setWorkflowApplicantsPage] = useState(1);
  const [workflowApplicantsLastPage, setWorkflowApplicantsLastPage] = useState(1);
  const [workflowApplicantsTotal, setWorkflowApplicantsTotal] = useState(0);
  const [selectedWorkflowApplicantId, setSelectedWorkflowApplicantId] = useState<number | null>(null);
  const [workflowMembers, setWorkflowMembers] = useState<Member[]>([]);
  const [workflowMembersLoaded, setWorkflowMembersLoaded] = useState(false);
  const [workflowMemberSearch, setWorkflowMemberSearch] = useState("");
  const [workflowMembersPage, setWorkflowMembersPage] = useState(1);
  const [workflowMembersLastPage, setWorkflowMembersLastPage] = useState(1);
  const [workflowMembersTotal, setWorkflowMembersTotal] = useState(0);
  const [selectedWorkflowMemberId, setSelectedWorkflowMemberId] = useState<number | null>(null);
  const [batches, setBatches] = useState<ApplicantBatchListRow[]>([]);
  const [batchCandidates, setBatchCandidates] = useState<BatchTreasurerCandidate[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchDescription, setNewBatchDescription] = useState("");
  const [newBatchStartDate, setNewBatchStartDate] = useState("");
  const [newBatchTargetDate, setNewBatchTargetDate] = useState("");
  const [newBatchTreasurerUserId, setNewBatchTreasurerUserId] = useState("");
  const [editingBatchName, setEditingBatchName] = useState("");
  const [editingBatchDescription, setEditingBatchDescription] = useState("");
  const [editingBatchStartDate, setEditingBatchStartDate] = useState("");
  const [editingBatchTargetDate, setEditingBatchTargetDate] = useState("");
  const [editingBatchTreasurerUserId, setEditingBatchTreasurerUserId] = useState("");
  const [exportTarget, setExportTarget] = useState<"excel" | "google_sheets">("excel");
  const [photoArchiveLabel, setPhotoArchiveLabel] = useState("");
  const [downloadingExport, setDownloadingExport] = useState<"members" | "applicants" | "photos" | null>(null);

  const [editing, setEditing] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState<Member | null>(null);
  const [viewingMember, setViewingMember] = useState<MemberDetailRecord | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isWindowVisible, setIsWindowVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  const selectedWorkflowApplicant = useMemo(
    () => workflowApplicants.find((item) => item.id === selectedWorkflowApplicantId) ?? null,
    [selectedWorkflowApplicantId, workflowApplicants],
  );
  const selectedWorkflowMember = useMemo(
    () => workflowMembers.find((item) => item.id === selectedWorkflowMemberId) ?? null,
    [selectedWorkflowMemberId, workflowMembers],
  );
  const selectedWorkflowBatch = useMemo(
    () => batches.find((item) => String(item.id) === activeBatchId) ?? null,
    [activeBatchId, batches],
  );
  const selectedWorkflowApplicantBatchAssigned = Boolean(
    selectedWorkflowApplicant && selectedWorkflowBatch
      && Number(selectedWorkflowApplicant.batch?.id ?? 0) === Number(selectedWorkflowBatch.id),
  );
  const selectedWorkflowMemberBatchAssigned = Boolean(
    selectedWorkflowMember && selectedWorkflowBatch
      && selectedWorkflowMember.batch?.trim().toLowerCase() === selectedWorkflowBatch.name.toLowerCase().trim(),
  );

  const canExecuteApplicantBatchAssign = Boolean(
    selectedWorkflowApplicant && selectedWorkflowBatch && canAssignApplicantToBatch(selectedWorkflowApplicant),
  );
  const canExecuteMemberBatchAssign = Boolean(selectedWorkflowMember && selectedWorkflowBatch);

  useEffect(() => {
    const nextTab = resolveActiveTab(searchParams.get("tab"));
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, searchParams, resolveActiveTab]);

  useEffect(() => {
    setEditingBatchName(selectedWorkflowBatch?.name ?? "");
    setEditingBatchDescription(selectedWorkflowBatch?.description ?? "");
    setEditingBatchStartDate(selectedWorkflowBatch?.start_date ?? "");
    setEditingBatchTargetDate(selectedWorkflowBatch?.target_completion_date ?? "");
    setEditingBatchTreasurerUserId(selectedWorkflowBatch?.batch_treasurer ? String(selectedWorkflowBatch.batch_treasurer.id) : "");
  }, [selectedWorkflowBatch]);

  const fetchMembers = useCallback(async (page = 1, filters?: { search: string; email_verified: string; password_set: string; group_by: MemberListGrouping }) => {
    setError("");
    const activeFilters = filters ?? {
      search,
      email_verified: emailVerifiedFilter,
      password_set: passwordSetFilter,
      group_by: memberGrouping,
    };
    const res = await api.get("/members", {
      params: {
        page,
        search: activeFilters.search,
        email_verified: activeFilters.email_verified,
        password_set: activeFilters.password_set,
        group_by: activeFilters.group_by === "batch" ? "batch" : undefined,
      },
    });

    setMembers(res.data.data);
    setCurrentPage(res.data.current_page);
    setLastPage(res.data.last_page);
    setTotalMembers(Number(res.data.total ?? res.data.data.length));
    setMembersLoaded(true);
  }, [emailVerifiedFilter, memberGrouping, passwordSetFilter, search]);

  const groupedMemberRows = useMemo(() => {
    if (memberGrouping !== "batch") {
      return members.map((member) => ({ kind: "member" as const, member }));
    }

    const rows: Array<
      | { kind: "group"; label: string; key: string }
      | { kind: "member"; member: Member }
    > = [];
    let lastGroupKey: string | null = null;

    for (const member of members) {
      const label = member.batch?.trim() || "Unassigned";
      if (label !== lastGroupKey) {
        rows.push({ kind: "group", label, key: label });
        lastGroupKey = label;
      }
      rows.push({ kind: "member", member });
    }

    return rows;
  }, [memberGrouping, members]);

  const fetchApplications = useCallback(async (page = 1) => {
    if (!canViewApplications) return;
    const res = await api.get("/applicants", { params: { status: "all", page } });
    setApplications((res.data?.data ?? []) as Applicant[]);
    setApplicationsPage(Number(res.data?.current_page ?? 1));
    setApplicationsLastPage(Number(res.data?.last_page ?? 1));
    setTotalApplications(Number(res.data?.total ?? (res.data?.data ?? []).length));
    setApplicationsLoaded(true);
  }, [canViewApplications]);

  const fetchWorkflowSupport = useCallback(async () => {
    if (!canManageBatchWorkflow) return;

    const [batchRes, candidateRes] = await Promise.all([
      api.get<{ data: ApplicantBatchListRow[] }>("/applicant-batches"),
      api.get<{ data: BatchTreasurerCandidate[] }>("/applicant-batch-treasurer-candidates"),
    ]);

    const nextBatches = batchRes.data.data ?? [];
    setBatches(nextBatches);
    setBatchCandidates(candidateRes.data.data ?? []);
    setActiveBatchId((current) => {
      if (current && nextBatches.some((batch) => String(batch.id) === current)) {
        return current;
      }
      return nextBatches[0] ? String(nextBatches[0].id) : "";
    });
    setWorkflowSupportLoaded(true);
  }, [canManageBatchWorkflow]);

  const fetchWorkflowApplicants = useCallback(async (
    page = 1,
    filters?: { search: string; status: ApplicantStatus | "all" },
  ) => {
    if (!canManageBatchWorkflow) return;

    const activeFilters = filters ?? { search: workflowApplicantSearch, status: workflowApplicantStatus };
    const res = await api.get("/applicants", {
      params: {
        page,
        status: activeFilters.status,
        search: activeFilters.search,
      },
    });

    const rows = (res.data?.data ?? []) as Applicant[];
    setWorkflowApplicants(rows);
    setWorkflowApplicantsPage(Number(res.data?.current_page ?? 1));
    setWorkflowApplicantsLastPage(Number(res.data?.last_page ?? 1));
    setWorkflowApplicantsTotal(Number(res.data?.total ?? rows.length));
    setSelectedWorkflowApplicantId((current) => (current && rows.some((item) => item.id === current) ? current : null));
    setWorkflowApplicantsLoaded(true);
  }, [canManageBatchWorkflow, workflowApplicantSearch, workflowApplicantStatus]);

  const fetchWorkflowMembers = useCallback(async (page = 1, activeSearch = workflowMemberSearch) => {
    if (!canManageBatchWorkflow) return;

    const res = await api.get("/members", {
      params: {
        page,
        search: activeSearch,
      },
    });

    const rows = (res.data?.data ?? []) as Member[];
    setWorkflowMembers(rows);
    setWorkflowMembersPage(Number(res.data?.current_page ?? 1));
    setWorkflowMembersLastPage(Number(res.data?.last_page ?? 1));
    setWorkflowMembersTotal(Number(res.data?.total ?? rows.length));
    setSelectedWorkflowMemberId((current) => (current && rows.some((item) => item.id === current) ? current : null));
    setWorkflowMembersLoaded(true);
  }, [canManageBatchWorkflow, workflowMemberSearch]);

  const refreshVisibleData = useCallback(() => {
    if (!isWindowVisible) return;

    if (activeTab === "members" && canViewMembers && membersLoaded && !editing && !deleting) {
      void fetchMembers(currentPage);
    }

    if (activeTab === "applications" && canViewApplications && applicationsLoaded) {
      void fetchApplications(applicationsPage);
    }

    if (activeTab === "batch-workflow" && canManageBatchWorkflow) {
      if (workflowSupportLoaded) {
        void fetchWorkflowSupport();
      }

      if (workflowApplicantsLoaded) {
        void fetchWorkflowApplicants(workflowApplicantsPage);
      }

      if (workflowMembersLoaded) {
        void fetchWorkflowMembers(workflowMembersPage);
      }
    }
  }, [
    applicationsLoaded,
    applicationsPage,
    canManageBatchWorkflow,
    canViewApplications,
    canViewMembers,
    currentPage,
    deleting,
    editing,
    activeTab,
    fetchApplications,
    fetchMembers,
    fetchWorkflowApplicants,
    fetchWorkflowMembers,
    fetchWorkflowSupport,
    isWindowVisible,
    membersLoaded,
    workflowApplicantsLoaded,
    workflowApplicantsPage,
    workflowMembersLoaded,
    workflowMembersPage,
    workflowSupportLoaded,
  ]);

  const refreshBatchViews = useCallback(async (options?: { includeApplicants?: boolean; includeMembers?: boolean }) => {
    const nextOptions = {
      includeApplicants: options?.includeApplicants ?? true,
      includeMembers: options?.includeMembers ?? true,
    };

    const tasks: Array<Promise<unknown>> = [fetchWorkflowSupport()];

    if (nextOptions.includeApplicants) {
      tasks.push(fetchWorkflowApplicants(workflowApplicantsPage));
      if (applicationsLoaded) {
        tasks.push(fetchApplications(applicationsPage));
      }
    }

    if (nextOptions.includeMembers) {
      tasks.push(fetchWorkflowMembers(workflowMembersPage));
      if (membersLoaded) {
        tasks.push(fetchMembers(currentPage));
      }
    }

    notifyPortalDataRefresh("applicants");
    notifyPortalDataRefresh("members");
    await Promise.all(tasks);
  }, [
    applicationsLoaded,
    applicationsPage,
    currentPage,
    fetchApplications,
    fetchMembers,
    fetchWorkflowApplicants,
    fetchWorkflowMembers,
    fetchWorkflowSupport,
    membersLoaded,
    workflowApplicantsPage,
    workflowMembersPage,
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
  }, [applicationsLoaded, canViewApplications, activeTab, fetchApplications]);

  useEffect(() => {
    if (activeTab !== "batch-workflow" || !canManageBatchWorkflow) return;
    if (workflowSupportLoaded && workflowApplicantsLoaded && workflowMembersLoaded) return;

    const timer = window.setTimeout(() => {
      void Promise.all([
        workflowSupportLoaded ? Promise.resolve() : fetchWorkflowSupport(),
        workflowApplicantsLoaded ? Promise.resolve() : fetchWorkflowApplicants(1),
        workflowMembersLoaded ? Promise.resolve() : fetchWorkflowMembers(1),
      ]);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    canManageBatchWorkflow,
    activeTab,
    fetchWorkflowApplicants,
    fetchWorkflowMembers,
    fetchWorkflowSupport,
    workflowApplicantsLoaded,
    workflowMembersLoaded,
    workflowSupportLoaded,
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
      if (!isPortalDataRefreshScope(detail, ["members", "applicants"])) return;
      refreshVisibleData();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "lgec:portal-data-refresh") return;
      const detail = parsePortalDataRefresh(event.newValue);
      if (!isPortalDataRefreshScope(detail, ["members", "applicants"])) return;
      refreshVisibleData();
    };

    window.addEventListener(PORTAL_DATA_REFRESH_EVENT, handlePortalDataRefresh as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(PORTAL_DATA_REFRESH_EVENT, handlePortalDataRefresh as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshVisibleData]);

  async function handleUpdate(id: number, form: MemberForm) {
    try {
      setErrors({});
      setError("");
      await api.put(`/members/${id}`, form);
      setEditing(null);
      setNotice("Member updated.");
      if (membersLoaded) void fetchMembers(currentPage);
      if (workflowMembersLoaded) void fetchWorkflowMembers(workflowMembersPage);
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
    if (workflowMembersLoaded) void fetchWorkflowMembers(workflowMembersPage);
  }

  async function handleCreateBatch() {
    if (!newBatchName.trim()) {
      setError("Batch name is required before you create a new batch.");
      return;
    }

    try {
      setError("");
      const response = await api.post<{ batch?: { id: number; name: string } }>("/applicant-batches", {
        name: newBatchName.trim(),
        description: newBatchDescription.trim() || null,
        start_date: newBatchStartDate || null,
        target_completion_date: newBatchTargetDate || null,
        batch_treasurer_user_id: newBatchTreasurerUserId ? Number(newBatchTreasurerUserId) : null,
      });

      setNotice(`Batch created${response.data?.batch?.name ? `: ${response.data.batch.name}` : "."}`);
      setNewBatchName("");
      setNewBatchDescription("");
      setNewBatchStartDate("");
      setNewBatchTargetDate("");
      setNewBatchTreasurerUserId("");

      await fetchWorkflowSupport();

      if (response.data?.batch?.id) {
        setActiveBatchId(String(response.data.batch.id));
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string } | undefined)?.message;
        setError(message ?? "Failed to create batch.");
      }
    }
  }

  async function handleUpdateBatch() {
    if (!selectedWorkflowBatch) {
      setError("Choose a working batch before editing.");
      return;
    }

    if (!editingBatchName.trim()) {
      setError("Batch name is required before you save changes.");
      return;
    }

    try {
      setError("");
      const response = await api.put<{ batch?: { id: number; name: string } }>(`/applicant-batches/${selectedWorkflowBatch.id}`, {
        name: editingBatchName.trim(),
        description: editingBatchDescription.trim() || null,
        start_date: editingBatchStartDate || null,
        target_completion_date: editingBatchTargetDate || null,
        batch_treasurer_user_id: editingBatchTreasurerUserId ? Number(editingBatchTreasurerUserId) : null,
      });

      setNotice(`Batch updated${response.data?.batch?.name ? `: ${response.data.batch.name}` : "."}`);
      await refreshBatchViews();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string } | undefined)?.message;
        setError(message ?? "Failed to update batch.");
      }
    }
  }

  async function handleExport(path: string, key: "members" | "applicants" | "photos") {
    try {
      setError("");
      setDownloadingExport(key);
      const response = await api.get(path, { responseType: "blob" });
      const fallback = fallbackExportFilename(path);
      const filename = resolveDownloadFilename(response.headers["content-disposition"], fallback);
      const blobUrl = window.URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      setNotice(`Export ready: ${filename}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string } | undefined)?.message;
        setError(message ?? "Failed to export directory data.");
      } else {
        setError("Failed to export directory data.");
      }
    } finally {
      setDownloadingExport(null);
    }
  }

  async function handleViewMember(memberId: number) {
    try {
      setError("");
      const response = await api.get<MemberDetailRecord>(`/members/${memberId}`);
      setViewingMember(response.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string } | undefined)?.message;
        setError(message ?? "Failed to load member details.");
      } else {
        setError("Failed to load member details.");
      }
    }
  }

  async function handleAssignApplicantBatch() {
    if (!selectedWorkflowApplicant || !activeBatchId) {
      setError("Choose a working batch and an applicant before assigning.");
      return;
    }

    if (!canAssignApplicantToBatch(selectedWorkflowApplicant)) {
      setError(`Cannot assign ${applicantName(selectedWorkflowApplicant)} because this applicant is not in an active workflow status.`);
      return;
    }

    if (selectedWorkflowApplicant.batch?.id === Number(activeBatchId)) {
      setNotice(`Applicant ${applicantName(selectedWorkflowApplicant)} is already assigned to this batch.`);
      return;
    }

    try {
      setError("");
      await api.post(`/applicants/${selectedWorkflowApplicant.id}/assign-batch`, {
        batch_id: Number(activeBatchId),
      });
      setNotice(`Applicant batch updated for ${applicantName(selectedWorkflowApplicant)}.`);
      await refreshBatchViews({ includeApplicants: true, includeMembers: false });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string } | undefined)?.message;
        setError(message ?? "Failed to assign applicant batch.");
      }
    }
  }

  async function handleAssignMemberBatch() {
    if (!selectedWorkflowMember || !activeBatchId) {
      setError("Choose a working batch and a member before assigning.");
      return;
    }

    if (selectedWorkflowMember.batch?.trim().toLowerCase() === selectedWorkflowBatch?.name.toLowerCase().trim()) {
      setNotice(`Member ${memberName(selectedWorkflowMember)} is already assigned to this batch.`);
      return;
    }

    try {
      setError("");
      await api.post(`/members/${selectedWorkflowMember.id}/assign-applicant-batch`, {
        batch_id: Number(activeBatchId),
      });
      setNotice(`Member batch updated for ${memberName(selectedWorkflowMember)}.`);
      await refreshBatchViews({ includeApplicants: false, includeMembers: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { message?: string } | undefined)?.message;
        setError(message ?? "Failed to assign member batch.");
      }
    }
  }

  if (!canViewMembers && !canViewApplications && !canManageBatchWorkflow && !canUseExports) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Members Management</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to view members or applicants.
        </p>
      </section>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-4xl text-offwhite">{canViewMembers ? "Members Management" : "Applicants"}</h1>
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

      {activeTab === "members" && canViewMembers && membersLoaded && (
        <div className="mb-4 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-mist/90">
          Total members: <span className="font-semibold text-offwhite">{totalMembers}</span>
          {" | "}
          Rows on page: <span className="font-semibold text-offwhite">{members.length}</span>
          {" | "}
          Page <span className="font-semibold text-offwhite">{currentPage}</span> of <span className="font-semibold text-offwhite">{lastPage}</span>
        </div>
      )}

      {activeTab === "applications" && canViewApplications && applicationsLoaded && (
        <div className="mb-4 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-mist/90">
          Total applicants: <span className="font-semibold text-offwhite">{totalApplications}</span>
          {" | "}
          Rows on page: <span className="font-semibold text-offwhite">{applications.length}</span>
          {" | "}
          Page <span className="font-semibold text-offwhite">{applicationsPage}</span> of <span className="font-semibold text-offwhite">{applicationsLastPage}</span>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {canViewMembers && (
          <button
            type="button"
            onClick={() => setActiveTabWithRoute("members")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "members" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Members
          </button>
        )}
        {canViewApplications && (
          <button
            type="button"
            onClick={() => setActiveTabWithRoute("applications")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "applications" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Applicants
          </button>
        )}
        {canManageBatchWorkflow && (
          <button
            type="button"
            onClick={() => setActiveTabWithRoute("batch-workflow")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "batch-workflow" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Batch Workflow
          </button>
        )}
      </div>

      {canUseExports && (
        <section className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-2xl text-offwhite">Directory Exports</h2>
              <p className="mt-2 max-w-3xl text-sm text-mist/80">
                Secretary and admin export actions stay here so directory downloads remain available without leaving Members Management.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {canExportDirectory && (
                <select
                  value={exportTarget}
                  onChange={(e) => setExportTarget(e.target.value as "excel" | "google_sheets")}
                  className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-sm text-offwhite"
                >
                  <option value="excel" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Excel CSV</option>
                  <option value="google_sheets" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Google Sheets CSV</option>
                </select>
              )}
              {canExportDirectory && (
                <button
                  type="button"
                  onClick={() => void handleExport(`/directory/exports/members?target=${exportTarget}`, "members")}
                  disabled={downloadingExport !== null}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloadingExport === "members" ? "Preparing Members CSV..." : "Export Members CSV"}
                </button>
              )}
              {canExportDirectory && (
                <button
                  type="button"
                  onClick={() => void handleExport(`/directory/exports/applicants?target=${exportTarget}`, "applicants")}
                  disabled={downloadingExport !== null}
                  className="rounded-md border border-white/25 px-4 py-2 text-sm text-offwhite disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {downloadingExport === "applicants" ? "Preparing Applicants CSV..." : "Export Applicants CSV"}
                </button>
              )}
              {canExportPhotos && (
                <>
                  <input
                    value={photoArchiveLabel}
                    onChange={(e) => setPhotoArchiveLabel(e.target.value)}
                    placeholder={`ZIP label (default: lgec_members_${new Date().getFullYear()})`}
                    className="min-w-[240px] rounded-md border border-white/25 bg-white/10 px-4 py-2 text-sm text-offwhite placeholder:text-mist/70"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const query = photoArchiveLabel.trim() ? `?label=${encodeURIComponent(photoArchiveLabel.trim())}` : "";
                      void handleExport(`/directory/exports/member-photos${query}`, "photos");
                    }}
                    disabled={downloadingExport !== null}
                    className="rounded-md border border-gold/30 px-4 py-2 text-sm text-gold-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {downloadingExport === "photos" ? "Preparing Member Photos ZIP..." : "Export Member Photos ZIP"}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "members" && canViewMembers && (
        <>
          <div className="mb-6 grid gap-4 rounded-xl border border-white/20 bg-white/10 p-4 md:grid-cols-[1fr_220px_220px_200px_auto]">
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
              aria-label="Group members list"
              value={memberGrouping}
              onChange={(e) => setMemberGrouping(e.target.value as MemberListGrouping)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
            >
              <option value="flat" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Flat List</option>
              <option value="batch" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Group By Batch</option>
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
                      {(canViewMemberDetails || canManageMembers) && <th className="px-4 py-3 text-left">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedMemberRows.map((row) => {
                      if (row.kind === "group") {
                        return (
                          <tr key={`group-${row.key}`} className="border-b border-white/10 bg-gold/5">
                            <td colSpan={canViewMemberDetails || canManageMembers ? 8 : 7} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">
                              Batch: {row.label}
                            </td>
                          </tr>
                        );
                      }

                      const m = row.member;
                      return (
                        <tr key={m.id} className="border-b border-white/15">
                          <td className="px-4 py-3">{m.member_number}</td>
                          <td className="px-4 py-3">{memberName(m)}</td>
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
                          {(canViewMemberDetails || canManageMembers) && (
                            <td className="space-x-3 px-4 py-3">
                              {canViewMemberDetails && (
                                <button onClick={() => void handleViewMember(m.id)} className="text-mist hover:text-offwhite hover:underline">
                                  View
                                </button>
                              )}
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
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {members.length === 0 && (
                      <tr>
                        <td colSpan={canViewMemberDetails || canManageMembers ? 8 : 7} className="px-4 py-8 text-center text-mist/80">
                          No members found for the current filters.
                        </td>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-mist/80">
                Registered applicant directory only. Review, approval, and activation remain in the chairman review workspace.
              </p>
              <button
                type="button"
                onClick={() => void fetchApplications(1)}
                className="btn-primary"
              >
                Refresh Queue
              </button>
            </div>
            {canManageBatchWorkflow && (
              <p className="mt-3 text-xs text-mist/70">
                Batch creation and batch assignments now live in <span className="text-offwhite">Batch Workflow</span> so the review panel stays focused on applicant decisions.
              </p>
            )}
          </div>

          {!applicationsLoaded && (
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-8 text-center text-sm text-mist/80">
              Loading applicants...
            </div>
          )}
          {applicationsLoaded && (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/20 bg-white/10 shadow-lg">
                <div className="border-b border-white/15 px-4 py-3">
                  <h2 className="font-heading text-2xl text-offwhite">Registered Applicants</h2>
                  <p className="mt-2 text-sm text-mist/80">
                    Directory view only. Approvals, rejections, and lifecycle decisions belong in the dedicated application review workflow.
                  </p>
                </div>
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Batch</th>
                      <th className="px-4 py-3 text-left">Registered</th>
                      <th className="px-4 py-3 text-left">Stage</th>
                      <th className="px-4 py-3 text-left">Applicant Status</th>
                      <th className="px-4 py-3 text-left">Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr key={app.id} className="border-b border-white/15">
                        <td className="px-4 py-3">{applicantName(app)}</td>
                        <td className="px-4 py-3">{app.email}</td>
                        <td className="px-4 py-3">{app.batch?.name ?? "Unassigned"}</td>
                        <td className="px-4 py-3">{app.created_at ? new Date(app.created_at).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3 capitalize">{(app.current_stage ?? "interview").replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 capitalize">{app.status.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-mist/80">
                            {canApproveApplications ? "Review workflow" : "List only"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {applications.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-mist/80">No registered applicants found.</td>
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

      {activeTab === "batch-workflow" && canManageBatchWorkflow && (
        <div className="space-y-6">
          <div className="mb-2 flex w-full gap-2 overflow-x-auto pb-1 lg:hidden">
            <button
              type="button"
              onClick={() => setBatchWorkflowStep(1)}
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs whitespace-nowrap ${batchWorkflowStep === 1
                ? "border-gold bg-gold text-ink"
                : "border-white/30 text-offwhite hover:border-gold/70 hover:text-gold-soft"}`}
            >
              Step 1: Batch
            </button>
            <button
              type="button"
              onClick={() => setBatchWorkflowStep(2)}
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs whitespace-nowrap ${batchWorkflowStep === 2
                ? "border-gold bg-gold text-ink"
                : "border-white/30 text-offwhite hover:border-gold/70 hover:text-gold-soft"}`}
            >
              Step 2: Applicant
            </button>
            <button
              type="button"
              onClick={() => setBatchWorkflowStep(3)}
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs whitespace-nowrap ${batchWorkflowStep === 3
                ? "border-gold bg-gold text-ink"
                : "border-white/30 text-offwhite hover:border-gold/70 hover:text-gold-soft"}`}
            >
              Step 3: Member
            </button>
          </div>
          <section className="rounded-xl border border-white/20 bg-white/10 p-5">
            <h2 className="font-heading text-3xl text-offwhite">Batch Workflow</h2>
            <p className="mt-2 max-w-3xl text-sm text-mist/85">
              Use this sequence for chairman-controlled batch work so creation, applicant assignment, and existing-member assignment each have a clear form and a single next action.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-gold/25 bg-navy/35 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Step 1</p>
                <p className="mt-2 text-lg font-semibold text-offwhite">Choose or Create Batch</p>
                <p className="mt-2 text-sm text-mist/80">Pick the working batch first, or create a new batch with its dates and treasurer.</p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Step 2</p>
                <p className="mt-2 text-lg font-semibold text-offwhite">Assign Applicant</p>
                <p className="mt-2 text-sm text-mist/80">Search the applicant list, confirm the status, then assign the selected applicant to the working batch.</p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Step 3</p>
                <p className="mt-2 text-lg font-semibold text-offwhite">Assign Existing Member</p>
                <p className="mt-2 text-sm text-mist/80">Search an existing member and assign the same working batch without opening the broader member edit flow.</p>
              </div>
            </div>
          </section>

          <section className={`rounded-xl border border-white/20 bg-white/10 p-4 lg:p-5 ${batchWorkflowStep === 1 ? "block" : "hidden"} lg:block`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Step 1</p>
                <h3 className="mt-1 font-heading text-2xl text-offwhite">Choose and Create Batch</h3>
                <p className="mt-2 max-w-2xl text-sm text-mist/80">
                  Start by setting one working batch. The same working batch is then reused by the applicant and member assignment forms below.
                </p>
              </div>
              <div className="rounded-lg border border-white/15 bg-navy/35 px-4 py-3 text-sm text-mist/80">
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Working Batch</p>
                <p className="mt-1 text-offwhite">{selectedWorkflowBatch ? `${selectedWorkflowBatch.name} (#${selectedWorkflowBatch.id})` : "No batch selected yet"}</p>
              </div>
            </div>

            {!workflowSupportLoaded ? (
              <div className="mt-4 rounded-lg border border-white/15 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
                Loading batch support...
              </div>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto rounded-xl border border-white/15">
                  <table className="min-w-[760px] text-sm text-offwhite">
                    <thead className="bg-navy/70 text-gold-soft">
                      <tr>
                        <th className="px-3 py-2 text-left">Use</th>
                        <th className="px-3 py-2 text-left">Batch</th>
                        <th className="px-3 py-2 text-left">Treasurer</th>
                        <th className="px-3 py-2 text-left">Applicants</th>
                        <th className="px-3 py-2 text-left">Members</th>
                        <th className="px-3 py-2 text-left">Dates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((batch) => {
                        const isActive = String(batch.id) === activeBatchId;
                        return (
                          <tr key={batch.id} className={`border-b border-white/10 ${isActive ? "bg-gold/10" : ""}`}>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setActiveBatchId(String(batch.id))}
                                className={`rounded border px-2 py-1 text-xs ${isActive ? "border-gold bg-gold text-ink" : "border-white/30 text-offwhite"}`}
                              >
                                {isActive ? "Active" : "Use"}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <p className="text-offwhite">#{batch.id} {batch.name}</p>
                              {batch.description && <p className="mt-1 text-xs text-mist/70">{batch.description}</p>}
                            </td>
                            <td className="px-3 py-2 text-mist/85">{batch.batch_treasurer?.name ?? "Unassigned"}</td>
                            <td className="px-3 py-2 text-mist/85">{batch.applications_count}</td>
                            <td className="px-3 py-2 text-mist/85">{batch.members_count}</td>
                            <td className="px-3 py-2 text-mist/85">
                              {batch.start_date ?? "—"} to {batch.target_completion_date ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {batches.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-mist/80">
                            No batches created yet. Use the form below to create the first one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-4">
                  <h4 className="text-lg font-semibold text-offwhite">Create New Batch</h4>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="batch-name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Batch Name
                      </label>
                      <input
                        id="batch-name"
                        value={newBatchName}
                        onChange={(e) => setNewBatchName(e.target.value)}
                        placeholder="Batch Magiting"
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="batch-treasurer" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Batch Treasurer
                      </label>
                      <select
                        id="batch-treasurer"
                        value={newBatchTreasurerUserId}
                        onChange={(e) => setNewBatchTreasurerUserId(e.target.value)}
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
                      >
                        <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Select treasurer</option>
                        {batchCandidates.map((candidate) => (
                          <option key={candidate.user_id} value={String(candidate.user_id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                            {candidate.full_name} ({candidate.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="batch-start-date" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Start Date
                      </label>
                      <input
                        id="batch-start-date"
                        value={newBatchStartDate}
                        onChange={(e) => setNewBatchStartDate(e.target.value)}
                        type="date"
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="batch-target-date" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Target Completion
                      </label>
                      <input
                        id="batch-target-date"
                        value={newBatchTargetDate}
                        onChange={(e) => setNewBatchTargetDate(e.target.value)}
                        type="date"
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="batch-description" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Batch Description
                      </label>
                      <textarea
                        id="batch-description"
                        value={newBatchDescription}
                        onChange={(e) => setNewBatchDescription(e.target.value)}
                        placeholder="Shared schedule, notes, and leadership context for this batch."
                        className="min-h-[96px] w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => void handleCreateBatch()} className="btn-primary">
                      Create Batch
                    </button>
                    <p className="text-xs text-mist/70">
                      Creating a batch automatically refreshes the list above and makes it the active working batch.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-gold/20 bg-navy/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-offwhite">Edit Active Batch</h4>
                      <p className="mt-2 text-sm text-mist/75">
                        Rename or adjust the active batch here. Create and assign flows stay separate below.
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-mist/80">
                      <p>Active batch: <span className="text-offwhite">{selectedWorkflowBatch ? `${selectedWorkflowBatch.name} (#${selectedWorkflowBatch.id})` : "Choose one from the list above"}</span></p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="edit-batch-name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Batch Name
                      </label>
                      <input
                        id="edit-batch-name"
                        value={editingBatchName}
                        onChange={(e) => setEditingBatchName(e.target.value)}
                        placeholder="Batch name"
                        disabled={!selectedWorkflowBatch}
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-batch-treasurer" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Batch Treasurer
                      </label>
                      <select
                        id="edit-batch-treasurer"
                        value={editingBatchTreasurerUserId}
                        onChange={(e) => setEditingBatchTreasurerUserId(e.target.value)}
                        disabled={!selectedWorkflowBatch}
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Select treasurer</option>
                        {batchCandidates.map((candidate) => (
                          <option key={candidate.user_id} value={String(candidate.user_id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                            {candidate.full_name} ({candidate.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="edit-batch-start-date" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Start Date
                      </label>
                      <input
                        id="edit-batch-start-date"
                        value={editingBatchStartDate}
                        onChange={(e) => setEditingBatchStartDate(e.target.value)}
                        type="date"
                        disabled={!selectedWorkflowBatch}
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-batch-target-date" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Target Completion
                      </label>
                      <input
                        id="edit-batch-target-date"
                        value={editingBatchTargetDate}
                        onChange={(e) => setEditingBatchTargetDate(e.target.value)}
                        type="date"
                        disabled={!selectedWorkflowBatch}
                        className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label htmlFor="edit-batch-description" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                        Batch Description
                      </label>
                      <textarea
                        id="edit-batch-description"
                        value={editingBatchDescription}
                        onChange={(e) => setEditingBatchDescription(e.target.value)}
                        placeholder="Shared schedule, notes, and leadership context for this batch."
                        disabled={!selectedWorkflowBatch}
                        className="min-h-[96px] w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleUpdateBatch()}
                      disabled={!selectedWorkflowBatch}
                      className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save Batch Changes
                    </button>
                    <p className="text-xs text-mist/70">
                      Renaming a batch refreshes the batch list plus any visible applicant/member rows that reference that batch.
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className={`rounded-xl border border-white/20 bg-white/10 p-4 lg:p-5 ${batchWorkflowStep === 2 ? "block" : "hidden"} lg:block`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Step 2</p>
                <h3 className="mt-1 font-heading text-2xl text-offwhite">Assign Applicant To Batch</h3>
                <p className="mt-2 max-w-2xl text-sm text-mist/80">
                  Search the applicant queue, choose one applicant, then assign that applicant to the working batch from Step 1.
                </p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-mist/80">
                <p>Working batch: <span className="text-offwhite">{selectedWorkflowBatch?.name ?? "Not selected"}</span></p>
                <p className="mt-1">Selected applicant: <span className="text-offwhite">{selectedWorkflowApplicant ? applicantName(selectedWorkflowApplicant) : "Not selected"}</span></p>
              </div>
            </div>

            <form
              className="mt-4 grid gap-4 rounded-xl border border-white/15 bg-white/5 p-4 md:grid-cols-[1fr_220px_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                setWorkflowApplicantsPage(1);
                void fetchWorkflowApplicants(1, {
                  search: workflowApplicantSearch,
                  status: workflowApplicantStatus,
                });
              }}
            >
              <input
                aria-label="Search batch-workflow applicants"
                placeholder="Search applicant name, email, or batch..."
                value={workflowApplicantSearch}
                onChange={(e) => setWorkflowApplicantSearch(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
              />
              <select
                aria-label="Filter batch-workflow applicants by status"
                value={workflowApplicantStatus}
                onChange={(e) => setWorkflowApplicantStatus(e.target.value as ApplicantStatus | "all")}
                className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
              >
                <option value="under_review" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Under Review</option>
                <option value="official_applicant" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Official Applicant</option>
                <option value="eligible_for_activation" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Eligible for Activation</option>
                <option value="all" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Open Applicants</option>
              </select>
              <button type="submit" className="btn-primary">Search Applicants</button>
            </form>

            {!workflowApplicantsLoaded ? (
              <div className="mt-4 rounded-lg border border-white/15 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
                Loading applicant matches...
              </div>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto rounded-xl border border-white/15">
                  <table className="min-w-[820px] text-sm text-offwhite">
                    <thead className="bg-navy/70 text-gold-soft">
                      <tr>
                        <th className="px-3 py-2 text-left">Choose</th>
                        <th className="px-3 py-2 text-left">Applicant</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">Batch</th>
                        <th className="px-3 py-2 text-left">Stage</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflowApplicants.map((applicant) => {
                        const isSelected = applicant.id === selectedWorkflowApplicantId;
                        return (
                          <tr key={applicant.id} className={`border-b border-white/10 ${isSelected ? "bg-gold/10" : ""}`}>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setSelectedWorkflowApplicantId(applicant.id)}
                                className={`rounded border px-2 py-1 text-xs ${isSelected ? "border-gold bg-gold text-ink" : "border-white/30 text-offwhite"}`}
                              >
                                {isSelected ? "Selected" : "Choose"}
                              </button>
                            </td>
                            <td className="px-3 py-2">{applicantName(applicant)}</td>
                            <td className="px-3 py-2 text-mist/85">{applicant.email}</td>
                            <td className="px-3 py-2 text-mist/85">{applicant.batch?.name ?? "Unassigned"}</td>
                            <td className="px-3 py-2 text-mist/85 capitalize">{(applicant.current_stage ?? "interview").replace(/_/g, " ")}</td>
                            <td className="px-3 py-2 text-mist/85 capitalize">{applicant.status.replace(/_/g, " ")}</td>
                          </tr>
                        );
                      })}
                      {workflowApplicants.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-mist/80">
                            No applicants matched this search. Adjust the search or status filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-mist/80">
                  <span>Page {workflowApplicantsPage} of {workflowApplicantsLastPage} | Total {workflowApplicantsTotal}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={workflowApplicantsPage <= 1}
                      onClick={() => void fetchWorkflowApplicants(workflowApplicantsPage - 1)}
                      className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={workflowApplicantsPage >= workflowApplicantsLastPage}
                      onClick={() => void fetchWorkflowApplicants(workflowApplicantsPage + 1)}
                      className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/15 bg-navy/35 px-4 py-4">
                  <div className="text-sm text-mist/80">
                    <p>Applicant: <span className="text-offwhite">{selectedWorkflowApplicant ? applicantName(selectedWorkflowApplicant) : "Choose an applicant"}</span></p>
                    <p className="mt-1">Batch: <span className="text-offwhite">{selectedWorkflowBatch?.name ?? "Choose a working batch above"}</span></p>
                    {selectedWorkflowApplicant && (
                      <p className="mt-1">
                        Current batch: <span className="text-offwhite">{selectedWorkflowApplicant.batch?.name ?? "Unassigned"}</span>
                      </p>
                    )}
                    {selectedWorkflowApplicant && !canAssignApplicantToBatch(selectedWorkflowApplicant) && (
                      <p className="mt-2 rounded-md border border-red-300/40 bg-red-400/15 px-2 py-1 text-xs text-red-200">
                        This applicant status is not eligible for batch assignment.
                      </p>
                    )}
                    {selectedWorkflowApplicantBatchAssigned && (
                      <p className="mt-2 rounded-md border border-gold/40 bg-gold/12 px-2 py-1 text-xs text-gold-soft">
                        Selected applicant is already on this batch.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAssignApplicantBatch()}
                    disabled={!canExecuteApplicantBatchAssign || selectedWorkflowApplicantBatchAssigned}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selectedWorkflowApplicantBatchAssigned
                      ? "Applicant Already Assigned"
                      : "Assign Applicant To Working Batch"}
                  </button>
                </div>
          </section>

          <section className={`rounded-xl border border-white/20 bg-white/10 p-4 lg:p-5 ${batchWorkflowStep === 3 ? "block" : "hidden"} lg:block`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Step 3</p>
                <h3 className="mt-1 font-heading text-2xl text-offwhite">Assign Existing Member To Batch</h3>
                <p className="mt-2 max-w-2xl text-sm text-mist/80">
                  Search current members here when you only need a batch assignment. This avoids opening the full member edit modal for a single batch change.
                </p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-mist/80">
                <p>Working batch: <span className="text-offwhite">{selectedWorkflowBatch?.name ?? "Not selected"}</span></p>
                <p className="mt-1">Selected member: <span className="text-offwhite">{selectedWorkflowMember ? memberName(selectedWorkflowMember) : "Not selected"}</span></p>
              </div>
            </div>

            <form
              className="mt-4 grid gap-4 rounded-xl border border-white/15 bg-white/5 p-4 md:grid-cols-[1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                setWorkflowMembersPage(1);
                void fetchWorkflowMembers(1, workflowMemberSearch);
              }}
            >
              <input
                aria-label="Search members for batch assignment"
                placeholder="Search member number, name, email, or batch..."
                value={workflowMemberSearch}
                onChange={(e) => setWorkflowMemberSearch(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
              />
              <button type="submit" className="btn-primary">Search Members</button>
            </form>

            {!workflowMembersLoaded ? (
              <div className="mt-4 rounded-lg border border-white/15 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
                Loading member matches...
              </div>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto rounded-xl border border-white/15">
                  <table className="min-w-[820px] text-sm text-offwhite">
                    <thead className="bg-navy/70 text-gold-soft">
                      <tr>
                        <th className="px-3 py-2 text-left">Choose</th>
                        <th className="px-3 py-2 text-left">Member No.</th>
                        <th className="px-3 py-2 text-left">Member</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflowMembers.map((member) => {
                        const isSelected = member.id === selectedWorkflowMemberId;
                        return (
                          <tr key={member.id} className={`border-b border-white/10 ${isSelected ? "bg-gold/10" : ""}`}>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setSelectedWorkflowMemberId(member.id)}
                                className={`rounded border px-2 py-1 text-xs ${isSelected ? "border-gold bg-gold text-ink" : "border-white/30 text-offwhite"}`}
                              >
                                {isSelected ? "Selected" : "Choose"}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-mist/85">{member.member_number}</td>
                            <td className="px-3 py-2">{memberName(member)}</td>
                            <td className="px-3 py-2 text-mist/85">{member.email ?? "—"}</td>
                            <td className="px-3 py-2 text-mist/85">{member.batch ?? "Unassigned"}</td>
                          </tr>
                        );
                      })}
                      {workflowMembers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-mist/80">
                            No members matched this search. Adjust the search term and try again.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-mist/80">
                  <span>Page {workflowMembersPage} of {workflowMembersLastPage} | Total {workflowMembersTotal}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={workflowMembersPage <= 1}
                      onClick={() => void fetchWorkflowMembers(workflowMembersPage - 1)}
                      className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={workflowMembersPage >= workflowMembersLastPage}
                      onClick={() => void fetchWorkflowMembers(workflowMembersPage + 1)}
                      className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/15 bg-navy/35 px-4 py-4">
                  <div className="text-sm text-mist/80">
                    <p>Member: <span className="text-offwhite">{selectedWorkflowMember ? memberName(selectedWorkflowMember) : "Choose a member"}</span></p>
                    <p className="mt-1">Batch: <span className="text-offwhite">{selectedWorkflowBatch?.name ?? "Choose a working batch above"}</span></p>
                    {selectedWorkflowMember && (
                      <p className="mt-1">
                        Current batch: <span className="text-offwhite">{selectedWorkflowMember.batch ?? "Unassigned"}</span>
                      </p>
                    )}
                    {selectedWorkflowMemberBatchAssigned && (
                      <p className="mt-2 rounded-md border border-gold/40 bg-gold/12 px-2 py-1 text-xs text-gold-soft">
                        Selected member is already on this batch.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAssignMemberBatch()}
                    disabled={!canExecuteMemberBatchAssign || selectedWorkflowMemberBatchAssigned}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selectedWorkflowMemberBatchAssigned
                      ? "Member Already Assigned"
                      : "Assign Member To Working Batch"}
                  </button>
                </div>
          </section>
        </div>
      )}

      {editing && canEditMembers && (
        <MemberModal
          member={editing}
          errors={errors}
          canEditBatch={canManageBatchWorkflow}
          onClose={() => setEditing(null)}
          onSubmit={(data) => handleUpdate(editing.id, data)}
        />
      )}

      {deleting && canDeleteMembers && (
        <DeleteModal
          subject={`${deleting.first_name} ${deleting.last_name}`}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void handleDelete(deleting.id)}
        />
      )}

      {viewingMember && (
        <MemberDetailModal
          member={viewingMember}
          onClose={() => setViewingMember(null)}
        />
      )}
    </div>
  );
}
