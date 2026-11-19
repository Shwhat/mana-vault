// ---------- state: the one place that holds the app's data and changes it ----------
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { csvCell, downloadBlob, downloadText, pickFile, request, slugify } from "./api";
import { confirmDialog, dialog } from "./components/Dialog";
import { activatePanel, clone, type Layout, openPanel, type PanelId, PRESETS, type Workspace } from "./dock";
import { type Counts, entryKey, useLibraryState } from "./library-state";
import { applyTheme, type Prefs, savePrefs } from "./prefs";
import {
  type BackupSummary, type Card, type CardDetail, type CatalogStatus, type Collection, type CollectionEntry, type CollectionTab,
  type CompletionReport, type Deck, type DeckCard, type DeckTab, type Facets, type FinishCode, type Ownership, type PriceFields, type Stats,
  type DeckDetail, type DeckMode, EMPTY_FILTERS, type Filters, type ImportReport, type TradeEntry, type User, type View, type Zone, capitalize,
  cardTypes, colorKey, conditionName, copyKey, copyLabel, curveKey, languageName, money, priceOf, pricesOf,
} from "./types";

export type Selection = { view: "cards" | "collection" | "deck"; key: string; printingId: string } | null;
export type Flash = { text: string; kind: "ok" | "err"; id: number } | null;
type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };
export type Review = { title: string; report: ImportReport; done: boolean } | null;
type DeckKey = { deckId: string; oracle_id: string; printing_id: string | null; card_id: string; zone: Zone };
/** One line of the trade calculator. Lines are kept until the page is reloaded or the trade is cleared. */
export type TradeLine = {
  id: string; cardId: string; name: string; set_code: string; collector_number: string; foil: FinishCode; quantity: number; prices: PriceFields; from?: string;
};
type TradeSide = "give" | "get";

const UNDO_LIMIT = 150;

const message = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

export function useStoreState(user: User, initialPrefs: Prefs) {
  const [prefs, setPrefsState] = useState(initialPrefs);
  const [view, setViewState] = useState<View>(() => {
    if (window.location.pathname.startsWith("/about")) return "about";
    return PRESETS[initialPrefs.workspace]?.().view ?? initialPrefs.workspaces[initialPrefs.workspace]?.view ?? "cards";
  });
  const [lastView, setLastView] = useState<Exclude<View, "about">>("cards");
  const [aboutSlug, setAboutSlug] = useState(() => window.location.pathname.replace(/^\/about\/?/, ""));
  const [filters, setFiltersState] = useState<Filters>(EMPTY_FILTERS);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [collection, setCollection] = useState<CollectionEntry[] | null>(null);
  const [collectionFilter, setCollectionFilter] = useState("");
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [collectionTab, setCollectionTab] = useState<CollectionTab>("cards");
  const [completion, setCompletion] = useState<CompletionReport | null>(null);
  const [facets, setFacets] = useState<Facets>({});
  const [binderPage, setBinderPage] = useState(0);
  const [collectionStats, setCollectionStats] = useState<Stats | null>(null);
  const [deckTab, setDeckTab] = useState<DeckTab>("cards");
  const [deckStats, setDeckStats] = useState<Stats | null>(null);
  const [ownership, setOwnership] = useState<Ownership | null>(null);
  const [tradeList, setTradeList] = useState<TradeEntry[] | null>(null);
  const [trade, setTrade] = useState<Record<TradeSide, TradeLine[]>>({ give: [], get: [] });
  // rows picked in the collection list; the last one clicked is also the selection
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null);
  const [catalog, setCatalog] = useState<CatalogStatus | null>(null);
  const [catalogRequestPending, setCatalogRequestPending] = useState(false);
  const [review, setReview] = useState<Review>(null);
  const [flashMsg, setFlashMsg] = useState<Flash>(null);
  // the undo and redo stacks live in a ref so queued presses always see the latest stacks
  const stacks = useRef<{ undo: UndoEntry[]; redo: UndoEntry[] }>({ undo: [], redo: [] });
  const [, setStackVersion] = useState(0);
  const bumpStacks = useCallback(() => setStackVersion((value) => value + 1), []);
  const undoQueue = useRef<Promise<void>>(Promise.resolve());
  const [scannerOpen, setScannerOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const catalogPoll = useRef<(() => void) | null>(null);
  const previousUpdate = useRef<CatalogStatus["update"] | null>(null);
  const live = useRef({ deck, collection, selection, prefs, collections, view, collectionTab, completion, collectionStats, deckStats, ownership, tradeList, deckTab });
  live.current = { deck, collection, selection, prefs, collections, view, collectionTab, completion, collectionStats, deckStats, ownership, tradeList, deckTab };

  // ---------- preferences and layout ----------
  const setPrefs = useCallback((change: Partial<Prefs> | ((current: Prefs) => Partial<Prefs>)) => {
    setPrefsState((current) => {
      const next = { ...current, ...(typeof change === "function" ? change(current) : change) };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => applyTheme(prefs.theme), [prefs.theme]);

  const setLayout = useCallback((layout: Layout) => setPrefs({ layout }), [setPrefs]);
  const showPanel = useCallback((panel: PanelId) => setPrefs((current) => ({ layout: openPanel(current.layout, panel) })), [setPrefs]);
  const focusPanel = useCallback((panel: PanelId) => setPrefs((current) => ({ layout: activatePanel(current.layout, panel) })), [setPrefs]);

  const flash = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    window.clearTimeout(flashTimer.current);
    setFlashMsg({ text, kind, id: Date.now() });
    flashTimer.current = window.setTimeout(() => setFlashMsg(null), kind === "err" ? 7000 : 2600);
  }, []);
  const fail = useCallback((reason: unknown, fallback: string) => flash(message(reason, fallback), "err"), [flash]);

  // ---------- views ----------
  const setView = useCallback((next: View) => {
    if (next === "about") return;
    setViewState(next);
    setLastView(next);
    if (window.location.pathname.startsWith("/about")) window.history.pushState(null, "", "/");
  }, []);

  const openAbout = useCallback((slug = "") => {
    setViewState((current) => {
      if (current !== "about") setLastView(current);
      return "about";
    });
    setAboutSlug(slug);
    const path = slug ? `/about/${slug}` : "/about";
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }, []);

  const closeAbout = useCallback(() => {
    setViewState(lastView);
    window.history.pushState(null, "", "/");
  }, [lastView]);

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname.startsWith("/about")) {
        setViewState("about");
        setAboutSlug(window.location.pathname.replace(/^\/about\/?/, ""));
      } else setViewState((current) => (current === "about" ? lastView : current));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [lastView]);

  // ---------- loading ----------
  const reloadCollections = useCallback(async (): Promise<Collection[]> => {
    try {
      const list = await request<Collection[]>("/api/collections");
      setCollections(list);
      // keep the open and target collections pointing at collections that still exist
      const ids = new Set(list.map((item) => item.id));
      const first = list[0]?.id ?? null;
      const { openCollection, targetCollection } = live.current.prefs;
      const change: Partial<Prefs> = {};
      if (!openCollection || !ids.has(openCollection)) change.openCollection = first;
      if (!targetCollection || !ids.has(targetCollection)) change.targetCollection = first;
      if (Object.keys(change).length) setPrefs(change);
      return list;
    } catch (reason) {
      fail(reason, "Could not load your collections.");
      return live.current.collections ?? [];
    }
  }, [fail, setPrefs]);

  const reloadCompletion = useCallback(async () => {
    const id = live.current.prefs.openCollection;
    if (!id) {
      setCompletion(null);
      return;
    }
    try {
      setCompletion(await request<CompletionReport>(`/api/collections/${encodeURIComponent(id)}/completion`));
    } catch (reason) {
      fail(reason, "Could not load the set completion.");
    }
  }, [fail]);

  const reloadCollection = useCallback(async () => {
    const id = live.current.prefs.openCollection;
    if (!id) {
      setCollection([]);
      return;
    }
    try {
      setCollection(await request<CollectionEntry[]>(`/api/collections/${encodeURIComponent(id)}/cards`));
    } catch (reason) {
      fail(reason, "Could not load the collection.");
    }
  }, [fail]);

  const currencyQuery = () => `currency=${live.current.prefs.currency}`;

  const reloadCollectionStats = useCallback(async () => {
    const id = live.current.prefs.openCollection;
    if (!id) return setCollectionStats(null);
    try {
      setCollectionStats(await request<Stats>(`/api/collections/${encodeURIComponent(id)}/stats?${currencyQuery()}`));
    } catch (reason) {
      fail(reason, "Could not load the statistics.");
    }
  }, [fail]);

  const reloadDeckInsights = useCallback(async () => {
    const current = live.current.deck;
    if (!current) {
      setDeckStats(null);
      setOwnership(null);
      return;
    }
    const base = `/api/decks/${encodeURIComponent(current.id)}`;
    try {
      const [stats, owned] = await Promise.all([request<Stats>(`${base}/stats?${currencyQuery()}`), request<Ownership>(`${base}/ownership?${currencyQuery()}`)]);
      setDeckStats(stats);
      setOwnership(owned);
    } catch (reason) {
      fail(reason, "Could not check the deck.");
    }
  }, [fail]);

  const reloadTradeList = useCallback(async () => {
    try {
      setTradeList(await request<TradeEntry[]>("/api/trade"));
    } catch (reason) {
      fail(reason, "Could not load the trade list.");
    }
  }, [fail]);

  const reloadDecks = useCallback(async () => {
    try {
      setDecks(await request<Deck[]>("/api/decks"));
    } catch (reason) {
      fail(reason, "Could not load the decks.");
    }
  }, [fail]);

  const loadDeck = useCallback(async (id: string) => request<DeckDetail>(`/api/decks/${encodeURIComponent(id)}`), []);

  const openDeck = useCallback(async (id: string, quiet = false) => {
    try {
      const detail = await loadDeck(id);
      setDeck(detail);
      setPrefs({ lastDeckId: id });
      if (!quiet) flash(`${detail.name} opened`);
    } catch (reason) {
      if (!quiet) fail(reason, "Could not open the deck.");
      else setPrefs({ lastDeckId: null });
    }
  }, [loadDeck, setPrefs, flash, fail]);

  const reloadDeck = useCallback(async () => {
    const current = live.current.deck;
    if (!current) return;
    try {
      setDeck(await loadDeck(current.id));
    } catch (reason) {
      fail(reason, "Could not reload the deck.");
    }
  }, [loadDeck, fail]);

  const reloadCardDetail = useCallback(async (printingId?: string) => {
    const id = printingId ?? live.current.selection?.printingId;
    if (!id) {
      setCardDetail(null);
      return;
    }
    try {
      setCardDetail(await request<CardDetail>(`/api/cards/${encodeURIComponent(id)}`));
    } catch {
      setCardDetail(null);
    }
  }, []);

  const select = useCallback((next: Selection) => {
    setSelection(next);
    if (next) void reloadCardDetail(next.printingId);
    else setCardDetail(null);
  }, [reloadCardDetail]);

  useEffect(() => {
    void reloadDecks();
    if (initialPrefs.lastDeckId) void openDeck(initialPrefs.lastDeckId, true);
    // first load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reloadCollections();
  }, [reloadCollections]);

  // switching collections empties the list and the picked rows, then loads the new one
  useEffect(() => {
    setCollection(null);
    setCompletion(null);
    setCollectionStats(null);
    setFacets({});
    setBinderPage(0);
    setChecked(new Set());
    anchor.current = null;
  }, [prefs.openCollection]);

  useEffect(() => {
    if (view === "collection" && collectionTab === "stats") void reloadCollectionStats();
  }, [view, collectionTab, prefs.openCollection, prefs.currency, reloadCollectionStats]);

  useEffect(() => {
    if (view === "deck") void reloadDeckInsights();
  }, [view, deck?.id, prefs.currency, reloadDeckInsights]);

  useEffect(() => {
    if (view === "trade") void reloadTradeList();
  }, [view, reloadTradeList]);

  useEffect(() => {
    if (view === "collection" && collection === null) void reloadCollection();
  }, [view, collection, reloadCollection, prefs.openCollection]);

  useEffect(() => {
    if (view === "collection" && (collectionTab === "completion" || collectionTab === "missing")) void reloadCompletion();
  }, [view, collectionTab, prefs.openCollection, reloadCompletion]);

  // ---------- search ----------
  const setFilters = useCallback((change: Partial<Filters>) => setFiltersState((current) => ({ ...current, ...change })), []);
  const filtersActive = Object.values(filters).some((value) => value !== "");

  useEffect(() => {
    if (view !== "cards") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      const params = new URLSearchParams({ q: filters.query });
      if (filters.type.trim()) params.set("type", filters.type.trim());
      if (filters.set.trim()) params.set("set", filters.set.trim());
      if (filters.color) params.set("color", filters.color);
      if (filters.rarity) params.set("rarity", filters.rarity);
      if (filters.format) params.set("format", filters.format);
      if (filters.mvMin) params.set("mvMin", filters.mvMin);
      if (filters.mvMax) params.set("mvMax", filters.mvMax);
      try {
        setCards(await request<Card[]>(`/api/cards?${params}`, { signal: controller.signal }));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setCards([]);
          setSearchError(message(reason, "The search failed."));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [view, filters]);

  // ---------- card database status ----------
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let pending = false;
    let again = false;
    const refresh = async () => {
      if (pending) {
        again = true;
        return;
      }
      pending = true;
      let delay = 60_000;
      try {
        const status = await request<CatalogStatus>("/api/catalog/status");
        if (!active) return;
        const previous = previousUpdate.current;
        if (previous?.isUpdating && !status.update.isUpdating) {
          if (status.update.lastError) flash(`Card database update failed: ${status.update.lastError}`, "err");
          else flash(`Card database updated with ${(status.update.lastImportedCount ?? status.printingCount).toLocaleString()} printings`);
        }
        previousUpdate.current = status.update;
        setCatalog(status);
        if (status.update.isUpdating) delay = 2_000;
      } catch {
        // the status bar keeps its last known value
      } finally {
        pending = false;
        if (active) {
          if (again) {
            again = false;
            delay = 0;
          }
          timer = window.setTimeout(() => { void refresh(); }, delay);
        }
      }
    };
    catalogPoll.current = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (pending) again = true;
      else void refresh();
    };
    void refresh();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      catalogPoll.current = null;
    };
  }, [flash]);

  const updateCatalog = useCallback(async () => {
    setCatalogRequestPending(true);
    try {
      const result = await request<{ update: CatalogStatus["update"] }>("/api/catalog/update", { method: "POST", body: "{}" });
      previousUpdate.current = result.update;
      setCatalog((current) => (current ? { ...current, update: result.update } : current));
      flash("Card database update started");
      catalogPoll.current?.();
    } catch (reason) {
      fail(reason, "Could not start the card database update.");
    } finally {
      setCatalogRequestPending(false);
    }
  }, [flash, fail]);

  // ---------- undo and redo ----------
  const pushUndo = useCallback((entry: UndoEntry) => {
    stacks.current = { undo: [...stacks.current.undo.slice(-(UNDO_LIMIT - 1)), entry], redo: [] };
    bumpStacks();
  }, [bumpStacks]);

  const clearUndo = useCallback(() => {
    stacks.current = { undo: [], redo: [] };
    bumpStacks();
  }, [bumpStacks]);

  const refreshAfterChange = useCallback(async () => {
    await Promise.all([
      live.current.collection !== null ? reloadCollection() : Promise.resolve(),
      live.current.completion !== null ? reloadCompletion() : Promise.resolve(),
      reloadCollections(),
      reloadDeck(),
      reloadDecks(),
      reloadCardDetail(),
      live.current.collectionStats !== null ? reloadCollectionStats() : Promise.resolve(),
      live.current.view === "deck" ? reloadDeckInsights() : Promise.resolve(),
      live.current.tradeList !== null ? reloadTradeList() : Promise.resolve(),
    ]);
  }, [reloadCollection, reloadCompletion, reloadCollections, reloadDeck, reloadDecks, reloadCardDetail, reloadCollectionStats, reloadDeckInsights, reloadTradeList]);

  /** Undo and redo run one at a time, in the order they were pressed. */
  const step = useCallback((direction: "undo" | "redo") => {
    undoQueue.current = undoQueue.current.then(async () => {
      const from = direction === "undo" ? stacks.current.undo : stacks.current.redo;
      const entry = from[from.length - 1];
      if (!entry) return;
      try {
        await (direction === "undo" ? entry.undo() : entry.redo());
        stacks.current = direction === "undo"
          ? { undo: stacks.current.undo.slice(0, -1), redo: [...stacks.current.redo, entry] }
          : { undo: [...stacks.current.undo, entry], redo: stacks.current.redo.slice(0, -1) };
        bumpStacks();
        await refreshAfterChange();
        flash(`${direction === "undo" ? "Undone" : "Redone"}: ${entry.label}`);
      } catch (reason) {
        await refreshAfterChange();
        fail(reason, direction === "undo" ? "Could not undo that change." : "Could not redo that change.");
      }
    });
  }, [bumpStacks, refreshAfterChange, flash, fail]);

  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);
  const undoStack = stacks.current.undo;
  const redoStack = stacks.current.redo;

  // ---------- collection ----------
  /** Sets exact counts in a collection; a count of 0 removes the entry. */
  const setCounts = useCallback(async (collectionId: string, items: Counts) => {
    if (!items.length) return;
    await request(`/api/collections/${encodeURIComponent(collectionId)}/cards`, { method: "PUT", body: JSON.stringify({ items }) });
  }, []);

  const collectionName = useCallback((id: string | null) => live.current.collections?.find((item) => item.id === id)?.name ?? "the collection", []);

  const addToCollection = useCallback(async (cardId: string, name: string, collectionId?: string, foilOverride?: boolean) => {
    const target = collectionId ?? prefs.targetCollection;
    if (!target) {
      flash("Create a collection first (Collection menu, New collection)", "err");
      return;
    }
    const foil = foilOverride ?? prefs.foil;
    const key = { cardId, foil: (foil ? 1 : 0) as FinishCode, condition: "NM" as const, language: "en" };
    try {
      const entry = await request<CollectionEntry>(`/api/collections/${encodeURIComponent(target)}/cards`, {
        method: "POST", body: JSON.stringify({ ...key, quantity: 1 }),
      });
      const after = entry.quantity;
      const where = collectionName(target);
      pushUndo({
        label: `Add ${name}${foil ? " (foil)" : ""}`,
        undo: () => setCounts(target, [{ ...key, quantity: after - 1 }]),
        redo: () => setCounts(target, [{ ...key, quantity: after }]),
      });
      flash(`${name}${foil ? " (foil)" : ""} added to ${where}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not add the card.");
    }
  }, [prefs.foil, prefs.targetCollection, pushUndo, setCounts, collectionName, flash, fail, refreshAfterChange]);

  const setCollectionQuantity = useCallback(async (entry: CollectionEntry, quantity: number) => {
    const target = live.current.prefs.openCollection;
    if (!target) return;
    const key = copyKey(entry);
    const from = entry.quantity;
    const to = Math.max(0, Math.min(10000, quantity));
    if (from === to) return;
    try {
      await setCounts(target, [{ ...key, quantity: to }]);
      const label = to === 0 ? `Remove ${entry.name}` : `${entry.name} quantity ${to}`;
      pushUndo({
        label,
        undo: () => setCounts(target, [{ ...key, quantity: from, trade: entry.trade }]),
        redo: () => setCounts(target, [{ ...key, quantity: to }]),
      });
      if (to === 0) flash(`${entry.name} removed from ${collectionName(target)}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not update the collection.");
    }
  }, [setCounts, collectionName, pushUndo, flash, fail, refreshAfterChange]);

  // ---------- decks ----------
  const writeDeck = useCallback(async (key: DeckKey, to: number) => {
    const detail = await loadDeck(key.deckId);
    const entry = detail.cards.find((card) => card.oracle_id === key.oracle_id && card.printing_id === key.printing_id && card.zone === key.zone);
    const base = `/api/decks/${encodeURIComponent(key.deckId)}/cards`;
    if (entry) {
      if (entry.quantity === to) return;
      await request(`${base}/${encodeURIComponent(entry.oracle_id)}?zone=${entry.zone}&entryId=${entry.entry_id}`, {
        method: "PATCH", body: JSON.stringify({ quantity: Math.max(0, to), zone: entry.zone }),
      });
    } else if (to > 0) {
      await request(base, { method: "POST", body: JSON.stringify({ cardId: key.card_id, quantity: to, zone: key.zone }) });
    }
  }, [loadDeck]);

  const keyOf = (detail: DeckDetail, card: DeckCard, zone: Zone = card.zone): DeckKey => ({
    deckId: detail.id, oracle_id: card.oracle_id, printing_id: card.printing_id, card_id: card.card_id, zone,
  });

  const addToDeck = useCallback(async (cardId: string, name: string) => {
    const current = live.current.deck;
    if (!current) {
      flash("Open or create a deck first (Deck menu, Open deck or New deck)", "err");
      return;
    }
    const zone = prefs.zone;
    try {
      const card = await request<CardDetail>(`/api/cards/${encodeURIComponent(cardId)}`);
      await request(`/api/decks/${encodeURIComponent(current.id)}/cards`, { method: "POST", body: JSON.stringify({ cardId, quantity: 1, zone }) });
      const key: DeckKey = {
        deckId: current.id, oracle_id: card.oracle_id ?? "", printing_id: current.mode === "theme" ? cardId : null, card_id: cardId, zone,
      };
      const detail = await loadDeck(current.id);
      const after = detail.cards.find((item) => item.oracle_id === key.oracle_id && item.printing_id === key.printing_id && item.zone === zone)?.quantity ?? 1;
      const zoneLabel = zone === "main" ? "" : ` (${zone})`;
      pushUndo({ label: `Add ${name} to ${current.name}`, undo: () => writeDeck(key, after - 1), redo: () => writeDeck(key, after) });
      flash(`${name} added to ${current.name}${zoneLabel}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not add the card to the deck.");
    }
  }, [prefs.zone, loadDeck, writeDeck, pushUndo, flash, fail, refreshAfterChange]);

  const setDeckQuantity = useCallback(async (card: DeckCard, quantity: number) => {
    const current = live.current.deck;
    if (!current) return;
    const from = card.quantity;
    const to = Math.max(0, Math.min(100, quantity));
    if (from === to) return;
    const key = keyOf(current, card);
    try {
      await writeDeck(key, to);
      pushUndo({ label: to === 0 ? `Remove ${card.name}` : `${card.name} quantity ${to}`, undo: () => writeDeck(key, from), redo: () => writeDeck(key, to) });
      if (to === 0) flash(`${card.name} removed from ${current.name}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not update the deck.");
    }
  }, [writeDeck, pushUndo, flash, fail, refreshAfterChange]);

  const moveDeckCard = useCallback(async (card: DeckCard, zone: Zone) => {
    const current = live.current.deck;
    if (!current || card.zone === zone) return;
    const source = keyOf(current, card);
    const target = keyOf(current, card, zone);
    const before = current.cards.find((item) => item.oracle_id === card.oracle_id && item.printing_id === card.printing_id && item.zone === zone)?.quantity ?? 0;
    try {
      await request(`/api/decks/${encodeURIComponent(current.id)}/cards/${encodeURIComponent(card.oracle_id)}?zone=${card.zone}&entryId=${card.entry_id}`, {
        method: "PATCH", body: JSON.stringify({ quantity: card.quantity, zone }),
      });
      pushUndo({
        label: `Move ${card.name} to ${zone}`,
        undo: async () => { await writeDeck(target, before); await writeDeck(source, card.quantity); },
        redo: async () => { await writeDeck(source, 0); await writeDeck(target, before + card.quantity); },
      });
      flash(`${card.name} moved to ${zone === "main" ? "main deck" : zone}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not move the card.");
    }
  }, [writeDeck, pushUndo, flash, fail, refreshAfterChange]);

  const createDeck = useCallback(async (name: string, format: string, mode: DeckMode) => {
    const created = await request<Deck>("/api/decks", { method: "POST", body: JSON.stringify({ name, format, mode }) });
    await openDeck(created.id, true);
    await reloadDecks();
    flash(`${created.name} created`);
  }, [openDeck, reloadDecks, flash]);

  // ---------- imports, exports and backups ----------
  const showReview = useCallback((title: string, report: ImportReport, done: boolean) => {
    setReview({ title, report, done });
    if (report.unmatched.length) showPanel("review");
  }, [showPanel]);

  const previewDialog = (
    title: string, fileName: string, report: ImportReport, onImport: (into: string) => Promise<void>,
    into?: { label: string; value: string; options: Array<[string, string]> },
  ) => {
    dialog(title, into ? [["into", into.label, into.value, "select", into.options]] : [], async (values) => {
      if (report.matchedRows === 0) return false;
      await onImport(String(values.into ?? ""));
    }, "Import matched rows", (
      <div className="dlgtext">
        <p><b>{fileName}</b></p>
        <p>{report.matchedRows} matched rows ({report.importedQuantity} cards) will be added. {report.unmatched.length} rows will be skipped.</p>
        {report.unmatched.length > 0 && (
          <div className="msglist">
            {report.unmatched.slice(0, 8).map((item) => (
              <div className="msg" key={`${item.row}-${item.name}`}><span className="lv w">Row {item.row}</span><span>{item.name ? `${item.name}: ` : ""}{item.reason}</span></div>
            ))}
          </div>
        )}
        {report.unmatched.length > 8 && <p className="note">The Import review panel lists all {report.unmatched.length} skipped rows.</p>}
        {report.matchedRows === 0 && <p className="note err">No rows matched the card database, so there is nothing to import.</p>}
      </div>
    ), 520);
  };

  const importCollection = useCallback(async () => {
    const list = live.current.collections ?? [];
    if (!list.length) return flash("Create a collection first (Collection menu, New collection)", "err");
    const file = await pickFile(".csv,text/csv");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return flash("The CSV file must be 5 MB or smaller", "err");
    try {
      const content = await file.text();
      const preferred = live.current.prefs.openCollection ?? list[0]!.id;
      const report = await request<ImportReport>(`/api/collections/${encodeURIComponent(preferred)}/import/preview`, {
        method: "POST", headers: { "content-type": "text/csv" }, body: content,
      });
      showReview(`Collection import preview: ${file.name}`, report, false);
      previewDialog("Import collection CSV", file.name, report, async (into) => {
        try {
          const result = await request<ImportReport>(`/api/collections/${encodeURIComponent(into)}/import`, {
            method: "POST", headers: { "content-type": "text/csv" }, body: content,
          });
          showReview(`Collection import into ${collectionName(into)}: ${file.name}`, result, true);
          flash(`Imported ${result.importedQuantity} cards from ${result.matchedRows} rows into ${collectionName(into)}`);
          await refreshAfterChange();
        } catch (reason) {
          fail(reason, "Could not import the collection CSV.");
        }
      }, { label: "Into collection", value: preferred, options: list.map((item) => [item.id, item.name]) });
    } catch (reason) {
      fail(reason, "Could not read the collection CSV.");
    }
  }, [flash, fail, showReview, refreshAfterChange, collectionName]);

  const exportCollection = useCallback(async () => {
    try {
      const id = live.current.prefs.openCollection;
      if (!id) return flash("Create a collection first (Collection menu, New collection)", "err");
      const entries = await request<CollectionEntry[]>(`/api/collections/${encodeURIComponent(id)}/cards`);
      if (!entries.length) return flash(`${collectionName(id)} is empty, so there is nothing to export`, "err");
      const rows = [
        ["Count", "Tradelist Count", "Name", "Edition", "Condition", "Language", "Foil", "Tags", "Last Modified", "Collector Number", "Alter", "Proxy", "Purchase Price"],
        ...entries.map((entry) => [entry.quantity, entry.trade, entry.name, entry.set_code, MOXFIELD_CONDITIONS[entry.condition] ?? conditionName(entry.condition),
          languageName(entry.language), entry.foil === 2 ? "etched" : entry.foil === 1 ? "foil" : "", "", "", entry.collector_number, "", "", ""]),
      ];
      downloadText(`${slugify(collectionName(id))}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
      flash(`${collectionName(id)} exported`);
    } catch (reason) {
      fail(reason, "Could not export the collection.");
    }
  }, [flash, fail, collectionName]);

  const downloadBackup = useCallback(async () => {
    try {
      const response = await fetch("/api/backup", { credentials: "same-origin" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) throw new Error(`The backup failed (${response.status}).`);
      downloadBlob("mana-vault-backup.json", await response.blob());
      flash("Backup downloaded");
    } catch (reason) {
      fail(reason, "Could not download the backup.");
    }
  }, [flash, fail]);

  const restoreBackup = useCallback(async () => {
    const file = await pickFile(".json,application/json");
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return flash("The backup file must be 25 MB or smaller", "err");
    try {
      const content = await file.text();
      const headers = { "content-type": "application/vnd.mana-vault.backup+json" };
      const summary = await request<BackupSummary>("/api/backup/validate", { method: "POST", headers, body: content });
      const ok = await confirmDialog("Restore backup", (
        <>
          Replace all of your own collections and decks with this backup from {new Date(summary.createdAt).toLocaleString()}?
          It holds {summary.collectionCount} collections with {summary.collectionEntryCount} entries, {summary.deckCount} decks with {summary.deckCardCount} deck
          cards, and {summary.printingCount} card printings. Collections and decks shared with you by others are not changed, and the full card database is
          not changed. A restore cannot be undone.
        </>
      ), "Restore backup");
      if (!ok) return;
      await request("/api/backup/restore", { method: "POST", headers, body: content });
      clearUndo();
      setDeck(null);
      setPrefs({ lastDeckId: null });
      setReview(null);
      setCollection(null);
      await Promise.all([reloadCollections(), reloadDecks()]);
      catalogPoll.current?.();
      flash("Backup restored");
    } catch (reason) {
      fail(reason, "Could not restore the backup.");
    }
  }, [flash, fail, reloadCollections, reloadDecks, setPrefs, clearUndo]);

  const importDeck = useCallback(async () => {
    const current = live.current.deck;
    if (!current) return flash("Open or create a deck first (Deck menu, Open deck or New deck)", "err");
    const file = await pickFile(".txt,.csv,text/plain,text/csv");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return flash("The decklist file must be 5 MB or smaller", "err");
    try {
      const contentType = file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "text/plain";
      const content = await file.text();
      const base = `/api/decks/${encodeURIComponent(current.id)}/import`;
      const report = await request<ImportReport>(`${base}/preview`, { method: "POST", headers: { "content-type": contentType }, body: content });
      showReview(`Decklist preview for ${current.name}: ${file.name}`, report, false);
      previewDialog(`Import decklist into ${current.name}`, file.name, report, async () => {
        try {
          const result = await request<ImportReport>(base, { method: "POST", headers: { "content-type": contentType }, body: content });
          showReview(`Decklist import into ${current.name}: ${file.name}`, result, true);
          flash(`Imported ${result.importedQuantity} cards from ${result.matchedRows} rows`);
          await refreshAfterChange();
        } catch (reason) {
          fail(reason, "Could not import the decklist.");
        }
      });
    } catch (reason) {
      fail(reason, "Could not read the decklist.");
    }
  }, [flash, fail, showReview, refreshAfterChange]);

  const exportDeckText = useCallback(() => {
    const current = live.current.deck;
    if (!current) return flash("Open a deck first", "err");
    if (!current.cards.length) return flash(`${current.name} is empty, so there is nothing to export`, "err");
    const lines = [`# ${current.name}`, ""];
    for (const [zone, label] of [["commander", "Commander"], ["main", "Mainboard"], ["sideboard", "Sideboard"]] as const) {
      const inZone = current.cards.filter((card) => card.zone === zone);
      if (!inZone.length) continue;
      lines.push(`// ${label}`);
      for (const card of inZone) {
        const printing = current.mode === "theme" ? ` (${card.set_code.toUpperCase()}) ${card.collector_number}` : "";
        lines.push(`${card.quantity} ${card.name}${printing}`);
      }
      lines.push("");
    }
    downloadText(`${slugify(current.name)}.txt`, lines.join("\r\n"), "text/plain;charset=utf-8");
    flash(`${current.name} exported as text`);
  }, [flash]);

  const exportDeckCsv = useCallback(() => {
    const current = live.current.deck;
    if (!current) return flash("Open a deck first", "err");
    if (!current.cards.length) return flash(`${current.name} is empty, so there is nothing to export`, "err");
    const rows = [
      ["Name", "Quantity", "Set Code", "Collector Number", "Zone", "Mode"],
      ...current.cards.map((card) => [
        card.name, card.quantity, current.mode === "theme" ? card.set_code : "", current.mode === "theme" ? card.collector_number : "", card.zone, current.mode,
      ]),
    ];
    downloadText(`${slugify(current.name)}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    flash(`${current.name} exported as CSV`);
  }, [flash]);

  // ---------- workspaces ----------
  const applyWorkspace = useCallback((name: string) => {
    const workspace: Workspace | undefined = PRESETS[name]?.() ?? prefs.workspaces[name];
    if (!workspace) return;
    setPrefs({ layout: clone(workspace.layout), workspace: name });
    setView(workspace.view);
    flash(`${name} workspace`);
  }, [prefs.workspaces, setPrefs, setView, flash]);

  const saveWorkspace = useCallback((name: string) => {
    const workspaceView = view === "about" ? lastView : view;
    setPrefs((current) => ({ workspaces: { ...current.workspaces, [name]: { layout: clone(current.layout), view: workspaceView } }, workspace: name }));
    flash(`Workspace ${name} saved`);
  }, [view, lastView, setPrefs, flash]);

  const deleteWorkspace = useCallback((name: string) => {
    setPrefs((current) => {
      const workspaces = { ...current.workspaces };
      delete workspaces[name];
      return { workspaces };
    });
    flash(`Workspace ${name} deleted`);
  }, [setPrefs, flash]);

  // ---------- selection helpers for the keyboard ----------
  const visibleCollection = useMemo(() => {
    const term = collectionFilter.trim().toLowerCase();
    const currency = prefs.currency;
    const shown = (collection ?? []).filter((entry) =>
      (!term || `${entry.name} ${entry.set_name} ${entry.set_code}`.toLowerCase().includes(term)) &&
      (!facets.rarity || entry.rarity === facets.rarity) &&
      (!facets.color || colorKey(entry.colors) === facets.color) &&
      (!facets.type || cardTypes(entry.type_line).includes(facets.type)) &&
      (!facets.set || entry.set_code === facets.set) &&
      (!facets.curve || curveKey(entry.mana_value, entry.type_line) === facets.curve) &&
      (!facets.finish || String(entry.foil) === facets.finish) &&
      (!facets.trade || entry.trade > 0));
    const price = (entry: CollectionEntry) => priceOf(entry, entry.foil, currency);
    const byName = (a: CollectionEntry, b: CollectionEntry) => a.name.localeCompare(b.name) || a.set_code.localeCompare(b.set_code);
    const sorts: Record<string, (a: CollectionEntry, b: CollectionEntry) => number> = {
      name: () => 0,
      "price-desc": (a, b) => (price(b) ?? -1) - (price(a) ?? -1) || byName(a, b),
      "price-asc": (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity) || byName(a, b),
      quantity: (a, b) => b.quantity - a.quantity || byName(a, b),
      set: (a, b) => a.set_name.localeCompare(b.set_name) || a.collector_number.localeCompare(b.collector_number, undefined, { numeric: true }) || byName(a, b),
    };
    return prefs.collectionSort === "name" ? shown : [...shown].sort(sorts[prefs.collectionSort]);
  }, [collection, collectionFilter, facets, prefs.currency, prefs.collectionSort]);

  const setFacet = useCallback((change: Facets) => {
    setFacets((current) => {
      const next: Facets = { ...current, ...change };
      for (const key of Object.keys(next) as Array<keyof Facets>) if (next[key] === undefined || next[key] === false) delete next[key];
      return next;
    });
    setBinderPage(0);
  }, []);

  // ---------- trade calculator ----------
  const addTradeLine = useCallback((side: TradeSide, line: Omit<TradeLine, "id" | "quantity">) => {
    setTrade((current) => {
      const same = current[side].find((item) => item.cardId === line.cardId && item.foil === line.foil && item.from === line.from);
      const lines = same
        ? current[side].map((item) => (item === same ? { ...item, quantity: item.quantity + 1 } : item))
        : [...current[side], { ...line, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, quantity: 1 }];
      return { ...current, [side]: lines };
    });
    flash(`${line.name} added to ${side === "give" ? "what you give" : "what you get"}`);
  }, [flash]);

  const setTradeQuantity = useCallback((side: TradeSide, id: string, quantity: number) => {
    setTrade((current) => ({
      ...current,
      [side]: quantity <= 0 ? current[side].filter((item) => item.id !== id) : current[side].map((item) => (item.id === id ? { ...item, quantity: Math.min(999, quantity) } : item)),
    }));
  }, []);

  const tradeTotal = useCallback((side: TradeSide) => trade[side].reduce((sum, line) => sum + (priceOf(line.prices, line.foil, prefs.currency) ?? 0) * line.quantity, 0),
    [trade, prefs.currency]);

  const clearTrade = useCallback(() => {
    setTrade({ give: [], get: [] });
    flash("Trade cleared");
  }, [flash]);

  const copyTradeSummary = useCallback(async () => {
    const currency = live.current.prefs.currency;
    if (!trade.give.length && !trade.get.length) return flash("Add cards to the trade first", "err");
    const lines = (side: TradeSide) => trade[side].map((line) => {
      const finish = line.foil === 2 ? " (etched)" : line.foil === 1 ? " (foil)" : "";
      return `${line.quantity} ${line.name} (${line.set_code.toUpperCase()}) ${line.collector_number}${finish}: ${money((priceOf(line.prices, line.foil, currency) ?? 0) * line.quantity, currency)}`;
    });
    const give = tradeTotal("give");
    const get = tradeTotal("get");
    const text = [
      `You give (${money(give, currency)})`, ...lines("give"), "",
      `You get (${money(get, currency)})`, ...lines("get"), "",
      `Difference: ${money(Math.abs(get - give), currency)} ${get >= give ? "in your favor" : "in their favor"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      flash("Trade summary copied");
    } catch {
      flash("Could not copy to the clipboard", "err");
    }
  }, [trade, tradeTotal, flash]);

  const giveEntry = useCallback((entry: CollectionEntry, from?: string) => {
    addTradeLine("give", {
      cardId: entry.id, name: entry.name, set_code: entry.set_code, collector_number: entry.collector_number, foil: entry.foil, prices: entry,
      from: from ?? collectionName(live.current.prefs.openCollection),
    });
  }, [addTradeLine, collectionName]);

  const getCard = useCallback(async (cardId: string) => {
    try {
      const card = await request<CardDetail>(`/api/cards/${encodeURIComponent(cardId)}`);
      addTradeLine("get", {
        cardId, name: card.name, set_code: card.set_code, collector_number: card.collector_number, foil: live.current.prefs.foil ? 1 : 0, prices: pricesOf(card),
      });
    } catch (reason) {
      fail(reason, "Could not add the card to the trade.");
    }
  }, [addTradeLine, fail]);

  const library = useLibraryState({
    userId: user.id, live, currency: () => live.current.prefs.currency, flash, fail, setPrefs, pushUndo, clearUndo, setCounts, refreshAfterChange, reloadCollections, reloadDecks,
    openDeck, closeDeck: () => { setDeck(null); setPrefs({ lastDeckId: null }); }, collectionName, checked, setChecked, visibleCollection,
  });

  /** Clicking a collection row: plain click picks it, Ctrl adds or removes it, Shift picks a range. */
  const pickRow = useCallback((entry: CollectionEntry, modifiers: { ctrl: boolean; shift: boolean }) => {
    const key = entryKey(entry);
    library.pick(key, modifiers.shift ? "range" : modifiers.ctrl || selectMode ? "toggle" : "only");
    select({ view: "collection", key, printingId: entry.id });
  }, [library, select, selectMode]);

  const listItems = useCallback((): Array<NonNullable<Selection>> => {
    if (view === "cards") return cards.map((card) => ({ view: "cards", key: card.id, printingId: card.id }));
    if (view === "collection") return visibleCollection.map((entry) => ({ view: "collection", key: entryKey(entry), printingId: entry.id }));
    if (view === "deck" && deck) return sortDeck(deck.cards).map((card) => ({ view: "deck", key: String(card.entry_id), printingId: card.card_id }));
    return [];
  }, [view, cards, visibleCollection, deck]);

  const moveSelection = useCallback((step: number) => {
    const items = listItems();
    if (!items.length) return;
    const index = items.findIndex((item) => selection && item.key === selection.key && item.view === selection.view);
    const next = items[Math.max(0, Math.min(items.length - 1, index < 0 ? 0 : index + step))];
    if (next) {
      select(next);
      if (next.view === "collection") library.pick(next.key, "only");
      window.setTimeout(() => document.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: "nearest" }), 0);
    }
  }, [listItems, selection, select, library]);

  /** The selected row's printing and name, known at once without waiting for the card details to load. */
  const selectedCard = useMemo((): { id: string; name: string } | null => {
    if (!selection) return null;
    const name = selection.view === "cards" ? cards.find((card) => card.id === selection.key)?.name
      : selection.view === "collection" ? collection?.find((entry) => entryKey(entry) === selection.key)?.name
        : deck?.cards.find((card) => String(card.entry_id) === selection.key)?.name;
    const fallback = cardDetail?.id === selection.printingId ? cardDetail.name : undefined;
    const resolved = name ?? fallback;
    return resolved ? { id: selection.printingId, name: resolved } : null;
  }, [selection, cards, collection, deck, cardDetail]);

  return {
    user, prefs, setPrefs, setLayout, showPanel, focusPanel,
    view, setView, lastView, aboutSlug, openAbout, closeAbout,
    filters, setFilters, filtersActive, cards, loading, searchError, searchInput,
    collection, visibleCollection, collectionFilter, setCollectionFilter, reloadCollection, facets, setFacet, binderPage, setBinderPage,
    collectionStats, deckTab, setDeckTab, deckStats, ownership, tradeList, reloadTradeList,
    trade, addTradeLine, setTradeQuantity, tradeTotal, clearTrade, copyTradeSummary, giveEntry, getCard,
    collections, reloadCollections, collectionName, collectionTab, setCollectionTab, completion, reloadCompletion,
    checked, setChecked, pickRow, selectMode, setSelectMode, ...library,
    decks, deck, openDeck, reloadDecks, createDeck,
    selection, select, cardDetail, selectedCard, moveSelection,
    catalog, catalogRequestPending, updateCatalog,
    review, setReview,
    flashMsg, flash, fail,
    undoStack, redoStack, undo, redo,
    addToCollection, setCollectionQuantity, addToDeck, setDeckQuantity, moveDeckCard,
    importCollection, exportCollection, downloadBackup, restoreBackup, importDeck, exportDeckText, exportDeckCsv,
    applyWorkspace, saveWorkspace, deleteWorkspace,
    scannerOpen, setScannerOpen,
  };
}

/** The condition names Moxfield uses in its CSV files. */
const MOXFIELD_CONDITIONS: Record<string, string> = {
  M: "Mint", NM: "Near Mint", LP: "Lightly Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Damaged",
};

const ZONE_ORDER: Record<Zone, number> = { commander: 0, main: 1, sideboard: 2 };
export function sortDeck(cards: DeckCard[]): DeckCard[] {
  return [...cards].sort((a, b) => ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone] || a.name.localeCompare(b.name));
}

export const zoneLabel = (zone: Zone) => (zone === "main" ? "Main deck" : capitalize(zone));

export type Store = ReturnType<typeof useStoreState>;
export const StoreContext = createContext<Store | null>(null);
export function useApp(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("The app state is not ready");
  return store;
}
