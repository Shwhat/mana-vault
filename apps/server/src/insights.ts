// ---------- insights: statistics, deck ownership and the trade list ----------
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { type Currency, priceSql, readCurrency } from "./copies.js";
import { ENTRY_COLUMNS, toEntry } from "./library.js";
import { deckLinks } from "./links.js";

export type Bucket = { key: string; label: string; count: number; value: number };
type StatRow = {
  name: string; quantity: number; foil: number; rarity: string; colors: string; type_line: string; mana_value: number | null;
  set_code: string; set_name: string; price: number | null;
};

export const TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"] as const;
const RARITIES: Array<[string, string]> = [
  ["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"], ["mythic", "Mythic"], ["special", "Special"], ["bonus", "Bonus"],
];
const COLORS: Array<[string, string]> = [
  ["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"], ["M", "Multicolor"], ["C", "Colorless"],
];
const FINISHES: Array<[string, string]> = [["0", "Regular"], ["1", "Foil"], ["2", "Etched"]];

/** The front face of a type line: "Creature // Land" counts as a creature. */
const frontType = (typeLine: string) => typeLine.split(" // ")[0] ?? typeLine;
/** Every main type of a card. A card with none of them is Other. */
export const cardTypes = (typeLine: string): string[] => {
  const front = frontType(typeLine);
  const found = TYPES.filter((type) => front.includes(type));
  return found.length ? found : ["Other"];
};
/** W, U, B, R or G for one color, M for two or more, C for none. */
export const colorKey = (colors: string) => (colors.length === 0 ? "C" : colors.length > 1 ? "M" : colors);
/** Mana value bucket from 0 to 7+. Lands have no bucket. */
export const curveKey = (manaValue: number | null) => {
  const value = Math.floor(manaValue ?? 0);
  return value >= 7 ? "7+" : String(Math.max(0, value));
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Counts and values by rarity, color, type, mana value, set and finish, plus the price figures. */
export function summarize(rows: StatRow[], withFinish: boolean) {
  const buckets = (labels: Array<[string, string]>) => new Map(labels.map(([key, label]) => [key, { key, label, count: 0, value: 0 } as Bucket]));
  const rarity = buckets(RARITIES);
  const color = buckets(COLORS);
  const type = buckets([...TYPES.map((name): [string, string] => [name, name]), ["Other", "Other"]]);
  const curve = buckets(["0", "1", "2", "3", "4", "5", "6", "7+"].map((key): [string, string] => [key, key]));
  const finish = buckets(FINISHES);
  const sets = new Map<string, Bucket>();
  const prices: Array<{ price: number; quantity: number; name: string }> = [];
  let cards = 0;
  let value = 0;
  let unpriced = 0;
  const add = (map: Map<string, Bucket>, key: string, quantity: number, amount: number) => {
    const bucket = map.get(key);
    if (bucket) {
      bucket.count += quantity;
      bucket.value += amount;
    }
  };
  for (const row of rows) {
    const amount = (row.price ?? 0) * row.quantity;
    cards += row.quantity;
    value += amount;
    if (row.price === null) unpriced += row.quantity;
    else prices.push({ price: row.price, quantity: row.quantity, name: row.name });
    add(rarity, row.rarity, row.quantity, amount);
    add(color, colorKey(row.colors), row.quantity, amount);
    for (const name of cardTypes(row.type_line)) add(type, name, row.quantity, amount);
    if (!frontType(row.type_line).includes("Land")) add(curve, curveKey(row.mana_value), row.quantity, amount);
    add(finish, String(row.foil), row.quantity, amount);
    const set = sets.get(row.set_code) ?? { key: row.set_code, label: row.set_name, count: 0, value: 0 };
    set.count += row.quantity;
    set.value += amount;
    sets.set(row.set_code, set);
  }
  // the median and average are per copy, so four copies of a card count four times
  prices.sort((a, b) => a.price - b.price);
  const pricedCopies = prices.reduce((sum, item) => sum + item.quantity, 0);
  let median: number | null = null;
  if (pricedCopies) {
    const middle = (pricedCopies - 1) / 2;
    const at = (position: number) => {
      let seen = 0;
      for (const item of prices) {
        seen += item.quantity;
        if (position < seen) return item.price;
      }
      return prices[prices.length - 1]!.price;
    };
    median = round((at(Math.floor(middle)) + at(Math.ceil(middle))) / 2);
  }
  const top = prices[prices.length - 1];
  const finishBuckets = [...finish.values()].map((bucket) => ({ ...bucket, value: round(bucket.value) }));
  const list = (map: Map<string, Bucket>, keepEmpty = false) =>
    [...map.values()].filter((bucket) => keepEmpty || bucket.count > 0).map((bucket) => ({ ...bucket, value: round(bucket.value) }));
  return {
    cards,
    value: round(value),
    unpriced,
    average: pricedCopies ? round(prices.reduce((sum, item) => sum + item.price * item.quantity, 0) / pricedCopies) : null,
    median,
    highest: top ? { name: top.name, price: top.price } : null,
    rarity: list(rarity),
    color: list(color),
    type: list(type),
    curve: list(curve, true),
    sets: [...sets.values()].sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label)).slice(0, 12)
      .map((bucket) => ({ ...bucket, value: round(bucket.value) })),
    finish: withFinish ? finishBuckets.filter((bucket) => bucket.count > 0) : [],
  };
}

/** The price of a printing in its regular finish, or its foil price when it only comes in foil. */
const anyFinishPrice = (currency: Currency, card = "c") => (currency === "eur"
  ? `COALESCE(${card}.price_eur, ${card}.price_eur_foil)`
  : `COALESCE(${card}.price_usd, ${card}.price_usd_foil, ${card}.price_usd_etched)`);

/** The price of a deck card's printing in the deck card's finish (dc.finish), falling back to the other finishes. */
const deckFinishPrice = (currency: Currency) => (currency === "eur"
  ? "(CASE dc.finish WHEN 0 THEN COALESCE(c.price_eur, c.price_eur_foil) ELSE COALESCE(c.price_eur_foil, c.price_eur) END)"
  : "(CASE dc.finish WHEN 1 THEN COALESCE(c.price_usd_foil, c.price_usd, c.price_usd_etched) WHEN 2 THEN COALESCE(c.price_usd_etched, c.price_usd_foil, c.price_usd) ELSE COALESCE(c.price_usd, c.price_usd_foil, c.price_usd_etched) END)");

/** Deck cards with the printing shown for them. Normal decks are priced at the cheapest printing of each card. */
function deckRows(database: DatabaseSync, deckId: string, currency: Currency) {
  return database.prepare(
    `SELECT dc.id AS entry_id, dc.oracle_id, dc.printing_id, dc.quantity, dc.zone, dc.finish, c.id AS card_id, c.name, c.rarity, c.colors, c.type_line,
            c.mana_value, c.set_code, c.set_name,
            CASE WHEN dc.printing_id IS NOT NULL THEN ${deckFinishPrice(currency)}
                 ELSE (SELECT MIN(${anyFinishPrice(currency, "p")}) FROM cards p WHERE p.oracle_id = dc.oracle_id) END AS price
     FROM deck_cards dc JOIN cards c ON c.id = COALESCE(
       dc.printing_id, (SELECT p.id FROM cards p WHERE p.oracle_id = dc.oracle_id ORDER BY p.lang != 'en', p.released_at DESC LIMIT 1))
     WHERE dc.deck_id = ? AND dc.zone != 'maybeboard'
     ORDER BY CASE dc.zone WHEN 'commander' THEN 0 WHEN 'main' THEN 1 ELSE 2 END, c.name`,
  ).all(deckId).map((row) => ({
    entry_id: Number(row.entry_id), oracle_id: String(row.oracle_id), printing_id: row.printing_id === null ? null : String(row.printing_id),
    card_id: String(row.card_id), quantity: Number(row.quantity), zone: String(row.zone), name: String(row.name), rarity: String(row.rarity),
    colors: String(row.colors), type_line: String(row.type_line), mana_value: typeof row.mana_value === "number" ? row.mana_value : null,
    set_code: String(row.set_code), set_name: String(row.set_name), foil: Number(row.finish ?? 0), price: typeof row.price === "number" ? row.price : null,
  }));
}

/**
 * Which deck cards the account owns: the copies linked to each deck card. A copy fills one deck at a time, and proxies
 * fill a slot like any copy. Cards with no linked copy are missing.
 */
export function deckOwnership(database: DatabaseSync, deckId: string, userId: number, currency: Currency) {
  const rows = deckRows(database, deckId, currency);
  const links = deckLinks(database, deckId, userId);
  let missingValue = 0;
  let unpriced = 0;
  const entries = rows.map((row) => {
    const list = links.get(row.entry_id) ?? [];
    const owned = Math.min(row.quantity, list.reduce((sum, link) => sum + link.quantity, 0));
    const missing = row.quantity - owned;
    if (missing) {
      if (row.price === null) unpriced += missing;
      else missingValue += row.price * missing;
    }
    const places = new Map<string, { id: string; name: string; quantity: number }>();
    for (const link of list) {
      const place = places.get(link.collectionId) ?? { id: link.collectionId, name: link.collectionName, quantity: 0 };
      place.quantity += link.quantity;
      places.set(link.collectionId, place);
    }
    return {
      entryId: row.entry_id, cardId: row.card_id, name: row.name, zone: row.zone, needed: row.quantity, owned, missing, price: row.price,
      proxies: list.filter((link) => link.proxy).reduce((sum, link) => sum + link.quantity, 0), where: [...places.values()],
    };
  });
  const needed = entries.reduce((sum, entry) => sum + entry.needed, 0);
  const owned = entries.reduce((sum, entry) => sum + entry.owned, 0);
  return { mode: "theme", currency, needed, owned, missing: needed - owned, missingValue: round(missingValue), unpriced, entries };
}

export function registerInsightRoutes(app: FastifyInstance, database: DatabaseSync) {
  type Query = { Querystring: { currency?: string } };

  app.get<{ Params: { collectionId: string } } & Query>("/api/collections/:collectionId/stats", async (request) => {
    const currency = readCurrency(request.query.currency);
    const rows = database.prepare(
      `SELECT c.name, i.quantity, i.foil, c.rarity, c.colors, c.type_line, c.mana_value, c.set_code, c.set_name, ${priceSql(currency)} AS price
       FROM collection_cards i JOIN cards c ON c.id = i.card_id WHERE i.collection_id = ? AND i.proxy = 0`,
    ).all(request.params.collectionId).map((row) => ({
      name: String(row.name), quantity: Number(row.quantity), foil: Number(row.foil), rarity: String(row.rarity), colors: String(row.colors),
      type_line: String(row.type_line), mana_value: typeof row.mana_value === "number" ? row.mana_value : null, set_code: String(row.set_code),
      set_name: String(row.set_name), price: typeof row.price === "number" ? row.price : null,
    }));
    return { currency, entries: rows.length, ...summarize(rows, true) };
  });

  app.get<{ Params: { deckId: string } } & Query>("/api/decks/:deckId/stats", async (request) => {
    const currency = readCurrency(request.query.currency);
    const rows = deckRows(database, request.params.deckId, currency);
    return { currency, entries: rows.length, ...summarize(rows, false) };
  });

  app.get<{ Params: { deckId: string } } & Query>("/api/decks/:deckId/ownership", async (request) =>
    deckOwnership(database, request.params.deckId, request.user!.id, readCurrency(request.query.currency)));

  // copies marked for trade in the collections this account owns
  app.get("/api/trade", async (request) => database.prepare(
    `SELECT ${ENTRY_COLUMNS}, col.id AS collection_id, col.name AS collection_name
     FROM collection_cards i JOIN cards c ON c.id = i.card_id JOIN collections col ON col.id = i.collection_id
     WHERE col.owner_id = ? AND col.kind = 'collection' AND i.trade > 0 AND i.proxy = 0
     ORDER BY c.name, c.set_code, c.collector_number, col.created_at`,
  ).all(request.user!.id).map(toEntry));
}
