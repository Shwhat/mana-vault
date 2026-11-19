// Tests for 0.7.0: the deck builder (maybeboard, tags, deck details, quick add, edit as text, history, tokens).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { readTags } from "./deck-builder.js";
import { cardBuilderStatement, cardExtrasStatement, cardInsertStatement, cardPricesStatement, initializeDatabase } from "./database.js";
import { importBulkFile } from "./import-bulk.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function seed(database: DatabaseSync) {
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const prices = cardPricesStatement(database);
  const builder = cardBuilderStatement(database);
  const card = (id: string, oracle: string, name: string, type: string, colors: string, set: string, released: string, legal: string) => {
    insert.run(id, oracle, name, "{1}", 1, type, "", colors, colors, legal, set, set.toUpperCase(), id.replace(/\D/g, "") || "1", "rare", `https://img/${id}.jpg`, released, "Artist");
    extras.run("nonfoil", 0, 0, id);
    prices.run(1, null, null, 1, null, null, id);
  };
  card("s1", "o-ring", "Sol Ring", "Artifact", "", "c21", "2021-04-01", JSON.stringify({ commander: "legal", vintage: "restricted" }));
  card("s2", "o-ring", "Sol Ring", "Artifact", "", "c20", "2020-04-01", JSON.stringify({ commander: "legal", vintage: "restricted" }));
  card("g1", "o-gob", "Goblin Maker", "Creature - Goblin", "R", "tst", "2022-01-01", JSON.stringify({ commander: "legal", modern: "legal" }));
  card("k1", "o-tok", "Goblin", "Token Creature - Goblin", "R", "ttst", "2022-01-01", "{}");
  card("f1", "o-forest", "Forest", "Basic Land - Forest", "", "tst", "2022-01-01", JSON.stringify({ commander: "legal" }));
  builder.run("", JSON.stringify([{ id: "k1", name: "Goblin" }]), "g1");
  builder.run("G", "", "f1");
}

async function server() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000 });
  seed(database);
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  let cookie = "";
  const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "ann", password: "correct horse" } });
  cookie = String(response.headers["set-cookie"]).split(";")[0]!;
  const call = (method: string, url: string, payload?: unknown) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie }, ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  const deck = (await call("POST", "/api/decks", { name: "Goblins", format: "commander" })).json() as { id: string };
  return { app, database, call, deckId: deck.id };
}

describe("deck builder", () => {
  it("reads tags: trimmed, without repeats, up to 12", () => {
    expect(readTags([" Ramp ", "ramp", "Card draw", ""])).toEqual(["Ramp", "Card draw"]);
    expect(readTags("ramp")).toBeNull();
    expect(readTags(Array.from({ length: 13 }, (_, index) => `t${index}`))).toBeNull();
    expect(readTags(["x".repeat(41)])).toBeNull();
  });

  it("keeps maybeboard cards out of the card count, statistics and missing cards", async () => {
    const { call, deckId } = await server();
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "s1", quantity: 1, zone: "main" });
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "g1", quantity: 2, zone: "maybeboard" });
    const detail = (await call("GET", `/api/decks/${deckId}`)).json();
    expect(detail.card_count).toBe(1);
    const maybe = detail.cards.find((card: { zone: string }) => card.zone === "maybeboard");
    expect(maybe.missing).toBe(0);
    expect(maybe.legalities.modern).toBe("legal");
    expect(maybe.tokens).toEqual([{ id: "k1", name: "Goblin" }]);
    const stats = (await call("GET", `/api/decks/${deckId}/stats`)).json();
    expect(stats.cards).toBe(1);
    const owned = (await call("GET", `/api/decks/${deckId}/ownership`)).json();
    expect(owned.needed).toBe(1);
  });

  it("saves tags, format, description and cover card, and lists the commander", async () => {
    const { call, deckId } = await server();
    const added = (await call("POST", `/api/decks/${deckId}/cards`, { cardId: "g1", quantity: 1, zone: "commander" })).json();
    expect((await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/tags`, { tags: ["Tribal", "tribal", "Lord"] })).json().tags).toEqual(["Tribal", "Lord"]);
    expect((await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/tags`, { tags: "Tribal" })).statusCode).toBe(400);
    expect((await call("PATCH", `/api/decks/${deckId}`, { format: "modern", description: "# Plan\nAttack", coverCardId: "s1" })).statusCode).toBe(200);
    expect((await call("PATCH", `/api/decks/${deckId}`, { format: "chess" })).statusCode).toBe(400);
    expect((await call("PATCH", `/api/decks/${deckId}`, { coverCardId: "nope" })).statusCode).toBe(404);
    const detail = (await call("GET", `/api/decks/${deckId}`)).json();
    expect(detail.format).toBe("modern");
    expect(detail.description).toBe("# Plan\nAttack");
    expect(detail.cover_card_id).toBe("s1");
    expect(detail.image_url).toBe("https://img/s1.jpg");
    expect(detail.commander).toBe("Goblin Maker");
    expect(detail.cards[0].tags).toEqual(["Tribal", "Lord"]);
  });

  it("finds a printing by name, or by set and number", async () => {
    const { call } = await server();
    expect((await call("GET", "/api/cards/resolve?name=sol%20ring")).json()).toEqual({ id: "s1", name: "Sol Ring" });
    expect((await call("GET", "/api/cards/resolve?name=Sol%20Ring&set=c20")).json().id).toBe("s2");
    expect((await call("GET", "/api/cards/resolve?name=Black%20Lotus")).statusCode).toBe(404);
  });

  it("applies a deck list as text: keeps printings, tags and links of cards that stay", async () => {
    const { call, deckId } = await server();
    const collection = (await call("GET", "/api/collections")).json()[0].id as string;
    await call("POST", `/api/collections/${collection}/cards`, { cardId: "s2", quantity: 1 });
    const ring = (await call("POST", `/api/decks/${deckId}/cards`, {
      cardId: "s2", quantity: 1, zone: "main", links: [{ collectionId: collection, cardId: "s2", foil: 0, condition: "NM", language: "en", quantity: 1 }],
    })).json();
    await call("PUT", `/api/decks/${deckId}/entries/${ring.entryId}/tags`, { tags: ["Ramp"] });
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "f1", quantity: 5, zone: "main" });
    const text = "Commander\n1 Goblin Maker\n\nDeck\n1 Sol Ring\n10 Forest\n\nMaybeboard\n1 Black Lotus\n2 Goblin Maker";
    const preview = (await call("POST", `/api/decks/${deckId}/replace?preview=1`, { text })).json();
    expect(preview).toMatchObject({ added: 2, removed: 0, changed: 1 });
    expect(preview.unmatched).toEqual([{ row: 9, name: "Black Lotus", reason: "No card with this name exists in the card database" }]);
    expect((await call("GET", `/api/decks/${deckId}`)).json().cards).toHaveLength(2);
    await call("POST", `/api/decks/${deckId}/replace`, { text });
    const detail = (await call("GET", `/api/decks/${deckId}`)).json();
    const ring2 = detail.cards.find((card: { name: string }) => card.name === "Sol Ring");
    expect(ring2.card_id).toBe("s2");
    expect(ring2.tags).toEqual(["Ramp"]);
    expect(ring2.links).toHaveLength(1);
    expect(detail.cards.find((card: { name: string }) => card.name === "Forest").quantity).toBe(10);
    expect(detail.cards.filter((card: { name: string }) => card.name === "Goblin Maker").map((card: { zone: string }) => card.zone).sort()).toEqual(["commander", "maybeboard"]);
    await call("POST", `/api/decks/${deckId}/replace`, { text: "Deck\n1 Sol Ring" });
    expect((await call("GET", `/api/decks/${deckId}`)).json().cards).toHaveLength(1);
  });

  it("keeps a change history, newest first", async () => {
    const { call, deckId } = await server();
    const added = (await call("POST", `/api/decks/${deckId}/cards`, { cardId: "s1", quantity: 1, zone: "main" })).json();
    await call("PATCH", `/api/decks/${deckId}/cards/o-ring?zone=main&entryId=${added.entryId}`, { quantity: 3, zone: "main" });
    await call("PATCH", `/api/decks/${deckId}/cards/o-ring?zone=main&entryId=${added.entryId}`, { quantity: 3, zone: "sideboard" });
    await call("DELETE", `/api/decks/${deckId}/cards/o-ring?zone=sideboard&entryId=${added.entryId}`);
    await call("PATCH", `/api/decks/${deckId}`, { name: "Goblin party" });
    const history = (await call("GET", `/api/decks/${deckId}/history`)).json().map((item: { change: string; user: string }) => item.change);
    expect(history).toEqual([
      "Renamed from Goblins to Goblin party",
      "-3 Sol Ring (sideboard)",
      "Sol Ring moved from main deck to sideboard",
      "+2 Sol Ring (main deck)",
      "+1 Sol Ring (main deck)",
      "Deck created",
    ]);
  });

  it("lists the tokens the deck makes", async () => {
    const { call, deckId } = await server();
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "g1", quantity: 1, zone: "main" });
    expect((await call("GET", `/api/decks/${deckId}/tokens`)).json()).toEqual([
      { id: "k1", name: "Goblin", image_url: "https://img/k1.jpg", type_line: "Token Creature - Goblin", from: ["Goblin Maker"] },
    ]);
  });

  it("reads produced mana and tokens from the card database file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mv-builder-"));
    closers.push(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, "cards.json");
    const base = { oracle_id: "o", set: "tst", set_name: "Test", collector_number: "1", rarity: "common", type_line: "Creature", legalities: {} };
    await writeFile(file, JSON.stringify([
      { ...base, id: "a", name: "Elf", produced_mana: ["G", "W"], all_parts: [{ component: "token", id: "t", name: "Elf Warrior" }, { component: "combo_piece", id: "a", name: "Elf" }] },
    ]));
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    await importBulkFile(file, database);
    expect(database.prepare("SELECT produced_mana, tokens FROM cards WHERE id = 'a'").get()).toEqual({
      produced_mana: "WG", tokens: JSON.stringify([{ id: "t", name: "Elf Warrior" }]),
    });
    database.close();
  });

  it("upgrades a 0.6.0 deck table without losing cards or links", () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    const sql = String(database.prepare("SELECT sql FROM sqlite_master WHERE name = 'deck_cards'").get()?.sql);
    expect(sql).toContain("'maybeboard'");
    expect(sql).toContain("tags");
    database.close();
  });
});
