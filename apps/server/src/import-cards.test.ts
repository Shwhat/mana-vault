import { gunzipSync, gzipSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "./database.js";
import { downloadBulkData, importRulings } from "./import-cards.js";
import { importBulkFile } from "./import-bulk.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function outputPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mana-vault-download-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "default-cards.json");
}

function fetchResponses(metadata: unknown, download: Response): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    if (String(input) === "https://api.scryfall.com/bulk-data") {
      return Response.json(metadata);
    }
    return download;
  }) as unknown as typeof fetch;
}

describe("Scryfall bulk-data downloader", () => {
  it("uses the current JSONL URL, decompresses gzip, and reports download progress", async () => {
    const path = await outputPath();
    const jsonl = `${JSON.stringify({
      id: "printing-1",
      oracle_id: "oracle-1",
      name: "Lightning Bolt",
      mana_cost: "{R}",
      cmc: 1,
      type_line: "Instant",
      colors: ["R"],
      color_identity: ["R"],
      legalities: { modern: "legal" },
      set: "lea",
      set_name: "Limited Edition Alpha",
      collector_number: "161",
      rarity: "common",
    })}\n`;
    const compressed = gzipSync(jsonl);
    const onDownloadProgress = vi.fn();
    const fetcher = fetchResponses({
      data: [{
        type: "default_cards",
        jsonl_download_uri: "https://data.scryfall.io/default-cards/default-cards-current.jsonl.gz",
        compressed_size: compressed.length,
      }],
    }, new Response(compressed, { headers: { "content-length": String(compressed.length) } }));

    const result = await downloadBulkData(path, { fetcher, onDownloadProgress });
    expect(result).toEqual({ format: "jsonl", downloadedBytes: compressed.length });
    expect(await readFile(path, "utf8")).toBe(jsonl);
    expect(gunzipSync(compressed).toString()).toBe(jsonl);
    expect(onDownloadProgress).toHaveBeenCalled();
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    try {
      expect(await importBulkFile(path, database)).toBe(1);
      expect(database.prepare("SELECT name FROM cards WHERE id = 'printing-1'").get()?.name).toBe("Lightning Bolt");
    } finally {
      database.close();
    }
  });

  it("supports the previous uncompressed JSON-array download URL", async () => {
    const path = await outputPath();
    const json = '[{"id":"printing-1"}]';
    const fetcher = fetchResponses(
      { data: [{ type: "default_cards", download_uri: "https://data.scryfall.io/default-cards.json" }] },
      new Response(json),
    );
    expect(await downloadBulkData(path, { fetcher })).toMatchObject({ format: "json-array" });
    expect(await readFile(path, "utf8")).toBe(json);
  });

  it("rejects missing and invalid download URLs before making the download request", async () => {
    const path = await outputPath();
    const fetcher = vi.fn(async () => Response.json({ data: [{ type: "default_cards" }] })) as unknown as typeof fetch;
    await expect(downloadBulkData(path, { fetcher })).rejects.toThrow("no download URL");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const invalidFetcher = vi.fn(async () => Response.json({
      data: [{ type: "default_cards", jsonl_download_uri: "file:///etc/passwd" }],
    })) as unknown as typeof fetch;
    await expect(downloadBulkData(path, { fetcher: invalidFetcher })).rejects.toThrow("must use HTTPS");
    expect(invalidFetcher).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly on unsuccessful downloads and removes partial files", async () => {
    const path = await outputPath();
    const fetcher = fetchResponses(
      { data: [{ type: "default_cards", jsonl_download_uri: "https://data.scryfall.io/cards.jsonl.gz" }] },
      new Response("unavailable", { status: 503, statusText: "Service Unavailable" }),
    );
    await expect(downloadBulkData(path, { fetcher })).rejects.toThrow("card-data download failed: 503");
    await expect(readFile(`${path}.download`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes a partial file when gzip decompression fails", async () => {
    const path = await outputPath();
    const fetcher = fetchResponses(
      { data: [{ type: "default_cards", jsonl_download_uri: "https://data.scryfall.io/cards.jsonl.gz" }] },
      new Response("not gzip"),
    );
    await expect(downloadBulkData(path, { fetcher })).rejects.toThrow();
    await expect(readFile(`${path}.download`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a failed metadata request", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 502, statusText: "Bad Gateway" })) as unknown as typeof fetch;
    await expect(downloadBulkData(await outputPath(), { fetcher })).rejects.toThrow("bulk-data request failed: 502");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("importRulings", () => {
  const rulings = [
    { object: "ruling", oracle_id: "o-1", source: "wotc", published_at: "2020-01-01", comment: "First." },
    { object: "ruling", oracle_id: "o-2", source: "scryfall", published_at: "2021-02-02", comment: "Second." },
  ];
  const stored = (database: DatabaseSync) => database.prepare("SELECT oracle_id, comment FROM rulings ORDER BY oracle_id").all()
    .map((row) => `${String(row.oracle_id)}: ${String(row.comment)}`);

  it("reads the gzipped JSON Lines file when Scryfall lists only that", async () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    const lines = gzipSync(rulings.map((ruling) => JSON.stringify(ruling)).join("\n") + "\n");
    const fetcher = fetchResponses(
      { data: [{ type: "rulings", jsonl_download_uri: "https://data.scryfall.io/rulings/rulings.jsonl.gz" }] },
      new Response(lines),
    );
    expect(await importRulings(database, fetcher)).toBe(2);
    expect(stored(database)).toEqual(["o-1: First.", "o-2: Second."]);
    expect(database.prepare("SELECT value FROM catalog_metadata WHERE key = 'rulings_at'").get()?.value).toBeTruthy();
  });

  it("still reads the older JSON array file", async () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    const fetcher = fetchResponses(
      { data: [{ type: "rulings", download_uri: "https://data.scryfall.io/rulings/rulings.json" }] },
      new Response(JSON.stringify(rulings)),
    );
    expect(await importRulings(database, fetcher)).toBe(2);
  });

  it("keeps the previous rulings when there is no download URL", async () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    database.prepare("INSERT INTO rulings (oracle_id, published_at, source, comment) VALUES ('o-0', '', '', 'Kept.')").run();
    const fetcher = fetchResponses({ data: [{ type: "rulings" }] }, new Response(""));
    await expect(importRulings(database, fetcher)).rejects.toThrow("no download URL");
    expect(stored(database)).toEqual(["o-0: Kept."]);
  });
});
