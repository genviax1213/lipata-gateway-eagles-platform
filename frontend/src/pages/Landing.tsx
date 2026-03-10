import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import type { CmsPost } from "../types/cms";
import { htmlToPlainText } from "../utils/richText";
import { canonicalRoutes } from "../content/portalCopy";
import HeroFeatureCard from "../components/landing/HeroFeatureCard";
import CommunityCarousel from "../components/landing/CommunityCarousel";
import HomepageReputationVideo, {
  type HomepageReputationVideoData,
} from "../components/landing/HomepageReputationVideo";

const HERO_CACHE_KEY = "landing:homepage-hero";
const HERO_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

type HeroCachePayload = {
  savedAt: number;
  posts: CmsPost[];
};

type HomepageVideoApiPayload = {
  title?: unknown;
  caption?: unknown;
  description?: unknown;
  excerpt?: unknown;
  eyebrow?: unknown;
  provider?: unknown;
  embed_url?: unknown;
  embedUrl?: unknown;
  video_url?: unknown;
  videoUrl?: unknown;
  source_url?: unknown;
  sourceUrl?: unknown;
  thumbnail_url?: unknown;
  thumbnailUrl?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeHomepageVideo(payload: unknown): HomepageReputationVideoData | null {
  if (!payload || typeof payload !== "object") return null;

  const candidate = payload as HomepageVideoApiPayload;
  const embedUrl =
    readString(candidate.embed_url) ??
    readString(candidate.embedUrl) ??
    readString(candidate.video_url) ??
    readString(candidate.videoUrl);

  if (!embedUrl) return null;

  return {
    title: readString(candidate.title) ?? "LGEC in Action",
    caption:
      readString(candidate.caption) ??
      readString(candidate.description) ??
      readString(candidate.excerpt) ??
      "A short look at the service, brotherhood, and public presence behind LGEC.",
    eyebrow: readString(candidate.eyebrow) ?? "Reputation Reel",
    provider: readString(candidate.provider) ?? "featured video",
    embedUrl,
    sourceUrl: readString(candidate.source_url) ?? readString(candidate.sourceUrl),
    thumbnailUrl: readString(candidate.thumbnail_url) ?? readString(candidate.thumbnailUrl),
  };
}

function contentSnippet(value: string, max = 120): string {
  const plain = htmlToPlainText(value).replace(/\s+/g, " ").trim();
  if (!plain) return "";
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trim()}...`;
}

function selectInitialHeroPost(posts: CmsPost[]): CmsPost | null {
  return posts.find((item) => Boolean(item.image_url)) ?? posts[0] ?? null;
}

function readHeroCache(): CmsPost[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(HERO_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HeroCachePayload;
    if (!Array.isArray(parsed.posts) || typeof parsed.savedAt !== "number") return [];
    if (Date.now() - parsed.savedAt > HERO_CACHE_MAX_AGE_MS) return [];
    return parsed.posts;
  } catch {
    return [];
  }
}

function writeHeroCache(posts: CmsPost[]): void {
  if (typeof window === "undefined") return;

  try {
    const payload: HeroCachePayload = {
      savedAt: Date.now(),
      posts,
    };
    window.localStorage.setItem(HERO_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures and continue with network-backed rendering.
  }
}

export default function Landing() {
  const cachedHeroPosts = useMemo(() => readHeroCache(), []);
  const [heroPosts, setHeroPosts] = useState<CmsPost[]>(cachedHeroPosts);
  const [heroPost, setHeroPost] = useState<CmsPost | null>(() => selectInitialHeroPost(cachedHeroPosts));
  const [heroImageLoaded, setHeroImageLoaded] = useState(false);
  const [heroLoading, setHeroLoading] = useState(cachedHeroPosts.length === 0);
  const [homepageVideo, setHomepageVideo] = useState<HomepageReputationVideoData | null>(null);
  const [communityPosts, setCommunityPosts] = useState<CmsPost[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(true);
  const [communitySlide, setCommunitySlide] = useState(0);
  const communityVisibleCount = 3;
  const communitySlideCount = Math.max(1, Math.ceil(communityPosts.length / communityVisibleCount));
  const visibleCommunityPosts = useMemo(() => {
    if (communityPosts.length <= communityVisibleCount) return communityPosts;
    const normalizedSlide = communitySlide % communitySlideCount;
    const start = normalizedSlide * communityVisibleCount;
    return communityPosts.slice(start, start + communityVisibleCount);
  }, [communityPosts, communitySlide, communitySlideCount]);
  const heroContentPreview = heroPost?.content
    ? htmlToPlainText(heroPost.content).replace(/\s+/g, " ").trim()
    : "";

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/homepage_hero");
        if (!mounted) return;
        const heroItems = Array.isArray(res.data) ? (res.data as CmsPost[]) : [];
        setHeroPosts(heroItems);
        const initial = selectInitialHeroPost(heroItems);
        setHeroPost(initial);
        writeHeroCache(heroItems);
      } catch {
        if (mounted) {
          setHeroPosts([]);
          setHeroPost(null);
        }
      } finally {
        if (mounted) {
          setHeroLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadHomepageVideo = async () => {
      try {
        const res = await api.get("/content/homepage-reputation-video");
        if (!mounted) return;
        setHomepageVideo(normalizeHomepageVideo(res.data));
      } catch {
        if (!mounted) return;
        setHomepageVideo(null);
      }
    };

    void loadHomepageVideo();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const imageUrl = heroPost?.image_url;
    if (!imageUrl) {
      setHeroImageLoaded(false);
      return;
    }

    setHeroImageLoaded(false);

    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.fetchPriority = "high";
    image.src = imageUrl;

    const markLoaded = () => setHeroImageLoaded(true);
    image.addEventListener("load", markLoaded);
    image.addEventListener("error", markLoaded);

    if (image.complete) {
      setHeroImageLoaded(true);
    }

    return () => {
      image.removeEventListener("load", markLoaded);
      image.removeEventListener("error", markLoaded);
    };
  }, [heroPost?.image_url]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/content/homepage-community");

        if (!mounted) return;
        const data = Array.isArray(res.data) ? (res.data as CmsPost[]) : [];
        setCommunityPosts(data);
      } catch {
        if (!mounted) return;
        setCommunityPosts([]);
      }
      setLoadingCommunity(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (heroPosts.length <= 1) return;

    const timer = setInterval(() => {
      setHeroPost((current) => {
        if (!current) return heroPosts[0] ?? null;
        const currentIndex = heroPosts.findIndex((item) => item.id === current.id);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % heroPosts.length : 0;
        return heroPosts[nextIndex] ?? null;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [heroPosts]);

  useEffect(() => {
    if (communitySlideCount <= 1) return;

    const timer = setInterval(() => {
      setCommunitySlide((current) => (current + 1) % communitySlideCount);
    }, 5000);

    return () => clearInterval(timer);
  }, [communitySlideCount]);

  const heroGridClassName = homepageVideo
    ? "section-wrap grid min-h-[calc(100vh-148px)] items-center gap-8 py-16 lg:grid-cols-[minmax(0,1.04fr)_minmax(14rem,16.75rem)_minmax(0,0.92fr)] lg:gap-6"
    : "section-wrap grid min-h-[calc(100vh-148px)] items-center gap-8 py-16 lg:grid-cols-[1.1fr_0.9fr]";

  return (
    <section className="hero-gradient relative overflow-hidden">
      <img
        src="/images/lgec-logo.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 z-0 h-[30rem] w-[30rem] object-contain -translate-y-1/2 opacity-[0.072] blur-[1px] md:h-[40rem] md:w-[40rem]"
        style={{ right: "max(1rem, calc((100vw - 72rem) / 2 + 1.5rem))" }}
      />

      <div className={heroGridClassName}>
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
            <Link to={canonicalRoutes.login} className="font-semibold text-gold-soft hover:text-gold">
              Sign in here
            </Link>
            .
          </p>

          {homepageVideo ? (
            <div className="mt-6 lg:hidden">
              <HomepageReputationVideo video={homepageVideo} layout="mobile" />
            </div>
          ) : null}

          <div className="mt-6 lg:hidden">
            <HeroFeatureCard
              post={heroPost}
              contentPreview={heroContentPreview}
              imageHeightClassName="h-56"
              imageLoaded={heroImageLoaded}
              isLoading={heroLoading}
            />
          </div>
        </div>

        {homepageVideo ? (
          <div className="relative z-10 hidden lg:flex lg:justify-center">
            <HomepageReputationVideo video={homepageVideo} layout="desktop" />
          </div>
        ) : null}

        <aside className="relative z-10 hidden lg:block">
          <HeroFeatureCard
            post={heroPost}
            contentPreview={heroContentPreview}
            imageHeightClassName="h-[26rem]"
            imageLoaded={heroImageLoaded}
            prioritizeImage
            isLoading={heroLoading}
          />
        </aside>
      </div>

      <div className="section-wrap relative z-10 pb-16">
        <h2 className="mb-4 font-heading text-3xl text-offwhite">Community In Action</h2>

        {communityPosts.length > 0 ? (
          <CommunityCarousel
            posts={visibleCommunityPosts}
            slide={communitySlide}
            slideCount={communitySlideCount}
            onPrev={() => setCommunitySlide((current) => (current - 1 + communitySlideCount) % communitySlideCount)}
            onNext={() => setCommunitySlide((current) => (current + 1) % communitySlideCount)}
            contentSnippet={contentSnippet}
          />
        ) : (
          !loadingCommunity && (
            <div className="rounded-xl border border-white/20 bg-white/5 p-6 text-sm text-mist/80">
              No community highlights yet.
              <div className="mt-3">
                <Link to="/activities" className="text-gold-soft hover:text-gold">
                  View Activities
                </Link>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}
