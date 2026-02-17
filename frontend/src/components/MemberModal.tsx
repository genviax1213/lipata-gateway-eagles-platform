import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { Member, MemberForm, ValidationErrors } from "../types/member";

interface Props {
  member?: Member;
  errors: ValidationErrors;
  onClose: () => void;
  onSubmit: (data: MemberForm) => void;
}

export default function MemberModal({
  member,
  errors,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<MemberForm>({
    member_number: member?.member_number || "",
    first_name: member?.first_name || "",
    middle_name: member?.middle_name || "",
    last_name: member?.last_name || "",
    membership_status: member?.membership_status || "active",
  });

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="w-full max-w-lg rounded-xl border border-white/20 bg-ink/90 p-8 text-offwhite shadow-2xl">
        <h2 className="mb-6 font-heading text-3xl">
          {member ? "Edit Member" : "Create Member"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            {errors.member_number && (
              <p className="text-sm text-red-300">
                {errors.member_number[0]}
              </p>
            )}
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
            {errors.first_name && (
              <p className="text-sm text-red-300">
                {errors.first_name[0]}
              </p>
            )}
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
            {errors.middle_name && (
              <p className="text-sm text-red-300">
                {errors.middle_name[0]}
              </p>
            )}
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
            {errors.last_name && (
              <p className="text-sm text-red-300">
                {errors.last_name[0]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="membership_status" className="mb-2 block text-xs uppercase tracking-wider text-gold-soft">
              Membership Status
            </label>
            <select
              id="membership_status"
              name="membership_status"
              value={form.membership_status}
              onChange={handleChange}
              className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2 text-offwhite focus:border-gold focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="applicant">Applicant</option>
            </select>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/30 px-4 py-2"
            >
              Cancel
            </button>

            <button type="submit" className="btn-primary">
              {member ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
