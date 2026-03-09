import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import FileSelectionPreview from "./FileSelectionPreview";
import formalPhotoOverlayUrl from "../assets/formal-photo-coat-tie.svg";
import {
  composeFormalPhoto,
  defaultFormalPhotoAdjustments,
  formatFormalPhotoTimestamp,
  resolveFormalPhotoImageUrl,
  resolveFormalPhotoUploadField,
  resolveFormalPhotoUploadUrl,
  type FormalPhotoAdjustments,
  type FormalPhotoRecord,
} from "../utils/formalPhoto";

interface FormalPhotoCardProps {
  formalPhoto?: FormalPhotoRecord | null;
  onSaved: (formalPhoto: FormalPhotoRecord | null) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

interface GeneratedPhotoState {
  blob: Blob;
  file: File;
  previewUrl: string;
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

function PreviewFrame({
  title,
  subtitle,
  src,
  emptyText,
  loading = false,
  badge,
}: {
  title: string;
  subtitle: string;
  src: string | null;
  emptyText: string;
  loading?: boolean;
  badge?: string;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-navy/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-lg text-offwhite">{title}</h3>
          <p className="text-xs text-mist/75">{subtitle}</p>
        </div>
        {badge ? (
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
            {badge}
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/15 bg-white/5">
        <div className="aspect-[4/5]">
          {src ? (
            <img src={src} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-mist/70">
              {loading ? "Loading secure image..." : emptyText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FormalPhotoCard({
  formalPhoto,
  onSaved,
  onNotice,
  onError,
}: FormalPhotoCardProps) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [adjustments, setAdjustments] = useState<FormalPhotoAdjustments>(defaultFormalPhotoAdjustments);
  const [generatedPhoto, setGeneratedPhoto] = useState<GeneratedPhotoState | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [securePreviewUrl, setSecurePreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [optimisticPreviewUrl, setOptimisticPreviewUrl] = useState<string | null>(null);

  const savedPhotoUrl = useMemo(() => resolveFormalPhotoImageUrl(formalPhoto), [formalPhoto]);
  const visiblePreviewUrl = generatedPhoto?.previewUrl ?? optimisticPreviewUrl ?? securePreviewUrl;

  useEffect(() => {
    return () => {
      if (generatedPhoto?.previewUrl) {
        URL.revokeObjectURL(generatedPhoto.previewUrl);
      }
    };
  }, [generatedPhoto]);

  useEffect(() => {
    return () => {
      if (optimisticPreviewUrl) {
        URL.revokeObjectURL(optimisticPreviewUrl);
      }
    };
  }, [optimisticPreviewUrl]);

  useEffect(() => {
    if (!sourceFile) {
      setGeneratedPhoto((current) => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
      return;
    }

    let active = true;
    let nextPreviewUrl: string | null = null;

    setProcessing(true);
    void composeFormalPhoto(sourceFile, formalPhotoOverlayUrl, adjustments)
      .then((result) => {
        if (!active) {
          URL.revokeObjectURL(result.previewUrl);
          return;
        }
        nextPreviewUrl = result.previewUrl;
        setGeneratedPhoto((current) => {
          if (current?.previewUrl && current.previewUrl !== result.previewUrl) {
            URL.revokeObjectURL(current.previewUrl);
          }
          return result;
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setGeneratedPhoto((current) => {
          if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
          return null;
        });
        onError(error instanceof Error ? error.message : "Unable to prepare the formal photo preview.");
      })
      .finally(() => {
        if (active) {
          setProcessing(false);
        } else if (nextPreviewUrl) {
          URL.revokeObjectURL(nextPreviewUrl);
        }
      });

    return () => {
      active = false;
    };
  }, [adjustments, onError, sourceFile]);

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
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [savedPhotoUrl]);

  const savePhoto = async () => {
    if (!generatedPhoto) return;

    setSaving(true);
    onError("");

    try {
      const payload = new FormData();
      payload.append(resolveFormalPhotoUploadField(formalPhoto), generatedPhoto.file);

      const response = await api.post<FormalPhotoUploadResponse>(resolveFormalPhotoUploadUrl(formalPhoto), payload);
      const nextFormalPhoto = response.data.formal_photo
        ?? response.data.profile?.formal_photo
        ?? response.data.member?.formal_photo
        ?? null;

      setOptimisticPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(generatedPhoto.blob);
      });
      onSaved(nextFormalPhoto);
      onNotice(response.data.message ?? "Formal photo saved to your private profile.");
      setSourceFile(null);
      setAdjustments(defaultFormalPhotoAdjustments());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to save the formal photo.";
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-white/20 bg-white/5 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl text-offwhite">Formal Photo</h3>
          <p className="mt-1 max-w-2xl text-sm text-mist/80">
            Capture a front-camera selfie or choose an image, then the app overlays a coat and tie locally before upload.
            The saved result stays private to your account plus authorized secretary and admin users.
          </p>
        </div>
        <div className="rounded-lg border border-white/15 bg-navy/45 px-3 py-2 text-xs text-mist/80">
          <p>Last saved: <span className="text-offwhite">{formatFormalPhotoTimestamp(formalPhoto?.updated_at ?? formalPhoto?.created_at)}</span></p>
          <p>Status: <span className="text-offwhite">{formalPhoto?.status ?? (savedPhotoUrl ? "saved" : "not set")}</span></p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          <FileSelectionPreview
            id="formal-photo-source"
            label="Capture or Choose Selfie"
            accept="image/*"
            capture="user"
            file={sourceFile}
            buttonLabel={savedPhotoUrl ? "Retake or Choose New Photo" : "Take Selfie or Choose Image"}
            helperText="Mobile browsers can open the front camera. A straight portrait with visible shoulders gives the best automatic fit."
            onChange={(file) => {
              setSourceFile(file);
              setAdjustments(defaultFormalPhotoAdjustments());
            }}
            onClear={() => {
              setSourceFile(null);
              setAdjustments(defaultFormalPhotoAdjustments());
            }}
          />

          {sourceFile ? (
            <div className="rounded-xl border border-white/15 bg-navy/40 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-heading text-lg text-offwhite">Framing Adjustments</h4>
                  <p className="text-xs text-mist/75">
                    The subject is aligned automatically first. Adjust only if the collar or tie sits too high, low, left, or right.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-white/25 px-3 py-2 text-xs font-semibold text-mist transition hover:border-white/45 hover:text-offwhite"
                  onClick={() => setAdjustments(defaultFormalPhotoAdjustments())}
                >
                  Reset Framing
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-mist/85">
                  Zoom
                  <input
                    type="range"
                    min="0.85"
                    max="1.35"
                    step="0.01"
                    value={adjustments.zoom}
                    onChange={(event) => setAdjustments((current) => ({ ...current, zoom: Number(event.target.value) }))}
                    className="w-full accent-gold"
                  />
                  <span className="block text-[11px] normal-case tracking-normal text-mist/70">{Math.round(adjustments.zoom * 100)}%</span>
                </label>

                <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-mist/85">
                  Left / Right
                  <input
                    type="range"
                    min="-140"
                    max="140"
                    step="2"
                    value={adjustments.offsetX}
                    onChange={(event) => setAdjustments((current) => ({ ...current, offsetX: Number(event.target.value) }))}
                    className="w-full accent-gold"
                  />
                  <span className="block text-[11px] normal-case tracking-normal text-mist/70">{adjustments.offsetX > 0 ? `Right ${adjustments.offsetX}px` : adjustments.offsetX < 0 ? `Left ${Math.abs(adjustments.offsetX)}px` : "Centered"}</span>
                </label>

                <label className="space-y-2 text-xs font-semibold uppercase tracking-[0.18em] text-mist/85">
                  Up / Down
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="2"
                    value={adjustments.offsetY}
                    onChange={(event) => setAdjustments((current) => ({ ...current, offsetY: Number(event.target.value) }))}
                    className="w-full accent-gold"
                  />
                  <span className="block text-[11px] normal-case tracking-normal text-mist/70">{adjustments.offsetY > 0 ? `Down ${adjustments.offsetY}px` : adjustments.offsetY < 0 ? `Up ${Math.abs(adjustments.offsetY)}px` : "Auto aligned"}</span>
                </label>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary disabled:opacity-50"
              onClick={() => void savePhoto()}
              disabled={!generatedPhoto || processing || saving}
            >
              {saving ? "Saving..." : "Save Formal Photo"}
            </button>
            <p className="text-xs text-mist/70">
              Saving uploads only the generated formal portrait, not the raw selfie draft.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <PreviewFrame
            title="Formal Photo Preview"
            subtitle={generatedPhoto ? "This is the composited image that will be saved." : "Your private saved photo appears here immediately after upload."}
            src={visiblePreviewUrl}
            emptyText={previewFailed ? "The secure preview endpoint could not be loaded right now." : "Take a selfie or choose a portrait image to generate the formal-photo preview."}
            loading={Boolean(savedPhotoUrl) && !generatedPhoto && !securePreviewUrl && !previewFailed}
            badge={generatedPhoto ? (processing ? "Processing" : "Ready to save") : savedPhotoUrl ? "Saved" : undefined}
          />

          <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-xs text-mist/75">
            <p className="font-semibold uppercase tracking-[0.18em] text-gold-soft">Privacy</p>
            <p className="mt-2">
              This photo is kept separate from CMS media and applicant document uploads. It is meant for private member profile use and authorized internal reporting only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
