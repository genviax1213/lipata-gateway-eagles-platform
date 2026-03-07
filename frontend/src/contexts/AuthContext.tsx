import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import api, { ensureCsrfCookie, shouldUseLegacyTokenMode } from "../services/api";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { AuthContext } from "./auth-context";

const AUTH_USER_CACHE_KEY = "auth_user_cache";
const SESSION_HEARTBEAT_MS = 45_000;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const legacyTokenMode = shouldUseLegacyTokenMode();

  const clearStoredAuthState = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
  }, []);

  const syncUserSession = useCallback(async (clearOnAuthFailure = true) => {
    const token = legacyTokenMode ? localStorage.getItem("auth_token") : null;
    if (legacyTokenMode && !token) {
      clearStoredAuthState();
      setUser(null);
      return;
    }

    try {
      const res = await api.get("/user");
      setUser(res.data);
      if (legacyTokenMode) {
        localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(res.data));
      } else {
        localStorage.removeItem(AUTH_USER_CACHE_KEY);
      }
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const isAuthFailure = status === 401 || status === 419;

      if (isAuthFailure && clearOnAuthFailure) {
        clearStoredAuthState();
        setUser(null);
      }
    }
  }, [clearStoredAuthState, legacyTokenMode]);

  // Restore session on refresh
  useEffect(() => {
    if (legacyTokenMode) {
      const token = localStorage.getItem("auth_token");
      const cachedUserRaw = localStorage.getItem(AUTH_USER_CACHE_KEY);

      if (token && cachedUserRaw) {
        try {
          const cachedUser = JSON.parse(cachedUserRaw) as Record<string, unknown>;
          setUser(cachedUser);
        } catch {
          localStorage.removeItem(AUTH_USER_CACHE_KEY);
        }
      }

      if (!token) {
        clearStoredAuthState();
        setLoading(false);
        return;
      }
    }

    void (async () => {
      await syncUserSession();
      setLoading(false);
    })();
  }, [clearStoredAuthState, legacyTokenMode, syncUserSession]);

  useEffect(() => {
    if (!user) return;

    const timer = window.setInterval(() => {
      void syncUserSession();
    }, SESSION_HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [syncUserSession, user]);

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
    setUser(res.data.user);
  };

  const logout = async () => {
    try {
      await ensureCsrfCookie();
      await api.post("/logout");
    } catch {
      // Keep client-side cleanup deterministic even if API logout fails.
    } finally {
      clearStoredAuthState();
      setUser(null);
    }
  };

  if (loading) return <AuthLoadingScreen />;

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
