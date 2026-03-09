import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import {
  formatFormalPhotoTimestamp,
  resolveFormalPhotoImageUrl,
  type FormalPhotoRecord,
} from "../utils/formalPhoto";

interface FormalPhotoStaffViewerProps {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

interface FormalPhotoMemberRow {
  id: number;
  subject_key: string;
  subject_type: "member" | "applicant";
  identifier: string | null;
  full_name: string;
  email: string | null;
  subtitle: string;
  lookup_url: string;
  has_formal_photo: boolean;
  formal_photo?: FormalPhotoRecord | null;
}

interface PaginatedMembersResponse {
  data: FormalPhotoMemberRow[];
}

interface StaffFormalPhotoResponse {
  member?: FormalPhotoMemberRow | null;
  applicant?: FormalPhotoMemberRow | null;
  formal_photo?: FormalPhotoRecord | null;
}

function toAbsoluteApiUrl(url: string): string {
  const baseUrl = typeof api.defaults.baseURL === "string" ? api.defaults.baseURL : window.location.origin;
  return new URL(url, baseUrl).toString();
}

function memberLabel(member: FormalPhotoMemberRow): string {
  return member.full_name;
}

export default function FormalPhotoStaffViewer({
  onNotice,
  onError,
}: FormalPhotoStaffViewerProps) {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [members, setMembers] = useState<FormalPhotoMemberRow[]>([]);
  const [selectedMember, setSelectedMember] = useState<FormalPhotoMemberRow | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [formalPhoto, setFormalPhoto] = useState<FormalPhotoRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const securePhotoUrl = useMemo(() => resolveFormalPhotoImageUrl(formalPhoto), [formalPhoto]);

  const runSearch = async () => {
    setSearching(true);
    onError("");

    try {
      const response = await api.get<PaginatedMembersResponse>("/formal-photos/directory", {
        params: {
          search: search.trim(),
        },
      });
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setMembers(rows);
      if (rows.length === 0) {
        onNotice("No members or applicants matched the current search.");
      }
    } catch {
      onError("Unable to search the formal-photo directory right now.");
    } finally {
      setSearching(false);
    }
  };

  const selectMember = async (member: FormalPhotoMemberRow) => {
    setSelectedMember(member);
    setFormalPhoto(member.formal_photo ?? null);
    setLoadingPhoto(true);
    setPreviewFailed(false);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    onError("");

    try {
      const response = await api.get<StaffFormalPhotoResponse>(member.lookup_url);
      const resolvedPhoto = response.data.formal_photo ?? member.formal_photo ?? null;
      setSelectedMember(response.data.member ?? response.data.applicant ?? member);
      setFormalPhoto(resolvedPhoto);
      if (!resolvedPhoto) {
        onNotice(`This ${member.subject_type} does not have a saved formal photo yet.`);
      }
    } catch {
      const fallbackPhoto = member.formal_photo ?? null;
      setFormalPhoto(fallbackPhoto);

      if (!fallbackPhoto) {
        onError("Unable to load the selected person's formal photo.");
      }
    } finally {
      setLoadingPhoto(false);
    }
  };

  useEffect(() => {
    if (!securePhotoUrl) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setPreviewFailed(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    void api.get(toAbsoluteApiUrl(securePhotoUrl), { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
        setPreviewFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setPreviewFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [securePhotoUrl]);

  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-4">
      <div className="mb-4">
        <h2 className="font-heading text-2xl text-offwhite">Formal Photo Viewer</h2>
        <p className="mt-1 max-w-3xl text-sm text-mist/80">
          Search a member or applicant, select the record, and preview the private formal photo through the authenticated backend endpoint.
          This viewer is intentionally narrow and does not open the broader members management surface.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-white/15 bg-white/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="min-w-0 flex-1">
                <label htmlFor="formal-photo-member-search" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-mist/85">
                  Search Person
                </label>
                <input
                  id="formal-photo-member-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, email, member number, or applicant status"
                  className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-offwhite"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn-secondary disabled:opacity-50"
                  onClick={() => void runSearch()}
                  disabled={searching}
                >
                  {searching ? "Searching..." : "Search"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/15 bg-navy/35 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-heading text-lg text-offwhite">Matching People</h3>
              <span className="text-xs text-mist/70">{members.length} result{members.length === 1 ? "" : "s"}</span>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {members.map((member) => (
                <button
                  key={member.subject_key}
                  type="button"
                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                    selectedMember?.subject_key === member.subject_key
                      ? "border-gold/60 bg-gold/10 text-offwhite"
                      : "border-white/15 bg-white/5 text-offwhite hover:border-white/30"
                  }`}
                  onClick={() => void selectMember(member)}
                >
                  <p className="font-semibold">{memberLabel(member)}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mist/75">
                    <span>{member.subtitle}</span>
                    <span>{member.subject_type === "member" ? "Member No" : "Status"}: {member.identifier ?? "—"}</span>
                    <span>Email: {member.email ?? "—"}</span>
                    <span>{member.has_formal_photo ? "Saved photo available" : "No saved photo yet"}</span>
                  </div>
                </button>
              ))}

              {members.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center text-sm text-mist/70">
                  Search for a member or applicant to load the private formal-photo preview.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/15 bg-navy/40 p-4 xl:sticky xl:top-4 xl:self-start">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg text-offwhite">Selected Preview</h3>
              <p className="text-xs text-mist/75">
                {selectedMember ? `${memberLabel(selectedMember)} · ${selectedMember.subtitle}` : "No person selected yet."}
              </p>
            </div>
            {formalPhoto ? (
              <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-mist/80">
                <p>Saved: <span className="text-offwhite">{formatFormalPhotoTimestamp(formalPhoto.updated_at ?? formalPhoto.created_at)}</span></p>
                <p>Status: <span className="text-offwhite">{formalPhoto.status ?? "saved"}</span></p>
              </div>
            ) : null}
          </div>

          <div className="mx-auto w-full max-w-[180px] overflow-hidden rounded-xl border border-white/15 bg-white/5 sm:max-w-[220px] xl:max-w-[180px]">
            <div className="aspect-[35/45]">
              {previewUrl ? (
                <img src={previewUrl} alt={selectedMember ? `${memberLabel(selectedMember)} formal photo` : "Formal photo preview"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-mist/70">
                  {loadingPhoto
                    ? "Loading photo..."
                    : previewFailed
                      ? "Secure formal-photo preview failed to load."
                      : selectedMember
                        ? "This person has no saved formal photo yet."
                        : "Select a person from the search results to preview the private formal photo."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
