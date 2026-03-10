import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "div",
  "figure",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "img",
  "hr",
  "code",
  "pre",
  "iframe",
] as const;

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "align",
  "class",
  "frameborder",
  "allow",
  "allowfullscreen",
  "loading",
  "referrerpolicy",
] as const;

export type ApprovedVideoProvider = "youtube" | "facebook";

type ApprovedVideoEmbed = {
  provider: ApprovedVideoProvider;
  embedUrl: string;
  canonicalUrl: string;
  title: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function looksLikeHtml(value: string): boolean {
  return /<\s*\/?\s*[a-z][^>]*>/i.test(value);
}

function looksLikeFileName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return /^[\w\-./ ]+\.(jpg|jpeg|png|webp|gif|svg|avif)$/.test(normalized);
}

function isEditorPlaceholderLabel(value: string): boolean {
  return value.trim().toLowerCase() === "type image label here...";
}

function isGenericImageLabel(value: string): boolean {
  return value.trim().toLowerCase() === "image";
}

function plainTextToHtml(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) return "<p></p>";

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export function normalizeRichHtml(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";
  return looksLikeHtml(normalized) ? normalized : plainTextToHtml(normalized);
}

export function sanitizeRichHtml(value: string): string {
  const html = normalizeRichHtml(value);
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    FORBID_TAGS: ["script", "style", "object", "embed", "form"],
    ALLOW_DATA_ATTR: false,
  });

  if (typeof document === "undefined") {
    return sanitized;
  }

  const container = document.createElement("div");
  container.innerHTML = sanitized;

  const upgradeApprovedVideoLinks = (root: HTMLElement) => {
    root.querySelectorAll("p").forEach((paragraph) => {
      const children = Array.from(paragraph.childNodes).filter((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent?.trim() !== "";
        }
        return true;
      });

      if (children.length !== 1) {
        return;
      }

      let candidateUrl = "";
      const onlyChild = children[0];
      if (onlyChild.nodeType === Node.TEXT_NODE) {
        candidateUrl = onlyChild.textContent?.trim() ?? "";
      } else if (onlyChild instanceof HTMLAnchorElement) {
        candidateUrl = onlyChild.getAttribute("href")?.trim() ?? "";
      }

      const embed = parseApprovedVideoEmbed(candidateUrl);
      if (!embed) {
        return;
      }

      const figure = buildVideoEmbedFigure(root.ownerDocument, embed);
      paragraph.replaceWith(figure);
    });
  };

  upgradeApprovedVideoLinks(container);

  container.querySelectorAll("iframe").forEach((iframe) => {
    const src = iframe.getAttribute("src")?.trim() ?? "";
    const embed = parseApprovedVideoEmbed(src);
    if (!embed) {
      iframe.remove();
      return;
    }

    const figure = buildVideoEmbedFigure(container.ownerDocument, embed);
    if (iframe.parentElement?.classList.contains("rich-video-embed")) {
      iframe.parentElement.replaceWith(figure);
      return;
    }

    iframe.replaceWith(figure);
  });

  const hasLabelBeforeNextImage = (image: Element): boolean => {
    let sibling = image.nextElementSibling;
    while (sibling) {
      if (sibling.tagName.toLowerCase() === "img") {
        return false;
      }
      if (sibling.classList.contains("image-label")) {
        return true;
      }
      sibling = sibling.nextElementSibling;
    }
    return false;
  };

  container.querySelectorAll("img").forEach((image) => {
    if (hasLabelBeforeNextImage(image)) {
      return;
    }

    const alt = (image.getAttribute("alt") || "").trim();
    const title = (image.getAttribute("title") || "").trim();
    const labelCandidate = alt || title;
    const labelText = labelCandidate && !looksLikeFileName(labelCandidate) ? labelCandidate : "Image";

    const label = document.createElement("p");
    label.className = "image-label";
    label.textContent = labelText;
    image.insertAdjacentElement("afterend", label);
  });

  container.querySelectorAll("p.image-label").forEach((label) => {
    const text = (label.textContent || "").trim();
    if (isEditorPlaceholderLabel(text)) {
      label.remove();
      return;
    }
    if (!text || looksLikeFileName(text)) {
      label.textContent = "Image";
    }
  });

  // If a meaningful label exists for an image, remove redundant generic "Image" labels in that image block.
  container.querySelectorAll("img").forEach((image) => {
    const labels: HTMLParagraphElement[] = [];
    let sibling = image.nextElementSibling;
    while (sibling) {
      if (sibling.tagName.toLowerCase() === "img") {
        break;
      }
      if (sibling.tagName.toLowerCase() === "p" && sibling.classList.contains("image-label")) {
        labels.push(sibling as HTMLParagraphElement);
      }
      sibling = sibling.nextElementSibling;
    }

    if (labels.length < 2) return;

    const hasMeaningful = labels.some((label) => {
      const text = (label.textContent || "").trim();
      return text !== "" && !isGenericImageLabel(text) && !isEditorPlaceholderLabel(text) && !looksLikeFileName(text);
    });

    if (!hasMeaningful) return;

    labels.forEach((label) => {
      const text = (label.textContent || "").trim();
      if (isGenericImageLabel(text)) {
        label.remove();
      }
    });
  });

  return container.innerHTML;
}

function buildVideoEmbedFigure(documentRef: Document, embed: ApprovedVideoEmbed): HTMLElement {
  const figure = documentRef.createElement("figure");
  figure.className = "rich-video-embed";
  figure.style.margin = "1.5rem 0";

  const frameWrap = documentRef.createElement("div");
  frameWrap.style.position = "relative";
  frameWrap.style.width = "100%";
  frameWrap.style.paddingTop = "56.25%";
  frameWrap.style.overflow = "hidden";
  frameWrap.style.borderRadius = "0.9rem";
  frameWrap.style.border = "1px solid rgba(255,255,255,0.16)";
  frameWrap.style.boxShadow = "0 18px 36px rgba(2, 6, 23, 0.28)";
  frameWrap.style.background = "rgba(7, 20, 40, 0.72)";

  const iframe = documentRef.createElement("iframe");
  iframe.src = embed.embedUrl;
  iframe.title = embed.title;
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.setAttribute("allowfullscreen", "true");
  iframe.style.position = "absolute";
  iframe.style.inset = "0";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";

  frameWrap.appendChild(iframe);
  figure.appendChild(frameWrap);

  const caption = documentRef.createElement("figcaption");
  caption.textContent = embed.provider === "youtube" ? "Embedded YouTube video" : "Embedded Facebook video";
  caption.style.marginTop = "0.45rem";
  caption.style.fontSize = "0.78rem";
  caption.style.color = "rgba(223, 232, 245, 0.75)";
  figure.appendChild(caption);

  return figure;
}

export function parseApprovedVideoEmbed(rawUrl: string): ApprovedVideoEmbed | null {
  const value = rawUrl.trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();

  if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "youtu.be") {
    const videoId = extractYoutubeVideoId(parsed);
    if (!videoId) return null;

    return {
      provider: "youtube",
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      title: "Embedded YouTube video",
    };
  }

  if (hostname === "facebook.com" || hostname === "m.facebook.com" || hostname === "fb.watch") {
    const canonicalUrl = extractFacebookCanonicalUrl(parsed);
    if (!canonicalUrl) return null;

    return {
      provider: "facebook",
      canonicalUrl,
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonicalUrl)}&show_text=false`,
      title: "Embedded Facebook video",
    };
  }

  return null;
}

function extractYoutubeVideoId(url: URL): string | null {
  const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (hostname === "youtu.be") {
    const id = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  }

  if (url.pathname.startsWith("/embed/")) {
    const id = url.pathname.split("/")[2] ?? "";
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  }

  const id = url.searchParams.get("v") ?? "";
  return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
}

function extractFacebookCanonicalUrl(url: URL): string | null {
  if (url.pathname.includes("/plugins/video.php")) {
    const href = url.searchParams.get("href") ?? "";
    try {
      const nested = new URL(href);
      const normalized = nested.hostname.replace(/^www\./i, "").toLowerCase();
      if (normalized === "facebook.com" || normalized === "m.facebook.com" || normalized === "fb.watch") {
        return nested.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (hostname === "fb.watch") {
    return url.toString();
  }

  if (url.pathname.includes("/videos/") || url.pathname.includes("/share/v/") || url.pathname.includes("/watch/")) {
    return url.toString();
  }

  return null;
}

export function htmlToPlainText(value: string): string {
  const html = sanitizeRichHtml(value);
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const element = document.createElement("div");
  element.innerHTML = html;
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}
