// ---------- scan state: the scanned list, kept on this device until it is added or cleared ----------
import { askWishlists, type WishAsk } from "./components/WishlistAsk";
import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { request } from "./api";
import type { Counts, WishChange } from "./library-state";
import type { Prefs } from "./prefs";
import type { Collection, Deck, DeckDetail, PriceFields } from "./types";

export type ScanCard = {
  id: string; oracle_id: string; name: string; set_code: string; set_name: string; collector_number: string;
  rarity: string; image_url: string | null; finishes: string; released_at: string | null; promo?: number; variation?: number; promo_types?: string;
} & Partial<PriceFields>;
export type ScanMatch = { card: ScanCard | null; score: number; by: "printing" | "name" | null; read: string };
/** One row of the scanned list: a printing in one finish, condition and language, real or a proxy. */
export type ScanItem = {
  key: string; card: ScanCard; foil: boolean; quantity: number; at: number; condition?: string; language?: string; proxy?: boolean;
};
export type ScanTarget = { kind: "collection" | "deck"; id: string; name: string; label: string };
/** Where scanned cards go: a collection, or a deck together with the collection that receives the copies. */
export type ScanDestination = { kind: "collection"; id: string; name: string } | { kind: "deck"; id: string; name: string; collectionId: string; collectionName: string };

type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };

export type ScanDeps = {
  userId: number;
  live: MutableRefObject<{ prefs: Prefs; collections: Collection[] | null }>;
  flash: (text: string, kind?: "ok" | "err") => void;
  fail: (reason: unknown, fallback: string) => void;
  pushUndo: (entry: UndoEntry) => void;
  setCounts: (collectionId: string, items: Counts) => Promise<void>;
  loadDeck: (id: string) => Promise<DeckDetail>;
  restoreDeck: (from: DeckDetail, to: DeckDetail) => Promise<void>;
  restoreWishes: (changes: WishChange[], side: "before" | "after") => Promise<void>;
  refreshAfterChange: () => Promise<void>;
};

const storageKey = (userId: number) => `mana-vault.scan.${userId}`;

function readStored(userId: number): ScanItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is ScanItem => !!item && typeof item === "object" && typeof (item as ScanItem).key === "string" && !!(item as ScanItem).card?.id)
      : [];
  } catch {
    return [];
  }
}

/** Whether a printing comes in a finish. Printings without a finish list allow both. */
export function hasFinish(card: Pick<ScanCard, "finishes">, foil: boolean): boolean {
  const list = card.finishes ? card.finishes.split(",") : [];
  if (!list.length) return true;
  return foil ? list.some((item) => item === "foil" || item === "etched") : list.includes("nonfoil");
}

/** The collection finish code of a scanned row: 0 regular, 1 foil, 2 etched (for printings that only come etched). */
export function finishCode(item: Pick<ScanItem, "card" | "foil">): 0 | 1 | 2 {
  if (!item.foil) return 0;
  const list = item.card.finishes ? item.card.finishes.split(",") : [];
  return list.includes("etched") && !list.includes("foil") ? 2 : 1;
}

/** The finish a new scan gets: foil when foil is preferred and the printing has it, otherwise the finish the printing has. */
export function finishFor(card: ScanCard, wantFoil: boolean): boolean {
  return hasFinish(card, wantFoil) ? wantFoil : !wantFoil;
}

export const scanCount = (items: ScanItem[]) => items.reduce((sum, item) => sum + item.quantity, 0);
const sameRow = (a: Pick<ScanItem, "card" | "foil" | "condition" | "language" | "proxy">, b: typeof a) =>
  a.card.id === b.card.id && a.foil === b.foil && (a.condition ?? "NM") === (b.condition ?? "NM") && (a.language ?? "en") === (b.language ?? "en") && !!a.proxy === !!b.proxy;

export async function matchText(lines: string[], info: string): Promise<ScanMatch> {
  return request<ScanMatch>("/api/scan/match", { method: "POST", body: JSON.stringify({ lines, info }) });
}

export function useScanState(deps: ScanDeps) {
  const { userId, live, flash, fail, pushUndo, setCounts, loadDeck, restoreDeck, restoreWishes, refreshAfterChange } = deps;
  const [scanItems, setScanItems] = useState<ScanItem[]>(() => readStored(userId));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(scanItems));
    } catch {
      // storage can be full or blocked; the list still works until the page is closed
    }
  }, [userId, scanItems]);

  /** Adds copies of a printing to the top of the list. The same printing and copy details raise the existing row. */
  const addScanned = useCallback((card: ScanCard, foil: boolean, quantity = 1, details: Pick<ScanItem, "condition" | "language" | "proxy"> = {}) => {
    setScanItems((items) => {
      const row = { card, foil, ...details };
      const existing = items.find((item) => sameRow(item, row));
      const rest = items.filter((item) => item !== existing);
      const next: ScanItem = existing
        ? { ...existing, quantity: Math.min(999, existing.quantity + quantity), at: Date.now() }
        : { key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, ...row, quantity, at: Date.now() };
      return [next, ...rest];
    });
  }, []);

  /** Changes a row. Rows that end up alike are combined. */
  const updateScanItem = useCallback((key: string, change: Partial<Pick<ScanItem, "card" | "foil" | "quantity" | "condition" | "language" | "proxy">>) => {
    setScanItems((items) => {
      const index = items.findIndex((item) => item.key === key);
      if (index < 0) return items;
      const row = { ...items[index]!, ...change };
      row.quantity = Math.max(1, Math.min(999, Math.round(row.quantity)));
      const twin = items.find((item) => item.key !== key && sameRow(item, row));
      const next = items.map((item, at) => (at === index ? row : item));
      if (!twin) return next;
      return next.filter((item) => item.key !== twin.key).map((item) => (item.key === key ? { ...item, quantity: Math.min(999, item.quantity + twin.quantity) } : item));
    });
  }, []);

  const removeScanItem = useCallback((key: string) => setScanItems((items) => items.filter((item) => item.key !== key)), []);
  const clearScanItems = useCallback(() => setScanItems([]), []);

  /**
   * Adds every scanned card as one undo step, then empties the list. For a deck the copies go into the chosen collection
   * first and are linked to the deck cards they fill.
   */
  const addScannedTo = useCallback(async (target: ScanDestination, items: ScanItem[]) => {
    if (!items.length) return false;
    const copies = scanCount(items);
    const label = `Add ${copies} scanned card${copies === 1 ? "" : "s"} to ${target.name}`;
    const collectionId = target.kind === "collection" ? target.id : target.collectionId;
    try {
      const added = items.map((item) => ({
        cardId: item.card.id, foil: finishCode(item), condition: item.condition ?? "NM", language: item.language ?? "en", proxy: !!item.proxy, quantity: item.quantity,
      }));
      const result = await request<{ before: Counts; after: Counts; wishlist?: WishChange[]; wishAsk?: WishAsk[] }>(`/api/collections/${encodeURIComponent(collectionId)}/cards/add`, {
        method: "POST", body: JSON.stringify({ items: added }),
      });
      const wishes = result.wishlist ?? [];
      askWishlists(result.wishAsk);
      if (target.kind === "collection") {
        pushUndo({
          label,
          undo: async () => { await setCounts(collectionId, result.before); await restoreWishes(wishes, "before"); },
          redo: async () => { await setCounts(collectionId, result.after); await restoreWishes(wishes, "after"); },
        });
      } else {
        const before = await loadDeck(target.id);
        const zone = live.current.prefs.zone;
        for (const item of added) {
          let left = item.quantity;
          while (left > 0) {
            const part = Math.min(100, left);
            await request(`/api/decks/${encodeURIComponent(target.id)}/cards`, {
              method: "POST", body: JSON.stringify({ cardId: item.cardId, quantity: part, zone, links: [{ ...item, collectionId, quantity: part }] }),
            });
            left -= part;
          }
        }
        const after = await loadDeck(target.id);
        pushUndo({
          label,
          undo: async () => { await restoreDeck(after, before); await setCounts(collectionId, result.before); await restoreWishes(wishes, "before"); },
          redo: async () => { await setCounts(collectionId, result.after); await restoreWishes(wishes, "after"); await restoreDeck(before, after); },
        });
      }
      setScanItems((current) => current.filter((item) => !items.some((done) => done.key === item.key)));
      flash(`${copies} card${copies === 1 ? "" : "s"} added to ${target.name}`);
      await refreshAfterChange();
      return true;
    } catch (reason) {
      fail(reason, "Could not add the scanned cards.");
      return false;
    }
  }, [live, setCounts, loadDeck, restoreDeck, restoreWishes, pushUndo, flash, fail, refreshAfterChange]);

  return { scanItems, addScanned, updateScanItem, removeScanItem, clearScanItems, addScannedTo };
}

/** Collections and decks the scanned list can go into: the account's own and shared ones. */
export function scanTargets(collections: Collection[] | null, decks: Deck[]): ScanTarget[] {
  return [
    ...(collections ?? []).map((item): ScanTarget => ({
      kind: "collection", id: item.id, name: item.name, label: `${item.kind === "wishlist" ? "Wishlist" : "Collection"}: ${item.name}`,
    })),
    ...decks.map((item): ScanTarget => ({ kind: "deck", id: item.id, name: item.name, label: `Deck: ${item.name}` })),
  ];
}
