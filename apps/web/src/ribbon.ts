// ---------- ribbon as data: every item is an action name ----------
/**
 * A group with a context shows only while that part of the program is in use (a deck is open, or the collection view
 * is shown). Items whose action does not apply at the moment are hidden. Items named "menu.*" are one button that
 * opens a list of related commands.
 */
export type RibbonContext = "deck" | "collection";
export type RibbonGroup = { name: string; items: string[]; context?: RibbonContext };
export type RibbonTab = { id: string; name: string; groups: RibbonGroup[] };
export type RibbonSize = "large" | "compact" | "icons";

export const DEFAULT_RIBBON: RibbonTab[] = [
  {
    id: "home", name: "Home", groups: [
      { name: "Search", items: ["find", "scan", "clearFilters"] },
      { name: "Views", items: ["view.home", "view.cards", "view.collection", "view.deck", "view.trade", "view.proxies"] },
      { name: "Files", items: ["io.import", "io.export", "menu.backup"] },
      { name: "Edit", items: ["undo", "redo"] },
    ],
  },
  {
    id: "collection", name: "Collection", groups: [
      { name: "Collection", items: ["collection.new", "collection.settings", "collection.delete"] },
      { name: "Selection", context: "collection", items: ["pickAll", "movePicked", "removePicked", "reducePicked", "copy.details", "trade.toggle"] },
      { name: "Layout", context: "collection", items: ["collection.grid", "collection.binder", "collection.list"] },
      { name: "Wishlist", context: "collection", items: ["wishlist.missing"] },
      { name: "Share", items: ["collection.send", "collection.sharing"] },
    ],
  },
  {
    id: "decks", name: "Decks", groups: [
      { name: "Deck", items: ["newDeck", "openDeck", "deck.rename", "deck.delete"] },
      { name: "Build", context: "deck", items: ["addDeck", "menu.zone", "deck.link", "deck.linkOwned", "deck.tags", "deck.editText"] },
      { name: "Check", context: "deck", items: ["deck.format", "deck.playtest", "deck.history"] },
      { name: "Missing", context: "deck", items: ["deck.missingWishlist"] },
      { name: "Share", context: "deck", items: ["deck.send", "deck.sharing"] },
    ],
  },
  {
    id: "trade", name: "Trade", groups: [
      { name: "Open", items: ["view.trade"] },
      { name: "Trade", items: ["trade.new", "trade.complete", "trade.send"] },
      { name: "Share", items: ["trade.copy", "trade.share"] },
    ],
  },
  {
    id: "proxies", name: "Proxies", groups: [
      { name: "Open", items: ["proxies.print", "proxies.maker"] },
      { name: "Add to print list", items: ["proxies.deck", "proxies.missing"] },
    ],
  },
  {
    id: "view", name: "View", groups: [
      { name: "Look", items: ["menu.theme", "menu.currency"] },
      { name: "Panels", items: ["menu.panels", "menu.workspace"] },
      { name: "Ribbon", items: ["menu.ribbonSize", "ribbon.customize"] },
      { name: "Card database", items: ["updateCatalog"] },
    ],
  },
  {
    id: "help", name: "Help", groups: [
      { name: "Help", items: ["shortcuts", "about"] },
    ],
  },
];

/** The commands behind each "menu.*" button, in order. */
export const RIBBON_MENUS: Record<string, string[]> = {
  "menu.theme": ["theme.light", "theme.dark", "theme.system"],
  "menu.currency": ["currency.usd", "currency.eur"],
  "menu.panels": ["panel.filters", "panel.collections", "panel.decks", "panel.card", "panel.decklist", "panel.review"],
  "menu.workspace": ["workspace.save", "workspace.manage", "workspace.reset"],
  "menu.zone": ["zone.main", "zone.sideboard", "zone.commander", "zone.maybeboard"],
  "menu.backup": ["backup", "restore"],
  "menu.ribbonSize": ["ribbon.large", "ribbon.compact", "ribbon.icons"],
};

/** The account menu at the top right (desktop and phone). */
export const ACCOUNT_MENU = ["inbox", "password", "devices", "signout"];
export const APP_MENU = ["app.sync", "app.notifications", "app.update"];

/** Ribbon items that only make sense with the desktop panels and ribbon. */
export const DESKTOP_ONLY = /^(panel\.|workspace\.|ribbon\.|menu\.panels|menu\.workspace|menu\.ribbonSize|view\.home)/;
