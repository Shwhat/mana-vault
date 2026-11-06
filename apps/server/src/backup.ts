import type { DatabaseSync } from "node:sqlite";
import { cardInsertStatement } from "./database.js";

const cardFields = [
  "id", "oracle_id", "name", "mana_cost", "mana_value", "type_line", "oracle_text", "colors",
  "color_identity", "legalities", "set_code", "set_name", "collector_number", "rarity",
  "image_url", "released_at", "artist",
] as const;

export interface ManaVaultBackup {
  format: "mana-vault-backup";
  version: 1;
  createdAt: string;
  cards: Array<Record<(typeof cardFields)[number], string | number | null>>;
  collection: Array<{ card_id: string; quantity: number; foil: number }>;
  decks: Array<{ id: string; name: string; format: string; mode: "normal" | "theme"; created_at: string; updated_at: string }>;
  deckCards: Array<{ deck_id: string; oracle_id: string; printing_id: string | null; quantity: number; zone: string }>;
}

export function createBackup(database: DatabaseSync): ManaVaultBackup {
  const cards = database.prepare(
    `SELECT ${cardFields.join(", ")} FROM cards
     WHERE id IN (SELECT card_id FROM collection_items)
        OR oracle_id IN (SELECT oracle_id FROM deck_cards)
     ORDER BY id`,
  ).all() as ManaVaultBackup["cards"];
  return {
    format: "mana-vault-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    cards,
    collection: database.prepare(
      "SELECT card_id, quantity, foil FROM collection_items ORDER BY card_id, foil",
    ).all() as ManaVaultBackup["collection"],
    decks: database.prepare(
      "SELECT id, name, format, mode, created_at, updated_at FROM decks ORDER BY id",
    ).all() as ManaVaultBackup["decks"],
    deckCards: database.prepare(
      "SELECT deck_id, oracle_id, printing_id, quantity, zone FROM deck_cards ORDER BY deck_id, zone, oracle_id",
    ).all() as ManaVaultBackup["deckCards"],
  };
}

export function restoreBackup(database: DatabaseSync, source: string): void {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Backup file is not valid JSON");
  }
  const backup = validateBackup(value);
  const insertCard = cardInsertStatement(database);
  database.exec("BEGIN");
  try {
    for (const card of backup.cards) {
      insertCard.run(...cardFields.map((field) => card[field]));
    }
    database.exec("DELETE FROM collection_items; DELETE FROM decks;");
    const insertCollection = database.prepare(
      "INSERT INTO collection_items (card_id, quantity, foil) VALUES (?, ?, ?)",
    );
    for (const item of backup.collection) insertCollection.run(item.card_id, item.quantity, item.foil);
    const insertDeck = database.prepare(
      "INSERT INTO decks (id, name, format, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const deck of backup.decks) {
      insertDeck.run(deck.id, deck.name, deck.format, deck.mode, deck.created_at, deck.updated_at);
    }
    const insertDeckCard = database.prepare(
      "INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone) VALUES (?, ?, ?, ?, ?)",
    );
    for (const card of backup.deckCards) {
      insertDeckCard.run(card.deck_id, card.oracle_id, card.printing_id, card.quantity, card.zone);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function validateBackup(value: unknown): ManaVaultBackup {
  if (!isRecord(value) || value.format !== "mana-vault-backup" || value.version !== 1) {
    throw new Error("Unsupported backup file format or version");
  }
  if (!Array.isArray(value.cards) || !Array.isArray(value.collection) || !Array.isArray(value.decks) || !Array.isArray(value.deckCards)) {
    throw new Error("Backup file is missing required data");
  }
  if (value.cards.length > 100_000 || value.collection.length > 100_000 || value.decks.length > 10_000 || value.deckCards.length > 100_000) {
    throw new Error("Backup contains too many records");
  }
  const cards = value.cards.map((card, index) => {
    if (!isRecord(card)) throw new Error(`Backup card ${index + 1} is invalid`);
    const result = {} as ManaVaultBackup["cards"][number];
    for (const field of cardFields) {
      const fieldValue = card[field];
      if (field === "mana_value") {
        if (fieldValue !== null && (typeof fieldValue !== "number" || !Number.isFinite(fieldValue))) {
          throw new Error(`Backup card ${index + 1} has invalid mana value`);
        }
      } else if (["mana_cost", "oracle_text", "image_url", "released_at", "artist"].includes(field)) {
        if (fieldValue !== null && typeof fieldValue !== "string") throw new Error(`Backup card ${index + 1} has invalid ${field}`);
      } else if (typeof fieldValue !== "string" || !fieldValue) {
        throw new Error(`Backup card ${index + 1} has invalid ${field}`);
      }
      result[field] = fieldValue as string | number | null;
    }
    try {
      const legalities: unknown = JSON.parse(String(result.legalities));
      if (!isRecord(legalities) || Object.values(legalities).some((status) => typeof status !== "string")) {
        throw new Error();
      }
    } catch {
      throw new Error(`Backup card ${index + 1} has invalid legalities`);
    }
    return result;
  });
  const collection = value.collection.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.card_id !== "string" || !validPositiveInteger(entry.quantity) ||
      (entry.foil !== 0 && entry.foil !== 1)) throw new Error(`Backup collection entry ${index + 1} is invalid`);
    return { card_id: entry.card_id, quantity: entry.quantity, foil: entry.foil };
  });
  const decks = value.decks.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id ||
      typeof entry.name !== "string" || typeof entry.format !== "string" ||
      (entry.mode !== "normal" && entry.mode !== "theme") ||
      typeof entry.created_at !== "string" || typeof entry.updated_at !== "string") {
      throw new Error(`Backup deck ${index + 1} is invalid`);
    }
    return entry as ManaVaultBackup["decks"][number];
  });
  const deckCards = value.deckCards.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.deck_id !== "string" || typeof entry.oracle_id !== "string" ||
      (entry.printing_id !== null && typeof entry.printing_id !== "string") ||
      !validPositiveInteger(entry.quantity) ||
      !["main", "sideboard", "commander"].includes(String(entry.zone))) {
      throw new Error(`Backup deck card ${index + 1} is invalid`);
    }
    return entry as ManaVaultBackup["deckCards"][number];
  });
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const oracleIds = new Set(cards.map((card) => card.oracle_id));
  const deckModes = new Map(decks.map((deck) => [deck.id, deck.mode]));
  if (cardsById.size !== cards.length) throw new Error("Backup contains duplicate card records");
  if (new Set(decks.map((deck) => deck.id)).size !== decks.length) throw new Error("Backup contains duplicate decks");
  for (const item of collection) {
    if (!cardsById.has(item.card_id)) throw new Error("Backup collection refers to a missing card");
  }
  for (const deckCard of deckCards) {
    const printing = deckCard.printing_id ? cardsById.get(deckCard.printing_id) : undefined;
    if (!deckModes.has(deckCard.deck_id) || !oracleIds.has(deckCard.oracle_id) ||
      (deckCard.printing_id !== null && (!printing || printing.oracle_id !== deckCard.oracle_id)) ||
      (deckModes.get(deckCard.deck_id) === "theme" && deckCard.printing_id === null) ||
      (deckModes.get(deckCard.deck_id) === "normal" && deckCard.printing_id !== null)) {
      throw new Error("Backup deck card refers to a missing or incompatible card");
    }
  }
  return {
    format: "mana-vault-backup",
    version: 1,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    cards,
    collection,
    decks,
    deckCards,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
