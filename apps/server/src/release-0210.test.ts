// Tests for 0.21.0: MTGJSON data (records, store prices and their history, the main price source, booster contents,
// sealed product contents, SKUs, catalogs), precons, barcodes, the new search syntax, import matching by store ids,
// expected value, the pull check and Change collection on a pack.
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { openPacks, packValue, pullsAllowed } from "./boosters.js";
import { cardExtrasStatement, cardInsertStatement } from "./database.js";
import {
  ALL_PRICES_URL, ALL_PRINTINGS_URL, CARD_TYPES_URL, importMtgjson, importPriceHistory, KEYWORDS_URL, mtgjsonParts, PRICES_TODAY_URL,
  sourceChain, SKUS_URL, storeDays,
} from "./mtgjson.js";
import { DECK_LIST_URL, deckFileUrl, SET_LIST_URL } from "./sealed.js";
import { saveSets } from "./sets.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

const card = (uuid: string, scryfallId: string, extra: Record<string, unknown> = {}) => ({ uuid, name: uuid, ...extra, identifiers: { scryfallId, ...(extra.identifiers as object ?? {}) } });

const ALL_PRINTINGS = {
  meta: {},
  data: {
    TST: {
      code: "TST", name: "Test Set",
      cards: [
        card("u-hero", "hero", {
          originalText: "Hero text as printed.", originalType: "Legendary Creature - Hero", isReprint: true,
          leadershipSkills: { commander: true, oathbreaker: false, brawl: true },
          identifiers: { cardKingdomId: "ck-1", cardKingdomFoilId: "ck-1f", tcgplayerProductId: "tcg-1" },
          sourceProducts: { nonfoil: ["p-play", "p-deck"], foil: ["p-collector"] },
        }),
        card("u-common", "common", { isStarter: true, sourceProducts: { nonfoil: ["p-play"] } }),
        card("u-rare", "rare", { sourceProducts: { nonfoil: ["p-play"], foil: ["p-play"] } }),
        card("u-missing", "not-in-database"),
      ],
      tokens: [],
      booster: {
        play: {
          boosters: [{ contents: { commons: 1, rares: 1 }, weight: 3 }, { contents: { commons: 1, foils: 1 }, weight: 1 }],
          boostersTotalWeight: 4,
          sheets: {
            commons: { cards: { "u-common": 1 }, foil: false, totalWeight: 1 },
            rares: { cards: { "u-rare": 1, "u-hero": 1 }, foil: false, totalWeight: 2 },
            foils: { cards: { "u-rare": 1 }, foil: true, totalWeight: 1 },
          },
        },
      },
      sealedProduct: [
        { uuid: "p-play", name: "Test Set Play Booster", category: "booster_pack", subtype: "play", identifiers: { upc: "012345678905" }, contents: { pack: [{ code: "play", set: "tst" }] } },
        { uuid: "p-collector", name: "Test Set Collector Booster", category: "booster_pack", subtype: "collector", identifiers: {} },
      ],
    },
  },
};

const prices = (days: Record<string, number>) => days;
const ALL_PRICES = {
  data: {
    "u-hero": {
      paper: {
        tcgplayer: { currency: "USD", retail: { normal: prices({ "2026-11-01": 10, "2026-11-02": 10, "2026-11-03": 12 }) }, buylist: { normal: prices({ "2026-11-03": 6 }) } },
        cardkingdom: { currency: "USD", retail: { normal: prices({ "2026-11-03": 11 }), foil: prices({ "2026-11-03": 30 }) }, buylist: { normal: prices({ "2026-11-03": 7 }) } },
        cardmarket: { currency: "EUR", retail: { normal: prices({ "2026-11-03": 9 }) } },
      },
      mtgo: { cardhoarder: { currency: "USD", retail: { normal: prices({ "2026-11-03": 0.5 }) } } },
    },
    "u-rare": { paper: { tcgplayer: { currency: "USD", retail: { normal: prices({ "2026-11-03": 4 }), foil: prices({ "2026-11-03": 8 }) } } } },
    "u-common": { paper: { tcgplayer: { currency: "USD", retail: { normal: prices({ "2026-11-03": 0.2 }) } } } },
  },
};
const PRICES_TODAY = {
  data: {
    "u-hero": { paper: { tcgplayer: { currency: "USD", retail: { normal: prices({ "2026-11-04": 14 }) }, buylist: { normal: prices({ "2026-11-04": 6 }) } }, cardkingdom: { currency: "USD", retail: { normal: prices({ "2026-11-04": 3 }) } } } },
    "u-rare": { paper: { tcgplayer: { currency: "USD", retail: { normal: prices({ "2026-11-04": 4 }), foil: prices({ "2026-11-04": 8 }) } } } },
    "u-common": { paper: { tcgplayer: { currency: "USD", retail: { normal: prices({ "2026-11-04": 0.2 }) } } } },
  },
};
const SKUS = { data: { "u-rare": [{ skuId: 555, condition: "LIGHTLY PLAYED", language: "JAPANESE", printing: "FOIL", productId: 77 }] } };
const SET_LIST = { data: [{ code: "TST", name: "Test Set", sealedProduct: [{ uuid: "p-deck", name: "Test Set Commander Deck - Heroes", category: "deck", subtype: "commander" }], decks: [{ name: "Heroes", code: "TST", sealedProductUuids: ["p-deck"] }] }] };
const DECK_LIST = { data: [{ code: "TST", name: "Heroes", fileName: "Heroes_TST", type: "Commander Deck" }] };
const DECK_FILE = {
  data: {
    commander: [{ count: 1, identifiers: { scryfallId: "hero" }, setCode: "TST", number: "1" }],
    mainBoard: [{ count: 3, identifiers: { scryfallId: "common" }, setCode: "TST", number: "2" }, { count: 1, isFoil: true, identifiers: { scryfallId: "rare" }, setCode: "TST", number: "3" }],
    sideBoard: [],
  },
};

async function setup(options: { failPrintings?: boolean } = {}) {
  const database = new DatabaseSync(":memory:");
  const state = { failPrintings: options.failPrintings ?? false };
  const gz = (body: unknown) => new Response(gzipSync(JSON.stringify(body)));
  const fetcher = (async (url: string, init?: RequestInit) => {
    if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": "123456789" } });
    if (url === ALL_PRINTINGS_URL) return state.failPrintings ? new Response("down", { status: 503 }) : gz(ALL_PRINTINGS);
    if (url === ALL_PRICES_URL) return gz(ALL_PRICES);
    if (url === PRICES_TODAY_URL) return gz(PRICES_TODAY);
    if (url === SKUS_URL) return gz(SKUS);
    if (url === KEYWORDS_URL) return Response.json({ data: { keywordAbilities: ["Flying"] } });
    if (url === CARD_TYPES_URL) return Response.json({ data: { creature: { subTypes: ["Hero"], superTypes: ["Legendary"] } } });
    if (url === SET_LIST_URL) return Response.json(SET_LIST);
    if (url === DECK_LIST_URL) return Response.json(DECK_LIST);
    if (url === deckFileUrl("Heroes_TST")) return Response.json(DECK_FILE);
    return new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000, fetcher, pictureDownloads: false, mtgjsonSchedule: false });
  closers.push(async () => { await app.close(); database.close(); });
  saveSets(database, { data: [{ code: "tst", name: "Test Set", set_type: "expansion", released_at: "2026-11-01" }] });
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  for (const [id, name, type, number, rarity] of [["hero", "Hero", "Legendary Creature - Hero", "1", "mythic"], ["common", "Common Thing", "Creature", "2", "common"], ["rare", "Rare Thing", "Artifact", "3", "rare"], ["other", "Other", "Instant", "4", "common"]] as const) {
    insert.run(id, `o-${id}`, name, "{1}", 1, type, `${name} rules.`, "", "", "{}", "tst", "Test Set", number, rarity, null, "2026-11-01", "Artist");
    extras.run("nonfoil,foil", 0, 0, id);
  }
  database.prepare("UPDATE cards SET price_usd = 9.5 WHERE id = 'hero'").run();
  database.prepare("UPDATE cards SET price_usd = 1 WHERE id = 'other'").run();
  const folder = `/tmp/mana-vault-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const guard = { "x-mana-vault": "1" };
  const signUp = async (name: string) => {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
    return (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({
      method: method as "GET", url,
      headers: { ...(method === "GET" ? {} : guard), cookie, ...(typeof payload === "string" ? { "content-type": "text/plain" } : {}), ...headers },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  };
  const call = await signUp("ann");
  return { app, database, call, signUp, fetcher, folder, state };
}

async function loaded(options: { failPrintings?: boolean } = {}) {
  const context = await setup(options);
  await importMtgjson(context.database, { fetcher: context.fetcher, folder: context.folder, force: true });
  return context;
}

describe("MTGJSON import", () => {
  it("keeps every record, matches printings by Scryfall id and saves card details, ids, sources, boosters and products", async () => {
    const { database } = await loaded();
    expect(Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_records").get()?.n)).toBe(4);
    expect(Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_records WHERE card_id IS NULL").get()?.n)).toBe(1);
    expect(database.prepare("SELECT mtgjson_uuid, original_text, is_reprint, lead_commander, lead_oathbreaker, lead_brawl FROM cards WHERE id = 'hero'").get())
      .toMatchObject({ mtgjson_uuid: "u-hero", original_text: "Hero text as printed.", is_reprint: 1, lead_commander: 1, lead_oathbreaker: 0, lead_brawl: 1 });
    expect(database.prepare("SELECT card_id, finish FROM mtgjson_ids WHERE store = 'cardkingdom' AND ext_id = 'ck-1f'").get()).toMatchObject({ card_id: "hero", finish: 1 });
    expect(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_sources WHERE card_id = 'hero'").get()?.n).toBe(3);
    expect(database.prepare("SELECT upc, contents FROM sealed_products WHERE id = 'p-play'").get()).toMatchObject({ upc: "012345678905" });
    // a product only AllPrintings lists is added; the SetList product (a Commander deck) is kept
    expect(database.prepare("SELECT product FROM sealed_products WHERE id = 'p-collector'").get()).toMatchObject({ product: "collector_booster" });
    expect(database.prepare("SELECT deck_name FROM sealed_products WHERE id = 'p-deck'").get()).toMatchObject({ deck_name: "Heroes" });
    expect(database.prepare("SELECT card_id, condition, language, finish FROM mtgjson_skus WHERE sku_id = '555'").get()).toMatchObject({ card_id: "rare", condition: "LP", language: "ja", finish: 1 });
    expect(Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_meta WHERE key IN ('keywords', 'card_types')").get()?.n)).toBe(2);
    const parts = Object.fromEntries(mtgjsonParts(database).map((part) => [part.part, part]));
    expect(parts["Card data"]).toMatchObject({ result: "Updated", count: 4 });
    expect(parts["Prices today"]).toMatchObject({ result: "Updated" });
    expect(parts["Price history"]!.result).toBe("");
  });

  it("keeps the stored copy when a part fails", async () => {
    const context = await loaded();
    context.state.failPrintings = true;
    await importMtgjson(context.database, { fetcher: context.fetcher, folder: context.folder, force: true });
    const part = mtgjsonParts(context.database).find((item) => item.part === "Card data")!;
    expect(part.result).toBe("Kept previous copy");
    expect(part.count).toBe(4);
    expect(context.database.prepare("SELECT lead_commander FROM cards WHERE id = 'hero'").get()?.lead_commander).toBe(1);
    // with nothing stored before, a failure is Failed
    const fresh = await setup({ failPrintings: true });
    await importMtgjson(fresh.database, { fetcher: fresh.fetcher, folder: fresh.folder, force: true });
    expect(mtgjsonParts(fresh.database).find((item) => item.part === "Card data")!.result).toBe("Failed");
  });

  it("fills 90 days of history once, keeps only changes and never rewrites a recorded day", async () => {
    const { database, fetcher, folder } = await loaded();
    // today's file saved 2026-11-04 first
    await importPriceHistory(database, { fetcher, folder });
    const tcg = database.prepare("SELECT day, r, b FROM store_price_history WHERE card_id = 'hero' AND store = 1 ORDER BY day").all();
    // 11-02 repeats 11-01 and is left out; 11-04 (today's file) is kept
    expect(tcg.map((row) => [row.day, row.r])).toEqual([["2026-11-01", 10], ["2026-11-03", 12], ["2026-11-04", 14]]);
    // the current price stays the newest day's
    expect(database.prepare("SELECT tcg_r, ck_r, cm_r, ch_r FROM cards WHERE id = 'hero'").get()).toMatchObject({ tcg_r: 14, ck_r: 3, cm_r: 9, ch_r: 0.5 });
    expect(storeDays({ retail: { foil: { "2026-01-01": 1.234 } }, buylist: { etched: { "2026-01-01": 2 } } }).get("2026-01-01")).toEqual([null, 1.23, null, null, null, 2]);
  });
});

describe("the main price source", () => {
  it("falls back along the source chain", () => {
    expect(sourceChain("cardkingdom")).toEqual(["cardkingdom", "tcgplayer", "scryfall", "cardsphere"]);
    expect(sourceChain("scryfall")).toEqual(["scryfall", "tcgplayer", "cardkingdom", "cardsphere"]);
  });

  it("prices cards, collections and searches from the account's main source", async () => {
    const { call } = await loaded();
    expect((await call("GET", "/api/cards/hero")).json().prices.usd).toBe(14);
    await call("PUT", "/api/prefs", { mainPriceSource: "cardkingdom" });
    expect((await call("GET", "/api/cards/hero")).json().prices.usd).toBe(3);
    // no Card Kingdom price: TCGplayer is next; no MTGJSON price at all: Scryfall's
    expect((await call("GET", "/api/cards/rare")).json().prices.usd).toBe(4);
    expect((await call("GET", "/api/cards/other")).json().prices.usd).toBe(1);
    const main = (await call("GET", "/api/collections")).json()[0].id;
    await call("POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "hero", foil: 0, condition: "NM", language: "en", proxy: false, quantity: 2 }] });
    const collections = (await call("GET", "/api/collections")).json();
    expect(collections[0].value.usd).toBe(6);
    const found = (await call("GET", "/api/cards?q=usd<5&paged=1")).json();
    expect(found.cards.map((item: { id: string }) => item.id)).toContain("hero");
    // another account keeps TCGplayer
    const other = await (await loaded()).signUp("bob");
    expect((await other("GET", "/api/cards/hero")).json().prices.usd).toBe(14);
  });

  it("lists every store's prices, the printed text, leadership and where the card comes from", async () => {
    const { call, database, fetcher, folder } = await loaded();
    await importPriceHistory(database, { fetcher, folder });
    const market = (await call("GET", "/api/cards/hero/market")).json();
    // each store's current prices are its newest day: Card Kingdom's today, Cardmarket's from 11-03
    expect(market.prices.find((row: { store: string }) => row.store === "cardkingdom")).toMatchObject({ r: 3, rf: null, b: null });
    expect(market.prices.find((row: { store: string }) => row.store === "tcgplayer")).toMatchObject({ r: 14, b: 6 });
    expect(market.prices.find((row: { store: string }) => row.store === "cardmarket")).toMatchObject({ currency: "EUR", r: 9 });
    expect(market).toMatchObject({ printedText: "Hero text as printed.", leadership: { commander: true, oathbreaker: false, brawl: true }, isReprint: true });
    expect(market.foundIn.map((item: { id: string }) => item.id).sort()).toEqual(["p-collector", "p-deck", "p-play"]);
    const history = (await call("GET", "/api/cards/hero/store-history")).json();
    expect(history.some((row: { store: string; r: number }) => row.store === "tcgplayer" && row.r === 14)).toBe(true);
  });
});

describe("search syntax", () => {
  it("finds reprints, starters, commanders, store and buylist prices and products", async () => {
    const { call } = await loaded();
    const ids = async (q: string) => (await call("GET", `/api/cards?q=${encodeURIComponent(q)}`)).json().map((item: { id: string }) => item.id).sort();
    expect(await ids("is:reprint")).toEqual(["hero"]);
    expect(await ids("is:starter")).toEqual(["common"]);
    expect(await ids("can:commander")).toEqual(["hero"]);
    expect(await ids("can:oathbreaker")).toEqual([]);
    expect(await ids("store:cardkingdom<5")).toEqual(["hero"]);
    expect(await ids("buylist>5")).toEqual(["hero"]);
    expect(await ids('in:"collector booster"')).toEqual(["hero"]);
    expect(await ids('in:"play booster"')).toEqual(["common", "hero", "rare"]);
    expect((await call("GET", "/api/cards?q=can:legacy")).statusCode).toBe(400);
  });
});

describe("booster contents", () => {
  it("works out the expected value of a pack from its odds and prices", async () => {
    const { database, call } = await loaded();
    const config = JSON.parse(String(database.prepare("SELECT config FROM boosters WHERE set_code = 'tst' AND name = 'play'").get()?.config));
    // 3/4 x (common 0.2 + half of rare 4 and hero 14) + 1/4 x (common 0.2 + foil rare 8) = 0.75 x 9.2 + 0.25 x 8.2 = 8.95
    expect(packValue(database, config, "tcgplayer")).toBe(8.95);
    expect((await call("GET", "/api/boosters?set=tst")).json()).toEqual([{ name: "play", label: "Play booster", value: 8.95 }]);
    const packs = openPacks(database, config, 2, "tcgplayer", () => 0);
    expect(packs).toHaveLength(2);
    expect(packs[0]!.cards.map((item) => item.cardId)).toEqual(["common", "rare"]);
    const opened = (await call("POST", "/api/boosters/open", { set: "tst", booster: "play", count: 3 })).json();
    expect(opened.packs).toHaveLength(3);
    expect(opened.expected).toBe(8.95);
    expect(pullsAllowed(database, "tst", "play")!.get("rare")).toEqual(new Set([0, 1, 2]));
  });

  it("shows expected value on purchase lines and openings and warns about cards a pack cannot hold", async () => {
    const { call } = await loaded();
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", place: "Shop", currency: "usd", tax: 0, shipping: 0,
      lines: [{ product: "play_booster", setCode: "tst", quantity: 2, cost: 10 }],
    })).json();
    const line = entry.lines[0];
    expect(line).toMatchObject({ ev: 8.95, evLine: 17.9, evLabel: "Play booster" });
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const opening = (await call("POST", `/api/purchases/${entry.id}/lines/${line.id}/open`, { count: 1, collectionId: main })).json();
    expect(opening.id).toBeTruthy();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "rare", foil: 0, condition: "NM", language: "en", proxy: false, quantity: 1 }, { cardId: "other", foil: 0, condition: "NM", language: "en", proxy: false, quantity: 1 }] });
    const full = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(full.openings[0].ev).toBe(8.95);
    const warning = (cardId: string) => full.ties.find((tie: { cardId: string }) => tie.cardId === cardId)?.warning;
    expect(warning("rare")).toBeNull();
    expect(warning("other")).toBe("Not found in Play booster, Test Set");
  });
});

describe("precons and barcodes", () => {
  it("adds a precon as a deck and to a collection, and finds a product by its barcode", async () => {
    const { call } = await loaded();
    const list = (await call("GET", "/api/precons?q=heroes")).json();
    expect(list).toEqual([expect.objectContaining({ code: "TST", name: "Heroes", setName: "Test Set" })]);
    const made = (await call("POST", "/api/precons/deck", { code: "TST", name: "Heroes" })).json();
    expect(made).toMatchObject({ name: "Heroes", cards: 5, missing: 0 });
    const deck = (await call("GET", `/api/decks/${made.id}`)).json();
    expect(deck.format).toBe("commander");
    expect(deck.cards.map((item: { card_id: string; zone: string; finish: number; quantity: number }) => [item.card_id, item.zone, item.finish, item.quantity]).sort())
      .toEqual([["common", "main", 0, 3], ["hero", "commander", 0, 1], ["rare", "main", 1, 1]]);
    expect(deck.cards.find((item: { card_id: string }) => item.card_id === "hero").leadership).toEqual({ commander: true, oathbreaker: false, brawl: true });
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const added = (await call("POST", "/api/precons/collection", { code: "TST", name: "Heroes", collectionId: main })).json();
    expect(added.cards).toBe(5);
    expect((await call("GET", "/api/sealed/barcode/012345678905")).json()).toMatchObject({ sealedId: "p-play", setCode: "tst", product: "play_booster" });
    expect((await call("GET", "/api/sealed/barcode/12345678905")).json()).toMatchObject({ sealedId: "p-play" });
    expect((await call("GET", "/api/sealed/barcode/999999999999")).statusCode).toBe(404);
  });
});

describe("import matching by store ids", () => {
  it("matches the exact printing by a store id and a TCGplayer SKU", async () => {
    const { call } = await loaded();
    const main = (await call("GET", "/api/collections")).json()[0].id;
    const csv = "Name,Quantity,Card Kingdom ID\nWrong Name,1,ck-1f\n";
    const preview = (await call("POST", `/api/collections/${main}/import/preview`, csv, { "content-type": "text/csv" })).json();
    expect(preview.unmatched).toEqual([]);
    await call("POST", `/api/collections/${main}/import`, csv, { "content-type": "text/csv" });
    await call("POST", `/api/collections/${main}/import`, "Name,Quantity,SKU\nRare Thing,2,555\n", { "content-type": "text/csv" });
    const cards = (await call("GET", `/api/collections/${main}/cards`)).json();
    const rows = (Array.isArray(cards) ? cards : cards.cards) as Array<{ id: string; foil: number; condition: string; language: string; quantity: number }>;
    expect(rows.find((row) => row.id === "hero")).toMatchObject({ foil: 1 });
    expect(rows.find((row) => row.id === "rare")).toMatchObject({ foil: 1, condition: "LP", language: "ja", quantity: 2 });
  });
});

describe("Change collection on a pack", () => {
  it("moves the pulls or leaves them, covers packs not reached, and undoes", async () => {
    const { call } = await loaded();
    const [main] = (await call("GET", "/api/collections")).json();
    const other = (await call("POST", "/api/collections", { name: "Pulls" })).json();
    const entry = (await call("POST", "/api/purchases", {
      kind: "purchase", date: "2026-11-01", place: "Shop", currency: "usd", tax: 0, shipping: 0,
      lines: [{ product: "booster_box", setCode: "tst", quantity: 1, cost: 72, packs: 36 }],
    })).json();
    const opened = (await call("POST", `/api/purchases/${entry.id}/lines/${entry.lines[0].id}/open`, { count: 2, collectionId: main.id })).json();
    await call("POST", `/api/collections/${main.id}/cards/add`, { items: [{ cardId: "rare", foil: 0, condition: "NM", language: "en", proxy: false, quantity: 2 }] });
    const changed = (await call("POST", `/api/purchases/openings/${opened.id}/collection`, { collectionId: other.id, move: true, rest: true })).json();
    expect(changed.undo.ties).toEqual([expect.objectContaining({ from: main.id, to: other.id, quantity: 2 })]);
    expect(changed.entry.openings.every((item: { collectionId: string }) => item.collectionId === other.id)).toBe(true);
    const held = async (id: string) => ((await call("GET", `/api/collections/${id}/cards`)).json() as Array<{ id: string; quantity: number }>).find((row) => row.id === "rare")?.quantity ?? 0;
    expect(await held(main.id)).toBe(0);
    expect(await held(other.id)).toBe(2);
    // new pulls go to the new collection
    await call("POST", `/api/collections/${other.id}/cards/add`, { items: [{ cardId: "common", foil: 0, condition: "NM", language: "en", proxy: false, quantity: 1 }] });
    expect((await call("GET", `/api/purchases/${entry.id}`)).json().ties.some((tie: { cardId: string }) => tie.cardId === "common")).toBe(true);
    // undo puts the pulls and the collection back
    expect((await call("POST", "/api/purchases/openings/collection/restore", changed.undo)).statusCode).toBe(200);
    expect(await held(main.id)).toBe(2);
    const after = (await call("GET", `/api/purchases/${entry.id}`)).json();
    expect(after.openings.find((item: { id: string }) => item.id === opened.id).collectionId).toBe(main.id);
    // Leave them: only the collection changes
    const left = (await call("POST", `/api/purchases/openings/${opened.id}/collection`, { collectionId: other.id, move: false })).json();
    expect(left.undo.ties).toEqual([]);
    expect(await held(main.id)).toBe(2);
  });
});

describe("Administration, MTGJSON parts", () => {
  it("lists the parts, starts updates and skips the price history", async () => {
    const { call } = await setup();
    const status = (await call("GET", "/api/admin/mtgjson")).json();
    expect(status.parts.map((part: { part: string }) => part.part)).toContain("Card data");
    expect(status.history).toBe("ask");
    expect((await call("GET", "/api/admin/mtgjson/history-size")).json().bytes).toBe(123456789);
    expect((await call("POST", "/api/admin/mtgjson/history/skip", {})).json().history).toBe("skipped");
    expect((await call("POST", "/api/admin/mtgjson/update", { what: "prices" })).json()).toEqual({ started: "prices" });
  });
});

