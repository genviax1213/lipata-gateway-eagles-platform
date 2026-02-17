import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { unsplashImages } from "../content/unsplashImages";

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

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/activities");
        if (!mounted) return;
        setPosts(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (mounted) setPosts([]);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="section-wrap py-16 md:py-20">
      <h2 className="mb-8 font-heading text-4xl text-offwhite md:text-5xl">
        Activities & Community Projects
      </h2>

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
                  {post.excerpt ?? post.content.slice(0, 180)}
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
    </section>
  );
}
