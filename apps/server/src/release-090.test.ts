import { APP_VERSION } from "./backup.js";
// Tests for 0.9.0: finish marks in deck lists, card database updates that skip bad records, change printing,
// custom cards and sets, and the print list.
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardExtrasStatement, cardInsertStatement, cardPricesStatement } from "./database.js";
import { parseText, splitPrinting } from "./deck-import.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function seed(database: DatabaseSync) {
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const prices = cardPricesStatement(database);
  const card = (id: string, oracle: string, name: string, type: string, set: string, number: string, released: string, finishes = "nonfoil,foil") => {
    insert.run(id, oracle, name, "{1}", 1, type, "", "", "", JSON.stringify({ commander: "legal" }), set, set.toUpperCase(), number, "rare", `https://img/${id}.jpg`, released, "Artist");
    extras.run(finishes, 0, 0, id);
    prices.run(1, 2, null, 1, null, null, id);
  };
  card("sa1", "o-sauron", "Sauron, the Dark Lord", "Legendary Creature - Avatar Horror", "hoc", "36", "2026-08-14");
  card("sa2", "o-sauron", "Sauron, the Dark Lord", "Legendary Creature - Avatar Horror", "ltr", "224", "2023-06-23");
  card("is1", "o-island", "Island", "Basic Land - Island", "hob", "195", "2026-08-14");
  card("is2", "o-island", "Island", "Basic Land - Island", "m21", "264", "2020-07-03");
  card("bo1", "o-bolt", "Lightning Bolt", "Instant", "2x2", "117★", "2022-07-08");
}

export async function server(seedCards = seed) {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000 });
  seedCards(database);
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const signUp = async (name: string) => {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
    return (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({
      method: method as "GET", url,
      headers: { ...(method === "GET" ? {} : guard), cookie, ...(typeof payload === "string" ? { "content-type": "text/plain" } : {}), ...headers },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  };
  const call = await signUp("ann");
  return { app, database, call, signUp };
}

describe("deck lists with finish marks", () => {
  it("splits names, sets, numbers and finish marks", () => {
    expect(splitPrinting("Sauron, the Dark Lord (HOC) 36 *F*")).toEqual({ name: "Sauron, the Dark Lord", set: "HOC", number: "36", finish: "foil" });
    expect(splitPrinting("Opt (XLN) 65 *E*")).toEqual({ name: "Opt", set: "XLN", number: "65", finish: "etched" });
    expect(splitPrinting("Island (HOB) 195 *F* *CMDR*")).toEqual({ name: "Island", set: "HOB", number: "195", finish: "foil" });
    expect(splitPrinting("Lightning Bolt (2X2) 117★")).toEqual({ name: "Lightning Bolt", set: "2X2", number: "117★", finish: "" });
    expect(splitPrinting("Sol Ring [C21] #263")).toEqual({ name: "Sol Ring", set: "C21", number: "263", finish: "" });
    expect(splitPrinting("Sol Ring")).toEqual({ name: "Sol Ring", set: "", number: "", finish: "" });
    expect(parseText("1 Island (HOB) 195 *F*")[0]).toMatchObject({ name: "Island", set: "HOB", collectorNumber: "195", finish: "foil", quantity: 1 });
  });

  it("imports and edits decks from lines with finish marks, picking the named printing", async () => {
    const { call } = await server();
    const deck = (await call("POST", "/api/decks", { name: "Rings", format: "commander" })).json() as { id: string };
    const text = "1 Sauron, the Dark Lord (HOC) 36 *F*\n3 Island (HOB) 195 *F*\n1 Lightning Bolt (2X2) 117★\n";
    const preview = (await call("POST", `/api/decks/${deck.id}/replace?preview=1`, { text })).json() as { added: number; unmatched: unknown[] };
    expect(preview).toMatchObject({ added: 3, unmatched: [] });
    expect((await call("POST", `/api/decks/${deck.id}/replace`, { text })).statusCode).toBe(200);
    const cards = (await call("GET", `/api/decks/${deck.id}`)).json().cards as Array<{ card_id: string; quantity: number }>;
    expect(cards.map((card) => [card.card_id, card.quantity]).sort()).toEqual([["bo1", 1], ["is1", 3], ["sa1", 1]]);
    const other = (await call("POST", "/api/decks", { name: "Other", format: "commander" })).json() as { id: string };
    const imported = (await call("POST", `/api/decks/${other.id}/import`, "1 Sauron, the Dark Lord (HOC) 36 *F*\n")).json();
    expect(imported).toMatchObject({ matchedRows: 1, unmatched: [] });
  });

  it("finds a card by set and number when the name does not match", async () => {
    const { call } = await server();
    const found = (await call("GET", "/api/cards/resolve?name=Sauron%2C%20le%20Seigneur&set=hoc&number=36")).json();
    expect(found).toMatchObject({ id: "sa1", name: "Sauron, the Dark Lord" });
    expect((await call("GET", "/api/cards/resolve?name=Nothing&set=hoc&number=99")).statusCode).toBe(404);
  });
});

describe("card database updates", () => {
  it("skips a card that fails a check and keeps the rest", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { importBulkFile } = await import("./import-bulk.js");
    const { initializeDatabase } = await import("./database.js");
    const folder = await mkdtemp(join(tmpdir(), "mv-bulk-"));
    const good = { id: "p1", oracle_id: "o1", name: "Hobbit Hole", type_line: "Land", set: "hob", set_name: "The Hobbit", collector_number: "184", rarity: "common", legalities: {} };
    const bad = { id: "p2", oracle_id: "o2", name: "Broken Card", type_line: "Land", set: "hob", set_name: "The Hobbit", collector_number: "999", rarity: "common", legalities: "nope" };
    const file = join(folder, "cards.json");
    await writeFile(file, JSON.stringify([good, bad]));
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    try {
      expect(await importBulkFile(file, database)).toBe(1);
      const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000 });
      const signup = await app.inject({ method: "POST", url: "/api/signup", headers: { "x-mana-vault": "1" }, payload: { name: "ann", password: "correct horse" } });
      const cookie = String(signup.headers["set-cookie"]).split(";")[0]!;
      const status = (await app.inject({ method: "GET", url: "/api/catalog/status", headers: { cookie } })).json();
      await app.close();
      expect(status).toMatchObject({ printingCount: 1, skipped: { count: 1, names: ["Broken Card (HOB) 999"] } });
    } finally {
      database.close();
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe("change printing", () => {
  const copy = (cardId: string, quantity: number, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", quantity });

  async function setUp() {
    const tools = await server();
    const { call } = tools;
    const collections = (await call("GET", "/api/collections")).json() as Array<{ id: string; name: string }>;
    const main = collections[0]!.id;
    const deck = (await call("POST", "/api/decks", { name: "Rings", format: "commander" })).json() as { id: string };
    return { ...tools, main, deckId: deck.id };
  }

  it("changes a deck card's printing and links the free copies sent with it", async () => {
    const { call, main, deckId } = await setUp();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1", 1)] });
    const added = (await call("POST", `/api/decks/${deckId}/cards`, { cardId: "sa2", quantity: 1, zone: "commander" })).json() as { entryId: number };
    const changed = await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/printing`, {
      cardId: "sa1", links: [{ collectionId: main, cardId: "sa1", foil: 0, condition: "NM", language: "en", quantity: 1 }],
    });
    expect(changed.json()).toMatchObject({ status: "changed", linked: 1 });
    const card = ((await call("GET", `/api/decks/${deckId}`)).json().cards as Array<{ card_id: string; links: unknown[]; missing: number }>)[0]!;
    expect(card).toMatchObject({ card_id: "sa1", missing: 0 });
    expect(card.links).toHaveLength(1);
    // back to the old printing without copies: the links go and the card is missing
    await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/printing`, { cardId: "sa2" });
    const back = ((await call("GET", `/api/decks/${deckId}`)).json().cards as Array<{ card_id: string; links: unknown[]; missing: number }>)[0]!;
    expect(back).toMatchObject({ card_id: "sa2", missing: 1, links: [] });
    expect((await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/printing`, { cardId: "is1" })).statusCode).toBe(400);
    const history = (await call("GET", `/api/decks/${deckId}/history`)).json() as Array<{ change: string }>;
    expect(history.some((line) => line.change.includes("printing changed to (HOC) 36"))).toBe(true);
  });

  it("changes the printing of collection copies, keeping trade marks and deck links", async () => {
    const { call, main, deckId } = await setUp();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa2", 2, 1)] });
    await call("PUT", `/api/collections/${main}/cards`, { items: [{ ...copy("sa2", 2, 1), trade: 1 }] });
    const added = (await call("POST", `/api/decks/${deckId}/cards`, {
      cardId: "sa2", quantity: 1, zone: "commander", links: [{ collectionId: main, cardId: "sa2", foil: 1, condition: "NM", language: "en", quantity: 1 }],
    })).json() as { entryId: number };
    expect(added.entryId).toBeGreaterThan(0);
    const result = (await call("POST", `/api/collections/${main}/printing`, { cardId: "sa2", foil: 1, condition: "NM", language: "en", to: "sa1" })).json();
    expect(result).toMatchObject({ status: "changed", moved: 2, set: "HOC", number: "36" });
    const rows = (await call("GET", `/api/collections/${main}/cards`)).json() as Array<{ id: string; quantity: number; trade: number; foil: number }>;
    expect(rows.map((row) => [row.id, row.quantity, row.trade, row.foil])).toEqual([["sa1", 2, 1, 1]]);
    const card = ((await call("GET", `/api/decks/${deckId}`)).json().cards as Array<{ card_id: string; missing: number; links: Array<{ cardId: string }> }>)[0]!;
    expect(card).toMatchObject({ card_id: "sa1", missing: 0 });
    expect(card.links[0]!.cardId).toBe("sa1");
    // part of a row can change back
    expect((await call("POST", `/api/collections/${main}/printing`, { cardId: "sa1", foil: 1, condition: "NM", language: "en", to: "sa2", quantity: 1 })).json())
      .toMatchObject({ moved: 1 });
    const split = (await call("GET", `/api/collections/${main}/cards`)).json() as Array<{ id: string; quantity: number }>;
    expect(split.map((row) => [row.id, row.quantity]).sort()).toEqual([["sa1", 1], ["sa2", 1]]);
    expect((await call("POST", `/api/collections/${main}/printing`, { cardId: "sa1", foil: 1, condition: "NM", language: "en", to: "is1" })).statusCode).toBe(400);
  });
});

describe("deck list", () => {
  it("gives each deck its card count and value", async () => {
    const { call } = await server();
    const deck = (await call("POST", "/api/decks", { name: "Rings", format: "commander" })).json() as { id: string };
    await call("POST", `/api/decks/${deck.id}/cards`, { cardId: "sa1", quantity: 2, zone: "main" });
    await call("POST", `/api/decks/${deck.id}/cards`, { cardId: "is1", quantity: 5, zone: "maybeboard" });
    const list = (await call("GET", "/api/decks")).json() as Array<{ id: string; card_count: number; value: { usd: number; eur: number } }>;
    expect(list.find((item) => item.id === deck.id)).toMatchObject({ card_count: 2, value: { usd: 2, eur: 2 } });
  });
});

describe("custom cards and sets", () => {
  // a 1 x 1 PNG
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const front = { name: "Gandalf's Pipe", manaCost: "{2}{U/R}", typeLine: "Legendary Artifact", oracleText: "{T}: Add {R}.", power: "", toughness: "", loyalty: "" };
  const card = (extra: Record<string, unknown> = {}) => ({
    setCode: "xxx", collectorNumber: "1", rarity: "rare", artist: "Me", finishes: ["nonfoil", "foil"], front,
    legalities: { commander: "legal" }, price: { usd: 3.5 }, ...extra,
  });

  it("links and unlinks custom printings, keeping existing deck entries consistent", async () => {
    const { call, database } = await server();
    await call("POST", "/api/custom/sets", { code: "xxx", name: "My Set" });
    const input = card({ front: { ...front, name: "Sauron, the Dark Lord" } });
    const id = (await call("POST", "/api/custom/cards", { card: input, picture: PNG })).json().id as string;
    const deck = (await call("POST", "/api/decks", { name: "Custom printing", format: "commander" })).json() as { id: string };
    const entry = (await call("POST", `/api/decks/${deck.id}/cards`, { cardId: id, quantity: 1, zone: "main" })).json() as { entryId: number };
    const backup = (await call("GET", "/api/backup")).body;
    expect((await call("GET", "/api/cards/sa1/printings")).json().map((item: { id: string }) => item.id)).not.toContain(id);
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: { ...input, printingOf: "sa1" } })).statusCode).toBe(200);
    for (const printing of ["sa1", "sa2", id]) {
      expect((await call("GET", `/api/cards/${printing}/printings`)).json().map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(["sa1", "sa2", id]));
    }
    expect((await call("GET", `/api/custom/cards/${id}`)).json().printingOf).toMatchObject({ name: "Sauron, the Dark Lord" });
    const compact = JSON.parse(gunzipSync((await call("GET", "/api/catalog/compact")).rawPayload).toString()) as { fields: string[]; rows: unknown[][] };
    const idIndex = compact.fields.indexOf("id");
    const oracleIndex = compact.fields.indexOf("oracle_id");
    expect(compact.rows.find((row) => row[idIndex] === id)?.[oracleIndex]).toBe("o-sauron");
    expect(database.prepare("SELECT oracle_id FROM deck_cards WHERE id = ?").get(entry.entryId)?.oracle_id).toBe("o-sauron");
    const restore = await call("POST", "/api/backup/restore", backup);
    expect(restore.statusCode).toBe(400);
    expect(restore.json().error).toContain("printing link");
    expect(database.prepare("SELECT oracle_id FROM deck_cards WHERE id = ?").get(entry.entryId)?.oracle_id).toBe("o-sauron");
    expect((await call("PUT", `/api/decks/${deck.id}/entries/${entry.entryId}/printing`, { cardId: "sa1" })).statusCode).toBe(200);
    expect((await call("PUT", `/api/decks/${deck.id}/entries/${entry.entryId}/printing`, { cardId: id })).statusCode).toBe(200);
    // Older clients that omit the new field do not remove the link.
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: input })).statusCode).toBe(200);
    expect(database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(id)?.oracle_id).toBe("o-sauron");
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: { ...input, printingOf: null } })).statusCode).toBe(200);
    const oracle = String(database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(id)?.oracle_id);
    expect(oracle).toMatch(/^custom-oracle-/);
    expect(database.prepare("SELECT oracle_id FROM deck_cards WHERE id = ?").get(entry.entryId)?.oracle_id).toBe(oracle);
    expect((await call("GET", `/api/cards/${id}/printings`)).json().map((item: { id: string }) => item.id)).toEqual([id]);
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: { ...input, printingOf: id } })).statusCode).toBe(400);
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: { ...input, printingOf: "missing" } })).statusCode).toBe(400);
  });

  it("prevents a link change that would invalidate deck copy links or upgrade wishes", async () => {
    const { call } = await server();
    await call("POST", "/api/custom/sets", { code: "xxx", name: "My Set" });
    const input = card({ printingOf: "sa1" });
    const id = (await call("POST", "/api/custom/cards", { card: input, picture: PNG })).json().id as string;
    const deck = (await call("POST", "/api/decks", { name: "Linked", format: "commander" })).json() as { id: string };
    const entry = (await call("POST", `/api/decks/${deck.id}/cards`, { cardId: "sa1", quantity: 1, zone: "main" })).json() as { entryId: number };
    expect((await call("PUT", `/api/decks/${deck.id}/entries/${entry.entryId}/upgrade`, { cardId: id })).statusCode).toBe(200);
    const result = await call("PUT", `/api/custom/cards/${id}`, { card: { ...input, printingOf: null } });
    expect(result.statusCode).toBe(409);
    expect(result.json().error).toContain("upgrade wishes");
    expect((await call("GET", `/api/cards/${id}/printings`)).json().map((item: { id: string }) => item.id)).toContain("sa1");
  });

  it("keeps a saved link when its official printing is temporarily missing from the catalog", async () => {
    const { call, database } = await server();
    await call("POST", "/api/custom/sets", { code: "xxx", name: "My Set" });
    const printingOf = { id: "sa1", name: "Sauron, the Dark Lord" };
    const input = card({ printingOf: printingOf.id });
    const id = (await call("POST", "/api/custom/cards", { card: input, design: { printingOf }, picture: PNG })).json().id as string;
    database.prepare("DELETE FROM cards WHERE oracle_id = ? AND custom = 0").run("o-sauron");
    expect((await call("GET", `/api/custom/cards/${id}`)).json().printingOf).toEqual(printingOf);
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: input, design: { printingOf } })).statusCode).toBe(200);
    expect(database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(id)?.oracle_id).toBe("o-sauron");
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: { ...input, printingOf: "unknown" } })).statusCode).toBe(400);
  });

  it("preserves linked deck copies when a custom printing is in use", async () => {
    const { call } = await server();
    await call("POST", "/api/custom/sets", { code: "xxx", name: "My Set" });
    const input = card({ printingOf: "sa1" });
    const id = (await call("POST", "/api/custom/cards", { card: input, picture: PNG })).json().id as string;
    const collection = (await call("GET", "/api/collections")).json()[0].id as string;
    await call("POST", `/api/collections/${collection}/cards/add`, { items: [{ cardId: id, foil: 0, condition: "NM", language: "en", quantity: 1 }] });
    const deck = (await call("POST", "/api/decks", { name: "Linked copies", format: "commander" })).json() as { id: string };
    const added = await call("POST", `/api/decks/${deck.id}/cards`, {
      cardId: id, quantity: 1, zone: "main",
      links: [{ collectionId: collection, cardId: id, foil: 0, condition: "NM", language: "en", quantity: 1 }],
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().linked).toBe(1);
    expect((await call("PUT", `/api/custom/cards/${id}`, { card: { ...input, printingOf: null } })).statusCode).toBe(200);
    const backup = (await call("GET", "/api/backup")).body;
    expect((await call("POST", "/api/backup/restore", backup)).statusCode).toBe(200);
    const restoredDeck = (await call("GET", "/api/decks")).json()[0].id as string;
    const restored = (await call("GET", `/api/decks/${restoredDeck}`)).json().cards[0];
    expect(restored).toMatchObject({ card_id: id, missing: 0 });
    expect(restored.oracle_id).toMatch(/^custom-oracle-/);
    expect(restored.links).toHaveLength(1);
  });

  it("makes custom sets with codes no other set uses", async () => {
    const { call } = await server();
    expect((await call("POST", "/api/custom/sets", { code: "XXX", name: "My Set", releasedAt: "2026-11-01", symbol: PNG })).statusCode).toBe(201);
    expect((await call("POST", "/api/custom/sets", { code: "hob", name: "Taken" })).json()).toMatchObject({ error: "The set code HOB is already used by another set" });
    expect((await call("POST", "/api/custom/sets", { code: "xxx", name: "Again" })).statusCode).toBe(409);
    expect((await call("POST", "/api/custom/sets", { code: "x", name: "Short" })).statusCode).toBe(400);
    const sets = (await call("GET", "/api/custom/sets")).json();
    expect(sets).toEqual([expect.objectContaining({ code: "xxx", name: "My Set", ownerName: "ann", hasSymbol: true, cardCount: 0 })]);
    expect((await call("GET", "/api/sets?q=My")).json()).toEqual([]);
    expect((await call("GET", "/api/sets?q=My&includeCustom=1")).json()).toEqual([
      expect.objectContaining({ code: "xxx", name: "My Set", printings: 0, symbolUrl: expect.stringContaining("/api/custom/sets/xxx/symbol") }),
    ]);
  });

  it("saves a custom card as a card in the card database for every account", async () => {
    const { call, signUp, app } = await server();
    await call("POST", "/api/custom/sets", { code: "xxx", name: "My Set", releasedAt: "2026-11-01" });
    const made = await call("POST", "/api/custom/cards", { card: card(), design: { frame: "red" }, picture: PNG, art: PNG });
    expect(made.statusCode).toBe(201);
    const id = made.json().id as string;
    expect(id).toMatch(/^custom-/);
    const search = (await call("GET", "/api/cards?q=is%3Acustom")).json() as Array<Record<string, unknown>>;
    expect(search).toHaveLength(1);
    expect(search[0]).toMatchObject({
      id, name: "Gandalf's Pipe", set_code: "xxx", set_name: "My Set", collector_number: "1", mana_value: 3, colors: "UR", color_identity: "UR",
      custom: true, released_at: "2026-11-01", prices: { usd: 3.5, usd_foil: 3.5 },
    });
    expect(JSON.parse(String(search[0]!.legalities))).toMatchObject({ commander: "legal", modern: "not_legal" });
    expect((await call("GET", "/api/cards?q=set%3Axxx")).json()).toHaveLength(1);
    // the picture loads without sign-in
    const picture = await app.inject({ method: "GET", url: `/api/custom/cards/${id}/picture` });
    expect(picture.statusCode).toBe(200);
    expect(picture.headers["content-type"]).toContain("image/png");
    // another account sees it and can add it, but cannot change it
    const bob = await signUp("bob");
    expect((await bob("GET", "/api/custom/cards")).json()).toEqual([expect.objectContaining({ id, ownerName: "ann" })]);
    expect((await bob("PUT", `/api/custom/cards/${id}`, { card: card(), picture: PNG })).statusCode).toBe(403);
    // the same set and number cannot be used twice
    expect((await call("POST", "/api/custom/cards", { card: card(), picture: PNG })).json()).toMatchObject({ error: "XXX already has a card numbered 1" });
    // editing changes it everywhere
    const edited = await call("PUT", `/api/custom/cards/${id}`, { card: card({ front: { ...front, name: "Gandalf's Pipe of Wonder" } }), picture: PNG });
    expect(edited.statusCode).toBe(200);
    expect((await bob("GET", `/api/cards/${id}`)).json()).toMatchObject({ name: "Gandalf's Pipe of Wonder" });
    // deck import finds it by name and by set and number
    const deck = (await call("POST", "/api/decks", { name: "Custom", format: "commander" })).json() as { id: string };
    expect((await call("POST", `/api/decks/${deck.id}/replace?preview=1`, { text: "1 Gandalf's Pipe of Wonder\n1 Anything (XXX) 1\n" })).json()).toMatchObject({ unmatched: [] });
  });

  it("deletes a custom card only when no other account uses it", async () => {
    const { call, signUp } = await server();
    await call("POST", "/api/custom/sets", { code: "xxx", name: "My Set" });
    const id = (await call("POST", "/api/custom/cards", { card: card(), picture: PNG })).json().id as string;
    const bob = await signUp("bob");
    const bobs = (await bob("GET", "/api/collections")).json()[0].id as string;
    await bob("POST", `/api/collections/${bobs}/cards/add`, { items: [{ cardId: id, foil: 0, condition: "NM", language: "en", quantity: 1 }] });
    expect((await call("DELETE", `/api/custom/cards/${id}`)).statusCode).toBe(409);
    await bob("PUT", `/api/collections/${bobs}/cards`, { items: [{ cardId: id, foil: 0, condition: "NM", language: "en", quantity: 0 }] });
    const mine = (await call("GET", "/api/collections")).json()[0].id as string;
    await call("POST", `/api/collections/${mine}/cards/add`, { items: [{ cardId: id, foil: 0, condition: "NM", language: "en", quantity: 2 }] });
    expect((await call("GET", `/api/custom/cards/${id}`)).json()).toMatchObject({ use: { others: 0, copies: 2 } });
    expect((await bob("DELETE", `/api/custom/cards/${id}`)).statusCode).toBe(403);
    expect((await call("DELETE", `/api/custom/cards/${id}`)).json()).toMatchObject({ status: "deleted", removedCopies: 2 });
    expect((await call("GET", "/api/cards?q=is%3Acustom")).json()).toEqual([]);
    expect((await call("DELETE", "/api/custom/sets/xxx")).statusCode).toBe(200);
  });

  it("keeps custom cards in backups and restores them on another server", async () => {
    const first = await server();
    await first.call("POST", "/api/custom/sets", { code: "xxx", name: "My Set", symbol: PNG });
    const id = (await first.call("POST", "/api/custom/cards", { card: card(), picture: PNG, art: PNG })).json().id as string;
    const main = (await first.call("GET", "/api/collections")).json()[0].id as string;
    await first.call("POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: id, foil: 1, condition: "NM", language: "en", quantity: 1 }] });
    const backup = (await first.call("GET", "/api/backup")).body;
    expect(JSON.parse(backup)).toMatchObject({ version: APP_VERSION, customSets: [{ code: "xxx" }], customCards: [{ id }] });
    const second = await server();
    const restored = await second.app.inject({
      method: "POST", url: "/api/backup/restore", payload: backup,
      headers: { "x-mana-vault": "1", "content-type": "application/vnd.mana-vault.backup+json", cookie: String((await second.app.inject({ method: "POST", url: "/api/login", headers: { "x-mana-vault": "1" }, payload: { name: "ann", password: "correct horse" } })).headers["set-cookie"]).split(";")[0]! },
    });
    expect(restored.statusCode).toBe(200);
    expect((await second.call("GET", "/api/cards?q=is%3Acustom")).json()).toEqual([expect.objectContaining({ id, custom: true, set_name: "My Set" })]);
    expect((await second.call("GET", "/api/custom/sets")).json()).toEqual([expect.objectContaining({ code: "xxx", hasSymbol: true })]);
    expect((await second.app.inject({ method: "GET", url: `/api/custom/cards/${id}/picture` })).statusCode).toBe(200);
  });
});

describe("proxies", () => {
  it("keeps a print list per account", async () => {
    const { call, signUp } = await server();
    expect((await call("GET", "/api/proxies/list")).json()).toEqual([]);
    const lines = [{ id: "a", cardId: "sa1", count: 4, faces: "front" }, { id: "b", cardId: "gone", count: 1, faces: "both" }];
    expect((await call("PUT", "/api/proxies/list", { lines })).statusCode).toBe(200);
    expect((await call("GET", "/api/proxies/list")).json()).toEqual([{ ...lines[0], card: expect.objectContaining({ id: "sa1", name: "Sauron, the Dark Lord", hasBack: false }) }]);
    expect((await call("PUT", "/api/proxies/list", { lines: [{ id: "a", cardId: "sa1", count: 0 }] })).statusCode).toBe(400);
    const bob = await signUp("bob");
    expect((await bob("GET", "/api/proxies/list")).json()).toEqual([]);
  });

  it("serves full-size pictures from Scryfall once, and mana symbols kept in the database", async () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return { ok: true, status: 200, headers: { get: () => (url.endsWith(".svg") ? "image/svg+xml" : "image/png") }, arrayBuffer: async () => new TextEncoder().encode(url.endsWith(".svg") ? "<svg></svg>" : "PNG").buffer };
    };
    const database = new DatabaseSync(":memory:");
    const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, fetcher });
    closers.push(async () => { await app.close(); database.close(); });
    const insert = cardInsertStatement(database);
    insert.run("p1", "o1", "Delver", "{U}", 1, "Creature", "", "U", "U", "{}", "isd", "Innistrad", "51", "common",
      "https://cards.scryfall.io/normal/front/1/1/p1.jpg?123", "2011-09-30", "Artist");
    database.prepare("UPDATE cards SET back_image_url = 'https://cards.scryfall.io/normal/back/1/1/p1.jpg?123' WHERE id = 'p1'").run();
    const signup = await app.inject({ method: "POST", url: "/api/signup", headers: { "x-mana-vault": "1" }, payload: { name: "ann", password: "correct horse" } });
    const cookie = String(signup.headers["set-cookie"]).split(";")[0]!;
    const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
    expect((await get("/api/card-images/p1")).body).toBe("PNG");
    await get("/api/card-images/p1");
    await get("/api/card-images/p1?face=back");
    await get("/api/card-images/p1?size=art_crop");
    expect(asked).toEqual([
      "https://cards.scryfall.io/png/front/1/1/p1.png?123", "https://cards.scryfall.io/png/back/1/1/p1.png?123", "https://cards.scryfall.io/art_crop/front/1/1/p1.jpg?123",
    ]);
    expect((await get("/api/symbols/W%2FU")).body).toBe("<svg></svg>");
    await get("/api/symbols/W%2FU");
    expect(asked.filter((url) => url.endsWith(".svg"))).toEqual(["https://svgs.scryfall.io/card-symbols/WU.svg"]);
    expect((await app.inject({ method: "GET", url: "/api/card-images/p1" })).statusCode).toBe(401);
  });

  it("lists the tokens a list of cards makes", async () => {
    const { call, database } = await server();
    database.prepare("UPDATE cards SET tokens = ? WHERE id = 'sa1'").run(JSON.stringify([{ id: "bo1", name: "Lightning Bolt" }, { id: "missing", name: "Gone" }]));
    expect((await call("POST", "/api/cards/tokens", { ids: ["sa1", "is1"] })).json()).toEqual([expect.objectContaining({ id: "bo1", name: "Lightning Bolt" })]);
  });
});
