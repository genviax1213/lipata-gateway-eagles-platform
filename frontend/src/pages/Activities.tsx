import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { unsplashImages } from "../content/unsplashImages";
import { htmlToPlainText } from "../utils/richText";

function contentSnippet(value: string, max = 180): string {
  const plain = htmlToPlainText(value);
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trim()}...`;
}

const fallback = [
  {
    title: "Community Outreach",
    text: "Supporting local communities through service initiatives and outreach programs.",
    imageUrl: unsplashImages.volunteersForest.imageUrl,
    photoPage: unsplashImages.volunteersForest.pageUrl,
    credit: unsplashImages.volunteersForest.credit,
  },
  {
    title: "Brotherhood Events",
    text: "Strengthening bonds through fellowship, meetings, and organizational activities.",
    imageUrl: unsplashImages.eagleHero.imageUrl,
    photoPage: unsplashImages.eagleHero.pageUrl,
    credit: unsplashImages.eagleHero.credit,
  },
  {
    title: "Civic Engagement",
    text: "Participating in programs that promote leadership, integrity, and patriotism.",
    imageUrl: unsplashImages.volunteersBeach.imageUrl,
    photoPage: unsplashImages.volunteersBeach.pageUrl,
    credit: unsplashImages.volunteersBeach.credit,
  },
];

export default function Activities() {
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/activities", {
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
      <h2 className="mb-8 font-heading text-4xl text-offwhite md:text-5xl">
        Activities & Community Projects
      </h2>
      <p className="mb-6 max-w-3xl text-sm text-mist/85">
        Complete archive of activities, projects, and community engagements. Unlike the homepage highlights,
        this page is intended to provide full historical coverage.
      </p>

      {loading && (
        <div className="surface-card p-6 text-sm text-mist/85">Loading activities posts...</div>
      )}

      {!loading && (
        <div className="grid gap-6 md:grid-cols-3">
          {posts.length > 0
          ? posts.map((post) => (
              <article key={post.id} className="surface-card card-lift group h-full p-6">
                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="mb-4 h-44 w-full rounded-md object-cover"
                  />
                )}
                <h3 className="mb-3 font-heading text-2xl text-offwhite group-hover:text-gold-soft">
                  {post.title}
                </h3>
                <p className="text-sm leading-relaxed text-mist/90">
                  {post.excerpt ?? contentSnippet(post.content)}
                </p>
                {post.slug && (
                  <div className="mt-4">
                    <Link to={`/news/${post.slug}`} className="btn-secondary">
                      Read Article
                    </Link>
                  </div>
                )}
              </article>
            ))
          : fallback.map((item) => (
              <article key={item.title} className="surface-card card-lift group h-full overflow-hidden p-3">
                <img src={item.imageUrl} alt={item.title} className="h-44 w-full rounded-md object-cover" />
                <h3 className="mt-3 mb-2 font-heading text-2xl text-offwhite group-hover:text-gold-soft">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-mist/90">{item.text}</p>
                <p className="mt-2 text-xs text-mist/75">
                  Photo: <a href={item.photoPage} target="_blank" rel="noreferrer" className="text-gold-soft hover:text-gold">{item.credit} </a>
                </p>
              </article>
            ))}
        </div>
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
    </section>
  );
}
