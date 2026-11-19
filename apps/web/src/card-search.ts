// ---------- card search: results from the card database, a page at a time ----------
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api";
import { searchParams } from "./filters";
import type { Card, Filters } from "./types";

/** A search result: a printing with how many copies the account owns. */
export type FoundCard = Card & { owned?: number };
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
};

export const SEARCH_PAGE = 60;

/** Searches the card database with the filters while enabled. A new filter starts again at the top. */
export function useCardSearch(filters: Filters, enabled: boolean): CardSearch {
  const [cards, setCards] = useState<FoundCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const state = useRef({ cards, total, loading, filters, generation: 0 });
  state.current = { ...state.current, cards, total, loading, filters };

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const generation = ++state.current.generation;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const page = await request<{ total: number; cards: FoundCard[] }>(`/api/cards?${searchParams(filters, 0, SEARCH_PAGE)}`, { signal: controller.signal });
        if (generation !== state.current.generation) return;
        setCards(page.cards);
        setTotal(page.total);
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
  }, [enabled, filters, round]);

  const more = useCallback(() => {
    const current = state.current;
    if (current.loading || current.cards.length >= current.total) return;
    const generation = current.generation;
    state.current.loading = true;
    setLoading(true);
    void request<{ total: number; cards: FoundCard[] }>(`/api/cards?${searchParams(current.filters, current.cards.length, SEARCH_PAGE)}`)
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
  const owned = useCallback((id: string, change: number) =>
    setCards((list) => list.map((card) => (card.id === id ? { ...card, owned: Math.max(0, (card.owned ?? 0) + change) } : card))), []);
  return { cards, total, loading, error, more, refresh, owned };
}
