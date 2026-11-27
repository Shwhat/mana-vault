import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const ENGINE_NAME = /^mv[0-9a-z]{12}$/;

export class EngineIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineIdentityError";
  }
}

export function initializeEngineIdentityTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS play_engine_identities (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      engine_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function newEngineName(): string {
  const suffix = BigInt(`0x${randomBytes(7).toString("hex")}`).toString(36).padStart(12, "0");
  return `mv${suffix}`;
}

function validEngineName(value: unknown): value is string {
  return typeof value === "string" && ENGINE_NAME.test(value);
}

export function engineIdentity(database: DatabaseSync, userId: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new EngineIdentityError("Account is unavailable for engine sign-in");
  const user = database.prepare("SELECT disabled FROM users WHERE id = ?").get(userId);
  if (!user || Number(user.disabled) !== 0) throw new EngineIdentityError("Account is unavailable for engine sign-in");

  const existing = database.prepare("SELECT engine_name FROM play_engine_identities WHERE user_id = ?").get(userId);
  if (existing) {
    if (!validEngineName(existing.engine_name)) throw new EngineIdentityError("Stored engine identity is invalid");
    return existing.engine_name;
  }

  const insert = database.prepare("INSERT INTO play_engine_identities (user_id, engine_name) VALUES (?, ?) ON CONFLICT DO NOTHING");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = newEngineName();
    const result = insert.run(userId, candidate);
    if (Number(result.changes) === 1) return candidate;
    const raced = database.prepare("SELECT engine_name FROM play_engine_identities WHERE user_id = ?").get(userId);
    if (raced) {
      if (!validEngineName(raced.engine_name)) throw new EngineIdentityError("Stored engine identity is invalid");
      return raced.engine_name;
    }
  }
  throw new EngineIdentityError("Could not allocate a unique engine identity");
}
