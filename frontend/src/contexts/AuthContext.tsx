import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import api, { ensureCsrfCookie, shouldUseLegacyTokenMode } from "../services/api";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { isAdminUser } from "../utils/auth";
import { AuthContext } from "./auth-context";

const AUTH_USER_CACHE_KEY = "auth_user_cache";
const AUTH_NOTICE_KEY = "portal_auth_notice";
const SESSION_HEARTBEAT_MS = 45_000;
const PRIVILEGED_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SERVER_ACTIVITY_SYNC_THROTTLE_MS = 60_000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "pointermove",
  "keydown",
  "scroll",
  "touchstart",
];
const POST_LOGIN_GRACE_MS = 12_000;
const POST_LOGIN_SESSION_BOOTSTRAP_ATTEMPTS = 4;

function shouldEnforceServerActivityTracking(user: Record<string, unknown> | null): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;

  const financeRole = (user as { finance_role?: unknown }).finance_role;
  return financeRole === "treasurer" || financeRole === "auditor";
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function waitForSessionBootstrap(): Promise<void> {
  for (let attempt = 0; attempt < POST_LOGIN_SESSION_BOOTSTRAP_ATTEMPTS; attempt += 1) {
    try {
      await api.get("/user");
      return;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      if (status !== 401 && status !== 419) {
        throw error;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const legacyTokenMode = shouldUseLegacyTokenMode();
  const [user, setUser] = useState<Record<string, unknown> | null>(() => {
    if (!legacyTokenMode) return null;

    const token = localStorage.getItem("auth_token");
    const cachedUserRaw = localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!token || !cachedUserRaw) return null;

    try {
      return JSON.parse(cachedUserRaw) as Record<string, unknown>;
    } catch {
      localStorage.removeItem(AUTH_USER_CACHE_KEY);
      return null;
    }
  });
  const [loading, setLoading] = useState(() => !legacyTokenMode || localStorage.getItem("auth_token") !== null);
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const lastServerActivitySyncAtRef = useRef(0);
  const authStateVersionRef = useRef(0);
  const postLoginGraceUntilRef = useRef(0);

  const clearStoredAuthState = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
    lastServerActivitySyncAtRef.current = 0;
    postLoginGraceUntilRef.current = 0;
    authStateVersionRef.current += 1;
  }, []);

  const clearAuthNotice = useCallback(() => {
    localStorage.removeItem(AUTH_NOTICE_KEY);
  }, []);

  const syncUserSession = useCallback(async (clearOnAuthFailure = true) => {
    const requestVersion = authStateVersionRef.current;
    const token = legacyTokenMode ? localStorage.getItem("auth_token") : null;
    if (legacyTokenMode && !token) {
      clearStoredAuthState();
      setUser(null);
      return;
    }

    try {
      const res = await api.get("/user");
      setUser(res.data);
      if (shouldEnforceServerActivityTracking(res.data)) {
        lastServerActivitySyncAtRef.current = Date.now();
      }
      if (legacyTokenMode) {
        localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(res.data));
      } else {
        localStorage.removeItem(AUTH_USER_CACHE_KEY);
      }
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const isAuthFailure = status === 401 || status === 419;
      const withinPostLoginGrace = Date.now() < postLoginGraceUntilRef.current;

      if (isAuthFailure && withinPostLoginGrace) {
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          const retryRes = await api.get("/user");
          setUser(retryRes.data);
          if (shouldEnforceServerActivityTracking(retryRes.data)) {
            lastServerActivitySyncAtRef.current = Date.now();
          }
          if (legacyTokenMode) {
            localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(retryRes.data));
          } else {
            localStorage.removeItem(AUTH_USER_CACHE_KEY);
          }
          return;
        } catch {
          // Fall through to normal auth-failure handling after grace retry.
        }
      }

      if (isAuthFailure && clearOnAuthFailure && requestVersion === authStateVersionRef.current) {
        clearStoredAuthState();
        setUser(null);
      }
    }
  }, [clearStoredAuthState, legacyTokenMode]);

  // Restore session on refresh
  useEffect(() => {
    if (legacyTokenMode) {
      const token = localStorage.getItem("auth_token");

      if (!token) {
        clearStoredAuthState();
        return;
      }
    }

    void (async () => {
      await syncUserSession();
      setLoading(false);
    })();
  }, [clearStoredAuthState, legacyTokenMode, syncUserSession]);

  const logout = useCallback(async () => {
    try {
      await ensureCsrfCookie(true);
      await api.post("/logout");
      clearStoredAuthState();
      setUser(null);
    } catch (error) {
      if (axios.isAxiosError(error) && [401, 419].includes(error.response?.status ?? 0)) {
        clearStoredAuthState();
        setUser(null);
        return;
      }

      throw error;
    }
  }, [clearStoredAuthState]);

  useEffect(() => {
    if (!user) return;

    const timer = window.setInterval(() => {
      const idleForMs = Date.now() - lastActivityAt;
      const requiresPrivilegedIdleTimeout = isAdminUser(user);

      if (requiresPrivilegedIdleTimeout && idleForMs >= PRIVILEGED_IDLE_TIMEOUT_MS) {
        localStorage.setItem(AUTH_NOTICE_KEY, "Your admin session ended after 10 minutes of inactivity.");
        void logout().catch(() => {
          clearStoredAuthState();
          setUser(null);
        });
        return;
      }

      if (!requiresPrivilegedIdleTimeout || idleForMs < PRIVILEGED_IDLE_TIMEOUT_MS) {
        void syncUserSession(false);
      }
    }, SESSION_HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [clearStoredAuthState, lastActivityAt, logout, syncUserSession, user]);

  useEffect(() => {
    if (!user) return;

    const markActivity = () => {
      const now = Date.now();
      setLastActivityAt(now);

      if (!shouldEnforceServerActivityTracking(user)) {
        return;
      }

      if (now - lastServerActivitySyncAtRef.current < SERVER_ACTIVITY_SYNC_THROTTLE_MS) {
        return;
      }

      lastServerActivitySyncAtRef.current = now;
      void api.post("/auth/activity").catch(() => {
        // Let existing auth interceptors/session checks handle expiry or replacement.
      });
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, markActivity, { passive: true });
    }

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, markActivity);
      }
    };
  }, [user]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (legacyTokenMode && event.key === "auth_token") {
        void syncUserSession();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [legacyTokenMode, syncUserSession]);

  const login = async (email: string, password: string) => {
    clearAuthNotice();
    authStateVersionRef.current += 1;

    try {
      await ensureCsrfCookie();
    } catch {
      if (!legacyTokenMode) {
        throw new Error("Unable to initialize CSRF cookie for session authentication.");
      }
    }
    const res = await api.post("/login", { email: normalizeEmail(email), password });
    const token = typeof res.data?.token === "string" ? res.data.token : null;
    if (token && legacyTokenMode) {
      localStorage.setItem("auth_token", token);
    } else {
      localStorage.removeItem("auth_token");
    }
    if (legacyTokenMode) {
      localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(res.data.user));
    } else {
      localStorage.removeItem(AUTH_USER_CACHE_KEY);
    }
    authStateVersionRef.current += 1;
    postLoginGraceUntilRef.current = Date.now() + POST_LOGIN_GRACE_MS;
    setUser(res.data.user);
    lastServerActivitySyncAtRef.current = Date.now();
    setLastActivityAt(Date.now());
    clearAuthNotice();

    if (!legacyTokenMode) {
      try {
        await waitForSessionBootstrap();
      } catch {
        // Allow the portal to continue; interceptor/grace handling will take over.
      }
    }
  };

  if (loading) return <AuthLoadingScreen />;

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser: syncUserSession }}>
      {children}
    </AuthContext.Provider>
  );
}
