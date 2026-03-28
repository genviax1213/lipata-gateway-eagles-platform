import type { CmsPost } from "../types/cms";

const PRERENDER_PAYLOAD_ID = "__LGEC_PRERENDER__";
const HOMEPAGE_PRERENDER_PAYLOAD_ID = "__LGEC_HOMEPAGE_PRERENDER__";

type PublicPostPrerenderPayload = {
  page: "public-post";
  pathname: string;
  post: CmsPost;
};

export type HomepageVideoPrerenderData = {
  title: string;
  caption: string;
  eyebrow: string;
  provider: string;
  embedUrl: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnailText?: string | null;
};

export type HomepagePrerenderPayload = {
  page: "homepage";
  heroPosts: CmsPost[];
  communityPosts: CmsPost[];
  homepageVideos: HomepageVideoPrerenderData[];
};

function readPrerenderScript(): string | null {
  if (typeof document === "undefined") return null;

  const node = document.getElementById(PRERENDER_PAYLOAD_ID);
  return node?.textContent ?? null;
}

export function readInitialPublicPost(pathname: string, slug?: string): CmsPost | null {
  if (!slug) return null;

  const raw = readPrerenderScript();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PublicPostPrerenderPayload;
    if (parsed.page !== "public-post") return null;
    if (parsed.pathname !== pathname) return null;
    if (parsed.post?.slug !== slug) return null;
    return parsed.post;
  } catch {
    return null;
  }
}

export function readInitialHomepagePayload(): HomepagePrerenderPayload | null {
  if (typeof document === "undefined") return null;

  const raw = document.getElementById(HOMEPAGE_PRERENDER_PAYLOAD_ID)?.textContent ?? null;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as HomepagePrerenderPayload;
    return parsed.page === "homepage" ? parsed : null;
  } catch {
    return null;
  }
}
