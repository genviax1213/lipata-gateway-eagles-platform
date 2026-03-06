import { Link } from "react-router-dom";
import type { CmsPost } from "../../types/cms";

type CommunityCarouselProps = {
  posts: CmsPost[];
  slide: number;
  slideCount: number;
  onPrev: () => void;
  onNext: () => void;
  contentSnippet: (value: string, max?: number) => string;
};

export default function CommunityCarousel({
  posts,
  slide,
  slideCount,
  onPrev,
  onNext,
  contentSnippet,
}: CommunityCarouselProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {posts.map((post) => (
          <article key={post.id} className="surface-card card-lift p-5">
            {post.image_url && (
              <img
                src={post.image_url}
                alt={post.title}
                className="mb-4 h-40 w-full rounded-md object-cover"
              />
            )}
            <h3 className="font-heading text-2xl text-offwhite">{post.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm text-mist/85">
              {post.excerpt ?? contentSnippet(post.content)}
            </p>
            {post.slug && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={`/news/${post.slug}`} className="btn-secondary">
                  Read Article
                </Link>
                <Link to="/activities" className="rounded-md border border-white/25 px-3 py-2 text-xs text-offwhite hover:border-gold/50 hover:text-gold-soft">
                  View Activities
                </Link>
              </div>
            )}
          </article>
        ))}
      </div>
      {slideCount > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-xs text-mist/80">
          <button
            type="button"
            onClick={onPrev}
            className="rounded-md border border-white/25 px-3 py-1.5 text-offwhite hover:border-gold/50 hover:text-gold-soft"
          >
            Prev 3
          </button>
          <span>
            Set {slide + 1} of {slideCount}
          </span>
          <button
            type="button"
            onClick={onNext}
            className="rounded-md border border-white/25 px-3 py-1.5 text-offwhite hover:border-gold/50 hover:text-gold-soft"
          >
            Next 3
          </button>
        </div>
      )}
    </>
  );
}
