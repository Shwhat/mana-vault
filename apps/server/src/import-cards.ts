import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { PassThrough, Readable, Transform } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "./database.js";
import { importBulkFile } from "./import-bulk.js";

const metadataUrl = "https://api.scryfall.com/bulk-data";
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
    return await importBulkFile(dataPath, database, (imported) => {
      if (imported > 0 && imported % 25_000 === 0) {
        console.log(`Imported ${imported.toLocaleString()} card printings...`);
      }
    });
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
