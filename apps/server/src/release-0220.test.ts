// Tests for 0.22.0: notes pages in trees on decks, collections and on their own; links, versions, clashes, sharing,
// pictures, templates, search, import, export, backups and the deck description as the deck's top page.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardExtrasStatement, cardInsertStatement } from "./database.js";
import { areasOf } from "./events.js";
import { BUILT_IN_TEMPLATES, plainText, pruneVersions } from "./notes.js";
import { saveSets } from "./sets.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function setup() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000, pictureDownloads: false });
  closers.push(async () => { await app.close(); database.close(); });
  saveSets(database, { data: [{ code: "lea", name: "Alpha", set_type: "core", released_at: "1993-08-05" }] });
  const insert = cardInsertStatement(database);
  insert.run("sol", "o-sol", "Sol Ring", "{1}", 1, "Artifact", "", "", "", "{}", "lea", "Alpha", "1", "uncommon", "https://example.com/sol.jpg", "1993-08-05", "Artist");
  cardExtrasStatement(database).run("nonfoil", 0, 0, "sol");
  const guard = { "x-mana-vault": "1" };
  const signUp = async (name: string) => {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
    const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
    return (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({
      method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie, ...headers }, ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  };
  return { app, database, call: await signUp("ann"), signUp };
}

describe("notes pages", () => {
  it("adds the built-in guide at the end and preserves its moved position through a backup", async () => {
    const { call, signUp } = await setup();
    const existing = (await call("POST", "/api/notes/pages", { title: "Existing" })).json();
    let tree = (await call("GET", "/api/notes")).json();
    const guide = tree.pages.find((page: { builtin: string | null }) => page.builtin === "about");
    expect(guide).toMatchObject({ title: "About Mana Vault", parentId: null, kind: null });
    expect(tree.pages.map((page: { title: string }) => page.title)).toEqual(["Existing", "About Mana Vault"]);
    await call("POST", "/api/notes/pages", { title: "New" });
    tree = (await call("GET", "/api/notes")).json();
    expect(tree.pages.map((page: { title: string }) => page.title)).toEqual(["Existing", "New", "About Mana Vault"]);
    await call("POST", "/api/notes/import", { pages: [{ key: "Imported", title: "Imported" }] });
    tree = (await call("GET", "/api/notes")).json();
    expect(tree.pages.map((page: { title: string }) => page.title)).toEqual(["Existing", "New", "Imported", "About Mana Vault"]);
    await call("PATCH", `/api/notes/pages/${guide.id}/move`, { parentId: null, before: existing.id });
    await call("POST", "/api/notes/pages", { title: "After move" });
    tree = (await call("GET", "/api/notes")).json();
    expect(tree.pages.map((page: { title: string }) => page.title)).toEqual(["About Mana Vault", "Existing", "New", "Imported", "After move"]);
    expect((await call("PATCH", `/api/notes/pages/${guide.id}/move`, { parentId: existing.id })).statusCode).toBe(200);
    tree = (await call("GET", "/api/notes")).json();
    expect(tree.pages.filter((page: { builtin: string | null }) => page.builtin === "about")).toHaveLength(1);
    expect(tree.pages.find((page: { id: string }) => page.id === guide.id).parentId).toBe(existing.id);
    expect((await call("DELETE", `/api/notes/pages/${guide.id}`)).statusCode).toBe(400);
    expect((await call("DELETE", `/api/notes/pages/${existing.id}`)).statusCode).toBe(400);
    const other = await signUp("bob");
    const otherTree = (await other("GET", "/api/notes")).json();
    expect(otherTree.pages).toHaveLength(1);
    expect(otherTree.pages[0].id).not.toBe(guide.id);
    const backup = (await call("GET", "/api/backup")).body;
    expect((await call("POST", "/api/backup/restore", backup, { "content-type": "application/vnd.mana-vault.backup+json" })).statusCode).toBeLessThan(300);
    tree = (await call("GET", "/api/notes")).json();
    const restored = tree.pages.find((page: { builtin: string | null }) => page.builtin === "about");
    expect(restored.parentId).toBe(tree.pages.find((page: { title: string }) => page.title === "Existing").id);
    expect(tree.pages.filter((page: { builtin: string | null }) => page.builtin === "about")).toHaveLength(1);
  });

  it("makes a deck's top page from its description, and keeps the two the same", async () => {
    const { call } = await setup();
    const deck = (await call("POST", "/api/decks", { name: "Elves" })).json();
    await call("PATCH", `/api/decks/${deck.id}`, { description: "Go wide" });
    const top = (await call("POST", `/api/notes/items/deck/${deck.id}`, {})).json();
    expect(top).toMatchObject({ title: "Elves", body: "Go wide", top: true, kind: "deck", itemId: deck.id });
    const saved = (await call("PUT", `/api/notes/pages/${top.id}`, { body: "## Plan\n\nGo wider", baseVersion: top.version })).json();
    expect(saved.version).toBe(top.version + 1);
    expect((await call("GET", `/api/decks/${deck.id}`)).json().description).toBe("## Plan\n\nGo wider");
    expect((await call("GET", `/api/decks/${deck.id}/history`)).json().map((item: { change: string }) => item.change)).toContain("Description changed");
    // the same top page every time
    expect((await call("POST", `/api/notes/items/deck/${deck.id}`, {})).json().id).toBe(top.id);
    // renaming the deck names its top page
    await call("PATCH", `/api/decks/${deck.id}`, { name: "Elf Ball" });
    expect((await call("GET", `/api/notes/pages/${top.id}`)).json().title).toBe("Elf Ball");
    expect((await call("DELETE", `/api/notes/pages/${top.id}`)).statusCode).toBe(400);
  });

  it("builds trees with child pages, moves them and puts them in order", async () => {
    const { call } = await setup();
    const collection = (await call("GET", "/api/collections")).json()[0];
    const top = (await call("POST", `/api/notes/items/collection/${collection.id}`, {})).json();
    const a = (await call("POST", "/api/notes/pages", { title: "A", parentId: top.id })).json();
    const b = (await call("POST", "/api/notes/pages", { title: "B", parentId: top.id })).json();
    const child = (await call("POST", "/api/notes/pages", { title: "A1", parentId: a.id })).json();
    const mine = (await call("POST", "/api/notes/pages", { id: "11111111-2222-4333-8444-555555555555", title: "Loose" })).json();
    expect(mine).toMatchObject({ id: "11111111-2222-4333-8444-555555555555", kind: null, parentId: null });
    // sending the same page again (the phone after a lost answer) returns it
    expect((await call("POST", "/api/notes/pages", { id: mine.id, title: "Loose" })).statusCode).toBe(200);
    let tree = (await call("GET", "/api/notes")).json();
    expect(tree.items).toEqual([{ kind: "collection", id: collection.id, name: collection.name }]);
    const order = (parent: string) => tree.pages.filter((page: { parentId: string }) => page.parentId === parent)
      .sort((x: { position: number }, y: { position: number }) => x.position - y.position).map((page: { title: string }) => page.title);
    expect(order(top.id)).toEqual(["A", "B"]);
    await call("PATCH", `/api/notes/pages/${b.id}/move`, { parentId: top.id, before: a.id });
    tree = (await call("GET", "/api/notes")).json();
    expect(order(top.id)).toEqual(["B", "A"]);
    // a page cannot go under its own child
    expect((await call("PATCH", `/api/notes/pages/${a.id}/move`, { parentId: child.id })).statusCode).toBe(400);
    // moving out to My pages takes the children along and makes them private
    await call("PATCH", `/api/notes/pages/${a.id}/move`, { parentId: null });
    tree = (await call("GET", "/api/notes")).json();
    const moved = tree.pages.find((page: { id: string }) => page.id === child.id);
    expect(moved).toMatchObject({ kind: null, itemId: null, parentId: a.id });
    // and back under the collection, by naming the collection
    await call("PATCH", `/api/notes/pages/${a.id}/move`, { kind: "collection", itemId: collection.id });
    tree = (await call("GET", "/api/notes")).json();
    expect(tree.pages.find((page: { id: string }) => page.id === child.id)).toMatchObject({ kind: "collection", itemId: collection.id });
    expect(tree.pages.find((page: { id: string }) => page.id === a.id).parentId).toBe(top.id);
  });

  it("deletes a page with its children or moves them up, and undo puts them back", async () => {
    const { call } = await setup();
    const parent = (await call("POST", "/api/notes/pages", { title: "Parent" })).json();
    const child = (await call("POST", "/api/notes/pages", { title: "Child", parentId: parent.id })).json();
    const all = (await call("DELETE", `/api/notes/pages/${parent.id}`)).json();
    expect(all.undo.deleted.sort()).toEqual([parent.id, child.id].sort());
    expect((await call("GET", "/api/notes")).json().pages.map((page: { title: string }) => page.title)).toEqual(["About Mana Vault"]);
    await call("POST", "/api/notes/restore", all.undo);
    expect((await call("GET", "/api/notes")).json().pages).toHaveLength(3);
    const lift = (await call("DELETE", `/api/notes/pages/${parent.id}?children=lift`)).json();
    let pages = (await call("GET", "/api/notes")).json().pages;
    expect(pages.filter((page: { builtin: string | null }) => !page.builtin).map((page: { title: string; parentId: string | null }) => [page.title, page.parentId])).toEqual([["Child", null]]);
    await call("POST", "/api/notes/restore", lift.undo);
    pages = (await call("GET", "/api/notes")).json().pages;
    expect(pages.find((page: { id: string }) => page.id === child.id).parentId).toBe(parent.id);
  });

  it("updates links when a page is renamed and lists backlinks", async () => {
    const { call } = await setup();
    const target = (await call("POST", "/api/notes/pages", { title: "Combo" })).json();
    const linking = (await call("POST", "/api/notes/pages", { title: "Plan", body: "See [[Combo]] and [[card:Sol Ring]]" })).json();
    expect((await call("GET", `/api/notes/pages/${target.id}`)).json().backlinks).toEqual([{ id: linking.id, title: "Plan" }]);
    const renamed = (await call("PUT", `/api/notes/pages/${target.id}`, { title: "Infinite combo", baseVersion: target.version })).json();
    expect(renamed.renamed).toBe(1);
    expect((await call("GET", `/api/notes/pages/${linking.id}`)).json().body).toBe("See [[Infinite combo]] and [[card:Sol Ring]]");
    expect((await call("GET", "/api/notes/card?name=sol ring")).json()).toMatchObject({ id: "sol", image_url: "https://example.com/sol.jpg" });
    expect((await call("GET", "/api/notes/card?name=Nope")).statusCode).toBe(404);
  });

  it("finds text in every page and shows where", async () => {
    const { call } = await setup();
    await call("POST", "/api/notes/pages", { title: "Mulligans", body: "Keep a hand with **two lands** and an elf." });
    await call("POST", "/api/notes/pages", { title: "Other", body: "Nothing here." });
    const found = (await call("GET", "/api/notes/search?q=two lands")).json();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ title: "Mulligans" });
    expect(found[0].snippet).toContain("two lands");
    expect(plainText("# Head\n\n- [x] **bold** [[card:Sol Ring]] ![p](/x.png)")).toBe("Head bold Sol Ring");
  });

  it("keeps versions, joins quick saves, warns on a clash and restores a version", async () => {
    const { call, signUp, database } = await setup();
    const deck = (await call("POST", "/api/decks", { name: "Shared" })).json();
    const bob = await signUp("bob");
    await call("POST", `/api/decks/${deck.id}/members`, { name: "bob" });
    const bobId = Number(database.prepare("SELECT id FROM users WHERE name = 'bob'").get()!.id);
    database.prepare("INSERT OR IGNORE INTO members (kind, item_id, user_id) VALUES ('deck', ?, ?)").run(deck.id, bobId);
    const page = (await call("POST", "/api/notes/pages", { title: "Guide", kind: "deck", itemId: deck.id, body: "one" })).json();
    const tab = { "x-mana-vault-client": "tab-a" };
    await call("PUT", `/api/notes/pages/${page.id}`, { body: "one two", baseVersion: page.version }, tab);
    await call("PUT", `/api/notes/pages/${page.id}`, { body: "one two three", baseVersion: page.version + 1 }, tab);
    // the member reads and edits it
    const seen = (await bob("GET", `/api/notes/pages/${page.id}`)).json();
    expect(seen.body).toBe("one two three");
    await bob("PUT", `/api/notes/pages/${page.id}`, { body: "bob was here", baseVersion: seen.version });
    // ann's next save is from an older version: a clash with bob's text
    const clash = await call("PUT", `/api/notes/pages/${page.id}`, { body: "ann again", baseVersion: page.version + 2 }, tab);
    expect(clash.statusCode).toBe(409);
    expect(clash.json().conflict).toMatchObject({ body: "bob was here", updatedBy: "bob" });
    expect((await call("PUT", `/api/notes/pages/${page.id}`, { body: "ann again", baseVersion: page.version + 2, force: true }, tab)).statusCode).toBe(200);
    const versions = (await call("GET", `/api/notes/pages/${page.id}/versions`)).json();
    // the two quick saves from one tab joined into one version; bob's is its own
    expect(versions.map((version: { body: string; by: string }) => [version.by, version.body]))
      .toEqual([["ann", "ann again"], ["bob", "bob was here"], ["ann", "one two three"], ["ann", "one"]]);
    const restored = (await call("POST", `/api/notes/pages/${page.id}/versions/${versions[2].id}/restore`)).json();
    expect(restored.body).toBe("one two three");
    // pages of a private deck are not seen by others
    const carl = await signUp("carl");
    expect((await carl("GET", `/api/notes/pages/${page.id}`)).statusCode).toBe(404);
    expect((await carl("GET", "/api/notes")).json().pages.map((item: { title: string }) => item.title)).toEqual(["About Mana Vault"]);
    const loose = (await call("POST", "/api/notes/pages", { title: "Private" })).json();
    expect((await bob("GET", `/api/notes/pages/${loose.id}`)).statusCode).toBe(404);
  });

  it("prunes old versions to 50 plus one a day", async () => {
    const { call, database } = await setup();
    const page = (await call("POST", "/api/notes/pages", { title: "Many" })).json();
    const insert = database.prepare("INSERT INTO note_versions (page_id, title, body, at, by) VALUES (?, 'Many', ?, ?, 1)");
    for (let index = 0; index < 60; index += 1) insert.run(page.id, `v${index}`, `2026-11-${String(10 + Math.floor(index / 10)).padStart(2, "0")} 10:${String(index % 60).padStart(2, "0")}:00.000`);
    pruneVersions(database, page.id);
    expect(Number(database.prepare("SELECT COUNT(*) AS n FROM note_versions WHERE page_id = ?").get(page.id)!.n)).toBe(51);
  });

  it("pins, keeps recent pages, and offers built-in and own templates", async () => {
    const { call } = await setup();
    const page = (await call("POST", "/api/notes/pages", { title: "Pinned" })).json();
    await call("PUT", `/api/notes/pages/${page.id}/pin`, { pinned: true });
    await call("POST", `/api/notes/pages/${page.id}/opened`);
    let tree = (await call("GET", "/api/notes")).json();
    expect(tree.pages[0].pinned).toBe(true);
    expect(tree.recent).toEqual([page.id]);
    expect(tree.templates.filter((item: { builtIn: boolean }) => item.builtIn).map((item: { name: string }) => item.name)).toEqual(BUILT_IN_TEMPLATES.map((item) => item.name));
    const template = (await call("POST", "/api/notes/templates", { name: "Mine", body: "## Mine" })).json();
    await call("PATCH", `/api/notes/templates/${template.id}`, { name: "Renamed" });
    tree = (await call("GET", "/api/notes")).json();
    expect(tree.templates.at(-1)).toMatchObject({ name: "Renamed", body: "## Mine", builtIn: false });
    expect((await call("DELETE", `/api/notes/templates/${template.id}`)).json().template.name).toBe("Renamed");
  });

  it("keeps pictures, serves them by their code and refuses other files", async () => {
    const { call, app } = await setup();
    const page = (await call("POST", "/api/notes/pages", { title: "Pics" })).json();
    const file = (await call("POST", "/api/notes/files", { pageId: page.id, name: "dot.png", type: "image/png", data: PNG })).json();
    expect(file.url).toBe(`/api/notes/files/${file.id}`);
    const served = await app.inject({ method: "GET", url: file.url });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect((await call("POST", "/api/notes/files", { pageId: page.id, name: "a.exe", type: "application/octet-stream", data: PNG })).statusCode).toBe(400);
  });

  it("imports markdown folders with pictures and exports trees", async () => {
    const { call } = await setup();
    const result = (await call("POST", "/api/notes/import", {
      pages: [
        { key: "Guides", title: "Guides", body: "" },
        { key: "Guides/Elves", parentKey: "Guides", title: "Elves", body: "![dot](attachments/dot.png) and ![[dot.png]] and [[Guides]]" },
      ],
      files: [{ name: "attachments/dot.png", type: "image/png", data: PNG }],
    })).json();
    expect(result.created).toBe(2);
    const exported = (await call("GET", "/api/notes/export")).json();
    const elves = exported.pages.find((page: { title: string }) => page.title === "Elves");
    expect(elves.parentId).toBe(exported.pages.find((page: { title: string }) => page.title === "Guides").id);
    expect(elves.body).toMatch(/^!\[dot\]\(\/api\/notes\/files\/[0-9a-f-]{36}\) and !\[dot\.png\]\(\/api\/notes\/files\/[0-9a-f-]{36}\) and \[\[Guides\]\]$/);
    const one = (await call("GET", `/api/notes/export?page=${elves.id}`)).json();
    expect(one.pages.map((page: { title: string }) => page.title)).toEqual(["Elves"]);
  });

  it("backs up notes and restores them onto the restored decks", async () => {
    const { call } = await setup();
    const deck = (await call("POST", "/api/decks", { name: "Backed" })).json();
    const top = (await call("POST", `/api/notes/items/deck/${deck.id}`, {})).json();
    await call("PUT", `/api/notes/pages/${top.id}`, { body: "Primer", baseVersion: top.version });
    await call("POST", "/api/notes/pages", { title: "Sideboard", parentId: top.id, body: "Bring in" });
    const loose = (await call("POST", "/api/notes/pages", { title: "Loose" })).json();
    await call("PUT", `/api/notes/pages/${loose.id}/pin`, { pinned: true });
    await call("POST", "/api/notes/templates", { name: "Mine", body: "x" });
    const backup = (await call("GET", "/api/backup")).body;
    expect(JSON.parse(backup).notes.pages).toHaveLength(3);
    await call("POST", "/api/notes/pages", { title: "Made later" });
    const restored = await call("POST", "/api/backup/restore", backup, { "content-type": "application/vnd.mana-vault.backup+json" });
    expect(restored.statusCode).toBeLessThan(300);
    const tree = (await call("GET", "/api/notes")).json();
    expect(tree.pages.map((page: { title: string }) => page.title).sort()).toEqual(["About Mana Vault", "Backed", "Loose", "Sideboard"]);
    const newDeck = (await call("GET", "/api/decks")).json()[0];
    expect(tree.pages.find((page: { top: boolean }) => page.top).itemId).toBe(newDeck.id);
    expect(newDeck.description ?? (await call("GET", `/api/decks/${newDeck.id}`)).json().description).toBe("Primer");
    expect(tree.pages.find((page: { title: string }) => page.title === "Loose").pinned).toBe(true);
    expect(tree.templates.some((item: { name: string }) => item.name === "Mine")).toBe(true);
  });

  it("deletes a deck's notes with the deck and tells open pages about note changes", async () => {
    const { call } = await setup();
    const deck = (await call("POST", "/api/decks", { name: "Gone" })).json();
    await call("POST", "/api/notes/pages", { title: "Child", kind: "deck", itemId: deck.id });
    expect((await call("GET", "/api/notes")).json().pages).toHaveLength(3);
    await call("DELETE", `/api/decks/${deck.id}`);
    expect((await call("GET", "/api/notes")).json().pages.map((page: { title: string }) => page.title)).toEqual(["About Mana Vault"]);
    expect(areasOf("/api/notes/pages/x")).toEqual(["notes"]);
  });
});
