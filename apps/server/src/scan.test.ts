import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardExtrasStatement, cardInsertStatement, initializeDatabase } from "./database.js";
import { matchScan, NameMatcher, normalize, readInfoLine, similarity } from "./scan.js";

const legal = JSON.stringify({ commander: "legal" });

function seed(db: DatabaseSync) {
  const database = db;
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  const card = (id: string, oracle: string, name: string, set: string, number: string, released: string, promo = 0) => {
    insert.run(id, oracle, name, "{R}", 1, "Instant", "", "R", "R", legal, set, set.toUpperCase(), number, "common", null, released, "Artist");
    extras.run("nonfoil,foil", promo, 0, id);
  };
  card("pc-trk", "o-plasma", "Plasma Cascade", "trk", "164", "2026-11-14");
  card("bolt-lea", "o-bolt", "Lightning Bolt", "lea", "161", "1993-08-05");
  card("bolt-m10", "o-bolt", "Lightning Bolt", "m10", "146", "2009-07-17");
  card("bolt-promo", "o-bolt", "Lightning Bolt", "pm10", "146p", "2009-07-17", 1);
  card("drone", "o-drone", "Tenacious Drone", "trk", "133", "2026-11-14");
  card("fable", "o-fable", "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki", "neo", "141", "2022-02-18");
  card("titanoth-iko", "o-titanoth", "Titanoth Rex", "iko", "174", "2020-04-24");
  card("titanoth-godzilla", "o-titanoth", "Titanoth Rex", "iko", "374", "2020-04-24");
  card("titanoth-new", "o-titanoth", "Titanoth Rex", "j25", "700", "2024-11-15");
  db.prepare("UPDATE cards SET flavor_name = ? WHERE id = ?").run("Godzilla, Doom Inevitable", "titanoth-godzilla");
}

const closers: Array<() => void> = [];
afterEach(() => { for (const close of closers.splice(0)) close(); });

function database() {
  const db = new DatabaseSync(":memory:");
  initializeDatabase(db);
  seed(db);
  closers.push(() => db.close());
  return db;
}

describe("scan text helpers", () => {
  it("normalizes names and scores near misses", () => {
    expect(normalize("Atraxa, Praetors' Voice")).toBe("atraxa praetors voice");
    expect(similarity("lightning bo1t", "lightning bolt")).toBeGreaterThan(0.9);
    expect(similarity("shock", "lightning bolt")).toBeLessThan(0.5);
  });

  it("reads collector numbers and set codes from the info line", () => {
    expect(readInfoLine("0164 C\nTRK • EN Nathaniel Himawan")).toEqual({ numbers: ["164"], sets: ["trk"] });
    expect(readInfoLine("146/249 C M10 EN")).toMatchObject({ numbers: ["146"], sets: ["m10"] });
  });
});

describe("matchScan", () => {
  it("finds the exact printing from the set code and collector number", () => {
    const db = database();
    const result = matchScan(db, new NameMatcher(db), ["Plasma Cascade"], "0164 C\nTRK EN");
    expect(result).toMatchObject({ by: "printing", card: { id: "pc-trk" } });
  });

  it("matches a misread name to the newest regular printing", () => {
    const db = database();
    const result = matchScan(db, new NameMatcher(db), ["~ Lightnlng Bo1t ®"], "");
    expect(result.by).toBe("name");
    expect(result.card?.id).toBe("bolt-m10");
  });

  it("picks the printing in the set read from the info line when the number is unreadable", () => {
    const db = database();
    const result = matchScan(db, new NameMatcher(db), ["Lightning Bolt"], "LEA EN");
    expect(result).toMatchObject({ by: "printing", exact: false, card: { id: "bolt-lea" } });
  });

  it("ignores a set and number that disagree with a clearly read name", () => {
    const db = database();
    const result = matchScan(db, new NameMatcher(db), ["Tenacious Drone"], "0164 C TRK EN");
    expect(result.card?.id).toBe("drone");
  });

  it("matches the front face of a double-faced card", () => {
    const db = database();
    const result = matchScan(db, new NameMatcher(db), ["Fable of the Mirror-Breaker"], "");
    expect(result.card?.name).toBe("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki");
  });

  it("matches a flavor name title to the printing that carries it", () => {
    const db = database();
    const result = matchScan(db, new NameMatcher(db), ["Godzilla, Doom Inevitable"], "");
    expect(result.card?.id).toBe("titanoth-godzilla");
    expect(matchScan(db, new NameMatcher(db), ["Titanoth Rex"], "").card?.id).toBe("titanoth-new");
  });

  it("returns no card for noise", () => {
    const db = database();
    expect(matchScan(db, new NameMatcher(db), ["xq zz", ""], "").card).toBeNull();
  });
});

describe("scan routes", () => {
  it("matches text and lists printings for signed-in users", async () => {
    const db = new DatabaseSync(":memory:");
    const app = await buildApp(db, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000 });
    seed(db);
    closers.push(() => { void app.close(); });
    const guard = { "x-mana-vault": "1" };
    const signup = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "correct horse" } });
    const cookie = String(signup.headers["set-cookie"]).split(";")[0]!;

    const anonymous = await app.inject({ method: "POST", url: "/api/scan/match", headers: guard, payload: { lines: ["Plasma Cascade"] } });
    expect(anonymous.statusCode).toBe(401);

    const match = await app.inject({ method: "POST", url: "/api/scan/match", headers: { ...guard, cookie }, payload: { lines: ["Plasma Cascade"], info: "" } });
    expect(match.json()).toMatchObject({ by: "name", card: { id: "pc-trk", finishes: "nonfoil,foil" } });

    const bad = await app.inject({ method: "POST", url: "/api/scan/match", headers: { ...guard, cookie }, payload: { lines: "nope" } });
    expect(bad.statusCode).toBe(400);

    const printings = await app.inject({ method: "GET", url: "/api/cards/bolt-lea/printings", headers: { cookie } });
    expect(printings.json().map((card: { id: string }) => card.id)).toEqual(["bolt-m10", "bolt-promo", "bolt-lea"]);
    const missing = await app.inject({ method: "GET", url: "/api/cards/none/printings", headers: { cookie } });
    expect(missing.statusCode).toBe(404);
  });
});
