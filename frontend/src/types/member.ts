export type ApplicantStatus =
  | "pending_verification"
  | "under_review"
  | "official_applicant"
  | "eligible_for_activation"
  | "activated"
  | "rejected"
  | "withdrawn";

export type ApplicantDecisionStatus =
  | "pending"
  | "probation"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface Member {
  id: number;
  member_number: string;
  email: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  spouse_name: string | null;
  contact_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  batch: string | null;
  induction_date: string | null;
  membership_status: "active" | "inactive";
  email_verified: boolean;
  password_set: boolean;
}

export interface MemberForm {
  member_number: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  spouse_name: string;
  contact_number: string;
  address: string;
  date_of_birth: string;
  batch: string;
  induction_date: string;
  membership_status?: Member["membership_status"];
  email_verified: boolean;
  password_set: boolean;
}

export interface Applicant {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  membership_status: "applicant";
  member_id?: number | null;
  status: ApplicantStatus;
  email_verified_at: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: number | null;
  rejection_reason: string | null;
  decision_status?: ApplicantDecisionStatus;
  created_at?: string | null;
  current_stage?: string | null;
  batch?: {
    id: number;
    name: string;
    description?: string | null;
    start_date?: string | null;
    target_completion_date?: string | null;
  } | null;
}

export type ValidationErrors = Record<string, string[]>;
