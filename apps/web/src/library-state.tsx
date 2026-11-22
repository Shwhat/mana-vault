// ---------- library state: collections, row picking, bulk edits, decks admin and offers ----------
import { packNote } from "./purchase-state";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { csvCell, downloadText, request, slugify } from "./api";
import { choiceDialog, confirmDialog } from "./components/Dialog";
import type { Prefs } from "./prefs";
import {
  type Collection, type CollectionEntry, type CollectionKind, type CompletionReport, type CompletionRule, type CopyExtras, type CopyKey, copyKey, copyLabel,
  ALL_COLLECTIONS, type Currency, type Deck, type DeckDetail, type FinishCode, type FinishRule, type Offer, type Ownership, type Person, sameCopy,
} from "./types";

export type Counts = Array<CopyKey & { quantity: number; trade?: number; purchasePrice?: number | null; priceCurrency?: string | null; addedAt?: string | null;
  misprint?: boolean; altered?: boolean; signed?: boolean }>;
/** Wishlist rows the server lowered because the same cards were added to a collection. */
export type WishChange = { collectionId: string; collectionName: string; before: Counts[number]; after: Counts[number] };
type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };

export type CollectionInput = { name: string; description: string; completion: CompletionRule; finish: FinishRule; kind: CollectionKind; sets: string[] };
export type CopyChange = { foil: FinishCode; condition: CopyKey["condition"]; language: string; proxy: boolean; trade: number; extras?: CopyExtras };

const extrasFor = (extras: Partial<CopyExtras> | undefined) => (extras ? {
  purchasePrice: extras.purchase_price ?? null, priceCurrency: extras.price_currency ?? null, addedAt: extras.added_at ?? null,
  misprint: !!extras.misprint, altered: !!extras.altered, signed: !!extras.signed,
} : {});

export type LibraryDeps = {
  userId: number;
  live: MutableRefObject<{
    prefs: Prefs; collections: Collection[] | null; collection: CollectionEntry[] | null; deck: DeckDetail | null;
    completion: CompletionReport | null;
  }>;
  currency: () => Currency;
  flash: (text: string, kind?: "ok" | "err") => void;
  fail: (reason: unknown, fallback: string) => void;
  setPrefs: (change: Partial<Prefs>) => void;
  pushUndo: (entry: UndoEntry) => void;
  clearUndo: () => void;
  setCounts: (collectionId: string, items: Counts) => Promise<void>;
  refreshAfterChange: () => Promise<void>;
  reloadCollections: () => Promise<Collection[]>;
  reloadDecks: () => Promise<void>;
  openDeck: (id: string, quiet?: boolean) => Promise<void>;
  closeDeck: () => void;
  collectionName: (id: string | null) => string;
  checked: Set<string>;
  setChecked: (next: Set<string>) => void;
  visibleCollection: CollectionEntry[];
};

export const entryKey = (entry: Pick<CollectionEntry, "id" | "foil" | "condition" | "language" | "proxy" | "collection_id">) =>
  `${entry.collection_id ? `${entry.collection_id}/` : ""}${entry.id}:${entry.foil}:${entry.condition}:${entry.language}${entry.proxy ? ":p" : ""}`;

/** Rows grouped by the collection they belong to: their own in All collections, otherwise the open one. */
export function byCollection(entries: CollectionEntry[], open: string | null): Map<string, CollectionEntry[]> {
  const groups = new Map<string, CollectionEntry[]>();
  for (const entry of entries) {
    const id = entry.collection_id ?? open;
    if (!id || id === ALL_COLLECTIONS) continue;
    groups.set(id, [...(groups.get(id) ?? []), entry]);
  }
  return groups;
}
const sameKey = sameCopy;

export function useLibraryState(deps: LibraryDeps) {
  const { live, flash, fail, setPrefs, pushUndo, clearUndo, setCounts, refreshAfterChange, reloadCollections, reloadDecks, collectionName } = deps;
  const [offers, setOffers] = useState<{ inbox: Offer[]; sent: Offer[] }>({ inbox: [], sent: [] });
  const [users, setUsers] = useState<Person[]>([]);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // ---------- collections ----------
  const createCollection = useCallback(async (input: CollectionInput) => {
    const created = await request<Collection>("/api/collections", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), ...input }) });
    const list = await reloadCollections();
    const change: Partial<Prefs> = { openCollection: created.id };
    if (!live.current.prefs.targetCollection || list.length === 1) change.targetCollection = created.id;
    setPrefs(change);
    flash(`${created.name} created`);
    return created;
  }, [live, reloadCollections, setPrefs, flash]);

  const saveCollection = useCallback(async (id: string, input: CollectionInput) => {
    const saved = await request<Collection>(`/api/collections/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
    await refreshAfterChange();
    flash(`${saved.name} saved`);
  }, [refreshAfterChange, flash]);

  const openCollection = useCallback((id: string) => setPrefs({ openCollection: id }), [setPrefs]);

  const setTargetCollection = useCallback((id: string) => {
    setPrefs({ targetCollection: id, addTo: "collection" });
    flash(`New cards go to ${collectionName(id)}`);
  }, [setPrefs, flash, collectionName]);

  const cycleTargetCollection = useCallback(() => {
    const list = live.current.collections ?? [];
    if (!list.length) return flash("Create a collection first", "err");
    const index = list.findIndex((item) => item.id === live.current.prefs.targetCollection);
    setTargetCollection(list[(index + 1) % list.length]!.id);
  }, [live, flash, setTargetCollection]);

  const deleteCollection = useCallback(async (item: Collection) => {
    if (item.role !== "owner") {
      const ok = await confirmDialog("Leave shared collection", <>Stop using {item.name}? It stays with {item.owner.name}, who shared it with you.</>, "Leave");
      if (!ok) return;
      try {
        await request(`/api/members/collection/${encodeURIComponent(item.id)}/${depsRef.current.userId}`, { method: "DELETE" });
        clearUndo();
        await reloadCollections();
        flash(`You left ${item.name}`);
      } catch (reason) {
        fail(reason, "Could not leave the collection.");
      }
      return;
    }
    const shared = item.sharedWith.length ? ` It is shared with ${item.sharedWith.map((person) => person.name).join(", ")}, who will lose it too.` : "";
    const ok = await confirmDialog("Delete collection", (
      <>Delete {item.name} and its {item.cardCount} cards?{shared} This cannot be undone.</>
    ), "Delete collection");
    if (!ok) return;
    try {
      await request(`/api/collections/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      clearUndo();
      await reloadCollections();
      flash(`${item.name} deleted`);
    } catch (reason) {
      fail(reason, "Could not delete the collection.");
    }
  }, [live, clearUndo, reloadCollections, flash, fail]);

  // ---------- picking rows ----------
  const anchor = useRef<string | null>(null);
  /** Plain click picks one row, Ctrl adds or removes a row, Shift picks the range from the last click. */
  const pick = useCallback((key: string, mode: "only" | "toggle" | "range") => {
    const { checked, setChecked, visibleCollection } = depsRef.current;
    if (mode === "only" || (mode === "range" && !anchor.current)) {
      setChecked(new Set([key]));
      anchor.current = key;
      return;
    }
    if (mode === "toggle") {
      const next = new Set(checked);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setChecked(next);
      anchor.current = key;
      return;
    }
    const keys = visibleCollection.map(entryKey);
    const from = keys.indexOf(anchor.current!);
    const to = keys.indexOf(key);
    if (from < 0 || to < 0) {
      setChecked(new Set([key]));
      return;
    }
    setChecked(new Set(keys.slice(Math.min(from, to), Math.max(from, to) + 1)));
  }, []);

  const pickAll = useCallback(() => {
    const { visibleCollection, setChecked } = depsRef.current;
    setChecked(new Set(visibleCollection.map(entryKey)));
  }, []);

  const pickedEntries = useCallback(() => {
    const { checked } = depsRef.current;
    return (live.current.collection ?? []).filter((entry) => checked.has(entryKey(entry)));
  }, [live]);

  // removePicked offers Reduce to 1, which is made after it
  const reduceRef = useRef<(entries: CollectionEntry[]) => Promise<void>>(async () => undefined);

  const removePicked = useCallback(async () => {
    const entries = pickedEntries();
    const groups = byCollection(entries, live.current.prefs.openCollection);
    if (!groups.size || !entries.length) return flash("Pick one or more cards first", "err");
    const cards = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const name = groups.size === 1 ? collectionName([...groups.keys()][0]!) : `${groups.size} collections`;
    const label = entries.length === 1 ? copyLabel(entries[0]!) : "";
    const what = entries.length === 1 ? `${entries[0]!.name}${label ? ` (${label.toLowerCase()})` : ""} (${cards} ${cards === 1 ? "card" : "cards"})` : `${entries.length} entries (${cards} cards)`;
    // copies that came from a pack or purchase stay listed there (0.18.0): the question says so
    const note = await packNote([...groups].flatMap(([target, rows]) => rows.map((entry) => ({ collectionId: target, ...copyKey(entry) }))));
    // several copies of a card can also be lowered to one instead of removed
    const answer = await choiceDialog("Remove cards", <>Remove {what} from {name}?{note ? ` ${note}` : ""}</>, [
      ["all", "Remove all", true], ...(entries.some((entry) => entry.quantity > 1) ? [["one", "Reduce to 1"] as ["one", string]] : []),
    ]);
    if (!answer) return;
    if (answer === "one") return reduceRef.current(entries);
    const steps = [...groups].map(([target, rows]) => {
      const before: Counts = rows.map((entry) => ({ ...copyKey(entry), quantity: entry.quantity, trade: entry.trade }));
      return { target, before, after: before.map((item) => ({ ...item, quantity: 0 })) };
    });
    const run = async (which: "before" | "after") => { for (const step of steps) await setCounts(step.target, step[which]); };
    try {
      await run("after");
      pushUndo({ label: `Remove ${entries.length === 1 ? entries[0]!.name : `${entries.length} entries`}`, undo: () => run("before"), redo: () => run("after") });
      depsRef.current.setChecked(new Set());
      flash(`Removed ${what} from ${name}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not remove the cards.");
    }
  }, [live, pickedEntries, collectionName, setCounts, pushUndo, flash, fail, refreshAfterChange]);

  /** Moves copies to another collection. Without counts, every copy of each entry moves. */
  const moveEntries = useCallback(async (entries: CollectionEntry[], to: string, counts?: Map<string, number>) => {
    const groups = byCollection(entries, live.current.prefs.openCollection);
    groups.delete(to);
    if (!groups.size) return flash("Those cards are already there", "err");
    try {
      const steps: Array<{ from: string; moved: Counts }> = [];
      for (const [from, rows] of groups) {
        const items: Counts = rows.map((entry) => ({ ...copyKey(entry), quantity: counts?.get(entryKey(entry)) ?? entry.quantity }));
        const { moved } = await request<{ moved: Counts }>(`/api/collections/${encodeURIComponent(from)}/move`, { method: "POST", body: JSON.stringify({ to, items }) });
        if (moved.length) steps.push({ from, moved });
      }
      if (!steps.length) return flash("Nothing was moved", "err");
      const shift = async (back: boolean) => {
        for (const step of steps) {
          const [source, target] = back ? [to, step.from] : [step.from, to];
          await request(`/api/collections/${encodeURIComponent(source)}/move`, { method: "POST", body: JSON.stringify({ to: target, items: step.moved }) });
        }
      };
      const cards = steps.flatMap((step) => step.moved).reduce((sum, item) => sum + item.quantity, 0);
      const label = entries.length === 1 ? `Move ${entries[0]!.name}` : `Move ${entries.length} entries`;
      pushUndo({ label, undo: () => shift(true), redo: () => shift(false) });
      depsRef.current.setChecked(new Set());
      flash(`Moved ${cards} ${cards === 1 ? "card" : "cards"} to ${collectionName(to)}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not move the cards.");
    }
  }, [live, pushUndo, collectionName, flash, fail, refreshAfterChange]);

  // ---------- copy details and trade marks ----------
  /** Changes a copy's finish, condition, language or trade count. Copies that end up alike are merged into one row. */
  const editCopy = useCallback(async (entry: CollectionEntry, change: CopyChange) => {
    const target = entry.collection_id ?? live.current.prefs.openCollection;
    if (!target || target === ALL_COLLECTIONS) return;
    const from = copyKey(entry);
    const to: CopyKey = { cardId: entry.id, foil: change.foil, condition: change.condition, language: change.language, proxy: change.proxy };
    const oldExtras = extrasFor(entry);
    const newExtras = extrasFor(change.extras ?? entry);
    const extrasChanged = JSON.stringify(oldExtras) !== JSON.stringify(newExtras);
    let before: Counts;
    let after: Counts;
    if (sameKey(from, to)) {
      if (change.trade === entry.trade && !extrasChanged) return;
      before = [{ ...from, quantity: entry.quantity, trade: entry.trade, ...oldExtras }];
      after = [{ ...from, quantity: entry.quantity, trade: change.trade, ...newExtras }];
    } else {
      const existing = (live.current.collection ?? []).find((item) => item.collection_id === entry.collection_id && sameKey(copyKey(item), to));
      const quantity = Math.min(10_000, entry.quantity + (existing?.quantity ?? 0));
      before = [{ ...from, quantity: entry.quantity, trade: entry.trade, ...oldExtras }, { ...to, quantity: existing?.quantity ?? 0, trade: existing?.trade ?? 0 }];
      after = [{ ...from, quantity: 0 }, { ...to, quantity, trade: Math.min(quantity, change.trade + (existing?.trade ?? 0)), ...(existing ? {} : newExtras) }];
    }
    try {
      await setCounts(target, after);
      pushUndo({ label: `Change ${entry.name}`, undo: () => setCounts(target, before), redo: () => setCounts(target, after) });
      depsRef.current.setChecked(new Set());
      flash(`${entry.name} changed`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not change the copy.");
    }
  }, [live, setCounts, pushUndo, flash, fail, refreshAfterChange]);

  /** Changes the printing of a row's copies (a card added as the wrong printing). Deck links stay with the copies. */
  /**
   * Changes the printing or finish of `count` copies (all by default). When some of the changed copies are in decks, the
   * person chooses whether the decks change too, or keep their version and show those cards as missing.
   */
  const changeCopyPrinting = useCallback(async (entry: CollectionEntry, to: { id: string; set_code: string; collector_number: string }, finish: FinishCode = entry.foil,
    count = entry.quantity) => {
    const target = entry.collection_id ?? live.current.prefs.openCollection;
    if (!target || target === ALL_COLLECTIONS || (to.id === entry.id && finish === entry.foil)) return;
    const changing = Math.max(1, Math.min(entry.quantity, count));
    const inDecks = (entry.decks ?? []).reduce((sum, deck) => sum + deck.quantity, 0);
    const free = entry.quantity - inDecks;
    let decks: "follow" | "keep" = "follow";
    if (changing > free && inDecks > 0) {
      const names = (entry.decks ?? []).map((deck) => deck.name).join(", ");
      const answer = await choiceDialog("Change printing", <>{changing - Math.max(0, free) === 1 ? "A copy that changes is" : `${changing - Math.max(0, free)} copies that change are`} in {names}. Change the {entry.decks!.length === 1 ? "deck" : "decks"} too?</>, [
        ["follow", `Yes, change the ${entry.decks!.length === 1 ? "deck" : "decks"}`, true],
        ["keep", "No, show it as missing"],
      ]);
      if (!answer) return;
      decks = answer;
    }
    const move = async (from: CopyKey, cardId: string, toFinish: FinishCode, quantity?: number, how: "follow" | "keep" = "follow") => request<{ moved: number }>(
      `/api/collections/${encodeURIComponent(target)}/printing`,
      { method: "POST", body: JSON.stringify({ ...from, to: cardId, toFinish, decks: how, ...(quantity ? { quantity } : {}) }) },
    );
    try {
      const from = copyKey(entry);
      const { moved } = await move(from, to.id, finish, changing, decks);
      const next: CopyKey = { ...from, cardId: to.id, foil: finish };
      pushUndo({
        label: `Change printing of ${entry.name}`,
        undo: async () => { await move(next, entry.id, entry.foil, moved); },
        redo: async () => { await move(from, to.id, finish, moved, decks); },
      });
      depsRef.current.setChecked(new Set());
      const finishWord = finish === 2 ? " etched" : finish === 1 ? " foil" : "";
      const part = moved < entry.quantity ? `${moved} of ${entry.quantity} ` : "";
      flash(`${part ? `${part}${entry.name} changed to` : `${entry.name} is now`} (${to.set_code.toUpperCase()}) ${to.collector_number}${finishWord}${decks === "keep" ? ", decks kept their version" : ""}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not change the printing.");
    }
  }, [live, pushUndo, flash, fail, refreshAfterChange]);

  /** Lowers each picked entry to one copy, as one undo step. */
  const reducePicked = useCallback(async (given?: CollectionEntry[]) => {
    const entries = (given ?? pickedEntries()).filter((entry) => entry.quantity > 1);
    const groups = byCollection(entries, live.current.prefs.openCollection);
    if (!groups.size || !entries.length) return flash("Each picked card has one copy already", "err");
    const steps = [...groups].map(([target, rows]) => {
      const before: Counts = rows.map((entry) => ({ ...copyKey(entry), quantity: entry.quantity, trade: entry.trade }));
      return { target, before, after: before.map((item) => ({ ...item, quantity: 1, trade: Math.min(1, item.trade ?? 0) })) };
    });
    const run = async (which: "before" | "after") => { for (const step of steps) await setCounts(step.target, step[which]); };
    const what = entries.length === 1 ? entries[0]!.name : `${entries.length} entries`;
    try {
      await run("after");
      pushUndo({ label: `Reduce ${what} to 1`, undo: () => run("before"), redo: () => run("after") });
      flash(`${what} reduced to 1 copy${entries.length === 1 ? "" : " each"}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not reduce the cards.");
    }
  }, [live, pickedEntries, setCounts, pushUndo, flash, fail, refreshAfterChange]);

  reduceRef.current = async (entries) => { await reducePicked(entries); };

  /** Marks every copy of the given rows for trade, or clears their marks. */
  const markTrade = useCallback(async (entries: CollectionEntry[], on: boolean) => {
    const changed = entries.filter((entry) => !entry.proxy && (on ? entry.trade < entry.quantity : entry.trade > 0));
    const groups = byCollection(changed, live.current.prefs.openCollection);
    if (!groups.size) return flash(on ? "Those copies are already for trade" : "None of those copies are for trade", "err");
    const steps = [...groups].map(([target, rows]) => ({
      target,
      before: rows.map((entry) => ({ ...copyKey(entry), quantity: entry.quantity, trade: entry.trade })) as Counts,
      after: rows.map((entry) => ({ ...copyKey(entry), quantity: entry.quantity, trade: on ? entry.quantity : 0 })) as Counts,
    }));
    const run = async (which: "before" | "after") => { for (const step of steps) await setCounts(step.target, step[which]); };
    const what = changed.length === 1 ? changed[0]!.name : `${changed.length} entries`;
    try {
      await run("after");
      pushUndo({ label: on ? `Mark ${what} for trade` : `Unmark ${what} for trade`, undo: () => run("before"), redo: () => run("after") });
      flash(on ? `${what} marked for trade` : `${what} no longer for trade`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not change the trade marks.");
    }
  }, [live, setCounts, pushUndo, flash, fail, refreshAfterChange]);

  // ---------- wishlists ----------
  /** The account's first wishlist. When there is none, one named Wishlist is created. */
  const wishlist = useCallback(async (): Promise<Collection> => {
    const found = (live.current.collections ?? []).find((item) => item.kind === "wishlist" && item.role === "owner")
      ?? (live.current.collections ?? []).find((item) => item.kind === "wishlist");
    if (found) return found;
    const created = await request<Collection>("/api/collections", {
      method: "POST", body: JSON.stringify({ name: "Wishlist", description: "", completion: "none", finish: "any", kind: "wishlist", sets: [] }),
    });
    await reloadCollections();
    return created;
  }, [live, reloadCollections]);

  /** Adds cards to the wishlist as one undoable step. */
  const addToWishlist = useCallback(async (items: Counts, what: string) => {
    if (!items.length) return flash("There is nothing to add to the wishlist", "err");
    try {
      const list = await wishlist();
      const result = await request<{ added: number; before: Counts; after: Counts }>(`/api/collections/${encodeURIComponent(list.id)}/cards/add`, {
        method: "POST", body: JSON.stringify({ items }),
      });
      pushUndo({ label: `Add ${what} to ${list.name}`, undo: () => setCounts(list.id, result.before), redo: () => setCounts(list.id, result.after) });
      flash(`${result.added} ${result.added === 1 ? "card" : "cards"} added to ${list.name}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not add to the wishlist.");
    }
  }, [wishlist, pushUndo, setCounts, flash, fail, refreshAfterChange]);

  const addMissingToWishlist = useCallback(async () => {
    const id = live.current.prefs.openCollection;
    if (!id || id === ALL_COLLECTIONS) return flash("Open a collection linked to a set first", "err");
    try {
      const report = await request<CompletionReport>(`/api/collections/${encodeURIComponent(id)}/completion`);
      if (!report.missing.length) return flash(`Nothing is missing from ${collectionName(id)}`, "err");
      const items: Counts = report.missing.map((card) => ({ cardId: card.id, foil: card.needs === "foil" ? 1 : 0, condition: "NM", language: "en", proxy: false, quantity: 1 }));
      await addToWishlist(items, `${report.missing.length} missing cards`);
    } catch (reason) {
      fail(reason, "Could not load the missing list.");
    }
  }, [live, collectionName, addToWishlist, flash, fail]);

  const loadOwnership = useCallback(async (): Promise<Ownership | null> => {
    const deck = live.current.deck;
    if (!deck) {
      flash("Open a deck first", "err");
      return null;
    }
    return request<Ownership>(`/api/decks/${encodeURIComponent(deck.id)}/ownership?currency=${depsRef.current.currency()}`);
  }, [live, flash]);

  const addDeckMissingToWishlist = useCallback(async () => {
    try {
      const report = await loadOwnership();
      if (!report) return;
      const missing = report.entries.filter((entry) => entry.missing > 0);
      if (!missing.length) return flash(`You own every card in ${live.current.deck?.name}`, "err");
      const items: Counts = missing.map((entry) => ({ cardId: entry.cardId, foil: 0, condition: "NM", language: "en", proxy: false, quantity: entry.missing }));
      await addToWishlist(items, `missing cards of ${live.current.deck?.name}`);
    } catch (reason) {
      fail(reason, "Could not check which deck cards you own.");
    }
  }, [live, loadOwnership, addToWishlist, flash, fail]);

  const exportDeckMissing = useCallback(async () => {
    try {
      const report = await loadOwnership();
      const deck = live.current.deck;
      if (!report || !deck) return;
      const missing = report.entries.filter((entry) => entry.missing > 0);
      if (!missing.length) return flash(`You own every card in ${deck.name}`, "err");
      const lines = missing.map((entry) => {
        const card = deck.cards.find((item) => item.entry_id === entry.entryId);
        const printing = deck.mode === "theme" && card ? ` (${card.set_code.toUpperCase()}) ${card.collector_number}` : "";
        return `${entry.missing} ${entry.name}${printing}`;
      });
      downloadText(`${slugify(deck.name)}-missing.txt`, lines.join("\r\n"), "text/plain;charset=utf-8");
      flash(`Missing cards exported (${report.missing} cards)`);
    } catch (reason) {
      fail(reason, "Could not check which deck cards you own.");
    }
  }, [live, loadOwnership, flash, fail]);

  // ---------- missing list exports ----------
  const exportMissing = useCallback(async (format: "text" | "csv") => {
    const id = live.current.prefs.openCollection;
    if (!id || id === ALL_COLLECTIONS) return flash("Open a collection linked to a set first", "err");
    let report: CompletionReport;
    try {
      report = await request<CompletionReport>(`/api/collections/${encodeURIComponent(id)}/completion`);
    } catch (reason) {
      return fail(reason, "Could not load the missing list.");
    }
    if (!report.sets.length) return flash(`${collectionName(id)} is not linked to any set`, "err");
    if (!report.missing.length) return flash(`Nothing is missing from ${collectionName(id)}`, "err");
    const name = slugify(collectionName(id));
    if (format === "text") {
      const lines = report.missing.map((card) => `1 ${card.name} (${card.set_code.toUpperCase()}) ${card.collector_number}${card.needs === "foil" ? " *F*" : ""}`);
      downloadText(`${name}-missing.txt`, lines.join("\r\n"), "text/plain;charset=utf-8");
    } else {
      const rows = [["Count", "Name", "Edition", "Collector Number", "Foil", "Rarity"],
        ...report.missing.map((card) => [1, card.name, card.set_code, card.collector_number, card.needs === "foil", card.rarity])];
      downloadText(`${name}-missing.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    }
    flash(`Missing list exported (${report.missing.length} cards)`);
  }, [live, flash, fail, collectionName]);

  // ---------- decks ----------
  /** Renames the open deck, or the deck given (from its right-click menu). */
  const renameDeck = useCallback(async (name: string, deckId?: string) => {
    const id = deckId ?? live.current.deck?.id;
    if (!id) return;
    await request(`/api/decks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (live.current.deck?.id === id) await depsRef.current.openDeck(id, true);
    await reloadDecks();
    flash(`Deck renamed to ${name}`);
  }, [live, reloadDecks, flash]);

  /** Deletes (or leaves) the open deck, or the deck given (from its right-click menu). */
  const deleteDeck = useCallback(async (given?: Deck) => {
    const deck = given ?? live.current.deck;
    if (!deck) return flash("Open a deck first", "err");
    const open = live.current.deck;
    const total = open && open.id === deck.id ? open.cards.reduce((sum, card) => sum + card.quantity, 0) : deck.card_count ?? 0;
    if (deck.role === "member") {
      const ok = await confirmDialog("Leave shared deck", <>Stop using {deck.name}? It stays with {deck.owner?.name}, who shared it with you.</>, "Leave");
      if (!ok) return;
      try {
        await request(`/api/members/deck/${encodeURIComponent(deck.id)}/${depsRef.current.userId}`, { method: "DELETE" });
      } catch (reason) {
        return fail(reason, "Could not leave the deck.");
      }
      flash(`You left ${deck.name}`);
    } else {
      const shared = deck.sharedWith?.length ? ` It is shared with ${deck.sharedWith.map((person) => person.name).join(", ")}, who will lose it too.` : "";
      const ok = await confirmDialog("Delete deck", <>Delete {deck.name} and its {total} cards?{shared} This cannot be undone.</>, "Delete deck");
      if (!ok) return;
      try {
        await request(`/api/decks/${encodeURIComponent(deck.id)}`, { method: "DELETE" });
      } catch (reason) {
        return fail(reason, "Could not delete the deck.");
      }
      flash(`${deck.name} deleted`);
    }
    clearUndo();
    if (!open || open.id === deck.id) depsRef.current.closeDeck();
    await reloadDecks();
  }, [live, clearUndo, reloadDecks, flash, fail]);

  // ---------- sending ----------
  const reloadOffers = useCallback(async () => {
    try {
      setOffers(await request<{ inbox: Offer[]; sent: Offer[] }>("/api/shares"));
    } catch {
      // the inbox count keeps its last value
    }
  }, []);

  useEffect(() => {
    void reloadOffers();
    const timer = window.setInterval(() => { void reloadOffers(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [reloadOffers]);

  const loadUsers = useCallback(async () => {
    const list = await request<Person[]>("/api/users");
    setUsers(list);
    return list;
  }, []);

  const send = useCallback(async (kind: "collection" | "deck", itemId: string, toUser: number, mode: string) => {
    const result = await request<{ id: string; to: string }>("/api/shares", { method: "POST", body: JSON.stringify({ kind, itemId, toUser, mode }) });
    await reloadOffers();
    flash(`Sent to ${result.to}. It is added when they accept it.`);
  }, [reloadOffers, flash]);

  const accept = useCallback(async (offer: Offer, choice: { name?: string; mergeInto?: string }) => {
    const result = await request<{ kind: string; id: string }>(`/api/shares/${encodeURIComponent(offer.id)}/accept`, { method: "POST", body: JSON.stringify(choice) });
    await Promise.all([reloadOffers(), reloadCollections(), reloadDecks()]);
    if (offer.kind === "collection") setPrefs({ openCollection: result.id });
    flash(`${offer.itemName} accepted`);
  }, [reloadOffers, reloadCollections, reloadDecks, setPrefs, flash]);

  const decline = useCallback(async (offer: Offer) => {
    await request(`/api/shares/${encodeURIComponent(offer.id)}/decline`, { method: "POST", body: "{}" });
    await reloadOffers();
    flash(`${offer.itemName} declined`);
  }, [reloadOffers, flash]);

  const cancelOffer = useCallback(async (offer: Offer) => {
    await request(`/api/shares/${encodeURIComponent(offer.id)}`, { method: "DELETE" });
    await reloadOffers();
    flash(`Offer of ${offer.itemName} to ${offer.user} cancelled`);
  }, [reloadOffers, flash]);

  const stopSharing = useCallback(async (kind: "collection" | "deck", itemId: string, person: { id: number; name: string }) => {
    await request(`/api/members/${kind}/${encodeURIComponent(itemId)}/${person.id}`, { method: "DELETE" });
    await Promise.all([reloadCollections(), reloadDecks()]);
    flash(`Stopped sharing with ${person.name}`);
  }, [reloadCollections, reloadDecks, flash]);

  return {
    offers, reloadOffers, users, loadUsers,
    createCollection, saveCollection, openCollection, setTargetCollection, cycleTargetCollection, deleteCollection,
    pick, pickAll, pickedEntries, removePicked, reducePicked, moveEntries, exportMissing, editCopy, changeCopyPrinting, markTrade,
    wishlist, addToWishlist, addMissingToWishlist, addDeckMissingToWishlist, exportDeckMissing,
    renameDeck, deleteDeck, send, accept, decline, cancelOffer, stopSharing,
  };
}
