import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";
import { hasPermission, isAdminUser } from "../utils/auth";

type DashboardSummary = {
  live_visitors: number;
  live_authenticated_visitors: number;
  today_page_views: number;
  today_unique_visitors: number;
  window_days: number;
  window_page_views: number;
  window_unique_visitors: number;
};

type VisitorUser = {
  id: number;
  name: string;
  email: string;
  role: string | null;
};

type LiveSession = {
  id: number;
  visitor_token: string;
  session_token: string;
  user_id: number | null;
  is_authenticated: boolean;
  current_page_path: string | null;
  current_page_title: string | null;
  referrer: string | null;
  timezone: string | null;
  screen_width: number | null;
  screen_height: number | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  total_page_views: number;
  user: VisitorUser | null;
};

type AuthenticatedUserPresence = {
  user_id: number;
  name: string;
  email: string;
  role: string | null;
  last_page_path: string | null;
  last_page_title: string | null;
  last_seen_at: string | null;
  open_sessions: number;
};

type TopPage = {
  path: string;
  views: number;
  unique_visitors: number;
  last_viewed_at: string | null;
};

type RecentActivity = {
  id: number;
  path: string;
  page_title: string | null;
  referrer: string | null;
  viewed_at: string | null;
  visitor_token: string;
  session_token: string | null;
  is_authenticated: boolean;
  user: VisitorUser | null;
};

type OverviewResponse = {
  summary: DashboardSummary;
  live_sessions: LiveSession[];
  live_authenticated_users: AuthenticatedUserPresence[];
  top_pages: TopPage[];
  recent_activity: RecentActivity[];
  meta: {
    generated_at: string;
    live_window_minutes: number;
  };
};

function parseError(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const payload = error.response?.data as { message?: string } | undefined;
  return payload?.message || fallback;
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleString();
}

function formatRelative(value: string | null): string {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function shortToken(value: string): string {
  return value.length <= 10 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="rounded-2xl border border-white/12 bg-white/6 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur">
      <p className="text-xs uppercase tracking-[0.24em] text-mist/65">{label}</p>
      <p className="mt-3 font-heading text-3xl text-offwhite">{value}</p>
      <p className="mt-2 text-sm text-mist/80">{hint}</p>
    </article>
  );
}

export default function Visitors() {
  const { user } = useAuth();
  const canViewVisitors = isAdminUser(user) || hasPermission(user, "users.view");
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [windowDays, setWindowDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async (isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await api.get<OverviewResponse>("/admin/visitors/overview", {
        params: { window_days: windowDays, _t: Date.now() },
      });
      setOverview(response.data);
    } catch (loadError) {
      setError(parseError(loadError, "Unable to load visitor analytics."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [windowDays]);

  useEffect(() => {
    if (!canViewVisitors) return;
    void loadOverview();
  }, [canViewVisitors, loadOverview]);

  useEffect(() => {
    if (!canViewVisitors) return;

    const intervalId = window.setInterval(() => {
      void loadOverview(true);
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canViewVisitors, loadOverview]);

  const summaryCards = useMemo(() => {
    if (!overview) return [];

    return [
      { label: "Live Visitors", value: overview.summary.live_visitors, hint: `Seen in the last ${overview.meta.live_window_minutes} minutes.` },
      { label: "Live Members", value: overview.summary.live_authenticated_visitors, hint: "Authenticated users currently active." },
      { label: "Today Views", value: overview.summary.today_page_views, hint: "All page views recorded today." },
      { label: "Today Unique", value: overview.summary.today_unique_visitors, hint: "Distinct visitor tokens today." },
      { label: `${overview.summary.window_days}-Day Views`, value: overview.summary.window_page_views, hint: "Rolling page view volume." },
      { label: `${overview.summary.window_days}-Day Unique`, value: overview.summary.window_unique_visitors, hint: "Distinct visitors in the selected window." },
    ];
  }, [overview]);

  if (!canViewVisitors) {
    return (
      <section>
        <h1 className="mb-3 font-heading text-4xl text-offwhite">Visitors</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to view visitor analytics.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-white/12 bg-[linear-gradient(135deg,rgba(10,23,48,0.9),rgba(9,40,80,0.74))] p-6 shadow-[0_28px_80px_rgba(15,23,42,0.35)] md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-soft/80">Visitor Analytics</p>
          <h1 className="mt-3 font-heading text-4xl text-offwhite">Website traffic, live presence, and recent activity</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-mist/85">
            This dashboard combines anonymous website visits, live visitor count, authenticated user presence, and recent page activity captured directly from the React app.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-mist/80" htmlFor="visitor-window">
            Reporting window
          </label>
          <select
            id="visitor-window"
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value))}
            className="rounded-xl border border-white/15 bg-ink/80 px-3 py-2 text-sm text-offwhite focus:border-gold focus:outline-none"
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="rounded-xl border border-gold/45 bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-105"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p> : null}

      {loading && !overview ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-10 text-sm text-mist/80">
          Loading visitor analytics...
        </div>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-3xl border border-white/12 bg-white/6 p-5 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-2xl text-offwhite">Live Visitors</h2>
                  <p className="mt-1 text-sm text-mist/75">Current sessions and the page each visitor is actively viewing.</p>
                </div>
                <p className="text-xs uppercase tracking-[0.24em] text-mist/55">
                  Updated {formatRelative(overview.meta.generated_at)}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-mist/85">
                  <thead className="text-xs uppercase tracking-[0.22em] text-mist/55">
                    <tr>
                      <th className="pb-3 pr-4">Visitor</th>
                      <th className="pb-3 pr-4">Current Page</th>
                      <th className="pb-3 pr-4">Seen</th>
                      <th className="pb-3 pr-4">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.live_sessions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-mist/65">No live visitors right now.</td>
                      </tr>
                    ) : overview.live_sessions.map((session) => (
                      <tr key={session.id} className="border-t border-white/8 align-top">
                        <td className="py-4 pr-4">
                          <p className="font-semibold text-offwhite">
                            {session.user ? session.user.name : `Anonymous ${shortToken(session.visitor_token)}`}
                          </p>
                          <p className="mt-1 text-xs text-mist/65">
                            {session.user ? `${session.user.email} · ${session.user.role ?? "user"}` : session.timezone || "Unknown timezone"}
                          </p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className="font-medium text-offwhite">{session.current_page_title || session.current_page_path || "Unknown page"}</p>
                          <p className="mt-1 break-all text-xs text-mist/65">{session.current_page_path || "N/A"}</p>
                        </td>
                        <td className="py-4 pr-4">
                          <p>{formatRelative(session.last_seen_at)}</p>
                          <p className="mt-1 text-xs text-mist/65">Started {formatDateTime(session.first_seen_at)}</p>
                        </td>
                        <td className="py-4 pr-4">{session.total_page_views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-white/12 bg-white/6 p-5 backdrop-blur">
              <h2 className="font-heading text-2xl text-offwhite">Authenticated Presence</h2>
              <p className="mt-1 text-sm text-mist/75">Signed-in users who are currently active in the portal or website.</p>

              <div className="mt-4 space-y-3">
                {overview.live_authenticated_users.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-ink/50 px-4 py-4 text-sm text-mist/70">
                    No authenticated users are currently live.
                  </p>
                ) : overview.live_authenticated_users.map((entry) => (
                  <article key={entry.user_id} className="rounded-2xl border border-white/10 bg-ink/45 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-offwhite">{entry.name}</p>
                        <p className="mt-1 text-xs text-mist/65">{entry.email} · {entry.role ?? "user"}</p>
                      </div>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
                        {entry.open_sessions} live session{entry.open_sessions === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-mist/85">{entry.last_page_title || entry.last_page_path || "Unknown page"}</p>
                    <p className="mt-1 break-all text-xs text-mist/60">{entry.last_page_path || "N/A"}</p>
                    <p className="mt-3 text-xs text-mist/60">Last seen {formatRelative(entry.last_seen_at)}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-3xl border border-white/12 bg-white/6 p-5 backdrop-blur">
              <h2 className="font-heading text-2xl text-offwhite">Top Pages</h2>
              <p className="mt-1 text-sm text-mist/75">Most-viewed routes across the selected reporting window.</p>

              <div className="mt-4 space-y-3">
                {overview.top_pages.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-ink/50 px-4 py-4 text-sm text-mist/70">
                    No tracked page views yet.
                  </p>
                ) : overview.top_pages.map((page) => (
                  <article key={page.path} className="rounded-2xl border border-white/10 bg-ink/45 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <p className="break-all font-medium text-offwhite">{page.path}</p>
                      <p className="text-right text-sm text-gold-soft">
                        {page.views} view{page.views === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-mist/65">
                      {page.unique_visitors} unique visitor{page.unique_visitors === 1 ? "" : "s"} · last viewed {formatDateTime(page.last_viewed_at)}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/12 bg-white/6 p-5 backdrop-blur">
              <h2 className="font-heading text-2xl text-offwhite">Recent Activity</h2>
              <p className="mt-1 text-sm text-mist/75">Latest page views captured from the website and portal.</p>

              <div className="mt-4 space-y-3">
                {overview.recent_activity.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-ink/50 px-4 py-4 text-sm text-mist/70">
                    No recent activity has been tracked yet.
                  </p>
                ) : overview.recent_activity.map((activity) => (
                  <article key={activity.id} className="rounded-2xl border border-white/10 bg-ink/45 px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-offwhite">{activity.page_title || activity.path}</p>
                        <p className="mt-1 break-all text-xs text-mist/60">{activity.path}</p>
                      </div>
                      <p className="shrink-0 text-xs text-mist/60">{formatDateTime(activity.viewed_at)}</p>
                    </div>
                    <p className="mt-3 text-sm text-mist/80">
                      {activity.user
                        ? `${activity.user.name} (${activity.user.role ?? "user"})`
                        : `Anonymous ${shortToken(activity.visitor_token)}`}
                    </p>
                    {activity.referrer ? <p className="mt-1 break-all text-xs text-mist/60">Referrer: {activity.referrer}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
