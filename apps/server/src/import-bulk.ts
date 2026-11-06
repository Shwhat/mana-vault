import { createReadStream } from "node:fs";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { DatabaseSync } from "node:sqlite";
import { cardInsertStatement } from "./database.js";

export async function importBulkFile(dataPath: string, database: DatabaseSync): Promise<number> {
  const insertCard = cardInsertStatement(database);
  const source = chain([createReadStream(dataPath), parser(), streamArray()]);
  let imported = 0;
  database.exec("BEGIN");
  try {
    for await (const item of source) {
      if (typeof item !== "object" || item === null || !("value" in item)) {
        throw new Error("Scryfall bulk data contains an invalid entry");
      }
      const card = parsePrinting(item.value);
      if (!card.oracleId) continue;
      insertCard.run(
        card.id,
        card.oracleId,
        card.name,
        card.manaCost,
        card.typeLine,
        card.oracleText,
        card.colors.join(""),
        card.set,
        card.setName,
        card.collectorNumber,
        card.rarity,
        card.imageUrl,
        card.releasedAt,
      );
      imported += 1;
    }
    database.exec("COMMIT");
    return imported;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

interface Printing {
  id: string;
  oracleId: string | null;
  name: string;
  manaCost: string | null;
  typeLine: string;
  oracleText: string | null;
  colors: string[];
  set: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  imageUrl: string | null;
  releasedAt: string | null;
}

function parsePrinting(value: unknown): Printing {
  const record = toRecord(value, "card");
  const cardFace = Array.isArray(record.card_faces) ? record.card_faces[0] : undefined;
  const cardFaceRecord = cardFace === undefined ? undefined : toRecord(cardFace, "card face");
  const faceImageUris = cardFaceRecord?.image_uris === undefined ? undefined : toRecord(cardFaceRecord.image_uris, "card face image");
  const imageUris = record.image_uris === undefined ? undefined : toRecord(record.image_uris, "card image");
  const colors = record.colors ?? [];
  if (!Array.isArray(colors) || !colors.every((color) => typeof color === "string")) {
    throw new Error("Scryfall card has invalid colors");
  }
  return {
    id: requiredString(record, "id"),
    oracleId: optionalString(record, "oracle_id"),
    name: requiredString(record, "name"),
    manaCost: optionalString(record, "mana_cost"),
    typeLine: requiredString(record, "type_line"),
    oracleText: optionalString(record, "oracle_text"),
    colors,
    set: requiredString(record, "set"),
    setName: requiredString(record, "set_name"),
    collectorNumber: requiredString(record, "collector_number"),
    rarity: requiredString(record, "rarity"),
    imageUrl: optionalString(imageUris ?? {}, "normal") ?? optionalString(faceImageUris ?? {}, "normal"),
    releasedAt: optionalString(record, "released_at"),
  };
}

function toRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Scryfall ${label} is not an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Scryfall card has no valid ${key}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`Scryfall card has invalid ${key}`);
  return value;
}
