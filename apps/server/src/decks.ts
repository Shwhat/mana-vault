// ---------- decks: deck cards, their printings and the collection copies linked to them ----------
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { type CopyKey, readCopyKey } from "./copies.js";
import { access, forgetItem, itemSharing, lowerWishlists } from "./library.js";
import { addLink, capDeckCardLinks, deckLinks, type Link, touchDeckCollections } from "./links.js";

export const ZONES = ["main", "sideboard", "commander", "maybeboard"];
/** Deck formats; each name except casual is a Scryfall legality key. */
export const FORMATS = [
  "casual", "commander", "standard", "pioneer", "modern", "legacy", "pauper", "vintage", "brawl", "standardbrawl", "historic",
  "explorer", "timeless", "alchemy", "oathbreaker", "paupercommander", "duel", "premodern", "oldschool", "penny", "predh",
];
const ZONE_NAMES: Record<string, string> = { main: "main deck", sideboard: "sideboard", commander: "commander", maybeboard: "maybeboard" };

/** Adds a line to a deck's change history and keeps the newest 500 lines. */
export function logDeck(database: DatabaseSync, deckId: string, userName: string, change: string): void {
  database.prepare("INSERT INTO deck_history (deck_id, user_name, change) VALUES (?, ?, ?)").run(deckId, userName, change.slice(0, 300));
  database.prepare(
    "DELETE FROM deck_history WHERE deck_id = ? AND id NOT IN (SELECT id FROM deck_history WHERE deck_id = ? ORDER BY id DESC LIMIT 500)",
  ).run(deckId, deckId);
}
const cardName = (database: DatabaseSync, cardId: string) => String(database.prepare("SELECT name FROM cards WHERE id = ?").get(cardId)?.name ?? "a card");
const KEY = "i.card_id = ? AND i.foil = ? AND i.condition = ? AND i.language = ? AND i.proxy = ?";
const keyValues = (key: CopyKey) => [key.cardId, key.foil, key.condition, key.language, key.proxy ? 1 : 0] as const;

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

const touchDeck = (database: DatabaseSync, id: string) => database.prepare("UPDATE decks SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(id);

/** Copies of a row not linked to any deck card (other than the ones named in `except`). */
function freeCopies(database: DatabaseSync, collectionId: string, key: CopyKey, exceptDeckCard?: number): number {
  const row = database.prepare(
    `SELECT i.quantity, (SELECT COALESCE(SUM(l.quantity), 0) FROM deck_links l WHERE l.collection_id = i.collection_id AND l.card_id = i.card_id
       AND l.foil = i.foil AND l.condition = i.condition AND l.language = i.language AND l.proxy = i.proxy AND l.deck_card_id != ?) AS linked
     FROM collection_cards i WHERE i.collection_id = ? AND ${KEY}`,
  ).get(exceptDeckCard ?? -1, collectionId, ...keyValues(key));
  return row ? Math.max(0, Number(row.quantity) - Number(row.linked)) : 0;
}

/** Finds or makes the deck card for a printing in a finish and zone, and adds `quantity` to it. Returns its id. */
export function addDeckCard(database: DatabaseSync, deckId: string, cardId: string, quantity: number, zone: string, finish = 0): number {
  const card = database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(cardId);
  if (!card) throw new Error("Card printing not found");
  database.prepare(
    `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone, finish) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(deck_id, oracle_id, printing_id, zone, finish) WHERE printing_id IS NOT NULL DO UPDATE SET quantity = quantity + excluded.quantity`,
  ).run(deckId, String(card.oracle_id), cardId, quantity, zone, finish);
  return Number(database.prepare("SELECT id FROM deck_cards WHERE deck_id = ? AND printing_id = ? AND zone = ? AND finish = ?").get(deckId, cardId, zone, finish)!.id);
}

/** Removes the Upgrade wanted mark of a deck card that is now the version wanted. */
function clearWantIfMet(database: DatabaseSync, deckCardId: number): void {
  database.prepare("UPDATE deck_cards SET want_card_id = NULL, want_finish = 0 WHERE id = ? AND want_card_id = printing_id AND want_finish = finish").run(deckCardId);
}

/**
 * Moves `count` cards of a deck card to another printing and finish in the same zone, joining a deck card that is already
 * there. With `keepLinks`, links go with the cards when the whole deck card moves; otherwise the moved cards have no links.
 * The Upgrade wanted mark goes with the cards. Returns the id of the deck card that holds the moved cards.
 */
export function moveDeckCards(database: DatabaseSync, deckId: string, deckCardId: number, count: number, cardId: string, finish: number, keepLinks: boolean): number {
  const card = database.prepare("SELECT id, quantity, zone, want_card_id, want_finish FROM deck_cards WHERE id = ?").get(deckCardId);
  if (!card) throw new Error("Deck card not found");
  const quantity = Number(card.quantity);
  const take = Math.min(count, quantity);
  const other = database.prepare("SELECT id, want_card_id FROM deck_cards WHERE deck_id = ? AND printing_id = ? AND zone = ? AND finish = ? AND id != ?")
    .get(deckId, cardId, String(card.zone), finish, deckCardId);
  let target: number;
  if (take >= quantity) {
    if (!keepLinks) database.prepare("DELETE FROM deck_links WHERE deck_card_id = ?").run(deckCardId);
    if (other) {
      target = Number(other.id);
      database.prepare("UPDATE deck_cards SET quantity = MIN(100, quantity + ?) WHERE id = ?").run(take, target);
      moveCardLinks(database, deckCardId, target);
      if (!other.want_card_id && card.want_card_id) {
        database.prepare("UPDATE deck_cards SET want_card_id = ?, want_finish = ? WHERE id = ?").run(String(card.want_card_id), Number(card.want_finish ?? 0), target);
      }
      database.prepare("DELETE FROM deck_cards WHERE id = ?").run(deckCardId);
      capDeckCardLinks(database, target);
    } else {
      target = deckCardId;
      database.prepare("UPDATE deck_cards SET printing_id = ?, finish = ? WHERE id = ?").run(cardId, finish, deckCardId);
    }
  } else {
    database.prepare("UPDATE deck_cards SET quantity = quantity - ? WHERE id = ?").run(take, deckCardId);
    capDeckCardLinks(database, deckCardId);
    target = addDeckCard(database, deckId, cardId, take, String(card.zone), finish);
    if (card.want_card_id) {
      database.prepare("UPDATE deck_cards SET want_card_id = ?, want_finish = ? WHERE id = ? AND want_card_id IS NULL").run(String(card.want_card_id), Number(card.want_finish ?? 0), target);
    }
  }
  clearWantIfMet(database, target);
  return target;
}

/** A deck card's finish: 0 regular, 1 foil, 2 etched; also "foil" and "etched", or true for foil. */
export function readDeckFinish(value: unknown): number {
  if (value === 1 || value === true || value === "foil") return 1;
  if (value === 2 || value === "etched") return 2;
  return 0;
}

/** Whether a printing is made in a finish. A printing without finish data allows every finish. */
export function finishOffered(finishes: string, finish: number): boolean {
  const list = finishes.split(",").filter(Boolean);
  if (!list.length) return true;
  return list.includes(finish === 2 ? "etched" : finish === 1 ? "foil" : "nonfoil");
}

/** Moves every link of one deck card to another. */
function moveCardLinks(database: DatabaseSync, from: number, to: number): void {
  for (const link of database.prepare("SELECT * FROM deck_links WHERE deck_card_id = ?").all(from)) {
    addLink(database, to, {
      collectionId: String(link.collection_id), cardId: String(link.card_id), foil: Number(link.foil) as Link["foil"],
      condition: String(link.condition) as Link["condition"], language: String(link.language), proxy: Number(link.proxy) === 1, quantity: Number(link.quantity),
    });
  }
  database.prepare("DELETE FROM deck_links WHERE deck_card_id = ?").run(from);
}

type LinkInput = CopyKey & { collectionId: string; quantity: number };

function readLinks(value: unknown): LinkInput[] | string {
  if (!Array.isArray(value) || value.length > 100) return "Send a list of up to 100 links";
  const result: LinkInput[] = [];
  for (const item of value) {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const key = readCopyKey(raw);
    const quantity = raw.quantity ?? 1;
    if (!key || typeof raw.collectionId !== "string" || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return "Each link needs a collection, a copy (card, finish, condition, language) and a quantity from 1 to 100";
    }
    result.push({ ...key, collectionId: raw.collectionId, quantity });
  }
  return result;
}

/**
 * Links copies to a deck card. The deck card follows the copies: cards filled by a copy of another printing or finish move
 * to a deck card of that printing and finish. Each link takes no more copies than are free. Returns how many were linked.
 */
function linkCopies(database: DatabaseSync, deckId: string, deckCardId: number, links: LinkInput[], userId: number): number {
  let linked = 0;
  for (const link of links) {
    if (!access(database, "collection", link.collectionId, userId)) throw new Error("Collection not found");
    if (database.prepare("SELECT kind FROM collections WHERE id = ?").get(link.collectionId)?.kind === "wishlist") throw new Error("Wishlist cards are not owned, so they cannot fill a deck");
    const card = database.prepare("SELECT id, oracle_id, printing_id, quantity, zone, finish FROM deck_cards WHERE id = ?").get(deckCardId);
    if (!card) break;
    const printing = database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(link.cardId);
    if (!printing || printing.oracle_id !== card.oracle_id) throw new Error("A linked copy must be the same card");
    const take = Math.min(link.quantity, freeCopies(database, link.collectionId, link), Number(card.quantity));
    if (take <= 0) continue;
    let target = deckCardId;
    if (card.printing_id !== link.cardId || Number(card.finish ?? 0) !== link.foil) {
      target = moveDeckCards(database, deckId, deckCardId, take, link.cardId, link.foil, true);
    }
    addLink(database, target, { ...link, quantity: take });
    capDeckCardLinks(database, target);
    clearWantIfMet(database, target);
    linked += take;
    deckCardId = target;
  }
  return linked;
}

/** Free copies of a card (every printing and finish) in the account's collections, that could fill a deck card. */
export function freeVersions(database: DatabaseSync, userId: number, oracleId: string, exceptDeckCard: number, preferCard = "", preferCollection = "") {
  return database.prepare(
    `SELECT i.collection_id, COALESCE(m.display_name, col.name) AS collection_name, i.card_id, c.set_code, c.set_name, c.collector_number, c.image_url,
            i.foil, i.condition, i.language, i.proxy, i.quantity,
            (SELECT COALESCE(SUM(l.quantity), 0) FROM deck_links l WHERE l.collection_id = i.collection_id AND l.card_id = i.card_id AND l.foil = i.foil
               AND l.condition = i.condition AND l.language = i.language AND l.proxy = i.proxy AND l.deck_card_id != ?) AS linked
     FROM collection_cards i JOIN cards c ON c.id = i.card_id JOIN collections col ON col.id = i.collection_id
     LEFT JOIN members m ON m.kind = 'collection' AND m.item_id = col.id AND m.user_id = ?
     WHERE c.oracle_id = ? AND col.kind = 'collection' AND (col.owner_id = ? OR m.user_id IS NOT NULL)
     ORDER BY i.card_id = ? DESC, col.id = ? DESC, i.proxy, col.created_at, col.rowid`,
  ).all(exceptDeckCard, userId, oracleId, userId, preferCard, preferCollection).map((row) => ({
    collectionId: String(row.collection_id), collectionName: String(row.collection_name), cardId: String(row.card_id), set_code: String(row.set_code),
    set_name: String(row.set_name), collector_number: String(row.collector_number), image_url: row.image_url as string | null,
    foil: Number(row.foil) as CopyKey["foil"], condition: String(row.condition) as CopyKey["condition"], language: String(row.language), proxy: Number(row.proxy) === 1,
    quantity: Number(row.quantity), free: Math.max(0, Number(row.quantity) - Number(row.linked)),
  })).filter((row) => row.free > 0);
}

/**
 * Links free copies of the exact printing and finish to every deck card that is missing cards (not the maybeboard). The
 * deck's own collection is used first, then the account's other collections. Returns how many copies were linked.
 */
export function linkOwnedCopies(database: DatabaseSync, deckId: string, userId: number, only?: Set<number>): number {
  const deck = database.prepare("SELECT collection_id FROM decks WHERE id = ?").get(deckId);
  if (!deck) return 0;
  const preferred = String(deck.collection_id ?? "");
  let linked = 0;
  const cards = database.prepare(
    `SELECT dc.id, dc.oracle_id, dc.printing_id, dc.finish, dc.quantity - COALESCE((SELECT SUM(l.quantity) FROM deck_links l WHERE l.deck_card_id = dc.id), 0) AS missing
     FROM deck_cards dc WHERE dc.deck_id = ? AND dc.zone != 'maybeboard' AND dc.printing_id IS NOT NULL ORDER BY dc.id`,
  ).all(deckId);
  for (const card of cards) {
    let missing = Number(card.missing);
    if (missing <= 0 || (only && !only.has(Number(card.id)))) continue;
    const exact = freeVersions(database, userId, String(card.oracle_id), -1, String(card.printing_id), preferred)
      .filter((copy) => copy.cardId === card.printing_id && copy.foil === Number(card.finish ?? 0));
    for (const copy of exact) {
      if (missing <= 0) break;
      const take = Math.min(missing, copy.free);
      addLink(database, Number(card.id), { ...copy, quantity: take });
      missing -= take;
      linked += take;
    }
  }
  return linked;
}

export function registerDeckRoutes(app: FastifyInstance, database: DatabaseSync) {
  const userOf = (request: { user: { id: number } | null }) => request.user!.id;
  const nameOf = (request: { user: { name?: string } | null }) => String(request.user?.name ?? "");
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: "Deck not found" });

  const deckSummary = (id: string, userId: number) => {
    const deck = database.prepare(
      `SELECT d.id, d.name, d.format, d.mode, d.collection_id, d.created_at, d.updated_at, d.description, d.cover_card_id,
              COALESCE((SELECT SUM(quantity) FROM deck_cards WHERE deck_id = d.id AND zone != 'maybeboard'), 0) AS card_count,
              (SELECT SUM(dc.quantity * (CASE dc.finish WHEN 1 THEN COALESCE(c.price_usd_foil, c.price_usd, c.price_usd_etched) WHEN 2 THEN COALESCE(c.price_usd_etched, c.price_usd_foil, c.price_usd) ELSE COALESCE(c.price_usd, c.price_usd_foil, c.price_usd_etched) END)) FROM deck_cards dc JOIN cards c ON c.id = dc.printing_id
                 WHERE dc.deck_id = d.id AND dc.zone != 'maybeboard') AS value_usd,
              (SELECT SUM(dc.quantity * (CASE dc.finish WHEN 0 THEN COALESCE(c.price_eur, c.price_eur_foil) ELSE COALESCE(c.price_eur_foil, c.price_eur) END)) FROM deck_cards dc JOIN cards c ON c.id = dc.printing_id
                 WHERE dc.deck_id = d.id AND dc.zone != 'maybeboard') AS value_eur,
              (SELECT group_concat(c.name, ' + ') FROM deck_cards dc JOIN cards c ON c.id = dc.printing_id WHERE dc.deck_id = d.id AND dc.zone = 'commander') AS commander,
              COALESCE((SELECT image_url FROM cards WHERE id = d.cover_card_id),
                (SELECT c.image_url FROM deck_cards dc JOIN cards c ON c.id = dc.printing_id WHERE dc.deck_id = d.id AND dc.zone = 'commander' ORDER BY dc.id LIMIT 1)) AS image_url
       FROM decks d WHERE d.id = ?`,
    ).get(id);
    if (!deck) return null;
    const sharing = itemSharing(database, "deck", id, userId);
    const collectionId = typeof deck.collection_id === "string" && access(database, "collection", deck.collection_id, userId) ? deck.collection_id : null;
    const { value_usd: usd, value_eur: eur, ...rest } = deck;
    // the value of the cards in the deck (not the maybeboard), each at its printing's price
    const value = { usd: Math.round(Number(usd ?? 0) * 100) / 100, eur: Math.round(Number(eur ?? 0) * 100) / 100 };
    return { ...rest, value, mode: "theme", collection_id: collectionId, name: sharing.displayName ?? deck.name, realName: deck.name, ...sharing };
  };

  app.get("/api/decks", async (request) => {
    const userId = userOf(request);
    return database.prepare(
      `SELECT d.id FROM decks d
       WHERE d.owner_id = ? OR EXISTS (SELECT 1 FROM members m WHERE m.kind = 'deck' AND m.item_id = d.id AND m.user_id = ?)
       ORDER BY d.updated_at DESC, d.name`,
    ).all(userId, userId).map((row) => deckSummary(String(row.id), userId));
  });

  app.post<{ Body: { name?: unknown; format?: unknown; id?: unknown; collectionId?: unknown } }>("/api/decks", async (request, reply) => {
    const { name, format = "casual", id: wanted, collectionId } = request.body ?? {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return reply.code(400).send({ error: "Deck name must be between 1 and 100 characters" });
    }
    if (typeof format !== "string" || !FORMATS.includes(format)) return reply.code(400).send({ error: "Choose a supported deck format" });
    // the phone names a deck it creates offline, so the queued change creates the same deck
    if (wanted !== undefined && (typeof wanted !== "string" || !/^[0-9a-f-]{36}$/i.test(wanted))) return reply.code(400).send({ error: "A new deck id must be a UUID" });
    const id = typeof wanted === "string" ? wanted.toLowerCase() : randomUUID();
    if (database.prepare("SELECT 1 FROM decks WHERE id = ?").get(id)) return reply.code(409).send({ error: "A deck with this id already exists" });
    const keep = typeof collectionId === "string" && access(database, "collection", collectionId, userOf(request)) ? collectionId : null;
    database.prepare("INSERT INTO decks (id, name, format, mode, owner_id, collection_id) VALUES (?, ?, ?, 'theme', ?, ?)").run(id, name.trim(), format, userOf(request), keep);
    logDeck(database, id, nameOf(request), "Deck created");
    return reply.code(201).send(deckSummary(id, userOf(request)));
  });

  app.patch<{ Params: { deckId: string }; Body: { name?: unknown; collectionId?: unknown; format?: unknown; description?: unknown; coverCardId?: unknown } }>("/api/decks/:deckId", async (request, reply) => {
    const { name, collectionId, format, description, coverCardId } = request.body ?? {};
    const deckId = request.params.deckId;
    if (format !== undefined && (typeof format !== "string" || !FORMATS.includes(format))) return reply.code(400).send({ error: "Choose a supported deck format" });
    if (description !== undefined && (typeof description !== "string" || description.length > 20000)) {
      return reply.code(400).send({ error: "The description can be up to 20,000 characters" });
    }
    if (coverCardId !== undefined && coverCardId !== null && (typeof coverCardId !== "string" || !database.prepare("SELECT 1 FROM cards WHERE id = ?").get(coverCardId))) {
      return reply.code(404).send({ error: "Card printing not found" });
    }
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) return reply.code(400).send({ error: "Deck name must be between 1 and 100 characters" });
      const before = String(database.prepare("SELECT name FROM decks WHERE id = ?").get(deckId)?.name ?? "");
      database.prepare("UPDATE decks SET name = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(name.trim(), deckId);
      if (before !== name.trim()) logDeck(database, deckId, nameOf(request), `Renamed from ${before} to ${name.trim()}`);
    }
    if (typeof format === "string") {
      database.prepare("UPDATE decks SET format = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(format, deckId);
      logDeck(database, deckId, nameOf(request), `Format set to ${format}`);
    }
    if (typeof description === "string") {
      database.prepare("UPDATE decks SET description = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(description, deckId);
      logDeck(database, deckId, nameOf(request), "Description changed");
    }
    if (coverCardId !== undefined) {
      database.prepare("UPDATE decks SET cover_card_id = ? WHERE id = ?").run(coverCardId as string | null, deckId);
      logDeck(database, deckId, nameOf(request), coverCardId ? `Cover card set to ${cardName(database, coverCardId as string)}` : "Cover card removed");
    }
    if (collectionId !== undefined) {
      if (collectionId !== null && (typeof collectionId !== "string" || !access(database, "collection", collectionId, userOf(request)))) {
        return reply.code(404).send({ error: "Collection not found" });
      }
      database.prepare("UPDATE decks SET collection_id = ? WHERE id = ?").run(collectionId, request.params.deckId);
    }
    if (name === undefined && collectionId === undefined && format === undefined && description === undefined && coverCardId === undefined) {
      return reply.code(400).send({ error: "Send a new name, format, description, cover card or collection" });
    }
    return { status: "saved", ...(typeof name === "string" ? { name: name.trim() } : {}) };
  });

  app.delete<{ Params: { deckId: string } }>("/api/decks/:deckId", async (request, reply) => {
    const id = request.params.deckId;
    if (access(database, "deck", id, userOf(request))?.role !== "owner") {
      return reply.code(403).send({ error: "Only the owner can delete a deck. Use Leave shared deck instead." });
    }
    transaction(database, () => {
      forgetItem(database, "deck", id);
      touchDeckCollections(database, id);
      database.prepare("DELETE FROM decks WHERE id = ?").run(id);
    });
    return { status: "deleted" };
  });

  app.get<{ Params: { deckId: string } }>("/api/decks/:deckId", async (request, reply) => {
    const deck = deckSummary(request.params.deckId, userOf(request));
    if (!deck) return notFound(reply);
    const links = deckLinks(database, request.params.deckId, userOf(request));
    const cards = database.prepare(
      `SELECT dc.id AS entry_id, c.id AS card_id, dc.oracle_id, dc.printing_id, dc.quantity, dc.zone, dc.finish, dc.tags, c.name, c.mana_cost,
              c.type_line, c.set_code, c.set_name, c.collector_number, c.image_url, c.mana_value, c.rarity, c.colors, c.color_identity,
              c.oracle_text, c.legalities, c.produced_mana, c.tokens, c.power, c.toughness,
              c.price_usd, c.price_usd_foil, c.price_usd_etched, c.price_eur, c.price_eur_foil, c.custom, c.finishes, c.promo_types,
              dc.want_card_id, dc.want_finish, w.set_code AS want_set_code, w.collector_number AS want_collector_number
       FROM deck_cards dc LEFT JOIN cards w ON w.id = dc.want_card_id JOIN cards c ON c.id = COALESCE(
         dc.printing_id, (SELECT p.id FROM cards p WHERE p.oracle_id = dc.oracle_id ORDER BY p.lang != 'en', p.released_at DESC LIMIT 1))
       WHERE dc.deck_id = ? ORDER BY dc.zone, c.name`,
    ).all(request.params.deckId).map((card) => {
      const list = links.get(Number(card.entry_id)) ?? [];
      const parse = (text: unknown, fallback: unknown) => { try { return text ? JSON.parse(String(text)) : fallback; } catch { return fallback; } };
      const missing = card.zone === "maybeboard" ? 0 : Math.max(0, Number(card.quantity) - list.reduce((sum, link) => sum + link.quantity, 0));
      // for a card with missing copies: free copies the account owns, the exact version first ("Owned") or other versions
      const owned = missing > 0 ? freeVersions(database, userOf(request), String(card.oracle_id), -1, String(card.card_id), String(deck.collection_id ?? "")).slice(0, 12) : [];
      return {
        ...card, custom: Number(card.custom ?? 0) === 1, tags: String(card.tags ?? "").split("\n").filter(Boolean), legalities: parse(card.legalities, {}), tokens: parse(card.tokens, []),
        want_card_id: card.want_card_id ?? null, want_finish: Number(card.want_finish ?? 0), links: list, missing, owned,
      };
    });
    return { ...deck, cards };
  });

  // adds a printing to a deck; with `links`, the copies that fill it (only free copies are linked)
  app.post<{ Params: { deckId: string }; Body: { cardId?: unknown; quantity?: unknown; zone?: unknown; links?: unknown; finish?: unknown } }>(
    "/api/decks/:deckId/cards",
    async (request, reply) => {
      const { cardId, quantity = 1, zone = "main" } = request.body ?? {};
      const finish = readDeckFinish(request.body?.finish);
      if (typeof cardId !== "string" || !cardId || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 ||
        typeof zone !== "string" || !ZONES.includes(zone)) {
        return reply.code(400).send({ error: "Provide a printing, quantity from 1 to 100, and a valid deck zone" });
      }
      const links = request.body?.links === undefined ? [] : readLinks(request.body.links);
      if (typeof links === "string") return reply.code(400).send({ error: links });
      if (!database.prepare("SELECT 1 FROM cards WHERE id = ?").get(cardId)) return reply.code(404).send({ error: "Card printing not found" });
      try {
        const result = transaction(database, () => {
          const entryId = addDeckCard(database, request.params.deckId, cardId, quantity, zone, finish);
          // the new cards are filled first by the copies sent with them
          const linked = links.length ? linkCopies(database, request.params.deckId, entryId, links, userOf(request)) : 0;
          touchDeck(database, request.params.deckId);
          logDeck(database, request.params.deckId, nameOf(request), `+${quantity} ${cardName(database, cardId)} (${ZONE_NAMES[zone]})`);
          return { entryId, linked };
        });
        return reply.code(201).send({ status: "added", ...result });
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not add the card" });
      }
    },
  );

  // replaces the links of a deck card
  app.put<{ Params: { deckId: string; entryId: string }; Body: { links?: unknown } }>("/api/decks/:deckId/entries/:entryId/links", async (request, reply) => {
    const entryId = Number(request.params.entryId);
    if (!database.prepare("SELECT 1 FROM deck_cards WHERE id = ? AND deck_id = ?").get(entryId, request.params.deckId)) {
      return reply.code(404).send({ error: "Deck card not found" });
    }
    const links = readLinks(request.body?.links ?? []);
    if (typeof links === "string") return reply.code(400).send({ error: links });
    try {
      const linked = transaction(database, () => {
        touchDeckCollections(database, request.params.deckId, entryId);
        database.prepare("DELETE FROM deck_links WHERE deck_card_id = ?").run(entryId);
        const count = linkCopies(database, request.params.deckId, entryId, links, userOf(request));
        touchDeck(database, request.params.deckId);
        return count;
      });
      return { status: "linked", linked };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not link the copies" });
    }
  });

  // changes the printing or finish of a deck card, or of `quantity` of its cards: links to the old version go, the copies sent are linked, the rest is missing
  app.put<{ Params: { deckId: string; entryId: string }; Body: { cardId?: unknown; links?: unknown; finish?: unknown; quantity?: unknown } }>(
    "/api/decks/:deckId/entries/:entryId/printing",
    async (request, reply) => {
      const deckId = request.params.deckId;
      const entryId = Number(request.params.entryId);
      const card = database.prepare("SELECT id, oracle_id, printing_id, quantity, zone, finish FROM deck_cards WHERE id = ? AND deck_id = ?").get(entryId, deckId);
      if (!card) return reply.code(404).send({ error: "Deck card not found" });
      const cardId = typeof request.body?.cardId === "string" ? request.body.cardId : "";
      const finish = request.body?.finish === undefined ? Number(card.finish ?? 0) : readDeckFinish(request.body.finish);
      const printing = database.prepare("SELECT oracle_id, name, set_code, collector_number, finishes FROM cards WHERE id = ?").get(cardId);
      if (!printing) return reply.code(404).send({ error: "Card printing not found" });
      if (printing.oracle_id !== card.oracle_id) return reply.code(400).send({ error: "Choose a printing of the same card" });
      if (!finishOffered(String(printing.finishes ?? ""), finish)) return reply.code(400).send({ error: "That printing is not made in that finish" });
      const asked = request.body?.quantity === undefined ? Number(card.quantity) : Number(request.body.quantity);
      if (!Number.isInteger(asked) || asked < 1) return reply.code(400).send({ error: "Quantity must be a whole number of at least 1" });
      const count = Math.min(asked, Number(card.quantity));
      const links = request.body?.links === undefined ? [] : readLinks(request.body.links);
      if (typeof links === "string") return reply.code(400).send({ error: links });
      if (links.some((link) => link.cardId !== cardId || link.foil !== finish)) return reply.code(400).send({ error: "Linked copies must be of the new version" });
      if (cardId === card.printing_id && finish === Number(card.finish ?? 0)) return { status: "unchanged", entryId, linked: 0 };
      try {
        const result = transaction(database, () => {
          touchDeckCollections(database, deckId, entryId);
          const target = moveDeckCards(database, deckId, entryId, count, cardId, finish, false);
          const linked = links.length ? linkCopies(database, deckId, target, links.map((link) => ({ ...link, quantity: Math.min(link.quantity, count) })), userOf(request)) : 0;
          touchDeck(database, deckId);
          const finishWord = finish === 2 ? " etched" : finish === 1 ? " foil" : "";
          const part = count < Number(card.quantity) ? `${count} of ${Number(card.quantity)} ` : "";
          logDeck(database, deckId, nameOf(request),
            `${part}${String(printing.name)} printing changed to (${String(printing.set_code).toUpperCase()}) ${String(printing.collector_number)}${finishWord}`);
          return { entryId: target, linked };
        });
        return { status: "changed", ...result };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not change the printing" });
      }
    },
  );

  // copies of a card in the account's collections that could fill a deck card: every printing, with how many are free
  app.get<{ Params: { deckId: string }; Querystring: { cardId?: string; entryId?: string } }>("/api/decks/:deckId/candidates", async (request, reply) => {
    const cardId = String(request.query.cardId ?? "");
    const oracle = database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(cardId);
    if (!oracle) return reply.code(404).send({ error: "Card printing not found" });
    const entryId = request.query.entryId ? Number(request.query.entryId) : -1;
    const deck = database.prepare("SELECT collection_id FROM decks WHERE id = ?").get(request.params.deckId);
    return freeVersions(database, userOf(request), String(oracle.oracle_id), entryId, cardId, String(deck?.collection_id ?? ""));
  });

  // links free copies of the exact printing and finish to every card the deck is missing
  app.post<{ Params: { deckId: string } }>("/api/decks/:deckId/link-owned", async (request) => {
    const linked = transaction(database, () => {
      const count = linkOwnedCopies(database, request.params.deckId, userOf(request));
      if (count) {
        touchDeck(database, request.params.deckId);
        logDeck(database, request.params.deckId, nameOf(request), `Linked ${count} owned ${count === 1 ? "copy" : "copies"}`);
      }
      return count;
    });
    return { status: "linked", linked };
  });

  // Add deck to collection: new copies in the deck's printing and finish (NM, English) go into a collection. "missing" adds
  // only the cards the deck is missing; "all" adds every card. Either way the new copies are linked to the missing cards.
  // The maybeboard is left out. The answer has the collection counts before and after, for undo.
  app.post<{ Params: { deckId: string }; Body: { collectionId?: unknown; mode?: unknown } }>("/api/decks/:deckId/add-to-collection", async (request, reply) => {
    const deckId = request.params.deckId;
    const userId = userOf(request);
    const collectionId = request.body?.collectionId;
    const mode = request.body?.mode;
    if (typeof collectionId !== "string" || !access(database, "collection", collectionId, userId)) return reply.code(404).send({ error: "Collection not found" });
    if (mode !== "missing" && mode !== "all") return reply.code(400).send({ error: "Choose missing cards or every card" });
    if (database.prepare("SELECT kind FROM collections WHERE id = ?").get(collectionId)?.kind === "wishlist") {
      return reply.code(400).send({ error: "Choose a collection, not a wishlist" });
    }
    const cards = database.prepare(
      `SELECT dc.id, dc.printing_id, dc.finish, dc.quantity, dc.quantity - COALESCE((SELECT SUM(l.quantity) FROM deck_links l WHERE l.deck_card_id = dc.id), 0) AS missing
       FROM deck_cards dc JOIN cards c ON c.id = dc.printing_id WHERE dc.deck_id = ? AND dc.zone != 'maybeboard' ORDER BY dc.id`,
    ).all(deckId);
    const current = database.prepare(`SELECT i.quantity, i.trade FROM collection_cards i WHERE i.collection_id = ? AND ${KEY}`);
    const insert = database.prepare(
      `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity)`,
    );
    const result = transaction(database, () => {
      const adding = new Map<string, { key: CopyKey; count: number }>();
      const links: Array<{ deckCardId: number; key: CopyKey; quantity: number }> = [];
      for (const card of cards) {
        const missing = Math.max(0, Number(card.missing));
        const count = mode === "all" ? Number(card.quantity) : missing;
        if (count <= 0) continue;
        const key: CopyKey = { cardId: String(card.printing_id), foil: (Number(card.finish ?? 0) as 0 | 1 | 2), condition: "NM", language: "en", proxy: false };
        const id = `${key.cardId}:${key.foil}`;
        adding.set(id, { key, count: (adding.get(id)?.count ?? 0) + count });
        if (missing > 0) links.push({ deckCardId: Number(card.id), key, quantity: missing });
      }
      const before: Array<CopyKey & { quantity: number; trade: number }> = [];
      const after: Array<CopyKey & { quantity: number; trade: number }> = [];
      for (const { key, count } of adding.values()) {
        const row = current.get(collectionId, ...keyValues(key));
        const have = Number(row?.quantity ?? 0);
        const add = Math.min(count, 10_000 - have);
        if (add <= 0) continue;
        insert.run(collectionId, ...keyValues(key), add);
        before.push({ ...key, quantity: have, trade: Number(row?.trade ?? 0) });
        after.push({ ...key, quantity: have + add, trade: Number(row?.trade ?? 0) });
      }
      let linked = 0;
      for (const link of links) {
        addLink(database, link.deckCardId, { collectionId, ...link.key, quantity: link.quantity });
        linked += link.quantity;
      }
      const added = after.reduce((sum, item, index) => sum + item.quantity - before[index]!.quantity, 0);
      lowerWishlists(database, userId, after.map((item, index) => ({ cardId: item.cardId, quantity: item.quantity - before[index]!.quantity, proxy: false })));
      if (added || linked) {
        touchDeck(database, deckId);
        const name = String(database.prepare("SELECT name FROM collections WHERE id = ?").get(collectionId)?.name ?? "a collection");
        logDeck(database, deckId, nameOf(request), `Added ${added} ${added === 1 ? "card" : "cards"} to ${name}${linked ? `, ${linked} linked` : ""}`);
      }
      return { added, linked, before, after };
    });
    return result;
  });

  // marks a deck card Upgrade wanted with the version wanted, or removes the mark (cardId null)
  app.put<{ Params: { deckId: string; entryId: string }; Body: { cardId?: unknown; finish?: unknown } }>("/api/decks/:deckId/entries/:entryId/upgrade", async (request, reply) => {
    const entryId = Number(request.params.entryId);
    const card = database.prepare("SELECT dc.id, dc.oracle_id, dc.printing_id, dc.finish, c.name FROM deck_cards dc JOIN cards c ON c.id = dc.printing_id WHERE dc.id = ? AND dc.deck_id = ?")
      .get(entryId, request.params.deckId);
    if (!card) return reply.code(404).send({ error: "Deck card not found" });
    const cardId = request.body?.cardId;
    if (cardId === null) {
      database.prepare("UPDATE deck_cards SET want_card_id = NULL, want_finish = 0 WHERE id = ?").run(entryId);
      touchDeck(database, request.params.deckId);
      logDeck(database, request.params.deckId, nameOf(request), `${String(card.name)} no longer marked Upgrade wanted`);
      return { status: "saved" };
    }
    const finish = readDeckFinish(request.body?.finish);
    const wanted = typeof cardId === "string" ? database.prepare("SELECT oracle_id, set_code, collector_number, finishes FROM cards WHERE id = ?").get(cardId) : undefined;
    if (!wanted) return reply.code(404).send({ error: "Card printing not found" });
    if (wanted.oracle_id !== card.oracle_id) return reply.code(400).send({ error: "Choose a printing of the same card" });
    if (!finishOffered(String(wanted.finishes ?? ""), finish)) return reply.code(400).send({ error: "That printing is not made in that finish" });
    if (cardId === card.printing_id && finish === Number(card.finish ?? 0)) return reply.code(400).send({ error: "The deck already has this version. Choose the version you want instead." });
    database.prepare("UPDATE deck_cards SET want_card_id = ?, want_finish = ? WHERE id = ?").run(cardId as string, finish, entryId);
    touchDeck(database, request.params.deckId);
    const finishWord = finish === 2 ? " etched" : finish === 1 ? " foil" : "";
    logDeck(database, request.params.deckId, nameOf(request),
      `${String(card.name)} marked Upgrade wanted: (${String(wanted.set_code).toUpperCase()}) ${String(wanted.collector_number)}${finishWord}`);
    return { status: "saved" };
  });

  app.patch<{ Params: { deckId: string; oracleId: string }; Querystring: { zone?: string; entryId?: string }; Body: { quantity?: number; zone?: string } }>(
    "/api/decks/:deckId/cards/:oracleId",
    async (request, reply) => {
      const currentZone = request.query.zone ?? "main";
      const nextZone = request.body?.zone ?? currentZone;
      const { quantity } = request.body ?? {};
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > 100 || !ZONES.includes(currentZone) || !ZONES.includes(nextZone)) {
        return reply.code(400).send({ error: "Provide a quantity from 0 to 100 and valid deck zones" });
      }
      const existing = request.query.entryId
        ? database.prepare("SELECT id, oracle_id, printing_id, quantity, zone, finish FROM deck_cards WHERE deck_id = ? AND id = ?").get(request.params.deckId, Number(request.query.entryId))
        : database.prepare("SELECT id, oracle_id, printing_id, quantity, zone, finish FROM deck_cards WHERE deck_id = ? AND oracle_id = ? AND zone = ? LIMIT 1")
          .get(request.params.deckId, request.params.oracleId, currentZone);
      if (!existing) return reply.code(404).send({ error: "Deck card not found" });
      const id = Number(existing.id);
      const name = existing.printing_id ? cardName(database, String(existing.printing_id)) : "a card";
      const was = Number(existing.quantity);
      const fromZone = String(existing.zone);
      const change = quantity === 0 ? `-${was} ${name} (${ZONE_NAMES[fromZone]})`
        : fromZone !== nextZone ? `${name} moved from ${ZONE_NAMES[fromZone]} to ${ZONE_NAMES[nextZone]}${quantity !== was ? `, ${quantity} copies` : ""}`
          : quantity > was ? `+${quantity - was} ${name} (${ZONE_NAMES[fromZone]})` : quantity < was ? `-${was - quantity} ${name} (${ZONE_NAMES[fromZone]})` : "";
      transaction(database, () => {
        touchDeckCollections(database, request.params.deckId, id);
        if (quantity === 0) database.prepare("DELETE FROM deck_cards WHERE id = ?").run(id);
        else if (currentZone === nextZone) {
          database.prepare("UPDATE deck_cards SET quantity = ? WHERE id = ?").run(quantity, id);
          capDeckCardLinks(database, id);
        } else {
          const target = database.prepare("SELECT id FROM deck_cards WHERE deck_id = ? AND oracle_id = ? AND zone = ? AND printing_id IS ? AND finish = ?")
            .get(request.params.deckId, String(existing.oracle_id), nextZone, existing.printing_id as string | null, Number(existing.finish ?? 0));
          if (target) {
            // the links go with the cards to the other zone
            database.prepare("UPDATE deck_cards SET quantity = quantity + ? WHERE id = ?").run(quantity, Number(target.id));
            moveCardLinks(database, id, Number(target.id));
            database.prepare("DELETE FROM deck_cards WHERE id = ?").run(id);
            capDeckCardLinks(database, Number(target.id));
          } else {
            database.prepare("UPDATE deck_cards SET quantity = ?, zone = ? WHERE id = ?").run(quantity, nextZone, id);
            capDeckCardLinks(database, id);
          }
        }
        touchDeck(database, request.params.deckId);
        if (change) logDeck(database, request.params.deckId, nameOf(request), change);
      });
      return { status: quantity === 0 ? "removed" : "updated" };
    },
  );

  app.delete<{ Params: { deckId: string; oracleId: string }; Querystring: { zone?: string; entryId?: string } }>(
    "/api/decks/:deckId/cards/:oracleId",
    async (request, reply) => {
      const zone = request.query.zone ?? "main";
      if (!ZONES.includes(zone)) return reply.code(400).send({ error: "Invalid deck zone" });
      const entry = request.query.entryId
        ? database.prepare("SELECT id FROM deck_cards WHERE deck_id = ? AND id = ?").get(request.params.deckId, Number(request.query.entryId))
        : database.prepare("SELECT id FROM deck_cards WHERE deck_id = ? AND oracle_id = ? AND zone = ? LIMIT 1").get(request.params.deckId, request.params.oracleId, zone);
      if (!entry) return reply.code(404).send({ error: "Deck card not found" });
      const gone = database.prepare("SELECT dc.quantity, dc.zone, c.name FROM deck_cards dc LEFT JOIN cards c ON c.id = dc.printing_id WHERE dc.id = ?").get(Number(entry.id));
      touchDeckCollections(database, request.params.deckId, Number(entry.id));
      database.prepare("DELETE FROM deck_cards WHERE id = ?").run(Number(entry.id));
      touchDeck(database, request.params.deckId);
      if (gone) logDeck(database, request.params.deckId, nameOf(request), `-${Number(gone.quantity)} ${String(gone.name ?? "a card")} (${ZONE_NAMES[String(gone.zone)]})`);
      return { status: "removed" };
    },
  );
}
