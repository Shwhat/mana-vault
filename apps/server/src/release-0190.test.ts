// Tests for 0.19.0: receipts that read cards as cards (order date, taxes, pickup, ignored buttons, order number, sets
// from product names, the card guess), packs opened one at a time (Next pack, Move to pack, undo of a group, figures),
// the copies of a collection for Add existing copies..., and tie ids for undo.
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cardExtrasStatement, cardInsertStatement } from "./database.js";
import { findOrderDate, parseReceipt, setOf } from "./receipts.js";
import { server } from "./release-090.test.js";
import { saveSets } from "./sets.js";

const copy = (cardId: string, quantity = 1, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", proxy: false, quantity });

/** Devon's example: an online store order page read as text. */
const ORDER = `Order #Z-301783
Confirmed Oct 30
Buy again
1
1
Picked up Nov 17
Nov 17 at 5:22 PM
Track all your orders with shop
Magic the Gathering: Star Trek: Commander Deck: Landing Party $64.99
My Precious (Showcase) [The Hobbit] $4.55
Near Mint Foil
| My Precious [The Hobbit] $1.80
Near Mint Foil
Subtotal · 3 items $71.34
Pickup Free
Taxes $7.35
Total USD $78.69`;

const SETS = [{ code: "hob", name: "The Hobbit" }, { code: "trk", name: "Star Trek" }, { code: "tlc", name: "Tales of Middle-earth Commander" }, { code: "ltr", name: "Tales of Middle-earth" }];

function seedPrecious(database: DatabaseSync) {
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  for (const [id, number, effects] of [["mp1", "176", ""], ["mp2", "301", "showcase"]] as const) {
    insert.run(id, "o-precious", "My Precious", "{2}", 2, "Legendary Artifact", "", "", "", "{}", "hob", "The Hobbit", number, "rare", `https://img/${id}.jpg`, "2026-08-14", "Artist");
    extras.run("nonfoil,foil", 0, 0, id);
    database.prepare("UPDATE cards SET frame_effects = ? WHERE id = ?").run(effects, id);
  }
  saveSets(database, { data: [{ code: "hob", name: "The Hobbit", set_type: "expansion", released_at: "2026-08-14" }, { code: "trk", name: "Star Trek", set_type: "expansion", released_at: "2026-11-14" }] });
}

describe("reading receipts", () => {
  it("reads the order date, taxes, pickup, the order number, and skips buttons", () => {
    const fields = parseReceipt(ORDER, SETS);
    expect(findOrderDate(ORDER, new Date("2026-11-22T12:00:00Z"))).toBe("2026-10-30");
    expect(fields.tax).toBe(7.35);
    expect(fields.shipping).toBe(0);
    expect(fields.total).toBe(78.69);
    expect(fields.place).toBeNull();
    expect(fields.note).toBe("Order #Z-301783");
    expect(fields.lines.map((line) => line.name)).toEqual(["Magic the Gathering: Star Trek: Commander Deck: Landing Party", "My Precious (Showcase) [The Hobbit]", "My Precious [The Hobbit]"]);
    expect(fields.lines[0]).toMatchObject({ product: "commander_deck", setCode: "trk", cost: 64.99 });
    expect(fields.lines[1]).toMatchObject({ note: "Near Mint Foil", cost: 4.55 });
    expect(fields.lines[2]).toMatchObject({ note: "Near Mint Foil", cost: 1.8 });
  });

  it("0.19.1: joins names that wrap over rows and skips picture text, Subtotal and product names as the place", () => {
    // Devon's phone screenshot of the same order, as text recognition reads it
    const phone = `MAGIC Magic the Gathering: Star $64.99
Trek: Commander Deck:
Landing Party
1
My Precious (Showcase) [The $4.55
Hobbit]
Near Mint Foil
1
My Precious [The Hobbit] $1.80
Near Mint Foil
Subtotal3 items $71.34
Pickup Free
Taxes $7.35
Total USD $78.69`;
    const fields = parseReceipt(phone, SETS);
    expect(fields.place).toBeNull();
    expect(fields.tax).toBe(7.35);
    expect(fields.shipping).toBe(0);
    expect(fields.lines.map((line) => [line.name, line.product, line.setCode, line.cost, line.note])).toEqual([
      ["Magic the Gathering: Star Trek: Commander Deck: Landing Party", "commander_deck", "trk", 64.99, ""],
      ["My Precious (Showcase) [The Hobbit]", "other", "hob", 4.55, "Near Mint Foil"],
      ["My Precious [The Hobbit]", "other", "hob", 1.8, "Near Mint Foil"],
    ]);
  });

  it("finds sets through punctuation and Commander companions", () => {
    expect(setOf("Star Trek: Commander Deck", SETS)).toBe("trk");
    expect(setOf("Tales of Middle-earth Commander Deck: Riders of Rohan", SETS)).toBe("tlc");
    expect(setOf("Tales of Middle-earth Play Booster", SETS)).toBe("ltr");
  });

  it("matches card lines to the printing named by set, version and finish", async () => {
    const { call, database } = await server();
    seedPrecious(database);
    const fields = (await call("POST", "/api/purchases/receipts/parse", { text: ORDER })).json().fields;
    const [deck, showcase, plain] = fields.lines;
    expect(deck.cardLike).toBe(false);
    expect(showcase).toMatchObject({ cardLike: true, card: { cardId: "mp2", setCode: "hob", finish: 1, condition: "NM" } });
    expect(plain).toMatchObject({ cardLike: true, card: { cardId: "mp1", finish: 1 } });
    // a card-like line with no card found still goes to Match cards
    const unknown = (await call("POST", "/api/purchases/receipts/parse", { text: "Nonexistent Card Name Lightly Played $2.00" })).json().fields;
    expect(unknown.lines[0]).toMatchObject({ cardLike: true, card: null });
  });
});

async function boxPurchase(call: Awaited<ReturnType<typeof server>>["call"]) {
  const entry = (await call("POST", "/api/purchases", {
    kind: "purchase", date: "2026-11-01", place: "Local shop", currency: "usd", tax: 0, shipping: 0,
    lines: [{ product: "booster_box", setCode: "hob", quantity: 1, cost: 72, packs: 36 }],
  })).json();
  return { entry, line: entry.lines[0] };
}

describe("packs opened one at a time", () => {
  it("opens packs as separate openings, moves on with Next pack and counts packs left", async () => {
    const { call } = await server();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const { entry, line } = await boxPurchase(call);
    expect((await call("POST", `/api/purchases/${entry.id}/lines/${line.id}/open`, { count: 37, collectionId: main })).statusCode).toBe(400);
    const first = (await call("POST", `/api/purchases/${entry.id}/lines/${line.id}/open`, { count: 3, collectionId: main })).json();
    expect(first.packs.map((pack: { name: string }) => pack.name)).toEqual([
      "Pack 1 of 36, Booster box, HOB (Purchase of Nov 1)", "Pack 2 of 36, Booster box, HOB (Purchase of Nov 1)", "Pack 3 of 36, Booster box, HOB (Purchase of Nov 1)",
    ]);
    let list = (await call("GET", "/api/purchases")).json();
    expect(list.activeOpening).toMatchObject({ id: first.id, groupIndex: 1, groupSize: 3, hasNext: true });
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("is1", 2)] });
    // Next pack: pack 2 receives the next cards
    const next = (await call("POST", `/api/purchases/openings/${first.id}/next`, {})).json();
    expect(next.opening).toMatchObject({ groupIndex: 2, hasNext: true });
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1", 1)] });
    let full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.lines[0]).toMatchObject({ packsOpened: 3, packsLeft: 33, opened: 1 });
    expect(full.openings.map((item: { cards: number; waiting: boolean; active: boolean }) => [item.cards, item.waiting, item.active])).toEqual([[2, false, false], [1, false, true], [0, true, false]]);
    // each pack costs 72 / 36 = 2; the box's packs not yet opened still count at 2 each
    expect(full.openings[0]).toMatchObject({ packCost: 2, valueNow: 2, gain: 0 });
    expect(full.value).toBe(33 * 2 + 2 + 1);
    // Move to pack: the Island moves from pack 1 to pack 3
    const island = full.ties.find((tie: { cardId: string }) => tie.cardId === "is1");
    const moved = (await call("POST", "/api/purchases/ties/move", { ties: [island.id], openingId: full.openings[2].id })).json();
    expect(moved.moved).toEqual([{ id: island.id, from: full.openings[0].id }]);
    full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.openings.map((item: { cards: number }) => item.cards)).toEqual([0, 1, 2]);
    // the last pack has no next pack; Next pack ends it
    await call("POST", `/api/purchases/openings/${next.opening.id}/next`, {});
    const last = (await call("POST", `/api/purchases/openings/${full.openings[2].id}/next`, {})).json();
    expect(last.next).toBeNull();
    list = (await call("GET", "/api/purchases")).json();
    expect(list.activeOpening).toBeNull();
    // undo of Open...: every pack of the group goes, and the packs are sealed again
    expect((await call("DELETE", `/api/purchases/openings/${first.id}`)).statusCode).toBe(200);
    full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.openings).toHaveLength(0);
    expect(full.lines[0]).toMatchObject({ packsOpened: 0, packsLeft: 36, opened: 0 });
  });

  it("lists a collection's copies with free counts, and returns tie ids", async () => {
    const { call } = await server();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("bo1", 3)] });
    const { entry, line } = await boxPurchase(call);
    const opening = (await call("POST", `/api/purchases/${entry.id}/lines/${line.id}/open`, { count: 1, collectionId: main })).json();
    const tied = (await call("POST", `/api/purchases/openings/${opening.id}/ties`, { items: [{ collectionId: main, ...copy("bo1", 2) }] })).json();
    expect(tied.ids).toHaveLength(1);
    const copies = (await call("GET", `/api/purchases/collection-copies?collectionId=${main}`)).json();
    expect(copies.find((item: { cardId: string }) => item.cardId === "bo1")).toMatchObject({ quantity: 3, free: 1, tiedTo: [opening.name] });
    expect((await call("GET", `/api/purchases/collection-copies?collectionId=${main}&q=island`)).json()).toEqual([]);
    expect((await call("GET", "/api/purchases/collection-copies?collectionId=nope")).statusCode).toBe(404);
  });
});
