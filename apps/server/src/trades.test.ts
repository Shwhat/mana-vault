// Tests for 0.8.0: search pages, all collections, saved trades, completing them, proposals, matches and the shared binder.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardExtrasStatement, cardInsertStatement, cardPricesStatement } from "./database.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function server() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000 });
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const prices = cardPricesStatement(database);
  const legal = JSON.stringify({ commander: "legal", modern: "not_legal", vintage: "restricted" });
  for (let index = 1; index <= 70; index++) {
    const id = `c${index}`;
    insert.run(id, `o${index}`, `Card ${String(index).padStart(2, "0")}`, "{1}", 1, "Artifact", "", "", "", legal, "tst", "Test", String(index), "common", null, "2024-01-01", "A");
    extras.run("nonfoil,foil", 0, 0, id);
    prices.run(index, index * 2, null, index, null, null, id);
  }
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const call = (user: string, method: string, url: string, payload?: unknown) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie: cookies[user]! }, ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  async function signUp(name: string) {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    cookies[name] = String(response.headers["set-cookie"]).split(";")[0]!;
    ids[name] = response.json().id;
    return (await call(name, "GET", "/api/collections")).json()[0].id as string;
  }
  return { app, database, call, signUp, ids };
}

const copy = { foil: 0, condition: "NM", language: "en" };

describe("search pages and all collections", () => {
  it("returns pages of results with the total and owned counts", async () => {
    const { call, signUp } = await server();
    const main = await signUp("ann");
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "c2", quantity: 3, foil: false });
    const first = (await call("ann", "GET", "/api/cards?q=card&paged=1&limit=60")).json();
    expect(first.total).toBe(70);
    expect(first.cards).toHaveLength(60);
    expect(first.cards[1]).toMatchObject({ id: "c2", owned: 3 });
    const second = (await call("ann", "GET", "/api/cards?q=card&paged=1&limit=60&offset=60")).json();
    expect(second.cards.map((card: { id: string }) => card.id)).toEqual(["c61", "c62", "c63", "c64", "c65", "c66", "c67", "c68", "c69", "c70"]);
    expect(Array.isArray((await call("ann", "GET", "/api/cards?q=card")).json())).toBe(true);
    expect((await call("ann", "GET", "/api/cards?q=card&offset=-1")).statusCode).toBe(400);
  });

  it("lists every collection's rows with their collection, and the formats each card can be played in", async () => {
    const { call, signUp } = await server();
    const main = await signUp("ann");
    const other = (await call("ann", "POST", "/api/collections", { name: "Box", description: "", completion: "none", finish: "any", kind: "collection", sets: [] })).json().id;
    const wish = (await call("ann", "POST", "/api/collections", { name: "Wants", description: "", completion: "none", finish: "any", kind: "wishlist", sets: [] })).json().id;
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "c1", quantity: 1, foil: false });
    await call("ann", "POST", `/api/collections/${other}/cards`, { cardId: "c1", quantity: 2, foil: false });
    await call("ann", "POST", `/api/collections/${wish}/cards`, { cardId: "c3", quantity: 1, foil: false });
    const rows = (await call("ann", "GET", "/api/library/cards")).json();
    expect(rows.map((row: { collection_name: string; quantity: number }) => [row.collection_name, row.quantity])).toEqual([["Main collection", 1], ["Box", 2]]);
    expect(rows[0].legal).toBe("commander,vintage");
    expect((await call("ann", "GET", "/api/library/cards?wishlists=1")).json()).toHaveLength(3);
  });
});

describe("trades", () => {
  it("saves a trade, completes it as one change, and undoes it", async () => {
    const { call, signUp } = await server();
    const main = await signUp("ann");
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "c1", quantity: 2, foil: false });
    const trade = (await call("ann", "POST", "/api/trades", { name: "Bob at the shop" })).json();
    expect(trade).toMatchObject({ name: "Bob at the shop", status: "open", mine: true, with: null, lines: [] });
    const lines = [
      { side: "give", cardId: "c1", ...copy, quantity: 2, price: null, collectionId: main },
      { side: "get", cardId: "c5", foil: 1, condition: "LP", language: "en", quantity: 1, price: 4.5 },
    ];
    const saved = (await call("ann", "PATCH", `/api/trades/${trade.id}`, { lines })).json();
    expect(saved.lines.map((line: { side: string; name: string; price: number | null }) => [line.side, line.name, line.price])).toEqual([["give", "Card 01", null], ["get", "Card 05", 4.5]]);
    expect((await call("ann", "POST", `/api/trades/${trade.id}/complete`, {})).statusCode).toBe(400);
    expect((await call("ann", "POST", `/api/trades/${trade.id}/complete`, { collectionId: main })).json()).toEqual({ status: "done", removed: 1, added: 1 });
    const rows = (await call("ann", "GET", `/api/collections/${main}/cards`)).json();
    expect(rows.map((row: { id: string; foil: number; condition: string; quantity: number }) => [row.id, row.foil, row.condition, row.quantity])).toEqual([["c5", 1, "LP", 1]]);
    expect((await call("ann", "GET", "/api/trades")).json()[0]).toMatchObject({ status: "done", canUndo: true });
    expect((await call("ann", "PATCH", `/api/trades/${trade.id}`, { lines: [] })).statusCode).toBe(409);
    await call("ann", "POST", `/api/trades/${trade.id}/reopen`);
    const back = (await call("ann", "GET", `/api/collections/${main}/cards`)).json();
    expect(back.map((row: { id: string; quantity: number }) => [row.id, row.quantity])).toEqual([["c1", 2]]);
    expect((await call("ann", "GET", "/api/trades")).json()[0].status).toBe("open");
  });

  it("will not complete when a given card is no longer in its collection", async () => {
    const { call, signUp } = await server();
    const main = await signUp("ann");
    await call("ann", "POST", `/api/collections/${main}/cards`, { cardId: "c1", quantity: 1, foil: false });
    const trade = (await call("ann", "POST", "/api/trades", { name: "T" })).json();
    await call("ann", "PATCH", `/api/trades/${trade.id}`, { lines: [{ side: "give", cardId: "c1", ...copy, quantity: 3, price: null, collectionId: main }] });
    const result = await call("ann", "POST", `/api/trades/${trade.id}/complete`, {});
    expect(result.json().error).toBe("Card 01: only 1 of 3 copies are in the collection");
    expect((await call("ann", "GET", `/api/collections/${main}/cards`)).json()[0].quantity).toBe(1);
  });

  it("sends a proposal, takes a counter-offer and completes on both sides when accepted", async () => {
    const { call, signUp, ids } = await server();
    const annMain = await signUp("ann");
    const bobMain = await signUp("bob");
    await call("ann", "POST", `/api/collections/${annMain}/cards`, { cardId: "c1", quantity: 1, foil: false });
    await call("bob", "POST", `/api/collections/${bobMain}/cards`, { cardId: "c9", quantity: 2, foil: false });
    const trade = (await call("ann", "POST", "/api/trades", { name: "With Bob" })).json();
    await call("ann", "PATCH", `/api/trades/${trade.id}`, { lines: [
      { side: "give", cardId: "c1", ...copy, quantity: 1, price: null, collectionId: annMain },
      { side: "get", cardId: "c9", ...copy, quantity: 2, price: null },
    ] });
    expect((await call("ann", "POST", `/api/trades/${trade.id}/send`, { userId: ids.bob })).statusCode).toBe(400);
    const sent = (await call("ann", "POST", `/api/trades/${trade.id}/send`, { userId: ids.bob, collectionId: annMain })).json();
    expect(sent).toMatchObject({ turn: "them", with: { name: "bob" } });
    // Bob sees the sides from his side, and answers with a change: he gives one copy, from his collection
    const seen = (await call("bob", "GET", "/api/trades")).json()[0];
    expect(seen).toMatchObject({ mine: false, turn: "me", with: { name: "ann" } });
    expect(seen.lines.map((line: { side: string; cardId: string }) => [line.side, line.cardId])).toEqual([["get", "c1"], ["give", "c9"]]);
    await call("bob", "PATCH", `/api/trades/${trade.id}`, { lines: [
      { side: "get", cardId: "c1", ...copy, quantity: 1, price: null },
      { side: "give", cardId: "c9", ...copy, quantity: 1, price: null, collectionId: bobMain },
    ] });
    expect((await call("bob", "POST", `/api/trades/${trade.id}/accept`, { collectionId: bobMain })).json().error).toBe("Wait for the other account to answer your last change");
    expect((await call("ann", "GET", "/api/trades")).json()[0].turn).toBe("me");
    // Bob chose his collection while answering; Ann accepts
    await call("bob", "POST", `/api/trades/${trade.id}/collection`, { collectionId: bobMain });
    expect((await call("ann", "POST", `/api/trades/${trade.id}/accept`, {})).json()).toEqual({ status: "done" });
    const ann = (await call("ann", "GET", `/api/collections/${annMain}/cards`)).json();
    const bob = (await call("bob", "GET", `/api/collections/${bobMain}/cards`)).json();
    expect(ann.map((row: { id: string; quantity: number }) => [row.id, row.quantity])).toEqual([["c9", 1]]);
    expect(bob.map((row: { id: string; quantity: number }) => [row.id, row.quantity])).toEqual([["c1", 1], ["c9", 1]]);
    expect((await call("bob", "DELETE", `/api/trades/${trade.id}`)).statusCode).toBe(403);
  });

  it("lets each account set its own source without changing the turn and accept the proposal", async () => {
    const { call, signUp, ids } = await server();
    const annMain = await signUp("ann");
    const bobMain = await signUp("bob");
    const eveMain = await signUp("eve");
    await call("ann", "POST", `/api/collections/${annMain}/cards`, { cardId: "c1", quantity: 1, foil: false });
    await call("bob", "POST", `/api/collections/${bobMain}/cards`, { cardId: "c9", quantity: 1, foil: false });
    const trade = (await call("ann", "POST", "/api/trades", { name: "Proposal" })).json();
    await call("ann", "PATCH", `/api/trades/${trade.id}`, { lines: [
      { side: "give", cardId: "c1", ...copy, quantity: 1, price: null, collectionId: annMain },
      { side: "get", cardId: "c9", ...copy, quantity: 1, price: null },
    ] });
    await call("ann", "POST", `/api/trades/${trade.id}/send`, { userId: ids.bob, collectionId: annMain });
    const seen = (await call("bob", "GET", "/api/trades")).json()[0];
    const given = seen.lines.find((line: { side: string }) => line.side === "give");
    const received = seen.lines.find((line: { side: string }) => line.side === "get");
    expect((await call("bob", "POST", `/api/trades/${trade.id}/lines/${given.id}/source`, { collectionId: eveMain })).statusCode).toBe(404);
    expect((await call("bob", "POST", `/api/trades/${trade.id}/lines/${received.id}/source`, { collectionId: bobMain })).statusCode).toBe(404);
    expect((await call("eve", "POST", `/api/trades/${trade.id}/lines/${given.id}/source`, { collectionId: eveMain })).statusCode).toBe(404);
    const saved = (await call("bob", "POST", `/api/trades/${trade.id}/lines/${given.id}/source`, { collectionId: bobMain })).json();
    expect(saved.turn).toBe("me");
    expect(saved.lines.find((line: { id: number }) => line.id === given.id).collectionId).toBe(bobMain);
    expect((await call("bob", "POST", `/api/trades/${trade.id}/accept`, { collectionId: bobMain })).json()).toEqual({ status: "done" });
    expect((await call("bob", "POST", `/api/trades/${trade.id}/lines/${given.id}/source`, { collectionId: bobMain })).statusCode).toBe(409);
    expect((await call("ann", "GET", `/api/collections/${annMain}/cards`)).json().map((row: { id: string }) => row.id)).toEqual(["c9"]);
    expect((await call("bob", "GET", `/api/collections/${bobMain}/cards`)).json().map((row: { id: string }) => row.id)).toEqual(["c1"]);
  });

  it("preserves separate sources for identical lines when the other account changes the offer", async () => {
    const { call, signUp, ids } = await server();
    const annMain = await signUp("ann");
    const bobMain = await signUp("bob");
    const bobBox = (await call("bob", "POST", "/api/collections", { name: "Box", kind: "collection", completion: "none", finish: "any", sets: [] })).json().id;
    await call("bob", "POST", `/api/collections/${bobMain}/cards`, { cardId: "c9", quantity: 1, foil: false });
    await call("bob", "POST", `/api/collections/${bobBox}/cards`, { cardId: "c9", quantity: 1, foil: false });
    const trade = (await call("bob", "POST", "/api/trades", { name: "Two sources" })).json();
    await call("bob", "PATCH", `/api/trades/${trade.id}`, { lines: [
      { side: "give", cardId: "c9", ...copy, quantity: 1, price: null, collectionId: bobMain },
      { side: "give", cardId: "c9", ...copy, quantity: 1, price: null, collectionId: bobBox },
    ] });
    await call("bob", "POST", `/api/trades/${trade.id}/send`, { userId: ids.ann, collectionId: bobMain });
    const ann = (await call("ann", "GET", "/api/trades")).json()[0];
    const changed = (await call("ann", "PATCH", `/api/trades/${trade.id}`, { lines: [...ann.lines].reverse() })).json();
    expect(changed.lines.map((line: { collectionId: string }) => line.collectionId)).toEqual([bobBox, bobMain]);
    await call("ann", "POST", `/api/trades/${trade.id}/collection`, { collectionId: annMain });
    expect((await call("bob", "POST", `/api/trades/${trade.id}/accept`, { collectionId: bobMain })).json()).toEqual({ status: "done" });
    expect((await call("ann", "GET", `/api/collections/${annMain}/cards`)).json()[0].quantity).toBe(2);
  });

  it("finds wishlist matches both ways, and shares the trade binder by a link that can be turned off", async () => {
    const { app, call, signUp, ids } = await server();
    const annMain = await signUp("ann");
    const bobMain = await signUp("bob");
    const annWants = (await call("ann", "POST", "/api/collections", { name: "Wants", description: "", completion: "none", finish: "any", kind: "wishlist", sets: [] })).json().id;
    await call("ann", "POST", `/api/collections/${annWants}/cards`, { cardId: "c7", quantity: 1, foil: false });
    await call("bob", "POST", `/api/collections/${bobMain}/cards`, { cardId: "c7", quantity: 3, foil: false });
    await call("bob", "PUT", `/api/collections/${bobMain}/cards`, { items: [{ cardId: "c7", ...copy, quantity: 3, trade: 2 }] });
    await call("ann", "POST", `/api/collections/${annMain}/cards`, { cardId: "c8", quantity: 1, foil: false });
    const matches = (await call("ann", "GET", "/api/trades/matches")).json();
    expect(matches.theyHave).toHaveLength(1);
    expect(matches.theyHave[0]).toMatchObject({ user: { name: "bob" }, cardId: "c7", quantity: 1 });
    expect(matches.theyWant).toEqual([]);
    expect((await call("bob", "GET", "/api/trades/matches")).json().theyWant[0]).toMatchObject({ user: { name: "ann" }, cardId: "c7", collectionId: bobMain });
    const binder = await call("ann", "GET", `/api/trades/binder/${ids.bob}`);
    expect(binder.statusCode).toBe(200);
    expect(binder.json()).toHaveLength(1);
    expect(binder.json()[0]).toMatchObject({ cardId: "c7", quantity: 2 });
    expect(binder.json()[0]).not.toHaveProperty("collectionId");
    expect((await call("ann", "GET", `/api/trades/binder/${ids.ann}`)).statusCode).toBe(404);
    expect((await call("ann", "GET", "/api/trades/binder/99999")).statusCode).toBe(404);

    const { token } = (await call("bob", "POST", "/api/trade-share")).json();
    const page = await app.inject({ method: "GET", url: `/share/${token}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("bob&#39;s trade binder".replace("&#39;", "'"));
    expect(page.body).toContain("Card 07");
    expect(page.body).toContain("2 cards for trade.");
    const replaced = (await call("bob", "POST", "/api/trade-share")).json().token;
    expect(replaced).not.toBe(token);
    expect((await app.inject({ method: "GET", url: `/share/${token}` })).statusCode).toBe(404);
    await call("bob", "DELETE", "/api/trade-share");
    expect((await app.inject({ method: "GET", url: `/share/${replaced}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/trades" })).statusCode).toBe(401);
  });
});
