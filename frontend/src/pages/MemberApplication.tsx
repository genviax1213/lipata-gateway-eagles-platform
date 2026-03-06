import { useState } from "react";
import axios from "axios";
import api from "../services/api";
import { microcopy } from "../content/portalCopy";
import TaskHierarchyCard from "../components/TaskHierarchyCard";

interface ApplicationForm {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
  membership_status: "active" | "inactive" | "applicant";
}

type MemberApplicationTab = "apply" | "verify";

const initialForm: ApplicationForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  password: "",
  password_confirmation: "",
  membership_status: "applicant",
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function MemberApplication() {
  const [activeTab, setActiveTab] = useState<MemberApplicationTab>("apply");
  const [form, setForm] = useState<ApplicationForm>(initialForm);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const statusMeaning = {
    applicant: "Applicant: a non-member seeking to join the fraternity.",
    active: "Active: currently an official, active member.",
    inactive: "Inactive: already a member but currently inactive.",
  }[form.membership_status];

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

  const validateApplication = (): string | null => {
    const firstName = form.first_name.trim();
    const middleName = form.middle_name.trim();
    const lastName = form.last_name.trim();
    const email = normalizeEmail(form.email);

    if (!email || !firstName || !middleName || !lastName || !form.membership_status || !form.password || !form.password_confirmation) {
      return microcopy.errors.required;
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

  const submitApplication = async () => {
    const validationError = validateApplication();
    if (validationError) {
      setError(validationError);
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
      };
      await api.post("/member-applications", payload);
      setVerificationEmail(payload.email);
      setNotice(microcopy.success.applicationSubmitted);
      setForm(initialForm);
    } catch (err: unknown) {
      setError(parseError(err, "Failed to submit application."));
    } finally {
      setSaving(false);
    }
  };

  const verifyApplication = async () => {
    if (!verificationEmail.trim() || !verificationToken.trim()) {
      setError("Verification email and token are required.");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api.post("/member-applications/verify", {
        email: normalizeEmail(verificationEmail),
        verification_token: verificationToken.trim(),
      });
      setNotice(microcopy.success.applicationVerified);
      setVerificationToken("");
    } catch (err: unknown) {
      setError(parseError(err, "Failed to verify application."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-wrap py-10 md:py-14">
      <div className="mx-auto max-w-3xl rounded-xl border border-white/20 bg-white/10 p-6 md:p-8">
        <h1 className="mb-2 font-heading text-4xl text-offwhite">Member Application</h1>
        <p className="mb-6 text-sm text-mist/85">
          Submit your application, complete verification, and wait for committee review.
        </p>
        <TaskHierarchyCard
          className="mb-6"
          status="Ready to submit a new application profile."
          actions="Provide identity details, submit application, then verify using token from your email."
          nextStep={microcopy.nextStep.application}
        />
        {error && (
          <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        {notice && (
          <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft" role="status" aria-live="polite">
            {notice}
          </p>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("apply")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "apply" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("verify")}
            className={`rounded-md border px-4 py-2 text-sm ${activeTab === "verify" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
          >
            Verify Email
          </button>
        </div>

        {activeTab === "apply" && (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          <label htmlFor="application-email" className="text-xs font-semibold text-mist/85 md:col-span-2">Email Address</label>
          <input
            id="application-email"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <label htmlFor="application-password" className="text-xs font-semibold text-mist/85 md:col-span-2">Password</label>
          <input
            id="application-password"
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <label htmlFor="application-password-confirmation" className="text-xs font-semibold text-mist/85 md:col-span-2">Confirm Password</label>
          <input
            id="application-password-confirmation"
            placeholder="Confirm Password"
            type="password"
            value={form.password_confirmation}
            onChange={(e) => setForm((prev) => ({ ...prev, password_confirmation: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <label htmlFor="application-first-name" className="text-xs font-semibold text-mist/85 md:col-span-2">First Name</label>
          <input
            id="application-first-name"
            placeholder="First Name"
            value={form.first_name}
            onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <div>
            <label htmlFor="application-middle-name" className="mb-1 block text-xs font-semibold text-mist/85">Middle Name</label>
            <input
              id="application-middle-name"
              placeholder="Middle Name"
              value={form.middle_name}
              onChange={(e) => setForm((prev) => ({ ...prev, middle_name: e.target.value }))}
              className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <p className="mt-1 text-xs text-gold-soft">Use full middle name, not initial.</p>
          </div>
          <div>
            <label htmlFor="application-last-name" className="mb-1 block text-xs font-semibold text-mist/85">Last Name</label>
            <input
              id="application-last-name"
              placeholder="Last Name"
              value={form.last_name}
              onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <p className="mt-1 text-xs text-transparent select-none">Spacer</p>
          </div>
          <select
            id="application-membership-status"
            value={form.membership_status}
            onChange={(e) => setForm((prev) => ({ ...prev, membership_status: e.target.value as ApplicationForm["membership_status"] }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite md:col-span-2"
          >
            <option value="applicant" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Applicant</option>
            <option value="active" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Active</option>
            <option value="inactive" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Inactive</option>
          </select>
          <p className="md:col-span-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs text-mist/85">
            {statusMeaning}
          </p>
          <div className="md:col-span-2">
            <button onClick={() => void submitApplication()} disabled={saving} className="btn-primary">
              {saving ? "Submitting..." : "Submit Application"}
            </button>
          </div>
        </div>
        )}

        {activeTab === "verify" && (
        <div className="rounded-lg border border-white/20 bg-white/5 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Verify Email</h2>
          <p className="mb-3 text-xs text-mist/80">
            Enter your email and verification token to move your application to approval queue.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label htmlFor="verification-email" className="text-xs font-semibold text-mist/85 md:col-span-2">Application Email</label>
            <input
              id="verification-email"
              placeholder="Application email"
              type="email"
              value={verificationEmail}
              onChange={(e) => setVerificationEmail(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <label htmlFor="verification-token" className="text-xs font-semibold text-mist/85 md:col-span-2">Verification Token</label>
            <input
              id="verification-token"
              placeholder="Verification token"
              value={verificationToken}
              onChange={(e) => setVerificationToken(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <div className="md:col-span-2">
              <button onClick={() => void verifyApplication()} disabled={saving} className="btn-secondary">
                {saving ? "Verifying..." : "Verify Application"}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
