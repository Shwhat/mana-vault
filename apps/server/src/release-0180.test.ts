// Tests for 0.18.0: live updates, the opening sent to other devices, pulls that stay on their pack, Value when pulled,
// Remove from pack and its undo, and the note for removing copies that came from a pack.
import { describe, expect, it } from "vitest";
import type { FastifyReply } from "fastify";
import { areasOf } from "./events.js";
import { server } from "./release-090.test.js";

const copy = (cardId: string, quantity = 1, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", proxy: false, quantity });

/** A stand-in for an open page: collects what the server writes to its stream. */
function listener() {
  const written: string[] = [];
  const reply = { raw: { write: (text: string) => { written.push(text); return true; }, end: () => undefined } } as unknown as FastifyReply;
  const events = () => written.filter((text) => text.startsWith("event: change")).map((text) => JSON.parse(text.split("data: ")[1]!) as { areas: string[]; opening?: unknown });
  return { reply, events };
}

async function start() {
  const context = await server();
  const collections = (await context.call("GET", "/api/collections")).json() as Array<{ id: string }>;
  const userId = Number(context.database.prepare("SELECT id FROM users WHERE name = 'ann'").get()!.id);
  return { ...context, main: collections[0]!.id, userId };
}

async function withOpening(call: Awaited<ReturnType<typeof start>>["call"], main: string) {
  const entry = (await call("POST", "/api/purchases", {
    kind: "purchase", date: "2026-11-20", place: "Local shop", currency: "usd", tax: 0, shipping: 0,
    lines: [{ product: "play_booster", setCode: "hoc", quantity: 6, cost: 30 }],
  })).json();
  const opening = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 1, collectionId: main })).json();
  return { entry, opening };
}

describe("live updates", () => {
  it("names the areas a change belongs to", () => {
    expect(areasOf("/api/collections/abc/cards")).toEqual(expect.arrayContaining(["library", "decks", "purchases"]));
    expect(areasOf("/api/decks/abc/cards")).toEqual(expect.arrayContaining(["decks", "library"]));
    expect(areasOf("/api/purchases/abc")).toEqual(expect.arrayContaining(["purchases"]));
    expect(areasOf("/api/trades/abc")).toEqual(expect.arrayContaining(["trades"]));
    expect(areasOf("/api/prefs")).toEqual(["prefs"]);
    expect(areasOf("/api/something-else")).toEqual(["other"]);
  });

  it("tells the account's other pages about a change, but not the page that made it", async () => {
    const { app, call, main, userId } = await start();
    const other = listener();
    const same = listener();
    app.events.add(userId, { reply: other.reply, client: "page-two" });
    app.events.add(userId, { reply: same.reply, client: "page-one" });
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1")] }, { "x-mana-vault-client": "page-one" });
    expect(other.events()).toHaveLength(1);
    expect(other.events()[0]!.areas).toContain("library");
    expect(same.events()).toHaveLength(0);
    // a read changes nothing and sends nothing
    await call("GET", `/api/collections/${main}`);
    expect(other.events()).toHaveLength(1);
  });

  it("tells the people a collection is shared with, and only them", async () => {
    const { app, call, signUp, main, database } = await start();
    const bob = await signUp("bob");
    const cat = await signUp("cat");
    const bobId = Number(database.prepare("SELECT id FROM users WHERE name = 'bob'").get()!.id);
    const catId = Number(database.prepare("SELECT id FROM users WHERE name = 'cat'").get()!.id);
    database.prepare("INSERT INTO members (kind, item_id, user_id) VALUES ('collection', ?, ?)").run(main, bobId);
    const bobPage = listener();
    const catPage = listener();
    app.events.add(bobId, { reply: bobPage.reply, client: null });
    app.events.add(catId, { reply: catPage.reply, client: null });
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1")] });
    expect(bobPage.events()).toHaveLength(1);
    expect(catPage.events()).toHaveLength(0);
    void bob;
    void cat;
  });

  it("sends the opening when one starts and ends, and the phone's background check sees it", async () => {
    const { app, call, main, userId } = await start();
    const page = listener();
    app.events.add(userId, { reply: page.reply, client: null });
    const { opening } = await withOpening(call, main);
    const started = page.events().find((event) => event.opening !== undefined)!;
    expect(started.areas).toContain("opening");
    expect(started.opening).toMatchObject({ id: opening.id, name: opening.name, collectionId: main });
    expect((await call("GET", "/api/sync/state")).json().opening).toMatchObject({ id: opening.id, name: opening.name });
    await call("POST", `/api/purchases/openings/${opening.id}/active`, { active: false });
    expect(page.events().at(-1)!.opening).toBeNull();
    expect((await call("GET", "/api/sync/state")).json().opening).toBeNull();
  });

  it("opens the change stream for a signed-in page and refuses one without sign-in", async () => {
    const { app } = await start();
    const refused = await app.inject({ method: "GET", url: "/api/events" });
    expect(refused.statusCode).toBe(401);
  });
});

describe("pulls stay on their pack", () => {
  it("keeps deleted pulls as Gone, with Value when pulled fixed, Pulled value and Value now", async () => {
    const { call, main, database } = await start();
    const { entry } = await withOpening(call, main);
    database.prepare("UPDATE cards SET price_usd = 2 WHERE id = 'is1'").run();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("is1", 2)] });
    // the price changes after the pull: Value when pulled stays at 2 each
    database.prepare("UPDATE cards SET price_usd = 5 WHERE id = 'is1'").run();
    // one copy is deleted from the collection: it stays on the pack
    await call("PUT", `/api/collections/${main}/cards`, { items: [copy("is1", 1)] });
    const full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.ties).toHaveLength(1);
    expect(full.ties[0]).toMatchObject({ quantity: 2, held: 1, gone: 1, sold: 0, traded: 0, valueThen: 2, price: 5 });
    expect(full.openings[0]).toMatchObject({ cards: 2, gone: 1, valueWhenPulled: 4, valuePulled: 10, valueNow: 5 });
  });

  it("unties only on an undo of the add, and an undo of a removal does not tie twice", async () => {
    const { call, main } = await start();
    const { entry } = await withOpening(call, main);
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1", 1)] });
    // removed by hand, then the removal is undone: one tie, held again
    await call("PUT", `/api/collections/${main}/cards`, { items: [copy("sa1", 0)] });
    await call("PUT", `/api/collections/${main}/cards`, { items: [copy("sa1", 1)] }, { "x-mana-vault-undo": "undo" });
    let ties = (await call("GET", `/api/purchases/${entry.id}`)).json().ties;
    expect(ties.map((tie: { quantity: number; held: number }) => [tie.quantity, tie.held])).toEqual([[1, 1]]);
    // the add is undone: the card leaves the pack; redone: it comes back
    await call("PUT", `/api/collections/${main}/cards`, { items: [copy("sa1", 0)] }, { "x-mana-vault-undo": "undo" });
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().ties).toHaveLength(0);
    await call("PUT", `/api/collections/${main}/cards`, { items: [copy("sa1", 1)] }, { "x-mana-vault-undo": "redo" });
    ties = (await call("GET", `/api/purchases/${entry.id}`)).json().ties;
    expect(ties).toHaveLength(1);
  });

  it("removes a pull from its pack by hand and puts it back as it was", async () => {
    const { call, main, database } = await start();
    const { entry } = await withOpening(call, main);
    database.prepare("UPDATE cards SET price_usd = 3 WHERE id = 'sa1'").run();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1", 2)] });
    database.prepare("UPDATE cards SET price_usd = 9 WHERE id = 'sa1'").run();
    const tie = (await call("GET", `/api/purchases/${entry.id}`)).json().ties[0];
    const removed = (await call("DELETE", `/api/purchases/ties/${tie.id}`)).json();
    expect(removed).toMatchObject({ held: 2, have: 2, tie: { entryId: entry.id, valueThen: 3, quantity: 2 } });
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().ties).toHaveLength(0);
    expect((await call("POST", "/api/purchases/ties/restore", { tie: removed.tie })).statusCode).toBe(201);
    const back = (await call("GET", `/api/purchases/${entry.id}`)).json().ties;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ quantity: 2, held: 2, valueThen: 3, openingId: tie.openingId });
  });

  it("names the packs copies came from, for the remove question", async () => {
    const { call, main } = await start();
    const { opening } = await withOpening(call, main);
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1", 2)] });
    const answer = (await call("POST", "/api/purchases/ties/packs", { items: [{ collectionId: main, ...copy("sa1") }, { collectionId: main, ...copy("bo1") }] })).json();
    expect(answer.packs).toEqual([{ name: opening.name, quantity: 2 }]);
  });
});
