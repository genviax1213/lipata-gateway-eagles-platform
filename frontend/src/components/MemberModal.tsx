import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type {
  Member,
  MemberClubPosition,
  MemberDependent,
  MemberEducationEntry,
  MemberEmployment,
  MemberForm,
  ValidationErrors,
} from "../types/member";

interface Props {
  member?: Member;
  errors: ValidationErrors;
  canEditBatch?: boolean;
  onClose: () => void;
  onSubmit: (data: MemberForm) => void;
}

type MemberModalSection = "identity" | "contact" | "positions" | "family" | "optional" | "account";

const EMPTY_EMPLOYMENT: MemberEmployment = {
  office_name: "",
  line_of_business: "",
  office_address: "",
  job_title: "",
  office_telephone: "",
  office_fax: "",
  is_current: true,
};

const EMPTY_DEPENDENT: MemberDependent = {
  relationship: "child",
  name: "",
  contact_number: "",
  age: "",
  sort_order: 1,
};

const EMPTY_EDUCATION: MemberEducationEntry = {
  level: "elementary",
  school_name: "",
  date_graduated: "",
  course: "",
};

const EMPTY_POSITION: MemberClubPosition = {
  position_name: "",
  position_code: "",
  eagle_year: "",
  started_at: "",
  ended_at: "",
  is_current: true,
};

export default function MemberModal({
  member,
  errors,
  canEditBatch = false,
  onClose,
  onSubmit,
}: Props) {
  const [activeSection, setActiveSection] = useState<MemberModalSection>("identity");
  const [form, setForm] = useState<MemberForm>({
    member_number: member?.member_number || "",
    email: member?.email || "",
    first_name: member?.first_name || "",
    nickname: member?.nickname || "",
    middle_name: member?.middle_name || "",
    last_name: member?.last_name || "",
    spouse_name: member?.spouse_name || "",
    contact_number: member?.contact_number || "",
    telephone_number: member?.telephone_number || "",
    emergency_contact_number: member?.emergency_contact_number || "",
    address: member?.address || "",
    address_line: member?.address_line || "",
    street_no: member?.street_no || "",
    barangay: member?.barangay || "",
    city_municipality: member?.city_municipality || "",
    province: member?.province || "",
    zip_code: member?.zip_code || "",
    date_of_birth: member?.date_of_birth || "",
    place_of_birth: member?.place_of_birth || "",
    civil_status: member?.civil_status || "",
    height_cm: member?.height_cm ? String(member.height_cm) : "",
    weight_kg: member?.weight_kg ? String(member.weight_kg) : "",
    citizenship: member?.citizenship || "",
    religion: member?.religion || "",
    blood_type: member?.blood_type || "",
    region: member?.region || "",
    hobbies: member?.hobbies || "",
    special_skills: member?.special_skills || "",
    batch: member?.batch || "",
    induction_date: member?.induction_date || "",
    employments: member?.employments?.length ? member.employments.map((item) => ({ ...EMPTY_EMPLOYMENT, ...item })) : [{ ...EMPTY_EMPLOYMENT }],
    dependents: member?.dependents?.length ? member.dependents.map((item) => ({ ...EMPTY_DEPENDENT, ...item, age: item.age != null ? String(item.age) : "" })) : [{ ...EMPTY_DEPENDENT, relationship: "spouse", sort_order: 1 }],
    education_entries: member?.education_entries?.length ? member.education_entries.map((item) => ({ ...EMPTY_EDUCATION, ...item })) : [
      { ...EMPTY_EDUCATION, level: "elementary" },
      { ...EMPTY_EDUCATION, level: "high_school" },
      { ...EMPTY_EDUCATION, level: "college" },
    ],
    sponsorship: {
      sponsor_member_id: member?.sponsorship?.sponsor_member_id ?? null,
      sponsor_name: member?.sponsorship?.sponsor_name || "",
      sponsor_date: member?.sponsorship?.sponsor_date || "",
      sponsor_signature_name: member?.sponsorship?.sponsor_signature_name || "",
      applicant_signature_name: member?.sponsorship?.applicant_signature_name || "",
      applicant_signed_at: member?.sponsorship?.applicant_signed_at || "",
    },
    club_positions: member?.club_positions?.length ? member.club_positions.map((item) => ({ ...EMPTY_POSITION, ...item })) : [{ ...EMPTY_POSITION }],
    email_verified: member?.email_verified ?? false,
    password_set: member?.password_set ?? false,
  });

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    const nextValue = e.target instanceof HTMLInputElement && e.target.type === "checkbox"
      ? e.target.checked
      : value;

    setForm((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  }

  function updateArrayField(key: "employments" | "dependents" | "education_entries" | "club_positions", index: number, field: string, value: unknown) {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }));
  }

  function addArrayItem(key: "employments" | "dependents" | "education_entries" | "club_positions") {
    setForm((prev) => ({
      ...prev,
      [key]: [
        ...prev[key],
        key === "employments"
          ? { ...EMPTY_EMPLOYMENT }
          : key === "dependents"
            ? { ...EMPTY_DEPENDENT, sort_order: prev.dependents.length + 1 }
            : key === "education_entries"
              ? { ...EMPTY_EDUCATION, level: "other" }
              : { ...EMPTY_POSITION },
      ],
    }));
  }

  function removeArrayItem(key: "employments" | "dependents" | "education_entries" | "club_positions", index: number) {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:px-4 md:py-6">
      <div className="flex h-screen w-full flex-col overflow-hidden border border-white/20 bg-ink/95 text-offwhite shadow-2xl md:max-h-[90vh] md:max-w-5xl md:rounded-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/15 bg-ink/95 px-4 py-4 md:px-6">
          <h2 className="font-heading text-3xl">
            {member ? "Edit Member" : "Create Member"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/25 px-3 py-2 text-sm text-offwhite/90 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
            <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Required for ID card production: Last Name, First Name, Middle Name, Current Club Position, Region, Spouse Name, and In Case of Emergency CP Number.
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {[
                ["identity", "Identity"],
                ["contact", "Contact"],
                ["positions", "Positions"],
                ["family", "Family"],
                ["optional", "Optional"],
                ["account", "Account"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveSection(value as MemberModalSection)}
                  className={`rounded-md border px-4 py-2 text-sm ${activeSection === value ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeSection === "identity" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Member Number" name="member_number" value={form.member_number} onChange={handleChange} error={errors.member_number?.[0]} />
                <Field label="Nickname" name="nickname" value={form.nickname} onChange={handleChange} error={errors.nickname?.[0]} />
                <Field label="First Name" name="first_name" value={form.first_name} onChange={handleChange} error={errors.first_name?.[0]} requiredTone />
                <Field label="Middle Name" name="middle_name" value={form.middle_name} onChange={handleChange} error={errors.middle_name?.[0]} helper="Use full middle name, not initial." requiredTone />
                <Field label="Last Name" name="last_name" value={form.last_name} onChange={handleChange} error={errors.last_name?.[0]} requiredTone />
                <Field label="Spouse Name" name="spouse_name" value={form.spouse_name} onChange={handleChange} error={errors.spouse_name?.[0]} requiredTone />
                <Field label="Date of Birth" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} error={errors.date_of_birth?.[0]} />
                <Field label="Place of Birth" name="place_of_birth" value={form.place_of_birth} onChange={handleChange} error={errors.place_of_birth?.[0]} />
                <Field label="Civil Status" name="civil_status" value={form.civil_status} onChange={handleChange} error={errors.civil_status?.[0]} />
                <Field label="Blood Type" name="blood_type" value={form.blood_type} onChange={handleChange} error={errors.blood_type?.[0]} />
                <Field label="Height (cm)" name="height_cm" value={form.height_cm} onChange={handleChange} error={errors.height_cm?.[0]} />
                <Field label="Weight (kg)" name="weight_kg" value={form.weight_kg} onChange={handleChange} error={errors.weight_kg?.[0]} />
                <Field label="Citizenship" name="citizenship" value={form.citizenship} onChange={handleChange} error={errors.citizenship?.[0]} />
                <Field label="Religion" name="religion" value={form.religion} onChange={handleChange} error={errors.religion?.[0]} />
              </div>
            )}

            {activeSection === "contact" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} error={errors.email?.[0]} readOnly helper="Registration email remains the canonical account key." />
                <Field label="Batch" name="batch" value={form.batch} onChange={handleChange} error={errors.batch?.[0]} readOnly={!canEditBatch} helper={canEditBatch ? "Managed through applicant batch workflow." : "Read-only. Managed by membership chairman."} />
                <Field label="Contact Number" name="contact_number" value={form.contact_number} onChange={handleChange} error={errors.contact_number?.[0]} />
                <Field label="Telephone Number" name="telephone_number" value={form.telephone_number} onChange={handleChange} error={errors.telephone_number?.[0]} />
                <Field label="In Case of Emergency CP Number" name="emergency_contact_number" value={form.emergency_contact_number} onChange={handleChange} error={errors.emergency_contact_number?.[0]} requiredTone />
                <Field label="Region" name="region" value={form.region} onChange={handleChange} error={errors.region?.[0]} requiredTone />
                <Field label="Street No." name="street_no" value={form.street_no} onChange={handleChange} error={errors.street_no?.[0]} />
                <Field label="Address Line" name="address_line" value={form.address_line} onChange={handleChange} error={errors.address_line?.[0]} />
                <Field label="Barangay" name="barangay" value={form.barangay} onChange={handleChange} error={errors.barangay?.[0]} />
                <Field label="Municipality/City" name="city_municipality" value={form.city_municipality} onChange={handleChange} error={errors.city_municipality?.[0]} />
                <Field label="Province" name="province" value={form.province} onChange={handleChange} error={errors.province?.[0]} />
                <Field label="ZIP Code" name="zip_code" value={form.zip_code} onChange={handleChange} error={errors.zip_code?.[0]} />
                <div className="md:col-span-2">
                  <Field label="Legacy Full Address" name="address" value={form.address} onChange={handleChange} error={errors.address?.[0]} as="textarea" helper="Optional freeform address. Structured address fields above are preferred." />
                </div>
                <Field label="Induction Date" name="induction_date" type="date" value={form.induction_date} onChange={handleChange} error={errors.induction_date?.[0]} />
              </div>
            )}

            {activeSection === "positions" && (
              <div className="space-y-4">
                {form.club_positions.map((position, index) => (
                  <div key={index} className="rounded-xl border border-white/15 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-offwhite">Club Position #{index + 1}</p>
                      {form.club_positions.length > 1 && (
                        <button type="button" className="rounded-md border border-white/25 px-3 py-1 text-xs" onClick={() => removeArrayItem("club_positions", index)}>
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Current Club Position" value={position.position_name} onChange={(e) => updateArrayField("club_positions", index, "position_name", e.target.value)} requiredTone />
                      <Field label="Position Code" value={position.position_code ?? ""} onChange={(e) => updateArrayField("club_positions", index, "position_code", e.target.value)} />
                      <Field label="Eagle Year" value={position.eagle_year} onChange={(e) => updateArrayField("club_positions", index, "eagle_year", e.target.value)} />
                      <Field label="Started At" type="date" value={position.started_at} onChange={(e) => updateArrayField("club_positions", index, "started_at", e.target.value)} />
                      <Field label="Ended At" type="date" value={position.ended_at} onChange={(e) => updateArrayField("club_positions", index, "ended_at", e.target.value)} />
                      <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
                        <input type="checkbox" checked={position.is_current} onChange={(e) => updateArrayField("club_positions", index, "is_current", e.target.checked)} />
                        Current Position
                      </label>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-secondary" onClick={() => addArrayItem("club_positions")}>Add Club Position</button>
              </div>
            )}

            {activeSection === "family" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-xl text-offwhite">Dependents</h3>
                    <button type="button" className="btn-secondary" onClick={() => addArrayItem("dependents")}>Add Dependent</button>
                  </div>
                  {form.dependents.map((dependent, index) => (
                    <div key={index} className="rounded-xl border border-white/15 bg-white/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-offwhite">Dependent #{index + 1}</p>
                        {form.dependents.length > 1 && (
                          <button type="button" className="rounded-md border border-white/25 px-3 py-1 text-xs" onClick={() => removeArrayItem("dependents", index)}>
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Relationship</label>
                          <select value={dependent.relationship} onChange={(e) => updateArrayField("dependents", index, "relationship", e.target.value)} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none">
                            <option value="spouse">Spouse</option>
                            <option value="child">Child</option>
                            <option value="dependent">Dependent</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <Field label="Name" value={dependent.name} onChange={(e) => updateArrayField("dependents", index, "name", e.target.value)} />
                        <Field label="Contact Number" value={dependent.contact_number} onChange={(e) => updateArrayField("dependents", index, "contact_number", e.target.value)} />
                        <Field label="Age" value={dependent.age} onChange={(e) => updateArrayField("dependents", index, "age", e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/15 bg-white/5 p-4">
                  <h3 className="mb-3 font-heading text-xl text-offwhite">Sponsorship</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Sponsor Name" value={form.sponsorship.sponsor_name} onChange={(e) => setForm((prev) => ({ ...prev, sponsorship: { ...prev.sponsorship, sponsor_name: e.target.value } }))} />
                    <Field label="Sponsor Date" type="date" value={form.sponsorship.sponsor_date} onChange={(e) => setForm((prev) => ({ ...prev, sponsorship: { ...prev.sponsorship, sponsor_date: e.target.value } }))} />
                    <Field label="Sponsor Signature Name" value={form.sponsorship.sponsor_signature_name} onChange={(e) => setForm((prev) => ({ ...prev, sponsorship: { ...prev.sponsorship, sponsor_signature_name: e.target.value } }))} />
                    <Field label="Applicant Signature Name" value={form.sponsorship.applicant_signature_name} onChange={(e) => setForm((prev) => ({ ...prev, sponsorship: { ...prev.sponsorship, applicant_signature_name: e.target.value } }))} />
                    <Field label="Applicant Signed At" type="date" value={form.sponsorship.applicant_signed_at} onChange={(e) => setForm((prev) => ({ ...prev, sponsorship: { ...prev.sponsorship, applicant_signed_at: e.target.value } }))} />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "optional" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-xl text-offwhite">Employment</h3>
                    <button type="button" className="btn-secondary" onClick={() => addArrayItem("employments")}>Add Employment</button>
                  </div>
                  {form.employments.map((employment, index) => (
                    <div key={index} className="rounded-xl border border-white/15 bg-white/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-offwhite">Employment #{index + 1}</p>
                        {form.employments.length > 1 && (
                          <button type="button" className="rounded-md border border-white/25 px-3 py-1 text-xs" onClick={() => removeArrayItem("employments", index)}>
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Office Name" value={employment.office_name} onChange={(e) => updateArrayField("employments", index, "office_name", e.target.value)} />
                        <Field label="Line of Business" value={employment.line_of_business} onChange={(e) => updateArrayField("employments", index, "line_of_business", e.target.value)} />
                        <Field label="Title and Position" value={employment.job_title} onChange={(e) => updateArrayField("employments", index, "job_title", e.target.value)} />
                        <Field label="Office Telephone" value={employment.office_telephone} onChange={(e) => updateArrayField("employments", index, "office_telephone", e.target.value)} />
                        <Field label="Office Fax" value={employment.office_fax} onChange={(e) => updateArrayField("employments", index, "office_fax", e.target.value)} />
                        <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
                          <input type="checkbox" checked={employment.is_current} onChange={(e) => updateArrayField("employments", index, "is_current", e.target.checked)} />
                          Current Employment
                        </label>
                        <div className="md:col-span-2">
                          <Field label="Office Address" value={employment.office_address} onChange={(e) => updateArrayField("employments", index, "office_address", e.target.value)} as="textarea" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-xl text-offwhite">Education</h3>
                    <button type="button" className="btn-secondary" onClick={() => addArrayItem("education_entries")}>Add Education</button>
                  </div>
                  {form.education_entries.map((education, index) => (
                    <div key={index} className="rounded-xl border border-white/15 bg-white/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-offwhite">Education #{index + 1}</p>
                        {form.education_entries.length > 1 && (
                          <button type="button" className="rounded-md border border-white/25 px-3 py-1 text-xs" onClick={() => removeArrayItem("education_entries", index)}>
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">Level</label>
                          <select value={education.level} onChange={(e) => updateArrayField("education_entries", index, "level", e.target.value)} className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none">
                            <option value="elementary">Elementary</option>
                            <option value="high_school">High School</option>
                            <option value="college">College</option>
                            <option value="post_graduate">Post Graduate</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <Field label="School Name" value={education.school_name} onChange={(e) => updateArrayField("education_entries", index, "school_name", e.target.value)} />
                        <Field label="Date Graduated" type="date" value={education.date_graduated} onChange={(e) => updateArrayField("education_entries", index, "date_graduated", e.target.value)} />
                        <Field label="Course" value={education.course} onChange={(e) => updateArrayField("education_entries", index, "course", e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Field label="Hobbies" name="hobbies" value={form.hobbies} onChange={handleChange} error={errors.hobbies?.[0]} as="textarea" />
                  </div>
                  <div className="md:col-span-2">
                    <Field label="Special Skills" name="special_skills" value={form.special_skills} onChange={handleChange} error={errors.special_skills?.[0]} as="textarea" />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "account" && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
                  <input id="email_verified" name="email_verified" type="checkbox" checked={form.email_verified} onChange={handleChange} />
                  Email Verified
                </label>
                <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
                  <input id="password_set" name="password_set" type="checkbox" checked={form.password_set} onChange={handleChange} />
                  Password Set
                </label>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-white/15 bg-ink/95 px-4 py-4 sm:flex-row sm:justify-end md:px-6">
            <button type="button" onClick={onClose} className="w-full rounded-md border border-white/30 px-4 py-2 sm:w-auto">
              Cancel
            </button>
            <button type="submit" className="btn-primary w-full sm:w-auto">
              {member ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  error?: string;
  helper?: string;
  name?: string;
  type?: string;
  as?: "input" | "textarea";
  readOnly?: boolean;
  requiredTone?: boolean;
}

function Field({
  label,
  value,
  onChange,
  error,
  helper,
  name,
  type = "text",
  as = "input",
  readOnly = false,
  requiredTone = false,
}: FieldProps) {
  const labelClass = `mb-2 block text-xs uppercase tracking-wider ${requiredTone ? "text-red-300" : "text-gold-soft"}`;
  const fieldClass = `w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none ${readOnly ? "bg-white/5 text-offwhite/80" : ""}`;

  return (
    <div>
      <label className={labelClass}>{label}</label>
      {as === "textarea" ? (
        <textarea name={name} value={value} onChange={onChange} readOnly={readOnly} className={`${fieldClass} min-h-[96px]`} />
      ) : (
        <input name={name} type={type} value={value} onChange={onChange} readOnly={readOnly} className={fieldClass} />
      )}
      {helper && <p className="mt-1 text-xs text-mist/70">{helper}</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
