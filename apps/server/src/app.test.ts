import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "./app.js";
import { cardInsertStatement, initializeDatabase } from "./database.js";

async function setup() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database);
  cardInsertStatement(database).run(
    "printing-1", "oracle-1", "Lightning Bolt", "{R}", 1, "Instant", "Lightning Bolt deals 3 damage to any target.",
    "R", "R", JSON.stringify({ commander: "legal", modern: "legal" }),
    "lea", "Limited Edition Alpha", "161", "common", null, "1993-08-05", "Chris Rush",
  );
  return { app, database };
}

describe("API", () => {
  it("reports ok", async () => {
    const { app, database } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
    database.close();
  });

  it("searches card names and applies filters", async () => {
    const { app, database } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/cards?q=lightning&color=R&type=instant&set=lea" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].name).toBe("Lightning Bolt");
    await app.close();
    database.close();
  });

  it("supports Scryfall-style search operators and rejects unknown filters", async () => {
    const { app, database } = await setup();
    const result = await app.inject({
      method: "GET",
      url: "/api/cards?q=t%3Ainstant%20c%3Ared%20mv%3E%3D1%20legal%3Acommander%20r%3Acommon",
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().map((card: { name: string }) => card.name)).toEqual(["Lightning Bolt"]);
    const invalid = await app.inject({ method: "GET", url: "/api/cards?q=unknown%3Avalue" });
    expect(invalid.statusCode).toBe(400);
    await app.close();
    database.close();
  });

  it("migrates existing decks and keeps separate Theme printings", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY, oracle_id TEXT NOT NULL, name TEXT NOT NULL, mana_cost TEXT,
        type_line TEXT NOT NULL, oracle_text TEXT, colors TEXT NOT NULL DEFAULT '',
        set_code TEXT NOT NULL, set_name TEXT NOT NULL, collector_number TEXT NOT NULL,
        rarity TEXT NOT NULL, image_url TEXT, released_at TEXT
      );
      CREATE TABLE collection_items (
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        foil INTEGER NOT NULL DEFAULT 0 CHECK(foil IN (0, 1)),
        PRIMARY KEY (card_id, foil)
      );
      CREATE TABLE decks (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('normal', 'theme')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE deck_cards (
        deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        oracle_id TEXT NOT NULL,
        printing_id TEXT REFERENCES cards(id),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        zone TEXT NOT NULL CHECK(zone IN ('main', 'sideboard', 'commander')),
        PRIMARY KEY (deck_id, oracle_id, zone)
      );
      INSERT INTO cards VALUES ('printing-1', 'oracle-1', 'Lightning Bolt', '{R}', 'Instant', NULL, 'R', 'lea', 'Limited Edition Alpha', '161', 'common', NULL, '1993-08-05');
      INSERT INTO decks (id, name, format, mode) VALUES ('deck-1', 'Old deck', 'casual', 'theme');
      INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone) VALUES ('deck-1', 'oracle-1', 'printing-1', 2, 'main');
    `);
    initializeDatabase(database);
    cardInsertStatement(database).run(
      "printing-2", "oracle-1", "Lightning Bolt", "{R}", 1, "Instant", null, "R", "R", "{}",
      "m21", "Core Set 2021", "150", "common", null, "2020-07-03", null,
    );
    const additional = database.prepare(
      `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone)
       VALUES ('deck-1', 'oracle-1', 'printing-2', 1, 'main')`,
    ).run();
    expect(additional.changes).toBe(1);
    expect(database.prepare("SELECT COUNT(*) AS count FROM deck_cards").get()?.count).toBe(2);
    expect(database.prepare("SELECT quantity FROM deck_cards WHERE printing_id = 'printing-1'").get()?.quantity).toBe(2);
    database.close();
  });

  it("rejects repeated or malformed search parameters", async () => {
    const { app, database } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/cards?q=bolt&q=lightning" });
    expect(res.statusCode).toBe(400);
    await app.close();
    database.close();
  });

  it("adds collection quantities by printing and foil status", async () => {
    const { app, database } = await setup();
    const first = await app.inject({
      method: "POST",
      url: "/api/collection",
      payload: { cardId: "printing-1", quantity: 2 },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/collection",
      payload: { cardId: "printing-1", quantity: 3 },
    });
    expect(first.statusCode).toBe(200);
    expect(second.json().quantity).toBe(5);
    expect((await app.inject({ method: "GET", url: "/api/collection" })).json()).toHaveLength(1);
    await app.close();
    database.close();
  });

  it("supports editing and removing collection entries", async () => {
    const { app, database } = await setup();
    await app.inject({
      method: "POST",
      url: "/api/collection",
      payload: { cardId: "printing-1", quantity: 2 },
    });
    const update = await app.inject({
      method: "PATCH",
      url: "/api/collection/printing-1",
      payload: { quantity: 5 },
    });
    expect(update.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/collection" })).json()[0].quantity).toBe(5);
    const remove = await app.inject({ method: "DELETE", url: "/api/collection/printing-1" });
    expect(remove.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/collection" })).json()).toHaveLength(0);
    await app.close();
    database.close();
  });

  it("imports Moxfield and generic collection CSV by exact printing", async () => {
    const { app, database } = await setup();
    const csv = [
      '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number"',
      '"3","0","Lightning Bolt","Limited Edition Alpha","Near Mint","English","true","","","161"',
      '"2","0","Missing Card","lea","Near Mint","English","false","","","999"',
    ].join("\r\n");
    const imported = await app.inject({
      method: "POST",
      url: "/api/collection/import",
      headers: { "content-type": "text/csv" },
      payload: csv,
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({
      matchedRows: 1,
      importedQuantity: 3,
      unmatched: [{ row: 3, name: "Missing Card" }],
    });
    const collection = await app.inject({ method: "GET", url: "/api/collection" });
    expect(collection.json()[0]).toMatchObject({ name: "Lightning Bolt", quantity: 3, foil: 1 });
    await app.close();
    database.close();
  });

  it("rejects CSV without the expected name column", async () => {
    const { app, database } = await setup();
    const result = await app.inject({
      method: "POST",
      url: "/api/collection/import",
      headers: { "content-type": "text/csv" },
      payload: '"Card","Count"\r\n"Lightning Bolt","2"',
    });
    expect(result.statusCode).toBe(400);
    expect(result.json().error).toContain("Name");
    await app.close();
    database.close();
  });

  it("imports text decklists and reports missing cards", async () => {
    const { app, database } = await setup();
    const deck = await app.inject({ method: "POST", url: "/api/decks", payload: { name: "Imported" } });
    const result = await app.inject({
      method: "POST",
      url: `/api/decks/${deck.json().id}/import`,
      headers: { "content-type": "text/plain" },
      payload: "4x Lightning Bolt (lea) 161\nSB: 2 Missing Card",
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      matchedRows: 1,
      importedQuantity: 4,
      unmatched: [{ row: 2, name: "Missing Card" }],
    });
    const detail = await app.inject({ method: "GET", url: `/api/decks/${deck.json().id}` });
    expect(detail.json().cards[0]).toMatchObject({ name: "Lightning Bolt", quantity: 4, zone: "main" });
    await app.close();
    database.close();
  });

  it("requires exact printing details when importing a Theme deck", async () => {
    const { app, database } = await setup();
    cardInsertStatement(database).run(
      "printing-2", "oracle-1", "Lightning Bolt", "{R}", 1, "Instant", null, "R", "R", "{}",
      "m21", "Core Set 2021", "150", "common", null, "2020-07-03", null,
    );
    const deck = await app.inject({ method: "POST", url: "/api/decks", payload: { name: "Art", mode: "theme" } });
    const result = await app.inject({
      method: "POST",
      url: `/api/decks/${deck.json().id}/import`,
      headers: { "content-type": "text/csv" },
      payload: '"Name","Count","Set Code","Collector Number"\r\n"Lightning Bolt","1","lea","161"\r\n"Lightning Bolt","2","m21","150"',
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().importedQuantity).toBe(3);
    const detail = await app.inject({ method: "GET", url: `/api/decks/${deck.json().id}` });
    expect(detail.json().cards.map((card: { printing_id: string }) => card.printing_id).sort()).toEqual(["printing-1", "printing-2"]);
    await app.close();
    database.close();
  });

  it("backs up and restores collection, decks, and required card records", async () => {
    const { app, database } = await setup();
    await app.inject({ method: "POST", url: "/api/collection", payload: { cardId: "printing-1", quantity: 3 } });
    const deck = await app.inject({ method: "POST", url: "/api/decks", payload: { name: "Saved deck" } });
    await app.inject({
      method: "POST",
      url: `/api/decks/${deck.json().id}/cards`,
      payload: { cardId: "printing-1", quantity: 2 },
    });
    const backup = await app.inject({ method: "GET", url: "/api/backup" });
    expect(backup.headers["content-disposition"]).toContain("mana-vault-backup.json");
    await app.inject({ method: "DELETE", url: "/api/collection/printing-1" });
    await app.inject({ method: "DELETE", url: `/api/decks/${deck.json().id}/cards/oracle-1` });
    const restored = await app.inject({
      method: "POST",
      url: "/api/backup/restore",
      headers: { "content-type": "application/vnd.mana-vault.backup+json" },
      payload: backup.body,
    });
    expect(restored.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/collection" })).json()[0].quantity).toBe(3);
    expect((await app.inject({ method: "GET", url: `/api/decks/${deck.json().id}` })).json().cards[0].quantity).toBe(2);
    await app.close();
    database.close();
  });

  it("creates decks with different printing behavior", async () => {
    const { app, database } = await setup();
    const normal = await app.inject({
      method: "POST",
      url: "/api/decks",
      payload: { name: "Regular deck", format: "modern", mode: "normal" },
    });
    const theme = await app.inject({
      method: "POST",
      url: "/api/decks",
      payload: { name: "Art deck", format: "casual", mode: "theme" },
    });
    expect(normal.statusCode).toBe(201);
    expect(theme.statusCode).toBe(201);
    await app.inject({
      method: "POST",
      url: `/api/decks/${normal.json().id}/cards`,
      payload: { cardId: "printing-1", quantity: 4 },
    });
    await app.inject({
      method: "POST",
      url: `/api/decks/${theme.json().id}/cards`,
      payload: { cardId: "printing-1", quantity: 4 },
    });
    const normalDeck = await app.inject({ method: "GET", url: `/api/decks/${normal.json().id}` });
    const themeDeck = await app.inject({ method: "GET", url: `/api/decks/${theme.json().id}` });
    expect(normalDeck.json().cards[0].printing_id).toBeNull();
    expect(themeDeck.json().cards[0].printing_id).toBe("printing-1");
    const decks = await app.inject({ method: "GET", url: "/api/decks" });
    expect(decks.json()).toHaveLength(2);
    await app.close();
    database.close();
  });

  it("adds a second printing of the same card to a Theme deck without replacing it", async () => {
    const { app, database } = await setup();
    cardInsertStatement(database).run(
      "printing-2", "oracle-1", "Lightning Bolt", "{R}", 1, "Instant", null, "R", "R", "{}",
      "m21", "Core Set 2021", "150", "common", null, "2020-07-03", null,
    );
    const deck = await app.inject({ method: "POST", url: "/api/decks", payload: { name: "Two arts", mode: "theme" } });
    for (const cardId of ["printing-1", "printing-2"]) {
      await app.inject({ method: "POST", url: `/api/decks/${deck.json().id}/cards`, payload: { cardId, quantity: 1 } });
    }
    let detail = await app.inject({ method: "GET", url: `/api/decks/${deck.json().id}` });
    expect(detail.json().cards.map((card: { printing_id: string }) => card.printing_id).sort()).toEqual(["printing-1", "printing-2"]);
    const selected = detail.json().cards.find((card: { printing_id: string }) => card.printing_id === "printing-1");
    await app.inject({
      method: "PATCH",
      url: `/api/decks/${deck.json().id}/cards/oracle-1?zone=main&entryId=${selected.entry_id}`,
      payload: { quantity: 3, zone: "main" },
    });
    detail = await app.inject({ method: "GET", url: `/api/decks/${deck.json().id}` });
    expect(detail.json().cards.find((card: { printing_id: string }) => card.printing_id === "printing-1").quantity).toBe(3);
    expect(detail.json().cards.find((card: { printing_id: string }) => card.printing_id === "printing-2").quantity).toBe(1);
    await app.close();
    database.close();
  });

  it("updates deck quantities and moves cards between zones", async () => {
    const { app, database } = await setup();
    const deck = await app.inject({
      method: "POST",
      url: "/api/decks",
      payload: { name: "Zone test", mode: "normal" },
    });
    await app.inject({
      method: "POST",
      url: `/api/decks/${deck.json().id}/cards`,
      payload: { cardId: "printing-1", quantity: 4 },
    });
    const update = await app.inject({
      method: "PATCH",
      url: `/api/decks/${deck.json().id}/cards/oracle-1`,
      payload: { quantity: 2, zone: "sideboard" },
    });
    expect(update.statusCode).toBe(200);
    const detail = await app.inject({ method: "GET", url: `/api/decks/${deck.json().id}` });
    expect(detail.json().cards[0]).toMatchObject({ zone: "sideboard", quantity: 2 });
    await app.close();
    database.close();
  });

  it("rejects malformed entries and unknown printings", async () => {
    const { app, database } = await setup();
    const malformed = await app.inject({
      method: "POST",
      url: "/api/collection",
      payload: { cardId: "printing-1", quantity: 0 },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/collection",
      payload: { cardId: "unknown" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);
    await app.close();
    database.close();
  });
});
