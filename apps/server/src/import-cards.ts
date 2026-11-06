import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "./database.js";
import { importBulkFile } from "./import-bulk.js";

interface BulkMetadata {
  data: Array<{ type: string; download_uri: string }>;
}

const databasePath = process.env.DATABASE_PATH ?? "data/mana-vault.sqlite";
const dataPath = process.env.SCRYFALL_DATA_PATH ?? "data/default-cards.json";
const downloadPath = `${dataPath}.download`;

async function downloadBulkData(): Promise<void> {
  const metadataResponse = await fetch("https://api.scryfall.com/bulk-data", {
    headers: { "User-Agent": "mana-vault/0.0.0 (local card database importer)" },
  });
  if (!metadataResponse.ok) {
    throw new Error(`Scryfall bulk-data request failed: ${metadataResponse.status} ${metadataResponse.statusText}`);
  }
  const metadata = (await metadataResponse.json()) as BulkMetadata;
  const bulkData = metadata.data.find((item) => item.type === "default_cards");
  if (!bulkData) {
    throw new Error("Scryfall did not return default_cards bulk data");
  }

  const response = await fetch(bulkData.download_uri, {
    headers: { "User-Agent": "mana-vault/0.0.0 (local card database importer)" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Scryfall card-data download failed: ${response.status} ${response.statusText}`);
  }
  await mkdir(dirname(dataPath), { recursive: true });
  async function* chunks() {
    const reader = response.body!.getReader();
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
  await pipeline(Readable.from(chunks()), createWriteStream(downloadPath));
  await rename(downloadPath, dataPath);
}

async function importBulkData(): Promise<void> {
  await downloadBulkData();
  await mkdir(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  initializeDatabase(database);
  try {
    const imported = await importBulkFile(dataPath, database);
    console.log(`Imported ${imported.toLocaleString()} card printings into ${databasePath}`);
  } finally {
    database.close();
  }
}

importBulkData().catch(async (error: unknown) => {
  await rm(downloadPath, { force: true });
  console.error("Card import failed:", error);
  process.exitCode = 1;
});
