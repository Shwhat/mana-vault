// ---------- actions: every command is defined once and called by name from menus, tabs, buttons and keys ----------
import { addCard } from "./components/AddButtons";
import { cardLayoutDialog } from "./components/CardFrame";
import { useMemo } from "react";
import { addFromDeckDialog } from "./views/ProxiesView";
import { exportPurchases, newEntry, saleCopies } from "./views/PurchasesView";
import { request } from "./api";
import { checkForUpdate, DeviceList, signOutApp } from "./android/AppScreens";
import { syncNow, syncStatus } from "./android/offline";
import { appSettings, isApp, native, saveSettings } from "./android/platform";
import { choiceDialog, confirmDialog, customDialog, dialog } from "./components/Dialog";
import { completeTradeDialog, newTradeDialog, renameTradeDialog, sendTradeDialog, shareBinderDialog } from "./components/TradeDialogs";
import { collectionDialog, copyDialog, inboxDialog, linkDialog, moveDialog, newDeckDialog, renameDeckDialog, sendDialog, sharingDialog } from "./components/LibraryDialogs";
import { exportWindow, importWindow } from "./components/FileWindows";
import { addDeckToCollectionDialog } from "./components/ItemMenus";
import { preconCollectionDialog, preconDeckDialog } from "./components/Precons";
import { barcodeDialog, virtualPacksDialog } from "./components/PurchaseDialogs";
import { refreshCardSearches } from "./card-search";
import type { Prefs } from "./prefs";
import { editTextDialog, formatDialog, tagsDialog } from "./components/DeckDialogs";
import { entryKey } from "./library-state";
import { isOpen, type PanelId, PANELS, PRESET_NAMES, removePanel } from "./dock";
import { type Store, useApp, zoneLabel } from "./store";
import { capitalize, type CollectionTab, type DeckTab, formatName, type Zone } from "./types";

export type Action = {
  label: string;
  /** Short label for buttons and tabs. */
  short?: string;
  icon: string;
  key?: string;
  run: () => void;
  on?: boolean;
  disabled?: boolean;
};

/** Every keyboard shortcut, in the order the shortcut list shows them. */
/** The stores an account can choose as its main price source (0.21.0); only stores priced in US dollars, so totals stay in one currency. */
export const PRICE_SOURCES: Array<[Prefs["mainPriceSource"], string]> = [["tcgplayer", "TCGplayer"], ["cardkingdom", "Card Kingdom"], ["cardsphere", "CardSphere"], ["scryfall", "Scryfall"]];

export const SHORTCUTS: Array<[group: string, key: string, action: string]> = [
  ["Search", "/", "find"],
  ["Search", "1", "view.cards"],
  ["Search", "2", "view.collection"],
  ["Search", "3", "view.deck"],
  ["Search", "4", "view.trade"],
  ["Search", "5", "view.proxies"],
  ["Search", "6", "view.purchases"],
  ["Search", "Up, Down", "Select the previous or next row"],
  ["Adding cards", "Enter", "addCollection"],
  ["Adding cards", "Shift+Enter", "addDeck"],
  ["Adding cards", "F", "foil"],
  ["Adding cards", "Z", "zone.cycle"],
  ["Decks", "Q", "Go to Quick add in the open deck"],
  ["Adding cards", "C", "collection.target"],
  ["Adding cards", "W", "wishlist.add"],
  ["Collections", "Ctrl+A", "pickAll"],
  ["Collections", "Ctrl+click, Shift+click", "Pick more cards, or a range of cards"],
  ["Collections", "Delete", "removePicked"],
  ["Collections", "E", "copy.details"],
  ["Collections", "B", "collection.binder"],
  ["Collections", "Page Up, Page Down", "Show the previous or next binder page"],
  ["Editing", "Ctrl+Z", "undo"],
  ["Editing", "Ctrl+Y", "redo"],
  ["Decks", "Ctrl+O", "openDeck"],
  ["General", "Esc", "Close the dialog, menu, scanner, About guide or Administration, or clear the selection"],
];

export function useActions(store: Store): Record<string, Action> {
  return useMemo(() => {
    const { prefs, deck } = store;
    const selected = store.selectedCard;
    const open = store.collections?.find((item) => item.id === prefs.openCollection) ?? null;
    const target = store.collections?.find((item) => item.id === prefs.targetCollection) ?? null;
    const picked = store.checked.size;
    const noCollection = () => store.flash("Create a collection first", "err");
    const openTrade = store.openTrade;
    const noTrade = () => store.flash("Start or open a trade first", "err");
    const showTab = (tab: CollectionTab) => {
      store.setView("collection");
      store.setCollectionTab(tab);
    };
    const showDeckTab = (tab: DeckTab) => {
      store.setView("deck");
      store.setDeckTab(tab);
    };
    const entry = store.view === "collection" && store.selection?.view === "collection"
      ? store.collection?.find((item) => entryKey(item) === store.selection?.key) ?? null : null;
    const markable = store.view === "collection" ? store.pickedEntries() : [];
    // a zone button shows only that zone in the deck list and makes it where Add puts cards; All shows every zone and adds to Main
    const setZone = (zone: Zone | "all") => {
      store.setPrefs({ zone: zone === "all" ? "main" : zone, deckZoneView: zone });
      store.flash(zone === "all" ? "Showing every zone. New deck cards go to the main deck" : `Showing ${zoneLabel(zone)}. New deck cards go to ${zone === "main" ? "the main deck" : `the ${zone}`}`);
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
    const allTrade = markable.length > 0 && markable.every((item) => item.trade >= item.quantity && !item.proxy);
    const deckCard = store.view === "deck" && store.selection?.view === "deck" ? deck?.cards.find((card) => String(card.entry_id) === store.selection?.key) ?? null : null;

    const actions: Record<string, Action> = {
      "view.home": { label: "Home", short: "Home", icon: "home", on: store.view === "home", run: () => store.setView("home") },
      "view.cards": { label: "Card search", short: "Search", icon: "cards", key: "1", on: store.view === "cards", run: () => store.setView("cards") },
      "io.import": { label: "Import...", short: "Import", icon: "csvin", run: () => importWindow(store) },
      "io.export": { label: "Export...", short: "Export", icon: "csv", run: () => exportWindow(store) },
      "trade.toggle": {
        label: allTrade ? "Unmark for trade" : "Mark for trade", short: "For trade", icon: "trade", on: allTrade, disabled: !markable.length,
        run: () => void store.markTrade(markable, !allTrade),
      },
      "deck.toCollection": {
        label: "Add deck to collection...", short: "To collection", icon: "addcol", disabled: !deck,
        run: () => (deck ? addDeckToCollectionDialog(store, deck) : store.flash("Open a deck first", "err")),
      },
      "deck.linkOwned": {
        label: "Link owned copies", short: "Link owned", icon: "link", disabled: !deck,
        run: () => void store.linkOwnedCopies(),
      },
      "deck.link": {
        label: "Link copies...", short: "Link copies", icon: "link", disabled: !deckCard,
        run: () => (deckCard ? void linkDialog(store, deckCard) : store.flash("Select a card in the deck first", "err")),
      },
      "prices.pictures": {
        label: "Prices on pictures", short: "Prices", icon: prefs.currency, on: prefs.pricesOnPictures,
        run: () => { store.setPrefs({ pricesOnPictures: !prefs.pricesOnPictures }); store.flash(prefs.pricesOnPictures ? "Prices on pictures off" : "Prices on pictures on"); },
      },
      cardLayout: { label: "Card layout...", short: "Card layout", icon: "panels", run: cardLayoutDialog },
      // 0.21.0: the store whose prices every figure uses, chosen per account
      "prices.source": {
        label: "Main price source...", short: "Price source", icon: prefs.currency,
        run: () => dialog("Main price source", [["source", "Main price source", prefs.mainPriceSource, "select", PRICE_SOURCES]], async (values) => {
          const source = String(values.source) as Prefs["mainPriceSource"];
          // saved at once, so the prices loaded next come from the new source
          await request("/api/prefs", { method: "PUT", body: JSON.stringify({ ...prefs, mainPriceSource: source }) });
          store.setPrefs({ mainPriceSource: source });
          await store.refreshAfterChange();
          refreshCardSearches();
          store.flash(`Prices now come from ${PRICE_SOURCES.find(([id]) => id === source)?.[1] ?? source}`);
        }, "Save", <p className="note">Collection value, statistics, deck value, Purchases, trades, the print list and sorting by price use this store. When it has no price for a printing and finish, TCGplayer, Scryfall, Card Kingdom and CardSphere are tried in that order. Value when pulled and Value when added keep the price they were saved with.</p>, 480),
      },
      "prices.buylist": {
        label: "Buylist prices in lists", short: "Buylist", icon: prefs.currency, on: prefs.showBuylist,
        run: () => { store.setPrefs({ showBuylist: !prefs.showBuylist }); store.flash(prefs.showBuylist ? "Buylist prices hidden" : "Buylist prices shown in collection and deck lists"); },
      },
      // 0.21.0: precons from MTGJSON's deck list
      "precon.deck": { label: "Add precon as deck...", short: "Precon deck", icon: "deck", run: () => preconDeckDialog(store) },
      "precon.collection": { label: "Add precon to collection...", short: "Precon to collection", icon: "addcol", run: () => preconCollectionDialog(store) },
      // 0.21.0: a product found by its barcode, and virtual packs from booster contents
      "purchases.barcode": { label: "Scan barcode...", short: "Scan barcode", icon: "scan", run: () => barcodeDialog(store, () => store.setView("purchases")) },
      "boosters.open": { label: "Open virtual packs...", short: "Virtual packs", icon: "cards", run: () => virtualPacksDialog(store) },
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
        label: "Select all cards", short: "Select all", icon: "selectall", key: "Ctrl+A", disabled: store.view !== "collection" || !store.visibleCollection.length,
        run: store.pickAll,
      },
      removePicked: {
        label: "Remove selected...", short: "Remove", icon: "del", key: "Delete", disabled: store.view !== "collection" || !picked,
        run: () => void store.removePicked(),
      },
      reducePicked: {
        label: "Reduce to 1", short: "Reduce to 1", icon: "del", disabled: store.view !== "collection" || !picked,
        run: () => void store.reducePicked(),
      },
      movePicked: {
        label: "Move selected...", short: "Move", icon: "move", disabled: store.view !== "collection" || !picked || (store.collections?.length ?? 0) < 2,
        run: () => moveDialog(store, store.pickedEntries()),
      },
      exportMissing: { label: "Export missing cards...", short: "Export missing", icon: "csv", disabled: !open?.sets.length || open.completion === "none", run: () => exportWindow(store, "missing") },
      "collection.send": {
        label: "Send collection...", short: "Send", icon: "send", disabled: !open,
        run: () => (open ? void sendDialog(store, "collection", open) : noCollection()),
      },
      "collection.sharing": { label: "Collection sharing...", short: "Sharing", icon: "people", disabled: !open, run: () => sharingDialog(store, "collection") },
      inbox: {
        label: store.offers.inbox.length + store.waitingTrades ? `Inbox (${store.offers.inbox.length + store.waitingTrades})...` : "Inbox...", short: "Inbox", icon: "inbox",
        run: () => inboxDialog(store),
      },
      "view.deck": { label: "Deck view", short: "Deck", icon: "deck", key: "3", on: store.view === "deck", run: () => store.setView("deck") },
      "view.trade": { label: "Trade view", short: "Trade", icon: "trade", key: "4", on: store.view === "trade", run: () => store.setView("trade") },
      "view.proxies": { label: "Proxies view", short: "Proxies", icon: "print", key: "5", on: store.view === "proxies", run: () => store.setView("proxies") },
      "view.purchases": { label: "Purchases view", short: "Purchases", icon: "usd", key: "6", on: store.view === "purchases", run: () => store.setView("purchases") },
      "purchases.new": { label: "New purchase...", short: "New purchase", icon: "usd", run: () => newEntry(store, "purchase", (entry) => { store.setView("purchases"); void entry; }) },
      "purchases.sale": {
        label: picked ? "Sell selected cards..." : "New card sale...", short: "Sell", icon: "usd",
        run: () => newEntry(store, "card_sale", () => store.setView("purchases"), picked && store.view === "collection" ? saleCopies(store) : []),
      },
      "purchases.export": {
        label: "Export purchase history...", short: "Export purchases", icon: "csv",
        run: () => void choiceDialog("Export purchase history", "Export one row per entry, or one row per product and card.", [["entries", "Entries"], ["lines", "Lines"]])
          .then((what) => { if (what) void exportPurchases(store, what); }),
      },
      "proxies.print": {
        label: "Print list", short: "Print list", icon: "print", on: store.view === "proxies" && prefs.proxyTab === "print",
        run: () => { store.setPrefs({ proxyTab: "print" }); store.setView("proxies"); },
      },
      "proxies.maker": {
        label: "Card maker", short: "Card maker", icon: "maker", on: store.view === "proxies" && prefs.proxyTab === "maker",
        run: () => { store.setPrefs({ proxyTab: "maker" }); store.setView("proxies"); },
      },
      "proxies.sets": {
        label: "Custom sets", short: "Custom sets", icon: "sets", on: store.view === "proxies" && prefs.proxyTab === "sets",
        run: () => { store.setPrefs({ proxyTab: "sets" }); store.setView("proxies"); },
      },
      "proxies.deck": { label: "Print a deck...", short: "Print deck", icon: "printdeck", run: () => addFromDeckDialog(store) },
      "proxies.missing": { label: "Print missing cards...", short: "Print missing", icon: "missing", run: () => addFromDeckDialog(store, true) },
      "collection.stats": {
        label: "Collection statistics", short: "Statistics", icon: "stats", on: store.view === "collection" && store.collectionTab === "stats", run: () => showTab("stats"),
      },
      "collection.binder": {
        label: "Binder layout", short: "Binder", icon: "binder", key: "B", on: store.layout === "binder",
        run: () => {
          const next = store.layout === "binder" ? "grid" : "binder";
          store.setCollectionLayout(next);
          if (store.view !== "collection" || store.collectionTab !== "cards") showTab("cards");
          store.flash(next === "binder" ? "Binder layout" : "Grid layout");
        },
      },
      "collection.grid": {
        label: "Grid layout", short: "Grid", icon: "grid", on: store.layout === "grid",
        run: () => { store.setCollectionLayout("grid"); if (store.view !== "collection" || store.collectionTab !== "cards") showTab("cards"); },
      },
      "collection.list": {
        label: "List layout", short: "List", icon: "listview", on: store.layout === "list",
        run: () => { store.setCollectionLayout("list"); if (store.view !== "collection" || store.collectionTab !== "cards") showTab("cards"); },
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
      "trade.new": { label: "New trade...", short: "New trade", icon: "tradenew", run: () => newTradeDialog(store) },
      "trade.rename": {
        label: "Rename trade...", short: "Rename", icon: "edit", disabled: !openTrade || openTrade.status === "done",
        run: () => (openTrade ? renameTradeDialog(store, openTrade) : noTrade()),
      },
      "trade.complete": {
        label: "Complete trade...", short: "Complete", icon: "done",
        disabled: !openTrade || openTrade.status !== "open" || !!openTrade.with || !openTrade.lines.length,
        run: () => (openTrade ? completeTradeDialog(store, openTrade) : noTrade()),
      },
      "trade.send": {
        label: "Send trade...", short: "Send", icon: "send", disabled: !openTrade || openTrade.status !== "open" || !openTrade.mine || !!openTrade.with,
        run: () => (openTrade ? void sendTradeDialog(store, openTrade) : noTrade()),
      },
      "trade.cancel": {
        label: openTrade?.status === "cancelled" && !openTrade.with ? "Reopen trade" : "Cancel trade", short: "Cancel",
        icon: "clear", disabled: !openTrade || openTrade.status === "done" || (openTrade.status === "cancelled" && !!openTrade.with),
        run: () => (openTrade ? void store.cancelTrade(openTrade) : noTrade()),
      },
      "trade.delete": {
        label: "Delete trade...", short: "Delete", icon: "del", disabled: !openTrade || !openTrade.mine,
        run: () => (openTrade ? void store.deleteTrade(openTrade) : noTrade()),
      },
      "trade.copy": {
        label: "Copy trade list", short: "Copy list", icon: "copy", disabled: !openTrade?.lines.length,
        run: () => void store.copyTrade(openTrade),
      },
      "trade.export": {
        label: "Export trade list", short: "Export", icon: "csv", disabled: !openTrade?.lines.length,
        run: () => store.exportTrade(openTrade),
      },
      "trade.share": { label: "Share trade binder...", short: "Share binder", icon: "share", run: () => shareBinderDialog(store) },
      "wishlist.add": {
        label: "Add to wishlist", short: "Wishlist", icon: "wish", key: "W", disabled: !selected,
        run: () => (selected
          ? void store.addToWishlist([{ cardId: selected.id, foil: prefs.foil ? 1 : 0, condition: "NM", language: "en", proxy: false, quantity: 1 }], selected.name)
          : store.flash("Select a card first", "err")),
      },
      "wishlist.missing": {
        label: "Add missing cards to wishlist", short: "Missing to wishlist", icon: "wish", disabled: !open?.sets.length || open.kind === "wishlist",
        run: () => void store.addMissingToWishlist(),
      },
      "deck.cards": { label: "Deck cards", short: "Cards", icon: "deck", on: store.view === "deck" && store.deckTab === "cards", run: () => showDeckTab("cards") },
      "deck.ownership": { label: "Deck ownership", short: "Ownership", icon: "owned", on: store.view === "deck" && store.deckTab === "ownership", run: () => showDeckTab("ownership") },
      "deck.stats": { label: "Deck statistics", short: "Statistics", icon: "stats", on: store.view === "deck" && store.deckTab === "stats", run: () => showDeckTab("stats") },
      "deck.playtest": { label: "Playtest", short: "Playtest", icon: "playtest", disabled: !deck, on: store.view === "deck" && store.deckTab === "playtest", run: () => showDeckTab("playtest") },
      "deck.history": { label: "Deck history", short: "History", icon: "history", disabled: !deck, on: store.view === "deck" && store.deckTab === "history", run: () => showDeckTab("history") },
      "deck.format": { label: "Deck format...", short: "Format", icon: "legal", disabled: !deck, run: () => formatDialog(store) },
      "deck.editText": { label: "Edit as text...", short: "Edit as text", icon: "edittext", disabled: !deck, run: () => editTextDialog(store) },
      "deck.tags": {
        label: "Tags...", short: "Tags", icon: "tag", disabled: !deckCard,
        run: () => (deckCard ? tagsDialog(store, deckCard) : store.flash("Select a card in the deck first", "err")),
      },
      "deck.missingWishlist": {
        label: "Add missing deck cards to wishlist", short: "Missing to wishlist", icon: "wish", disabled: !deck,
        run: () => void store.addDeckMissingToWishlist(),
      },
      "deck.exportMissing": {
        label: "Export missing deck cards (text)", short: "Missing text", icon: "txt", disabled: !deck,
        run: () => void store.exportDeckMissing(),
      },
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
        run: () => { store.clearFilters(); store.flash("Filters cleared"); },
      },
      scan: { label: "Scan card...", short: "Scan card", icon: "scan", run: () => store.setScannerOpen(true) },
      addCollection: {
        label: "Add to collection", short: "Add to collection", icon: "addcol", key: "Enter", disabled: !selected || (!target && !(prefs.addTo === "deck" && deck)),
        run: () => { if (selected) void addCard(store, selected); else store.flash("Select a card first", "err"); },
      },
      addDeck: {
        label: "Add to deck", short: "Add to deck", icon: "adddeck", key: "Shift+Enter", disabled: !selected || !deck,
        run: () => { if (selected) void addCard(store, selected, "deck"); else store.flash("Select a card first", "err"); },
      },
      foil: {
        label: "Add as foil", short: "Add as foil", icon: "foil", key: "F", on: prefs.foil,
        run: () => { store.setPrefs({ foil: !prefs.foil }); store.flash(prefs.foil ? "Cards are added as regular copies" : "Cards are added as foil"); },
      },
      "zone.all": { label: "All zones", short: "All", icon: "zone", on: prefs.deckZoneView === "all", run: () => setZone("all") },
      "zone.main": { label: "Main deck", short: "Main", icon: "zmain", on: prefs.deckZoneView === "main", run: () => setZone("main") },
      "zone.sideboard": { label: "Sideboard", short: "Sideboard", icon: "zside", on: prefs.deckZoneView === "sideboard", run: () => setZone("sideboard") },
      "zone.commander": { label: "Commander", short: "Commander", icon: "zcmd", on: prefs.deckZoneView === "commander", run: () => setZone("commander") },
      "zone.maybeboard": { label: "Maybeboard", short: "Maybeboard", icon: "zmaybe", on: prefs.deckZoneView === "maybeboard", run: () => setZone("maybeboard") },
      "zone.cycle": {
        label: "Cycle target zone", short: "Cycle zone", icon: "zone", key: "Z",
        run: () => {
          const order: Array<Zone | "all"> = ["all", "commander", "main", "sideboard", "maybeboard"];
          setZone(order[(order.indexOf(prefs.deckZoneView) + 1) % order.length]!);
        },
      },
      updateCatalog: {
        label: "Update card database", short: "Update database", icon: "update",
        disabled: !store.user.admin || store.catalogRequestPending || !store.catalog || store.catalog.update.isUpdating,
        run: () => void store.updateCatalog(),
      },
      importCollection: { label: "Import collection...", short: "Import", icon: "csvin", run: () => importWindow(store, "collection") },
      exportCollection: { label: "Export collection...", short: "Export", icon: "csv", run: () => exportWindow(store, "collection") },
      backup: { label: "Download backup", short: "Backup", icon: "backup", run: () => void store.downloadBackup() },
      restore: { label: "Restore backup...", short: "Restore", icon: "restore", run: () => void store.restoreBackup() },
      newDeck: { label: "New deck...", short: "New deck", icon: "newdeck", run: () => newDeckDialog(store) },
      openDeck: {
        label: "Open deck...", short: "Open deck", icon: "opendeck", key: "Ctrl+O",
        run: () => {
          if (!store.decks.length) {
            store.flash("There are no decks yet. Use New deck to create one.", "err");
            return;
          }
          dialog("Open deck", [
            ["deck", "Deck", deck?.id ?? store.decks[0]?.id ?? "", "select",
              store.decks.map((item) => [item.id, `${item.name} (${formatName(item.format)}, ${item.card_count ?? 0} cards)`])],
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
      importDeck: { label: "Import decklist...", short: "Import list", icon: "listin", disabled: !deck, run: () => importWindow(store, "deck") },
      exportDeck: { label: "Export deck...", short: "Export", icon: "txt", disabled: !deck, run: () => exportWindow(store, "deck") },
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
        }, "Save"),
      },
      "workspace.manage": {
        label: "Manage workspaces...", short: "Manage", icon: "panels",
        run: () => customDialog("Manage workspaces", () => <WorkspaceList />, 420),
      },
      "workspace.reset": {
        label: "Reset panels", short: "Reset panels", icon: "panels",
        run: () => store.applyWorkspace(PRESET_NAMES.includes(prefs.workspace) ? prefs.workspace : "Deck building"),
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
        }, "Change password"),
      },
      signout: {
        label: "Sign out", short: "Sign out", icon: "signout",
        run: () => {
          if (isApp()) {
            void confirmDialog("Sign out", "Sign out this phone? Changes not yet sent to the server are lost, and the copy of your library on this phone is removed.", "Sign out")
              .then((ok) => { if (ok) void signOutApp(); });
            return;
          }
          void request("/api/logout", { method: "POST", body: "{}" }).finally(() => { window.location.href = "/login"; });
        },
      },
      admin: {
        label: "Administration...", short: "Administration", icon: "gear", disabled: !store.user.admin,
        run: () => store.openAdmin(),
      },
      devices: {
        label: "Devices...", short: "Devices", icon: "phone",
        run: () => customDialog("Devices", () => <DeviceList />, 480),
      },
      "app.sync": {
        label: "Sync now", short: "Sync", icon: "sync", disabled: !isApp(),
        run: () => {
          store.flash("Syncing");
          void syncNow(true).then(() => {
            const status = syncStatus();
            if (status.state === "offline") store.flash("The server cannot be reached. Changes wait on this phone.", "err");
            else store.flash(status.pending ? `${status.pending} changes still waiting` : "Synced");
          });
        },
      },
      "app.notifications": {
        label: "Notifications...", short: "Notifications", icon: "bell", disabled: !isApp(),
        run: () => {
          const settings = appSettings();
          dialog("Notifications", [
            ["enabled", "Notify me about new offers in the Inbox", settings.notifications, "check"],
            ["wifiOnly", "Check only on Wi-Fi", settings.wifiOnly, "check"],
          ], async (values) => {
            const enabled = values.enabled === true;
            const wifiOnly = values.wifiOnly === true;
            const result = await native().setNotifications({ enabled, wifiOnly }).catch(() => ({ granted: false }));
            if (enabled && !result.granted) {
              store.flash("Notifications are not allowed for Mana Vault in the Android settings.", "err");
              await saveSettings({ notifications: false, wifiOnly });
              return;
            }
            await saveSettings({ notifications: enabled, wifiOnly });
            store.flash(enabled ? "Notifications on" : "Notifications off");
          }, "Save");
        },
      },
      "app.update": {
        label: "Check for updates...", short: "Update", icon: "update", disabled: !isApp(),
        run: () => { void checkForUpdate(true); },
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
      {!names.length && <p className="note">No saved workspaces</p>}
    </div>
  );
}

