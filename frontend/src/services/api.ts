import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const configuredAuthMode = (import.meta.env.VITE_AUTH_MODE ?? "").toLowerCase();
const legacyTokenMode = configuredAuthMode === "token";

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

const AUTH_NOTICE_KEY = "portal_auth_notice";
export type GoogleOAuthIntent = "login" | "member_registration" | "applicant_registration";

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

export async function googleOAuthStatus(): Promise<{ enabled: boolean }> {
  const response = await api.get("/oauth/google/status");
  return {
    enabled: Boolean(response.data?.enabled),
  };
}

export function buildGoogleOAuthUrl(intent: GoogleOAuthIntent): string {
  const url = new URL(`${apiOrigin}/oauth/google/redirect`);
  url.searchParams.set("intent", intent);
  return url.toString();
}

api.interceptors.request.use((config) => {
  if (legacyTokenMode && config.headers) {
    config.headers["X-Auth-Mode"] = "token";
  }

  // Keep backward compatibility only when legacy token mode is explicitly enabled.
  const token = legacyTokenMode ? localStorage.getItem("auth_token") : null;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const payload = (error.response?.data as { code?: string; message?: string } | undefined) ?? {};
    if (status === 401 && (payload.code === "session_inactive" || payload.code === "session_replaced")) {
      localStorage.setItem(AUTH_NOTICE_KEY, payload.message ?? "Your portal session ended. Please log in again.");
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user_cache");
    }

    return Promise.reject(error);
  },
);

export default api;
