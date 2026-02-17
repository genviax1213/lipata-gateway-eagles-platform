import { useState } from "react";
import axios from "axios";
import api from "../services/api";

interface ApplicationForm {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
  membership_status: "active" | "inactive" | "applicant";
}

const initialForm: ApplicationForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  password: "",
  password_confirmation: "",
  membership_status: "applicant",
};

export default function MemberApplication() {
  const [form, setForm] = useState<ApplicationForm>(initialForm);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devToken, setDevToken] = useState("");
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
    const email = form.email.trim();

    if (!email || !firstName || !middleName || !lastName || !form.membership_status || !form.password || !form.password_confirmation) {
      return "All application fields are required.";
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
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim(),
        last_name: form.last_name.trim(),
      };
      const res = await api.post("/member-applications", payload);
      setVerificationEmail(payload.email);
      setDevToken((res.data as { verification_token?: string }).verification_token ?? "");
      setNotice("Application submitted. Verify your email/token to move to admin approval.");
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
        email: verificationEmail.trim(),
        verification_token: verificationToken.trim(),
      });
      setNotice("Email verified. Your application is now pending admin/officer approval.");
      setVerificationToken("");
      setDevToken("");
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
          Submit your application, verify your email, and wait for admin/officer approval.
        </p>

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

        <div className="mb-8 grid gap-3 md:grid-cols-2">
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <input
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <input
            placeholder="Confirm Password"
            type="password"
            value={form.password_confirmation}
            onChange={(e) => setForm((prev) => ({ ...prev, password_confirmation: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <input
            placeholder="First Name"
            value={form.first_name}
            onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
          />
          <div>
            <input
              placeholder="Middle Name"
              value={form.middle_name}
              onChange={(e) => setForm((prev) => ({ ...prev, middle_name: e.target.value }))}
              className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <p className="mt-1 text-xs text-gold-soft">Use full middle name, not initial.</p>
          </div>
          <div>
            <input
              placeholder="Last Name"
              value={form.last_name}
              onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <p className="mt-1 text-xs text-transparent select-none">Spacer</p>
          </div>
          <select
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

        <div className="rounded-lg border border-white/20 bg-white/5 p-4">
          <h2 className="mb-2 font-heading text-2xl text-offwhite">Verify Email</h2>
          <p className="mb-3 text-xs text-mist/80">
            Enter your email and verification token to move your application to approval queue.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              placeholder="Application email"
              type="email"
              value={verificationEmail}
              onChange={(e) => setVerificationEmail(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite"
            />
            <input
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

          {devToken && (
            <p className="mt-3 rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold-soft">
              Dev token: <span className="font-mono">{devToken}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
