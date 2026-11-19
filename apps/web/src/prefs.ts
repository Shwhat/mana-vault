// ---------- preferences: saved per user on the server ----------
import { request, APP_VERSION } from "./api";
import { isApp } from "./android/platform";
import { DEFAULT_WORKSPACE, isOpen, openPanel, PRESETS, type Layout, type Workspace, validLayout } from "./dock";
import type { RibbonSize, RibbonTab } from "./ribbon";
import type { CollectionLayout, CollectionSort, Currency, DeckGroup, DeckSort, DeckView, GridSize, SwitchSort, Zone } from "./types";

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
  currency: Currency;
  collectionSort: CollectionSort;
  /** List shows rows, Binder shows pages of nine card images, Grid shows card images that fill the width. On the desktop. */
  collectionLayout: CollectionLayout;
  /** The same choice on a phone. */
  collectionLayoutPhone: CollectionLayout;
  /** The size of card pictures in Grid. */
  gridSize: GridSize;
  /** Card search results (also the deck's Add tab and the trade searches): Grid, Binder or List, on the desktop and on a phone. */
  searchLayout: CollectionLayout;
  searchLayoutPhone: CollectionLayout;
  searchSize: GridSize;
  /** All collections also lists the cards in wishlists. */
  allWishlists: boolean;
  /** Trade: the you give search looks in every collection, not only cards marked for trade. */
  tradeAllCards: boolean;
  /** How the collection and deck switchers sort their lists. */
  collectionSwitchSort: SwitchSort;
  deckSwitchSort: SwitchSort;
  /** When each collection and deck was last opened, by id. */
  recent: Record<string, number>;
  /** The deck's Cards tab: how cards are shown, grouped and sorted. */
  deckView: DeckView;
  deckGroup: DeckGroup;
  deckSort: DeckSort;
  /** Scanner: vibrate when a card is recognized. */
  scanVibrate: boolean;
  /** Scanner: finish given to newly scanned cards. */
  scanFoil: boolean;
  /** Scanner: which camera to use. */
  scanCamera: "environment" | "user";
  /** Scanner: take the first matching printing without asking. */
  scanQuick: boolean;
  /** Scanner: play a sound when a card is added. */
  scanSounds: boolean;
  /** Scanner: only cards from these sets are added; others give a "Not in set" warning. */
  scanSets: string[];
  scanIgnorePromos: boolean;
  /** Scanner: new scans are proxies. */
  scanProxy: boolean;
  scanCondition: string;
  scanLanguage: string;
  /** Scanner: show the total value of the scanned list. */
  scanShowTotal: boolean;
  /** Scanner: show how many copies of the last card are already in your collections. */
  scanShowOwned: boolean;
  ribbonSize: RibbonSize;
  appVersion: string;
};

export function defaultPrefs(): Prefs {
  const preset = PRESETS[DEFAULT_WORKSPACE]!();
  return {
    theme: "light", foil: false, zone: "main", ribbon: null, ribbonTab: "home", layout: preset.layout,
    workspace: DEFAULT_WORKSPACE, workspaces: {}, lastDeckId: null, targetCollection: null, openCollection: null,
    currency: "usd", collectionSort: "name", collectionLayout: "grid", collectionLayoutPhone: "grid", gridSize: "m",
    searchLayout: "grid", searchLayoutPhone: "grid", searchSize: "m", allWishlists: false, tradeAllCards: false,
    collectionSwitchSort: "recent", deckSwitchSort: "recent", recent: {}, deckView: "list", deckGroup: "type", deckSort: "name",
    scanVibrate: true, scanFoil: false, scanCamera: "environment", scanQuick: false, scanSounds: true, scanSets: [], scanIgnorePromos: false,
    scanProxy: false, scanCondition: "NM", scanLanguage: "en", scanShowTotal: false, scanShowOwned: false, ribbonSize: "large", appVersion: APP_VERSION,
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
    zone: value.zone === "sideboard" || value.zone === "commander" || value.zone === "maybeboard" ? value.zone : "main",
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
    currency: value.currency === "eur" ? "eur" : "usd",
    collectionSort: ["price-desc", "price-asc", "quantity", "set"].includes(String(value.collectionSort)) ? value.collectionSort as CollectionSort : "name",
    // accounts from before 0.7.0 keep the layout they used; new accounts start with Grid
    collectionLayout: layoutOf(value.collectionLayout, "grid"),
    collectionLayoutPhone: layoutOf(value.collectionLayoutPhone, layoutOf(value.collectionLayout, "grid")),
    gridSize: value.gridSize === "s" || value.gridSize === "l" ? value.gridSize : "m",
    searchLayout: layoutOf(value.searchLayout, "grid"),
    searchLayoutPhone: layoutOf(value.searchLayoutPhone, "grid"),
    searchSize: value.searchSize === "s" || value.searchSize === "l" ? value.searchSize : "m",
    allWishlists: value.allWishlists === true,
    tradeAllCards: value.tradeAllCards === true,
    collectionSwitchSort: switchSortOf(value.collectionSwitchSort, ["recent", "name", "created", "cards", "value"]),
    deckSwitchSort: switchSortOf(value.deckSwitchSort, ["recent", "name", "created", "cards", "format", "commander"]),
    recent: value.recent && typeof value.recent === "object"
      ? Object.fromEntries(Object.entries(value.recent).filter(([, time]) => typeof time === "number").sort((a, b) => b[1] - a[1]).slice(0, 300))
      : {},
    deckView: (["list", "text", "stacks", "grid"] as const).find((item) => item === value.deckView) ?? "list",
    deckGroup: (["type", "mana", "color", "rarity", "tag", "none"] as const).find((item) => item === value.deckGroup) ?? "type",
    deckSort: (["name", "mana", "price"] as const).find((item) => item === value.deckSort) ?? "name",
    scanVibrate: value.scanVibrate !== false,
    scanFoil: value.scanFoil === true,
    scanCamera: value.scanCamera === "user" ? "user" : "environment",
    scanQuick: value.scanQuick === true,
    scanSounds: value.scanSounds !== false,
    scanSets: Array.isArray(value.scanSets) ? value.scanSets.filter((code): code is string => typeof code === "string" && /^[a-z0-9]{2,8}$/.test(code)).slice(0, 50) : [],
    scanIgnorePromos: value.scanIgnorePromos === true,
    scanProxy: value.scanProxy === true,
    scanCondition: ["M", "NM", "LP", "MP", "HP", "DMG"].includes(String(value.scanCondition)) ? String(value.scanCondition) : "NM",
    scanLanguage: typeof value.scanLanguage === "string" && /^[a-z]{2,3}$/.test(value.scanLanguage) ? value.scanLanguage : "en",
    scanShowTotal: value.scanShowTotal === true,
    scanShowOwned: value.scanShowOwned === true,
    ribbonSize: value.ribbonSize === "compact" || value.ribbonSize === "icons" ? value.ribbonSize : "large",
    appVersion: APP_VERSION,
  };
}

const layoutOf = (value: unknown, fallback: CollectionLayout): CollectionLayout =>
  value === "list" || value === "binder" || value === "grid" ? value : fallback;
const switchSortOf = (value: unknown, allowed: SwitchSort[]): SwitchSort => allowed.find((item) => item === value) ?? "recent";

export async function loadPrefs(): Promise<Prefs> {
  return mergePrefs(await request<unknown>("/api/prefs").catch(() => null));
}

let timer: number | undefined;
let pending: Prefs | null = null;
/** Saves preferences after a short pause, so quick changes are sent once; `now` sends at once (the open deck or collection). */
export function savePrefs(prefs: Prefs, now = false) {
  window.clearTimeout(timer);
  pending = prefs;
  timer = window.setTimeout(() => {
    pending = null;
    void request("/api/prefs", { method: "PUT", body: JSON.stringify(prefs) }).catch(() => undefined);
  }, now ? 0 : 400);
}

// a change still waiting when the page is left or reloaded is sent at once
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!pending || isApp()) return;
    window.clearTimeout(timer);
    void fetch("/api/prefs", {
      method: "PUT", keepalive: true, credentials: "same-origin",
      headers: { "content-type": "application/json", "x-mana-vault": "1" }, body: JSON.stringify(pending),
    }).catch(() => undefined);
    pending = null;
  });
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
