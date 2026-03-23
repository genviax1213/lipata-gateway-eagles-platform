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
  is_reversal: boolean;
  reversal_of_contribution_id: number | null;
  reversed_by_entry_id: number | null;
  finance_account?: {
    id: number;
    name: string;
    account_type: string;
    account_label: string;
  } | null;
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

interface ReportPreviewRow {
  id: number;
  member: {
    id: number;
    member_number: string;
    name: string;
    email: string | null;
  } | null;
  amount: number;
  note: string | null;
  category: string;
  category_label: string;
  contribution_date: string;
  recipient_indicator: string | null;
  is_reversal: boolean;
  reversed_by_entry_id: number | null;
  finance_account?: FinanceAccountOption | null;
  encoded_by?: { id: number; name: string } | null;
}

interface ReportPreviewPayload {
  filters: {
    category: string;
    search: string;
    year: number | null;
    month: string | null;
    date_from: string | null;
    date_to: string | null;
    project_query: string | null;
    recipient_query: string | null;
  };
  category_label: string;
  total_amount: number;
  total_records: number;
  data: ReportPreviewRow[];
  current_page: number;
  last_page: number;
}

interface FinanceAccountOption {
  id: number;
  code?: string;
  name: string;
  account_type: string;
  account_label?: string;
  is_active?: boolean;
}

interface FinanceAccountBalanceRow {
  account: FinanceAccountOption;
  opening_balance_total?: number;
  opening_balance_count?: number;
  total_inflows: number;
  total_outflows: number;
  net_balance: number;
}

interface FinanceAccountBalancesPayload {
  data: FinanceAccountBalanceRow[];
  unassigned_contribution_total?: number;
}

interface OpeningBalanceRow {
  id: number;
  effective_date: string;
  amount: number;
  note: string;
  finance_account: FinanceAccountOption | null;
  is_reversal: boolean;
  reversal_of_opening_balance_id: number | null;
  reversed_by_entry_id: number | null;
  encoded_at: string | null;
  encoded_by?: { id: number; name: string } | null;
}

interface ExpenseRow {
  id: number;
  amount: number;
  category: string;
  category_label: string;
  expense_date: string;
  note: string | null;
  payee_name: string | null;
  support_reference: string | null;
  approval_reference: string | null;
  beneficiary_member?: {
    id: number;
    member_number: string;
    name: string;
    email: string | null;
  } | null;
  finance_account: FinanceAccountOption | null;
  is_reversal: boolean;
  reversal_of_expense_id: number | null;
  reversed_by_entry_id: number | null;
  encoded_by?: { id: number; name: string } | null;
}

interface ExpenseLedgerPayload {
  filters: {
    category: string | null;
    account_id: number | null;
    search: string | null;
    payee_name: string | null;
    support_only: boolean;
    date_from: string | null;
    date_to: string | null;
  };
  category_labels: Record<string, string>;
  total_amount: number;
  total_records: number;
  data: ExpenseRow[];
  current_page: number;
  last_page: number;
}

interface ExpenseReportPreviewPayload {
  filters: {
    category: string | null;
    account_id: number | null;
    search: string | null;
    payee_name: string | null;
    date_from: string | null;
    date_to: string | null;
  };
  total_amount: number;
  total_records: number;
  data: ExpenseRow[];
  current_page: number;
  last_page: number;
}

interface AuditNoteRow {
  id: number;
  status: string;
  status_label: string;
  note_text: string;
  created_at: string | null;
  created_by: { id: number; name: string } | null;
}

interface AuditFindingRow {
  member: {
    id: number;
    member_number: string;
    name: string;
    email: string | null;
  } | null;
  contribution_id: number | null;
  target_month: string;
  category: string;
  category_label: string;
  discrepancy_type: string;
  discrepancy_label: string;
  details: string;
  amount: number;
  latest_status: string | null;
  latest_status_label: string | null;
  notes: AuditNoteRow[];
}

interface AuditFindingsPayload {
  filters: {
    month: string;
    category: string | null;
    member_search: string | null;
    status: string | null;
    discrepancy_type: string | null;
    required_monthly_amount: number;
  };
  available_statuses: Record<string, string>;
  available_discrepancies: Record<string, string>;
  current_page: number;
  last_page: number;
  total: number;
  data: AuditFindingRow[];
}

interface ExpenseAuditNoteRow {
  id: number;
  status: string;
  status_label: string;
  note_text: string;
  created_at: string | null;
  created_by: { id: number; name: string } | null;
}

interface ExpenseAuditFindingRow {
  expense_id: number | null;
  target_month: string;
  category: string;
  category_label: string;
  payee_name: string | null;
  finance_account: FinanceAccountOption | null;
  discrepancy_type: string;
  discrepancy_label: string;
  details: string;
  amount: number;
  latest_status: string | null;
  latest_status_label: string | null;
  notes: ExpenseAuditNoteRow[];
}

interface ExpenseAuditFindingsPayload {
  filters: {
    month: string;
    category: string | null;
    account_id: number | null;
    status: string | null;
    discrepancy_type: string | null;
    payee_name: string | null;
  };
  available_statuses: Record<string, string>;
  available_discrepancies: Record<string, string>;
  current_page: number;
  last_page: number;
  total: number;
  data: ExpenseAuditFindingRow[];
}

type ContributionsTab =
  | "mine"
  | "member-search"
  | "selected-member"
  | "compliance"
  | "report-preview"
  | "audit-findings"
  | "expense-ledger"
  | "expense-audit"
  | "expense-report";

type FinanceSection = "treasury-summary" | "mine" | "members" | "expenses";

const PAGE_SIZE = 10;

const CATEGORY_OPTIONS = [
  { value: "monthly_contribution", label: "Monthly Contribution" },
  { value: "alalayang_agila_contribution", label: "Alalayang Agila Contribution" },
  { value: "project_contribution", label: "Project Contribution" },
  { value: "extra_contribution", label: "Extra Contribution" },
];

const EXPENSE_CATEGORY_OPTIONS = [
  { value: "administrative_expense", label: "Administrative Expense" },
  { value: "event_expense", label: "Event Expense" },
  { value: "project_expense", label: "Project Expense" },
  { value: "aid_expense", label: "Aid Expense" },
  { value: "reimbursement_expense", label: "Reimbursement Expense" },
  { value: "misc_expense", label: "Miscellaneous Expense" },
];

const CATEGORY_COLORS: Record<string, string> = {
  monthly_contribution: "#166534",
  alalayang_agila_contribution: "#92400e",
  project_contribution: "#1e3a8a",
  extra_contribution: "#581c87",
  administrative_expense: "#7c2d12",
  event_expense: "#9a3412",
  project_expense: "#b91c1c",
  aid_expense: "#991b1b",
  reimbursement_expense: "#7f1d1d",
  misc_expense: "#78350f",
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

function financeAccountLabel(account?: FinanceAccountOption | null): string {
  return account?.account_label ?? account?.name ?? account?.code ?? "-";
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesDateRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

async function getWithAuthRecovery<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await api.get<T>(url, params ? { params } : undefined);
      return response.data;
    } catch (error) {
      lastError = error;
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      if (status !== 401 && status !== 419) {
        throw error;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
    }
  }

  throw lastError;
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
  const financeRole = typeof (user as { finance_role?: unknown } | null)?.finance_role === "string"
    ? String((user as { finance_role?: string }).finance_role)
    : "";
  const roleName = typeof (user as { role?: { name?: unknown } } | null)?.role?.name === "string"
    ? String((user as { role?: { name?: string } }).role?.name)
    : "";
  const canRecordAuditNotes = financeRole === "auditor" || roleName === "auditor";

  const [activeTab, setActiveTab] = useState<ContributionsTab>("mine");
  const [activeSection, setActiveSection] = useState<FinanceSection>(() => (canViewFinance ? "treasury-summary" : "mine"));
  const [myData, setMyData] = useState<ContributionPayload | null>(null);
  const [myDataNotice, setMyDataNotice] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [complianceLoaded, setComplianceLoaded] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [contributionRows, setContributionRows] = useState<ContributionRow[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccountOption[]>([]);
  const [accountBalances, setAccountBalances] = useState<FinanceAccountBalanceRow[]>([]);
  const [openingBalances, setOpeningBalances] = useState<OpeningBalanceRow[]>([]);
  const [unassignedContributionTotal, setUnassignedContributionTotal] = useState(0);
  const [openingBalanceAccountId, setOpeningBalanceAccountId] = useState("");
  const [openingBalanceEffectiveDate, setOpeningBalanceEffectiveDate] = useState("");
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState("");
  const [openingBalanceNote, setOpeningBalanceNote] = useState("");
  const [showOpeningBalanceForm, setShowOpeningBalanceForm] = useState(false);
  const [reverseOpeningBalanceId, setReverseOpeningBalanceId] = useState<number | null>(null);
  const [reverseOpeningBalanceDate, setReverseOpeningBalanceDate] = useState("");
  const [reverseOpeningBalanceRemarks, setReverseOpeningBalanceRemarks] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("monthly_contribution");
  const [contributionDateInput, setContributionDateInput] = useState("");
  const [recipientIndicatorInput, setRecipientIndicatorInput] = useState("");
  const [contributionAccountId, setContributionAccountId] = useState("");
  const [reverseContributionId, setReverseContributionId] = useState<number | null>(null);
  const [reverseRemarks, setReverseRemarks] = useState("");
  const [reverseDate, setReverseDate] = useState("");
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [expenseLoaded, setExpenseLoaded] = useState(false);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseRecordCount, setExpenseRecordCount] = useState(0);
  const [expensePage, setExpensePage] = useState(1);
  const [expenseLastPage, setExpenseLastPage] = useState(1);
  const [expenseCategoryInput, setExpenseCategoryInput] = useState("administrative_expense");
  const [expenseDateInput, setExpenseDateInput] = useState("");
  const [expenseAmountInput, setExpenseAmountInput] = useState("");
  const [expensePayeeInput, setExpensePayeeInput] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [expenseNoteInput, setExpenseNoteInput] = useState("");
  const [expenseSupportReferenceInput, setExpenseSupportReferenceInput] = useState("");
  const [expenseApprovalReferenceInput, setExpenseApprovalReferenceInput] = useState("");
  const [expenseBeneficiaryMemberId, setExpenseBeneficiaryMemberId] = useState("");
  const [reverseExpenseId, setReverseExpenseId] = useState<number | null>(null);
  const [reverseExpenseRemarks, setReverseExpenseRemarks] = useState("");
  const [reverseExpenseDate, setReverseExpenseDate] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("");
  const [expenseAccountFilter, setExpenseAccountFilter] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expensePayeeFilter, setExpensePayeeFilter] = useState("");
  const [expenseDateFrom, setExpenseDateFrom] = useState("");
  const [expenseDateTo, setExpenseDateTo] = useState("");
  const [expenseSupportOnly, setExpenseSupportOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorContext, setErrorContext] = useState<
    "global"
    | "member-search"
    | "selected-member"
    | "report-preview"
    | "expense-ledger"
    | "expense-audit"
    | "expense-report"
  >("global");
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
  const [myProjectFilter, setMyProjectFilter] = useState("");
  const [myRecipientFilter, setMyRecipientFilter] = useState("");
  const [myDateFromFilter, setMyDateFromFilter] = useState("");
  const [myDateToFilter, setMyDateToFilter] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [selectedYearFilter, setSelectedYearFilter] = useState("");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState("");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("");
  const [selectedRecipientFilter, setSelectedRecipientFilter] = useState("");
  const [selectedDateFromFilter, setSelectedDateFromFilter] = useState("");
  const [selectedDateToFilter, setSelectedDateToFilter] = useState("");
  const [myPage, setMyPage] = useState(1);
  const [selectedPage, setSelectedPage] = useState(1);
  const [membersPage, setMembersPage] = useState(1);
  const [compliancePage, setCompliancePage] = useState(1);
  const [reportPreviewLoaded, setReportPreviewLoaded] = useState(false);
  const [reportPreviewRows, setReportPreviewRows] = useState<ReportPreviewRow[]>([]);
  const [reportPreviewTotal, setReportPreviewTotal] = useState(0);
  const [reportPreviewCount, setReportPreviewCount] = useState(0);
  const [reportPreviewPage, setReportPreviewPage] = useState(1);
  const [reportPreviewLastPage, setReportPreviewLastPage] = useState(1);
  const [reportCategory, setReportCategory] = useState("monthly_contribution");
  const [reportSearch, setReportSearch] = useState("");
  const [reportYearFilter, setReportYearFilter] = useState(String(new Date().getFullYear()));
  const [reportMonthFilter, setReportMonthFilter] = useState("");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportProjectFilter, setReportProjectFilter] = useState("");
  const [reportRecipientFilter, setReportRecipientFilter] = useState("");
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditFindingRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLastPage, setAuditLastPage] = useState(1);
  const [auditMonth, setAuditMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [auditCategoryFilter, setAuditCategoryFilter] = useState("");
  const [auditMemberSearch, setAuditMemberSearch] = useState("");
  const [auditStatusFilter, setAuditStatusFilter] = useState("");
  const [auditDiscrepancyFilter, setAuditDiscrepancyFilter] = useState("");
  const [auditStatuses, setAuditStatuses] = useState<Record<string, string>>({});
  const [auditDiscrepancies, setAuditDiscrepancies] = useState<Record<string, string>>({});
  const [auditRequiredMonthlyAmount, setAuditRequiredMonthlyAmount] = useState(0);
  const [auditNoteTargetKey, setAuditNoteTargetKey] = useState("");
  const [auditNoteStatus, setAuditNoteStatus] = useState("needs_followup");
  const [auditNoteText, setAuditNoteText] = useState("");
  const [expenseAuditLoaded, setExpenseAuditLoaded] = useState(false);
  const [expenseAuditRows, setExpenseAuditRows] = useState<ExpenseAuditFindingRow[]>([]);
  const [expenseAuditTotal, setExpenseAuditTotal] = useState(0);
  const [expenseAuditPage, setExpenseAuditPage] = useState(1);
  const [expenseAuditLastPage, setExpenseAuditLastPage] = useState(1);
  const [expenseAuditMonth, setExpenseAuditMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [expenseAuditCategoryFilter, setExpenseAuditCategoryFilter] = useState("");
  const [expenseAuditAccountFilter, setExpenseAuditAccountFilter] = useState("");
  const [expenseAuditStatusFilter, setExpenseAuditStatusFilter] = useState("");
  const [expenseAuditDiscrepancyFilter, setExpenseAuditDiscrepancyFilter] = useState("");
  const [expenseAuditPayeeFilter, setExpenseAuditPayeeFilter] = useState("");
  const [expenseAuditStatuses, setExpenseAuditStatuses] = useState<Record<string, string>>({});
  const [expenseAuditDiscrepancies, setExpenseAuditDiscrepancies] = useState<Record<string, string>>({});
  const [expenseAuditNoteTargetKey, setExpenseAuditNoteTargetKey] = useState("");
  const [expenseAuditNoteStatus, setExpenseAuditNoteStatus] = useState("needs_followup");
  const [expenseAuditNoteText, setExpenseAuditNoteText] = useState("");
  const [expenseReportLoaded, setExpenseReportLoaded] = useState(false);
  const [expenseReportRows, setExpenseReportRows] = useState<ExpenseRow[]>([]);
  const [expenseReportTotal, setExpenseReportTotal] = useState(0);
  const [expenseReportCount, setExpenseReportCount] = useState(0);
  const [expenseReportPage, setExpenseReportPage] = useState(1);
  const [expenseReportLastPage, setExpenseReportLastPage] = useState(1);
  const [expenseReportCategoryFilter, setExpenseReportCategoryFilter] = useState("");
  const [expenseReportAccountFilter, setExpenseReportAccountFilter] = useState("");
  const [expenseReportSearch, setExpenseReportSearch] = useState("");
  const [expenseReportPayeeFilter, setExpenseReportPayeeFilter] = useState("");
  const [expenseReportDateFrom, setExpenseReportDateFrom] = useState("");
  const [expenseReportDateTo, setExpenseReportDateTo] = useState("");

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
    context: "global" | "member-search" | "selected-member" | "report-preview" | "expense-ledger" | "expense-audit" | "expense-report",
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
      setMembersLoaded(true);
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

  const fetchFinanceAccounts = useCallback(async () => {
    if (!canViewFinance) return;

    try {
      const accountsDataResponse = await getWithAuthRecovery<{ data?: FinanceAccountOption[] } | FinanceAccountOption[]>("/finance/accounts");
      const balancesData = await getWithAuthRecovery<FinanceAccountBalancesPayload>("/finance/account-balances");
      const openingBalancesData = await getWithAuthRecovery<{ data: OpeningBalanceRow[] }>("/finance/opening-balances");

      const accountsData = Array.isArray(accountsDataResponse)
        ? accountsDataResponse
        : accountsDataResponse.data ?? [];

      setFinanceAccounts(accountsData);
      setAccountBalances(balancesData.data ?? []);
      setOpeningBalances(openingBalancesData.data ?? []);
      setUnassignedContributionTotal(Number(balancesData.unassigned_contribution_total ?? 0));
    } catch (err) {
      setScopedError(parseError(err, "Unable to load finance accounts."), "global");
    }
  }, [canViewFinance]);

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
      setComplianceLoaded(true);
    } catch (err) {
      setScopedError(parseError(err, "Unable to load compliance report."), "member-search");
    }
  }, [canViewFinance, complianceMonth, complianceNonCompliantOnly, complianceYears]);

  const fetchReportPreview = useCallback(async (page = 1) => {
    if (!canInputFinance) return;

    setLoading(true);
    setError("");
    setErrorContext("report-preview");

    try {
      const res = await api.get<ReportPreviewPayload>("/finance/report-preview", {
        params: {
          page,
          category: reportCategory,
          search: reportSearch || null,
          year: reportYearFilter || null,
          month: reportMonthFilter || null,
          date_from: reportDateFrom || null,
          date_to: reportDateTo || null,
          project_query: reportProjectFilter || null,
          recipient_query: reportRecipientFilter || null,
        },
      });
      setReportPreviewRows(res.data.data ?? []);
      setReportPreviewTotal(Number(res.data.total_amount ?? 0));
      setReportPreviewCount(Number(res.data.total_records ?? 0));
      setReportPreviewPage(Number(res.data.current_page ?? 1));
      setReportPreviewLastPage(Number(res.data.last_page ?? 1));
      setReportPreviewLoaded(true);
    } catch (err) {
      setScopedError(parseError(err, "Unable to generate treasurer report preview."), "report-preview");
    } finally {
      setLoading(false);
    }
  }, [canInputFinance, reportCategory, reportDateFrom, reportDateTo, reportMonthFilter, reportProjectFilter, reportRecipientFilter, reportSearch, reportYearFilter]);

  const fetchAuditFindings = useCallback(async (page = 1) => {
    if (!canViewFinance) return;

    setLoading(true);
    setError("");
    setErrorContext("report-preview");

    try {
      const res = await api.get<AuditFindingsPayload>("/finance/audit-findings", {
        params: {
          page,
          month: auditMonth,
          category: auditCategoryFilter || null,
          member_search: auditMemberSearch || null,
          status: auditStatusFilter || null,
          discrepancy_type: auditDiscrepancyFilter || null,
        },
      });
      setAuditRows(res.data.data ?? []);
      setAuditTotal(Number(res.data.total ?? 0));
      setAuditPage(Number(res.data.current_page ?? 1));
      setAuditLastPage(Number(res.data.last_page ?? 1));
      setAuditStatuses(res.data.available_statuses ?? {});
      setAuditDiscrepancies(res.data.available_discrepancies ?? {});
      setAuditRequiredMonthlyAmount(Number(res.data.filters?.required_monthly_amount ?? 0));
      setAuditLoaded(true);
    } catch (err) {
      setScopedError(parseError(err, "Unable to load audit findings."), "report-preview");
    } finally {
      setLoading(false);
    }
  }, [auditCategoryFilter, auditDiscrepancyFilter, auditMemberSearch, auditMonth, auditStatusFilter, canViewFinance]);

  const fetchExpenseLedger = useCallback(async (page = 1) => {
    if (!canViewFinance) return;

    setLoading(true);
    setError("");
    setErrorContext("expense-ledger");

    try {
      const res = await api.get<ExpenseLedgerPayload>("/finance/expenses", {
        params: {
          page,
          category: expenseCategoryFilter || null,
          finance_account_id: expenseAccountFilter || null,
          search: expenseSearch || null,
          payee_query: expensePayeeFilter || null,
          support_state: expenseSupportOnly ? "with_support" : null,
          date_from: expenseDateFrom || null,
          date_to: expenseDateTo || null,
        },
      });
      setExpenseRows(res.data.data ?? []);
      setExpenseTotal(Number(res.data.total_amount ?? 0));
      setExpenseRecordCount(Number(res.data.total_records ?? 0));
      setExpensePage(Number(res.data.current_page ?? 1));
      setExpenseLastPage(Number(res.data.last_page ?? 1));
      setExpenseLoaded(true);
    } catch (err) {
      setScopedError(parseError(err, "Unable to load expenses."), "expense-ledger");
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, expenseAccountFilter, expenseCategoryFilter, expenseDateFrom, expenseDateTo, expensePayeeFilter, expenseSearch, expenseSupportOnly]);

  const fetchExpenseAuditFindings = useCallback(async (page = 1) => {
    if (!canViewFinance) return;

    setLoading(true);
    setError("");
    setErrorContext("expense-audit");

    try {
      const res = await api.get<ExpenseAuditFindingsPayload>("/finance/expense-audit-findings", {
        params: {
          page,
          month: expenseAuditMonth,
          category: expenseAuditCategoryFilter || null,
          finance_account_id: expenseAuditAccountFilter || null,
          status: expenseAuditStatusFilter || null,
          discrepancy_type: expenseAuditDiscrepancyFilter || null,
          search: expenseAuditPayeeFilter || null,
        },
      });
      setExpenseAuditRows(res.data.data ?? []);
      setExpenseAuditTotal(Number(res.data.total ?? 0));
      setExpenseAuditPage(Number(res.data.current_page ?? 1));
      setExpenseAuditLastPage(Number(res.data.last_page ?? 1));
      setExpenseAuditStatuses(res.data.available_statuses ?? {});
      setExpenseAuditDiscrepancies(res.data.available_discrepancies ?? {});
      setExpenseAuditLoaded(true);
    } catch (err) {
      setScopedError(parseError(err, "Unable to load expense audit findings."), "expense-audit");
    } finally {
      setLoading(false);
    }
  }, [canViewFinance, expenseAuditAccountFilter, expenseAuditCategoryFilter, expenseAuditDiscrepancyFilter, expenseAuditMonth, expenseAuditPayeeFilter, expenseAuditStatusFilter]);

  const fetchExpenseReportPreview = useCallback(async (page = 1) => {
    if (!canInputFinance) return;

    setLoading(true);
    setError("");
    setErrorContext("expense-report");

    try {
      const res = await api.get<ExpenseReportPreviewPayload>("/finance/expense-report-preview", {
        params: {
          page,
          category: expenseReportCategoryFilter || null,
          finance_account_id: expenseReportAccountFilter || null,
          search: expenseReportSearch || null,
          payee_query: expenseReportPayeeFilter || null,
          date_from: expenseReportDateFrom || null,
          date_to: expenseReportDateTo || null,
        },
      });
      setExpenseReportRows(res.data.data ?? []);
      setExpenseReportTotal(Number(res.data.total_amount ?? 0));
      setExpenseReportCount(Number(res.data.total_records ?? 0));
      setExpenseReportPage(Number(res.data.current_page ?? 1));
      setExpenseReportLastPage(Number(res.data.last_page ?? 1));
      setExpenseReportLoaded(true);
    } catch (err) {
      setScopedError(parseError(err, "Unable to generate expense report preview."), "expense-report");
    } finally {
      setLoading(false);
    }
  }, [canInputFinance, expenseReportAccountFilter, expenseReportCategoryFilter, expenseReportDateFrom, expenseReportDateTo, expenseReportPayeeFilter, expenseReportSearch]);

  useEffect(() => {
    void fetchMyContributions();
  }, [fetchMyContributions]);

  useEffect(() => {
    if (!canViewFinance) return;
    void fetchFinanceAccounts();
  }, [canViewFinance, fetchFinanceAccounts]);

  useEffect(() => {
    if (!canViewFinance) return;

    if (activeTab === "member-search" && !membersLoaded) {
      void fetchMembers();
    }
    if (activeTab === "compliance" && !complianceLoaded) {
      void fetchCompliance();
    }
    if (activeTab === "audit-findings" && !auditLoaded) {
      void fetchAuditFindings(1);
    }
    if (activeTab === "expense-ledger" && !expenseLoaded) {
      void fetchExpenseLedger(1);
    }
    if (activeTab === "expense-audit" && !expenseAuditLoaded) {
      void fetchExpenseAuditFindings(1);
    }
  }, [
    activeTab,
    auditLoaded,
    canViewFinance,
    complianceLoaded,
    expenseAuditLoaded,
    expenseLoaded,
    fetchAuditFindings,
    fetchCompliance,
    fetchExpenseAuditFindings,
    fetchExpenseLedger,
    fetchMembers,
    membersLoaded,
  ]);

  useEffect(() => {
    if (!canInputFinance) return;

    if (activeTab === "report-preview" && !reportPreviewLoaded) {
      void fetchReportPreview(1);
    }
    if (activeTab === "expense-report" && !expenseReportLoaded) {
      void fetchExpenseReportPreview(1);
    }
  }, [
    activeTab,
    canInputFinance,
    expenseReportLoaded,
    fetchExpenseReportPreview,
    fetchReportPreview,
    reportPreviewLoaded,
  ]);

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
        note: noteInput,
        category: categoryInput,
        contribution_date: contributionDateInput || null,
        recipient_name: recipientIndicatorInput || null,
        finance_account_id: contributionAccountId || null,
      });
      setNotice("Contribution saved. If this was entered incorrectly, add a reversal entry later instead of editing this saved record.");
      setAmountInput("");
      setNoteInput("");
      setRecipientIndicatorInput("");
      setContributionDateInput("");
      setContributionAccountId("");
      await fetchContributions(selectedMemberId);
      await fetchMyContributions();
      await fetchFinanceAccounts();
    } catch (err) {
      setScopedError(parseError(err, "Failed to save contribution."), "selected-member");
    }
  };

  const submitReversal = async () => {
    if (!canInputFinance || !reverseContributionId || !selectedMemberId) return;

    setError("");
    setErrorContext("selected-member");
    setNotice("");

    try {
      await api.post(`/finance/contributions/${reverseContributionId}/reverse`, {
        remarks: reverseRemarks,
        contribution_date: reverseDate || null,
        finance_account_id: contributionRows.find((row) => row.id === reverseContributionId)?.finance_account?.id ?? null,
      });
      setNotice("Reversal entry saved. The original record stays visible, and the total is now balanced by the reversal.");
      setReverseContributionId(null);
      setReverseRemarks("");
      setReverseDate("");
      await fetchContributions(selectedMemberId);
      await fetchMyContributions();
      await fetchFinanceAccounts();
    } catch (err) {
      setScopedError(parseError(err, "Failed to save reversal entry."), "selected-member");
    }
  };

  const createExpense = async () => {
    if (!canInputFinance) return;

    setError("");
    setErrorContext("expense-ledger");
    setNotice("");

    try {
      await api.post("/finance/expenses", {
        category: expenseCategoryInput,
        expense_date: expenseDateInput || null,
        amount: Number(expenseAmountInput),
        payee_name: expensePayeeInput,
        finance_account_id: expenseAccountId || null,
        note: expenseNoteInput,
        support_reference: expenseSupportReferenceInput || null,
        approval_reference: expenseApprovalReferenceInput || null,
        beneficiary_member_id: expenseBeneficiaryMemberId || null,
      });
      setNotice("Expense saved. If this was entered incorrectly, add an expense reversal instead of editing the saved record.");
      setExpenseCategoryInput("administrative_expense");
      setExpenseDateInput("");
      setExpenseAmountInput("");
      setExpensePayeeInput("");
      setExpenseAccountId("");
      setExpenseNoteInput("");
      setExpenseSupportReferenceInput("");
      setExpenseApprovalReferenceInput("");
      setExpenseBeneficiaryMemberId("");
      await fetchExpenseLedger(1);
      await fetchFinanceAccounts();
    } catch (err) {
      setScopedError(parseError(err, "Failed to save expense."), "expense-ledger");
    }
  };

  const submitExpenseReversal = async () => {
    if (!canInputFinance || !reverseExpenseId) return;

    setError("");
    setErrorContext("expense-ledger");
    setNotice("");

    try {
      await api.post(`/finance/expenses/${reverseExpenseId}/reverse`, {
        remarks: reverseExpenseRemarks,
        expense_date: reverseExpenseDate || null,
        finance_account_id: expenseRows.find((row) => row.id === reverseExpenseId)?.finance_account?.id ?? null,
      });
      setNotice("Expense reversal saved. The original expense stays visible, and the total is now balanced by the reversal.");
      setReverseExpenseId(null);
      setReverseExpenseRemarks("");
      setReverseExpenseDate("");
      await fetchExpenseLedger(expensePage);
      await fetchFinanceAccounts();
    } catch (err) {
      setScopedError(parseError(err, "Failed to save expense reversal."), "expense-ledger");
    }
  };

  const createOpeningBalance = async () => {
    if (!canInputFinance) return;

    setError("");
    setErrorContext("global");
    setNotice("");

    try {
      await api.post("/finance/opening-balances", {
        finance_account_id: openingBalanceAccountId || null,
        effective_date: openingBalanceEffectiveDate || null,
        amount: Number(openingBalanceAmount),
        note: openingBalanceNote,
      });
      setNotice("Opening balance recorded. It is locked after save and must be corrected through a reversal or follow-on adjustment.");
      setOpeningBalanceAccountId("");
      setOpeningBalanceEffectiveDate("");
      setOpeningBalanceAmount("");
      setOpeningBalanceNote("");
      setShowOpeningBalanceForm(false);
      await fetchFinanceAccounts();
    } catch (err) {
      setScopedError(parseError(err, "Failed to save opening balance."), "global");
    }
  };

  const submitOpeningBalanceReversal = async () => {
    if (!canInputFinance || !reverseOpeningBalanceId) return;

    setError("");
    setErrorContext("global");
    setNotice("");

    try {
      await api.post(`/finance/opening-balances/${reverseOpeningBalanceId}/reverse`, {
        remarks: reverseOpeningBalanceRemarks,
        effective_date: reverseOpeningBalanceDate || null,
        finance_account_id: openingBalances.find((row) => row.id === reverseOpeningBalanceId)?.finance_account?.id ?? null,
      });
      setNotice("Starting balance reversal saved. The original starting balance stays visible, and the account total is now balanced by the reversal.");
      setReverseOpeningBalanceId(null);
      setReverseOpeningBalanceDate("");
      setReverseOpeningBalanceRemarks("");
      await fetchFinanceAccounts();
    } catch (err) {
      setScopedError(parseError(err, "Failed to reverse opening balance."), "global");
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
      if (!matchesDateRange(row.contribution_date, myDateFromFilter, myDateToFilter)) return false;
      if (myProjectFilter && row.category === "project_contribution" && !normalizeSearchValue(row.note).includes(normalizeSearchValue(myProjectFilter))) return false;
      if (myRecipientFilter && row.category === "alalayang_agila_contribution" && !normalizeSearchValue(row.recipient_indicator).includes(normalizeSearchValue(myRecipientFilter))) return false;
      if (myProjectFilter && row.category !== "project_contribution") return false;
      if (myRecipientFilter && row.category !== "alalayang_agila_contribution") return false;
      return true;
    });
  }, [myCategoryFilter, myData, myDateFromFilter, myDateToFilter, myMonthFilter, myProjectFilter, myRecipientFilter, myYearFilter]);
  const filteredMyTotal = useMemo(
    () => filteredMyRows.reduce((sum, row) => sum + Number(row.amount), 0),
    [filteredMyRows],
  );
  const pagedMyRows = useMemo(() => {
    const start = (myPage - 1) * PAGE_SIZE;
    return filteredMyRows.slice(start, start + PAGE_SIZE);
  }, [filteredMyRows, myPage]);
  const myLastPage = Math.max(1, Math.ceil(filteredMyRows.length / PAGE_SIZE));
  const filteredSelectedRows = useMemo(
    () =>
      contributionRows.filter((row) => {
        if (selectedCategoryFilter && row.category !== selectedCategoryFilter) return false;
        if (selectedYearFilter && !row.contribution_date.startsWith(selectedYearFilter)) return false;
        if (selectedMonthFilter && row.contribution_date.slice(5, 7) !== selectedMonthFilter) return false;
        if (!matchesDateRange(row.contribution_date, selectedDateFromFilter, selectedDateToFilter)) return false;
        if (selectedProjectFilter && row.category === "project_contribution" && !normalizeSearchValue(row.note).includes(normalizeSearchValue(selectedProjectFilter))) return false;
        if (selectedRecipientFilter && row.category === "alalayang_agila_contribution" && !normalizeSearchValue(row.recipient_indicator).includes(normalizeSearchValue(selectedRecipientFilter))) return false;
        if (selectedProjectFilter && row.category !== "project_contribution") return false;
        if (selectedRecipientFilter && row.category !== "alalayang_agila_contribution") return false;
        return true;
      }),
    [contributionRows, selectedCategoryFilter, selectedDateFromFilter, selectedDateToFilter, selectedMonthFilter, selectedProjectFilter, selectedRecipientFilter, selectedYearFilter],
  );
  const filteredSelectedTotal = useMemo(
    () => filteredSelectedRows.reduce((sum, row) => sum + Number(row.amount), 0),
    [filteredSelectedRows],
  );
  const pagedSelectedRows = useMemo(() => {
    const start = (selectedPage - 1) * PAGE_SIZE;
    return filteredSelectedRows.slice(start, start + PAGE_SIZE);
  }, [filteredSelectedRows, selectedPage]);
  const selectedLastPage = Math.max(1, Math.ceil(filteredSelectedRows.length / PAGE_SIZE));
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
  const reportPreviewGraph = useMemo(() => {
    const totals = reportPreviewRows.reduce<Record<string, number>>((acc, row) => {
      const memberKey = row.member?.name ?? "Unlinked Member";
      acc[memberKey] = (acc[memberKey] ?? 0) + Number(row.amount);
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([label, total]) => ({
        label,
        color: "#1e3a8a",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [reportPreviewRows]);
  const auditGraph = useMemo(() => {
    const totals = auditRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.discrepancy_label] = (acc[row.discrepancy_label] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([label, total]) => ({
        label,
        color: "#7f1d1d",
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [auditRows]);
  const complianceYearSelectOptions = useMemo(() => {
    const currentYear = Number(complianceMonth.slice(0, 4)) || new Date().getFullYear();
    const fallback = Array.from({ length: 8 }, (_, index) => currentYear - index);
    return [...new Set([...complianceYearOptions, ...fallback, ...complianceYears])].sort((a, b) => b - a);
  }, [complianceMonth, complianceYearOptions, complianceYears]);
  const pagedMembers = useMemo(() => {
    const start = (membersPage - 1) * PAGE_SIZE;
    return members.slice(start, start + PAGE_SIZE);
  }, [members, membersPage]);
  const membersLastPage = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const pagedComplianceRows = useMemo(() => {
    const start = (compliancePage - 1) * PAGE_SIZE;
    return complianceRows.slice(start, start + PAGE_SIZE);
  }, [compliancePage, complianceRows]);
  const complianceLastPage = Math.max(1, Math.ceil(complianceRows.length / PAGE_SIZE));
  const resetContributionForm = () => {
    setAmountInput("");
    setNoteInput("");
    setCategoryInput("monthly_contribution");
    setContributionDateInput("");
    setRecipientIndicatorInput("");
    setContributionAccountId("");
  };

  const resetExpenseForm = () => {
    setExpenseCategoryInput("administrative_expense");
    setExpenseDateInput("");
    setExpenseAmountInput("");
    setExpensePayeeInput("");
    setExpenseAccountId("");
    setExpenseNoteInput("");
    setExpenseSupportReferenceInput("");
    setExpenseApprovalReferenceInput("");
    setExpenseBeneficiaryMemberId("");
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

  useEffect(() => {
    setMyPage(1);
  }, [myCategoryFilter, myYearFilter, myMonthFilter, myProjectFilter, myRecipientFilter, myDateFromFilter, myDateToFilter]);

  useEffect(() => {
    setSelectedPage(1);
  }, [selectedCategoryFilter, selectedYearFilter, selectedMonthFilter, selectedProjectFilter, selectedRecipientFilter, selectedDateFromFilter, selectedDateToFilter]);

  useEffect(() => {
    setReportPreviewPage(1);
  }, [reportCategory, reportSearch, reportYearFilter, reportMonthFilter, reportDateFrom, reportDateTo, reportProjectFilter, reportRecipientFilter]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditMonth, auditCategoryFilter, auditMemberSearch, auditStatusFilter, auditDiscrepancyFilter]);

  useEffect(() => {
    setExpensePage(1);
  }, [expenseAccountFilter, expenseCategoryFilter, expenseDateFrom, expenseDateTo, expensePayeeFilter, expenseSearch, expenseSupportOnly]);

  useEffect(() => {
    setExpenseAuditPage(1);
  }, [expenseAuditAccountFilter, expenseAuditCategoryFilter, expenseAuditDiscrepancyFilter, expenseAuditMonth, expenseAuditPayeeFilter, expenseAuditStatusFilter]);

  useEffect(() => {
    setExpenseReportPage(1);
  }, [expenseReportAccountFilter, expenseReportCategoryFilter, expenseReportDateFrom, expenseReportDateTo, expenseReportPayeeFilter, expenseReportSearch]);

  const submitAuditNote = async (row: AuditFindingRow) => {
    if (!canRecordAuditNotes || !row.member) return;

    setError("");
    setErrorContext("report-preview");

    try {
      await api.post("/finance/audit-notes", {
        member_id: row.member.id,
        contribution_id: row.contribution_id,
        target_month: row.target_month,
        category: row.category,
        discrepancy_type: row.discrepancy_type,
        status: auditNoteStatus,
        note_text: auditNoteText,
      });
      setNotice("Audit note recorded.");
      setAuditNoteTargetKey("");
      setAuditNoteStatus("needs_followup");
      setAuditNoteText("");
      await fetchAuditFindings(auditPage);
    } catch (err) {
      setScopedError(parseError(err, "Unable to save audit note."), "report-preview");
    }
  };

  const submitExpenseAuditNote = async (row: ExpenseAuditFindingRow) => {
    if (!canRecordAuditNotes) return;

    setError("");
    setErrorContext("expense-audit");

    try {
      await api.post("/finance/expense-audit-notes", {
        expense_id: row.expense_id,
        target_month: row.target_month,
        category: row.category,
        discrepancy_type: row.discrepancy_type,
        status: expenseAuditNoteStatus,
        note_text: expenseAuditNoteText,
      });
      setNotice("Expense audit note recorded.");
      setExpenseAuditNoteTargetKey("");
      setExpenseAuditNoteStatus("needs_followup");
      setExpenseAuditNoteText("");
      await fetchExpenseAuditFindings(expenseAuditPage);
    } catch (err) {
      setScopedError(parseError(err, "Unable to save expense audit note."), "expense-audit");
    }
  };

  const contributionRemarksLabel = categoryInput === "project_contribution" ? "Project Name and Remarks" : "Remarks";
  const contributionRemarksHint = categoryInput === "project_contribution"
    ? "Enter the project name here, plus any short note that will help you recognize this entry later."
      : categoryInput === "alalayang_agila_contribution"
        ? "Add a short note explaining the support given, the reason, or any helpful context."
        : "Add a short note so this contribution will still be clear when someone reviews it later.";
  const financeSummaryGraph = useMemo(() => {
    return accountBalances.map((row) => ({
      label: financeAccountLabel(row.account),
      color: CATEGORY_COLORS[row.account.account_type] ?? "#0f766e",
      total: Number(row.net_balance ?? 0),
    }));
  }, [accountBalances]);
  const expenseGraph = useMemo(() => {
    const totals = expenseRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.category_label] = (acc[row.category_label] ?? 0) + Number(row.amount);
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([label, total]) => ({
        label,
        color: "#b91c1c",
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenseRows]);
  const expenseAuditGraph = useMemo(() => {
    const totals = expenseAuditRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.discrepancy_label] = (acc[row.discrepancy_label] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([label, total]) => ({
        label,
        color: "#7f1d1d",
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenseAuditRows]);
  const expenseReportGraph = useMemo(() => {
    const totals = expenseReportRows.reduce<Record<string, number>>((acc, row) => {
      const payeeKey = row.payee_name ?? "Unknown payee";
      acc[payeeKey] = (acc[payeeKey] ?? 0) + Number(row.amount);
      return acc;
    }, {});

    return Object.entries(totals)
      .map(([label, total]) => ({
        label,
        color: "#991b1b",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [expenseReportRows]);

  const openSection = (section: FinanceSection) => {
    setActiveSection(section);

    if (section === "mine") {
      setActiveTab("mine");
      return;
    }

    if (section === "members") {
      setActiveTab((current) => (
        current === "member-search" || current === "selected-member" || current === "compliance" || current === "audit-findings" || current === "report-preview"
          ? current
          : "member-search"
      ));
      return;
    }

    if (section === "expenses") {
      setActiveTab((current) => (
        current === "expense-ledger" || current === "expense-audit" || current === "expense-report"
          ? current
          : "expense-ledger"
      ));
    }
  };

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Finance</h1>
      <p className="mb-6 text-sm text-mist/85">
        Members can review their own contribution history by month, year, and type. Treasurer and auditor can review account balances, contribution records, expense records, and audit notes without changing saved history.
      </p>

      {error && errorContext === "global" && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {notice && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{notice}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        {canViewFinance && (
          <button
            type="button"
            onClick={() => openSection("treasury-summary")}
            className={`rounded-md border px-4 py-2 text-sm ${activeSection === "treasury-summary" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Treasury Summary
          </button>
        )}
        <button
          type="button"
          onClick={() => openSection("mine")}
          className={`rounded-md border px-4 py-2 text-sm ${activeSection === "mine" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
        >
          My Contributions
        </button>
        {canViewFinance && (
          <button
            type="button"
            onClick={() => openSection("members")}
            className={`rounded-md border px-4 py-2 text-sm ${activeSection === "members" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Member Records
          </button>
        )}
        {canViewFinance && (
          <button
            type="button"
            onClick={() => openSection("expenses")}
            className={`rounded-md border px-4 py-2 text-sm ${activeSection === "expenses" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Expenses
          </button>
        )}
      </div>

      {canViewFinance && activeSection === "treasury-summary" && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl text-offwhite">Treasury Accounts</h2>
              <p className="text-sm text-mist/80">Live balances for bank, GCash, and cash on hand based on the saved finance records.</p>
            </div>
            <button type="button" onClick={() => void fetchFinanceAccounts()} className="btn-secondary">Refresh Accounts</button>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {accountBalances.map((row) => (
              <div key={`acct-${row.account.id}`} className="rounded-lg border border-gold/20 bg-gold/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">{financeAccountLabel(row.account)}</p>
                <p className="mt-2 text-lg font-semibold text-offwhite">{money(row.net_balance)}</p>
                <p className="mt-1 text-xs text-mist/80">
                  Open: {money(row.opening_balance_total ?? 0)} | In: {money(row.total_inflows)} | Out: {money(row.total_outflows)}
                </p>
              </div>
            ))}
            {accountBalances.length === 0 && (
              <div className="rounded-lg border border-white/15 bg-white/5 p-4 text-sm text-mist/80 md:col-span-3">
                No finance account balances loaded yet.
              </div>
            )}
          </div>
          {unassignedContributionTotal !== 0 && (
            <p className="text-xs text-amber-200">
              Older contribution records without an assigned treasury account: {money(unassignedContributionTotal)}
            </p>
          )}
          <div className="mt-5">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Account Balance Graph</p>
            <VerticalBarChart items={financeSummaryGraph} valueFormatter={(value) => money(value)} emptyText="No account balances to graph." />
          </div>
          <div className="mt-6">
            <h3 className="font-heading text-xl text-offwhite">Starting Balances</h3>
            <p className="mt-1 text-sm text-mist/80">
              Use this only for bank, GCash, or cash-on-hand amounts that already existed before regular recording started. After saving, these values should be corrected through a reversal entry instead of editing the original record.
            </p>

            {canInputFinance && !showOpeningBalanceForm && openingBalances.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowOpeningBalanceForm(true)}
                  className="btn-secondary"
                >
                  Add Starting Balance
                </button>
              </div>
            )}

            {canInputFinance && (showOpeningBalanceForm || openingBalances.length === 0) && (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <select
                  aria-label="Starting balance account"
                  value={openingBalanceAccountId}
                  onChange={(e) => setOpeningBalanceAccountId(e.target.value)}
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                >
                  <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Select Account</option>
                  {financeAccounts.map((account) => (
                    <option key={`opening-account-${account.id}`} value={String(account.id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                      {financeAccountLabel(account)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Starting balance date"
                  type="date"
                  value={openingBalanceEffectiveDate}
                  onChange={(e) => setOpeningBalanceEffectiveDate(e.target.value)}
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
                <input
                  aria-label="Starting balance amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingBalanceAmount}
                  onChange={(e) => setOpeningBalanceAmount(e.target.value)}
                  placeholder="Starting amount"
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
                <input
                  aria-label="Starting balance note"
                  value={openingBalanceNote}
                  onChange={(e) => setOpeningBalanceNote(e.target.value)}
                  placeholder="Reason or short note"
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
                <div className="md:col-span-4 flex gap-2">
                  <button type="button" onClick={() => void createOpeningBalance()} className="btn-primary">Save Starting Balance</button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpeningBalanceAccountId("");
                      setOpeningBalanceEffectiveDate("");
                      setOpeningBalanceAmount("");
                      setOpeningBalanceNote("");
                      setShowOpeningBalanceForm(false);
                    }}
                    className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-4 py-3 text-left">Effective Date</th>
                    <th className="px-4 py-3 text-left">Account</th>
                    <th className="px-4 py-3 text-left">Amount</th>
                    <th className="px-4 py-3 text-left">Remarks</th>
                    <th className="px-4 py-3 text-left">Recorded By</th>
                    {canInputFinance && <th className="px-4 py-3 text-left">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {openingBalances.map((row) => (
                    <tr key={`opening-balance-${row.id}`} className="border-b border-white/15">
                      <td className="px-4 py-3">{row.effective_date}</td>
                      <td className="px-4 py-3">{financeAccountLabel(row.finance_account)}</td>
                      <td className={`px-4 py-3 ${row.amount < 0 ? "text-red-200" : "text-emerald-200"}`}>{money(row.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{row.note}</span>
                          {row.is_reversal && <span className="rounded-full border border-red-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-red-200">Reversal</span>}
                          {row.reversed_by_entry_id && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-200">Offset</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{row.encoded_by?.name ?? "System"}</td>
                      {canInputFinance && (
                        <td className="px-4 py-3">
                          {row.is_reversal ? (
                            <span className="text-xs text-mist/70">Locked reversal</span>
                          ) : row.reversed_by_entry_id ? (
                            <span className="text-xs text-mist/70">Already balanced by reversal</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReverseOpeningBalanceId(row.id);
                                setReverseOpeningBalanceDate("");
                                setReverseOpeningBalanceRemarks("");
                              }}
                              className="rounded-md border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                            >
                              Reverse Opening
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {openingBalances.length === 0 && (
                    <tr><td colSpan={canInputFinance ? 6 : 5} className="px-4 py-6 text-center text-mist/80">No starting balances recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {canInputFinance && reverseOpeningBalanceId && (
              <div className="mt-4 grid gap-3 rounded-lg border border-white/20 bg-white/10 p-4 md:grid-cols-[220px_1fr_auto]">
                <input
                  aria-label="Starting balance reversal date"
                  type="date"
                  value={reverseOpeningBalanceDate}
                  onChange={(e) => setReverseOpeningBalanceDate(e.target.value)}
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
                <input
                  aria-label="Starting balance reversal note"
                  value={reverseOpeningBalanceRemarks}
                  onChange={(e) => setReverseOpeningBalanceRemarks(e.target.value)}
                  placeholder="Required note for the starting balance reversal"
                  className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" onClick={() => void submitOpeningBalanceReversal()}>Save Reversal</button>
                  <button
                    type="button"
                    onClick={() => {
                      setReverseOpeningBalanceId(null);
                      setReverseOpeningBalanceDate("");
                      setReverseOpeningBalanceRemarks("");
                    }}
                    className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {canViewFinance && activeSection === "members" && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab("member-search")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "member-search" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Find Member</button>
          <button type="button" onClick={() => setActiveTab("selected-member")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "selected-member" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Member Ledger</button>
          <button type="button" onClick={() => setActiveTab("compliance")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "compliance" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Compliance Check</button>
          <button type="button" onClick={() => setActiveTab("audit-findings")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "audit-findings" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Contribution Audit</button>
          {canInputFinance && <button type="button" onClick={() => setActiveTab("report-preview")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "report-preview" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Contribution Reports</button>}
        </div>
      )}

      {canViewFinance && activeSection === "expenses" && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab("expense-ledger")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "expense-ledger" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Expense Ledger</button>
          <button type="button" onClick={() => setActiveTab("expense-audit")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "expense-audit" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Expense Audit</button>
          {canInputFinance && <button type="button" onClick={() => setActiveTab("expense-report")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "expense-report" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Expense Reports</button>}
        </div>
      )}

      {activeSection === "mine" && activeTab === "mine" && (
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
              <input
                aria-label="Filter my project contributions by project name"
                value={myProjectFilter}
                onChange={(e) => setMyProjectFilter(e.target.value)}
                placeholder="Project name contains..."
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Filter my alalayang contributions by recipient"
                value={myRecipientFilter}
                onChange={(e) => setMyRecipientFilter(e.target.value)}
                placeholder="Recipient name contains..."
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Filter my contributions from date"
                type="date"
                value={myDateFromFilter}
                onChange={(e) => setMyDateFromFilter(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Filter my contributions to date"
                type="date"
                value={myDateToFilter}
                onChange={(e) => setMyDateToFilter(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
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
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-4 py-3 text-left">Recipient</th>
                      <th className="px-4 py-3 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMyRows.map((row) => (
                    <tr key={`mine-${row.id}`} className="border-b border-white/15">
                      <td className="px-4 py-3">{row.contribution_date}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{row.category_label}</span>
                          {row.is_reversal && <span className="rounded-full border border-red-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-red-200">Reversal</span>}
                          {row.reversed_by_entry_id && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-200">Offset</span>}
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${Number(row.amount) < 0 ? "text-red-200" : ""}`}>{money(row.amount)}</td>
                      <td className="px-4 py-3">{row.finance_account?.account_label ?? "-"}</td>
                      <td className="px-4 py-3">{row.recipient_indicator ?? "-"}</td>
                      <td className="px-4 py-3">{row.note ?? "-"}</td>
                    </tr>
                  ))}
                  {filteredMyRows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-4 text-center text-mist/80">No contribution records yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
              <span>Page {myPage} of {myLastPage} | Total {filteredMyRows.length}</span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" disabled={myPage <= 1} onClick={() => setMyPage((current) => Math.max(1, current - 1))}>Prev</button>
                <button type="button" className="btn-secondary" disabled={myPage >= myLastPage} onClick={() => setMyPage((current) => Math.min(myLastPage, current + 1))}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {activeSection === "members" && activeTab === "member-search" && canViewFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Find Member</h2>
          <p className="mb-3 text-sm text-mist/85">Search first, then open that member's ledger.</p>

          <div className="mb-4 rounded-md border border-white/20 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                aria-label="Search member by number or name"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setMembersPage(1);
                }}
                placeholder="Wildcard search by member no. or name"
                className="min-w-[18rem] rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
              />
              <button onClick={() => void fetchMembers()} className="btn-secondary">Search</button>
            </div>

            {!membersLoaded ? (
              <div className="mt-3 rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
                Loading members...
              </div>
            ) : (
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
                  {pagedMembers.map((member) => (
                    <tr key={member.id} className={`border-b border-white/15 ${selectedMemberId === member.id ? "bg-gold/10" : ""}`}>
                      <td className="px-4 py-3">
                        <button className="rounded-md border border-white/30 px-2 py-1 text-xs" onClick={() => { setSelectedMemberId(member.id); setActiveTab("selected-member"); }}>
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
            )}
            {membersLoaded && (
              <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {membersPage} of {membersLastPage} | Total {members.length}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={membersPage <= 1} onClick={() => setMembersPage((current) => Math.max(1, current - 1))}>Prev</button>
                  <button type="button" className="btn-secondary" disabled={membersPage >= membersLastPage} onClick={() => setMembersPage((current) => Math.min(membersLastPage, current + 1))}>Next</button>
                </div>
              </div>
            )}
          </div>

          {error && errorContext === "member-search" && (
            <p className="mb-3 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}
        </div>
      )}

      {activeSection === "members" && activeTab === "compliance" && canViewFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Compliance Check</h2>
          <p className="mb-3 text-sm text-mist/85">
            Monthly contribution is required. Use this view to find members who are missing their monthly contribution for a chosen month and project-contribution years.
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
              Show only members with missing contributions
            </label>
            <button onClick={() => void fetchCompliance()} className="btn-secondary">Check Records</button>
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
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Results Graph</p>
            <VerticalBarChart
              items={complianceGraph}
              valueFormatter={(value) => String(value)}
              emptyText="No compliance data to graph."
            />
          </div>
          {!complianceLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Click Check Records to load the results.
            </div>
          ) : (
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
                {pagedComplianceRows.map((row) => (
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
          )}
          {complianceLoaded && (
            <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
              <span>Page {compliancePage} of {complianceLastPage} | Total {complianceRows.length}</span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" disabled={compliancePage <= 1} onClick={() => setCompliancePage((current) => Math.max(1, current - 1))}>Prev</button>
                <button type="button" className="btn-secondary" disabled={compliancePage >= complianceLastPage} onClick={() => setCompliancePage((current) => Math.min(complianceLastPage, current + 1))}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === "members" && activeTab === "report-preview" && canInputFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Treasurer Report Preview</h2>
          <p className="mb-3 text-sm text-mist/85">
            This is a live report view based on saved contribution records. Use the filters, review the totals, then export or screenshot if needed.
          </p>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <select
              aria-label="Report category"
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={`report-category-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Report search"
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              placeholder="Search member, note, or recipient"
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <select
              aria-label="Report year"
              value={reportYearFilter}
              onChange={(e) => setReportYearFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Years</option>
              {complianceYearSelectOptions.map((year) => (
                <option key={`report-year-${year}`} value={String(year)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {year}
                </option>
              ))}
            </select>
            <select
              aria-label="Report month"
              value={reportMonthFilter}
              onChange={(e) => setReportMonthFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Months</option>
              {MONTH_OPTIONS.map((month) => (
                <option key={`report-month-${month.value}`} value={month.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {month.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Report from date"
              type="date"
              value={reportDateFrom}
              onChange={(e) => setReportDateFrom(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <input
              aria-label="Report to date"
              type="date"
              value={reportDateTo}
              onChange={(e) => setReportDateTo(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <input
              aria-label="Report project filter"
              value={reportProjectFilter}
              onChange={(e) => setReportProjectFilter(e.target.value)}
              placeholder="Project name contains..."
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <input
              aria-label="Report recipient filter"
              value={reportRecipientFilter}
              onChange={(e) => setReportRecipientFilter(e.target.value)}
              placeholder="Recipient contains..."
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <div className="md:col-span-3 flex gap-2">
              <button type="button" onClick={() => void fetchReportPreview(1)} className="btn-secondary">Generate View</button>
              <button
                type="button"
                onClick={() => {
                  setReportSearch("");
                  setReportYearFilter(String(new Date().getFullYear()));
                  setReportMonthFilter("");
                  setReportDateFrom("");
                  setReportDateTo("");
                  setReportProjectFilter("");
                  setReportRecipientFilter("");
                  setReportPreviewLoaded(false);
                }}
                className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          </div>

          {error && errorContext === "report-preview" && (
            <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}

          {!reportPreviewLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Click Generate View to load a screenshot-ready treasurer summary.
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-gold/20 bg-gold/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Category</p>
                  <p className="mt-2 text-lg font-semibold text-offwhite">{categoryLabel(reportCategory)}</p>
                </div>
                <div className="rounded-lg border border-gold/20 bg-gold/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Total Amount</p>
                  <p className="mt-2 text-lg font-semibold text-offwhite">{money(reportPreviewTotal)}</p>
                </div>
                <div className="rounded-lg border border-gold/20 bg-gold/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Records</p>
                  <p className="mt-2 text-lg font-semibold text-offwhite">{reportPreviewCount}</p>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Top Members By Filtered Total</p>
                <VerticalBarChart
                  items={reportPreviewGraph}
                  valueFormatter={(value) => money(value)}
                  emptyText="No data to graph for current report filters."
                />
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/20">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Member</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-4 py-3 text-left">Recipient</th>
                      <th className="px-4 py-3 text-left">Remarks</th>
                      <th className="px-4 py-3 text-left">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportPreviewRows.map((row) => (
                      <tr key={`report-preview-${row.id}`} className="border-b border-white/15">
                        <td className="px-4 py-3">{row.contribution_date}</td>
                        <td className="px-4 py-3">{row.member ? `${row.member.name} (${row.member.member_number})` : "Unknown member"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{row.category_label}</span>
                            {row.is_reversal && <span className="rounded-full border border-red-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-red-200">Reversal</span>}
                            {row.reversed_by_entry_id && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-200">Offset</span>}
                          </div>
                        </td>
                        <td className={`px-4 py-3 ${row.amount < 0 ? "text-red-200" : ""}`}>{money(row.amount)}</td>
                        <td className="px-4 py-3">{row.finance_account?.account_label ?? "-"}</td>
                        <td className="px-4 py-3">{row.recipient_indicator ?? "-"}</td>
                        <td className="px-4 py-3">{row.note ?? "-"}</td>
                        <td className="px-4 py-3">{row.encoded_by?.name ?? "System"}</td>
                      </tr>
                    ))}
                    {reportPreviewRows.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-mist/80">No contribution records match the current report filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {reportPreviewPage} of {reportPreviewLastPage} | Total {reportPreviewCount}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={reportPreviewPage <= 1 || loading} onClick={() => void fetchReportPreview(Math.max(1, reportPreviewPage - 1))}>Prev</button>
                  <button type="button" className="btn-secondary" disabled={reportPreviewPage >= reportPreviewLastPage || loading} onClick={() => void fetchReportPreview(Math.min(reportPreviewLastPage, reportPreviewPage + 1))}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeSection === "members" && activeTab === "audit-findings" && canViewFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Contribution Audit</h2>
          <p className="mb-3 text-sm text-mist/85">
            Auditor can record review notes and statuses here. Treasurer can review the same notes for follow-up. Current monthly target: <span className="font-semibold text-gold-soft">{money(auditRequiredMonthlyAmount || 500)}</span>
          </p>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <input
              aria-label="Audit month"
              type="month"
              value={auditMonth}
              onChange={(e) => setAuditMonth(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <select
              aria-label="Audit category filter"
              value={auditCategoryFilter}
              onChange={(e) => setAuditCategoryFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Categories</option>
              {CATEGORY_OPTIONS.map((item) => (
                <option key={`audit-category-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Audit member search"
              value={auditMemberSearch}
              onChange={(e) => setAuditMemberSearch(e.target.value)}
              placeholder="Search member..."
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <select
              aria-label="Audit status filter"
              value={auditStatusFilter}
              onChange={(e) => setAuditStatusFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Statuses</option>
              {Object.entries(auditStatuses).map(([value, label]) => (
                <option key={`audit-status-${value}`} value={value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{label}</option>
              ))}
            </select>
            <select
              aria-label="Audit discrepancy filter"
              value={auditDiscrepancyFilter}
              onChange={(e) => setAuditDiscrepancyFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Findings</option>
              {Object.entries(auditDiscrepancies).map(([value, label]) => (
                <option key={`audit-discrepancy-${value}`} value={value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => void fetchAuditFindings(1)} className="btn-secondary">Run</button>
              <button
                type="button"
                onClick={() => {
                  setAuditCategoryFilter("");
                  setAuditMemberSearch("");
                  setAuditStatusFilter("");
                  setAuditDiscrepancyFilter("");
                  setAuditLoaded(false);
                }}
                className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          </div>

          {error && errorContext === "report-preview" && (
            <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}

          {!auditLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Click Run to load discrepancy findings for the selected month.
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Findings Graph</p>
                <VerticalBarChart
                  items={auditGraph}
                  valueFormatter={(value) => String(value)}
                  emptyText="No discrepancy findings to graph."
                />
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/20">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Member</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Finding</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Latest Status</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((row) => {
                      const rowKey = `${row.member?.id ?? "x"}-${row.contribution_id ?? "none"}-${row.target_month}-${row.category}-${row.discrepancy_type}`;
                      return (
                        <tr key={rowKey} className="border-b border-white/15 align-top">
                          <td className="px-4 py-3">{row.member ? `${row.member.name} (${row.member.member_number})` : "Unknown member"}</td>
                          <td className="px-4 py-3">{row.category_label}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-offwhite">{row.discrepancy_label}</div>
                            <p className="mt-1 text-xs text-mist/75">{row.details}</p>
                          </td>
                          <td className="px-4 py-3">{money(row.amount)}</td>
                          <td className="px-4 py-3">
                            {row.latest_status_label ? (
                              <span className="rounded-full border border-amber-300/40 px-2 py-1 text-xs text-amber-200">{row.latest_status_label}</span>
                            ) : (
                              <span className="text-xs text-mist/70">No note yet</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              {row.notes.map((note) => (
                                <div key={note.id} className="rounded-md border border-white/15 bg-white/5 p-2">
                                  <p className="text-xs text-gold-soft">{note.status_label} by {note.created_by?.name ?? "Auditor"}</p>
                                  <p className="mt-1 text-xs text-mist/85">{note.note_text}</p>
                                </div>
                              ))}
                              {row.notes.length === 0 && <p className="text-xs text-mist/70">No notes yet.</p>}

                              {canRecordAuditNotes && (
                                <div className="rounded-md border border-white/15 bg-white/5 p-2">
                                  {auditNoteTargetKey === rowKey ? (
                                    <div className="space-y-2">
                                      <select
                                        aria-label="Audit note status"
                                        value={auditNoteStatus}
                                        onChange={(e) => setAuditNoteStatus(e.target.value)}
                                        className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                                      >
                                        {Object.entries(auditStatuses).map(([value, label]) => (
                                          <option key={`note-status-${value}`} value={value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{label}</option>
                                        ))}
                                      </select>
                                      <textarea
                                        aria-label="Audit note text"
                                        value={auditNoteText}
                                        onChange={(e) => setAuditNoteText(e.target.value)}
                                        placeholder="Record the finding, review result, or follow-up instruction."
                                        rows={3}
                                        className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                                      />
                                      <div className="flex gap-2">
                                        <button type="button" onClick={() => void submitAuditNote(row)} className="btn-secondary">Save Note</button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAuditNoteTargetKey("");
                                            setAuditNoteStatus("needs_followup");
                                            setAuditNoteText("");
                                          }}
                                          className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAuditNoteTargetKey(rowKey);
                                        setAuditNoteStatus(row.latest_status ?? "needs_followup");
                                        setAuditNoteText("");
                                      }}
                                      className="rounded-md border border-gold/40 px-3 py-1.5 text-xs text-gold hover:bg-gold/10"
                                    >
                                      Add Auditor Note
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {auditRows.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-mist/80">No findings for the current audit filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {auditPage} of {auditLastPage} | Total {auditTotal}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={auditPage <= 1 || loading} onClick={() => void fetchAuditFindings(Math.max(1, auditPage - 1))}>Prev</button>
                  <button type="button" className="btn-secondary" disabled={auditPage >= auditLastPage || loading} onClick={() => void fetchAuditFindings(Math.min(auditLastPage, auditPage + 1))}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeSection === "expenses" && activeTab === "expense-ledger" && canViewFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Expense Ledger</h2>
          <p className="mb-3 text-sm text-mist/85">
            Treasurer records expenses under each treasury account. Auditor can review the same records without changing saved entries.
          </p>

          <div className="mb-5 rounded-lg border border-white/15 bg-ink/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Review And Filter Saved Expenses</p>
            <p className="mt-2 text-sm text-mist/80">
              These controls only change the expense list below. They do not save a new expense.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Expense Category Filter</label>
                <select
                  aria-label="Expense category filter"
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                >
                  <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Expense Categories</option>
                  {EXPENSE_CATEGORY_OPTIONS.map((item) => (
                    <option key={`expense-filter-category-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Treasury Account Filter</label>
                <select
                  aria-label="Expense account filter"
                  value={expenseAccountFilter}
                  onChange={(e) => setExpenseAccountFilter(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                >
                  <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Accounts</option>
                  {financeAccounts.map((account) => (
                    <option key={`expense-filter-account-${account.id}`} value={String(account.id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                      {account.account_label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Remarks Or Reference Search</label>
                <input
                  aria-label="Expense search"
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search remarks or references"
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Payee Filter</label>
                <input
                  aria-label="Expense payee filter"
                  value={expensePayeeFilter}
                  onChange={(e) => setExpensePayeeFilter(e.target.value)}
                  placeholder="Payee contains..."
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">From Date</label>
                <input
                  aria-label="Expense from date"
                  type="date"
                  value={expenseDateFrom}
                  onChange={(e) => setExpenseDateFrom(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">To Date</label>
                <input
                  aria-label="Expense to date"
                  type="date"
                  value={expenseDateTo}
                  onChange={(e) => setExpenseDateTo(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
              <div className="md:col-span-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
                  <input type="checkbox" checked={expenseSupportOnly} onChange={(e) => setExpenseSupportOnly(e.target.checked)} />
                  Show only rows with support reference
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void fetchExpenseLedger(1)} className="btn-secondary">Apply Filters</button>
                  <button
                    type="button"
                    onClick={() => {
                      setExpenseCategoryFilter("");
                      setExpenseAccountFilter("");
                      setExpenseSearch("");
                      setExpensePayeeFilter("");
                      setExpenseDateFrom("");
                      setExpenseDateTo("");
                      setExpenseSupportOnly(false);
                      setExpenseLoaded(false);
                    }}
                    className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && errorContext === "expense-ledger" && (
            <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}

          {canInputFinance && (
            <div className="mb-4 rounded-lg border border-gold/20 bg-gold/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Record New Expense</p>
              <p className="mb-3 text-sm text-mist/90">
                Treasurer guide: every expense should point to a treasury account. If an expense was entered incorrectly, add a reversal entry instead of editing the saved record.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Expense Category</label>
                  <select
                    aria-label="Expense category"
                    value={expenseCategoryInput}
                    onChange={(e) => setExpenseCategoryInput(e.target.value)}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  >
                    {EXPENSE_CATEGORY_OPTIONS.map((item) => (
                      <option key={`expense-category-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Expense Date</label>
                  <input
                    aria-label="Expense date"
                    type="date"
                    value={expenseDateInput}
                    onChange={(e) => setExpenseDateInput(e.target.value)}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Amount</label>
                  <input
                    aria-label="Expense amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseAmountInput}
                    onChange={(e) => setExpenseAmountInput(e.target.value)}
                    placeholder="Amount"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Payee Name</label>
                  <input
                    aria-label="Expense payee name"
                    value={expensePayeeInput}
                    onChange={(e) => setExpensePayeeInput(e.target.value)}
                    placeholder="Payee name"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Treasury Account</label>
                  <select
                    aria-label="Expense treasury account"
                    value={expenseAccountId}
                    onChange={(e) => setExpenseAccountId(e.target.value)}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  >
                    <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Select Treasury Account</option>
                    {financeAccounts.map((account) => (
                      <option key={`expense-account-${account.id}`} value={String(account.id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                        {account.account_label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Beneficiary Member</label>
                  <select
                    aria-label="Related member for this expense"
                    value={expenseBeneficiaryMemberId}
                    onChange={(e) => setExpenseBeneficiaryMemberId(e.target.value)}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  >
                    <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Optional related member</option>
                    {members.map((member) => (
                      <option key={`expense-beneficiary-${member.id}`} value={String(member.id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                        {member.member_number} - {nameOf(member)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Support Reference</label>
                  <input
                    aria-label="Expense support reference"
                    value={expenseSupportReferenceInput}
                    onChange={(e) => setExpenseSupportReferenceInput(e.target.value)}
                    placeholder="Receipt, voucher, or support reference"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Approval Reference</label>
                  <input
                    aria-label="Expense approval reference"
                    value={expenseApprovalReferenceInput}
                    onChange={(e) => setExpenseApprovalReferenceInput(e.target.value)}
                    placeholder="Approval reference"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Purpose And Remarks</label>
                  <input
                    aria-label="Expense remarks"
                    value={expenseNoteInput}
                    onChange={(e) => setExpenseNoteInput(e.target.value)}
                    placeholder="Purpose and remarks"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div className="md:col-span-2 flex gap-2">
                  <button type="button" className="btn-primary" onClick={() => void createExpense()}>Save Expense</button>
                  <button
                    type="button"
                    onClick={resetExpenseForm}
                    className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {!expenseLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Click Load Expenses to review the current expense records.
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-mist/85">
                Filtered Expense Total: <span className="font-semibold text-gold-soft">{money(expenseTotal)}</span> ({expenseRecordCount} record{expenseRecordCount === 1 ? "" : "s"})
              </p>
              <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Filtered Expense Graph</p>
                <VerticalBarChart items={expenseGraph} valueFormatter={(value) => money(value)} emptyText="No expense data to graph." />
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/20">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-4 py-3 text-left">Payee</th>
                      <th className="px-4 py-3 text-left">Support</th>
                      <th className="px-4 py-3 text-left">Approval</th>
                      <th className="px-4 py-3 text-left">Remarks</th>
                      <th className="px-4 py-3 text-left">Recorded By</th>
                      {canInputFinance && <th className="px-4 py-3 text-left">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {expenseRows.map((row) => (
                      <tr key={`expense-row-${row.id}`} className="border-b border-white/15">
                        <td className="px-4 py-3">{row.expense_date}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{row.category_label}</span>
                            {row.is_reversal && <span className="rounded-full border border-red-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-red-200">Reversal</span>}
                            {row.reversed_by_entry_id && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-200">Offset</span>}
                          </div>
                        </td>
                        <td className={`px-4 py-3 ${row.amount < 0 ? "text-emerald-200" : "text-red-200"}`}>{money(row.amount)}</td>
                        <td className="px-4 py-3">{row.finance_account?.account_label ?? "-"}</td>
                        <td className="px-4 py-3">{row.payee_name ?? "-"}</td>
                        <td className="px-4 py-3">{row.support_reference ?? "-"}</td>
                        <td className="px-4 py-3">{row.approval_reference ?? "-"}</td>
                        <td className="px-4 py-3">{row.note ?? "-"}</td>
                        <td className="px-4 py-3">{row.encoded_by?.name ?? "System"}</td>
                        {canInputFinance && (
                          <td className="px-4 py-3">
                            {row.is_reversal ? (
                              <span className="text-xs text-mist/70">Locked reversal</span>
                            ) : row.reversed_by_entry_id ? (
                              <span className="text-xs text-mist/70">Already balanced by reversal</span>
                            ) : (
                              <button
                                type="button"
                                className="rounded-md border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                                onClick={() => {
                                  setReverseExpenseId(row.id);
                                  setReverseExpenseRemarks("");
                                  setReverseExpenseDate("");
                                }}
                              >
                                Reverse Expense
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {expenseRows.length === 0 && (
                      <tr><td colSpan={canInputFinance ? 10 : 9} className="px-4 py-6 text-center text-mist/80">No expense rows match the current filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {expensePage} of {expenseLastPage} | Total {expenseRecordCount}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={expensePage <= 1 || loading} onClick={() => void fetchExpenseLedger(Math.max(1, expensePage - 1))}>Prev</button>
                  <button type="button" className="btn-secondary" disabled={expensePage >= expenseLastPage || loading} onClick={() => void fetchExpenseLedger(Math.min(expenseLastPage, expensePage + 1))}>Next</button>
                </div>
              </div>
            </>
          )}

          {canInputFinance && reverseExpenseId && (
            <div className="mt-4 grid gap-3 rounded-lg border border-white/20 bg-white/10 p-4 md:grid-cols-[220px_1fr_auto]">
              <input
                aria-label="Expense reversal date"
                type="date"
                value={reverseExpenseDate}
                onChange={(e) => setReverseExpenseDate(e.target.value)}
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Expense reversal remarks"
                value={reverseExpenseRemarks}
                onChange={(e) => setReverseExpenseRemarks(e.target.value)}
                placeholder="Required remarks for the expense reversal"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => void submitExpenseReversal()}>Save Reversal</button>
                <button
                  type="button"
                  onClick={() => {
                    setReverseExpenseId(null);
                    setReverseExpenseRemarks("");
                    setReverseExpenseDate("");
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

      {activeSection === "expenses" && activeTab === "expense-audit" && canViewFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Expense Audit</h2>
          <p className="mb-3 text-sm text-mist/85">
            Auditor can record note-based findings for expense support, approval, duplicate, and reversal issues. Treasurer can review the same findings for follow-up.
          </p>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <input
              aria-label="Expense audit month"
              type="month"
              value={expenseAuditMonth}
              onChange={(e) => setExpenseAuditMonth(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <select
              aria-label="Expense audit category filter"
              value={expenseAuditCategoryFilter}
              onChange={(e) => setExpenseAuditCategoryFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Expense Categories</option>
              {EXPENSE_CATEGORY_OPTIONS.map((item) => (
                <option key={`expense-audit-category-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{item.label}</option>
              ))}
            </select>
            <select
              aria-label="Expense audit account filter"
              value={expenseAuditAccountFilter}
              onChange={(e) => setExpenseAuditAccountFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Accounts</option>
              {financeAccounts.map((account) => (
                <option key={`expense-audit-account-${account.id}`} value={String(account.id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{account.account_label}</option>
              ))}
            </select>
            <input
              aria-label="Expense audit payee filter"
              value={expenseAuditPayeeFilter}
              onChange={(e) => setExpenseAuditPayeeFilter(e.target.value)}
              placeholder="Payee contains..."
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <select
              aria-label="Expense audit status filter"
              value={expenseAuditStatusFilter}
              onChange={(e) => setExpenseAuditStatusFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Statuses</option>
              {Object.entries(expenseAuditStatuses).map(([value, label]) => (
                <option key={`expense-audit-status-${value}`} value={value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{label}</option>
              ))}
            </select>
            <select
              aria-label="Expense audit discrepancy filter"
              value={expenseAuditDiscrepancyFilter}
              onChange={(e) => setExpenseAuditDiscrepancyFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Findings</option>
              {Object.entries(expenseAuditDiscrepancies).map(([value, label]) => (
                <option key={`expense-audit-discrepancy-${value}`} value={value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => void fetchExpenseAuditFindings(1)} className="btn-secondary">Run</button>
              <button
                type="button"
                onClick={() => {
                  setExpenseAuditCategoryFilter("");
                  setExpenseAuditAccountFilter("");
                  setExpenseAuditStatusFilter("");
                  setExpenseAuditDiscrepancyFilter("");
                  setExpenseAuditPayeeFilter("");
                  setExpenseAuditLoaded(false);
                }}
                className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          </div>

          {error && errorContext === "expense-audit" && (
            <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}

          {!expenseAuditLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Click Run to load expense discrepancy findings.
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Expense Findings Graph</p>
                <VerticalBarChart items={expenseAuditGraph} valueFormatter={(value) => String(value)} emptyText="No expense findings to graph." />
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/20">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Payee</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-4 py-3 text-left">Finding</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Latest Status</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseAuditRows.map((row) => {
                      const rowKey = `${row.expense_id ?? "none"}-${row.target_month}-${row.category}-${row.discrepancy_type}`;
                      return (
                        <tr key={rowKey} className="border-b border-white/15 align-top">
                          <td className="px-4 py-3">{row.payee_name ?? "Unknown payee"}</td>
                          <td className="px-4 py-3">{row.category_label}</td>
                          <td className="px-4 py-3">{row.finance_account?.account_label ?? "-"}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-offwhite">{row.discrepancy_label}</div>
                            <p className="mt-1 text-xs text-mist/75">{row.details}</p>
                          </td>
                          <td className="px-4 py-3">{money(row.amount)}</td>
                          <td className="px-4 py-3">
                            {row.latest_status_label ? (
                              <span className="rounded-full border border-amber-300/40 px-2 py-1 text-xs text-amber-200">{row.latest_status_label}</span>
                            ) : (
                              <span className="text-xs text-mist/70">No note yet</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              {row.notes.map((note) => (
                                <div key={note.id} className="rounded-md border border-white/15 bg-white/5 p-2">
                                  <p className="text-xs text-gold-soft">{note.status_label} by {note.created_by?.name ?? "Auditor"}</p>
                                  <p className="mt-1 text-xs text-mist/85">{note.note_text}</p>
                                </div>
                              ))}
                              {row.notes.length === 0 && <p className="text-xs text-mist/70">No notes yet.</p>}
                              {canRecordAuditNotes && (
                                <div className="rounded-md border border-white/15 bg-white/5 p-2">
                                  {expenseAuditNoteTargetKey === rowKey ? (
                                    <div className="space-y-2">
                                      <select
                                        aria-label="Expense audit note status"
                                        value={expenseAuditNoteStatus}
                                        onChange={(e) => setExpenseAuditNoteStatus(e.target.value)}
                                        className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                                      >
                                        {Object.entries(expenseAuditStatuses).map(([value, label]) => (
                                          <option key={`expense-note-status-${value}`} value={value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{label}</option>
                                        ))}
                                      </select>
                                      <textarea
                                        aria-label="Expense audit note text"
                                        value={expenseAuditNoteText}
                                        onChange={(e) => setExpenseAuditNoteText(e.target.value)}
                                        placeholder="Record the expense finding, evidence gap, or follow-up action."
                                        rows={3}
                                        className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                                      />
                                      <div className="flex gap-2">
                                        <button type="button" onClick={() => void submitExpenseAuditNote(row)} className="btn-secondary">Save Note</button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setExpenseAuditNoteTargetKey("");
                                            setExpenseAuditNoteStatus("needs_followup");
                                            setExpenseAuditNoteText("");
                                          }}
                                          className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpenseAuditNoteTargetKey(rowKey);
                                        setExpenseAuditNoteStatus(row.latest_status ?? "needs_followup");
                                        setExpenseAuditNoteText("");
                                      }}
                                      className="rounded-md border border-gold/40 px-3 py-1.5 text-xs text-gold hover:bg-gold/10"
                                    >
                                      Add Auditor Note
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {expenseAuditRows.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-mist/80">No expense findings for the current filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {expenseAuditPage} of {expenseAuditLastPage} | Total {expenseAuditTotal}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={expenseAuditPage <= 1 || loading} onClick={() => void fetchExpenseAuditFindings(Math.max(1, expenseAuditPage - 1))}>Prev</button>
                  <button type="button" className="btn-secondary" disabled={expenseAuditPage >= expenseAuditLastPage || loading} onClick={() => void fetchExpenseAuditFindings(Math.min(expenseAuditLastPage, expenseAuditPage + 1))}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeSection === "expenses" && activeTab === "expense-report" && canInputFinance && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Treasurer Expense Report Preview</h2>
          <p className="mb-3 text-sm text-mist/85">
            This is a live, unsaved reporting view for expenses by account, payee, and category. Review the filtered total, then share externally by screenshot if needed.
          </p>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <select
              aria-label="Expense report category"
              value={expenseReportCategoryFilter}
              onChange={(e) => setExpenseReportCategoryFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Expense Categories</option>
              {EXPENSE_CATEGORY_OPTIONS.map((item) => (
                <option key={`expense-report-category-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{item.label}</option>
              ))}
            </select>
            <select
              aria-label="Expense report account"
              value={expenseReportAccountFilter}
              onChange={(e) => setExpenseReportAccountFilter(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Accounts</option>
              {financeAccounts.map((account) => (
                <option key={`expense-report-account-${account.id}`} value={String(account.id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>{account.account_label}</option>
              ))}
            </select>
            <input
              aria-label="Expense report search"
              value={expenseReportSearch}
              onChange={(e) => setExpenseReportSearch(e.target.value)}
              placeholder="Search remarks, support, or approval"
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <input
              aria-label="Expense report payee filter"
              value={expenseReportPayeeFilter}
              onChange={(e) => setExpenseReportPayeeFilter(e.target.value)}
              placeholder="Payee contains..."
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <input
              aria-label="Expense report from date"
              type="date"
              value={expenseReportDateFrom}
              onChange={(e) => setExpenseReportDateFrom(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <input
              aria-label="Expense report to date"
              type="date"
              value={expenseReportDateTo}
              onChange={(e) => setExpenseReportDateTo(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
            />
            <div className="md:col-span-3 flex gap-2">
              <button type="button" onClick={() => void fetchExpenseReportPreview(1)} className="btn-secondary">Generate View</button>
              <button
                type="button"
                onClick={() => {
                  setExpenseReportCategoryFilter("");
                  setExpenseReportAccountFilter("");
                  setExpenseReportSearch("");
                  setExpenseReportPayeeFilter("");
                  setExpenseReportDateFrom("");
                  setExpenseReportDateTo("");
                  setExpenseReportLoaded(false);
                }}
                className="rounded-md border border-white/30 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          </div>

          {error && errorContext === "expense-report" && (
            <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>
          )}

          {!expenseReportLoaded ? (
            <div className="rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
              Click Generate View to load a screenshot-ready expense summary.
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-gold/20 bg-gold/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Expense Total</p>
                  <p className="mt-2 text-lg font-semibold text-offwhite">{money(expenseReportTotal)}</p>
                </div>
                <div className="rounded-lg border border-gold/20 bg-gold/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Records</p>
                  <p className="mt-2 text-lg font-semibold text-offwhite">{expenseReportCount}</p>
                </div>
                <div className="rounded-lg border border-gold/20 bg-gold/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Primary Account</p>
                  <p className="mt-2 text-lg font-semibold text-offwhite">
                    {financeAccounts.find((account) => String(account.id) === expenseReportAccountFilter)?.account_label ?? "Mixed"}
                  </p>
                </div>
              </div>
              <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-gold-soft">Top Payees By Filtered Total</p>
                <VerticalBarChart items={expenseReportGraph} valueFormatter={(value) => money(value)} emptyText="No expense data to graph for current filters." />
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/20">
                <table className="min-w-full text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Account</th>
                      <th className="px-4 py-3 text-left">Payee</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Support</th>
                      <th className="px-4 py-3 text-left">Approval</th>
                      <th className="px-4 py-3 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseReportRows.map((row) => (
                      <tr key={`expense-report-${row.id}`} className="border-b border-white/15">
                        <td className="px-4 py-3">{row.expense_date}</td>
                        <td className="px-4 py-3">{row.category_label}</td>
                        <td className="px-4 py-3">{row.finance_account?.account_label ?? "-"}</td>
                        <td className="px-4 py-3">{row.payee_name ?? "-"}</td>
                        <td className={`px-4 py-3 ${row.amount < 0 ? "text-emerald-200" : "text-red-200"}`}>{money(row.amount)}</td>
                        <td className="px-4 py-3">{row.support_reference ?? "-"}</td>
                        <td className="px-4 py-3">{row.approval_reference ?? "-"}</td>
                        <td className="px-4 py-3">{row.note ?? "-"}</td>
                      </tr>
                    ))}
                    {expenseReportRows.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-mist/80">No expense rows match the current report filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
                <span>Page {expenseReportPage} of {expenseReportLastPage} | Total {expenseReportCount}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" disabled={expenseReportPage <= 1 || loading} onClick={() => void fetchExpenseReportPreview(Math.max(1, expenseReportPage - 1))}>Prev</button>
                  <button type="button" className="btn-secondary" disabled={expenseReportPage >= expenseReportLastPage || loading} onClick={() => void fetchExpenseReportPreview(Math.min(expenseReportLastPage, expenseReportPage + 1))}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeSection === "members" && activeTab === "selected-member" && canViewFinance && selectedMember && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Selected: {nameOf(selectedMember)}</h2>
          <p className="mb-4 text-sm text-mist/85">
            Total Contributions: <span className="font-semibold text-gold-soft">{money(totalAmount)}</span>
          </p>
          {canInputFinance && (
            <div className="mb-4 rounded-lg border border-gold/20 bg-gold/10 p-4 text-sm text-mist/90">
              Treasurer guide: once saved, a contribution record should not be edited. If the amount or details were entered incorrectly, use <span className="font-semibold text-gold-soft">Reverse Entry</span> with a required note so the original record stays visible and the total is corrected.
            </div>
          )}
          <div className="mb-5 rounded-lg border border-white/15 bg-ink/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Review And Filter Saved Contributions</p>
            <p className="mt-2 text-sm text-mist/80">
              These controls only change the contribution history and graph for the selected member.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Contribution Type Filter</label>
                <select
                  aria-label="Filter selected member contributions by type"
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                >
                  <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Types</option>
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={`sel-cat-${item.value}`} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Year Filter</label>
                <select
                  aria-label="Filter selected member contributions by year"
                  value={selectedYearFilter}
                  onChange={(e) => setSelectedYearFilter(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                >
                  <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Years</option>
                  {selectedYearOptions.map((year) => (
                    <option key={`sel-year-${year}`} value={year} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Month Filter</label>
                <select
                  aria-label="Filter selected member contributions by month"
                  value={selectedMonthFilter}
                  onChange={(e) => setSelectedMonthFilter(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                >
                  <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All Months</option>
                  {MONTH_OPTIONS.map((month) => (
                    <option key={`sel-month-${month.value}`} value={month.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Project Name Filter</label>
                <input
                  aria-label="Filter selected member project contributions by project name"
                  value={selectedProjectFilter}
                  onChange={(e) => setSelectedProjectFilter(e.target.value)}
                  placeholder="Project name contains..."
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Recipient Filter</label>
                <input
                  aria-label="Filter selected member alalayang contributions by recipient"
                  value={selectedRecipientFilter}
                  onChange={(e) => setSelectedRecipientFilter(e.target.value)}
                  placeholder="Alalayang recipient contains..."
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">From Date</label>
                <input
                  aria-label="Filter selected member contributions from date"
                  type="date"
                  value={selectedDateFromFilter}
                  onChange={(e) => setSelectedDateFromFilter(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">To Date</label>
                <input
                  aria-label="Filter selected member contributions to date"
                  type="date"
                  value={selectedDateToFilter}
                  onChange={(e) => setSelectedDateToFilter(e.target.value)}
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                />
              </div>
            </div>
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
            <div className="mb-4 rounded-lg border border-gold/20 bg-gold/10 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">Record New Contribution For Selected Member</p>
              <p className="mt-2 text-sm text-mist/90">
                Use this form to save a new contribution record for <span className="font-semibold text-offwhite">{nameOf(selectedMember)}</span>. This area adds data; it does not filter the history above.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Contribution Type</label>
                  <select
                    aria-label="Contribution category"
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  >
                    {CATEGORY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Contribution Date</label>
                  <input
                    aria-label="Contribution date"
                    value={contributionDateInput}
                    onChange={(e) => setContributionDateInput(e.target.value)}
                    type="date"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Amount</label>
                  <input
                    aria-label="Contribution amount"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="Amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Treasury Account</label>
                  <select
                    aria-label="Contribution account"
                    value={contributionAccountId}
                    onChange={(e) => setContributionAccountId(e.target.value)}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  >
                    <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Select Treasury Account</option>
                    {financeAccounts.map((account) => (
                      <option key={`contribution-account-${account.id}`} value={String(account.id)} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                        {account.account_label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Recipient Name</label>
                  <input
                    aria-label="Contribution recipient name"
                    value={recipientIndicatorInput}
                    onChange={(e) => setRecipientIndicatorInput(e.target.value)}
                    placeholder="Required for Alalayang Agila"
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
                <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-mist/80">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-soft">What To Write In Notes</span>
                  <span className="mt-1 block">{contributionRemarksHint}</span>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-mist/75">Remarks</label>
                  <input
                    aria-label="Contribution remarks"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder={contributionRemarksLabel}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
                  />
                </div>
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
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-white/20">
            <table className="min-w-full text-sm text-offwhite">
              <thead className="bg-navy/70 text-gold-soft">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Account</th>
                  <th className="px-4 py-3 text-left">Recipient</th>
                  <th className="px-4 py-3 text-left">Remarks</th>
                  <th className="px-4 py-3 text-left">Recorded By</th>
                  {canInputFinance && <th className="px-4 py-3 text-left">Action</th>}
                </tr>
              </thead>
              <tbody>
                {pagedSelectedRows.map((row) => (
                  <tr key={row.id} className="border-b border-white/15">
                    <td className="px-4 py-3">{row.contribution_date}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.category_label}</span>
                        {row.is_reversal && <span className="rounded-full border border-red-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-red-200">Reversal</span>}
                        {row.reversed_by_entry_id && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-200">Offset</span>}
                      </div>
                    </td>
                    <td className={`px-4 py-3 ${Number(row.amount) < 0 ? "text-red-200" : ""}`}>{money(row.amount)}</td>
                    <td className="px-4 py-3">{row.finance_account?.account_label ?? "-"}</td>
                    <td className="px-4 py-3">{row.recipient_indicator ?? "-"}</td>
                    <td className="px-4 py-3">{row.note ?? "-"}</td>
                    <td className="px-4 py-3">{row.encoded_by?.name ?? "System"}</td>
                    {canInputFinance && (
                      <td className="px-4 py-3">
                        {row.is_reversal ? (
                          <span className="text-xs text-mist/70">Locked reversal</span>
                        ) : row.reversed_by_entry_id ? (
                          <span className="text-xs text-mist/70">Already balanced by reversal</span>
                        ) : (
                          <button
                            className="rounded-md border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                            onClick={() => {
                              setReverseContributionId(row.id);
                              setReverseRemarks("");
                              setReverseDate("");
                            }}
                          >
                            Reverse Entry
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {filteredSelectedRows.length === 0 && (
                  <tr><td colSpan={canInputFinance ? 8 : 7} className="px-4 py-6 text-center text-mist/80">No contributions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
            <span>Page {selectedPage} of {selectedLastPage} | Total {filteredSelectedRows.length}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={selectedPage <= 1} onClick={() => setSelectedPage((current) => Math.max(1, current - 1))}>Prev</button>
              <button type="button" className="btn-secondary" disabled={selectedPage >= selectedLastPage} onClick={() => setSelectedPage((current) => Math.min(selectedLastPage, current + 1))}>Next</button>
            </div>
          </div>

          {canInputFinance && reverseContributionId && (
            <div className="mt-4 grid gap-3 rounded-lg border border-white/20 bg-white/10 p-4 md:grid-cols-[220px_1fr_auto]">
              <input
                aria-label="Reversal date"
                value={reverseDate}
                onChange={(e) => setReverseDate(e.target.value)}
                type="date"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <input
                aria-label="Reversal remarks"
                value={reverseRemarks}
                onChange={(e) => setReverseRemarks(e.target.value)}
                placeholder="Required remarks for the reversal"
                className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite"
              />
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => void submitReversal()}>Save Reversal</button>
                <button
                  type="button"
                  onClick={() => {
                    setReverseContributionId(null);
                    setReverseRemarks("");
                    setReverseDate("");
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

      {activeSection === "members" && activeTab === "selected-member" && canViewFinance && !selectedMember && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 px-4 py-8 text-center text-sm text-mist/80">
          Select a member from the Find Member tab first.
        </div>
      )}
    </section>
  );
}
