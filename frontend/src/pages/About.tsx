import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { unsplashImages } from "../content/unsplashImages";
import { cmsPostDetailPath } from "../utils/cmsPaths";
import { sanitizeRichHtml } from "../utils/richText";

export default function About() {
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/about", {
          params: {
            paginate: true,
            page,
            per_page: 1,
          },
        });
        if (!mounted) return;
        setPosts(Array.isArray(res.data?.data) ? (res.data.data as CmsPost[]) : []);
        setLastPage(Number(res.data?.last_page ?? 1));
      } catch {
        if (!mounted) return;
        setPosts([]);
        setLastPage(1);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [page]);

  const primary = posts[0];

  return (
    <section className="section-wrap py-16 md:py-20">
      <article className="article-shell reveal overflow-hidden">
        <div className="article-shell__inner p-8 md:p-12">
          {loading && (
            <p className="mb-4 text-sm text-mist/85">Loading about article...</p>
          )}

          <header className="article-hero">
            <p className="text-xs uppercase tracking-[0.22em] text-gold-soft">About</p>
            <h2 className="mt-2 max-w-4xl font-heading text-4xl text-offwhite md:text-5xl">
              {primary?.title ?? "About the Club"}
            </h2>
            {primary?.excerpt && <p className="mt-4 max-w-3xl text-mist/90">{primary.excerpt}</p>}
          </header>

          {primary ? (
            <div className="article-reading-frame mt-6">
              {primary.image_url && (
                <img
                  src={primary.image_url}
                  alt={primary.title}
                  className="mb-5 max-h-80 w-full rounded-md object-cover"
                />
              )}
              <div
                className="rich-content text-mist/90"
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(primary.content) }}
              />
              {primary.slug && (
                <div className="mt-6">
                  <Link to={cmsPostDetailPath(primary)} className="btn-secondary">
                    Read Full Article
                  </Link>
                </div>
              )}
            </div>
          ) : !loading ? (
            <div className="article-reading-frame mt-6">
              <img
                src={unsplashImages.philippinesLandscape.imageUrl}
                alt="Philippine landscape"
                className="mb-5 max-h-80 w-full rounded-md object-cover"
              />
              <p className="mb-2 text-xs text-mist/75">
                Photo: <a href={unsplashImages.philippinesLandscape.pageUrl} target="_blank" rel="noreferrer" className="text-gold-soft hover:text-gold">{unsplashImages.philippinesLandscape.credit} </a>
              </p>
              <p className="mb-4 max-w-3xl text-mist/90">
                Lipata Gateway Eagles Club is part of The Fraternal Order of Eagles
                (TFOE), Inc., committed to strengthening brotherhood and serving the
                community.
              </p>
              <p className="mb-4 max-w-3xl text-mist/90">
                Guided by our motto <strong>Deo et Patria</strong>, we dedicate
                ourselves to civic engagement, volunteerism, and leadership
                development.
              </p>
              <p className="max-w-3xl text-mist/90">
                Our mission is to build a strong network of civic-minded Filipino men
                united in service and fellowship.
              </p>
            </div>
          ) : (
            <div className="mt-6 h-80 w-full animate-pulse rounded-md border border-white/20 bg-white/5" />
          )}

          {!loading && posts.length > 0 && (
            <div className="mt-8 flex items-center justify-center gap-4 text-sm text-mist/90">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => {
                  setLoading(true);
                  setPage((p) => Math.max(1, p - 1));
                }}
                className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
              >
                Prev
              </button>
              <span>
                Page {page} of {lastPage}
              </span>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => {
                  setLoading(true);
                  setPage((p) => Math.min(lastPage, p + 1));
                }}
                className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
