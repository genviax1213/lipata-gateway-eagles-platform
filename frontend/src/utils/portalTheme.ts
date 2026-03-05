export type PortalThemeMode = "normal" | "dark";

export interface PortalThemePalette {
  id: string;
  name: string;
  mode: PortalThemeMode;
  navy: string;
  ink: string;
  mist: string;
  offwhite: string;
  gold: string;
  goldSoft: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  bgRadialPrimary: string;
  bgRadialSecondary: string;
}

export interface StoredPortalTheme {
  selectedThemeId: string;
  customTheme: PortalThemePalette | null;
}

const STORAGE_KEY = "lgec.portal.theme.v1";
const DEFAULT_THEME_ID = "midnight-harbor";

export const PORTAL_BUILTIN_THEMES: PortalThemePalette[] = [
  {
    id: "midnight-harbor",
    name: "Midnight Harbor",
    mode: "dark",
    navy: "#12315a",
    ink: "#0a1730",
    mist: "#dfe8f5",
    offwhite: "#f6f1e6",
    gold: "#e0b44a",
    goldSoft: "#f3db98",
    bgStart: "#071428",
    bgMid: "#102a4f",
    bgEnd: "#1a3b64",
    bgRadialPrimary: "rgba(224, 180, 74, 0.34)",
    bgRadialSecondary: "rgba(92, 137, 201, 0.3)",
  },
  {
    id: "graphite-teal",
    name: "Graphite Teal",
    mode: "dark",
    navy: "#1a3f4c",
    ink: "#0a1d24",
    mist: "#d7ebee",
    offwhite: "#edf3f2",
    gold: "#d19a45",
    goldSoft: "#efc889",
    bgStart: "#07191f",
    bgMid: "#0f2e38",
    bgEnd: "#1b4b57",
    bgRadialPrimary: "rgba(209, 154, 69, 0.3)",
    bgRadialSecondary: "rgba(84, 154, 173, 0.28)",
  },
  {
    id: "forest-bronze",
    name: "Forest Bronze",
    mode: "normal",
    navy: "#214237",
    ink: "#10231d",
    mist: "#ddeee4",
    offwhite: "#f3f5ee",
    gold: "#c69549",
    goldSoft: "#e6c693",
    bgStart: "#0e1f19",
    bgMid: "#1f3b31",
    bgEnd: "#2f5547",
    bgRadialPrimary: "rgba(198, 149, 73, 0.28)",
    bgRadialSecondary: "rgba(101, 158, 126, 0.28)",
  },
  {
    id: "slate-rose",
    name: "Slate Rose",
    mode: "normal",
    navy: "#3f3f58",
    ink: "#1f1f31",
    mist: "#e5e2f1",
    offwhite: "#f4f1f5",
    gold: "#cb9a62",
    goldSoft: "#ebc49b",
    bgStart: "#171829",
    bgMid: "#2c2f49",
    bgEnd: "#434866",
    bgRadialPrimary: "rgba(203, 154, 98, 0.25)",
    bgRadialSecondary: "rgba(155, 132, 184, 0.25)",
  },
  {
    id: "obsidian-violet",
    name: "Obsidian Violet",
    mode: "dark",
    navy: "#3a2f57",
    ink: "#1a132a",
    mist: "#e4dcf2",
    offwhite: "#f4eff8",
    gold: "#bf9956",
    goldSoft: "#e2c492",
    bgStart: "#130f20",
    bgMid: "#2a2340",
    bgEnd: "#3f3560",
    bgRadialPrimary: "rgba(191, 153, 86, 0.24)",
    bgRadialSecondary: "rgba(133, 109, 178, 0.27)",
  },
  {
    id: "night-sapphire",
    name: "Night Sapphire",
    mode: "dark",
    navy: "#22486a",
    ink: "#0d2235",
    mist: "#dbe9f5",
    offwhite: "#f2f5f8",
    gold: "#ca9f58",
    goldSoft: "#e8c893",
    bgStart: "#0a1727",
    bgMid: "#15314a",
    bgEnd: "#215070",
    bgRadialPrimary: "rgba(202, 159, 88, 0.28)",
    bgRadialSecondary: "rgba(84, 139, 196, 0.3)",
  },
  {
    id: "charcoal-ember",
    name: "Charcoal Ember",
    mode: "dark",
    navy: "#4f3630",
    ink: "#281814",
    mist: "#f0e0da",
    offwhite: "#f7f1ed",
    gold: "#c88c52",
    goldSoft: "#e9bc91",
    bgStart: "#1b100d",
    bgMid: "#3b241e",
    bgEnd: "#5a3a31",
    bgRadialPrimary: "rgba(200, 140, 82, 0.29)",
    bgRadialSecondary: "rgba(145, 95, 85, 0.24)",
  },
  {
    id: "deep-ocean",
    name: "Deep Ocean",
    mode: "normal",
    navy: "#1b4f5b",
    ink: "#0f2830",
    mist: "#d9eff0",
    offwhite: "#eef5f5",
    gold: "#be9b54",
    goldSoft: "#dcc58f",
    bgStart: "#0b1d23",
    bgMid: "#17404a",
    bgEnd: "#24616d",
    bgRadialPrimary: "rgba(190, 155, 84, 0.24)",
    bgRadialSecondary: "rgba(91, 168, 182, 0.28)",
  },
  {
    id: "indigo-smoke",
    name: "Indigo Smoke",
    mode: "normal",
    navy: "#2f4164",
    ink: "#151f34",
    mist: "#dde4f3",
    offwhite: "#f2f4f8",
    gold: "#c3a05c",
    goldSoft: "#e2c897",
    bgStart: "#101628",
    bgMid: "#22324e",
    bgEnd: "#364d72",
    bgRadialPrimary: "rgba(195, 160, 92, 0.25)",
    bgRadialSecondary: "rgba(102, 128, 178, 0.25)",
  },
  {
    id: "moss-night",
    name: "Moss Night",
    mode: "dark",
    navy: "#314a3b",
    ink: "#16231b",
    mist: "#deece2",
    offwhite: "#f1f4ef",
    gold: "#ba9751",
    goldSoft: "#dbc48e",
    bgStart: "#0f1a14",
    bgMid: "#243a2e",
    bgEnd: "#365443",
    bgRadialPrimary: "rgba(186, 151, 81, 0.24)",
    bgRadialSecondary: "rgba(99, 145, 120, 0.28)",
  },
];

export function getDefaultPortalTheme(): PortalThemePalette {
  return PORTAL_BUILTIN_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID) ?? PORTAL_BUILTIN_THEMES[0];
}

export function getPortalThemeById(id: string): PortalThemePalette | null {
  return PORTAL_BUILTIN_THEMES.find((theme) => theme.id === id) ?? null;
}

export function readStoredPortalTheme(): StoredPortalTheme {
  if (typeof window === "undefined") {
    return { selectedThemeId: DEFAULT_THEME_ID, customTheme: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { selectedThemeId: DEFAULT_THEME_ID, customTheme: null };

    const parsed = JSON.parse(raw) as Partial<StoredPortalTheme>;
    const selectedThemeId = typeof parsed.selectedThemeId === "string" ? parsed.selectedThemeId : DEFAULT_THEME_ID;
    const customTheme = isPortalThemePalette(parsed.customTheme) ? parsed.customTheme : null;
    return { selectedThemeId, customTheme };
  } catch {
    return { selectedThemeId: DEFAULT_THEME_ID, customTheme: null };
  }
}

export function saveStoredPortalTheme(state: StoredPortalTheme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resolvePortalTheme(state: StoredPortalTheme): PortalThemePalette {
  if (state.selectedThemeId === "custom" && state.customTheme) {
    return state.customTheme;
  }

  return getPortalThemeById(state.selectedThemeId) ?? getDefaultPortalTheme();
}

export function applyPortalTheme(theme: PortalThemePalette): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  root.style.setProperty("--color-navy", theme.navy);
  root.style.setProperty("--color-ink", theme.ink);
  root.style.setProperty("--color-mist", theme.mist);
  root.style.setProperty("--color-offwhite", theme.offwhite);
  root.style.setProperty("--color-gold", theme.gold);
  root.style.setProperty("--color-gold-soft", theme.goldSoft);
  root.style.setProperty("--portal-bg-start", theme.bgStart);
  root.style.setProperty("--portal-bg-mid", theme.bgMid);
  root.style.setProperty("--portal-bg-end", theme.bgEnd);
  root.style.setProperty("--portal-bg-radial-primary", theme.bgRadialPrimary);
  root.style.setProperty("--portal-bg-radial-secondary", theme.bgRadialSecondary);
}

export function createCustomPortalTheme(input: {
  navy: string;
  ink: string;
  mist: string;
  offwhite: string;
  gold: string;
  goldSoft: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
}): PortalThemePalette {
  return {
    id: "custom",
    name: "Custom Theme",
    mode: "dark",
    navy: input.navy,
    ink: input.ink,
    mist: input.mist,
    offwhite: input.offwhite,
    gold: input.gold,
    goldSoft: input.goldSoft,
    bgStart: input.bgStart,
    bgMid: input.bgMid,
    bgEnd: input.bgEnd,
    bgRadialPrimary: hexToRgba(input.gold, 0.28),
    bgRadialSecondary: hexToRgba(input.navy, 0.25),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((chunk) => chunk + chunk).join("")
    : normalized;
  const int = Number.parseInt(safe, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isPortalThemePalette(input: unknown): input is PortalThemePalette {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<PortalThemePalette>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && (candidate.mode === "normal" || candidate.mode === "dark")
    && typeof candidate.navy === "string"
    && typeof candidate.ink === "string"
    && typeof candidate.mist === "string"
    && typeof candidate.offwhite === "string"
    && typeof candidate.gold === "string"
    && typeof candidate.goldSoft === "string"
    && typeof candidate.bgStart === "string"
    && typeof candidate.bgMid === "string"
    && typeof candidate.bgEnd === "string"
    && typeof candidate.bgRadialPrimary === "string"
    && typeof candidate.bgRadialSecondary === "string";
}
