// Tests for 0.15.0: SVG cleaning, custom set changes, the Scryfall extras (set symbols, symbol list, printing changes,
// name and keyword lists, card back), card languages, the art library and backups version 6.
import { describe, expect, it } from "vitest";
import { server } from "./release-090.test.js";
import { applyMigrations, downloadCardBack, downloadSetSymbols, importCatalogs, importSymbology, mergePrinting, suggest } from "./scryfall-extras.js";
import { languageRule, removeUnusedLanguages } from "./import-cards.js";
import { saveSets } from "./sets.js";
import { cleanSvg } from "./svg.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
const dataUrl = (text: string, type = "image/svg+xml") => `data:${type};base64,${Buffer.from(text).toString("base64")}`;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const customCard = (setCode: string, name: string) => ({
  setCode, collectorNumber: "1", rarity: "rare", artist: "Me", finishes: ["nonfoil"], legalities: {}, price: {},
  front: { name, manaCost: "{1}", typeLine: "Creature", oracleText: "", power: "1", toughness: "1", loyalty: "" },
});

/** A pretend Scryfall that answers from a table of addresses. */
function fakeScryfall(routes: Record<string, unknown>) {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    const body = routes[url];
    if (body === undefined) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}), text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return {
      ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(text), text: async () => text,
      arrayBuffer: async () => (body instanceof Uint8Array ? body : new TextEncoder().encode(text)).slice().buffer as ArrayBuffer,
    };
  };
  return { fetcher, asked };
}

describe("SVG cleaning", () => {
  it("keeps the drawing and removes scripts, handlers and outside links", () => {
    const cleaned = cleanSvg(`<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script>
      <a href="javascript:alert(1)"><path d="M0 0h1" style="fill:url(http://evil/x)"/></a><foreignObject><div/></foreignObject></svg>`)!;
    expect(cleaned).toContain("<path");
    for (const bad of ["script", "onload", "javascript:", "foreignObject", "http://evil", "DOCTYPE"]) expect(cleaned).not.toContain(bad);
    expect(cleaned).toContain('width="96"');
    expect(cleanSvg("<svg></svg>")).toBeNull();
    expect(cleanSvg("not a picture")).toBeNull();
  });
});

describe("custom sets", () => {
  it("takes an SVG symbol, changes its code on every card and checks the code is free", async () => {
    const { call } = await server();
    expect((await call("POST", "/api/custom/sets", { code: "abc", name: "Alpha", symbol: dataUrl(SVG) })).statusCode).toBe(201);
    expect((await call("POST", "/api/custom/sets", { code: "abd", name: "Bad", symbol: dataUrl("<svg><script/></svg>") })).json().error).toBe("This SVG has no drawing Mana Vault can use");
    const card = (await call("POST", "/api/custom/cards", { card: customCard("abc", "Test Card"), picture: PNG })).json() as { id: string };
    const symbol = await call("GET", "/api/custom/sets/abc/symbol");
    expect(symbol.headers["content-security-policy"]).toContain("default-src 'none'");
    expect((await call("PATCH", "/api/custom/sets/abc", { code: "hoc" })).json().error).toBe("The set code HOC is already used by another set");
    const changed = (await call("PATCH", "/api/custom/sets/abc", { code: "xyz", rarityColors: false })).json();
    expect(changed).toMatchObject({ code: "xyz", rarityColors: false });
    expect((await call("GET", `/api/cards/${card.id}`)).json()).toMatchObject({ set_code: "xyz" });
    expect((await call("GET", "/api/set-symbols/xyz")).headers["content-type"]).toContain("image/svg+xml");
  });
});

describe("Scryfall extras", () => {
  it("saves set symbols once per changed address and serves them without sign-in", async () => {
    const { app, database } = await server();
    saveSets(database, { data: [{ code: "hoc", name: "Hobbit Commander", set_type: "commander", icon_svg_uri: "https://svgs.scryfall.io/sets/hoc.svg?1", block: "Middle-earth", digital: false }] });
    const scryfall = fakeScryfall({ "https://svgs.scryfall.io/sets/hoc.svg?1": SVG });
    expect(await downloadSetSymbols(database, scryfall.fetcher)).toBe(1);
    expect(await downloadSetSymbols(database, scryfall.fetcher)).toBe(0);
    expect(scryfall.asked).toHaveLength(1);
    const reply = await app.inject({ method: "GET", url: "/api/set-symbols/hoc" });
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toContain("<path");
    const sets = (await (await server()).call("GET", "/api/sets?q=")).json();
    expect(Array.isArray(sets)).toBe(true);
  });

  it("reads the symbol list with names, mana values and pictures", async () => {
    const { database, call } = await server();
    const scryfall = fakeScryfall({
      "https://api.scryfall.com/symbology": { data: [
        { symbol: "{W/U}", english: "one white or blue mana", mana_value: 1, colors: ["W", "U"], hybrid: true, represents_mana: true, svg_uri: "https://svgs.scryfall.io/card-symbols/WU.svg" },
        { symbol: "{T}", english: "tap this permanent", mana_value: 0, colors: [], svg_uri: "https://svgs.scryfall.io/card-symbols/T.svg" },
      ] },
      "https://svgs.scryfall.io/card-symbols/WU.svg": SVG,
      "https://svgs.scryfall.io/card-symbols/T.svg": SVG,
    });
    expect(await importSymbology(database, scryfall.fetcher)).toBe(2);
    const list = (await call("GET", "/api/symbology")).json();
    expect(list[0]).toMatchObject({ symbol: "{W/U}", code: "WU", name: "one white or blue mana", manaValue: 1, colors: "WU", hybrid: true, picture: true });
  });

  it("merges a printing into another and marks deleted printings removed", async () => {
    const { database, call } = await server();
    const collection = (await call("POST", "/api/collections", { name: "Binder" })).json() as { id: string };
    await call("POST", `/api/collections/${collection.id}/cards/add`, { items: [
      { cardId: "sa2", foil: false, condition: "NM", language: "en", quantity: 2 },
      { cardId: "sa1", foil: false, condition: "NM", language: "en", quantity: 1 },
      { cardId: "is2", foil: false, condition: "NM", language: "en", quantity: 1 },
    ] });
    const deck = (await call("POST", "/api/decks", { name: "Rings", format: "commander" })).json() as { id: string };
    await call("POST", `/api/decks/${deck.id}/cards`, { cardId: "sa2", quantity: 1, zone: "main" });
    const scryfall = fakeScryfall({
      "https://api.scryfall.com/migrations": { has_more: false, data: [
        { id: "m2", migration_strategy: "delete", old_scryfall_id: "is2", performed_at: "2026-11-02" },
        { id: "m1", migration_strategy: "merge", old_scryfall_id: "sa2", new_scryfall_id: "sa1", performed_at: "2026-11-01", note: "Duplicate" },
      ] },
    });
    expect(await applyMigrations(database, scryfall.fetcher)).toEqual({ merged: 1, removed: 1 });
    const items = (await call("GET", `/api/collections/${collection.id}/cards`)).json() as Array<{ id: string; quantity: number; removed: boolean }>;
    expect(items.find((item) => item.id === "sa1")?.quantity).toBe(3);
    expect(items.find((item) => item.id === "sa2")).toBeUndefined();
    expect(items.find((item) => item.id === "is2")?.removed).toBe(true);
    expect((await call("GET", `/api/decks/${deck.id}`)).json().cards[0]).toMatchObject({ printing_id: "sa1" });
    const found = (await call("GET", "/api/cards?q=Island&limit=10")).json() as Array<{ id: string }>;
    expect(found.map((card) => card.id)).toEqual(["is1"]);
    // the list is read again only up to the changes already applied
    expect(await applyMigrations(database, scryfall.fetcher)).toEqual({ merged: 0, removed: 0 });
    mergePrinting(database, "sa1", "sa1");
  });

  it("suggests names, types and keywords", async () => {
    const { database, call } = await server();
    const lists: Record<string, unknown> = {};
    lists["https://api.scryfall.com/catalog/card-names"] = { data: ["Lightning Bolt", "Lightning Helix", "Bolt Bend"] };
    lists["https://api.scryfall.com/catalog/creature-types"] = { data: ["Elf", "Elemental"] };
    lists["https://api.scryfall.com/catalog/keyword-abilities"] = { data: ["Flying", "First strike"] };
    expect(await importCatalogs(database, fakeScryfall(lists).fetcher)).toBe(3);
    expect(suggest(database, ["card-names"], "bolt")).toEqual(["Bolt Bend", "Lightning Bolt"]);
    expect((await call("GET", "/api/catalog/suggest?list=types&q=el")).json()).toEqual(["Elf", "Elemental"]);
    expect((await call("GET", "/api/catalog/suggest?list=types&q=leg")).json()).toEqual(["Legendary"]);
    expect((await call("GET", "/api/catalog/suggest?list=keywords&q=f")).json()).toEqual(["Flying", "First strike"]);
    expect((await call("GET", "/api/catalog/suggest?list=nope&q=f")).statusCode).toBe(400);
  });

  it("downloads the card back once and keeps an uploaded back per account", async () => {
    const { database, call } = await server();
    const id = "0aeebaf5-8c7d-4636-9e82-8c27447861f7";
    const picture = new Uint8Array(5000).fill(7);
    const scryfall = fakeScryfall({ [`https://backs.scryfall.io/png/0/a/${id}.png`]: picture });
    expect(await downloadCardBack(database, scryfall.fetcher)).toBe(true);
    expect(await downloadCardBack(database, scryfall.fetcher)).toBe(false);
    expect((await call("GET", "/api/card-backs/standard")).rawPayload.length).toBe(5000);
    expect((await call("GET", "/api/card-backs/mine")).statusCode).toBe(404);
    expect((await call("PUT", "/api/card-backs/mine", { picture: PNG })).statusCode).toBe(200);
    expect((await call("GET", "/api/card-backs")).json()).toEqual({ standard: true, mine: true });
  });
});

describe("card languages", () => {
  it("keeps the chosen languages and removes others not in use", async () => {
    const { database, call } = await server();
    database.prepare("UPDATE cards SET lang = 'ja' WHERE id = 'is2'").run();
    database.prepare("UPDATE cards SET lang = 'ph' WHERE id = 'bo1'").run();
    expect(languageRule(database).keep("ja")).toBe(false);
    expect(languageRule(database).keep("ph")).toBe(true);
    database.prepare("INSERT INTO server_settings (key, value) VALUES ('cardLanguages', '[\"ja\"]') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    expect(languageRule(database).keep("ja")).toBe(true);
    database.prepare("INSERT INTO server_settings (key, value) VALUES ('extraLanguages', 'false') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    database.prepare("INSERT INTO server_settings (key, value) VALUES ('cardLanguages', '[]') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const collection = (await call("POST", "/api/collections", { name: "Binder" })).json() as { id: string };
    await call("POST", `/api/collections/${collection.id}/cards/add`, { items: [{ cardId: "is2", foil: false, condition: "NM", language: "ja", quantity: 1 }] });
    expect(removeUnusedLanguages(database, languageRule(database).keep)).toBe(1);
    expect(database.prepare("SELECT id FROM cards WHERE lang != 'en' ORDER BY id").all().map((row) => row.id)).toEqual(["is2"]);
    const estimate = (await call("POST", "/api/admin/card-languages/estimate", { cardLanguages: ["fr"], extraLanguages: false })).json();
    expect(estimate.printings).toBeGreaterThan(1000);
    expect((await call("GET", "/api/admin/card-database")).json().parts.map((part: { part: string }) => part.part)).toContain("Set symbols");
  });
});

describe("art library and backups", () => {
  it("keeps uploads and card art per account and backs them up", async () => {
    const { call, signUp } = await server();
    const art = (await call("POST", "/api/art", { name: "Forest", picture: PNG })).json() as { id: string; url: string };
    expect((await call("POST", "/api/art", { name: "Same", picture: PNG })).json().id).toBe(art.id);
    expect((await call("PATCH", `/api/art/${art.id}`, { name: "Deep forest" })).statusCode).toBe(200);
    expect((await call("GET", "/api/art")).json()).toMatchObject([{ name: "Deep forest" }]);
    const other = await signUp("bob");
    expect((await other("GET", "/api/art")).json()).toEqual([]);
    expect((await other("GET", art.url)).statusCode).toBe(404);
    await call("POST", "/api/custom/sets", { code: "abc", name: "Alpha" });
    expect((await call("POST", "/api/custom/cards", { card: customCard("abc", "Art Card"), picture: PNG, art: dataUrl("other art bytes", "image/png") })).statusCode).toBe(201);
    expect((await call("GET", "/api/art")).json()).toHaveLength(2);
    const backup = (await call("GET", "/api/backup")).body;
    expect(JSON.parse(backup)).toMatchObject({ version: 7, artLibrary: [{ name: "Deep forest" }, { name: "Art Card" }] });
    await call("DELETE", `/api/art/${art.id}`);
    expect((await call("GET", "/api/art")).json()).toHaveLength(1);
    expect((await call("POST", "/api/backup/restore", backup)).statusCode).toBe(200);
    expect((await call("GET", "/api/art")).json()).toHaveLength(2);
  });

});
