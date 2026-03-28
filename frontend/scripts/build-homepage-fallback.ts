import { execFileSync } from "node:child_process";
import type { CmsPost } from "../src/types/cms";
import { cmsPostDetailPath } from "../src/utils/cmsPaths";

const DEFAULT_SITE_ORIGIN = "https://www.lgec.org";
const DEFAULT_TITLE = "LGEC | Lipata Gateway Eagles Club";
const DEFAULT_DESCRIPTION =
  "Lipata Gateway Eagles Club official website for public service updates, community news, schedules, and member access.";
const DEFAULT_IMAGE = "https://lgec.org/images/gallery/brigada-1.jpg";
const DEFAULT_IMAGE_ALT = "Lipata Gateway Eagles Club community service activity";
const HOMEPAGE_PRERENDER_PAYLOAD_ID = "__LGEC_HOMEPAGE_PRERENDER__";

type HomepageFallbackPayload = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  bodyHtml: string;
  payloadScript: string;
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
  thumbnail_text?: unknown;
  thumbnailText?: unknown;
  videos?: unknown;
};

type HomepageVideoData = {
  title: string;
  caption: string;
  eyebrow: string;
  provider: string;
  embedUrl: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnailText?: string | null;
};

type HomepagePrerenderPayload = {
  page: "homepage";
  heroPosts: CmsPost[];
  communityPosts: CmsPost[];
  homepageVideos: HomepageVideoData[];
};

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function stripHtml(value: string): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(value: string, max = 180): string {
  const plain = stripHtml(value);
  if (!plain) return "";
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trim()}...`;
}

function normalizeUrl(pathOrUrl: string | null | undefined, siteOrigin: string): string | null {
  if (!pathOrUrl) return null;
  try {
    return new URL(pathOrUrl, siteOrigin).toString();
  } catch {
    return null;
  }
}

function resolvePostUrl(siteOrigin: string, post: Pick<CmsPost, "section" | "slug"> | null | undefined, fallbackPath = "/activities"): string {
  if (!post?.slug) {
    return `${siteOrigin}${fallbackPath}`;
  }

  return `${siteOrigin}${cmsPostDetailPath({
    section: typeof post.section === "string" ? post.section : "activities",
    slug: post.slug,
  })}`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeHomepageVideoItem(payload: unknown): HomepageVideoData | null {
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
    thumbnailText: readString(candidate.thumbnail_text) ?? readString(candidate.thumbnailText),
  };
}

function normalizeHomepageVideos(payload: unknown): HomepageVideoData[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => normalizeHomepageVideoItem(item))
      .filter((item): item is HomepageVideoData => Boolean(item))
      .slice(0, 3);
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as HomepageVideoApiPayload;
    if (Array.isArray(candidate.videos)) {
      return candidate.videos
        .map((item) => normalizeHomepageVideoItem(item))
        .filter((item): item is HomepageVideoData => Boolean(item))
        .slice(0, 3);
    }

    const single = normalizeHomepageVideoItem(payload);
    return single ? [single] : [];
  }

  return [];
}

function buildPayloadScript(payload: HomepagePrerenderPayload): string {
  return `<script id="${HOMEPAGE_PRERENDER_PAYLOAD_ID}" type="application/json">${escapeJson(payload)}</script>`;
}

async function fetchJson<T>(url: string): Promise<T> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LGECBuildPrerender/1.0",
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    try {
      const raw = execFileSync(
        "curl",
        [
          "-fsSL",
          "--max-time",
          "20",
          "-H",
          "User-Agent: LGECBuildPrerender/1.0",
          "-H",
          "Accept: application/json",
          url,
        ],
        { encoding: "utf8" },
      );

      return JSON.parse(raw) as T;
    } catch {
      throw error;
    }
  }
}

function buildDefaultFallback(siteOrigin: string): HomepageFallbackPayload {
  const payload: HomepagePrerenderPayload = {
    page: "homepage",
    heroPosts: [],
    communityPosts: [],
    homepageVideos: [],
  };

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    image: DEFAULT_IMAGE,
    imageAlt: DEFAULT_IMAGE_ALT,
    bodyHtml: `
      <main aria-labelledby="homepage-fallback-title" style="max-width: 1040px; margin: 0 auto; padding: 56px 20px 72px; color: #f6f1e6; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6;">
        <p style="margin: 0 0 12px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">Lipata Gateway Eagles Club</p>
        <h1 id="homepage-fallback-title" style="margin: 0 0 16px; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.05; color: #fff;">Community updates, activities, and member access.</h1>
        <p style="max-width: 42rem; margin: 0 0 28px; font-size: 1.05rem; color: rgba(246, 241, 230, 0.86);">${escapeHtml(DEFAULT_DESCRIPTION)}</p>
        <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 28px;">
          <a href="${siteOrigin}/activities" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #d7ba6d; color: #07111f; padding: 12px 18px; font-weight: 700; text-decoration: none;">View Activities</a>
          <a href="${siteOrigin}/activities" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.22); color: #f6f1e6; padding: 12px 18px; font-weight: 600; text-decoration: none;">Browse Articles</a>
          <a href="${siteOrigin}/portal" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.22); color: #f6f1e6; padding: 12px 18px; font-weight: 600; text-decoration: none;">Open Portal</a>
        </div>
      </main>
    `.trim(),
    payloadScript: buildPayloadScript(payload),
  };
}

function buildFallbackHtml({
  siteOrigin,
  heroPost,
  communityPosts,
  homepageVideos,
}: {
  siteOrigin: string;
  heroPost: CmsPost | null;
  communityPosts: CmsPost[];
  homepageVideos: HomepageVideoData[];
}): HomepageFallbackPayload {
  const title = heroPost?.title ? `${heroPost.title} | Lipata Gateway Eagles Club` : DEFAULT_TITLE;
  const description = snippet(heroPost?.excerpt || heroPost?.content || DEFAULT_DESCRIPTION, 220) || DEFAULT_DESCRIPTION;
  const image = normalizeUrl(heroPost?.image_url, siteOrigin) || DEFAULT_IMAGE;
  const imageAlt = heroPost?.title || DEFAULT_IMAGE_ALT;

  const heroTitle = escapeHtml(heroPost?.title || "Lipata Gateway Eagles Club");
  const heroExcerpt = escapeHtml(snippet(heroPost?.excerpt || heroPost?.content || DEFAULT_DESCRIPTION, 260) || DEFAULT_DESCRIPTION);
  const heroUrl = resolvePostUrl(siteOrigin, heroPost, "/activities");
  const heroImage = normalizeUrl(heroPost?.image_url, siteOrigin);
  const primaryVideo = homepageVideos[0] ?? null;
  const primaryVideoUrl = primaryVideo ? primaryVideo.sourceUrl || primaryVideo.embedUrl : "";

  const heroContent = heroImage
    ? `
        <div style="display: grid; gap: 24px; align-items: center; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
          <div>
            <p style="margin: 0 0 12px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">Homepage Feature</p>
            <h1 id="homepage-fallback-title" style="margin: 0 0 16px; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.05; color: #fff;">${heroTitle}</h1>
            <p style="max-width: 42rem; margin: 0 0 28px; font-size: 1.05rem; color: rgba(246, 241, 230, 0.86);">${heroExcerpt}</p>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              <a href="${heroUrl}" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #d7ba6d; color: #07111f; padding: 12px 18px; font-weight: 700; text-decoration: none;">Read Feature</a>
              <a href="${siteOrigin}/activities" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.22); color: #f6f1e6; padding: 12px 18px; font-weight: 600; text-decoration: none;">View Activities</a>
              <a href="${siteOrigin}/portal" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.22); color: #f6f1e6; padding: 12px 18px; font-weight: 600; text-decoration: none;">Open Portal</a>
            </div>
          </div>
          <div>
            <img src="${heroImage}" alt="${escapeHtml(imageAlt)}" style="width: 100%; border-radius: 28px; display: block; object-fit: cover; box-shadow: 0 18px 48px rgba(0,0,0,0.28);" />
          </div>
        </div>
      `
    : `
        <p style="margin: 0 0 12px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">Homepage Feature</p>
        <h1 id="homepage-fallback-title" style="margin: 0 0 16px; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.05; color: #fff;">${heroTitle}</h1>
        <p style="max-width: 42rem; margin: 0 0 28px; font-size: 1.05rem; color: rgba(246, 241, 230, 0.86);">${heroExcerpt}</p>
        <div style="display: flex; flex-wrap: wrap; gap: 12px;">
          <a href="${heroUrl}" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #d7ba6d; color: #07111f; padding: 12px 18px; font-weight: 700; text-decoration: none;">Read Feature</a>
          <a href="${siteOrigin}/activities" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.22); color: #f6f1e6; padding: 12px 18px; font-weight: 600; text-decoration: none;">View Activities</a>
          <a href="${siteOrigin}/portal" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.22); color: #f6f1e6; padding: 12px 18px; font-weight: 600; text-decoration: none;">Open Portal</a>
        </div>
      `;

  const videoHtml = primaryVideo && primaryVideoUrl
    ? `
        <section aria-labelledby="homepage-fallback-video-title" style="margin-top: 40px;">
          <p style="margin: 0 0 8px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">Reputation Reel</p>
          <h2 id="homepage-fallback-video-title" style="margin: 0 0 12px; font-size: 1.6rem; color: #fff;">${escapeHtml(primaryVideo.title)}</h2>
          <p style="margin: 0 0 12px; max-width: 42rem; color: rgba(246, 241, 230, 0.82);">${escapeHtml(primaryVideo.caption)}</p>
          <a href="${escapeHtml(primaryVideoUrl)}" style="color: #d7ba6d; text-decoration: none; font-weight: 600;">Watch the featured video</a>
        </section>
      `
    : "";

  const communityHtml = communityPosts.length > 0
    ? communityPosts.slice(0, 3).map((post) => {
        const postUrl = resolvePostUrl(siteOrigin, post, "/activities");
        const postImage = normalizeUrl(post.image_url, siteOrigin);
        const postExcerpt = escapeHtml(snippet(post.excerpt || post.content || "", 130) || "View this public community update from Lipata Gateway Eagles Club.");
        return `
          <article style="border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; overflow: hidden; background: rgba(255, 255, 255, 0.04);">
            ${postImage ? `<img src="${postImage}" alt="${escapeHtml(post.title || "Community update")}" style="width: 100%; height: 180px; object-fit: cover; display: block;" />` : ""}
            <div style="padding: 18px;">
              <h3 style="margin: 0 0 8px; font-size: 1rem; color: #fff;">${escapeHtml(post.title || "Community update")}</h3>
              <p style="margin: 0 0 12px; color: rgba(246, 241, 230, 0.82);">${postExcerpt}</p>
              <a href="${postUrl}" style="color: #d7ba6d; text-decoration: none; font-weight: 600;">Read update</a>
            </div>
          </article>
        `;
      }).join("")
    : `
        <article style="border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; padding: 18px; background: rgba(255, 255, 255, 0.04);">
          <h3 style="margin: 0 0 8px; font-size: 1rem; color: #fff;">Activities</h3>
          <p style="margin: 0 0 12px; color: rgba(246, 241, 230, 0.82);">Browse community service, outreach, and club activity posts from the public archive.</p>
          <a href="${siteOrigin}/activities" style="color: #d7ba6d; text-decoration: none; font-weight: 600;">Open activities</a>
        </article>
      `;

  return {
    title,
    description,
    image,
    imageAlt,
    bodyHtml: `
      <main aria-labelledby="homepage-fallback-title" style="max-width: 1040px; margin: 0 auto; padding: 56px 20px 72px; color: #f6f1e6; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6;">
        ${heroContent}
        ${videoHtml}
        <section aria-labelledby="homepage-fallback-community-title" style="margin-top: 44px;">
          <p style="margin: 0 0 8px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">Community In Action</p>
          <h2 id="homepage-fallback-community-title" style="margin: 0 0 12px; font-size: 1.8rem; color: #fff;">Recent public activity highlights</h2>
          <p style="margin: 0 0 20px; max-width: 42rem; color: rgba(246, 241, 230, 0.82);">These cards are generated at build time so shared links and crawlers can still read homepage content without running the full app.</p>
          <div style="display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));">
            ${communityHtml}
          </div>
        </section>
      </main>
    `.trim(),
    payloadScript: buildPayloadScript({
      page: "homepage",
      heroPosts: heroPost ? [heroPost] : [],
      communityPosts: communityPosts.slice(0, 9),
      homepageVideos,
    }),
  };
}

export async function buildHomepageFallback(
  env: Record<string, string | undefined> = process.env,
): Promise<HomepageFallbackPayload> {
  const siteOrigin = String(
    env.LGEC_SITE_ORIGIN ||
    env.VITE_SITE_ORIGIN ||
    env.SITE_ORIGIN ||
    DEFAULT_SITE_ORIGIN,
  ).replace(/\/$/, "");

  const apiBaseUrl = String(
    env.LGEC_PUBLIC_API_BASE_URL ||
    env.VITE_API_BASE_URL ||
    `${siteOrigin}/api/v1`,
  ).replace(/\/$/, "");

  try {
    const [heroPosts, communityPosts, homepageVideoPayload] = await Promise.all([
      fetchJson<CmsPost[]>(`${apiBaseUrl}/content/homepage_hero`),
      fetchJson<CmsPost[]>(`${apiBaseUrl}/content/homepage-community`),
      fetchJson<unknown>(`${apiBaseUrl}/content/homepage-reputation-video`),
    ]);

    const heroList = Array.isArray(heroPosts) ? heroPosts : [];
    const communityList = Array.isArray(communityPosts) ? communityPosts : [];
    const videoList = normalizeHomepageVideos(homepageVideoPayload);
    const heroPost = heroList.find((item) => item?.image_url) || heroList[0] || null;

    return buildFallbackHtml({
      siteOrigin,
      heroPost,
      communityPosts: communityList,
      homepageVideos: videoList,
    });
  } catch (error) {
    console.warn("Homepage fallback build fetch failed. Using default fallback.", error);
    return buildDefaultFallback(siteOrigin);
  }
}
