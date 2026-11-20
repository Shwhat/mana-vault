import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { cardBuilderStatement, cardExtrasStatement, cardInsertStatement, cardPricesStatement, cardTreatmentStatement } from "./database.js";

/** The ten languages Wizards prints Magic in besides English. Other Scryfall languages (Phyrexian, Quenya...) are unofficial. */
export const OFFICIAL_LANGUAGES = new Set(["es", "fr", "de", "it", "pt", "ja", "ko", "ru", "zhs", "zht"]);

export type BulkImportOptions = {
  /** Which printings to keep, by Scryfall language code; others are passed over without counting as skipped. */
  keep?: (lang: string) => boolean;
  /** Writes the update date and counts (the main card file does; the extra languages file does not). */
  metadata?: boolean;
};

const textList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(",") : "");

export async function importBulkFile(
  dataPath: string,
  database: DatabaseSync,
  onProgress?: (imported: number) => void,
  { keep, metadata = true }: BulkImportOptions = {},
): Promise<number> {
  const insertCard = cardInsertStatement(database);
  const insertExtras = cardExtrasStatement(database);
  const insertPrices = cardPricesStatement(database);
  const insertStats = database.prepare("UPDATE cards SET power = ?, toughness = ? WHERE id = ?");
  const insertBuilder = cardBuilderStatement(database);
  const insertBack = database.prepare("UPDATE cards SET back_image_url = ? WHERE id = ?");
  const insertTreatment = cardTreatmentStatement(database);
  // the whole Scryfall record, compressed, so any field can be read later without the internet
  const insertRecord = database.prepare("INSERT INTO card_records (id, record) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record");
  const clearArt = database.prepare("DELETE FROM card_illustrations WHERE card_id = ?");
  const insertArt = database.prepare("INSERT OR IGNORE INTO card_illustrations (card_id, illustration_id) VALUES (?, ?)");
  let imported = 0;
  // a record that fails a check is skipped so one bad card never stops the whole update
  let skipped = 0;
  const skippedNames: string[] = [];
  const skip = (value: unknown) => {
    skipped += 1;
    const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const label = [record.name, record.set && record.collector_number ? `(${String(record.set).toUpperCase()}) ${String(record.collector_number)}` : ""]
      .filter((part) => typeof part === "string" && part).join(" ") || (typeof record.id === "string" ? record.id : "unnamed record");
    if (skippedNames.length < 50) skippedNames.push(label);
  };
  const tryImport = (value: unknown) => {
    try {
      importValue(value);
    } catch {
      skip(value);
    }
  };
  const importValue = (value: unknown) => {
    const raw = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const lang = typeof raw.lang === "string" ? raw.lang : "en";
    if (keep && !keep(lang)) return;
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
    insertExtras.run(card.finishes.join(","), card.promo ? 1 : 0, card.variation ? 1 : 0, card.id);
    const prices = card.prices;
    insertPrices.run(prices.usd, prices.usd_foil, prices.usd_etched, prices.eur, prices.eur_foil, card.flavorName, card.id);
    insertStats.run(card.power, card.toughness, card.id);
    insertBuilder.run(card.producedMana.join(""), card.tokens.length ? JSON.stringify(card.tokens) : "", card.id);
    insertBack.run(card.backImageUrl, card.id);
    const faces = Array.isArray(raw.card_faces) ? raw.card_faces.filter((face): face is Record<string, unknown> => !!face && typeof face === "object") : [];
    insertTreatment.run(
      lang, textList(raw.promo_types), textList(raw.frame_effects), typeof raw.frame === "string" ? raw.frame : "",
      typeof raw.border_color === "string" ? raw.border_color : "", raw.full_art === true ? 1 : 0, textList(raw.keywords),
      typeof raw.printed_name === "string" ? raw.printed_name : null, card.id,
    );
    clearArt.run(card.id);
    for (const art of [raw.illustration_id, ...faces.map((face) => face.illustration_id)]) {
      if (typeof art === "string" && art) insertArt.run(card.id, art);
    }
    insertRecord.run(card.id, gzipSync(JSON.stringify(value)));
    imported += 1;
    if (imported % 25_000 === 0) onProgress?.(imported);
  };

  database.exec("BEGIN");
  try {
    if (await isJsonArray(dataPath)) {
      const source = chain([createReadStream(dataPath), parser(), streamArray()]);
      for await (const item of source) {
        if (typeof item !== "object" || item === null || !("value" in item)) {
          skip(null);
          continue;
        }
        tryImport(item.value);
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
        } catch {
          skip({ id: `line ${lineNumber}` });
          continue;
        }
        tryImport(value);
      }
    }
    if (!metadata) {
      database.exec("COMMIT");
      return imported;
    }
    if (imported === 0) throw new Error("Scryfall bulk data did not contain any valid card printings");
    const updatedAt = new Date().toISOString();
    const saveMetadata = database.prepare(
      "INSERT INTO catalog_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    saveMetadata.run("updated_at", updatedAt);
    saveMetadata.run("last_imported_count", String(imported));
    saveMetadata.run("last_skipped_count", String(skipped));
    saveMetadata.run("last_skipped_names", JSON.stringify(skippedNames));
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
  backImageUrl: string | null;
  releasedAt: string | null;
  artist: string | null;
  finishes: string[];
  promo: boolean;
  variation: boolean;
  prices: Record<"usd" | "usd_foil" | "usd_etched" | "eur" | "eur_foil", number | null>;
  flavorName: string | null;
  power: string | null;
  toughness: string | null;
  /** W, U, B, R, G and C for the colors of mana the card can make. */
  producedMana: string[];
  /** The tokens the card creates, by printing id and name. */
  tokens: Array<{ id: string; name: string }>;
}

/** Scryfall sends prices as decimal strings or null; anything else is treated as no price. */
function parsePrices(value: unknown): Printing["prices"] {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const read = (key: string) => {
    const text = record[key];
    const number = typeof text === "string" ? Number(text) : typeof text === "number" ? text : NaN;
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  return { usd: read("usd"), usd_foil: read("usd_foil"), usd_etched: read("usd_etched"), eur: read("eur"), eur_foil: read("eur_foil") };
}

function parsePrinting(value: unknown): Printing {
  const record = toRecord(value, "card");
  const cardFaces = parseCardFaces(record.card_faces);
  const cardFaceRecord = cardFaces[0];
  const faceImageUris = cardFaceRecord?.image_uris === undefined ? undefined : toRecord(cardFaceRecord.image_uris, "card face image");
  const imageUris = record.image_uris === undefined ? undefined : toRecord(record.image_uris, "card image");
  const topLevelTypeLine = optionalString(record, "type_line");
  const faceTypeLines = cardFaces
    .map((face) => optionalString(face, "type_line"))
    .filter((typeLine): typeLine is string => typeLine !== null);
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
    typeLine: topLevelTypeLine ?? faceTypeLines.join(" // "),
    // two-faced cards keep their text on each face
    oracleText: optionalString(record, "oracle_text")
      ?? (cardFaces.map((face) => optionalString(face, "oracle_text")).filter((text): text is string => !!text).join("\n//\n") || null),
    colors: parsedColors,
    colorIdentity,
    legalities: parsedLegalities,
    set: requiredString(record, "set"),
    setName: requiredString(record, "set_name"),
    collectorNumber: requiredString(record, "collector_number"),
    rarity: requiredString(record, "rarity"),
    imageUrl: optionalString(imageUris ?? {}, "normal") ?? optionalString(faceImageUris ?? {}, "normal"),
    // two-faced cards with a picture for each face (transform, modal) keep the back face's picture for printing
    backImageUrl: imageUris === undefined && cardFaces[1]?.image_uris !== undefined
      ? optionalString(toRecord(cardFaces[1].image_uris, "card face image"), "normal") : null,
    releasedAt: optionalString(record, "released_at"),
    artist: optionalString(record, "artist"),
    finishes: Array.isArray(record.finishes) ? record.finishes.filter((finish): finish is string => typeof finish === "string") : [],
    promo: record.promo === true,
    variation: record.variation === true,
    prices: parsePrices(record.prices),
    flavorName: typeof record.flavor_name === "string" && record.flavor_name ? record.flavor_name
      : typeof cardFaceRecord?.flavor_name === "string" && cardFaceRecord.flavor_name ? cardFaceRecord.flavor_name : null,
    power: optionalString(record, "power") ?? (cardFaceRecord ? optionalString(cardFaceRecord, "power") : null),
    toughness: optionalString(record, "toughness") ?? (cardFaceRecord ? optionalString(cardFaceRecord, "toughness") : null),
    producedMana: Array.isArray(record.produced_mana)
      ? ["W", "U", "B", "R", "G", "C"].filter((color) => (record.produced_mana as unknown[]).includes(color)) : [],
    tokens: Array.isArray(record.all_parts)
      ? record.all_parts.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const item = part as Record<string, unknown>;
        return item.component === "token" && typeof item.id === "string" && typeof item.name === "string" ? [{ id: item.id, name: item.name }] : [];
      }).slice(0, 20) : [],
  };
}

function parseCardFaces(value: unknown): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Scryfall card has invalid card faces");
  return value.map((face) => toRecord(face, "card face"));
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
