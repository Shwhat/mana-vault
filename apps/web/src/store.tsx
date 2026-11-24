// ---------- state: the one place that holds the app's data and changes it ----------
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { asUndo, csvCell, downloadBlob, fetchFile, downloadText, pickFile, request, slugify } from "./api";
import { confirmDialog, dialog } from "./components/Dialog";
import { activatePanel, clone, type Layout, openPanel, type PanelId, PRESETS, type Workspace } from "./dock";
import { type Counts, entryKey, useLibraryState, type WishChange } from "./library-state";
import { useScanState } from "./scan-state";
import { askWishlists, type WishAsk } from "./components/WishlistAsk";
import { useTradeState } from "./trade-state";
import { useProxyState } from "./proxy-state";
import { isApp } from "./android/platform";
import { applyTheme, type Prefs, savePrefs } from "./prefs";
import { forcePasswordChange } from "./views/AdminView";
import {
  type BackupSummary, type Candidate, type Card, type CardDetail, type CatalogStatus, type Collection, type CollectionEntry, type CollectionTab,
  type CompletionReport, type CopyKey, type Deck, type DeckCard, type DeckTab, type Facets, type FinishCode, type Ownership, type PriceFields, type Stats,
  ALL_COLLECTIONS, type CollectionLayout, type DeckDetail, EMPTY_FILTERS, type Filters, type ImportReport, type TradeEntry, type User, type View, type Zone, capitalize,
  cardTypes, colorKey, copyKey, copyPrice, curveKey, money, priceOf, pricesOf,
} from "./types";
import { candidateLabel } from "./components/LibraryDialogs";
import { type Finish, parseQuickAdd } from "./deck-rules";
import { usePhone } from "./narrow";
import { resetTab } from "./kept";
import { useCardSearch } from "./card-search";
import { emptyScopes, type FilterScope, filtersOn, matchesFilters, useServerMatch } from "./filters";

export type Selection = { view: "cards" | "collection" | "deck"; key: string; printingId: string } | null;
export type Flash = { text: string; kind: "ok" | "err"; id: number } | null;
type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };
export type Review = { title: string; report: ImportReport; done: boolean } | null;
/** A right-click or long-press menu: where it opens and its commands. */
export type ContextMenu = { x: number; y: number; title: string; items: Array<{ label: string; run: () => void }> } | null;
type DeckKey = { deckId: string; oracle_id: string; printing_id: string | null; card_id: string; zone: Zone; finish: FinishCode };

const UNDO_LIMIT = 150;

const message = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

const RARITY_RANK = ["common", "uncommon", "rare", "mythic", "special", "bonus"];
const COLOR_RANK = "WUBRGMC";
const colorRank = (colors: string | null | undefined) => (!colors ? "C" : colors.length > 1 ? "M" : colors);

export function useStoreState(user: User, initialPrefs: Prefs) {
  const [prefs, setPrefsState] = useState(initialPrefs);
  const phone = usePhone();
  const [view, setViewState] = useState<View>(() => {
    if (window.location.pathname.startsWith("/about")) return "about";
    // phones open on Home
    if (isApp() || window.innerWidth < 900) return "home";
    return PRESETS[initialPrefs.workspace]?.().view ?? initialPrefs.workspaces[initialPrefs.workspace]?.view ?? "cards";
  });
  const [lastView, setLastView] = useState<Exclude<View, "about">>("cards");
  const [adminTab, setAdminTab] = useState("accounts");
  const [adminReturn, setAdminReturn] = useState<View>("cards");
  const [aboutSlug, setAboutSlug] = useState(() => window.location.pathname.replace(/^\/about\/?/, ""));
  // each view keeps its own filters: card search, the open collection, the deck, the deck's Add tab and the two trade searches
  const [filterSets, setFilterSets] = useState<Record<FilterScope, Filters>>(emptyScopes);
  const filters = filterSets.cards;
  const [tradeSide, setTradeSide] = useState<"tradeGive" | "tradeGet">("tradeGet");
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
  // the card page shows over the view it was opened from (0.21.0: each tab keeps its own card page)
  const [cardPages, setCardPages] = useState<Record<string, string | null>>({});
  const shownView = useRef(view);
  shownView.current = view;
  const cardPage = cardPages[view] ?? null;
  const setCardPage = useCallback((id: string | null) => setCardPages((pages) => (pages[shownView.current] === id ? pages : { ...pages, [shownView.current]: id })), []);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const catalogPoll = useRef<(() => void) | null>(null);
  const previousUpdate = useRef<CatalogStatus["update"] | null>(null);
  const live = useRef({ deck, collection, selection, prefs, collections, view, collectionTab, completion, collectionStats, deckStats, ownership, tradeList, deckTab, filterScope: "cards" as FilterScope });
  live.current = { deck, collection, selection, prefs, collections, view, collectionTab, completion, collectionStats, deckStats, ownership, tradeList, deckTab, filterScope: live.current?.filterScope ?? "cards" };

  // ---------- preferences and layout ----------
  /** Takes preferences changed on another device (0.18.0) without sending them back. */
  const adoptPrefs = useCallback((change: Partial<Prefs>) => setPrefsState((current) => ({ ...current, ...change })), []);
  const setPrefs = useCallback((change: Partial<Prefs> | ((current: Prefs) => Partial<Prefs>)) => {
    setPrefsState((current) => {
      const delta = typeof change === "function" ? change(current) : change;
      const next = { ...current, ...delta };
      savePrefs(next, "lastDeckId" in delta || "openCollection" in delta || "targetCollection" in delta || "addTo" in delta || "recent" in delta);
      return next;
    });
  }, []);

  useEffect(() => applyTheme(prefs.theme), [prefs.theme]);

  // ---------- server: its name, first-run setup and picture downloads ----------
  const [serverName, setServerName] = useState("");
  const [pictureProgress, setPictureProgress] = useState<{ done: number; total: number; paused: boolean } | null>(null);
  useEffect(() => {
    void request<{ serverName?: string }>("/api/config").then((config) => setServerName(config.serverName ?? "")).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (user.mustChange) {
      forcePasswordChange();
      return;
    }
    if (!user.admin || isApp()) return;
    void request<{ settings: { setupDone: boolean } }>("/api/admin/overview").then((overview) => {
      if (!overview.settings.setupDone) {
        setViewState((current) => {
          if (current !== "admin" && current !== "about") setAdminReturn(current);
          return "admin";
        });
        setAdminTab("setup");
      }
    }).catch(() => undefined);
    let stopped = false;
    const poll = () => {
      void request<{ status: { running: boolean; paused: boolean; done: number; total: number } }>("/api/admin/pictures").then((summary) => {
        if (stopped) return;
        const status = summary.status;
        setPictureProgress(status.running || (status.paused && status.total > status.done) ? { done: status.done, total: status.total, paused: status.paused } : null);
      }).catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [user.admin, user.mustChange]);

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
    // each tab keeps its card page and what it was showing (0.21.0)
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

  /**
   * A tab's button (0.21.0): another tab opens where it was left; the tab already shown goes back to its first screen
   * (its card page closes and what it was showing is cleared).
   */
  const pressTab = useCallback((next: View) => {
    if (next === shownView.current) {
      setCardPages((pages) => ({ ...pages, [next]: null }));
      resetTab(next);
      return;
    }
    setView(next);
  }, [setView]);

  /** Administration replaces the work area; closing it goes back to where it was opened from. */
  const openAdmin = useCallback((tab = "accounts") => {
    setViewState((current) => {
      if (current !== "admin" && current !== "about") setAdminReturn(current);
      return "admin";
    });
    setAdminTab(tab);
    if (window.location.pathname.startsWith("/about")) window.history.pushState(null, "", "/");
  }, []);
  const closeAdmin = useCallback(() => setViewState(adminReturn), [adminReturn]);

  /** Going anywhere else closes the About guide, so it never hides what was opened. */
  const leaveAbout = useCallback(() => {
    setViewState((current) => {
      if (current !== "about") return current;
      if (window.location.pathname.startsWith("/about")) window.history.pushState(null, "", "/");
      return lastView;
    });
  }, [lastView]);

  /** Remembers when a collection or deck was opened, for the switcher's Recently opened order. */
  const markRecent = useCallback((id: string) => {
    setPrefs((current) => ({ recent: Object.fromEntries([[id, Date.now()], ...Object.entries(current.recent).filter(([key]) => key !== id)].slice(0, 300)) }));
  }, [setPrefs]);

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
      if (!openCollection || (openCollection !== ALL_COLLECTIONS && !ids.has(openCollection))) change.openCollection = first;
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
    if (!id || id === ALL_COLLECTIONS) {
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
      setCollection(await request<CollectionEntry[]>(id === ALL_COLLECTIONS
        ? `/api/library/cards${live.current.prefs.allWishlists ? "?wishlists=1" : ""}`
        : `/api/collections/${encodeURIComponent(id)}/cards`));
    } catch (reason) {
      fail(reason, "Could not load the collection.");
    }
  }, [fail]);

  const currencyQuery = () => `currency=${live.current.prefs.currency}`;

  const reloadCollectionStats = useCallback(async () => {
    const id = live.current.prefs.openCollection;
    if (!id || id === ALL_COLLECTIONS) return setCollectionStats(null);
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
      // a deck opened from the Decks panel or a switcher is where new cards go
      setPrefs(quiet ? { lastDeckId: id } : { lastDeckId: id, addTo: "deck" });
      if (!quiet) {
        markRecent(id);
        leaveAbout();
        flash(`${detail.name} opened`);
      }
    } catch (reason) {
      if (!quiet) fail(reason, "Could not open the deck.");
      else setPrefs({ lastDeckId: null });
    }
  }, [loadDeck, setPrefs, flash, fail, markRecent, leaveAbout]);

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
    if (next) leaveAbout();
    setSelection(next);
    if (next) void reloadCardDetail(next.printingId);
    else setCardDetail(null);
  }, [reloadCardDetail, leaveAbout]);

  useEffect(() => {
    void reloadDecks();
    if (initialPrefs.lastDeckId) void openDeck(initialPrefs.lastDeckId, true);
    // first load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reloadCollections();
  }, [reloadCollections]);

  // switching collections empties the list and the picked rows, then loads the new one; filters, tags and the filter box stay
  useEffect(() => {
    setCollection(null);
    setCompletion(null);
    setCollectionStats(null);
    setBinderPage(0);
    setChecked(new Set());
    anchor.current = null;
  }, [prefs.openCollection, prefs.allWishlists]);

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

  // ---------- search and filters ----------
  const filterScope: FilterScope = view === "collection" ? "collection"
    : view === "deck" ? (deckTab === "add" ? "deckAdd" : "deck")
      : view === "trade" ? tradeSide : "cards";
  const scopeFilters = filterSets[filterScope];
  live.current.filterScope = filterScope;
  /** Changes the filters of one view, by default the open one. */
  const setScopeFilters = useCallback((change: Partial<Filters>, scope?: FilterScope) => {
    setFilterSets((current) => {
      const key = scope ?? live.current.filterScope;
      return { ...current, [key]: { ...current[key], ...change } };
    });
  }, []);
  const setFilters = useCallback((change: Partial<Filters>) => setScopeFilters(change, "cards"), [setScopeFilters]);
  const clearFilters = useCallback((scope?: FilterScope) => setScopeFilters({ ...EMPTY_FILTERS }, scope), [setScopeFilters]);
  const filtersActive = filtersOn(scopeFilters);
  const search = useCardSearch(filters, view === "cards", { group: !prefs.searchAllPrintings, currency: prefs.currency, sort: prefs.searchSort.cards });
  // the owned counts of every open search: card search, the deck's Add tab and the trade searches register here
  type OwnedHook = (id: string, change: number, finish?: FinishCode, oracleId?: string | null) => void;
  const ownedHooks = useRef(new Set<OwnedHook>());
  const ownedRef = useRef<OwnedHook>((id, change, finish, oracleId) => { for (const hook of ownedHooks.current) hook(id, change, finish, oracleId); });
  useEffect(() => {
    const hook = search.owned;
    ownedHooks.current.add(hook);
    return () => { ownedHooks.current.delete(hook); };
  }, [search.owned]);
  const { cards, loading, error: searchError } = search;

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
          else {
            const skipped = status.skipped?.count ?? 0;
            const changes = status.migrations && (status.migrations.merged || status.migrations.removed)
              ? `, ${status.migrations.merged} printings merged, ${status.migrations.removed} removed` : "";
            flash(`Card database updated with ${(status.update.lastImportedCount ?? status.printingCount).toLocaleString()} printings${skipped ? `, ${skipped.toLocaleString()} skipped` : ""}${changes}`);
          }
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
        await asUndo(direction, () => (direction === "undo" ? entry.undo() : entry.redo()));
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

  const collectionName = useCallback((id: string | null) => (id === ALL_COLLECTIONS ? "All collections"
    : live.current.collections?.find((item) => item.id === id)?.name ?? "the collection"), []);

  /** Puts wishlist rows back as they were before (or after) cards were added, for undo and redo. */
  const restoreWishes = useCallback(async (changes: WishChange[], side: "before" | "after") => {
    for (const change of changes) await setCounts(change.collectionId, [change[side]]);
  }, [setCounts]);

  const addToDeckRef = useRef<(cardId: string, name: string, chosen?: Candidate | null, options?: { quantity?: number; zone?: Zone; finish?: Finish }) => Promise<void>>(async () => {});
  const addToCollection = useCallback(async (cardId: string, name: string, collectionId?: string, foilOverride?: boolean | FinishCode, proxy = false) => {
    // a finish code (0 regular, 1 foil, 2 etched) or true for foil; without one, Add as foil decides
    const code: FinishCode = foilOverride === undefined ? (live.current.prefs.foil ? 1 : 0) : foilOverride === true ? 1 : foilOverride === false ? 0 : foilOverride;
    // with a deck selected last, the add commands put cards into that deck
    if (!collectionId && !proxy && live.current.prefs.addTo === "deck" && live.current.deck) {
      await addToDeckRef.current(cardId, name, undefined, { zone: live.current.prefs.zone, finish: code === 2 ? "etched" : code === 1 ? "foil" : "" });
      return;
    }
    const target = collectionId ?? prefs.targetCollection;
    if (!target) {
      flash("Create a collection first", "err");
      return;
    }
    const key = { cardId, foil: code, condition: "NM" as const, language: "en", proxy };
    const finishText = code === 2 ? " (etched)" : code === 1 ? " (foil)" : "";
    try {
      const entry = await request<CollectionEntry & { wishlist?: WishChange[]; wishAsk?: WishAsk[] }>(`/api/collections/${encodeURIComponent(target)}/cards`, {
        method: "POST", body: JSON.stringify({ ...key, quantity: 1 }),
      });
      const after = entry.quantity;
      const where = collectionName(target);
      const wishes = entry.wishlist ?? [];
      // the owned count on search results follows real copies added to a collection
      const owns = !proxy && live.current.collections?.find((item) => item.id === target)?.kind !== "wishlist";
      const count = (change: number) => { if (owns) ownedRef.current(cardId, change, code, entry.oracle_id); };
      count(1);
      pushUndo({
        label: `Add ${name}${finishText}${proxy ? " (proxy)" : ""}`,
        undo: async () => { await setCounts(target, [{ ...key, quantity: after - 1 }]); await restoreWishes(wishes, "before"); count(-1); },
        redo: async () => { await setCounts(target, [{ ...key, quantity: after }]); await restoreWishes(wishes, "after"); count(1); },
      });
      flash(`${name}${finishText}${proxy ? " (proxy)" : ""} added to ${where}`);
      askWishlists(entry.wishAsk);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not add the card.");
    }
  }, [prefs.foil, prefs.targetCollection, pushUndo, setCounts, restoreWishes, collectionName, flash, fail, refreshAfterChange]);

  const setCollectionQuantity = useCallback(async (entry: CollectionEntry, quantity: number) => {
    const target = entry.collection_id ?? live.current.prefs.openCollection;
    if (!target || target === ALL_COLLECTIONS) return;
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
    const entry = detail.cards.find((card) => card.oracle_id === key.oracle_id && card.printing_id === key.printing_id && card.zone === key.zone && (card.finish ?? 0) === key.finish);
    const base = `/api/decks/${encodeURIComponent(key.deckId)}/cards`;
    if (entry) {
      if (entry.quantity === to) return;
      await request(`${base}/${encodeURIComponent(entry.oracle_id)}?zone=${entry.zone}&entryId=${entry.entry_id}`, {
        method: "PATCH", body: JSON.stringify({ quantity: Math.max(0, to), zone: entry.zone }),
      });
    } else if (to > 0) {
      await request(base, { method: "POST", body: JSON.stringify({ cardId: key.card_id, quantity: to, zone: key.zone, finish: key.finish }) });
    }
  }, [loadDeck]);

  /** Brings a deck back to an earlier state: card counts first, then the copies linked to each card. Used by undo and redo. */
  const restoreDeck = useCallback(async (_from: DeckDetail, to: DeckDetail) => {
    const now = await loadDeck(to.id);
    const same = (a: DeckCard, b: DeckCard) => a.card_id === b.card_id && a.zone === b.zone && (a.finish ?? 0) === (b.finish ?? 0);
    const key = (card: DeckCard): DeckKey => ({ deckId: to.id, oracle_id: card.oracle_id, printing_id: card.printing_id, card_id: card.card_id, zone: card.zone, finish: card.finish ?? 0 });
    for (const card of now.cards) if (!to.cards.some((other) => same(card, other))) await writeDeck(key(card), 0);
    for (const card of to.cards) await writeDeck(key(card), card.quantity);
    const settled = await loadDeck(to.id);
    const linkText = (card?: DeckCard) => JSON.stringify((card?.links ?? []).map((link) => [link.collectionId, link.cardId, link.foil, link.condition, link.language, !!link.proxy, link.quantity]));
    for (const card of to.cards) {
      const entry = settled.cards.find((other) => same(card, other));
      if (!entry) continue;
      if (linkText(entry) !== linkText(card)) {
        await request(`/api/decks/${encodeURIComponent(to.id)}/entries/${entry.entry_id}/links`, { method: "PUT", body: JSON.stringify({ links: card.links ?? [] }) });
      }
      if (JSON.stringify(entry.tags ?? []) !== JSON.stringify(card.tags ?? [])) {
        await request(`/api/decks/${encodeURIComponent(to.id)}/entries/${entry.entry_id}/tags`, { method: "PUT", body: JSON.stringify({ tags: card.tags ?? [] }) });
      }
      if ((entry.want_card_id ?? null) !== (card.want_card_id ?? null) || (entry.want_finish ?? 0) !== (card.want_finish ?? 0)) {
        await request(`/api/decks/${encodeURIComponent(to.id)}/entries/${entry.entry_id}/upgrade`, {
          method: "PUT", body: JSON.stringify({ cardId: card.want_card_id ?? null, finish: card.want_finish ?? 0 }),
        });
      }
    }
  }, [loadDeck, writeDeck]);

  const keyOf = (detail: DeckDetail, card: DeckCard, zone: Zone = card.zone): DeckKey => ({
    deckId: detail.id, oracle_id: card.oracle_id, printing_id: card.printing_id, card_id: card.card_id, zone, finish: card.finish ?? 0,
  });

  /** Free copies of a card in the account's collections that could fill a deck card. */
  const loadCandidates = useCallback(async (cardId: string, entryId?: number): Promise<Candidate[]> => {
    const current = live.current.deck;
    if (!current) return [];
    return request<Candidate[]>(`/api/decks/${encodeURIComponent(current.id)}/candidates?cardId=${encodeURIComponent(cardId)}${entryId && entryId > 0 ? `&entryId=${entryId}` : ""}`);
  }, []);

  /**
   * Adds a printing to the open deck. A free copy in one collection is linked at once; when copies are in more than
   * one collection the person picks one; with none the card is missing.
   */
  const addToDeck = useCallback(async (cardId: string, name: string, chosen?: Candidate | null, options?: { quantity?: number; zone?: Zone; finish?: Finish }) => {
    const current = live.current.deck;
    if (!current) {
      flash("Open or create a deck first", "err");
      return;
    }
    const zone = options?.zone ?? prefs.zone;
    const quantity = Math.max(1, Math.min(100, options?.quantity ?? 1));
    let link: Candidate | null = chosen ?? null;
    if (chosen === undefined) {
      try {
        const finishCode = options?.finish === "etched" ? 2 : options?.finish === "foil" ? 1 : 0;
        // only copies of exactly this printing and finish fill the new cards; without them the cards are missing
        const candidates = (await loadCandidates(cardId)).filter((item) => item.cardId === cardId && item.foil === finishCode);
        const places = new Set(candidates.map((item) => item.collectionId));
        if (places.size > 1) {
          dialog(`Add ${name} to ${current.name}`, [
            ["copy", "Use the copy in", "0", "select", [...candidates.map((item, index): [string, string] => [String(index), candidateLabel(item)]), ["", "None (missing)"]]],
          ], async (values) => { await addToDeck(cardId, name, values.copy === "" ? null : candidates[Number(values.copy)] ?? null, options); }, "Add");
          return;
        }
        link = candidates[0] ?? null;
      } catch {
        link = null;
      }
    }
    // maybeboard cards are only being considered, so no copy is linked to them
    if (zone === "maybeboard") link = null;
    try {
      const before = await loadDeck(current.id);
      const links = link ? [{ ...link, quantity: Math.min(quantity, link.free) }] : undefined;
      // a card added as foil or etched (a *F* or *E* line, or Add as foil) keeps that finish in the deck
      await request(`/api/decks/${encodeURIComponent(current.id)}/cards`, { method: "POST", body: JSON.stringify({ cardId, quantity, zone, links, finish: options?.finish || undefined }) });
      const after = await loadDeck(current.id);
      const zoneLabel = zone === "main" ? "" : ` (${zone})`;
      const count = quantity > 1 ? `${quantity} ` : "";
      pushUndo({ label: `Add ${count}${name} to ${current.name}`, undo: () => restoreDeck(after, before), redo: () => restoreDeck(before, after) });
      flash(`${count}${name} added to ${current.name}${zoneLabel}${link ? `, from ${link.collectionName}` : ""}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not add the card to the deck.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.zone, loadDeck, loadCandidates, pushUndo, flash, fail, refreshAfterChange]);

  // the add commands reach addToDeck through a ref, since addToCollection is made before it
  addToDeckRef.current = addToDeck;

  /** Replaces the copies linked to a deck card. */
  const setDeckLinks = useCallback(async (card: DeckCard, links: Array<CopyKey & { collectionId: string; quantity: number }>) => {
    const current = live.current.deck;
    if (!current) return;
    try {
      const before = await loadDeck(current.id);
      await request(`/api/decks/${encodeURIComponent(current.id)}/entries/${card.entry_id}/links`, { method: "PUT", body: JSON.stringify({ links }) });
      const after = await loadDeck(current.id);
      pushUndo({ label: `Link ${card.name}`, undo: () => restoreDeck(after, before), redo: () => restoreDeck(before, after) });
      flash(links.length ? `${card.name} linked to ${links.map((link) => collectionName(link.collectionId)).join(", ")}` : `${card.name} is now missing`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not link the copies.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDeck, pushUndo, collectionName, flash, fail, refreshAfterChange]);

  /** Links free copies of the exact printing and finish to every card the open deck is missing, as one undo step. */
  const linkOwnedCopies = useCallback(async () => {
    const current = live.current.deck;
    if (!current) return;
    try {
      const before = await loadDeck(current.id);
      const { linked } = await request<{ linked: number }>(`/api/decks/${encodeURIComponent(current.id)}/link-owned`, { method: "POST" });
      if (!linked) {
        flash("No free copies of the missing cards' exact printings are in your collections", "err");
        return;
      }
      const after = await loadDeck(current.id);
      pushUndo({ label: `Link owned copies to ${current.name}`, undo: () => restoreDeck(after, before), redo: () => restoreDeck(before, after) });
      flash(`${linked} owned ${linked === 1 ? "copy" : "copies"} linked to ${current.name}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not link the owned copies.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDeck, pushUndo, flash, fail, refreshAfterChange]);

  /** Marks a deck card Upgrade wanted with the version wanted, or removes the mark (null). */
  const markUpgrade = useCallback(async (card: DeckCard, wanted: { id: string; set_code: string; collector_number: string } | null, finish: FinishCode = 0) => {
    const current = live.current.deck;
    if (!current) return;
    const send = (cardId: string | null, code: FinishCode) => request(`/api/decks/${encodeURIComponent(current.id)}/entries/${card.entry_id}/upgrade`, {
      method: "PUT", body: JSON.stringify({ cardId, finish: code }),
    });
    try {
      await send(wanted?.id ?? null, finish);
      const was: [string | null, FinishCode] = [card.want_card_id ?? null, card.want_finish ?? 0];
      pushUndo({
        label: wanted ? `Mark ${card.name} as upgrade wanted` : `Remove the upgrade wanted mark of ${card.name}`,
        undo: async () => { await send(was[0], was[1]); }, redo: async () => { await send(wanted?.id ?? null, finish); },
      });
      const finishWord = finish === 2 ? " etched" : finish === 1 ? " foil" : "";
      flash(wanted ? `${card.name} marked Upgrade wanted: (${wanted.set_code.toUpperCase()}) ${wanted.collector_number}${finishWord}` : `${card.name} is no longer marked Upgrade wanted`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not change the upgrade wanted mark.");
    }
  }, [pushUndo, flash, fail, refreshAfterChange]);

  /**
   * Changes the printing of a deck card. Free copies of the new printing are linked: from the one collection that has
   * them, or the collection the person picks when several do. Without free copies the card is missing.
   */
  const changeDeckPrinting = useCallback(async (card: DeckCard, to: { id: string; set_code: string; collector_number: string }, finish: FinishCode = card.finish ?? 0,
    collectionId?: string, count: number = card.quantity) => {
    const current = live.current.deck;
    if (!current || (to.id === card.card_id && finish === (card.finish ?? 0))) return;
    const changing = Math.max(1, Math.min(card.quantity, count));
    let candidates: Candidate[] = [];
    if (card.zone !== "maybeboard") {
      try {
        // free copies of the new printing in the chosen finish fill the card
        candidates = (await loadCandidates(to.id, card.entry_id)).filter((item) => item.cardId === to.id && item.foil === finish);
      } catch {
        candidates = [];
      }
    }
    const places = [...new Map(candidates.map((item) => [item.collectionId, item.collectionName])).entries()];
    if (collectionId === undefined && places.length > 1) {
      dialog(`Change printing of ${card.name}`, [
        ["place", "Link copies from", places[0]![0], "select", [...places.map(([id, name]): [string, string] => {
          const free = candidates.filter((item) => item.collectionId === id).reduce((sum, item) => sum + item.free, 0);
          return [id, `${name} (${free} free)`];
        }), ["", "None (missing)"]]],
      ], async (values) => { await changeDeckPrinting(card, to, finish, String(values.place), changing); }, "Change");
      return;
    }
    const place = collectionId ?? places[0]?.[0] ?? "";
    const links: Array<CopyKey & { collectionId: string; quantity: number }> = [];
    let wanted = changing;
    for (const item of candidates.filter((candidate) => candidate.collectionId === place)) {
      if (wanted <= 0) break;
      const take = Math.min(wanted, item.free);
      links.push({ collectionId: item.collectionId, cardId: item.cardId, foil: item.foil, condition: item.condition, language: item.language, proxy: item.proxy, quantity: take });
      wanted -= take;
    }
    try {
      const before = await loadDeck(current.id);
      const result = await request<{ linked: number }>(`/api/decks/${encodeURIComponent(current.id)}/entries/${card.entry_id}/printing`, {
        method: "PUT", body: JSON.stringify({ cardId: to.id, links, finish, quantity: changing }),
      });
      const after = await loadDeck(current.id);
      pushUndo({ label: `Change printing of ${card.name}`, undo: () => restoreDeck(after, before), redo: () => restoreDeck(before, after) });
      const missing = card.zone === "maybeboard" ? 0 : changing - result.linked;
      const finishWord = finish === 2 ? " etched" : finish === 1 ? " foil" : "";
      const part = changing < card.quantity ? `${changing} of ${card.quantity} ` : "";
      flash(`${part ? `${part}${card.name} changed to` : `${card.name} is now`} (${to.set_code.toUpperCase()}) ${to.collector_number}${finishWord}${result.linked ? `, linked from ${collectionName(place)}` : ""}${missing > 0 ? `, ${missing} missing` : ""}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not change the printing.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDeck, loadCandidates, pushUndo, collectionName, flash, fail, refreshAfterChange]);

  /**
   * After printing: adds the printed cards as proxies, as one undo step. To a collection, as proxy copies. To a deck, as proxy
   * copies in the collection chosen for them, linked to the deck's missing cards (cards the deck does not have are added).
   */
  const addPrintedAsProxies = useCallback(async (cards: Array<{ cardId: string; name: string; count: number }>, target: { kind: "collection" | "deck"; id: string; collectionId?: string }) => {
    const collectionId = target.kind === "collection" ? target.id : target.collectionId;
    if (!collectionId || !cards.length) return;
    const items = cards.map((card) => ({ cardId: card.cardId, foil: 0 as FinishCode, condition: "NM" as const, language: "en", proxy: true, quantity: Math.min(10_000, card.count) }));
    try {
      const deckBefore = target.kind === "deck" ? await loadDeck(target.id) : null;
      const added = await request<{ before: Counts; after: Counts }>(`/api/collections/${encodeURIComponent(collectionId)}/cards/add`, { method: "POST", body: JSON.stringify({ items }) });
      if (target.kind === "deck") {
        for (const card of cards) {
          let left = card.count;
          const detail = await loadDeck(target.id);
          const entry = detail.cards.find((item) => item.card_id === card.cardId && item.zone !== "maybeboard" && (item.missing ?? 0) > 0);
          const proxyLink = (quantity: number) => ({ collectionId, cardId: card.cardId, foil: 0, condition: "NM", language: "en", proxy: true, quantity });
          if (entry) {
            const take = Math.min(left, entry.missing ?? 0);
            await request(`/api/decks/${encodeURIComponent(target.id)}/entries/${entry.entry_id}/links`, {
              method: "PUT", body: JSON.stringify({ links: [...(entry.links ?? []), proxyLink(take)] }),
            });
            left -= take;
          }
          if (left > 0) {
            await request(`/api/decks/${encodeURIComponent(target.id)}/cards`, { method: "POST", body: JSON.stringify({ cardId: card.cardId, quantity: Math.min(100, left), zone: "main", links: [proxyLink(Math.min(100, left))] }) });
          }
        }
      }
      const deckAfter = target.kind === "deck" ? await loadDeck(target.id) : null;
      const total = cards.reduce((sum, card) => sum + card.count, 0);
      const where = target.kind === "deck" ? decks.find((deck) => deck.id === target.id)?.name ?? "the deck" : collectionName(collectionId);
      pushUndo({
        label: `Add ${total} printed proxies to ${where}`,
        undo: async () => { if (deckBefore && deckAfter) await restoreDeck(deckAfter, deckBefore); await setCounts(collectionId, added.before); },
        redo: async () => { await setCounts(collectionId, added.after); if (deckBefore && deckAfter) await restoreDeck(deckBefore, deckAfter); },
      });
      flash(`${total} printed ${total === 1 ? "proxy" : "proxies"} added to ${where}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not add the printed proxies.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDeck, pushUndo, setCounts, collectionName, decks, flash, fail, refreshAfterChange]);

  /**
   * Add deck to collection: new copies of the deck's cards in their printing and finish go into a collection and are
   * linked to the cards the deck is missing. "missing" adds only missing cards; "all" adds every card. One undo step.
   */
  const addDeckToCollection = useCallback(async (deckId: string, collectionId: string, mode: "missing" | "all") => {
    try {
      const before = await loadDeck(deckId);
      const result = await request<{ added: number; linked: number; before: Counts; after: Counts; wishlist?: WishChange[]; wishAsk?: WishAsk[] }>(
        `/api/decks/${encodeURIComponent(deckId)}/add-to-collection`, { method: "POST", body: JSON.stringify({ collectionId, mode }) });
      const where = collectionName(collectionId);
      if (!result.added) {
        flash(mode === "missing" ? "The deck is not missing any cards" : "Nothing was added");
        return;
      }
      const after = await loadDeck(deckId);
      pushUndo({
        label: `Add ${result.added} deck cards to ${where}`,
        undo: async () => { await restoreDeck(after, before); await setCounts(collectionId, result.before); await restoreWishes(result.wishlist ?? [], "before"); },
        redo: async () => { await setCounts(collectionId, result.after); await restoreWishes(result.wishlist ?? [], "after"); await restoreDeck(before, after); },
      });
      askWishlists(result.wishAsk);
      flash(`${result.added} ${result.added === 1 ? "card" : "cards"} added to ${where}${result.linked ? `, ${result.linked} linked to the deck` : ""}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not add the deck to the collection.");
    }
  }, [loadDeck, pushUndo, restoreDeck, setCounts, restoreWishes, collectionName, flash, fail, refreshAfterChange]);

  const setDeckQuantity = useCallback(async (card: DeckCard, quantity: number) => {
    const current = live.current.deck;
    if (!current) return;
    const from = card.quantity;
    const to = Math.max(0, Math.min(100, quantity));
    if (from === to) return;
    const key = keyOf(current, card);
    try {
      // undo brings back the copies that were linked as well as the count
      const before = await loadDeck(current.id);
      await writeDeck(key, to);
      const after = await loadDeck(current.id);
      pushUndo({ label: to === 0 ? `Remove ${card.name}` : `${card.name} quantity ${to}`, undo: () => restoreDeck(after, before), redo: () => restoreDeck(before, after) });
      if (to === 0) flash(`${card.name} removed from ${current.name}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not update the deck.");
    }
  }, [writeDeck, loadDeck, restoreDeck, pushUndo, flash, fail, refreshAfterChange]);

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

  /** Saves a deck card's tags. */
  const setDeckTags = useCallback(async (card: DeckCard, tags: string[]) => {
    const current = live.current.deck;
    if (!current) return;
    const base = `/api/decks/${encodeURIComponent(current.id)}/entries/${card.entry_id}/tags`;
    const from = card.tags ?? [];
    try {
      await request(base, { method: "PUT", body: JSON.stringify({ tags }) });
      pushUndo({
        label: `Tags of ${card.name}`,
        undo: async () => { await request(base, { method: "PUT", body: JSON.stringify({ tags: from }) }); },
        redo: async () => { await request(base, { method: "PUT", body: JSON.stringify({ tags }) }); },
      });
      flash(tags.length ? `${card.name} tagged ${tags.join(", ")}` : `Tags removed from ${card.name}`);
      await reloadDeck();
    } catch (reason) {
      fail(reason, "Could not save the tags.");
    }
  }, [pushUndo, flash, fail, reloadDeck]);

  /** Changes the open deck's format, description or cover card. */
  const updateDeckInfo = useCallback(async (change: { format?: string; description?: string; coverCardId?: string | null }, done: string) => {
    const current = live.current.deck;
    if (!current) return false;
    try {
      await request(`/api/decks/${encodeURIComponent(current.id)}`, { method: "PATCH", body: JSON.stringify(change) });
      flash(done);
      await Promise.all([reloadDeck(), reloadDecks()]);
      return true;
    } catch (reason) {
      fail(reason, "Could not save the deck.");
      return false;
    }
  }, [flash, fail, reloadDeck, reloadDecks]);

  /** Quick add: "2 Sol Ring" adds two Sol Ring to the chosen zone of the open deck. */
  const quickAdd = useCallback(async (text: string, zone: Zone): Promise<boolean> => {
    const line = parseQuickAdd(text);
    if (!line) {
      flash("Type a card name, such as 2 Sol Ring", "err");
      return false;
    }
    try {
      const params = new URLSearchParams({ name: line.name, set: line.set, number: line.number });
      const found = await request<{ id: string; name: string }>(`/api/cards/resolve?${params}`);
      await addToDeck(found.id, found.name, undefined, { quantity: line.quantity, zone, finish: line.finish });
      return true;
    } catch (reason) {
      fail(reason, "Could not find the card.");
      return false;
    }
  }, [addToDeck, flash, fail]);

  /** Makes the open deck match a deck list typed as text, as one undo step. */
  const replaceDeckText = useCallback(async (text: string) => {
    const current = live.current.deck;
    if (!current) return;
    try {
      const before = await loadDeck(current.id);
      const report = await request<{ added: number; removed: number; changed: number; linked?: number }>(`/api/decks/${encodeURIComponent(current.id)}/replace`, {
        method: "POST", body: JSON.stringify({ text }),
      });
      const after = await loadDeck(current.id);
      pushUndo({ label: `Edit ${current.name} as text`, undo: () => restoreDeck(after, before), redo: () => restoreDeck(before, after) });
      flash(`${current.name} updated: ${report.added} added, ${report.changed} changed, ${report.removed} removed${report.linked ? `, ${report.linked} linked to owned copies` : ""}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not apply the deck list.");
    }
  }, [loadDeck, pushUndo, restoreDeck, flash, fail, refreshAfterChange]);

  const createDeck = useCallback(async (name: string, format: string, open = true): Promise<Deck> => {
    const created = await request<Deck>("/api/decks", { method: "POST", body: JSON.stringify({ name, format, id: crypto.randomUUID() }) });
    if (open) {
      await openDeck(created.id, true);
      markRecent(created.id);
    }
    await reloadDecks();
    flash(`${created.name} created`);
    return created;
  }, [openDeck, reloadDecks, flash, markRecent]);

  // ---------- imports, exports and backups ----------
  const showReview = useCallback((title: string, report: ImportReport, done: boolean) => {
    setReview({ title, report, done });
    if (report.unmatched.length) showPanel("review");
  }, [showPanel]);

  const downloadBackup = useCallback(async () => {
    try {
      const response = await fetchFile("/api/backup");
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
    if (file.size > 250 * 1024 * 1024) return flash("The backup file must be 250 MB or smaller", "err");
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
  // filters only the card database can answer (art, roles, artist...) come back as the matching printings
  const { ids: collectionMatch } = useServerMatch(filterSets.collection, prefs.currency);
  const visibleCollection = useMemo(() => {
    const term = collectionFilter.trim().toLowerCase();
    const currency = prefs.currency;
    const panel = filterSets.collection;
    const shown = (collection ?? []).filter((entry) =>
      (!term || `${entry.name} ${entry.set_name} ${entry.set_code} ${entry.collection_name ?? ""}`.toLowerCase().includes(term)) &&
      matchesFilters(entry, panel, collectionMatch) &&
      (!facets.rarity || entry.rarity === facets.rarity) &&
      (!facets.color || colorKey(entry.colors) === facets.color) &&
      (!facets.type || cardTypes(entry.type_line).includes(facets.type)) &&
      (!facets.set || entry.set_code === facets.set) &&
      (!facets.curve || curveKey(entry.mana_value, entry.type_line) === facets.curve) &&
      (!facets.finish || String(entry.foil) === facets.finish) &&
      (!facets.trade || entry.trade > 0) &&
      (!facets.proxy || !!entry.proxy) &&
      (!facets.inDeck || (facets.inDeck === "yes" ? !!entry.decks?.length : !entry.decks?.length)));
    const price = (entry: CollectionEntry) => copyPrice(entry, currency);
    const byName = (a: CollectionEntry, b: CollectionEntry) => a.name.localeCompare(b.name) || a.set_code.localeCompare(b.set_code);
    const sorts: Record<string, (a: CollectionEntry, b: CollectionEntry) => number> = {
      name: () => 0,
      "price-desc": (a, b) => (price(b) ?? -1) - (price(a) ?? -1) || byName(a, b),
      "price-asc": (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity) || byName(a, b),
      quantity: (a, b) => b.quantity - a.quantity || byName(a, b),
      set: (a, b) => a.set_name.localeCompare(b.set_name) || a.collector_number.localeCompare(b.collector_number, undefined, { numeric: true }) || byName(a, b),
      mana: (a, b) => (a.mana_value ?? 0) - (b.mana_value ?? 0) || byName(a, b),
      rarity: (a, b) => RARITY_RANK.indexOf(b.rarity) - RARITY_RANK.indexOf(a.rarity) || byName(a, b),
      color: (a, b) => COLOR_RANK.indexOf(colorRank(a.colors)) - COLOR_RANK.indexOf(colorRank(b.colors)) || byName(a, b),
    };
    return prefs.collectionSort === "name" ? shown : [...shown].sort(sorts[prefs.collectionSort]);
  }, [collection, collectionFilter, facets, prefs.currency, prefs.collectionSort, filterSets.collection, collectionMatch]);

  const setFacet = useCallback((change: Facets) => {
    setFacets((current) => {
      const next: Facets = { ...current, ...change };
      for (const key of Object.keys(next) as Array<keyof Facets>) if (next[key] === undefined || next[key] === false) delete next[key];
      return next;
    });
    setBinderPage(0);
  }, []);

  const library = useLibraryState({
    userId: user.id, live, currency: () => live.current.prefs.currency, flash, fail, setPrefs, pushUndo, clearUndo, setCounts, refreshAfterChange, reloadCollections, reloadDecks,
    openDeck, closeDeck: () => { setDeck(null); setPrefs({ lastDeckId: null }); }, collectionName, checked, setChecked, visibleCollection,
  });

  const trading = useTradeState({ live, flash, fail, pushUndo, refreshAfterChange, collectionName });
  const proxies = useProxyState({ flash, fail });

  const scan = useScanState({ userId: user.id, live, flash, fail, pushUndo, setCounts, loadDeck, restoreDeck, restoreWishes, refreshAfterChange });

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

  const showCardPage = useCallback((id: string | null) => {
    if (id) leaveAbout();
    setCardPage(id);
  }, [leaveAbout]);
  const openCollection = useCallback((id: string) => {
    library.openCollection(id);
    // a collection chosen in the Collections panel or a switcher is where new cards go
    setPrefs(id === ALL_COLLECTIONS ? { addTo: "collection" } : { targetCollection: id, addTo: "collection" });
    markRecent(id);
    leaveAbout();
  }, [library, markRecent, leaveAbout]);

  /** A single click on a collection or deck: it becomes where new cards go, and nothing else opens or closes. */
  const targetCollection = useCallback((id: string) => {
    if (id === ALL_COLLECTIONS) return;
    setPrefs({ targetCollection: id, addTo: "collection" });
    const name = live.current.collections?.find((item) => item.id === id)?.name;
    if (name) flash(`Adding to ${name}`);
  }, [setPrefs, flash]);
  const targetDeck = useCallback(async (id: string) => {
    if (live.current.deck?.id !== id) await openDeck(id, true);
    setPrefs({ addTo: "deck" });
    const name = decks.find((item) => item.id === id)?.name;
    if (name) flash(`Adding to ${name}`);
  }, [openDeck, setPrefs, flash, decks]);

  /** The collection layout on this device: phones and the desktop each remember their own. */
  const layout: CollectionLayout = phone ? prefs.collectionLayoutPhone : prefs.collectionLayout;
  const setCollectionLayout = useCallback((next: CollectionLayout) => {
    setPrefs(phone ? { collectionLayoutPhone: next } : { collectionLayout: next });
  }, [phone, setPrefs]);

  /** The card search layout on this device; the deck's Add tab and the trade searches use it too. */
  const searchLayout: CollectionLayout = phone ? prefs.searchLayoutPhone : prefs.searchLayout;
  const setSearchLayout = useCallback((next: CollectionLayout) => {
    setPrefs(phone ? { searchLayoutPhone: next } : { searchLayout: next });
  }, [phone, setPrefs]);

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
    user, prefs, setPrefs, adoptPrefs, setLayout, showPanel, focusPanel,
    view, setView, lastView, aboutSlug, openAbout, closeAbout, adminTab, setAdminTab, openAdmin, closeAdmin, serverName, pictureProgress,
    filters, setFilters, filtersActive, cards, loading, searchError, searchInput, search,
    ownedHooks, filterSets, filterScope, scopeFilters, setScopeFilters, clearFilters, tradeSide, setTradeSide,
    collection, visibleCollection, collectionFilter, setCollectionFilter, reloadCollection, facets, setFacet, binderPage, setBinderPage,
    collectionStats, deckTab, setDeckTab, deckStats, ownership, tradeList, reloadTradeList,
    ...trading,
    ...proxies,
    collections, reloadCollections, collectionName, collectionTab, setCollectionTab, completion, reloadCompletion,
    checked, setChecked, pickRow, selectMode, setSelectMode, ...library,
    decks, deck, openDeck, reloadDecks, createDeck, setDeckTags, updateDeckInfo, quickAdd, replaceDeckText, changeDeckPrinting, addPrintedAsProxies, addDeckToCollection, markRecent, leaveAbout,
    phone, layout, setCollectionLayout, searchLayout, setSearchLayout, allCollections: prefs.openCollection === ALL_COLLECTIONS,
    selection, select, cardDetail, selectedCard, moveSelection,
    catalog, catalogRequestPending, updateCatalog,
    review, setReview,
    flashMsg, flash, fail,
    undoStack, redoStack, undo, redo, pushUndo,
    addToCollection, setCollectionQuantity, addToDeck, setDeckQuantity, moveDeckCard, linkOwnedCopies, markUpgrade,
    showReview, downloadBackup, restoreBackup, loadCandidates, setDeckLinks, restoreDeck, loadDeck, restoreWishes,
    applyWorkspace, saveWorkspace, deleteWorkspace,
    scannerOpen, setScannerOpen, ...scan, cardPage, setCardPage: showCardPage, pressTab, contextMenu, setContextMenu, openCollection, targetCollection, targetDeck,
    refreshAfterChange,
  };
}

const ZONE_ORDER: Record<Zone, number> = { commander: 0, main: 1, sideboard: 2, maybeboard: 3 };
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
