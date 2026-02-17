import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { CmsPost } from "../types/cms";

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

const PAGE_SIZES = [
  { label: "Short pages", value: 4500 },
  { label: "Balanced pages", value: 7000 },
  { label: "Long pages", value: 10000 },
];

export default function NewsArticle() {
  const { slug } = useParams();
  const [post, setPost] = useState<CmsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fontSize, setFontSize] = useState(18);
  const [layout, setLayout] = useState<"single" | "columns">("single");
  const [isPaged, setIsPaged] = useState(true);
  const [charsPerPage, setCharsPerPage] = useState(PAGE_SIZES[1].value);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!slug) {
        if (mounted) {
          setError("Invalid article link.");
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.get(`/content/post/${slug}`);
        if (!mounted) return;
        setPost(res.data as CmsPost);
      } catch {
        if (!mounted) return;
        setError("Article not found or not published.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [slug]);

  const pages = useMemo(() => paginateContent(post?.content ?? "", charsPerPage), [post?.content, charsPerPage]);
  const currentPageText = pages[pageIndex] ?? "";
  const contentText = post?.content ?? "";
  const activeText = isPaged ? currentPageText : contentText;
  const backTo = post?.section === "history" ? "/history" : post?.section === "news" ? "/news" : "/";
  const backLabel = post?.section === "history" ? "Back to History" : post?.section === "news" ? "Back to News" : "Back to Homepage";
  const estimatedWords = useMemo(
    () => (activeText.trim().length ? activeText.trim().split(/\s+/).length : 0),
    [activeText],
  );

  useEffect(() => {
    setPageIndex(0);
  }, [post?.id, charsPerPage, isPaged]);

  return (
    <section className="section-wrap py-12 md:py-16">
      {loading && (
        <div className="surface-card p-8 text-mist/90">Loading article...</div>
      )}

      {!loading && error && (
        <div className="surface-card p-8 text-mist/90">
          <p>{error}</p>
          <Link to="/" className="mt-4 inline-block text-gold-soft hover:text-gold">
            Back to homepage
          </Link>
        </div>
      )}

      {!loading && !error && post && (
        <article className="surface-card overflow-hidden p-4 md:p-6">
          {post.image_url && (
            <img
              src={post.image_url}
              alt={post.title}
              className="mb-6 h-64 w-full rounded-lg object-cover md:h-[28rem]"
            />
          )}

          {!["about", "homepage_hero"].includes(post.section) && (
            <p className="text-xs uppercase tracking-[0.22em] text-gold-soft">
              {post.section.replaceAll("_", " ")}
            </p>
          )}
          <h1 className="mt-2 font-heading text-4xl leading-tight text-offwhite md:text-6xl">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="mt-5 text-lg text-mist/90">{post.excerpt}</p>
          )}

          <div className="mt-6 grid gap-3 rounded-lg border border-white/20 bg-white/5 p-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
            <div className="text-xs text-mist/80">
              {isPaged ? `Page ${pageIndex + 1} of ${pages.length}` : "Continuous mode"} · {estimatedWords.toLocaleString()} words
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFontSize((v) => Math.max(15, v - 1))}
                className="rounded-md border border-white/30 px-3 py-1 text-sm"
              >
                A-
              </button>
              <span className="text-xs text-mist/80">{fontSize}px</span>
              <button
                type="button"
                onClick={() => setFontSize((v) => Math.min(24, v + 1))}
                className="rounded-md border border-white/30 px-3 py-1 text-sm"
              >
                A+
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLayout("single")}
                className={`rounded-md border px-3 py-1 text-sm ${layout === "single" ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
              >
                Single Column
              </button>
              <button
                type="button"
                onClick={() => setLayout("columns")}
                className={`rounded-md border px-3 py-1 text-sm ${layout === "columns" ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
              >
                Multi Column
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button
                type="button"
                onClick={() => setIsPaged(false)}
                className={`rounded-md border px-3 py-1 text-sm ${!isPaged ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
              >
                Continuous
              </button>
              <button
                type="button"
                onClick={() => setIsPaged(true)}
                className={`rounded-md border px-3 py-1 text-sm ${isPaged ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
              >
                Multi Page
              </button>
              {isPaged && (
                <select
                  value={charsPerPage}
                  onChange={(e) => setCharsPerPage(Number(e.target.value))}
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

          <div
            className={`mt-6 whitespace-pre-line leading-relaxed text-mist/90 ${layout === "columns" ? "md:columns-2 xl:columns-3 md:gap-10" : "max-w-4xl"}`}
            style={{ fontSize: `${fontSize}px` }}
          >
            {activeText}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-5">
            <Link to={backTo} className="btn-secondary">
              {backLabel}
            </Link>

            {isPaged && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  className="rounded-md border border-white/30 px-4 py-2 text-sm disabled:opacity-50"
                >
                  Prev Page
                </button>
                <button
                  type="button"
                  disabled={pageIndex >= pages.length - 1}
                  onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
                  className="rounded-md border border-white/30 px-4 py-2 text-sm disabled:opacity-50"
                >
                  Next Page
                </button>
              </div>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
