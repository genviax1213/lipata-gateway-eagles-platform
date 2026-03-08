import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import api from "../services/api";
import { canonicalRoutes, microcopy } from "../content/portalCopy";
import TaskHierarchyCard from "../components/TaskHierarchyCard";

type AuthMode = "login" | "forgot" | "reset";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<AuthMode>("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");

  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState("");

  const tokenFromQuery = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const emailFromQuery = useMemo(() => searchParams.get("email") ?? "", [searchParams]);

  useEffect(() => {
    const resetRoute = location.pathname === "/member-reset-password";
    if (resetRoute || tokenFromQuery) {
      setMode("reset");
      setResetToken(tokenFromQuery);
      setResetEmail(normalizeEmail(emailFromQuery));
      if (emailFromQuery) {
        setForgotEmail(normalizeEmail(emailFromQuery));
        setEmail(normalizeEmail(emailFromQuery));
      }
    }
  }, [emailFromQuery, location.pathname, tokenFromQuery]);

  useEffect(() => {
    const storedNotice = localStorage.getItem("portal_auth_notice");
    if (storedNotice) {
      setNotice(storedNotice);
      localStorage.removeItem("portal_auth_notice");
    }
  }, []);

  const parseError = (err: unknown, fallback: string): string => {
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    try {
      await login(email, password);
      navigate("/portal");
    } catch (err) {
      setError(parseError(err, "Unable to log in right now. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    try {
      await api.post("/forgot-password", { email: normalizeEmail(forgotEmail) });
      setNotice("If your email exists in the system, a password reset link has been sent.");
    } catch (err) {
      setError(parseError(err, "Failed to send password reset link."));
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    try {
      await api.post("/reset-password", {
        email: normalizeEmail(resetEmail),
        token: resetToken.trim(),
        password: resetPassword,
        password_confirmation: resetPasswordConfirmation,
      });

      setNotice("Password reset successful. You can now log in.");
      setMode("login");
      setPassword("");
      setResetPassword("");
      setResetPasswordConfirmation("");
      setResetToken("");
      setEmail(normalizeEmail(resetEmail));
      navigate(canonicalRoutes.login, { replace: true });
    } catch (err) {
      setError(parseError(err, "Failed to reset password."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-6 md:py-10">
      <div className="w-full max-w-4xl">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-8">
          <aside className="p-1 md:p-3">
            <div className="mb-4">
              <Link
                to="/"
                className="inline-flex items-center rounded-md border border-gold/50 px-4 py-2 text-sm font-semibold text-gold-soft transition hover:bg-gold/10 hover:text-gold"
              >
                Back to Home
              </Link>
            </div>
            <p className="mb-2 text-xs uppercase tracking-[0.22em] text-gold-soft">Security Notice</p>
            <h2 className="mb-3 font-heading text-3xl text-offwhite md:text-4xl">Protected Portal Access</h2>
            <p className="max-w-xl text-sm leading-relaxed text-mist/85">
              This portal is for authorized applicants, members, officers, and administrators. Sign-in activity and role-based actions are monitored to protect applicant dossiers, member records, and administrative operations.
            </p>
            <div className="mt-5 rounded-md border border-white/20 bg-white/10 px-4 py-3 text-xs text-mist/85">
              <p className="font-semibold text-offwhite">Password reset procedure</p>
              <ol className="mt-2 space-y-1 pl-4">
                <li>Use Forgot Password and submit your account email.</li>
                <li>Open the reset email and follow the provided link.</li>
                <li>Set a new password, then return to login.</li>
              </ol>
            </div>
          </aside>

          <div className="glass-card w-full max-w-md p-6 sm:p-8 md:ml-auto">
            <div className="mx-auto mb-3 flex w-fit items-center gap-4">
              <img
                src="/images/tfoe-logo.png"
                alt="TFOE Logo"
                width={76}
                height={76}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="h-16 w-16 object-contain sm:h-[4.5rem] sm:w-[4.5rem]"
              />
              <img
                src="/images/lgec-logo.png"
                alt="LGEC Logo"
                width={84}
                height={99}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="h-[4.5rem] w-[4.5rem] object-contain sm:h-[5rem] sm:w-[5rem]"
              />
            </div>
            <h1 className="mb-2 text-center font-heading text-3xl text-gold">Portal Login</h1>
            <p className="mb-5 text-center text-sm text-gray-300">
              {mode === "login" ? "Shared access for applicants, members, and authorized administrators" : mode === "forgot" ? "Request password reset link" : "Reset your account password"}
            </p>

            {error && <p className="mb-3 text-center text-sm text-red-400" role="alert" aria-live="polite">{error}</p>}
            {notice && <p className="mb-3 text-center text-sm text-gold-soft" role="status" aria-live="polite">{notice}</p>}

            <TaskHierarchyCard
              className="mb-4"
              status={mode === "login" ? "Ready to authenticate with your account credentials." : mode === "forgot" ? "Ready to request a reset link." : "Ready to set a new password."}
              actions={mode === "login" ? "Sign in or switch to forgot password." : mode === "forgot" ? "Send reset link or proceed with existing token." : "Submit token and new password."}
              nextStep={microcopy.nextStep.login}
            />

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="mb-1 block text-xs font-semibold text-mist/85">Email Address</label>
                  <input
                    id="login-email"
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-offwhite placeholder:text-mist/70 outline-none focus:border-gold"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="mb-1 block text-xs font-semibold text-mist/85">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-offwhite placeholder:text-mist/70 outline-none focus:border-gold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-gold py-3 font-semibold text-navy shadow transition hover:-translate-y-0.5 hover:bg-gold-soft disabled:opacity-60"
                >
                  {saving ? "Logging in..." : "Login"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setForgotEmail(email);
                      setError("");
                      setNotice("");
                    }}
                    className="text-sm text-gold-soft hover:text-gold"
                  >
                    Forgot password?
                  </button>
                </div>
              </form>
            )}

            {mode === "forgot" && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <label htmlFor="forgot-email" className="mb-1 block text-xs font-semibold text-mist/85">Account Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  placeholder="Account email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-offwhite placeholder:text-mist/70 outline-none focus:border-gold"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-gold py-3 font-semibold text-navy shadow transition hover:-translate-y-0.5 hover:bg-gold-soft disabled:opacity-60"
                >
                  {saving ? "Sending..." : "Send Reset Link"}
                </button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setNotice("");
                    }}
                    className="text-gold-soft hover:text-gold"
                  >
                    Back to login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setResetEmail(forgotEmail);
                      setError("");
                      setNotice("");
                    }}
                    className="text-gold-soft hover:text-gold"
                  >
                    I already have a token
                  </button>
                </div>
              </form>
            )}

            {mode === "reset" && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <label htmlFor="reset-email" className="mb-1 block text-xs font-semibold text-mist/85">Account Email</label>
                <input
                  id="reset-email"
                  type="email"
                  placeholder="Account email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-offwhite placeholder:text-mist/70 outline-none focus:border-gold"
                />
                <label htmlFor="reset-token" className="mb-1 block text-xs font-semibold text-mist/85">Reset Token</label>
                <input
                  id="reset-token"
                  type="text"
                  placeholder="Reset token"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-offwhite placeholder:text-mist/70 outline-none focus:border-gold"
                />
                <label htmlFor="reset-password" className="mb-1 block text-xs font-semibold text-mist/85">New Password</label>
                <input
                  id="reset-password"
                  type="password"
                  placeholder="New password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-offwhite placeholder:text-mist/70 outline-none focus:border-gold"
                />
                <label htmlFor="reset-password-confirmation" className="mb-1 block text-xs font-semibold text-mist/85">Confirm New Password</label>
                <input
                  id="reset-password-confirmation"
                  type="password"
                  placeholder="Confirm new password"
                  value={resetPasswordConfirmation}
                  onChange={(e) => setResetPasswordConfirmation(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-offwhite placeholder:text-mist/70 outline-none focus:border-gold"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-gold py-3 font-semibold text-navy shadow transition hover:-translate-y-0.5 hover:bg-gold-soft disabled:opacity-60"
                >
                  {saving ? "Resetting..." : "Reset Password"}
                </button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setNotice("");
                    }}
                    className="text-sm text-gold-soft hover:text-gold"
                  >
                    Back to login
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
