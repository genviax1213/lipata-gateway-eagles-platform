import { type ReactNode, useMemo, useState } from "react";
import type { Member, MemberClubPosition, MemberDependent, MemberEducationEntry, MemberEmployment, MemberSponsorship } from "../types/member";
import type { FormalPhotoRecord } from "../utils/formalPhoto";

type DetailSection = "identity" | "contact" | "positions" | "family" | "optional" | "account";

interface MemberDetail extends Member {
  formal_photo?: FormalPhotoRecord | null;
  user?: {
    id: number;
    name: string;
    email: string | null;
    role?: { id: number; name: string } | null;
  } | null;
}

interface MemberDetailModalProps {
  member: MemberDetail;
  showAccountDetails?: boolean;
  onClose: () => void;
}

const DETAIL_SECTIONS: Array<{ value: DetailSection; label: string }> = [
  { value: "identity", label: "Identity" },
  { value: "contact", label: "Contact" },
  { value: "positions", label: "Positions" },
  { value: "family", label: "Family" },
  { value: "optional", label: "Optional" },
  { value: "account", label: "Account" },
];

export default function MemberDetailModal({ member, onClose, showAccountDetails = false }: MemberDetailModalProps) {
  const [activeSection, setActiveSection] = useState<DetailSection>("identity");
  const fullName = `${member.first_name} ${member.middle_name ? `${member.middle_name} ` : ""}${member.last_name}`;

  const idCardMissingFields = useMemo(() => {
    const missing: string[] = [];
    const currentPositions = member.current_club_positions ?? [];

    if (!member.last_name?.trim()) missing.push("Last Name");
    if (!member.first_name?.trim()) missing.push("First Name");
    if (!member.middle_name?.trim()) missing.push("Middle Name");
    if (currentPositions.length === 0) missing.push("Current Club Position");
    if (!member.region?.trim()) missing.push("Region");
    if (!member.spouse_name?.trim()) missing.push("Spouse Name");
    if (!member.emergency_contact_number?.trim()) missing.push("In Case of Emergency CP Number");

    return missing;
  }, [member]);

  const currentPositions = member.current_club_positions ?? [];
  const positions = member.club_positions ?? [];
  const dependents = member.dependents ?? [];
  const employments = member.employments ?? [];
  const educationEntries = member.education_entries ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:px-4 md:py-6">
      <div className="flex h-screen w-full flex-col overflow-hidden border border-white/20 bg-ink/95 text-offwhite shadow-2xl md:max-h-[90vh] md:max-w-5xl md:rounded-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/15 bg-ink/95 px-4 py-4 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Member Directory</p>
            <h2 className="font-heading text-3xl">{fullName}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-white/25 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10">
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {idCardMissingFields.length === 0
              ? "ID card production fields are complete."
              : `Missing for ID card production: ${idCardMissingFields.join(", ")}.`}
          </div>

          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-white/15 bg-white/5 p-4">
                {member.formal_photo?.image_url && member.formal_photo.status !== "missing_file" ? (
                  <img src={member.formal_photo.image_url} alt={`${fullName} formal photo`} className="aspect-[4/5] w-full rounded-lg object-cover" />
                ) : (
                  <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed border-white/15 text-sm text-mist/70">
                    {member.formal_photo?.status === "missing_file" ? "Photo file missing" : "No formal photo"}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-mist/85">
                <p>Member Number: <span className="text-offwhite">{member.member_number}</span></p>
                <p className="mt-2">Batch: <span className="text-offwhite">{member.batch ?? "—"}</span></p>
                <p className="mt-2">Membership Status: <span className="text-offwhite">{member.membership_status}</span></p>
                <p className="mt-2">Current Club Position: <span className="text-offwhite">{currentPositions.map(formatPosition).join("; ") || "—"}</span></p>
              </div>
            </div>

            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                {DETAIL_SECTIONS.map((section) => (
                  <button
                    key={section.value}
                    type="button"
                    onClick={() => setActiveSection(section.value)}
                    className={`rounded-md border px-4 py-2 text-sm ${activeSection === section.value ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              {activeSection === "identity" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailField label="First Name" value={member.first_name} requiredTone />
                  <DetailField label="Nickname" value={member.nickname} />
                  <DetailField label="Middle Name" value={member.middle_name} requiredTone />
                  <DetailField label="Last Name" value={member.last_name} requiredTone />
                  <DetailField label="Spouse Name" value={member.spouse_name} requiredTone />
                  <DetailField label="Date of Birth" value={member.date_of_birth} />
                  <DetailField label="Place of Birth" value={member.place_of_birth} />
                  <DetailField label="Civil Status" value={member.civil_status} />
                  <DetailField label="Blood Type" value={member.blood_type} />
                  <DetailField label="Height (cm)" value={member.height_cm} />
                  <DetailField label="Weight (kg)" value={member.weight_kg} />
                  <DetailField label="Citizenship" value={member.citizenship} />
                  <DetailField label="Religion" value={member.religion} />
                </div>
              )}

              {activeSection === "contact" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailField label="Email" value={member.email} />
                  <DetailField label="Contact Number" value={member.contact_number} />
                  <DetailField label="Telephone Number" value={member.telephone_number} />
                  <DetailField label="In Case of Emergency CP Number" value={member.emergency_contact_number} requiredTone />
                  <DetailField label="Region" value={member.region} requiredTone />
                  <DetailField label="Street No." value={member.street_no} />
                  <DetailField label="Address Line" value={member.address_line} />
                  <DetailField label="Barangay" value={member.barangay} />
                  <DetailField label="Municipality/City" value={member.city_municipality} />
                  <DetailField label="Province" value={member.province} />
                  <DetailField label="ZIP Code" value={member.zip_code} />
                  <DetailField label="Induction Date" value={member.induction_date} />
                  <div className="md:col-span-2">
                    <DetailField label="Legacy Full Address" value={member.address} />
                  </div>
                </div>
              )}

              {activeSection === "positions" && (
                <div className="space-y-4">
                  {positions.length === 0 ? (
                    <EmptyState message="No club positions recorded." />
                  ) : (
                    positions.map((position) => (
                      <PositionCard key={position.id ?? `${position.position_name}-${position.eagle_year}-${position.started_at}`} position={position} />
                    ))
                  )}
                </div>
              )}

              {activeSection === "family" && (
                <div className="space-y-6">
                  <SectionCard title="Dependents">
                    {dependents.length === 0 ? (
                      <EmptyState message="No dependents recorded." />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {dependents.map((dependent) => (
                          <DependentCard key={dependent.id ?? `${dependent.relationship}-${dependent.name}`} dependent={dependent} />
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Sponsorship">
                    {member.sponsorship ? <SponsorshipCard sponsorship={member.sponsorship} /> : <EmptyState message="No sponsorship details recorded." />}
                  </SectionCard>
                </div>
              )}

              {activeSection === "optional" && (
                <div className="space-y-6">
                  <SectionCard title="Employment">
                    {employments.length === 0 ? (
                      <EmptyState message="No employment entries recorded." />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {employments.map((employment) => (
                          <EmploymentCard key={employment.id ?? `${employment.office_name}-${employment.job_title}`} employment={employment} />
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard title="Education">
                    {educationEntries.length === 0 ? (
                      <EmptyState message="No education entries recorded." />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {educationEntries.map((education) => (
                          <EducationCard key={education.id ?? `${education.level}-${education.school_name}`} education={education} />
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Hobbies" value={member.hobbies} />
                    <DetailField label="Special Skills" value={member.special_skills} />
                  </div>
                </div>
              )}

              {activeSection === "account" && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Email Verified" value={member.email_verified ? "Yes" : "No"} />
                    <DetailField label="Password Set" value={member.password_set ? "Yes" : "No"} />
                  </div>

                  {showAccountDetails && (
                    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Linked Portal Account</p>
                      <p className="mt-2 text-sm text-mist/85">Account Name: <span className="text-offwhite">{member.user?.name ?? "No linked user"}</span></p>
                      <p className="text-sm text-mist/85">Email: <span className="text-offwhite">{member.user?.email ?? "—"}</span></p>
                      <p className="text-sm text-mist/85">Role: <span className="text-offwhite">{member.user?.role?.name ?? "—"}</span></p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatPosition(position: MemberClubPosition): string {
  const parts = [position.position_name, position.eagle_year].filter(Boolean);
  return parts.join(" / ");
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
      <h3 className="mb-3 font-heading text-xl text-offwhite">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-mist/75">{message}</p>;
}

function DetailField({ label, value, requiredTone = false }: { label: string; value: unknown; requiredTone?: boolean }) {
  return (
    <div>
      <p className={`text-xs uppercase tracking-wider ${requiredTone ? "text-red-300" : "text-gold-soft"}`}>{label}</p>
      <p className="mt-1 text-sm text-offwhite">{formatValue(value)}</p>
    </div>
  );
}

function PositionCard({ position }: { position: MemberClubPosition }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <DetailField label="Club Position" value={position.position_name} requiredTone />
        <DetailField label="Position Code" value={position.position_code} />
        <DetailField label="Eagle Year" value={position.eagle_year} />
        <DetailField label="Current" value={position.is_current ? "Yes" : "No"} />
        <DetailField label="Started At" value={position.started_at} />
        <DetailField label="Ended At" value={position.ended_at} />
      </div>
    </div>
  );
}

function DependentCard({ dependent }: { dependent: MemberDependent }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
      <DetailField label="Relationship" value={dependent.relationship} />
      <DetailField label="Name" value={dependent.name} />
      <DetailField label="Contact Number" value={dependent.contact_number} />
      <DetailField label="Age" value={dependent.age} />
    </div>
  );
}

function EmploymentCard({ employment }: { employment: MemberEmployment }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
      <DetailField label="Office Name" value={employment.office_name} />
      <DetailField label="Line of Business" value={employment.line_of_business} />
      <DetailField label="Title and Position" value={employment.job_title} />
      <DetailField label="Office Telephone" value={employment.office_telephone} />
      <DetailField label="Office Fax" value={employment.office_fax} />
      <DetailField label="Current Employment" value={employment.is_current ? "Yes" : "No"} />
      <div className="mt-3">
        <DetailField label="Office Address" value={employment.office_address} />
      </div>
    </div>
  );
}

function EducationCard({ education }: { education: MemberEducationEntry }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-4">
      <DetailField label="Level" value={education.level} />
      <DetailField label="School Name" value={education.school_name} />
      <DetailField label="Course" value={education.course} />
      <DetailField label="Date Graduated" value={education.date_graduated} />
    </div>
  );
}

function SponsorshipCard({ sponsorship }: { sponsorship: MemberSponsorship }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DetailField label="Sponsor Name" value={sponsorship.sponsor_name} />
      <DetailField label="Sponsor Date" value={sponsorship.sponsor_date} />
      <DetailField label="Sponsor Signature Name" value={sponsorship.sponsor_signature_name} />
      <DetailField label="Applicant Signature Name" value={sponsorship.applicant_signature_name} />
      <DetailField label="Applicant Signed At" value={sponsorship.applicant_signed_at} />
      <DetailField label="Linked Sponsor Member" value={sponsorship.sponsor_member?.name} />
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() === "" ? "—" : value;
  return String(value);
}
