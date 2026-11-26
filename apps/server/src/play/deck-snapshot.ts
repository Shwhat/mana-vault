import type { DatabaseSync } from "node:sqlite";
import { access } from "../library.js";

type DeckZone = "main" | "sideboard" | "commander" | "maybeboard";

export type DeckSnapshotCard = Readonly<{
  entryId: number;
  oracleId: string;
  printingId: string | null;
  quantity: number;
  zone: DeckZone;
  finish: number;
  printing: Readonly<{
    id: string;
    name: string;
    setCode: string;
    collectorNumber: string;
    imageUrl: string | null;
    custom: boolean;
    removed: boolean;
  }> | null;
}>;

export type DeckSnapshot = Readonly<{
  deckId: string;
  name: string;
  format: string;
  cards: readonly DeckSnapshotCard[];
}>;

export class DeckSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckSnapshotError";
  }
}

function zoneOf(value: unknown): DeckZone {
  if (value === "main" || value === "sideboard" || value === "commander" || value === "maybeboard") return value;
  throw new DeckSnapshotError("Deck has an unsupported card zone");
}

export function snapshotDeck(database: DatabaseSync, deckId: string, userId: number): DeckSnapshot {
  database.exec("SAVEPOINT play_deck_snapshot");
  try {
    return readDeckSnapshot(database, deckId, userId);
  } finally {
    database.exec("RELEASE SAVEPOINT play_deck_snapshot");
  }
}

function readDeckSnapshot(database: DatabaseSync, deckId: string, userId: number): DeckSnapshot {
  if (!access(database, "deck", deckId, userId)) throw new DeckSnapshotError("Deck not found or access denied");
  const deck = database.prepare("SELECT name, format FROM decks WHERE id = ?").get(deckId);
  if (!deck || typeof deck.name !== "string" || typeof deck.format !== "string") {
    throw new DeckSnapshotError("Deck could not be read");
  }
  const rows = database.prepare(
    `SELECT dc.id, dc.oracle_id, dc.printing_id, dc.quantity, dc.zone, dc.finish,
            c.id AS card_id, c.name, c.set_code, c.collector_number, c.image_url, c.custom, c.removed
     FROM deck_cards dc LEFT JOIN cards c ON c.id = COALESCE(
       dc.printing_id, (SELECT p.id FROM cards p WHERE p.oracle_id = dc.oracle_id
                        ORDER BY p.removed, p.lang != 'en', p.released_at DESC, p.id LIMIT 1))
     WHERE dc.deck_id = ? ORDER BY dc.id`,
  ).all(deckId);
  const cards = rows.map((row): DeckSnapshotCard => {
    if (typeof row.id !== "number" || typeof row.oracle_id !== "string"
      || !(row.printing_id === null || typeof row.printing_id === "string")
      || typeof row.quantity !== "number" || !Number.isSafeInteger(row.quantity) || row.quantity <= 0
      || typeof row.finish !== "number") throw new DeckSnapshotError("Deck contains an invalid card entry");
    let printing: DeckSnapshotCard["printing"] = null;
    if (row.card_id !== null) {
      if (typeof row.card_id !== "string" || typeof row.name !== "string" || typeof row.set_code !== "string"
        || typeof row.collector_number !== "string" || !(row.image_url === null || typeof row.image_url === "string")
        || typeof row.custom !== "number" || typeof row.removed !== "number") {
        throw new DeckSnapshotError("Deck contains invalid printing data");
      }
      printing = Object.freeze({
        id: row.card_id, name: row.name, setCode: row.set_code, collectorNumber: row.collector_number,
        imageUrl: row.image_url, custom: row.custom === 1, removed: row.removed === 1,
      });
    }
    return Object.freeze({
      entryId: row.id, oracleId: row.oracle_id, printingId: row.printing_id,
      quantity: row.quantity, zone: zoneOf(row.zone), finish: row.finish, printing,
    });
  });
  return Object.freeze({ deckId, name: deck.name, format: deck.format, cards: Object.freeze(cards) });
}
