import { useState, useEffect } from "react";
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

  const syncUserSession = async (clearOnAuthFailure = true) => {
    const token = localStorage.getItem("auth_token");
    if (shouldUseLegacyTokenMode() && !token) {
      localStorage.removeItem(AUTH_USER_CACHE_KEY);
      setUser(null);
      return;
    }

    try {
      const res = await api.get("/user");
      setUser(res.data);
      localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(res.data));
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const isAuthFailure = status === 401 || status === 419;

      if (isAuthFailure && clearOnAuthFailure) {
        if (token) {
          localStorage.removeItem("auth_token");
        }
        localStorage.removeItem(AUTH_USER_CACHE_KEY);
        setUser(null);
      }
    }
  };

  // Restore session on refresh
  useEffect(() => {
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

    if (shouldUseLegacyTokenMode() && !token) {
      setLoading(false);
      return;
    }

    void (async () => {
      await syncUserSession();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;

    const timer = window.setInterval(() => {
      void syncUserSession();
    }, SESSION_HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "auth_token") {
        void syncUserSession();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await ensureCsrfCookie();
    } catch {
      if (!shouldUseLegacyTokenMode()) {
        throw new Error("Unable to initialize CSRF cookie for session authentication.");
      }
    }
    const res = await api.post("/login", { email: normalizeEmail(email), password });
    const token = typeof res.data?.token === "string" ? res.data.token : null;
    if (token && shouldUseLegacyTokenMode()) {
      localStorage.setItem("auth_token", token);
    } else {
      localStorage.removeItem("auth_token");
    }
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const logout = async () => {
    try {
      await ensureCsrfCookie();
      await api.post("/logout");
    } catch {
      // Keep client-side cleanup deterministic even if API logout fails.
    } finally {
      localStorage.removeItem("auth_token");
      localStorage.removeItem(AUTH_USER_CACHE_KEY);
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
