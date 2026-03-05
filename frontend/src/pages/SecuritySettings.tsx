import { useState } from "react";
import axios from "axios";
import api from "../services/api";

function parseError(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  const payload = err.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
  const firstFieldError = payload?.errors ? Object.values(payload.errors).flat()[0] : "";
  return firstFieldError || payload?.message || fallback;
}

export default function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

      if (typeof res.data?.token === "string" && res.data.token.length > 0) {
        localStorage.setItem("auth_token", res.data.token);
      }

      setNotice(res.data?.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
    } catch (err) {
      setError(parseError(err, "Unable to update password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-heading text-2xl text-offwhite">Security Settings</h1>
        <p className="mt-2 text-sm text-mist/80">
          Manage your account password. For safety, changing password signs out other active sessions.
        </p>
      </header>

      <div className="glass-card max-w-2xl p-6">
        <h2 className="text-base font-semibold text-offwhite">Change Password</h2>
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-mist/90">
            Current password
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-white/15 bg-[#0b1222]/60 px-3 py-2 text-offwhite outline-none ring-gold/40 focus:ring"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="block text-sm text-mist/90">
            New password
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-white/15 bg-[#0b1222]/60 px-3 py-2 text-offwhite outline-none ring-gold/40 focus:ring"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="block text-sm text-mist/90">
            Confirm new password
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-white/15 bg-[#0b1222]/60 px-3 py-2 text-offwhite outline-none ring-gold/40 focus:ring"
              value={newPasswordConfirmation}
              onChange={(e) => setNewPasswordConfirmation(e.target.value)}
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

      <div className="glass-card max-w-2xl p-6">
        <h2 className="text-base font-semibold text-offwhite">Session Security</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-mist/85">
          <li>Inactive sessions are automatically signed out after 30 minutes.</li>
          <li>Only one active session is allowed per account across devices/browsers.</li>
          <li>When a new login succeeds, previous sessions are ended with a notice.</li>
        </ul>
      </div>
    </section>
  );
}
