import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cmsPostDetailPath } from "../src/utils/cmsPaths";

const DEFAULT_SITE_ORIGIN = "https://www.lgec.org";
const DIST_DIR = "dist";
const DIST_INDEX_PATH = path.join(DIST_DIR, "index.html");
const PRERENDER_PAYLOAD_ID = "__LGEC_PRERENDER__";
const PUBLIC_SECTIONS = ["activities", "news", "about", "history", "homepage_hero"] as const;

type PublicPost = {
  id: number;
  title: string;
  slug: string;
  section: string;
  post_type: "article" | "video";
  excerpt: string | null;
  content: string;
  image_url: string | null;
  video_url: string | null;
  video_embed_url: string | null;
  video_thumbnail_url: string | null;
  video_thumbnail_text: string | null;
  published_at: string | null;
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

function snippet(value: string, max = 220): string {
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

function canonicalPathForPost(post: PublicPost): string {
  return cmsPostDetailPath({
    section: post.section,
    slug: post.slug,
  });
}

function outputPathsForPost(post: PublicPost): string[] {
  return [canonicalPathForPost(post)];
}

function sectionLabel(section: string): string {
  switch (section) {
    case "homepage_hero":
      return "Homepage Feature";
    case "news":
      return "News";
    case "activities":
      return "Activities";
    case "about":
      return "About";
    case "history":
      return "History";
    default:
      return section.replaceAll("_", " ");
  }
}

function backPathForPost(post: PublicPost): string {
  switch (post.section) {
    case "about":
      return "/about";
    case "history":
      return "/history";
    default:
      return "/activities";
  }
}

function backLabelForPost(post: PublicPost): string {
  switch (post.section) {
    case "about":
      return "Back to About";
    case "history":
      return "Back to History";
    default:
      return "Back to Activities";
  }
}

function buildFallbackHtml(post: PublicPost, siteOrigin: string): string {
  const heroImage = normalizeUrl(
    post.post_type === "video" ? (post.video_thumbnail_url || post.image_url) : post.image_url,
    siteOrigin,
  );
  const videoSource = normalizeUrl(post.video_url || post.video_embed_url, siteOrigin);
  const publishedText = post.published_at
    ? new Date(post.published_at).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return `
    <main aria-labelledby="prerender-post-title" style="max-width: 1040px; margin: 0 auto; padding: 56px 20px 72px; color: #f6f1e6; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; line-height: 1.65;">
      <p style="margin: 0 0 12px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">${escapeHtml(sectionLabel(post.section))}</p>
      <h1 id="prerender-post-title" style="margin: 0 0 16px; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.05; color: #fff;">${escapeHtml(post.title)}</h1>
      ${post.excerpt ? `<p style="max-width: 48rem; margin: 0 0 18px; font-size: 1.05rem; color: rgba(246, 241, 230, 0.86);">${escapeHtml(post.excerpt)}</p>` : ""}
      ${publishedText ? `<p style="margin: 0 0 24px; font-size: 0.95rem; color: rgba(246, 241, 230, 0.72);">Published ${escapeHtml(publishedText)}</p>` : ""}
      <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 28px;">
        <a href="${siteOrigin}${backPathForPost(post)}" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.22); color: #f6f1e6; padding: 12px 18px; font-weight: 600; text-decoration: none;">${escapeHtml(backLabelForPost(post))}</a>
        <a href="${siteOrigin}/" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #d7ba6d; color: #07111f; padding: 12px 18px; font-weight: 700; text-decoration: none;">Homepage</a>
      </div>
      ${heroImage ? `<img src="${heroImage}" alt="${escapeHtml(post.title)}" style="width: 100%; max-height: 560px; object-fit: cover; display: block; border-radius: 28px; box-shadow: 0 18px 48px rgba(0,0,0,0.28); margin-bottom: 28px;" />` : ""}
      ${post.post_type === "video" && videoSource ? `
        <div style="margin-bottom: 24px;">
          <a href="${videoSource}" style="color: #d7ba6d; font-weight: 700; text-decoration: none;">Watch the featured video</a>
          ${post.video_thumbnail_text ? `<p style="margin: 10px 0 0; color: rgba(246, 241, 230, 0.82);">${escapeHtml(post.video_thumbnail_text)}</p>` : ""}
        </div>
      ` : ""}
      <article style="border-radius: 28px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(8, 20, 41, 0.72); box-shadow: 0 28px 60px rgba(2, 6, 23, 0.34); padding: 28px;">
        <div style="color: rgba(246, 241, 230, 0.92);">
          ${post.content || `<p>${escapeHtml(snippet(post.excerpt || "", 320) || "Open this article in a full browser to view the complete content.")}</p>`}
        </div>
      </article>
    </main>
  `.trim();
}

function replaceMetaTag(html: string, selector: string, content: string): string {
  const escapedContent = escapeHtml(content);
  const pattern = new RegExp(`(<meta\\s+${selector}\\s+content=\")[^\"]*(\"\\s*/?>)`, "i");
  return html.replace(pattern, `$1${escapedContent}$2`);
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function replaceFallbackShell(html: string, fallbackHtml: string, payload: unknown): string {
  const payloadScript = `<script id="${PRERENDER_PAYLOAD_ID}" type="application/json">${escapeJson(payload)}</script>`;
  return html.replace(
    /<div id="homepage-fallback-shell">[\s\S]*?<\/div>\s*(?:<script id="__LGEC_HOMEPAGE_PRERENDER__" type="application\/json">[\s\S]*?<\/script>\s*)?<div id="root"><\/div>/i,
    `<div id="homepage-fallback-shell">${fallbackHtml}</div>\n    ${payloadScript}\n    <div id="root"></div>`,
  );
}

function applyPostHtml(baseHtml: string, post: PublicPost, pathname: string, siteOrigin: string): string {
  const description = snippet(post.excerpt || post.content || post.title, 220) || post.title;
  const image = normalizeUrl(
    post.post_type === "video" ? (post.video_thumbnail_url || post.image_url) : post.image_url,
    siteOrigin,
  ) || `${siteOrigin}/images/gallery/brigada-1.jpg`;
  const title = `${post.title} | Lipata Gateway Eagles Club`;
  const absoluteUrl = `${siteOrigin}${pathname}`;
  const payload = { page: "public-post", pathname, post };

  let html = baseHtml;
  html = replaceTitle(html, title);
  html = replaceMetaTag(html, 'name="description"', description);
  html = replaceMetaTag(html, 'property="og:url"', absoluteUrl);
  html = replaceMetaTag(html, 'property="og:title"', title);
  html = replaceMetaTag(html, 'property="og:description"', description);
  html = replaceMetaTag(html, 'property="og:image"', image);
  html = replaceMetaTag(html, 'property="og:image:secure_url"', image);
  html = replaceMetaTag(html, 'property="og:image:alt"', post.title);
  html = replaceMetaTag(html, 'name="twitter:title"', title);
  html = replaceMetaTag(html, 'name="twitter:description"', description);
  html = replaceMetaTag(html, 'name="twitter:image"', image);
  html = replaceFallbackShell(html, buildFallbackHtml(post, siteOrigin), payload);
  return html;
}

async function fetchAllPublicPosts(apiBaseUrl: string): Promise<PublicPost[]> {
  const sectionResponses = await Promise.all(
    PUBLIC_SECTIONS.map(async (section) => {
      const response = await fetchJson<unknown>(`${apiBaseUrl}/content/${section}`);
      return Array.isArray(response) ? (response as PublicPost[]) : [];
    }),
  );

  const posts = sectionResponses.flat().filter((post): post is PublicPost => {
    return Boolean(post && typeof post.slug === "string" && post.slug.trim());
  });

  const deduped = new Map<string, PublicPost>();
  for (const post of posts) {
    deduped.set(`${post.section}:${post.slug}`, post);
  }

  return Array.from(deduped.values());
}

export async function buildPublicPostPrerender(
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
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

  const [baseHtml, posts] = await Promise.all([
    readFile(DIST_INDEX_PATH, "utf8"),
    fetchAllPublicPosts(apiBaseUrl),
  ]);

  await Promise.all(posts.flatMap(async (post) => {
    const outputPaths = outputPathsForPost(post);
    await Promise.all(outputPaths.map(async (pathname) => {
      const outputDir = path.join(DIST_DIR, pathname.replace(/^\//, ""));
      const outputFile = path.join(outputDir, "index.html");
      const html = applyPostHtml(baseHtml, post, pathname, siteOrigin);
      await mkdir(outputDir, { recursive: true });
      await writeFile(outputFile, html, "utf8");
    }));
  }));
}
