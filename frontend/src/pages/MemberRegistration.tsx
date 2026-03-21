import { useEffect, useState } from "react";
import axios from "axios";
import api from "../services/api";
import TaskHierarchyCard from "../components/TaskHierarchyCard";
import { useSearchParams } from "react-router-dom";
import { notifyPortalDataRefresh } from "../utils/portalRefresh";
import PasswordField from "../components/PasswordField";
import DataPrivacyNoticeBlock from "../components/DataPrivacyNoticeBlock";

interface RegistrationForm {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

type MemberRegistrationTab = "register" | "verify";

const initialForm: RegistrationForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  password: "",
  password_confirmation: "",
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeVerificationToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

const VISITOR_ID_KEY = "lgec.visitor.id.v1";
const SESSION_ID_KEY = "lgec.visitor.session.v1";

function createClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateClientToken(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;

  const next = createClientId();
  storage.setItem(key, next);
  return next;
}

export default function MemberRegistration() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MemberRegistrationTab>("register");
  const [form, setForm] = useState<RegistrationForm>(initialForm);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [googleClaimLoaded, setGoogleClaimLoaded] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const googleClaimToken = searchParams.get("google_claim") ?? "";
  const [visitorToken] = useState(() => getOrCreateClientToken(localStorage, VISITOR_ID_KEY));
  const [sessionToken] = useState(() => getOrCreateClientToken(sessionStorage, SESSION_ID_KEY));

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

  const trackAccessEvent = async (
    eventType: string,
    status: "viewed" | "pending_verification" | "completed" | "not_verified" | "error",
    overrides?: { email?: string; message?: string; tab?: MemberRegistrationTab },
  ) => {
    try {
      await api.post("/member-registrations/access-events", {
        visitor_token: visitorToken,
        session_token: sessionToken,
        route_path: "/member-registration",
        email: overrides?.email ? normalizeEmail(overrides.email) : undefined,
        event_type: eventType,
        status,
        tab: overrides?.tab ?? activeTab,
        message: overrides?.message,
        occurred_at: new Date().toISOString(),
      });
    } catch {
      // Tracking stays silent.
    }
  };

  useEffect(() => {
    const oauthError = searchParams.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
      setNotice("");
      void trackAccessEvent("oauth_error", "error", { message: oauthError });
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("google") !== "1" || !googleClaimToken) return;

    void api.get("/oauth/google/claim", { params: { intent: "member_registration", token: googleClaimToken } })
      .then((res) => {
        setForm((prev) => ({
          ...prev,
          email: normalizeEmail(res.data.email ?? prev.email),
          first_name: res.data.first_name ?? prev.first_name,
          last_name: res.data.last_name ?? prev.last_name,
        }));
        setGoogleClaimLoaded(true);
        setNotice("Google verified your email. Complete the remaining fields and register to activate your member account.");
        setError("");
        setActiveTab("register");
        void trackAccessEvent("google_claim_loaded", "viewed", {
          email: res.data.email,
          message: "Google claim loaded.",
          tab: "register",
        });
      })
      .catch(() => {
        setGoogleClaimLoaded(false);
        void trackAccessEvent("google_claim_error", "error", { message: "Google claim lookup failed." });
      });
  }, [googleClaimToken, searchParams]);

  useEffect(() => {
    void trackAccessEvent("page_view", "viewed");
  }, [activeTab]);

  const validateRegistration = (): string | null => {
    const firstName = form.first_name.trim();
    const middleName = form.middle_name.trim();
    const lastName = form.last_name.trim();
    const email = normalizeEmail(form.email);

    if (!email || !firstName || !middleName || !lastName || !form.password || !form.password_confirmation) {
      return "Please complete all required fields.";
    }

    if (form.password.length < 8) {
      return "Password must be at least 8 characters.";
    }

    if (form.password !== form.password_confirmation) {
      return "Password confirmation does not match.";
    }

    if (middleName.length < 2 || middleName.includes(".")) {
      return "Middle name must be full and not an initial.";
    }

    const namePattern = /^(?=.*[A-Za-z])[A-Za-z\s'-]+$/;
    if (!namePattern.test(firstName) || !namePattern.test(middleName) || !namePattern.test(lastName)) {
      return "Names must contain letters only (spaces, apostrophe, and hyphen are allowed).";
    }

    return null;
  };

  const submitRegistration = async () => {
    const validationError = validateRegistration();
    if (validationError) {
      setError(validationError);
      setNotice("");
      return;
    }

    if (!privacyChecked) {
      setError("You must read and acknowledge the Data Privacy Notice before registering.");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        ...form,
        email: normalizeEmail(form.email),
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim(),
        last_name: form.last_name.trim(),
        oauth_provider: googleClaimLoaded ? "google" : undefined,
        oauth_claim_token: googleClaimLoaded ? googleClaimToken : undefined,
      };
      await api.post("/member-registrations", payload);
      await trackAccessEvent(
        "register_success",
        googleClaimLoaded ? "completed" : "pending_verification",
        {
          email: payload.email,
          message: googleClaimLoaded
            ? "Google member registration completed."
            : "Member registration submitted and waiting for email verification.",
          tab: "register",
        },
      );
      notifyPortalDataRefresh("members");
      setVerificationEmail(payload.email);
      setNotice(googleClaimLoaded
        ? "Google verified your email. Your member account is now active."
        : "Member registration submitted. Continue with email verification.");
      setForm(initialForm);
      setGoogleClaimLoaded(false);
      setPrivacyChecked(false);
      setActiveTab(googleClaimLoaded ? "register" : "verify");
    } catch (err: unknown) {
      const message = parseError(err, "Failed to submit member registration.");
      setError(message);
      await trackAccessEvent("register_error", "error", {
        email: form.email,
        message,
        tab: "register",
      });
    } finally {
      setSaving(false);
    }
  };

  const verifyRegistration = async () => {
    if (!verificationEmail.trim() || !verificationToken.trim()) {
      setError("Verification email and token are required.");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.post("/member-registrations/verify", {
        email: normalizeEmail(verificationEmail),
        verification_token: normalizeVerificationToken(verificationToken),
      });
      await trackAccessEvent("verify_success", "completed", {
        email: verificationEmail,
        message: "Member registration email verified.",
        tab: "verify",
      });
      setNotice("Verification successful. Your member account is now active.");
      setVerificationToken("");
    } catch (err: unknown) {
      const message = parseError(err, "Failed to verify member registration.");
      setError(message);
      await trackAccessEvent("verify_error", "not_verified", {
        email: verificationEmail,
        message,
        tab: "verify",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-wrap py-10 md:py-14">
      <div className="mx-auto max-w-3xl rounded-xl border border-white/20 bg-white/10 p-6 md:p-8">
        <h1 className="mb-2 font-heading text-4xl text-offwhite">Member Registration</h1>
        <p className="mb-6 text-sm text-mist/85">
          Register an existing club member account, verify the email, and activate portal access.
        </p>
        <TaskHierarchyCard
          className="mb-6"
          status="Ready to register an existing club member."
          actions="Provide member identity details, submit the registration, then verify using the token from the email."
          nextStep="After verification, the portal account becomes active as a member."
        />

        {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
        {notice && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{notice}</p>}

        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab("register")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "register" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Register</button>
          <button type="button" onClick={() => setActiveTab("verify")} className={`rounded-md border px-4 py-2 text-sm ${activeTab === "verify" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}>Verify Email</button>
        </div>

        {activeTab === "register" && (
          <div className="mb-8 grid gap-3 md:grid-cols-2">
            <label htmlFor="member-registration-email" className="text-xs font-semibold text-mist/85 md:col-span-2">Email Address</label>
            <input id="member-registration-email" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} disabled={googleClaimLoaded} className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite disabled:cursor-not-allowed disabled:opacity-60" />
            <label htmlFor="member-registration-password" className="text-xs font-semibold text-mist/85 md:col-span-2">Password</label>
            <PasswordField id="member-registration-password" placeholder="Password" value={form.password} onChange={(value) => setForm((prev) => ({ ...prev, password: value }))} className="rounded-md border border-white/25 bg-white/10 px-4 py-2 pr-12 text-offwhite" />
            <label htmlFor="member-registration-password-confirmation" className="text-xs font-semibold text-mist/85 md:col-span-2">Confirm Password</label>
            <PasswordField id="member-registration-password-confirmation" placeholder="Confirm Password" value={form.password_confirmation} onChange={(value) => setForm((prev) => ({ ...prev, password_confirmation: value }))} className="rounded-md border border-white/25 bg-white/10 px-4 py-2 pr-12 text-offwhite" />
            <div className="md:col-span-2">
              <label htmlFor="member-registration-first-name" className="mb-1 block text-xs font-semibold text-mist/85">First Name</label>
              <input id="member-registration-first-name" placeholder="First Name" value={form.first_name} onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite" />
            </div>
            <div>
              <label htmlFor="member-registration-middle-name" className="mb-1 block text-xs font-semibold text-mist/85">Middle Name</label>
              <input id="member-registration-middle-name" placeholder="Middle Name" value={form.middle_name} onChange={(e) => setForm((prev) => ({ ...prev, middle_name: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite" />
              <p className="mt-1 text-xs text-gold-soft">Use full middle name, not initial.</p>
            </div>
            <div>
              <label htmlFor="member-registration-last-name" className="mb-1 block text-xs font-semibold text-mist/85">Last Name</label>
              <input id="member-registration-last-name" placeholder="Last Name" value={form.last_name} onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite" />
              <p className="mt-1 text-xs text-transparent select-none">Spacer</p>
            </div>
            <p className="md:col-span-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs text-mist/85">
              This registration path is for existing club members who are not yet in the portal system. It is not the outsider application flow.
            </p>
            <div className="md:col-span-2">
              <DataPrivacyNoticeBlock checked={privacyChecked} onChange={setPrivacyChecked} compact />
            </div>
            <div className="md:col-span-2">
              <button onClick={() => void submitRegistration()} disabled={saving} className="btn-primary">
                {saving ? "Registering..." : "Register"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "verify" && (
          <div className="rounded-lg border border-white/20 bg-white/5 p-4">
            <h2 className="mb-2 font-heading text-2xl text-offwhite">Verify Member Registration Email</h2>
            <p className="mb-3 text-xs text-mist/80">
              Enter the email address and 10-character verification token sent to the registered member email. Verification activates the member portal account.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label htmlFor="member-registration-verify-email" className="text-xs font-semibold text-mist/85 md:col-span-2">Email Address</label>
              <input id="member-registration-verify-email" placeholder="Email used during registration" type="email" value={verificationEmail} onChange={(e) => setVerificationEmail(e.target.value)} className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite" />
              <label htmlFor="member-registration-verify-token" className="text-xs font-semibold text-mist/85 md:col-span-2">Verification Token</label>
              <input id="member-registration-verify-token" placeholder="Verification token" value={verificationToken} onChange={(e) => setVerificationToken(normalizeVerificationToken(e.target.value))} className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite uppercase tracking-[0.2em]" maxLength={10} />
            </div>
            <div className="mt-4">
              <button onClick={() => void verifyRegistration()} disabled={saving} className="btn-primary">
                {saving ? "Verifying..." : "Verify Email"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
