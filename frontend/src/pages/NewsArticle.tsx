import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { htmlToPlainText, sanitizeRichHtml } from "../utils/richText";

export default function NewsArticle() {
  const { slug } = useParams();
  const [post, setPost] = useState<CmsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fontSize, setFontSize] = useState(18);
  const [layout, setLayout] = useState<"single" | "columns">("single");

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

  const backTo = post?.section === "history" ? "/history" : post?.section === "news" ? "/news" : "/";
  const backLabel = post?.section === "history" ? "Back to History" : post?.section === "news" ? "Back to News" : "Back to Homepage";
  const renderedHtml = useMemo(() => sanitizeRichHtml(post?.content ?? ""), [post?.content]);
  const estimatedWords = useMemo(
    () => htmlToPlainText(post?.content ?? "").split(/\s+/).filter(Boolean).length,
    [post?.content],
  );

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
          <div className="mb-4">
            <Link to="/" className="btn-secondary">
              Back to Homepage
            </Link>
          </div>

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

          <div className="mt-6 grid gap-3 rounded-lg border border-white/20 bg-white/5 p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div className="text-xs text-mist/80">
              Rich article mode · {estimatedWords.toLocaleString()} words
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
          </div>

          <div
            className={`rich-content mt-6 text-mist/90 ${layout === "columns" ? "md:columns-2 xl:columns-3 md:gap-10" : "max-w-4xl"}`}
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-5">
            <Link to={backTo} className="btn-secondary">
              {backLabel}
            </Link>
          </div>
        </article>
      )}
    </section>
  );
}
