import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { DatabaseSync } from "node:sqlite";
import { cardInsertStatement } from "./database.js";

export async function importBulkFile(
  dataPath: string,
  database: DatabaseSync,
  onProgress?: (imported: number) => void,
): Promise<number> {
  const insertCard = cardInsertStatement(database);
  let imported = 0;
  const importValue = (value: unknown) => {
    const card = parsePrinting(value);
    if (!card.oracleId) return;
    insertCard.run(
      card.id,
      card.oracleId,
      card.name,
      card.manaCost,
      card.manaValue,
      card.typeLine,
      card.oracleText,
      card.colors.join(""),
      card.colorIdentity.join(""),
      JSON.stringify(card.legalities),
      card.set,
      card.setName,
      card.collectorNumber,
      card.rarity,
      card.imageUrl,
      card.releasedAt,
      card.artist,
    );
    imported += 1;
    if (imported % 25_000 === 0) onProgress?.(imported);
  };

  database.exec("BEGIN");
  try {
    if (await isJsonArray(dataPath)) {
      const source = chain([createReadStream(dataPath), parser(), streamArray()]);
      for await (const item of source) {
        if (typeof item !== "object" || item === null || !("value" in item)) {
          throw new Error("Scryfall bulk data contains an invalid entry");
        }
        importValue(item.value);
      }
    } else {
      const lines = createInterface({ input: createReadStream(dataPath), crlfDelay: Infinity });
      let lineNumber = 0;
      for await (const line of lines) {
        lineNumber += 1;
        const content = lineNumber === 1 ? line.replace(/^\uFEFF/, "").trim() : line.trim();
        if (!content) continue;
        let value: unknown;
        try {
          value = JSON.parse(content);
        } catch (error) {
          throw new Error(
            `Scryfall JSONL line ${lineNumber} is invalid: ${error instanceof Error ? error.message : "invalid JSON"}`,
          );
        }
        try {
          importValue(value);
        } catch (error) {
          throw new Error(
            `Scryfall JSONL line ${lineNumber} is invalid: ${error instanceof Error ? error.message : "invalid card record"}`,
          );
        }
      }
    }
    if (imported === 0) throw new Error("Scryfall bulk data did not contain any valid card printings");
    const updatedAt = new Date().toISOString();
    const saveMetadata = database.prepare(
      "INSERT INTO catalog_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    saveMetadata.run("updated_at", updatedAt);
    saveMetadata.run("last_imported_count", String(imported));
    database.exec("COMMIT");
    return imported;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  async function isJsonArray(dataPath: string): Promise<boolean> {
    for await (const chunk of createReadStream(dataPath)) {
      for (const byte of chunk) {
        if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
        if (byte === 0x5b) return true;
        if (byte === 0x7b || byte === 0xef) return false;
        throw new Error("Scryfall bulk data must be a JSON array or JSON Lines file");
      }
    }
    throw new Error("Scryfall bulk data file is empty");
  }
}

interface Printing {
  id: string;
  oracleId: string | null;
  name: string;
  manaCost: string | null;
  manaValue: number | null;
  typeLine: string;
  oracleText: string | null;
  colors: string[];
  colorIdentity: string[];
  legalities: Record<string, string>;
  set: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  imageUrl: string | null;
  releasedAt: string | null;
  artist: string | null;
}

function parsePrinting(value: unknown): Printing {
  const record = toRecord(value, "card");
  const cardFace = Array.isArray(record.card_faces) ? record.card_faces[0] : undefined;
  const cardFaceRecord = cardFace === undefined ? undefined : toRecord(cardFace, "card face");
  const faceImageUris = cardFaceRecord?.image_uris === undefined ? undefined : toRecord(cardFaceRecord.image_uris, "card face image");
  const imageUris = record.image_uris === undefined ? undefined : toRecord(record.image_uris, "card image");
  const colors = record.colors ?? [];
  const parsedColors = parseColors(colors, "colors");
  const colorIdentity = parseColors(record.color_identity ?? [], "color identity");
  const legalities = record.legalities ?? {};
  if (typeof legalities !== "object" || legalities === null || Array.isArray(legalities)) {
    throw new Error("Scryfall card has invalid legalities");
  }
  const parsedLegalities = Object.fromEntries(Object.entries(legalities).map(([format, status]) => {
    if (typeof status !== "string") throw new Error("Scryfall card has invalid legality status");
    return [format, status];
  }));
  const manaValue = record.cmc;
  if (manaValue !== undefined && manaValue !== null && (typeof manaValue !== "number" || !Number.isFinite(manaValue))) {
    throw new Error("Scryfall card has invalid mana value");
  }
  return {
    id: requiredString(record, "id"),
    oracleId: optionalString(record, "oracle_id"),
    name: requiredString(record, "name"),
    manaCost: optionalString(record, "mana_cost"),
    manaValue: typeof manaValue === "number" ? manaValue : null,
    typeLine: requiredString(record, "type_line"),
    oracleText: optionalString(record, "oracle_text"),
    colors: parsedColors,
    colorIdentity,
    legalities: parsedLegalities,
    set: requiredString(record, "set"),
    setName: requiredString(record, "set_name"),
    collectorNumber: requiredString(record, "collector_number"),
    rarity: requiredString(record, "rarity"),
    imageUrl: optionalString(imageUris ?? {}, "normal") ?? optionalString(faceImageUris ?? {}, "normal"),
    releasedAt: optionalString(record, "released_at"),
    artist: optionalString(record, "artist"),
  };
}

function parseColors(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((color) => typeof color === "string")) {
    throw new Error(`Scryfall card has invalid ${label}`);
  }
  return value;
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
