import { APP_VERSION } from "./backup.js";
// Tests for 0.3.0: prices, copy details, wishlists, deck ownership, statistics and trade.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { readCondition, readFinish, readLanguage } from "./copies.js";
import { cardExtrasStatement, cardInsertStatement, cardPricesStatement, initializeDatabase } from "./database.js";
import { importBulkFile } from "./import-bulk.js";
import { cardTypes, colorKey, curveKey, summarize } from "./insights.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const legal = JSON.stringify({ commander: "legal" });

/**
 * Bolt (two printings, the "oth" one cheaper), a creature, a land, a two-colored card and a card printed as
 * "Gary, the Snail" under its flavor name.
 */
function seed(database: DatabaseSync) {
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const prices = cardPricesStatement(database);
  const card = (id: string, oracle: string, name: string, type: string, colors: string, mv: number, set: string, rarity: string,
    price: [number | null, number | null, number | null, number | null, number | null], flavor: string | null = null) => {
    insert.run(id, oracle, name, "{R}", mv, type, "", colors, colors, legal, set, set === "tst" ? "Test Set" : "Other Set", id.replace(/\D/g, "") || "1",
      rarity, null, set === "tst" ? "2024-01-01" : "2023-01-01", "Artist");
    extras.run("nonfoil,foil,etched", 0, 0, id);
    prices.run(...price, flavor, id);
  };
  card("t1", "o-bolt", "Bolt", "Instant", "R", 1, "tst", "common", [2, 5, 7, null, null]);
  card("o1", "o-bolt", "Bolt", "Instant", "R", 1, "oth", "common", [0.5, 1, null, 0.4, 0.9]);
  card("t2", "o-bear", "Bear", "Creature - Bear", "G", 2, "tst", "uncommon", [0.25, null, null, 0.2, null]);
  card("t3", "o-land", "Forest", "Basic Land - Forest", "", 0, "tst", "common", [null, null, null, null, null]);
  card("t4", "o-gold", "Gold Dragon", "Legendary Creature - Dragon", "RG", 8, "tst", "mythic", [20, 40, null, 18, 35]);
  card("t5", "o-toxrill", "Toxrill, the Corrosive", "Legendary Creature - Slug", "B", 7, "tst", "mythic", [10, null, null, 9, null], "Gary, the Snail");
}

async function server(database = new DatabaseSync(":memory:")) {
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000 });
  seed(database);
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const users: Record<string, { cookie: string; id: number }> = {};
  async function signUp(name: string) {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    users[name] = { cookie: String(response.headers["set-cookie"]).split(";")[0]!, id: response.json().id };
    const main = (await call(name, "GET", "/api/collections")).json()[0] as { id: string };
    return main.id;
  }
  const call = (user: string, method: string, url: string, payload?: unknown, contentType?: string) => app.inject({
    method: method as "GET", url,
    headers: { ...(method === "GET" ? {} : guard), cookie: users[user]!.cookie, ...(contentType ? { "content-type": contentType } : {}) },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return { app, database, signUp, call, users };
}

describe("copy details", () => {
  it("reads conditions, languages and finishes in the forms CSV files use", () => {
    expect(readCondition("Near Mint")).toBe("NM");
    expect(readCondition("lightly_played")).toBe("LP");
    expect(readCondition("")).toBe("NM");
    expect(readCondition("Very fine")).toBeNull();
    expect(readLanguage("Japanese")).toBe("ja");
    expect(readLanguage("zhs")).toBe("zhs");
    expect(readLanguage("")).toBe("en");
    expect(readLanguage("Klingon")).toBeNull();
    expect([readFinish(false), readFinish(true), readFinish(2), readFinish("etched"), readFinish("shiny")]).toEqual([0, 1, 2, 2, null]);
  });

  it("keeps each finish, condition and language as its own row, and keeps trade counts within the quantity", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "t1", quantity: 2, foil: false });
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "t1", quantity: 1, foil: 2, condition: "LP", language: "ja" });
    let rows = (await call("ann", "GET", `/api/collections/${main}/cards`)).json();
    expect(rows.map((row: { foil: number; condition: string; language: string; quantity: number }) =>
      [row.foil, row.condition, row.language, row.quantity])).toEqual([[0, "NM", "en", 2], [2, "LP", "ja", 1]]);
    expect((await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t1", foil: 0, quantity: 2, trade: 3 }] })).statusCode).toBe(400);
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t1", foil: 0, quantity: 2, trade: 2 }] });
    // lowering the quantity lowers the trade count with it
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t1", foil: 0, quantity: 1 }] });
    rows = (await call("ann", "GET", `/api/collections/${main}/cards`)).json();
    expect(rows[0]).toMatchObject({ quantity: 1, trade: 1 });
    expect((await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "t1", condition: "Mint-ish" })).statusCode).toBe(400);
  });

  it("moves trade marks with copies only when the source cannot keep them", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const other = (await call("ann", "POST", "/api/collections", { name: "Box" })).json().id;
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t1", foil: false, quantity: 4, trade: 2 }] });
    await call("ann", "POST", `/api/collections/${main}/move`, { to: other, items: [{ cardId: "t1", foil: false, quantity: 3 }] });
    const left = (await call("ann", "GET", `/api/collections/${main}/cards`)).json()[0];
    const moved = (await call("ann", "GET", `/api/collections/${other}/cards`)).json()[0];
    expect([left.quantity, left.trade, moved.quantity, moved.trade]).toEqual([1, 1, 3, 1]);
  });

  it("imports condition, language, etched and tradelist counts and matches flavor names", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const csv = [
      "Count,Tradelist Count,Name,Edition,Condition,Language,Foil",
      "3,1,Bolt,tst,Lightly Played,Japanese,etched",
      "1,0,\"Gary, the Snail\",,,,",
      "1,0,Bolt,tst,Pristine,,",
    ].join("\n");
    const report = (await call("ann", "POST", `/api/collections/${main}/import`, csv, "text/csv")).json();
    expect(report).toMatchObject({ matchedRows: 2, importedQuantity: 4 });
    expect(report.unmatched[0]).toMatchObject({ row: 4, reason: 'Unrecognized condition "Pristine"' });
    const rows = (await call("ann", "GET", `/api/collections/${main}/cards`)).json();
    expect(rows.map((row: { id: string; foil: number; condition: string; language: string; trade: number }) =>
      [row.id, row.foil, row.condition, row.language, row.trade])).toEqual([["t1", 2, "LP", "ja", 1], ["t5", 0, "NM", "en", 0]]);
  });

  it("upgrades a 0.2.0 database without losing copies", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE collection_cards (collection_id TEXT NOT NULL, card_id TEXT NOT NULL, foil INTEGER NOT NULL DEFAULT 0 CHECK(foil IN (0, 1)),
        quantity INTEGER NOT NULL CHECK(quantity > 0), PRIMARY KEY (collection_id, card_id, foil));
      INSERT INTO collection_cards VALUES ('c1', 'x', 1, 3);
    `);
    initializeDatabase(database);
    expect(database.prepare("SELECT foil, condition, language, quantity, trade FROM collection_cards").all())
      .toEqual([{ foil: 1, condition: "NM", language: "en", quantity: 3, trade: 0 }]);
  });
});

describe("prices", () => {
  it("stores Scryfall prices and flavor names from the bulk file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mana-vault-prices-"));
    try {
      const path = join(directory, "cards.json");
      await writeFile(path, JSON.stringify([{
        id: "p1", oracle_id: "o-p", name: "Priced", type_line: "Instant", set: "tst", set_name: "Test", collector_number: "1", rarity: "rare",
        colors: [], color_identity: [], legalities: {}, flavor_name: "Nickname",
        prices: { usd: "1.50", usd_foil: null, usd_etched: "9.99", eur: "1.20", eur_foil: "bad" },
      }]));
      const database = new DatabaseSync(":memory:");
      initializeDatabase(database);
      await importBulkFile(path, database);
      expect(database.prepare("SELECT price_usd, price_usd_foil, price_usd_etched, price_eur, price_eur_foil, flavor_name FROM cards").get())
        .toEqual({ price_usd: 1.5, price_usd_foil: null, price_usd_etched: 9.99, price_eur: null, price_eur_foil: null, flavor_name: "Nickname" });
      database.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("values collections by finish and searches by price", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [
      { cardId: "t1", foil: 0, quantity: 2 }, { cardId: "t1", foil: 1, quantity: 1 }, { cardId: "t1", foil: 2, quantity: 1 }, { cardId: "t3", foil: 0, quantity: 5 },
    ] });
    const summary = (await call("ann", "GET", `/api/collections/${main}`)).json();
    // 2 x 2 + 5 + 7 in USD; in EUR only the etched copy has a (foil) price... none here, so 0
    expect(summary.value).toEqual({ usd: 16, eur: 0, unpricedUsd: 5, unpricedEur: 9 });
    const cheap = (await call("ann", "GET", "/api/cards?q=usd<1")).json().map((card: { id: string }) => card.id).sort();
    expect(cheap).toEqual(["o1", "t2"]);
    const card = (await call("ann", "GET", "/api/cards/t1")).json();
    expect(card.prices).toEqual({ usd: 2, usd_foil: 5, usd_etched: 7, eur: null, eur_foil: null });
    expect((await call("ann", "GET", "/api/cards?q=gary")).json()[0].name).toBe("Toxrill, the Corrosive");
  });
});

describe("wishlists", () => {
  it("keeps wishlist copies out of owned counts, and adds many cards at once", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const wish = (await call("ann", "POST", "/api/collections", { name: "Wants", kind: "wishlist" })).json();
    expect(wish.kind).toBe("wishlist");
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "t1", quantity: 1 });
    const added = (await call("ann", "POST", `/api/collections/${wish.id}/cards/add`, { items: [
      { cardId: "t1", foil: false, quantity: 2 }, { cardId: "t2", foil: false, quantity: 1 }, { cardId: "nope", foil: false, quantity: 1 },
    ] })).json();
    expect(added.added).toBe(3);
    expect(added.before.map((item: { cardId: string; quantity: number }) => [item.cardId, item.quantity])).toEqual([["t1", 0], ["t2", 0]]);
    const card = (await call("ann", "GET", "/api/cards/t1")).json();
    expect(card.owned.regular).toBe(1);
    expect(card.owned.collections.map((item: { id: string }) => item.id)).toEqual([main]);
    expect(card.wanted.map((item: { id: string; regular: number }) => [item.id, item.regular])).toEqual([[wish.id, 2]]);
  });
});

describe("deck ownership", () => {
  it("counts the copies linked to each deck card, each copy filling one deck card at a time", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const wish = (await call("ann", "POST", "/api/collections", { name: "Wants", kind: "wishlist" })).json().id;
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "o1", foil: 0, quantity: 3 }] });
    await call("ann", "PUT", `/api/collections/${wish}/cards`, { items: [{ cardId: "t2", foil: 0, quantity: 4 }] });
    const deck = (await call("ann", "POST", "/api/decks", { name: "Deck", format: "casual" })).json().id;
    const link = (quantity: number) => [{ collectionId: main, cardId: "o1", foil: 0, quantity }];
    expect((await call("ann", "POST", `/api/decks/${deck}/cards`, { cardId: "t1", quantity: 2, zone: "main", links: link(2) })).json()).toMatchObject({ linked: 2 });
    // only one copy is still free for the sideboard
    expect((await call("ann", "POST", `/api/decks/${deck}/cards`, { cardId: "t1", quantity: 2, zone: "sideboard", links: link(2) })).json()).toMatchObject({ linked: 1 });
    await call("ann", "POST", `/api/decks/${deck}/cards`, { cardId: "t2", quantity: 1, zone: "main" });
    // wishlist cards are not owned
    expect((await call("ann", "POST", `/api/decks/${deck}/cards`, { cardId: "t2", quantity: 1, zone: "main", links: [{ collectionId: wish, cardId: "t2", foil: 0 }] })).statusCode).toBe(400);
    const report = (await call("ann", "GET", `/api/decks/${deck}/ownership`)).json();
    expect(report).toMatchObject({ needed: 5, owned: 3, missing: 2 });
    // a linked copy of another printing moves the deck card to that printing
    const detail = (await call("ann", "GET", `/api/decks/${deck}`)).json();
    const rows = detail.cards.map((card: { card_id: string; zone: string; quantity: number; missing: number }) => `${card.card_id}:${card.zone}:${card.quantity}:${card.missing}`).sort();
    expect(rows).toEqual(["o1:main:2:0", "o1:sideboard:1:0", "t1:sideboard:1:1", "t2:main:1:1"]);
    expect(detail.cards.find((card: { zone: string; card_id: string }) => card.card_id === "o1" && card.zone === "main").links[0]).toMatchObject({ collectionName: "Main collection", quantity: 2 });
    // the collection shows which decks hold its copies
    expect((await call("ann", "GET", `/api/collections/${main}/cards`)).json()[0].decks).toEqual([{ id: deck, name: "Deck", quantity: 3 }]);
    // removing copies from the collection makes deck cards missing; moving keeps the links
    const other = (await call("ann", "POST", "/api/collections", { name: "Box" })).json().id;
    await call("ann", "POST", `/api/collections/${main}/move`, { to: other, items: [{ cardId: "o1", foil: 0, quantity: 3 }] });
    expect((await call("ann", "GET", `/api/decks/${deck}/ownership`)).json()).toMatchObject({ owned: 3 });
    expect((await call("ann", "GET", `/api/collections/${other}/cards`)).json()[0].decks).toEqual([{ id: deck, name: "Deck", quantity: 3 }]);
    await call("ann", "PUT", `/api/collections/${other}/cards`, { items: [{ cardId: "o1", foil: 0, quantity: 1 }] });
    expect((await call("ann", "GET", `/api/decks/${deck}/ownership`)).json()).toMatchObject({ owned: 1, missing: 4 });
  });

  it("lists free copies to link, and moves links when a copy's details change", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t1", foil: 0, quantity: 2 }, { cardId: "o1", foil: 1, quantity: 1 }] });
    const deck = (await call("ann", "POST", "/api/decks", { name: "Deck" })).json().id;
    const added = (await call("ann", "POST", `/api/decks/${deck}/cards`, { cardId: "t1", quantity: 1, links: [{ collectionId: main, cardId: "t1", foil: 0 }] })).json();
    const candidates = (await call("ann", "GET", `/api/decks/${deck}/candidates?cardId=t1`)).json();
    expect(candidates.map((item: { cardId: string; free: number }) => `${item.cardId}:${item.free}`)).toEqual(["t1:1", "o1:1"]);
    // the edit of a copy (finish change) is sent as one count set to 0 and another raised: the link follows
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t1", foil: 0, quantity: 0 }, { cardId: "t1", foil: 1, quantity: 2 }] });
    const card = (await call("ann", "GET", `/api/decks/${deck}`)).json().cards[0];
    expect(card.links).toMatchObject([{ cardId: "t1", foil: 1, quantity: 1 }]);
    // replacing the links
    await call("ann", "PUT", `/api/decks/${deck}/entries/${added.entryId}/links`, { links: [] });
    expect((await call("ann", "GET", `/api/decks/${deck}`)).json().cards[0].missing).toBe(1);
  });
});

describe("statistics", () => {
  it("groups cards by type, color and mana value", () => {
    expect(cardTypes("Artifact Creature - Golem")).toEqual(["Creature", "Artifact"]);
    expect(cardTypes("Creature - Human // Land")).toEqual(["Creature"]);
    expect(cardTypes("Conspiracy")).toEqual(["Other"]);
    expect([colorKey(""), colorKey("U"), colorKey("WU")]).toEqual(["C", "U", "M"]);
    expect([curveKey(0.5), curveKey(3), curveKey(12), curveKey(null)]).toEqual(["0", "3", "7+", "0"]);
  });

  it("works out the median per copy", () => {
    const row = (name: string, quantity: number, price: number | null) => ({
      name, quantity, foil: 0, rarity: "rare", colors: "R", type_line: "Instant", mana_value: 1, set_code: "tst", set_name: "Test", price,
    });
    const result = summarize([row("A", 3, 1), row("B", 1, 10), row("C", 2, null)], true);
    expect(result).toMatchObject({ cards: 6, value: 13, unpriced: 2, median: 1, average: 3.25, highest: { name: "B", price: 10 } });
  });

  it("reports collection and deck statistics", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [
      { cardId: "t2", foil: 0, quantity: 4 }, { cardId: "t3", foil: 0, quantity: 10 }, { cardId: "t4", foil: 1, quantity: 1 },
    ] });
    const stats = (await call("ann", "GET", `/api/collections/${main}/stats`)).json();
    expect(stats).toMatchObject({ currency: "usd", cards: 15, value: 41, unpriced: 10 });
    expect(stats.color.map((bucket: { key: string; count: number }) => [bucket.key, bucket.count])).toEqual([["G", 4], ["M", 1], ["C", 10]]);
    // lands are left out of the mana curve
    expect(stats.curve.find((bucket: { key: string }) => bucket.key === "0").count).toBe(0);
    expect(stats.curve.find((bucket: { key: string }) => bucket.key === "7+").count).toBe(1);
    expect(stats.finish.map((bucket: { label: string }) => bucket.label)).toEqual(["Regular", "Foil"]);
    expect((await call("ann", "GET", `/api/collections/${main}/stats?currency=eur`)).json()).toMatchObject({ currency: "eur", value: 35.8 });
    const deck = (await call("ann", "POST", "/api/decks", { name: "D", format: "casual" })).json().id;
    await call("ann", "POST", `/api/decks/${deck}/cards`, { cardId: "t1", quantity: 4, zone: "main" });
    expect((await call("ann", "GET", `/api/decks/${deck}/stats`)).json()).toMatchObject({ cards: 4, value: 8 });
  });
});

describe("trade list", () => {
  it("lists copies marked for trade in the account's own collections only", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const bobMain = await signUp("bob");
    const wish = (await call("ann", "POST", "/api/collections", { name: "Wants", kind: "wishlist" })).json().id;
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t4", foil: 1, quantity: 2, trade: 1 }, { cardId: "t2", foil: 0, quantity: 1 }] });
    await call("ann", "PUT", `/api/collections/${wish}/cards`, { items: [{ cardId: "t1", foil: 0, quantity: 1, trade: 1 }] });
    await call("bob", "PUT", `/api/collections/${bobMain}/cards`, { items: [{ cardId: "t1", foil: 0, quantity: 1, trade: 1 }] });
    const list = (await call("ann", "GET", "/api/trade")).json();
    expect(list.map((entry: { id: string; trade: number; collection_name: string }) => [entry.id, entry.trade, entry.collection_name]))
      .toEqual([["t4", 1, "Main collection"]]);
  });
});

describe("backups", () => {
  it("keeps copy details and wishlists, and restores version 2 backups with defaults", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    await call("ann", "POST", "/api/collections", { name: "Wants", kind: "wishlist" });
    await call("ann", "PUT", `/api/collections/${main}/cards`, { items: [{ cardId: "t1", foil: 2, condition: "HP", language: "de", quantity: 2, trade: 1 }] });
    const backup = (await call("ann", "GET", "/api/backup")).body;
    const parsed = JSON.parse(backup);
    expect(parsed.version).toBe(APP_VERSION);
    expect(parsed.collectionCards[0]).toMatchObject({ foil: 2, condition: "HP", language: "de", trade: 1 });
    const headers = "application/vnd.mana-vault.backup+json";
    expect((await call("ann", "POST", "/api/backup/restore", backup, headers)).statusCode).toBe(200);
    const restored = (await call("ann", "GET", "/api/collections")).json();
    expect(restored.map((item: { name: string; kind: string }) => [item.name, item.kind])).toEqual([["Main collection", "collection"], ["Wants", "wishlist"]]);
    const old = { ...parsed, version: 2, collections: parsed.collections.map(({ kind: _kind, ...item }: { kind: string }) => item),
      collectionCards: parsed.collectionCards.map(({ condition: _c, language: _l, trade: _t, ...item }: Record<string, unknown>) => ({ ...item, foil: 1 })) };
    expect((await call("ann", "POST", "/api/backup/restore", JSON.stringify(old), headers)).statusCode).toBe(200);
    const first = (await call("ann", "GET", "/api/collections")).json()[0].id;
    expect((await call("ann", "GET", `/api/collections/${first}/cards`)).json()[0]).toMatchObject({ foil: 1, condition: "NM", language: "en", trade: 0 });
  });
});
