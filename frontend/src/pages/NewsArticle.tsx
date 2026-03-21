import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { htmlToPlainText, sanitizeRichHtml } from "../utils/richText";
import { buildVideoThumbnailCandidates } from "../utils/video";

type NewsArticleProps = {
  forceMemberAccess?: boolean;
  backToOverride?: string;
  backLabelOverride?: string;
};

export default function NewsArticle({
  forceMemberAccess = false,
  backToOverride,
  backLabelOverride,
}: NewsArticleProps) {
  const { slug } = useParams();
  const { user } = useAuth();
  const hasMemberProfile = Boolean((user as { has_member_profile?: unknown } | null)?.has_member_profile);
  const [post, setPost] = useState<CmsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoCoverIndex, setVideoCoverIndex] = useState(0);
  const [useVideoCoverFallback, setUseVideoCoverFallback] = useState(false);
  const [videoPlayerActive, setVideoPlayerActive] = useState(false);

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
        const endpoint = forceMemberAccess || hasMemberProfile
          ? `/member-content/post/${slug}`
          : `/content/post/${slug}`;
        const res = await api.get(endpoint);
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
  }, [forceMemberAccess, hasMemberProfile, slug]);

  const backTo = backToOverride ?? (post?.section === "history"
    ? "/history"
    : post?.section === "resolutions"
      ? "/resolutions"
      : post?.section === "news" || post?.section === "activities"
        ? "/activities"
        : "/");
  const backLabel = backLabelOverride ?? (post?.section === "history"
    ? "Back to History"
    : post?.section === "resolutions"
      ? "Back to Resolutions"
      : post?.section === "news" || post?.section === "activities"
        ? "Back to Activities"
        : "Back to Homepage");
  const renderedHtml = useMemo(() => sanitizeRichHtml(post?.content ?? ""), [post?.content]);
  const estimatedWords = useMemo(
    () => htmlToPlainText(post?.content ?? "").split(/\s+/).filter(Boolean).length,
    [post?.content],
  );
  const videoCoverCandidates = useMemo(
    () => buildVideoThumbnailCandidates({
      thumbnailUrl: post?.video_thumbnail_url,
      sourceUrl: post?.video_url,
      embedUrl: post?.video_embed_url,
    }),
    [post?.video_embed_url, post?.video_thumbnail_url, post?.video_url],
  );
  const videoCoverImage = useMemo(() => {
    const thumbnail = videoCoverCandidates[videoCoverIndex] ?? null;

    if (useVideoCoverFallback || !thumbnail) {
      return "/images/lgec-logo.png";
    }

    return thumbnail;
  }, [useVideoCoverFallback, videoCoverCandidates, videoCoverIndex]);
  const activeVideoEmbedUrl = useMemo(() => {
    if (!post?.video_embed_url) return null;

    try {
      const url = new URL(post.video_embed_url);
      url.searchParams.set("autoplay", "1");
      return url.toString();
    } catch {
      const separator = post.video_embed_url.includes("?") ? "&" : "?";
      return `${post.video_embed_url}${separator}autoplay=1`;
    }
  }, [post?.video_embed_url]);

  useEffect(() => {
    setVideoCoverIndex(0);
    setUseVideoCoverFallback(false);
    setVideoPlayerActive(false);
  }, [post?.id, post?.video_embed_url, post?.video_thumbnail_url, post?.video_url]);

  const handleVideoCoverError = () => {
    if (useVideoCoverFallback) return;

    if (videoCoverIndex < videoCoverCandidates.length - 1) {
      setVideoCoverIndex((current) => current + 1);
      return;
    }

    setUseVideoCoverFallback(true);
  };

  return (
    <section className="section-wrap py-12 md:py-16">
      {loading && (
        <div className="surface-card p-8 text-mist/90">Loading article...</div>
      )}

      {!loading && error && (
        <div className="surface-card p-8 text-mist/90">
          <p>{error}</p>
          <Link to={backTo} className="mt-4 inline-block text-gold-soft hover:text-gold">
            {backLabel}
          </Link>
        </div>
      )}

      {!loading && !error && post && (
        <article className="article-shell overflow-hidden">
          <div className="article-shell__inner p-4 md:p-6 lg:p-8">
            <div className="mb-4">
              <Link to={backTo} className="btn-secondary">
                {backLabel}
              </Link>
            </div>

            {post.post_type === "video" ? (
              <>
                {!videoPlayerActive ? (
                  <button
                    type="button"
                    className="group relative mb-6 block w-full overflow-hidden rounded-lg border border-white/20 bg-white/5 text-left"
                    onClick={() => setVideoPlayerActive(true)}
                  >
                    <img
                      src={videoCoverImage}
                      alt={post.title}
                      className="h-64 w-full object-cover md:h-[28rem]"
                      onError={handleVideoCoverError}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-gold/90 text-ink shadow-[0_18px_40px_rgba(2,6,23,0.45)] transition group-hover:scale-105">
                        <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current" focusable="false">
                          <path d="M8 6.5v11l9-5.5-9-5.5Z" />
                        </svg>
                      </div>
                    </div>
                  </button>
                ) : null}

                {post.video_embed_url && videoPlayerActive && (
                  <div className="mb-6 overflow-hidden rounded-lg border border-white/20 bg-white/5">
                    <div className="aspect-video">
                      <iframe
                        src={activeVideoEmbedUrl ?? post.video_embed_url}
                        title={post.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        className="h-full w-full border-0"
                      />
                    </div>
                  </div>
                )}
              </>
            ) : post.image_url && (
              <img
                src={post.image_url}
                alt={post.title}
                className="mb-6 h-64 w-full rounded-lg object-cover md:h-[28rem]"
              />
            )}

            <header className="article-hero">
              {!["about", "homepage_hero"].includes(post.section) && (
                <p className="text-xs uppercase tracking-[0.22em] text-gold-soft">
                  {post.section.replaceAll("_", " ")}
                </p>
              )}
              <h1 className="mt-2 max-w-4xl font-heading text-4xl leading-tight text-offwhite md:text-6xl">
                {post.title}
              </h1>

              {post.excerpt && (
                <p className="mt-5 max-w-3xl text-lg leading-8 text-mist/90">{post.excerpt}</p>
              )}
            </header>

            {post.post_type !== "video" && (
              <div className="article-reading-frame mt-6">
                <div className="article-toolbar mb-5 overflow-x-auto rounded-lg p-3">
                  <div className="flex min-w-max items-center gap-4">
                    <div className="text-xs text-mist/80">
                      Reading controls · {estimatedWords.toLocaleString()} words
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
                        Single
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayout("columns")}
                        className={`rounded-md border px-3 py-1 text-sm ${layout === "columns" ? "border-gold bg-gold text-ink" : "border-white/30 text-mist/80"}`}
                      >
                        Multi
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className={`rich-content text-mist/90 ${layout === "columns" ? "md:columns-2 xl:columns-3 md:gap-10" : "max-w-4xl"}`}
                  style={{ fontSize: `${fontSize}px` }}
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              </div>
            )}

            {post.post_type === "video" && post.video_url && (
              <div className="mt-6">
                <a
                  href={post.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  Open Original Video
                </a>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-5">
              <Link to={backTo} className="btn-secondary">
                {backLabel}
              </Link>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
