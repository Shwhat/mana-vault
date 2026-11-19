// ---------- filters: the Filters panel's fields, kept per view, and how they match cards ----------
import { EMPTY_FILTERS, type Filters } from "./types";

/** The views the Filters panel can act on. Each keeps its own filters. */
export type FilterScope = "cards" | "collection" | "deck" | "deckAdd" | "tradeGive" | "tradeGet";
export const SCOPE_NAMES: Record<FilterScope, string> = {
  cards: "Card search", collection: "Collection", deck: "Deck", deckAdd: "Deck card search", tradeGive: "Trade, you give", tradeGet: "Trade, you get",
};
export const emptyScopes = (): Record<FilterScope, Filters> => ({
  cards: { ...EMPTY_FILTERS }, collection: { ...EMPTY_FILTERS }, deck: { ...EMPTY_FILTERS }, deckAdd: { ...EMPTY_FILTERS },
  tradeGive: { ...EMPTY_FILTERS }, tradeGet: { ...EMPTY_FILTERS },
});
export const filtersOn = (filters: Filters, skipQuery = false) =>
  (Object.keys(filters) as Array<keyof Filters>).some((key) => (!skipQuery || key !== "query") && filters[key] !== "");
export const filterCount = (filters: Filters, skipQuery = false) =>
  (Object.keys(filters) as Array<keyof Filters>).filter((key) => (!skipQuery || key !== "query") && filters[key] !== "").length;

/** What a card needs for local filtering. legal is a comma list of formats; legalities is the full record. */
export type Filterable = {
  name: string; type_line?: string; set_code?: string; colors?: string; rarity?: string; mana_value?: number | null;
  legal?: string; legalities?: Record<string, string>;
};

const legalIn = (card: Filterable, format: string) => {
  if (card.legal !== undefined) return card.legal.split(",").includes(format);
  if (card.legalities) return card.legalities[format] === "legal" || card.legalities[format] === "restricted";
  return true;
};

/** The same rules as the card search on the server, applied to cards already loaded (a collection or a deck). */
export function matchesFilters(card: Filterable, filters: Filters): boolean {
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const text = `${card.name} ${card.type_line ?? ""} ${card.set_code ?? ""}`.toLowerCase();
    if (!words.every((word) => text.includes(word))) return false;
  }
  if (filters.type.trim() && !(card.type_line ?? "").toLowerCase().includes(filters.type.trim().toLowerCase())) return false;
  if (filters.set.trim() && (card.set_code ?? "").toLowerCase() !== filters.set.trim().toLowerCase()) return false;
  if (filters.color && !(card.colors ?? "").includes(filters.color)) return false;
  if (filters.rarity && card.rarity !== filters.rarity) return false;
  if (filters.format && !legalIn(card, filters.format)) return false;
  const value = card.mana_value ?? 0;
  if (filters.mvMin && value < Number(filters.mvMin)) return false;
  if (filters.mvMax && value > Number(filters.mvMax)) return false;
  return true;
}

/** The search address for the card database: /api/cards with the filters, a page offset and the total. */
export function searchParams(filters: Filters, offset: number, limit: number): URLSearchParams {
  const params = new URLSearchParams({ q: filters.query, paged: "1", offset: String(offset), limit: String(limit) });
  if (filters.type.trim()) params.set("type", filters.type.trim());
  if (filters.set.trim()) params.set("set", filters.set.trim());
  if (filters.color) params.set("color", filters.color);
  if (filters.rarity) params.set("rarity", filters.rarity);
  if (filters.format) params.set("format", filters.format);
  if (filters.mvMin) params.set("mvMin", filters.mvMin);
  if (filters.mvMax) params.set("mvMax", filters.mvMax);
  return params;
}
