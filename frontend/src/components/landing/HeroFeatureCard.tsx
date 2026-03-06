import { Link } from "react-router-dom";
import type { CmsPost } from "../../types/cms";

type HeroFeatureCardProps = {
  post: CmsPost | null;
  contentPreview: string;
  imageHeightClassName: string;
};

export default function HeroFeatureCard({
  post,
  contentPreview,
  imageHeightClassName,
}: HeroFeatureCardProps) {
  return (
    <div className="surface-card card-lift overflow-hidden p-3">
      {post?.image_url ? (
        <img
          src={post.image_url}
          alt={post.title}
          className={`${imageHeightClassName} w-full rounded-lg object-cover`}
        />
      ) : (
        <div className={`flex ${imageHeightClassName} w-full items-center justify-center rounded-lg border border-white/20 bg-white/5 text-center text-sm text-mist/75`}>
          No hero image yet. Upload one in CMS section
          <br />
          <span className="text-gold-soft">homepage_hero</span>.
        </div>
      )}
      {contentPreview && (
        <p className="mt-2 line-clamp-2 text-xs text-mist/80">{contentPreview}</p>
      )}
      {post?.slug && (
        <div className="mt-3">
          <Link to={`/news/${post.slug}`} className="btn-secondary">
            Learn More
          </Link>
        </div>
      )}
    </div>
  );
}
