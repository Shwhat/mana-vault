// Tests for 0.17.0 purchase history changes: places shared on the server, shipping paid by the buyer, trade entries
// with Gave, Got, Net and original cost, ties that follow moved copies, and receipts.
import { describe, expect, it } from "vitest";
import { server } from "./release-090.test.js";
import { findDate, parseReceipt, productOf, setOf } from "./receipts.js";

const copy = (cardId: string, quantity = 1, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", proxy: false, quantity });

async function start() {
  const context = await server();
  const collections = (await context.call("GET", "/api/collections")).json() as Array<{ id: string }>;
  return { ...context, main: collections[0]!.id };
}

describe("places", () => {
  it("are shared, renamed everywhere, merged and deleted by admins, with undo", async () => {
    const { call, signUp } = await start();
    const first = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-01", place: "Card  Shop", lines: [{ product: "play_booster", quantity: 1, cost: 5 }] })).json();
    // the same name with other capitals and spaces is the same place
    const second = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-02", place: "card shop", lines: [{ product: "play_booster", quantity: 1, cost: 5 }] })).json();
    expect(second.placeId).toBe(first.placeId);
    expect(second.place).toBe("Card Shop");
    // another account sees the place and can fix its spelling
    const bob = await signUp("bob");
    const places = (await bob("GET", "/api/places")).json();
    expect(places).toEqual([expect.objectContaining({ id: first.placeId, name: "Card Shop", uses: 2, kind: "store" })]);
    const renamed = (await bob("PATCH", `/api/places/${first.placeId}`, { name: "The Card Shop", kind: "store", note: "Main St" })).json();
    expect(renamed.before).toEqual({ name: "Card Shop", kind: "store", note: "" });
    expect((await call("GET", `/api/purchases/${first.id}`)).json().place).toBe("The Card Shop");
    // a name already in the list is refused
    await call("POST", "/api/places", { name: "Online Store", kind: "website" });
    expect((await call("PATCH", `/api/places/${first.placeId}`, { name: "online store" })).statusCode).toBe(409);
    // only admins merge or delete; ann is the first account and the admin
    const online = (await call("GET", "/api/places")).json().find((place: { name: string }) => place.name === "Online Store");
    expect((await bob("POST", `/api/places/${first.placeId}/merge`, { into: online.id })).statusCode).toBe(403);
    expect((await call("DELETE", `/api/places/${first.placeId}`)).statusCode).toBe(409);
    const merged = (await call("POST", `/api/places/${first.placeId}/merge`, { into: online.id })).json();
    expect(merged.entryIds.sort()).toEqual([first.id, second.id].sort());
    expect((await call("GET", `/api/purchases/${first.id}`)).json()).toMatchObject({ place: "Online Store", placeId: online.id });
    // undo of the merge puts the place and its entries back
    expect((await call("POST", "/api/places/restore", merged)).statusCode).toBe(201);
    expect((await call("GET", `/api/purchases/${second.id}`)).json()).toMatchObject({ place: "The Card Shop", placeId: first.placeId });
    const unused = (await call("POST", "/api/places", { name: "Friend" })).json();
    expect((await call("DELETE", `/api/places/${unused.id}`)).json().place.name).toBe("Friend");
    // a place can be picked by id
    const third = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-03", placeId: online.id, lines: [{ product: "bundle", quantity: 1, cost: 40 }] })).json();
    expect(third.place).toBe("Online Store");
  });
});

describe("sales and trades", () => {
  it("shipping paid by the buyer never counts as money in or out; fees always lower it", async () => {
    const { call, main } = await start();
    await call("POST", `/api/collections/${main}/cards`, copy("bo1", 2));
    const mine = (await call("POST", "/api/purchases", { kind: "card_sale", date: "2026-11-05", fees: 1, shipping: 2, sales: [{ ...copy("bo1"), collectionId: main, price: 10 }] })).json();
    expect(mine).toMatchObject({ in: 7, shippingBy: "me" });
    const buyer = (await call("POST", "/api/purchases", { kind: "card_sale", date: "2026-11-05", fees: 1, shipping: 2, shippingBy: "buyer", sales: [{ ...copy("bo1"), collectionId: main, price: 10 }] })).json();
    expect(buyer).toMatchObject({ in: 9, shippingBy: "buyer" });
    const changed = (await call("PATCH", `/api/purchases/${buyer.id}`, { shippingBy: "me" })).json();
    expect(changed.in).toBe(7);
  });

  it("trade entries show Gave, Got, Net and what the given cards first cost", async () => {
    const { call, main } = await start();
    // a Lightning Bolt bought for 2 plus its share of 1 shipping (3 in all), then traded away
    const bought = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-10-01", place: "Shop", shipping: 1, lines: [
      { product: "single", ...copy("bo1", 1), collectionId: main, cost: 2 },
    ] })).json();
    await call("POST", `/api/collections/${main}/cards`, copy("is1", 1));
    const trade = (await call("POST", "/api/trades", { name: "Friday trade" })).json();
    await call("PATCH", `/api/trades/${trade.id}`, { lines: [
      { side: "give", ...copy("bo1", 1), price: 4.52, collectionId: main },
      { side: "give", ...copy("is1", 1), price: 0.5, collectionId: main },
      { side: "get", ...copy("sa2", 1), price: 16.07 },
    ] });
    await call("POST", `/api/trades/${trade.id}/complete`, { collectionId: main });
    const list = (await call("GET", "/api/purchases")).json();
    const entry = (await call("GET", `/api/purchases/${list.entries.find((item: { kind: string }) => item.kind === "trade").id}`)).json();
    expect(entry.trade).toMatchObject({ gave: 5.02, got: 16.07, net: 11.05, originalCost: 3, noCostValue: 0.5, noCost: ["Island"] });
    const bolt = entry.sales.find((sale: { name: string }) => sale.name === "Lightning Bolt");
    expect(entry.trade.given.find((row: { saleId: string }) => row.saleId === bolt.id)).toMatchObject({ cost: 3, from: { entryId: bought.id, date: "2026-10-01" } });
    expect(entry.ties[0]).toMatchObject({ cardId: "sa2", tradePrice: 16.07 });
    // gain: what the card got is worth now, less the original cost (the trade value where no cost is known)
    expect(entry.gain).toBe(Math.round((entry.value - 3 - 0.5) * 100) / 100);
  });
});

describe("ties follow copies", () => {
  it("a tied copy keeps counting when it moves to another collection or changes printing", async () => {
    const { call, main } = await start();
    const other = (await call("POST", "/api/collections", { name: "Binder" })).json();
    const bought = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-10-01", lines: [{ product: "single", ...copy("is1", 2), collectionId: main, cost: 4 }] })).json();
    const before = (await call("GET", `/api/purchases/${bought.id}`)).json();
    expect(before.ties[0]).toMatchObject({ held: 2 });
    // one more untied copy: it moves first
    await call("POST", `/api/collections/${main}/cards`, copy("is1", 1));
    await call("POST", `/api/collections/${main}/move`, { to: other.id, items: [copy("is1", 1)] });
    let after = (await call("GET", `/api/purchases/${bought.id}`)).json();
    expect(after.ties.map((tie: { collectionId: string; held: number }) => [tie.collectionId, tie.held])).toEqual([[main, 2]]);
    await call("POST", `/api/collections/${main}/move`, { to: other.id, items: [copy("is1", 2)] });
    after = (await call("GET", `/api/purchases/${bought.id}`)).json();
    expect(after.ties.reduce((sum: number, tie: { held: number }) => sum + tie.held, 0)).toBe(2);
    expect(after.ties.every((tie: { collectionId: string }) => tie.collectionId === other.id)).toBe(true);
    expect(after.value).toBe(before.value);
    // change of printing: the tie follows the copies
    await call("POST", `/api/collections/${other.id}/printing`, { ...copy("is1"), to: "is2", quantity: 3 });
    after = (await call("GET", `/api/purchases/${bought.id}`)).json();
    expect(after.ties.every((tie: { cardId: string }) => tie.cardId === "is2")).toBe(true);
    expect(after.ties.reduce((sum: number, tie: { held: number }) => sum + tie.held, 0)).toBe(2);
  });
});

describe("receipts", () => {
  it("reads dates, products, sets, quantities, tax, shipping and the total from receipt text", () => {
    expect(findDate("Order placed November 21, 2026")).toBe("2026-11-21");
    expect(findDate("Date: 11/20/26 10:14 AM")).toBe("2026-11-20");
    expect(findDate("21 Nov 2026")).toBe("2026-11-21");
    expect(productOf("Foundations Collector Booster")).toBe("collector_booster");
    expect(productOf("Bloomburrow Bundle")).toBe("bundle");
    expect(setOf("The Hobbit Play Booster", [{ code: "hob", name: "The Hobbit" }, { code: "hb", name: "Hob" }])).toBe("hob");
    const fields = parseReceipt([
      "Dragon's Lair Games",
      "123 Main Street",
      "Date: 11/20/2026",
      "2 x The Hobbit Play Booster    11.98",
      "The Hobbit Bundle  49.99",
      "Subtotal 61.97",
      "Sales Tax 6.20",
      "Shipping 5.00",
      "Total 73.17",
      "Visa ending 1234  73.17",
    ].join("\n"), [{ code: "hob", name: "The Hobbit" }]);
    expect(fields).toMatchObject({ date: "2026-11-20", place: "Dragon's Lair Games", tax: 6.2, shipping: 5, total: 73.17, linesTotal: 61.97 });
    expect(fields.lines).toEqual([
      expect.objectContaining({ product: "play_booster", setCode: "hob", quantity: 2, cost: 11.98 }),
      expect.objectContaining({ product: "bundle", setCode: "hob", quantity: 1, cost: 49.99 }),
    ]);
  });

  it("keeps a receipt with an entry, replaces it with undo data, and leaves with the entry", async () => {
    const { call, app } = await start();
    const entry = (await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-01", lines: [{ product: "play_booster", quantity: 1, cost: 5 }] })).json();
    const login = await app.inject({ method: "POST", url: "/api/login", headers: { "x-mana-vault": "1" }, payload: { name: "ann", password: "correct horse" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const put = (body: Buffer, type: string) => app.inject({ method: "PUT", url: `/api/purchases/${entry.id}/receipt`, headers: { "x-mana-vault": "1", cookie, "content-type": type, "x-file-name": "receipt.png" }, payload: body });
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    expect((await put(png, "image/png")).json()).toEqual({ before: null });
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().receipt).toMatchObject({ name: "receipt.png", type: "image/png", bytes: 8 });
    const shown = await call("GET", `/api/purchases/${entry.id}/receipt`);
    expect(shown.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(shown.rawPayload, png)).toBe(0);
    const replaced = (await put(Buffer.from("%PDF-1.4"), "application/pdf")).json();
    expect(replaced.before).toMatchObject({ name: "receipt.png", type: "image/png", data: png.toString("base64") });
    expect((await put(Buffer.from("x"), "text/html")).statusCode).toBe(415);
    // a deleted entry takes its receipt, and undo brings it back
    const removed = (await call("DELETE", `/api/purchases/${entry.id}`)).json();
    expect(removed.snapshot.purchase_receipts).toHaveLength(1);
    await call("POST", "/api/purchases/restore", { snapshot: removed.snapshot });
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().receipt).toMatchObject({ type: "application/pdf" });
    // text a phone recognized is read the same way
    expect((await call("POST", "/api/purchases/receipts/parse", { text: "Shop\nTotal 5.00" })).json().fields.total).toBe(5);
  });
});

describe("app updates from the server", () => {
  it("offers the app for the server's version, fetched once from its GitHub release", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { buildApp } = await import("./app.js");
    const folder = mkdtempSync(join(tmpdir(), "mv-apk-"));
    const asked: string[] = [];
    const apk = Buffer.concat([Buffer.from("PK"), Buffer.alloc(2048, 1)]);
    const fetcher = async (url: string) => {
      asked.push(url);
      return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => apk.buffer.slice(apk.byteOffset, apk.byteOffset + apk.length) };
    };
    const database = new DatabaseSync(":memory:");
    const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, version: "9.8.7", databasePath: join(folder, "mv.sqlite"), fetcher, pictureDownloads: false });
    try {
      // anyone may ask, like the public releases page
      expect((await app.inject({ method: "GET", url: "/api/app/latest" })).json()).toEqual({ version: "9.8.7", apk: null, url: "/api/app/apk" });
      const first = await app.inject({ method: "GET", url: "/api/app/apk" });
      expect(first.statusCode).toBe(200);
      expect(first.headers["content-type"]).toBe("application/vnd.android.package-archive");
      expect(first.rawPayload.length).toBe(apk.length);
      await app.inject({ method: "GET", url: "/api/app/apk" });
      expect(asked).toEqual(["https://github.com/Shwhat/mana-vault/releases/download/v9.8.7/mana-vault-9.8.7.apk"]);
      expect((await app.inject({ method: "GET", url: "/api/app/latest" })).json().apk).toEqual({ bytes: apk.length });
    } finally {
      await app.close();
      database.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("upgrades from 0.16", () => {
  it("joins pictures kept by several accounts and turns entry places into places", async () => {
    const { database, call } = await start();
    const { shareArtLibrary } = await import("./extras.js");
    const { initializePurchases } = await import("./purchases.js");
    const bob = Number(database.prepare("INSERT INTO users (name, salt, hash, iterations) VALUES ('bob2', 'x', 'x', 1) RETURNING id").get()!.id);
    const ann = Number(database.prepare("SELECT id FROM users WHERE name = 'ann'").get()!.id);
    database.prepare("DELETE FROM catalog_metadata WHERE key = 'art_library_shared'").run();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    database.prepare("INSERT INTO art_library (id, user_id, name, bytes, type, created_at) VALUES ('a1', ?, 'First', ?, 'image/png', '2026-01-01')").run(ann, bytes);
    database.prepare("INSERT INTO art_library (id, user_id, name, bytes, type, created_at) VALUES ('a2', ?, 'Second', ?, 'image/png', '2026-02-01')").run(bob, bytes);
    shareArtLibrary(database);
    expect(database.prepare("SELECT id FROM art_library").all().map((row) => row.id)).toEqual(["a1"]);
    // an entry from before places: its place name becomes a place
    await call("POST", "/api/purchases", { kind: "purchase", date: "2026-11-01", lines: [{ product: "bundle", quantity: 1, cost: 40 }] });
    database.prepare("UPDATE purchase_entries SET place = 'Old  Shop', place_id = NULL").run();
    database.prepare("DELETE FROM places").run();
    initializePurchases(database);
    expect(database.prepare("SELECT p.name FROM purchase_entries e JOIN places p ON p.id = e.place_id").all().map((row) => row.name)).toEqual(["Old Shop"]);
  });
});
