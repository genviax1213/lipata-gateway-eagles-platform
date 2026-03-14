import { useEffect, useState } from "react";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { sanitizeRichHtml } from "../utils/richText";

type PaginatedResolutionResponse = {
  data?: CmsPost[];
  current_page?: number;
  last_page?: number;
};

export default function Resolutions() {
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get<PaginatedResolutionResponse>("/member-content/resolutions", {
          params: {
            page,
            per_page: 4,
          },
        });

        if (!mounted) return;

        setPosts(Array.isArray(res.data?.data) ? res.data.data : []);
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

  return (
    <section className="section-wrap py-16 md:py-20">
      <div className="mb-8 max-w-3xl">
        <p className="text-sm uppercase tracking-[0.18em] text-gold-soft">Members Only</p>
        <h1 className="mt-3 font-heading text-4xl text-offwhite md:text-5xl">Club Resolutions</h1>
        <p className="mt-4 text-mist/85">
          Approved club resolutions published for authenticated member access.
        </p>
      </div>

      {loading && (
        <div className="surface-card p-6 text-sm text-mist/85">Loading resolutions...</div>
      )}

      {!loading && posts.length === 0 && (
        <div className="surface-card p-6 text-sm text-mist/85">
          No resolutions have been published yet. Authorized staff can add them from the CMS under the
          <span className="text-gold-soft"> resolutions </span>
          section.
        </div>
      )}

      {posts.length > 0 && (
        <>
          <div className="space-y-6">
            {posts.map((post) => (
              <article key={post.id} className="surface-card card-lift overflow-hidden p-6 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-2xl text-offwhite md:text-3xl">{post.title}</h2>
                    {post.published_at && (
                      <p className="mt-2 text-sm text-mist/75">
                        Published {new Date(post.published_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-gold-soft">
                    Resolution
                  </span>
                </div>

                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="mt-5 max-h-80 w-full rounded-lg object-cover"
                  />
                )}

                {post.excerpt && (
                  <p className="mt-5 text-base text-mist/90">{post.excerpt}</p>
                )}

                <div
                  className="rich-content mt-5 text-mist/90"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(post.content) }}
                />
              </article>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-center gap-4 text-sm text-mist/90">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
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
                setPage((current) => Math.min(lastPage, current + 1));
              }}
              className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
