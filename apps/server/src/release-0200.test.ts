// Tests for 0.20.0: named sealed products from MTGJSON (the product list, names on purchase lines, receipts, openings and
// decklists added when a named Commander deck is opened), and custom set symbols for each rarity.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardExtrasStatement, cardInsertStatement } from "./database.js";
import { parseReceipt, productNameOf } from "./receipts.js";
import { DECK_LIST_URL, deckFileUrl, importSealedData, productOfSealed, saveSealedProducts, SET_LIST_URL } from "./sealed.js";
import { saveSets } from "./sets.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
const RARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
const dataUrl = (text: string) => `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`;

const SET_LIST = {
  data: [{
    code: "TRK", name: "Star Trek Commander",
    sealedProduct: [
      { uuid: "p-landing", name: "Star Trek Commander Deck - Landing Party", category: "deck", subtype: "commander", cardCount: 100 },
      { uuid: "p-warp", name: "Star Trek Commander Deck - Warp Speed", category: "deck", subtype: "commander", cardCount: 100 },
      { uuid: "p-beam", name: "Star Trek Beam Me Up Bundle", category: "bundle", subtype: "default" },
      { uuid: "p-box", name: "Star Trek Commander Collector Booster Box", category: "booster_box", subtype: "collector" },
    ],
    decks: [{ name: "Landing Party", code: "TRK", sealedProductUuids: ["p-landing"] }],
  }],
};
const DECK_LIST = { data: [{ code: "TRK", name: "Landing Party", fileName: "LandingParty_TRK", type: "Commander Deck" }] };
const DECK_FILE = {
  data: {
    commander: [{ count: 1, isFoil: true, identifiers: { scryfallId: "kirk" }, setCode: "TRK", number: "1" }],
    mainBoard: [
      { count: 1, identifiers: { scryfallId: "spock" }, setCode: "TRK", number: "2" },
      { count: 10, identifiers: { scryfallId: "" }, setCode: "TRK", number: "3" },
      { count: 2, identifiers: { scryfallId: "unknown" }, setCode: "XXX", number: "9" },
    ],
    sideBoard: [{ count: 2, identifiers: { scryfallId: "spock" }, setCode: "TRK", number: "2" }],
  },
};

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

async function setup() {
  const database = new DatabaseSync(":memory:");
  const requests: string[] = [];
  const fetcher = (async (url: string) => {
    requests.push(url);
    if (url === SET_LIST_URL) return Response.json(SET_LIST);
    if (url === DECK_LIST_URL) return Response.json(DECK_LIST);
    if (url === deckFileUrl("LandingParty_TRK")) return Response.json(DECK_FILE);
    return new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000, fetcher, pictureDownloads: false });
  closers.push(async () => { await app.close(); database.close(); });
  saveSets(database, { data: [{ code: "trk", name: "Star Trek Commander", set_type: "commander", released_at: "2026-11-14" }] });
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  for (const [id, name, number] of [["kirk", "James T. Kirk", "1"], ["spock", "Spock", "2"], ["island", "Island", "3"]] as const) {
    insert.run(id, `o-${id}`, name, "", 0, "Creature", "", "", "", "{}", "trk", "Star Trek Commander", number, "rare", null, "2026-11-14", "Artist");
    extras.run("nonfoil,foil", 0, 0, id);
  }
  await importSealedData(database, fetcher);
  const guard = { "x-mana-vault": "1" };
  const signUp = async (name: string) => {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
    return (method: string, url: string, payload?: unknown) => app.inject({
      method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie }, ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  };
  return { database, requests, call: await signUp("ann"), signUp };
}

describe("product names", () => {
  it("reads the name of a named product from a line", () => {
    expect(productNameOf("Magic the Gathering: Star Trek: Commander Deck: Landing Party", ["Star Trek Commander"])).toBe("Landing Party");
    expect(productNameOf("Star Trek Beam Me Up Bundle", ["Star Trek Commander"])).toBe("Beam Me Up Bundle");
    expect(productNameOf("Bloomburrow Bundle", ["Bloomburrow"])).toBe("");
    expect(productNameOf("Final Fantasy Play Booster Box (30 packs)", ["Final Fantasy"])).toBe("");
    expect(productNameOf("Star Trek Commander Deck - Landing Party", ["Star Trek Commander"])).toBe("Landing Party");
  });

  it("maps MTGJSON categories to products", () => {
    expect(productOfSealed("deck", "commander")).toBe("commander_deck");
    expect(productOfSealed("bundle", "default")).toBe("bundle");
    expect(productOfSealed("booster_pack", "collector")).toBe("collector_booster");
    expect(productOfSealed("box_set", "secret_lair")).toBe("secret_lair");
    expect(productOfSealed("kit", "prerelease")).toBe("prerelease_kit");
    expect(productOfSealed("box_set", "starter_deck", "Foundations Beginner Box")).toBe("beginner_box");
    expect(productOfSealed("box_set", "starter_deck", "Foundations Starter Collection")).toBe("starter_collection");
    expect(productOfSealed("box_set", "starter_deck", "Foundations Beginner Box Case")).toBe("other");
  });

  it("saves the sealed products and offers them by set and product", async () => {
    const { call } = await setup();
    const decks = (await call("GET", "/api/purchases/products?set=trk&product=commander_deck")).json();
    expect(decks.map((item: { name: string; hasDeck: boolean }) => [item.name, item.hasDeck])).toEqual([["Landing Party", true], ["Warp Speed", false]]);
    const bundles = (await call("GET", "/api/purchases/products?set=trk&product=bundle")).json();
    expect(bundles.map((item: { name: string }) => item.name)).toEqual(["Beam Me Up Bundle"]);
  });

  it("imports product contents from SetList and preserves older details when omitted", async () => {
    const { database } = await setup();
    const contents = { card: [{ name: "Spock", set: "trk", number: "2", uuid: "spock-uuid" }] };
    const product = { uuid: "p-beam", name: "Star Trek Beam Me Up Bundle", category: "bundle", subtype: "default", contents, identifiers: { upc: "012345678905" } };
    saveSealedProducts(database, { data: [{ code: "TRK", name: "Star Trek Commander", sealedProduct: [product] }] });
    expect(database.prepare("SELECT contents, upc FROM sealed_products WHERE id = 'p-beam'").get()).toMatchObject({
      contents: JSON.stringify(contents), upc: "012345678905",
    });
    saveSealedProducts(database, { data: [{ code: "TRK", name: "Star Trek Commander", sealedProduct: [{ uuid: "p-beam", name: product.name }] }] });
    expect(database.prepare("SELECT contents, upc FROM sealed_products WHERE id = 'p-beam'").get()).toMatchObject({
      contents: JSON.stringify(contents), upc: "012345678905",
    });
  });

  it("matches a line's name to a sealed product and names the openings with it", async () => {
    const { call } = await setup();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", place: "Local shop", currency: "usd", tax: 0, shipping: 0,
      lines: [
        { product: "bundle", name: "beam me up bundle", setCode: "trk", quantity: 1, cost: 60, packs: 9 },
        { product: "commander_deck", name: "Warp Speed", setCode: "trk", quantity: 1, cost: 50 },
        { product: "commander_deck", name: "My own name", setCode: "trk", quantity: 1, cost: 50 },
      ],
    })).json();
    expect(entry.lines.map((line: { name: string; sealedId: string | null }) => [line.name, line.sealedId])).toEqual([
      ["beam me up bundle", "p-beam"], ["Warp Speed", "p-warp"], ["My own name", null],
    ]);
    expect(entry.description).toContain("Bundle beam me up bundle");
    const pack = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 1, collectionId: main })).json();
    expect(pack.name).toBe("Pack 1 of 9, beam me up bundle, Star Trek Commander (Purchase of Nov 1)");
    const deck = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[1].id}/open`, { count: 1, collectionId: main })).json();
    expect(deck.name).toBe("Warp Speed, Star Trek Commander (Purchase of Nov 1)");
    expect(deck.deck).toBeNull();
  });

  it("previews fixed bundle contents, adds them to a chosen pack and undoes them", async () => {
    const { call, database, signUp } = await setup();
    database.prepare("INSERT INTO mtgjson_records (uuid, card_id, set_code, record) VALUES (?, ?, ?, ?)").run("u-kirk", "kirk", "trk", Buffer.from("record"));
    database.prepare("UPDATE sealed_products SET contents = ? WHERE id = 'p-beam'").run(JSON.stringify({
      card: [{ uuid: "u-kirk", name: "James T. Kirk", set: "trk", number: "1", foil: true }, { uuid: "missing", name: "Missing", set: "xxx", number: "9" }],
      deck: [{ name: "Landing Party", set: "trk" }],
      pack: [{ code: "play", set: "trk" }], variable: [{ configs: [{ card: [{ uuid: "random" }] }] }],
    }));
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", currency: "usd",
      lines: [{ product: "bundle", name: "Beam Me Up Bundle", setCode: "trk", quantity: 1, packs: 9, cost: 60 }],
    })).json();
    const opened = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 2, collectionId: main })).json();
    const url = `/api/purchases/openings/${opened.id}/contents`;
    const preview = (await call("GET", url)).json();
    expect(preview.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "James T. Kirk", quantity: 2, key: expect.objectContaining({ foil: 1 }) }),
      expect.objectContaining({ name: "Island", quantity: 10 }),
      expect.objectContaining({ name: "Spock", quantity: 3 }),
    ]));
    expect(preview.missing.join(" ")).toContain("Missing");
    expect(preview.missing.join(" ")).toContain("2 cards not in the card database");
    expect(preview.notices.join(" ")).toContain("Variable contents");
    expect((await call("POST", url, { fingerprint: "stale" })).statusCode).toBe(400);
    const added = await call("POST", url, { fingerprint: preview.fingerprint });
    expect(added.statusCode).toBe(201);
    expect(added.json().cards).toBe(15);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().openings[0].cards).toBe(15);
    const other = await signUp("bob");
    expect((await other("GET", url)).statusCode).toBe(400);
    expect((await other("POST", `${url}/undo`, { ids: added.json().ids })).statusCode).toBe(404);
    expect((await call("POST", `${url}/undo`, { ids: added.json().ids })).statusCode).toBe(200);
    expect((await call("GET", `/api/collections/${main}/cards`)).json()).toHaveLength(0);
    expect((await call("GET", `/api/purchases/openings/${opened.packs[1].id}/contents`)).statusCode).toBe(400);
  });

  it("resolves nested fixed products but rejects cycles", async () => {
    const { call, database } = await setup();
    database.prepare("UPDATE sealed_products SET contents = ? WHERE id = 'p-beam'").run(JSON.stringify({
      sealed: [{ uuid: "p-warp", name: "Nested", set: "trk", count: 2 }],
    }));
    database.prepare("UPDATE sealed_products SET contents = ? WHERE id = 'p-warp'").run(JSON.stringify({
      card: [{ name: "Spock", set: "trk", number: "2", uuid: "unmatched", etched: true }],
    }));
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", currency: "usd",
      lines: [{ product: "bundle", name: "Beam Me Up Bundle", setCode: "trk", quantity: 1, packs: 9, cost: 60 }],
    })).json();
    const opening = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 1, collectionId: main })).json();
    const url = `/api/purchases/openings/${opening.id}/contents`;
    expect((await call("GET", url)).json().cards[0]).toMatchObject({ name: "Spock", quantity: 2, key: { foil: 2 } });
    database.prepare("UPDATE sealed_products SET contents = ? WHERE id = 'p-warp'").run(JSON.stringify({
      sealed: [{ uuid: "p-beam", name: "Cycle", set: "trk", count: 1 }],
    }));
    expect((await call("GET", url)).json().error).toContain("cycle");
  });

  it("reads the product name from a receipt and matches the sealed product", async () => {
    const { call } = await setup();
    const text = "Magic the Gathering: Star Trek: Commander Deck: Landing Party $64.99\nStar Trek Beam Me Up Bundle $49.99\nTotal $114.98";
    expect(parseReceipt(text, [{ code: "trk", name: "Star Trek Commander" }]).lines.map((line) => line.productName)).toEqual(["Landing Party", "Beam Me Up Bundle"]);
    const fields = (await call("POST", "/api/purchases/receipts/parse", { text })).json().fields;
    expect(fields.lines.map((line: { product: string; productName: string; sealedId: string }) => [line.product, line.productName, line.sealedId])).toEqual([
      ["commander_deck", "Landing Party", "p-landing"], ["bundle", "Beam Me Up Bundle", "p-beam"],
    ]);
  });

  it("adds the decklist of a named Commander deck when it is opened, once for each deck", async () => {
    const { call, requests } = await setup();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", place: "Local shop", currency: "usd", tax: 0, shipping: 0,
      lines: [{ product: "commander_deck", name: "Landing Party", setCode: "trk", quantity: 2, cost: 130 }],
    })).json();
    expect(entry.lines[0]).toMatchObject({ sealedId: "p-landing", hasDeck: true });
    const opened = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 1, collectionId: main })).json();
    expect(opened.name).toBe("Landing Party, Star Trek Commander (Purchase of Nov 1)");
    expect(opened.deck).toEqual({ name: "Landing Party", cards: 12, missing: 2 });
    const cards = (await call("GET", `/api/collections/${main}/cards`)).json();
    const byId = new Map((cards as Array<{ id: string; foil: number; quantity: number }>).map((card) => [`${card.id}:${card.foil}`, card.quantity]));
    expect(byId.get("kirk:1")).toBe(1);
    expect(byId.get("spock:0")).toBe(1);
    expect(byId.get("island:0")).toBe(10);
    const after = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(after.ties.reduce((sum: number, tie: { quantity: number }) => sum + tie.quantity, 0)).toBe(12);
    expect(after.openings[0]).toMatchObject({ active: false, cards: 12 });
    expect(after.openings[0].doneAt).not.toBeNull();
    // undo takes the deck's cards back out
    const second = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 1, collectionId: main })).json();
    expect((await call("GET", `/api/collections/${main}/cards`)).json().find((card: { id: string }) => card.id === "island").quantity).toBe(20);
    expect((await call("DELETE", `/api/purchases/openings/${second.id}?copies=1`)).statusCode).toBe(200);
    expect((await call("GET", `/api/collections/${main}/cards`)).json().find((card: { id: string }) => card.id === "island").quantity).toBe(10);
    // the decklist is downloaded once and kept
    await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 1, collectionId: main });
    expect(requests.filter((url) => url.includes("/decks/")).length).toBe(1);
    // decklist false opens it the old way
    const other = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-02", place: "Local shop", currency: "usd", tax: 0, shipping: 0,
      lines: [{ product: "commander_deck", name: "Landing Party", setCode: "trk", quantity: 1, cost: 65 }],
    })).json();
    const plain = (await call("POST", `/api/purchases/${other.id}/lines/${other.lines[0].id}/open`, { count: 1, collectionId: main, decklist: false })).json();
    expect(plain.deck).toBeNull();
    expect((await call("GET", `/api/purchases/${other.id}`)).json().openings[0].active).toBe(true);
  });

  it("opens an unmatched Commander deck with a selected precon", async () => {
    const { call } = await setup();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", currency: "usd",
      lines: [{ product: "commander_deck", name: "Deck Landing Party", setCode: "trk", quantity: 2, cost: 130 }],
    })).json();
    const url = `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`;
    expect(entry.lines[0].hasDeck).toBe(false);
    expect((await call("POST", url, { count: 2, collectionId: main, precon: { code: "BAD", name: "Landing Party" } })).statusCode).toBe(404);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().openings).toHaveLength(0);
    const opened = await call("POST", url, { count: 2, collectionId: main, precon: { code: "TRK", name: "Landing Party" } });
    expect(opened.statusCode).toBe(201);
    expect(opened.json().deck).toEqual({ name: "Landing Party", cards: 24, missing: 4 });
    expect((await call("GET", `/api/collections/${main}/cards`)).json().find((card: { id: string }) => card.id === "island").quantity).toBe(20);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().openings[0]).toMatchObject({ active: false, cards: 24 });
    expect((await call("DELETE", `/api/purchases/openings/${opened.json().id}?copies=1`)).statusCode).toBe(200);
    expect((await call("GET", `/api/collections/${main}/cards`)).json()).toHaveLength(0);
  });

  it("adds and undoes a selected precon on an existing opening without removing earlier copies", async () => {
    const { call, signUp } = await setup();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", currency: "usd",
      lines: [{ product: "commander_deck", name: "Unmatched", setCode: "trk", quantity: 2, cost: 130 }],
    })).json();
    const opening = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 2, collectionId: main })).json();
    const url = `/api/purchases/openings/${opening.id}/precon`;
    const precon = { code: "TRK", name: "Landing Party" };
    const first = await call("POST", url, { precon });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ name: "Landing Party", cards: 24, missing: 4 });
    const second = await call("POST", url, { precon });
    expect(second.statusCode).toBe(201);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().openings[0].cards).toBe(48);
    const bob = await signUp("bob");
    expect((await bob("POST", url, { precon })).statusCode).toBe(404);
    expect((await call("POST", `${url}/undo`, { ids: [second.json().ids[0], 999999] })).statusCode).toBe(404);
    expect((await call("POST", `${url}/undo`, { ids: second.json().ids })).statusCode).toBe(200);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().openings[0].cards).toBe(24);
    expect((await call("GET", `/api/collections/${main}/cards`)).json().find((card: { id: string }) => card.id === "island").quantity).toBe(20);
  });

  it("rejects unavailable decklists and rolls back additions that exceed the copy limit", async () => {
    const { call, database } = await setup();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", currency: "usd",
      lines: [{ product: "commander_deck", name: "Unmatched", setCode: "trk", quantity: 2, cost: 130 }],
    })).json();
    const open = `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`;
    const precon = { code: "TRK", name: "Landing Party" };

    database.prepare("UPDATE sealed_decks SET file_name = ? WHERE code = ? AND name = ?").run("unavailable", precon.code, precon.name);
    expect((await call("POST", open, { count: 1, collectionId: main, precon })).statusCode).toBe(502);
    database.prepare("UPDATE sealed_decks SET cards = ? WHERE code = ? AND name = ?").run(
      JSON.stringify([{ scryfallId: "unknown", setCode: "xxx", number: "9", count: 1, foil: false, zone: "main" }]), precon.code, precon.name,
    );
    expect((await call("POST", open, { count: 1, collectionId: main, precon })).statusCode).toBe(400);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().openings).toHaveLength(0);

    database.prepare("UPDATE sealed_decks SET file_name = ?, cards = NULL WHERE code = ? AND name = ?").run("LandingParty_TRK", precon.code, precon.name);
    database.prepare("INSERT INTO collection_cards (collection_id, card_id, quantity) VALUES (?, ?, ?)").run(main, "island", 9995);
    expect((await call("POST", open, { count: 1, collectionId: main, precon })).statusCode).toBe(400);
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().openings).toHaveLength(0);
    const opening = (await call("POST", open, { count: 1, collectionId: main })).json();
    const result = await call("POST", `/api/purchases/openings/${opening.id}/precon`, { precon });
    expect(result.statusCode).toBe(400);
    expect(result.json().error).toContain("10,000");
    const after = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(after.openings[0].cards).toBe(0);
    expect(after.ties).toHaveLength(0);
    expect((await call("GET", `/api/collections/${main}/cards`)).json().map((card: { id: string; quantity: number }) => [card.id, card.quantity])).toEqual([["island", 9995]]);
  });
});

describe("rarity set symbols", () => {
  it("saves, serves and removes a symbol for one rarity, with the main symbol for the others", async () => {
    const { call, signUp } = await setup();
    expect((await call("POST", "/api/custom/sets", { code: "owd", name: "Old World", symbol: dataUrl(SVG) })).statusCode).toBe(201);
    let set = (await call("PATCH", "/api/custom/sets/owd", { rarities: { rare: { symbol: dataUrl(RARE_SVG) } } })).json();
    expect(Object.keys(set.rarities)).toEqual(["rare"]);
    expect(set.rarities.rare.type).toBe("image/svg+xml");
    expect((await call("GET", "/api/custom/sets/owd/symbol?rarity=rare")).body).toContain("circle");
    expect((await call("GET", "/api/custom/sets/owd/symbol?rarity=common")).body).toContain("path");
    expect((await call("PATCH", "/api/custom/sets/owd", { rarities: { legendary: { symbol: dataUrl(SVG) } } })).statusCode).toBe(400);
    // a new code keeps the rarity symbols
    set = (await call("PATCH", "/api/custom/sets/owd", { code: "owx" })).json();
    expect(set.rarities.rare.url).toContain("/api/custom/sets/owx/symbol?rarity=rare");
    // another account cannot change it
    const bob = await signUp("bob");
    expect((await bob("PATCH", "/api/custom/sets/owx", { rarities: { rare: { symbol: "" } } })).statusCode).toBe(403);
    // backups keep the rarity symbols
    const backup = (await call("GET", "/api/backup")).json();
    expect(backup.customSets.find((item: { code: string }) => item.code === "owx").rarity_symbols.map((item: { rarity: string }) => item.rarity)).toEqual(["rare"]);
    set = (await call("PATCH", "/api/custom/sets/owx", { rarities: { rare: { symbol: "" } } })).json();
    expect(set.rarities).toEqual({});
    expect((await call("DELETE", "/api/custom/sets/owx")).statusCode).toBe(200);
  });
});
