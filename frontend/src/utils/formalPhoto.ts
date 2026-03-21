export interface FormalPhotoRecord {
  id?: number;
  image_url?: string | null;
  owner_image_url?: string | null;
  view_url?: string | null;
  url?: string | null;
  upload_url?: string | null;
  upload_field_name?: string | null;
  filename?: string | null;
  status?: "saved" | "missing_file" | string | null;
  width?: number | null;
  height?: number | null;
  template_key?: string | null;
  file_size?: number | null;
  file_exists?: boolean | null;
  mime_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function formatFormalPhotoTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not saved yet";
}

export function resolveFormalPhotoImageUrl(formalPhoto?: FormalPhotoRecord | null): string | null {
  return formalPhoto?.owner_image_url ?? formalPhoto?.image_url ?? formalPhoto?.view_url ?? formalPhoto?.url ?? null;
}

export function resolveFormalPhotoUploadUrl(formalPhoto?: FormalPhotoRecord | null): string {
  const raw = formalPhoto?.upload_url?.trim() || "/formal-photos/me";
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8010/api/v1";

  try {
    const base = new URL(apiBaseUrl);
    const candidate = new URL(raw, base.origin);
    const basePath = base.pathname.replace(/\/+$/, "");
    const candidatePath = candidate.pathname.replace(/\/+$/, "");

    if (basePath && candidatePath.startsWith(basePath + "/")) {
      return candidatePath.slice(basePath.length) || "/";
    }

    return candidatePath || raw;
  } catch {
    return raw.replace(/^\/api\/v\d+\//, "/");
  }
}

export function resolveFormalPhotoUploadField(formalPhoto?: FormalPhotoRecord | null): string {
  return formalPhoto?.upload_field_name?.trim() || "photo";
}
