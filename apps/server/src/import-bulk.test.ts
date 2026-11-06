import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "./database.js";
import { importBulkFile } from "./import-bulk.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function writeBulkData(value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mana-vault-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "cards.json");
  await writeFile(path, JSON.stringify(value), "utf8");
  return path;
}

describe("Scryfall bulk importer", () => {
  it("streams printing records into the local card table", async () => {
    const dataPath = await writeBulkData([
      {
        id: "printing-1",
        oracle_id: "oracle-1",
        name: "Lightning Bolt",
        mana_cost: "{R}",
        type_line: "Instant",
        oracle_text: "Lightning Bolt deals 3 damage to any target.",
        colors: ["R"],
        set: "lea",
        set_name: "Limited Edition Alpha",
        collector_number: "161",
        rarity: "common",
        released_at: "1993-08-05",
        card_faces: [{ image_uris: { normal: "https://example.test/bolt.jpg" } }],
      },
      {
        id: "token-1",
        name: "Goblin",
        type_line: "Token Creature — Goblin",
        set: "tlea",
        set_name: "Limited Edition Alpha Tokens",
        collector_number: "1",
        rarity: "common",
      },
    ]);
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    try {
      expect(await importBulkFile(dataPath, database)).toBe(1);
      const card = database.prepare("SELECT name, image_url, colors FROM cards WHERE id = ?").get("printing-1");
      expect(card).toEqual({
        name: "Lightning Bolt",
        image_url: "https://example.test/bolt.jpg",
        colors: "R",
      });
    } finally {
      database.close();
    }
  });

  it("rolls back the import when a record is malformed", async () => {
    const dataPath = await writeBulkData([
      {
        id: "printing-1",
        oracle_id: "oracle-1",
        name: "Lightning Bolt",
        type_line: "Instant",
        set: "lea",
        set_name: "Limited Edition Alpha",
        collector_number: "161",
        rarity: "common",
      },
      { id: "broken-record" },
    ]);
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    try {
      await expect(importBulkFile(dataPath, database)).rejects.toThrow("no valid name");
      expect(database.prepare("SELECT COUNT(*) AS count FROM cards").get()?.count).toBe(0);
    } finally {
      database.close();
    }
  });
});
