export interface Member {
  id: number;
  member_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  membership_status: "active" | "inactive" | "applicant";
}

export interface MemberForm {
  member_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
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
