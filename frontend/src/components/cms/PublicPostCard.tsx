import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CmsPost } from "../../types/cms";
import { htmlToPlainText } from "../../utils/richText";
import { buildVideoThumbnailCandidates } from "../../utils/video";

type PublicPostCardProps = {
  post: CmsPost;
  readLabel?: string;
  emptyLabel?: string;
  articlePath?: string;
};

function contentSnippet(value: string, max = 180): string {
  const plain = htmlToPlainText(value).replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trim()}...`;
}

function VideoPostThumbnail({ post, emptyLabel }: { post: CmsPost; emptyLabel: string }) {
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [useFallbackThumbnail, setUseFallbackThumbnail] = useState(false);
  const thumbnailCandidates = useMemo(
    () => buildVideoThumbnailCandidates({
      thumbnailUrl: post.video_thumbnail_url,
      sourceUrl: post.video_url,
      embedUrl: post.video_embed_url,
    }),
    [post.video_embed_url, post.video_thumbnail_url, post.video_url],
  );
  const videoThumbnailUrl = thumbnailCandidates[thumbnailIndex] ?? null;
  const resolvedVideoThumbnailUrl = useFallbackThumbnail
    ? "/images/lgec-logo.png"
    : (videoThumbnailUrl ?? "/images/lgec-logo.png");

  const handleVideoThumbnailError = () => {
    if (useFallbackThumbnail) return;

    if (thumbnailIndex < thumbnailCandidates.length - 1) {
      setThumbnailIndex((current) => current + 1);
      return;
    }

    setUseFallbackThumbnail(true);
  };

  return (
    <div className="mb-4 relative overflow-hidden rounded-md">
      <img
        src={resolvedVideoThumbnailUrl}
        alt={post.title}
        className="h-44 w-full rounded-md object-cover"
        onError={handleVideoThumbnailError}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent" />
      <div className="pointer-events-none absolute bottom-3 right-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-gold/90 text-ink shadow-[0_12px_24px_rgba(2,6,23,0.35)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" focusable="false">
          <path d="M8 6.5v11l9-5.5-9-5.5Z" />
        </svg>
      </div>
      {useFallbackThumbnail && (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-md border border-white/12 bg-ink/70 px-3 py-2 text-xs text-mist/90 backdrop-blur">
          {post.video_thumbnail_text?.trim() || emptyLabel}
        </div>
      )}
    </div>
  );
}

export default function PublicPostCard({
  post,
  readLabel = "Read Article",
  emptyLabel = "No cover image",
  articlePath,
}: PublicPostCardProps) {
  const description = post.post_type === "video"
    ? (post.excerpt ?? post.video_thumbnail_text ?? "Watch the LGEC video post.")
    : (post.excerpt ?? contentSnippet(post.content));

  return (
    <article className="surface-card card-lift group h-full overflow-hidden p-4">
      {post.post_type === "video" ? (
        <VideoPostThumbnail
          key={`${post.id}:${post.video_embed_url ?? ""}:${post.video_thumbnail_url ?? ""}:${post.video_url ?? ""}`}
          post={post}
          emptyLabel={emptyLabel}
        />
      ) : post.image_url ? (
        <img
          src={post.image_url}
          alt={post.title}
          className="mb-4 h-44 w-full rounded-md object-cover"
        />
      ) : (
        <div className="mb-4 flex h-44 w-full items-center justify-center rounded-md bg-white/5 text-sm text-mist/75">
          {emptyLabel}
        </div>
      )}

      {post.show_on_announcement_bar && post.announcement_text && (
        <div className="mb-3 rounded-md border border-gold/25 bg-gold/10 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft">Announcement</p>
          <p className="mt-1 text-sm text-offwhite">{post.announcement_text}</p>
        </div>
      )}
      <h2 className="font-heading text-2xl text-offwhite group-hover:text-gold-soft">{post.title}</h2>
      <p className="mt-2 text-sm text-mist/85">{description}</p>
      {post.slug && (
        <div className="mt-4">
          <Link to={articlePath ?? `/news/${post.slug}`} className="btn-secondary">
            {post.post_type === "video" ? "Watch Video" : readLabel}
          </Link>
        </div>
      )}
    </article>
  );
}
