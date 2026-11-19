// ---------- library state: collections, row picking, bulk edits, decks admin and offers ----------
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { csvCell, downloadText, request, slugify } from "./api";
import { confirmDialog } from "./components/Dialog";
import type { Prefs } from "./prefs";
import type {
  Collection, CollectionEntry, CompletionReport, CompletionRule, DeckDetail, FinishRule, Offer, Person,
} from "./types";

type Counts = Array<{ cardId: string; foil: boolean; quantity: number }>;
type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };

export type CollectionInput = { name: string; description: string; completion: CompletionRule; finish: FinishRule; sets: string[] };

export type LibraryDeps = {
  userId: number;
  live: MutableRefObject<{
    prefs: Prefs; collections: Collection[] | null; collection: CollectionEntry[] | null; deck: DeckDetail | null;
    completion: CompletionReport | null;
  }>;
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

export const entryKey = (entry: Pick<CollectionEntry, "id" | "foil">) => `${entry.id}:${entry.foil}`;

export function useLibraryState(deps: LibraryDeps) {
  const { live, flash, fail, setPrefs, pushUndo, clearUndo, setCounts, refreshAfterChange, reloadCollections, reloadDecks, collectionName } = deps;
  const [offers, setOffers] = useState<{ inbox: Offer[]; sent: Offer[] }>({ inbox: [], sent: [] });
  const [users, setUsers] = useState<Person[]>([]);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // ---------- collections ----------
  const createCollection = useCallback(async (input: CollectionInput) => {
    const created = await request<Collection>("/api/collections", { method: "POST", body: JSON.stringify(input) });
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
    setPrefs({ targetCollection: id });
    flash(`New cards go to ${collectionName(id)}`);
  }, [setPrefs, flash, collectionName]);

  const cycleTargetCollection = useCallback(() => {
    const list = live.current.collections ?? [];
    if (!list.length) return flash("Create a collection first (Collection menu, New collection)", "err");
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

  const removePicked = useCallback(async () => {
    const target = live.current.prefs.openCollection;
    const entries = pickedEntries();
    if (!target || !entries.length) return flash("Pick one or more rows first", "err");
    const cards = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const name = collectionName(target);
    const what = entries.length === 1 ? `${entries[0]!.name}${entries[0]!.foil ? " (foil)" : ""} (${cards} ${cards === 1 ? "card" : "cards"})` : `${entries.length} entries (${cards} cards)`;
    const ok = await confirmDialog("Remove cards", <>Remove {what} from {name}?</>, "Remove");
    if (!ok) return;
    const before: Counts = entries.map((entry) => ({ cardId: entry.id, foil: Boolean(entry.foil), quantity: entry.quantity }));
    const after: Counts = before.map((item) => ({ ...item, quantity: 0 }));
    try {
      await setCounts(target, after);
      pushUndo({ label: `Remove ${entries.length === 1 ? entries[0]!.name : `${entries.length} entries`}`, undo: () => setCounts(target, before), redo: () => setCounts(target, after) });
      depsRef.current.setChecked(new Set());
      flash(`Removed ${what} from ${name}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not remove the cards.");
    }
  }, [live, pickedEntries, collectionName, setCounts, pushUndo, flash, fail, refreshAfterChange]);

  /** Moves copies to another collection. Without counts, every copy of each entry moves. */
  const moveEntries = useCallback(async (entries: CollectionEntry[], to: string, counts?: Map<string, number>) => {
    const from = live.current.prefs.openCollection;
    if (!from || !entries.length) return;
    const items: Counts = entries.map((entry) => ({ cardId: entry.id, foil: Boolean(entry.foil), quantity: counts?.get(entryKey(entry)) ?? entry.quantity }));
    try {
      const { moved } = await request<{ moved: Counts }>(`/api/collections/${encodeURIComponent(from)}/move`, { method: "POST", body: JSON.stringify({ to, items }) });
      if (!moved.length) return flash("Nothing was moved", "err");
      const back = (source: string, target: string) => request(`/api/collections/${encodeURIComponent(source)}/move`, { method: "POST", body: JSON.stringify({ to: target, items: moved }) }).then(() => undefined);
      const cards = moved.reduce((sum, item) => sum + item.quantity, 0);
      const label = entries.length === 1 ? `Move ${entries[0]!.name}` : `Move ${entries.length} entries`;
      pushUndo({ label, undo: () => back(to, from), redo: () => back(from, to) });
      depsRef.current.setChecked(new Set());
      flash(`Moved ${cards} ${cards === 1 ? "card" : "cards"} to ${collectionName(to)}`);
      await refreshAfterChange();
    } catch (reason) {
      fail(reason, "Could not move the cards.");
    }
  }, [live, pushUndo, collectionName, flash, fail, refreshAfterChange]);

  // ---------- missing list exports ----------
  const exportMissing = useCallback(async (format: "text" | "csv") => {
    const id = live.current.prefs.openCollection;
    if (!id) return flash("Create a collection first (Collection menu, New collection)", "err");
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
  const renameDeck = useCallback(async (name: string) => {
    const deck = live.current.deck;
    if (!deck) return;
    await request(`/api/decks/${encodeURIComponent(deck.id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
    await depsRef.current.openDeck(deck.id, true);
    await reloadDecks();
    flash(`Deck renamed to ${name}`);
  }, [live, reloadDecks, flash]);

  const deleteDeck = useCallback(async () => {
    const deck = live.current.deck;
    if (!deck) return flash("Open a deck first", "err");
    const total = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
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
    depsRef.current.closeDeck();
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
    pick, pickAll, pickedEntries, removePicked, moveEntries, exportMissing,
    renameDeck, deleteDeck, send, accept, decline, cancelOffer, stopSharing,
  };
}
