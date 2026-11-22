// ---------- card search: results from the card database, a page at a time ----------
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api";
import { searchParams } from "./filters";
import type { Card, Currency, Filters, FinishCode, SearchSort } from "./types";
export { matchRank, plainWords, sortFound } from "./search-sort";

/** A search result: a printing with how many copies the account owns. */
export type FoundCard = Card & { owned?: number; ownedFinishes?: { regular: number; foil: number; etched: number } };
export type CardSearch = {
  cards: FoundCard[];
  total: number;
  loading: boolean;
  error: string;
  /** Loads the next page when more results exist. */
  more: () => void;
  /** Runs the search again from the top, for example after adding a card changes the owned counts. */
  refresh: () => void;
  /** Changes the owned count shown on a printing, after copies are added or removed. */
  owned: (id: string, change: number) => void;
  /** Loads the results already shown again in place (0.18.0), keeping the scroll position: owned counts changed elsewhere. */
  reload: () => void;
};

export const SEARCH_PAGE = 60;

/** Every open card search, so a change to the card database (a saved custom card) can run them again. */
const openSearches = new Set<() => void>();
/** Runs every open card search again, keeping its filters. */
export function refreshCardSearches() {
  for (const refresh of openSearches) refresh();
}

/** Searches the card database with the filters while enabled. A new filter starts again at the top. */
export function useCardSearch(filters: Filters, enabled: boolean, options: { group?: boolean; currency?: Currency; sort?: SearchSort } = {}): CardSearch {
  const [cards, setCards] = useState<FoundCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const group = !!options.group;
  const currency = options.currency ?? "usd";
  const sort = options.sort ?? "best";
  // the search last completed: coming back to a view whose search did not change keeps its results (0.18.0)
  const state = useRef({ cards, total, loading, filters, group, currency, sort, generation: 0, done: "" });
  state.current = { ...state.current, cards, total, loading, filters, group, currency, sort };

  useEffect(() => {
    if (!enabled) return;
    const key = JSON.stringify([filters, group, currency, sort, round]);
    if (state.current.done === key) return;
    const controller = new AbortController();
    const generation = ++state.current.generation;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const page = await request<{ total: number; cards: FoundCard[] }>(`/api/cards?${searchParams(filters, 0, SEARCH_PAGE, { group, currency, sort })}`, { signal: controller.signal });
        if (generation !== state.current.generation) return;
        setCards(page.cards);
        setTotal(page.total);
        state.current.done = key;
      } catch (reason) {
        if (!controller.signal.aborted) {
          setCards([]);
          setTotal(0);
          setError(reason instanceof Error ? reason.message : "The search failed.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, filters, round, group, currency, sort]);

  const more = useCallback(() => {
    const current = state.current;
    if (current.loading || current.cards.length >= current.total) return;
    const generation = current.generation;
    state.current.loading = true;
    setLoading(true);
    void request<{ total: number; cards: FoundCard[] }>(`/api/cards?${searchParams(current.filters, current.cards.length, SEARCH_PAGE, { group: current.group, currency: current.currency, sort: current.sort })}`)
      .then((page) => {
        if (generation !== state.current.generation) return;
        setCards((list) => {
          const seen = new Set(list.map((card) => card.id));
          return [...list, ...page.cards.filter((card) => !seen.has(card.id))];
        });
        setTotal(page.total);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "The search failed."))
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => setRound((value) => value + 1), []);
  const reload = useCallback(() => {
    const current = state.current;
    if (current.loading || !current.cards.length) return;
    const generation = current.generation;
    const count = Math.min(current.cards.length, 600);
    void (async () => {
      const found: FoundCard[] = [];
      let total = current.total;
      for (let offset = 0; offset < count; offset += 100) {
        const page = await request<{ total: number; cards: FoundCard[] }>(`/api/cards?${searchParams(current.filters, offset, Math.min(100, count - offset), { group: current.group, currency: current.currency, sort: current.sort })}`);
        found.push(...page.cards);
        total = page.total;
      }
      if (generation !== state.current.generation) return;
      const fresh = new Map(found.map((card) => [card.id, card]));
      setCards((list) => list.map((card) => fresh.get(card.id) ?? card));
      setTotal(total);
    })().catch(() => undefined);
  }, []);
  useEffect(() => {
    openSearches.add(refresh);
    return () => { openSearches.delete(refresh); };
  }, [refresh]);
  // a grouped result counts the copies of every printing of its card; the finish keeps the counts by finish right
  const owned = useCallback((id: string, change: number, finish: FinishCode = 0, oracleId?: string | null) =>
    setCards((list) => list.map((card) => {
      if (card.id !== id && !(card.printings && oracleId && card.oracle_id === oracleId)) return card;
      const key = finish === 2 ? "etched" : finish === 1 ? "foil" : "regular";
      const finishes = { regular: 0, foil: 0, etched: 0, ...card.ownedFinishes };
      finishes[key] = Math.max(0, finishes[key] + change);
      return { ...card, owned: Math.max(0, (card.owned ?? 0) + change), ownedFinishes: finishes };
    })), []);
  return { cards, total, loading, error, more, refresh, owned, reload };
}

