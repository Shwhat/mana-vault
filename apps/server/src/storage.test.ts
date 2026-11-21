// Tests for 0.6.0: completion rule None, proxies and copy details, wishlist wants, import formats, rulings and offline creation.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { detectFormat } from "./collection-import.js";
import { cardExtrasStatement, cardInsertStatement, cardPricesStatement } from "./database.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function seed(database: DatabaseSync) {
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const prices = cardPricesStatement(database);
  const card = (id: string, oracle: string, name: string, set: string, number: string, price: number | null) => {
    insert.run(id, oracle, name, "{R}", 1, "Instant", "Deal 3 damage.", "R", "R", "{}", set, set === "hob" ? "The Hobbit" : "Other Set", number,
      "common", null, set === "hob" ? "2026-08-01" : "2020-01-01", "Artist");
    extras.run("nonfoil,foil", 0, 0, id);
    prices.run(price, price === null ? null : price * 2, null, null, null, null, id);
  };
  card("4031e5e4-e573-4130-8d20-4a606edef0a0", "o-barrel", "Getaway Barrel", "hob", "98", 1);
  card("b2", "o-barrel", "Getaway Barrel", "oth", "5", 0.5);
  card("g1", "o-gandalf", "Gandalf, Spark Starter", "hob", "97", 2);
  card("r1", "o-ring", "Bofur, Reliable Guardian // Concerted Care", "hob", "11", 0.25);
  database.prepare("INSERT INTO rulings (oracle_id, published_at, source, comment) VALUES (?, ?, ?, ?)").run("o-barrel", "2026-08-01", "wotc", "It rolls.");
}

async function server() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000 });
  seed(database);
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const users: Record<string, string> = {};
  async function signUp(name: string) {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    users[name] = String(response.headers["set-cookie"]).split(";")[0]!;
    return ((await call(name, "GET", "/api/collections")).json()[0] as { id: string }).id;
  }
  const call = (user: string, method: string, url: string, payload?: unknown, contentType?: string) => app.inject({
    method: method as "GET", url,
    headers: { ...(method === "GET" ? {} : guard), cookie: users[user]!, ...(contentType ? { "content-type": contentType } : {}) },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return { database, signUp, call };
}

const MANABOX = [
  "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Signed,Condition,Language,Proxy,Purchase price currency,Added",
  "Getaway Barrel,HOB,The Hobbit,98,foil,rare,2,115092,4031e5e4-e573-4130-8d20-4a606edef0a0,0.57,false,false,true,near_mint,en,false,USD,2026-08-10T03:28:59.931Z",
  '"Gandalf, Spark Starter",HOB,The Hobbit,97,normal,uncommon,1,114975,,1.53,false,false,false,lightly_played,en,true,USD,2026-08-10T03:28:59.932Z',
].join("\n");

describe("import formats", () => {
  it("detects the program a file came from", () => {
    expect(detectFormat(MANABOX)).toBe("manabox");
    expect(detectFormat('"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number"')).toBe("moxfield");
    expect(detectFormat("Count,Tradelist Count,Name,Edition,Edition Code,Card Number,Condition,Language,Foil,Signed")).toBe("deckbox");
    expect(detectFormat("Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code")).toBe("archidekt");
    expect(detectFormat("Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU")).toBe("tcgplayer");
    expect(detectFormat("Quantity,Trade,Name,Set code,Collector number,Finish,Condition,Language,Proxy,Purchase price,Scryfall ID")).toBe("manavault");
    expect(detectFormat("4 Lightning Bolt (M10) 146\n2 Opt")).toBe("text");
  });

  it("imports a ManaBox file with its copy details and proxies", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const preview = (await call("ann", "POST", `/api/collections/${main}/import/preview`, MANABOX, "text/csv")).json();
    expect(preview).toMatchObject({ format: "manabox", formatName: "ManaBox CSV", matchedRows: 2, importedQuantity: 3 });
    await call("ann", "POST", `/api/collections/${main}/import`, MANABOX, "text/csv");
    const rows = (await call("ann", "GET", `/api/collections/${main}/cards`)).json();
    expect(rows.find((row: { name: string }) => row.name === "Getaway Barrel")).toMatchObject({
      foil: 1, quantity: 2, purchase_price: 0.57, price_currency: "USD", added_at: "2026-08-10T03:28:59.931Z", signed: true, proxy: false,
    });
    expect(rows.find((row: { name: string }) => row.name === "Gandalf, Spark Starter")).toMatchObject({ proxy: true, condition: "LP" });
    // a proxy has no value: only the two foil barrels count (2 x 2.00)
    expect((await call("ann", "GET", "/api/collections")).json()[0].value.usd).toBe(4);
  });

  it("imports plain text lists and a chosen format over the detected one", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const text = "// my list\n2 Getaway Barrel (OTH) 5 *F*\n1x Gandalf, Spark Starter\nBofur, Reliable Guardian";
    const result = (await call("ann", "POST", `/api/collections/${main}/import`, text, "text/plain")).json();
    expect(result).toMatchObject({ format: "text", matchedRows: 3, importedQuantity: 4 });
    const rows = (await call("ann", "GET", `/api/collections/${main}/cards`)).json();
    expect(rows.find((row: { id: string }) => row.id === "b2")).toMatchObject({ foil: 1, quantity: 2 });
    const forced = (await call("ann", "POST", `/api/collections/${main}/import/preview?format=text`, MANABOX, "text/csv")).json();
    expect(forced.format).toBe("text");
  });
});

describe("collections and wishlists", () => {
  it("asks which wishlist to lower when the card is on more than one (0.17.0), and lowers the one chosen", async () => {
    const { signUp, call } = await server();
    const main = await signUp("ann");
    const first = (await call("ann", "POST", "/api/collections", { name: "Wants", kind: "wishlist" })).json().id;
    const second = (await call("ann", "POST", "/api/collections", { name: "More wants", kind: "wishlist" })).json().id;
    await call("ann", "POST", `/api/collections/${first}/cards`, { cardId: "b2", quantity: 2 });
    await call("ann", "POST", `/api/collections/${second}/cards`, { cardId: "4031e5e4-e573-4130-8d20-4a606edef0a0", quantity: 1 });
    const added = (await call("ann", "POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "4031e5e4-e573-4130-8d20-4a606edef0a0", foil: 0, quantity: 3 }] })).json();
    // on two wishlists: nothing is lowered yet, and the person is asked
    expect(added.wishlist).toEqual([]);
    expect(added.wishAsk).toEqual([expect.objectContaining({ quantity: 3, wishlists: [
      expect.objectContaining({ collectionId: first, name: "Wants", wanted: 2 }), expect.objectContaining({ collectionId: second, name: "More wants", wanted: 1 }),
    ] })]);
    const lowered = (await call("ann", "POST", "/api/wishlists/lower", { items: [{ cardId: "4031e5e4-e573-4130-8d20-4a606edef0a0", quantity: 3, collectionId: first }] })).json();
    expect(lowered.wishlist.map((change: { collectionName: string; after: { quantity: number } }) => `${change.collectionName}:${change.after.quantity}`)).toEqual(["Wants:0"]);
    expect((await call("ann", "GET", `/api/collections/${first}/cards`)).json()).toEqual([]);
    expect((await call("ann", "GET", `/api/collections/${second}/cards`)).json()).toHaveLength(1);
    // on one wishlist: lowered at once, as before
    const one = (await call("ann", "POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "4031e5e4-e573-4130-8d20-4a606edef0a0", foil: 0, quantity: 1 }] })).json();
    expect(one.wishlist.map((change: { collectionName: string }) => change.collectionName)).toEqual(["More wants"]);
    // proxies lower nothing
    await call("ann", "POST", `/api/collections/${second}/cards`, { cardId: "g1", quantity: 1 });
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "g1", proxy: true });
    expect((await call("ann", "GET", `/api/collections/${second}/cards`)).json()).toHaveLength(1);
  });

  it("creates a collection and a deck with an id chosen by the phone", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    const id = "5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
    expect((await call("ann", "POST", "/api/collections", { id, name: "Phone box" })).json().id).toBe(id);
    expect((await call("ann", "POST", "/api/collections", { id, name: "Again" })).statusCode).toBe(400);
    const deckId = "6f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
    const deck = (await call("ann", "POST", "/api/decks", { id: deckId, name: "Phone deck", collectionId: id })).json();
    expect(deck).toMatchObject({ id: deckId, collection_id: id, mode: "theme" });
    await call("ann", "PATCH", `/api/decks/${deckId}`, { collectionId: null });
    expect((await call("ann", "GET", `/api/decks/${deckId}`)).json().collection_id).toBeNull();
  });

  it("keeps proxies apart from real copies and out of set completion", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    const set = (await call("ann", "POST", "/api/collections", { name: "Hobbit", sets: ["hob"], completion: "all" })).json().id;
    await call("ann", "POST", `/api/collections/${set}/cards`, { cardId: "g1", proxy: true });
    await call("ann", "POST", `/api/collections/${set}/cards`, { cardId: "g1" });
    expect((await call("ann", "GET", `/api/collections/${set}/cards`)).json().map((row: { proxy: boolean }) => row.proxy)).toEqual([false, true]);
    expect((await call("ann", "GET", `/api/collections/${set}/completion`)).json().overall).toEqual({ owned: 1, total: 3 });
    await call("ann", "PUT", `/api/collections/${set}/cards`, { items: [{ cardId: "g1", quantity: 0 }] });
    expect((await call("ann", "GET", `/api/collections/${set}/completion`)).json().overall).toEqual({ owned: 0, total: 3 });
    const detail = (await call("ann", "GET", "/api/cards/g1")).json();
    expect(detail.owned).toMatchObject({ regular: 0, proxies: 1 });
  });
});

describe("rulings", () => {
  it("lists a card's rulings and offers them all to the phone", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    expect((await call("ann", "GET", "/api/cards/b2/rulings")).json()).toEqual([{ date: "2026-08-01", text: "It rolls." }]);
    const all = await call("ann", "GET", "/api/rulings/compact");
    expect(all.headers["content-encoding"]).toBe("gzip");
  });
});
