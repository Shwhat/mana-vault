import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type AppOptions } from "./app.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

async function setup(options: AppOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "mana-vault-auth-"));
  await writeFile(join(root, "index.html"), "<!doctype html><title>App</title>", "utf8");
  await writeFile(join(root, "login.html"), "<!doctype html><title>Sign in</title>", "utf8");
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, root, undefined, undefined, { passwordIterations: 1000, ...options });
  cleanup.push(async () => {
    await app.close();
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  return app;
}

const guard = { "x-mana-vault": "1", "content-type": "application/json" };

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const header = String(response.headers["set-cookie"] ?? "");
  return header.split(";")[0] ?? "";
}

describe("sign-in", () => {
  it("sends signed-out visitors to the sign-in page and refuses the API", async () => {
    const app = await setup();
    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe("/login");
    const login = await app.inject({ method: "GET", url: "/login" });
    expect(login.statusCode).toBe(200);
    expect(login.body).toContain("Sign in");
    const api = await app.inject({ method: "GET", url: "/api/collection" });
    expect(api.statusCode).toBe(401);
    expect(api.json().error).toContain("signed out");
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
  });

  it("creates an account, keeps the session in an HTTP-only cookie, and signs out", async () => {
    const app = await setup();
    const signup = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "correct horse" } });
    expect(signup.statusCode).toBe(200);
    expect(String(signup.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(signup.headers["set-cookie"])).not.toContain("Secure");
    const cookie = cookieFrom(signup);
    const me = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(me.json().name).toBe("devon");
    expect((await app.inject({ method: "GET", url: "/", headers: { cookie } })).statusCode).toBe(200);
    await app.inject({ method: "POST", url: "/api/logout", headers: { ...guard, cookie }, payload: {} });
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(401);
  });

  it("marks the cookie secure behind an HTTPS proxy", async () => {
    const app = await setup();
    const signup = await app.inject({
      method: "POST", url: "/api/signup", headers: { ...guard, "x-forwarded-proto": "https" },
      payload: { name: "devon", password: "correct horse" },
    });
    expect(String(signup.headers["set-cookie"])).toContain("Secure");
  });

  it("rejects changes without the safety header", async () => {
    const app = await setup();
    const response = await app.inject({ method: "POST", url: "/api/login", headers: { "content-type": "application/json" }, payload: { name: "a", password: "b" } });
    expect(response.statusCode).toBe(403);
  });

  it("checks names, passwords and duplicates", async () => {
    const app = await setup();
    const bad = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "x", password: "correct horse" } });
    expect(bad.statusCode).toBe(400);
    const short = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "short" } });
    expect(short.json().error).toBe("Passwords need at least 8 characters.");
    await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "correct horse" } });
    const taken = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "DEVON", password: "correct horse" } });
    expect(taken.statusCode).toBe(409);
  });

  it("turns off new accounts when signup is off", async () => {
    const app = await setup({ signup: false });
    // the first account can always be made, so a new server is never locked; it is the admin
    expect((await app.inject({ method: "GET", url: "/api/config" })).json().signup).toBe(true);
    const first = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "correct horse" } });
    expect(first.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/config" })).json().signup).toBe(false);
    const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "alex", password: "correct horse" } });
    expect(response.statusCode).toBe(403);
  });

  it("limits repeated wrong passwords", async () => {
    const app = await setup();
    await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "correct horse" } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await app.inject({ method: "POST", url: "/api/login", headers: guard, payload: { name: "devon", password: "wrong password" } });
      expect(wrong.statusCode).toBe(401);
    }
    const blocked = await app.inject({ method: "POST", url: "/api/login", headers: guard, payload: { name: "devon", password: "correct horse" } });
    expect(blocked.statusCode).toBe(429);
  });

  it("changes the password and ends other sessions", async () => {
    const app = await setup();
    const first = cookieFrom(await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "correct horse" } }));
    const second = cookieFrom(await app.inject({ method: "POST", url: "/api/login", headers: guard, payload: { name: "devon", password: "correct horse" } }));
    const wrong = await app.inject({ method: "POST", url: "/api/password", headers: { ...guard, cookie: first }, payload: { old: "nope nope", new: "battery staple" } });
    expect(wrong.statusCode).toBe(401);
    const changed = await app.inject({ method: "POST", url: "/api/password", headers: { ...guard, cookie: first }, payload: { old: "correct horse", new: "battery staple" } });
    expect(changed.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: second } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: cookieFrom(changed) } })).statusCode).toBe(200);
    const login = await app.inject({ method: "POST", url: "/api/login", headers: guard, payload: { name: "devon", password: "battery staple" } });
    expect(login.statusCode).toBe(200);
  });

  it("stores preferences per user", async () => {
    const app = await setup();
    const cookie = cookieFrom(await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "devon", password: "correct horse" } }));
    expect((await app.inject({ method: "GET", url: "/api/prefs", headers: { cookie } })).json()).toEqual({});
    await app.inject({ method: "PUT", url: "/api/prefs", headers: { ...guard, cookie }, payload: { theme: "dark" } });
    expect((await app.inject({ method: "GET", url: "/api/prefs", headers: { cookie } })).json()).toEqual({ theme: "dark" });
    const other = cookieFrom(await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "alex", password: "correct horse" } }));
    expect((await app.inject({ method: "GET", url: "/api/prefs", headers: { cookie: other } })).json()).toEqual({});
  });

  it("sends security headers", async () => {
    const app = await setup();
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
