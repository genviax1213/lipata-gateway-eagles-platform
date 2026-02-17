import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { unsplashImages } from "../content/unsplashImages";

export default function About() {
  const [posts, setPosts] = useState<CmsPost[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/about");
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

  const primary = posts[0];

  return (
    <section className="section-wrap py-16 md:py-20">
      <div className="surface-card card-lift reveal p-8 md:p-12">
        <h2 className="mb-6 font-heading text-4xl text-offwhite md:text-5xl">
          {primary?.title ?? "About the Club"}
        </h2>

        {primary ? (
          <>
            {primary.image_url && (
              <img
                src={primary.image_url}
                alt={primary.title}
                className="mb-5 max-h-80 w-full rounded-md object-cover"
              />
            )}
            {primary.excerpt && <p className="mb-3 text-mist/90">{primary.excerpt}</p>}
            <p className="whitespace-pre-line text-mist/90">{primary.content}</p>
            {primary.slug && (
              <div className="mt-6">
                <Link to={`/news/${primary.slug}`} className="btn-secondary">
                  Read Full Article
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </section>
  );
}
