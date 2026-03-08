import { useEffect, useMemo } from "react";

interface FileSelectionPreviewProps {
  id: string;
  label: string;
  accept?: string;
  capture?: "environment" | "user";
  file: File | null;
  buttonLabel?: string;
  helperText?: string;
  onChange: (file: File | null) => void;
  onClear?: () => void;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export default function FileSelectionPreview({
  id,
  label,
  accept,
  capture,
  file,
  buttonLabel = "Choose File",
  helperText,
  onChange,
  onClear,
}: FileSelectionPreviewProps) {
  const previewUrl = useMemo(() => {
    if (!file || !isImageFile(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const extensionLabel = useMemo(() => {
    if (!file) return "";
    const extension = file.name.split(".").pop()?.toUpperCase();
    return extension ? extension : "FILE";
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="w-full rounded-xl border border-white/15 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-mist/85">
            {label}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id={id}
              type="file"
              accept={accept}
              capture={capture}
              className="sr-only"
              onChange={(event) => onChange(event.target.files?.[0] ?? null)}
            />
            <label
              htmlFor={id}
              className="inline-flex cursor-pointer items-center rounded-md border border-gold/40 bg-offwhite px-3 py-2 text-sm font-semibold text-ink transition hover:border-gold hover:bg-white"
            >
              {buttonLabel}
            </label>
            <span className="min-w-0 truncate text-sm text-offwhite">
              {file ? file.name : "No file selected yet."}
            </span>
            {file && onClear && (
              <button
                type="button"
                className="rounded-md border border-white/25 px-3 py-2 text-xs font-semibold text-mist transition hover:border-white/45 hover:text-offwhite"
                onClick={onClear}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {helperText && <p className="mt-3 text-xs text-mist/70">{helperText}</p>}

      {file && (
        <div className="mt-4 rounded-lg border border-white/15 bg-navy/45 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold-soft">Selected File Preview</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/5 sm:w-36">
              {previewUrl ? (
                <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
                  <span className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-semibold text-gold-soft">
                    {extensionLabel}
                  </span>
                  <span className="px-2 text-[11px] text-mist/70">Thumbnail preview is available for image files.</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-offwhite">{file.name}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-mist/80">
                <span className="rounded-full border border-white/15 px-2 py-1">{file.type || "Unknown type"}</span>
                <span className="rounded-full border border-white/15 px-2 py-1">{formatFileSize(file.size)}</span>
              </div>
              {!previewUrl && (
                <p className="mt-3 text-xs text-mist/75">
                  PDF and non-image files show file details here. Image files render a thumbnail immediately after selection.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
