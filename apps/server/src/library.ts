// ---------- library: collections, set completion, bulk edits, ownership and sending ----------
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { listSets } from "./sets.js";
import { type CopyExtras, type CopyKey, type Currency, NO_EXTRAS, PRICE_COLUMNS, priceSql, readCopyExtras, readCopyKey } from "./copies.js";
import { collectionLinks, linkedCount, moveLinks, rowKey, trimLinks } from "./links.js";

export type Kind = "collection" | "deck";
export type Completion = "none" | "main" | "all" | "names";
export type Finish = "any" | "regular" | "foil" | "both";
export type CollectionKind = "collection" | "wishlist";
type Role = "owner" | "member";

const COMPLETIONS: Completion[] = ["none", "main", "all", "names"];
const FINISHES: Finish[] = ["any", "regular", "foil", "both"];
const TABLE: Record<Kind, string> = { collection: "collections", deck: "decks" };

export function access(database: DatabaseSync, kind: Kind, id: string, userId: number): { role: Role; ownerId: number } | null {
  const row = database.prepare(`SELECT owner_id FROM ${TABLE[kind]} WHERE id = ?`).get(id);
  if (!row || typeof row.owner_id !== "number") return null;
  if (row.owner_id === userId) return { role: "owner", ownerId: row.owner_id };
  const member = database.prepare("SELECT 1 FROM members WHERE kind = ? AND item_id = ? AND user_id = ?").get(kind, id, userId);
  return member ? { role: "member", ownerId: row.owner_id } : null;
}

/** Removes an item's members and open offers. Used when an item is deleted or changes owner. */
export function forgetItem(database: DatabaseSync, kind: Kind, id: string): void {
  database.prepare("DELETE FROM members WHERE kind = ? AND item_id = ?").run(kind, id);
  database.prepare("UPDATE shares SET status = 'cancelled', answered_at = CURRENT_TIMESTAMP WHERE kind = ? AND item_id = ? AND status = 'pending'").run(kind, id);
}

function sharedWith(database: DatabaseSync, kind: Kind, id: string): Array<{ id: number; name: string }> {
  return database.prepare(
    "SELECT u.id, u.name FROM members m JOIN users u ON u.id = m.user_id WHERE m.kind = ? AND m.item_id = ? ORDER BY u.name",
  ).all(kind, id).map((row) => ({ id: Number(row.id), name: String(row.name) }));
}

export function itemSharing(database: DatabaseSync, kind: Kind, id: string, userId: number) {
  const item = database.prepare(
    `SELECT t.owner_id, u.name AS owner_name, m.display_name FROM ${TABLE[kind]} t JOIN users u ON u.id = t.owner_id
     LEFT JOIN members m ON m.kind = ? AND m.item_id = t.id AND m.user_id = ? WHERE t.id = ?`,
  ).get(kind, userId, id);
  const role: Role = Number(item?.owner_id) === userId ? "owner" : "member";
  return {
    role,
    owner: { id: Number(item?.owner_id), name: String(item?.owner_name ?? "") },
    displayName: typeof item?.display_name === "string" ? item.display_name : null,
    sharedWith: sharedWith(database, kind, id),
  };
}

// ---------- set completion ----------

type Printing = {
  id: string; oracle_id: string; name: string; set_code: string; set_name: string; collector_number: string; rarity: string;
  colors: string; image_url: string | null; mana_cost: string | null; type_line: string; finishes: string; promo: number;
  variation: number; released_at: string | null;
};
type Need = "any" | "regular" | "foil";
export type MissingCard = Omit<Printing, "finishes" | "promo" | "variation" | "oracle_id"> & { oracle_id: string; needs: Need };
export type SetProgress = { code: string; name: string; owned: number; total: number; printedSize: number | null; known: boolean };

const collectorNumber = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);

/** Main set: plain numbered cards up to the set's printed size, or, without one, numbered cards that are not promos or variants. */
export function isMainPrinting(card: Pick<Printing, "collector_number" | "promo" | "variation">, printedSize: number | null): boolean {
  const number = collectorNumber(card.collector_number);
  if (number === null || number < 1) return false;
  return printedSize ? number <= printedSize : !card.promo && !card.variation;
}

function availableFinishes(cards: Array<Pick<Printing, "finishes">>): { regular: boolean; foil: boolean } {
  let regular = false;
  let foil = false;
  for (const card of cards) {
    const list = card.finishes ? card.finishes.split(",") : [];
    // printings imported before 0.2.0 have no finish list; treat them as available in both
    if (!list.length) return { regular: true, foil: true };
    if (list.includes("nonfoil")) regular = true;
    if (list.includes("foil") || list.includes("etched")) foil = true;
  }
  return { regular, foil };
}

function needsFor(finish: Finish, available: { regular: boolean; foil: boolean }): Need[] {
  if (finish === "any") return ["any"];
  if (finish === "regular") return available.regular ? ["regular"] : [];
  if (finish === "foil") return available.foil ? ["foil"] : [];
  return [...(available.regular ? ["regular" as const] : []), ...(available.foil ? ["foil" as const] : [])];
}

export function collectionCompletion(database: DatabaseSync, collectionId: string) {
  const collection = database.prepare("SELECT completion, finish FROM collections WHERE id = ?").get(collectionId);
  const completion = String(collection?.completion ?? "none") as Completion;
  const finish = String(collection?.finish ?? "any") as Finish;
  const codes = completion === "none" ? [] : database.prepare("SELECT set_code FROM collection_sets WHERE collection_id = ? ORDER BY set_code")
    .all(collectionId).map((row) => String(row.set_code));
  const sets: SetProgress[] = [];
  const missing: MissingCard[] = [];
  if (!codes.length) return { completion, finish, sets, overall: { owned: 0, total: 0 }, missing };

  const owned = new Map<string, { regular: number; foil: number }>();
  for (const row of database.prepare(
    `SELECT cc.card_id, cc.foil, cc.quantity FROM collection_cards cc JOIN cards c ON c.id = cc.card_id
     WHERE cc.collection_id = ? AND cc.proxy = 0 AND c.set_code IN (SELECT set_code FROM collection_sets WHERE collection_id = ?)`,
  ).all(collectionId, collectionId)) {
    const entry = owned.get(String(row.card_id)) ?? { regular: 0, foil: 0 };
    if (Number(row.foil) >= 1) entry.foil += Number(row.quantity);
    else entry.regular += Number(row.quantity);
    owned.set(String(row.card_id), entry);
  }
  const printingsOf = database.prepare(
    `SELECT id, oracle_id, name, set_code, set_name, collector_number, rarity, colors, image_url, mana_cost, type_line,
            finishes, promo, variation, released_at
     FROM cards WHERE set_code = ?`,
  );
  const setInfo = database.prepare("SELECT name, printed_size FROM sets WHERE code = ?");
  const byNumber = (a: Printing, b: Printing) => (collectorNumber(a.collector_number) ?? 1e9) - (collectorNumber(b.collector_number) ?? 1e9)
    || a.collector_number.localeCompare(b.collector_number);

  for (const code of codes) {
    const printings = (printingsOf.all(code) as Printing[]).sort(byNumber);
    const info = setInfo.get(code);
    const printedSize = typeof info?.printed_size === "number" ? info.printed_size : null;
    const name = typeof info?.name === "string" ? info.name : printings[0]?.set_name ?? code.toUpperCase();
    // each slot is one printing, or for "names" every printing of one card in this set
    let slots: Printing[][];
    if (completion === "all") slots = printings.map((card) => [card]);
    else if (completion === "main") slots = printings.filter((card) => isMainPrinting(card, printedSize)).map((card) => [card]);
    else {
      const groups = new Map<string, Printing[]>();
      for (const card of printings) groups.set(card.oracle_id, [...(groups.get(card.oracle_id) ?? []), card]);
      slots = [...groups.values()];
    }
    let setOwned = 0;
    let setTotal = 0;
    for (const slot of slots) {
      const have = slot.reduce((sum, card) => {
        const entry = owned.get(card.id);
        return { regular: sum.regular + (entry?.regular ?? 0), foil: sum.foil + (entry?.foil ?? 0) };
      }, { regular: 0, foil: 0 });
      // the card shown for a missing slot: the main printing when there is one
      const shown = slot.find((card) => isMainPrinting(card, printedSize)) ?? slot[0]!;
      for (const need of needsFor(finish, availableFinishes(slot))) {
        setTotal += 1;
        const met = need === "any" ? have.regular + have.foil > 0 : need === "regular" ? have.regular > 0 : have.foil > 0;
        if (met) setOwned += 1;
        else {
          const { finishes: _finishes, promo: _promo, variation: _variation, ...card } = shown;
          missing.push({ ...card, needs: need });
        }
      }
    }
    sets.push({ code, name, owned: setOwned, total: setTotal, printedSize, known: !!info });
  }
  const overall = sets.reduce((sum, set) => ({ owned: sum.owned + set.owned, total: sum.total + set.total }), { owned: 0, total: 0 });
  return { completion, finish, sets, overall, missing };
}

// ---------- collections ----------

/** The value of every copy in a collection, in both currencies, and how many copies have no price. Proxies have no value. */
export function collectionValue(database: DatabaseSync, id: string): { usd: number; eur: number; unpricedUsd: number; unpricedEur: number } {
  const row = database.prepare(
    `SELECT COALESCE(SUM(i.quantity * ${priceSql("usd")}), 0) AS usd, COALESCE(SUM(i.quantity * ${priceSql("eur")}), 0) AS eur,
            COALESCE(SUM(CASE WHEN ${priceSql("usd")} IS NULL THEN i.quantity END), 0) AS unpriced_usd,
            COALESCE(SUM(CASE WHEN ${priceSql("eur")} IS NULL THEN i.quantity END), 0) AS unpriced_eur
     FROM collection_cards i JOIN cards c ON c.id = i.card_id WHERE i.collection_id = ? AND i.proxy = 0`,
  ).get(id);
  const round = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
  return { usd: round(row?.usd), eur: round(row?.eur), unpricedUsd: Number(row?.unpriced_usd ?? 0), unpricedEur: Number(row?.unpriced_eur ?? 0) };
}

function collectionSummary(database: DatabaseSync, id: string, userId: number) {
  const row = database.prepare(
    `SELECT c.id, c.name, c.description, c.completion, c.finish, c.kind, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM collection_cards WHERE collection_id = c.id) AS entry_count,
            (SELECT COALESCE(SUM(quantity), 0) FROM collection_cards WHERE collection_id = c.id) AS card_count,
            (SELECT COALESCE(SUM(trade), 0) FROM collection_cards WHERE collection_id = c.id) AS trade_count
     FROM collections c WHERE c.id = ?`,
  ).get(id);
  if (!row) return null;
  const sets = database.prepare(
    `SELECT cs.set_code AS code, COALESCE(s.name, (SELECT set_name FROM cards WHERE set_code = cs.set_code LIMIT 1), upper(cs.set_code)) AS name
     FROM collection_sets cs LEFT JOIN sets s ON s.code = cs.set_code WHERE cs.collection_id = ? ORDER BY name`,
  ).all(id).map((set) => ({ code: String(set.code), name: String(set.name) }));
  const progress = sets.length && row.completion !== "none" ? collectionCompletion(database, id) : null;
  const sharing = itemSharing(database, "collection", id, userId);
  return {
    id: String(row.id),
    name: sharing.displayName ?? String(row.name),
    realName: String(row.name),
    description: String(row.description),
    completion: String(row.completion) as Completion,
    finish: String(row.finish) as Finish,
    kind: String(row.kind) as CollectionKind,
    sets,
    entryCount: Number(row.entry_count),
    cardCount: Number(row.card_count),
    tradeCount: Number(row.trade_count),
    value: collectionValue(database, id),
    progress: progress ? progress.overall : null,
    updatedAt: String(row.updated_at),
    ...sharing,
  };
}

export function listCollections(database: DatabaseSync, userId: number) {
  const ids = database.prepare(
    `SELECT c.id FROM collections c
     WHERE c.owner_id = ? OR EXISTS (SELECT 1 FROM members m WHERE m.kind = 'collection' AND m.item_id = c.id AND m.user_id = ?)
     ORDER BY c.created_at, c.rowid`,
  ).all(userId, userId).map((row) => String(row.id));
  return ids.map((id) => collectionSummary(database, id, userId)!);
}

type CollectionInput = { id?: string; name: string; description: string; completion: Completion; finish: Finish; kind: CollectionKind; sets: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readCollectionInput(body: unknown): CollectionInput | string {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 100) return "Collection names must be 1 to 100 characters";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (description.length > 500) return "Descriptions can be up to 500 characters";
  const completion = (value.completion ?? "none") as Completion;
  if (!COMPLETIONS.includes(completion)) return "Choose a completion rule: none, main, all or names";
  const finish = (value.finish ?? "any") as Finish;
  if (!FINISHES.includes(finish)) return "Choose a finish rule: any, regular, foil or both";
  const kind = (value.kind ?? "collection") as CollectionKind;
  if (kind !== "collection" && kind !== "wishlist") return "A collection is either a collection or a wishlist";
  const sets = value.sets ?? [];
  if (!Array.isArray(sets) || sets.length > 300 || !sets.every((code) => typeof code === "string" && /^[a-z0-9]{2,8}$/i.test(code))) {
    return "Sets must be a list of set codes";
  }
  // the phone names a collection it creates offline, so the queued change creates the same collection
  if (value.id !== undefined && (typeof value.id !== "string" || !UUID.test(value.id))) return "A new collection id must be a UUID";
  return {
    ...(typeof value.id === "string" ? { id: value.id.toLowerCase() } : {}),
    name, description, completion, finish, kind, sets: [...new Set(sets.map((code: string) => code.toLowerCase()))],
  };
}

function saveCollectionSets(database: DatabaseSync, id: string, sets: string[]): string | null {
  const known = database.prepare("SELECT 1 FROM cards WHERE set_code = ? LIMIT 1");
  const unknown = sets.filter((code) => !known.get(code));
  if (unknown.length) return `These sets are not in the card database: ${unknown.map((code) => code.toUpperCase()).join(", ")}`;
  database.prepare("DELETE FROM collection_sets WHERE collection_id = ?").run(id);
  const insert = database.prepare("INSERT INTO collection_sets (collection_id, set_code) VALUES (?, ?)");
  for (const code of sets) insert.run(id, code);
  return null;
}

export function createCollection(database: DatabaseSync, ownerId: number, input: CollectionInput): string {
  const id = input.id ?? randomUUID();
  if (database.prepare("SELECT 1 FROM collections WHERE id = ?").get(id)) throw new Error("A collection with this id already exists");
  database.prepare("INSERT INTO collections (id, owner_id, name, description, completion, finish, kind) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, ownerId, input.name, input.description, input.completion, input.finish, input.kind);
  const problem = saveCollectionSets(database, id, input.sets);
  if (problem) throw new Error(problem);
  return id;
}

export const ENTRY_COLUMNS = `c.id, c.oracle_id, c.name, c.mana_cost, c.mana_value, c.type_line, c.set_code, c.set_name, c.collector_number, c.rarity,
  c.image_url, c.colors, ${PRICE_COLUMNS}, i.quantity, i.foil, i.condition, i.language, i.proxy, i.trade,
  i.purchase_price, i.price_currency, i.added_at, i.misprint, i.altered, i.signed`;
const KEY_WHERE = "card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?";
const KEY_CONFLICT = "ON CONFLICT(collection_id, card_id, foil, condition, language, proxy)";
const keyValues = (key: CopyKey) => [key.cardId, key.foil, key.condition, key.language, key.proxy ? 1 : 0] as const;
const extraValues = (extras: CopyExtras) =>
  [extras.purchasePrice, extras.priceCurrency, extras.addedAt, extras.misprint ? 1 : 0, extras.altered ? 1 : 0, extras.signed ? 1 : 0] as const;
// details given for a row that already exists fill only what it does not have yet
const EXTRAS_MERGE = `purchase_price = COALESCE(purchase_price, excluded.purchase_price), price_currency = COALESCE(price_currency, excluded.price_currency),
  added_at = COALESCE(added_at, excluded.added_at), misprint = MAX(misprint, excluded.misprint), altered = MAX(altered, excluded.altered), signed = MAX(signed, excluded.signed)`;

/** A collection row as the interface uses it: flags as true or false. */
export function toEntry(row: Record<string, unknown>) {
  return { ...row, proxy: Number(row.proxy) === 1, misprint: Number(row.misprint) === 1, altered: Number(row.altered) === 1, signed: Number(row.signed) === 1 };
}

type Item = CopyKey & { quantity: number; trade?: number; extras?: CopyExtras };

function readItems(body: unknown, allowZero: boolean): Item[] | string {
  const items = body && typeof body === "object" ? (body as { items?: unknown }).items : undefined;
  if (!Array.isArray(items) || !items.length || items.length > 10_000) return "Provide a list of 1 to 10,000 cards";
  const result: Item[] = [];
  for (const item of items) {
    const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const quantity = value.quantity;
    const key = readCopyKey(value);
    if (!key || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < (allowZero ? 0 : 1) || quantity > 10_000) {
      return `Each card needs a cardId, a finish, a known condition and language, and a quantity from ${allowZero ? 0 : 1} to 10,000`;
    }
    const trade = value.trade;
    if (trade !== undefined && (typeof trade !== "number" || !Number.isInteger(trade) || trade < 0 || trade > quantity)) {
      return "The number for trade must be a whole number from 0 to the quantity";
    }
    const hasExtras = ["purchasePrice", "priceCurrency", "addedAt", "misprint", "altered", "signed"].some((name) => value[name] !== undefined);
    const extras = hasExtras ? readCopyExtras(value) : null;
    if (typeof extras === "string") return extras;
    result.push({ ...key, quantity, ...(trade === undefined ? {} : { trade }), ...(extras ? { extras } : {}) });
  }
  return result;
}

function touch(database: DatabaseSync, kind: Kind, id: string) {
  database.prepare(`UPDATE ${TABLE[kind]} SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?`).run(id);
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

export function copyCollectionCards(database: DatabaseSync, from: string, to: string) {
  database.prepare(
    `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, trade, purchase_price, price_currency, added_at, misprint, altered, signed)
       SELECT ?, card_id, foil, condition, language, proxy, quantity, trade, purchase_price, price_currency, added_at, misprint, altered, signed
       FROM collection_cards WHERE collection_id = ?
     ${KEY_CONFLICT} DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity), trade = MIN(MIN(10000, quantity + excluded.quantity), trade + excluded.trade)`,
  ).run(to, from);
}

/** A wishlist row lowered because copies of its card were added to a collection: the row before and after, for undo. */
export type WishChange = { collectionId: string; collectionName: string; before: Item; after: Item };

/**
 * Lowers wishlist rows of the cards added to a collection: one wanted copy per added copy, the row added first lowered
 * first, and a row at zero removed. Proxies are not the real card and lower nothing.
 */
export function lowerWishlists(database: DatabaseSync, userId: number, added: Array<{ cardId: string; quantity: number; proxy: boolean }>): WishChange[] {
  const changes: WishChange[] = [];
  const wanted = database.prepare(
    `SELECT i.collection_id, COALESCE(m.display_name, col.name) AS name, i.card_id, i.foil, i.condition, i.language, i.proxy, i.quantity, i.trade
     FROM collection_cards i JOIN collections col ON col.id = i.collection_id JOIN cards c ON c.id = i.card_id
     LEFT JOIN members m ON m.kind = 'collection' AND m.item_id = col.id AND m.user_id = ?
     WHERE col.kind = 'wishlist' AND (col.owner_id = ? OR m.user_id IS NOT NULL)
       AND c.oracle_id = (SELECT oracle_id FROM cards WHERE id = ?)
     ORDER BY i.rowid`,
  );
  for (const item of added) {
    if (item.proxy || item.quantity <= 0) continue;
    let left = item.quantity;
    for (const row of wanted.all(userId, userId, item.cardId)) {
      if (left <= 0) break;
      const key: CopyKey = {
        cardId: String(row.card_id), foil: Number(row.foil) as CopyKey["foil"], condition: String(row.condition) as CopyKey["condition"],
        language: String(row.language), proxy: Number(row.proxy) === 1,
      };
      const have = Number(row.quantity);
      const take = Math.min(left, have);
      const next = have - take;
      const collectionId = String(row.collection_id);
      if (next === 0) database.prepare(`DELETE FROM collection_cards WHERE collection_id = ? AND ${KEY_WHERE}`).run(collectionId, ...keyValues(key));
      else database.prepare(`UPDATE collection_cards SET quantity = ?, trade = MIN(trade, ?) WHERE collection_id = ? AND ${KEY_WHERE}`).run(next, next, collectionId, ...keyValues(key));
      touch(database, "collection", collectionId);
      changes.push({ collectionId, collectionName: String(row.name), before: { ...key, quantity: have, trade: Number(row.trade) }, after: { ...key, quantity: next, trade: Math.min(Number(row.trade), next) } });
      left -= take;
    }
  }
  return changes;
}

const isWishlist = (database: DatabaseSync, id: string) => database.prepare("SELECT kind FROM collections WHERE id = ?").get(id)?.kind === "wishlist";

export function copyDeck(database: DatabaseSync, from: string, ownerId: number, name: string): string {
  const id = randomUUID();
  database.prepare("INSERT INTO decks (id, name, format, mode, owner_id) SELECT ?, ?, format, 'theme', ? FROM decks WHERE id = ?").run(id, name, ownerId, from);
  database.prepare(
    "INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone) SELECT ?, oracle_id, printing_id, quantity, zone FROM deck_cards WHERE deck_id = ?",
  ).run(id, from);
  return id;
}

// ---------- routes ----------

export function registerLibraryRoutes(app: FastifyInstance, database: DatabaseSync) {
  const userOf = (request: { user: { id: number } | null }) => request.user!.id;
  const notFound = (reply: FastifyReply, kind: Kind) => reply.code(404).send({ error: kind === "collection" ? "Collection not found" : "Deck not found" });

  // every route with a collection in its address checks that the signed-in account may use it
  app.addHook("preHandler", async (request, reply) => {
    const params = request.params as Record<string, string> | undefined;
    if (!request.user || !params) return;
    if (params.collectionId && !access(database, "collection", params.collectionId, request.user.id)) return notFound(reply, "collection");
    if (params.deckId && !access(database, "deck", params.deckId, request.user.id)) return notFound(reply, "deck");
  });

  app.get<{ Querystring: { q?: string } }>("/api/sets", async (request) => listSets(database, typeof request.query.q === "string" ? request.query.q.slice(0, 60) : ""));

  app.get("/api/users", async (request) =>
    database.prepare("SELECT id, name FROM users WHERE id != ? ORDER BY name COLLATE NOCASE").all(userOf(request))
      .map((row) => ({ id: Number(row.id), name: String(row.name) })));

  app.get("/api/collections", async (request) => listCollections(database, userOf(request)));

  app.post("/api/collections", async (request, reply) => {
    const input = readCollectionInput(request.body);
    if (typeof input === "string") return reply.code(400).send({ error: input });
    try {
      const id = transaction(database, () => createCollection(database, userOf(request), input));
      return reply.code(201).send(collectionSummary(database, id, userOf(request)));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not create the collection" });
    }
  });

  app.get<{ Params: { collectionId: string } }>("/api/collections/:collectionId", async (request) =>
    collectionSummary(database, request.params.collectionId, userOf(request)));

  app.patch<{ Params: { collectionId: string } }>("/api/collections/:collectionId", async (request, reply) => {
    const input = readCollectionInput(request.body);
    if (typeof input === "string") return reply.code(400).send({ error: input });
    const id = request.params.collectionId;
    try {
      transaction(database, () => {
        database.prepare("UPDATE collections SET name = ?, description = ?, completion = ?, finish = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?")
          .run(input.name, input.description, input.completion, input.finish, id);
        const problem = saveCollectionSets(database, id, input.sets);
        if (problem) throw new Error(problem);
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not save the collection" });
    }
    return collectionSummary(database, id, userOf(request));
  });

  app.delete<{ Params: { collectionId: string } }>("/api/collections/:collectionId", async (request, reply) => {
    const id = request.params.collectionId;
    if (access(database, "collection", id, userOf(request))?.role !== "owner") {
      return reply.code(403).send({ error: "Only the owner can delete a collection. Use Leave shared collection instead." });
    }
    transaction(database, () => {
      forgetItem(database, "collection", id);
      database.prepare("DELETE FROM collections WHERE id = ?").run(id);
    });
    return { status: "deleted" };
  });

  // each row lists the decks its copies are linked to
  const entriesOf = (collectionId: string, where = "", values: unknown[] = []) => {
    const links = collectionLinks(database, collectionId);
    return database.prepare(
      `SELECT ${ENTRY_COLUMNS} FROM collection_cards i JOIN cards c ON c.id = i.card_id
       WHERE i.collection_id = ? ${where} ORDER BY c.name, c.set_code, c.collector_number, i.proxy`,
    ).all(collectionId, ...(values as Array<string | number>)).map((row) => {
      const entry = toEntry(row);
      return { ...entry, decks: links.get(rowKey(String(row.id), Number(row.foil), String(row.condition), String(row.language), entry.proxy)) ?? [] };
    });
  };

  app.get<{ Params: { collectionId: string } }>("/api/collections/:collectionId/cards", async (request) => entriesOf(request.params.collectionId));

  app.post<{ Params: { collectionId: string }; Body: Record<string, unknown> }>(
    "/api/collections/:collectionId/cards",
    async (request, reply) => {
      const body = request.body ?? {};
      const quantity = body.quantity ?? 1;
      const key = readCopyKey(body);
      if (!key || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
        return reply.code(400).send({ error: "Provide a cardId, a quantity from 1 to 10000, and a finish" });
      }
      const extras = readCopyExtras(body);
      if (typeof extras === "string") return reply.code(400).send({ error: extras });
      const id = request.params.collectionId;
      const wishlist = transaction(database, () => {
        const result = database.prepare(
          `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, purchase_price, price_currency, added_at, misprint, altered, signed)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, ?, ? WHERE EXISTS (SELECT 1 FROM cards WHERE id = ?)
           ${KEY_CONFLICT} DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity), ${EXTRAS_MERGE}`,
        ).run(id, ...keyValues(key), quantity, ...extraValues(extras), key.cardId);
        if (!result.changes) return null;
        touch(database, "collection", id);
        return isWishlist(database, id) ? [] : lowerWishlists(database, userOf(request), [{ cardId: key.cardId, quantity, proxy: key.proxy }]);
      });
      if (!wishlist) return reply.code(404).send({ error: "Card printing not found" });
      const where = `AND i.${KEY_WHERE.replaceAll(" AND ", " AND i.")}`;
      return { ...entriesOf(id, where, [...keyValues(key)])[0], wishlist };
    },
  );

  // adds copies of many cards at once (wishlists, missing lists) and returns each entry's count before the change, for undo
  app.post<{ Params: { collectionId: string } }>("/api/collections/:collectionId/cards/add", async (request, reply) => {
    const items = readItems(request.body, false);
    if (typeof items === "string") return reply.code(400).send({ error: items });
    const id = request.params.collectionId;
    const current = database.prepare(`SELECT quantity, trade FROM collection_cards WHERE collection_id = ? AND ${KEY_WHERE}`);
    const insert = database.prepare(
      `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, purchase_price, price_currency, added_at, misprint, altered, signed)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, ?, ? WHERE EXISTS (SELECT 1 FROM cards WHERE id = ?)
       ${KEY_CONFLICT} DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity), ${EXTRAS_MERGE}`,
    );
    const wishlistTarget = isWishlist(database, id);
    const result = transaction(database, () => {
      const before: Item[] = [];
      const after: Item[] = [];
      for (const item of items) {
        const row = current.get(id, ...keyValues(item));
        const { trade: _trade, extras, ...key } = item;
        if (!insert.run(id, ...keyValues(item), item.quantity, ...extraValues(extras ?? NO_EXTRAS), item.cardId).changes) continue;
        const have = Number(row?.quantity ?? 0);
        before.push({ ...key, quantity: have, trade: Number(row?.trade ?? 0) });
        after.push({ ...key, quantity: Math.min(10_000, have + item.quantity), trade: Number(row?.trade ?? 0) });
      }
      touch(database, "collection", id);
      const wishlist = wishlistTarget ? [] : lowerWishlists(database, userOf(request),
        after.map((item, index) => ({ cardId: item.cardId, quantity: item.quantity - before[index]!.quantity, proxy: item.proxy })));
      return { before, after, wishlist };
    });
    return { added: result.after.reduce((sum, item, index) => sum + item.quantity - result.before[index]!.quantity, 0), ...result };
  });

  // sets exact counts for many entries at once; a count of 0 removes the entry
  app.put<{ Params: { collectionId: string } }>("/api/collections/:collectionId/cards", async (request, reply) => {
    const items = readItems(request.body, true);
    if (typeof items === "string") return reply.code(400).send({ error: items });
    const id = request.params.collectionId;
    // without a trade number the copies for trade are kept, and never more than the new quantity
    const upsert = database.prepare(
      `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, trade, added_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM cards WHERE id = ?)
       ${KEY_CONFLICT} DO UPDATE SET quantity = excluded.quantity,
         trade = MIN(excluded.quantity, CASE WHEN ? IS NULL THEN trade ELSE excluded.trade END)`,
    );
    const remove = database.prepare(`DELETE FROM collection_cards WHERE collection_id = ? AND ${KEY_WHERE}`);
    const current = database.prepare(`SELECT quantity FROM collection_cards WHERE collection_id = ? AND ${KEY_WHERE}`);
    const setExtras = database.prepare(
      `UPDATE collection_cards SET purchase_price = ?, price_currency = ?, added_at = COALESCE(?, added_at), misprint = ?, altered = ?, signed = ?
       WHERE collection_id = ? AND ${KEY_WHERE}`,
    );
    transaction(database, () => {
      const changes = items.map((item) => ({ item, before: Number(current.get(id, ...keyValues(item))?.quantity ?? 0), linked: linkedCount(database, id, item) }));
      for (const { item } of changes) {
        if (item.quantity === 0) remove.run(id, ...keyValues(item));
        else {
          upsert.run(id, ...keyValues(item), item.quantity, item.trade ?? null, item.cardId, item.trade ?? null);
          if (item.extras) setExtras.run(...extraValues(item.extras), id, ...keyValues(item));
        }
      }
      // a change of finish, condition, language or proxy lowers one row and raises another of the same card: links follow
      for (const lowered of changes.filter((change) => change.item.quantity < change.before)) {
        for (const raised of changes.filter((change) => change.item.quantity > change.before && change.item.cardId === lowered.item.cardId)) {
          const count = Math.min(lowered.before - lowered.item.quantity, raised.item.quantity - raised.before);
          moveLinks(database, { collectionId: id, key: lowered.item }, { collectionId: id, key: raised.item }, count, lowered.before - lowered.linked);
        }
        trimLinks(database, id, lowered.item);
      }
      touch(database, "collection", id);
    });
    return { status: "saved", count: items.length };
  });

  // moves copies to another collection; moves no more than the source holds and reports what moved
  app.post<{ Params: { collectionId: string }; Body: { to?: unknown } }>("/api/collections/:collectionId/move", async (request, reply) => {
    const items = readItems(request.body, false);
    if (typeof items === "string") return reply.code(400).send({ error: items });
    const from = request.params.collectionId;
    const to = typeof request.body?.to === "string" ? request.body.to : "";
    if (!to || to === from) return reply.code(400).send({ error: "Choose a different collection to move to" });
    if (!access(database, "collection", to, userOf(request))) return notFound(reply, "collection");
    const current = database.prepare(`SELECT * FROM collection_cards WHERE collection_id = ? AND ${KEY_WHERE}`);
    const moved = transaction(database, () => {
      const result: Item[] = [];
      for (const item of items) {
        const row = current.get(from, ...keyValues(item));
        const have = Number(row?.quantity ?? 0);
        const quantity = Math.min(have, item.quantity);
        if (!quantity) continue;
        const free = have - linkedCount(database, from, item);
        // copies marked for trade stay behind while they fit; the rest of the marks move with the copies
        const trade = Number(row?.trade ?? 0);
        const stays = Math.min(trade, have - quantity);
        if (quantity === have) database.prepare(`DELETE FROM collection_cards WHERE collection_id = ? AND ${KEY_WHERE}`).run(from, ...keyValues(item));
        else database.prepare(`UPDATE collection_cards SET quantity = quantity - ?, trade = ? WHERE collection_id = ? AND ${KEY_WHERE}`).run(quantity, stays, from, ...keyValues(item));
        database.prepare(
          `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, trade, purchase_price, price_currency, added_at, misprint, altered, signed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ${KEY_CONFLICT} DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity), trade = MIN(MIN(10000, quantity + excluded.quantity), trade + excluded.trade), ${EXTRAS_MERGE}`,
        ).run(to, ...keyValues(item), quantity, trade - stays, row?.purchase_price ?? null, row?.price_currency ?? null, row?.added_at ?? null,
          Number(row?.misprint ?? 0), Number(row?.altered ?? 0), Number(row?.signed ?? 0));
        // copies in no deck move first; when more move than are free, the deck links move with them
        moveLinks(database, { collectionId: from, key: item }, { collectionId: to, key: item }, quantity, free);
        trimLinks(database, from, item);
        const { trade: _trade, extras: _extras, ...key } = item;
        result.push({ ...key, quantity });
      }
      touch(database, "collection", from);
      touch(database, "collection", to);
      return result;
    });
    return { moved };
  });

  app.get<{ Params: { collectionId: string } }>("/api/collections/:collectionId/completion", async (request) =>
    collectionCompletion(database, request.params.collectionId));

  // ---------- members and sending ----------

  app.delete<{ Params: { kind: string; itemId: string; userId: string } }>("/api/members/:kind/:itemId/:userId", async (request, reply) => {
    const kind = request.params.kind as Kind;
    if (kind !== "collection" && kind !== "deck") return reply.code(400).send({ error: "Unknown kind" });
    const me = userOf(request);
    const target = Number(request.params.userId);
    const role = access(database, kind, request.params.itemId, me)?.role;
    if (!role) return notFound(reply, kind);
    if (target !== me && role !== "owner") return reply.code(403).send({ error: "Only the owner can stop sharing with someone" });
    const result = database.prepare("DELETE FROM members WHERE kind = ? AND item_id = ? AND user_id = ?").run(kind, request.params.itemId, target);
    if (!result.changes) return reply.code(404).send({ error: "That person does not share this item" });
    return { status: target === me ? "left" : "removed" };
  });

  app.get("/api/shares", async (request) => {
    const me = userOf(request);
    const rows = (sql: string) => database.prepare(sql).all(me).map((row) => ({
      id: String(row.id), kind: String(row.kind) as Kind, itemId: String(row.item_id), itemName: String(row.item_name),
      mode: String(row.mode), createdAt: String(row.created_at), user: String(row.user_name),
    }));
    return {
      inbox: rows(`SELECT s.*, u.name AS user_name FROM shares s JOIN users u ON u.id = s.from_user WHERE s.to_user = ? AND s.status = 'pending' ORDER BY s.created_at`),
      sent: rows(`SELECT s.*, u.name AS user_name FROM shares s JOIN users u ON u.id = s.to_user WHERE s.from_user = ? AND s.status = 'pending' ORDER BY s.created_at`),
    };
  });

  app.post<{ Body: { kind?: unknown; itemId?: unknown; toUser?: unknown; mode?: unknown } }>("/api/shares", async (request, reply) => {
    const me = userOf(request);
    const { kind, itemId, toUser, mode } = request.body ?? {};
    if ((kind !== "collection" && kind !== "deck") || typeof itemId !== "string" || typeof toUser !== "number" ||
      (mode !== "copy" && mode !== "share" && mode !== "transfer")) {
      return reply.code(400).send({ error: "Choose what to send, who to send it to, and how" });
    }
    const role = access(database, kind, itemId, me)?.role;
    if (!role) return notFound(reply, kind);
    if (mode !== "copy" && role !== "owner") return reply.code(403).send({ error: "Only the owner can share or transfer this. You can send a copy." });
    if (toUser === me) return reply.code(400).send({ error: "Choose someone other than yourself" });
    const recipient = database.prepare("SELECT name FROM users WHERE id = ?").get(toUser);
    if (!recipient) return reply.code(404).send({ error: "That account no longer exists" });
    if (mode === "share" && access(database, kind, itemId, toUser)) {
      return reply.code(409).send({ error: `${String(recipient.name)} already has this ${kind}` });
    }
    if (database.prepare("SELECT 1 FROM shares WHERE kind = ? AND item_id = ? AND to_user = ? AND status = 'pending'").get(kind, itemId, toUser)) {
      return reply.code(409).send({ error: `${String(recipient.name)} already has an offer for this ${kind} waiting` });
    }
    const name = String(database.prepare(`SELECT name FROM ${TABLE[kind]} WHERE id = ?`).get(itemId)?.name ?? "");
    const id = randomUUID();
    database.prepare("INSERT INTO shares (id, kind, item_id, item_name, from_user, to_user, mode) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, kind, itemId, name, me, toUser, mode);
    return reply.code(201).send({ id, to: String(recipient.name) });
  });

  app.post<{ Params: { shareId: string }; Body: { name?: unknown; mergeInto?: unknown } }>("/api/shares/:shareId/accept", async (request, reply) => {
    const me = userOf(request);
    const share = database.prepare("SELECT * FROM shares WHERE id = ? AND to_user = ? AND status = 'pending'").get(request.params.shareId, me);
    if (!share) return reply.code(404).send({ error: "This offer is no longer waiting" });
    const kind = String(share.kind) as Kind;
    const itemId = String(share.item_id);
    const mode = String(share.mode);
    const senderRole = access(database, kind, itemId, Number(share.from_user))?.role;
    if (!senderRole || (mode !== "copy" && senderRole !== "owner")) {
      database.prepare("UPDATE shares SET status = 'cancelled', answered_at = CURRENT_TIMESTAMP WHERE id = ?").run(String(share.id));
      return reply.code(410).send({ error: "This item is no longer available to send" });
    }
    const name = typeof request.body?.name === "string" && request.body.name.trim() ? request.body.name.trim().slice(0, 100) : String(share.item_name);
    const mergeInto = typeof request.body?.mergeInto === "string" ? request.body.mergeInto : null;
    if (mergeInto && (kind !== "collection" || mode === "share")) return reply.code(400).send({ error: "Only a copied or transferred collection can be merged" });
    if (mergeInto && !access(database, "collection", mergeInto, me)) return notFound(reply, "collection");
    if (mergeInto === itemId) return reply.code(400).send({ error: "Choose a different collection to merge into" });
    const result = transaction(database, () => {
      let resultId = itemId;
      if (mode === "share") {
        database.prepare("INSERT OR REPLACE INTO members (kind, item_id, user_id, display_name) VALUES (?, ?, ?, ?)")
          .run(kind, itemId, me, name === String(share.item_name) ? null : name);
      } else if (kind === "collection") {
        if (mergeInto) {
          copyCollectionCards(database, itemId, mergeInto);
          touch(database, "collection", mergeInto);
          resultId = mergeInto;
          if (mode === "transfer") {
            forgetItem(database, "collection", itemId);
            database.prepare("DELETE FROM collections WHERE id = ?").run(itemId);
          }
        } else if (mode === "copy") {
          const source = database.prepare("SELECT description, completion, finish, kind FROM collections WHERE id = ?").get(itemId)!;
          const sets = database.prepare("SELECT set_code FROM collection_sets WHERE collection_id = ?").all(itemId).map((row) => String(row.set_code));
          resultId = createCollection(database, me, {
            name, description: String(source.description), completion: String(source.completion) as Completion,
            finish: String(source.finish) as Finish, kind: String(source.kind) as CollectionKind, sets,
          });
          copyCollectionCards(database, itemId, resultId);
        } else {
          forgetItem(database, "collection", itemId);
          database.prepare("UPDATE collections SET owner_id = ?, name = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(me, name, itemId);
          // the sender's decks no longer reach these copies
          database.prepare(
            "DELETE FROM deck_links WHERE collection_id = ? AND deck_card_id IN (SELECT dc.id FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE d.owner_id != ?)",
          ).run(itemId, me);
        }
      } else if (mode === "copy") {
        resultId = copyDeck(database, itemId, me, name);
      } else {
        forgetItem(database, "deck", itemId);
        database.prepare("UPDATE decks SET owner_id = ?, name = ?, collection_id = NULL, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(me, name, itemId);
        // a deck arrives without links; the receiver links it to their own collections
        database.prepare("DELETE FROM deck_links WHERE deck_card_id IN (SELECT id FROM deck_cards WHERE deck_id = ?)").run(itemId);
      }
      database.prepare("UPDATE shares SET status = 'accepted', answered_at = CURRENT_TIMESTAMP WHERE id = ?").run(String(share.id));
      return resultId;
    });
    return { status: "accepted", kind, id: result };
  });

  app.post<{ Params: { shareId: string } }>("/api/shares/:shareId/decline", async (request, reply) => {
    const result = database.prepare("UPDATE shares SET status = 'declined', answered_at = CURRENT_TIMESTAMP WHERE id = ? AND to_user = ? AND status = 'pending'")
      .run(request.params.shareId, userOf(request));
    if (!result.changes) return reply.code(404).send({ error: "This offer is no longer waiting" });
    return { status: "declined" };
  });

  app.delete<{ Params: { shareId: string } }>("/api/shares/:shareId", async (request, reply) => {
    const result = database.prepare("UPDATE shares SET status = 'cancelled', answered_at = CURRENT_TIMESTAMP WHERE id = ? AND from_user = ? AND status = 'pending'")
      .run(request.params.shareId, userOf(request));
    if (!result.changes) return reply.code(404).send({ error: "This offer is no longer waiting" });
    return { status: "cancelled" };
  });
}
