// Tests for 0.11.0: exact-printing links from Edit as text and imports, Link owned copies, deck cards that follow their
// copies, Upgrade wanted, part of a stack changing printing, and decks that keep their version.
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
  const card = (id: string, set: string, number: string, finishes: string, released: string) => {
    insert.run(id, "o-bolt", "Lightning Bolt", "{R}", 1, "Instant", "", "R", "R", JSON.stringify({ modern: "legal" }), set, set.toUpperCase(), number, "common", null, released, "Artist");
    extras.run(finishes, 0, 0, id);
    prices.run(2, 10, null, 2, 10, null, id);
  };
  card("b1", "m10", "146", "nonfoil,foil", "2009-07-17");
  card("b2", "lea", "161", "nonfoil", "1993-08-05");
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "ann", password: "correct horse" } });
  const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
  const call = (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie, ...headers }, ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  const main = (await call("GET", "/api/collections")).json()[0].id as string;
  const deck = (await call("POST", "/api/decks", { name: "Burn", format: "modern" })).json() as { id: string };
  return { call, main, deckId: deck.id };
}

const copy = (cardId: string, quantity: number, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", quantity });
type Row = {
  entry_id: number; card_id: string; finish: number; quantity: number; missing: number; links: Array<{ foil: number; quantity: number }>;
  owned: Array<{ cardId: string; foil: number; free: number }>; want_card_id: string | null; want_finish: number;
};
const cardsOf = async (call: Awaited<ReturnType<typeof server>>["call"], deckId: string) => (await call("GET", `/api/decks/${deckId}`)).json().cards as Row[];

describe("card tracking between decks and collections", () => {
  it("links Edit as text lines with a set and number to copies of exactly that printing and finish", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b1", 2), copy("b2", 1)] });
    const report = (await call("POST", `/api/decks/${deckId}/replace`, { text: "2 Lightning Bolt (M10) 146\n1 Lightning Bolt (M10) 146 *F*\n" })).json();
    expect(report).toMatchObject({ added: 2, linked: 2 });
    const cards = await cardsOf(call, deckId);
    // the regular cards are filled; the foil card is missing (no foil copy), and the LEA copy is offered as another version
    const regular = cards.find((card) => card.finish === 0)!;
    const foil = cards.find((card) => card.finish === 1)!;
    expect(regular).toMatchObject({ quantity: 2, missing: 0 });
    expect(foil).toMatchObject({ quantity: 1, missing: 1 });
    expect(foil.owned.map((item) => item.cardId)).toEqual(["b2"]);
  });

  it("leaves lines without a set and number missing until a link is made, and Link owned copies fills exact matches", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b1", 1)] });
    const report = (await call("POST", `/api/decks/${deckId}/replace`, { text: "1 Lightning Bolt\n" })).json();
    expect(report.linked ?? 0).toBe(0);
    const [card] = await cardsOf(call, deckId);
    expect(card).toMatchObject({ card_id: "b1", missing: 1 });
    expect(card!.owned[0]).toMatchObject({ cardId: "b1", foil: 0, free: 1 });
    expect((await call("POST", `/api/decks/${deckId}/link-owned`)).json()).toMatchObject({ linked: 1 });
    expect((await cardsOf(call, deckId))[0]).toMatchObject({ missing: 0 });
  });

  it("links decklist import lines that name a printing", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b2", 1)] });
    const result = (await call("POST", `/api/decks/${deckId}/import`, "1 Lightning Bolt (LEA) 161\n1 Lightning Bolt\n", { "content-type": "text/plain" })).json();
    expect(result).toMatchObject({ linked: 1 });
  });

  it("moves a deck card to the finish of the copy linked to it, and keeps regular and foil cards apart", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b1", 1, 1)] });
    const added = (await call("POST", `/api/decks/${deckId}/cards`, { cardId: "b1", quantity: 2, zone: "main" })).json() as { entryId: number };
    await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/links`, { links: [{ ...copy("b1", 1, 1), collectionId: main }] });
    const cards = await cardsOf(call, deckId);
    expect(cards.map((card) => [card.finish, card.quantity, card.missing]).sort()).toEqual([[0, 1, 1], [1, 1, 0]]);
  });

  it("changes part of a stack to another finish without removing the rest", async () => {
    const { call, deckId } = await server();
    const added = (await call("POST", `/api/decks/${deckId}/cards`, { cardId: "b1", quantity: 2, zone: "main" })).json() as { entryId: number };
    expect((await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/printing`, { cardId: "b1", finish: 1, quantity: 1 })).json()).toMatchObject({ status: "changed" });
    const cards = await cardsOf(call, deckId);
    expect(cards.map((card) => [card.finish, card.quantity]).sort()).toEqual([[0, 1], [1, 1]]);
    // and in a collection: one of two copies becomes foil
    const { main } = await server().then(async (other) => { await other.call("POST", `/api/collections/${other.main}/cards/add`, { items: [copy("b1", 2)] }); return other; })
      .then(async (other) => {
        const changed = (await other.call("POST", `/api/collections/${other.main}/printing`, { ...copy("b1", 2), to: "b1", toFinish: 1, quantity: 1 })).json();
        expect(changed).toMatchObject({ moved: 1 });
        const rows = (await other.call("GET", `/api/collections/${other.main}/cards`)).json() as Array<{ foil: number; quantity: number }>;
        expect(rows.map((row) => [row.foil, row.quantity]).sort()).toEqual([[0, 1], [1, 1]]);
        return other;
      });
    expect(main).toBeTruthy();
  });

  it("keeps the deck's version when a linked copy changes printing and the person says no", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b1", 1)] });
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "b1", quantity: 1, zone: "main", links: [{ ...copy("b1", 1), collectionId: main }] });
    await call("POST", `/api/collections/${main}/printing`, { ...copy("b1", 1), to: "b2", decks: "keep" });
    const [card] = await cardsOf(call, deckId);
    expect(card).toMatchObject({ card_id: "b1", missing: 1, links: [] });
    // the copy now in LEA is offered as another version, and switching moves the deck card and links it
    expect(card!.owned[0]).toMatchObject({ cardId: "b2" });
    await call("PUT", `/api/decks/${deckId}/entries/${card!.entry_id}/printing`, { cardId: "b2", links: [{ ...copy("b2", 1), collectionId: main }] });
    expect((await cardsOf(call, deckId))[0]).toMatchObject({ card_id: "b2", missing: 0 });
    // without "keep" the deck follows the copy
    await call("POST", `/api/collections/${main}/printing`, { ...copy("b2", 1), to: "b1" });
    expect((await cardsOf(call, deckId))[0]).toMatchObject({ card_id: "b1", missing: 0 });
  });

  it("marks a card Upgrade wanted, counts it as owned, and clears the mark when the wanted version is linked", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b2", 1)] });
    const added = (await call("POST", `/api/decks/${deckId}/cards`, {
      cardId: "b2", quantity: 1, zone: "main", links: [{ ...copy("b2", 1), collectionId: main }],
    })).json() as { entryId: number };
    expect((await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/upgrade`, { cardId: "b2", finish: 0 })).statusCode).toBe(400);
    expect((await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/upgrade`, { cardId: "b1", finish: 1 })).statusCode).toBe(200);
    let [card] = await cardsOf(call, deckId);
    expect(card).toMatchObject({ want_card_id: "b1", want_finish: 1, missing: 0 });
    expect((await call("GET", `/api/decks/${deckId}/ownership?currency=usd`)).json()).toMatchObject({ missing: 0 });
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b1", 1, 1)] });
    await call("PUT", `/api/decks/${deckId}/entries/${added.entryId}/links`, { links: [{ ...copy("b1", 1, 1), collectionId: main }] });
    [card] = await cardsOf(call, deckId);
    expect(card).toMatchObject({ card_id: "b1", finish: 1, want_card_id: null });
    const history = (await call("GET", `/api/decks/${deckId}/history`)).json() as Array<{ change: string }>;
    expect(history.some((line) => line.change.includes("marked Upgrade wanted: (M10) 146 foil"))).toBe(true);
  });

  it("keeps finishes, upgrade marks and links in backups", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b1", 1, 1)] });
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "b1", quantity: 1, zone: "main" });
    const foil = (await call("POST", `/api/decks/${deckId}/cards`, {
      cardId: "b1", quantity: 1, zone: "main", finish: 1, links: [{ ...copy("b1", 1, 1), collectionId: main }],
    })).json() as { entryId: number };
    await call("PUT", `/api/decks/${deckId}/entries/${foil.entryId}/upgrade`, { cardId: "b2", finish: 0 });
    const backup = (await call("GET", "/api/backup")).body;
    const restored = await server();
    expect((await restored.call("POST", "/api/backup/restore", backup, { "content-type": "application/vnd.mana-vault.backup+json" })).statusCode).toBe(200);
    const decks = (await restored.call("GET", "/api/decks")).json() as Array<{ id: string; name: string }>;
    const cards = await cardsOf(restored.call, decks.find((deck) => deck.name === "Burn" && deck.id !== restored.deckId)!.id);
    expect(cards.map((card) => [card.finish, card.missing, card.want_card_id]).sort()).toEqual([[0, 1, null], [1, 0, "b2"]]);
  });
});

// 0.17.0: a card whose only copy fills another deck names that deck, and Move to this deck takes the copy over
describe("copies in other decks", () => {
  it("lists the other deck and moves the copy, with the way back for undo", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("b1", 1)] });
    await call("POST", `/api/decks/${deckId}/replace`, { text: "1 Lightning Bolt (M10) 146\n" });
    const other = (await call("POST", "/api/decks", { name: "Second", format: "modern" })).json() as { id: string };
    await call("POST", `/api/decks/${other.id}/replace`, { text: "1 Lightning Bolt (M10) 146\n" });
    const [card] = (await call("GET", `/api/decks/${other.id}`)).json().cards as Array<{ entry_id: number; missing: number; owned: unknown[]; inDecks: Array<{ linkId: number; deckName: string }> }>;
    expect(card).toMatchObject({ missing: 1, owned: [] });
    expect(card!.inDecks).toEqual([expect.objectContaining({ deckName: "Burn", quantity: 1 })]);
    const moved = (await call("POST", `/api/decks/${other.id}/entries/${card!.entry_id}/take`, { linkId: card!.inDecks[0]!.linkId })).json();
    expect(moved).toMatchObject({ moved: 1, from: { deckId, deckName: "Burn" } });
    expect((await call("GET", `/api/decks/${other.id}`)).json().cards[0]).toMatchObject({ missing: 0 });
    expect((await cardsOf(call, deckId))[0]).toMatchObject({ missing: 1 });
    // undo: the copy goes back
    await call("POST", `/api/decks/${moved.from.deckId}/entries/${moved.from.entryId}/take`, { linkId: moved.linkId, quantity: moved.moved });
    expect((await cardsOf(call, deckId))[0]).toMatchObject({ missing: 0 });
  });
});
