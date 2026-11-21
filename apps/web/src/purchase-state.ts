// ---------- purchase history in the browser: types, the opening cards are tied to, and loading ----------
import { useEffect, useState } from "react";
import { request } from "./api";

export type EntryKind = "purchase" | "card_sale" | "product_sale" | "trade";
export const KIND_LABELS: Record<EntryKind, string> = { purchase: "Purchase", card_sale: "Card sale", product_sale: "Product sale", trade: "Trade" };

export type Product = { id: string; label: string; packs: number };
export type EntrySummary = {
  id: string; kind: EntryKind; kindLabel: string; date: string; place: string; note: string; currency: "usd"; description: string; source: string | null;
  sets: string[]; products: string[]; out: number; in: number; value: number; gain: number; unpriced: number;
};
export type Opening = { id: string; entryId: string; name: string; collectionId: string | null };
export type PlaceKind = "store" | "website" | "person" | "other";
export const PLACE_KINDS: Record<PlaceKind, string> = { store: "Store", website: "Website", person: "Person", other: "Other" };
export type Place = { id: string; name: string; kind: PlaceKind; note: string; createdBy: number | null; createdAt: string; uses: number; lastUsed: string | null };
export type ReceiptFields = {
  date: string | null; place: string | null; tax: number | null; shipping: number | null; total: number | null; linesTotal: number;
  lines: Array<{ text: string; product: string; name: string; setCode: string | null; quantity: number; cost: number }>;
};
export type TradeFigures = {
  gave: number; got: number; net: number; originalCost: number; noCostValue: number; noCost: string[];
  given: Array<{ saleId: string; cost: number | null; from: { entryId: string; date: string; description: string } | null }>;
};
export type PurchaseList = {
  currency: "usd"; entries: EntrySummary[];
  summary: { spent: number; received: number; value: number; gain: number; otherCurrency: number; unpriced: number };
  places: Place[]; activeOpening: Opening | null; products: Product[];
};
export type EntryLine = {
  id: string; product: string; productLabel: string; name: string; setCode: string | null; quantity: number; cost: number; full: number; packs: number;
  opened: number; sold: number; sealed: number; sealedValue: number; valueDate: string | null; cardId: string | null; foil: number | null;
  condition: string | null; language: string | null; collectionId: string | null; values: Array<{ date: string; value: number }>;
};
export type EntrySale = {
  id: string; what: "card" | "product"; cardId: string | null; name: string; setCode: string | null; foil: number | null; condition: string | null;
  language: string | null; proxy: boolean; collectionId: string | null; quantity: number; price: number; sourceEntryId: string | null; sourceLineId: string | null;
};
export type EntryTie = {
  id: number; cardId: string; name: string; setCode: string; collectorNumber: string; imageUrl: string | null; foil: number; condition: string; language: string;
  proxy: boolean; collectionId: string; quantity: number; held: number; price: number | null; lineId: string | null; openingId: string | null; tradePrice: number | null;
};
export type EntryOpening = {
  id: string; lineId: string; count: number; name: string; collectionId: string | null; active: boolean; createdAt: string; doneAt: string | null;
  cards: number; valuePulled: number; perPack: number; packs: number;
};
export type Entry = Omit<EntrySummary, "sets" | "products"> & {
  tax: number; shipping: number; fees: number; cashOut: number; cashIn: number; tradeId: string | null; pulledIncome: number;
  placeId: string | null; shippingBy: "me" | "buyer"; trade: TradeFigures | null; receipt: { name: string; type: string; bytes: number; addedAt: string } | null;
  lines: EntryLine[]; sales: EntrySale[]; ties: EntryTie[]; openings: EntryOpening[];
};
export type ChartPoint = { date: string; spent: number; value: number };

// the opening that pulled cards are tied to, shared by the status bar and the Purchases view
let opening: Opening | null = null;
let loaded = false;
const listeners = new Set<(value: Opening | null) => void>();

/** The opening cards are tied to now, when known. */
export const currentOpening = () => opening;

export function setActiveOpening(value: Opening | null) {
  opening = value;
  loaded = true;
  for (const listener of listeners) listener(value);
}

/** Reads the opening again from the server (after a change made elsewhere). */
export async function reloadOpening(): Promise<void> {
  try {
    const list = await request<PurchaseList>("/api/purchases");
    setActiveOpening(list.activeOpening);
  } catch {
    // offline or signed out: the last known opening stays
  }
}

export function useActiveOpening(): Opening | null {
  const [value, setValue] = useState(opening);
  useEffect(() => {
    listeners.add(setValue);
    if (!loaded) {
      loaded = true;
      void reloadOpening();
    }
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}

/** Shows the purchase entry of an opening in the Purchases view. */
export function openOpeningEntry(store: { setView: (view: "purchases") => void }, entryId: string) {
  store.setView("purchases");
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("mana-vault:purchases", { detail: entryId })), 0);
}
