export const PORTAL_DATA_REFRESH_EVENT = "lgec:portal-data-refresh";
const PORTAL_DATA_REFRESH_KEY = "lgec:portal-data-refresh";

export function notifyPortalDataRefresh(scope: string): void {
  const detail = {
    scope,
    at: Date.now(),
  };

  window.dispatchEvent(new CustomEvent(PORTAL_DATA_REFRESH_EVENT, { detail }));

  try {
    localStorage.setItem(PORTAL_DATA_REFRESH_KEY, JSON.stringify(detail));
  } catch {
    // Ignore storage failures; same-tab listeners still receive the custom event.
  }
}

export function isPortalDataRefreshScope(value: unknown, scopes: string[]): boolean {
  if (!value || typeof value !== "object") return false;
  const scope = (value as { scope?: unknown }).scope;
  return typeof scope === "string" && scopes.includes(scope);
}

export function parsePortalDataRefresh(raw: string | null): { scope: string; at: number } | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { scope?: unknown; at?: unknown };
    if (typeof parsed.scope === "string" && typeof parsed.at === "number") {
      return { scope: parsed.scope, at: parsed.at };
    }
  } catch {
    return null;
  }

  return null;
}
