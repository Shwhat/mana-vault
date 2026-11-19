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

export type CardDetail = Card & { owned: { regular: number; foil: number; allPrintings: number } };

export type CollectionEntry = Pick<Card, "id" | "name" | "set_code" | "set_name" | "collector_number" | "rarity" | "image_url"> & {
  quantity: number;
  foil: number;
};

export type DeckMode = "normal" | "theme";
export type Zone = "main" | "sideboard" | "commander";

export type Deck = {
  id: string;
  name: string;
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
  collectionEntryCount: number;
  deckCount: number;
  deckCardCount: number;
};

export type User = { id: number; name: string };

export type View = "cards" | "collection" | "deck" | "about";

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
