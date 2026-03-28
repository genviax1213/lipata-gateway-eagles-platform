import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CmsPost } from "../src/types/cms";
import { cmsPostDetailPath } from "../src/utils/cmsPaths";

const DEFAULT_SITE_ORIGIN = "https://www.lgec.org";
const DIST_DIR = "dist";
const DIST_INDEX_PATH = path.join(DIST_DIR, "index.html");

type PaginatedResponse<T> = {
  data?: T[];
  last_page?: number;
};

type SectionConfig = {
  key: "about" | "history" | "activities";
  title: string;
  description: string;
  pathname: string;
};

const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: "about",
    title: "About | Lipata Gateway Eagles Club",
    description: "About the Lipata Gateway Eagles Club, its mission, and the latest club overview article.",
    pathname: "/about",
  },
  {
    key: "history",
    title: "History | Lipata Gateway Eagles Club",
    description: "Historical records, milestones, and archive highlights from Lipata Gateway Eagles Club.",
    pathname: "/history",
  },
  {
    key: "activities",
    title: "Activities | Lipata Gateway Eagles Club",
    description: "Public activities, community projects, and service updates from Lipata Gateway Eagles Club.",
    pathname: "/activities",
  },
];

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function replaceMetaTag(html: string, selector: string, content: string): string {
  const escapedContent = escapeHtml(content);
  const pattern = new RegExp(`(<meta\\s+${selector}\\s+content=\")[^\"]*(\"\\s*/?>)`, "i");
  return html.replace(pattern, `$1${escapedContent}$2`);
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function replaceFallbackShell(html: string, fallbackHtml: string): string {
  return html.replace(
    /<div id="homepage-fallback-shell">[\s\S]*?<\/div>\s*(?:<script id="__LGEC_HOMEPAGE_PRERENDER__" type="application\/json">[\s\S]*?<\/script>\s*)?<div id="root"><\/div>/i,
    `<div id="homepage-fallback-shell">${fallbackHtml}</div>\n    <div id="root"></div>`,
  );
}

function renderAboutFallback(post: CmsPost | null, siteOrigin: string): string {
  const title = escapeHtml(post?.title ?? "About the Club");
  const excerpt = escapeHtml(snippet(post?.excerpt || post?.content || "", 260) || "Learn more about the club, its purpose, and its public mission.");
  const body = post?.content || `<p>Lipata Gateway Eagles Club is part of The Fraternal Order of Eagles (TFOE), Inc., committed to strengthening brotherhood and serving the community.</p>`;
  const imageUrl = normalizeUrl(post?.image_url, siteOrigin);
  const articleUrl = post?.slug ? `${siteOrigin}${cmsPostDetailPath(post)}` : null;

  return `
    <main aria-labelledby="about-fallback-title" style="max-width: 1040px; margin: 0 auto; padding: 56px 20px 72px; color: #f6f1e6; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.65;">
      <p style="margin: 0 0 12px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">About</p>
      <h1 id="about-fallback-title" style="margin: 0 0 16px; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.05; color: #fff;">${title}</h1>
      <p style="max-width: 48rem; margin: 0 0 24px; font-size: 1.05rem; color: rgba(246, 241, 230, 0.86);">${excerpt}</p>
      ${imageUrl ? `<img src="${imageUrl}" alt="${title}" style="width: 100%; max-height: 520px; object-fit: cover; display: block; border-radius: 28px; box-shadow: 0 18px 48px rgba(0,0,0,0.28); margin-bottom: 28px;" />` : ""}
      <article style="border-radius: 28px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(8, 20, 41, 0.72); box-shadow: 0 28px 60px rgba(2, 6, 23, 0.34); padding: 28px;">
        <div style="color: rgba(246, 241, 230, 0.92);">${body}</div>
      </article>
      ${articleUrl ? `<div style="margin-top: 24px;"><a href="${articleUrl}" style="display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #d7ba6d; color: #07111f; padding: 12px 18px; font-weight: 700; text-decoration: none;">Read Full Article</a></div>` : ""}
    </main>
  `.trim();
}

function renderCardGridFallback({
  eyebrow,
  heading,
  description,
  posts,
  siteOrigin,
}: {
  eyebrow: string;
  heading: string;
  description: string;
  posts: CmsPost[];
  siteOrigin: string;
}): string {
  const cards = posts.length > 0
    ? posts.map((post) => {
        const imageUrl = normalizeUrl(post.image_url, siteOrigin);
        const detailUrl = post.slug ? `${siteOrigin}${cmsPostDetailPath(post)}` : `${siteOrigin}/`;
        return `
          <article style="border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; overflow: hidden; background: rgba(255, 255, 255, 0.04);">
            ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHtml(post.title)}" style="width: 100%; height: 180px; object-fit: cover; display: block;" />` : ""}
            <div style="padding: 18px;">
              <h2 style="margin: 0 0 8px; font-size: 1.2rem; color: #fff;">${escapeHtml(post.title)}</h2>
              <p style="margin: 0 0 12px; color: rgba(246, 241, 230, 0.82);">${escapeHtml(snippet(post.excerpt || post.content || "", 160))}</p>
              <a href="${detailUrl}" style="color: #d7ba6d; text-decoration: none; font-weight: 600;">Read Full Article</a>
            </div>
          </article>
        `;
      }).join("")
    : `
      <article style="border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 18px; padding: 18px; background: rgba(255, 255, 255, 0.04); color: rgba(246, 241, 230, 0.82);">
        No public posts are available in this section yet.
      </article>
    `;

  return `
    <main aria-labelledby="section-fallback-title" style="max-width: 1040px; margin: 0 auto; padding: 56px 20px 72px; color: #f6f1e6; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.65;">
      <p style="margin: 0 0 12px; letter-spacing: 0.18em; text-transform: uppercase; font-size: 12px; color: #d7ba6d;">${escapeHtml(eyebrow)}</p>
      <h1 id="section-fallback-title" style="margin: 0 0 16px; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.05; color: #fff;">${escapeHtml(heading)}</h1>
      <p style="max-width: 48rem; margin: 0 0 24px; font-size: 1.05rem; color: rgba(246, 241, 230, 0.86);">${escapeHtml(description)}</p>
      <div style="display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));">
        ${cards}
      </div>
    </main>
  `.trim();
}

async function fetchAboutPosts(apiBaseUrl: string): Promise<CmsPost[]> {
  const response = await fetchJson<PaginatedResponse<CmsPost>>(`${apiBaseUrl}/content/about?paginate=true&page=1&per_page=1`);
  return Array.isArray(response.data) ? response.data : [];
}

async function fetchHistoryPosts(apiBaseUrl: string): Promise<CmsPost[]> {
  const response = await fetchJson<PaginatedResponse<CmsPost>>(`${apiBaseUrl}/content/history?paginate=true&page=1&per_page=6`);
  return Array.isArray(response.data) ? response.data : [];
}

async function fetchActivityPosts(apiBaseUrl: string): Promise<CmsPost[]> {
  const response = await fetchJson<PaginatedResponse<CmsPost>>(`${apiBaseUrl}/content/activities?paginate=true&page=1&per_page=6`);
  const posts = Array.isArray(response.data) ? response.data : [];
  if (posts.length > 0) return posts;

  const fallback = await fetchJson<unknown>(`${apiBaseUrl}/content/homepage-community`);
  return Array.isArray(fallback) ? (fallback as CmsPost[]) : [];
}

function applySectionHtml(baseHtml: string, section: SectionConfig, fallbackHtml: string, description: string, image: string, siteOrigin: string): string {
  let html = baseHtml;
  html = replaceTitle(html, section.title);
  html = replaceMetaTag(html, 'name="description"', description);
  html = replaceMetaTag(html, 'property="og:url"', `${siteOrigin}${section.pathname}`);
  html = replaceMetaTag(html, 'property="og:title"', section.title);
  html = replaceMetaTag(html, 'property="og:description"', description);
  html = replaceMetaTag(html, 'property="og:image"', image);
  html = replaceMetaTag(html, 'property="og:image:secure_url"', image);
  html = replaceMetaTag(html, 'property="og:image:alt"', section.title);
  html = replaceMetaTag(html, 'name="twitter:title"', section.title);
  html = replaceMetaTag(html, 'name="twitter:description"', description);
  html = replaceMetaTag(html, 'name="twitter:image"', image);
  html = replaceFallbackShell(html, fallbackHtml);
  return html;
}

export async function buildPublicSectionPrerender(
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

  const [baseHtml, aboutPosts, historyPosts, activityPosts] = await Promise.all([
    readFile(DIST_INDEX_PATH, "utf8"),
    fetchAboutPosts(apiBaseUrl),
    fetchHistoryPosts(apiBaseUrl),
    fetchActivityPosts(apiBaseUrl),
  ]);

  const renderedSections = [
    {
      config: SECTION_CONFIGS[0],
      fallbackHtml: renderAboutFallback(aboutPosts[0] ?? null, siteOrigin),
      description: snippet(aboutPosts[0]?.excerpt || aboutPosts[0]?.content || SECTION_CONFIGS[0].description, 220) || SECTION_CONFIGS[0].description,
      image: normalizeUrl(aboutPosts[0]?.image_url, siteOrigin) || `${siteOrigin}/images/gallery/brigada-1.jpg`,
    },
    {
      config: SECTION_CONFIGS[1],
      fallbackHtml: renderCardGridFallback({
        eyebrow: "History",
        heading: "Club History",
        description: "Historical records, milestones, and archive highlights from the club.",
        posts: historyPosts,
        siteOrigin,
      }),
      description: snippet(historyPosts[0]?.excerpt || historyPosts[0]?.content || SECTION_CONFIGS[1].description, 220) || SECTION_CONFIGS[1].description,
      image: normalizeUrl(historyPosts[0]?.image_url, siteOrigin) || `${siteOrigin}/images/gallery/brigada-1.jpg`,
    },
    {
      config: SECTION_CONFIGS[2],
      fallbackHtml: renderCardGridFallback({
        eyebrow: "Activities",
        heading: "Activities & Community Projects",
        description: "Public activities, projects, and community engagements from Lipata Gateway Eagles Club.",
        posts: activityPosts,
        siteOrigin,
      }),
      description: snippet(activityPosts[0]?.excerpt || activityPosts[0]?.content || SECTION_CONFIGS[2].description, 220) || SECTION_CONFIGS[2].description,
      image: normalizeUrl(activityPosts[0]?.image_url, siteOrigin) || `${siteOrigin}/images/gallery/brigada-1.jpg`,
    },
  ];

  await Promise.all(renderedSections.map(async ({ config, fallbackHtml, description, image }) => {
    const outputDir = path.join(DIST_DIR, config.pathname.replace(/^\//, ""));
    const outputFile = path.join(outputDir, "index.html");
    const html = applySectionHtml(baseHtml, config, fallbackHtml, description, image, siteOrigin);
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputFile, html, "utf8");
  }));
}
