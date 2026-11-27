// ---------- Android app: device sign-in, cross-origin access, sync and the compact catalog ----------
import { randomBytes, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { tokenKey, type User } from "./auth.js";
import { activeSource, usdEtchedSql, usdFoilSql, usdSql } from "./price-context.js";

/** The formats the phone's card list knows legality for (Scryfall's legality keys), one bit each. */
export const LEGAL_FORMATS = [
  "standard", "future", "historic", "timeless", "gladiator", "pioneer", "explorer", "modern", "legacy", "pauper", "vintage", "penny", "commander",
  "oathbreaker", "standardbrawl", "brawl", "alchemy", "paupercommander", "duel", "oldschool", "premodern", "predh",
];

/** The page origin of the Android app (Capacitor serves its bundled files from https://localhost). */
export const APP_ORIGINS = new Set(["https://localhost"]);
const BEARER = /^Bearer ([a-f0-9]{64})$/;
const SYNC_KEEP_DAYS = 30;
const MAX_CHANGES = 500;

export function initializeMobileTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sync_changes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      change_id TEXT NOT NULL,
      status INTEGER NOT NULL,
      error TEXT,
      applied_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, change_id)
    );
  `);
}

/** Creates a device token for a user. Only the token's hash is stored. */
export function addDevice(database: DatabaseSync, userId: number, name: string): { id: string; token: string } {
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  database.prepare("INSERT INTO devices (id, user_id, name, token_key) VALUES (?, ?, ?, ?)").run(id, userId, name, tokenKey(token));
  return { id, token };
}

/** The account and device for an Authorization header, or null. Updates the device's last seen time at most once a minute. */
export function deviceUser(database: DatabaseSync, header: string | undefined): (User & { deviceId: string }) | null {
  const match = BEARER.exec(header ?? "");
  if (!match) return null;
  const row = database.prepare(
    `SELECT d.id AS device_id, d.last_seen, u.id, u.name, u.disabled FROM devices d JOIN users u ON u.id = d.user_id WHERE d.token_key = ?`,
  ).get(tokenKey(match[1]!));
  if (!row || Number(row.disabled) === 1) return null;
  if (Date.now() - Date.parse(`${String(row.last_seen).replace(" ", "T")}Z`) > 60_000) {
    database.prepare("UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?").run(String(row.device_id));
  }
  return { id: Number(row.id), name: String(row.name), deviceId: String(row.device_id) };
}

/** Adds the cross-origin headers the Android app needs, and answers its preflight requests. Returns true when the request was answered. */
export function handleCrossOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !APP_ORIGINS.has(origin)) return false;
  reply.header("access-control-allow-origin", origin);
  reply.header("vary", "Origin");
  if (request.method !== "OPTIONS") return false;
  reply.header("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE");
  reply.header("access-control-allow-headers", "authorization, content-type, x-mana-vault, x-mana-vault-client, x-mana-vault-undo");
  reply.header("access-control-max-age", "86400");
  void reply.code(204).send();
  return true;
}

type Change = { id: string; method: string; url: string; body?: unknown; base?: unknown };
type ItemBase = { cardId: string; foil: number; condition?: string; language?: string; proxy?: boolean; quantity: number };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const sameKey = (a: ItemBase, b: ItemBase) =>
  a.cardId === b.cardId && Number(a.foil) === Number(b.foil) && (a.condition ?? "NM") === (b.condition ?? "NM") && (a.language ?? "en") === (b.language ?? "en") &&
  !!a.proxy === !!b.proxy;

/**
 * Offline count edits are sent as the count the phone saw (base) and the count it wants. The server applies the
 * difference to the count it has now, so edits made elsewhere at the same time are kept.
 */
function rebase(database: DatabaseSync, change: Change): unknown {
  const collection = /^\/api\/collections\/([^/?]+)\/cards$/.exec(change.url);
  if (change.method === "PUT" && collection && isRecord(change.body) && Array.isArray(change.body.items) && Array.isArray(change.base)) {
    const id = decodeURIComponent(collection[1]!);
    const base = change.base as ItemBase[];
    const current = database.prepare(
      "SELECT quantity FROM collection_cards WHERE collection_id = ? AND card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?",
    );
    const items = (change.body.items as ItemBase[]).map((item) => {
      const seen = base.find((entry) => sameKey(entry, item));
      if (!seen || typeof item.quantity !== "number") return item;
      const now = Number(current.get(id, item.cardId, Number(item.foil), item.condition ?? "NM", item.language ?? "en", item.proxy ? 1 : 0)?.quantity ?? 0);
      return { ...item, quantity: Math.max(0, Math.min(10_000, now + item.quantity - seen.quantity)) };
    });
    return { ...change.body, items };
  }
  const deck = /^\/api\/decks\/([^/?]+)\/cards\/[^/?]+\?(.*)$/.exec(change.url);
  if (change.method === "PATCH" && deck && isRecord(change.body) && isRecord(change.base) && typeof change.base.quantity === "number") {
    const entryId = new URLSearchParams(deck[2]).get("entryId");
    const row = entryId ? database.prepare("SELECT quantity FROM deck_cards WHERE deck_id = ? AND id = ?").get(decodeURIComponent(deck[1]!), Number(entryId)) : null;
    if (row && typeof change.body.quantity === "number") {
      return { ...change.body, quantity: Math.max(0, Math.min(100, Number(row.quantity) + change.body.quantity - change.base.quantity)) };
    }
  }
  return change.body;
}

/** Ids that change whenever any data on the server changes. The app downloads its copy again when the revision differs. */
export class Revision {
  private readonly boot = randomBytes(4).toString("hex");
  private count = 0;
  bump(): void {
    this.count += 1;
  }
  get value(): string {
    return `${this.boot}-${this.count}`;
  }
}

type CompactCache = { stamp: string; body: Buffer } | null;

export function registerMobileRoutes(
  app: FastifyInstance,
  database: DatabaseSync,
  revision: Revision,
  signIn: (name: string, password: string, request: FastifyRequest, reply: FastifyReply) => Promise<User | null>,
  disconnectPlaySessionIfUnauthorized?: (userId: number) => Promise<void>,
): void {
  initializeMobileTables(database);

  app.post<{ Body: { name?: unknown; password?: unknown; device?: unknown } }>("/api/devices", async (request, reply) => {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const deviceName = typeof request.body?.device === "string" && request.body.device.trim() ? request.body.device.trim().slice(0, 60) : "Android phone";
    const user = await signIn(name, password, request, reply);
    if (!user) return reply;
    const device = addDevice(database, user.id, deviceName);
    return { id: user.id, name: user.name, device: device.id, token: device.token };
  });

  app.get("/api/devices", async (request) => {
    const me = request.user!;
    const current = (request as FastifyRequest & { deviceId?: string }).deviceId ?? null;
    return database.prepare("SELECT id, name, created_at, last_seen FROM devices WHERE user_id = ? ORDER BY created_at").all(me.id)
      .map((row) => ({ id: String(row.id), name: String(row.name), createdAt: String(row.created_at), lastSeen: String(row.last_seen), current: row.id === current }));
  });

  app.delete<{ Params: { deviceId: string } }>("/api/devices/:deviceId", async (request, reply) => {
    const result = database.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?").run(request.params.deviceId, request.user!.id);
    if (!result.changes) return reply.code(404).send({ error: "That device is not signed in." });
    try {
      await disconnectPlaySessionIfUnauthorized?.(request.user!.id);
    } catch (error) {
      request.log.error({ error, userId: request.user!.id }, "Could not close Playmat session after device removal");
      return reply.code(503).send({ error: "Device access was revoked, but the play engine could not confirm session cleanup." });
    }
    return { status: "removed" };
  });

  app.get("/api/sync/state", async (request) => {
    const me = request.user!.id;
    const inbox = database.prepare("SELECT COUNT(*) AS count, MAX(created_at) AS newest FROM shares WHERE to_user = ? AND status = 'pending'").get(me);
    const offers = database.prepare(
      `SELECT s.id, s.kind, s.item_name, s.mode, s.created_at, u.name AS user_name FROM shares s JOIN users u ON u.id = s.from_user
       WHERE s.to_user = ? AND s.status = 'pending' ORDER BY s.created_at DESC LIMIT 5`,
    ).all(me).map((row) => ({ id: String(row.id), kind: String(row.kind), itemName: String(row.item_name), mode: String(row.mode), createdAt: String(row.created_at), user: String(row.user_name) }));
    const updated = database.prepare("SELECT value FROM catalog_metadata WHERE key = 'updated_at'").get()?.value ?? null;
    const custom = database.prepare("SELECT value FROM catalog_metadata WHERE key = 'custom_at'").get()?.value ?? null;
    // a change of custom cards counts as a change of the card list
    const catalog = custom ? `${String(updated ?? "")}|${String(custom)}` : updated;
    const rulings = database.prepare("SELECT value FROM catalog_metadata WHERE key = 'rulings_at'").get()?.value ?? null;
    // the active opening (0.18.0): the phone's background check offers Start scanning when one starts on another device
    let opening: { id: string; name: string; entryId: string } | null = null;
    try {
      const row = database.prepare("SELECT id, name, entry_id FROM purchase_openings WHERE user_id = ? AND active = 1").get(me);
      if (row) opening = { id: String(row.id), name: String(row.name), entryId: String(row.entry_id) };
    } catch {
      opening = null;
    }
    return { revision: revision.value, inbox: Number(inbox?.count ?? 0), newestOffer: inbox?.newest ?? null, offers, catalog, rulings, opening };
  });

  app.post<{ Body: { changes?: unknown } }>("/api/sync", { bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    const changes = request.body?.changes;
    if (!Array.isArray(changes) || changes.length > MAX_CHANGES) return reply.code(400).send({ error: `Send a list of up to ${MAX_CHANGES} changes.` });
    const me = request.user!.id;
    database.prepare("DELETE FROM sync_changes WHERE applied_at < ?").run(Date.now() - SYNC_KEEP_DAYS * 86_400_000);
    const done = database.prepare("SELECT status, error FROM sync_changes WHERE user_id = ? AND change_id = ?");
    const record = database.prepare("INSERT OR REPLACE INTO sync_changes (user_id, change_id, status, error, applied_at) VALUES (?, ?, ?, ?, ?)");
    const results: Array<{ id: string; status: number; error: string | null; body?: unknown }> = [];
    for (const raw of changes as unknown[]) {
      if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id || raw.id.length > 80 || typeof raw.url !== "string" || typeof raw.method !== "string") {
        return reply.code(400).send({ error: "Each change needs an id, a method and an address." });
      }
      const change = raw as unknown as Change;
      const method = change.method.toUpperCase();
      const seen = done.get(me, change.id);
      if (seen) {
        results.push({ id: change.id, status: Number(seen.status), error: seen.error === null ? null : String(seen.error) });
        continue;
      }
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(method) || !change.url.startsWith("/api/") || change.url.startsWith("/api/sync") ||
        change.url.startsWith("/api/devices") || change.url.startsWith("/api/backup") || change.url.startsWith("/api/password")) {
        results.push({ id: change.id, status: 400, error: "This change cannot be sent from the phone." });
        continue;
      }
      const body = rebase(database, { ...change, method });
      const response = await app.inject({
        method: method as "POST",
        url: change.url,
        headers: {
          "x-mana-vault": "1",
          ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
      });
      let parsed: unknown = null;
      try {
        parsed = response.json();
      } catch {
        parsed = null;
      }
      const error = response.statusCode >= 400 ? String((parsed as { error?: unknown } | null)?.error ?? `Error ${response.statusCode}`) : null;
      // a failure from a busy server is not recorded, so the phone sends the change again later
      if (response.statusCode < 500) record.run(me, change.id, response.statusCode, error, Date.now());
      results.push({ id: change.id, status: response.statusCode, error, body: parsed });
    }
    return { results, revision: revision.value };
  });

  let compact: CompactCache = null;
  app.get("/api/catalog/compact", async (request, reply) => {
    const stamp = String(database.prepare("SELECT value FROM catalog_metadata WHERE key = 'updated_at'").get()?.value ?? "") +
      `:${Number(database.prepare("SELECT COUNT(*) AS count FROM cards").get()?.count ?? 0)}` +
      `:${String(database.prepare("SELECT value FROM catalog_metadata WHERE key = 'custom_at'").get()?.value ?? "")}` +
      // MTGJSON prices and card details (0.21.0), and the account's main price source
      `:${String(database.prepare("SELECT MAX(at) AS at FROM mtgjson_parts").get()?.at ?? "")}:${activeSource()}`;
    if (request.headers["if-none-match"] === `"${stamp}"`) return reply.code(304).send();
    if (compact?.stamp !== stamp) {
      // 0.17.0: everything the search syntax reads, so the app answers full searches without a connection
      const rows = database.prepare(
        `SELECT id, oracle_id, name, mana_cost, mana_value, type_line, colors, set_code, set_name, collector_number, rarity,
                image_url, released_at, finishes, flavor_name, promo, variation, oracle_text, power, toughness,
                color_identity, artist, keywords, promo_types, frame, frame_effects, border_color, full_art, lang, custom, legalities,
                COALESCE(${usdSql("")}, ${usdFoilSql("")}, ${usdEtchedSql("")}) AS usd,
                is_reprint, is_starter, lead_commander, lead_oathbreaker, lead_brawl,
                tcg_r, tcg_rf, tcg_re, ck_r, ck_rf, ck_re, cs_r, cs_rf, cs_re, cm_r, cm_rf, cm_re, ch_r, ch_rf,
                NULLIF(MAX(COALESCE(tcg_b, 0), COALESCE(tcg_bf, 0), COALESCE(tcg_be, 0), COALESCE(ck_b, 0), COALESCE(ck_bf, 0), COALESCE(ck_be, 0)), 0) AS buy
         FROM cards WHERE removed = 0 OR id IN (SELECT card_id FROM collection_cards) ORDER BY name, released_at DESC`,
      ).all();
      const fields = ["id", "oracle_id", "name", "mana_cost", "mana_value", "type_line", "colors", "set_code", "set_name", "collector_number",
        "rarity", "image_url", "released_at", "finishes", "flavor_name", "promo", "variation", "oracle_text", "power", "toughness",
        "color_identity", "artist", "keywords", "promo_types", "frame", "frame_effects", "border_color", "full_art", "lang", "custom", "usd", "legal",
        "is_reprint", "is_starter", "lead_commander", "lead_oathbreaker", "lead_brawl",
        "tcg_r", "tcg_rf", "tcg_re", "ck_r", "ck_rf", "ck_re", "cs_r", "cs_rf", "cs_re", "cm_r", "cm_rf", "cm_re", "ch_r", "ch_rf", "buy"];
      // formats a card is legal in, as bits in the order of LEGAL_FORMATS
      const legal = (text: unknown) => {
        let mask = 0;
        try {
          const value = JSON.parse(String(text ?? "{}")) as Record<string, string>;
          LEGAL_FORMATS.forEach((format, bit) => { if (value[format] === "legal") mask |= 1 << bit; });
        } catch { /* no legality data */ }
        return mask;
      };
      const body = {
        version: stamp, fields, formats: LEGAL_FORMATS,
        rows: rows.map((row) => fields.map((field) => (field === "legal" ? legal(row.legalities) : row[field] ?? null))),
      };
      compact = { stamp, body: gzipSync(JSON.stringify(body)) };
    }
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-encoding", "gzip");
    reply.header("etag", `"${stamp}"`);
    reply.header("cache-control", "no-cache");
    return reply.send(compact.body);
  });

  // every ruling, grouped by card, for the card page on the phone without a connection
  let rulingsCache: CompactCache = null;
  app.get("/api/rulings/compact", async (request, reply) => {
    const stamp = String(database.prepare("SELECT value FROM catalog_metadata WHERE key = 'rulings_at'").get()?.value ?? "none");
    if (request.headers["if-none-match"] === `"${stamp}"`) return reply.code(304).send();
    if (rulingsCache?.stamp !== stamp) {
      const grouped: Record<string, Array<[string, string]>> = {};
      for (const row of database.prepare("SELECT oracle_id, published_at, comment FROM rulings ORDER BY oracle_id, published_at, rowid").all()) {
        (grouped[String(row.oracle_id)] ??= []).push([String(row.published_at), String(row.comment)]);
      }
      rulingsCache = { stamp, body: gzipSync(JSON.stringify({ version: stamp, rulings: grouped })) };
    }
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-encoding", "gzip");
    reply.header("etag", `"${stamp}"`);
    reply.header("cache-control", "no-cache");
    return reply.send(rulingsCache.body);
  });
}
