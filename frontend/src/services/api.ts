import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const legacyTokenMode = (import.meta.env.VITE_AUTH_MODE ?? "").toLowerCase() === "token";

function resolveApiOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return window.location.origin;
  }
}

const apiOrigin = resolveApiOrigin(apiBaseUrl);
let csrfCookieLoaded = false;

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

export async function ensureCsrfCookie(force = false): Promise<void> {
  if (csrfCookieLoaded && !force) return;
  await axios.get(`${apiOrigin}/sanctum/csrf-cookie`, { withCredentials: true });
  csrfCookieLoaded = true;
}

export function shouldUseLegacyTokenMode(): boolean {
  return legacyTokenMode;
}

api.interceptors.request.use((config) => {
  if (legacyTokenMode && config.headers) {
    config.headers["X-Auth-Mode"] = "token";
  }

  // Keep backward compatibility for existing bearer-token sessions.
  const token = localStorage.getItem("auth_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
