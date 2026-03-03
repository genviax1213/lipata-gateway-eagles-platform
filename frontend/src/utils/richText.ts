import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
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
] as const;

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "title",
  "width",
  "align",
  "class",
] as const;

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
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    ALLOW_DATA_ATTR: false,
  });

  if (typeof document === "undefined") {
    return sanitized;
  }

  const container = document.createElement("div");
  container.innerHTML = sanitized;

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

export function htmlToPlainText(value: string): string {
  const html = sanitizeRichHtml(value);
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const element = document.createElement("div");
  element.innerHTML = html;
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}
