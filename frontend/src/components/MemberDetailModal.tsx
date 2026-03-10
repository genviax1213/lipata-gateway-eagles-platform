import type { FormalPhotoRecord } from "../utils/formalPhoto";

interface MemberDetail {
  id: number;
  member_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  spouse_name: string | null;
  contact_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  batch: string | null;
  induction_date: string | null;
  membership_status: string;
  email_verified: boolean;
  password_set: boolean;
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

export default function MemberDetailModal({ member, onClose, showAccountDetails = false }: MemberDetailModalProps) {
  const fullName = `${member.first_name} ${member.middle_name ? `${member.middle_name} ` : ""}${member.last_name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:px-4 md:py-6">
      <div className="flex h-screen w-full flex-col overflow-hidden border border-white/20 bg-ink/95 text-offwhite shadow-2xl md:max-h-[85vh] md:max-w-4xl md:rounded-xl">
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
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              {member.formal_photo?.image_url ? (
                <img src={member.formal_photo.image_url} alt={`${fullName} formal photo`} className="aspect-[4/5] w-full rounded-lg object-cover" />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed border-white/15 text-sm text-mist/70">
                  No formal photo
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <p className="text-sm text-mist/85">Member Number: <span className="text-offwhite">{member.member_number}</span></p>
              <p className="text-sm text-mist/85">Email: <span className="text-offwhite">{member.email ?? "—"}</span></p>
              <p className="text-sm text-mist/85">Batch: <span className="text-offwhite">{member.batch ?? "—"}</span></p>
              <p className="text-sm text-mist/85">Membership Status: <span className="text-offwhite">{member.membership_status}</span></p>
              <p className="text-sm text-mist/85">Contact Number: <span className="text-offwhite">{member.contact_number ?? "—"}</span></p>
              <p className="text-sm text-mist/85">Spouse Name: <span className="text-offwhite">{member.spouse_name ?? "—"}</span></p>
              <p className="text-sm text-mist/85">Date of Birth: <span className="text-offwhite">{member.date_of_birth ?? "—"}</span></p>
              <p className="text-sm text-mist/85">Induction Date: <span className="text-offwhite">{member.induction_date ?? "—"}</span></p>
              <p className="text-sm text-mist/85">Email Verified: <span className="text-offwhite">{member.email_verified ? "Yes" : "No"}</span></p>
              <p className="text-sm text-mist/85">Password Set: <span className="text-offwhite">{member.password_set ? "Yes" : "No"}</span></p>
              <div className="md:col-span-2">
                <p className="text-sm text-mist/85">Address: <span className="text-offwhite">{member.address ?? "—"}</span></p>
              </div>
              {showAccountDetails && (
                <div className="md:col-span-2 rounded-xl border border-white/15 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-gold-soft">Linked Portal Account</p>
                  <p className="mt-2 text-sm text-mist/85">Account Name: <span className="text-offwhite">{member.user?.name ?? "No linked user"}</span></p>
                  <p className="text-sm text-mist/85">Role: <span className="text-offwhite">{member.user?.role?.name ?? "—"}</span></p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
