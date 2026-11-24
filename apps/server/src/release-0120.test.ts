// Tests for 0.12.0: the admin role and Administration, sign-up modes and invite codes, settings locked by environment
// variables, whole-server backups, grouped card search, special foils, the new search words, Art and Oracle tags, price
// history and card pictures kept on the server.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type AppOptions } from "./app.js";
import { cardExtrasStatement, cardInsertStatement, cardPricesStatement, cardTreatmentStatement } from "./database.js";
import { importTagFile, snapshotPrices } from "./import-cards.js";
import { settingsFromEnvironment } from "./settings.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const guard = { "x-mana-vault": "1" };
type Reply = Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>["inject"]>>;
type Call = (method: string, url: string, payload?: unknown, headers?: Record<string, string>) => Promise<Reply>;

async function server(options: AppOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "mana-vault-0120-"));
  const databasePath = join(root, "mana-vault.sqlite");
  const database = new DatabaseSync(databasePath);
  const app = await buildApp(database, undefined, undefined, undefined, {
    passwordIterations: 1000, addressAttemptLimit: 1000, databasePath, pictureDownloads: false, settingsEnv: { forced: {}, locks: {} }, ...options,
  });
  closers.push(async () => {
    await app.close();
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  const signUp = async (name: string, extra: Record<string, unknown> = {}) => {
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse", ...extra } });
    return { response, cookie: String(response.headers["set-cookie"] ?? "").split(";")[0]! };
  };
  const as = (cookie: string): Call => async (method, url, payload, headers = {}) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie, ...headers }, ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return { app, database, root, databasePath, signUp, as };
}

function addCards(database: DatabaseSync) {
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const prices = cardPricesStatement(database);
  const treatment = cardTreatmentStatement(database);
  const card = (id: string, oracle: string, name: string, set: string, released: string, options: { promo?: number; promoTypes?: string; type?: string; artist?: string; price?: number } = {}) => {
    insert.run(id, oracle, name, "{1}{G}", 2, options.type ?? "Creature - Cat", "Trample", "G", "G", JSON.stringify({ modern: "legal" }), set, set.toUpperCase(), "1", "common",
      `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg?1700000000`, released, options.artist ?? "Artist");
    extras.run("nonfoil,foil", options.promo ?? 0, 0, id);
    prices.run(options.price ?? 1, 2, null, 1, 2, null, id);
    treatment.run("en", options.promoTypes ?? "", "", "2015", "black", 0, "Trample", "", id);
    database.prepare("UPDATE cards SET power = ?, toughness = ? WHERE id = ?").run("3", "2", id);
  };
  const id = (n: number) => `${n.toString(16).padStart(8, "a")}-0000-4000-8000-000000000000`;
  card(id(1), "o-cat", "Savannah Cat", "m10", "2009-07-17");
  card(id(2), "o-cat", "Savannah Cat", "m21", "2020-07-03");
  card(id(3), "o-cat", "Savannah Cat", "p21", "2021-01-01", { promo: 1, promoTypes: "surgefoil" });
  card(id(4), "o-wall", "Stone Wall", "m10", "2009-07-17", { type: "Creature - Wall", artist: "Rebecca", price: 9 });
  database.prepare("INSERT INTO card_illustrations (card_id, illustration_id) VALUES (?, ?), (?, ?), (?, ?)").run(id(1), "ill-cat", id(2), "ill-cat", id(4), "ill-wall");
  return id;
}

describe("admin role and accounts", () => {
  it("makes the first account the admin and keeps Administration from other accounts", async () => {
    const { signUp, as } = await server();
    const first = await signUp("devon");
    const second = await signUp("alex");
    expect((await as(first.cookie)("GET", "/api/me")).json()).toMatchObject({ name: "devon", admin: true });
    expect((await as(second.cookie)("GET", "/api/me")).json()).toMatchObject({ name: "alex", admin: false });
    expect((await as(second.cookie)("GET", "/api/admin/overview")).statusCode).toBe(403);
    const overview = (await as(first.cookie)("GET", "/api/admin/overview")).json();
    expect(overview.settings.setupDone).toBe(false);
    expect(overview.storage.backups).toEqual([]);
  });

  it("creates accounts with a temporary password that must be changed, turns accounts off and keeps the last admin", async () => {
    const { signUp, as, app } = await server();
    const admin = as((await signUp("devon")).cookie);
    const made = (await admin("POST", "/api/admin/accounts", { name: "sam" })).json() as { id: number; password: string };
    expect(made.password.length).toBeGreaterThanOrEqual(8);
    const login = await app.inject({ method: "POST", url: "/api/login", headers: guard, payload: { name: "sam", password: made.password } });
    const sam = as(String(login.headers["set-cookie"]).split(";")[0]!);
    expect((await sam("GET", "/api/me")).json()).toMatchObject({ mustChange: true });
    await sam("POST", "/api/password", { old: made.password, new: "a new password" });
    // the change keeps this sign-in with a new cookie
    const relog = await app.inject({ method: "POST", url: "/api/login", headers: guard, payload: { name: "sam", password: "a new password" } });
    expect((await as(String(relog.headers["set-cookie"]).split(";")[0]!)("GET", "/api/me")).json()).toMatchObject({ mustChange: false });

    expect((await admin("PUT", `/api/admin/accounts/${made.id}`, { disabled: true })).statusCode).toBe(200);
    const refused = await app.inject({ method: "POST", url: "/api/login", headers: guard, payload: { name: "sam", password: "a new password" } });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toContain("turned off");

    const me = (await admin("GET", "/api/admin/accounts")).json().find((account: { you: boolean }) => account.you);
    expect((await admin("PUT", `/api/admin/accounts/${me.id}`, { admin: false })).statusCode).toBe(400);
    const activity = (await admin("GET", "/api/admin/activity")).json() as Array<{ kind: string }>;
    expect(activity.some((row) => row.kind === "Failed sign-in")).toBe(true);
  });

  it("deletes an account and moves its collections and decks to another account", async () => {
    const { signUp, as } = await server();
    const admin = as((await signUp("devon")).cookie);
    const alexSession = await signUp("alex");
    const alex = as(alexSession.cookie);
    await alex("POST", "/api/decks", { name: "Cats", format: "modern" });
    const accounts = (await admin("GET", "/api/admin/accounts")).json() as Array<{ id: number; name: string }>;
    const alexId = accounts.find((account) => account.name === "alex")!.id;
    const devonId = accounts.find((account) => account.name === "devon")!.id;
    expect((await admin("DELETE", `/api/admin/accounts/${alexId}?transferTo=${devonId}`)).statusCode).toBe(200);
    expect(((await admin("GET", "/api/decks")).json() as Array<{ name: string }>).map((deck) => deck.name)).toContain("Cats");
    expect((await alex("GET", "/api/me")).statusCode).toBe(401);
  });
});

describe("sign-up modes and settings", () => {
  it("asks for a one-time invite code when sign-up is by invite, and refuses everyone when closed", async () => {
    const { signUp, as, app } = await server();
    const admin = as((await signUp("devon")).cookie);
    await admin("PUT", "/api/admin/settings", { signup: "invite" });
    expect((await app.inject({ method: "GET", url: "/api/config" })).json()).toMatchObject({ signup: true, signupMode: "invite" });
    expect((await signUp("alex")).response.statusCode).toBe(403);
    const { code } = (await admin("POST", "/api/admin/invites", { note: "Alex" })).json() as { code: string };
    expect((await signUp("alex", { invite: code.toLowerCase() })).response.statusCode).toBe(200);
    expect((await signUp("sam", { invite: code })).response.statusCode).toBe(403);
    expect(((await admin("GET", "/api/admin/invites")).json() as Array<{ usedBy: string }>)[0]!.usedBy).toBe("alex");
    await admin("PUT", "/api/admin/settings", { signup: "closed" });
    expect((await app.inject({ method: "GET", url: "/api/config" })).json().signup).toBe(false);
    expect((await signUp("sam")).response.statusCode).toBe(403);
  });

  it("locks settings set by environment variables and says which variable sets them", async () => {
    const settingsEnv = settingsFromEnvironment({ MANAVAULT_SIGNUP: "off", MANAVAULT_CARD_UPDATE_INTERVAL_HOURS: "24", MANAVAULT_PICTURES_DIR: "/pictures" });
    expect(settingsEnv.forced).toMatchObject({ signup: "closed", updateIntervalHours: 24, picturesDir: "/pictures" });
    const { signUp, as } = await server({ settingsEnv });
    const admin = as((await signUp("devon")).cookie);
    const overview = (await admin("GET", "/api/admin/overview")).json();
    expect(overview.locks).toMatchObject({ signup: "MANAVAULT_SIGNUP", updateIntervalHours: "MANAVAULT_CARD_UPDATE_INTERVAL_HOURS", picturesDir: "MANAVAULT_PICTURES_DIR" });
    const refused = await admin("PUT", "/api/admin/settings", { signup: "open" });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toContain("MANAVAULT_SIGNUP");
    expect((await admin("PUT", "/api/admin/settings", { serverName: "Devon's vault", minPasswordLength: 10 })).statusCode).toBe(200);
    expect((await signUp("alex")).response.statusCode).toBe(403);
  });

  it("refuses passwords shorter than the minimum length setting", async () => {
    const { signUp, as, app } = await server();
    const admin = as((await signUp("devon")).cookie);
    await admin("PUT", "/api/admin/settings", { minPasswordLength: 16 });
    expect((await app.inject({ method: "GET", url: "/api/config" })).json().minPasswordLength).toBe(16);
    const short = await signUp("alex");
    expect(short.response.statusCode).toBe(400);
    expect(short.response.json().error).toContain("16");
  });
});

describe("whole-server backups", () => {
  it("writes a backup, lists, downloads and deletes it, and keeps only the newest ones", async () => {
    const { signUp, as } = await server();
    const admin = as((await signUp("devon")).cookie);
    await admin("PUT", "/api/admin/settings", { backupKeep: 1 });
    const made = (await admin("POST", "/api/admin/backups")).json() as { name: string; backups: Array<{ name: string }> };
    expect(made.name).toMatch(/^mana-vault-\d{8}-\d{6}\.sqlite$/);
    const download = await admin("GET", `/api/admin/backups/${made.name}`);
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.subarray(0, 15).toString()).toBe("SQLite format 3");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = (await admin("POST", "/api/admin/backups")).json() as { backups: Array<{ name: string }> };
    expect(second.backups.length).toBe(1);
    expect((await admin("GET", "/api/admin/backups/..%2Fmana-vault.sqlite")).statusCode).toBe(404);
    expect((await admin("DELETE", `/api/admin/backups/${second.backups[0]!.name}`)).json().backups).toEqual([]);
  });

  it("puts a restored backup in place for the next start", async () => {
    const { signUp, as, databasePath } = await server();
    const admin = as((await signUp("devon")).cookie);
    const made = (await admin("POST", "/api/admin/backups")).json() as { name: string };
    expect((await admin("POST", `/api/admin/restore?from=${made.name}`)).json()).toMatchObject({ status: "restoring" });
    expect(existsSync(`${databasePath}.restore`)).toBe(true);
    const bad = await admin("POST", "/api/admin/restore", Buffer.from("not a database"), { "content-type": "application/vnd.sqlite3" });
    expect(bad.statusCode).toBe(400);
  });
});

describe("grouped card search, special foils and search words", () => {
  it("groups printings by card name with the newest regular printing and a printings count", async () => {
    const { signUp, as, database } = await server();
    const call = as((await signUp("devon")).cookie);
    const id = addCards(database);
    const grouped = (await call("GET", "/api/cards?q=&paged=1&group=1&limit=50")).json() as { total: number; cards: Array<{ id: string; name: string; printings: number }> };
    expect(grouped.total).toBe(2);
    const cat = grouped.cards.find((card) => card.name === "Savannah Cat")!;
    expect(cat).toMatchObject({ id: id(2), printings: 3 });
    const all = (await call("GET", "/api/cards?q=&paged=1&limit=50")).json() as { total: number };
    expect(all.total).toBe(4);
  });

  it("sums owned copies by finish over every printing of a grouped card", async () => {
    const { signUp, as, database } = await server();
    const call = as((await signUp("devon")).cookie);
    const id = addCards(database);
    const main = (await call("GET", "/api/collections")).json()[0].id as string;
    await call("POST", `/api/collections/${main}/cards/add`, { items: [
      { cardId: id(1), foil: 0, condition: "NM", language: "en", quantity: 2 }, { cardId: id(3), foil: 1, condition: "NM", language: "en", quantity: 1 },
    ] });
    const cat = ((await call("GET", "/api/cards?q=savannah&paged=1&group=1")).json().cards as Array<{ owned: number; ownedFinishes: Record<string, number> }>)[0]!;
    expect(cat).toMatchObject({ owned: 3, ownedFinishes: { regular: 2, foil: 1, etched: 0 } });
    // is:owned matches every printing of a card name with an owned copy
    expect(((await call("GET", "/api/cards?q=is:owned&paged=1")).json().cards as Array<{ id: string }>).map((card) => card.id).sort()).toEqual([id(1), id(2), id(3)].sort());
  });

  it("names special foils and finds them with is:surgefoil", async () => {
    const { signUp, as, database } = await server();
    const call = as((await signUp("devon")).cookie);
    const id = addCards(database);
    const found = (await call("GET", "/api/cards?q=is:surgefoil&paged=1")).json().cards as Array<{ id: string; promo_types: string[] }>;
    expect(found.map((card) => card.id)).toEqual([id(3)]);
    expect(found[0]!.promo_types).toContain("surgefoil");
  });

  it("reads power, toughness, year, artist, keyword and frame words", async () => {
    const { signUp, as, database } = await server();
    const call = as((await signUp("devon")).cookie);
    addCards(database);
    const names = async (q: string) => ((await call("GET", `/api/cards?q=${encodeURIComponent(q)}&paged=1&group=1`)).json().cards as Array<{ name: string }>).map((card) => card.name);
    expect(await names("pow>=3 tou<=2")).toEqual(["Savannah Cat", "Stone Wall"]);
    expect(await names("year>=2020")).toEqual(["Savannah Cat"]);
    expect(await names("a:rebecca")).toEqual(["Stone Wall"]);
    expect(await names("kw:trample frame:2015")).toEqual(["Savannah Cat", "Stone Wall"]);
    expect(await names("-t:wall")).toEqual(["Savannah Cat"]);
  });

  it("supports grouped syntax and color comparisons in search and match", async () => {
    const { signUp, as, database } = await server();
    const call = as((await signUp("syntax")).cookie);
    const id = addCards(database);
    database.prepare("UPDATE cards SET colors = 'G,U', color_identity = 'G,U' WHERE id = ?").run(id(4));
    database.prepare("UPDATE cards SET oracle_text = NULL WHERE id = ?").run(id(4));
    const ids = async (q: string, match = false) => {
      const path = match ? "/api/cards/match" : "/api/cards";
      const response = await call("GET", `${path}?q=${encodeURIComponent(q)}${match ? "" : "&paged=1"}`);
      expect(response.statusCode).toBe(200);
      return (match ? response.json().ids : response.json().cards.map((card: { id: string }) => card.id)).sort();
    };
    for (const match of [false, true]) {
      expect(await ids('t:creature (e:m21 or !"Stone Wall")', match)).toEqual([id(2), id(4)].sort());
      expect(await ids('-(t:wall or s:m21) -cat', match)).toEqual([]);
      expect(await ids("identity<=simic c>g c=2 manavalue!=1", match)).toEqual([id(4)]);
      expect(await ids("c=g", match)).toEqual([id(1), id(2), id(3)].sort());
      expect(await ids("c!=g", match)).toEqual([id(4)]);
      expect(await ids("r:c manavalue:even", match)).toEqual([id(1), id(2), id(3), id(4)].sort());
      expect(await ids("-(o:trample)", match)).toEqual([id(4)]);
    }
    database.prepare("UPDATE cards SET mana_value = NULL WHERE id = ?").run(id(1));
    expect(await ids("-mv:even")).toEqual([id(1)]);
    const bad = await call("GET", `/api/cards?q=${encodeURIComponent("(t:cat or")}`);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain("Expected a search term");
  });
});

describe("Art and Oracle tags", () => {
  it("imports tag files and finds cards by what the art shows and by role, including child tags", async () => {
    const { signUp, as, database, root } = await server();
    const call = as((await signUp("devon")).cookie);
    const id = addCards(database);
    const artFile = join(root, "art.json");
    await writeFile(artFile, JSON.stringify([
      { id: "t-animal", label: "animal", description: "An animal", illustration_ids: [], child_ids: ["t-cat"] },
      { id: "t-cat", label: "cat", taggings: [{ illustration_id: "ill-cat" }] },
    ]));
    const oracleFile = join(root, "oracle.jsonl");
    await writeFile(oracleFile, `${JSON.stringify({ id: "t-wall", label: "wall-defense", oracle_ids: ["o-wall"] })}\n${JSON.stringify({ id: "t-beater", label: "beater", oracle_ids: ["o-cat"] })}\n`);
    expect(await importTagFile(database, artFile, "art")).toBe(2);
    expect(await importTagFile(database, oracleFile, "oracle")).toBe(2);
    const ids = async (q: string) => ((await call("GET", `/api/cards/match?q=${encodeURIComponent(q)}`)).json().ids as string[]).sort();
    expect(await ids("art:cat")).toEqual([id(1), id(2)].sort());
    expect(await ids("art:animal")).toEqual([id(1), id(2)].sort());
    expect(await ids("role:wall-defense")).toEqual([id(4)]);
    const suggestions = (await call("GET", "/api/tags?kind=art&q=ca")).json() as Array<{ label: string; uses: number }>;
    expect(suggestions[0]).toMatchObject({ label: "cat", uses: 1 });
  });
});

describe("price history", () => {
  it("saves a day's prices only when they changed and shows the history of a printing", async () => {
    const { signUp, as, database } = await server();
    const call = as((await signUp("devon")).cookie);
    const id = addCards(database);
    expect(snapshotPrices(database, "2026-11-01")).toBe(4);
    expect(snapshotPrices(database, "2026-11-02")).toBe(0);
    database.prepare("UPDATE cards SET price_usd = 5 WHERE id = ?").run(id(4));
    expect(snapshotPrices(database, "2026-11-03")).toBe(1);
    const history = (await call("GET", `/api/cards/${id(4)}/prices`)).json() as Array<{ day: string; usd: number }>;
    expect(history).toEqual([expect.objectContaining({ day: "2026-11-01", usd: 9 }), expect.objectContaining({ day: "2026-11-03", usd: 5 })]);
  });
});

describe("card pictures kept on the server", () => {
  it("points picture addresses at the server and sends Scryfall's picture until one is downloaded", async () => {
    const { signUp, as, database, root } = await server();
    const call = as((await signUp("devon")).cookie);
    const id = addCards(database);
    const card = (await call("GET", `/api/cards/${id(4)}`)).json() as { image_url: string };
    expect(card.image_url.startsWith("/pictures/normal/front/")).toBe(true);
    const path = card.image_url.split("?")[0]!.slice("/pictures/".length);
    const redirect = await call("GET", card.image_url);
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toContain(`https://cards.scryfall.io/${path}`);
    // a downloaded copy is sent from the picture folder (pictures in the data folder by default)
    const local = join(root, "pictures", path);
    await mkdir(join(local, ".."), { recursive: true });
    await writeFile(local, Buffer.from([0xff, 0xd8, 0xff]));
    const served = await call("GET", card.image_url);
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");
    expect((await call("GET", "/pictures/normal/front/../../../mana-vault.sqlite")).statusCode).toBe(404);
  });

  it("never creates a chosen picture folder that is missing", async () => {
    const { signUp, as, root } = await server();
    const admin = as((await signUp("devon")).cookie);
    const missing = join(root, "unplugged-drive", "pictures");
    await admin("PUT", "/api/admin/settings", { picturesDir: missing });
    const summary = (await admin("GET", "/api/admin/pictures")).json();
    expect(summary).toMatchObject({ available: false, folder: missing });
    expect(existsSync(missing)).toBe(false);
  });

  it("moves the pictures to a new folder, then uses it", async () => {
    const { signUp, as, root, app } = await server();
    const admin = as((await signUp("devon")).cookie);
    const from = join(root, "pictures", "small", "front", "a", "b");
    await mkdir(from, { recursive: true });
    expect((await admin("GET", "/api/admin/pictures")).json().available).toBe(true);
    await writeFile(join(from, "aaaaaaaa-0000-4000-8000-000000000000.jpg"), "picture");
    const target = join(root, "big-drive");
    await admin("POST", "/api/admin/pictures/move", { path: target });
    for (let tries = 0; tries < 50 && app.serverSettings.get().picturesDir !== target; tries += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(app.serverSettings.get().picturesDir).toBe(target);
    expect(await readFile(join(target, "small", "front", "a", "b", "aaaaaaaa-0000-4000-8000-000000000000.jpg"), "utf8")).toBe("picture");
  });
});
