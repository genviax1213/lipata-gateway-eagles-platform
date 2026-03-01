export interface Member {
  id: number;
  member_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  spouse_name: string | null;
  contact_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  batch: string | null;
  induction_date: string | null;
  membership_status: "active" | "inactive" | "applicant";
}

export interface MemberForm {
  member_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  spouse_name: string;
  contact_number: string;
  address: string;
  date_of_birth: string;
  batch: string;
  induction_date: string;
  membership_status: Member["membership_status"];
}

export interface MemberApplication {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  membership_status: Member["membership_status"];
  status: "pending_verification" | "pending_approval" | "approved" | "rejected";
  email_verified_at: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: number | null;
  rejection_reason: string | null;
}

export type ValidationErrors = Record<string, string[]>;
