// ---------- deck links: which copies in collections fill each deck card ----------
import type { DatabaseSync } from "node:sqlite";
import type { CopyKey } from "./copies.js";

/** A copy in a collection that fills a deck card, and how many of it. */
export type Link = CopyKey & { collectionId: string; quantity: number };

/** A collection's rows show the decks their copies fill, so a change of links is a change of the collection. */
const touchCollection = (database: DatabaseSync, id: string) =>
  database.prepare("UPDATE collections SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(id);

const KEY = "card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?";
const keyValues = (key: CopyKey) => [key.cardId, key.foil, key.condition, key.language, key.proxy ? 1 : 0] as const;

/** How many copies of a row are linked to decks. */
export function linkedCount(database: DatabaseSync, collectionId: string, key: CopyKey): number {
  return Number(database.prepare(`SELECT COALESCE(SUM(quantity), 0) AS n FROM deck_links WHERE collection_id = ? AND ${KEY}`)
    .get(collectionId, ...keyValues(key))?.n ?? 0);
}

function rowQuantity(database: DatabaseSync, collectionId: string, key: CopyKey): number {
  return Number(database.prepare(`SELECT quantity FROM collection_cards WHERE collection_id = ? AND ${KEY}`).get(collectionId, ...keyValues(key))?.quantity ?? 0);
}

/** Removes links beyond the copies a row still holds, newest links first. The deck cards they filled become missing. */
export function trimLinks(database: DatabaseSync, collectionId: string, key: CopyKey): void {
  let excess = linkedCount(database, collectionId, key) - rowQuantity(database, collectionId, key);
  if (excess <= 0) return;
  touchCollection(database, collectionId);
  const links = database.prepare(`SELECT id, quantity FROM deck_links WHERE collection_id = ? AND ${KEY} ORDER BY id DESC`).all(collectionId, ...keyValues(key));
  for (const link of links) {
    if (excess <= 0) break;
    const take = Math.min(excess, Number(link.quantity));
    if (take === Number(link.quantity)) database.prepare("DELETE FROM deck_links WHERE id = ?").run(Number(link.id));
    else database.prepare("UPDATE deck_links SET quantity = quantity - ? WHERE id = ?").run(take, Number(link.id));
    excess -= take;
  }
}

/** Adds a link of `quantity` copies to a deck card, merging with a link to the same copy. */
export function addLink(database: DatabaseSync, deckCardId: number, link: Link): void {
  touchCollection(database, link.collectionId);
  database.prepare(
    `INSERT INTO deck_links (deck_card_id, collection_id, card_id, foil, condition, language, proxy, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(deck_card_id, collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = quantity + excluded.quantity`,
  ).run(deckCardId, link.collectionId, ...keyValues(link), link.quantity);
}

/**
 * Moves `count` linked copies of a row to another row: the links follow the copies.
 * `keepFree` copies of the source stay free first, so moving copies that are in no deck leaves the links alone.
 */
export function moveLinks(database: DatabaseSync, from: { collectionId: string; key: CopyKey }, to: { collectionId: string; key: CopyKey }, count: number, keepFree: number): void {
  let moving = Math.max(0, count - keepFree);
  if (moving <= 0) return;
  touchCollection(database, from.collectionId);
  const links = database.prepare(`SELECT id, deck_card_id, quantity FROM deck_links WHERE collection_id = ? AND ${KEY} ORDER BY id DESC`)
    .all(from.collectionId, ...keyValues(from.key));
  for (const link of links) {
    if (moving <= 0) break;
    const take = Math.min(moving, Number(link.quantity));
    if (take === Number(link.quantity)) database.prepare("DELETE FROM deck_links WHERE id = ?").run(Number(link.id));
    else database.prepare("UPDATE deck_links SET quantity = quantity - ? WHERE id = ?").run(take, Number(link.id));
    addLink(database, Number(link.deck_card_id), { ...to.key, collectionId: to.collectionId, quantity: take });
    moving -= take;
  }
}

/** Links of a deck card are capped at its quantity; extra links (newest first) are removed. */
export function capDeckCardLinks(database: DatabaseSync, deckCardId: number): void {
  const card = database.prepare("SELECT quantity FROM deck_cards WHERE id = ?").get(deckCardId);
  if (!card) return;
  let excess = Number(database.prepare("SELECT COALESCE(SUM(quantity), 0) AS n FROM deck_links WHERE deck_card_id = ?").get(deckCardId)?.n ?? 0) - Number(card.quantity);
  if (excess <= 0) return;
  for (const link of database.prepare("SELECT id, quantity, collection_id FROM deck_links WHERE deck_card_id = ? ORDER BY id DESC").all(deckCardId)) {
    if (excess <= 0) break;
    touchCollection(database, String(link.collection_id));
    const take = Math.min(excess, Number(link.quantity));
    if (take === Number(link.quantity)) database.prepare("DELETE FROM deck_links WHERE id = ?").run(Number(link.id));
    else database.prepare("UPDATE deck_links SET quantity = quantity - ? WHERE id = ?").run(take, Number(link.id));
    excess -= take;
  }
}

/** The links of every card in a deck, with the collection names the account sees. */
export function deckLinks(database: DatabaseSync, deckId: string, userId: number): Map<number, Array<Link & { collectionName: string }>> {
  const rows = database.prepare(
    `SELECT l.deck_card_id, l.collection_id, COALESCE(m.display_name, col.name) AS name, l.card_id, l.foil, l.condition, l.language, l.proxy, l.quantity
     FROM deck_links l JOIN deck_cards dc ON dc.id = l.deck_card_id JOIN collections col ON col.id = l.collection_id
     LEFT JOIN members m ON m.kind = 'collection' AND m.item_id = col.id AND m.user_id = ?
     WHERE dc.deck_id = ? ORDER BY l.id`,
  ).all(userId, deckId);
  const result = new Map<number, Array<Link & { collectionName: string }>>();
  for (const row of rows) {
    const list = result.get(Number(row.deck_card_id)) ?? [];
    list.push({
      collectionId: String(row.collection_id), collectionName: String(row.name), cardId: String(row.card_id), foil: Number(row.foil) as Link["foil"],
      condition: String(row.condition) as Link["condition"], language: String(row.language), proxy: Number(row.proxy) === 1, quantity: Number(row.quantity),
    });
    result.set(Number(row.deck_card_id), list);
  }
  return result;
}

/** For each row of a collection, the decks its copies are linked to. Keyed like the rows: card, finish, condition, language, proxy. */
export function collectionLinks(database: DatabaseSync, collectionId: string): Map<string, Array<{ id: string; name: string; quantity: number }>> {
  const rows = database.prepare(
    `SELECT l.card_id, l.foil, l.condition, l.language, l.proxy, d.id, d.name, SUM(l.quantity) AS quantity
     FROM deck_links l JOIN deck_cards dc ON dc.id = l.deck_card_id JOIN decks d ON d.id = dc.deck_id
     WHERE l.collection_id = ? GROUP BY l.card_id, l.foil, l.condition, l.language, l.proxy, d.id ORDER BY d.name`,
  ).all(collectionId);
  const result = new Map<string, Array<{ id: string; name: string; quantity: number }>>();
  for (const row of rows) {
    const key = rowKey(String(row.card_id), Number(row.foil), String(row.condition), String(row.language), Number(row.proxy) === 1);
    result.set(key, [...(result.get(key) ?? []), { id: String(row.id), name: String(row.name), quantity: Number(row.quantity) }]);
  }
  return result;
}

export const rowKey = (cardId: string, foil: number, condition: string, language: string, proxy: boolean) =>
  `${cardId}:${foil}:${condition}:${language}${proxy ? ":p" : ""}`;

/** Marks the collections that fill a deck as changed, before the deck or some of its cards go away. */
export function touchDeckCollections(database: DatabaseSync, deckId: string, deckCardId?: number): void {
  const rows = deckCardId === undefined
    ? database.prepare("SELECT DISTINCT l.collection_id FROM deck_links l JOIN deck_cards dc ON dc.id = l.deck_card_id WHERE dc.deck_id = ?").all(deckId)
    : database.prepare("SELECT DISTINCT collection_id FROM deck_links WHERE deck_card_id = ?").all(deckCardId);
  for (const row of rows) touchCollection(database, String(row.collection_id));
}
