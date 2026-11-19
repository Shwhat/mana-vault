// ---------- ribbon and menus as data: every item is an action name ----------
export type RibbonGroup = { name: string; items: string[] };
export type RibbonTab = { id: string; name: string; contextual?: "deck"; groups: RibbonGroup[] };

export const DEFAULT_RIBBON: RibbonTab[] = [
  {
    id: "home", name: "Home", groups: [
      { name: "Search", items: ["find", "scan", "clearFilters"] },
      { name: "Add", items: ["addCollection", "collection.target", "addDeck", "foil"] },
      { name: "Views", items: ["view.cards", "view.collection", "view.deck"] },
      { name: "Edit", items: ["undo", "redo"] },
    ],
  },
  {
    id: "collection", name: "Collection", groups: [
      { name: "Collection", items: ["collection.new", "collection.settings", "collection.delete"] },
      { name: "View", items: ["collection.cards", "collection.completion", "collection.missing"] },
      { name: "Selection", items: ["pickAll", "movePicked", "removePicked"] },
      { name: "Import and export", items: ["importCollection", "exportCollection", "exportMissingText", "exportMissingCsv"] },
      { name: "Share", items: ["collection.send", "collection.sharing", "inbox"] },
      { name: "Backup", items: ["backup", "restore"] },
    ],
  },
  {
    id: "decks", name: "Decks", groups: [
      { name: "Deck", items: ["newDeck", "openDeck", "deck.rename", "deck.delete"] },
      { name: "Import", items: ["importDeck"] },
      { name: "Export", items: ["exportDeckText", "exportDeckCsv"] },
      { name: "Share", items: ["deck.send", "deck.sharing", "inbox"] },
    ],
  },
  {
    id: "database", name: "Database", groups: [
      { name: "Card database", items: ["updateCatalog"] },
    ],
  },
  {
    id: "view", name: "View", groups: [
      { name: "Theme", items: ["theme.light", "theme.dark", "theme.system"] },
      { name: "Panels", items: ["panel.filters", "panel.collections", "panel.decks", "panel.card", "panel.decklist", "panel.review"] },
      { name: "Workspace", items: ["workspace.save", "workspace.manage", "workspace.reset"] },
      { name: "Ribbon", items: ["ribbon.customize"] },
    ],
  },
  {
    id: "help", name: "Help", groups: [
      { name: "Help", items: ["shortcuts", "about"] },
    ],
  },
  {
    id: "deck", name: "Deck", contextual: "deck", groups: [
      { name: "Target zone", items: ["zone.main", "zone.sideboard", "zone.commander"] },
      { name: "Build", items: ["addDeck", "view.deck", "view.cards"] },
      { name: "Export", items: ["exportDeckText", "exportDeckCsv"] },
    ],
  },
];

export type MenuItem = string | "-";
export const MENUS: Array<{ name: string; items: MenuItem[] }> = [
  {
    name: "File", items: [
      "importCollection", "exportCollection", "exportMissingText", "exportMissingCsv", "-", "backup", "restore", "-",
      "importDeck", "exportDeckText", "exportDeckCsv",
    ],
  },
  { name: "Edit", items: ["undo", "redo", "-", "pickAll", "movePicked", "removePicked", "-", "find", "clearFilters"] },
  { name: "Cards", items: ["scan", "-", "addCollection", "collection.target", "addDeck", "foil", "-", "updateCatalog"] },
  {
    name: "Collection", items: [
      "collection.new", "collection.settings", "collection.delete", "-", "collection.cards", "collection.completion", "collection.missing", "-",
      "collection.send", "collection.sharing", "inbox",
    ],
  },
  {
    name: "Deck", items: [
      "newDeck", "openDeck", "deck.rename", "deck.delete", "-", "zone.main", "zone.sideboard", "zone.commander", "zone.cycle", "-",
      "deck.send", "deck.sharing", "inbox",
    ],
  },
  {
    name: "View", items: [
      "view.cards", "view.collection", "view.deck", "-", "theme.light", "theme.dark", "theme.system", "-",
      "panel.filters", "panel.collections", "panel.decks", "panel.card", "panel.decklist", "panel.review", "-",
      "workspace.save", "workspace.manage", "workspace.reset", "ribbon.customize",
    ],
  },
  { name: "Help", items: ["shortcuts", "about"] },
];
