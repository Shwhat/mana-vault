// ---------- shared data types ----------
export type Card = {
  id: string;
  oracle_id?: string;
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
};

export type OwnedIn = { id: string; name: string; regular: number; foil: number; allPrintings: number };
export type CardDetail = Card & { owned: { regular: number; foil: number; allPrintings: number; collections: OwnedIn[] } };

export type CollectionEntry = Pick<Card, "id" | "name" | "set_code" | "set_name" | "collector_number" | "rarity" | "image_url" | "colors"> & {
  quantity: number;
  foil: number;
};

export type Person = { id: number; name: string };
export type Sharing = { role: "owner" | "member"; owner: Person; displayName: string | null; sharedWith: Person[] };

export type CompletionRule = "main" | "all" | "names";
export type FinishRule = "any" | "regular" | "foil" | "both";

export type Collection = Sharing & {
  id: string;
  name: string;
  realName: string;
  description: string;
  completion: CompletionRule;
  finish: FinishRule;
  sets: Array<{ code: string; name: string }>;
  entryCount: number;
  cardCount: number;
  progress: { owned: number; total: number } | null;
};

export type SetProgress = { code: string; name: string; owned: number; total: number; printedSize: number | null; known: boolean };
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

export type SetInfo = { code: string; name: string; set_type: string; released_at: string | null; printed_size: number | null; printings: number };

export type Offer = { id: string; kind: "collection" | "deck"; itemId: string; itemName: string; mode: "copy" | "share" | "transfer"; createdAt: string; user: string };

export const COMPLETION_RULES: Array<[CompletionRule, string]> = [
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
export type Zone = "main" | "sideboard" | "commander";

export type Deck = Partial<Sharing> & {
  id: string;
  name: string;
  realName?: string;
  format: string;
  mode: DeckMode;
  card_count?: number;
};

export type DeckCard = Pick<Card, "name" | "mana_cost" | "type_line" | "set_code" | "set_name" | "collector_number" | "image_url"> & {
  entry_id: number;
  card_id: string;
  oracle_id: string;
  printing_id: string | null;
  quantity: number;
  zone: Zone;
};

export type DeckDetail = Deck & { cards: DeckCard[] };

export type ImportReport = {
  matchedRows: number;
  importedQuantity: number;
  unmatched: Array<{ row: number; name: string; reason: string }>;
};

export type CatalogStatus = {
  printingCount: number;
  updatedAt: string | null;
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

export type User = { id: number; name: string };

export type View = "cards" | "collection" | "deck" | "about";
export type CollectionTab = "cards" | "completion" | "missing";

export type Filters = {
  query: string;
  type: string;
  set: string;
  color: string;
  rarity: string;
  format: string;
  mvMin: string;
  mvMax: string;
};

export const EMPTY_FILTERS: Filters = { query: "", type: "", set: "", color: "", rarity: "", format: "", mvMin: "", mvMax: "" };

export const ZONES: Array<{ id: Zone; label: string }> = [
  { id: "main", label: "Main deck" },
  { id: "sideboard", label: "Sideboard" },
  { id: "commander", label: "Commander" },
];

export const FORMATS = ["commander", "standard", "pioneer", "modern", "legacy", "pauper", "vintage", "casual"] as const;

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
