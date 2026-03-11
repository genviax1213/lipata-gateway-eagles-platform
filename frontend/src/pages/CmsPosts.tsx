import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import axios from "axios";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";
import FileSelectionPreview from "../components/FileSelectionPreview";
import RichTextEditor from "../components/RichTextEditor";
import { htmlToPlainText, parseApprovedVideoEmbed, sanitizeRichHtml } from "../utils/richText";
import { buildVideoThumbnailCandidates } from "../utils/video";

const sectionOptions = [
  "homepage_hero",
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
  post_type: "article" | "video";
  excerpt: string;
  content: string;
  video_url: string;
  video_thumbnail_url: string;
  video_thumbnail_text: string;
  status: "draft" | "published";
  is_featured: boolean;
  show_on_homepage_community: boolean;
  published_at: string;
  image: File | null;
  selected_image_path: string;
};

type AvailableCmsImage = {
  path: string;
  name: string;
  url: string;
  is_linked: boolean;
  links: Array<{
    post_id: number;
    title: string;
    slug: string;
    section: string;
    usage: string[];
  }>;
};

type PaginatedMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

type PaginatedResponse<T> = PaginatedMeta & {
  data: T[];
};

type ProcessedImageMeta = {
  originalBytes: number;
  finalBytes: number;
  mimeType: string;
  width: number;
  height: number;
};

type HomepageVideoSlotState = {
  video_url: string;
  title: string;
  caption: string;
  thumbnail_url: string;
  thumbnail_text: string;
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

type CmsTab = "editor" | "images" | "preview" | "posts" | "homepage";

const initialForm: FormState = {
  title: "",
  section: "activities",
  post_type: "article",
  excerpt: "",
  content: "",
  video_url: "",
  video_thumbnail_url: "",
  video_thumbnail_text: "",
  status: "published",
  is_featured: false,
  show_on_homepage_community: false,
  published_at: "",
  image: null,
  selected_image_path: "",
};

const initialHomepageVideoSlot: HomepageVideoSlotState = {
  video_url: "",
  title: "",
  caption: "",
  thumbnail_url: "",
  thumbnail_text: "",
};

function createHomepageVideoSlots(): HomepageVideoSlotState[] {
  return Array.from({ length: 3 }, () => ({ ...initialHomepageVideoSlot }));
}

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
  const currentUserId = typeof user?.id === "number" ? user.id : Number(user?.id ?? 0);
  const roleName = typeof (user?.role as { name?: unknown } | undefined)?.name === "string"
    ? String((user?.role as { name?: string }).name)
    : "";
  const financeRole = typeof (user as { finance_role?: unknown } | null)?.finance_role === "string"
    ? String((user as { finance_role?: string }).finance_role)
    : "";
  const hasAuthoredPosts = Boolean((user as { has_authored_posts?: unknown } | null)?.has_authored_posts);
  const hasCmsRoleAccess =
    hasPermission(user, "posts.create")
    || hasPermission(user, "posts.update")
    || hasPermission(user, "posts.delete")
    || roleName === "superadmin"
    || roleName === "admin"
    || roleName === "officer"
    || roleName === "secretary"
    || roleName === "membership_chairman"
    || financeRole === "treasurer"
    || financeRole === "auditor";
  const canManageCmsPosts = hasCmsRoleAccess || hasAuthoredPosts;
  const limitedMode = canManageCmsPosts && !hasCmsRoleAccess;
  const canCreatePosts = hasCmsRoleAccess;
  const canUpdatePosts = hasCmsRoleAccess;
  const canDeletePosts = hasPermission(user, "posts.delete") || roleName === "superadmin" || roleName === "admin";
  const canManageHomepageVideo = roleName === "superadmin" || roleName === "admin";
  const [activeTab, setActiveTab] = useState<CmsTab>(limitedMode ? "posts" : "editor");
  const [editorMode, setEditorMode] = useState<"article" | "video">("article");
  const [postsMode, setPostsMode] = useState<"article" | "video">("article");
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [postsMeta, setPostsMeta] = useState<PaginatedMeta>({ current_page: 1, last_page: 1, per_page: 12, total: 0 });
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [postQueryDraft, setPostQueryDraft] = useState("");
  const [postSectionFilterDraft, setPostSectionFilterDraft] = useState("");
  const [appliedPostQuery, setAppliedPostQuery] = useState("");
  const [appliedPostSectionFilter, setAppliedPostSectionFilter] = useState("");
  const [availableImages, setAvailableImages] = useState<AvailableCmsImage[]>([]);
  const [selectedCoverImage, setSelectedCoverImage] = useState<AvailableCmsImage | null>(null);
  const [imagesMeta, setImagesMeta] = useState<PaginatedMeta>({ current_page: 1, last_page: 1, per_page: 8, total: 0 });
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [imageFilterDraft, setImageFilterDraft] = useState<"all" | "linked" | "unlinked">("all");
  const [appliedImageFilter, setAppliedImageFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [imageQueryDraft, setImageQueryDraft] = useState("");
  const [appliedImageQuery, setAppliedImageQuery] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
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
  const [homepageVideoSlots, setHomepageVideoSlots] = useState<HomepageVideoSlotState[]>(() => createHomepageVideoSlots());
  const [homepageVideoLoaded, setHomepageVideoLoaded] = useState(false);
  const [savingHomepageVideo, setSavingHomepageVideo] = useState(false);
  const [homepageVideoUpdatedAt, setHomepageVideoUpdatedAt] = useState<string | null>(null);
  const pointerDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const editingPost = editingId ? posts.find((p) => p.id === editingId) : null;
  const selectedLibraryImage = useMemo(
    () => selectedCoverImage ?? availableImages.find((image) => image.path === form.selected_image_path) ?? null,
    [availableImages, form.selected_image_path, selectedCoverImage],
  );
  const previewImageUrl = previewUploadUrl || selectedLibraryImage?.url || editingPost?.image_url || "";
  const cropRendered = sourceImage
    ? renderedCropDimensions(sourceImage.width, sourceImage.height, crop.zoom)
    : { width: CROP_FRAME_WIDTH, height: CROP_FRAME_HEIGHT };

  const previewHtml = useMemo(() => sanitizeRichHtml(form.content), [form.content]);
  const previewVideoThumbnailUrl = useMemo(
    () => buildVideoThumbnailCandidates({
      thumbnailUrl: form.video_thumbnail_url,
      sourceUrl: form.video_url,
      embedUrl: "",
    })[0] ?? "",
    [form.video_thumbnail_url, form.video_url],
  );
  const homepageVideoPreviews = useMemo(
    () => homepageVideoSlots.map((slot) => parseApprovedVideoEmbed(slot.video_url)),
    [homepageVideoSlots],
  );
  const previewWordCount = useMemo(
    () => (plainContent.trim().length ? plainContent.trim().split(/\s+/).length : 0),
    [plainContent],
  );
  const hasUnsavedDraft = useMemo(() => {
    if (editingId) return true;
    return (
      form.title.trim() !== "" ||
      form.excerpt.trim() !== "" ||
      form.video_url.trim() !== "" ||
      form.video_thumbnail_url.trim() !== "" ||
      form.video_thumbnail_text.trim() !== "" ||
      htmlToPlainText(form.content).trim() !== "" ||
      form.image !== null ||
      form.selected_image_path !== "" ||
      sourceImage !== null
    );
  }, [editingId, form.title, form.excerpt, form.video_url, form.video_thumbnail_url, form.video_thumbnail_text, form.content, form.image, form.selected_image_path, sourceImage]);
  const submitDisabled = saving
    || processingImage
    || (!editingId && !canCreatePosts)
    || (editingId !== null && (!editingPost || !canEditPost(editingPost)));

  function isOwnPost(post: CmsPost): boolean {
    if (post.is_owned !== undefined) return Boolean(post.is_owned);
    return Boolean(post.author?.id && post.author.id === currentUserId);
  }

  function canEditPost(post: CmsPost): boolean {
    if (post.can_edit !== undefined) return Boolean(post.can_edit);
    if (canUpdatePosts) return true;
    return isOwnPost(post);
  }

  function canDeletePost(post: CmsPost): boolean {
    if (post.can_delete !== undefined) return Boolean(post.can_delete);
    if (canDeletePosts) return true;
    return limitedMode && isOwnPost(post);
  }

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

  function draftReferencesImage(image: AvailableCmsImage): boolean {
    if (form.selected_image_path === image.path) {
      return true;
    }

    return form.content.includes(image.url) || form.content.includes(image.path);
  }

  const fetchPosts = useCallback(async (page = 1, overrides?: { q?: string; section?: string; post_type?: "article" | "video" }) => {
    const params = {
      page,
      per_page: 12,
      q: overrides?.q ?? (appliedPostQuery || undefined),
      section: overrides?.section ?? (appliedPostSectionFilter || undefined),
      post_type: overrides?.post_type ?? postsMode,
    };
    const res = await api.get<PaginatedResponse<CmsPost>>("/cms/posts", { params });
    setPosts(Array.isArray(res.data?.data) ? res.data.data : []);
    setPostsMeta({
      current_page: Number(res.data?.current_page ?? 1),
      last_page: Number(res.data?.last_page ?? 1),
      per_page: Number(res.data?.per_page ?? 12),
      total: Number(res.data?.total ?? 0),
    });
    setPostsLoaded(true);
  }, [appliedPostQuery, appliedPostSectionFilter, postsMode]);

  const fetchAvailableImages = useCallback(async (page = 1, overrides?: { q?: string; linkState?: "all" | "linked" | "unlinked" }) => {
    const params = {
      page,
      per_page: 8,
      q: overrides?.q ?? (appliedImageQuery || undefined),
      link_state: overrides?.linkState ?? appliedImageFilter,
    };
    const res = await api.get<PaginatedResponse<AvailableCmsImage>>("/cms/posts/image-library", { params });
    setAvailableImages(Array.isArray(res.data?.data) ? res.data.data : []);
    setImagesMeta({
      current_page: Number(res.data?.current_page ?? 1),
      last_page: Number(res.data?.last_page ?? 1),
      per_page: Number(res.data?.per_page ?? 8),
      total: Number(res.data?.total ?? 0),
    });
    setImagesLoaded(true);
  }, [appliedImageFilter, appliedImageQuery]);

  async function pickExistingInlineImage(): Promise<string | null> {
    if (limitedMode) {
      setError("Shared image library is unavailable in My Posts mode.");
      setMessage("");
      return null;
    }

    setActiveTab("images");
    setError("");
    setMessage("Open Image Library and use 'Insert into article' on the image you want to reuse.");
    if (!imagesLoaded) {
      await runImageSearch();
    }
    return null;
  }

  function selectLibraryImageAsCover(image: AvailableCmsImage) {
    setForm((prev) => ({
      ...prev,
      selected_image_path: image.path,
      image: null,
    }));
    setSelectedCoverImage(image);
    setProcessedImageMeta(null);
    setSourceImage(null);
    setCrop({ x: 0, y: 0, zoom: 1 });
    setMessage(`Selected ${image.name} as the post cover image.`);
    setError("");
    setActiveTab("editor");
  }

  function insertLibraryImageIntoContent(image: AvailableCmsImage) {
    const escapedName = image.name
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

    setForm((prev) => ({
      ...prev,
      content: `${prev.content}${prev.content.trim() ? "<p></p>" : ""}<p><img src="${image.url}" alt="${escapedName}" /></p>`,
    }));
    setMessage(`Inserted ${image.name} into the article content.`);
    setError("");
    setActiveTab("editor");
  }

  async function deleteLibraryImage(image: AvailableCmsImage) {
    if (!canDeletePosts) {
      setError("You do not have permission to delete CMS images.");
      return;
    }

    if (draftReferencesImage(image)) {
      setError("This image is referenced in the current draft. Remove it from the draft before deleting it from the library.");
      return;
    }

    const confirmed = window.confirm(`Delete ${image.name} from the image library?`);
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      await api.delete("/cms/posts/image-library", {
        data: { path: image.path },
      });

      if (form.selected_image_path === image.path) {
        setForm((prev) => ({ ...prev, selected_image_path: "" }));
      }

      setMessage(`${image.name} deleted from the image library.`);
      if (imagesLoaded) {
        await runImageSearch(imagesMeta.current_page);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    }
  }

  async function copyImageUrl(image: AvailableCmsImage) {
    try {
      await navigator.clipboard.writeText(image.url);
      setError("");
      setMessage(`${image.name} URL copied.`);
    } catch {
      setError("Unable to copy image URL in this browser.");
    }
  }

  const runPostSearch = useCallback(async (page = 1) => {
    setError("");
    try {
      await fetchPosts(page, {
        q: appliedPostQuery,
        section: appliedPostSectionFilter,
        post_type: postsMode,
      });
    } catch {
      setError("Unable to load CMS posts.");
    }
  }, [appliedPostQuery, appliedPostSectionFilter, fetchPosts]);

  async function applyPostSearch() {
    const nextQuery = postQueryDraft.trim();
    const nextSection = postSectionFilterDraft;
    setAppliedPostQuery(nextQuery);
    setAppliedPostSectionFilter(nextSection);
    setError("");
    try {
      await fetchPosts(1, {
        q: nextQuery,
        section: nextSection,
        post_type: postsMode,
      });
    } catch {
      setError("Unable to load CMS posts.");
    }
  }

  const runImageSearch = useCallback(async (page = 1) => {
    setError("");
    try {
      await fetchAvailableImages(page, {
        q: appliedImageQuery,
        linkState: appliedImageFilter,
      });
    } catch {
      setError("Unable to load image library.");
    }
  }, [appliedImageFilter, appliedImageQuery, fetchAvailableImages]);

  async function applyImageSearch() {
    const nextQuery = imageQueryDraft.trim();
    const nextFilter = imageFilterDraft;
    setAppliedImageQuery(nextQuery);
    setAppliedImageFilter(nextFilter);
    setError("");
    try {
      await fetchAvailableImages(1, {
        q: nextQuery,
        linkState: nextFilter,
      });
    } catch {
      setError("Unable to load image library.");
    }
  }

  useEffect(() => {
    if (!canManageCmsPosts) return;
    if (!limitedMode && activeTab === "images" && !imagesLoaded) {
      void runImageSearch(1);
    }
    if (activeTab === "posts" && !postsLoaded) {
      void runPostSearch(1);
    }
  }, [activeTab, canManageCmsPosts, imagesLoaded, limitedMode, postsLoaded, runImageSearch, runPostSearch]);

  useEffect(() => {
    if (activeTab !== "posts" || !postsLoaded) return;
    void runPostSearch(1);
  }, [activeTab, postsLoaded, postsMode, runPostSearch]);

  const loadHomepageVideo = useCallback(async () => {
    if (!canManageHomepageVideo) return;

    try {
      const response = await api.get<{
        videos?: Array<{
          title?: string | null;
          caption?: string | null;
          thumbnail_url?: string | null;
          thumbnail_text?: string | null;
          source_url?: string | null;
        }>;
        updated_at?: string | null;
      }>("/homepage/reputation-video");

      const slots = createHomepageVideoSlots();
      (response.data?.videos ?? []).slice(0, 3).forEach((video, index) => {
        slots[index] = {
          video_url: video?.source_url ?? "",
          title: video?.title ?? "",
          caption: video?.caption ?? "",
          thumbnail_url: video?.thumbnail_url ?? "",
          thumbnail_text: video?.thumbnail_text ?? "",
        };
      });
      setHomepageVideoSlots(slots);
      setHomepageVideoUpdatedAt(response.data?.updated_at ?? null);
      setHomepageVideoLoaded(true);
    } catch {
      setHomepageVideoLoaded(true);
      setError("Unable to load homepage reputation video settings.");
    }
  }, [canManageHomepageVideo]);

  useEffect(() => {
    if (!canManageHomepageVideo || homepageVideoLoaded || activeTab !== "homepage") return;
    void loadHomepageVideo();
  }, [activeTab, canManageHomepageVideo, homepageVideoLoaded, loadHomepageVideo]);

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
    if (!form.selected_image_path) {
      setSelectedCoverImage(null);
      return;
    }

    const matchedImage = availableImages.find((image) => image.path === form.selected_image_path);
    if (matchedImage) {
      setSelectedCoverImage(matchedImage);
    }
  }, [availableImages, form.selected_image_path]);

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
    setEditorMode("article");
    setSelectedCoverImage(null);
    setProcessedImageMeta(null);
    setSourceImage(null);
    setCrop({ x: 0, y: 0, zoom: 1 });
    setEditingId(null);
    setActiveTab(limitedMode ? "posts" : "editor");
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
    if (!canEditPost(post)) return;

    setEditingId(post.id);
    setActiveTab("editor");
    setEditorMode(post.post_type);
    setForm({
      title: post.title,
      section: post.section,
      post_type: post.post_type,
      excerpt: post.excerpt ?? "",
      content: post.content,
      video_url: post.video_url ?? "",
      video_thumbnail_url: post.video_thumbnail_url ?? "",
      video_thumbnail_text: post.video_thumbnail_text ?? "",
      status: post.status,
      is_featured: post.is_featured,
      show_on_homepage_community: post.show_on_homepage_community,
      published_at: toDateTimeLocal(post.published_at),
      image: null,
      selected_image_path: "",
    });
    setMessage("");
    setError("");
    setSelectedCoverImage(null);
    setProcessedImageMeta(null);
    setSourceImage(null);
    setCrop({ x: 0, y: 0, zoom: 1 });
  }

  async function submit() {
    if (!editingId && !canCreatePosts) {
      setError("You do not have permission to create posts.");
      return;
    }
    if (editingId && editingPost && !canEditPost(editingPost)) {
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
        post_type: form.post_type,
        excerpt: form.excerpt,
        content: form.content,
        video_url: form.post_type === "video" ? form.video_url : "",
        video_thumbnail_url: form.post_type === "video" ? form.video_thumbnail_url : "",
        video_thumbnail_text: form.post_type === "video" ? form.video_thumbnail_text : "",
        status: form.status,
        is_featured: form.is_featured ? 1 : 0,
        show_on_homepage_community: form.show_on_homepage_community ? 1 : 0,
        ...(form.selected_image_path ? { selected_image_path: form.selected_image_path } : {}),
        ...(form.published_at
          ? { published_at: new Date(form.published_at).toISOString() }
          : {}),
      };

      if (imageToUpload && form.post_type !== "video") {
        const payload = new FormData();
        payload.append("title", basePayload.title);
        payload.append("section", basePayload.section);
        payload.append("post_type", basePayload.post_type);
        payload.append("excerpt", basePayload.excerpt);
        payload.append("content", basePayload.content);
        payload.append("video_url", basePayload.video_url);
        payload.append("video_thumbnail_url", basePayload.video_thumbnail_url);
        payload.append("video_thumbnail_text", basePayload.video_thumbnail_text);
        payload.append("status", basePayload.status);
        payload.append("is_featured", String(basePayload.is_featured));
        payload.append("show_on_homepage_community", String(basePayload.show_on_homepage_community));
        if (basePayload.published_at) payload.append("published_at", basePayload.published_at);
        if (basePayload.selected_image_path) payload.append("selected_image_path", basePayload.selected_image_path);
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

      if (postsLoaded) await runPostSearch(postsMeta.current_page);
      if (imagesLoaded) await runImageSearch(imagesMeta.current_page);
      resetForm();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveHomepageVideo() {
    if (!canManageHomepageVideo) {
      setError("You do not have permission to manage the homepage reputation video.");
      return;
    }

    setSavingHomepageVideo(true);
    setError("");
    setMessage("");

    try {
      const response = await api.put<{
        updated_at?: string | null;
      }>("/homepage/reputation-video", {
        videos: homepageVideoSlots.map((slot) => ({
          video_url: slot.video_url.trim() || null,
          title: slot.title.trim() || null,
          caption: slot.caption.trim() || null,
          thumbnail_url: slot.thumbnail_url.trim() || null,
          thumbnail_text: slot.thumbnail_text.trim() || null,
        })),
      });

      setHomepageVideoUpdatedAt(response.data?.updated_at ?? null);
      setHomepageVideoLoaded(true);
      setMessage(
        homepageVideoSlots.some((slot) => (
          slot.video_url.trim()
          || slot.title.trim()
          || slot.caption.trim()
          || slot.thumbnail_url.trim()
          || slot.thumbnail_text.trim()
        ))
          ? "Homepage reputation video updated."
          : "Homepage reputation video cleared.",
      );
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setSavingHomepageVideo(false);
    }
  }

  function updateHomepageVideoSlot(
    index: number,
    field: keyof HomepageVideoSlotState,
    value: string,
  ) {
    setHomepageVideoSlots((prev) => prev.map((slot, slotIndex) => (
      slotIndex === index ? { ...slot, [field]: value } : slot
    )));
  }

  function clearHomepageVideoSlots() {
    setHomepageVideoSlots(createHomepageVideoSlots());
    setHomepageVideoUpdatedAt(null);
    setMessage("Homepage video form cleared. Save to remove it from the site.");
    setError("");
  }

  async function remove(id: number) {
    const targetPost = posts.find((post) => post.id === id);
    if (!targetPost || !canDeletePost(targetPost)) {
      setError("You do not have permission to delete posts.");
      return;
    }

    try {
      await api.delete(`/cms/posts/${id}`);
      if (editingId === id) resetForm();
      if (postsLoaded) {
        await runPostSearch(postsMeta.current_page);
      }
      if (imagesLoaded) {
        await runImageSearch(imagesMeta.current_page);
      }
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
      <h1 className="mb-2 font-heading text-4xl text-offwhite">{limitedMode ? "My Posts" : "CMS Posts"}</h1>
      <p className="mb-6 text-sm text-mist/85">
        {limitedMode
          ? "Review and manage only the posts you authored. Creating new posts and opening the shared image library are disabled in this mode."
          : <>Publish article and video posts for the website sections. Use <span className="text-gold-soft">Show on Homepage Community</span> to include an activity in the homepage carousel.</>}
      </p>

      {error && <p className="mb-4 rounded-md border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p>}
      {message && <p className="mb-4 rounded-md border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold-soft">{message}</p>}
      <div className="mb-6 flex flex-wrap gap-2">
        {([
          ...((!limitedMode || editingId !== null) ? [["editor-article", editingId && form.post_type === "article" ? "Edit Article" : "Create Article"]] as const : []),
          ...((!limitedMode || editingId !== null) ? [["editor-video", editingId && form.post_type === "video" ? "Edit Video" : "Create Video"]] as const : []),
          ...(canManageHomepageVideo && !limitedMode ? [["homepage", "Homepage Video"]] as const : []),
          ...(!limitedMode ? [["images", "Image Library"]] as const : []),
          ["preview", "Live Preview"],
          ["posts-article", limitedMode ? "My Articles" : "Articles"],
          ["posts-video", limitedMode ? "My Videos" : "Videos"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              if (tab === "editor-article") {
                setActiveTab("editor");
                setEditorMode("article");
                setForm((prev) => ({ ...prev, post_type: "article" }));
                return;
              }
              if (tab === "editor-video") {
                setActiveTab("editor");
                setEditorMode("video");
                setForm((prev) => ({ ...prev, post_type: "video", content: "", image: null, selected_image_path: "" }));
                setSelectedCoverImage(null);
                setProcessedImageMeta(null);
                setSourceImage(null);
                setCrop({ x: 0, y: 0, zoom: 1 });
                return;
              }
              if (tab === "posts-article") {
                setActiveTab("posts");
                setPostsMode("article");
                return;
              }
              if (tab === "posts-video") {
                setActiveTab("posts");
                setPostsMode("video");
                return;
              }
              setActiveTab(tab as CmsTab);
            }}
            className={`rounded-md border px-4 py-2 text-sm ${
              (tab === "editor-article" && activeTab === "editor" && editorMode === "article")
              || (tab === "editor-video" && activeTab === "editor" && editorMode === "video")
              || (tab === "posts-article" && activeTab === "posts" && postsMode === "article")
              || (tab === "posts-video" && activeTab === "posts" && postsMode === "video")
              || activeTab === tab
                ? "border-gold bg-gold text-ink"
                : "border-white/25 text-offwhite"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "editor" && (!limitedMode || editingId !== null) && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-5">
          <h2 className="mb-4 font-heading text-2xl text-offwhite">
            {editingId
              ? (form.post_type === "video" ? "Edit Video Post" : "Edit Article Post")
              : (editorMode === "video" ? "Create Video Post" : "Create Article Post")}
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
          <input
            aria-label="Post title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Post title"
            required
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70"
          />

          <select
            aria-label="Post section"
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
            aria-label="Post status"
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as FormState["status"] }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite"
          >
            <option value="draft" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Draft</option>
            <option value="published" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Published</option>
          </select>

          <input
            aria-label="Post publish date and time"
            type="datetime-local"
            value={form.published_at}
            onChange={(e) => setForm((prev) => ({ ...prev, published_at: e.target.value }))}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite"
          />

          <textarea
            aria-label="Post excerpt"
            value={form.excerpt}
            onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
            placeholder={form.post_type === "video" ? "Short video caption (optional, up to 300 characters)" : "Short excerpt (optional, up to 300 characters)"}
            rows={3}
            maxLength={300}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 md:col-span-2"
          />
          <p className="md:col-span-2 -mt-2 text-right text-xs text-mist/75">
            Excerpt: {excerptChars}/300
          </p>

          {form.post_type === "article" ? (
            <>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setForm((prev) => ({ ...prev, content: html }))}
                onUploadImage={uploadInlineImage}
                onPickExistingImage={pickExistingInlineImage}
                disabled={saving || processingImage}
              />
              <p className="md:col-span-2 -mt-2 text-right text-xs text-mist/75">
                Content: {contentWords.toLocaleString()} words · {contentChars.toLocaleString()} text characters
                <span className="ml-2 text-gold-soft">(Rich text enabled: headings, links, lists, inline images, YouTube/Facebook video links)</span>
              </p>

              <div className="md:col-span-2 text-sm text-offwhite">
                <span className="mb-2 block font-medium">Upload Cover Image</span>
                <span className="mb-3 block text-xs text-mist/75">
                  This image is used as the post card/header image. Inline article images should be inserted from the rich text editor toolbar.
                </span>
                <FileSelectionPreview
                  id="post-cover-image-upload"
                  label="Cover Image File"
                  accept="image/*"
                  file={sourceImage?.file ?? null}
                  buttonLabel="Choose Cover Image"
                  helperText="After selection, drag inside the crop frame below. The saved cover is cropped to 16:9 and resized to 1920x1080 before upload."
                  onChange={(file) => {
                    if (file) {
                      setForm((prev) => ({ ...prev, selected_image_path: "" }));
                      setSelectedCoverImage(null);
                    }
                    void handleImageChange(file);
                  }}
                  onClear={() => {
                    void handleImageChange(null);
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <input
                aria-label="Video URL"
                value={form.video_url}
                onChange={(e) => setForm((prev) => ({ ...prev, video_url: e.target.value }))}
                placeholder="Paste YouTube or Facebook video URL"
                className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 md:col-span-2"
              />
              <input
                aria-label="Video thumbnail override URL"
                value={form.video_thumbnail_url}
                onChange={(e) => setForm((prev) => ({ ...prev, video_thumbnail_url: e.target.value }))}
                placeholder="Optional thumbnail image URL override"
                className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 md:col-span-2"
              />
              <input
                aria-label="Video thumbnail text"
                value={form.video_thumbnail_text}
                onChange={(e) => setForm((prev) => ({ ...prev, video_thumbnail_text: e.target.value }))}
                placeholder="Optional thumbnail text overlay"
                maxLength={120}
                className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 md:col-span-2"
              />
              <p className="md:col-span-2 -mt-2 text-right text-xs text-mist/75">
                Video posts reuse the same public card width as articles. Activities search will match title, caption, and thumbnail text.
              </p>
            </>
          )}
          {form.post_type === "article" && selectedLibraryImage && (
            <div className="md:col-span-2 rounded-lg border border-gold/30 bg-gold/10 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <img
                  src={selectedLibraryImage.url}
                  alt={selectedLibraryImage.name}
                  className="h-16 w-28 rounded border border-white/20 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-offwhite">
                    {editingId ? "Selected replacement cover image" : "Selected library cover image"}: {selectedLibraryImage.name}
                  </p>
                  <p className="text-xs text-mist/80">
                    {selectedLibraryImage.is_linked ? "Reusable linked image" : "Reusable library image"}
                    {editingId ? " · Current saved cover remains active until you save this replacement." : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, selected_image_path: "" }));
                    setSelectedCoverImage(null);
                  }}
                  className="rounded-md border border-white/30 px-3 py-1.5 text-xs text-offwhite"
                >
                  {editingId ? "Clear replacement" : "Clear"}
                </button>
              </div>
            </div>
          )}
          {form.post_type === "article" && sourceImage && sourceImageUrl && (
            <div className="md:col-span-2 rounded-lg border border-white/20 bg-white/5 p-3">
              <p className="mb-2 text-xs text-mist/80">
                Drag inside the frame to choose visible area. Only the framed cover is cropped, resized to 1920x1080, and uploaded.
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
                  Apply Crop & Resize
                </button>
              </div>
            </div>
          )}
          {form.post_type === "article" && <p className="md:col-span-2 -mt-2 text-xs text-mist/75">
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
          </p>}

          {form.post_type === "article" && editingId && (
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
          <label className="inline-flex items-center gap-2 text-sm text-offwhite">
            <input
              type="checkbox"
              checked={form.show_on_homepage_community}
              onChange={(e) => setForm((prev) => ({ ...prev, show_on_homepage_community: e.target.checked }))}
            />
            Show on Homepage Community
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={submitDisabled}
            className="btn-primary"
          >
            {processingImage ? "Processing image..." : saving ? "Saving..." : editingId ? `Update ${form.post_type === "video" ? "Video" : "Post"}` : `Publish ${form.post_type === "video" ? "Video" : "Post"}`}
          </button>

          {hasUnsavedDraft && (
            <button type="button" onClick={cancelOrDiscardForm} className="btn-secondary">
              {editingId ? "Cancel Edit" : "Discard Draft"}
            </button>
          )}
          </div>
        </div>
      )}

      {activeTab === "homepage" && canManageHomepageVideo && !limitedMode && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-2xl text-offwhite">Homepage Reputation Video</h2>
              <p className="mt-2 max-w-3xl text-sm text-mist/80">
                Add up to three reputation videos for the landing hero. The site renders them as compact centered
                thumbnails below the CTA, and opens each one in a modal player when clicked. Only YouTube and
                Facebook links are allowed here to keep the homepage stable and reviewable.
              </p>
            </div>
            {homepageVideoUpdatedAt && (
              <p className="text-xs text-mist/70">
                Last updated {new Date(homepageVideoUpdatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {!homepageVideoLoaded ? (
            <p className="text-sm text-mist/80">Loading homepage video settings...</p>
          ) : (
            <>
              <div className="space-y-5">
                {homepageVideoSlots.map((slot, index) => {
                  const preview = homepageVideoPreviews[index];
                  const slotNumber = index + 1;

                  return (
                    <div key={`homepage-video-slot-${slotNumber}`} className="rounded-lg border border-white/15 bg-ink/35 p-4">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-gold-soft">Video Slot {slotNumber}</p>
                          <p className="mt-2 text-sm text-mist/78">
                            Leave the fields blank to keep this slot empty.
                          </p>
                        </div>
                        <p className="text-xs text-mist/70">
                          {preview
                            ? `Approved provider: ${preview.provider === "youtube" ? "YouTube" : "Facebook"}`
                            : "Awaiting a valid YouTube or Facebook link"}
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block text-sm text-offwhite">
                          <span className="mb-2 block text-mist/80">Video URL</span>
                          <input
                            value={slot.video_url}
                            onChange={(event) => updateHomepageVideoSlot(index, "video_url", event.target.value)}
                            placeholder="Paste YouTube or Facebook video URL"
                            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/65"
                          />
                        </label>

                        <label className="block text-sm text-offwhite">
                          <span className="mb-2 block text-mist/80">Thumbnail URL</span>
                          <input
                            value={slot.thumbnail_url}
                            onChange={(event) => updateHomepageVideoSlot(index, "thumbnail_url", event.target.value)}
                            placeholder="Optional thumbnail image URL"
                            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/65"
                          />
                        </label>

                        <label className="block text-sm text-offwhite">
                          <span className="mb-2 block text-mist/80">Dialog Title</span>
                          <input
                            value={slot.title}
                            onChange={(event) => updateHomepageVideoSlot(index, "title", event.target.value)}
                            placeholder="Watch LGEC in action"
                            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/65"
                          />
                        </label>

                        <label className="block text-sm text-offwhite">
                          <span className="mb-2 block text-mist/80">Dialog Caption</span>
                          <input
                            value={slot.caption}
                            onChange={(event) => updateHomepageVideoSlot(index, "caption", event.target.value)}
                            placeholder="Short supporting line inside the popup"
                            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/65"
                          />
                        </label>

                        <label className="block text-sm text-offwhite md:col-span-2">
                          <span className="mb-2 block text-mist/80">Thumbnail Text</span>
                          <input
                            value={slot.thumbnail_text}
                            onChange={(event) => updateHomepageVideoSlot(index, "thumbnail_text", event.target.value)}
                            placeholder="Text shown directly on the video thumbnail"
                            maxLength={80}
                            className="w-full rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/65"
                          />
                        </label>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
                        <div className="overflow-hidden rounded-2xl border border-white/18 bg-white/8">
                          <div className="relative h-44 overflow-hidden">
                            {slot.thumbnail_url ? (
                              <img
                                src={slot.thumbnail_url}
                                alt={slot.title || `Homepage reputation video ${slotNumber}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(243,219,152,0.22),transparent_52%),linear-gradient(150deg,rgba(9,24,46,0.96),rgba(20,48,88,0.85))] text-gold-soft">
                                Thumbnail Preview
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/35 to-transparent" />
                            {slot.thumbnail_text.trim() ? (
                              <div className="absolute inset-x-0 bottom-0 p-4">
                                <p className="text-lg font-semibold leading-tight text-offwhite drop-shadow-[0_3px_18px_rgba(2,6,23,0.85)]">
                                  {slot.thumbnail_text.trim()}
                                </p>
                              </div>
                            ) : null}
                          </div>
                          <div className="p-4">
                            <p className="text-sm font-semibold text-offwhite">
                              {slot.title.trim() || `LGEC Highlight ${slotNumber}`}
                            </p>
                            <p className="mt-2 text-sm text-mist/80">
                              {slot.caption.trim() || "Compact homepage video trigger."}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/15 bg-white/6 p-4">
                          <p className="text-sm text-mist/80">
                            {preview
                              ? "This video is valid and can appear in the centered hero stack."
                              : "Enter a valid YouTube or Facebook URL to activate this slot."}
                          </p>
                          <p className="mt-3 text-sm text-mist/72">
                            Browser security policy can block inline provider previews here even when the video is
                            public. Save the links, then verify them from the homepage popup or open the source
                            directly.
                          </p>
                          {preview && (
                            <a
                              href={preview.canonicalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-4 inline-flex rounded-full border border-gold/35 px-4 py-2 text-sm font-semibold text-gold-soft transition hover:bg-gold/10 hover:text-gold"
                            >
                              Open source video
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void saveHomepageVideo()}
                  disabled={savingHomepageVideo}
                  className="btn-primary"
                >
                  {savingHomepageVideo ? "Saving..." : "Save Homepage Videos"}
                </button>
                <button
                  type="button"
                  onClick={clearHomepageVideoSlots}
                  disabled={savingHomepageVideo}
                  className="btn-secondary"
                >
                  Clear All Slots
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "images" && !limitedMode && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-5">
          <h2 className="mb-4 font-heading text-2xl text-offwhite">Image Library</h2>
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            <input
              aria-label="Image library search"
              value={imageQueryDraft}
              onChange={(e) => setImageQueryDraft(e.target.value)}
              placeholder="Search image name or linked post title"
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70"
            />
            <select
              aria-label="Image library filter"
              value={imageFilterDraft}
              onChange={(e) => setImageFilterDraft(e.target.value as "all" | "linked" | "unlinked")}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite"
            >
              <option value="all" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All</option>
              <option value="linked" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Linked</option>
              <option value="unlinked" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>Unlinked</option>
            </select>
            <button type="button" onClick={() => void applyImageSearch()} className="btn-secondary">
              Search
            </button>
          </div>

          {!imagesLoaded ? (
            <p className="text-sm text-mist/80">Loading image results...</p>
          ) : availableImages.length === 0 ? (
            <p className="text-sm text-mist/80">No images found for the current search.</p>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-white/20 bg-white/5 p-3 text-sm text-mist/80">
                Use the library to reuse uploaded images across posts. Cover images can be attached directly. Inline images can be inserted into the article content. Only unlinked images can be deleted.
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {availableImages.map((image) => (
                  <label
                    key={image.path}
                    className={`rounded-md border p-2 ${form.selected_image_path === image.path ? "border-gold/70 bg-gold/10" : "border-white/20 bg-white/5"}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="selected-library-cover-image"
                        checked={form.selected_image_path === image.path}
                        onChange={() => selectLibraryImageAsCover(image)}
                        className="mt-1"
                      />
                      <img
                        src={image.url}
                        alt={image.name}
                        className="h-16 w-28 rounded border border-white/20 object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs text-offwhite">{image.name}</p>
                        <p className={`text-xs ${image.is_linked ? "text-gold-soft" : "text-mist/75"}`}>
                          {image.is_linked ? "Linked" : "Unlinked"}
                        </p>
                        {image.links.length > 0 ? (
                          <div className="mt-1 space-y-1">
                            {image.links.map((link) => (
                              <p key={`${image.path}-${link.post_id}`} className="text-[11px] text-mist/75">
                                {link.section} / {link.title} ({link.usage.join(", ")})
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] text-mist/65">No current link.</p>
                        )}
                        {draftReferencesImage(image) && (
                          <p className="mt-1 text-[11px] text-gold-soft">Used in the current draft.</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => selectLibraryImageAsCover(image)}
                            className="rounded-md border border-gold/40 px-2.5 py-1 text-[11px] text-gold-soft"
                          >
                            Use as cover image
                          </button>
                          <button
                            type="button"
                            onClick={() => insertLibraryImageIntoContent(image)}
                            className="rounded-md border border-white/30 px-2.5 py-1 text-[11px] text-offwhite"
                          >
                            Insert into article
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyImageUrl(image)}
                            className="rounded-md border border-white/30 px-2.5 py-1 text-[11px] text-offwhite"
                          >
                            Copy URL
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteLibraryImage(image)}
                            disabled={image.is_linked || !canDeletePosts || draftReferencesImage(image)}
                            className="rounded-md border border-red-400/40 px-2.5 py-1 text-[11px] text-red-200 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between text-sm text-mist/80">
                <span>Page {imagesMeta.current_page} of {imagesMeta.last_page} | Total {imagesMeta.total}</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void runImageSearch(Math.max(1, imagesMeta.current_page - 1))}
                    disabled={imagesMeta.current_page <= 1}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => void runImageSearch(Math.min(imagesMeta.last_page, imagesMeta.current_page + 1))}
                    disabled={imagesMeta.current_page >= imagesMeta.last_page}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "preview" && (
        <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-5">
          <h2 className="mb-4 font-heading text-2xl text-offwhite">Live {form.post_type === "video" ? "Video" : "Article"} Preview</h2>
          <p className="mb-4 text-sm text-mist/80">
            {form.post_type === "video" ? "Preview the public video card and detail treatment before publishing." : "Preview long-form readability before publishing."}
          </p>

          {form.post_type !== "video" && <div className="mb-4 grid gap-3 rounded-lg border border-white/20 bg-white/5 p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
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
                aria-label="Preview font size"
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
          </div>}

          <article className="rounded-lg border border-white/20 bg-ink/35 p-4 md:p-6">
            {form.post_type === "article" && previewImageUrl && (
              <img
                src={previewImageUrl}
                alt={form.title || "Preview image"}
                className="mb-5 h-56 w-full rounded-md object-cover md:h-80"
              />
            )}

            {form.post_type === "video" && (
              <div className="mb-5 aspect-video overflow-hidden rounded-md border border-white/20 bg-[radial-gradient(circle_at_top,rgba(243,219,152,0.18),transparent_45%),linear-gradient(150deg,rgba(9,24,46,0.96),rgba(20,48,88,0.85))]">
                {previewVideoThumbnailUrl ? (
                  <img
                    src={previewVideoThumbnailUrl}
                    alt={form.title || "Video preview"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-mist/80">
                    Video thumbnail preview
                  </div>
                )}
              </div>
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

            {form.post_type === "article" ? (
              <div
                className={`rich-content mt-5 leading-relaxed text-mist/90 ${previewLayout === "columns" ? "md:columns-2 xl:columns-3 md:gap-10" : "max-w-4xl"}`}
                style={{ fontSize: `${previewFontSize}px` }}
                dangerouslySetInnerHTML={{
                  __html: previewHtml || "<p>Article content preview will appear here.</p>",
                }}
              >
              </div>
            ) : (
              <div className="mt-5 text-sm text-mist/85">
                {form.video_thumbnail_text.trim() || form.excerpt.trim() || "Video posts open as a watch page with the embedded player and optional original-video link."}
              </div>
            )}
          </article>
        </div>
      )}

      {activeTab === "posts" && (
        <div className="rounded-xl border border-white/20 bg-white/10 p-5">
          <h2 className="mb-4 font-heading text-2xl text-offwhite">{limitedMode ? `My ${postsMode === "video" ? "Videos" : "Articles"}` : `${postsMode === "video" ? "Videos" : "Articles"}`}</h2>
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            <input
              aria-label="Post search"
              value={postQueryDraft}
              onChange={(e) => setPostQueryDraft(e.target.value)}
              placeholder={postsMode === "video" ? "Search title, slug, caption, or thumbnail text" : "Search title, slug, or excerpt"}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70"
            />
            <select
              aria-label="Post section filter"
              value={postSectionFilterDraft}
              onChange={(e) => setPostSectionFilterDraft(e.target.value)}
              className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite"
            >
              <option value="" style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>All sections</option>
              {sectionOptions.map((section) => (
                <option key={section} value={section} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                  {titleCaseWords(section)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void applyPostSearch()} className="btn-secondary">
              Search
            </button>
          </div>

          {!postsLoaded ? (
            <p className="text-sm text-mist/80">Loading posts...</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-white/20 bg-white/10">
                <table className="min-w-full text-left text-sm text-offwhite">
                  <thead className="bg-navy/70 text-gold-soft">
                    <tr>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Image</th>
                      <th className="px-4 py-3">Content</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Author</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-mist/80">
                          {limitedMode ? `You have not authored any ${postsMode === "video" ? "videos" : "articles"} yet.` : `No ${postsMode === "video" ? "videos" : "articles"} found for the current search.`}
                        </td>
                      </tr>
                    )}

                    {posts.map((post) => (
                      <tr key={post.id} className="border-t border-white/15">
                        <td className="px-4 py-3">{post.title}</td>
                        <td className="px-4 py-3 capitalize">{post.post_type}</td>
                        <td className="px-4 py-3">
                          {post.post_type === "video" ? (
                            post.video_thumbnail_url ? (
                              <img
                                src={post.video_thumbnail_url}
                                alt={post.title}
                                className="h-14 w-24 rounded border border-white/20 object-cover"
                              />
                            ) : (
                              <span className="text-xs text-gold-soft">Video</span>
                            )
                          ) : post.image_url ? (
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
                            {post.excerpt || post.video_thumbnail_text || htmlToPlainText(post.content)}
                          </p>
                        </td>
                        <td className="px-4 py-3 capitalize">{post.section}</td>
                        <td className="px-4 py-3">{post.status}</td>
                        <td className="px-4 py-3 text-xs text-mist/80">{post.author?.name ?? "Unknown"}</td>
                        <td className="px-4 py-3 space-x-3">
                          <button
                            type="button"
                            onClick={() => startEdit(post)}
                            disabled={!canEditPost(post)}
                            className="text-gold hover:underline disabled:opacity-45"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(post.id)}
                            disabled={!canDeletePost(post)}
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

              <div className="mt-5 flex items-center justify-between text-sm text-mist/80">
                <span>Page {postsMeta.current_page} of {postsMeta.last_page} | Total {postsMeta.total}</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void runPostSearch(Math.max(1, postsMeta.current_page - 1))}
                    disabled={postsMeta.current_page <= 1}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => void runPostSearch(Math.min(postsMeta.last_page, postsMeta.current_page + 1))}
                    disabled={postsMeta.current_page >= postsMeta.last_page}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
