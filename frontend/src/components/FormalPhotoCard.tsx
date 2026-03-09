import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import FileSelectionPreview from "./FileSelectionPreview";
import {
  formatFormalPhotoTimestamp,
  resolveFormalPhotoImageUrl,
  resolveFormalPhotoUploadField,
  resolveFormalPhotoUploadUrl,
  type FormalPhotoRecord,
} from "../utils/formalPhoto";

interface FormalPhotoCardProps {
  formalPhoto?: FormalPhotoRecord | null;
  onSaved: (formalPhoto: FormalPhotoRecord | null) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

interface FormalPhotoUploadResponse {
  message?: string;
  formal_photo?: FormalPhotoRecord | null;
  profile?: { formal_photo?: FormalPhotoRecord | null } | null;
  member?: { formal_photo?: FormalPhotoRecord | null } | null;
}

function toAbsoluteApiUrl(url: string): string {
  const baseUrl = typeof api.defaults.baseURL === "string" ? api.defaults.baseURL : window.location.origin;
  return new URL(url, baseUrl).toString();
}

export default function FormalPhotoCard({
  formalPhoto,
  onSaved,
  onNotice,
  onError,
}: FormalPhotoCardProps) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [securePreviewUrl, setSecurePreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [optimisticPreviewUrl, setOptimisticPreviewUrl] = useState<string | null>(null);

  const selectedPreviewUrl = useMemo(
    () => (sourceFile ? URL.createObjectURL(sourceFile) : null),
    [sourceFile],
  );
  const savedPhotoUrl = useMemo(() => resolveFormalPhotoImageUrl(formalPhoto), [formalPhoto]);
  const visiblePreviewUrl = selectedPreviewUrl ?? optimisticPreviewUrl ?? securePreviewUrl;

  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
    };
  }, [selectedPreviewUrl]);

  useEffect(() => {
    return () => {
      if (optimisticPreviewUrl) URL.revokeObjectURL(optimisticPreviewUrl);
    };
  }, [optimisticPreviewUrl]);

  useEffect(() => {
    const endpoint = savedPhotoUrl;
    if (!endpoint) {
      setSecurePreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setPreviewFailed(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    void api.get(toAbsoluteApiUrl(endpoint), { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setSecurePreviewUrl((current) => {
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
  }, [savedPhotoUrl]);

  const savePhoto = async () => {
    if (!sourceFile) return;

    setSaving(true);
    onError("");

    try {
      const payload = new FormData();
      payload.append(resolveFormalPhotoUploadField(formalPhoto), sourceFile);

      const response = await api.post<FormalPhotoUploadResponse>(resolveFormalPhotoUploadUrl(formalPhoto), payload);
      const nextFormalPhoto = response.data.formal_photo
        ?? response.data.profile?.formal_photo
        ?? response.data.member?.formal_photo
        ?? null;

      setOptimisticPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(sourceFile);
      });
      onSaved(nextFormalPhoto);
      onNotice(response.data.message ?? "Formal photo saved to your private profile.");
      setSourceFile(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to save the formal photo.";
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
      <div className="order-2 space-y-4 lg:order-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-xl text-offwhite">Formal Photo</h3>
            <p className="mt-1 max-w-2xl text-sm text-mist/80">
              Capture a front-camera selfie or choose an image, then upload it directly as your private formal photo.
              The backend converts the saved file to WebP for storage efficiency.
            </p>
          </div>
          <div className="text-xs text-mist/78">
            <p>Last saved: <span className="text-offwhite">{formatFormalPhotoTimestamp(formalPhoto?.updated_at ?? formalPhoto?.created_at)}</span></p>
            <p>Status: <span className="text-offwhite">{formalPhoto?.status ?? (savedPhotoUrl ? "saved" : "not set")}</span></p>
          </div>
        </div>

        <FileSelectionPreview
          id="formal-photo-source"
          label="Capture or Choose Photo"
          accept="image/*"
          capture="user"
          file={sourceFile}
          buttonLabel={savedPhotoUrl ? "Retake or Choose New Photo" : "Take Selfie or Choose Image"}
          helperText="Mobile browsers can open the front camera. The selected image is uploaded directly and optimized to WebP on save."
          onChange={setSourceFile}
          onClear={() => setSourceFile(null)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            onClick={() => void savePhoto()}
            disabled={!sourceFile || saving}
          >
            {saving ? "Saving..." : "Save Formal Photo"}
          </button>
          <p className="text-xs text-mist/70">
            Saving uploads the selected image only. No outfit overlay or template is applied. This photo stays separate from CMS media and applicant documents.
          </p>
        </div>
      </div>

      <div className="order-1 lg:order-2">
        <div className="mx-auto w-full max-w-[180px] sm:max-w-[220px]">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="font-heading text-lg text-offwhite">Preview</h4>
              <p className="text-xs text-mist/75">
                {sourceFile ? "The selected image will be saved." : "Your saved portrait appears here immediately after upload."}
              </p>
            </div>
            {(sourceFile || savedPhotoUrl) ? (
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
                {sourceFile ? "Ready" : "Saved"}
              </span>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border border-white/15 bg-white/5 shadow-[0_18px_36px_rgba(0,0,0,0.18)]">
            <div className="aspect-[7/9]">
              {visiblePreviewUrl ? (
                <img src={visiblePreviewUrl} alt="Formal photo preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-5 text-center text-sm text-mist/70">
                  {Boolean(savedPhotoUrl) && !sourceFile && !securePreviewUrl && !previewFailed
                    ? "Loading secure image..."
                    : previewFailed
                      ? "The secure preview endpoint could not be loaded right now."
                      : "Take a selfie or choose a portrait image to preview the saved formal photo."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
