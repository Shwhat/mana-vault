// ---------- trades: saved trades, completing them, proposals between accounts, wishlist matches and the shared trade binder ----------
import { tradeDone, tradeReopened, type TradeSide } from "./copy-events.js";
import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { type CopyKey, priceColumnList, readCondition, readFinish, readLanguage } from "./copies.js";
import { access, lowerWishlists } from "./library.js";
import { trimLinks } from "./links.js";
import { priceColumns, priceSourceOf } from "./mtgjson.js";

export type Side = "give" | "get";
export type TradeLineInput = CopyKey & { side: Side; quantity: number; price: number | null; collectionId: string | null };
type Change = { collectionId: string; key: CopyKey; quantity: number };
/** What completing a trade changed, kept so the change can be undone. */
type Record = { removed: Change[]; added: Change[] };

const KEY = "card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?";
const keyValues = (key: CopyKey) => [key.cardId, key.foil, key.condition, key.language, key.proxy ? 1 : 0] as const;
const now = "strftime('%Y-%m-%d %H:%M:%f', 'now')";
const flip = (side: string): Side => (side === "give" ? "get" : "give");

export function initializeTrades(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      partner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done', 'cancelled')),
      turn_id INTEGER,
      owner_collection TEXT,
      partner_collection TEXT,
      record TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      done_at TEXT
    );
    CREATE TABLE IF NOT EXISTS trade_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
      side TEXT NOT NULL CHECK(side IN ('give', 'get')),
      card_id TEXT NOT NULL,
      foil INTEGER NOT NULL DEFAULT 0,
      condition TEXT NOT NULL DEFAULT 'NM',
      language TEXT NOT NULL DEFAULT 'en',
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      price REAL,
      collection_id TEXT
    );
    CREATE INDEX IF NOT EXISTS trade_lines_trade_idx ON trade_lines(trade_id);
    CREATE TABLE IF NOT EXISTS trade_shares (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
  `);
}

function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** Reads trade lines from a request: up to 500 lines with a known card, finish, condition, language and a count of 1 to 999. */
export function readLines(value: unknown): TradeLineInput[] | string {
  if (!Array.isArray(value) || value.length > 500) return "Send a list of up to 500 trade lines";
  const lines: TradeLineInput[] = [];
  for (const item of value) {
    const raw = (item && typeof item === "object" ? item : {}) as { [key: string]: unknown };
    const foil = readFinish(raw.foil ?? 0);
    const condition = readCondition(raw.condition ?? "NM");
    const language = readLanguage(raw.language ?? "en");
    const quantity = raw.quantity ?? 1;
    const price = raw.price ?? null;
    if ((raw.side !== "give" && raw.side !== "get") || typeof raw.cardId !== "string" || !raw.cardId || foil === null || !condition || !language ||
      typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 999 ||
      (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 1_000_000)) ||
      (raw.collectionId !== undefined && raw.collectionId !== null && typeof raw.collectionId !== "string")) {
      return "Each line needs a side, a card, a finish, a condition, a language, a count from 1 to 999 and a price of 0 or more";
    }
    lines.push({
      side: raw.side, cardId: raw.cardId, foil, condition, language, proxy: false, quantity, price: price as number | null,
      collectionId: typeof raw.collectionId === "string" && raw.collectionId ? raw.collectionId : null,
    });
  }
  return lines;
}

/** Removes up to `quantity` copies from a collection row. Links beyond what is left are removed, so those deck cards become missing. */
function takeCopies(database: DatabaseSync, collectionId: string, key: CopyKey, quantity: number): number {
  const row = database.prepare(`SELECT quantity FROM collection_cards WHERE collection_id = ? AND ${KEY}`).get(collectionId, ...keyValues(key));
  const have = Number(row?.quantity ?? 0);
  const take = Math.min(have, quantity);
  if (!take) return 0;
  if (take === have) database.prepare(`DELETE FROM collection_cards WHERE collection_id = ? AND ${KEY}`).run(collectionId, ...keyValues(key));
  else database.prepare(`UPDATE collection_cards SET quantity = quantity - ?, trade = MIN(trade, quantity - ?) WHERE collection_id = ? AND ${KEY}`)
    .run(take, take, collectionId, ...keyValues(key));
  trimLinks(database, collectionId, key);
  database.prepare(`UPDATE collections SET updated_at = ${now} WHERE id = ?`).run(collectionId);
  return take;
}

function putCopies(database: DatabaseSync, collectionId: string, key: CopyKey, quantity: number): void {
  database.prepare(
    `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity)`,
  ).run(collectionId, ...keyValues(key), quantity);
  database.prepare(`UPDATE collections SET updated_at = ${now} WHERE id = ?`).run(collectionId);
}

const keyOf = (row: { [key: string]: unknown }): CopyKey => ({
  cardId: String(row.card_id), foil: Number(row.foil) as CopyKey["foil"], condition: String(row.condition) as CopyKey["condition"],
  language: String(row.language), proxy: false,
});

function ownedCollection(database: DatabaseSync, id: unknown, userId: number): string | null {
  if (typeof id !== "string" || !id) return null;
  const item = access(database, "collection", id, userId);
  if (!item) return null;
  return database.prepare("SELECT kind FROM collections WHERE id = ?").get(id)?.kind === "wishlist" ? null : id;
}

export function registerTradeRoutes(app: FastifyInstance, database: DatabaseSync) {
  initializeTrades(database);
  const userOf = (request: { user: { id: number } | null }) => request.user!.id;
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "Trade not found" });
  const nameOf = (id: number | null) => (id === null ? null : { id, name: String(database.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name ?? "") });

  const tradeRow = (id: string, userId: number) => {
    const row = database.prepare("SELECT * FROM trades WHERE id = ?").get(id);
    if (!row || (Number(row.owner_id) !== userId && Number(row.partner_id) !== userId)) return null;
    return row;
  };

  /** A trade as the caller sees it: You give and You get are from the caller's side. */
  const present = (row: { [key: string]: unknown }, userId: number) => {
    const mine = Number(row.owner_id) === userId;
    const lines = database.prepare(
      `SELECT l.id, l.side, l.card_id, l.foil, l.condition, l.language, l.quantity, l.price, l.collection_id, c.name, c.set_code, c.set_name,
              c.collector_number, c.image_url, c.rarity, ${priceColumnList()}, col.name AS collection_name
       FROM trade_lines l JOIN cards c ON c.id = l.card_id LEFT JOIN collections col ON col.id = l.collection_id
       WHERE l.trade_id = ? ORDER BY l.id`,
    ).all(String(row.id)).map((line) => ({
      id: Number(line.id), side: mine ? String(line.side) : flip(String(line.side)), cardId: String(line.card_id), foil: Number(line.foil),
      condition: String(line.condition), language: String(line.language), quantity: Number(line.quantity),
      price: line.price === null ? null : Number(line.price), collectionId: line.collection_id === null ? null : String(line.collection_id),
      collectionName: line.collection_name === null ? null : String(line.collection_name), name: String(line.name), set_code: String(line.set_code),
      set_name: String(line.set_name), collector_number: String(line.collector_number), image_url: line.image_url, rarity: String(line.rarity),
      price_usd: line.price_usd, price_usd_foil: line.price_usd_foil, price_usd_etched: line.price_usd_etched, price_eur: line.price_eur, price_eur_foil: line.price_eur_foil, buy_usd: line.buy_usd ?? null, buy_usd_foil: line.buy_usd_foil ?? null, buy_usd_etched: line.buy_usd_etched ?? null,
    }));
    const partnerId = row.partner_id === null ? null : Number(row.partner_id);
    const other = mine ? partnerId : Number(row.owner_id);
    return {
      id: String(row.id), name: String(row.name), status: String(row.status), mine, with: nameOf(other),
      turn: row.turn_id === null || partnerId === null ? null : Number(row.turn_id) === userId ? "me" : "them",
      collectionId: (mine ? row.owner_collection : row.partner_collection) ?? null, canUndo: mine && partnerId === null && row.status === "done" && !!row.record,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at), doneAt: row.done_at ?? null, lines,
    };
  };

  app.get("/api/trades", async (request) => {
    const userId = userOf(request);
    return database.prepare("SELECT * FROM trades WHERE owner_id = ? OR partner_id = ? ORDER BY status = 'open' DESC, updated_at DESC")
      .all(userId, userId).map((row) => present(row, userId));
  });

  app.post<{ Body: { name?: unknown } }>("/api/trades", async (request, reply) => {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!name || name.length > 100) return reply.code(400).send({ error: "Trade names are 1 to 100 characters" });
    const id = randomUUID();
    database.prepare("INSERT INTO trades (id, owner_id, name) VALUES (?, ?, ?)").run(id, userOf(request), name);
    return reply.code(201).send(present(database.prepare("SELECT * FROM trades WHERE id = ?").get(id)!, userOf(request)));
  });

  // rename, change the lines (a change to a proposal goes back to the other account as a counter-offer) or reopen a cancelled trade
  app.patch<{ Params: { tradeId: string }; Body: { name?: unknown; lines?: unknown; status?: unknown } }>("/api/trades/:tradeId", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row) return notFound(reply);
    const { name, lines, status } = request.body ?? {};
    if (row.status === "done") return reply.code(409).send({ error: "This trade is done and cannot change" });
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) return reply.code(400).send({ error: "Trade names are 1 to 100 characters" });
      database.prepare(`UPDATE trades SET name = ?, updated_at = ${now} WHERE id = ?`).run(name.trim(), String(row.id));
    }
    if (status !== undefined) {
      if (status !== "open" && status !== "cancelled") return reply.code(400).send({ error: "A trade can be reopened or cancelled" });
      database.prepare(`UPDATE trades SET status = ?, updated_at = ${now} WHERE id = ?`).run(status, String(row.id));
    }
    if (lines !== undefined) {
      const list = readLines(lines);
      if (typeof list === "string") return reply.code(400).send({ error: list });
      if (row.status !== "open") return reply.code(409).send({ error: "Reopen the trade to change it" });
      const mine = Number(row.owner_id) === userId;
      for (const line of list) {
        if (!database.prepare("SELECT 1 FROM cards WHERE id = ?").get(line.cardId)) return reply.code(404).send({ error: "Card printing not found" });
        // a card you give comes from one of your own collections
        if (line.side === "give" && line.collectionId && !ownedCollection(database, line.collectionId, userId)) return reply.code(404).send({ error: "Collection not found" });
      }
      transaction(database, () => {
        // each account keeps the sources of its own given cards; the other account's lines keep theirs
        const keep = new Map(database.prepare("SELECT * FROM trade_lines WHERE trade_id = ?").all(String(row.id))
          .filter((line) => (mine ? line.side === "get" : line.side === "give"))
          .map((line) => [`${line.card_id}:${line.foil}:${line.condition}:${line.language}`, line.collection_id]));
        database.prepare("DELETE FROM trade_lines WHERE trade_id = ?").run(String(row.id));
        const insert = database.prepare(
          "INSERT INTO trade_lines (trade_id, side, card_id, foil, condition, language, quantity, price, collection_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        for (const line of list) {
          const side = mine ? line.side : flip(line.side);
          const source = line.side === "give" ? line.collectionId
            : keep.get(`${line.cardId}:${line.foil}:${line.condition}:${line.language}`) ?? null;
          insert.run(String(row.id), side, line.cardId, line.foil, line.condition, line.language, line.quantity, line.price, source as string | null);
        }
        const partner = row.partner_id === null ? null : Number(row.partner_id);
        const other = partner === null ? null : mine ? partner : Number(row.owner_id);
        database.prepare(`UPDATE trades SET updated_at = ${now}, turn_id = ? WHERE id = ?`).run(other, String(row.id));
      });
    }
    return present(database.prepare("SELECT * FROM trades WHERE id = ?").get(String(row.id))!, userId);
  });

  app.delete<{ Params: { tradeId: string } }>("/api/trades/:tradeId", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row) return notFound(reply);
    if (Number(row.owner_id) !== userId) return reply.code(403).send({ error: "Only the account that started a trade can delete it. Decline it instead." });
    database.prepare("DELETE FROM trades WHERE id = ?").run(String(row.id));
    return { status: "deleted" };
  });

  /** Moves the cards of a trade. With a partner, each side's given cards go to the other side's chosen collection. */
  const complete = (row: { [key: string]: unknown }, ownerCollection: string, partnerCollection: string | null): Record => {
    const record: Record = { removed: [], added: [] };
    const lines = database.prepare("SELECT * FROM trade_lines WHERE trade_id = ?").all(String(row.id));
    const ownerId = Number(row.owner_id);
    const partnerId = row.partner_id === null ? null : Number(row.partner_id);
    for (const line of lines) {
      const key = keyOf(line);
      const quantity = Number(line.quantity);
      const fromOwner = line.side === "give";
      // the owner's given cards leave their collection; with a partner, the partner's given cards leave theirs
      if (fromOwner || partnerId !== null) {
        const source = line.collection_id === null ? "" : String(line.collection_id);
        const giver = fromOwner ? ownerId : partnerId!;
        if (!source || !ownedCollection(database, source, giver)) {
          throw new Error(`Choose the collection that ${String(database.prepare("SELECT name FROM cards WHERE id = ?").get(key.cardId)?.name ?? "a card")} comes from`);
        }
        const taken = takeCopies(database, source, key, quantity);
        if (taken < quantity) {
          throw new Error(`${String(database.prepare("SELECT name FROM cards WHERE id = ?").get(key.cardId)?.name ?? "A card")}: only ${taken} of ${quantity} copies are in the collection`);
        }
        record.removed.push({ collectionId: source, key, quantity });
      }
      const receiver = fromOwner ? partnerCollection : ownerCollection;
      if (!receiver) continue;
      putCopies(database, receiver, key, quantity);
      record.added.push({ collectionId: receiver, key, quantity });
      lowerWishlists(database, fromOwner ? partnerId! : ownerId, [{ cardId: key.cardId, quantity, proxy: false }]);
    }
    // each account's side of the trade goes to its purchase history
    const price = (line: { [key: string]: unknown }) => (line.price === null || line.price === undefined ? null : Number(line.price));
    const nameOf = (id: number | null) => (id === null ? null : String(database.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name ?? ""));
    const sideOf = (userId: number, gives: string, collectionId: string | null, partner: number | null): TradeSide => ({
      tradeId: String(row.id), userId, name: String(row.name), partnerName: nameOf(partner), collectionId,
      given: lines.filter((line) => line.side === gives).map((line) => ({ key: keyOf(line), quantity: Number(line.quantity), collectionId: String(line.collection_id ?? ""), price: price(line) })),
      got: lines.filter((line) => line.side !== gives).map((line) => ({ key: keyOf(line), quantity: Number(line.quantity), price: price(line) })),
    });
    tradeDone(database, sideOf(ownerId, "give", ownerCollection || null, partnerId));
    if (partnerId !== null) tradeDone(database, sideOf(partnerId, "get", partnerCollection, ownerId));
    return record;
  };

  // completes a trade made without another account
  app.post<{ Params: { tradeId: string }; Body: { collectionId?: unknown } }>("/api/trades/:tradeId/complete", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row) return notFound(reply);
    if (Number(row.owner_id) !== userId || row.partner_id !== null) return reply.code(409).send({ error: "This trade was sent to another account; it completes when they accept it" });
    if (row.status !== "open") return reply.code(409).send({ error: "Only an open trade can be completed" });
    const target = ownedCollection(database, request.body?.collectionId, userId);
    const hasGet = !!database.prepare("SELECT 1 FROM trade_lines WHERE trade_id = ? AND side = 'get'").get(String(row.id));
    if (hasGet && !target) return reply.code(400).send({ error: "Choose the collection for the cards you get" });
    try {
      const record = transaction(database, () => {
        const result = complete(row, target ?? "", null);
        database.prepare(`UPDATE trades SET status = 'done', owner_collection = ?, record = ?, done_at = ${now}, updated_at = ${now} WHERE id = ?`)
          .run(target, JSON.stringify(result), String(row.id));
        return result;
      });
      return { status: "done", removed: record.removed.length, added: record.added.length };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not complete the trade" });
    }
  });

  // undoes a completed trade made without another account: the cards go back and the trade is open again
  app.post<{ Params: { tradeId: string } }>("/api/trades/:tradeId/reopen", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row || Number(row.owner_id) !== userId) return notFound(reply);
    if (row.status !== "done" || row.partner_id !== null || !row.record) return reply.code(409).send({ error: "This trade cannot be undone" });
    const record = JSON.parse(String(row.record)) as Record;
    transaction(database, () => {
      for (const change of record.added) takeCopies(database, change.collectionId, change.key, change.quantity);
      for (const change of record.removed) {
        if (database.prepare("SELECT 1 FROM collections WHERE id = ?").get(change.collectionId)) putCopies(database, change.collectionId, change.key, change.quantity);
      }
      database.prepare(`UPDATE trades SET status = 'open', record = NULL, done_at = NULL, updated_at = ${now} WHERE id = ?`).run(String(row.id));
      tradeReopened(database, String(row.id));
    });
    return { status: "open" };
  });

  // sends a trade to another account on this server as a proposal
  app.post<{ Params: { tradeId: string }; Body: { userId?: unknown; collectionId?: unknown } }>("/api/trades/:tradeId/send", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row || Number(row.owner_id) !== userId) return notFound(reply);
    if (row.status !== "open") return reply.code(409).send({ error: "Only an open trade can be sent" });
    const to = Number(request.body?.userId);
    if (!Number.isInteger(to) || to === userId || !database.prepare("SELECT 1 FROM users WHERE id = ?").get(to)) {
      return reply.code(404).send({ error: "Choose another account on this server" });
    }
    if (row.partner_id !== null && Number(row.partner_id) !== to) return reply.code(409).send({ error: "This trade was already sent to someone else" });
    const target = ownedCollection(database, request.body?.collectionId, userId);
    if (!target) return reply.code(400).send({ error: "Choose the collection for the cards you get" });
    database.prepare(`UPDATE trades SET partner_id = ?, turn_id = ?, owner_collection = ?, updated_at = ${now} WHERE id = ?`).run(to, to, target, String(row.id));
    return present(database.prepare("SELECT * FROM trades WHERE id = ?").get(String(row.id))!, userId);
  });

  // the account whose turn it is accepts: the cards move on both sides
  app.post<{ Params: { tradeId: string }; Body: { collectionId?: unknown } }>("/api/trades/:tradeId/accept", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row) return notFound(reply);
    if (row.partner_id === null || row.status !== "open") return reply.code(409).send({ error: "There is no open proposal to accept" });
    if (Number(row.turn_id) !== userId) return reply.code(409).send({ error: "Wait for the other account to answer your last change" });
    const mine = Number(row.owner_id) === userId;
    const target = ownedCollection(database, request.body?.collectionId, userId) ?? (mine ? ownedCollection(database, row.owner_collection, userId) : null);
    if (!target) return reply.code(400).send({ error: "Choose the collection for the cards you get" });
    const ownerCollection = mine ? target : ownedCollection(database, row.owner_collection, Number(row.owner_id));
    const partnerCollection = mine ? ownedCollection(database, row.partner_collection, Number(row.partner_id)) : target;
    if (!ownerCollection || !partnerCollection) return reply.code(409).send({ error: "The other account has to choose where their cards go first" });
    try {
      transaction(database, () => {
        complete(row, ownerCollection, partnerCollection);
        database.prepare(`UPDATE trades SET status = 'done', owner_collection = ?, partner_collection = ?, turn_id = NULL, done_at = ${now}, updated_at = ${now} WHERE id = ?`)
          .run(ownerCollection, partnerCollection, String(row.id));
      });
      return { status: "done" };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not complete the trade" });
    }
  });

  // the receiving account chooses where the cards it gets go, before or while answering
  app.post<{ Params: { tradeId: string }; Body: { collectionId?: unknown } }>("/api/trades/:tradeId/collection", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row) return notFound(reply);
    const target = ownedCollection(database, request.body?.collectionId, userId);
    if (!target) return reply.code(404).send({ error: "Collection not found" });
    database.prepare(`UPDATE trades SET ${Number(row.owner_id) === userId ? "owner_collection" : "partner_collection"} = ? WHERE id = ?`).run(target, String(row.id));
    return { status: "saved" };
  });

  app.post<{ Params: { tradeId: string } }>("/api/trades/:tradeId/decline", async (request, reply) => {
    const userId = userOf(request);
    const row = tradeRow(request.params.tradeId, userId);
    if (!row || row.partner_id === null) return notFound(reply);
    if (row.status !== "open") return reply.code(409).send({ error: "There is no open proposal to decline" });
    database.prepare(`UPDATE trades SET status = 'cancelled', turn_id = NULL, updated_at = ${now} WHERE id = ?`).run(String(row.id));
    return { status: "cancelled" };
  });

  // cards on other accounts' trade lists that your wishlists want, and your trade cards their wishlists want
  app.get("/api/trades/matches", async (request) => {
    const userId = userOf(request);
    const rows = (wantFrom: "me" | "them") => database.prepare(
      `SELECT owner.id AS user_id, owner.name AS user_name, c.id AS card_id, c.name, c.set_code, c.set_name, c.collector_number, c.image_url, ${priceColumnList()},
              i.foil, i.condition, i.language, i.trade, i.collection_id, MIN(i.trade, wanted.quantity) AS quantity, wanter.id AS wanter_id, wanter.name AS wanter_name
       FROM collection_cards i JOIN collections col ON col.id = i.collection_id AND col.kind = 'collection'
       JOIN users owner ON owner.id = col.owner_id JOIN cards c ON c.id = i.card_id
       JOIN (SELECT wcol.owner_id, wc.oracle_id, SUM(wi.quantity) AS quantity FROM collection_cards wi
             JOIN collections wcol ON wcol.id = wi.collection_id AND wcol.kind = 'wishlist' JOIN cards wc ON wc.id = wi.card_id
             GROUP BY wcol.owner_id, wc.oracle_id) wanted ON wanted.oracle_id = c.oracle_id AND wanted.owner_id != owner.id
       JOIN users wanter ON wanter.id = wanted.owner_id
       WHERE i.trade > 0 AND i.proxy = 0 AND ${wantFrom === "me" ? "wanted.owner_id = ?" : "owner.id = ?"}
       GROUP BY owner.id, wanter.id, i.collection_id, i.card_id, i.foil, i.condition, i.language
       ORDER BY ${wantFrom === "me" ? "owner.name" : "wanter.name"}, c.name LIMIT 500`,
    ).all(userId).map((row) => ({
      user: wantFrom === "me" ? { id: Number(row.user_id), name: String(row.user_name) } : { id: Number(row.wanter_id), name: String(row.wanter_name) },
      cardId: String(row.card_id), name: String(row.name), set_code: String(row.set_code), set_name: String(row.set_name), collector_number: String(row.collector_number),
      image_url: row.image_url, foil: Number(row.foil), condition: String(row.condition), language: String(row.language), quantity: Number(row.quantity),
      collectionId: wantFrom === "them" ? String(row.collection_id) : null,
      price_usd: row.price_usd, price_usd_foil: row.price_usd_foil, price_usd_etched: row.price_usd_etched, price_eur: row.price_eur, price_eur_foil: row.price_eur_foil, buy_usd: row.buy_usd ?? null, buy_usd_foil: row.buy_usd_foil ?? null, buy_usd_etched: row.buy_usd_etched ?? null,
    }));
    return { theyHave: rows("me"), theyWant: rows("them") };
  });

  // the link to your trade binder: read it, make a new one, or turn it off
  app.get("/api/trade-share", async (request) => ({ token: (database.prepare("SELECT token FROM trade_shares WHERE user_id = ?").get(userOf(request))?.token as string | undefined) ?? null }));
  app.post("/api/trade-share", async (request) => {
    const token = randomBytes(18).toString("base64url");
    database.prepare("INSERT INTO trade_shares (user_id, token) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at")
      .run(userOf(request), token);
    return { token };
  });
  app.delete("/api/trade-share", async (request) => {
    database.prepare("DELETE FROM trade_shares WHERE user_id = ?").run(userOf(request));
    return { token: null };
  });

  // the shared trade binder, readable without signing in
  app.get<{ Params: { token: string } }>("/share/:token", async (request, reply) => {
    const owner = database.prepare("SELECT u.id, u.name FROM trade_shares s JOIN users u ON u.id = s.user_id WHERE s.token = ?").get(String(request.params.token));
    reply.header("cache-control", "no-store").header("x-robots-tag", "noindex");
    if (!owner) return reply.code(404).type("text/html; charset=utf-8").send(sharePage("Trade binder", "<p>This link is turned off or was replaced.</p>"));
    const rows = database.prepare(
      `SELECT c.name, c.set_code, c.set_name, c.collector_number, c.image_url, i.foil, i.condition, i.language, SUM(i.trade) AS count, ${priceColumns(priceSourceOf(database, Number(owner.id)))}
       FROM collection_cards i JOIN collections col ON col.id = i.collection_id JOIN cards c ON c.id = i.card_id
       WHERE col.owner_id = ? AND col.kind = 'collection' AND i.trade > 0 AND i.proxy = 0
       GROUP BY i.card_id, i.foil, i.condition, i.language ORDER BY c.name, c.set_code`,
    ).all(Number(owner.id));
    const finish = ["", "Foil", "Etched"];
    const price = (row: { [key: string]: unknown }) => {
      const value = Number(row.foil) === 0 ? row.price_usd : Number(row.foil) === 1 ? row.price_usd_foil : row.price_usd_etched ?? row.price_usd_foil;
      return typeof value === "number" ? `$${value.toFixed(2)}` : "";
    };
    const body = rows.length
      ? `<table><thead><tr><th>Count</th><th>Card</th><th>Set</th><th>Finish</th><th>Condition</th><th>Language</th><th>Price</th></tr></thead><tbody>${
        rows.map((row) => `<tr><td>${Number(row.count)}</td><td>${escape(String(row.name))}</td><td>${escape(String(row.set_name))} (${escape(String(row.set_code).toUpperCase())}) ${escape(String(row.collector_number))}</td><td>${finish[Number(row.foil)] ?? ""}</td><td>${escape(String(row.condition))}</td><td>${escape(String(row.language).toUpperCase())}</td><td>${price(row)}</td></tr>`).join("")
      }</tbody></table>`
      : "<p>Nothing is marked for trade right now.</p>";
    return reply.type("text/html; charset=utf-8").send(sharePage(`${String(owner.name)}'s trade binder`, `<p>${rows.reduce((sum, row) => sum + Number(row.count), 0)} cards for trade.</p>${body}`));
  });
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sharePage(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escape(title)}</title><style>
:root{--bg:#e9ebee;--panel:#f7f8fa;--line:#c9ced6;--text:#1d232c;--muted:#5d6775}
@media (prefers-color-scheme:dark){:root{--bg:#1b1f25;--panel:#22272e;--line:#3a424d;--text:#e3e7ec;--muted:#9aa5b3}}
body{margin:0;font:14px/1.4 "Segoe UI",system-ui,-apple-system,Arial,sans-serif;background:var(--bg);color:var(--text)}
main{max-width:1000px;margin:0 auto;padding:16px}h1{font-size:20px;margin:6px 0 4px}p{color:var(--muted)}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line)}th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left}
th{font-size:12px;color:var(--muted)}td:first-child,td:last-child{font-variant-numeric:tabular-nums}
</style></head><body><main><h1>${escape(title)}</h1>${body}<p>Shared from Mana Vault.</p></main></body></html>`;
}
