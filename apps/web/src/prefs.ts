// ---------- preferences: saved per user on the server ----------
import { request, APP_VERSION } from "./api";
import { DEFAULT_WORKSPACE, isOpen, openPanel, PRESETS, type Layout, type Workspace, validLayout } from "./dock";
import type { RibbonTab } from "./ribbon";
import type { Zone } from "./types";

export type Theme = "light" | "dark" | "system";

export type Prefs = {
  theme: Theme;
  foil: boolean;
  zone: Zone;
  ribbon: RibbonTab[] | null;
  ribbonTab: string;
  layout: Layout;
  workspace: string;
  workspaces: Record<string, Workspace>;
  lastDeckId: string | null;
  /** The collection that Add to collection puts cards into. */
  targetCollection: string | null;
  /** The collection shown in the collection view. */
  openCollection: string | null;
  appVersion: string;
};

export function defaultPrefs(): Prefs {
  const preset = PRESETS[DEFAULT_WORKSPACE]!();
  return {
    theme: "light", foil: false, zone: "main", ribbon: null, ribbonTab: "home", layout: preset.layout,
    workspace: DEFAULT_WORKSPACE, workspaces: {}, lastDeckId: null, targetCollection: null, openCollection: null, appVersion: APP_VERSION,
  };
}

/** Merges saved preferences over the defaults. A new version resets the ribbon layout so new buttons appear. */
export function mergePrefs(saved: unknown): Prefs {
  const base = defaultPrefs();
  if (!saved || typeof saved !== "object") return base;
  const value = saved as Partial<Prefs>;
  const sameVersion = value.appVersion === APP_VERSION;
  return {
    theme: value.theme === "dark" || value.theme === "system" ? value.theme : "light",
    foil: value.foil === true,
    zone: value.zone === "sideboard" || value.zone === "commander" ? value.zone : "main",
    ribbon: sameVersion && Array.isArray(value.ribbon) ? value.ribbon : null,
    ribbonTab: typeof value.ribbonTab === "string" ? value.ribbonTab : base.ribbonTab,
    // a new version adds the panels it introduced (Collections in 0.2.0) to a saved layout
    layout: validLayout(value.layout)
      ? (sameVersion || isOpen(value.layout, "collections") ? value.layout : openPanel(value.layout, "collections"))
      : base.layout,
    workspace: typeof value.workspace === "string" ? value.workspace : base.workspace,
    workspaces: value.workspaces && typeof value.workspaces === "object"
      ? Object.fromEntries(Object.entries(value.workspaces).filter(([, item]) => item && validLayout(item.layout)))
      : {},
    lastDeckId: typeof value.lastDeckId === "string" ? value.lastDeckId : null,
    targetCollection: typeof value.targetCollection === "string" ? value.targetCollection : null,
    openCollection: typeof value.openCollection === "string" ? value.openCollection : null,
    appVersion: APP_VERSION,
  };
}

export async function loadPrefs(): Promise<Prefs> {
  return mergePrefs(await request<unknown>("/api/prefs").catch(() => null));
}

let timer: number | undefined;
export function savePrefs(prefs: Prefs) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void request("/api/prefs", { method: "PUT", body: JSON.stringify(prefs) }).catch(() => undefined);
  }, 400);
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

/** Sets data-theme on the page to light or dark, following the system setting when the theme is system. */
export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && !!media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#15181d" : "#2b3442");
}

export function watchSystemTheme(getTheme: () => Theme) {
  const listener = () => { if (getTheme() === "system") applyTheme("system"); };
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}
