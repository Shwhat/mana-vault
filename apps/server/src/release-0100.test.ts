// Tests for 0.10.0: deck cards keep a finish, and change printing switches the finish too.
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
  const card = (id: string, set: string, number: string, finishes: string, usd: number, foil: number | null) => {
    insert.run(id, "o-bolt", "Lightning Bolt", "{R}", 1, "Instant", "", "R", "R", JSON.stringify({ modern: "legal" }), set, set.toUpperCase(), number, "common", null, "2020-01-01", "Artist");
    extras.run(finishes, 0, 0, id);
    prices.run(usd, foil, null, usd, foil, null, id);
  };
  card("b1", "m10", "146", "nonfoil,foil", 2, 10);
  card("b2", "lea", "161", "nonfoil", 400, null);
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "ann", password: "correct horse" } });
  const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
  const call = (method: string, url: string, payload?: unknown) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie }, ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  const main = (await call("GET", "/api/collections")).json()[0].id as string;
  const deck = (await call("POST", "/api/decks", { name: "Burn", format: "modern" })).json() as { id: string };
  return { call, main, deckId: deck.id };
}

type Row = { card_id: string; finish: number; quantity: number; missing: number; links: Array<{ foil: number }> };

describe("deck card finishes", () => {
  it("keeps the finish of a card added as foil, prices it as foil, and writes it in deck values", async () => {
    const { call, deckId } = await server();
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "b1", quantity: 2, zone: "main", finish: "foil" });
    const cards = (await call("GET", `/api/decks/${deckId}`)).json().cards as Row[];
    expect(cards[0]).toMatchObject({ card_id: "b1", finish: 1, quantity: 2 });
    const list = (await call("GET", "/api/decks")).json() as Array<{ id: string; value: { usd: number } }>;
    expect(list.find((item) => item.id === deckId)!.value.usd).toBe(20);
    expect((await call("GET", `/api/decks/${deckId}/stats?currency=usd`)).json()).toMatchObject({ value: 20 });
  });

  it("reads *F* and *E* into the deck card's finish in imports and Edit as text", async () => {
    const { call, deckId } = await server();
    await call("POST", `/api/decks/${deckId}/replace`, { text: "2 Lightning Bolt (M10) 146 *F*\n" });
    expect(((await call("GET", `/api/decks/${deckId}`)).json().cards as Row[])[0]).toMatchObject({ finish: 1, quantity: 2 });
    const report = (await call("POST", `/api/decks/${deckId}/replace`, { text: "2 Lightning Bolt (M10) 146\n" })).json();
    expect(report).toMatchObject({ changed: 1, added: 0, removed: 0 });
    expect(((await call("GET", `/api/decks/${deckId}`)).json().cards as Row[])[0]).toMatchObject({ finish: 0 });
  });

  it("switches a deck card to the foil version and links free foil copies", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [
      { cardId: "b1", foil: 0, condition: "NM", language: "en", quantity: 1 }, { cardId: "b1", foil: 1, condition: "NM", language: "en", quantity: 1 },
    ] });
    const added = (await call("POST", `/api/decks/${deckId}/cards`, {
      cardId: "b1", quantity: 1, zone: "main", links: [{ collectionId: main, cardId: "b1", foil: 0, condition: "NM", language: "en", quantity: 1 }],
    })).json() as { entryId: number };
    const changed = await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/printing`, {
      cardId: "b1", finish: 1, links: [{ collectionId: main, cardId: "b1", foil: 1, condition: "NM", language: "en", quantity: 1 }],
    });
    expect(changed.json()).toMatchObject({ status: "changed", linked: 1 });
    const card = ((await call("GET", `/api/decks/${deckId}`)).json().cards as Row[])[0]!;
    expect(card).toMatchObject({ card_id: "b1", finish: 1, missing: 0 });
    expect(card.links.map((link) => link.foil)).toEqual([1]);
    // a printing that is not made in foil cannot be chosen in foil
    expect((await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/printing`, { cardId: "b2", finish: 1 })).statusCode).toBe(400);
    const history = (await call("GET", `/api/decks/${deckId}/history`)).json() as Array<{ change: string }>;
    expect(history.some((line) => line.change.endsWith("(M10) 146 foil"))).toBe(true);
  });

  it("switches collection copies to the foil version, keeping deck links", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "b1", foil: 0, condition: "NM", language: "en", quantity: 2 }] });
    await call("POST", `/api/decks/${deckId}/cards`, {
      cardId: "b1", quantity: 1, zone: "main", links: [{ collectionId: main, cardId: "b1", foil: 0, condition: "NM", language: "en", quantity: 1 }],
    });
    const result = (await call("POST", `/api/collections/${main}/printing`, { cardId: "b1", foil: 0, condition: "NM", language: "en", to: "b1", toFinish: 1 })).json();
    expect(result).toMatchObject({ status: "changed", moved: 2, finish: 1 });
    const rows = (await call("GET", `/api/collections/${main}/cards`)).json() as Array<{ id: string; foil: number; quantity: number }>;
    expect(rows.map((row) => [row.id, row.foil, row.quantity])).toEqual([["b1", 1, 2]]);
    const card = ((await call("GET", `/api/decks/${deckId}`)).json().cards as Row[])[0]!;
    expect(card.missing).toBe(0);
    expect(card.links.map((link) => link.foil)).toEqual([1]);
    expect((await call("POST", `/api/collections/${main}/printing`, { cardId: "b1", foil: 1, condition: "NM", language: "en", to: "b2", toFinish: 1 })).statusCode).toBe(400);
  });
});
