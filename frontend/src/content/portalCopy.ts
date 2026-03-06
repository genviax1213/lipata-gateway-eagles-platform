export const canonicalRoutes = {
  login: "/login",
  memberApplication: "/member-application",
  passwordReset: "/member-reset-password",
} as const;

export const roleGlossary: Array<{ role: string; meaning: string }> = [
  { role: "Applicant", meaning: "Submitted member application; completing verification and review steps." },
  { role: "Member", meaning: "Approved fraternity member with standard portal access." },
  { role: "Officer", meaning: "Operational leadership role with elevated management tasks." },
  { role: "Admin", meaning: "Platform administrator with broad governance authority." },
  { role: "Membership Chairman", meaning: "Owns applicant lifecycle review, notices, and stage progression." },
  { role: "Treasurer", meaning: "Records finance entries and uses reversal rows to correct ledger mistakes." },
  { role: "Auditor", meaning: "Reviews finance records and compliance status without changing ledger entries." },
] as const;

export const microcopy = {
  errors: {
    required: "Please complete all required fields.",
    generic: "The request could not be completed. Please try again.",
  },
  success: {
    login: "Login successful.",
    applicationSubmitted: "Application submitted. Continue with email verification.",
    applicationVerified: "Verification successful. Your application is now in review queue.",
  },
  nextStep: {
    login: "After login, review your dashboard status and complete the next required action.",
    application: "Check your email for the verification token, then complete verification below.",
  },
} as const;
