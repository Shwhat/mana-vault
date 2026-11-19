// ---------- sign-in: accounts, sessions, rate limits and the request guard ----------
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

// PBKDF2-HMAC-SHA256 with the iteration count recommended by OWASP. The count is stored per user so it can be raised later.
export const DEFAULT_ITERATIONS = 600_000;
export const SESSION_DAYS = 30;
export const COOKIE_NAME = "mana_vault_session";
export const GUARD_HEADER = "x-mana-vault";

export type User = { id: number; name: string };

export function initializeAuthTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      iterations INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_key TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      prefs TEXT NOT NULL
    );
  `);
}

function derive(password: string, salt: Buffer, iterations: number): Buffer {
  return pbkdf2Sync(password, salt, iterations, 32, "sha256");
}

// The sessions table stores a hash of each token, so a copy of the data folder does not hold usable session tokens.
export function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/;
export const validName = (name: string) => NAME_PATTERN.test(name);
export const validPassword = (password: string) => password.length >= 8 && password.length <= 200;

export class AuthStore {
  constructor(private readonly database: DatabaseSync, private readonly iterations = DEFAULT_ITERATIONS) {
    initializeAuthTables(database);
  }

  userCount(): number {
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM users").get()?.count ?? 0);
  }

  addUser(name: string, password: string): User | null {
    if (this.database.prepare("SELECT 1 FROM users WHERE name = ?").get(name)) return null;
    const salt = randomBytes(16);
    const hash = derive(password, salt, this.iterations);
    const result = this.database.prepare("INSERT INTO users (name, salt, hash, iterations) VALUES (?, ?, ?, ?)")
      .run(name, salt.toString("hex"), hash.toString("hex"), this.iterations);
    return { id: Number(result.lastInsertRowid), name };
  }

  checkPassword(name: string, password: string): User | null {
    const row = this.database.prepare("SELECT id, name, salt, hash, iterations FROM users WHERE name = ?").get(name);
    // a missing user still costs one derivation, so response times do not reveal which names exist
    const salt = Buffer.from(typeof row?.salt === "string" ? row.salt : "00".repeat(16), "hex");
    const expected = Buffer.from(typeof row?.hash === "string" ? row.hash : "00".repeat(32), "hex");
    const iterations = typeof row?.iterations === "number" ? row.iterations : this.iterations;
    const actual = derive(password, salt, iterations);
    if (!row || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return { id: Number(row.id), name: String(row.name) };
  }

  setPassword(userId: number, password: string): void {
    const salt = randomBytes(16);
    const hash = derive(password, salt, this.iterations);
    this.database.prepare("UPDATE users SET salt = ?, hash = ?, iterations = ? WHERE id = ?")
      .run(salt.toString("hex"), hash.toString("hex"), this.iterations, userId);
    this.database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  newSession(userId: number): string {
    const token = randomBytes(32).toString("hex");
    const expires = Date.now() + SESSION_DAYS * 86_400_000;
    this.database.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    this.database.prepare("INSERT INTO sessions (token_key, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenKey(token), userId, expires);
    return token;
  }

  session(token: string): User | null {
    const row = this.database.prepare(
      `SELECT u.id, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_key = ?`,
    ).get(tokenKey(token));
    if (!row || Number(row.expires_at) < Date.now()) return null;
    return { id: Number(row.id), name: String(row.name) };
  }

  endSession(token: string): void {
    this.database.prepare("DELETE FROM sessions WHERE token_key = ?").run(tokenKey(token));
  }

  prefs(userId: number): unknown {
    const row = this.database.prepare("SELECT prefs FROM user_prefs WHERE user_id = ?").get(userId);
    if (typeof row?.prefs !== "string") return {};
    try {
      return JSON.parse(row.prefs);
    } catch {
      return {};
    }
  }

  savePrefs(userId: number, prefs: unknown): void {
    this.database.prepare(
      "INSERT INTO user_prefs (user_id, prefs) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET prefs = excluded.prefs",
    ).run(userId, JSON.stringify(prefs));
  }
}

// Limiter slows down password guessing: after `max` failures for a key, further tries wait until the window passes.
export class Limiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}

  private prune(key: string, now: number): number[] {
    const kept = (this.hits.get(key) ?? []).filter((time) => now - time <= this.windowMs);
    if (kept.length) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  blocked(key: string): boolean {
    return this.prune(key, Date.now()).length >= this.max;
  }

  hit(key: string): void {
    const now = Date.now();
    this.hits.set(key, [...this.prune(key, now), now]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
