import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { PassThrough, Readable, Transform } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "./database.js";
import { saveSets } from "./sets.js";
import { importBulkFile, OFFICIAL_LANGUAGES } from "./import-bulk.js";
import { importScryfallExtras } from "./scryfall-extras.js";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";

const metadataUrl = "https://api.scryfall.com/bulk-data";
const setsUrl = "https://api.scryfall.com/sets";
const userAgent = "mana-vault/0.0.0 (local card database importer)";

interface BulkMetadata {
  data: unknown;
}

interface BulkDownloadResult {
  format: "jsonl" | "json-array";
  downloadedBytes: number;
}

interface ImportCardOptions {
  /** Which bulk file to download: a Scryfall bulk type, or a test on the type and name (default: default_cards). */
  bulk?: string | ((entry: Record<string, unknown>) => boolean);
  fetcher?: typeof fetch;
  onDownloadProgress?: (downloadedBytes: number, totalBytes: number | null) => void;
}

export async function downloadBulkData(
  dataPath: string,
  { fetcher = fetch, onDownloadProgress, bulk = "default_cards" }: ImportCardOptions = {},
): Promise<BulkDownloadResult> {
  const downloadPath = `${dataPath}.download`;
  try {
    const metadataResponse = await fetcher(metadataUrl, { headers: { "User-Agent": userAgent } });
    if (!metadataResponse.ok) {
      throw new Error(`Scryfall bulk-data request failed: ${metadataResponse.status} ${metadataResponse.statusText}`);
    }
    const metadata = await metadataResponse.json() as BulkMetadata;
    const bulkData = findBulk(metadata, bulk);
    const jsonlUri = optionalString(bulkData.jsonl_download_uri);
    const legacyUri = optionalString(bulkData.download_uri);
    const downloadUri = jsonlUri ?? legacyUri;
    if (!downloadUri) throw new Error("Scryfall default_cards metadata has no download URL");

    let downloadUrl: URL;
    try {
      downloadUrl = new URL(downloadUri);
    } catch {
      throw new Error("Scryfall default_cards metadata contains an invalid download URL");
    }
    if (downloadUrl.protocol !== "https:") {
      throw new Error("Scryfall default_cards download URL must use HTTPS");
    }

    const response = await fetcher(downloadUrl, { headers: { "User-Agent": userAgent } });
    if (!response.ok || !response.body) {
      throw new Error(`Scryfall card-data download failed: ${response.status} ${response.statusText}`);
    }

    await mkdir(dirname(dataPath), { recursive: true });
    let downloadedBytes = 0;
    const totalBytes = parseContentLength(response.headers.get("content-length"));
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloadedBytes += chunk.length;
        onDownloadProgress?.(downloadedBytes, totalBytes);
        callback(null, chunk);
      },
    });
    const compressed = Readable.from(responseChunks(response.body));
    const isJsonl = jsonlUri !== null;
    const isGzip = isJsonl || downloadUrl.pathname.toLowerCase().endsWith(".gz");
    const decompressed = isGzip ? createGunzip() : new PassThrough();
    await pipeline(compressed, progress, decompressed, createWriteStream(downloadPath));
    await rename(downloadPath, dataPath);
    return { format: isJsonl ? "jsonl" : "json-array", downloadedBytes };
  } catch (error) {
    await rm(downloadPath, { force: true });
    throw error;
  }
}

export async function importCardCatalog(
  databasePath: string,
  dataPath: string,
  options: ImportCardOptions = {},
): Promise<number> {
  const download = await downloadBulkData(dataPath, options);
  await mkdir(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    initializeDatabase(database);
    const imported = await importBulkFile(dataPath, database, (count) => {
      if (count > 0 && count % 25_000 === 0) {
        console.log(`Imported ${count.toLocaleString()} card printings...`);
      }
    });
    // The set list (names and printed sizes for set completion) is small; a failure keeps the previous list.
    try {
      const response = await (options.fetcher ?? fetch)(setsUrl, { headers: { "User-Agent": userAgent } });
      if (!response.ok) throw new Error(`Scryfall sets request failed: ${response.status} ${response.statusText}`);
      const saved = saveSets(database, await response.json());
      console.log(`Saved ${saved.toLocaleString()} sets`);
    } catch (error) {
      console.warn(`Could not update the set list: ${error instanceof Error ? error.message : String(error)}`);
    }
    // rulings for the card page; a failure keeps the previous rulings
    try {
      const saved = await importRulings(database, options.fetcher ?? fetch);
      console.log(`Saved ${saved.toLocaleString()} rulings`);
    } catch (error) {
      console.warn(`Could not update the rulings: ${error instanceof Error ? error.message : String(error)}`);
    }
    await importCatalogExtras(database, dataPath, options);
    return imported;
  } finally {
    database.close();
    console.log(`Downloaded ${download.downloadedBytes.toLocaleString()} bytes of Scryfall bulk data (${download.format})`);
  }
}

function findBulk(metadata: BulkMetadata, bulk: NonNullable<ImportCardOptions["bulk"]>): Record<string, unknown> {
  if (!metadata || !Array.isArray(metadata.data)) {
    throw new Error("Scryfall bulk-data response has no data list");
  }
  const match = typeof bulk === "string" ? (entry: Record<string, unknown>) => entry.type === bulk : bulk;
  const bulkData = metadata.data.find((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && match(entry as Record<string, unknown>));
  if (!bulkData) throw new Error(`Scryfall did not return ${typeof bulk === "string" ? bulk : "that"} bulk data`);
  return bulkData;
}

/** Scryfall's tag files, found by their type or name ("art_tags", "Art Tags"...). */
const tagBulk = (kind: "art" | "oracle") => (entry: Record<string, unknown>) =>
  new RegExp(`^${kind}[ _-]?tags?$`, "i").test(String(entry.type ?? "")) || new RegExp(`^${kind} tags$`, "i").test(String(entry.name ?? ""));

const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * Reads a Scryfall tag file (Art Tags or Oracle Tags) and replaces the stored tags of that kind. Each tag links to
 * illustrations (art tags) or cards (oracle tags) through its taggings or id lists. Returns how many tags were saved.
 */
export async function importTagFile(database: DatabaseSync, path: string, kind: "art" | "oracle"): Promise<number> {
  const insertTag = database.prepare("INSERT INTO tags (id, kind, label, description) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, label = excluded.label, description = excluded.description");
  const insertLink = database.prepare("INSERT OR IGNORE INTO tag_links (tag_id, ref) VALUES (?, ?)");
  const insertChild = database.prepare("INSERT OR IGNORE INTO tag_children (tag_id, child_id) VALUES (?, ?)");
  let saved = 0;
  const save = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const tag = value as Record<string, unknown>;
    const id = typeof tag.id === "string" ? tag.id : null;
    const label = typeof tag.label === "string" ? tag.label : typeof tag.slug === "string" ? tag.slug : typeof tag.name === "string" ? tag.name : null;
    if (!id || !label) return;
    insertTag.run(id, kind, label, typeof tag.description === "string" ? tag.description : "");
    const refs = new Set<string>([...listOf(tag.illustration_ids), ...listOf(tag.oracle_ids)]);
    if (Array.isArray(tag.taggings)) {
      for (const tagging of tag.taggings) {
        if (!tagging || typeof tagging !== "object") continue;
        const item = tagging as Record<string, unknown>;
        const ref = kind === "art" ? item.illustration_id ?? item.oracle_id : item.oracle_id ?? item.illustration_id;
        if (typeof ref === "string") refs.add(ref);
      }
    }
    for (const ref of refs) insertLink.run(id, ref);
    for (const child of listOf(tag.child_ids)) insertChild.run(id, child);
    saved += 1;
  };
  database.exec("BEGIN");
  try {
    database.exec(`DELETE FROM tag_links WHERE tag_id IN (SELECT id FROM tags WHERE kind = '${kind}');
      DELETE FROM tag_children WHERE tag_id IN (SELECT id FROM tags WHERE kind = '${kind}');
      DELETE FROM tags WHERE kind = '${kind}';`);
    const head = await readHead(path);
    if (head === "[") {
      for await (const item of chain([createReadStream(path), parser(), streamArray()])) save((item as { value: unknown }).value);
    } else if (head === "{") {
      // a JSON Lines file, or one object holding the list in "data"
      let text = "";
      let lines = 0;
      for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
        lines += 1;
        if (lines <= 1) text = line;
        else if (lines === 2) {
          save(JSON.parse(text));
          save(JSON.parse(line));
        } else if (line.trim()) save(JSON.parse(line));
      }
      if (lines === 1) {
        const whole = JSON.parse(text) as { data?: unknown };
        if (Array.isArray(whole.data)) whole.data.forEach(save);
        else save(whole);
      }
    }
    if (!saved) throw new Error(`The ${kind} tags file held no tags`);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return saved;
}

async function readHead(path: string): Promise<string> {
  for await (const chunk of createReadStream(path)) {
    for (const byte of chunk as Buffer) {
      if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0xef || byte === 0xbb || byte === 0xbf) continue;
      return String.fromCharCode(byte);
    }
  }
  return "";
}

/**
 * Saves today's prices of every printing whose price changed since its last saved day, so the history grows only
 * with changes. Returns how many prices were saved.
 */
export function snapshotPrices(database: DatabaseSync, day = new Date().toISOString().slice(0, 10)): number {
  return Number(database.prepare(
    `INSERT INTO price_history (card_id, day, usd, usd_foil, usd_etched, eur, eur_foil)
     SELECT c.id, ?, c.price_usd, c.price_usd_foil, c.price_usd_etched, c.price_eur, c.price_eur_foil FROM cards c
     LEFT JOIN price_history h ON h.card_id = c.id AND h.day = (SELECT MAX(day) FROM price_history x WHERE x.card_id = c.id AND x.day < ?)
     WHERE c.custom = 0 AND COALESCE(c.price_usd, c.price_usd_foil, c.price_usd_etched) IS NOT NULL
       AND (h.card_id IS NULL OR h.usd IS NOT c.price_usd OR h.usd_foil IS NOT c.price_usd_foil OR h.usd_etched IS NOT c.price_usd_etched
            OR h.eur IS NOT c.price_eur OR h.eur_foil IS NOT c.price_eur_foil)
     ON CONFLICT(card_id, day) DO UPDATE SET usd = excluded.usd, usd_foil = excluded.usd_foil, usd_etched = excluded.usd_etched,
       eur = excluded.eur, eur_foil = excluded.eur_foil`,
  ).run(day, day).changes);
}

/**
 * The parts of a card database update after the main card file: Scryfall's unofficial languages (from All Cards, when
 * turned on), the Art and Oracle tag files, and a price snapshot. Each part that fails keeps what was stored before.
 */
export async function importCatalogExtras(database: DatabaseSync, dataPath: string, options: ImportCardOptions = {}): Promise<void> {
  const keepLanguage = languageRule(database);
  const extraPath = `${dataPath}.extra`;
  if (keepLanguage.any) {
    try {
      await downloadBulkData(extraPath, { ...options, bulk: "all_cards" });
      const kept = await importBulkFile(extraPath, database, undefined, { keep: keepLanguage.keep, metadata: false });
      console.log(`Saved ${kept.toLocaleString()} printings in other languages`);
    } catch (error) {
      console.warn(`Could not update the other languages: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await rm(extraPath, { force: true });
    }
  }
  try {
    const removed = removeUnusedLanguages(database, keepLanguage.keep);
    if (removed) console.log(`Removed ${removed.toLocaleString()} printings in languages no longer chosen`);
  } catch (error) {
    console.warn(`Could not remove the languages no longer chosen: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const kind of ["art", "oracle"] as const) {
    const path = `${dataPath}.${kind}-tags`;
    try {
      await downloadBulkData(path, { ...options, bulk: tagBulk(kind) });
      const saved = await importTagFile(database, path, kind);
      console.log(`Saved ${saved.toLocaleString()} ${kind} tags`);
    } catch (error) {
      console.warn(`Could not update the ${kind} tags: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await rm(path, { force: true });
    }
  }
  try {
    const saved = snapshotPrices(database);
    console.log(`Saved ${saved.toLocaleString()} changed prices to the price history`);
  } catch (error) {
    console.warn(`Could not save the price history: ${error instanceof Error ? error.message : String(error)}`);
  }
  await importScryfallExtras(database, (options.fetcher ?? fetch) as unknown as Parameters<typeof importScryfallExtras>[1]);
}

const savedSetting = (database: DatabaseSync, key: string): unknown => {
  try {
    const row = database.prepare("SELECT value FROM server_settings WHERE key = ?").get(key);
    return row ? JSON.parse(String(row.value)) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Which languages other than English the card database keeps (Administration, Card database, Card languages):
 * unofficial languages (Phyrexian, Ancient Greek and others) when "extraLanguages" is on, and each official language
 * listed in "cardLanguages".
 */
export function languageRule(database: DatabaseSync): { keep: (lang: string) => boolean; any: boolean } {
  const extra = savedSetting(database, "extraLanguages");
  const extraLanguages = extra === undefined ? true : extra !== false && extra !== "false";
  const listed = savedSetting(database, "cardLanguages");
  const chosen = new Set(Array.isArray(listed) ? listed.filter((item): item is string => typeof item === "string") : []);
  return {
    keep: (lang) => lang !== "en" && (OFFICIAL_LANGUAGES.has(lang) ? chosen.has(lang) : extraLanguages),
    any: extraLanguages || chosen.size > 0,
  };
}

/** Removes printings in languages no longer kept, except printings that copies, decks, trades or lists still use. */
export function removeUnusedLanguages(database: DatabaseSync, keep: (lang: string) => boolean): number {
  const languages = (database.prepare("SELECT DISTINCT lang FROM cards WHERE lang != 'en' AND custom = 0").all() as Array<{ lang: string }>)
    .map((row) => String(row.lang)).filter((lang) => !keep(lang));
  let removed = 0;
  for (const lang of languages) {
    removed += Number(database.prepare(
      `DELETE FROM cards WHERE lang = ? AND custom = 0
         AND NOT EXISTS (SELECT 1 FROM collection_cards WHERE card_id = cards.id)
         AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE printing_id = cards.id OR want_card_id = cards.id)
         AND NOT EXISTS (SELECT 1 FROM trade_lines WHERE card_id = cards.id)
         AND NOT EXISTS (SELECT 1 FROM print_lists WHERE lines LIKE '%' || cards.id || '%')`,
    ).run(lang).changes);
  }
  return removed;
}

/** Downloads Scryfall's rulings file and replaces the stored rulings. Returns how many were saved. */
export async function importRulings(database: DatabaseSync, fetcher: typeof fetch = fetch): Promise<number> {
  const metadataResponse = await fetcher(metadataUrl, { headers: { "User-Agent": userAgent } });
  if (!metadataResponse.ok) throw new Error(`Scryfall bulk-data request failed: ${metadataResponse.status}`);
  const metadata = await metadataResponse.json() as BulkMetadata;
  const entry = Array.isArray(metadata.data)
    ? metadata.data.find((item): item is Record<string, unknown> => typeof item === "object" && item !== null && (item as { type?: unknown }).type === "rulings")
    : undefined;
  const uri = typeof entry?.download_uri === "string" ? entry.download_uri : null;
  if (!uri || !uri.startsWith("https://")) throw new Error("Scryfall rulings metadata has no download URL");
  const response = await fetcher(uri, { headers: { "User-Agent": userAgent } });
  if (!response.ok || !response.body) throw new Error(`Scryfall rulings download failed: ${response.status}`);
  const isGzip = new URL(uri).pathname.toLowerCase().endsWith(".gz");
  const source = chain([Readable.from(responseChunks(response.body)), isGzip ? createGunzip() : new PassThrough(), parser(), streamArray()]);
  const insert = database.prepare("INSERT INTO rulings (oracle_id, published_at, source, comment) VALUES (?, ?, ?, ?)");
  let saved = 0;
  database.exec("BEGIN");
  try {
    database.exec("DELETE FROM rulings");
    for await (const item of source as AsyncIterable<{ value: unknown }>) {
      const value = item.value as Record<string, unknown> | null;
      if (!value || typeof value.oracle_id !== "string" || typeof value.comment !== "string") continue;
      insert.run(value.oracle_id, typeof value.published_at === "string" ? value.published_at : "", typeof value.source === "string" ? value.source : "", value.comment);
      saved += 1;
    }
    if (!saved) throw new Error("The rulings file held no rulings");
    database.prepare("INSERT INTO catalog_metadata (key, value) VALUES ('rulings_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return saved;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Scryfall default_cards metadata contains an invalid download URL");
  return value;
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

async function* responseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function main(): Promise<void> {
  const databasePath = process.env.DATABASE_PATH ?? "data/mana-vault.sqlite";
  const dataPath = process.env.SCRYFALL_DATA_PATH ?? "data/default-cards.json";
  let lastReportedPercent = -1;
  let nextReportedBytes = 25 * 1024 * 1024;
  const imported = await importCardCatalog(databasePath, dataPath, {
    onDownloadProgress(downloadedBytes, totalBytes) {
      if (totalBytes) {
        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
        if ((percent === 100 || percent % 10 === 0) && percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          console.log(`Downloaded Scryfall bulk data: ${percent}% (${downloadedBytes.toLocaleString()} / ${totalBytes.toLocaleString()} bytes)`);
        }
      } else if (downloadedBytes >= nextReportedBytes) {
        console.log(`Downloaded ${downloadedBytes.toLocaleString()} bytes of Scryfall bulk data...`);
        nextReportedBytes += 25 * 1024 * 1024;
      }
    },
  });
  console.log(`Imported ${imported.toLocaleString()} card printings into ${databasePath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error("Card import failed:", error);
    process.exitCode = 1;
  });
}
