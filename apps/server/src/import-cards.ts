import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { PassThrough, Readable, Transform } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "./database.js";
import { saveSets } from "./sets.js";
import { importBulkFile } from "./import-bulk.js";
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
  fetcher?: typeof fetch;
  onDownloadProgress?: (downloadedBytes: number, totalBytes: number | null) => void;
}

export async function downloadBulkData(
  dataPath: string,
  { fetcher = fetch, onDownloadProgress }: ImportCardOptions = {},
): Promise<BulkDownloadResult> {
  const downloadPath = `${dataPath}.download`;
  try {
    const metadataResponse = await fetcher(metadataUrl, { headers: { "User-Agent": userAgent } });
    if (!metadataResponse.ok) {
      throw new Error(`Scryfall bulk-data request failed: ${metadataResponse.status} ${metadataResponse.statusText}`);
    }
    const metadata = await metadataResponse.json() as BulkMetadata;
    const bulkData = findDefaultCards(metadata);
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
    return imported;
  } finally {
    database.close();
    console.log(`Downloaded ${download.downloadedBytes.toLocaleString()} bytes of Scryfall bulk data (${download.format})`);
  }
}

function findDefaultCards(metadata: BulkMetadata): Record<string, unknown> {
  if (!metadata || !Array.isArray(metadata.data)) {
    throw new Error("Scryfall bulk-data response has no data list");
  }
  const bulkData = metadata.data.find((entry): entry is Record<string, unknown> =>
    typeof entry === "object" && entry !== null && "type" in entry && entry.type === "default_cards",
  );
  if (!bulkData) throw new Error("Scryfall did not return default_cards bulk data");
  return bulkData;
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
