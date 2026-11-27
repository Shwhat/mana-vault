import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initializeAuthTables } from "../auth.js";
import { engineIdentity, EngineIdentityError, initializeEngineIdentityTable } from "./engine-identity.js";

const databases: DatabaseSync[] = [];

function database(): DatabaseSync {
  const value = new DatabaseSync(":memory:");
  databases.push(value);
  initializeAuthTables(value);
  initializeEngineIdentityTable(value);
  value.prepare("INSERT INTO users (name, salt, hash, iterations) VALUES (?, 'x', 'x', 1)").run("test-one");
  value.prepare("INSERT INTO users (name, salt, hash, iterations) VALUES (?, 'x', 'x', 1)").run("test-two");
  return value;
}

afterEach(() => {
  for (const value of databases.splice(0)) value.close();
});

describe("Playmat account identities", () => {
  it("creates stable, opaque, unique names without using Mana Vault usernames", () => {
    const db = database();
    const first = engineIdentity(db, 1);
    const second = engineIdentity(db, 2);

    expect(first).toMatch(/^mv[0-9a-z]{12}$/);
    expect(second).toMatch(/^mv[0-9a-z]{12}$/);
    expect(second).not.toBe(first);
    expect(engineIdentity(db, 1)).toBe(first);
    expect(first).not.toContain("test-one");
  });

  it("refuses missing, disabled and invalid accounts", () => {
    const db = database();
    db.prepare("UPDATE users SET disabled = 1 WHERE id = 2").run();

    expect(() => engineIdentity(db, 3)).toThrow(EngineIdentityError);
    expect(() => engineIdentity(db, 2)).toThrow("Account is unavailable");
    expect(() => engineIdentity(db, 0)).toThrow("Account is unavailable");
  });
});
