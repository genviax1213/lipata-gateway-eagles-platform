export interface FormalPhotoRecord {
  id?: number;
  image_url?: string | null;
  owner_image_url?: string | null;
  view_url?: string | null;
  url?: string | null;
  upload_url?: string | null;
  upload_field_name?: string | null;
  filename?: string | null;
  status?: string | null;
  width?: number | null;
  height?: number | null;
  template_key?: string | null;
  file_size?: number | null;
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
  return formalPhoto?.upload_url?.trim() || "/formal-photos/me";
}

export function resolveFormalPhotoUploadField(formalPhoto?: FormalPhotoRecord | null): string {
  return formalPhoto?.upload_field_name?.trim() || "photo";
}
