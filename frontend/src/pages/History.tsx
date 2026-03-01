import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { htmlToPlainText } from "../utils/richText";

function contentSnippet(value: string, max = 180): string {
  const plain = htmlToPlainText(value);
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trim()}...`;
}

export default function History() {
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/history", {
          params: {
            paginate: true,
            page,
            per_page: 6,
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

  return (
    <section className="section-wrap py-16 md:py-20">
      <h1 className="mb-3 font-heading text-4xl text-offwhite md:text-5xl">Club History</h1>
      <p className="mb-8 max-w-3xl text-mist/85">
        Historical records and milestones.
      </p>

      {loading && (
        <div className="surface-card p-6 text-sm text-mist/85">Loading history posts...</div>
      )}

      {!loading && posts.length === 0 && (
        <div className="surface-card p-6 text-sm text-mist/85">
          No history posts yet. Publish posts in CMS under the <span className="text-gold-soft">history</span> section.
        </div>
      )}

      {posts.length > 0 && (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="surface-card card-lift h-full overflow-hidden p-4">
                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="mb-4 h-44 w-full rounded-md object-cover"
                  />
                )}
                <h2 className="font-heading text-2xl text-offwhite">{post.title}</h2>
                <p className="mt-2 text-sm text-mist/85">
                  {post.excerpt ?? contentSnippet(post.content)}
                </p>
                {post.slug && (
                  <div className="mt-4">
                    <Link to={`/news/${post.slug}`} className="btn-secondary">
                      Read Full Article
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>

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
        </>
      )}
    </section>
  );
}
