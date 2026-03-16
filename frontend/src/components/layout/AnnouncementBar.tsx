import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";
import api from "../../services/api";
import type { CmsPost } from "../../types/cms";
import { serializePushSubscription, urlBase64ToUint8Array } from "../../utils/pushNotifications";

type AnnouncementItem = {
  id: number;
  version: string;
  title: string;
  headline: string;
  excerpt: string;
  to: string;
  meta: string;
  expiresAt: string | null;
};

type PushConfig = {
  enabled: boolean;
  public_key: string | null;
  service_worker_path: string;
};

function formatAnnouncementDate(value: string | null): string {
  if (!value) return "Active now";

  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function AnnouncementBar() {
  const { user } = useAuth();
  const hasMemberProfile = Boolean((user as { has_member_profile?: unknown } | null)?.has_member_profile);
  const [announcements, setAnnouncements] = useState<CmsPost[]>([]);
  const [pushConfig, setPushConfig] = useState<PushConfig | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [pushError, setPushError] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const supportsBrowserPush = typeof window !== "undefined"
    && window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const endpoint = hasMemberProfile ? "/member-content/announcements" : "/content/announcements";
        const announcementsResponse = await api.get<CmsPost[]>(endpoint, { params: { limit: 4 } });

        if (!active) return;

        setAnnouncements(Array.isArray(announcementsResponse.data) ? announcementsResponse.data : []);

        if (!supportsBrowserPush) {
          setPushConfig(null);
          setPushEnabled(false);
          return;
        }

        const pushConfigResponse = await api.get<PushConfig>("/notifications/push/config");
        if (!active) return;

        setPushConfig(pushConfigResponse.data);

        if (pushConfigResponse.data.enabled) {
          const registration = await navigator.serviceWorker.register(pushConfigResponse.data.service_worker_path);
          const existingSubscription = await registration.pushManager.getSubscription();
          if (active) {
            setPushEnabled(Boolean(existingSubscription));
          }
        } else {
          setPushEnabled(false);
        }
      } catch {
        if (!active) return;
        setAnnouncements([]);
        setPushConfig(null);
        setPushEnabled(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [hasMemberProfile, supportsBrowserPush]);

  const items = useMemo<AnnouncementItem[]>(() => (
    announcements.map((post) => ({
      id: post.id,
      version: `${post.id}:${post.updated_at ?? post.published_at ?? post.created_at ?? "latest"}`,
      title: post.title,
      headline: post.announcement_text?.trim() || "Club announcement",
      excerpt: post.excerpt?.trim() || "Read the latest club notice and schedule details.",
      to: `/news/${post.slug}`,
      meta: post.announcement_expires_at
        ? `Until ${formatAnnouncementDate(post.announcement_expires_at)}`
        : `Posted ${formatAnnouncementDate(post.published_at)}`,
      expiresAt: post.announcement_expires_at,
    }))
  ), [announcements]);

  const featuredAnnouncement = items[0] ?? null;

  useEffect(() => {
    if (!featuredAnnouncement) {
      setToastVisible(false);
      setModalOpen(false);
      return;
    }

    const dismissed = localStorage.getItem(`lgec-announcement-dismissed:${featuredAnnouncement.version}`) === "1";
    setToastVisible(!dismissed);
  }, [featuredAnnouncement]);

  async function enableBrowserAlerts() {
    if (!supportsBrowserPush || !pushConfig?.enabled || !pushConfig.public_key) {
      setPushError("Browser alerts are not configured for this site yet.");
      return;
    }

    setPushPending(true);
    setPushError("");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushError("Browser notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.register(pushConfig.service_worker_path);
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pushConfig.public_key),
      });

      await api.post("/notifications/push/subscriptions", serializePushSubscription(subscription));
      setPushEnabled(true);
    } catch {
      setPushError("Unable to enable browser alerts on this device.");
    } finally {
      setPushPending(false);
    }
  }

  async function disableBrowserAlerts() {
    if (!supportsBrowserPush || !pushConfig?.enabled) {
      return;
    }

    setPushPending(true);
    setPushError("");

    try {
      const registration = await navigator.serviceWorker.register(pushConfig.service_worker_path);
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.delete("/notifications/push/subscriptions", {
          data: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }

      setPushEnabled(false);
    } catch {
      setPushError("Unable to disable browser alerts on this device.");
    } finally {
      setPushPending(false);
    }
  }

  function dismissFeaturedAnnouncement() {
    if (featuredAnnouncement) {
      localStorage.setItem(`lgec-announcement-dismissed:${featuredAnnouncement.version}`, "1");
    }

    setToastVisible(false);
    setModalOpen(false);
  }

  if (items.length === 0) {
    return (
      <section className="relative z-10 border-b border-white/10 bg-[linear-gradient(90deg,rgba(216,179,95,0.14),rgba(12,22,38,0.92),rgba(216,179,95,0.1))]">
        <div className="section-wrap flex flex-col gap-3 py-2 text-xs text-mist/85 md:flex-row md:items-center md:justify-between md:text-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 font-semibold uppercase tracking-[0.18em] text-gold-soft">
              Announcements
            </span>
            <span>No announcement</span>
          </div>
          {supportsBrowserPush && pushConfig?.enabled && (
            <button
              type="button"
              onClick={pushEnabled ? () => void disableBrowserAlerts() : () => void enableBrowserAlerts()}
              disabled={pushPending}
              className="w-fit rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-offwhite transition hover:border-gold/40 hover:text-gold disabled:opacity-60"
            >
              {pushPending ? "Updating Alerts..." : pushEnabled ? "Disable Browser Alerts" : "Enable Browser Alerts"}
            </button>
          )}
        </div>
        {pushError && (
          <div className="section-wrap pb-2 text-[11px] text-amber-200/90 md:text-xs">
            {pushError}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="relative z-10 border-b border-white/10 bg-[linear-gradient(90deg,rgba(216,179,95,0.16),rgba(12,22,38,0.94),rgba(216,179,95,0.08))]">
        <div className="section-wrap flex flex-col gap-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <span className="w-fit rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-soft">
              Announcements
            </span>
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1 md:pb-0">
              {items.map((item) => (
                <div
                  key={item.version}
                  className="min-w-[15rem] flex-1 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-left transition hover:border-gold/40 hover:bg-white/[0.09] hover:shadow-[0_10px_24px_rgba(224,180,74,0.12)]"
                >
                  <Link
                    to={item.to}
                    className="line-clamp-1 text-sm font-semibold text-gold-soft decoration-gold/0 underline-offset-4 transition hover:text-gold hover:decoration-gold hover:underline"
                  >
                    {item.headline}
                  </Link>
                  <div className="mt-1 text-xs text-mist/75">{item.meta}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 lg:items-end">
            {supportsBrowserPush && pushConfig?.enabled ? (
              <button
                type="button"
                onClick={pushEnabled ? () => void disableBrowserAlerts() : () => void enableBrowserAlerts()}
                disabled={pushPending}
                className="w-fit rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-offwhite transition hover:border-gold/40 hover:text-gold disabled:opacity-60"
              >
                {pushPending ? "Updating Alerts..." : pushEnabled ? "Browser Alerts On" : "Enable Browser Alerts"}
              </button>
            ) : (
              <span className="text-[11px] uppercase tracking-[0.16em] text-mist/65">
                {supportsBrowserPush ? "Browser alerts unavailable" : "Browser push not supported"}
              </span>
            )}
            {pushError && <span className="text-[11px] text-amber-200/90">{pushError}</span>}
          </div>
        </div>
      </section>

      {featuredAnnouncement && toastVisible && !modalOpen && (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex justify-center md:inset-x-auto md:right-4 md:w-[24rem]">
          <div className="pointer-events-auto w-full rounded-2xl border border-gold/30 bg-[linear-gradient(180deg,rgba(11,20,35,0.96),rgba(7,12,24,0.96))] p-4 shadow-[0_24px_50px_rgba(2,6,23,0.48)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-base font-semibold text-offwhite">
                  <Link
                    to={featuredAnnouncement.to}
                    className="text-gold-soft decoration-gold/0 underline-offset-4 transition hover:text-gold hover:decoration-gold hover:underline"
                  >
                    {featuredAnnouncement.headline}
                  </Link>
                </p>
                <p className="mt-2 text-sm text-mist/85">{featuredAnnouncement.excerpt}</p>
                <p className="mt-2 text-xs text-mist/70">{featuredAnnouncement.meta}</p>
              </div>
              <button
                type="button"
                onClick={dismissFeaturedAnnouncement}
                className="rounded-full border border-white/15 px-2 py-1 text-xs text-mist/80 transition hover:border-white/30 hover:text-offwhite"
                aria-label="Dismiss announcement notice"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setModalOpen(true)} className="btn-primary">
                Read Notice
              </button>
              <Link to={featuredAnnouncement.to} className="btn-secondary">
                Open Article
              </Link>
            </div>
          </div>
        </div>
      )}

      {featuredAnnouncement && modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            aria-label="Close announcement dialog"
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-modal-title"
            className="relative z-10 w-full max-w-2xl rounded-[1.75rem] border border-gold/25 bg-[linear-gradient(180deg,rgba(12,22,38,0.98),rgba(7,12,24,0.98))] p-6 shadow-[0_30px_60px_rgba(2,6,23,0.58)]"
          >
            <h2 id="announcement-modal-title" className="mt-3 font-heading text-3xl text-offwhite md:text-4xl">
              <Link
                to={featuredAnnouncement.to}
                className="text-gold-soft decoration-gold/0 underline-offset-4 transition hover:text-gold hover:decoration-gold hover:underline"
                onClick={() => setModalOpen(false)}
              >
                {featuredAnnouncement.headline}
              </Link>
            </h2>
            <p className="mt-4 text-base leading-7 text-mist/88">{featuredAnnouncement.excerpt}</p>
            <p className="mt-4 text-sm text-mist/72">
              {featuredAnnouncement.meta}
              {featuredAnnouncement.expiresAt ? " · Browser alerts will only fire when you enable them on this device." : ""}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={featuredAnnouncement.to} className="btn-primary" onClick={() => setModalOpen(false)}>
                Open Full Article
              </Link>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
                Back
              </button>
              <button type="button" onClick={dismissFeaturedAnnouncement} className="btn-secondary">
                Dismiss Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
