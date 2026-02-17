import type { Member } from "../types/member";

interface Props {
  member: Member;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteModal({
  member,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="w-full max-w-md rounded-xl border border-red-200/20 bg-ink/95 p-8 text-offwhite shadow-2xl">
        <h2 className="mb-4 font-heading text-3xl">Confirm Delete</h2>

        <p className="mb-6 text-mist/90">
          Delete <strong>{member.first_name} {member.last_name}</strong>?
        </p>

        <div className="flex justify-end gap-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-white/30 px-4 py-2"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
