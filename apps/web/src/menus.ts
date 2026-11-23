// ---------- menus as data: the menu bar, the mode tabs and the account menu; every item is an action name ----------
/** A menu of the menu bar. "-" is a separator. "workspaces" stands for the list of workspaces. */
export type Menu = { id: string; name: string; items: string[] };

export const MENUS: Menu[] = [
  {
    id: "file", name: "File", items: [
      "collection.new", "newDeck", "-", "precon.deck", "precon.collection", "-", "io.import", "io.export", "purchases.export", "-", "purchases.new", "purchases.sale", "purchases.barcode", "boosters.open", "-", "scan", "-", "backup", "restore", "-", "updateCatalog", "-", "signout",
    ],
  },
  { id: "edit", name: "Edit", items: ["undo", "redo", "-", "find", "pickAll", "clearFilters"] },
  {
    id: "view", name: "View", items: [
      "view.purchases", "-", "theme.light", "theme.dark", "theme.system", "-", "prices.pictures", "prices.source", "prices.buylist", "cardLayout", "-",
      "panel.filters", "panel.collections", "panel.decks", "panel.card", "panel.decklist", "panel.review",
    ],
  },
  { id: "help", name: "Help", items: ["shortcuts", "about"] },
];

/** The mode tabs under the menu bar: each switches the program to that part, like the phone's bottom bar. */
export const MODE_TABS: Array<{ action: string; name: string; view: string }> = [
  { action: "view.home", name: "Home", view: "home" },
  { action: "view.cards", name: "Search", view: "cards" },
  { action: "view.collection", name: "Collection", view: "collection" },
  { action: "view.deck", name: "Decks", view: "deck" },
  { action: "view.trade", name: "Trade", view: "trade" },
  { action: "view.proxies", name: "Proxies", view: "proxies" },
  { action: "view.purchases", name: "Purchases", view: "purchases" },
];

/**
 * The account menu at the top right (desktop and phone). Workspaces live here since 0.18.0: switching (the list of
 * workspaces) and saving, managing and resetting them. Workspaces are left out on a phone (DESKTOP_ONLY).
 */
export const ACCOUNT_MENU = ["inbox", "password", "devices", "admin", "-", "workspaces", "-", "workspace.save", "workspace.manage", "workspace.reset", "-", "signout"];
export const APP_MENU = ["app.sync", "app.notifications", "app.update"];

/** Menu items that only make sense with the desktop panels. */
export const DESKTOP_ONLY = /^(panel\.|workspace\.|workspaces$)/;
