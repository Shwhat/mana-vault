import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { initializeAuthTables } from "./auth.js";

export interface CardRow {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost: string | null;
  mana_value: number | null;
  type_line: string;
  oracle_text: string | null;
  colors: string;
  color_identity: string;
  legalities: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  image_url: string | null;
  released_at: string | null;
  artist: string | null;
}

export function openDatabase(path = process.env.DATABASE_PATH ?? "data/mana-vault.sqlite"): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  initializeDatabase(database);
  return database;
}

export function initializeDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      oracle_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mana_cost TEXT,
      mana_value REAL,
      type_line TEXT NOT NULL,
      oracle_text TEXT,
      colors TEXT NOT NULL DEFAULT '',
      color_identity TEXT NOT NULL DEFAULT '',
      legalities TEXT NOT NULL DEFAULT '{}',
      set_code TEXT NOT NULL,
      set_name TEXT NOT NULL,
      collector_number TEXT NOT NULL,
      rarity TEXT NOT NULL,
      image_url TEXT,
      released_at TEXT,
      artist TEXT
    );
    CREATE INDEX IF NOT EXISTS cards_name_idx ON cards(name);
    CREATE INDEX IF NOT EXISTS cards_set_code_idx ON cards(set_code);
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('normal', 'theme')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS deck_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      oracle_id TEXT NOT NULL,
      printing_id TEXT REFERENCES cards(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      zone TEXT NOT NULL CHECK(zone IN ('main', 'sideboard', 'commander'))
    );
  `);
  const columns = new Set(
    (database.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!columns.has("mana_value")) database.exec("ALTER TABLE cards ADD COLUMN mana_value REAL");
  if (!columns.has("color_identity")) database.exec("ALTER TABLE cards ADD COLUMN color_identity TEXT NOT NULL DEFAULT ''");
  if (!columns.has("legalities")) database.exec("ALTER TABLE cards ADD COLUMN legalities TEXT NOT NULL DEFAULT '{}'");
  if (!columns.has("artist")) database.exec("ALTER TABLE cards ADD COLUMN artist TEXT");
  const deckCardColumns = new Set(
    (database.prepare("PRAGMA table_info(deck_cards)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!deckCardColumns.has("id")) {
    database.exec(`
      CREATE TABLE deck_cards_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        oracle_id TEXT NOT NULL,
        printing_id TEXT REFERENCES cards(id),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        zone TEXT NOT NULL CHECK(zone IN ('main', 'sideboard', 'commander'))
      );
      INSERT INTO deck_cards_v2 (deck_id, oracle_id, printing_id, quantity, zone)
        SELECT deck_id, oracle_id, printing_id, quantity, zone FROM deck_cards;
      DROP TABLE deck_cards;
      ALTER TABLE deck_cards_v2 RENAME TO deck_cards;
    `);
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS deck_cards_normal_unique
      ON deck_cards(deck_id, oracle_id, zone) WHERE printing_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS deck_cards_theme_unique
      ON deck_cards(deck_id, oracle_id, printing_id, zone) WHERE printing_id IS NOT NULL;
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS catalog_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  initializeAuthTables(database);
  initializeLibrary(database);
}

/** Collections, set data, ownership and sharing (0.2.0). Also moves pre-0.2.0 data into the new tables. */
function initializeLibrary(database: DatabaseSync): void {
  const cardColumns = new Set(
    (database.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!cardColumns.has("finishes")) database.exec("ALTER TABLE cards ADD COLUMN finishes TEXT NOT NULL DEFAULT ''");
  if (!cardColumns.has("promo")) database.exec("ALTER TABLE cards ADD COLUMN promo INTEGER NOT NULL DEFAULT 0");
  if (!cardColumns.has("variation")) database.exec("ALTER TABLE cards ADD COLUMN variation INTEGER NOT NULL DEFAULT 0");
  const deckColumns = new Set(
    (database.prepare("PRAGMA table_info(decks)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!deckColumns.has("owner_id")) database.exec("ALTER TABLE decks ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  database.exec(`
    CREATE TABLE IF NOT EXISTS sets (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      set_type TEXT NOT NULL DEFAULT '',
      released_at TEXT,
      printed_size INTEGER,
      card_count INTEGER
    );
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      completion TEXT NOT NULL DEFAULT 'main' CHECK(completion IN ('main', 'all', 'names')),
      finish TEXT NOT NULL DEFAULT 'any' CHECK(finish IN ('any', 'regular', 'foil', 'both')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS collection_sets (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      set_code TEXT NOT NULL,
      PRIMARY KEY (collection_id, set_code)
    );
    CREATE TABLE IF NOT EXISTS collection_cards (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      foil INTEGER NOT NULL DEFAULT 0 CHECK(foil IN (0, 1)),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      PRIMARY KEY (collection_id, card_id, foil)
    );
    CREATE INDEX IF NOT EXISTS collection_cards_card_idx ON collection_cards(card_id);
    CREATE TABLE IF NOT EXISTS members (
      kind TEXT NOT NULL CHECK(kind IN ('collection', 'deck')),
      item_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      PRIMARY KEY (kind, item_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('collection', 'deck')),
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      from_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('copy', 'share', 'transfer')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      answered_at TEXT
    );
  `);
  const legacy = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'collection_items'").get();
  if (legacy) {
    database.exec("BEGIN");
    try {
      const count = Number(database.prepare("SELECT COUNT(*) AS count FROM collection_items").get()?.count ?? 0);
      if (count > 0) {
        const id = randomUUID();
        database.prepare("INSERT INTO collections (id, owner_id, name, completion, finish) VALUES (?, NULL, 'Main collection', 'main', 'any')").run(id);
        database.prepare(
          "INSERT INTO collection_cards (collection_id, card_id, foil, quantity) SELECT ?, card_id, foil, quantity FROM collection_items",
        ).run(id);
      }
      database.exec("DROP TABLE collection_items");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  assignUnowned(database);
}

/** Collections and decks without an owner (from before accounts owned data) go to the oldest account. */
export function assignUnowned(database: DatabaseSync): void {
  const oldest = database.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
  if (!oldest) return;
  database.prepare("UPDATE collections SET owner_id = ? WHERE owner_id IS NULL").run(oldest.id as number);
  database.prepare("UPDATE decks SET owner_id = ? WHERE owner_id IS NULL").run(oldest.id as number);
}

/** Card details that 0.2.0 added; kept separate so older callers of cardInsertStatement keep working. */
export function cardExtrasStatement(database: DatabaseSync) {
  return database.prepare("UPDATE cards SET finishes = ?, promo = ?, variation = ? WHERE id = ?");
}

export function cardInsertStatement(database: DatabaseSync) {
  return database.prepare(`
    INSERT INTO cards (
      id, oracle_id, name, mana_cost, mana_value, type_line, oracle_text, colors,
      color_identity, legalities, set_code, set_name, collector_number, rarity, image_url, released_at, artist
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      oracle_id = excluded.oracle_id,
      name = excluded.name,
      mana_cost = excluded.mana_cost,
      mana_value = excluded.mana_value,
      type_line = excluded.type_line,
      oracle_text = excluded.oracle_text,
      colors = excluded.colors,
      color_identity = excluded.color_identity,
      legalities = excluded.legalities,
      set_code = excluded.set_code,
      set_name = excluded.set_name,
      collector_number = excluded.collector_number,
      rarity = excluded.rarity,
      image_url = excluded.image_url,
      released_at = excluded.released_at,
      artist = excluded.artist
  `);
}
