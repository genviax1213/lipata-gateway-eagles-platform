import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { Member, MemberForm, ValidationErrors } from "../types/member";

interface Props {
  member?: Member;
  errors: ValidationErrors;
  onClose: () => void;
  onSubmit: (data: MemberForm) => void;
}

type MemberModalSection = "identity" | "account" | "membership";

export default function MemberModal({
  member,
  errors,
  onClose,
  onSubmit,
}: Props) {
  const [activeSection, setActiveSection] = useState<MemberModalSection>("identity");
  const [form, setForm] = useState<MemberForm>({
    member_number: member?.member_number || "",
    email: member?.email || "",
    first_name: member?.first_name || "",
    middle_name: member?.middle_name || "",
    last_name: member?.last_name || "",
    spouse_name: member?.spouse_name || "",
    contact_number: member?.contact_number || "",
    address: member?.address || "",
    date_of_birth: member?.date_of_birth || "",
    batch: member?.batch || "",
    induction_date: member?.induction_date || "",
    email_verified: member?.email_verified ?? false,
    password_set: member?.password_set ?? false,
  });

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    const nextValue = e.target instanceof HTMLInputElement && e.target.type === "checkbox"
      ? e.target.checked
      : value;

    setForm((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:px-4 md:py-6">
      <div className="flex h-screen w-full flex-col overflow-hidden border border-white/20 bg-ink/95 text-offwhite shadow-2xl md:max-h-[85vh] md:max-w-4xl md:rounded-xl">
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
            <div className="mb-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveSection("identity")}
                className={`rounded-md border px-4 py-2 text-sm ${activeSection === "identity" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
              >
                Identity
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("account")}
                className={`rounded-md border px-4 py-2 text-sm ${activeSection === "account" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("membership")}
                className={`rounded-md border px-4 py-2 text-sm ${activeSection === "membership" ? "border-gold bg-gold text-ink" : "border-white/25 text-offwhite"}`}
              >
                Membership
              </button>
            </div>

            {activeSection === "identity" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="member_number" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Member Number
                  </label>
                  <input
                    id="member_number"
                    name="member_number"
                    value={form.member_number}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.member_number && <p className="text-sm text-red-300">{errors.member_number[0]}</p>}
                </div>

                <div>
                  <label htmlFor="spouse_name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Spouse Name
                  </label>
                  <input
                    id="spouse_name"
                    name="spouse_name"
                    value={form.spouse_name}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.spouse_name && <p className="text-sm text-red-300">{errors.spouse_name[0]}</p>}
                </div>

                <div>
                  <label htmlFor="first_name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    First Name
                  </label>
                  <input
                    id="first_name"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.first_name && <p className="text-sm text-red-300">{errors.first_name[0]}</p>}
                </div>

                <div>
                  <label htmlFor="middle_name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Middle Name
                  </label>
                  <input
                    id="middle_name"
                    name="middle_name"
                    value={form.middle_name}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-mist/70">Use full middle name, not initial.</p>
                  {errors.middle_name && <p className="text-sm text-red-300">{errors.middle_name[0]}</p>}
                </div>

                <div>
                  <label htmlFor="last_name" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Last Name
                  </label>
                  <input
                    id="last_name"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.last_name && <p className="text-sm text-red-300">{errors.last_name[0]}</p>}
                </div>

                <div>
                  <label htmlFor="date_of_birth" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Date of Birth
                  </label>
                  <input
                    id="date_of_birth"
                    name="date_of_birth"
                    type="date"
                    value={form.date_of_birth}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
                  />
                  {errors.date_of_birth && <p className="text-sm text-red-300">{errors.date_of_birth[0]}</p>}
                </div>
              </div>
            )}

            {activeSection === "account" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="email" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Email (Canonical Membership Key)
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.email && <p className="text-sm text-red-300">{errors.email[0]}</p>}
                </div>

                <div>
                  <label htmlFor="contact_number" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Contact Number
                  </label>
                  <input
                    id="contact_number"
                    name="contact_number"
                    value={form.contact_number}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.contact_number && <p className="text-sm text-red-300">{errors.contact_number[0]}</p>}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
                    <input
                      id="email_verified"
                      name="email_verified"
                      type="checkbox"
                      checked={form.email_verified}
                      onChange={handleChange}
                    />
                    Email Verified
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-offwhite">
                    <input
                      id="password_set"
                      name="password_set"
                      type="checkbox"
                      checked={form.password_set}
                      onChange={handleChange}
                    />
                    Password Set
                  </label>
                </div>
              </div>
            )}

            {activeSection === "membership" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="batch" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Batch
                  </label>
                  <input
                    id="batch"
                    name="batch"
                    value={form.batch}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.batch && <p className="text-sm text-red-300">{errors.batch[0]}</p>}
                </div>

                <div>
                  <label htmlFor="induction_date" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Induction Date
                  </label>
                  <input
                    id="induction_date"
                    name="induction_date"
                    type="date"
                    value={form.induction_date}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
                  />
                  {errors.induction_date && <p className="text-sm text-red-300">{errors.induction_date[0]}</p>}
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="address" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
                    Address
                  </label>
                  <input
                    id="address"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite placeholder:text-mist/70 focus:border-gold focus:outline-none"
                  />
                  {errors.address && <p className="text-sm text-red-300">{errors.address[0]}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-white/15 bg-ink/95 px-4 py-4 sm:flex-row sm:justify-end md:px-6">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md border border-white/30 px-4 py-2 sm:w-auto"
            >
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
