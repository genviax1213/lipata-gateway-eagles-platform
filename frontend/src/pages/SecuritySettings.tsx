import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "../services/api";
import { shouldUseLegacyTokenMode } from "../services/api";
import PasswordField from "../components/PasswordField";

type SecurityTab = "password" | "policy" | "sessions";
const SECURITY_PAGE_SIZE = 5;

function parseError(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  const payload = err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
  const firstFieldError = payload?.errors ? Object.values(payload.errors).flat()[0] : "";
  return firstFieldError || payload?.message || fallback;
}

export default function SecuritySettings() {
  const [activeTab, setActiveTab] = useState<SecurityTab>("password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [revokingTokenId, setRevokingTokenId] = useState<number | null>(null);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessions, setSessions] = useState<{
    active_token_id: number | null;
    active_session_id: string | null;
    last_activity_at: string | null;
    tokens: Array<{
      id: number | null;
      name: string;
      created_at: string | null;
      last_used_at: string | null;
      is_current: boolean;
      session_id: string | null;
      kind: "token" | "browser_session";
    }>;
  }>({
    active_token_id: null,
    active_session_id: null,
    last_activity_at: null,
    tokens: [],
  });

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const res = await api.get<{
        active_token_id: number | null;
        active_session_id: string | null;
        last_activity_at: string | null;
        tokens: Array<{
          id: number | null;
          name: string;
          created_at: string | null;
          last_used_at: string | null;
          is_current: boolean;
          session_id: string | null;
          kind: "token" | "browser_session";
        }>;
      }>("/auth/sessions");
      setSessions(res.data);
      setSessionsLoaded(true);
    } catch (err) {
      setSessionsError(parseError(err, "Unable to load active sessions."));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await api.post<{ message: string; token?: string }>("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: newPasswordConfirmation,
      });

      if (shouldUseLegacyTokenMode() && typeof res.data?.token === "string" && res.data.token.length > 0) {
        localStorage.setItem("auth_token", res.data.token);
      }

      setNotice(res.data?.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
      if (sessionsLoaded) {
        void loadSessions();
      }
    } catch (err) {
      setError(parseError(err, "Unable to update password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (tokenId: number) => {
    setRevokingTokenId(tokenId);
    setSessionsError("");
    try {
      await api.delete(`/auth/sessions/${tokenId}`);
      await loadSessions();
    } catch (err) {
      setSessionsError(parseError(err, "Unable to revoke selected session."));
    } finally {
      setRevokingTokenId(null);
    }
  };

  const pagedSessions = useCallback(() => {
    const start = (sessionsPage - 1) * SECURITY_PAGE_SIZE;
    return sessions.tokens.slice(start, start + SECURITY_PAGE_SIZE);
  }, [sessions.tokens, sessionsPage]);
  const sessionsLastPage = Math.max(1, Math.ceil(sessions.tokens.length / SECURITY_PAGE_SIZE));

  useEffect(() => {
    if (activeTab !== "sessions" || sessionsLoaded || sessionsLoading) return;
    void loadSessions();
  }, [activeTab, loadSessions, sessionsLoaded, sessionsLoading]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl text-offwhite">Security Settings</h1>
        <p className="mt-2 text-sm text-mist/80">
          Manage your account password. For safety, changing password signs out other active sessions.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setActiveTab("password")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "password" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Password</button>
        <button type="button" onClick={() => setActiveTab("policy")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "policy" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Policy</button>
        <button type="button" onClick={() => setActiveTab("sessions")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "sessions" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Sessions</button>
      </div>

      {activeTab === "password" && (
      <div className="glass-card max-w-2xl p-6">
        <h2 className="text-base font-semibold text-offwhite">Change Password</h2>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-mist/90">
            Current password
            <PasswordField
              className="mt-1 w-full rounded-md border border-white/15 bg-[#0b1222]/60 px-3 py-2 pr-12 text-offwhite outline-none ring-gold/40 focus:ring"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="block text-sm text-mist/90">
            New password
            <PasswordField
              className="mt-1 w-full rounded-md border border-white/15 bg-[#0b1222]/60 px-3 py-2 pr-12 text-offwhite outline-none ring-gold/40 focus:ring"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="block text-sm text-mist/90">
            Confirm new password
            <PasswordField
              className="mt-1 w-full rounded-md border border-white/15 bg-[#0b1222]/60 px-3 py-2 pr-12 text-offwhite outline-none ring-gold/40 focus:ring"
              value={newPasswordConfirmation}
              onChange={setNewPasswordConfirmation}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
          ) : null}
          {notice ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{notice}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-[#0b1b34] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
      )}

      {activeTab === "policy" && (
      <div className="glass-card max-w-2xl p-6">
        <h2 className="text-base font-semibold text-offwhite">Session Security</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-mist/85">
          <li>Admin and superadmin sessions are automatically signed out after 10 minutes of inactivity.</li>
          <li>Finance treasurer and auditor sessions are automatically signed out after 30 minutes of inactivity.</li>
          <li>Only one active session is allowed per account across devices/browsers.</li>
          <li>When a new login succeeds, previous sessions are ended with a notice.</li>
        </ul>
      </div>
      )}

      {activeTab === "sessions" && (
      <div className="glass-card max-w-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-offwhite">Active Devices / Sessions</h2>
          <button
            type="button"
            onClick={() => {
              setSessionsPage(1);
              void loadSessions();
            }}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-offwhite/90 transition hover:bg-white/10"
            disabled={sessionsLoading}
          >
            {sessionsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {sessionsError ? (
          <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{sessionsError}</p>
        ) : null}

        {!sessionsLoaded && sessionsLoading ? (
          <div className="mt-4 rounded-md border border-white/20 bg-white/5 px-4 py-8 text-center text-sm text-mist/80">
            Loading active sessions...
          </div>
        ) : (
        <div className="mt-4 space-y-3">
          {sessions.tokens.length === 0 ? (
            <p className="text-sm text-mist/80">No active sessions found for this account.</p>
          ) : (
            pagedSessions().map((token) => (
              <div key={token.id ?? token.session_id ?? token.name} className="rounded-md border border-white/15 bg-[#0b1222]/50 px-3 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-offwhite">
                      {token.name}
                      {token.is_current ? (
                        <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">Current</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-mist/75">Created: {token.created_at ? new Date(token.created_at).toLocaleString() : "-"}</p>
                    <p className="text-xs text-mist/75">Last used: {token.last_used_at ? new Date(token.last_used_at).toLocaleString() : "Never"}</p>
                    <p className="text-xs text-mist/75">
                      {token.kind === "browser_session"
                        ? `Session ID: ${token.session_id ?? "-"}`
                        : `Token ID: ${token.id ?? "-"}`}
                    </p>
                  </div>
                  {!token.is_current && token.id !== null ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (token.id !== null) {
                          void revokeSession(token.id);
                        }
                      }}
                      disabled={revokingTokenId === token.id}
                      className="rounded-md border border-red-400/50 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10 disabled:opacity-70"
                    >
                      {revokingTokenId === token.id ? "Revoking..." : "Revoke"}
                    </button>
                  ) : (
                    <span className="text-xs text-mist/65">Current session cannot be revoked here</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        )}
        {sessionsLoaded && (
          <div className="mt-4 flex items-center justify-between text-xs text-mist/80">
            <span>Page {sessionsPage} of {sessionsLastPage} | Total {sessions.tokens.length}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={sessionsPage <= 1} onClick={() => setSessionsPage((current) => Math.max(1, current - 1))}>Prev</button>
              <button type="button" className="btn-secondary" disabled={sessionsPage >= sessionsLastPage} onClick={() => setSessionsPage((current) => Math.min(sessionsLastPage, current + 1))}>Next</button>
            </div>
          </div>
        )}
      </div>
      )}
    </section>
  );
}
