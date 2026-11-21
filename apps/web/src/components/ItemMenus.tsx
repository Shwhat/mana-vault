// ---------- right-click and long-press menus on collections and decks, wherever they are listed ----------
import { sendDeckToPrintDialog } from "../views/ProxiesView";
import { type Store } from "../store";
import { type Collection, type Deck, formatName, FORMATS } from "../types";
import { rowMenu } from "./ContextMenu";
import { dialog } from "./Dialog";
import { exportWindow } from "./FileWindows";
import { collectionDialog, sendDialog, sharingDialog } from "./LibraryDialogs";

/** Renames a collection, keeping its other settings. */
export function renameCollectionDialog(store: Store, item: Collection) {
  dialog("Rename collection", [["name", "Collection name", item.realName ?? item.name]], async (values) => {
    const name = String(values.name);
    if (!name || name.length > 100) {
      store.flash(name ? "Collection names can be up to 100 characters" : "Enter a collection name", "err");
      return false;
    }
    try {
      await store.saveCollection(item.id, {
        name, description: item.description ?? "", completion: item.completion, finish: item.finish, kind: item.kind, sets: item.sets.map((set) => set.code),
      });
    } catch (reason) {
      store.fail(reason, "Could not rename the collection.");
      return false;
    }
  }, "Rename");
}

/** Renames any deck the account owns. */
export function renameDeckFor(store: Store, deck: Deck) {
  dialog("Rename deck", [["name", "Deck name", deck.realName ?? deck.name]], async (values) => {
    const name = String(values.name);
    if (!name || name.length > 100) {
      store.flash(name ? "Deck names can be up to 100 characters" : "Enter a deck name", "err");
      return false;
    }
    try {
      await store.renameDeck(name, deck.id);
    } catch (reason) {
      store.fail(reason, "Could not rename the deck.");
      return false;
    }
  }, "Rename");
}

/** Opens a collection in the collection view and makes it where new cards go. */
const openCollection = (store: Store, item: Collection) => {
  store.openCollection(item.id);
  store.setView("collection");
};

/** Opens a deck in the deck view and makes it where new cards go. */
const openDeck = (store: Store, deck: Deck) => void store.openDeck(deck.id).then(() => store.setView("deck"));

/** Commands that act on the open deck run on this deck: it is opened first, without changing where new cards go. */
const withDeck = (store: Store, deck: Deck, run: () => void) => {
  if (store.deck?.id === deck.id) return run();
  void store.openDeck(deck.id, true).then(run);
};

/**
 * Add deck to collection: asks which collection and whether to add only the cards the deck is missing or every card
 * as new copies. Missing cards are linked to the new copies either way. The maybeboard is left out.
 */
export function addDeckToCollectionDialog(store: Store, deck: { id: string; name: string; collection_id?: string | null }) {
  const list = (store.collections ?? []).filter((item) => item.kind !== "wishlist");
  if (!list.length) return store.flash("Create a collection first", "err");
  const preferred = [deck.collection_id, store.prefs.targetCollection].find((id) => id && list.some((item) => item.id === id)) ?? list[0]!.id;
  dialog(`Add ${deck.name} to a collection`, [
    ["collection", "Collection", preferred, "select", list.map((item) => [item.id, item.name])],
    ["mode", "Cards to add", "missing", "select", [["missing", "Missing cards only, linked to the deck"], ["all", "Every card as new copies"]]],
  ], async (values) => {
    await store.addDeckToCollection(deck.id, String(values.collection), values.mode === "all" ? "all" : "missing");
  }, "Add cards");
}

export function collectionMenu(store: Store, item: Collection) {
  const owner = item.role === "owner";
  return rowMenu(store, item.name, () => [
    { label: "Open", run: () => openCollection(store, item) },
    owner && { label: "Rename...", run: () => renameCollectionDialog(store, item) },
    owner && { label: "Collection settings...", run: () => collectionDialog(store, item) },
    owner && { label: "Send...", run: () => void sendDialog(store, "collection", item) },
    owner && { label: "Sharing...", run: () => { if (store.prefs.openCollection !== item.id) store.openCollection(item.id); sharingDialog(store, "collection"); } },
    { label: "Export...", run: () => exportWindow(store, "collection", item.id) },
    { label: owner ? "Delete" : "Leave", run: () => void store.deleteCollection(item) },
  ]);
}

export function deckMenu(store: Store, deck: Deck) {
  const owner = deck.role !== "member";
  return rowMenu(store, deck.name, () => [
    { label: "Open", run: () => openDeck(store, deck) },
    owner && { label: "Rename...", run: () => renameDeckFor(store, deck) },
    owner && {
      label: "Deck format...",
      run: () => dialog("Deck format", [["format", "Format", deck.format, "select", FORMATS.map((format) => [format, formatName(format)])]], async (values) => {
        const format = String(values.format);
        let ok = false;
        await new Promise<void>((done) => withDeck(store, deck, () => {
          void store.updateDeckInfo({ format }, `Format set to ${formatName(format)}`).then((result) => { ok = result; done(); });
        }));
        if (!ok) return false;
      }, "Save"),
    },
    { label: "Add deck to collection...", run: () => addDeckToCollectionDialog(store, deck) },
    { label: "Send to print list...", run: () => sendDeckToPrintDialog(store, deck) },
    owner && { label: "Send...", run: () => void sendDialog(store, "deck", deck) },
    owner && { label: "Sharing...", run: () => withDeck(store, deck, () => sharingDialog(store, "deck")) },
    { label: "Export...", run: () => withDeck(store, deck, () => exportWindow(store, "deck")) },
    { label: owner ? "Delete" : "Leave", run: () => void store.deleteDeck(deck) },
  ]);
}
