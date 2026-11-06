import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface CardRow {
  id: string;
  oracle_id: string;
  name: string;
  mana_cost: string | null;
  type_line: string;
  oracle_text: string | null;
  colors: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  image_url: string | null;
  released_at: string | null;
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
      type_line TEXT NOT NULL,
      oracle_text TEXT,
      colors TEXT NOT NULL DEFAULT '',
      set_code TEXT NOT NULL,
      set_name TEXT NOT NULL,
      collector_number TEXT NOT NULL,
      rarity TEXT NOT NULL,
      image_url TEXT,
      released_at TEXT
    );
    CREATE INDEX IF NOT EXISTS cards_name_idx ON cards(name);
    CREATE INDEX IF NOT EXISTS cards_set_code_idx ON cards(set_code);
    CREATE TABLE IF NOT EXISTS collection_items (
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      foil INTEGER NOT NULL DEFAULT 0 CHECK(foil IN (0, 1)),
      PRIMARY KEY (card_id, foil)
    );
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('normal', 'theme')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS deck_cards (
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      oracle_id TEXT NOT NULL,
      printing_id TEXT REFERENCES cards(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      zone TEXT NOT NULL CHECK(zone IN ('main', 'sideboard', 'commander')),
      PRIMARY KEY (deck_id, oracle_id, zone)
    );
  `);
}

export function cardInsertStatement(database: DatabaseSync) {
  return database.prepare(`
    INSERT INTO cards (
      id, oracle_id, name, mana_cost, type_line, oracle_text, colors,
      set_code, set_name, collector_number, rarity, image_url, released_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      oracle_id = excluded.oracle_id,
      name = excluded.name,
      mana_cost = excluded.mana_cost,
      type_line = excluded.type_line,
      oracle_text = excluded.oracle_text,
      colors = excluded.colors,
      set_code = excluded.set_code,
      set_name = excluded.set_name,
      collector_number = excluded.collector_number,
      rarity = excluded.rarity,
      image_url = excluded.image_url,
      released_at = excluded.released_at
  `);
}
