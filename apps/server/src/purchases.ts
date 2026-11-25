// ---------- purchase history (0.16.0): purchases with product lines, openings that pulled cards are tied to, sealed
// values, card and product sales, trades, imported purchase prices, and the figures Spent, Received, Value now and
// Gain or loss ----------
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { access } from "./library.js";
import { type CopyKey, readCopyKey } from "./copies.js";
import { type CopyChange, onCopiesAdded, onCopiesLowered, onCopiesMoved, onTradeDone, onTradeReopened, type TradeSide } from "./copy-events.js";
import { linkedCount, moveLinks, relinkRemoved, trimLinks } from "./links.js";
import { BOOSTER_PRODUCTS, lineBooster, lineValue, pullsAllowed, boosterLabel } from "./boosters.js";
import { mergeHooks } from "./scryfall-extras.js";
import { isAdmin } from "./admin.js";
import { CONDITION_NOTE, conditionOf, finishOf, parseReceipt, pdfText, pictureText, setOf, specialFoilOf } from "./receipts.js";
import { specialFoil } from "./foil-types.js";
import { initializeSealed, matchSealed, preconDeckCards, sealedChoices, sealedDeckCards } from "./sealed.js";
import { activeSource, priceCols } from "./price-context.js";
import { sourcePriceOn, storeOf } from "./mtgjson.js";

export const ENTRY_KINDS = ["purchase", "card_sale", "product_sale", "trade"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** The products a purchase line can be, with the packs each holds by default. */
export const PRODUCTS: Record<string, { label: string; packs: number }> = {
  play_booster: { label: "Play booster", packs: 1 },
  draft_booster: { label: "Draft booster", packs: 1 },
  set_booster: { label: "Set booster", packs: 1 },
  collector_booster: { label: "Collector booster", packs: 1 },
  jumpstart_booster: { label: "Jumpstart booster", packs: 1 },
  other_booster: { label: "Other booster", packs: 1 },
  booster_box: { label: "Booster box", packs: 36 },
  bundle: { label: "Bundle", packs: 9 },
  beginner_box: { label: "Beginner box", packs: 0 },
  starter_collection: { label: "Starter collection", packs: 0 },
  commander_deck: { label: "Commander deck", packs: 0 },
  deck: { label: "Starter or other deck", packs: 0 },
  prerelease_kit: { label: "Prerelease kit", packs: 6 },
  secret_lair: { label: "Secret Lair", packs: 0 },
  single: { label: "Single cards", packs: 0 },
  other: { label: "Other", packs: 0 },
};

const now = "strftime('%Y-%m-%d %H:%M:%f', 'now')";
const KEY = "card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?";
const keyValues = (key: CopyKey) => [key.cardId, key.foil, key.condition, key.language, key.proxy ? 1 : 0] as const;
const money = (value: number) => Math.round(value * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

export function initializePurchases(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS purchase_entries (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('purchase', 'card_sale', 'product_sale', 'trade')),
      date TEXT NOT NULL,
      place TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'usd',
      tax REAL NOT NULL DEFAULT 0,
      shipping REAL NOT NULL DEFAULT 0,
      fees REAL NOT NULL DEFAULT 0,
      cash_out REAL NOT NULL DEFAULT 0,
      cash_in REAL NOT NULL DEFAULT 0,
      trade_id TEXT,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE INDEX IF NOT EXISTS purchase_entries_user ON purchase_entries(user_id, date);
    CREATE TABLE IF NOT EXISTS purchase_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      product TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      set_code TEXT,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      cost REAL NOT NULL DEFAULT 0,
      packs INTEGER NOT NULL DEFAULT 0,
      opened INTEGER NOT NULL DEFAULT 0,
      sold INTEGER NOT NULL DEFAULT 0,
      card_id TEXT, foil INTEGER, condition TEXT, language TEXT, collection_id TEXT
    );
    CREATE INDEX IF NOT EXISTS purchase_lines_entry ON purchase_lines(entry_id);
    CREATE TABLE IF NOT EXISTS purchase_sales (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      what TEXT NOT NULL CHECK(what IN ('card', 'product')),
      card_id TEXT, foil INTEGER, condition TEXT, language TEXT, proxy INTEGER, collection_id TEXT,
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      price REAL NOT NULL DEFAULT 0,
      source_entry_id TEXT,
      source_line_id TEXT
    );
    CREATE INDEX IF NOT EXISTS purchase_sales_entry ON purchase_sales(entry_id);
    CREATE TABLE IF NOT EXISTS purchase_openings (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
      line_id TEXT NOT NULL REFERENCES purchase_lines(id) ON DELETE CASCADE,
      count INTEGER NOT NULL CHECK(count > 0),
      name TEXT NOT NULL,
      collection_id TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      done_at TEXT
    );
    CREATE TABLE IF NOT EXISTS purchase_ties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
      line_id TEXT,
      opening_id TEXT,
      collection_id TEXT NOT NULL,
      card_id TEXT NOT NULL, foil INTEGER NOT NULL, condition TEXT NOT NULL, language TEXT NOT NULL, proxy INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE INDEX IF NOT EXISTS purchase_ties_user ON purchase_ties(user_id);
    CREATE INDEX IF NOT EXISTS purchase_ties_entry ON purchase_ties(entry_id);
    CREATE TABLE IF NOT EXISTS purchase_values (
      line_id TEXT NOT NULL REFERENCES purchase_lines(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      value REAL NOT NULL,
      PRIMARY KEY (line_id, date)
    );
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      match_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'store' CHECK(kind IN ('store', 'website', 'person', 'other')),
      note TEXT NOT NULL DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE TABLE IF NOT EXISTS purchase_receipts (
      entry_id TEXT PRIMARY KEY REFERENCES purchase_entries(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      data BLOB NOT NULL,
      added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
  `);
  // 0.17.0: places shared on the server, who paid shipping on a sale, and the trade price of cards got in a trade
  const entryColumns = new Set(database.prepare("PRAGMA table_info(purchase_entries)").all().map((row) => String(row.name)));
  if (!entryColumns.has("place_id")) database.exec("ALTER TABLE purchase_entries ADD COLUMN place_id TEXT");
  if (!entryColumns.has("shipping_by")) database.exec("ALTER TABLE purchase_entries ADD COLUMN shipping_by TEXT NOT NULL DEFAULT 'me'");
  const tieColumns = new Set(database.prepare("PRAGMA table_info(purchase_ties)").all().map((row) => String(row.name)));
  if (!tieColumns.has("price")) database.exec("ALTER TABLE purchase_ties ADD COLUMN price REAL");
  // 0.19.0: packs opened one at a time. An opening of a product with packs is one pack (count is in packs); the packs of
  // one Open... share a group and wait in order. Older openings of such products are counted in packs from now on.
  const openingColumns = new Set(database.prepare("PRAGMA table_info(purchase_openings)").all().map((row) => String(row.name)));
  // the expected value of an opening's packs, stored the day it is opened (0.21.0)
  if (!openingColumns.has("ev")) database.exec("ALTER TABLE purchase_openings ADD COLUMN ev REAL");
  if (!openingColumns.has("pack_number")) {
    database.exec("ALTER TABLE purchase_openings ADD COLUMN pack_number INTEGER");
    database.exec("ALTER TABLE purchase_openings ADD COLUMN group_id TEXT");
    database.exec("ALTER TABLE purchase_openings ADD COLUMN waiting INTEGER NOT NULL DEFAULT 0");
    database.exec("UPDATE purchase_openings SET count = count * (SELECT packs FROM purchase_lines l WHERE l.id = line_id) WHERE (SELECT packs FROM purchase_lines l WHERE l.id = line_id) > 0");
  }
  const lineColumns = new Set(database.prepare("PRAGMA table_info(purchase_lines)").all().map((row) => String(row.name)));
  // 0.20.0: the MTGJSON sealed product a line's product name matched
  if (!lineColumns.has("sealed_id")) database.exec("ALTER TABLE purchase_lines ADD COLUMN sealed_id TEXT");
  initializeSealed(database);
  if (!lineColumns.has("packs_opened")) {
    database.exec("ALTER TABLE purchase_lines ADD COLUMN packs_opened INTEGER NOT NULL DEFAULT 0");
    database.exec("UPDATE purchase_lines SET packs_opened = opened * packs WHERE packs > 0");
  }
  // 0.18.0: each tie keeps the card's price on the day it was added (Value when pulled), from the price history for older ties
  if (!tieColumns.has("value_then")) {
    database.exec("ALTER TABLE purchase_ties ADD COLUMN value_then REAL");
    for (const tie of database.prepare("SELECT id, card_id, foil, created_at FROM purchase_ties").all()) {
      database.prepare("UPDATE purchase_ties SET value_then = ? WHERE id = ?").run(priceOnDay(database, String(tie.card_id), Number(tie.foil), String(tie.created_at).slice(0, 10)), Number(tie.id));
    }
  }
  for (const row of database.prepare("SELECT DISTINCT place, user_id FROM purchase_entries WHERE place_id IS NULL AND place != ''").all()) {
    const placeId = placeFor(database, String(row.place), Number(row.user_id));
    database.prepare("UPDATE purchase_entries SET place_id = ?, place = (SELECT name FROM places WHERE id = ?) WHERE place_id IS NULL AND place = ?").run(placeId, placeId, String(row.place));
  }
}

// ---------- places: stores, websites and people, shared by every account ----------

export const PLACE_KINDS = ["store", "website", "person", "other"] as const;
/** Names match ignoring capitals and extra spaces. */
export const placeKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** The place with this name, made when there is none. */
export function placeFor(database: DatabaseSync, name: string, userId: number | null): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) return null;
  const found = database.prepare("SELECT id FROM places WHERE match_key = ?").get(placeKey(clean));
  if (found) return String(found.id);
  const id = randomUUID();
  database.prepare("INSERT INTO places (id, name, match_key, created_by) VALUES (?, ?, ?, ?)").run(id, clean, placeKey(clean), userId);
  return id;
}

const placeName = (database: DatabaseSync, id: string | null) => (id ? String(database.prepare("SELECT name FROM places WHERE id = ?").get(id)?.name ?? "") : "");

// ---------- reading what is sent ----------

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const amount = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/^[$€]/, "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 10_000_000 ? money(number) : null;
};
const count = (value: unknown, max = 100_000): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : null;
};
const readDate = (value: unknown): string | null => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null);

type Header = {
  date: string; place: string; placeId: string | null; note: string; currency: "usd"; tax: number; shipping: number; fees: number; cashOut: number; cashIn: number;
  shippingBy: "me" | "buyer";
};

/** Reads the entry fields. The place is a place id or a name (a new name becomes a place). Amounts are always in USD. */
function readHeader(database: DatabaseSync, userId: number, body: Record<string, unknown>, base?: Header): Header | string {
  const date = body.date === undefined && base ? base.date : readDate(body.date);
  if (!date) return "Enter the date as a calendar date";
  const figures: Record<string, number> = {};
  for (const field of ["tax", "shipping", "fees", "cashOut", "cashIn"] as const) {
    const value = body[field] === undefined && base ? base[field] : amount(body[field]);
    if (value === null) return "Amounts must be 0 or more";
    figures[field] = value;
  }
  let placeId: string | null;
  if (typeof body.placeId === "string" && body.placeId) {
    if (!database.prepare("SELECT 1 FROM places WHERE id = ?").get(body.placeId)) return "That place is not in the list of places";
    placeId = body.placeId;
  } else if (body.place !== undefined || body.placeId !== undefined) placeId = placeFor(database, text(body.place, 120), userId);
  else placeId = base?.placeId ?? null;
  return {
    date, placeId, place: placeName(database, placeId), note: body.note === undefined && base ? base.note : text(body.note, 1000), currency: "usd",
    tax: figures.tax!, shipping: figures.shipping!, fees: figures.fees!, cashOut: figures.cashOut!, cashIn: figures.cashIn!,
    shippingBy: body.shippingBy === undefined && base ? base.shippingBy : body.shippingBy === "buyer" ? "buyer" : "me",
  };
}

type LineInput = {
  id?: string; product: string; name: string; setCode: string | null; quantity: number; cost: number; packs: number;
  single?: { key: CopyKey; collectionId: string };
};

function readLines(value: unknown): LineInput[] | string {
  if (!Array.isArray(value) || !value.length) return "Add at least one product";
  if (value.length > 500) return "A purchase can have up to 500 lines";
  const lines: LineInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return "A product line is not valid";
    const line = raw as Record<string, unknown>;
    const product = String(line.product ?? "");
    if (!(product in PRODUCTS)) return "Choose a product for every line";
    const quantity = count(line.quantity, 10_000);
    if (!quantity) return "Quantities are whole numbers from 1 to 10000";
    const cost = amount(line.cost);
    if (cost === null) return "Costs must be 0 or more";
    const packs = line.packs === undefined ? PRODUCTS[product]!.packs : Number(line.packs);
    if (!Number.isInteger(packs) || packs < 0 || packs > 1000) return "Packs in it is a whole number from 0 to 1000";
    const name = text(line.name, 120);
    if (product === "other" && !name) return "Name the product of every Other line";
    const input: LineInput = {
      id: typeof line.id === "string" && line.id ? line.id : undefined, product, name, quantity, cost, packs,
      setCode: typeof line.setCode === "string" && line.setCode.trim() ? line.setCode.trim().toLowerCase().slice(0, 8) : null,
    };
    if (product === "single") {
      const key = readCopyKey(line);
      if (!key || typeof line.collectionId !== "string") return "Choose the card, its finish and the collection for every Single cards line";
      input.single = { key, collectionId: line.collectionId };
    }
    lines.push(input);
  }
  return lines;
}

// ---------- copies ----------

function heldQuantity(database: DatabaseSync, collectionId: string, key: CopyKey): number {
  return Number(database.prepare(`SELECT quantity FROM collection_cards WHERE collection_id = ? AND ${KEY}`).get(collectionId, ...keyValues(key))?.quantity ?? 0);
}

function takeCopies(database: DatabaseSync, collectionId: string, key: CopyKey, quantity: number): void {
  const have = heldQuantity(database, collectionId, key);
  if (have < quantity) {
    const name = String(database.prepare("SELECT name FROM cards WHERE id = ?").get(key.cardId)?.name ?? "A card");
    throw new Error(`${name}: only ${have} of ${quantity} copies are in the collection`);
  }
  if (have === quantity) database.prepare(`DELETE FROM collection_cards WHERE collection_id = ? AND ${KEY}`).run(collectionId, ...keyValues(key));
  else database.prepare(`UPDATE collection_cards SET quantity = quantity - ?, trade = MIN(trade, quantity - ?) WHERE collection_id = ? AND ${KEY}`).run(quantity, quantity, collectionId, ...keyValues(key));
  trimLinks(database, collectionId, key);
  database.prepare(`UPDATE collections SET updated_at = ${now} WHERE id = ?`).run(collectionId);
}

function putCopies(database: DatabaseSync, collectionId: string, key: CopyKey, quantity: number, price?: number, currency?: string): void {
  database.prepare(
    `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, purchase_price, price_currency, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity),
       purchase_price = COALESCE(purchase_price, excluded.purchase_price), price_currency = COALESCE(price_currency, excluded.price_currency)`,
  ).run(collectionId, ...keyValues(key), quantity, price ?? null, price === undefined ? null : currency ?? "usd");
  relinkRemoved(database, collectionId, key);
  database.prepare(`UPDATE collections SET updated_at = ${now} WHERE id = ?`).run(collectionId);
}

const keyOfRow = (row: Record<string, unknown>): CopyKey => ({
  cardId: String(row.card_id), foil: Number(row.foil) as CopyKey["foil"], condition: String(row.condition) as CopyKey["condition"],
  language: String(row.language), proxy: Number(row.proxy ?? 0) === 1,
});

function ownCollection(database: DatabaseSync, id: unknown, userId: number): boolean {
  if (typeof id !== "string" || !id) return false;
  return !!access(database, "collection", id, userId) && database.prepare("SELECT kind FROM collections WHERE id = ?").get(id)?.kind !== "wishlist";
}

// ---------- prices ----------

/** Today's price of a copy in USD, by its finish. */
/** A card's price on a day from the price history (the last one on or before it), or today's price when there is none. */
function priceOnDay(database: DatabaseSync, cardId: string, foil: number, day: string): number | null {
  // the main price source of the account (0.21.0), along its fallback stores, then today's price
  try {
    const value = sourcePriceOn(database, cardId, foil, day, activeSource());
    if (value !== null) return value;
    if (foil === 2) {
      const etched = sourcePriceOn(database, cardId, 1, day, activeSource());
      if (etched !== null) return etched;
    }
  } catch {
    // no price history table yet
  }
  return priceNow(database, cardId, foil);
}

function priceNow(database: DatabaseSync, cardId: string, foil: number, _currency = "usd"): number | null {
  const row = database.prepare(`SELECT ${priceCols("cards")} FROM cards WHERE id = ?`).get(cardId);
  if (!row) return null;
  const value = foil === 0 ? row.price_usd : foil === 1 ? row.price_usd_foil : row.price_usd_etched ?? row.price_usd_foil;
  return value === null || value === undefined ? null : Number(value);
}

/** The copies each tie still holds: the copies in the collection go to the oldest ties of the same copy first. */
function heldByTie(database: DatabaseSync, userId: number): Map<number, number> {
  const ties = database.prepare("SELECT * FROM purchase_ties WHERE user_id = ? ORDER BY id").all(userId);
  const left = new Map<string, number>();
  const held = new Map<number, number>();
  for (const tie of ties) {
    const id = `${String(tie.collection_id)}|${String(tie.card_id)}|${String(tie.foil)}|${String(tie.condition)}|${String(tie.language)}|${String(tie.proxy)}`;
    if (!left.has(id)) left.set(id, heldQuantity(database, String(tie.collection_id), keyOfRow(tie)));
    const take = Math.min(Number(tie.quantity), left.get(id)!);
    left.set(id, left.get(id)! - take);
    held.set(Number(tie.id), take);
  }
  return held;
}

// ---------- figures ----------

type LineRow = Record<string, unknown>;

/** Each line's share of the tax and shipping, by cost, so each line has a full cost. */
function fullCosts(lines: LineRow[], entry: Record<string, unknown>): Map<string, number> {
  const total = lines.reduce((sum, line) => sum + Number(line.cost), 0);
  const extra = Number(entry.tax) + Number(entry.shipping);
  return new Map(lines.map((line) => [String(line.id), Number(line.cost) + (total > 0 ? extra * Number(line.cost) / total : extra / lines.length)]));
}

function sealedEach(database: DatabaseSync, line: LineRow, full: number): { value: number; date: string | null } {
  const set = database.prepare("SELECT value, date FROM purchase_values WHERE line_id = ? ORDER BY date DESC LIMIT 1").get(String(line.id));
  return set ? { value: Number(set.value), date: String(set.date) } : { value: full / Number(line.quantity), date: null };
}

type Figures = { out: number; in: number; value: number; gain: number; unpriced: number };

function entryFigures(database: DatabaseSync, entry: Record<string, unknown>, held: Map<number, number>): Figures & {
  lines: Array<LineRow & { full: number; sealed: number; sealedValue: number; valueDate: string | null }>;
  ties: Array<Record<string, unknown> & { held: number; price: number | null }>;
  pulledIncome: number;
  trade: TradeFigures | null;
} {
  const id = String(entry.id);
  const currency = String(entry.currency);
  const lines = database.prepare("SELECT * FROM purchase_lines WHERE entry_id = ? ORDER BY position").all(id);
  const sales = database.prepare("SELECT * FROM purchase_sales WHERE entry_id = ?").all(id);
  const full = fullCosts(lines, entry);
  let value = 0;
  let unpriced = 0;
  const lineFigures = lines.map((line) => {
    const cost = full.get(String(line.id)) ?? 0;
    const sealed = Math.max(0, Number(line.quantity) - Number(line.opened) - Number(line.sold));
    const each = line.product === "single" ? { value: 0, date: null } : sealedEach(database, line, cost);
    // the packs not yet opened of a box that is partly opened still count, at the box's value per pack (0.19.0)
    const packs = Number(line.packs);
    const partPacks = packs > 0 ? Math.max(0, Number(line.opened) * packs - Number(line.packs_opened ?? 0)) : 0;
    if (line.product !== "single") value += sealed * each.value + (packs > 0 ? partPacks * each.value / packs : 0);
    return { ...line, full: money(cost), sealed, sealedValue: money(each.value), valueDate: each.date };
  });
  const ties = database.prepare("SELECT t.*, t.price AS trade_price, c.name, c.set_code, c.collector_number, c.image_url FROM purchase_ties t LEFT JOIN cards c ON c.id = t.card_id WHERE t.entry_id = ? ORDER BY t.id").all(id)
    .map((tie) => {
      const price = priceNow(database, String(tie.card_id), Number(tie.foil), currency);
      const have = Number(tie.proxy) === 1 ? 0 : held.get(Number(tie.id)) ?? 0;
      if (have && price === null) unpriced += have;
      value += have * (price ?? 0);
      return { ...tie, held: have, price };
    });
  // what this purchase's pulls and products brought in when sold
  const lineIds = lines.map((line) => String(line.id));
  const pulledIncome = Number(database.prepare(
    `SELECT COALESCE(SUM(price), 0) AS n FROM purchase_sales WHERE source_entry_id = ?${lineIds.length ? ` OR source_line_id IN (${lineIds.map(() => "?").join(",")})` : ""}`,
  ).get(id, ...lineIds)?.n ?? 0);
  let out = 0;
  let incoming = 0;
  const kind = String(entry.kind);
  let trade: TradeFigures | null = null;
  if (kind === "purchase") out = lines.reduce((sum, line) => sum + Number(line.cost), 0) + Number(entry.tax) + Number(entry.shipping);
  else if (kind === "trade") { out = Number(entry.cash_out); incoming = Number(entry.cash_in); }
  else incoming = sales.reduce((sum, sale) => sum + Number(sale.price), 0) - Number(entry.fees) - (entry.shipping_by === "buyer" ? 0 : Number(entry.shipping));
  let gain: number;
  if (kind === "purchase") gain = value + pulledIncome - out; // a purchase's gain counts what its pulls and products sold for
  else if (kind === "trade") {
    trade = tradeFigures(database, entry, sales, ties);
    // what the cards got are worth now, against what the cards given first cost (their trade value when no cost is recorded)
    gain = value + incoming - out - trade.originalCost - trade.noCostValue;
  } else gain = incoming + value - out; // a sale's gain is what it brought in
  return { out: money(out), in: money(incoming), value: money(value), gain: money(gain), unpriced, lines: lineFigures, ties, pulledIncome: money(pulledIncome), trade };
}

type TradeFigures = {
  gave: number; got: number; net: number; originalCost: number; noCostValue: number; noCost: string[];
  given: Array<{ saleId: string; cost: number | null; from: { entryId: string; date: string; description: string } | null }>;
};

/** What the cards of one sale or trade line first cost: their share of the purchase they came from, when known. */
function costEach(database: DatabaseSync, sale: Record<string, unknown>): number | null {
  if (!sale.source_entry_id || !sale.card_id) return null;
  const tie = database.prepare(
    "SELECT t.line_id, t.opening_id FROM purchase_ties t WHERE t.entry_id = ? AND t.card_id = ? AND t.foil = ? ORDER BY t.id LIMIT 1",
  ).get(String(sale.source_entry_id), String(sale.card_id), Number(sale.foil ?? 0));
  if (!tie?.line_id || tie.opening_id) return null;
  const source = database.prepare("SELECT * FROM purchase_entries WHERE id = ?").get(String(sale.source_entry_id));
  const line = database.prepare("SELECT * FROM purchase_lines WHERE id = ?").get(String(tie.line_id));
  if (!source || !line || line.product !== "single") return null;
  const lines = database.prepare("SELECT * FROM purchase_lines WHERE entry_id = ?").all(String(source.id));
  const full = fullCosts(lines, source).get(String(line.id)) ?? Number(line.cost);
  return money(full / Math.max(1, Number(line.quantity)));
}

/** A trade's Gave, Got, Net and the original cost of the cards given. */
function tradeFigures(database: DatabaseSync, entry: Record<string, unknown>, sales: Array<Record<string, unknown>>, ties: Array<Record<string, unknown> & { price: number | null }>): TradeFigures {
  const given = sales.filter((sale) => sale.what === "card");
  const gave = given.reduce((sum, sale) => sum + Number(sale.price), 0) + Number(entry.cash_out);
  const got = ties.reduce((sum, tie) => sum + Number(tie.quantity) * Number(tie.trade_price ?? tie.price ?? 0), 0) + Number(entry.cash_in);
  let originalCost = 0;
  let noCostValue = 0;
  const noCost: string[] = [];
  const rows = given.map((sale) => {
    const each = costEach(database, sale);
    if (each === null) {
      noCost.push(String(sale.name));
      noCostValue += Number(sale.price);
    } else originalCost += each * Number(sale.quantity);
    const source = sale.source_entry_id ? database.prepare("SELECT * FROM purchase_entries WHERE id = ?").get(String(sale.source_entry_id)) : null;
    return {
      saleId: String(sale.id), cost: each === null ? null : money(each * Number(sale.quantity)),
      from: source ? { entryId: String(source.id), date: String(source.date), description: describe(database, source) } : null,
    };
  });
  return { gave: money(gave), got: money(got), net: money(got - gave), originalCost: money(originalCost), noCostValue: money(noCostValue), noCost, given: rows };
}

const KIND_LABEL: Record<string, string> = { purchase: "Purchase", card_sale: "Card sale", product_sale: "Product sale", trade: "Trade" };

function lineLabel(line: LineRow): string {
  const product = PRODUCTS[String(line.product)];
  if (line.product === "single") return String(line.name || "Single cards");
  const named = line.product !== "other" && String(line.name) ? ` ${String(line.name)}` : "";
  return `${Number(line.quantity)} ${line.product === "other" ? String(line.name) : `${product?.label ?? String(line.product)}${named}`}${line.set_code ? `, ${String(line.set_code).toUpperCase()}` : ""}`;
}

/** A short description of an entry for the history. */
function describe(database: DatabaseSync, entry: Record<string, unknown>): string {
  const id = String(entry.id);
  if (entry.kind === "purchase") {
    const lines = database.prepare("SELECT * FROM purchase_lines WHERE entry_id = ? ORDER BY position").all(id);
    const singleLines = lines.filter((line) => line.product === "single");
    const singles = singleLines.reduce((sum, line) => sum + Number(line.quantity), 0);
    const parts = lines.filter((line) => line.product !== "single").map(lineLabel);
    if (singleLines.length === 1) parts.push(`${singles > 1 ? `${singles} ` : ""}${String(singleLines[0]!.name)}`);
    else if (singles) parts.push(`${singles} single cards`);
    return parts.slice(0, 3).join("; ") + (parts.length > 3 ? `; and ${parts.length - 3} more` : "");
  }
  const sales = database.prepare("SELECT what, quantity, name FROM purchase_sales WHERE entry_id = ?").all(id);
  const cards = sales.filter((sale) => sale.what === "card").reduce((sum, sale) => sum + Number(sale.quantity), 0);
  if (entry.kind === "trade") {
    const got = Number(database.prepare("SELECT COALESCE(SUM(quantity), 0) AS n FROM purchase_ties WHERE entry_id = ?").get(id)?.n ?? 0);
    return `Gave ${cards} ${cards === 1 ? "card" : "cards"}, got ${got}`;
  }
  if (entry.kind === "card_sale") return `${cards} ${cards === 1 ? "card" : "cards"} sold`;
  return sales.map((sale) => `${Number(sale.quantity)} ${String(sale.name)}`).slice(0, 3).join("; ");
}

/** Spent, Received, Value now and Gain or loss over entries (in one currency), with each entry's figures. */
export function purchaseSummary(database: DatabaseSync, userId: number, options: { currency?: string; from?: string | null; to?: string | null } = {}) {
  const held = heldByTie(database, userId);
  const currency = options.currency === "eur" ? "eur" : "usd";
  const entries = database.prepare(
    `SELECT * FROM purchase_entries WHERE user_id = ? AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?) ORDER BY date DESC, created_at DESC`,
  ).all(userId, options.from ?? null, options.from ?? null, options.to ?? null, options.to ?? null);
  const rows = entries.map((entry) => {
    const figures = entryFigures(database, entry, held);
    return {
      id: String(entry.id), kind: String(entry.kind), kindLabel: KIND_LABEL[String(entry.kind)], date: String(entry.date), place: String(entry.place),
      note: String(entry.note), currency: String(entry.currency), description: describe(database, entry), source: entry.source ? String(entry.source) : null,
      sets: [...new Set(figures.lines.map((line) => line.set_code).filter(Boolean).map(String))],
      products: [...new Set(figures.lines.map((line) => String(line.product)))],
      out: figures.out, in: figures.in, value: figures.value, gain: figures.gain, unpriced: figures.unpriced,
    };
  });
  const counted = rows.filter((row) => row.currency === currency);
  const sum = (pick: (row: (typeof rows)[number]) => number) => money(counted.reduce((total, row) => total + pick(row), 0));
  const spent = sum((row) => row.out);
  const received = sum((row) => row.in);
  const value = sum((row) => row.value);
  return {
    currency, entries: rows,
    summary: { spent, received, value, gain: money(received + value - spent), otherCurrency: rows.length - counted.length, unpriced: counted.reduce((total, row) => total + row.unpriced, 0) },
  };
}

// ---------- the chart: money spent and the value of what it bought, over time ----------

export function purchaseChart(database: DatabaseSync, userId: number, currency: "usd" | "eur") {
  const entries = database.prepare("SELECT * FROM purchase_entries WHERE user_id = ? AND currency = ? ORDER BY date").all(userId, currency);
  if (!entries.length) return { points: [], unpriced: 0 };
  const first = String(entries[0]!.date);
  const days: string[] = [];
  const start = Date.parse(first);
  const end = Date.parse(today());
  const step = Math.max(1, Math.ceil((end - start) / 86_400_000 / 60));
  for (let time = start; time < end; time += step * 86_400_000) days.push(new Date(time).toISOString().slice(0, 10));
  days.push(today());
  const held = heldByTie(database, userId);
  // spent per date
  const spentOn = entries.map((entry) => ({ date: String(entry.date), out: entryFigures(database, entry, held).out }));
  // the cards tied, with the day they came in and the day they left (sold), and the price history of each
  const ties = database.prepare(
    `SELECT t.*, e.date AS entry_date FROM purchase_ties t JOIN purchase_entries e ON e.id = t.entry_id WHERE t.user_id = ? AND e.currency = ? AND t.proxy = 0`,
  ).all(userId, currency);
  const sold = database.prepare(
    `SELECT s.*, e.date AS sale_date FROM purchase_sales s JOIN purchase_entries e ON e.id = s.entry_id WHERE e.user_id = ? AND s.what = 'card'`,
  ).all(userId);
  const column = currency === "eur" ? ["eur", "eur_foil", "eur_foil"] : ["usd", "usd_foil", "usd_etched"];
  const history = new Map<string, Array<{ day: string; prices: number[] }>>();
  const historyOf = (cardId: string) => {
    if (!history.has(cardId)) {
      // the main price source's history when it has one for the card (0.21.0), otherwise Scryfall's
      const store = storeOf(activeSource());
      const fromStore = store && currency === "usd"
        ? database.prepare("SELECT day, r, rf, re FROM store_price_history WHERE card_id = ? AND store = ? ORDER BY day").all(cardId, store.code)
          .map((row) => ({ day: String(row.day), prices: ["r", "rf", "re"].map((name) => Number(row[name] ?? NaN)) }))
        : [];
      history.set(cardId, fromStore.length ? fromStore : database.prepare(`SELECT day, ${column.join(", ")} FROM price_history WHERE card_id = ? ORDER BY day`).all(cardId)
        .map((row) => ({ day: String(row.day), prices: column.map((name) => Number(row[name] ?? NaN)) })));
    }
    return history.get(cardId)!;
  };
  const priceOn = (cardId: string, foil: number, day: string): number | null => {
    let found: number | null = null;
    for (const row of historyOf(cardId)) {
      if (row.day > day) break;
      const value = row.prices[Math.min(2, foil)]!;
      found = Number.isFinite(value) ? value : foil === 2 && Number.isFinite(row.prices[1]!) ? row.prices[1]! : null;
    }
    return found ?? (day === today() ? priceNow(database, cardId, foil, currency) : null);
  };
  const lines = database.prepare(
    `SELECT l.*, e.date AS entry_date, e.tax, e.shipping FROM purchase_lines l JOIN purchase_entries e ON e.id = l.entry_id
     WHERE e.user_id = ? AND e.currency = ? AND l.product != 'single'`,
  ).all(userId, currency);
  let unpriced = 0;
  const points = days.map((day) => {
    const spent = spentOn.filter((entry) => entry.date <= day).reduce((sum, entry) => sum + entry.out, 0);
    let value = 0;
    for (const tie of ties) {
      if (String(tie.entry_date) > day || String(tie.created_at).slice(0, 10) > day) continue;
      const left = Number(tie.quantity) - sold.filter((sale) => String(sale.sale_date) <= day && String(sale.source_entry_id) === String(tie.entry_id)
        && sale.card_id === tie.card_id && Number(sale.foil) === Number(tie.foil)).reduce((sum, sale) => sum + Number(sale.quantity), 0);
      const count = day === today() ? held.get(Number(tie.id)) ?? 0 : Math.max(0, left);
      if (!count) continue;
      const price = priceOn(String(tie.card_id), Number(tie.foil), day);
      if (price === null && day === today()) unpriced += count;
      value += count * (price ?? 0);
    }
    for (const line of lines) {
      if (String(line.entry_date) > day) continue;
      const set = database.prepare("SELECT value FROM purchase_values WHERE line_id = ? AND date <= ? ORDER BY date DESC LIMIT 1").get(String(line.id), day);
      const opened = Number(database.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM purchase_openings WHERE line_id = ? AND substr(created_at, 1, 10) <= ?").get(String(line.id), day)?.n ?? 0);
      const each = set ? Number(set.value) : Number(line.cost) / Number(line.quantity);
      const packs = Number(line.packs);
      // openings of products with packs count packs (0.19.0)
      const sealed = packs > 0
        ? Math.max(0, Number(line.quantity) * packs - opened - (day === today() ? Number(line.sold) * packs : 0)) / packs
        : Math.max(0, Number(line.quantity) - opened - (day === today() ? Number(line.sold) : 0));
      value += sealed * each;
    }
    return { date: day, spent: money(spent), value: money(value) };
  });
  return { points, unpriced };
}

// ---------- one entry in full ----------

export function purchaseEntry(database: DatabaseSync, userId: number, id: string) {
  const entry = database.prepare("SELECT * FROM purchase_entries WHERE id = ? AND user_id = ?").get(id, userId);
  if (!entry) return null;
  const figures = entryFigures(database, entry, heldByTie(database, userId));
  // where the copies no longer held went (0.18.0): sold, traded, or gone (removed from the collection); oldest ties first
  const left = new Map<string, { sold: number; traded: number; income: number; count: number }>();
  for (const row of database.prepare(
    `SELECT e.kind, s.card_id, s.foil, SUM(s.quantity) AS n, SUM(s.price) AS income FROM purchase_sales s JOIN purchase_entries e ON e.id = s.entry_id
     WHERE s.source_entry_id = ? AND s.what = 'card' GROUP BY e.kind, s.card_id, s.foil`,
  ).all(id)) {
    const key = `${String(row.card_id)}|${Number(row.foil ?? 0)}`;
    const pool = left.get(key) ?? { sold: 0, traded: 0, income: 0, count: 0 };
    if (row.kind === "trade") pool.traded += Number(row.n);
    else pool.sold += Number(row.n);
    // what the cards brought in, as an average per card, for the gain or loss of each pack (0.19.0)
    pool.income += Number(row.income ?? 0);
    pool.count += Number(row.n);
    left.set(key, pool);
  }
  const outs = new Map<number, { sold: number; traded: number; gone: number; soldFor: number }>();
  for (const tie of figures.ties) {
    let gone = Math.max(0, Number(tie.quantity) - tie.held);
    const pool = left.get(`${String(tie.card_id)}|${Number(tie.foil)}`) ?? { sold: 0, traded: 0, income: 0, count: 0 };
    const sold = Math.min(gone, pool.sold);
    pool.sold -= sold;
    gone -= sold;
    const traded = Math.min(gone, pool.traded);
    pool.traded -= traded;
    gone -= traded;
    outs.set(Number(tie.id), { sold, traded, gone, soldFor: pool.count ? money((sold + traded) * pool.income / pool.count) : 0 });
  }
  const outOf = (tie: Record<string, unknown>) => {
    const out = outs.get(Number(tie.id)) ?? { sold: 0, traded: 0, gone: 0, soldFor: 0 };
    return { sold: out.sold, traded: out.traded, gone: out.gone };
  };
  // booster contents (0.21.0): expected value per pack and the pull check of each line
  const values = new Map<string, ReturnType<typeof lineValue>>();
  const valueOf = (line: Record<string, unknown>) => {
    const key = String(line.id);
    if (!values.has(key)) values.set(key, lineValue(database, line, activeSource()));
    return values.get(key)!;
  };
  const checks = new Map<string, { allowed: Map<string, Set<number>>; label: string } | null>();
  const checkOf = (lineId: string | null) => {
    if (!lineId) return null;
    if (!checks.has(lineId)) {
      const line = figures.lines.find((item) => item.id === lineId);
      const booster = line && BOOSTER_PRODUCTS.has(String(line.product)) ? lineBooster(database, line) : null;
      const allowed = booster ? pullsAllowed(database, booster.setCode, booster.name) : null;
      if (allowed && line?.sealed_id) {
        // cards a product holds besides its packs (a bundle's promo card)
        try {
          const contents = JSON.parse(String(database.prepare("SELECT contents FROM sealed_products WHERE id = ?").get(String(line.sealed_id))?.contents ?? "null")) as { card?: Array<{ uuid?: unknown; foil?: unknown }> } | null;
          for (const card of contents?.card ?? []) {
            const cardId = database.prepare("SELECT card_id FROM mtgjson_records WHERE uuid = ?").get(String(card.uuid ?? ""))?.card_id;
            if (typeof cardId === "string") allowed.set(cardId, new Set([...(allowed.get(cardId) ?? []), card.foil ? 1 : 0, card.foil ? 2 : 0]));
          }
        } catch {
          // no contents saved
        }
      }
      const setName = String(database.prepare("SELECT name FROM sets WHERE code = ?").get(String(booster?.setCode ?? ""))?.name ?? booster?.setCode?.toUpperCase() ?? "");
      checks.set(lineId, allowed && booster ? { allowed, label: `${boosterLabel(booster.name)}, ${setName}` } : null);
    }
    return checks.get(lineId)!;
  };
  const openingLine = new Map(database.prepare("SELECT id, line_id FROM purchase_openings WHERE entry_id = ?").all(id).map((row) => [String(row.id), String(row.line_id)]));
  const warningOf = (tie: Record<string, unknown>): string | null => {
    if (!tie.opening_id) return null;
    const check = checkOf(openingLine.get(String(tie.opening_id)) ?? null);
    if (!check) return null;
    const finishes = check.allowed.get(String(tie.card_id));
    return finishes && finishes.has(Number(tie.foil)) ? null : `Not found in ${check.label}`;
  };
  const openings = database.prepare("SELECT * FROM purchase_openings WHERE entry_id = ? ORDER BY created_at, pack_number").all(id).map((opening) => {
    const ties = figures.ties.filter((tie) => tie.opening_id === opening.id);
    // Pulled value: every pull at today's price, owned or not; Value now: the pulls still held; Value when pulled: fixed
    const pulled = ties.reduce((sum, tie) => sum + Number(tie.quantity) * (Number(tie.price ?? 0)), 0);
    const now = ties.reduce((sum, tie) => sum + tie.held * (Number(tie.price ?? 0)), 0);
    const then = ties.reduce((sum, tie) => sum + Number(tie.quantity) * Number(tie.value_then ?? 0), 0);
    const thenUnpriced = ties.filter((tie) => tie.value_then === null || tie.value_then === undefined).reduce((sum, tie) => sum + Number(tie.quantity), 0);
    const line = figures.lines.find((item) => item.id === opening.line_id);
    // count is in packs for products with packs (0.19.0), in units for the others
    const packs = Number(opening.count);
    const linePacks = Number(line?.packs ?? 0);
    const packCost = line ? money(Number(line.full) / Math.max(1, Number(line.quantity) * (linePacks > 0 ? linePacks : 1)) * packs) : 0;
    const soldFor = money(ties.reduce((sum, tie) => sum + (outs.get(Number(tie.id))?.soldFor ?? 0), 0));
    // expected value of the opening's packs (0.21.0), stored the first time it is worked out and kept after that
    let ev = opening.ev === null || opening.ev === undefined ? null : Number(opening.ev);
    if (ev === null && line) {
      const value = valueOf(line);
      if (value) {
        ev = money(value.perPack * (linePacks > 0 ? packs : packs * 1));
        database.prepare("UPDATE purchase_openings SET ev = ? WHERE id = ?").run(ev, String(opening.id));
      }
    }
    return {
      ev,
      id: String(opening.id), lineId: String(opening.line_id), count: Number(opening.count), name: String(opening.name), collectionId: opening.collection_id ? String(opening.collection_id) : null,
      active: Number(opening.active) === 1, createdAt: String(opening.created_at), doneAt: opening.done_at ? String(opening.done_at) : null,
      cards: ties.reduce((sum, tie) => sum + Number(tie.quantity), 0), valuePulled: money(pulled), perPack: money(pulled / packs), packs,
      valueNow: money(now), valueWhenPulled: money(then), whenPulledUnpriced: thenUnpriced,
      gone: ties.reduce((sum, tie) => sum + Math.max(0, Number(tie.quantity) - tie.held), 0),
      packNumber: opening.pack_number === null || opening.pack_number === undefined ? null : Number(opening.pack_number),
      groupId: opening.group_id ? String(opening.group_id) : null, waiting: Number(opening.waiting ?? 0) === 1,
      packCost, soldFor, gain: money(now + soldFor - packCost),
    };
  });
  return {
    id: String(entry.id), kind: String(entry.kind), kindLabel: KIND_LABEL[String(entry.kind)], date: String(entry.date), place: String(entry.place), note: String(entry.note),
    placeId: entry.place_id ? String(entry.place_id) : null, shippingBy: entry.shipping_by === "buyer" ? "buyer" : "me", trade: figures.trade,
    receipt: receiptInfo(database, String(entry.id)),
    currency: String(entry.currency), tax: Number(entry.tax), shipping: Number(entry.shipping), fees: Number(entry.fees), cashOut: Number(entry.cash_out), cashIn: Number(entry.cash_in),
    tradeId: entry.trade_id ? String(entry.trade_id) : null, source: entry.source ? String(entry.source) : null, description: describe(database, entry),
    out: figures.out, in: figures.in, value: figures.value, gain: figures.gain, unpriced: figures.unpriced, pulledIncome: figures.pulledIncome,
    lines: figures.lines.map((line) => ({
      id: String(line.id), product: String(line.product), productLabel: line.product === "other" ? String(line.name) : PRODUCTS[String(line.product)]?.label ?? String(line.product),
      name: String(line.name), setCode: line.set_code ? String(line.set_code) : null,
      setName: line.set_code ? String(database.prepare("SELECT name FROM sets WHERE code = ?").get(String(line.set_code))?.name ?? String(line.set_code).toUpperCase()) : null,
      quantity: Number(line.quantity), cost: Number(line.cost), full: line.full,
      sealedId: line.sealed_id ? String(line.sealed_id) : null,
      // expected value (0.21.0): per pack, and for the whole line (packs of each unit, or one pack for a single booster)
      ...(() => {
        const value = valueOf(line);
        if (!value) return { ev: null, evLine: null, evLabel: null };
        const perUnit = Number(line.packs) > 0 ? Number(line.packs) : String(line.product).endsWith("_booster") ? 1 : 0;
        return { ev: value.perPack, evLine: perUnit ? money(value.perPack * perUnit * Number(line.quantity)) : null, evLabel: value.label };
      })(),
      hasDeck: !!line.sealed_id && !!database.prepare("SELECT 1 FROM sealed_products WHERE id = ? AND deck_name IS NOT NULL").get(String(line.sealed_id)),
      packs: Number(line.packs), opened: Number(line.opened), sold: Number(line.sold), sealed: line.sealed, sealedValue: line.sealedValue, valueDate: line.valueDate,
      packsOpened: Number(line.packs_opened ?? 0), packsLeft: Number(line.packs) > 0 ? packsLeft(line) : line.sealed,
      cardId: line.card_id ? String(line.card_id) : null, foil: line.foil === null ? null : Number(line.foil), condition: line.condition ? String(line.condition) : null,
      language: line.language ? String(line.language) : null, collectionId: line.collection_id ? String(line.collection_id) : null,
      values: database.prepare("SELECT date, value FROM purchase_values WHERE line_id = ? ORDER BY date").all(String(line.id)).map((row) => ({ date: String(row.date), value: Number(row.value) })),
    })),
    sales: database.prepare("SELECT s.*, c.set_code FROM purchase_sales s LEFT JOIN cards c ON c.id = s.card_id WHERE s.entry_id = ? ORDER BY s.position").all(id).map((sale) => ({
      id: String(sale.id), what: String(sale.what), cardId: sale.card_id ? String(sale.card_id) : null, name: String(sale.name), setCode: sale.set_code ? String(sale.set_code) : null,
      foil: sale.foil === null ? null : Number(sale.foil), condition: sale.condition ? String(sale.condition) : null, language: sale.language ? String(sale.language) : null,
      proxy: Number(sale.proxy ?? 0) === 1, collectionId: sale.collection_id ? String(sale.collection_id) : null, quantity: Number(sale.quantity), price: Number(sale.price),
      sourceEntryId: sale.source_entry_id ? String(sale.source_entry_id) : null, sourceLineId: sale.source_line_id ? String(sale.source_line_id) : null,
    })),
    ties: figures.ties.map((tie) => ({
      id: Number(tie.id), cardId: String(tie.card_id), name: String(tie.name ?? tie.card_id), setCode: String(tie.set_code ?? ""), collectorNumber: String(tie.collector_number ?? ""),
      imageUrl: tie.image_url ? String(tie.image_url) : null, foil: Number(tie.foil), condition: String(tie.condition), language: String(tie.language), proxy: Number(tie.proxy) === 1,
      collectionId: String(tie.collection_id), quantity: Number(tie.quantity), held: tie.held, price: tie.price, lineId: tie.line_id ? String(tie.line_id) : null,
      openingId: tie.opening_id ? String(tie.opening_id) : null, tradePrice: tie.trade_price === null || tie.trade_price === undefined ? null : Number(tie.trade_price),
      valueThen: tie.value_then === null || tie.value_then === undefined ? null : Number(tie.value_then),
      warning: warningOf(tie),
      ...outOf(tie),
    })),
    openings,
  };
}

function receiptInfo(database: DatabaseSync, entryId: string) {
  const row = database.prepare("SELECT name, type, length(data) AS bytes, added_at FROM purchase_receipts WHERE entry_id = ?").get(entryId);
  return row ? { name: String(row.name), type: String(row.type), bytes: Number(row.bytes), addedAt: String(row.added_at) } : null;
}

// ---------- the whole entry as kept, for undo of a delete and for backups ----------

const TABLES = ["purchase_lines", "purchase_sales", "purchase_openings", "purchase_ties"] as const;

export function entrySnapshot(database: DatabaseSync, id: string) {
  const entry = database.prepare("SELECT * FROM purchase_entries WHERE id = ?").get(id);
  if (!entry) return null;
  const lines = database.prepare("SELECT * FROM purchase_lines WHERE entry_id = ?").all(id);
  return {
    entry,
    purchase_lines: lines,
    purchase_sales: database.prepare("SELECT * FROM purchase_sales WHERE entry_id = ?").all(id),
    purchase_openings: database.prepare("SELECT * FROM purchase_openings WHERE entry_id = ?").all(id),
    purchase_ties: database.prepare("SELECT * FROM purchase_ties WHERE entry_id = ?").all(id),
    purchase_values: lines.flatMap((line) => database.prepare("SELECT * FROM purchase_values WHERE line_id = ?").all(String(line.id))),
    purchase_receipts: database.prepare("SELECT entry_id, name, type, data, added_at FROM purchase_receipts WHERE entry_id = ?").all(id)
      .map((row) => ({ ...row, data: Buffer.from(row.data as Uint8Array).toString("base64") })),
  };
}
export type EntrySnapshot = NonNullable<ReturnType<typeof entrySnapshot>>;

const COLUMNS: Record<string, string[]> = {
  purchase_entries: ["id", "user_id", "kind", "date", "place", "place_id", "note", "currency", "tax", "shipping", "shipping_by", "fees", "cash_out", "cash_in", "trade_id", "source", "created_at"],
  purchase_lines: ["id", "entry_id", "position", "product", "name", "set_code", "quantity", "cost", "packs", "opened", "sold", "card_id", "foil", "condition", "language", "collection_id", "packs_opened"],
  purchase_sales: ["id", "entry_id", "position", "what", "card_id", "foil", "condition", "language", "proxy", "collection_id", "name", "quantity", "price", "source_entry_id", "source_line_id"],
  purchase_openings: ["id", "user_id", "entry_id", "line_id", "count", "name", "collection_id", "active", "created_at", "done_at", "pack_number", "group_id", "waiting", "ev"],
  purchase_ties: ["user_id", "entry_id", "line_id", "opening_id", "collection_id", "card_id", "foil", "condition", "language", "proxy", "quantity", "price", "created_at", "value_then"],
  purchase_values: ["line_id", "date", "value"],
  purchase_receipts: ["entry_id", "name", "type", "data", "added_at"],
};

const cell = (value: unknown) => (value === undefined ? null : value as string | number | null);

/** Puts an entry back as it was kept (undo of a delete, restoring a backup). The user id is the caller's. */
export function restoreSnapshot(database: DatabaseSync, userId: number, snapshot: EntrySnapshot): void {
  const insert = (table: string, row: Record<string, unknown>) => {
    const columns = COLUMNS[table]!;
    const values = columns.map((column) => {
      if (column === "user_id") return userId;
      if (table === "purchase_receipts" && column === "data") return Buffer.from(String(row.data ?? ""), "base64");
      if (table === "purchase_entries" && column === "shipping_by") return row.shipping_by === "buyer" ? "buyer" : "me";
      if (table === "purchase_entries" && column === "currency") return "usd";
      return cell(row[column]);
    });
    database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...values as Array<string | number | null | Buffer>);
  };
  // the place follows by name, so a backup from another server joins the places here
  const entry = { ...snapshot.entry } as Record<string, unknown>;
  const known = entry.place_id ? database.prepare("SELECT name FROM places WHERE id = ?").get(String(entry.place_id)) : null;
  entry.place_id = known ? String(entry.place_id) : placeFor(database, String(entry.place ?? ""), userId);
  entry.place = placeName(database, entry.place_id as string | null);
  insert("purchase_entries", entry);
  for (const table of [...TABLES, "purchase_values", "purchase_receipts"] as const) for (const row of (snapshot as unknown as Record<string, Array<Record<string, unknown>>>)[table] ?? []) insert(table, row);
}

function readSnapshot(value: unknown): EntrySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  if (!snapshot.entry || typeof snapshot.entry !== "object") return null;
  const entry = snapshot.entry as Record<string, unknown>;
  if (typeof entry.id !== "string" || !ENTRY_KINDS.includes(entry.kind as EntryKind) || !readDate(entry.date)) return null;
  for (const table of [...TABLES, "purchase_values", "purchase_receipts"]) if (snapshot[table] !== undefined && !Array.isArray(snapshot[table])) return null;
  return snapshot as unknown as EntrySnapshot;
}

// ---------- writing entries ----------

function insertEntry(database: DatabaseSync, userId: number, kind: EntryKind, header: Header, extra: { tradeId?: string; source?: string } = {}): string {
  const id = randomUUID();
  database.prepare(
    `INSERT INTO purchase_entries (id, user_id, kind, date, place, place_id, note, currency, tax, shipping, shipping_by, fees, cash_out, cash_in, trade_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, kind, header.date, header.place, header.placeId, header.note, "usd", header.tax, header.shipping, header.shippingBy, header.fees, header.cashOut, header.cashIn,
    extra.tradeId ?? null, extra.source ?? null);
  return id;
}

/** The sealed product of a line (0.20.0), checked again whenever the line is saved. */
function setSealed(database: DatabaseSync, lineId: string): void {
  const line = database.prepare("SELECT product, name, set_code FROM purchase_lines WHERE id = ?").get(lineId);
  if (!line) return;
  const found = matchSealed(database, { setCode: line.set_code ? String(line.set_code) : null, product: String(line.product), name: String(line.name) });
  database.prepare("UPDATE purchase_lines SET sealed_id = ? WHERE id = ?").run(found?.id ?? null, lineId);
}

function insertLine(database: DatabaseSync, entryId: string, position: number, line: LineInput): string {
  const id = line.id && !database.prepare("SELECT 1 FROM purchase_lines WHERE id = ?").get(line.id) ? line.id : randomUUID();
  const single = line.single;
  const name = single ? String(database.prepare("SELECT name FROM cards WHERE id = ?").get(single.key.cardId)?.name ?? line.name) : line.name;
  database.prepare(
    `INSERT INTO purchase_lines (id, entry_id, position, product, name, set_code, quantity, cost, packs, card_id, foil, condition, language, collection_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, entryId, position, line.product, name, single ? String(database.prepare("SELECT set_code FROM cards WHERE id = ?").get(single.key.cardId)?.set_code ?? "") || null : line.setCode,
    line.quantity, line.cost, line.packs, single?.key.cardId ?? null, single?.key.foil ?? null, single?.key.condition ?? null, single?.key.language ?? null, single?.collectionId ?? null);
  setSealed(database, id);
  return id;
}

function insertTie(database: DatabaseSync, userId: number, entryId: string, place: { lineId?: string | null; openingId?: string | null }, collectionId: string, key: CopyKey, quantity: number, price: number | null = null): void {
  database.prepare(
    `INSERT INTO purchase_ties (user_id, entry_id, line_id, opening_id, collection_id, card_id, foil, condition, language, proxy, quantity, price, value_then) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, entryId, place.lineId ?? null, place.openingId ?? null, collectionId, ...keyValues(key), quantity, price, priceNow(database, key.cardId, key.foil));
}

/** The purchase a copy came from: the newest tie of the same copy in the same collection. */
function sourceOf(database: DatabaseSync, userId: number, collectionId: string, key: CopyKey): string | null {
  const row = database.prepare(`SELECT entry_id FROM purchase_ties WHERE user_id = ? AND collection_id = ? AND ${KEY} ORDER BY id DESC LIMIT 1`).get(userId, collectionId, ...keyValues(key));
  return row ? String(row.entry_id) : null;
}

/** Undoes what an entry did to collections when it is deleted: sold copies go back. */
function undoEffects(database: DatabaseSync, id: string): void {
  for (const sale of database.prepare("SELECT * FROM purchase_sales WHERE entry_id = ?").all(id)) {
    if (sale.what === "card" && sale.collection_id && database.prepare("SELECT 1 FROM collections WHERE id = ?").get(String(sale.collection_id))) {
      putCopies(database, String(sale.collection_id), keyOfRow(sale), Number(sale.quantity));
    }
    if (sale.what === "product" && sale.source_line_id) {
      database.prepare("UPDATE purchase_lines SET sold = MAX(0, sold - ?) WHERE id = ?").run(Number(sale.quantity), String(sale.source_line_id));
    }
  }
}

/** Does again what a restored entry did: sold copies leave their collections again. */
function redoEffects(database: DatabaseSync, snapshot: EntrySnapshot): void {
  for (const sale of snapshot.purchase_sales ?? []) {
    if (sale.what === "card" && sale.collection_id) takeCopies(database, String(sale.collection_id), keyOfRow(sale), Number(sale.quantity));
    if (sale.what === "product" && sale.source_line_id) database.prepare("UPDATE purchase_lines SET sold = sold + ? WHERE id = ?").run(Number(sale.quantity), String(sale.source_line_id));
  }
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

/** Creates purchases from copies that have a purchase price but no purchase: one for all, or one per date added. */
export function purchasesFromPrices(database: DatabaseSync, userId: number, mode: "one" | "date", options: {
  collectionId?: string; items?: Array<CopyChange & { price: number | null; currency: string | null; added: string | null }>; source: string;
}): string[] {
  type Item = { collectionId: string; key: CopyKey; quantity: number; price: number; currency: string; added: string };
  let items: Item[];
  if (options.items) {
    items = options.items.filter((item) => item.price !== null && item.price > 0).map((item) => ({
      collectionId: options.collectionId!, key: item.key, quantity: item.quantity, price: item.price!, currency: item.currency === "EUR" || item.currency === "eur" ? "eur" : "usd",
      added: (item.added ?? new Date().toISOString()).slice(0, 10),
    }));
  } else {
    const held = heldByTie(database, userId);
    const tied = new Map<string, number>();
    for (const tie of database.prepare("SELECT * FROM purchase_ties WHERE user_id = ?").all(userId)) {
      const id = `${String(tie.collection_id)}|${String(tie.card_id)}|${String(tie.foil)}|${String(tie.condition)}|${String(tie.language)}|${String(tie.proxy)}`;
      tied.set(id, (tied.get(id) ?? 0) + (held.get(Number(tie.id)) ?? 0));
    }
    items = database.prepare(
      `SELECT i.* FROM collection_cards i JOIN collections c ON c.id = i.collection_id
       WHERE c.owner_id = ? AND c.kind != 'wishlist' AND i.purchase_price > 0 AND i.proxy = 0 AND (? IS NULL OR i.collection_id = ?)`,
    ).all(userId, options.collectionId ?? null, options.collectionId ?? null).flatMap((row) => {
      const id = `${String(row.collection_id)}|${String(row.card_id)}|${String(row.foil)}|${String(row.condition)}|${String(row.language)}|${String(row.proxy)}`;
      const quantity = Number(row.quantity) - (tied.get(id) ?? 0);
      return quantity > 0 ? [{
        collectionId: String(row.collection_id), key: keyOfRow(row), quantity, price: Number(row.purchase_price),
        currency: String(row.price_currency ?? "usd").toLowerCase() === "eur" ? "eur" : "usd", added: String(row.added_at ?? new Date().toISOString()).slice(0, 10),
      }] : [];
    });
  }
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const id = `${mode === "date" ? item.added : "all"}|${item.currency}`;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  const created: string[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    const date = mode === "date" ? first.added : group.reduce((latest, item) => (item.added > latest ? item.added : latest), first.added);
    const entryId = insertEntry(database, userId, "purchase", {
      date, place: placeName(database, placeFor(database, options.source, userId)), placeId: placeFor(database, options.source, userId), note: "", currency: "usd",
      tax: 0, shipping: 0, fees: 0, cashOut: 0, cashIn: 0, shippingBy: "me",
    }, { source: options.source });
    group.forEach((item, position) => {
      const lineId = insertLine(database, entryId, position, { product: "single", name: "", setCode: null, quantity: item.quantity, cost: money(item.price * item.quantity), packs: 0, single: { key: item.key, collectionId: item.collectionId } });
      insertTie(database, userId, entryId, { lineId }, item.collectionId, item.key, item.quantity);
    });
    created.push(entryId);
  }
  return created;
}

// ---------- CSV ----------

const csvCell = (value: unknown) => {
  const textValue = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
};
const csv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";

// ---------- routes ----------

export function registerPurchaseRoutes(app: FastifyInstance, database: DatabaseSync, ocrFolder = "", fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch) {
  const userOf = (request: FastifyRequest) => request.user!.id;
  const fail = (reply: FastifyReply, error: unknown, fallback: string) => reply.code(400).send({ error: error instanceof Error ? error.message : fallback });
  const own = (request: FastifyRequest<{ Params: { entryId: string } }>) =>
    database.prepare("SELECT * FROM purchase_entries WHERE id = ? AND user_id = ?").get(request.params.entryId, userOf(request));
  const missing = (reply: FastifyReply) => reply.code(404).send({ error: "That entry is not in your purchase history" });
  const validPrecon = (value: unknown): value is { code: string; name: string } =>
    !!value && typeof value === "object" && "code" in value && typeof value.code === "string" && !!value.code
    && "name" in value && typeof value.name === "string" && !!value.name;
  const selectedPrecon = (precon: { code: string; name: string }) =>
    database.prepare("SELECT 1 FROM sealed_decks WHERE code = ? AND name = ?").get(precon.code, precon.name)
      ? preconDeckCards(database, precon.code, precon.name, fetcher) : Promise.resolve(null);
  const addDeckCopies = (
    deck: NonNullable<Awaited<ReturnType<typeof preconDeckCards>>>, multiplier: number, collectionId: string,
    userId: number, entryId: string, lineId: string, openingId: string,
  ) => {
    const ids: number[] = [];
    for (const card of deck.cards) {
      const quantity = card.quantity * multiplier;
      if (heldQuantity(database, collectionId, card.key) + quantity > 10_000) throw new Error("Adding the deck would exceed 10,000 copies of a card");
      putCopies(database, collectionId, card.key, quantity);
      insertTie(database, userId, entryId, { lineId, openingId }, collectionId, card.key, quantity);
      ids.push(Number(database.prepare("SELECT last_insert_rowid() AS id").get()!.id));
    }
    return ids;
  };

  app.get<{ Querystring: { currency?: string; from?: string; to?: string } }>("/api/purchases", async (request) => {
    const userId = userOf(request);
    const result = purchaseSummary(database, userId, { currency: request.query.currency, from: readDate(request.query.from), to: readDate(request.query.to) });
    return {
      ...result,
      places: listPlaces(database, userId),
      activeOpening: activeOpeningOf(database, userId),
      products: Object.entries(PRODUCTS).map(([id, product]) => ({ id, ...product })),
    };
  });

  app.get<{ Querystring: { currency?: string } }>("/api/purchases/chart", async (request) => purchaseChart(database, userOf(request), request.query.currency === "eur" ? "eur" : "usd"));

  app.get<{ Params: { entryId: string } }>("/api/purchases/:entryId", async (request, reply) => purchaseEntry(database, userOf(request), request.params.entryId) ?? missing(reply));

  // a new entry: a purchase with its lines, a card sale, a product sale or a trade recorded by hand
  app.post<{ Body: Record<string, unknown> }>("/api/purchases", async (request, reply) => {
    const userId = userOf(request);
    const body = request.body ?? {};
    const kind = String(body.kind ?? "purchase") as EntryKind;
    if (!ENTRY_KINDS.includes(kind)) return reply.code(400).send({ error: "Choose Purchase, Card sale, Product sale or Trade" });
    const header = readHeader(database, userId, body);
    if (typeof header === "string") return reply.code(400).send({ error: header });
    try {
      const id = transaction(database, () => {
        const entryId = insertEntry(database, userId, kind, header);
        if (kind === "purchase") {
          const lines = readLines(body.lines);
          if (typeof lines === "string") throw new Error(lines);
          lines.forEach((line, position) => {
            if (line.single && !ownCollection(database, line.single.collectionId, userId)) throw new Error("Choose one of your collections for the single cards");
            if (line.single && !database.prepare("SELECT 1 FROM cards WHERE id = ?").get(line.single.key.cardId)) throw new Error("Card printing not found");
            const lineId = insertLine(database, entryId, position, line);
            if (line.single) {
              putCopies(database, line.single.collectionId, line.single.key, line.quantity, money(line.cost / line.quantity), header.currency);
              insertTie(database, userId, entryId, { lineId }, line.single.collectionId, line.single.key, line.quantity);
            }
          });
        } else if (kind === "card_sale" || kind === "trade") {
          const sales = Array.isArray(body.sales) ? body.sales as Array<Record<string, unknown>> : [];
          if (kind === "card_sale" && !sales.length) throw new Error("Choose the copies sold");
          sales.forEach((sale, position) => {
            const key = readCopyKey(sale);
            const quantity = count(sale.quantity, 10_000);
            const price = amount(sale.price);
            if (!key || !quantity || price === null || !ownCollection(database, sale.collectionId, userId)) throw new Error("Each copy sold needs its collection, a count and a price");
            const collectionId = String(sale.collectionId);
            const source = sourceOf(database, userId, collectionId, key);
            takeCopies(database, collectionId, key, quantity);
            database.prepare(
              `INSERT INTO purchase_sales (id, entry_id, position, what, card_id, foil, condition, language, proxy, collection_id, name, quantity, price, source_entry_id)
               VALUES (?, ?, ?, 'card', ?, ?, ?, ?, ?, ?, (SELECT name FROM cards WHERE id = ?), ?, ?, ?)`,
            ).run(randomUUID(), entryId, position, ...keyValues(key), collectionId, key.cardId, quantity, price, source);
          });
        } else {
          const sales = Array.isArray(body.sales) ? body.sales as Array<Record<string, unknown>> : [];
          if (!sales.length) throw new Error("Choose the sealed product sold");
          sales.forEach((sale, position) => {
            const line = database.prepare("SELECT l.* FROM purchase_lines l JOIN purchase_entries e ON e.id = l.entry_id WHERE l.id = ? AND e.user_id = ?").get(String(sale.lineId ?? ""), userId);
            const quantity = count(sale.quantity, 10_000);
            const price = amount(sale.price);
            if (!line || !quantity || price === null) throw new Error("Each product sold needs a sealed line, a count and a price");
            const sealed = Number(line.quantity) - Number(line.opened) - Number(line.sold);
            if (quantity > sealed) throw new Error(`${lineLabel(line)}: only ${sealed} still sealed`);
            database.prepare("UPDATE purchase_lines SET sold = sold + ? WHERE id = ?").run(quantity, String(line.id));
            database.prepare(
              `INSERT INTO purchase_sales (id, entry_id, position, what, name, quantity, price, source_entry_id, source_line_id) VALUES (?, ?, ?, 'product', ?, ?, ?, ?, ?)`,
            ).run(randomUUID(), entryId, position, lineLabel({ ...line, quantity }).replace(/^\d+ /, ""), quantity, price, String(line.entry_id), String(line.id));
          });
        }
        return entryId;
      });
      return reply.code(201).send(purchaseEntry(database, userId, id));
    } catch (error) {
      return fail(reply, error, "Could not save the entry");
    }
  });

  // changes the date, place, note, amounts and (for purchases) the lines; lines with an id keep their openings and ties
  app.patch<{ Params: { entryId: string }; Body: Record<string, unknown> }>("/api/purchases/:entryId", async (request, reply) => {
    const userId = userOf(request);
    const entry = own(request);
    if (!entry) return missing(reply);
    const base: Header = {
      date: String(entry.date), place: String(entry.place), placeId: entry.place_id ? String(entry.place_id) : null, note: String(entry.note), currency: "usd", tax: Number(entry.tax),
      shipping: Number(entry.shipping), fees: Number(entry.fees), cashOut: Number(entry.cash_out), cashIn: Number(entry.cash_in), shippingBy: entry.shipping_by === "buyer" ? "buyer" : "me",
    };
    const header = readHeader(database, userId, request.body ?? {}, base);
    if (typeof header === "string") return reply.code(400).send({ error: header });
    try {
      transaction(database, () => {
        database.prepare("UPDATE purchase_entries SET date = ?, place = ?, place_id = ?, note = ?, currency = 'usd', tax = ?, shipping = ?, shipping_by = ?, fees = ?, cash_out = ?, cash_in = ? WHERE id = ?")
          .run(header.date, header.place, header.placeId, header.note, header.tax, header.shipping, header.shippingBy, header.fees, header.cashOut, header.cashIn, String(entry.id));
        if (entry.kind === "purchase" && request.body?.lines !== undefined) {
          const lines = readLines(request.body.lines);
          if (typeof lines === "string") throw new Error(lines);
          const existing = new Map(database.prepare("SELECT * FROM purchase_lines WHERE entry_id = ?").all(String(entry.id)).map((line) => [String(line.id), line]));
          const kept = new Set<string>();
          lines.forEach((line, position) => {
            const old = line.id ? existing.get(line.id) : undefined;
            if (old) {
              if (line.quantity < Number(old.opened) + Number(old.sold)) throw new Error(`${lineLabel(old)}: ${Number(old.opened) + Number(old.sold)} are opened or sold`);
              database.prepare("UPDATE purchase_lines SET position = ?, product = ?, name = ?, set_code = ?, quantity = ?, cost = ?, packs = ? WHERE id = ?")
                .run(position, old.product === "single" ? "single" : line.product, old.product === "single" ? String(old.name) : line.name, old.product === "single" ? old.set_code as string | null : line.setCode,
                  line.quantity, line.cost, line.packs, String(old.id));
              setSealed(database, String(old.id));
              kept.add(String(old.id));
            } else {
              if (line.single) throw new Error("Single cards are added as a new purchase");
              insertLine(database, String(entry.id), position, line);
            }
          });
          for (const [id, old] of existing) {
            if (kept.has(id)) continue;
            if (Number(old.opened) || Number(old.sold)) throw new Error(`${lineLabel(old)} has openings or sales and cannot be removed`);
            database.prepare("DELETE FROM purchase_ties WHERE line_id = ?").run(id);
            database.prepare("DELETE FROM purchase_lines WHERE id = ?").run(id);
          }
        }
      });
      return purchaseEntry(database, userId, String(entry.id));
    } catch (error) {
      return fail(reply, error, "Could not save the entry");
    }
  });

  // deletes an entry and returns it as it was, so it can be put back (undo); sold copies go back to their collections
  app.delete<{ Params: { entryId: string } }>("/api/purchases/:entryId", async (request, reply) => {
    const entry = own(request);
    if (!entry) return missing(reply);
    const snapshot = entrySnapshot(database, String(entry.id))!;
    transaction(database, () => {
      undoEffects(database, String(entry.id));
      database.prepare("DELETE FROM purchase_entries WHERE id = ?").run(String(entry.id));
    });
    return { snapshot };
  });

  app.post<{ Body: { snapshot?: unknown } }>("/api/purchases/restore", async (request, reply) => {
    const userId = userOf(request);
    const snapshot = readSnapshot(request.body?.snapshot);
    if (!snapshot) return reply.code(400).send({ error: "That entry cannot be put back" });
    if (database.prepare("SELECT 1 FROM purchase_entries WHERE id = ?").get(String(snapshot.entry.id))) return reply.code(409).send({ error: "That entry is already in your purchase history" });
    try {
      transaction(database, () => {
        redoEffects(database, snapshot);
        restoreSnapshot(database, userId, snapshot);
      });
      return reply.code(201).send(purchaseEntry(database, userId, String(snapshot.entry.id)));
    } catch (error) {
      return fail(reply, error, "Could not put the entry back");
    }
  });

  // opens part of a product line. A product with packs (0.19.0) opens a number of packs, each its own opening: the first
  // is where pulled cards are tied, the others wait in order for Next pack. A product without packs opens as one opening.
  // A named deck with a decklist (0.20.0) adds its cards and ties them to the opening in one step, unless decklist is false.
  app.post<{ Params: { entryId: string; lineId: string }; Body: { count?: unknown; collectionId?: unknown; decklist?: unknown; precon?: unknown } }>("/api/purchases/:entryId/lines/:lineId/open", async (request, reply) => {
    const userId = userOf(request);
    const entry = own(request);
    if (!entry) return missing(reply);
    const line = database.prepare("SELECT * FROM purchase_lines WHERE id = ? AND entry_id = ?").get(request.params.lineId, String(entry.id));
    if (!line || line.product === "single") return reply.code(404).send({ error: "Choose a product line to open" });
    const packs = Number(line.packs);
    const left = packs > 0 ? packsLeft(line) : Number(line.quantity) - Number(line.opened) - Number(line.sold);
    const opened = count(request.body?.count, 10_000);
    if (!opened || opened > left) return reply.code(400).send({ error: packs > 0 ? `Open from 1 to ${left} packs` : `Open from 1 to ${left}` });
    if (!ownCollection(database, request.body?.collectionId, userId)) return reply.code(400).send({ error: "Choose the collection the pulled cards go to" });
    const named = line.product !== "other" && String(line.name) ? String(line.name) : "";
    const label = line.product === "other" ? String(line.name) : named || PRODUCTS[String(line.product)]!.label;
    // the decklist of a named deck, downloaded before anything changes
    let deck: Awaited<ReturnType<typeof sealedDeckCards>> = null;
    let deckError = "";
    if (request.body?.precon !== undefined) {
      if (line.product !== "commander_deck" || packs !== 0 || !validPrecon(request.body.precon)) return reply.code(400).send({ error: "Choose a Commander deck precon" });
      try {
        deck = await selectedPrecon(request.body.precon);
      } catch (error) {
        return reply.code(502).send({ error: error instanceof Error ? error.message : "The decklist could not be downloaded" });
      }
      if (!deck) return reply.code(404).send({ error: "That precon is not in the deck list" });
      if (!deck.cards.length) return reply.code(400).send({ error: "None of the decklist's cards are in the card database" });
    } else if (packs === 0 && line.sealed_id && request.body?.decklist !== false) {
      try {
        deck = await sealedDeckCards(database, String(line.sealed_id), fetcher);
      } catch (error) {
        deckError = error instanceof Error ? error.message : "The decklist could not be downloaded";
      }
    }
    const setName = line.set_code ? String(database.prepare("SELECT name FROM sets WHERE code = ?").get(String(line.set_code))?.name ?? String(line.set_code).toUpperCase()) : "";
    const date = new Date(`${String(entry.date)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const collectionId = String(request.body!.collectionId);
    const created: Array<{ id: string; name: string }> = [];
    try {
      transaction(database, () => {
        if (!deck) database.prepare("UPDATE purchase_openings SET active = 0 WHERE user_id = ?").run(userId);
        const insert = database.prepare(
          "INSERT INTO purchase_openings (id, user_id, entry_id, line_id, count, name, collection_id, active, pack_number, group_id, waiting) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        if (packs > 0) {
          const total = Number(line.quantity) * packs;
          const first = Number(line.packs_opened ?? 0) + 1;
          const group = randomUUID();
          for (let index = 0; index < opened; index += 1) {
            const id = randomUUID();
            const name = `Pack ${first + index} of ${total}, ${label}${setName ? `, ${setName}` : ""} (Purchase of ${date})`;
            insert.run(id, userId, String(entry.id), String(line.id), 1, name, collectionId, index === 0 ? 1 : 0, first + index, group, index === 0 ? 0 : 1);
            created.push({ id, name });
          }
        } else {
          const plural = named || opened === 1 ? label : label.endsWith("x") ? `${label}es` : `${label}s`;
          const id = randomUUID();
          const name = `${named && opened === 1 ? "" : `${opened} `}${plural}${setName ? `, ${setName}` : ""} (Purchase of ${date})`;
          insert.run(id, userId, String(entry.id), String(line.id), opened, name, collectionId, deck ? 0 : 1, null, null, 0);
          created.push({ id, name });
          if (deck) {
            // every card of the decklist, once for each deck opened; the opening is done
            addDeckCopies(deck, opened, collectionId, userId, String(entry.id), String(line.id), id);
            database.prepare(`UPDATE purchase_openings SET done_at = ${now} WHERE id = ?`).run(id);
          }
        }
        syncOpened(database, String(line.id));
      });
    } catch (error) {
      return fail(reply, error, "Could not open the product");
    }
    const first = created[0]!;
    return reply.code(201).send({
      id: first.id, name: first.name, collectionId, entryId: String(entry.id), packs: created,
      deck: deck ? { name: deck.name, cards: deck.cards.reduce((sum, card) => sum + card.quantity, 0) * opened, missing: deck.missing * opened } : null,
      ...(deckError ? { deckError } : {}),
    });
  });

  // Next pack (0.19.0): the current pack is done and the next waiting pack of its group is where cards are tied
  app.post<{ Params: { openingId: string } }>("/api/purchases/openings/:openingId/next", async (request, reply) => {
    const opening = ownOpening(request);
    if (!opening) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    const next = opening.group_id
      ? database.prepare("SELECT * FROM purchase_openings WHERE group_id = ? AND waiting = 1 ORDER BY pack_number LIMIT 1").get(String(opening.group_id))
      : null;
    transaction(database, () => {
      database.prepare(`UPDATE purchase_openings SET active = 0, waiting = 0, done_at = COALESCE(done_at, ${now}) WHERE id = ?`).run(String(opening.id));
      if (next) {
        database.prepare("UPDATE purchase_openings SET active = 0 WHERE user_id = ?").run(userOf(request));
        database.prepare("UPDATE purchase_openings SET active = 1, waiting = 0, done_at = NULL WHERE id = ?").run(String(next.id));
      }
    });
    return { next: next ? { id: String(next.id), name: String(next.name) } : null, opening: activeOpeningOf(database, userOf(request)) };
  });

  // Move to pack... (0.19.0): cards scanned into the wrong pack move to another pack of the same product line
  app.post<{ Body: { ties?: unknown; openingId?: unknown } }>("/api/purchases/ties/move", async (request, reply) => {
    const userId = userOf(request);
    const target = database.prepare("SELECT * FROM purchase_openings WHERE id = ? AND user_id = ?").get(String(request.body?.openingId ?? ""), userId);
    if (!target) return reply.code(404).send({ error: "Choose the pack to move the cards to" });
    const ids = Array.isArray(request.body?.ties) ? (request.body!.ties as unknown[]).map(Number).filter(Number.isInteger) : [];
    const moved: Array<{ id: number; from: string | null }> = [];
    try {
      transaction(database, () => {
        for (const id of ids) {
          const tie = database.prepare("SELECT * FROM purchase_ties WHERE id = ? AND user_id = ?").get(id, userId);
          if (!tie) throw new Error("A card is no longer on its pack");
          if (String(tie.line_id ?? "") !== String(target.line_id)) throw new Error("Cards move only between packs of the same product");
          moved.push({ id, from: tie.opening_id ? String(tie.opening_id) : null });
          database.prepare("UPDATE purchase_ties SET opening_id = ? WHERE id = ?").run(String(target.id), id);
        }
      });
    } catch (error) {
      return fail(reply, error, "Could not move the cards");
    }
    return { moved };
  });

  const ownOpening = (request: FastifyRequest<{ Params: { openingId: string } }>) =>
    database.prepare("SELECT * FROM purchase_openings WHERE id = ? AND user_id = ?").get(request.params.openingId, userOf(request));

  app.post<{ Params: { openingId: string }; Body: { precon?: unknown } }>("/api/purchases/openings/:openingId/precon", async (request, reply) => {
    if (!ownOpening(request)) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    if (!validPrecon(request.body?.precon)) return reply.code(400).send({ error: "Choose a Commander deck precon" });
    let deck: Awaited<ReturnType<typeof preconDeckCards>>;
    try {
      deck = await selectedPrecon(request.body.precon);
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "The decklist could not be downloaded" });
    }
    if (!deck) return reply.code(404).send({ error: "That precon is not in the deck list" });
    if (!deck.cards.length) return reply.code(400).send({ error: "None of the decklist's cards are in the card database" });
    const opening = ownOpening(request);
    if (!opening) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    const line = database.prepare("SELECT product, packs FROM purchase_lines WHERE id = ? AND entry_id = ?").get(String(opening.line_id), String(opening.entry_id));
    if (!line || line.product !== "commander_deck" || Number(line.packs) !== 0 || Number(opening.waiting) !== 0) {
      return reply.code(400).send({ error: "Choose an opened Commander deck" });
    }
    const userId = userOf(request);
    if (!ownCollection(database, opening.collection_id, userId)) return reply.code(400).send({ error: "Choose the collection the pulled cards go to" });
    const multiplier = Number(opening.count);
    try {
      const ids = transaction(database, () => addDeckCopies(deck, multiplier, String(opening.collection_id), userId, String(opening.entry_id), String(opening.line_id), String(opening.id)));
      return reply.code(201).send({ ids, name: deck.name, cards: deck.cards.reduce((sum, card) => sum + card.quantity, 0) * multiplier, missing: deck.missing * multiplier });
    } catch (error) {
      return fail(reply, error, "Could not add the decklist");
    }
  });

  app.post<{ Params: { openingId: string }; Body: { ids?: unknown } }>("/api/purchases/openings/:openingId/precon/undo", async (request, reply) => {
    const opening = ownOpening(request);
    if (!opening) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
      return reply.code(400).send({ error: "Choose the added cards to undo" });
    }
    const userId = userOf(request);
    const ties = ids.map((id) => database.prepare("SELECT * FROM purchase_ties WHERE id = ? AND opening_id = ? AND user_id = ?").get(id, String(opening.id), userId));
    if (ties.some((tie) => !tie)) return reply.code(404).send({ error: "An added card is no longer tied to this opening" });
    try {
      transaction(database, () => {
        const held = heldByTie(database, userId);
        for (const tie of ties) {
          if (!tie) throw new Error("An added card is no longer tied to this opening");
          const quantity = held.get(Number(tie.id)) ?? 0;
          if (quantity > 0) takeCopies(database, String(tie.collection_id), keyOfRow(tie), quantity);
          database.prepare("DELETE FROM purchase_ties WHERE id = ?").run(Number(tie.id));
        }
      });
      return { status: "undone" };
    } catch (error) {
      return fail(reply, error, "Could not undo adding the decklist");
    }
  });

  // Change collection... on a pack (0.21.0): where its cards go from now on, and optionally the pulls already added
  const movePulls = (userId: number, tieIds: number[] | null, openingIds: string[], to: string) => {
    const held = heldByTie(database, userId);
    const moved: Array<{ id: number; from: string; to: string; quantity: number }> = [];
    const ties = tieIds
      ? tieIds.flatMap((tieId) => database.prepare("SELECT * FROM purchase_ties WHERE id = ? AND user_id = ?").all(tieId, userId))
      : openingIds.flatMap((openingId) => database.prepare("SELECT * FROM purchase_ties WHERE opening_id = ? AND user_id = ?").all(openingId, userId));
    for (const tie of ties) {
      const from = String(tie.collection_id);
      const quantity = held.get(Number(tie.id)) ?? 0;
      if (from === to || quantity <= 0) continue;
      const key = keyOfRow(tie);
      const have = heldQuantity(database, from, key);
      const take = Math.min(quantity, have);
      if (take <= 0) continue;
      // deck links follow the copies, so pulls in a deck stay in it
      moveLinks(database, { collectionId: from, key }, { collectionId: to, key }, take, have - linkedCount(database, from, key));
      takeCopies(database, from, key, take);
      putCopies(database, to, key, take);
      database.prepare("UPDATE purchase_ties SET collection_id = ? WHERE id = ?").run(to, Number(tie.id));
      moved.push({ id: Number(tie.id), from, to, quantity: take });
    }
    return moved;
  };

  app.post<{ Params: { openingId: string }; Body: { collectionId?: unknown; move?: unknown; rest?: unknown } }>("/api/purchases/openings/:openingId/collection", async (request, reply) => {
    const opening = ownOpening(request);
    if (!opening) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    const userId = userOf(request);
    const collectionId = request.body?.collectionId;
    if (!ownCollection(database, collectionId, userId)) return reply.code(404).send({ error: "Choose one of your collections" });
    const targets = [opening, ...(request.body?.rest === true && opening.group_id
      ? database.prepare("SELECT * FROM purchase_openings WHERE group_id = ? AND user_id = ? AND waiting = 1 AND id != ?").all(String(opening.group_id), userId, String(opening.id))
      : [])];
    let result: { openings: Array<{ id: string; collectionId: string | null }>; ties: Array<{ id: number; from: string; to: string; quantity: number }> } = { openings: [], ties: [] };
    try {
      transaction(database, () => {
        result = {
          openings: targets.map((item) => ({ id: String(item.id), collectionId: item.collection_id ? String(item.collection_id) : null })),
          ties: request.body?.move === true ? movePulls(userId, null, targets.map((item) => String(item.id)), String(collectionId)) : [],
        };
        for (const item of targets) database.prepare("UPDATE purchase_openings SET collection_id = ? WHERE id = ?").run(String(collectionId), String(item.id));
      });
    } catch (error) {
      return fail(reply, error, "Could not change the collection");
    }
    return { undo: result, entry: purchaseEntry(database, userId, String(opening.entry_id)) };
  });

  // undo of Change collection...: the packs' collections as they were, and the moved pulls back where they came from
  app.post<{ Body: { openings?: unknown; ties?: unknown } }>("/api/purchases/openings/collection/restore", async (request, reply) => {
    const userId = userOf(request);
    const openings = Array.isArray(request.body?.openings) ? request.body.openings as Array<{ id?: unknown; collectionId?: unknown }> : [];
    const ties = Array.isArray(request.body?.ties) ? request.body.ties as Array<{ id?: unknown; from?: unknown; to?: unknown }> : [];
    try {
      transaction(database, () => {
        for (const tie of ties) {
          const row = database.prepare("SELECT collection_id FROM purchase_ties WHERE id = ? AND user_id = ?").get(Number(tie.id), userId);
          if (!row || !ownCollection(database, tie.from, userId)) continue;
          movePulls(userId, [Number(tie.id)], [], String(tie.from));
        }
        for (const item of openings) {
          if (item.collectionId !== null && !ownCollection(database, item.collectionId, userId)) continue;
          database.prepare("UPDATE purchase_openings SET collection_id = ? WHERE id = ? AND user_id = ?").run(item.collectionId === null ? null : String(item.collectionId), String(item.id), userId);
        }
      });
    } catch (error) {
      return fail(reply, error, "Could not undo the change");
    }
    return { ok: true };
  });

  // Done opening ends it; Continue opening makes it where pulled cards are tied again
  app.post<{ Params: { openingId: string }; Body: { active?: unknown } }>("/api/purchases/openings/:openingId/active", async (request, reply) => {
    const opening = ownOpening(request);
    if (!opening) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    const active = request.body?.active === true;
    transaction(database, () => {
      if (active) database.prepare("UPDATE purchase_openings SET active = 0 WHERE user_id = ?").run(userOf(request));
      database.prepare(`UPDATE purchase_openings SET active = ?, waiting = 0, done_at = CASE WHEN ? THEN NULL ELSE ${now} END WHERE id = ?`).run(active ? 1 : 0, active ? 1 : 0, String(opening.id));
    });
    return { active };
  });

  // undo of Open...: the opening goes, with the ties of its cards (the cards stay in the collection)
  // copies=1 (0.20.0, undo of opening a named deck) also takes the tied copies still held out of their collections
  app.delete<{ Params: { openingId: string }; Querystring: { copies?: string } }>("/api/purchases/openings/:openingId", async (request, reply) => {
    const opening = ownOpening(request);
    if (!opening) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    // the packs of one Open... go together (0.19.0)
    const group = opening.group_id
      ? database.prepare("SELECT id FROM purchase_openings WHERE group_id = ?").all(String(opening.group_id)).map((row) => String(row.id))
      : [String(opening.id)];
    transaction(database, () => {
      for (const id of group) {
        if (request.query.copies === "1") {
          for (const tie of database.prepare("SELECT * FROM purchase_ties WHERE opening_id = ?").all(id)) {
            const key = keyOfRow(tie);
            const take = Math.min(Number(tie.quantity), heldQuantity(database, String(tie.collection_id), key));
            if (take > 0) takeCopies(database, String(tie.collection_id), key, take);
          }
        }
        database.prepare("DELETE FROM purchase_ties WHERE opening_id = ?").run(id);
        database.prepare("DELETE FROM purchase_openings WHERE id = ?").run(id);
      }
      syncOpened(database, String(opening.line_id));
    });
    return { status: "deleted" };
  });

  // ties copies already in a collection to an opening (Add cards to this opening), or unties a tie
  app.post<{ Params: { openingId: string }; Body: { items?: unknown } }>("/api/purchases/openings/:openingId/ties", async (request, reply) => {
    const userId = userOf(request);
    const opening = ownOpening(request);
    if (!opening) return reply.code(404).send({ error: "That opening is not in your purchase history" });
    const items = Array.isArray(request.body?.items) ? request.body!.items as Array<Record<string, unknown>> : [];
    const ids: number[] = [];
    try {
      transaction(database, () => {
        for (const item of items) {
          const key = readCopyKey(item);
          const quantity = count(item.quantity, 10_000);
          if (!key || !quantity || !ownCollection(database, item.collectionId, userId)) throw new Error("Each card needs its collection and a count");
          insertTie(database, userId, String(opening.entry_id), { lineId: String(opening.line_id), openingId: String(opening.id) }, String(item.collectionId), key, quantity);
          ids.push(Number(database.prepare("SELECT last_insert_rowid() AS id").get()!.id));
        }
      });
      // the new ties, so undo can remove them (0.19.0)
      return { tied: items.length, ids };
    } catch (error) {
      return fail(reply, error, "Could not tie the cards");
    }
  });

  // the packs and purchases the copies about to be removed came from (0.18.0), for the note in the remove question
  app.post<{ Body: { items?: unknown } }>("/api/purchases/ties/packs", async (request) => {
    const userId = userOf(request);
    const items = Array.isArray(request.body?.items) ? (request.body!.items as Array<Record<string, unknown>>).slice(0, 500) : [];
    const held = heldByTie(database, userId);
    const found = new Map<string, number>();
    for (const item of items) {
      const key = readCopyKey(item);
      if (!key || typeof item.collectionId !== "string") continue;
      const rows = database.prepare(
        `SELECT t.id, t.entry_id, o.name AS opening_name FROM purchase_ties t LEFT JOIN purchase_openings o ON o.id = t.opening_id
         WHERE t.user_id = ? AND t.collection_id = ? AND ${KEY.replace(/\b(card_id|foil|condition|language|proxy)\b/g, "t.$1")}`,
      ).all(userId, item.collectionId, ...keyValues(key));
      for (const row of rows) {
        const count = held.get(Number(row.id)) ?? 0;
        if (!count) continue;
        const entry = database.prepare("SELECT * FROM purchase_entries WHERE id = ?").get(String(row.entry_id));
        const name = row.opening_name ? String(row.opening_name) : entry ? `the ${KIND_LABEL[String(entry.kind)]!.toLowerCase()} of ${String(entry.date)}` : "a purchase";
        found.set(name, (found.get(name) ?? 0) + count);
      }
    }
    return { packs: [...found].map(([name, quantity]) => ({ name, quantity })) };
  });

  // undo of Remove from pack (0.18.0): the tie comes back as it was, with its date and Value when pulled
  app.post<{ Body: { tie?: Record<string, unknown> } }>("/api/purchases/ties/restore", async (request, reply) => {
    const userId = userOf(request);
    const tie = request.body?.tie;
    const key = tie ? readCopyKey(tie) : null;
    const quantity = tie ? count(tie.quantity, 10_000) : 0;
    if (!tie || !key || !quantity || typeof tie.entryId !== "string" || !ownCollection(database, tie.collectionId, userId)) return reply.code(400).send({ error: "Send the card to put back" });
    if (!database.prepare("SELECT 1 FROM purchase_entries WHERE id = ? AND user_id = ?").get(tie.entryId, userId)) return missing(reply);
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    database.prepare(
      `INSERT INTO purchase_ties (user_id, entry_id, line_id, opening_id, collection_id, card_id, foil, condition, language, proxy, quantity, price, value_then, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%d %H:%M:%f', 'now')))`,
    ).run(userId, tie.entryId, typeof tie.lineId === "string" ? tie.lineId : null, typeof tie.openingId === "string" ? tie.openingId : null, String(tie.collectionId),
      ...keyValues(key), quantity, number(tie.price), number(tie.valueThen), typeof tie.createdAt === "string" ? tie.createdAt : null);
    return reply.code(201).send({ status: "restored" });
  });

  app.delete<{ Params: { tieId: string } }>("/api/purchases/ties/:tieId", async (request, reply) => {
    const tie = database.prepare("SELECT * FROM purchase_ties WHERE id = ? AND user_id = ?").get(Number(request.params.tieId), userOf(request));
    if (!tie) return reply.code(404).send({ error: "That card is not tied to your purchases" });
    // the copies of this tie still in the collection, and all copies of that kind there, so Remove from pack and delete the card can lower them
    const held = heldByTie(database, userOf(request)).get(Number(tie.id)) ?? 0;
    const have = heldQuantity(database, String(tie.collection_id), keyOfRow(tie));
    database.prepare("DELETE FROM purchase_ties WHERE id = ?").run(Number(tie.id));
    return {
      tie: {
        collectionId: String(tie.collection_id), cardId: String(tie.card_id), foil: Number(tie.foil), condition: String(tie.condition), language: String(tie.language), proxy: Number(tie.proxy) === 1,
        quantity: Number(tie.quantity), openingId: tie.opening_id ? String(tie.opening_id) : null, lineId: tie.line_id ? String(tie.line_id) : null,
        entryId: String(tie.entry_id), valueThen: tie.value_then === null || tie.value_then === undefined ? null : Number(tie.value_then), createdAt: String(tie.created_at), price: tie.price === null || tie.price === undefined ? null : Number(tie.price),
      },
      held, have,
    };
  });

  // Set current value... of a sealed line: one value per day, kept as history
  app.post<{ Params: { entryId: string; lineId: string }; Body: { value?: unknown; date?: unknown } }>("/api/purchases/:entryId/lines/:lineId/value", async (request, reply) => {
    const entry = own(request);
    if (!entry) return missing(reply);
    const line = database.prepare("SELECT * FROM purchase_lines WHERE id = ? AND entry_id = ?").get(request.params.lineId, String(entry.id));
    if (!line || line.product === "single") return reply.code(404).send({ error: "Choose a product line" });
    const date = request.body?.date === undefined ? today() : readDate(request.body.date);
    if (!date) return reply.code(400).send({ error: "Enter the date as a calendar date" });
    const before = database.prepare("SELECT value FROM purchase_values WHERE line_id = ? AND date = ?").get(String(line.id), date);
    if (request.body?.value === null) {
      database.prepare("DELETE FROM purchase_values WHERE line_id = ? AND date = ?").run(String(line.id), date);
    } else {
      const value = amount(request.body?.value);
      if (value === null) return reply.code(400).send({ error: "Amounts must be 0 or more" });
      database.prepare("INSERT INTO purchase_values (line_id, date, value) VALUES (?, ?, ?) ON CONFLICT(line_id, date) DO UPDATE SET value = excluded.value").run(String(line.id), date, value);
    }
    return { date, before: before ? Number(before.value) : null };
  });

  // Make purchases from imported prices...
  app.post<{ Body: { mode?: unknown; collectionId?: unknown } }>("/api/purchases/from-prices", async (request, reply) => {
    const userId = userOf(request);
    const mode = request.body?.mode === "date" ? "date" : request.body?.mode === "one" ? "one" : null;
    if (!mode) return reply.code(400).send({ error: "Choose One purchase or One purchase per date added" });
    const collectionId = typeof request.body?.collectionId === "string" && request.body.collectionId ? request.body.collectionId : undefined;
    if (collectionId && !ownCollection(database, collectionId, userId)) return reply.code(404).send({ error: "Collection not found" });
    const created = transaction(database, () => purchasesFromPrices(database, userId, mode, { collectionId, source: "Imported prices" }));
    return { created };
  });

  app.get("/api/purchases/priced-copies", async (request) => {
    const userId = userOf(request);
    const held = heldByTie(database, userId);
    const tied = Number([...held.values()].reduce((sum, value) => sum + value, 0));
    const priced = Number(database.prepare(
      `SELECT COALESCE(SUM(i.quantity), 0) AS n FROM collection_cards i JOIN collections c ON c.id = i.collection_id WHERE c.owner_id = ? AND c.kind != 'wishlist' AND i.purchase_price > 0 AND i.proxy = 0`,
    ).get(userId)?.n ?? 0);
    return { priced, untied: Math.max(0, priced - tied) };
  });

  // copies to choose for a card sale, found by name
  app.get<{ Querystring: { q?: string } }>("/api/purchases/copies", async (request) => {
    const term = `%${String(request.query.q ?? "").trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    return database.prepare(
      `SELECT i.collection_id, col.name AS collection_name, i.card_id, i.foil, i.condition, i.language, i.proxy, i.quantity, c.name, c.set_code, c.collector_number,
              c.price_usd, c.price_usd_foil, c.price_usd_etched, c.price_eur, c.price_eur_foil
       FROM collection_cards i JOIN collections col ON col.id = i.collection_id JOIN cards c ON c.id = i.card_id
       WHERE col.owner_id = ? AND col.kind != 'wishlist' AND c.name LIKE ? ESCAPE '\\' ORDER BY c.name, c.set_code LIMIT 60`,
    ).all(userOf(request), term).map((row) => ({
      collectionId: String(row.collection_id), collectionName: String(row.collection_name), cardId: String(row.card_id), foil: Number(row.foil),
      condition: String(row.condition), language: String(row.language), proxy: Number(row.proxy) === 1, quantity: Number(row.quantity), name: String(row.name),
      setCode: String(row.set_code), collectorNumber: String(row.collector_number),
      prices: { usd: row.price_usd, usdFoil: row.price_usd_foil, usdEtched: row.price_usd_etched, eur: row.price_eur, eurFoil: row.price_eur_foil },
    }));
  });

  // Add existing copies... (0.19.0): the copies of one collection with how many are free (not tied to a pack or purchase),
  // and where the tied ones are
  app.get<{ Querystring: { collectionId?: string; q?: string } }>("/api/purchases/collection-copies", async (request, reply) => {
    const userId = userOf(request);
    const collectionId = String(request.query.collectionId ?? "");
    if (!ownCollection(database, collectionId, userId)) return reply.code(404).send({ error: "Choose one of your collections" });
    const term = `%${String(request.query.q ?? "").trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    const held = heldByTie(database, userId);
    const tied = new Map<string, { count: number; places: Set<string> }>();
    for (const tie of database.prepare(
      `SELECT t.id, t.card_id, t.foil, t.condition, t.language, t.proxy, o.name AS opening_name, e.kind, e.date FROM purchase_ties t
       JOIN purchase_entries e ON e.id = t.entry_id LEFT JOIN purchase_openings o ON o.id = t.opening_id WHERE t.user_id = ? AND t.collection_id = ?`,
    ).all(userId, collectionId)) {
      const count = held.get(Number(tie.id)) ?? 0;
      if (!count) continue;
      const id = `${String(tie.card_id)}|${Number(tie.foil)}|${String(tie.condition)}|${String(tie.language)}|${Number(tie.proxy)}`;
      const item = tied.get(id) ?? { count: 0, places: new Set<string>() };
      item.count += count;
      item.places.add(tie.opening_name ? String(tie.opening_name) : `the ${KIND_LABEL[String(tie.kind)]!.toLowerCase()} of ${String(tie.date)}`);
      tied.set(id, item);
    }
    return database.prepare(
      `SELECT i.card_id, i.foil, i.condition, i.language, i.proxy, i.quantity, c.name, c.set_code, c.set_name, c.collector_number, c.image_url, c.promo_types
       FROM collection_cards i JOIN cards c ON c.id = i.card_id WHERE i.collection_id = ? AND c.name LIKE ? ESCAPE '\\' ORDER BY c.name, c.set_code, c.collector_number LIMIT 2000`,
    ).all(collectionId, term).map((row) => {
      const id = `${String(row.card_id)}|${Number(row.foil)}|${String(row.condition)}|${String(row.language)}|${Number(row.proxy)}`;
      const tie = tied.get(id);
      return {
        collectionId, cardId: String(row.card_id), foil: Number(row.foil), condition: String(row.condition), language: String(row.language), proxy: Number(row.proxy) === 1,
        quantity: Number(row.quantity), free: Math.max(0, Number(row.quantity) - (tie?.count ?? 0)), tiedTo: tie ? [...tie.places] : [],
        name: String(row.name), setCode: String(row.set_code), setName: String(row.set_name ?? ""), collectorNumber: String(row.collector_number),
        imageUrl: row.image_url ? String(row.image_url) : null, promoTypes: row.promo_types ? String(row.promo_types) : null,
      };
    });
  });

  // sealed lines that can be sold
  app.get("/api/purchases/sealed", async (request) => database.prepare(
    `SELECT l.*, e.date FROM purchase_lines l JOIN purchase_entries e ON e.id = l.entry_id
     WHERE e.user_id = ? AND l.product != 'single' AND l.quantity - l.opened - l.sold > 0 ORDER BY e.date DESC`,
  ).all(userOf(request)).map((line) => ({
    lineId: String(line.id), entryId: String(line.entry_id), label: lineLabel(line), date: String(line.date), sealed: Number(line.quantity) - Number(line.opened) - Number(line.sold),
  })));

  // Export history: entries or lines as CSV
  app.get<{ Querystring: { what?: string } }>("/api/purchases/export", async (request, reply) => {
    const userId = userOf(request);
    const { entries } = purchaseSummary(database, userId, {});
    reply.header("Content-Type", "text/csv; charset=utf-8");
    if (request.query.what === "lines") {
      const rows: unknown[][] = [["Entry date", "Kind", "Place", "Line", "Product", "Set", "Card", "Quantity", "Cost", "Full cost", "Opened", "Sold", "Sealed value each", "Sale price", "Currency"]];
      for (const summary of entries) {
        const entry = purchaseEntry(database, userId, summary.id)!;
        for (const line of entry.lines) {
          rows.push([entry.date, entry.kindLabel, entry.place, "Product", line.productLabel, line.setCode?.toUpperCase() ?? "", line.product === "single" ? line.name : "", line.quantity,
            line.cost, line.full, line.opened, line.sold, line.product === "single" ? "" : line.sealedValue, "", entry.currency.toUpperCase()]);
        }
        for (const sale of entry.sales) {
          rows.push([entry.date, entry.kindLabel, entry.place, sale.what === "card" ? "Card sold or given" : "Product sold", "", sale.setCode?.toUpperCase() ?? "", sale.name,
            sale.quantity, "", "", "", "", "", sale.price, entry.currency.toUpperCase()]);
        }
      }
      return csv(rows);
    }
    return csv([["Date", "Kind", "Place", "Description", "Note", "Money out", "Money in", "Value now", "Gain or loss", "Currency"],
      ...entries.map((entry) => [entry.date, entry.kindLabel, entry.place, entry.description, entry.note, entry.out, entry.in, entry.value, entry.gain, entry.currency.toUpperCase()])]);
  });
  // ---------- places ----------

  app.get("/api/places", async (request) => listPlaces(database, userOf(request)));

  app.post<{ Body: { name?: unknown; kind?: unknown; note?: unknown } }>("/api/places", async (request, reply) => {
    const name = text(request.body?.name, 120);
    if (!name) return reply.code(400).send({ error: "Enter the name of the place" });
    if (database.prepare("SELECT 1 FROM places WHERE match_key = ?").get(placeKey(name))) return reply.code(409).send({ error: `${name} is already in the list of places` });
    const id = placeFor(database, name, userOf(request))!;
    database.prepare("UPDATE places SET kind = ?, note = ? WHERE id = ?").run(readKind(request.body?.kind), text(request.body?.note, 500), id);
    return reply.code(201).send(listPlaces(database, userOf(request)).find((place) => place.id === id));
  });

  // any account can fix a place's name, kind or note; every entry shows the new name at once
  app.patch<{ Params: { placeId: string }; Body: { name?: unknown; kind?: unknown; note?: unknown } }>("/api/places/:placeId", async (request, reply) => {
    const place = database.prepare("SELECT * FROM places WHERE id = ?").get(request.params.placeId);
    if (!place) return reply.code(404).send({ error: "That place is not in the list of places" });
    const name = request.body?.name === undefined ? String(place.name) : text(request.body.name, 120);
    if (!name) return reply.code(400).send({ error: "Enter the name of the place" });
    const other = database.prepare("SELECT name FROM places WHERE match_key = ? AND id != ?").get(placeKey(name), String(place.id));
    if (other) return reply.code(409).send({ error: `${String(other.name)} is already in the list of places. Merge the two places instead.` });
    const kind = request.body?.kind === undefined ? String(place.kind) : readKind(request.body.kind);
    const note = request.body?.note === undefined ? String(place.note) : text(request.body.note, 500);
    transaction(database, () => {
      database.prepare("UPDATE places SET name = ?, match_key = ?, kind = ?, note = ? WHERE id = ?").run(name, placeKey(name), kind, note, String(place.id));
      database.prepare("UPDATE purchase_entries SET place = ? WHERE place_id = ?").run(name, String(place.id));
    });
    return { before: { name: String(place.name), kind: String(place.kind), note: String(place.note) } };
  });

  const adminOnly = (request: FastifyRequest, reply: FastifyReply) => {
    if (isAdmin(database, request.user?.id)) return true;
    void reply.code(403).send({ error: "Only an admin can merge or delete places" });
    return false;
  };

  // merges a place into another: every entry moves to the place kept; returns what is needed to undo it
  app.post<{ Params: { placeId: string }; Body: { into?: unknown } }>("/api/places/:placeId/merge", async (request, reply) => {
    if (!adminOnly(request, reply)) return reply;
    const place = database.prepare("SELECT * FROM places WHERE id = ?").get(request.params.placeId);
    const into = database.prepare("SELECT * FROM places WHERE id = ?").get(String(request.body?.into ?? ""));
    if (!place || !into || place.id === into.id) return reply.code(400).send({ error: "Choose two different places to merge" });
    const entryIds = database.prepare("SELECT id FROM purchase_entries WHERE place_id = ?").all(String(place.id)).map((row) => String(row.id));
    transaction(database, () => {
      database.prepare("UPDATE purchase_entries SET place_id = ?, place = ? WHERE place_id = ?").run(String(into.id), String(into.name), String(place.id));
      database.prepare("DELETE FROM places WHERE id = ?").run(String(place.id));
    });
    return { place: placeRow(place), entryIds };
  });

  // a place no entry uses can be deleted; one in use is merged into another first
  app.delete<{ Params: { placeId: string } }>("/api/places/:placeId", async (request, reply) => {
    if (!adminOnly(request, reply)) return reply;
    const place = database.prepare("SELECT * FROM places WHERE id = ?").get(request.params.placeId);
    if (!place) return reply.code(404).send({ error: "That place is not in the list of places" });
    const uses = Number(database.prepare("SELECT COUNT(*) AS n FROM purchase_entries WHERE place_id = ?").get(String(place.id))?.n ?? 0);
    if (uses) return reply.code(409).send({ error: `${String(place.name)} is used by ${uses} ${uses === 1 ? "entry" : "entries"}. Merge it into another place first.` });
    database.prepare("DELETE FROM places WHERE id = ?").run(String(place.id));
    return { place: placeRow(place), entryIds: [] };
  });

  // undo of a merge or delete: the place comes back and its entries move back to it
  app.post<{ Body: { place?: Record<string, unknown>; entryIds?: unknown } }>("/api/places/restore", async (request, reply) => {
    if (!adminOnly(request, reply)) return reply;
    const place = request.body?.place;
    const name = text(place?.name, 120);
    if (!place || typeof place.id !== "string" || !name) return reply.code(400).send({ error: "That place cannot be put back" });
    if (database.prepare("SELECT 1 FROM places WHERE id = ? OR match_key = ?").get(place.id, placeKey(name))) return reply.code(409).send({ error: `${name} is already in the list of places` });
    const entryIds = Array.isArray(request.body?.entryIds) ? request.body!.entryIds.map(String) : [];
    transaction(database, () => {
      database.prepare("INSERT INTO places (id, name, match_key, kind, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(place.id as string, name, placeKey(name), readKind(place.kind), text(place.note, 500), place.createdBy === null || place.createdBy === undefined ? null : Number(place.createdBy), String(place.createdAt ?? new Date().toISOString()));
      for (const id of entryIds) database.prepare("UPDATE purchase_entries SET place_id = ?, place = ? WHERE id = ?").run(place.id as string, name, id);
    });
    return reply.code(201).send({ status: "restored" });
  });

  // ---------- receipts ----------

  const receiptTypes = /^(application\/pdf|image\/(png|jpeg|webp|gif|bmp))$/;
  app.addContentTypeParser(/^(application\/pdf|image\/.*)$/, { parseAs: "buffer", bodyLimit: 20 * 1024 * 1024 }, (_request, body, done) => done(null, body));

  // reads a receipt and returns the purchase fields found in it; nothing is saved
  app.post<{ Body: Buffer }>("/api/purchases/receipts/read", async (request, reply) => {
    const type = String(request.headers["content-type"] ?? "").split(";")[0]!.trim();
    if (!receiptTypes.test(type) || !Buffer.isBuffer(request.body)) return reply.code(400).send({ error: "Choose a PDF or a picture of the receipt" });
    try {
      const textRead = type === "application/pdf" ? await pdfText(new Uint8Array(request.body)) : await pictureText(request.body, ocrFolder);
      return { text: textRead, fields: matchReceiptCards(database, parseReceipt(textRead, receiptSets(database))) };
    } catch (error) {
      return reply.code(422).send({ error: error instanceof Error && /missing/.test(error.message) ? error.message : "The receipt could not be read. Enter the purchase by hand." });
    }
  });

  // the named sealed products a line of a set and product can be (0.20.0)
  app.get<{ Querystring: { set?: string; product?: string } }>("/api/purchases/products", async (request) =>
    sealedChoices(database, request.query.set ? String(request.query.set) : null, request.query.product ? String(request.query.product) : null).slice(0, 300));

  // reads text a phone already recognized
  app.post<{ Body: { text?: unknown } }>("/api/purchases/receipts/parse", async (request) => ({ fields: matchReceiptCards(database, parseReceipt(String(request.body?.text ?? "").slice(0, 200_000), receiptSets(database))) }));

  app.get<{ Params: { entryId: string } }>("/api/purchases/:entryId/receipt", async (request, reply) => {
    if (!own(request)) return missing(reply);
    const row = database.prepare("SELECT * FROM purchase_receipts WHERE entry_id = ?").get(request.params.entryId);
    if (!row) return reply.code(404).send({ error: "This entry has no receipt" });
    reply.header("Content-Type", String(row.type));
    reply.header("Content-Disposition", `inline; filename="${String(row.name).replace(/["\\\r\n]/g, "")}"`);
    return reply.send(Buffer.from(row.data as Uint8Array));
  });

  // keeps a receipt with an entry (replacing one kept before, which is returned so the change can be undone)
  app.put<{ Params: { entryId: string }; Body: Buffer }>("/api/purchases/:entryId/receipt", async (request, reply) => {
    if (!own(request)) return missing(reply);
    const type = String(request.headers["content-type"] ?? "").split(";")[0]!.trim();
    if (!receiptTypes.test(type) || !Buffer.isBuffer(request.body)) return reply.code(400).send({ error: "Choose a PDF or a picture of the receipt" });
    const name = String(request.headers["x-file-name"] ?? "").replace(/[^\w .()-]+/g, "").slice(0, 120) || (type === "application/pdf" ? "receipt.pdf" : "receipt");
    const before = takeReceipt(database, request.params.entryId);
    database.prepare("INSERT INTO purchase_receipts (entry_id, name, type, data) VALUES (?, ?, ?, ?)").run(request.params.entryId, name, type, request.body);
    return { before };
  });

  app.delete<{ Params: { entryId: string } }>("/api/purchases/:entryId/receipt", async (request, reply) => {
    if (!own(request)) return missing(reply);
    return { before: takeReceipt(database, request.params.entryId) };
  });
}

const readKind = (value: unknown) => (PLACE_KINDS.includes(value as (typeof PLACE_KINDS)[number]) ? String(value) : "store");
const placeRow = (place: Record<string, unknown>) => ({
  id: String(place.id), name: String(place.name), kind: String(place.kind), note: String(place.note),
  createdBy: place.created_by === null || place.created_by === undefined ? null : Number(place.created_by), createdAt: String(place.created_at),
});

/** Every place, the ones this account used most recently first, with how many entries (of every account) use each. */
export function listPlaces(database: DatabaseSync, userId: number) {
  return database.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM purchase_entries e WHERE e.place_id = p.id) AS uses,
            (SELECT MAX(date) FROM purchase_entries e WHERE e.place_id = p.id AND e.user_id = ?) AS last
     FROM places p ORDER BY last IS NULL, last DESC, p.name COLLATE NOCASE`,
  ).all(userId).map((row) => ({ ...placeRow(row), uses: Number(row.uses), lastUsed: row.last ? String(row.last) : null }));
}

function takeReceipt(database: DatabaseSync, entryId: string) {
  const row = database.prepare("SELECT * FROM purchase_receipts WHERE entry_id = ?").get(entryId);
  if (!row) return null;
  database.prepare("DELETE FROM purchase_receipts WHERE entry_id = ?").run(entryId);
  return { name: String(row.name), type: String(row.type), data: Buffer.from(row.data as Uint8Array).toString("base64") };
}

/** Store notes on a card line that are not part of the card's name: bracketed set names, versions, conditions and finishes. */
const VERSION_WORDS: Array<[RegExp, string]> = [
  [/\bshowcase\b/i, "showcase"], [/\bborderless\b/i, "borderless"], [/\bextended(\s+art)?\b/i, "extendedart"], [/\bfull\s+art\b/i, "fullart"],
  [/\bretro(\s+frame)?\b/i, "retro"], [/\betched\b/i, "etched"],
];

/**
 * Receipt lines that are single cards (0.19.0): a line whose name, with store notes removed, is a card name, or that
 * carries a condition or finish note, is card-like; when the name is a card, the best printing is guessed from a set named
 * in brackets (or anywhere in the line), a version word (Showcase, Borderless, Extended Art), and the finish and condition.
 */
export function matchReceiptCards(database: DatabaseSync, fields: ReturnType<typeof parseReceipt>): ReturnType<typeof parseReceipt> {
  const sets = receiptSets(database);
  for (const line of fields.lines) {
    // a named product (0.20.0): the sealed product whose name is in the line
    if (line.product !== "other") {
      const found = matchSealed(database, { setCode: line.setCode, product: line.product, name: line.productName, text: line.name });
      if (found) {
        line.sealedId = found.id;
        line.productName = found.name;
      }
      continue;
    }
    const all = `${line.name} ${line.note}`;
    const bracket = [...line.name.matchAll(/[[(]([^\])]+)[\])]/g)].map((match) => match[1]!);
    const bare = line.name.replace(/[[(][^\])]*[\])]/g, " ").replace(new RegExp(CONDITION_NOTE.source, "gi"), " ").replace(/\s*[-/|:]\s*$/g, "").replace(/\s+/g, " ").trim();
    const printings = bare.length >= 2
      ? database.prepare(
        `SELECT id, name, set_code, set_name, collector_number, image_url, finishes, promo_types, frame_effects, border_color, full_art, released_at FROM cards
         WHERE removed = 0 AND lang = 'en' AND (lower(name) = lower(?) OR lower(name) LIKE lower(?) || ' // %' OR lower(flavor_name) = lower(?)) ORDER BY released_at DESC LIMIT 400`,
      ).all(bare, bare, bare)
      : [];
    line.cardLike = printings.length > 0 || CONDITION_NOTE.test(line.note) || /\b(near\s+mint|lightly\s+played)\b/i.test(all);
    if (!printings.length) continue;
    const setCode = bracket.map((text) => setOf(text, sets) ?? sets.find((set) => set.code.toLowerCase() === text.trim().toLowerCase())?.code ?? null).find(Boolean) ?? line.setCode;
    const version = VERSION_WORDS.find(([pattern]) => pattern.test(all))?.[1] ?? null;
    const finish = finishOf(all);
    const requestedSpecial = specialFoilOf(all);
    const score = (row: Record<string, unknown>) => {
      let points = 0;
      if (setCode && row.set_code === setCode) points += 100;
      const effects = `${String(row.frame_effects ?? "")} ${String(row.promo_types ?? "")}`;
      const special = effects.includes("showcase") || effects.includes("extendedart") || row.border_color === "borderless" || Number(row.full_art) === 1;
      if (version === "showcase" && effects.includes("showcase")) points += 20;
      else if (version === "borderless" && row.border_color === "borderless") points += 20;
      else if (version === "extendedart" && effects.includes("extendedart")) points += 20;
      else if (version === "fullart" && Number(row.full_art) === 1) points += 20;
      else if (!version && !special) points += 10;
      const finishes = String(row.finishes ?? "").split(",");
      const promoTypes = String(row.promo_types ?? "");
      if (finish === 1 && finishes.includes("foil")) {
        points += 5;
        if (requestedSpecial && promoTypes.split(",").includes(requestedSpecial)) points += 15;
        else if (!requestedSpecial && !specialFoil(promoTypes)) points += 1;
      }
      if (finish === 2 && finishes.includes("etched")) points += 5;
      if (finish === 0 && finishes.includes("nonfoil")) points += 5;
      return points;
    };
    const best = [...printings].sort((a, b) => score(b) - score(a))[0]!;
    const bestPromo = String(best.promo_types ?? "");
    const warning = finish === 1 && (requestedSpecial ? !bestPromo.split(",").includes(requestedSpecial) : !!specialFoil(bestPromo))
      ? "The guessed printing's foil type may not match the receipt. Check the printing."
      : undefined;
    line.card = {
      cardId: String(best.id), name: String(best.name), setCode: String(best.set_code), setName: String(best.set_name), collectorNumber: String(best.collector_number),
      imageUrl: best.image_url ? String(best.image_url) : null, finish, condition: conditionOf(all), promoTypes: bestPromo, finishes: String(best.finishes ?? ""),
      ...(warning ? { warning } : {}),
    };
    line.setCode = String(best.set_code);
  }
  return fields;
}

function receiptSets(database: DatabaseSync): Array<{ code: string; name: string }> {
  return database.prepare("SELECT code, name FROM sets WHERE COALESCE(digital, 0) = 0").all().map((row) => ({ code: String(row.code), name: String(row.name) }));
}

// ---------- listening to the rest of the program ----------

/** Copies added while an opening is where pulled cards go are tied to it; copies taken away again (undo) are untied. */
onCopiesAdded((database, userId, collectionId, items, step) => {
  // copies that come back by an undo were removed by hand: they kept their ties, so nothing is tied again
  if (step === "undo") return;
  const opening = database.prepare("SELECT * FROM purchase_openings WHERE user_id = ? AND active = 1 AND collection_id = ?").get(userId, collectionId);
  if (!opening) return;
  for (const item of items) {
    insertTie(database, userId, String(opening.entry_id), { lineId: String(opening.line_id), openingId: String(opening.id) }, collectionId, item.key, item.quantity);
  }
});

/** Copies that move to another collection or change printing keep their ties: the copies not tied move first. */
onCopiesMoved((database, from, to, quantity) => {
  const ties = database.prepare(`SELECT * FROM purchase_ties WHERE collection_id = ? AND ${KEY} ORDER BY id`).all(from.collectionId, ...keyValues(from.key));
  if (!ties.length) return;
  const have = heldQuantity(database, from.collectionId, from.key);
  const tied = Math.min(have, ties.reduce((sum, tie) => sum + Number(tie.quantity), 0));
  let left = Math.min(tied, quantity - Math.max(0, have - tied));
  // the newest ties move first, so the oldest keep the copies that stay
  for (const tie of [...ties].reverse()) {
    if (left <= 0) break;
    const take = Math.min(left, Number(tie.quantity));
    if (take < Number(tie.quantity)) {
      database.prepare("UPDATE purchase_ties SET quantity = quantity - ? WHERE id = ?").run(take, Number(tie.id));
      database.prepare(
        `INSERT INTO purchase_ties (user_id, entry_id, line_id, opening_id, collection_id, card_id, foil, condition, language, proxy, quantity, price, created_at, value_then)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(Number(tie.user_id), String(tie.entry_id), tie.line_id as string | null, tie.opening_id as string | null, to.collectionId, ...keyValues(to.key), take,
        tie.price as number | null, String(tie.created_at), tie.value_then as number | null);
    } else {
      database.prepare(`UPDATE purchase_ties SET collection_id = ?, card_id = ?, foil = ?, condition = ?, language = ?, proxy = ? WHERE id = ?`)
        .run(to.collectionId, ...keyValues(to.key), Number(tie.id));
    }
    left -= take;
  }
});

/**
 * Pulled cards stay on their pack (0.18.0): copies deleted from a collection keep their ties and show as Gone. Only an
 * undo of adding them unties them (the card was scanned or added by mistake); the pack's entry page removes pulls by hand.
 */
onCopiesLowered((database, userId, collectionId, items, step) => {
  if (step !== "undo") return;
  const opening = database.prepare("SELECT id FROM purchase_openings WHERE user_id = ? AND active = 1 AND collection_id = ?").get(userId, collectionId);
  if (!opening) return;
  for (const item of items) {
    let left = item.quantity;
    for (const tie of database.prepare(`SELECT id, quantity FROM purchase_ties WHERE opening_id = ? AND collection_id = ? AND ${KEY} ORDER BY id DESC`).all(String(opening.id), collectionId, ...keyValues(item.key))) {
      if (left <= 0) break;
      const take = Math.min(left, Number(tie.quantity));
      if (take === Number(tie.quantity)) database.prepare("DELETE FROM purchase_ties WHERE id = ?").run(Number(tie.id));
      else database.prepare("UPDATE purchase_ties SET quantity = quantity - ? WHERE id = ?").run(take, Number(tie.id));
      left -= take;
    }
  }
});

/** A completed trade is recorded as a Trade entry for each account: cards given with their record, cards got tied. */
onTradeDone((database: DatabaseSync, side: TradeSide) => {
  const currency = "usd";
  const priced = (cardId: string, foil: number, price: number | null) => price ?? priceNow(database, cardId, foil, currency) ?? 0;
  const placeId = side.partnerName ? placeFor(database, side.partnerName, side.userId) : null;
  const entryId = insertEntry(database, side.userId, "trade", {
    date: today(), place: placeName(database, placeId), placeId, note: side.name, currency, tax: 0, shipping: 0, fees: 0, cashOut: 0, cashIn: 0, shippingBy: "me",
  }, { tradeId: side.tradeId });
  side.given.forEach((item, position) => {
    database.prepare(
      `INSERT INTO purchase_sales (id, entry_id, position, what, card_id, foil, condition, language, proxy, collection_id, name, quantity, price, source_entry_id)
       VALUES (?, ?, ?, 'card', ?, ?, ?, ?, ?, ?, (SELECT name FROM cards WHERE id = ?), ?, ?, ?)`,
    ).run(randomUUID(), entryId, position, ...keyValues(item.key), item.collectionId, item.key.cardId, item.quantity, money(priced(item.key.cardId, item.key.foil, item.price) * item.quantity),
      sourceOf(database, side.userId, item.collectionId, item.key));
  });
  if (side.collectionId) for (const item of side.got) insertTie(database, side.userId, entryId, {}, side.collectionId, item.key, item.quantity, money(priced(item.key.cardId, item.key.foil, item.price)));
});

onTradeReopened((database, tradeId) => {
  database.prepare("DELETE FROM purchase_entries WHERE trade_id = ?").run(tradeId);
});

/** A printing Scryfall merged into another: purchase ties, lines and sales follow it. */
mergeHooks.push((database, oldId, newId) => {
  for (const table of ["purchase_ties", "purchase_lines", "purchase_sales"]) database.prepare(`UPDATE ${table} SET card_id = ? WHERE card_id = ?`).run(newId, oldId);
});

// ---------- backups ----------

/** Every entry of an account, as kept, for backups (version 7). */
export function purchaseBackup(database: DatabaseSync, userId: number): EntrySnapshot[] {
  return database.prepare("SELECT id FROM purchase_entries WHERE user_id = ? ORDER BY date, created_at").all(userId).map((row) => entrySnapshot(database, String(row.id))!);
}

/** Replaces an account's purchase history with a backup's. Collections not in the backup are dropped from ties. */
export function restorePurchases(database: DatabaseSync, userId: number, snapshots: unknown[], collectionOf: (id: string) => string | null): void {
  database.prepare("DELETE FROM purchase_entries WHERE user_id = ?").run(userId);
  for (const raw of snapshots) {
    const snapshot = readSnapshot(raw);
    if (!snapshot) throw new Error("Backup purchase history is invalid");
    if (database.prepare("SELECT 1 FROM purchase_entries WHERE id = ?").get(String(snapshot.entry.id))) continue;
    const remap = (row: Record<string, unknown>) => ({ ...row, collection_id: row.collection_id ? collectionOf(String(row.collection_id)) : null });
    restoreSnapshot(database, userId, {
      ...snapshot,
      purchase_lines: (snapshot.purchase_lines ?? []).map(remap),
      purchase_sales: (snapshot.purchase_sales ?? []).map(remap),
      purchase_openings: (snapshot.purchase_openings ?? []).map((row) => ({ ...remap(row), active: 0 })),
      // ties to collections that are not in the backup are dropped
      purchase_ties: (snapshot.purchase_ties ?? []).map(remap).filter((row) => row.collection_id),
    } as EntrySnapshot);
  }
}

/** Card records the purchase history uses, so a backup holds them. */
export function purchaseCardIds(database: DatabaseSync, userId: number): string[] {
  return database.prepare(
    `SELECT card_id FROM purchase_ties WHERE user_id = ?
     UNION SELECT l.card_id FROM purchase_lines l JOIN purchase_entries e ON e.id = l.entry_id WHERE e.user_id = ? AND l.card_id IS NOT NULL
     UNION SELECT s.card_id FROM purchase_sales s JOIN purchase_entries e ON e.id = s.entry_id WHERE e.user_id = ? AND s.card_id IS NOT NULL`,
  ).all(userId, userId, userId).map((row) => String(row.card_id));
}

// ---------- packs (0.19.0) ----------

/** The packs of a product line still sealed: its packs, less those opened and those of units sold. */
function packsLeft(line: Record<string, unknown>): number {
  return Math.max(0, Number(line.quantity) * Number(line.packs) - Number(line.packs_opened ?? 0) - Number(line.sold) * Number(line.packs));
}

/** Counts a line's opened packs and units from its openings. A unit counts as opened from its first pack. */
function syncOpened(database: DatabaseSync, lineId: string): void {
  const line = database.prepare("SELECT packs FROM purchase_lines WHERE id = ?").get(lineId);
  if (!line) return;
  const opened = Number(database.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM purchase_openings WHERE line_id = ?").get(lineId)?.n ?? 0);
  const packs = Number(line.packs);
  if (packs > 0) database.prepare("UPDATE purchase_lines SET packs_opened = ?, opened = ? WHERE id = ?").run(opened, Math.ceil(opened / packs), lineId);
  else database.prepare("UPDATE purchase_lines SET opened = ? WHERE id = ?").run(opened, lineId);
}

export type ActiveOpening = {
  id: string; entryId: string; name: string; collectionId: string | null; packNumber: number | null; groupIndex: number; groupSize: number; hasNext: boolean;
} | null;

/** The opening cards are tied to now, with where it is in its group of packs (Pack 2 of 3) and whether a pack waits after it. */
export function activeOpeningOf(database: DatabaseSync, userId: number): ActiveOpening {
  const row = database.prepare("SELECT * FROM purchase_openings WHERE user_id = ? AND active = 1").get(userId);
  if (!row) return null;
  const group = row.group_id ? database.prepare("SELECT id, waiting FROM purchase_openings WHERE group_id = ? ORDER BY pack_number").all(String(row.group_id)) : [row];
  return {
    id: String(row.id), entryId: String(row.entry_id), name: String(row.name), collectionId: row.collection_id ? String(row.collection_id) : null,
    packNumber: row.pack_number === null || row.pack_number === undefined ? null : Number(row.pack_number),
    groupIndex: Math.max(1, group.findIndex((item) => item.id === row.id) + 1), groupSize: group.length, hasNext: group.some((item) => Number(item.waiting) === 1),
  };
}
