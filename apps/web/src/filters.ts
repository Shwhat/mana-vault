// ---------- filters: the Filters panel's fields, kept per view, and how they match cards ----------
import { useEffect, useState } from "react";
import { request } from "./api";
import { type Currency, EMPTY_FILTERS, type Filters } from "./types";

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

const quoted = (value: string) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value);

/**
 * The filters the card database answers (tags, artist, power, price, treatments...), as search words. Empty when none
 * of them is set.
 */
export function serverQuery(filters: Filters, currency: Currency = "usd"): string {
  const words: string[] = [];
  const text = (key: string, value: string) => { if (value.trim()) words.push(`${key}:${quoted(value.trim())}`); };
  const range = (key: string, min: string, max: string) => {
    if (min.trim() && Number.isFinite(Number(min))) words.push(`${key}>=${Number(min)}`);
    if (max.trim() && Number.isFinite(Number(max))) words.push(`${key}<=${Number(max)}`);
  };
  text("art", filters.art);
  text("role", filters.role);
  text("name", filters.name);
  text("o", filters.text);
  text("t", filters.creature);
  text("kw", filters.keyword);
  text("a", filters.artist);
  range("pow", filters.powMin, filters.powMax);
  range("tou", filters.touMin, filters.touMax);
  range(currency, filters.priceMin, filters.priceMax);
  if (/^\d{4}$/.test(filters.yearMin.trim())) words.push(`year>=${filters.yearMin.trim()}`);
  if (/^\d{4}$/.test(filters.yearMax.trim())) words.push(`year<=${filters.yearMax.trim()}`);
  if (filters.made) words.push(`is:${filters.made}`);
  if (filters.owned === "owned") words.push("is:owned");
  if (filters.owned === "notowned") words.push("-is:owned");
  if (filters.frame) words.push(`is:${filters.frame}`);
  if (filters.foilType) words.push(`is:${filters.foilType}`);
  return words.join(" ");
}

/**
 * For a collection or deck view: the printing ids that match the filters only the card database can answer, or null
 * while there are none (or while the answer is loading, when every card is shown).
 */
export function useServerMatch(filters: Filters, currency: Currency): Set<string> | null {
  const query = serverQuery(filters, currency);
  const [matched, setMatched] = useState<{ query: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (!query) return;
    let live = true;
    void request<{ ids: string[] }>(`/api/cards/match?q=${encodeURIComponent(query)}`)
      .then((answer) => { if (live) setMatched({ query, ids: new Set(answer.ids) }); })
      .catch(() => { if (live) setMatched({ query, ids: new Set() }); });
    return () => { live = false; };
  }, [query]);
  return query && matched?.query === query ? matched.ids : null;
}

/** The same rules as the card search on the server, applied to cards already loaded (a collection or a deck). */
export function matchesFilters(card: Filterable & { id?: string; card_id?: string }, filters: Filters, matched: Set<string> | null = null): boolean {
  if (matched && !matched.has(card.card_id ?? card.id ?? "")) return false;
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
export function searchParams(filters: Filters, offset: number, limit: number, options: { group?: boolean; currency?: Currency } = {}): URLSearchParams {
  const query = [filters.query.trim(), serverQuery(filters, options.currency)].filter(Boolean).join(" ");
  const params = new URLSearchParams({ q: query, paged: "1", offset: String(offset), limit: String(limit) });
  // one result per card unless every printing is wanted
  if (options.group) params.set("group", "1");
  if (filters.type.trim()) params.set("type", filters.type.trim());
  if (filters.set.trim()) params.set("set", filters.set.trim());
  if (filters.color) params.set("color", filters.color);
  if (filters.rarity) params.set("rarity", filters.rarity);
  if (filters.format) params.set("format", filters.format);
  if (filters.mvMin) params.set("mvMin", filters.mvMin);
  if (filters.mvMax) params.set("mvMax", filters.mvMax);
  return params;
}
