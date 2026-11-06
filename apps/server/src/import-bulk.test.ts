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

async function writeBulkText(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mana-vault-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "cards.jsonl");
  await writeFile(path, content, "utf8");
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
        cmc: 1,
        type_line: "Instant",
        oracle_text: "Lightning Bolt deals 3 damage to any target.",
        colors: ["R"],
        color_identity: ["R"],
        legalities: { modern: "legal" },
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
      const card = database.prepare(
        "SELECT name, image_url, colors, mana_value, color_identity, legalities FROM cards WHERE id = ?",
      ).get("printing-1");
      expect(card).toEqual({
        name: "Lightning Bolt",
        image_url: "https://example.test/bolt.jpg",
        colors: "R",
        mana_value: 1,
        color_identity: "R",
        legalities: '{"modern":"legal"}',
      });
      expect(database.prepare("SELECT value FROM catalog_metadata WHERE key = 'updated_at'").get()?.value).toBeTruthy();
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

  it("streams JSONL cards and ignores blank lines", async () => {
    const dataPath = await writeBulkText([
      JSON.stringify({
        id: "printing-1",
        oracle_id: "oracle-1",
        name: "Lightning Bolt",
        type_line: "Instant",
        set: "lea",
        set_name: "Limited Edition Alpha",
        collector_number: "161",
        rarity: "common",
      }),
      "",
      JSON.stringify({
        id: "printing-2",
        oracle_id: "oracle-2",
        name: "Ancestral Recall",
        type_line: "Instant",
        set: "lea",
        set_name: "Limited Edition Alpha",
        collector_number: "49",
        rarity: "rare",
      }),
    ].join("\n"));
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    try {
      expect(await importBulkFile(dataPath, database)).toBe(2);
      expect(database.prepare("SELECT COUNT(*) AS count FROM cards").get()?.count).toBe(2);
    } finally {
      database.close();
    }
  });

  it("rolls back JSONL imports when a line is malformed", async () => {
    const dataPath = await writeBulkText([
      JSON.stringify({
        id: "printing-1",
        oracle_id: "oracle-1",
        name: "Lightning Bolt",
        type_line: "Instant",
        set: "lea",
        set_name: "Limited Edition Alpha",
        collector_number: "161",
        rarity: "common",
      }),
      "{invalid json",
    ].join("\n"));
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    try {
      await expect(importBulkFile(dataPath, database)).rejects.toThrow("JSONL line 2 is invalid");
      expect(database.prepare("SELECT COUNT(*) AS count FROM cards").get()?.count).toBe(0);
    } finally {
      database.close();
    }
  });

  it("refreshes printings without discarding collection quantities or decks", async () => {
    const dataPath = await writeBulkData([{
      id: "printing-1",
      oracle_id: "oracle-1",
      name: "Lightning Bolt",
      type_line: "Instant",
      set: "lea",
      set_name: "Limited Edition Alpha",
      collector_number: "161",
      rarity: "common",
    }]);
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    try {
      await importBulkFile(dataPath, database);
      database.prepare("INSERT INTO collection_items (card_id, quantity) VALUES ('printing-1', 4)").run();
      database.prepare("INSERT INTO decks (id, name, format, mode) VALUES ('deck-1', 'Saved', 'casual', 'normal')").run();
      database.prepare(
        "INSERT INTO deck_cards (deck_id, oracle_id, quantity, zone) VALUES ('deck-1', 'oracle-1', 2, 'main')",
      ).run();
      await importBulkFile(dataPath, database);
      expect(database.prepare("SELECT quantity FROM collection_items WHERE card_id = 'printing-1'").get()?.quantity).toBe(4);
      expect(database.prepare("SELECT COUNT(*) AS count FROM decks").get()?.count).toBe(1);
      expect(database.prepare("SELECT quantity FROM deck_cards WHERE deck_id = 'deck-1'").get()?.quantity).toBe(2);
    } finally {
      database.close();
    }
  });
});
