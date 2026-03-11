import { useEffect, useState } from "react";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import PublicPostCard from "../components/cms/PublicPostCard";

export default function Activities() {
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/activities", {
          params: {
            paginate: true,
            page,
            per_page: 6,
            q: searchQuery || undefined,
          },
        });
        if (!mounted) return;
        const activityPosts = Array.isArray(res.data?.data) ? (res.data.data as CmsPost[]) : [];
        if (activityPosts.length > 0) {
          setPosts(activityPosts);
          setLastPage(Number(res.data?.last_page ?? 1));
          return;
        }

        if (searchQuery) {
          setPosts([]);
          setLastPage(1);
          return;
        }

        const fallback = await api.get("/content/homepage-community");
        if (!mounted) return;
        const communityPosts = Array.isArray(fallback.data) ? (fallback.data as CmsPost[]) : [];
        setPosts(communityPosts);
        setLastPage(1);
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
  }, [page, searchQuery]);

  return (
    <section className="section-wrap py-16 md:py-20">
      <h2 className="mb-8 font-heading text-4xl text-offwhite md:text-5xl">
        Activities & Community Projects
      </h2>
      <p className="mb-6 max-w-3xl text-sm text-mist/85">
        Complete archive of activities, projects, and community engagements.
      </p>

      <form
        className="mb-8 flex flex-col gap-3 md:flex-row md:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setPage(1);
          setSearchQuery(searchDraft.trim());
        }}
      >
        <label htmlFor="activities-search" className="sr-only">
          Search activities
        </label>
        <input
          id="activities-search"
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search activities, projects, or community stories"
          className="w-full rounded-md border border-white/15 bg-white/8 px-4 py-3 text-sm text-offwhite outline-none transition placeholder:text-mist/50 focus:border-gold-soft/60 focus:ring-2 focus:ring-gold-soft/20 md:max-w-xl"
        />
        <div className="flex gap-3">
          <button type="submit" className="btn-secondary">
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              className="rounded-md border border-white/20 px-4 py-2 text-sm text-mist transition hover:border-gold-soft/50 hover:text-offwhite"
              onClick={() => {
                setLoading(true);
                setSearchDraft("");
                setSearchQuery("");
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {searchQuery && (
        <p className="mb-6 text-sm text-mist/80">
          Showing results for <span className="text-gold-soft">"{searchQuery}"</span>.
        </p>
      )}

      {loading && (
        <div className="surface-card p-6 text-sm text-mist/85">Loading activities posts...</div>
      )}

      {!loading && (
        <div className="grid gap-6 md:grid-cols-3">
          {posts.map((post) => (
            <PublicPostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="surface-card mt-6 p-6 text-sm text-mist/85">
          {searchQuery ? (
            <>
              No activities matched <span className="text-gold-soft">"{searchQuery}"</span>. Try a broader title,
              excerpt, or keyword search.
            </>
          ) : (
            <>
              No activities posts yet. Publish posts in CMS under the{" "}
              <span className="text-gold-soft">activities</span> section.
            </>
          )}
        </div>
      )}

      {!loading && posts.length > 0 && lastPage > 1 && (
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
