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
  withXSRFToken: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
});

export async function ensureCsrfCookie(force = false): Promise<void> {
  if (csrfCookieLoaded && !force) return;
  const candidates = [
    `${apiOrigin}/sanctum/csrf-cookie`,
    `${apiOrigin}/api/sanctum/csrf-cookie`,
  ];

  let lastError: unknown = null;
  for (let i = 0; i < candidates.length; i++) {
    const endpoint = candidates[i];
    try {
      await axios.get(endpoint, {
        withCredentials: true,
        withXSRFToken: true,
        xsrfCookieName: "XSRF-TOKEN",
        xsrfHeaderName: "X-XSRF-TOKEN",
      });
      csrfCookieLoaded = true;
      if (i > 0) {
        console.debug(`CSRF cookie obtained from fallback endpoint: ${endpoint}`);
      }
      return;
    } catch (error) {
      console.debug(`CSRF cookie endpoint failed (${i + 1}/${candidates.length}): ${endpoint}`);
      lastError = error;
    }
  }

  console.error("All CSRF cookie endpoints failed. Using token mode may require explicit configuration.");
  throw lastError;
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
