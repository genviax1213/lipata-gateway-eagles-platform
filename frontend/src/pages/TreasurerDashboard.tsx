import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";

interface TreasurerDashboardPayload {
  generated_at: string;
  contributions: {
    summary: {
      today: { count: number; total_amount: number };
      month: { count: number; total_amount: number };
      year: { count: number; total_amount: number };
    };
    category_totals: Record<string, number>;
  };
  application_fees: {
    required_total: number;
    paid_total: number;
    balance_total: number;
    active_applicant_count: number;
    with_balance_count: number;
    applicants: Array<{
      id: number;
      full_name: string;
      email: string;
      status: string;
      decision_status: string;
      required_total: number;
      paid_total: number;
      balance: number;
    }>;
  };
}

function money(value: number | string): string {
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function labelize(input: string): string {
  return input
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
}

export default function TreasurerDashboard() {
  const { user } = useAuth();
  const canSetFee = hasPermission(user, "applications.fee.set");
  const canPayFee = hasPermission(user, "applications.fee.pay");
  const canView = canSetFee || canPayFee;

  const [payload, setPayload] = useState<TreasurerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const parseError = (err: unknown, fallback: string): string => {
    if (!axios.isAxiosError(err)) return fallback;
    const message = (err.response?.data as { message?: string } | undefined)?.message;
    return message ?? fallback;
  };

  const loadDashboard = useCallback(async () => {
    if (!canView) return;

    setLoading(true);
    setError("");
    try {
      const res = await api.get<TreasurerDashboardPayload>("/dashboard/treasurer");
      setPayload(res.data);
    } catch (err) {
      setError(parseError(err, "Unable to load treasurer dashboard."));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const categoryRows = useMemo(() => {
    if (!payload) return [];
    return Object.entries(payload.contributions.category_totals).sort((a, b) => b[1] - a[1]);
  }, [payload]);

  if (!canView) {
    return (
      <section>
        <h1 className="mb-2 font-heading text-4xl text-offwhite">Treasurer Dashboard</h1>
        <p className="rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">
          You do not have treasurer permissions for this dashboard.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">Treasurer Dashboard</h1>
      <p className="mb-6 text-sm text-mist/85">Contribution and applicant-fee overview for treasurer operations.</p>

      {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {loading && <p className="mb-4 text-sm text-mist/80">Loading dashboard...</p>}

      {payload && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-mist/70">Today</p>
              <p className="font-heading text-2xl text-offwhite">{money(payload.contributions.summary.today.total_amount)}</p>
              <p className="text-sm text-mist/85">{payload.contributions.summary.today.count} entries</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-mist/70">This Month</p>
              <p className="font-heading text-2xl text-offwhite">{money(payload.contributions.summary.month.total_amount)}</p>
              <p className="text-sm text-mist/85">{payload.contributions.summary.month.count} entries</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-mist/70">This Year</p>
              <p className="font-heading text-2xl text-offwhite">{money(payload.contributions.summary.year.total_amount)}</p>
              <p className="text-sm text-mist/85">{payload.contributions.summary.year.count} entries</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-3 font-heading text-2xl text-offwhite">Contribution Categories</h2>
            <div className="overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map(([category, total]) => (
                    <tr key={category} className="border-b border-white/15">
                      <td className="px-3 py-2">{labelize(category)}</td>
                      <td className="px-3 py-2">{money(total)}</td>
                    </tr>
                  ))}
                  {categoryRows.length === 0 && <tr><td colSpan={2} className="px-3 py-3 text-center text-mist/70">No contribution records yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-mist/70">Applicant Required Fees</p>
              <p className="font-heading text-2xl text-offwhite">{money(payload.application_fees.required_total)}</p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-mist/70">Applicant Balance</p>
              <p className="font-heading text-2xl text-gold-soft">{money(payload.application_fees.balance_total)}</p>
              <p className="text-sm text-mist/85">
                {payload.application_fees.with_balance_count} with balance out of {payload.application_fees.active_applicant_count} active applicants
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/10 p-4">
            <h2 className="mb-3 font-heading text-2xl text-offwhite">Applicant Fee Tracking</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              <Link to="/portal" className="rounded-md border border-gold/50 px-3 py-1 text-sm text-gold transition hover:bg-gold/10">
                Open Committee Panel
              </Link>
              <Link to="/portal/contributions" className="rounded-md border border-white/30 px-3 py-1 text-sm text-offwhite transition hover:bg-white/10">
                Open Contribution Encoder
              </Link>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/20">
              <table className="min-w-full text-sm text-offwhite">
                <thead className="bg-navy/70 text-gold-soft">
                  <tr>
                    <th className="px-3 py-2 text-left">Applicant</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Required</th>
                    <th className="px-3 py-2 text-left">Paid</th>
                    <th className="px-3 py-2 text-left">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.application_fees.applicants.map((applicant) => (
                    <tr key={applicant.id} className="border-b border-white/15">
                      <td className="px-3 py-2">
                        <p>{applicant.full_name}</p>
                        <p className="text-xs text-mist/70">{applicant.email}</p>
                      </td>
                      <td className="px-3 py-2">{applicant.status} / {applicant.decision_status}</td>
                      <td className="px-3 py-2">{money(applicant.required_total)}</td>
                      <td className="px-3 py-2">{money(applicant.paid_total)}</td>
                      <td className={`px-3 py-2 ${applicant.balance > 0 ? "text-gold-soft" : "text-mist/85"}`}>
                        {money(applicant.balance)}
                      </td>
                    </tr>
                  ))}
                  {payload.application_fees.applicants.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-center text-mist/70">No applicant fee records yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-mist/70">
            Snapshot generated at {new Date(payload.generated_at).toLocaleString()}.
          </p>
        </div>
      )}
    </section>
  );
}
