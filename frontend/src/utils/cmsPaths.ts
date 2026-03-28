import type { CmsPost } from "../types/cms";

export function cmsPostDetailPath(post: Pick<CmsPost, "section" | "slug">): string {
  const slug = post.slug?.trim();
  if (!slug) return "/";

  switch (post.section) {
    case "history":
      return `/history/${slug}`;
    case "resolutions":
      return `/resolutions/${slug}`;
    case "about":
      return `/about/${slug}`;
    case "activities":
    case "news":
    case "homepage_hero":
      return `/activities/${slug}`;
    default:
      return `/activities/${slug}`;
  }
}
