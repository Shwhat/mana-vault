import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { cardInsertStatement } from "./database.js";

const cardFields = [
  "id", "oracle_id", "name", "mana_cost", "mana_value", "type_line", "oracle_text", "colors",
  "color_identity", "legalities", "set_code", "set_name", "collector_number", "rarity",
  "image_url", "released_at", "artist",
] as const;

type BackupCard = Record<(typeof cardFields)[number], string | number | null>;
type BackupCollection = {
  id: string; name: string; description: string; completion: "main" | "all" | "names";
  finish: "any" | "regular" | "foil" | "both"; sets: string[]; created_at: string; updated_at: string;
};

export interface ManaVaultBackup {
  format: "mana-vault-backup";
  version: 2;
  createdAt: string;
  cards: BackupCard[];
  collections: BackupCollection[];
  collectionCards: Array<{ collection_id: string; card_id: string; quantity: number; foil: number }>;
  decks: Array<{ id: string; name: string; format: string; mode: "normal" | "theme"; created_at: string; updated_at: string }>;
  deckCards: Array<{ deck_id: string; oracle_id: string; printing_id: string | null; quantity: number; zone: string }>;
}

export interface BackupSummary {
  createdAt: string;
  printingCount: number;
  collectionCount: number;
  collectionEntryCount: number;
  deckCount: number;
  deckCardCount: number;
}

/** A backup of one account's own collections and decks, with the card records they use. */
export function createBackup(database: DatabaseSync, userId: number): ManaVaultBackup {
  const collections = database.prepare(
    "SELECT id, name, description, completion, finish, created_at, updated_at FROM collections WHERE owner_id = ? ORDER BY created_at, id",
  ).all(userId).map((row) => ({
    ...(row as Omit<BackupCollection, "sets">),
    sets: database.prepare("SELECT set_code FROM collection_sets WHERE collection_id = ? ORDER BY set_code").all(String(row.id)).map((set) => String(set.set_code)),
  })) as BackupCollection[];
  const cards = database.prepare(
    `SELECT ${cardFields.join(", ")} FROM cards
     WHERE id IN (SELECT card_id FROM collection_cards WHERE collection_id IN (SELECT id FROM collections WHERE owner_id = ?))
        OR oracle_id IN (SELECT oracle_id FROM deck_cards WHERE deck_id IN (SELECT id FROM decks WHERE owner_id = ?))
     ORDER BY id`,
  ).all(userId, userId) as BackupCard[];
  return {
    format: "mana-vault-backup",
    version: 2,
    createdAt: new Date().toISOString(),
    cards,
    collections,
    collectionCards: database.prepare(
      `SELECT collection_id, card_id, quantity, foil FROM collection_cards
       WHERE collection_id IN (SELECT id FROM collections WHERE owner_id = ?) ORDER BY collection_id, card_id, foil`,
    ).all(userId) as ManaVaultBackup["collectionCards"],
    decks: database.prepare(
      "SELECT id, name, format, mode, created_at, updated_at FROM decks WHERE owner_id = ? ORDER BY id",
    ).all(userId) as ManaVaultBackup["decks"],
    deckCards: database.prepare(
      `SELECT deck_id, oracle_id, printing_id, quantity, zone FROM deck_cards
       WHERE deck_id IN (SELECT id FROM decks WHERE owner_id = ?) ORDER BY deck_id, zone, oracle_id`,
    ).all(userId) as ManaVaultBackup["deckCards"],
  };
}

export function inspectBackup(source: string): BackupSummary {
  return summarizeBackup(parseBackup(source));
}

/**
 * Replaces the account's own collections and decks with the backup's. Items are restored under new
 * ids, so a backup never collides with items that were sent to other accounts.
 */
export function restoreBackup(database: DatabaseSync, source: string, userId: number): void {
  const backup = parseBackup(source);
  const insertCard = cardInsertStatement(database);
  const knownSets = new Set(database.prepare("SELECT DISTINCT set_code FROM cards").all().map((row) => String(row.set_code)));
  database.exec("BEGIN");
  try {
    for (const card of backup.cards) {
      insertCard.run(...cardFields.map((field) => card[field]));
      knownSets.add(String(card.set_code));
    }
    for (const kind of ["collection", "deck"] as const) {
      const table = kind === "collection" ? "collections" : "decks";
      for (const row of database.prepare(`SELECT id FROM ${table} WHERE owner_id = ?`).all(userId)) {
        database.prepare("DELETE FROM members WHERE kind = ? AND item_id = ?").run(kind, String(row.id));
        database.prepare("UPDATE shares SET status = 'cancelled', answered_at = CURRENT_TIMESTAMP WHERE kind = ? AND item_id = ? AND status = 'pending'").run(kind, String(row.id));
      }
      database.prepare(`DELETE FROM ${table} WHERE owner_id = ?`).run(userId);
    }
    const collectionIds = new Map<string, string>();
    const insertCollection = database.prepare(
      "INSERT INTO collections (id, owner_id, name, description, completion, finish, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertSet = database.prepare("INSERT OR IGNORE INTO collection_sets (collection_id, set_code) VALUES (?, ?)");
    for (const collection of backup.collections) {
      const id = randomUUID();
      collectionIds.set(collection.id, id);
      insertCollection.run(id, userId, collection.name, collection.description, collection.completion, collection.finish, collection.created_at, collection.updated_at);
      for (const code of collection.sets) if (knownSets.has(code)) insertSet.run(id, code);
    }
    const insertCollectionCard = database.prepare(
      `INSERT INTO collection_cards (collection_id, card_id, quantity, foil) VALUES (?, ?, ?, ?)
       ON CONFLICT(collection_id, card_id, foil) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity)`,
    );
    for (const item of backup.collectionCards) {
      insertCollectionCard.run(collectionIds.get(item.collection_id)!, item.card_id, item.quantity, item.foil);
    }
    const deckIds = new Map<string, string>();
    const insertDeck = database.prepare(
      "INSERT INTO decks (id, owner_id, name, format, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const deck of backup.decks) {
      const id = randomUUID();
      deckIds.set(deck.id, id);
      insertDeck.run(id, userId, deck.name, deck.format, deck.mode, deck.created_at, deck.updated_at);
    }
    const insertDeckCard = database.prepare(
      "INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone) VALUES (?, ?, ?, ?, ?)",
    );
    for (const card of backup.deckCards) {
      insertDeckCard.run(deckIds.get(card.deck_id)!, card.oracle_id, card.printing_id, card.quantity, card.zone);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function parseBackup(source: string): ManaVaultBackup {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Backup file is not valid JSON");
  }
  return validateBackup(value);
}

function summarizeBackup(backup: ManaVaultBackup): BackupSummary {
  return {
    createdAt: backup.createdAt,
    printingCount: backup.cards.length,
    collectionCount: backup.collections.length,
    collectionEntryCount: backup.collectionCards.length,
    deckCount: backup.decks.length,
    deckCardCount: backup.deckCards.length,
  };
}

function validateBackup(value: unknown): ManaVaultBackup {
  if (!isRecord(value) || value.format !== "mana-vault-backup" || (value.version !== 1 && value.version !== 2)) {
    throw new Error("Unsupported backup file format or version");
  }
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error("Backup file has an invalid creation date");
  }
  // version 1 (before 0.2.0) held one collection; it restores as a collection named Main collection
  const legacy = value.version === 1;
  const rawCollectionCards = legacy ? value.collection : value.collectionCards;
  const rawCollections = legacy ? [] : value.collections;
  if (!Array.isArray(value.cards) || !Array.isArray(rawCollectionCards) || !Array.isArray(rawCollections) ||
    !Array.isArray(value.decks) || !Array.isArray(value.deckCards)) {
    throw new Error("Backup file is missing required data");
  }
  if (value.cards.length > 100_000 || rawCollectionCards.length > 100_000 || rawCollections.length > 1_000 ||
    value.decks.length > 10_000 || value.deckCards.length > 100_000) {
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
      } else if (field === "colors" || field === "color_identity") {
        // colorless cards (artifacts, lands) have no colors, stored as an empty string
        if (typeof fieldValue !== "string" || !/^[WUBRG]*$/.test(fieldValue)) throw new Error(`Backup card ${index + 1} has invalid ${field}`);
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
  const collections: BackupCollection[] = legacy && rawCollectionCards.length
    ? [{ id: "legacy", name: "Main collection", description: "", completion: "main", finish: "any", sets: [], created_at: value.createdAt, updated_at: value.createdAt }]
    : rawCollections.map((entry: unknown, index: number) => {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id || typeof entry.name !== "string" || !entry.name.trim() ||
        typeof entry.description !== "string" || !["main", "all", "names"].includes(String(entry.completion)) ||
        !["any", "regular", "foil", "both"].includes(String(entry.finish)) || !Array.isArray(entry.sets) ||
        !entry.sets.every((code) => typeof code === "string" && /^[a-z0-9]{2,8}$/.test(code)) ||
        typeof entry.created_at !== "string" || typeof entry.updated_at !== "string") {
        throw new Error(`Backup collection ${index + 1} is invalid`);
      }
      return entry as BackupCollection;
    });
  const collectionCards = rawCollectionCards.map((entry: unknown, index: number) => {
    if (!isRecord(entry) || typeof entry.card_id !== "string" || !validPositiveInteger(entry.quantity) ||
      (entry.foil !== 0 && entry.foil !== 1) || (!legacy && typeof entry.collection_id !== "string")) {
      throw new Error(`Backup collection entry ${index + 1} is invalid`);
    }
    return { collection_id: legacy ? "legacy" : String(entry.collection_id), card_id: entry.card_id, quantity: entry.quantity, foil: entry.foil };
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
  const collectionIds = new Set(collections.map((item) => item.id));
  if (collectionIds.size !== collections.length) throw new Error("Backup contains duplicate collections");
  for (const item of collectionCards) {
    if (!cardsById.has(item.card_id)) throw new Error("Backup collection refers to a missing card");
    if (!collectionIds.has(item.collection_id)) throw new Error("Backup collection entry refers to a missing collection");
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
    version: 2,
    createdAt: value.createdAt,
    cards,
    collections,
    collectionCards,
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
