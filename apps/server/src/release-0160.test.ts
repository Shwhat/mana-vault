// Tests for 0.16.0: purchase history (purchases, tax and shipping spread, openings and tied pulls, sealed values, card
// and product sales, trades, imported prices, figures, undo, CSV and backups version 7).
import { describe, expect, it } from "vitest";
import { server } from "./release-090.test.js";
import { mergePrinting } from "./scryfall-extras.js";

const copy = (cardId: string, quantity = 1, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", proxy: false, quantity });

async function start() {
  const context = await server();
  const collections = (await context.call("GET", "/api/collections")).json() as Array<{ id: string }>;
  return { ...context, main: collections[0]!.id };
}

describe("purchases", () => {
  it("spreads tax and shipping over the lines and ties pulls from an opening", async () => {
    const { call, main } = await start();
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", place: "Local shop", currency: "usd", tax: 3, shipping: 1,
      lines: [{ product: "play_booster", setCode: "hoc", quantity: 6, cost: 30 }, { product: "bundle", setCode: "hob", quantity: 1, cost: 10 }],
    })).json();
    expect(entry.lines.map((line: { full: number }) => line.full)).toEqual([33, 11]);
    expect(entry).toMatchObject({ kind: "purchase", out: 44, value: 44, gain: 0 });
    // open 3 of 6 packs: cards added to the collection are tied to the opening
    const line = entry.lines[0];
    expect((await call("POST", `/api/purchases/${entry.id}/lines/${line.id}/open`, { count: 7, collectionId: main })).statusCode).toBe(400);
    const opening = (await call("POST", `/api/purchases/${entry.id}/lines/${line.id}/open`, { count: 3, collectionId: main })).json();
    expect(opening.name).toBe("3 Play boosters, HOC (Purchase of Nov 1)");
    await call("POST", `/api/collections/${main}/cards/add`, { items: [copy("sa1", 2), copy("is1", 4)] });
    await call("POST", `/api/collections/${main}/cards`, { ...copy("bo1"), foil: true });
    let full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.ties.map((tie: { cardId: string; quantity: number }) => [tie.cardId, tie.quantity])).toEqual([["sa1", 2], ["is1", 4], ["bo1", 1]]);
    // value now: 3 sealed packs at their cost (5.5 each) + the bundle (11) + 2 x 1 + 4 x 1 + 1 foil x 2
    expect(full.value).toBe(16.5 + 11 + 2 + 4 + 2);
    expect(full.openings[0]).toMatchObject({ cards: 7, valuePulled: 8, perPack: 2.67, active: true });
    // lowering a count (undo of an add) unties the cards
    await call("PUT", `/api/collections/${main}/cards`, { items: [{ ...copy("is1", 3) }] });
    full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.ties.find((tie: { cardId: string }) => tie.cardId === "is1").quantity).toBe(3);
    // Done opening: later cards are not tied
    await call("POST", `/api/purchases/openings/${opening.id}/active`, { active: false });
    await call("POST", `/api/collections/${main}/cards`, copy("sa2"));
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().ties).toHaveLength(3);
    // a sealed value is kept by date and replaces the cost
    await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[1].id}/value`, { value: 15, date: "2026-11-10" });
    full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.lines[1]).toMatchObject({ sealedValue: 15, values: [{ date: "2026-11-10", value: 15 }] });
    const list = (await call("GET", "/api/purchases")).json();
    expect(list.summary).toMatchObject({ spent: 44, received: 0 });
    expect(list.summary.gain).toBe(list.summary.value - 44);
    expect(list.places).toEqual(["Local shop"]);
    expect(list.entries[0].description).toBe("6 Play booster, HOC; 1 Bundle, HOB");
  });

  it("single cards go into the collection with their price; card sales remove copies and undo puts them back", async () => {
    const { call, main } = await start();
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-10-01", place: "Online", lines: [{ product: "single", ...copy("sa1", 2), collectionId: main, cost: 8 }],
    })).json();
    expect(entry.ties).toHaveLength(1);
    const items = (await call("GET", `/api/collections/${main}/cards`)).json() as Array<{ id: string; quantity: number; purchase_price: number }>;
    expect(items.find((item) => item.id === "sa1")).toMatchObject({ quantity: 2, purchase_price: 4 });
    expect((await call("POST", "/api/purchases", { kind: "card_sale", date: "2026-11-02", sales: [{ ...copy("sa1", 3), collectionId: main, price: 9 }] })).json().error)
      .toBe("Sauron, the Dark Lord: only 2 of 3 copies are in the collection");
    const sale = (await call("POST", "/api/purchases", { kind: "card_sale", date: "2026-11-02", fees: 1, shipping: 0.5, sales: [{ ...copy("sa1", 1), collectionId: main, price: 9 }] })).json();
    expect(sale).toMatchObject({ in: 7.5, sales: [{ sourceEntryId: entry.id, quantity: 1 }] });
    // the purchase now counts what its pull sold for and the one copy still held
    expect((await call("GET", `/api/purchases/${entry.id}`)).json()).toMatchObject({ out: 8, value: 1, pulledIncome: 9, gain: 2 });
    const removed = (await call("DELETE", `/api/purchases/${sale.id}`)).json();
    expect(((await call("GET", `/api/collections/${main}/cards`)).json() as Array<{ id: string; quantity: number }>).find((item) => item.id === "sa1")?.quantity).toBe(2);
    expect((await call("POST", "/api/purchases/restore", { snapshot: removed.snapshot })).statusCode).toBe(201);
    expect(((await call("GET", `/api/collections/${main}/cards`)).json() as Array<{ id: string; quantity: number }>).find((item) => item.id === "sa1")?.quantity).toBe(1);
  });

  it("product sales take sealed product, and trades record both sides", async () => {
    const { call, main, signUp } = await start();
    const entry = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-09-01", lines: [{ product: "booster_box", setCode: "hoc", quantity: 2, cost: 200 }] })).json();
    expect(entry.lines[0].packs).toBe(36);
    const sealed = (await call("GET", "/api/purchases/sealed")).json();
    expect(sealed).toEqual([{ lineId: entry.lines[0].id, entryId: entry.id, label: "2 Booster box, HOC", date: "2026-09-01", sealed: 2 }]);
    expect((await call("POST", "/api/purchases", { kind: "product_sale", date: "2026-11-01", sales: [{ lineId: entry.lines[0].id, quantity: 3, price: 1 }] })).json().error).toBe("2 Booster box, HOC: only 2 still sealed");
    const sale = (await call("POST", "/api/purchases", { kind: "product_sale", date: "2026-11-01", sales: [{ lineId: entry.lines[0].id, quantity: 1, price: 150 }] })).json();
    expect(sale.in).toBe(150);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json()).toMatchObject({ value: 100, pulledIncome: 150, gain: 50 });

    await call("POST", `/api/collections/${main}/cards`, copy("bo1", 2));
    const trade = (await call("POST", "/api/trades", { name: "Shop trade" })).json();
    await call("PATCH", `/api/trades/${trade.id}`, { lines: [
      { side: "give", ...copy("bo1", 2), price: 3, collectionId: main },
      { side: "get", ...copy("sa2", 1), price: null },
    ] });
    await call("POST", `/api/trades/${trade.id}/complete`, { collectionId: main });
    let list = (await call("GET", "/api/purchases")).json();
    const recorded = list.entries.find((item: { kind: string }) => item.kind === "trade");
    expect(recorded).toMatchObject({ description: "Gave 2 cards, got 1", note: "Shop trade" });
    const full = (await call("GET", `/api/purchases/${recorded.id}`)).json();
    expect(full.sales[0]).toMatchObject({ name: "Lightning Bolt", quantity: 2, price: 6 });
    expect(full.ties[0]).toMatchObject({ cardId: "sa2", quantity: 1 });
    // undo of a completed trade removes the entry
    await call("POST", `/api/trades/${trade.id}/reopen`, {});
    list = (await call("GET", "/api/purchases")).json();
    expect(list.entries.some((item: { kind: string }) => item.kind === "trade")).toBe(false);
    expect((await signUp("bob"))).toBeTruthy();
  });

  it("imported prices become purchases, and Make purchases from imported prices takes the rest", async () => {
    const { call, main } = await start();
    const file = "Name,Set code,Collector number,Quantity,Purchase price,Purchase price currency,Date added\n"
      + "\"Sauron, the Dark Lord\",hoc,36,2,4.00,USD,2026-03-01\nIsland,hob,195,1,0.10,USD,2026-04-01\n";
    const preview = (await call("POST", `/api/collections/${main}/import/preview?format=manabox`, file)).json();
    expect(preview.pricedCopies).toBe(3);
    expect(preview.additions).toBeUndefined();
    const imported = (await call("POST", `/api/collections/${main}/import?format=manabox&purchases=date`, file)).json();
    expect(imported.purchases).toHaveLength(2);
    const list = (await call("GET", "/api/purchases")).json();
    expect(list.entries.map((entry: { date: string; place: string; out: number }) => [entry.date, entry.place, entry.out])).toEqual([["2026-04-01", "ManaBox import", 0.1], ["2026-03-01", "ManaBox import", 8]]);
    // nothing left without a purchase
    expect((await call("GET", "/api/purchases/priced-copies")).json()).toEqual({ priced: 3, untied: 0 });
    await call("POST", `/api/collections/${main}/import?format=manabox`, file);
    expect((await call("GET", "/api/purchases/priced-copies")).json()).toEqual({ priced: 6, untied: 3 });
    expect((await call("POST", "/api/purchases/from-prices", { mode: "one" })).json().created).toHaveLength(1);
    expect((await call("GET", "/api/purchases/priced-copies")).json().untied).toBe(0);
  });

  it("exports CSV, keeps history in backups version 7, and follows merged printings", async () => {
    const { call, main, database } = await start();
    const entry = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-01", place: "Shop, Main St", lines: [{ product: "single", ...copy("sa2"), collectionId: main, cost: 3 }] })).json();
    const entries = (await call("GET", "/api/purchases/export")).body;
    expect(entries.split("\n")[1]).toBe('2026-11-01,Purchase,"Shop, Main St","Sauron, the Dark Lord",,3,0,1,-2,USD');
    expect((await call("GET", "/api/purchases/export?what=lines")).body).toContain("Single cards");
    const backup = (await call("GET", "/api/backup")).body;
    expect(JSON.parse(backup)).toMatchObject({ version: 7, purchases: [{ entry: { id: entry.id } }] });
    await call("DELETE", `/api/purchases/${entry.id}`);
    expect((await call("POST", "/api/backup/restore", backup)).statusCode).toBe(200);
    const restored = (await call("GET", "/api/purchases")).json();
    expect(restored.entries).toHaveLength(1);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().ties).toHaveLength(1);
    mergePrinting(database, "sa2", "sa1");
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().ties[0].cardId).toBe("sa1");
  });

  it("checks what is sent", async () => {
    const { call } = await start();
    expect((await call("POST", "/api/purchases", { kind: "gift", date: "2026-11-01" })).json().error).toBe("Choose Purchase, Card sale, Product sale or Trade");
    expect((await call("POST", "/api/purchases", { kind: "purchase", date: "soon" })).json().error).toBe("Enter the date as a calendar date");
    expect((await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-01", lines: [] })).json().error).toBe("Add at least one product");
    expect((await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-01", lines: [{ product: "other", quantity: 1, cost: 1 }] })).json().error).toBe("Name the product of every Other line");
    expect((await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-01", tax: -1, lines: [{ product: "bundle", quantity: 1, cost: 1 }] })).json().error).toBe("Amounts must be 0 or more");
    expect((await call("GET", "/api/purchases/nope")).statusCode).toBe(404);
  });
});
