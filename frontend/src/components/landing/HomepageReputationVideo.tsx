import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type HomepageReputationVideoData = {
  title: string;
  caption: string;
  eyebrow: string;
  provider: string;
  embedUrl: string;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
};

type HomepageReputationVideoProps = {
  video: HomepageReputationVideoData;
  layout?: "desktop" | "mobile" | "stack";
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function buildPlaybackUrl(video: HomepageReputationVideoData): string {
  try {
    const url = new URL(video.embedUrl);
    const host = url.hostname.toLowerCase();

    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("rel", "0");
      url.searchParams.set("modestbranding", "1");
    } else if (host.includes("facebook.com")) {
      url.searchParams.set("autoplay", "true");
    }

    return url.toString();
  } catch {
    return video.embedUrl;
  }
}

export default function HomepageReputationVideo({
  video,
  layout = "desktop",
}: HomepageReputationVideoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const playbackUrl = useMemo(() => buildPlaybackUrl(video), [video]);
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const triggerElement = triggerRef.current;
    document.body.style.overflow = "hidden";

    const focusClose = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableItems = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusableItems || focusableItems.length === 0) {
        event.preventDefault();
        return;
      }

      const firstItem = focusableItems[0];
      const lastItem = focusableItems[focusableItems.length - 1];

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusClose);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerElement?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`homepage-video-teaser surface-card card-lift reveal reveal-delay-2 ${
          layout === "desktop"
            ? "homepage-video-teaser-desktop"
            : layout === "mobile"
              ? "homepage-video-teaser-mobile"
              : "homepage-video-teaser-stack"
        }`}
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Play ${video.title}`}
      >
        <div className="homepage-video-teaser-media">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="homepage-video-teaser-image"
            />
          ) : (
            <div className="homepage-video-teaser-fallback" aria-hidden="true">
              <img src="/images/lgec-logo.png" alt="" className="h-12 w-12 object-contain opacity-80" />
            </div>
          )}
          <div className="homepage-video-teaser-overlay" aria-hidden="true" />
          <span className="homepage-video-play-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" focusable="false">
              <path d="M8 6.5v11l9-5.5-9-5.5Z" />
            </svg>
          </span>
        </div>
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="homepage-video-modal-layer" aria-live="polite">
              <button
                type="button"
                className="homepage-video-modal-backdrop"
                aria-label="Close LGEC video dialog"
                onClick={() => setIsOpen(false)}
              />
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="homepage-video-modal-panel"
              >
                <div className="homepage-video-modal-header">
                  <div>
                    <h3 id={titleId} className="homepage-video-modal-title">
                      {video.title}
                    </h3>
                    <p id={descriptionId} className="homepage-video-modal-description">
                      {video.caption}
                    </p>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className="homepage-video-close-button"
                    onClick={() => setIsOpen(false)}
                  >
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">Close video dialog</span>
                  </button>
                </div>

                <div className="homepage-video-frame-shell">
                  <iframe
                    src={playbackUrl}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="homepage-video-frame"
                  />
                </div>

                {video.sourceUrl ? (
                  <a
                    href={video.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="homepage-video-source-link"
                  >
                    Open original video
                  </a>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
