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

export interface MemberEmployment {
  id?: number;
  office_name: string;
  line_of_business: string;
  office_address: string;
  job_title: string;
  office_telephone: string;
  office_fax: string;
  is_current: boolean;
}

export interface MemberDependent {
  id?: number;
  relationship: "spouse" | "child" | "dependent" | "other";
  name: string;
  contact_number: string;
  age: string;
  sort_order: number;
}

export interface MemberEducationEntry {
  id?: number;
  level: "elementary" | "high_school" | "college" | "post_graduate" | "other";
  school_name: string;
  date_graduated: string;
  course: string;
}

export interface MemberSponsorship {
  id?: number;
  sponsor_member_id?: number | null;
  sponsor_name: string;
  sponsor_date: string;
  sponsor_signature_name: string;
  applicant_signature_name: string;
  applicant_signed_at: string;
  sponsor_member?: {
    id: number;
    name: string;
  } | null;
}

export interface MemberClubPosition {
  id?: number;
  club_position_id?: number | null;
  position_name: string;
  position_code?: string;
  eagle_year: string;
  started_at: string;
  ended_at: string;
  is_current: boolean;
}

export interface Member {
  id: number;
  member_number: string;
  email: string | null;
  first_name: string;
  nickname?: string | null;
  middle_name: string | null;
  last_name: string;
  spouse_name: string | null;
  contact_number: string | null;
  telephone_number?: string | null;
  emergency_contact_number?: string | null;
  address: string | null;
  address_line?: string | null;
  street_no?: string | null;
  barangay?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  zip_code?: string | null;
  date_of_birth: string | null;
  place_of_birth?: string | null;
  civil_status?: string | null;
  height_cm?: string | number | null;
  weight_kg?: string | number | null;
  citizenship?: string | null;
  religion?: string | null;
  blood_type?: string | null;
  region?: string | null;
  hobbies?: string | null;
  special_skills?: string | null;
  batch: string | null;
  induction_date: string | null;
  membership_status: "active" | "inactive";
  email_verified: boolean;
  password_set: boolean;
  employments?: MemberEmployment[];
  dependents?: MemberDependent[];
  education_entries?: MemberEducationEntry[];
  sponsorship?: MemberSponsorship | null;
  club_positions?: MemberClubPosition[];
  current_club_positions?: MemberClubPosition[];
}

export interface MemberForm {
  member_number: string;
  email: string;
  first_name: string;
  nickname: string;
  middle_name: string;
  last_name: string;
  spouse_name: string;
  contact_number: string;
  telephone_number: string;
  emergency_contact_number: string;
  address: string;
  address_line: string;
  street_no: string;
  barangay: string;
  city_municipality: string;
  province: string;
  zip_code: string;
  date_of_birth: string;
  place_of_birth: string;
  civil_status: string;
  height_cm: string;
  weight_kg: string;
  citizenship: string;
  religion: string;
  blood_type: string;
  region: string;
  hobbies: string;
  special_skills: string;
  batch: string;
  induction_date: string;
  employments: MemberEmployment[];
  dependents: MemberDependent[];
  education_entries: MemberEducationEntry[];
  sponsorship: MemberSponsorship;
  club_positions: MemberClubPosition[];
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
