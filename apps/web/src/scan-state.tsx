// ---------- scan state: the scanned list, kept on this device until it is added or cleared ----------
import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { request } from "./api";
import type { Counts } from "./library-state";
import type { Prefs } from "./prefs";
import type { Collection, Deck, DeckDetail, Zone } from "./types";

export type ScanCard = {
  id: string; oracle_id: string; name: string; set_code: string; set_name: string; collector_number: string;
  rarity: string; image_url: string | null; finishes: string; released_at: string | null;
};
export type ScanMatch = { card: ScanCard | null; score: number; by: "printing" | "name" | null; read: string };
export type ScanItem = { key: string; card: ScanCard; foil: boolean; quantity: number; at: number };
export type ScanTarget = { kind: "collection" | "deck"; id: string; name: string; label: string };

type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };
type DeckKey = { deckId: string; oracle_id: string; printing_id: string | null; card_id: string; zone: Zone };

export type ScanDeps = {
  userId: number;
  live: MutableRefObject<{ prefs: Prefs; collections: Collection[] | null }>;
  flash: (text: string, kind?: "ok" | "err") => void;
  fail: (reason: unknown, fallback: string) => void;
  pushUndo: (entry: UndoEntry) => void;
  setCounts: (collectionId: string, items: Counts) => Promise<void>;
  writeDeck: (key: DeckKey, to: number) => Promise<void>;
  loadDeck: (id: string) => Promise<DeckDetail>;
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

/** The finish a new scan gets: the scanner setting, unless the printing only comes in the other finish. */
export function finishFor(card: ScanCard, wantFoil: boolean): boolean {
  return hasFinish(card, wantFoil) ? wantFoil : !wantFoil;
}

export const scanCount = (items: ScanItem[]) => items.reduce((sum, item) => sum + item.quantity, 0);

export async function matchText(lines: string[], info: string): Promise<ScanMatch> {
  return request<ScanMatch>("/api/scan/match", { method: "POST", body: JSON.stringify({ lines, info }) });
}

export function useScanState(deps: ScanDeps) {
  const { userId, live, flash, fail, pushUndo, setCounts, writeDeck, loadDeck, refreshAfterChange } = deps;
  const [scanItems, setScanItems] = useState<ScanItem[]>(() => readStored(userId));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(scanItems));
    } catch {
      // storage can be full or blocked; the list still works until the page is closed
    }
  }, [userId, scanItems]);

  /** Adds one copy of a printing to the top of the list. The same printing and finish raise the existing row. */
  const addScanned = useCallback((card: ScanCard, foil: boolean, quantity = 1) => {
    setScanItems((items) => {
      const existing = items.find((item) => item.card.id === card.id && item.foil === foil);
      const rest = items.filter((item) => item !== existing);
      const row: ScanItem = existing
        ? { ...existing, quantity: Math.min(999, existing.quantity + quantity), at: Date.now() }
        : { key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, card, foil, quantity, at: Date.now() };
      return [row, ...rest];
    });
  }, []);

  /** Changes a row. Rows that end up with the same printing and finish are combined. */
  const updateScanItem = useCallback((key: string, change: Partial<Pick<ScanItem, "card" | "foil" | "quantity">>) => {
    setScanItems((items) => {
      const index = items.findIndex((item) => item.key === key);
      if (index < 0) return items;
      const row = { ...items[index]!, ...change };
      row.quantity = Math.max(1, Math.min(999, Math.round(row.quantity)));
      const twin = items.find((item) => item.key !== key && item.card.id === row.card.id && item.foil === row.foil);
      const next = items.map((item, at) => (at === index ? row : item));
      if (!twin) return next;
      return next.filter((item) => item.key !== twin.key).map((item) => (item.key === key ? { ...item, quantity: Math.min(999, item.quantity + twin.quantity) } : item));
    });
  }, []);

  const removeScanItem = useCallback((key: string) => setScanItems((items) => items.filter((item) => item.key !== key)), []);
  const clearScanItems = useCallback(() => setScanItems([]), []);

  /** Adds every scanned card to a collection or deck as one undo step, then empties the list. */
  const addScannedTo = useCallback(async (target: ScanTarget, items: ScanItem[]) => {
    if (!items.length) return false;
    const copies = scanCount(items);
    const label = `Add ${copies} scanned card${copies === 1 ? "" : "s"} to ${target.name}`;
    try {
      if (target.kind === "collection") {
        // scanned copies are near mint and English; the bulk add reports the counts before and after for undo
        const added = items.map((item) => ({ cardId: item.card.id, foil: finishCode(item), condition: "NM", language: "en", quantity: item.quantity }));
        const result = await request<{ before: Counts; after: Counts }>(`/api/collections/${encodeURIComponent(target.id)}/cards/add`, {
          method: "POST", body: JSON.stringify({ items: added }),
        });
        pushUndo({ label, undo: () => setCounts(target.id, result.before), redo: () => setCounts(target.id, result.after) });
      } else {
        const before = await loadDeck(target.id);
        const zone = live.current.prefs.zone;
        const keyFor = (item: ScanItem): DeckKey => ({
          deckId: target.id, oracle_id: item.card.oracle_id, printing_id: before.mode === "theme" ? item.card.id : null, card_id: item.card.id, zone,
        });
        const sameKey = (a: DeckKey, b: DeckKey) => a.oracle_id === b.oracle_id && a.printing_id === b.printing_id;
        const keys: DeckKey[] = [];
        for (const item of items) {
          const key = keyFor(item);
          if (!keys.some((known) => sameKey(known, key))) keys.push(key);
          let left = item.quantity;
          while (left > 0) {
            const part = Math.min(100, left);
            await request(`/api/decks/${encodeURIComponent(target.id)}/cards`, { method: "POST", body: JSON.stringify({ cardId: item.card.id, quantity: part, zone }) });
            left -= part;
          }
        }
        const find = (detail: DeckDetail, key: DeckKey) =>
          detail.cards.find((card) => card.oracle_id === key.oracle_id && card.printing_id === key.printing_id && card.zone === zone)?.quantity ?? 0;
        const afterDeck = await loadDeck(target.id);
        const changes = keys.map((key) => ({ key, from: find(before, key), to: find(afterDeck, key) }));
        pushUndo({
          label,
          undo: async () => { for (const change of changes) await writeDeck(change.key, change.from); },
          redo: async () => { for (const change of changes) await writeDeck(change.key, change.to); },
        });
      }
      setScanItems((current) => current.filter((item) => !items.some((added) => added.key === item.key)));
      flash(`${copies} card${copies === 1 ? "" : "s"} added to ${target.name}`);
      await refreshAfterChange();
      return true;
    } catch (reason) {
      fail(reason, "Could not add the scanned cards.");
      return false;
    }
  }, [live, setCounts, loadDeck, writeDeck, pushUndo, flash, fail, refreshAfterChange]);

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
