import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import axios from "axios";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";
import RichTextEditor from "../components/RichTextEditor";
import { htmlToPlainText, sanitizeRichHtml } from "../utils/richText";

const sectionOptions = [
  "homepage_hero",
  "homepage_community",
  "activities",
  "about",
  "history",
  "contact",
  "news",
];

const PAGE_SIZES = [
  { label: "Readable", value: 18 },
  { label: "Comfortable", value: 20 },
  { label: "Large", value: 22 },
];

const PREVIEW_TARGET_IMAGE_BYTES = 1.5 * 1024 * 1024;
const PREVIEW_MIN_IMAGE_BYTES = 250 * 1024;
const PREVIEW_IMAGE_MIME_ORDER = ["image/webp", "image/jpeg"] as const;
const CROP_FRAME_WIDTH = 320;
const CROP_FRAME_HEIGHT = 180;
const CROP_OUTPUT_WIDTH = 1920;
const CROP_OUTPUT_HEIGHT = 1080;

type FormState = {
  title: string;
  section: string;
  excerpt: string;
  content: string;
  status: "draft" | "published";
  is_featured: boolean;
  published_at: string;
  image: File | null;
};

type ProcessedImageMeta = {
  originalBytes: number;
  finalBytes: number;
  mimeType: string;
  width: number;
  height: number;
};

type CropState = {
  x: number;
  y: number;
  zoom: number;
};

type SourceImageState = {
  file: File;
  width: number;
  height: number;
};

const initialForm: FormState = {
  title: "",
  section: "homepage_community",
  excerpt: "",
  content: "",
  status: "published",
  is_featured: false,
  published_at: "",
  image: null,
};

function titleCaseWords(value: string): string {
  return value
    .split("_")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

function renderedCropDimensions(width: number, height: number, zoom: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: CROP_FRAME_WIDTH, height: CROP_FRAME_HEIGHT };
  }

  const frameAspect = CROP_FRAME_WIDTH / CROP_FRAME_HEIGHT;
  const imageAspect = width / height;

  const baseWidth = imageAspect > frameAspect
    ? CROP_FRAME_HEIGHT * imageAspect
    : CROP_FRAME_WIDTH;
  const baseHeight = imageAspect > frameAspect
    ? CROP_FRAME_HEIGHT
    : CROP_FRAME_WIDTH / imageAspect;

  return {
    width: baseWidth * zoom,
    height: baseHeight * zoom,
  };
}

function clampCropState(crop: CropState, source: SourceImageState): CropState {
  const safeZoom = Math.max(1, Math.min(3, crop.zoom));
  const rendered = renderedCropDimensions(source.width, source.height, safeZoom);
  const maxX = Math.max(0, (rendered.width - CROP_FRAME_WIDTH) / 2);
  const maxY = Math.max(0, (rendered.height - CROP_FRAME_HEIGHT) / 2);

  return {
    zoom: safeZoom,
    x: Math.max(-maxX, Math.min(maxX, crop.x)),
    y: Math.max(-maxY, Math.min(maxY, crop.y)),
  };
}

async function optimizeCroppedImageForUpload(
  source: SourceImageState,
  rawCrop: CropState,
): Promise<{ file: File; meta: ProcessedImageMeta }> {
  const crop = clampCropState(rawCrop, source);
  const image = await loadImage(source.file);

  const rendered = renderedCropDimensions(source.width, source.height, crop.zoom);
  const drawX = (CROP_FRAME_WIDTH - rendered.width) / 2 + crop.x;
  const drawY = (CROP_FRAME_HEIGHT - rendered.height) / 2 + crop.y;

  const sx = Math.max(0, (-drawX * source.width) / rendered.width);
  const sy = Math.max(0, (-drawY * source.height) / rendered.height);
  const sw = Math.min(source.width - sx, (CROP_FRAME_WIDTH * source.width) / rendered.width);
  const sh = Math.min(source.height - sy, (CROP_FRAME_HEIGHT * source.height) / rendered.height);

  const canvas = document.createElement("canvas");
  canvas.width = CROP_OUTPUT_WIDTH;
  canvas.height = CROP_OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return {
      file: source.file,
      meta: {
        originalBytes: source.file.size,
        finalBytes: source.file.size,
        mimeType: source.file.type || "application/octet-stream",
        width: source.width,
        height: source.height,
      },
    };
  }

  ctx.drawImage(
    image,
    sx,
    sy,
    Math.max(1, sw),
    Math.max(1, sh),
    0,
    0,
    CROP_OUTPUT_WIDTH,
    CROP_OUTPUT_HEIGHT,
  );

  let bestBlob: Blob | null = null;
  let bestMime = "image/webp";

  for (const mimeType of PREVIEW_IMAGE_MIME_ORDER) {
    const firstTry = await canvasToBlob(canvas, mimeType, 0.84);
    if (!firstTry) continue;

    let candidate = firstTry;
    let quality = 0.78;
    while (candidate.size > PREVIEW_TARGET_IMAGE_BYTES && candidate.size > PREVIEW_MIN_IMAGE_BYTES && quality >= 0.45) {
      const next = await canvasToBlob(canvas, mimeType, quality);
      if (!next) break;
      candidate = next;
      quality -= 0.07;
    }

    if (!bestBlob || candidate.size < bestBlob.size) {
      bestBlob = candidate;
      bestMime = mimeType;
    }

    if (candidate.size <= PREVIEW_TARGET_IMAGE_BYTES) {
      break;
    }
  }

  if (!bestBlob) {
    return {
      file: source.file,
      meta: {
        originalBytes: source.file.size,
        finalBytes: source.file.size,
        mimeType: source.file.type || "application/octet-stream",
        width: source.width,
        height: source.height,
      },
    };
  }

  const originalName = source.file.name.replace(/\.[^.]+$/, "");
  const extension = bestMime === "image/webp" ? "webp" : "jpg";
  const optimizedFile = new File([bestBlob], `${originalName}-crop.${extension}`, {
    type: bestMime,
    lastModified: Date.now(),
  });

  return {
    file: optimizedFile,
    meta: {
      originalBytes: source.file.size,
      finalBytes: optimizedFile.size,
      mimeType: bestMime,
      width: CROP_OUTPUT_WIDTH,
      height: CROP_OUTPUT_HEIGHT,
    },
  };
}

export default function CmsPosts() {
  const { user } = useAuth();
  const canManageCmsPosts = hasPermission(user, "posts.create");
  const canCreatePosts = hasPermission(user, "posts.create");
  const canUpdatePosts = hasPermission(user, "posts.update");
  const canDeletePosts = hasPermission(user, "posts.delete");
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const excerptChars = form.excerpt.length;
  const plainContent = useMemo(() => htmlToPlainText(form.content), [form.content]);
  const contentChars = plainContent.length;
  const contentWords = plainContent.trim() === "" ? 0 : plainContent.trim().split(/\s+/).length;
  const [previewFontSize, setPreviewFontSize] = useState(18);
  const [previewLayout, setPreviewLayout] = useState<"single" | "columns">("single");
  const [previewUploadUrl, setPreviewUploadUrl] = useState("");
  const [processingImage, setProcessingImage] = useState(false);
  const [processedImageMeta, setProcessedImageMeta] = useState<ProcessedImageMeta | null>(null);
  const [sourceImage, setSourceImage] = useState<SourceImageState | null>(null);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, zoom: 1 });
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const pointerDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const editingPost = editingId ? posts.find((p) => p.id === editingId) : null;
  const previewImageUrl = previewUploadUrl || editingPost?.image_url || "";
  const cropRendered = sourceImage
    ? renderedCropDimensions(sourceImage.width, sourceImage.height, crop.zoom)
    : { width: CROP_FRAME_WIDTH, height: CROP_FRAME_HEIGHT };

  const previewHtml = useMemo(() => sanitizeRichHtml(form.content), [form.content]);
  const previewWordCount = useMemo(
    () => (plainContent.trim().length ? plainContent.trim().split(/\s+/).length : 0),
    [plainContent],
  );
  const hasUnsavedDraft = useMemo(() => {
    if (editingId) return true;
    return (
      form.title.trim() !== "" ||
      form.excerpt.trim() !== "" ||
      htmlToPlainText(form.content).trim() !== "" ||
      form.image !== null ||
      sourceImage !== null
    );
  }, [editingId, form.title, form.excerpt, form.content, form.image, sourceImage]);

  function getApiErrorMessage(err: unknown): string {
    if (!axios.isAxiosError(err)) return "Unexpected error while saving post.";

    const data = err.response?.data as
      | { message?: string; errors?: Record<string, string[]> }
      | undefined;

    const validationMessage = data?.errors
      ? Object.values(data.errors).flat()[0]
      : "";

    return validationMessage || data?.message || `Request failed (${err.response?.status ?? "unknown"})`;
  }

  async function fetchPosts() {
    const res = await api.get("/cms/posts");
    const list = (res.data?.data ?? res.data) as CmsPost[];
    setPosts(Array.isArray(list) ? list : []);
  }

  useEffect(() => {
    if (!canManageCmsPosts) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        await fetchPosts();
      } catch {
        if (mounted) setError("Unable to load CMS posts.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [canManageCmsPosts]);

  useEffect(() => {
    if (!form.image) {
      setPreviewUploadUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(form.image);
    setPreviewUploadUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [form.image]);

  useEffect(() => {
    if (!sourceImage) {
      setSourceImageUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(sourceImage.file);
    setSourceImageUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [sourceImage]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !sourceImage) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const next = clampCropState(
        {
          zoom: crop.zoom,
          x: drag.originX + dx,
          y: drag.originY + dy,
        },
        sourceImage,
      );
      setCrop(next);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      pointerDragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [crop.zoom, sourceImage]);

  async function handleImageChange(file: File | null) {
    if (!file) {
      setForm((prev) => ({ ...prev, image: null }));
      setProcessedImageMeta(null);
      setSourceImage(null);
      setCrop({ x: 0, y: 0, zoom: 1 });
      return;
    }

    setProcessingImage(true);
    setError("");

    try {
      const image = await loadImage(file);
      const nextSource: SourceImageState = {
        file,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      };
      setSourceImage(nextSource);
      const initialCrop: CropState = { x: 0, y: 0, zoom: 1 };
      setCrop(initialCrop);

      const optimized = await optimizeCroppedImageForUpload(nextSource, initialCrop);
      setForm((prev) => ({ ...prev, image: optimized.file }));
      setProcessedImageMeta(optimized.meta);
    } catch {
      setForm((prev) => ({ ...prev, image: file }));
      setProcessedImageMeta({
        originalBytes: file.size,
        finalBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        width: 0,
        height: 0,
      });
      setSourceImage(null);
      setCrop({ x: 0, y: 0, zoom: 1 });
      setError("Image preview optimization failed. Original file will be uploaded.");
    } finally {
      setProcessingImage(false);
    }
  }

  async function applyCropToUpload() {
    if (!sourceImage) return;

    setProcessingImage(true);
    setError("");
    try {
      const optimized = await optimizeCroppedImageForUpload(sourceImage, crop);
      setForm((prev) => ({ ...prev, image: optimized.file }));
      setProcessedImageMeta(optimized.meta);
    } catch {
      setError("Unable to apply image crop. Keeping previous optimized preview.");
    } finally {
      setProcessingImage(false);
    }
  }

  async function uploadInlineImage(file: File): Promise<string> {
    const payload = new FormData();
    payload.append("image", file);
    const response = await api.post("/cms/uploads/inline-image", payload);
    const url = response.data?.url as string | undefined;
    if (!url) {
      throw new Error("Inline image upload failed.");
    }
    return url;
  }

  function handleCropFramePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sourceImage) return;

    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    pointerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: crop.x,
      originY: crop.y,
    };
  }

  function resetForm() {
    setForm(initialForm);
    setProcessedImageMeta(null);
    setSourceImage(null);
    setCrop({ x: 0, y: 0, zoom: 1 });
    setEditingId(null);
  }

  function cancelOrDiscardForm() {
    const confirmed = window.confirm(
      editingId
        ? "Cancel editing this post and discard unsaved changes?"
        : "Discard this draft?",
    );

    if (!confirmed) return;
    resetForm();
    setMessage("");
    setError("");
  }

  function startEdit(post: CmsPost) {
    if (!canUpdatePosts) return;

    setEditingId(post.id);
    setForm({
      title: post.title,
      section: post.section,
      excerpt: post.excerpt ?? "",
      content: post.content,
      status: post.status,
      is_featured: post.is_featured,
      published_at: toDateTimeLocal(post.published_at),
      image: null,
    });
    setMessage("");
    setError("");
    setProcessedImageMeta(null);
    setSourceImage(null);
    setCrop({ x: 0, y: 0, zoom: 1 });
  }

  async function submit() {
    if (!editingId && !canCreatePosts) {
      setError("You do not have permission to create posts.");
      return;
    }
    if (editingId && !canUpdatePosts) {
      setError("You do not have permission to edit posts.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      let imageToUpload = form.image;
      if (sourceImage) {
        const optimized = await optimizeCroppedImageForUpload(sourceImage, crop);
        imageToUpload = optimized.file;
        setProcessedImageMeta(optimized.meta);
      }

      const basePayload = {
        title: form.title,
        section: form.section,
        excerpt: form.excerpt,
        content: form.content,
        status: form.status,
        is_featured: form.is_featured ? 1 : 0,
        ...(form.published_at
          ? { published_at: new Date(form.published_at).toISOString() }
          : {}),
      };

      if (imageToUpload) {
        const payload = new FormData();
        payload.append("title", basePayload.title);
        payload.append("section", basePayload.section);
        payload.append("excerpt", basePayload.excerpt);
        payload.append("content", basePayload.content);
        payload.append("status", basePayload.status);
        payload.append("is_featured", String(basePayload.is_featured));
        if (basePayload.published_at) payload.append("published_at", basePayload.published_at);
        payload.append("image", imageToUpload);

        if (editingId) {
          payload.append("_method", "PUT");
          await api.post(`/cms/posts/${editingId}`, payload);
          setMessage("Post updated.");
        } else {
          await api.post("/cms/posts", payload);
          setMessage("Post created.");
        }
      } else if (editingId) {
        await api.put(`/cms/posts/${editingId}`, basePayload);
        setMessage("Post updated.");
      } else {
        await api.post("/cms/posts", basePayload);
        setMessage("Post created.");
      }

      await fetchPosts();
      resetForm();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!canDeletePosts) {
      setError("You do not have permission to delete posts.");
      return;
    }

    try {
      await api.delete(`/cms/posts/${id}`);
      if (editingId === id) resetForm();
      await fetchPosts();
      setMessage("Post deleted.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    }
  }

  if (!canManageCmsPosts) {
    return (
      <section>
        <h1 className="mb-2 font-heading text-4xl text-offwhite">CMS Posts</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to manage CMS posts.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 font-heading text-4xl text-offwhite">CMS Posts</h1>
      <p className="mb-6 text-sm text-mist/85">
        Publish articles for homepage, activities, about, history, and other sections.
      </p>
      <p className="mb-4 text-xs text-mist/75">
        Use <span className="text-gold-soft">homepage_hero</span> for homepage main hero content/image,
        and <span className="text-gold-soft">homepage_community</span> for the paginated Community In Action cards.
      </p>

      {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {message && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{message}</p>}

      <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-5">
        <h2 className="mb-4 font-heading text-2xl text-offwhite">
          {editingId ? "Edit Post" : "Create Post"}
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Post title"
            required
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70"
          />

          <select
            value={form.section}
            onChange={(e) => setForm((prev) => ({ ...prev, section: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite"
          >
            {sectionOptions.map((section) => (
              <option key={section} value={section} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                {titleCaseWords(section)}
              </option>
            ))}
          </select>

          <select
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as FormState["status"] }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite"
          >
            <option value="draft" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Draft</option>
            <option value="published" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Published</option>
          </select>

          <input
            type="datetime-local"
            value={form.published_at}
            onChange={(e) => setForm((prev) => ({ ...prev, published_at: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite"
          />

          <textarea
            value={form.excerpt}
            onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
            placeholder="Short excerpt (optional, up to 300 characters)"
            rows={3}
            maxLength={300}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 md:col-span-2"
          />
          <p className="md:col-span-2 -mt-2 text-right text-xs text-mist/75">
            Excerpt: {excerptChars}/300
          </p>

          <RichTextEditor
            value={form.content}
            onChange={(html) => setForm((prev) => ({ ...prev, content: html }))}
            onUploadImage={uploadInlineImage}
            disabled={saving || processingImage}
          />
          <p className="md:col-span-2 -mt-2 text-right text-xs text-mist/75">
            Content: {contentWords.toLocaleString()} words · {contentChars.toLocaleString()} text characters
            <span className="ml-2 text-gold-soft">(Rich text enabled: headings, links, lists, inline images)</span>
          </p>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              void handleImageChange(e.target.files?.[0] ?? null);
            }}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite md:col-span-2"
          />
          {sourceImage && sourceImageUrl && (
            <div className="md:col-span-2 rounded-lg border border-white/20 bg-white/5 p-3">
              <p className="mb-2 text-xs text-mist/80">
                Drag inside the frame to choose visible area. Only framed image will be resized and uploaded.
              </p>
              <div
                className="relative mx-auto h-[180px] w-[320px] overflow-hidden rounded-md border border-white/35 bg-ink/40 touch-none"
                onPointerDown={handleCropFramePointerDown}
              >
                <img
                  src={sourceImageUrl}
                  alt="Crop source"
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: `${cropRendered.width}px`,
                    height: `${cropRendered.height}px`,
                    transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))`,
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-mist/80">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={crop.zoom}
                    onChange={(e) => {
                      if (!sourceImage) return;
                      const next = clampCropState(
                        { ...crop, zoom: Number(e.target.value) },
                        sourceImage,
                      );
                      setCrop(next);
                    }}
                  />
                  <span className="w-10 text-right">{crop.zoom.toFixed(2)}x</span>
                </label>
                <button
                  type="button"
                  onClick={() => void applyCropToUpload()}
                  disabled={processingImage}
                  className="rounded-md border border-white/30 px-3 py-1.5 text-xs text-offwhite disabled:opacity-50"
                >
                  Apply Crop
                </button>
              </div>
            </div>
          )}
          <p className="md:col-span-2 -mt-2 text-xs text-mist/75">
            {processingImage && "Optimizing image for faster upload..."}
            {!processingImage && form.image && processedImageMeta && (
              <>
                Upload file: {humanFileSize(processedImageMeta.finalBytes)}
                {" · "}
                {processedImageMeta.width > 0 && processedImageMeta.height > 0
                  ? `${processedImageMeta.width}x${processedImageMeta.height}`
                  : "Original resolution"}
                {" · "}
                {processedImageMeta.mimeType}
                {processedImageMeta.finalBytes < processedImageMeta.originalBytes
                  ? ` · reduced from ${humanFileSize(processedImageMeta.originalBytes)}`
                  : ""}
              </>
            )}
            {!processingImage && !form.image && "Selected image will be auto-resized and compressed before upload."}
          </p>

          {editingId && (
            <div className="md:col-span-2">
              <p className="mb-2 text-xs text-mist/80">Current image preview</p>
              {editingPost?.image_url ? (
                <img
                  src={editingPost.image_url ?? ""}
                  alt="Current post"
                  className="h-36 w-full max-w-sm rounded-md border border-white/20 object-cover"
                />
              ) : (
                <p className="text-xs text-mist/70">No image attached to this post yet.</p>
              )}
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-sm text-offwhite">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => setForm((prev) => ({ ...prev, is_featured: e.target.checked }))}
            />
            Mark as featured
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={saving || processingImage || (!editingId && !canCreatePosts) || (editingId !== null && !canUpdatePosts)}
            className="btn-primary"
          >
            {processingImage ? "Processing image..." : saving ? "Saving..." : editingId ? "Update Post" : "Publish Post"}
          </button>

          {hasUnsavedDraft && (
            <button type="button" onClick={cancelOrDiscardForm} className="btn-secondary">
              {editingId ? "Cancel Edit" : "Discard Draft"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-5">
        <h2 className="mb-4 font-heading text-2xl text-offwhite">Live Article Preview</h2>
        <p className="mb-4 text-sm text-mist/80">
          Preview long-form readability before publishing.
        </p>

        <div className="mb-4 grid gap-3 rounded-lg border border-white/20 bg-white/5 p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <div className="text-xs text-mist/80">
            Rich preview · {previewWordCount.toLocaleString()} words
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewFontSize((v) => Math.max(15, v - 1))}
              className="rounded-md border border-white/30 px-3 py-1 text-sm"
            >
              A-
            </button>
            <span className="text-xs text-mist/80">{previewFontSize}px</span>
            <button
              type="button"
              onClick={() => setPreviewFontSize((v) => Math.min(24, v + 1))}
              className="rounded-md border border-white/30 px-3 py-1 text-sm"
            >
              A+
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewLayout("single")}
              className={`rounded-md border px-3 py-1 text-sm ${previewLayout === "single" ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
            >
              Single Column
            </button>
            <button
              type="button"
              onClick={() => setPreviewLayout("columns")}
              className={`rounded-md border px-3 py-1 text-sm ${previewLayout === "columns" ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
            >
              Multi Column
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <select
              value={previewFontSize}
              onChange={(e) => setPreviewFontSize(Number(e.target.value))}
              className="rounded-md border border-white/30 bg-white/10 px-3 py-1 text-sm text-offwhite"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size.value} value={size.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {size.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <article className="rounded-lg border border-white/20 bg-ink/35 p-4 md:p-6">
          {previewImageUrl && (
            <img
              src={previewImageUrl}
              alt={form.title || "Preview image"}
              className="mb-5 h-56 w-full rounded-md object-cover md:h-80"
            />
          )}

          <p className="text-xs uppercase tracking-[0.22em] text-gold-soft">
            {(form.section || "news").replaceAll("_", " ")}
          </p>
          <h3 className="mt-2 font-heading text-3xl leading-tight text-offwhite md:text-5xl">
            {form.title || "Article title preview"}
          </h3>
          {form.excerpt && (
            <p className="mt-4 text-mist/90">{form.excerpt}</p>
          )}

          <div
            className={`rich-content mt-5 leading-relaxed text-mist/90 ${previewLayout === "columns" ? "md:columns-2 xl:columns-3 md:gap-10" : "max-w-4xl"}`}
            style={{ fontSize: `${previewFontSize}px` }}
            dangerouslySetInnerHTML={{
              __html: previewHtml || "<p>Article content preview will appear here.</p>",
            }}
          >
          </div>
        </article>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/20 bg-white/10">
        <table className="min-w-full text-left text-sm text-offwhite">
          <thead className="bg-navy/70 text-gold-soft">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Image</th>
              <th className="px-4 py-3">Content</th>
              <th className="px-4 py-3">Section</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-mist/80">Loading posts...</td>
              </tr>
            )}

            {!loading && posts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-mist/80">No posts yet.</td>
              </tr>
            )}

            {!loading && posts.map((post) => (
              <tr key={post.id} className="border-t border-white/15">
                <td className="px-4 py-3">{post.title}</td>
                <td className="px-4 py-3">
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt={post.title}
                      className="h-14 w-24 rounded border border-white/20 object-cover"
                    />
                  ) : (
                    <span className="text-xs text-mist/75">No image</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-xs line-clamp-3 text-xs text-mist/85">
                    {post.excerpt || post.content}
                  </p>
                </td>
                <td className="px-4 py-3 capitalize">{post.section}</td>
                <td className="px-4 py-3">{post.status}</td>
                <td className="px-4 py-3 space-x-3">
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    disabled={!canUpdatePosts}
                    className="text-gold hover:underline disabled:opacity-45"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(post.id)}
                    disabled={!canDeletePosts}
                    className="text-red-300 hover:underline disabled:opacity-45"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
