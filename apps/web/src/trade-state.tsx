// ---------- trade state: saved trades, their lines, completing, sending and the share link ----------
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { csvCell, downloadText, request, slugify } from "./api";
import { confirmDialog } from "./components/Dialog";
import type { Prefs } from "./prefs";
import {
  type CardDetail, type Collection, type CollectionEntry, type Condition, type Currency, type FinishCode, type Person, type PriceFields, money, priceOf, pricesOf,
} from "./types";

export type TradeSide = "give" | "get";
export type TradeStatus = "open" | "done" | "cancelled";
/** One line of a trade: a printing in a finish, condition and language, a count, and a price when it was changed by hand. */
export type TradeLine = PriceFields & {
  id?: number; side: TradeSide; cardId: string; foil: FinishCode; condition: Condition; language: string; quantity: number; price: number | null;
  collectionId: string | null; collectionName?: string | null; name: string; set_code: string; set_name: string; collector_number: string;
  image_url: string | null; rarity?: string;
};
export type Trade = {
  id: string; name: string; status: TradeStatus; mine: boolean; with: Person | null; turn: "me" | "them" | null; collectionId: string | null;
  canUndo: boolean; createdAt: string; updatedAt: string; doneAt: string | null; lines: TradeLine[];
};
export type TradeMatch = PriceFields & {
  user: Person; cardId: string; name: string; set_code: string; set_name: string; collector_number: string; image_url: string | null;
  foil: FinishCode; condition: Condition; language: string; quantity: number; collectionId: string | null;
};
type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };

export type TradeDeps = {
  live: MutableRefObject<{ prefs: Prefs; collections: Collection[] | null }>;
  flash: (text: string, kind?: "ok" | "err") => void;
  fail: (reason: unknown, fallback: string) => void;
  pushUndo: (entry: UndoEntry) => void;
  refreshAfterChange: () => Promise<void>;
  collectionName: (id: string | null) => string;
};

const lineKey = (line: Pick<TradeLine, "side" | "cardId" | "foil" | "condition" | "language" | "collectionId">) =>
  `${line.side}:${line.cardId}:${line.foil}:${line.condition}:${line.language}:${line.collectionId ?? ""}`;
/** The value of one copy on a line: the price typed in, or the card database price for its finish. */
export const lineEach = (line: TradeLine, currency: Currency) => line.price ?? priceOf(line, line.foil, currency);
export const lineValue = (line: TradeLine, currency: Currency) => (lineEach(line, currency) ?? 0) * line.quantity;
export const sideTotal = (trade: Trade | null, side: TradeSide, currency: Currency) =>
  (trade?.lines ?? []).filter((line) => line.side === side).reduce((sum, line) => sum + lineValue(line, currency), 0);

const OPEN_KEY = "mana-vault.openTrade";

export function useTradeState(deps: TradeDeps) {
  const { live, flash, fail, pushUndo, refreshAfterChange, collectionName } = deps;
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [openTradeId, setOpenTradeId] = useState<string | null>(() => { try { return localStorage.getItem(OPEN_KEY); } catch { return null; } });
  const [matches, setMatches] = useState<{ theyHave: TradeMatch[]; theyWant: TradeMatch[] } | null>(null);
  const [shareToken, setShareToken] = useState<string | null | undefined>(undefined);
  const tradesRef = useRef(trades);
  tradesRef.current = trades;
  const openRef = useRef(openTradeId);
  openRef.current = openTradeId;

  const openTrade = useMemo(() => trades?.find((item) => item.id === openTradeId) ?? null, [trades, openTradeId]);
  const waiting = (trades ?? []).filter((item) => item.status === "open" && item.turn === "me").length;

  const chooseTrade = useCallback((id: string | null) => {
    setOpenTradeId(id);
    try { if (id) localStorage.setItem(OPEN_KEY, id); else localStorage.removeItem(OPEN_KEY); } catch { /* the choice is only kept for this visit */ }
  }, []);

  const reloadTrades = useCallback(async () => {
    try {
      const list = await request<Trade[]>("/api/trades");
      setTrades(list);
      if (openRef.current && !list.some((item) => item.id === openRef.current)) chooseTrade(list.find((item) => item.status === "open")?.id ?? null);
      if (!openRef.current && list.length) chooseTrade(list.find((item) => item.status === "open")?.id ?? null);
    } catch (reason) {
      fail(reason, "Could not load your trades.");
    }
  }, [fail, chooseTrade]);

  useEffect(() => { void reloadTrades(); }, [reloadTrades]);

  const reloadMatches = useCallback(async () => {
    try {
      setMatches(await request<{ theyHave: TradeMatch[]; theyWant: TradeMatch[] }>("/api/trades/matches"));
    } catch (reason) {
      fail(reason, "Could not load the wishlist matches.");
    }
  }, [fail]);

  const replace = (trade: Trade) => setTrades((list) => (list ? (list.some((item) => item.id === trade.id) ? list.map((item) => (item.id === trade.id ? trade : item)) : [trade, ...list]) : [trade]));

  const newTrade = useCallback(async (name: string) => {
    try {
      const trade = await request<Trade>("/api/trades", { method: "POST", body: JSON.stringify({ name }) });
      replace(trade);
      chooseTrade(trade.id);
      flash(`${trade.name} started`);
      return trade;
    } catch (reason) {
      fail(reason, "Could not start the trade.");
      return null;
    }
  }, [chooseTrade, flash, fail]);

  const patch = useCallback(async (trade: Trade, body: { name?: string; status?: TradeStatus; lines?: TradeLine[] }, message?: string) => {
    try {
      const payload = body.lines
        ? { ...body, lines: body.lines.map((line) => ({ id: line.id, side: line.side, cardId: line.cardId, foil: line.foil, condition: line.condition, language: line.language,
          quantity: line.quantity, price: line.price, collectionId: line.collectionId })) }
        : body;
      const next = await request<Trade>(`/api/trades/${encodeURIComponent(trade.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
      replace(next);
      if (message) flash(message);
      return next;
    } catch (reason) {
      fail(reason, "Could not change the trade.");
      return null;
    }
  }, [flash, fail]);

  const renameTrade = useCallback((trade: Trade, name: string) => patch(trade, { name }, "Trade renamed"), [patch]);
  const cancelTrade = useCallback(async (trade: Trade) => {
    if (trade.with) {
      try {
        await request(`/api/trades/${encodeURIComponent(trade.id)}/decline`, { method: "POST", body: "{}" });
        flash(trade.mine ? `${trade.name} cancelled` : `${trade.name} declined`);
        await reloadTrades();
      } catch (reason) {
        fail(reason, "Could not cancel the trade.");
      }
      return;
    }
    await patch(trade, { status: trade.status === "cancelled" ? "open" : "cancelled" }, trade.status === "cancelled" ? `${trade.name} reopened` : `${trade.name} cancelled`);
  }, [patch, flash, fail, reloadTrades]);

  const deleteTrade = useCallback(async (trade: Trade) => {
    const ok = await confirmDialog("Delete trade", <>Delete {trade.name}? Its cards stay where they are.</>, "Delete");
    if (!ok) return;
    try {
      await request(`/api/trades/${encodeURIComponent(trade.id)}`, { method: "DELETE" });
      setTrades((list) => (list ?? []).filter((item) => item.id !== trade.id));
      if (openRef.current === trade.id) chooseTrade(null);
      flash(`${trade.name} deleted`);
    } catch (reason) {
      fail(reason, "Could not delete the trade.");
    }
  }, [chooseTrade, flash, fail]);

  /** The open trade, or a new one named Trade when none is open. */
  const ensureTrade = useCallback(async (): Promise<Trade | null> => {
    const current = tradesRef.current?.find((item) => item.id === openRef.current && item.status === "open");
    if (current) return current;
    return newTrade(`Trade ${new Date().toLocaleDateString()}`);
  }, [newTrade]);

  const setLines = useCallback(async (trade: Trade, lines: TradeLine[]) => patch(trade, { lines }), [patch]);

  /** Adds a line to the open trade, or one more copy when the same line is there. */
  const addLine = useCallback(async (line: TradeLine) => {
    const trade = await ensureTrade();
    if (!trade) return;
    const key = lineKey(line);
    const same = trade.lines.find((item) => lineKey(item) === key);
    const lines = same
      ? trade.lines.map((item) => (item === same ? { ...item, quantity: Math.min(999, item.quantity + line.quantity) } : item))
      : [...trade.lines, line];
    if (await setLines(trade, lines)) flash(`${line.name} added to ${line.side === "give" ? "what you give" : "what you get"}`);
  }, [ensureTrade, setLines, flash]);

  const changeLine = useCallback(async (trade: Trade, line: TradeLine, change: Partial<TradeLine>) => {
    const lines = trade.lines.flatMap((item) => (item === line ? (change.quantity === 0 ? [] : [{ ...item, ...change }]) : [item]));
    await setLines(trade, lines);
  }, [setLines]);

  const giveEntry = useCallback((entry: CollectionEntry, quantity = 1) => {
    const collectionId = entry.collection_id ?? live.current.prefs.openCollection;
    void addLine({
      side: "give", cardId: entry.id, foil: entry.foil, condition: entry.condition, language: entry.language, quantity, price: null,
      collectionId: collectionId ?? null, collectionName: collectionId ? collectionName(collectionId) : null, name: entry.name, set_code: entry.set_code,
      set_name: entry.set_name, collector_number: entry.collector_number, image_url: entry.image_url, rarity: entry.rarity,
      price_usd: entry.price_usd, price_usd_foil: entry.price_usd_foil, price_usd_etched: entry.price_usd_etched
    });
  }, [addLine, live, collectionName]);

  const getCard = useCallback(async (cardId: string) => {
    try {
      const card = await request<CardDetail>(`/api/cards/${encodeURIComponent(cardId)}`);
      await addLine({
        side: "get", cardId, foil: live.current.prefs.foil ? 1 : 0, condition: "NM", language: "en", quantity: 1, price: null, collectionId: null,
        name: card.name, set_code: card.set_code, set_name: card.set_name, collector_number: card.collector_number, image_url: card.image_url, rarity: card.rarity,
        ...pricesOf(card),
      });
    } catch (reason) {
      fail(reason, "Could not add the card to the trade.");
    }
  }, [addLine, fail, live]);

  /** Completes a trade made without another account: one undoable step. Cards linked to decks are named first. */
  const completeTrade = useCallback(async (trade: Trade, collectionId: string | null) => {
    const give = trade.lines.filter((line) => line.side === "give");
    try {
      const sources = [...new Set(give.map((line) => line.collectionId).filter((id): id is string => !!id))];
      const rows = (await Promise.all(sources.map((id) => request<CollectionEntry[]>(`/api/collections/${encodeURIComponent(id)}/cards`).then((list) => list.map((row) => ({ ...row, collection_id: id })))))).flat();
      const inDecks = give.flatMap((line) => {
        const row = rows.find((item) => item.collection_id === line.collectionId && item.id === line.cardId && item.foil === line.foil &&
          item.condition === line.condition && item.language === line.language && !item.proxy);
        const linked = (row?.decks ?? []).reduce((sum, deck) => sum + deck.quantity, 0);
        const free = (row?.quantity ?? 0) - linked;
        return linked && line.quantity > free ? [`${line.name} (${row!.decks!.map((deck) => deck.name).join(", ")})`] : [];
      });
      if (inDecks.length) {
        const ok = await confirmDialog("Cards in decks", <>These cards are used in decks and will be missing there after the trade: {inDecks.join("; ")}. Complete the trade?</>, "Complete trade");
        if (!ok) return;
      }
    } catch {
      // the deck check is a warning only
    }
    const complete = async () => {
      await request(`/api/trades/${encodeURIComponent(trade.id)}/complete`, { method: "POST", body: JSON.stringify({ collectionId }) });
      await reloadTrades();
      await refreshAfterChange();
    };
    try {
      await complete();
      pushUndo({
        label: `Complete ${trade.name}`,
        undo: async () => { await request(`/api/trades/${encodeURIComponent(trade.id)}/reopen`, { method: "POST", body: "{}" }); await reloadTrades(); await refreshAfterChange(); },
        redo: complete,
      });
      flash(`${trade.name} completed`);
    } catch (reason) {
      fail(reason, "Could not complete the trade.");
    }
  }, [reloadTrades, refreshAfterChange, pushUndo, flash, fail]);

  const sendTrade = useCallback(async (trade: Trade, userId: number, collectionId: string) => {
    try {
      replace(await request<Trade>(`/api/trades/${encodeURIComponent(trade.id)}/send`, { method: "POST", body: JSON.stringify({ userId, collectionId }) }));
      flash(`${trade.name} sent`);
    } catch (reason) {
      fail(reason, "Could not send the trade.");
    }
  }, [flash, fail]);

  const acceptTrade = useCallback(async (trade: Trade, collectionId: string | null) => {
    try {
      await request(`/api/trades/${encodeURIComponent(trade.id)}/accept`, { method: "POST", body: JSON.stringify({ collectionId }) });
      flash(`${trade.name} accepted and completed`);
      await reloadTrades();
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not accept the trade.");
    }
  }, [reloadTrades, refreshAfterChange, flash, fail]);

  const setTradeCollection = useCallback(async (trade: Trade, collectionId: string) => {
    try {
      await request(`/api/trades/${encodeURIComponent(trade.id)}/collection`, { method: "POST", body: JSON.stringify({ collectionId }) });
      replace({ ...trade, collectionId });
    } catch (reason) {
      fail(reason, "Could not choose the collection.");
    }
  }, [fail]);

  const setTradeSource = useCallback(async (trade: Trade, line: TradeLine, collectionId: string) => {
    if (line.id === undefined) return fail(new Error("Trade line has no ID"), "Could not choose the source collection.");
    try {
      replace(await request<Trade>(`/api/trades/${encodeURIComponent(trade.id)}/lines/${line.id}/source`, {
        method: "POST", body: JSON.stringify({ collectionId }),
      }));
    } catch (reason) {
      fail(reason, "Could not choose the source collection.");
    }
  }, [fail]);

  /** The trade as text: both sides with prices, then the balance. */
  const tradeText = useCallback((trade: Trade) => {
    const currency = live.current.prefs.currency;
    const side = (which: TradeSide) => trade.lines.filter((line) => line.side === which).map((line) => {
      const finish = line.foil === 2 ? " (etched)" : line.foil === 1 ? " (foil)" : "";
      return `${line.quantity} ${line.name} (${line.set_code.toUpperCase()}) ${line.collector_number}${finish}: ${money(lineValue(line, currency), currency)}`;
    });
    const give = sideTotal(trade, "give", currency);
    const get = sideTotal(trade, "get", currency);
    return [
      trade.name, "",
      `You give (${money(give, currency)})`, ...side("give"), "",
      `You get (${money(get, currency)})`, ...side("get"), "",
      `Difference: ${money(Math.abs(get - give), currency)} ${get === give ? "(even)" : get > give ? "in your favor" : "in their favor"}`,
    ].join("\n");
  }, [live]);

  const copyTrade = useCallback(async (trade: Trade | null) => {
    if (!trade || !trade.lines.length) return flash("Add cards to the trade first", "err");
    try {
      await navigator.clipboard.writeText(tradeText(trade));
      flash("Trade list copied");
    } catch {
      flash("Could not copy to the clipboard", "err");
    }
  }, [tradeText, flash]);

  const exportTrade = useCallback((trade: Trade | null) => {
    if (!trade || !trade.lines.length) return flash("Add cards to the trade first", "err");
    const currency = live.current.prefs.currency;
    const rows = [["Side", "Count", "Name", "Set", "Number", "Finish", "Condition", "Language", "Price each", "Total"].join(","),
      ...trade.lines.map((line) => [line.side === "give" ? "You give" : "You get", line.quantity, line.name, line.set_code.toUpperCase(), line.collector_number,
        ["Regular", "Foil", "Etched"][line.foil] ?? "", line.condition, line.language, lineEach(line, currency) ?? "", lineValue(line, currency).toFixed(2)].map(csvCell).join(","))];
    downloadText(`${slugify(trade.name)}.csv`, rows.join("\r\n"), "text/csv;charset=utf-8");
    flash("Trade list exported");
  }, [live, flash]);

  const loadShare = useCallback(async () => {
    try {
      setShareToken((await request<{ token: string | null }>("/api/trade-share")).token);
    } catch (reason) {
      fail(reason, "Could not load the share link.");
    }
  }, [fail]);
  const makeShare = useCallback(async () => {
    try {
      setShareToken((await request<{ token: string }>("/api/trade-share", { method: "POST", body: "{}" })).token);
      flash("New share link made");
    } catch (reason) {
      fail(reason, "Could not make the share link.");
    }
  }, [flash, fail]);
  const stopShare = useCallback(async () => {
    try {
      await request("/api/trade-share", { method: "DELETE" });
      setShareToken(null);
      flash("Share link turned off");
    } catch (reason) {
      fail(reason, "Could not turn off the share link.");
    }
  }, [flash, fail]);

  return {
    trades, reloadTrades, openTrade, openTradeId, chooseTrade, waitingTrades: waiting, newTrade, renameTrade, cancelTrade, deleteTrade,
    addLine, changeLine, setLines, giveEntry, getCard, completeTrade, sendTrade, acceptTrade, setTradeCollection, setTradeSource, copyTrade, exportTrade, tradeText,
    matches, reloadMatches, shareToken, loadShare, makeShare, stopShare,
  };
}
