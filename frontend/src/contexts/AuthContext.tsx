import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import api, { ensureCsrfCookie, shouldUseLegacyTokenMode } from "../services/api";
import AuthLoadingScreen from "../components/AuthLoadingScreen";
import { AuthContext } from "./auth-context";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUserSession = async () => {
    const token = localStorage.getItem("auth_token");

    try {
      const res = await api.get("/user");
      setUser(res.data);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const isAuthFailure = status === 401 || status === 419;

      if (isAuthFailure) {
        if (token) {
          localStorage.removeItem("auth_token");
        }
        setUser(null);
      }
    }
  };

  // Restore session on refresh
  useEffect(() => {
    void (async () => {
      await syncUserSession();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "auth_token") {
        void syncUserSession();
      }
    };

    const onFocus = () => {
      void syncUserSession();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
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
