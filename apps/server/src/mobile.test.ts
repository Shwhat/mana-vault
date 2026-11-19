import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardExtrasStatement, cardInsertStatement } from "./database.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function server() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000, version: "9.9.9" });
  const insert = cardInsertStatement(database);
  const extras = cardExtrasStatement(database);
  insert.run("p1", "o1", "Lightning Bolt", "{R}", 1, "Instant", "", "R", "R", "{}", "lea", "Alpha", "161", "common", null, "1993-08-05", "Artist");
  extras.run("nonfoil,foil", 0, 0, "p1");
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  for (const name of ["ann", "bob"]) {
    await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
  }
  const device = async (name = "ann", password = "correct horse") =>
    app.inject({ method: "POST", url: "/api/devices", headers: guard, payload: { name, password, device: "Pixel" } });
  const as = (token: string) => (method: string, url: string, payload?: unknown) => app.inject({
    method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  return { app, database, device, as };
}

describe("device sign-in", () => {
  it("issues a token that works as a sign-in, lists the device and can be revoked", async () => {
    const { device, as } = await server();
    const response = await device();
    expect(response.statusCode).toBe(200);
    const { token, name } = response.json() as { token: string; name: string };
    expect(name).toBe("ann");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const ann = as(token);
    expect((await ann("GET", "/api/me")).json()).toMatchObject({ name: "ann" });
    const devices = (await ann("GET", "/api/devices")).json() as Array<{ id: string; name: string; current: boolean }>;
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ name: "Pixel", current: true });
    expect((await ann("DELETE", `/api/devices/${devices[0]!.id}`)).statusCode).toBe(200);
    expect((await ann("GET", "/api/me")).statusCode).toBe(401);
  });

  it("refuses a wrong password and an unknown token", async () => {
    const { device, as } = await server();
    expect((await device("ann", "wrong password")).statusCode).toBe(401);
    expect((await as("0".repeat(64))("GET", "/api/collections")).statusCode).toBe(401);
  });

  it("signs out a device by removing its token", async () => {
    const { device, as } = await server();
    const ann = as((await device()).json().token);
    expect((await ann("POST", "/api/logout", {})).statusCode).toBe(200);
    expect((await ann("GET", "/api/me")).statusCode).toBe(401);
  });

  it("answers the app's cross-origin preflight and no other origin", async () => {
    const { app } = await server();
    const preflight = await app.inject({ method: "OPTIONS", url: "/api/collections", headers: { origin: "https://localhost", "access-control-request-method": "POST" } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://localhost");
    expect(String(preflight.headers["access-control-allow-headers"])).toContain("authorization");
    const other = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://example.com" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    const health = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://localhost" } });
    expect(health.json()).toEqual({ status: "ok", version: "9.9.9" });
  });
});

describe("sync", () => {
  it("applies queued changes once, by change id", async () => {
    const { device, as } = await server();
    const ann = as((await device()).json().token);
    const collection = ((await ann("GET", "/api/collections")).json() as Array<{ id: string }>)[0]!.id;
    const change = { id: "c-1", method: "POST", url: `/api/collections/${collection}/cards/add`, body: { items: [{ cardId: "p1", foil: 0, quantity: 2 }] } };
    const first = (await ann("POST", "/api/sync", { changes: [change] })).json() as { results: Array<{ status: number }> };
    expect(first.results[0]!.status).toBe(200);
    await ann("POST", "/api/sync", { changes: [change] });
    const cards = (await ann("GET", `/api/collections/${collection}/cards`)).json() as Array<{ quantity: number }>;
    expect(cards[0]!.quantity).toBe(2);
  });

  it("applies offline count edits as a difference, keeping edits made elsewhere", async () => {
    const { device, as } = await server();
    const ann = as((await device()).json().token);
    const collection = ((await ann("GET", "/api/collections")).json() as Array<{ id: string }>)[0]!.id;
    const url = `/api/collections/${collection}/cards`;
    await ann("PUT", url, { items: [{ cardId: "p1", foil: 0, quantity: 3 }] });
    // the phone saw 3 and set 5 while offline; meanwhile the web app raised it to 4
    await ann("PUT", url, { items: [{ cardId: "p1", foil: 0, quantity: 4 }] });
    const change = { id: "c-2", method: "PUT", url, body: { items: [{ cardId: "p1", foil: 0, quantity: 5 }] }, base: [{ cardId: "p1", foil: 0, quantity: 3 }] };
    await ann("POST", "/api/sync", { changes: [change] });
    const cards = (await ann("GET", url)).json() as Array<{ quantity: number }>;
    expect(cards[0]!.quantity).toBe(6);
  });

  it("reports changes to items the account cannot reach, and refuses unsafe addresses", async () => {
    const { device, as } = await server();
    const ann = as((await device()).json().token);
    const result = (await ann("POST", "/api/sync", {
      changes: [
        { id: "x-1", method: "POST", url: "/api/collections/missing/cards/add", body: { items: [{ cardId: "p1", foil: 0, quantity: 1 }] } },
        { id: "x-2", method: "POST", url: "/api/devices", body: {} },
        { id: "x-3", method: "GET", url: "/api/me" },
      ],
    })).json() as { results: Array<{ status: number; error: string | null }> };
    expect(result.results[0]!.status).toBe(404);
    expect(result.results[0]!.error).toBeTruthy();
    expect(result.results[1]!.status).toBe(400);
    expect(result.results[2]!.status).toBe(400);
  });

  it("reports new offers and a revision that changes with every change", async () => {
    const { device, as } = await server();
    const ann = as((await device()).json().token);
    const bob = as((await device("bob")).json().token);
    const before = (await bob("GET", "/api/sync/state")).json() as { revision: string; inbox: number };
    expect(before.inbox).toBe(0);
    const collection = ((await ann("GET", "/api/collections")).json() as Array<{ id: string }>)[0]!.id;
    const bobId = ((await ann("GET", "/api/users")).json() as Array<{ id: number; name: string }>).find((person) => person.name === "bob")!.id;
    expect((await ann("POST", "/api/shares", { kind: "collection", itemId: collection, toUser: bobId, mode: "copy" })).statusCode).toBe(201);
    const after = (await bob("GET", "/api/sync/state")).json() as { revision: string; inbox: number; offers: Array<{ user: string; mode: string }> };
    expect(after.inbox).toBe(1);
    expect(after.offers[0]).toMatchObject({ user: "ann", mode: "copy" });
    expect(after.revision).not.toBe(before.revision);
  });
});

describe("compact catalog", () => {
  it("sends every printing compressed, and nothing new when the copy is current", async () => {
    const { app, device, as } = await server();
    const token = (await device()).json().token as string;
    const response = await as(token)("GET", "/api/catalog/compact");
    expect(response.headers["content-encoding"]).toBe("gzip");
    const body = JSON.parse(gunzipSync(response.rawPayload).toString()) as { fields: string[]; rows: unknown[][] };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]![body.fields.indexOf("name")]).toBe("Lightning Bolt");
    expect(body.rows[0]![body.fields.indexOf("finishes")]).toBe("nonfoil,foil");
    const again = await app.inject({ method: "GET", url: "/api/catalog/compact", headers: { authorization: `Bearer ${token}`, "if-none-match": String(response.headers.etag) } });
    expect(again.statusCode).toBe(304);
  });
});
