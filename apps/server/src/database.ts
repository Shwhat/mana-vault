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
      completion TEXT NOT NULL DEFAULT 'none' CHECK(completion IN ('none', 'main', 'all', 'names')),
      finish TEXT NOT NULL DEFAULT 'any' CHECK(finish IN ('any', 'regular', 'foil', 'both')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      kind TEXT NOT NULL DEFAULT 'collection' CHECK(kind IN ('collection', 'wishlist'))
    );
    CREATE TABLE IF NOT EXISTS collection_sets (
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      set_code TEXT NOT NULL,
      PRIMARY KEY (collection_id, set_code)
    );
    CREATE TABLE IF NOT EXISTS collection_cards (${COLLECTION_CARDS_COLUMNS});
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
  upgradeCopies(database);
  upgradeLinks(database);
  upgradeDeckBuilder(database);
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

/**
 * One row per kind of copy in a collection: printing, finish (0 regular, 1 foil, 2 etched), condition, language and
 * whether the copies are proxies. trade is how many of those copies are offered for trade. The purchase price, date
 * added and the misprint, altered and signed marks are details of the row (0.6.0).
 */
const COLLECTION_CARDS_COLUMNS = `
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      foil INTEGER NOT NULL DEFAULT 0 CHECK(foil IN (0, 1, 2)),
      condition TEXT NOT NULL DEFAULT 'NM' CHECK(condition IN ('M', 'NM', 'LP', 'MP', 'HP', 'DMG')),
      language TEXT NOT NULL DEFAULT 'en',
      proxy INTEGER NOT NULL DEFAULT 0 CHECK(proxy IN (0, 1)),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      trade INTEGER NOT NULL DEFAULT 0 CHECK(trade >= 0),
      purchase_price REAL,
      price_currency TEXT,
      added_at TEXT,
      misprint INTEGER NOT NULL DEFAULT 0,
      altered INTEGER NOT NULL DEFAULT 0,
      signed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (collection_id, card_id, foil, condition, language, proxy)`;

/** Prices, flavor names, wishlists and copy details (0.3.0). Rebuilds collection_cards from 0.2.0 with the new key. */
function upgradeCopies(database: DatabaseSync): void {
  const cardColumns = new Set(
    (database.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  for (const column of ["price_usd", "price_usd_foil", "price_usd_etched", "price_eur", "price_eur_foil"]) {
    if (!cardColumns.has(column)) database.exec(`ALTER TABLE cards ADD COLUMN ${column} REAL`);
  }
  if (!cardColumns.has("flavor_name")) database.exec("ALTER TABLE cards ADD COLUMN flavor_name TEXT");
  if (!cardColumns.has("power")) database.exec("ALTER TABLE cards ADD COLUMN power TEXT");
  if (!cardColumns.has("toughness")) database.exec("ALTER TABLE cards ADD COLUMN toughness TEXT");
  database.exec("CREATE INDEX IF NOT EXISTS cards_oracle_idx ON cards(oracle_id)");
  database.exec("CREATE INDEX IF NOT EXISTS cards_flavor_idx ON cards(flavor_name) WHERE flavor_name IS NOT NULL");
  const collectionColumns = new Set(
    (database.prepare("PRAGMA table_info(collections)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!collectionColumns.has("kind")) {
    database.exec("ALTER TABLE collections ADD COLUMN kind TEXT NOT NULL DEFAULT 'collection' CHECK(kind IN ('collection', 'wishlist'))");
  }
  const copyColumns = new Set(
    (database.prepare("PRAGMA table_info(collection_cards)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!copyColumns.has("condition")) {
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec("BEGIN");
    try {
      database.exec(`
        CREATE TABLE collection_cards_v3 (${COLLECTION_CARDS_COLUMNS});
        INSERT INTO collection_cards_v3 (collection_id, card_id, foil, quantity)
          SELECT collection_id, card_id, foil, quantity FROM collection_cards;
        DROP TABLE collection_cards;
        ALTER TABLE collection_cards_v3 RENAME TO collection_cards;
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.exec("PRAGMA foreign_keys = ON");
    }
  }
  database.exec("CREATE INDEX IF NOT EXISTS collection_cards_card_idx ON collection_cards(card_id)");
}

const tableSql = (database: DatabaseSync, name: string) =>
  String(database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.sql ?? "");

/** Runs schema work with foreign keys off, in one transaction. */
function rebuild(database: DatabaseSync, sql: string): void {
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN");
  try {
    database.exec(sql);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

/**
 * Completion rule None, proxies and copy details, deck links, rulings and decks that always keep their printing (0.6.0).
 * A deck card is linked to the copies in collections that fill it; each copy fills one deck at a time.
 */
function upgradeLinks(database: DatabaseSync): void {
  if (!tableSql(database, "collections").includes("'none'")) {
    rebuild(database, `
      CREATE TABLE collections_v6 (
        id TEXT PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        completion TEXT NOT NULL DEFAULT 'none' CHECK(completion IN ('none', 'main', 'all', 'names')),
        finish TEXT NOT NULL DEFAULT 'any' CHECK(finish IN ('any', 'regular', 'foil', 'both')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        kind TEXT NOT NULL DEFAULT 'collection' CHECK(kind IN ('collection', 'wishlist'))
      );
      INSERT INTO collections_v6 (id, owner_id, name, description, completion, finish, created_at, updated_at, kind)
        SELECT id, owner_id, name, description, completion, finish, created_at, updated_at, kind FROM collections;
      DROP TABLE collections;
      ALTER TABLE collections_v6 RENAME TO collections;
    `);
  }
  const copyColumns = new Set(
    (database.prepare("PRAGMA table_info(collection_cards)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!copyColumns.has("proxy")) {
    rebuild(database, `
      CREATE TABLE collection_cards_v6 (${COLLECTION_CARDS_COLUMNS});
      INSERT INTO collection_cards_v6 (collection_id, card_id, foil, condition, language, quantity, trade)
        SELECT collection_id, card_id, foil, condition, language, quantity, trade FROM collection_cards;
      DROP TABLE collection_cards;
      ALTER TABLE collection_cards_v6 RENAME TO collection_cards;
    `);
  }
  database.exec("CREATE INDEX IF NOT EXISTS collection_cards_card_idx ON collection_cards(card_id)");
  const deckColumns = new Set(
    (database.prepare("PRAGMA table_info(decks)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!deckColumns.has("collection_id")) database.exec("ALTER TABLE decks ADD COLUMN collection_id TEXT");
  database.exec(`
    CREATE TABLE IF NOT EXISTS deck_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_card_id INTEGER NOT NULL REFERENCES deck_cards(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      foil INTEGER NOT NULL,
      condition TEXT NOT NULL,
      language TEXT NOT NULL,
      proxy INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      UNIQUE (deck_card_id, collection_id, card_id, foil, condition, language, proxy)
    );
    CREATE INDEX IF NOT EXISTS deck_links_copy_idx ON deck_links(collection_id, card_id);
    CREATE TABLE IF NOT EXISTS rulings (
      oracle_id TEXT NOT NULL,
      published_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rulings_oracle_idx ON rulings(oracle_id);
  `);
  // every deck keeps the printing of each card; a deck card without one takes the newest printing
  if (database.prepare("SELECT 1 FROM decks WHERE mode = 'normal' LIMIT 1").get() ||
    database.prepare("SELECT 1 FROM deck_cards WHERE printing_id IS NULL LIMIT 1").get()) {
    database.exec("BEGIN");
    try {
      database.exec(`
        UPDATE deck_cards SET printing_id = (
          SELECT p.id FROM cards p WHERE p.oracle_id = deck_cards.oracle_id
          ORDER BY p.released_at IS NULL, p.released_at DESC, p.promo, p.variation LIMIT 1
        ) WHERE printing_id IS NULL AND EXISTS (SELECT 1 FROM cards p WHERE p.oracle_id = deck_cards.oracle_id);
        UPDATE decks SET mode = 'theme' WHERE mode = 'normal';
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

/**
 * The deck builder (0.7.0): a Maybeboard zone, tags on deck cards, a deck description and cover card, the deck's change
 * history, and the mana a card makes and the tokens it creates.
 */
function upgradeDeckBuilder(database: DatabaseSync): void {
  if (!tableSql(database, "deck_cards").includes("'maybeboard'")) {
    rebuild(database, `
      CREATE TABLE deck_cards_v7 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        oracle_id TEXT NOT NULL,
        printing_id TEXT REFERENCES cards(id),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        zone TEXT NOT NULL CHECK(zone IN ('main', 'sideboard', 'commander', 'maybeboard')),
        tags TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO deck_cards_v7 (id, deck_id, oracle_id, printing_id, quantity, zone)
        SELECT id, deck_id, oracle_id, printing_id, quantity, zone FROM deck_cards;
      DROP TABLE deck_cards;
      ALTER TABLE deck_cards_v7 RENAME TO deck_cards;
      CREATE UNIQUE INDEX IF NOT EXISTS deck_cards_normal_unique ON deck_cards(deck_id, oracle_id, zone) WHERE printing_id IS NULL;
    `);
  }
  const deckColumns = new Set(
    (database.prepare("PRAGMA table_info(decks)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!deckColumns.has("description")) database.exec("ALTER TABLE decks ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!deckColumns.has("cover_card_id")) database.exec("ALTER TABLE decks ADD COLUMN cover_card_id TEXT");
  const cardColumns = new Set(
    (database.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!cardColumns.has("produced_mana")) database.exec("ALTER TABLE cards ADD COLUMN produced_mana TEXT NOT NULL DEFAULT ''");
  if (!cardColumns.has("tokens")) database.exec("ALTER TABLE cards ADD COLUMN tokens TEXT NOT NULL DEFAULT ''");
  database.exec(`
    CREATE TABLE IF NOT EXISTS deck_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      user_name TEXT NOT NULL DEFAULT '',
      change TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS deck_history_deck_idx ON deck_history(deck_id, id);
  `);
  initializeCustomTables(database);
}

/** Custom cards and sets (0.9.0): cards made in the card maker are rows of the card database marked custom. */
function initializeCustomTables(database: DatabaseSync): void {
  const cardColumns = new Set((database.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!cardColumns.has("custom")) database.exec("ALTER TABLE cards ADD COLUMN custom INTEGER NOT NULL DEFAULT 0");
  // the finish a deck card is played in: 0 regular, 1 foil, 2 etched (0.10.0)
  const deckCardColumns = new Set((database.prepare("PRAGMA table_info(deck_cards)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!deckCardColumns.has("finish")) database.exec("ALTER TABLE deck_cards ADD COLUMN finish INTEGER NOT NULL DEFAULT 0");
  // the version a deck card is wanted in when it is marked Upgrade wanted (0.11.0)
  if (!deckCardColumns.has("want_card_id")) database.exec("ALTER TABLE deck_cards ADD COLUMN want_card_id TEXT");
  if (!deckCardColumns.has("want_finish")) database.exec("ALTER TABLE deck_cards ADD COLUMN want_finish INTEGER NOT NULL DEFAULT 0");
  // a deck card is a printing in a finish and a zone (0.11.0): the same printing can be in a deck once regular and once foil
  database.exec(`
    DROP INDEX IF EXISTS deck_cards_theme_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS deck_cards_finish_unique ON deck_cards(deck_id, oracle_id, printing_id, zone, finish) WHERE printing_id IS NOT NULL;
  `);
  // the picture of a two-faced card's back face, for printing proxies (0.9.0)
  if (!cardColumns.has("back_image_url")) database.exec("ALTER TABLE cards ADD COLUMN back_image_url TEXT");
  database.exec(`
    CREATE TABLE IF NOT EXISTS custom_sets (
      code TEXT PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      symbol BLOB,
      symbol_type TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE TABLE IF NOT EXISTS custom_cards (
      id TEXT PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      design TEXT NOT NULL DEFAULT '{}',
      picture BLOB,
      picture_type TEXT,
      back_picture BLOB,
      back_picture_type TEXT,
      art BLOB,
      art_type TEXT,
      back_art BLOB,
      back_art_type TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE INDEX IF NOT EXISTS cards_custom_idx ON cards(custom);
  `);
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

/** The colors of mana a card makes and the tokens it creates (0.7.0), stored on each card database update. */
export function cardBuilderStatement(database: DatabaseSync) {
  return database.prepare("UPDATE cards SET produced_mana = ?, tokens = ? WHERE id = ?");
}

/** Prices and the flavor name (0.3.0), stored on each card database update. */
export function cardPricesStatement(database: DatabaseSync) {
  return database.prepare(
    "UPDATE cards SET price_usd = ?, price_usd_foil = ?, price_usd_etched = ?, price_eur = ?, price_eur_foil = ?, flavor_name = ? WHERE id = ?",
  );
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
