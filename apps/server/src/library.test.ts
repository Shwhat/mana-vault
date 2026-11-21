import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardExtrasStatement, cardInsertStatement, initializeDatabase } from "./database.js";
import { isMainPrinting } from "./library.js";
import { saveSets } from "./sets.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const legal = JSON.stringify({ commander: "legal" });

/** A small set "tst" with printed size 3: numbers 1 to 3, a showcase 4, a promo 1p, plus card "Bolt" also in "oth". */
function seed(database: DatabaseSync) {
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const card = (id: string, oracle: string, name: string, set: string, number: string, rarity: string, finishes: string, promo = 0, variation = 0) => {
    insert.run(id, oracle, name, "{R}", 1, "Instant", "", "R", "R", legal, set, set === "tst" ? "Test Set" : "Other Set", number, rarity, null, "2024-01-01", "Artist");
    extras.run(finishes, promo, variation, id);
  };
  card("t1", "o-bolt", "Bolt", "tst", "1", "common", "nonfoil,foil");
  card("t2", "o-shock", "Shock", "tst", "2", "common", "nonfoil");
  card("t3", "o-dragon", "Dragon", "tst", "3", "rare", "foil");
  card("t4", "o-bolt", "Bolt", "tst", "4", "rare", "nonfoil,foil");
  card("t1p", "o-shock", "Shock", "tst", "1p", "rare", "foil", 1);
  card("o1", "o-bolt", "Bolt", "oth", "10", "common", "nonfoil,foil");
  saveSets(database, { data: [{ code: "TST", name: "Test Set", set_type: "expansion", released_at: "2024-01-01", printed_size: 3, card_count: 5 }] });
}

async function server(database = new DatabaseSync(":memory:")) {
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000 });
  seed(database);
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const users: Record<string, { cookie: string; id: number }> = {};
  /** Creates an account. Unless `keepStarter` is set, the empty Main collection every new account gets is removed. */
  async function signUp(name: string, keepStarter = false) {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    users[name] = { cookie: String(response.headers["set-cookie"]).split(";")[0]!, id: response.json().id };
    if (keepStarter) return;
    const list = (await call(name, "GET", "/api/collections")).json() as Array<{ id: string; name: string; cardCount: number }>;
    for (const item of list) if (item.name === "Main collection" && item.cardCount === 0) await call(name, "DELETE", `/api/collections/${item.id}`);
  }
  const call = (user: string, method: string, url: string, payload?: unknown) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie: users[user]!.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return { app, database, signUp, call, users };
}

describe("main set rule", () => {
  it("uses the printed size, or skips promos and variants without one", () => {
    expect(isMainPrinting({ collector_number: "3", promo: 0, variation: 0 }, 3)).toBe(true);
    expect(isMainPrinting({ collector_number: "4", promo: 0, variation: 0 }, 3)).toBe(false);
    expect(isMainPrinting({ collector_number: "1p", promo: 1, variation: 0 }, 3)).toBe(false);
    expect(isMainPrinting({ collector_number: "12", promo: 0, variation: 0 }, null)).toBe(true);
    expect(isMainPrinting({ collector_number: "12", promo: 0, variation: 1 }, null)).toBe(false);
  });
});

describe("collections", () => {
  it("moves pre-0.2.0 data to the first account", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE cards (id TEXT PRIMARY KEY, oracle_id TEXT NOT NULL, name TEXT NOT NULL, mana_cost TEXT, type_line TEXT NOT NULL,
        oracle_text TEXT, colors TEXT NOT NULL DEFAULT '', set_code TEXT NOT NULL, set_name TEXT NOT NULL, collector_number TEXT NOT NULL,
        rarity TEXT NOT NULL, image_url TEXT, released_at TEXT);
      INSERT INTO cards (id, oracle_id, name, type_line, set_code, set_name, collector_number, rarity)
        VALUES ('old', 'o-old', 'Old Card', 'Instant', 'lea', 'Alpha', '1', 'common');
      CREATE TABLE collection_items (card_id TEXT NOT NULL, quantity INTEGER NOT NULL, foil INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (card_id, foil));
      INSERT INTO collection_items VALUES ('old', 4, 1);
      CREATE TABLE decks (id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL, mode TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO decks (id, name, format, mode) VALUES ('d1', 'Old deck', 'casual', 'normal');
    `);
    const { signUp, call } = await server(database);
    await signUp("first", true);
    await signUp("second", true);
    const mine = (await call("first", "GET", "/api/collections")).json();
    expect(mine).toMatchObject([{ name: "Main collection", entryCount: 1, cardCount: 4, role: "owner" }]);
    expect((await call("first", "GET", "/api/decks")).json()).toHaveLength(1);
    expect((await call("second", "GET", "/api/collections")).json()).toMatchObject([{ name: "Main collection", cardCount: 0 }]);
    expect((await call("second", "GET", "/api/decks")).json()).toEqual([]);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'collection_items'").get()).toBeUndefined();
  });

  it("gives every new account a Main collection", async () => {
    const { signUp, call } = await server();
    await signUp("ann", true);
    expect((await call("ann", "GET", "/api/collections")).json()).toMatchObject([{ name: "Main collection", role: "owner", sets: [] }]);
  });

  it("keeps each account's collections private", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    await signUp("bob");
    const col = (await call("ann", "POST", "/api/collections", { name: "Binder" })).json();
    expect((await call("bob", "GET", `/api/collections/${col.id}/cards`)).statusCode).toBe(404);
    expect((await call("bob", "POST", `/api/collections/${col.id}/cards`, { cardId: "t1" })).statusCode).toBe(404);
    expect((await call("bob", "DELETE", `/api/collections/${col.id}`)).statusCode).toBe(404);
  });

  it("validates settings and linked sets", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    expect((await call("ann", "POST", "/api/collections", { name: "" })).json().error).toMatch(/1 to 100/);
    expect((await call("ann", "POST", "/api/collections", { name: "X", completion: "some" })).statusCode).toBe(400);
    expect((await call("ann", "POST", "/api/collections", { name: "X", sets: ["zzz"] })).json().error).toMatch(/not in the card database: ZZZ/);
    const created = (await call("ann", "POST", "/api/collections", { name: "Test", sets: ["TST", "oth"], completion: "all", finish: "foil" })).json();
    expect(created.sets.map((set: { code: string }) => set.code).sort()).toEqual(["oth", "tst"]);
    const edited = (await call("ann", "PATCH", `/api/collections/${created.id}`, { name: "Renamed", sets: [], completion: "main", finish: "any" })).json();
    expect(edited).toMatchObject({ name: "Renamed", sets: [], progress: null });
  });

  it("sets counts in bulk and moves copies between collections", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    const a = (await call("ann", "POST", "/api/collections", { name: "A" })).json().id;
    const b = (await call("ann", "POST", "/api/collections", { name: "B" })).json().id;
    await call("ann", "PUT", `/api/collections/${a}/cards`, { items: [
      { cardId: "t1", foil: false, quantity: 3 }, { cardId: "t2", foil: false, quantity: 2 }, { cardId: "t3", foil: true, quantity: 1 },
    ] });
    const moved = (await call("ann", "POST", `/api/collections/${a}/move`, { to: b, items: [
      { cardId: "t1", foil: false, quantity: 2 }, { cardId: "t3", foil: true, quantity: 5 }, { cardId: "t4", foil: false, quantity: 1 },
    ] })).json().moved;
    expect(moved).toEqual([
      { cardId: "t1", foil: 0, condition: "NM", language: "en", proxy: false, quantity: 2 },
      { cardId: "t3", foil: 1, condition: "NM", language: "en", proxy: false, quantity: 1 },
    ]);
    const left = (await call("ann", "GET", `/api/collections/${a}/cards`)).json();
    expect(left.map((entry: { id: string; quantity: number }) => [entry.id, entry.quantity])).toEqual([["t1", 1], ["t2", 2]]);
    expect((await call("ann", "GET", `/api/collections/${b}/cards`)).json()).toHaveLength(2);
    await call("ann", "PUT", `/api/collections/${a}/cards`, { items: [{ cardId: "t1", foil: false, quantity: 0 }, { cardId: "t2", foil: false, quantity: 0 }] });
    expect((await call("ann", "GET", `/api/collections/${a}/cards`)).json()).toEqual([]);
    expect((await call("ann", "POST", `/api/collections/${a}/move`, { to: a, items: [{ cardId: "t1", foil: false, quantity: 1 }] })).statusCode).toBe(400);
  });

  it("reports owned copies per collection for a card", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    const a = (await call("ann", "POST", "/api/collections", { name: "A" })).json().id;
    const b = (await call("ann", "POST", "/api/collections", { name: "B" })).json().id;
    await call("ann", "POST", `/api/collections/${a}/cards`, { cardId: "t1", quantity: 2, foil: false });
    await call("ann", "POST", `/api/collections/${b}/cards`, { cardId: "o1", quantity: 1, foil: true });
    const owned = (await call("ann", "GET", "/api/cards/t1")).json().owned;
    expect(owned).toMatchObject({ regular: 2, foil: 0, allPrintings: 3 });
    expect(owned.collections).toEqual([
      { id: a, name: "A", wishlist: false, regular: 2, foil: 0, etched: 0, proxies: 0, trade: 0, allPrintings: 2 },
      { id: b, name: "B", wishlist: false, regular: 0, foil: 0, etched: 0, proxies: 0, trade: 0, allPrintings: 1 },
    ]);
  });
});

describe("set completion", () => {
  async function progress(completion: string, finish: string, cards: Array<{ cardId: string; foil: boolean; quantity: number }>) {
    const { signUp, call } = await server();
    await signUp("ann");
    const col = (await call("ann", "POST", "/api/collections", { name: "Set", sets: ["tst"], completion, finish })).json().id;
    if (cards.length) await call("ann", "PUT", `/api/collections/${col}/cards`, { items: cards });
    return (await call("ann", "GET", `/api/collections/${col}/completion`)).json();
  }

  it("main set counts the printed numbers only", async () => {
    const result = await progress("main", "any", [{ cardId: "t1", foil: false, quantity: 1 }, { cardId: "t4", foil: false, quantity: 1 }]);
    expect(result.sets).toMatchObject([{ code: "tst", name: "Test Set", owned: 1, total: 3, printedSize: 3, known: true }]);
    expect(result.missing.map((card: { id: string }) => card.id)).toEqual(["t2", "t3"]);
  });

  it("every printing counts variants and promos", async () => {
    const result = await progress("all", "any", [{ cardId: "t4", foil: true, quantity: 1 }]);
    expect(result.overall).toEqual({ owned: 1, total: 5 });
  });

  it("each card name once counts one copy per card from the linked sets only", async () => {
    const fromOtherSet = await progress("names", "any", [{ cardId: "o1", foil: false, quantity: 1 }]);
    expect(fromOtherSet.overall).toEqual({ owned: 0, total: 3 });
    const variant = await progress("names", "any", [{ cardId: "t4", foil: false, quantity: 1 }, { cardId: "t1p", foil: true, quantity: 1 }]);
    expect(variant.overall).toEqual({ owned: 2, total: 3 });
    expect(variant.missing.map((card: { name: string }) => card.name)).toEqual(["Dragon"]);
  });

  it("applies the finish rules and skips finishes a printing never had", async () => {
    const regular = await progress("main", "regular", [{ cardId: "t1", foil: true, quantity: 1 }]);
    expect(regular.overall).toEqual({ owned: 0, total: 2 });
    const foil = await progress("main", "foil", [{ cardId: "t1", foil: true, quantity: 1 }]);
    expect(foil.overall).toEqual({ owned: 1, total: 2 });
    const both = await progress("main", "both", [{ cardId: "t1", foil: true, quantity: 1 }]);
    expect(both.overall).toEqual({ owned: 1, total: 4 });
    expect(both.missing.map((card: { id: string; needs: string }) => `${card.id}:${card.needs}`)).toEqual(["t1:regular", "t2:regular", "t3:foil"]);
  });

  it("lists sets and shows progress in the collection summary", async () => {
    const { signUp, call } = await server();
    await signUp("ann");
    const sets = (await call("ann", "GET", "/api/sets?q=test")).json();
    expect(sets).toMatchObject([{ code: "tst", name: "Test Set", printed_size: 3, printings: 5 }]);
    await call("ann", "POST", "/api/collections", { name: "Set", sets: ["tst"], completion: "main" });
    await call("ann", "POST", "/api/collections", { name: "Bulk", sets: ["tst"] });
    const list = (await call("ann", "GET", "/api/collections")).json() as Array<{ name: string; completion: string; progress: unknown }>;
    expect(list.find((item) => item.name === "Set")!.progress).toEqual({ owned: 0, total: 3 });
    // a new collection tracks no completion unless a rule is chosen
    expect(list.find((item) => item.name === "Bulk")).toMatchObject({ completion: "none", progress: null });
  });
});

describe("sending and decks", () => {
  async function three() {
    const context = await server();
    for (const name of ["ann", "bob", "cat"]) await context.signUp(name);
    const col = (await context.call("ann", "POST", "/api/collections", { name: "Binder", sets: ["tst"] })).json().id;
    await context.call("ann", "POST", `/api/collections/${col}/cards`, { cardId: "t1", quantity: 2, foil: false });
    return { ...context, col };
  }
  const offer = async (context: Awaited<ReturnType<typeof three>>, from: string, payload: Record<string, unknown>) =>
    context.call(from, "POST", "/api/shares", payload);

  it("lists other accounts", async () => {
    const { call, users } = await three();
    expect((await call("ann", "GET", "/api/users")).json()).toEqual([{ id: users.bob!.id, name: "bob" }, { id: users.cat!.id, name: "cat" }]);
  });

  it("sends a copy that the receiver adds as a new collection or merges", async () => {
    const context = await three();
    const { call, users, col } = context;
    await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "copy" });
    const { inbox } = (await call("bob", "GET", "/api/shares")).json();
    expect(inbox).toMatchObject([{ kind: "collection", itemName: "Binder", mode: "copy", user: "ann" }]);
    expect((await call("ann", "GET", "/api/shares")).json().sent).toHaveLength(1);
    const accepted = (await call("bob", "POST", `/api/shares/${inbox[0].id}/accept`, { name: "Ann's binder" })).json();
    const bobs = (await call("bob", "GET", "/api/collections")).json();
    expect(bobs).toMatchObject([{ id: accepted.id, name: "Ann's binder", cardCount: 2, role: "owner", sets: [{ code: "tst" }] }]);
    expect((await call("ann", "GET", "/api/collections")).json()[0].cardCount).toBe(2);

    await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "copy" });
    const second = (await call("bob", "GET", "/api/shares")).json().inbox[0];
    await call("bob", "POST", `/api/shares/${second.id}/accept`, { mergeInto: accepted.id });
    expect((await call("bob", "GET", "/api/collections")).json()).toMatchObject([{ cardCount: 4 }]);
  });

  it("shares a collection that both edit, and the receiver can leave", async () => {
    const context = await three();
    const { call, users, col } = context;
    await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "share" });
    const share = (await call("bob", "GET", "/api/shares")).json().inbox[0];
    expect((await call("bob", "POST", `/api/shares/${share.id}/accept`, { mergeInto: col })).statusCode).toBe(400);
    await call("bob", "POST", `/api/shares/${share.id}/accept`, { name: "Shared binder" });
    const bobView = (await call("bob", "GET", "/api/collections")).json()[0];
    expect(bobView).toMatchObject({ id: col, name: "Shared binder", role: "member", owner: { name: "ann" } });
    await call("bob", "POST", `/api/collections/${col}/cards`, { cardId: "t2", quantity: 1, foil: false });
    expect((await call("ann", "GET", "/api/collections")).json()[0]).toMatchObject({ name: "Binder", cardCount: 3, sharedWith: [{ name: "bob" }] });
    expect((await call("bob", "DELETE", `/api/collections/${col}`)).statusCode).toBe(403);
    expect((await offer(context, "bob", { kind: "collection", itemId: col, toUser: users.cat!.id, mode: "share" })).statusCode).toBe(403);
    expect((await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "share" })).statusCode).toBe(409);
    await call("bob", "DELETE", `/api/members/collection/${col}/${users.bob!.id}`);
    expect((await call("bob", "GET", "/api/collections")).json()).toEqual([]);
  });

  it("transfers a collection or merges it on transfer", async () => {
    const context = await three();
    const { call, users, col } = context;
    await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "transfer" });
    const share = (await call("bob", "GET", "/api/shares")).json().inbox[0];
    await call("bob", "POST", `/api/shares/${share.id}/accept`, {});
    expect((await call("ann", "GET", "/api/collections")).json()).toEqual([]);
    expect((await call("bob", "GET", "/api/collections")).json()).toMatchObject([{ id: col, role: "owner" }]);

    const target = (await call("cat", "POST", "/api/collections", { name: "Cat's box" })).json().id;
    await offer(context, "bob", { kind: "collection", itemId: col, toUser: users.cat!.id, mode: "transfer" });
    const next = (await call("cat", "GET", "/api/shares")).json().inbox[0];
    await call("cat", "POST", `/api/shares/${next.id}/accept`, { mergeInto: target });
    expect((await call("bob", "GET", "/api/collections")).json()).toEqual([]);
    expect((await call("cat", "GET", "/api/collections")).json()).toMatchObject([{ id: target, cardCount: 2 }]);
  });

  it("declines, cancels and drops offers for deleted items", async () => {
    const context = await three();
    const { call, users, col } = context;
    await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "copy" });
    const first = (await call("bob", "GET", "/api/shares")).json().inbox[0];
    await call("bob", "POST", `/api/shares/${first.id}/decline`, {});
    expect((await call("bob", "GET", "/api/shares")).json().inbox).toEqual([]);
    await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "copy" });
    const second = (await call("ann", "GET", "/api/shares")).json().sent[0];
    await call("ann", "DELETE", `/api/shares/${second.id}`);
    expect((await call("bob", "GET", "/api/shares")).json().inbox).toEqual([]);
    await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.bob!.id, mode: "copy" });
    await call("ann", "DELETE", `/api/collections/${col}`);
    expect((await call("bob", "GET", "/api/shares")).json().inbox).toEqual([]);
    expect((await offer(context, "ann", { kind: "collection", itemId: col, toUser: users.ann!.id, mode: "copy" })).statusCode).toBe(404);
  });

  it("renames, deletes, shares and transfers decks", async () => {
    const context = await three();
    const { call, users } = context;
    const deck = (await call("ann", "POST", "/api/decks", { name: "Burn", mode: "normal" })).json().id;
    await call("ann", "POST", `/api/decks/${deck}/cards`, { cardId: "t1", quantity: 4 });
    expect((await call("ann", "PATCH", `/api/decks/${deck}`, { name: "Big burn" })).json().name).toBe("Big burn");
    expect((await call("bob", "GET", `/api/decks/${deck}`)).statusCode).toBe(404);

    await offer(context, "ann", { kind: "deck", itemId: deck, toUser: users.bob!.id, mode: "share" });
    const share = (await call("bob", "GET", "/api/shares")).json().inbox[0];
    await call("bob", "POST", `/api/shares/${share.id}/accept`, {});
    expect((await call("bob", "GET", `/api/decks/${deck}`)).json()).toMatchObject({ name: "Big burn", role: "member", cards: [{ quantity: 4 }] });
    expect((await call("bob", "DELETE", `/api/decks/${deck}`)).statusCode).toBe(403);

    await offer(context, "bob", { kind: "deck", itemId: deck, toUser: users.cat!.id, mode: "copy" });
    const copy = (await call("cat", "GET", "/api/shares")).json().inbox[0];
    const copied = (await call("cat", "POST", `/api/shares/${copy.id}/accept`, { name: "Cat burn" })).json();
    expect((await call("cat", "GET", `/api/decks/${copied.id}`)).json()).toMatchObject({ name: "Cat burn", role: "owner", cards: [{ quantity: 4 }] });

    expect((await call("ann", "DELETE", `/api/decks/${deck}`)).statusCode).toBe(200);
    expect((await call("bob", "GET", "/api/decks")).json()).toEqual([]);
    expect((await call("cat", "GET", "/api/decks")).json()).toHaveLength(1);
  });
});

describe("backups per account", () => {
  it("backs up and restores only the signed-in account's items", async () => {
    const { app, signUp, call, users } = await server();
    await signUp("ann");
    await signUp("bob");
    const col = (await call("ann", "POST", "/api/collections", { name: "Binder", sets: ["tst"], completion: "names", finish: "both" })).json().id;
    await call("ann", "POST", `/api/collections/${col}/cards`, { cardId: "t1", quantity: 2, foil: true });
    await call("bob", "POST", "/api/collections", { name: "Bob's" });
    const backup = (await call("ann", "GET", "/api/backup")).body;
    expect(JSON.parse(backup)).toMatchObject({ version: 7, collections: [{ name: "Binder", sets: ["tst"], completion: "names", finish: "both" }] });
    await call("ann", "DELETE", `/api/collections/${col}`);
    const raw = (url: string, user: string) => app.inject({
      method: "POST", url, payload: backup,
      headers: { "content-type": "application/vnd.mana-vault.backup+json", "x-mana-vault": "1", cookie: users[user]!.cookie },
    });
    expect((await raw("/api/backup/validate", "ann")).json()).toMatchObject({ collectionCount: 1, collectionEntryCount: 1, deckCount: 0 });
    expect((await raw("/api/backup/restore", "ann")).statusCode).toBe(200);
    expect((await call("ann", "GET", "/api/collections")).json()).toMatchObject([
      { name: "Binder", completion: "names", finish: "both", cardCount: 2, sets: [{ code: "tst" }] },
    ]);
    expect((await call("bob", "GET", "/api/collections")).json()).toMatchObject([{ name: "Bob's" }]);
  });
});

describe("version 1 backups", () => {
  it("restore into a collection named Main collection", async () => {
    const database = new DatabaseSync(":memory:");
    initializeDatabase(database);
    const context = await server(database);
    await context.signUp("ann");
    const v1 = JSON.stringify({
      format: "mana-vault-backup", version: 1, createdAt: "2026-01-01T00:00:00.000Z",
      cards: [{ id: "t1", oracle_id: "o-bolt", name: "Bolt", mana_cost: "{R}", mana_value: 1, type_line: "Instant", oracle_text: "", colors: "R",
        color_identity: "R", legalities: legal, set_code: "tst", set_name: "Test Set", collector_number: "1", rarity: "common", image_url: null,
        released_at: "2024-01-01", artist: "Artist" }],
      collection: [{ card_id: "t1", quantity: 3, foil: 0 }],
      decks: [], deckCards: [],
    });
    const response = await context.app.inject({
      method: "POST", url: "/api/backup/restore", payload: v1,
      headers: { "content-type": "application/vnd.mana-vault.backup+json", "x-mana-vault": "1", cookie: context.users.ann!.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect((await context.call("ann", "GET", "/api/collections")).json()).toMatchObject([{ name: "Main collection", cardCount: 3 }]);
  });
});
