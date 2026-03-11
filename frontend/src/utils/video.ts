export function extractYoutubeVideoId(urlValue: string | null | undefined): string | null {
  if (!urlValue) return null;

  try {
    const url = new URL(urlValue);
    const host = url.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      const embedIndex = pathParts.findIndex((segment) => segment === "embed" || segment === "shorts" || segment === "live");
      if (embedIndex >= 0) {
        return pathParts[embedIndex + 1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function buildVideoThumbnailCandidates(video: {
  thumbnailUrl?: string | null;
  sourceUrl?: string | null;
  embedUrl?: string | null;
}): string[] {
  const configuredThumbnail = video.thumbnailUrl?.trim();
  const youtubeId =
    extractYoutubeVideoId(configuredThumbnail) ??
    extractYoutubeVideoId(video.sourceUrl) ??
    extractYoutubeVideoId(video.embedUrl);

  const candidates = configuredThumbnail ? [configuredThumbnail] : [];

  if (!youtubeId) {
    return candidates;
  }

  return [
    `https://i.ytimg.com/vi_webp/${youtubeId}/maxresdefault.webp`,
    `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${youtubeId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    ...candidates,
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
}
