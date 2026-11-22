// ---------- card layout (0.18.0): where the pips and buttons sit around a card picture, set in View, Card layout... ----------

/** The things that can be placed around a card picture. */
export type PipItem = "count" | "printings" | "finish" | "marks" | "price" | "buttons";
/** The places around a card picture: the four corners on it, the row under it (left and right), a second line, and the bottom. */
export type PipSlot = "tl" | "tr" | "bl" | "br" | "left" | "right" | "full" | "bottom";
export type PipLayout = Record<PipSlot, PipItem[]>;
/** The parts of the program that show card pictures with pips. */
export type LayoutSection = "search" | "collection" | "deck" | "trade" | "proxies";
export type CardLayoutPrefs = { same: boolean; all: PipLayout; sections: Record<LayoutSection, PipLayout> };

export const PIP_ITEMS: Array<[PipItem, string]> = [
  ["count", "Count and Owned"],
  ["printings", "Printings"],
  ["finish", "Finish and copy details"],
  ["marks", "Status marks"],
  ["price", "Price"],
  ["buttons", "Buttons"],
];

export const PIP_SLOTS: Array<[PipSlot, string]> = [
  ["tl", "Top left of the picture"],
  ["tr", "Top right of the picture"],
  ["bl", "Bottom left of the picture"],
  ["br", "Bottom right of the picture"],
  ["left", "Under the picture, left"],
  ["right", "Under the picture, right"],
  ["full", "Second line"],
  ["bottom", "Bottom"],
];

export const LAYOUT_SECTIONS: Array<[LayoutSection, string]> = [
  ["search", "Card search"],
  ["collection", "Collections"],
  ["deck", "Decks"],
  ["trade", "Trade"],
  ["proxies", "Proxies"],
];

const SLOT_IDS = PIP_SLOTS.map(([slot]) => slot);
const ITEM_IDS = PIP_ITEMS.map(([item]) => item);

/** Pips in one row under the picture with the price at its right, and the buttons in one row at the bottom. */
export function defaultPipLayout(): PipLayout {
  return { tl: [], tr: [], bl: [], br: [], left: ["count", "printings", "finish", "marks"], right: ["price"], full: [], bottom: ["buttons"] };
}

export function defaultCardLayout(): CardLayoutPrefs {
  const sections = Object.fromEntries(LAYOUT_SECTIONS.map(([section]) => [section, defaultPipLayout()])) as Record<LayoutSection, PipLayout>;
  return { same: true, all: defaultPipLayout(), sections };
}

/** A saved layout, with unknown places and things dropped and each thing in one place at most. */
export function readPipLayout(value: unknown): PipLayout {
  const layout = Object.fromEntries(SLOT_IDS.map((slot) => [slot, [] as PipItem[]])) as PipLayout;
  if (!value || typeof value !== "object") return defaultPipLayout();
  const seen = new Set<PipItem>();
  for (const slot of SLOT_IDS) {
    const items = (value as Record<string, unknown>)[slot];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (ITEM_IDS.includes(item as PipItem) && !seen.has(item as PipItem)) {
        seen.add(item as PipItem);
        layout[slot].push(item as PipItem);
      }
    }
  }
  return layout;
}

export function readCardLayout(value: unknown): CardLayoutPrefs {
  const base = defaultCardLayout();
  if (!value || typeof value !== "object") return base;
  const saved = value as Partial<CardLayoutPrefs>;
  const all = saved.all ? readPipLayout(saved.all) : base.all;
  const sections = Object.fromEntries(LAYOUT_SECTIONS.map(([section]) => [section, saved.sections?.[section] ? readPipLayout(saved.sections[section]) : all])) as Record<LayoutSection, PipLayout>;
  return { same: saved.same !== false, all, sections };
}

/** The layout used by one section. */
export const layoutFor = (prefs: CardLayoutPrefs, section: LayoutSection): PipLayout => (prefs.same ? prefs.all : prefs.sections[section]);

/** Moves one thing to a place (at the end, or before another thing there); "off" hides it. */
export function moveItem(layout: PipLayout, item: PipItem, slot: PipSlot | "off", before?: PipItem): PipLayout {
  const next = Object.fromEntries(SLOT_IDS.map((id) => [id, layout[id].filter((other) => other !== item)])) as PipLayout;
  if (slot === "off") return next;
  const list = next[slot];
  const at = before ? list.indexOf(before) : -1;
  if (at >= 0) list.splice(at, 0, item);
  else list.push(item);
  return next;
}

/** The things not placed anywhere (hidden). */
export const hiddenItems = (layout: PipLayout): PipItem[] => ITEM_IDS.filter((item) => !SLOT_IDS.some((slot) => layout[slot].includes(item)));

/** A new set of layout preferences after the layout of one section (or of all, when they match) changes. */
export function setLayout(prefs: CardLayoutPrefs, section: LayoutSection, layout: PipLayout): CardLayoutPrefs {
  return prefs.same ? { ...prefs, all: layout } : { ...prefs, sections: { ...prefs.sections, [section]: layout } };
}

/** Same layout everywhere on: the layout being edited becomes the one for all. Off: every section starts from it. */
export function setSame(prefs: CardLayoutPrefs, same: boolean, section: LayoutSection): CardLayoutPrefs {
  const current = layoutFor(prefs, section);
  if (same) return { ...prefs, same: true, all: current };
  return { ...prefs, same: false, sections: Object.fromEntries(LAYOUT_SECTIONS.map(([id]) => [id, readPipLayout(current)])) as Record<LayoutSection, PipLayout> };
}
