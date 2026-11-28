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
/** The opening cards are tied to; a pack of a group (0.19.0) knows where it is (Pack 2 of 3) and whether a pack waits after it. */
export type Opening = { id: string; entryId: string; name: string; collectionId: string | null; packNumber?: number | null; groupIndex?: number; groupSize?: number; hasNext?: boolean };
export type PlaceKind = "store" | "website" | "person" | "other";
export const PLACE_KINDS: Record<PlaceKind, string> = { store: "Store", website: "Website", person: "Person", other: "Other" };
export type Place = { id: string; name: string; kind: PlaceKind; note: string; createdBy: number | null; createdAt: string; uses: number; lastUsed: string | null };
/** The card a receipt line was matched to (0.19.0). */
export type ReceiptCard = {
  cardId: string; name: string; setCode: string; setName: string; collectorNumber: string; imageUrl: string | null; finish: number; condition: string; promoTypes: string; finishes: string;
  warning?: string;
};
/** `productName` is the name of a named product such as "Landing Party" (0.20.0), `sealedId` the product it matched. */
export type ReceiptLine = {
  text: string; product: string; name: string; setCode: string | null; quantity: number; cost: number; note: string; cardLike: boolean; card: ReceiptCard | null;
  productName?: string; sealedId?: string | null;
};
/** A named sealed product a line can be (0.20.0). */
export type SealedChoice = { id: string; name: string; fullName: string; setCode: string; product: string; hasDeck: boolean };
export type ReceiptFields = {
  date: string | null; place: string | null; note: string | null; tax: number | null; shipping: number | null; total: number | null; linesTotal: number;
  lines: ReceiptLine[];
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
  /** The set's name (0.21.0). */
  setName?: string | null;
  /** Expected value from the booster contents (0.21.0): per pack, for the whole line, and the booster type it was worked out for. */
  ev?: number | null; evLine?: number | null; evLabel?: string | null;
  opened: number; sold: number; sealed: number; sealedValue: number; valueDate: string | null; cardId: string | null; foil: number | null;
  condition: string | null; language: string | null; collectionId: string | null; values: Array<{ date: string; value: number }>;
  /** Packs opened and packs still sealed, for products with packs (0.19.0). */
  packsOpened: number; packsLeft: number;
  /** The named sealed product the line's product name matched, and whether it has a decklist (0.20.0). */
  sealedId: string | null; hasDeck: boolean;
};
export type EntrySale = {
  id: string; what: "card" | "product"; cardId: string | null; name: string; setCode: string | null; foil: number | null; condition: string | null;
  language: string | null; proxy: boolean; collectionId: string | null; quantity: number; price: number; sourceEntryId: string | null; sourceLineId: string | null;
};
export type EntryTie = {
  id: number; cardId: string; name: string; setCode: string; collectorNumber: string; imageUrl: string | null; foil: number; condition: string; language: string;
  proxy: boolean; collectionId: string; quantity: number; held: number; price: number | null; lineId: string | null; openingId: string | null; tradePrice: number | null;
  /** The price on the day the card was added (0.18.0), fixed. */
  valueThen: number | null;
  /** The copies no longer held: sold, traded, or gone (removed from the collection). */
  sold: number; traded: number; gone: number;
  /** A card a pack's booster contents cannot hold, such as "Not found in Play booster, Foundations" (0.21.0). */
  warning?: string | null;
};
export type EntryOpening = {
  id: string; lineId: string; count: number; name: string; collectionId: string | null; active: boolean; createdAt: string; doneAt: string | null;
  cards: number; valuePulled: number; perPack: number; packs: number;
  /** 0.18.0: the pulls still held at today's prices, every pull at its price the day it was added, and how many are gone. */
  valueNow: number; valueWhenPulled: number; whenPulledUnpriced: number; gone: number;
  /** 0.19.0: the pack's number in its product, its group of packs opened together, whether it waits, its cost, what its cards sold for and its gain or loss. */
  packNumber: number | null; groupId: string | null; waiting: boolean; packCost: number; soldFor: number; gain: number;
  /** The expected value of the opening's packs, stored the day it was opened (0.21.0). */
  ev?: number | null;
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
let openingRevision = 0;
const listeners = new Set<(value: Opening | null) => void>();

/** The opening cards are tied to now, when known. */
export const currentOpening = () => opening;

export function setActiveOpening(value: Opening | null) {
  openingRevision += 1;
  opening = value;
  loaded = true;
  for (const listener of listeners) listener(value);
}

/** Reads the opening again from the server (after a change made elsewhere). */
export async function reloadOpening(): Promise<void> {
  const revision = ++openingRevision;
  try {
    const list = await request<PurchaseList>("/api/purchases");
    if (revision === openingRevision) setActiveOpening(list.activeOpening);
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

/**
 * The note for a remove question (0.18.0) when copies came from a pack or purchase: they stay listed there, marked Gone.
 * Empty when none of the copies is tied to a purchase.
 */
export async function packNote(items: Array<{ collectionId: string; cardId: string; foil: number; condition: string; language: string; proxy?: boolean }>): Promise<string> {
  if (!items.length) return "";
  try {
    const { packs } = await request<{ packs: Array<{ name: string; quantity: number }> }>("/api/purchases/ties/packs", { method: "POST", body: JSON.stringify({ items }) });
    if (!packs.length) return "";
    const parts = packs.map((pack) => `${pack.quantity} ${pack.quantity === 1 ? "card came" : "cards came"} from ${pack.name}`);
    return `${parts.join("; ")}. ${packs.length === 1 && packs[0]!.quantity === 1 ? "It stays" : "They stay"} listed on ${packs.length === 1 ? "that pack" : "those packs"}.`;
  } catch {
    return "";
  }
}

/** Next pack (0.19.0): the current pack is done and the next one waiting in its group becomes where cards are tied. */
export async function nextPack(opening: Opening): Promise<Opening | null> {
  const answer = await request<{ next: { id: string; name: string } | null; opening: Opening | null }>(`/api/purchases/openings/${opening.id}/next`, { method: "POST", body: "{}" });
  setActiveOpening(answer.opening);
  return answer.opening;
}

/** "Pack 2 of 3" while packs opened together are in use, or the opening's name. */
export const packLabel = (opening: Opening) => (opening.groupSize && opening.groupSize > 1 ? `${opening.groupIndex} of ${opening.groupSize}` : "");
