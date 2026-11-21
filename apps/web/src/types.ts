// ---------- shared data types ----------
export type Card = {
  id: string;
  oracle_id?: string;
  /** A card made in the card maker (0.9.0). */
  custom?: boolean;
  name: string;
  mana_cost: string | null;
  mana_value: number | null;
  type_line: string;
  oracle_text: string | null;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  colors: string;
  image_url: string | null;
  released_at?: string | null;
  artist?: string | null;
  flavor_name?: string | null;
  prices?: Prices;
  /** The finishes the printing is made in, such as "nonfoil,foil" (0.11.0). */
  finishes?: string;
  /** Scryfall's promo types, such as "surgefoil" (0.12.0). */
  promo_types?: string;
  /** The printed language when it is not English (0.12.0). */
  lang?: string;
  /** Grouped card search: how many printings matched (0.12.0). */
  printings?: number;
};

export type Prices = { usd: number | null; usd_foil: number | null; usd_etched: number | null; eur: number | null; eur_foil: number | null };
export type PriceFields = { price_usd: number | null; price_usd_foil: number | null; price_usd_etched: number | null; price_eur: number | null; price_eur_foil: number | null };
export type Currency = "usd" | "eur";
/** 0 regular, 1 foil, 2 etched. */
export type FinishCode = 0 | 1 | 2;
export type Condition = "M" | "NM" | "LP" | "MP" | "HP" | "DMG";

export type OwnedIn = { id: string; name: string; wishlist: boolean; regular: number; foil: number; etched: number; proxies?: number; trade: number; allPrintings: number };
export type CardDetail = Card & {
  owned: { regular: number; foil: number; etched: number; proxies?: number; allPrintings: number; collections: OwnedIn[] };
  wanted: OwnedIn[];
  pricesUpdatedAt: string | null;
};

/** One kind of copy in a collection: a printing in one finish, condition and language, real or a proxy. */
export type CopyKey = { cardId: string; foil: FinishCode; condition: Condition; language: string; proxy?: boolean };
/** Details of a copy row that are not part of its key. */
export type CopyExtras = {
  purchase_price: number | null; price_currency: string | null; added_at: string | null; misprint: boolean; altered: boolean; signed: boolean;
};
export type CollectionEntry = Pick<Card, "id" | "name" | "set_code" | "set_name" | "collector_number" | "rarity" | "image_url" | "colors" | "mana_cost" | "mana_value" | "type_line" | "custom" | "promo_types"> &
  PriceFields & {
    oracle_id: string;
    quantity: number;
    /** Scryfall removed the printing (0.15.0); the copy keeps it until its printing is changed. */
    removed?: boolean;
    foil: FinishCode;
    condition: Condition;
    language: string;
    trade: number;
    proxy?: boolean;
    /** The decks this row's copies are linked to. */
    decks?: Array<{ id: string; name: string; quantity: number }>;
    /** The formats the card is legal in, as a comma list. */
    legal?: string;
    /** In All collections: the collection the row belongs to. */
    collection_id?: string;
    collection_name?: string;
  } & Partial<CopyExtras>;
/** The id of the All collections entry in the collection switcher. */
export const ALL_COLLECTIONS = "all";
export type TradeEntry = CollectionEntry & { collection_id: string; collection_name: string };

export type Person = { id: number; name: string };
export type Sharing = { role: "owner" | "member"; owner: Person; displayName: string | null; sharedWith: Person[] };

export type CompletionRule = "none" | "main" | "all" | "names";
export type FinishRule = "any" | "regular" | "foil" | "both";
export type CollectionKind = "collection" | "wishlist";

export type Collection = Sharing & {
  id: string;
  name: string;
  realName: string;
  description: string;
  completion: CompletionRule;
  finish: FinishRule;
  kind: CollectionKind;
  sets: Array<{ code: string; name: string }>;
  entryCount: number;
  cardCount: number;
  tradeCount: number;
  value: { usd: number; eur: number; unpricedUsd: number; unpricedEur: number };
  progress: { owned: number; total: number } | null;
  /** When anything in the collection last changed. */
  updatedAt?: string;
  createdAt?: string;
};

export type SetProgress = {
  code: string; name: string; owned: number; total: number; printedSize: number | null; known: boolean;
  symbolUrl?: string | null; block?: string | null; parentSetCode?: string | null; digital?: boolean; foilOnly?: boolean; nonfoilOnly?: boolean;
};
export type MissingCard = Pick<Card, "id" | "name" | "set_code" | "set_name" | "collector_number" | "rarity" | "colors" | "image_url" | "mana_cost" | "type_line"> & {
  oracle_id: string;
  needs: "any" | "regular" | "foil";
};
export type CompletionReport = {
  completion: CompletionRule;
  finish: FinishRule;
  sets: SetProgress[];
  overall: { owned: number; total: number };
  missing: MissingCard[];
};

export type SetInfo = {
  code: string; name: string; set_type: string; released_at: string | null; printed_size: number | null; printings: number;
  symbolUrl?: string | null; block?: string | null; parentSetCode?: string | null; digital?: boolean; foilOnly?: boolean; nonfoilOnly?: boolean;
};

export type Offer = { id: string; kind: "collection" | "deck"; itemId: string; itemName: string; mode: "copy" | "share" | "transfer"; createdAt: string; user: string };

export const COMPLETION_RULES: Array<[CompletionRule, string]> = [
  ["none", "None (no completion tracking)"],
  ["main", "Main set (numbered cards only)"],
  ["all", "Every printing (variants and promos too)"],
  ["names", "Each card name once"],
];
export const FINISH_RULES: Array<[FinishRule, string]> = [
  ["any", "Any finish"],
  ["regular", "Regular only"],
  ["foil", "Foil only"],
  ["both", "One of each (regular and foil)"],
];
export const SEND_MODES: Array<["copy" | "share" | "transfer", string]> = [
  ["copy", "Copy (they get their own copy)"],
  ["share", "Share (you both edit the same one)"],
  ["transfer", "Transfer (it moves to them)"],
];

export type DeckMode = "normal" | "theme";
export type Zone = "main" | "sideboard" | "commander" | "maybeboard";

export type Deck = Partial<Sharing> & {
  id: string;
  name: string;
  realName?: string;
  format: string;
  mode: DeckMode;
  card_count?: number;
  /** The value of the cards in the deck (not the maybeboard), each at its printing's price. */
  value?: { usd: number; eur: number };
  /** The collection that receives copies added straight to this deck, remembered per deck. */
  collection_id?: string | null;
  created_at?: string;
  updated_at?: string;
  /** The deck's description (Markdown). */
  description?: string;
  cover_card_id?: string | null;
  /** The commander names, joined with " + ". */
  commander?: string | null;
  /** The cover card's picture, or else the first commander's. */
  image_url?: string | null;
};

/** A collection copy that fills a deck card. */
export type DeckLink = CopyKey & { collectionId: string; collectionName: string; quantity: number };

export type DeckCard = Pick<Card, "name" | "mana_cost" | "type_line" | "set_code" | "set_name" | "collector_number" | "image_url" | "custom"> & Partial<PriceFields> & {
  removed?: boolean;
  mana_value?: number | null;
  rarity?: string;
  colors?: string;
  color_identity?: string;
  oracle_text?: string | null;
  legalities?: Record<string, string>;
  /** W, U, B, R, G and C: the mana the card can make. */
  produced_mana?: string;
  tokens?: Array<{ id: string; name: string }>;
  power?: string | null;
  toughness?: string | null;
  tags?: string[];
  /** The finish the deck card is played in: 0 regular, 1 foil, 2 etched (0.10.0). */
  finish?: FinishCode;
  /** The finishes the printing is made in, such as "nonfoil,foil". */
  finishes?: string;
  /** Scryfall's promo types, such as "surgefoil" (0.12.0). */
  promo_types?: string;
  entry_id: number;
  card_id: string;
  oracle_id: string;
  printing_id: string | null;
  quantity: number;
  zone: Zone;
  links?: DeckLink[];
  /** Cards of this deck card with no linked copy. */
  missing?: number;
  /** For a card with missing copies: free copies the account owns, of this version or another one (0.11.0). */
  owned?: Candidate[];
  /** Upgrade wanted: the version wanted instead of this one (0.11.0). */
  want_card_id?: string | null;
  want_finish?: FinishCode;
  want_set_code?: string | null;
  want_collector_number?: string | null;
};

/** A free copy that could fill a deck card. */
export type Candidate = CopyKey & {
  collectionId: string; collectionName: string; set_code: string; set_name: string; collector_number: string; image_url: string | null; quantity: number; free: number;
};

export type DeckDetail = Deck & { cards: DeckCard[] };

export type ImportReport = {
  format?: string;
  formatName?: string;
  matchedRows: number;
  importedQuantity: number;
  unmatched: Array<{ row: number; name: string; reason: string }>;
};

export type CatalogStatus = {
  printingCount: number;
  updatedAt: string | null;
  /** Cards the last update left out because their record failed a check (up to 50 names). */
  skipped?: { count: number; names: string[] };
  /** Scryfall's printing changes applied by the last update (0.15.0). */
  migrations?: { merged: number; removed: number } | null;
  update: {
    scheduled: boolean;
    intervalHours: number | null;
    isUpdating: boolean;
    lastAttemptAt: string | null;
    lastImportedCount: number | null;
    lastError: string | null;
  };
};

export type BackupSummary = {
  createdAt: string;
  printingCount: number;
  collectionCount: number;
  collectionEntryCount: number;
  deckCount: number;
  deckCardCount: number;
};

export type User = { id: number; name: string; admin?: boolean; mustChange?: boolean };

export type View = "home" | "cards" | "collection" | "deck" | "trade" | "proxies" | "about" | "admin";
export type CollectionTab = "cards" | "completion" | "missing" | "stats";
export type DeckTab = "cards" | "add" | "ownership" | "stats" | "playtest" | "description" | "history";
export type DeckView = "list" | "text" | "stacks" | "grid";
export type DeckGroup = "type" | "mana" | "color" | "rarity" | "tag" | "none";
export type DeckSort = "name" | "mana" | "price";
export type CollectionLayout = "list" | "binder" | "grid";
export type GridSize = "s" | "m" | "l";
export type SwitchSort = "recent" | "name" | "created" | "cards" | "value" | "format" | "commander";
export type DeckToken = { id: string; name: string; image_url: string | null; type_line: string; from: string[] };
export type DeckChange = { id: number; at: string; user: string; change: string };

export type Bucket = { key: string; label: string; count: number; value: number };
export type Stats = {
  currency: Currency; entries: number; cards: number; value: number; unpriced: number; average: number | null; median: number | null;
  highest: { name: string; price: number } | null;
  rarity: Bucket[]; color: Bucket[]; type: Bucket[]; curve: Bucket[]; sets: Bucket[]; finish: Bucket[];
};
export type Ownership = {
  mode: DeckMode; currency: Currency; needed: number; owned: number; missing: number; missingValue: number; unpriced: number;
  entries: Array<{
    entryId: number; cardId: string; name: string; zone: Zone; needed: number; owned: number; missing: number; price: number | null; proxies?: number;
    where: Array<{ id: string; name: string; quantity: number }>;
  }>;
};

/** Narrowing of the collection list: chosen by clicking a tag on a row or a bar in Statistics. */
export type Facets = { rarity?: string; color?: string; type?: string; set?: string; curve?: string; finish?: string; trade?: boolean; inDeck?: "yes" | "no"; proxy?: boolean };
export type CollectionSort = "name" | "price-desc" | "price-asc" | "quantity" | "set";

export const CONDITIONS: Array<[Condition, string]> = [
  ["M", "Mint"], ["NM", "Near mint"], ["LP", "Lightly played"], ["MP", "Moderately played"], ["HP", "Heavily played"], ["DMG", "Damaged"],
];
export const LANGUAGES: Array<[string, string]> = [
  ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"],
  ["ja", "Japanese"], ["ko", "Korean"], ["ru", "Russian"], ["zhs", "Simplified Chinese"], ["zht", "Traditional Chinese"],
  ["he", "Hebrew"], ["la", "Latin"], ["grc", "Ancient Greek"], ["ar", "Arabic"], ["sa", "Sanskrit"], ["ph", "Phyrexian"],
];
export const FINISHES: Array<[FinishCode, string]> = [[0, "Regular"], [1, "Foil"], [2, "Etched"]];

// Scryfall's promo types for special foils, with their names; any other promo type ending in "foil" is named from its word
export const SPECIAL_FOILS: Record<string, string> = {
  surgefoil: "Surge foil", galaxyfoil: "Galaxy foil", halofoil: "Halo foil", textured: "Textured foil", manafoil: "Mana foil",
  raisedfoil: "Raised foil", rainbowfoil: "Rainbow foil", confettifoil: "Confetti foil", oilslick: "Oil slick foil", ripplefoil: "Ripple foil",
  fracturefoil: "Fracture foil", doublerainbow: "Double rainbow foil", stepandcompleat: "Step-and-compleat foil", firstplacefoil: "First place foil",
  neonink: "Neon ink foil", invisibleink: "Invisible ink foil", gilded: "Gilded foil", silverfoil: "Silver foil", dragonscalefoil: "Dragon scale foil",
  singularityfoil: "Singularity foil", cosmicfoil: "Cosmic foil", ampersand: "Ampersand foil", embossed: "Embossed foil", headliner: "Headliner foil",
};

/** The special foil a printing is made in, such as "Surge foil", or null for a plain foil. */
export function specialFoil(promoTypes: string | null | undefined): string | null {
  for (const type of String(promoTypes ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    if (SPECIAL_FOILS[type]) return SPECIAL_FOILS[type]!;
    if (type.endsWith("foil") && type.length > 4) return `${type[0]!.toUpperCase()}${type.slice(1, -4)} foil`;
  }
  return null;
}

/** A finish's name for a printing: Regular, Etched, Foil, or the special foil it is made in. */
export const finishLabel = (finish: FinishCode | number | null | undefined, promoTypes?: string | null): string =>
  (finish === 1 ? specialFoil(promoTypes) ?? "Foil" : finish === 2 ? "Etched" : "Regular");
export const languageName = (code: string) => LANGUAGES.find(([id]) => id === code)?.[1] ?? code;
export const conditionName = (code: string) => CONDITIONS.find(([id]) => id === code)?.[1] ?? code;
export const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", M: "Multicolor", C: "Colorless" };
export const CARD_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"] as const;

/** The same rules the server uses for Statistics, so a bar and the list it opens always agree. */
const frontType = (typeLine: string) => typeLine.split(" // ")[0] ?? typeLine;
export const cardTypes = (typeLine: string): string[] => {
  const found = CARD_TYPES.filter((type) => frontType(typeLine).includes(type));
  return found.length ? found : ["Other"];
};
export const colorKey = (colors: string) => (colors.length === 0 ? "C" : colors.length > 1 ? "M" : colors);
export const curveKey = (manaValue: number | null, typeLine: string) => {
  if (frontType(typeLine).includes("Land")) return null;
  const value = Math.floor(manaValue ?? 0);
  return value >= 7 ? "7+" : String(Math.max(0, value));
};

/** The price of one copy: etched uses the etched price or else the foil price; EUR has one foil price. */
export function priceOf(prices: PriceFields, foil: FinishCode, currency: Currency): number | null {
  if (currency === "eur") return foil === 0 ? prices.price_eur : prices.price_eur_foil;
  return foil === 0 ? prices.price_usd : foil === 1 ? prices.price_usd_foil : prices.price_usd_etched ?? prices.price_usd_foil;
}
export const pricesOf = (card: { prices?: Prices }): PriceFields => ({
  price_usd: card.prices?.usd ?? null, price_usd_foil: card.prices?.usd_foil ?? null, price_usd_etched: card.prices?.usd_etched ?? null,
  price_eur: card.prices?.eur ?? null, price_eur_foil: card.prices?.eur_foil ?? null,
});
/** A printing's price in any finish, regular first: used where no finish is chosen, such as search results. */
export const anyPrice = (fields: PriceFields, currency: Currency) => (currency === "eur"
  ? fields.price_eur ?? fields.price_eur_foil
  : fields.price_usd ?? fields.price_usd_foil ?? fields.price_usd_etched);
export function money(value: number | null | undefined, currency: Currency): string {
  if (value === null || value === undefined) return "No price";
  return new Intl.NumberFormat(currency === "eur" ? "de-DE" : "en-US", { style: "currency", currency: currency.toUpperCase() }).format(value);
}
export const copyKey = (entry: Pick<CollectionEntry, "id" | "foil" | "condition" | "language" | "proxy">): CopyKey =>
  ({ cardId: entry.id, foil: entry.foil, condition: entry.condition, language: entry.language, proxy: !!entry.proxy });
export const sameCopy = (a: CopyKey, b: CopyKey) =>
  a.cardId === b.cardId && a.foil === b.foil && a.condition === b.condition && a.language === b.language && !!a.proxy === !!b.proxy;
/** A short description of a copy beyond its printing, such as "Foil, Lightly played, Japanese". Regular, Near mint, English are left out. */
export function copyLabel(entry: Pick<CollectionEntry, "foil" | "condition" | "language"> & { promo_types?: string }): string {
  return [entry.foil ? finishLabel(entry.foil, entry.promo_types) : "", entry.condition !== "NM" ? conditionName(entry.condition) : "",
    entry.language !== "en" ? languageName(entry.language) : ""].filter(Boolean).join(", ");
}
/** The price of a copy row: proxies have none. */
export const copyPrice = (entry: CollectionEntry, currency: Currency): number | null => (entry.proxy ? null : priceOf(entry, entry.foil, currency));

export type Filters = {
  query: string;
  type: string;
  set: string;
  color: string;
  rarity: string;
  format: string;
  mvMin: string;
  mvMax: string;
  // 0.12.0: filters answered by the card database (tags, artist, treatments...)
  art: string;
  role: string;
  name: string;
  text: string;
  creature: string;
  keyword: string;
  powMin: string;
  powMax: string;
  touMin: string;
  touMax: string;
  priceMin: string;
  priceMax: string;
  /** "foil" or "etched": printings made in that finish. */
  made: string;
  /** "owned" or "notowned". */
  owned: string;
  artist: string;
  yearMin: string;
  yearMax: string;
  /** fullart, borderless, showcase, extendedart or promo. */
  frame: string;
  /** A Scryfall promo type for special foils, such as surgefoil. */
  foilType: string;
};

export const EMPTY_FILTERS: Filters = {
  query: "", type: "", set: "", color: "", rarity: "", format: "", mvMin: "", mvMax: "",
  art: "", role: "", name: "", text: "", creature: "", keyword: "", powMin: "", powMax: "", touMin: "", touMax: "",
  priceMin: "", priceMax: "", made: "", owned: "", artist: "", yearMin: "", yearMax: "", frame: "", foilType: "",
};

export const ZONES: Array<{ id: Zone; label: string }> = [
  { id: "main", label: "Main deck" },
  { id: "sideboard", label: "Sideboard" },
  { id: "commander", label: "Commander" },
  { id: "maybeboard", label: "Maybeboard" },
];

export const FORMATS = [
  "commander", "standard", "pioneer", "modern", "legacy", "pauper", "vintage", "brawl", "standardbrawl", "historic", "explorer", "timeless",
  "alchemy", "oathbreaker", "paupercommander", "duel", "premodern", "oldschool", "penny", "predh", "casual",
] as const;
const FORMAT_NAMES: Record<string, string> = {
  standardbrawl: "Standard Brawl", paupercommander: "Pauper Commander", duel: "Duel Commander", oldschool: "Old School", penny: "Penny Dreadful",
  predh: "PreDH",
};
export const formatName = (format: string) => FORMAT_NAMES[format] ?? capitalize(format);

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** How a card search orders its results (0.13.0); the server uses the same names. */
export type SearchSort = "best" | "name" | "newest" | "oldest" | "priceHigh" | "priceLow" | "mv" | "rarity" | "color" | "set" | "owned";
export const SEARCH_SORTS: Array<[SearchSort, string]> = [
  ["best", "Best match"], ["name", "Name"], ["newest", "Newest"], ["oldest", "Oldest"], ["priceHigh", "Price, high to low"], ["priceLow", "Price, low to high"],
  ["mv", "Mana value"], ["rarity", "Rarity"], ["color", "Color"], ["set", "Set"], ["owned", "Owned first"],
];
/** The searches that each keep their own sort. */
export type SortScope = "cards" | "deckAdd" | "tradeGive" | "tradeGet";
