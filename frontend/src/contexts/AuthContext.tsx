import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import api from "../services/api";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUserFromToken = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const res = await api.get("/user");
      setUser(res.data);
    } catch {
      localStorage.removeItem("auth_token");
      setUser(null);
    }
  };

  // Restore session on refresh
  useEffect(() => {
    void (async () => {
      await syncUserFromToken();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "auth_token") {
        void syncUserFromToken();
      }
    };

    const onFocus = () => {
      void syncUserFromToken();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/login", { email, password });
    localStorage.setItem("auth_token", res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setUser(null);
  };

  if (loading) return null;

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
