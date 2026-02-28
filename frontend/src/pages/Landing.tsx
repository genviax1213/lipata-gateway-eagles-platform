import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../services/api";
import type { CmsPost } from "../types/cms";

export default function Landing() {
  const [heroPost, setHeroPost] = useState<CmsPost | null>(null);
  const [communityPosts, setCommunityPosts] = useState<CmsPost[]>([]);
  const [communityPage, setCommunityPage] = useState(1);
  const [communityLastPage, setCommunityLastPage] = useState(1);
  const [loadingCommunity, setLoadingCommunity] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/homepage_hero");
        if (!mounted) return;
        const heroItems = Array.isArray(res.data) ? res.data : [];
        setHeroPost((heroItems[0] as CmsPost | undefined) ?? null);
      } catch {
        if (mounted) setHeroPost(null);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/homepage_community", {
          params: {
            paginate: true,
            page: communityPage,
            per_page: 6,
          },
        });

        if (!mounted) return;

        const data = Array.isArray(res.data?.data) ? (res.data.data as CmsPost[]) : [];
        setCommunityPosts(data);
        setCommunityLastPage(Number(res.data?.last_page ?? 1));
      } catch {
        if (!mounted) return;
        setCommunityPosts([]);
        setCommunityLastPage(1);
      }
      setLoadingCommunity(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [communityPage]);

  return (
    <section className="hero-gradient relative overflow-hidden">
      <img
        src="/images/lgec-logo.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 z-0 h-[30rem] w-[30rem] object-contain -translate-y-1/2 opacity-[0.072] blur-[1px] md:h-[40rem] md:w-[40rem]"
        style={{ right: "max(1rem, calc((100vw - 72rem) / 2 + 1.5rem))" }}
      />

      <div className="section-wrap grid min-h-[calc(100vh-148px)] items-center gap-8 py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative z-10 max-w-3xl">
          <img
            src="/images/lgec-logo.png"
            alt="LGEC Logo"
            className="reveal mb-6 h-36 w-36 object-contain md:h-44 md:w-44"
          />
          <h1 className="reveal reveal-delay-1 mb-6 font-heading text-5xl leading-tight text-offwhite md:text-7xl">
            {heroPost?.title ?? "Lipata Gateway Eagles Club"}
          </h1>
          <p className="reveal reveal-delay-2 mb-10 max-w-2xl text-lg text-mist/90 md:text-xl">
            {heroPost?.excerpt ??
              "Service Through Strong Brotherhood."}
          </p>
          <div className="reveal reveal-delay-2 flex flex-wrap gap-4">
            <Link to="/contact" className="btn-primary">
              Join and Serve
            </Link>
            <Link to="/activities" className="btn-secondary">
              View Activities
            </Link>
          </div>
          <p className="reveal reveal-delay-2 mt-5 text-sm text-mist/80">
            Already a member?{" "}
            <Link to="/member-login" className="font-semibold text-gold-soft hover:text-gold">
              Sign in here
            </Link>
            .
          </p>
        </div>

        <aside className="relative z-10 hidden lg:block">
          <div className="surface-card card-lift overflow-hidden p-3">
            {heroPost?.image_url ? (
              <img
                src={heroPost.image_url}
                alt={heroPost.title}
                className="h-[26rem] w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-[26rem] w-full items-center justify-center rounded-lg border border-white/20 bg-white/5 text-center text-sm text-mist/75">
                No hero image yet. Upload one in CMS section
                <br />
                <span className="text-gold-soft">homepage_hero</span>.
              </div>
            )}
            {heroPost?.content && (
              <p className="mt-2 line-clamp-2 text-xs text-mist/80">{heroPost.content}</p>
            )}
            {heroPost?.slug && (
              <div className="mt-3">
                <Link to={`/news/${heroPost.slug}`} className="btn-secondary">
                  Learn More
                </Link>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="section-wrap relative z-10 pb-16">
        <h2 className="mb-4 font-heading text-3xl text-offwhite">Community In Action</h2>

        {communityPosts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {communityPosts.map((post) => (
              <article key={post.id} className="surface-card card-lift p-5">
                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="mb-4 h-40 w-full rounded-md object-cover"
                  />
                )}
                <h3 className="font-heading text-2xl text-offwhite">{post.title}</h3>
                {post.excerpt && <p className="mt-2 text-sm text-mist/85">{post.excerpt}</p>}
                {post.slug && (
                  <div className="mt-4">
                    <Link to={`/news/${post.slug}`} className="btn-secondary">
                      Read Article
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          !loadingCommunity && (
            <div className="rounded-xl border border-white/20 bg-white/5 p-6 text-sm text-mist/80">
              No Community In Action posts yet. Add published posts in CMS section
              <span className="ml-1 text-gold-soft">homepage_community</span>.
            </div>
          )
        )}

        {(communityPosts.length > 0 || loadingCommunity) && (
          <div className="mt-6 flex items-center justify-center gap-4 text-sm text-mist/90">
            <button
              type="button"
              disabled={communityPage === 1}
              onClick={() => {
                setLoadingCommunity(true);
                setCommunityPage((p) => Math.max(1, p - 1));
              }}
              className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
            >
              Prev
            </button>
            <span>
              Page {communityPage} of {communityLastPage}
            </span>
            <button
              type="button"
              disabled={communityPage >= communityLastPage}
              onClick={() => {
                setLoadingCommunity(true);
                setCommunityPage((p) => Math.min(communityLastPage, p + 1));
              }}
              className="rounded-md border border-white/25 px-4 py-2 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
