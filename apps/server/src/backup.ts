import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { cardInsertStatement } from "./database.js";
import { readCondition, readLanguage } from "./copies.js";

const cardFields = [
  "id", "oracle_id", "name", "mana_cost", "mana_value", "type_line", "oracle_text", "colors",
  "color_identity", "legalities", "set_code", "set_name", "collector_number", "rarity",
  "image_url", "released_at", "artist",
] as const;

type BackupCard = Record<(typeof cardFields)[number], string | number | null>;
type BackupCollection = {
  id: string; name: string; description: string; completion: "none" | "main" | "all" | "names";
  finish: "any" | "regular" | "foil" | "both"; kind: "collection" | "wishlist"; sets: string[]; created_at: string; updated_at: string;
};
type BackupCopy = {
  collection_id: string; card_id: string; quantity: number; foil: number; condition: string; language: string; trade: number;
  proxy: number; purchase_price: number | null; price_currency: string | null; added_at: string | null; misprint: number; altered: number; signed: number;
};
type BackupLink = {
  deck_id: string; printing_id: string; zone: string; collection_id: string; card_id: string; foil: number; condition: string; language: string;
  proxy: number; quantity: number; deck_finish?: number;
};

/** A custom set (0.9.0), with its symbol as base64. */
type BackupCustomSet = { code: string; name: string; released_at: string | null; symbol: string | null; symbol_type: string | null };
/** A custom card (0.9.0): its card maker design, pictures and art as base64, and the card data kept outside the card row. */
type BackupCustomCard = {
  id: string; design: string; picture: string | null; picture_type: string | null; back_picture: string | null; back_picture_type: string | null;
  art: string | null; art_type: string | null; back_art: string | null; back_art_type: string | null; finishes: string; power: string | null; toughness: string | null;
  tokens: string; price_usd: number | null; price_usd_foil: number | null; price_eur: number | null; price_eur_foil: number | null;
};

export interface ManaVaultBackup {
  format: "mana-vault-backup";
  version: 5;
  createdAt: string;
  cards: BackupCard[];
  collections: BackupCollection[];
  collectionCards: BackupCopy[];
  decks: Array<{
    id: string; name: string; format: string; mode: "normal" | "theme"; collection_id?: string | null; created_at: string; updated_at: string;
    /** 0.7.0: the deck description and cover card. */
    description?: string; cover_card_id?: string | null;
  }>;
  /** tags (0.7.0) holds the deck card's tags, one per line. */
  deckCards: Array<{ deck_id: string; oracle_id: string; printing_id: string | null; quantity: number; zone: string; tags?: string; finish?: number; want_card_id?: string | null; want_finish?: number }>;
  /** Version 4: the collection copies that fill each deck card. */
  deckLinks: BackupLink[];
  /** Version 5: the custom sets and custom cards the account made or uses. */
  customSets: BackupCustomSet[];
  customCards: BackupCustomCard[];
}

export interface BackupSummary {
  createdAt: string;
  printingCount: number;
  collectionCount: number;
  collectionEntryCount: number;
  deckCount: number;
  deckCardCount: number;
  customCardCount: number;
}

/** A backup of one account's own collections and decks, with the card records they use. */
export function createBackup(database: DatabaseSync, userId: number): ManaVaultBackup {
  const collections = database.prepare(
    "SELECT id, name, description, completion, finish, kind, created_at, updated_at FROM collections WHERE owner_id = ? ORDER BY created_at, rowid",
  ).all(userId).map((row) => ({
    ...(row as Omit<BackupCollection, "sets">),
    sets: database.prepare("SELECT set_code FROM collection_sets WHERE collection_id = ? ORDER BY set_code").all(String(row.id)).map((set) => String(set.set_code)),
  })) as BackupCollection[];
  const cards = database.prepare(
    `SELECT ${cardFields.join(", ")} FROM cards
     WHERE id IN (SELECT card_id FROM collection_cards WHERE collection_id IN (SELECT id FROM collections WHERE owner_id = ?))
        OR oracle_id IN (SELECT oracle_id FROM deck_cards WHERE deck_id IN (SELECT id FROM decks WHERE owner_id = ?))
        OR id IN (SELECT id FROM custom_cards WHERE owner_id = ?)
     ORDER BY id`,
  ).all(userId, userId, userId) as BackupCard[];
  const base64 = (value: unknown) => (value ? Buffer.from(value as Uint8Array).toString("base64") : null);
  const customIds = new Set(database.prepare("SELECT id FROM cards WHERE custom = 1").all().map((row) => String(row.id)));
  const customCards = cards.filter((card) => customIds.has(String(card.id))).map((card) => {
    const row = database.prepare(
      `SELECT cc.*, c.finishes, c.power, c.toughness, c.tokens, c.price_usd, c.price_usd_foil, c.price_eur, c.price_eur_foil
       FROM custom_cards cc JOIN cards c ON c.id = cc.id WHERE cc.id = ?`,
    ).get(String(card.id))!;
    return {
      id: String(row.id), design: String(row.design), picture: base64(row.picture), picture_type: (row.picture_type as string | null) ?? null,
      back_picture: base64(row.back_picture), back_picture_type: (row.back_picture_type as string | null) ?? null,
      art: base64(row.art), art_type: (row.art_type as string | null) ?? null, back_art: base64(row.back_art), back_art_type: (row.back_art_type as string | null) ?? null,
      finishes: String(row.finishes ?? ""), power: (row.power as string | null) ?? null, toughness: (row.toughness as string | null) ?? null, tokens: String(row.tokens ?? ""),
      price_usd: (row.price_usd as number | null) ?? null, price_usd_foil: (row.price_usd_foil as number | null) ?? null,
      price_eur: (row.price_eur as number | null) ?? null, price_eur_foil: (row.price_eur_foil as number | null) ?? null,
    };
  });
  const setCodes = [...new Set(cards.filter((card) => customIds.has(String(card.id))).map((card) => String(card.set_code)))];
  const customSets = [
    ...setCodes,
    ...database.prepare("SELECT code FROM custom_sets WHERE owner_id = ?").all(userId).map((row) => String(row.code)).filter((code) => !setCodes.includes(code)),
  ].flatMap((code) => {
    const row = database.prepare("SELECT cs.code, s.name, s.released_at, cs.symbol, cs.symbol_type FROM custom_sets cs JOIN sets s ON s.code = cs.code WHERE cs.code = ?").get(code);
    return row ? [{
      code: String(row.code), name: String(row.name), released_at: (row.released_at as string | null) ?? null, symbol: base64(row.symbol), symbol_type: (row.symbol_type as string | null) ?? null,
    }] : [];
  });
  return {
    format: "mana-vault-backup",
    version: 5,
    customSets,
    customCards,
    createdAt: new Date().toISOString(),
    cards,
    collections,
    collectionCards: database.prepare(
      `SELECT collection_id, card_id, quantity, foil, condition, language, trade, proxy, purchase_price, price_currency, added_at, misprint, altered, signed
       FROM collection_cards WHERE collection_id IN (SELECT id FROM collections WHERE owner_id = ?) ORDER BY collection_id, card_id, foil, condition, language, proxy`,
    ).all(userId) as ManaVaultBackup["collectionCards"],
    decks: database.prepare(
      "SELECT id, name, format, mode, collection_id, created_at, updated_at, description, cover_card_id FROM decks WHERE owner_id = ? ORDER BY id",
    ).all(userId) as ManaVaultBackup["decks"],
    deckCards: database.prepare(
      `SELECT deck_id, oracle_id, printing_id, quantity, zone, tags, finish, want_card_id, want_finish FROM deck_cards
       WHERE deck_id IN (SELECT id FROM decks WHERE owner_id = ?) ORDER BY deck_id, zone, oracle_id`,
    ).all(userId) as ManaVaultBackup["deckCards"],
    deckLinks: database.prepare(
      `SELECT dc.deck_id, dc.printing_id, dc.zone, dc.finish AS deck_finish, l.collection_id, l.card_id, l.foil, l.condition, l.language, l.proxy, l.quantity
       FROM deck_links l JOIN deck_cards dc ON dc.id = l.deck_card_id JOIN decks d ON d.id = dc.deck_id JOIN collections col ON col.id = l.collection_id
       WHERE d.owner_id = ? AND col.owner_id = ? AND dc.printing_id IS NOT NULL ORDER BY l.id`,
    ).all(userId, userId) as BackupLink[],
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
  const customIds = new Set(backup.customCards.map((card) => card.id));
  const bytes = (value: string | null) => (value ? new Uint8Array(Buffer.from(value, "base64")) : null);
  database.exec("BEGIN");
  try {
    // custom sets missing on this server come back, made by the account restoring them
    for (const set of backup.customSets) {
      if (database.prepare("SELECT 1 FROM sets WHERE code = ?").get(set.code)) continue;
      database.prepare("INSERT INTO sets (code, name, set_type, released_at, printed_size, card_count) VALUES (?, ?, 'custom', ?, NULL, NULL)").run(set.code, set.name, set.released_at);
      database.prepare("INSERT INTO custom_sets (code, owner_id, symbol, symbol_type) VALUES (?, ?, ?, ?)").run(set.code, userId, bytes(set.symbol), set.symbol_type);
    }
    for (const card of backup.cards) {
      // a custom card already on this server keeps its current version: its maker may have changed it since
      if (customIds.has(String(card.id)) && database.prepare("SELECT 1 FROM custom_cards WHERE id = ?").get(String(card.id))) {
        knownSets.add(String(card.set_code));
        continue;
      }
      insertCard.run(...cardFields.map((field) => card[field]));
      knownSets.add(String(card.set_code));
    }
    for (const card of backup.customCards) {
      if (database.prepare("SELECT 1 FROM custom_cards WHERE id = ?").get(card.id)) continue;
      database.prepare(
        `UPDATE cards SET custom = 1, finishes = ?, power = ?, toughness = ?, tokens = ?, price_usd = ?, price_usd_foil = ?, price_eur = ?, price_eur_foil = ?
         WHERE id = ?`,
      ).run(card.finishes, card.power, card.toughness, card.tokens, card.price_usd, card.price_usd_foil, card.price_eur, card.price_eur_foil, card.id);
      database.prepare(
        `INSERT INTO custom_cards (id, owner_id, design, picture, picture_type, back_picture, back_picture_type, art, art_type, back_art, back_art_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(card.id, userId, card.design, bytes(card.picture), card.picture_type, bytes(card.back_picture), card.back_picture_type,
        bytes(card.art), card.art_type, bytes(card.back_art), card.back_art_type);
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
      "INSERT INTO collections (id, owner_id, name, description, completion, finish, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertSet = database.prepare("INSERT OR IGNORE INTO collection_sets (collection_id, set_code) VALUES (?, ?)");
    for (const collection of backup.collections) {
      const id = randomUUID();
      collectionIds.set(collection.id, id);
      insertCollection.run(id, userId, collection.name, collection.description, collection.completion, collection.finish, collection.kind, collection.created_at, collection.updated_at);
      for (const code of collection.sets) if (knownSets.has(code)) insertSet.run(id, code);
    }
    const insertCollectionCard = database.prepare(
      `INSERT INTO collection_cards (collection_id, card_id, quantity, foil, condition, language, trade, proxy, purchase_price, price_currency, added_at, misprint, altered, signed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity),
         trade = MIN(MIN(10000, quantity + excluded.quantity), trade + excluded.trade)`,
    );
    for (const item of backup.collectionCards) {
      insertCollectionCard.run(collectionIds.get(item.collection_id)!, item.card_id, Math.min(10_000, item.quantity), item.foil, item.condition, item.language,
        Math.min(10_000, item.trade), item.proxy, item.purchase_price, item.price_currency, item.added_at, item.misprint, item.altered, item.signed);
    }
    const deckIds = new Map<string, string>();
    const insertDeck = database.prepare(
      "INSERT INTO decks (id, owner_id, name, format, mode, collection_id, created_at, updated_at, description, cover_card_id) VALUES (?, ?, ?, ?, 'theme', ?, ?, ?, ?, ?)",
    );
    for (const deck of backup.decks) {
      const id = randomUUID();
      deckIds.set(deck.id, id);
      const cover = typeof deck.cover_card_id === "string" && database.prepare("SELECT 1 FROM cards WHERE id = ?").get(deck.cover_card_id) ? deck.cover_card_id : null;
      insertDeck.run(id, userId, deck.name, deck.format, deck.collection_id ? collectionIds.get(deck.collection_id) ?? null : null, deck.created_at, deck.updated_at,
        typeof deck.description === "string" ? deck.description.slice(0, 20000) : "", cover);
    }
    // a deck card without a printing (Normal decks before 0.6.0) takes the newest printing of the card
    const newest = database.prepare("SELECT id FROM cards WHERE oracle_id = ? ORDER BY released_at IS NULL, released_at DESC, promo, variation LIMIT 1");
    const insertDeckCard = database.prepare(
      `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone, finish) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(deck_id, oracle_id, printing_id, zone, finish) WHERE printing_id IS NOT NULL DO UPDATE SET quantity = quantity + excluded.quantity`,
    );
    const where = "WHERE deck_id = ? AND printing_id = ? AND zone = ? AND finish = ?";
    for (const card of backup.deckCards) {
      const printing = card.printing_id ?? (newest.get(card.oracle_id)?.id as string | undefined) ?? null;
      const finish = card.finish === 1 || card.finish === 2 ? card.finish : 0;
      const deckId = deckIds.get(card.deck_id)!;
      if (printing) {
        insertDeckCard.run(deckId, card.oracle_id, printing, card.quantity, card.zone, finish);
        if (typeof card.tags === "string" && card.tags) {
          database.prepare(`UPDATE deck_cards SET tags = ? ${where}`).run(card.tags.slice(0, 600), deckId, printing, card.zone, finish);
        }
        if (typeof card.want_card_id === "string" && database.prepare("SELECT 1 FROM cards WHERE id = ?").get(card.want_card_id)) {
          database.prepare(`UPDATE deck_cards SET want_card_id = ?, want_finish = ? ${where}`)
            .run(card.want_card_id, card.want_finish === 1 || card.want_finish === 2 ? card.want_finish : 0, deckId, printing, card.zone, finish);
        }
      }
      else database.prepare("INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone) VALUES (?, ?, NULL, ?, ?)").run(deckId, card.oracle_id, card.quantity, card.zone);
    }
    // backups before 0.11.0 do not name the deck card's finish: the first deck card of the printing in the zone is used
    const deckCardOf = database.prepare("SELECT id FROM deck_cards WHERE deck_id = ? AND printing_id = ? AND zone = ? ORDER BY finish = ? DESC, id LIMIT 1");
    const insertLink = database.prepare(
      `INSERT INTO deck_links (deck_card_id, collection_id, card_id, foil, condition, language, proxy, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(deck_card_id, collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = quantity + excluded.quantity`,
    );
    for (const link of backup.deckLinks) {
      const deckId = deckIds.get(link.deck_id);
      const collectionId = collectionIds.get(link.collection_id);
      const card = deckId ? deckCardOf.get(deckId, link.printing_id, link.zone, link.deck_finish ?? link.foil) : undefined;
      if (card && collectionId) insertLink.run(Number(card.id), collectionId, link.card_id, link.foil, link.condition, link.language, link.proxy, link.quantity);
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
    customCardCount: backup.customCards.length,
  };
}

function validateBackup(value: unknown): ManaVaultBackup {
  if (!isRecord(value) || value.format !== "mana-vault-backup" || ![1, 2, 3, 4, 5].includes(Number(value.version))) {
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
    ? [{ id: "legacy", name: "Main collection", description: "", completion: "none", finish: "any", kind: "collection", sets: [], created_at: value.createdAt, updated_at: value.createdAt }]
    : rawCollections.map((entry: unknown, index: number) => {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id || typeof entry.name !== "string" || !entry.name.trim() ||
        typeof entry.description !== "string" || !["none", "main", "all", "names"].includes(String(entry.completion)) ||
        !["any", "regular", "foil", "both"].includes(String(entry.finish)) || !Array.isArray(entry.sets) ||
        !entry.sets.every((code) => typeof code === "string" && /^[a-z0-9]{2,8}$/.test(code)) ||
        typeof entry.created_at !== "string" || typeof entry.updated_at !== "string" ||
        (entry.kind !== undefined && entry.kind !== "collection" && entry.kind !== "wishlist")) {
        throw new Error(`Backup collection ${index + 1} is invalid`);
      }
      // backups before version 3 have no kind; every collection in them is a collection
      return { ...entry, kind: entry.kind === "wishlist" ? "wishlist" : "collection" } as BackupCollection;
    });
  const collectionCards = rawCollectionCards.map((entry: unknown, index: number) => {
    // backups before version 3 have no condition, language or trade count: Near mint, English, none for trade
    const condition = readCondition(entry && isRecord(entry) ? entry.condition : undefined);
    const language = readLanguage(entry && isRecord(entry) ? entry.language : undefined);
    const trade = isRecord(entry) && entry.trade !== undefined ? entry.trade : 0;
    if (!isRecord(entry) || typeof entry.card_id !== "string" || !validPositiveInteger(entry.quantity) ||
      (entry.foil !== 0 && entry.foil !== 1 && entry.foil !== 2) || (!legacy && typeof entry.collection_id !== "string") ||
      !condition || !language || typeof trade !== "number" || !Number.isInteger(trade) || trade < 0 || trade > entry.quantity) {
      throw new Error(`Backup collection entry ${index + 1} is invalid`);
    }
    // backups before version 4 have no proxies or copy details
    const text = (field: string) => (typeof entry[field] === "string" ? entry[field] as string : null);
    const flag = (field: string) => (entry[field] === 1 || entry[field] === true ? 1 : 0);
    return {
      collection_id: legacy ? "legacy" : String(entry.collection_id), card_id: entry.card_id, quantity: entry.quantity, foil: entry.foil,
      condition, language, trade, proxy: flag("proxy"), purchase_price: typeof entry.purchase_price === "number" ? entry.purchase_price : null,
      price_currency: text("price_currency"), added_at: text("added_at"), misprint: flag("misprint"), altered: flag("altered"), signed: flag("signed"),
    };
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
      !["main", "sideboard", "commander", "maybeboard"].includes(String(entry.zone))) {
      throw new Error(`Backup deck card ${index + 1} is invalid`);
    }
    return entry as ManaVaultBackup["deckCards"][number];
  });
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const oracleIds = new Set(cards.map((card) => card.oracle_id));
  const deckModes = new Map(decks.map((deck) => [deck.id, deck.mode]));
  const deckLinks = (Array.isArray(value.deckLinks) ? value.deckLinks : []).map((entry: unknown, index: number) => {
    if (!isRecord(entry) || typeof entry.deck_id !== "string" || typeof entry.printing_id !== "string" || typeof entry.zone !== "string" ||
      typeof entry.collection_id !== "string" || typeof entry.card_id !== "string" || ![0, 1, 2].includes(Number(entry.foil)) ||
      typeof entry.condition !== "string" || typeof entry.language !== "string" || !validPositiveInteger(entry.quantity)) {
      throw new Error(`Backup deck link ${index + 1} is invalid`);
    }
    return { ...entry, foil: Number(entry.foil), proxy: entry.proxy === 1 ? 1 : 0 } as BackupLink;
  });
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
  // version 5 adds custom sets and cards; earlier backups have none
  const base64 = (field: unknown) => (field === null || field === undefined ? null : typeof field === "string" && /^[A-Za-z0-9+/=]*$/.test(field) ? field : undefined);
  const pictureType = (field: unknown) => (field === null || field === undefined ? null : typeof field === "string" && /^image\/(jpeg|png|webp)$/.test(field) ? field : undefined);
  const customSets = (Array.isArray(value.customSets) ? value.customSets : []).map((entry: unknown, index: number) => {
    if (!isRecord(entry) || typeof entry.code !== "string" || !/^[a-z0-9]{2,6}$/.test(entry.code) || typeof entry.name !== "string" || !entry.name ||
      base64(entry.symbol) === undefined || pictureType(entry.symbol_type) === undefined) {
      throw new Error(`Backup custom set ${index + 1} is invalid`);
    }
    return {
      code: entry.code, name: entry.name.slice(0, 100), released_at: typeof entry.released_at === "string" ? entry.released_at : null,
      symbol: base64(entry.symbol)!, symbol_type: pictureType(entry.symbol_type)!,
    };
  });
  const customCards = (Array.isArray(value.customCards) ? value.customCards : []).map((entry: unknown, index: number) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !/^custom-[0-9a-f-]{36}$/.test(entry.id) || !cardsById.has(entry.id) || typeof entry.design !== "string" ||
      ["picture", "back_picture", "art", "back_art"].some((field) => base64(entry[field]) === undefined || pictureType(entry[`${field}_type`]) === undefined)) {
      throw new Error(`Backup custom card ${index + 1} is invalid`);
    }
    const textOrNull = (field: string) => (typeof entry[field] === "string" ? entry[field] as string : null);
    const numberOrNull = (field: string) => (typeof entry[field] === "number" && Number.isFinite(entry[field]) ? entry[field] as number : null);
    return {
      id: entry.id, design: entry.design.slice(0, 200_000), picture: base64(entry.picture)!, picture_type: pictureType(entry.picture_type)!,
      back_picture: base64(entry.back_picture)!, back_picture_type: pictureType(entry.back_picture_type)!, art: base64(entry.art)!, art_type: pictureType(entry.art_type)!,
      back_art: base64(entry.back_art)!, back_art_type: pictureType(entry.back_art_type)!, finishes: textOrNull("finishes") ?? "nonfoil",
      power: textOrNull("power"), toughness: textOrNull("toughness"), tokens: textOrNull("tokens") ?? "", price_usd: numberOrNull("price_usd"),
      price_usd_foil: numberOrNull("price_usd_foil"), price_eur: numberOrNull("price_eur"), price_eur_foil: numberOrNull("price_eur_foil"),
    };
  });
  return {
    format: "mana-vault-backup",
    version: 5,
    customSets,
    customCards,
    createdAt: value.createdAt,
    cards,
    collections,
    collectionCards,
    decks,
    deckCards,
    deckLinks,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
