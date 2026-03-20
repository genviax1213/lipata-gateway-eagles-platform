import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../contexts/useAuth";

const VISITOR_ID_KEY = "lgec.visitor.id.v1";
const SESSION_ID_KEY = "lgec.visitor.session.v1";
const HEARTBEAT_MS = 30_000;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateToken(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;

  const next = createId();
  storage.setItem(key, next);
  return next;
}

function currentPath(location: ReturnType<typeof useLocation>): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

async function trackVisit(payload: Record<string, unknown>) {
  try {
    await api.post("/visitor-analytics/track", payload);
  } catch {
    // Tracking should stay silent and never interrupt navigation.
  }
}

export default function VisitorTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const [visitorToken] = useState(() => getOrCreateToken(localStorage, VISITOR_ID_KEY));
  const [sessionToken] = useState(() => getOrCreateToken(sessionStorage, SESSION_ID_KEY));

  useEffect(() => {
    const send = (eventType: "page_view" | "heartbeat") => {
      if (eventType === "heartbeat" && document.visibilityState !== "visible") {
        return;
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      void trackVisit({
        visitor_token: visitorToken,
        session_token: sessionToken,
        path: currentPath(location),
        title: document.title || null,
        referrer: document.referrer || null,
        timezone,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
      });
    };

    send("page_view");

    const intervalId = window.setInterval(() => {
      send("heartbeat");
    }, HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        send("heartbeat");
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [location, sessionToken, user, visitorToken]);

  return null;
}
