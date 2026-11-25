// Tests for 0.13.0: sorting card search (Best match puts exact names first) and Add deck to collection.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { plainWords, searchOrder } from "./card-search.js";
import { cardExtrasStatement, cardInsertStatement, cardPricesStatement } from "./database.js";
import { deckProfile } from "./deck-profile.js";

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
  const card = (id: string, oracle: string, name: string, text: string, set: string, released: string, price: number, rarity = "common") => {
    insert.run(id, oracle, name, "{1}", 1, "Artifact", text, "", "", JSON.stringify({ commander: "legal" }), set, set.toUpperCase(), "1", rarity, null, released, "Artist");
    extras.run("nonfoil,foil", 0, 0, id);
    prices.run(price, price * 2, null, price, price * 2, null, id);
  };
  // "sol ring" also matches cards whose text holds both words, and names that only start with them
  card("a1", "o-ringer", "Ring of Sol", "Sol and ring", "m10", "2009-07-17", 9, "rare");
  card("a2", "o-sol", "Sol Ring", "Add {C}{C}.", "lea", "1993-08-05", 50, "uncommon");
  card("a3", "o-solring2", "Sol Ring Echo", "Add {C}.", "m21", "2020-07-03", 1, "mythic");
  card("a4", "o-other", "Mana Vault", "Sol ring style", "lea", "1993-08-05", 30, "rare");
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "ann", password: "correct horse" } });
  const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
  const call = (method: string, url: string, payload?: unknown) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie }, ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  const main = (await call("GET", "/api/collections")).json()[0].id as string;
  const deck = (await call("POST", "/api/decks", { name: "Artifacts", format: "commander" })).json() as { id: string };
  return { call, main, deckId: deck.id, database };
}

const names = async (call: Awaited<ReturnType<typeof server>>["call"], query: string) =>
  ((await call("GET", `/api/cards?paged=1&${query}`)).json().cards as Array<{ name: string }>).map((card) => card.name);

describe("deck color and theme signals", () => {
  it("uses commander identity, detects distinct cards, and ignores sideboards and maybeboards", () => {
    const cards = [
      { oracle_id: "commander", zone: "commander", color_identity: "GU", oracle_text: "Landfall \u2014 Whenever a land enters, draw a card." },
      { oracle_id: "second", zone: "main", color_identity: "R", oracle_text: "Landfall \u2014 Create a Food token." },
      { oracle_id: "second", zone: "main", color_identity: "R", oracle_text: "Landfall \u2014 Create a Food token." },
      { oracle_id: "third", zone: "main", color_identity: "G", oracle_text: "Create a Food token." },
      { oracle_id: "side", zone: "sideboard", color_identity: "W", oracle_text: "Amass Orcs 1." },
      { oracle_id: "maybe", zone: "maybeboard", color_identity: "B", oracle_text: "Amass Orcs 2." },
    ];
    expect(deckProfile(cards)).toEqual({ color_identity: "UG", themes: ["Landfall", "Tokens", "Food"] });
    expect(deckProfile(cards.filter((card) => card.oracle_id === "second"))).toEqual({ color_identity: "R", themes: [] });
    expect(deckProfile([{ oracle_id: "a", zone: "main", color_identity: "", oracle_text: "" }])).toEqual({ color_identity: "C", themes: [] });
    expect(deckProfile([])).toEqual({ color_identity: "", themes: [] });
    expect(deckProfile([
      { oracle_id: "a", zone: "main", color_identity: "B", oracle_text: "Amass Orcs 1." },
      { oracle_id: "b", zone: "main", color_identity: "U", oracle_text: "Amass Zombies 2." },
      { oracle_id: "c", zone: "main", color_identity: "G", oracle_text: "Whenever one or more lands you control enter, draw a card." },
      { oracle_id: "d", zone: "main", color_identity: "G", oracle_text: "Whenever a land you control enters, draw a card." },
    ])).toEqual({ color_identity: "UBG", themes: ["Landfall", "Amass"] });
  });

  it("updates deck summaries and details when cards change", async () => {
    const { call, deckId, database } = await server();
    database.prepare("UPDATE cards SET color_identity = ?, oracle_text = ? WHERE id = ?").run("G", "Landfall \u2014 Create a Food token.", "a1");
    database.prepare("UPDATE cards SET color_identity = ?, oracle_text = ? WHERE id = ?").run("R", "Landfall \u2014 Create a Food token.", "a2");
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "a1", zone: "main" });
    await call("POST", `/api/decks/${deckId}/cards`, { cardId: "a2", zone: "main" });
    expect((await call("GET", "/api/decks")).json()[0]).toMatchObject({ color_identity: "RG", themes: ["Landfall", "Tokens", "Food"] });
    const detail = (await call("GET", `/api/decks/${deckId}`)).json();
    expect(detail).toMatchObject({ color_identity: "RG", themes: ["Landfall", "Tokens", "Food"] });
    await call("DELETE", `/api/decks/${deckId}/cards/o-sol?zone=main&entryId=${detail.cards.find((card: { card_id: string }) => card.card_id === "a2").entry_id}`);
    expect((await call("GET", "/api/decks")).json()[0]).toMatchObject({ color_identity: "G", themes: [] });
  });
});

describe("card search sorting", () => {
  it("puts the exact name first by default, then names that start with the words, then the rest", async () => {
    const { call } = await server();
    expect(await names(call, "q=sol%20ring")).toEqual(["Sol Ring", "Sol Ring Echo", "Ring of Sol", "Mana Vault"]);
    expect(await names(call, "q=sol%20ring&group=1")).toEqual(["Sol Ring", "Sol Ring Echo", "Ring of Sol", "Mana Vault"]);
  });

  it("sorts by name, price, rarity, date and owned copies", async () => {
    const { call, main } = await server();
    expect(await names(call, "q=sol%20ring&sort=name")).toEqual(["Mana Vault", "Ring of Sol", "Sol Ring", "Sol Ring Echo"]);
    expect(await names(call, "q=sol%20ring&sort=priceHigh")).toEqual(["Sol Ring", "Mana Vault", "Ring of Sol", "Sol Ring Echo"]);
    expect(await names(call, "q=sol%20ring&sort=priceLow&currency=eur")).toEqual(["Sol Ring Echo", "Ring of Sol", "Mana Vault", "Sol Ring"]);
    expect(await names(call, "q=sol%20ring&sort=rarity")).toEqual(["Sol Ring Echo", "Mana Vault", "Ring of Sol", "Sol Ring"]);
    expect(await names(call, "q=sol%20ring&sort=newest")).toEqual(["Sol Ring Echo", "Ring of Sol", "Mana Vault", "Sol Ring"]);
    await call("POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "a4", foil: 0, condition: "NM", language: "en", quantity: 2 }] });
    expect((await names(call, "q=sol%20ring&sort=owned"))[0]).toBe("Mana Vault");
  });

  it("refuses an unknown sort and reads plain words without filter words", async () => {
    const { call } = await server();
    expect((await call("GET", "/api/cards?paged=1&q=sol&sort=random")).statusCode).toBe(400);
    expect(plainWords('sol ring t:artifact -o:"draw" "mana vault"')).toBe("sol ring mana vault");
    expect(searchOrder("best", "").sql).not.toContain("CASE");
  });
});

describe("Add deck to collection", () => {
  const deckCards = async (call: Awaited<ReturnType<typeof server>>["call"], deckId: string) =>
    (await call("GET", `/api/decks/${deckId}`)).json().cards as Array<{ card_id: string; quantity: number; missing: number; zone: string }>;
  const rows = async (call: Awaited<ReturnType<typeof server>>["call"], id: string) =>
    ((await call("GET", `/api/collections/${id}/cards`)).json() as Array<{ id: string; foil: number; quantity: number }>)
      .map((row) => [row.id, row.foil, row.quantity]).sort();

  it("adds only the missing cards in the deck's printing and finish and links them, leaving the maybeboard out", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "a2", foil: 0, condition: "NM", language: "en", quantity: 1 }] });
    await call("POST", `/api/decks/${deckId}/replace`, { text: "1 Sol Ring (LEA) 1\n2 Mana Vault (LEA) 1 *F*\n\nMaybeboard\n1 Ring of Sol\n" });
    expect((await deckCards(call, deckId)).filter((card) => card.missing > 0).map((card) => card.card_id)).toEqual(["a4"]);
    const result = (await call("POST", `/api/decks/${deckId}/add-to-collection`, { collectionId: main, mode: "missing" })).json();
    expect(result).toMatchObject({ added: 2, linked: 2 });
    expect(result.before).toEqual([expect.objectContaining({ cardId: "a4", foil: 1, quantity: 0 })]);
    expect(await rows(call, main)).toEqual([["a2", 0, 1], ["a4", 1, 2]]);
    expect((await deckCards(call, deckId)).every((card) => card.zone === "maybeboard" || card.missing === 0)).toBe(true);
    // nothing is missing now, so a second time adds nothing
    expect((await call("POST", `/api/decks/${deckId}/add-to-collection`, { collectionId: main, mode: "missing" })).json()).toMatchObject({ added: 0, linked: 0 });
  });

  it("adds every card as new copies and still links the missing ones", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/collections/${main}/cards/add`, { items: [{ cardId: "a2", foil: 0, condition: "NM", language: "en", quantity: 1 }] });
    await call("POST", `/api/decks/${deckId}/replace`, { text: "1 Sol Ring (LEA) 1\n2 Mana Vault (LEA) 1\n" });
    const other = (await call("POST", "/api/collections", { name: "Deck box" })).json() as { id: string };
    const result = (await call("POST", `/api/decks/${deckId}/add-to-collection`, { collectionId: other.id, mode: "all" })).json();
    expect(result).toMatchObject({ added: 3, linked: 2 });
    expect(await rows(call, other.id)).toEqual([["a2", 0, 1], ["a4", 0, 2]]);
    expect(await rows(call, main)).toEqual([["a2", 0, 1]]);
  });

  it("undoes by setting the counts back, which removes the new links", async () => {
    const { call, main, deckId } = await server();
    await call("POST", `/api/decks/${deckId}/replace`, { text: "1 Sol Ring (LEA) 1\n" });
    const result = (await call("POST", `/api/decks/${deckId}/add-to-collection`, { collectionId: main, mode: "missing" })).json();
    await call("PUT", `/api/collections/${main}/cards`, { items: result.before });
    expect(await rows(call, main)).toEqual([]);
    expect((await deckCards(call, deckId))[0]).toMatchObject({ missing: 1 });
  });

  it("refuses wishlists, unknown collections and unknown choices", async () => {
    const { call, deckId } = await server();
    const wish = (await call("POST", "/api/collections", { name: "Wants", kind: "wishlist" })).json() as { id: string };
    expect((await call("POST", `/api/decks/${deckId}/add-to-collection`, { collectionId: wish.id, mode: "missing" })).json())
      .toEqual({ error: "Choose a collection, not a wishlist" });
    expect((await call("POST", `/api/decks/${deckId}/add-to-collection`, { collectionId: "nope", mode: "missing" })).statusCode).toBe(404);
    const main = (await call("GET", "/api/collections")).json()[0].id as string;
    expect((await call("POST", `/api/decks/${deckId}/add-to-collection`, { collectionId: main, mode: "some" })).statusCode).toBe(400);
  });
});
