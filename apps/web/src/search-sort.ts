// ---------- search sorting: the order of card search results kept in the browser, the same rules as the server ----------
import { anyPrice, type Card, type Currency, pricesOf, type SearchSort } from "./types";

type Sortable = Card & { owned?: number };

/** The plain words of a search, without filter words such as t:creature (the same rule as the server). */
export function plainWords(query: string): string {
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return tokens.filter((token) => !/^(-?)([a-z]+)(>=|<=|>|<|=|:)/i.test(token) && !token.startsWith("-"))
    .map((token) => token.replace(/^"|"$/g, "")).filter(Boolean).join(" ");
}

/** How well a card name matches the search words: 0 exact, 1 starts with them, 2 holds every word, 3 other. */
export function matchRank(name: string, words: string, flavorName?: string | null): number {
  const term = words.trim().toLowerCase();
  if (!term) return 3;
  const lower = name.toLowerCase();
  if (lower === term || (flavorName ?? "").toLowerCase() === term || lower.startsWith(`${term} // `)) return 0;
  if (lower.startsWith(term)) return 1;
  return term.split(/\s+/).every((word) => lower.includes(word)) ? 2 : 3;
}

const RARITY_RANK: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
const colorRank = (colors: string | null | undefined) => {
  const list = (colors ?? "").replace(/[\s,]/g, "");
  return !list ? 7 : list.length > 1 ? 6 : "WUBRG".indexOf(list) + 1;
};

/** Orders search results kept in the browser (the You give search) the same way the server orders card search. */
export function sortFound<T extends Sortable>(cards: T[], sort: SearchSort, query: string, currency: Currency): T[] {
  const words = plainWords(query);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const price = (card: T) => anyPrice(pricesOf(card), currency);
  const released = (card: T) => card.released_at ?? "";
  const compare: Record<SearchSort, (a: T, b: T) => number> = {
    best: (a, b) => matchRank(a.name, words, a.flavor_name) - matchRank(b.name, words, b.flavor_name) || byName(a, b),
    name: byName,
    newest: (a, b) => released(b).localeCompare(released(a)) || byName(a, b),
    oldest: (a, b) => (released(a) || "9999").localeCompare(released(b) || "9999") || byName(a, b),
    priceHigh: (a, b) => (price(b) ?? -1) - (price(a) ?? -1) || byName(a, b),
    priceLow: (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity) || byName(a, b),
    mv: (a, b) => (a.mana_value ?? 0) - (b.mana_value ?? 0) || byName(a, b),
    rarity: (a, b) => (RARITY_RANK[a.rarity] ?? 4) - (RARITY_RANK[b.rarity] ?? 4) || byName(a, b),
    color: (a, b) => colorRank(a.colors) - colorRank(b.colors) || byName(a, b),
    set: (a, b) => (a.set_name ?? "").localeCompare(b.set_name ?? "") || (a.collector_number ?? "").localeCompare(b.collector_number ?? "", undefined, { numeric: true }) || byName(a, b),
    owned: (a, b) => (b.owned ?? 0) - (a.owned ?? 0) || byName(a, b),
  };
  return [...cards].sort(compare[sort]);
}
