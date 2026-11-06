import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "./app.js";
import { cardInsertStatement } from "./database.js";

async function setup() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database);
  cardInsertStatement(database).run(
    "printing-1", "oracle-1", "Lightning Bolt", "{R}", "Instant", "Lightning Bolt deals 3 damage to any target.",
    "R", "lea", "Limited Edition Alpha", "161", "common", null, "1993-08-05",
  );
  return { app, database };
}

describe("API", () => {
  it("serves the built web app from the API origin", async () => {
    const { app, database } = await setup();
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<title>Mana Vault</title>");
    await app.close();
    database.close();
  });

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
