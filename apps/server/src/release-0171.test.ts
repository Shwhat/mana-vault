// 0.17.1: a backup names the Mana Vault version that made it, and a backup from a newer version is refused.
import { describe, expect, it } from "vitest";
import { server } from "./release-090.test.js";
import { APP_VERSION, compareVersions } from "./backup.js";

describe("backups marked with the app version", () => {
  it("compares versions part by part", () => {
    expect(compareVersions("0.17.1", "0.17.0")).toBe(1);
    expect(compareVersions("0.9.0", "0.17.1")).toBe(-1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
    expect(compareVersions("0.17.1", "0.17.1")).toBe(0);
  });

  it("writes the app version, restores it and older numbered backups, and refuses a newer version", async () => {
    const { call } = await server();
    await call("POST", `/api/purchases`, { kind: "purchase", date: "2026-11-01", place: "Corner Games", shipping: 2, lines: [{ product: "play_booster", quantity: 1, cost: 5 }] });
    const text = (await call("GET", "/api/backup")).body;
    const backup = JSON.parse(text);
    expect(backup.version).toBe(APP_VERSION);
    expect((await call("POST", "/api/backup/restore", text)).statusCode).toBe(200);
    const entries = (await call("GET", "/api/purchases")).json().entries as Array<{ place: string }>;
    expect(entries.map((entry) => entry.place)).toEqual(["Corner Games"]);

    // a backup numbered 7 (0.16.0 to 0.17.0) still restores
    expect((await call("POST", "/api/backup/restore", JSON.stringify({ ...backup, version: 7 }))).statusCode).toBe(200);

    const newer = await call("POST", "/api/backup/restore", JSON.stringify({ ...backup, version: "99.0.0" }));
    expect(newer.statusCode).toBe(400);
    expect(newer.json().error).toBe(`This backup was made by Mana Vault 99.0.0. Update this server (${APP_VERSION}) to 99.0.0 or later to restore it.`);
    expect((await call("POST", "/api/backup/restore", JSON.stringify({ ...backup, version: "next" }))).statusCode).toBe(400);
  });
});
