import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { useAuth } from "../contexts/useAuth";
import { hasPermission } from "../utils/auth";

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
  { label: "Short pages", value: 4500 },
  { label: "Balanced pages", value: 7000 },
  { label: "Long pages", value: 10000 },
];

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

function paginateContent(content: string, maxChars: number): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [""];

  const pages: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const hardEnd = Math.min(cursor + maxChars, normalized.length);

    if (hardEnd >= normalized.length) {
      pages.push(normalized.slice(cursor).trim());
      break;
    }

    const searchStart = Math.floor(cursor + maxChars * 0.6);
    const windowText = normalized.slice(searchStart, hardEnd);

    const breakDoubleNewline = windowText.lastIndexOf("\n\n");
    const breakNewline = windowText.lastIndexOf("\n");
    const breakSpace = windowText.lastIndexOf(" ");

    let breakOffset = breakDoubleNewline;
    if (breakOffset < 0) breakOffset = breakNewline;
    if (breakOffset < 0) breakOffset = breakSpace;

    const cutAt = breakOffset >= 0 ? searchStart + breakOffset : hardEnd;
    pages.push(normalized.slice(cursor, cutAt).trim());
    cursor = cutAt + 1;
  }

  return pages.filter((p) => p.length > 0);
}

export default function CmsPosts() {
  const { user } = useAuth();
  const canViewPosts = hasPermission(user, "posts.view");
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
  const contentChars = form.content.length;
  const contentWords = form.content.trim() === "" ? 0 : form.content.trim().split(/\s+/).length;
  const [previewFontSize, setPreviewFontSize] = useState(18);
  const [previewLayout, setPreviewLayout] = useState<"single" | "columns">("single");
  const [previewPaged, setPreviewPaged] = useState(true);
  const [previewCharsPerPage, setPreviewCharsPerPage] = useState(PAGE_SIZES[1].value);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewUploadUrl, setPreviewUploadUrl] = useState("");
  const editingPost = editingId ? posts.find((p) => p.id === editingId) : null;
  const previewImageUrl = previewUploadUrl || editingPost?.image_url || "";

  const previewPages = useMemo(
    () => paginateContent(form.content, previewCharsPerPage),
    [form.content, previewCharsPerPage],
  );
  const previewText = previewPaged ? (previewPages[previewPageIndex] ?? "") : form.content;
  const previewWordCount = useMemo(
    () => (previewText.trim().length ? previewText.trim().split(/\s+/).length : 0),
    [previewText],
  );

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
    if (!canViewPosts) {
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
  }, [canViewPosts]);

  useEffect(() => {
    setPreviewPageIndex(0);
  }, [form.content, previewCharsPerPage, previewPaged]);

  useEffect(() => {
    if (!form.image) {
      setPreviewUploadUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(form.image);
    setPreviewUploadUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [form.image]);

  function resetForm() {
    setForm(initialForm);
    setEditingId(null);
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

      if (form.image) {
        const payload = new FormData();
        payload.append("title", basePayload.title);
        payload.append("section", basePayload.section);
        payload.append("excerpt", basePayload.excerpt);
        payload.append("content", basePayload.content);
        payload.append("status", basePayload.status);
        payload.append("is_featured", String(basePayload.is_featured));
        if (basePayload.published_at) payload.append("published_at", basePayload.published_at);
        payload.append("image", form.image);

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

  if (!canViewPosts) {
    return (
      <section>
        <h1 className="mb-2 font-heading text-4xl text-offwhite">CMS Posts</h1>
        <p className="rounded-md border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          You do not have permission to view CMS posts.
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

          <textarea
            value={form.content}
            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            placeholder="Write article content here (supports long-form articles)"
            rows={12}
            maxLength={30000}
            required
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-offwhite placeholder:text-mist/70 md:col-span-2"
          />
          <p className="md:col-span-2 -mt-2 text-right text-xs text-mist/75">
            Content: {contentWords.toLocaleString()} words · {contentChars.toLocaleString()}/30,000 characters
            <span className="ml-2 text-gold-soft">(target long-form: 5,000 words or ~18,000 to 30,000 chars)</span>
          </p>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setForm((prev) => ({ ...prev, image: e.target.files?.[0] ?? null }))}
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-offwhite md:col-span-2"
          />

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
            disabled={saving || (!editingId && !canCreatePosts) || (editingId !== null && !canUpdatePosts)}
            className="btn-primary"
          >
            {saving ? "Saving..." : editingId ? "Update Post" : "Publish Post"}
          </button>

          {editingId && (
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-white/20 bg-white/10 p-5">
        <h2 className="mb-4 font-heading text-2xl text-offwhite">Live Article Preview</h2>
        <p className="mb-4 text-sm text-mist/80">
          Preview long-form readability before publishing.
        </p>

        <div className="mb-4 grid gap-3 rounded-lg border border-white/20 bg-white/5 p-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <div className="text-xs text-mist/80">
            {previewPaged ? `Page ${previewPageIndex + 1} of ${previewPages.length}` : "Continuous mode"} · {previewWordCount.toLocaleString()} words
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
            <button
              type="button"
              onClick={() => setPreviewPaged(false)}
              className={`rounded-md border px-3 py-1 text-sm ${!previewPaged ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
            >
              Continuous
            </button>
            <button
              type="button"
              onClick={() => setPreviewPaged(true)}
              className={`rounded-md border px-3 py-1 text-sm ${previewPaged ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
            >
              Multi Page
            </button>
            {previewPaged && (
              <select
                value={previewCharsPerPage}
                onChange={(e) => setPreviewCharsPerPage(Number(e.target.value))}
                className="rounded-md border border-white/30 bg-white/10 px-3 py-1 text-sm text-offwhite"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size.value} value={size.value} style={{ color: "#0a1730", backgroundColor: "#f6f1e6" }}>
                    {size.label}
                  </option>
                ))}
              </select>
            )}
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
            className={`mt-5 whitespace-pre-line leading-relaxed text-mist/90 ${previewLayout === "columns" ? "md:columns-2 xl:columns-3 md:gap-10" : "max-w-4xl"}`}
            style={{ fontSize: `${previewFontSize}px` }}
          >
            {previewText || "Article content preview will appear here."}
          </div>
        </article>

        {previewPaged && (
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              disabled={previewPageIndex === 0}
              onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
              className="rounded-md border border-white/30 px-4 py-2 text-sm disabled:opacity-50"
            >
              Prev Page
            </button>
            <button
              type="button"
              disabled={previewPageIndex >= previewPages.length - 1}
              onClick={() => setPreviewPageIndex((p) => Math.min(previewPages.length - 1, p + 1))}
              className="rounded-md border border-white/30 px-4 py-2 text-sm disabled:opacity-50"
            >
              Next Page
            </button>
          </div>
        )}
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
