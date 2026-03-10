import { Link } from "react-router-dom";
import type { CmsPost } from "../../types/cms";

type HeroFeatureCardProps = {
  post: CmsPost | null;
  contentPreview: string;
  imageHeightClassName: string;
  imageLoaded?: boolean;
  prioritizeImage?: boolean;
  isLoading?: boolean;
};

export default function HeroFeatureCard({
  post,
  contentPreview,
  imageHeightClassName,
  imageLoaded = true,
  prioritizeImage = false,
  isLoading = false,
}: HeroFeatureCardProps) {
  return (
    <div className="surface-card card-lift overflow-hidden p-3">
      {post?.image_url ? (
        <div className={`relative overflow-hidden rounded-lg ${imageHeightClassName}`}>
          {!imageLoaded && (
            <div
              aria-hidden="true"
              className="hero-image-skeleton absolute inset-0"
            />
          )}
          <img
            src={post.image_url}
            alt={post.title}
            loading={prioritizeImage ? "eager" : "lazy"}
            fetchPriority={prioritizeImage ? "high" : "auto"}
            decoding="async"
            className={`${imageHeightClassName} w-full object-cover transition-opacity duration-500 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      ) : (
        <div className={`flex ${imageHeightClassName} w-full items-center justify-center rounded-lg border border-white/20 bg-white/5 text-center text-sm text-mist/75`}>
          No hero image yet. Upload one in CMS section
          <br />
          <span className="text-gold-soft">homepage_hero</span>.
        </div>
      )}
      {isLoading ? (
        <div className="mt-2 space-y-2" aria-hidden="true">
          <div className="hero-text-skeleton h-3 w-11/12 rounded-full" />
          <div className="hero-text-skeleton h-3 w-8/12 rounded-full" />
        </div>
      ) : (
        contentPreview && (
        <p className="mt-2 line-clamp-2 text-xs text-mist/80">{contentPreview}</p>
        )
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
