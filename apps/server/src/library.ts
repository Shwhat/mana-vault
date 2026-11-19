// ---------- library: collections, set completion, bulk edits, ownership and sending ----------
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { listSets } from "./sets.js";

export type Kind = "collection" | "deck";
export type Completion = "main" | "all" | "names";
export type Finish = "any" | "regular" | "foil" | "both";
type Role = "owner" | "member";

const COMPLETIONS: Completion[] = ["main", "all", "names"];
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
  const completion = String(collection?.completion ?? "main") as Completion;
  const finish = String(collection?.finish ?? "any") as Finish;
  const codes = database.prepare("SELECT set_code FROM collection_sets WHERE collection_id = ? ORDER BY set_code")
    .all(collectionId).map((row) => String(row.set_code));
  const sets: SetProgress[] = [];
  const missing: MissingCard[] = [];
  if (!codes.length) return { completion, finish, sets, overall: { owned: 0, total: 0 }, missing };

  const owned = new Map<string, { regular: number; foil: number }>();
  for (const row of database.prepare(
    `SELECT cc.card_id, cc.foil, cc.quantity FROM collection_cards cc JOIN cards c ON c.id = cc.card_id
     WHERE cc.collection_id = ? AND c.set_code IN (SELECT set_code FROM collection_sets WHERE collection_id = ?)`,
  ).all(collectionId, collectionId)) {
    const entry = owned.get(String(row.card_id)) ?? { regular: 0, foil: 0 };
    if (Number(row.foil) === 1) entry.foil += Number(row.quantity);
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

function collectionSummary(database: DatabaseSync, id: string, userId: number) {
  const row = database.prepare(
    `SELECT c.id, c.name, c.description, c.completion, c.finish, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM collection_cards WHERE collection_id = c.id) AS entry_count,
            (SELECT COALESCE(SUM(quantity), 0) FROM collection_cards WHERE collection_id = c.id) AS card_count
     FROM collections c WHERE c.id = ?`,
  ).get(id);
  if (!row) return null;
  const sets = database.prepare(
    `SELECT cs.set_code AS code, COALESCE(s.name, (SELECT set_name FROM cards WHERE set_code = cs.set_code LIMIT 1), upper(cs.set_code)) AS name
     FROM collection_sets cs LEFT JOIN sets s ON s.code = cs.set_code WHERE cs.collection_id = ? ORDER BY name`,
  ).all(id).map((set) => ({ code: String(set.code), name: String(set.name) }));
  const progress = sets.length ? collectionCompletion(database, id) : null;
  const sharing = itemSharing(database, "collection", id, userId);
  return {
    id: String(row.id),
    name: sharing.displayName ?? String(row.name),
    realName: String(row.name),
    description: String(row.description),
    completion: String(row.completion) as Completion,
    finish: String(row.finish) as Finish,
    sets,
    entryCount: Number(row.entry_count),
    cardCount: Number(row.card_count),
    progress: progress ? progress.overall : null,
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

type CollectionInput = { name: string; description: string; completion: Completion; finish: Finish; sets: string[] };

function readCollectionInput(body: unknown): CollectionInput | string {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 100) return "Collection names must be 1 to 100 characters";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (description.length > 500) return "Descriptions can be up to 500 characters";
  const completion = (value.completion ?? "main") as Completion;
  if (!COMPLETIONS.includes(completion)) return "Choose a completion rule: main, all or names";
  const finish = (value.finish ?? "any") as Finish;
  if (!FINISHES.includes(finish)) return "Choose a finish rule: any, regular, foil or both";
  const sets = value.sets ?? [];
  if (!Array.isArray(sets) || sets.length > 300 || !sets.every((code) => typeof code === "string" && /^[a-z0-9]{2,8}$/i.test(code))) {
    return "Sets must be a list of set codes";
  }
  return { name, description, completion, finish, sets: [...new Set(sets.map((code: string) => code.toLowerCase()))] };
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
  const id = randomUUID();
  database.prepare("INSERT INTO collections (id, owner_id, name, description, completion, finish) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, ownerId, input.name, input.description, input.completion, input.finish);
  const problem = saveCollectionSets(database, id, input.sets);
  if (problem) throw new Error(problem);
  return id;
}

const ENTRY_COLUMNS = `c.id, c.name, c.set_code, c.set_name, c.collector_number, c.rarity, c.image_url, c.colors, i.quantity, i.foil`;

function readItems(body: unknown, allowZero: boolean): Array<{ cardId: string; foil: boolean; quantity: number }> | string {
  const items = body && typeof body === "object" ? (body as { items?: unknown }).items : undefined;
  if (!Array.isArray(items) || !items.length || items.length > 10_000) return "Provide a list of 1 to 10,000 cards";
  const result = [];
  for (const item of items) {
    const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const quantity = value.quantity;
    if (typeof value.cardId !== "string" || typeof value.foil !== "boolean" || typeof quantity !== "number" ||
      !Number.isInteger(quantity) || quantity < (allowZero ? 0 : 1) || quantity > 10_000) {
      return `Each card needs a cardId, a foil flag and a quantity from ${allowZero ? 0 : 1} to 10,000`;
    }
    result.push({ cardId: value.cardId, foil: value.foil, quantity });
  }
  return result;
}

function touch(database: DatabaseSync, kind: Kind, id: string) {
  database.prepare(`UPDATE ${TABLE[kind]} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
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
    `INSERT INTO collection_cards (collection_id, card_id, foil, quantity) SELECT ?, card_id, foil, quantity FROM collection_cards WHERE collection_id = ?
     ON CONFLICT(collection_id, card_id, foil) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity)`,
  ).run(to, from);
}

export function copyDeck(database: DatabaseSync, from: string, ownerId: number, name: string): string {
  const id = randomUUID();
  database.prepare("INSERT INTO decks (id, name, format, mode, owner_id) SELECT ?, ?, format, mode, ? FROM decks WHERE id = ?").run(id, name, ownerId, from);
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
        database.prepare("UPDATE collections SET name = ?, description = ?, completion = ?, finish = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
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

  app.get<{ Params: { collectionId: string } }>("/api/collections/:collectionId/cards", async (request) =>
    database.prepare(
      `SELECT ${ENTRY_COLUMNS} FROM collection_cards i JOIN cards c ON c.id = i.card_id
       WHERE i.collection_id = ? ORDER BY c.name, c.set_code, c.collector_number`,
    ).all(request.params.collectionId));

  app.post<{ Params: { collectionId: string }; Body: { cardId?: unknown; quantity?: unknown; foil?: unknown } }>(
    "/api/collections/:collectionId/cards",
    async (request, reply) => {
      const { cardId, quantity = 1, foil = false } = request.body ?? {};
      if (typeof cardId !== "string" || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 10_000 || typeof foil !== "boolean") {
        return reply.code(400).send({ error: "Provide a cardId, a quantity from 1 to 10000, and a foil flag" });
      }
      const id = request.params.collectionId;
      const result = database.prepare(
        `INSERT INTO collection_cards (collection_id, card_id, foil, quantity)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM cards WHERE id = ?)
         ON CONFLICT(collection_id, card_id, foil) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity)`,
      ).run(id, cardId, foil ? 1 : 0, quantity, cardId);
      if (!result.changes) return reply.code(404).send({ error: "Card printing not found" });
      touch(database, "collection", id);
      return database.prepare(`SELECT ${ENTRY_COLUMNS} FROM collection_cards i JOIN cards c ON c.id = i.card_id WHERE i.collection_id = ? AND i.card_id = ? AND i.foil = ?`)
        .get(id, cardId, foil ? 1 : 0);
    },
  );

  // sets exact counts for many entries at once; a count of 0 removes the entry
  app.put<{ Params: { collectionId: string } }>("/api/collections/:collectionId/cards", async (request, reply) => {
    const items = readItems(request.body, true);
    if (typeof items === "string") return reply.code(400).send({ error: items });
    const id = request.params.collectionId;
    const upsert = database.prepare(
      `INSERT INTO collection_cards (collection_id, card_id, foil, quantity) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM cards WHERE id = ?)
       ON CONFLICT(collection_id, card_id, foil) DO UPDATE SET quantity = excluded.quantity`,
    );
    const remove = database.prepare("DELETE FROM collection_cards WHERE collection_id = ? AND card_id = ? AND foil = ?");
    transaction(database, () => {
      for (const item of items) {
        if (item.quantity === 0) remove.run(id, item.cardId, item.foil ? 1 : 0);
        else upsert.run(id, item.cardId, item.foil ? 1 : 0, item.quantity, item.cardId);
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
    const current = database.prepare("SELECT quantity FROM collection_cards WHERE collection_id = ? AND card_id = ? AND foil = ?");
    const moved = transaction(database, () => {
      const result: Array<{ cardId: string; foil: boolean; quantity: number }> = [];
      for (const item of items) {
        const have = Number(current.get(from, item.cardId, item.foil ? 1 : 0)?.quantity ?? 0);
        const quantity = Math.min(have, item.quantity);
        if (!quantity) continue;
        if (quantity === have) database.prepare("DELETE FROM collection_cards WHERE collection_id = ? AND card_id = ? AND foil = ?").run(from, item.cardId, item.foil ? 1 : 0);
        else database.prepare("UPDATE collection_cards SET quantity = quantity - ? WHERE collection_id = ? AND card_id = ? AND foil = ?").run(quantity, from, item.cardId, item.foil ? 1 : 0);
        database.prepare(
          `INSERT INTO collection_cards (collection_id, card_id, foil, quantity) VALUES (?, ?, ?, ?)
           ON CONFLICT(collection_id, card_id, foil) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity)`,
        ).run(to, item.cardId, item.foil ? 1 : 0, quantity);
        result.push({ cardId: item.cardId, foil: item.foil, quantity });
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
          const source = database.prepare("SELECT description, completion, finish FROM collections WHERE id = ?").get(itemId)!;
          const sets = database.prepare("SELECT set_code FROM collection_sets WHERE collection_id = ?").all(itemId).map((row) => String(row.set_code));
          resultId = createCollection(database, me, {
            name, description: String(source.description), completion: String(source.completion) as Completion,
            finish: String(source.finish) as Finish, sets,
          });
          copyCollectionCards(database, itemId, resultId);
        } else {
          forgetItem(database, "collection", itemId);
          database.prepare("UPDATE collections SET owner_id = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(me, name, itemId);
        }
      } else if (mode === "copy") {
        resultId = copyDeck(database, itemId, me, name);
      } else {
        forgetItem(database, "deck", itemId);
        database.prepare("UPDATE decks SET owner_id = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(me, name, itemId);
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
