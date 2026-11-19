// ---------- actions: every command is defined once and called by name from menus, ribbon and keys ----------
import { useMemo } from "react";
import { request } from "./api";
import { confirmDialog, customDialog, dialog } from "./components/Dialog";
import { RibbonCustomize } from "./components/RibbonCustomize";
import { collectionDialog, copyDialog, inboxDialog, moveDialog, renameDeckDialog, sendDialog, sharingDialog } from "./components/LibraryDialogs";
import { isOpen, type PanelId, PANELS, PRESET_NAMES, removePanel } from "./dock";
import { DEFAULT_RIBBON } from "./ribbon";
import { type Store, useApp } from "./store";
import { capitalize, type CollectionTab, type DeckTab, FORMATS, type Zone } from "./types";

export type Action = {
  label: string;
  /** Short label for ribbon buttons. */
  short?: string;
  icon: string;
  key?: string;
  run: () => void;
  on?: boolean;
  disabled?: boolean;
};

/** Every keyboard shortcut, in the order the shortcut list shows them. */
export const SHORTCUTS: Array<[group: string, key: string, action: string]> = [
  ["Search", "/", "find"],
  ["Search", "1", "view.cards"],
  ["Search", "2", "view.collection"],
  ["Search", "3", "view.deck"],
  ["Search", "4", "view.trade"],
  ["Search", "Up, Down", "Select the previous or next row"],
  ["Adding cards", "Enter", "addCollection"],
  ["Adding cards", "Shift+Enter", "addDeck"],
  ["Adding cards", "F", "foil"],
  ["Adding cards", "Z", "zone.cycle"],
  ["Adding cards", "C", "collection.target"],
  ["Adding cards", "W", "wishlist.add"],
  ["Collections", "Ctrl+A", "pickAll"],
  ["Collections", "Ctrl+click, Shift+click", "Pick more rows, or a range of rows"],
  ["Collections", "Delete", "removePicked"],
  ["Collections", "E", "copy.details"],
  ["Collections", "B", "collection.binder"],
  ["Collections", "Page Up, Page Down", "Show the previous or next binder page"],
  ["Trade", "T", "trade.give"],
  ["Trade", "G", "trade.get"],
  ["Editing", "Ctrl+Z", "undo"],
  ["Editing", "Ctrl+Y", "redo"],
  ["Decks", "Ctrl+N", "newDeck"],
  ["Decks", "Ctrl+O", "openDeck"],
  ["General", "Esc", "Close the dialog, menu or About guide, or clear the selection"],
];

export function useActions(store: Store): Record<string, Action> {
  return useMemo(() => {
    const { prefs, deck } = store;
    const selected = store.selectedCard;
    const open = store.collections?.find((item) => item.id === prefs.openCollection) ?? null;
    const target = store.collections?.find((item) => item.id === prefs.targetCollection) ?? null;
    const picked = store.checked.size;
    const noCollection = () => store.flash("Create a collection first (Collection menu, New collection)", "err");
    const showTab = (tab: CollectionTab) => {
      store.setView("collection");
      store.setCollectionTab(tab);
    };
    const showDeckTab = (tab: DeckTab) => {
      store.setView("deck");
      store.setDeckTab(tab);
    };
    const entry = store.view === "collection" && store.selection?.view === "collection"
      ? store.collection?.find((item) => `${item.id}:${item.foil}:${item.condition}:${item.language}` === store.selection?.key) ?? null : null;
    const markable = store.view === "collection" ? store.pickedEntries() : [];
    const currency = (value: "usd" | "eur", label: string): Action => ({
      label, short: value.toUpperCase(), icon: value, on: prefs.currency === value,
      run: () => { store.setPrefs({ currency: value }); store.flash(label); },
    });
    const setZone = (zone: Zone) => {
      store.setPrefs({ zone });
      store.flash(`New deck cards go to ${zone === "main" ? "the main deck" : `the ${zone}`}`);
    };
    const panelAction = (panel: PanelId): Action => ({
      label: `${PANELS[panel].title} panel`,
      short: PANELS[panel].title,
      icon: PANELS[panel].icon,
      on: isOpen(prefs.layout, panel),
      run: () => {
        if (isOpen(prefs.layout, panel)) store.setLayout(removePanel(prefs.layout, panel));
        else store.showPanel(panel);
      },
    });
    const theme = (value: "light" | "dark" | "system", label: string, icon: string): Action => ({
      label, icon, on: prefs.theme === value,
      run: () => { store.setPrefs({ theme: value }); store.flash(label); },
    });

    const actions: Record<string, Action> = {
      "view.cards": { label: "Card search", short: "Cards", icon: "cards", key: "1", on: store.view === "cards", run: () => store.setView("cards") },
      "view.collection": { label: "Collection view", short: "Collection", icon: "collection", key: "2", on: store.view === "collection", run: () => store.setView("collection") },
      "collection.new": { label: "New collection...", short: "New collection", icon: "newcol", run: () => collectionDialog(store) },
      "collection.settings": {
        label: "Collection settings...", short: "Settings", icon: "colsettings", disabled: !open,
        run: () => (open ? collectionDialog(store, open) : noCollection()),
      },
      "collection.delete": {
        label: open?.role === "member" ? "Leave shared collection..." : "Delete collection...", short: open?.role === "member" ? "Leave" : "Delete",
        icon: "del", disabled: !open, run: () => (open ? void store.deleteCollection(open) : noCollection()),
      },
      "collection.target": {
        label: "Cycle target collection", short: "Target", icon: "target", key: "C", disabled: !store.collections?.length,
        run: store.cycleTargetCollection,
      },
      "collection.cards": { label: "Collection cards", short: "Cards", icon: "collection", on: store.view === "collection" && store.collectionTab === "cards", run: () => showTab("cards") },
      "collection.completion": { label: "Set completion", short: "Completion", icon: "progress", on: store.view === "collection" && store.collectionTab === "completion", run: () => showTab("completion") },
      "collection.missing": { label: "Missing cards", short: "Missing", icon: "missing", on: store.view === "collection" && store.collectionTab === "missing", run: () => showTab("missing") },
      pickAll: {
        label: "Select all rows", short: "Select all", icon: "selectall", key: "Ctrl+A", disabled: store.view !== "collection" || !store.visibleCollection.length,
        run: store.pickAll,
      },
      removePicked: {
        label: "Remove selected...", short: "Remove", icon: "del", key: "Delete", disabled: store.view !== "collection" || !picked,
        run: () => void store.removePicked(),
      },
      movePicked: {
        label: "Move selected...", short: "Move", icon: "move", disabled: store.view !== "collection" || !picked || (store.collections?.length ?? 0) < 2,
        run: () => moveDialog(store, store.pickedEntries()),
      },
      exportMissingText: { label: "Export missing list (text)", short: "Missing text", icon: "txt", disabled: !open?.sets.length, run: () => void store.exportMissing("text") },
      exportMissingCsv: { label: "Export missing list (CSV)", short: "Missing CSV", icon: "csv", disabled: !open?.sets.length, run: () => void store.exportMissing("csv") },
      "collection.send": {
        label: "Send collection...", short: "Send", icon: "send", disabled: !open,
        run: () => (open ? void sendDialog(store, "collection", open) : noCollection()),
      },
      "collection.sharing": { label: "Collection sharing...", short: "Sharing", icon: "people", disabled: !open, run: () => sharingDialog(store, "collection") },
      inbox: {
        label: store.offers.inbox.length ? `Inbox (${store.offers.inbox.length})...` : "Inbox...", short: "Inbox", icon: "inbox",
        run: () => inboxDialog(store),
      },
      "view.deck": { label: "Deck view", short: "Deck", icon: "deck", key: "3", on: store.view === "deck", run: () => store.setView("deck") },
      "view.trade": { label: "Trade view", short: "Trade", icon: "trade", key: "4", on: store.view === "trade", run: () => store.setView("trade") },
      "collection.stats": {
        label: "Collection statistics", short: "Statistics", icon: "stats", on: store.view === "collection" && store.collectionTab === "stats", run: () => showTab("stats"),
      },
      "collection.binder": {
        label: "Binder layout", short: "Binder", icon: "binder", key: "B", on: prefs.collectionLayout === "binder",
        run: () => {
          const next = prefs.collectionLayout === "binder" ? "list" : "binder";
          store.setPrefs({ collectionLayout: next });
          if (store.view !== "collection" || store.collectionTab !== "cards") showTab("cards");
          store.flash(next === "binder" ? "Binder layout" : "List layout");
        },
      },
      "copy.details": {
        label: "Copy details...", short: "Details", icon: "edit", key: "E", disabled: !entry,
        run: () => (entry ? copyDialog(store, entry) : store.flash("Select a row in the collection first", "err")),
      },
      "trade.mark": {
        label: "Mark for trade", short: "For trade", icon: "trade", disabled: !markable.length,
        run: () => void store.markTrade(markable, true),
      },
      "trade.unmark": {
        label: "Unmark for trade", short: "Not for trade", icon: "clear", disabled: !markable.length,
        run: () => void store.markTrade(markable, false),
      },
      "trade.give": {
        label: "Add to trade (you give)", short: "You give", icon: "trade", key: "T", disabled: !entry,
        run: () => (entry ? store.giveEntry(entry) : store.flash("Select a row in a collection first", "err")),
      },
      "trade.get": {
        label: "Add to trade (you get)", short: "You get", icon: "trade", key: "G", disabled: !selected,
        run: () => (selected ? void store.getCard(selected.id) : store.flash("Select a card first", "err")),
      },
      "trade.copy": {
        label: "Copy trade summary", short: "Copy summary", icon: "copy", disabled: !store.trade.give.length && !store.trade.get.length,
        run: () => void store.copyTradeSummary(),
      },
      "trade.clear": {
        label: "Clear trade...", short: "Clear trade", icon: "clear", disabled: !store.trade.give.length && !store.trade.get.length,
        run: () => void confirmDialog("Clear trade", <>Remove every card from both sides of the trade?</>, "Clear trade").then((ok) => { if (ok) store.clearTrade(); }),
      },
      "wishlist.add": {
        label: "Add to wishlist", short: "Wishlist", icon: "wish", key: "W", disabled: !selected,
        run: () => (selected
          ? void store.addToWishlist([{ cardId: selected.id, foil: prefs.foil ? 1 : 0, condition: "NM", language: "en", quantity: 1 }], selected.name)
          : store.flash("Select a card first", "err")),
      },
      "wishlist.missing": {
        label: "Add missing cards to wishlist", short: "Missing to wishlist", icon: "wish", disabled: !open?.sets.length || open.kind === "wishlist",
        run: () => void store.addMissingToWishlist(),
      },
      "deck.cards": { label: "Deck cards", short: "Cards", icon: "deck", on: store.view === "deck" && store.deckTab === "cards", run: () => showDeckTab("cards") },
      "deck.ownership": { label: "Deck ownership", short: "Ownership", icon: "owned", on: store.view === "deck" && store.deckTab === "ownership", run: () => showDeckTab("ownership") },
      "deck.stats": { label: "Deck statistics", short: "Statistics", icon: "stats", on: store.view === "deck" && store.deckTab === "stats", run: () => showDeckTab("stats") },
      "deck.missingWishlist": {
        label: "Add missing deck cards to wishlist", short: "Missing to wishlist", icon: "wish", disabled: !deck,
        run: () => void store.addDeckMissingToWishlist(),
      },
      "deck.exportMissing": {
        label: "Export missing deck cards (text)", short: "Missing text", icon: "txt", disabled: !deck,
        run: () => void store.exportDeckMissing(),
      },
      "currency.usd": currency("usd", "Prices in US dollars"),
      "currency.eur": currency("eur", "Prices in euros"),
      find: {
        label: "Find card", short: "Find", icon: "find", key: "/",
        run: () => {
          const focus = () => { store.searchInput.current?.focus(); store.searchInput.current?.select(); };
          // focus at once when the search box is on screen, so typed keys are never lost
          if (store.view === "cards" && store.searchInput.current) focus();
          else {
            store.setView("cards");
            window.setTimeout(focus, 0);
          }
        },
      },
      clearFilters: {
        label: "Clear filters", short: "Clear filters", icon: "clear", disabled: !store.filtersActive,
        run: () => { store.setFilters({ query: "", type: "", set: "", color: "", rarity: "", format: "", mvMin: "", mvMax: "" }); store.flash("Filters cleared"); },
      },
      scan: { label: "Scan card...", short: "Scan card", icon: "scan", run: () => store.setScannerOpen(true) },
      addCollection: {
        label: "Add to collection", short: "Add to collection", icon: "addcol", key: "Enter", disabled: !selected || !target,
        run: () => { if (selected) void store.addToCollection(selected.id, selected.name); else store.flash("Select a card first", "err"); },
      },
      addDeck: {
        label: "Add to deck", short: "Add to deck", icon: "adddeck", key: "Shift+Enter", disabled: !selected || !deck,
        run: () => { if (selected) void store.addToDeck(selected.id, selected.name); else store.flash("Select a card first", "err"); },
      },
      foil: {
        label: "Add as foil", short: "Add as foil", icon: "foil", key: "F", on: prefs.foil,
        run: () => { store.setPrefs({ foil: !prefs.foil }); store.flash(prefs.foil ? "Cards are added as regular copies" : "Cards are added as foil"); },
      },
      "zone.main": { label: "Main deck", short: "Main", icon: "zmain", on: prefs.zone === "main", run: () => setZone("main") },
      "zone.sideboard": { label: "Sideboard", short: "Sideboard", icon: "zside", on: prefs.zone === "sideboard", run: () => setZone("sideboard") },
      "zone.commander": { label: "Commander", short: "Commander", icon: "zcmd", on: prefs.zone === "commander", run: () => setZone("commander") },
      "zone.cycle": {
        label: "Cycle target zone", short: "Cycle zone", icon: "zone", key: "Z",
        run: () => setZone(prefs.zone === "main" ? "sideboard" : prefs.zone === "sideboard" ? "commander" : "main"),
      },
      updateCatalog: {
        label: "Update card database", short: "Update database", icon: "update",
        disabled: store.catalogRequestPending || !store.catalog || store.catalog.update.isUpdating,
        run: () => void store.updateCatalog(),
      },
      importCollection: { label: "Import collection CSV...", short: "Import CSV", icon: "csvin", run: () => void store.importCollection() },
      exportCollection: { label: "Export collection (Moxfield CSV)", short: "Moxfield CSV", icon: "csv", run: () => void store.exportCollection() },
      backup: { label: "Download backup", short: "Backup", icon: "backup", run: () => void store.downloadBackup() },
      restore: { label: "Restore backup...", short: "Restore", icon: "restore", run: () => void store.restoreBackup() },
      newDeck: {
        label: "New deck...", short: "New deck", icon: "newdeck", key: "Ctrl+N",
        run: () => dialog("New deck", [
          ["name", "Deck name", ""],
          ["format", "Format", "commander", "select", FORMATS.map((format) => [format, capitalize(format)])],
          ["mode", "Deck mode", "normal", "select", [["normal", "Normal (any printing works)"], ["theme", "Theme (keeps each selected printing)"]]],
        ], async (values) => {
          const name = String(values.name);
          if (!name) {
            store.flash("Enter a deck name", "err");
            return false;
          }
          if (name.length > 100) {
            store.flash("Deck names can be up to 100 characters", "err");
            return false;
          }
          try {
            await store.createDeck(name, String(values.format), values.mode === "theme" ? "theme" : "normal");
          } catch (reason) {
            store.fail(reason, "Could not create the deck.");
            return false;
          }
        }, "Create deck", <p className="note">Normal decks track each card by name, so any printing counts. Theme decks keep the exact printing and artwork you add.</p>),
      },
      openDeck: {
        label: "Open deck...", short: "Open deck", icon: "opendeck", key: "Ctrl+O",
        run: () => {
          if (!store.decks.length) {
            store.flash("There are no decks yet. Use New deck to create one.", "err");
            return;
          }
          dialog("Open deck", [
            ["deck", "Deck", deck?.id ?? store.decks[0]?.id ?? "", "select",
              store.decks.map((item) => [item.id, `${item.name} (${capitalize(item.format)}, ${item.mode === "theme" ? "Theme" : "Normal"}, ${item.card_count ?? 0} cards)`])],
          ], async (values) => { await store.openDeck(String(values.deck)); store.setView("deck"); }, "Open");
        },
      },
      "deck.rename": { label: "Rename deck...", short: "Rename", icon: "rename", disabled: !deck, run: () => renameDeckDialog(store) },
      "deck.delete": {
        label: deck?.role === "member" ? "Leave shared deck..." : "Delete deck...", short: deck?.role === "member" ? "Leave" : "Delete",
        icon: "del", disabled: !deck, run: () => void store.deleteDeck(),
      },
      "deck.send": { label: "Send deck...", short: "Send", icon: "send", disabled: !deck, run: () => (deck ? void sendDialog(store, "deck", deck) : store.flash("Open a deck first", "err")) },
      "deck.sharing": { label: "Deck sharing...", short: "Sharing", icon: "people", disabled: !deck, run: () => sharingDialog(store, "deck") },
      importDeck: { label: "Import decklist...", short: "Import list", icon: "listin", disabled: !deck, run: () => void store.importDeck() },
      exportDeckText: { label: "Export deck (text)", short: "Text", icon: "txt", disabled: !deck, run: store.exportDeckText },
      exportDeckCsv: { label: "Export deck (CSV)", short: "CSV", icon: "csv", disabled: !deck, run: store.exportDeckCsv },
      undo: {
        label: store.undoStack.length ? `Undo ${store.undoStack[store.undoStack.length - 1]!.label}` : "Undo", short: "Undo", icon: "undo", key: "Ctrl+Z",
        disabled: !store.undoStack.length, run: () => void store.undo(),
      },
      redo: {
        label: store.redoStack.length ? `Redo ${store.redoStack[store.redoStack.length - 1]!.label}` : "Redo", short: "Redo", icon: "redo", key: "Ctrl+Y",
        disabled: !store.redoStack.length, run: () => void store.redo(),
      },
      "theme.light": theme("light", "Light theme", "sun"),
      "theme.dark": theme("dark", "Dark theme", "theme"),
      "theme.system": theme("system", "System theme", "system"),
      "panel.filters": panelAction("filters"),
      "panel.collections": panelAction("collections"),
      "panel.decks": panelAction("decks"),
      "panel.card": panelAction("card"),
      "panel.decklist": panelAction("decklist"),
      "panel.review": panelAction("review"),
      "workspace.save": {
        label: "Save workspace...", short: "Save workspace", icon: "workspace",
        run: () => dialog("Save workspace", [["name", "Workspace name", PRESET_NAMES.includes(prefs.workspace) ? "" : prefs.workspace]], (values) => {
          const name = String(values.name);
          if (!name) { store.flash("Enter a workspace name", "err"); return false; }
          if (PRESET_NAMES.includes(name)) { store.flash(`${name} is a built-in workspace. Choose another name.`, "err"); return false; }
          store.saveWorkspace(name);
        }, "Save", <p className="note">A workspace keeps the panel layout and the current view. Saving with an existing name replaces it.</p>),
      },
      "workspace.manage": {
        label: "Manage workspaces...", short: "Manage", icon: "panels",
        run: () => customDialog("Manage workspaces", () => <WorkspaceList />, 420),
      },
      "workspace.reset": {
        label: "Reset panels", short: "Reset panels", icon: "panels",
        run: () => store.applyWorkspace(PRESET_NAMES.includes(prefs.workspace) ? prefs.workspace : "Deck building"),
      },
      "ribbon.customize": {
        label: "Customize ribbon...", short: "Customize", icon: "ribbon",
        run: () => customDialog("Customize ribbon", () => <RibbonCustomize />, 900),
      },
      shortcuts: {
        label: "Keyboard shortcuts", short: "Shortcuts", icon: "keyboard",
        run: () => customDialog("Keyboard shortcuts", () => <ShortcutList actions={actions} />, 460),
      },
      about: { label: "About Mana Vault", short: "About", icon: "info", run: () => store.openAbout() },
      password: {
        label: "Change password...", short: "Password", icon: "key",
        run: () => dialog("Change password", [
          ["old", "Current password", "", "password"],
          ["new", "New password", "", "password"],
          ["repeat", "Repeat new password", "", "password"],
        ], async (values) => {
          if (values.new !== values.repeat) { store.flash("The new passwords do not match", "err"); return false; }
          try {
            await request("/api/password", { method: "POST", body: JSON.stringify({ old: values.old, new: values.new }) });
            store.flash("Password changed. Other devices are signed out.");
          } catch (reason) {
            store.fail(reason, "Could not change the password.");
            return false;
          }
        }, "Change password", <p className="note">Passwords need at least 8 characters. Changing it signs out every other device.</p>),
      },
      signout: {
        label: "Sign out", short: "Sign out", icon: "signout",
        run: () => {
          void request("/api/logout", { method: "POST", body: "{}" }).finally(() => { window.location.href = "/login"; });
        },
      },
    };
    return actions;
  }, [store]);
}

function ShortcutList({ actions }: { actions: Record<string, Action> }) {
  const groups = [...new Set(SHORTCUTS.map(([group]) => group))];
  return (
    <div className="kbdlist">
      {groups.map((group) => (
        <div key={group}>
          <h4>{group}</h4>
          <div className="kbd">
            {SHORTCUTS.filter(([item]) => item === group).map(([, key, action]) => (
              <span className="kbdrow" key={key}><b>{key}</b><span>{actions[action]?.label.replace(/^Undo .+/, "Undo").replace(/^Redo .+/, "Redo") ?? action}</span></span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkspaceList() {
  const store = useApp();
  const names = Object.keys(store.prefs.workspaces);
  return (
    <div>
      {PRESET_NAMES.map((name) => (
        <div className="wsrow" key={name}><span>{name} <span className="badge">Built in</span></span>
          <button type="button" className="btn small" onClick={() => store.applyWorkspace(name)}>Use</button></div>
      ))}
      {names.map((name) => (
        <div className="wsrow" key={name}><span>{name}</span>
          <span className="btnrow">
            <button type="button" className="btn small" onClick={() => store.applyWorkspace(name)}>Use</button>
            <button type="button" className="btn small" onClick={() => store.deleteWorkspace(name)}>Delete</button>
          </span></div>
      ))}
      {!names.length && <p className="note">Saved workspaces appear here. Use Save workspace to add one.</p>}
    </div>
  );
}

export const DEFAULT_RIBBON_IDS = DEFAULT_RIBBON.flatMap((tab) => tab.groups.flatMap((group) => group.items));
