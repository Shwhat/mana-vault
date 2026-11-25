// ---------- MTGJSON data (0.21.0): every printing's MTGJSON record, prices from five stores with history, booster
// contents, sealed product contents, TCGplayer SKUs and the keyword and type lists. Kept on the server so they work
// without the internet. Each part that fails keeps what was stored before. ----------
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, gzipSync, gunzipSync } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import pick from "stream-json/filters/pick.js";
import streamObject from "stream-json/streamers/stream-object.js";
import { productNameOf } from "./receipts.js";
import { importSealedData, initializeSealed, productOfSealed } from "./sealed.js";

export const MTGJSON_API = "https://mtgjson.com/api/v5";
export const ALL_PRINTINGS_URL = `${MTGJSON_API}/AllPrintings.json.gz`;
export const ALL_PRICES_URL = `${MTGJSON_API}/AllPrices.json.gz`;
export const PRICES_TODAY_URL = `${MTGJSON_API}/AllPricesToday.json.gz`;
export const SKUS_URL = `${MTGJSON_API}/TcgplayerSkus.json.gz`;
export const KEYWORDS_URL = `${MTGJSON_API}/Keywords.json`;
export const CARD_TYPES_URL = `${MTGJSON_API}/CardTypes.json`;
const userAgent = "ManaVault/0.21 (self-hosted)";
/** The weekly parts are downloaded again only when this many days have passed (MTGJSON rebuilds them weekly). */
const WEEKLY_DAYS = 6;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

// ---------- stores and their price columns ----------

/** The stores MTGJSON lists prices for, with the number stored in the price history. */
export const STORES = [
  { id: "tcgplayer", code: 1, prefix: "tcg", label: "TCGplayer", currency: "USD", group: "paper" },
  { id: "cardkingdom", code: 2, prefix: "ck", label: "Card Kingdom", currency: "USD", group: "paper" },
  { id: "cardsphere", code: 3, prefix: "cs", label: "CardSphere", currency: "USD", group: "paper" },
  { id: "cardmarket", code: 4, prefix: "cm", label: "Cardmarket", currency: "EUR", group: "paper" },
  { id: "cardhoarder", code: 5, prefix: "ch", label: "Cardhoarder", currency: "Tix", group: "mtgo" },
] as const;
export type StoreId = typeof STORES[number]["id"];
export const storeOf = (id: string) => STORES.find((store) => store.id === id);

/** The six prices kept per store: retail and buylist for regular, foil and etched. */
export const PRICE_KINDS = ["r", "rf", "re", "b", "bf", "be"] as const;
const storeColumns = (prefix: string) => PRICE_KINDS.map((kind) => `${prefix}_${kind}`);

/** The main price source an account can choose (Settings, Prices). Only stores priced in US dollars, so totals stay in one currency. */
export const PRICE_SOURCES = ["tcgplayer", "cardkingdom", "cardsphere", "scryfall"] as const;
export type PriceSource = typeof PRICE_SOURCES[number];
export const readPriceSource = (value: unknown): PriceSource => (PRICE_SOURCES as readonly string[]).includes(String(value)) ? value as PriceSource : "tcgplayer";
/** The order used when the main source has no price: the main source, then TCGplayer, Scryfall, Card Kingdom, CardSphere. */
export const sourceChain = (source: PriceSource): PriceSource[] => [source, ...(["tcgplayer", "scryfall", "cardkingdom", "cardsphere"] as PriceSource[]).filter((item) => item !== source)];

type Finish = "" | "_foil" | "_etched";
const KIND_OF: Record<Finish, string> = { "": "r", "_foil": "rf", "_etched": "re" };

/** The SQL for one finish's price from the main source, falling back along the source chain. */
export function sourcePrice(source: PriceSource, finish: Finish, card = "c"): string {
  const at = card ? `${card}.` : "";
  const parts = sourceChain(source).map((item) => item === "scryfall" ? `${at}price_usd${finish}` : `${at}${storeOf(item)!.prefix}_${KIND_OF[finish]}`);
  return `COALESCE(${parts.join(", ")})`;
}

/** The SQL that picks which source the price of a finish came from (for marking a price that is not from the main source). */
export function sourceOfPrice(source: PriceSource, finish: Finish, card = "c"): string {
  const parts = sourceChain(source).map((item) => `WHEN ${item === "scryfall" ? `${card}.price_usd${finish}` : `${card}.${storeOf(item)!.prefix}_${KIND_OF[finish]}`} IS NOT NULL THEN '${item}'`);
  return `(CASE ${parts.join(" ")} END)`;
}

/** The price columns the interface reads (price_usd, price_usd_foil, price_usd_etched, price_eur, price_eur_foil), from the main source. */
export function priceColumns(source: PriceSource, card = "c"): string {
  const at = card ? `${card}.` : "";
  return `${sourcePrice(source, "", card)} AS price_usd, ${sourcePrice(source, "_foil", card)} AS price_usd_foil, ${sourcePrice(source, "_etched", card)} AS price_usd_etched, ${at}price_eur AS price_eur, ${at}price_eur_foil AS price_eur_foil,
    ${buylistSql("", card)} AS buy_usd, ${buylistSql("_foil", card)} AS buy_usd_foil, ${buylistSql("_etched", card)} AS buy_usd_etched`;
}

/** The account's main price source, from its saved preferences. */
export function priceSourceOf(database: DatabaseSync, userId: number | null | undefined): PriceSource {
  if (!userId) return "tcgplayer";
  try {
    const row = database.prepare("SELECT prefs FROM user_prefs WHERE user_id = ?").get(userId);
    return readPriceSource((JSON.parse(String(row?.prefs ?? "{}")) as { mainPriceSource?: unknown }).mainPriceSource);
  } catch {
    return "tcgplayer";
  }
}

/** The highest buylist price of a finish over every store. */
export function buylistSql(finish: Finish, card = "c"): string {
  const kind = finish === "" ? "b" : finish === "_foil" ? "bf" : "be";
  const at = card ? `${card}.` : "";
  const parts = STORES.filter((store) => store.currency === "USD").map((store) => `COALESCE(${at}${store.prefix}_${kind}, 0)`);
  return `NULLIF(MAX(${parts.join(", ")}), 0)`;
}

// ---------- tables ----------

export function initializeMtgjson(database: DatabaseSync): void {
  initializeSealed(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS mtgjson_records (
      uuid TEXT PRIMARY KEY,
      card_id TEXT,
      set_code TEXT NOT NULL DEFAULT '',
      record BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mtgjson_records_card ON mtgjson_records(card_id);
    CREATE TABLE IF NOT EXISTS mtgjson_ids (
      store TEXT NOT NULL,
      ext_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      finish INTEGER,
      PRIMARY KEY (store, ext_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS mtgjson_sources (
      card_id TEXT NOT NULL,
      finish INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      PRIMARY KEY (card_id, finish, product_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS mtgjson_sources_product ON mtgjson_sources(product_id);
    CREATE TABLE IF NOT EXISTS boosters (
      set_code TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      PRIMARY KEY (set_code, name)
    );
    CREATE TABLE IF NOT EXISTS mtgjson_skus (
      sku_id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      condition TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT '',
      finish INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mtgjson_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mtgjson_parts (
      part TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      bytes INTEGER,
      at TEXT,
      result TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS store_price_history (
      card_id TEXT NOT NULL,
      store INTEGER NOT NULL,
      day TEXT NOT NULL,
      r REAL, rf REAL, re REAL, b REAL, bf REAL, be REAL,
      PRIMARY KEY (card_id, store, day)
    ) WITHOUT ROWID;
  `);
  const columns = new Set((database.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>).map((column) => column.name));
  const add = (name: string, type: string) => {
    if (!columns.has(name)) database.exec(`ALTER TABLE cards ADD COLUMN ${name} ${type}`);
  };
  for (const store of STORES) for (const column of storeColumns(store.prefix)) add(column, "REAL");
  add("mtgjson_uuid", "TEXT");
  add("original_text", "TEXT");
  add("original_type", "TEXT");
  add("is_reprint", "INTEGER NOT NULL DEFAULT 0");
  add("is_starter", "INTEGER NOT NULL DEFAULT 0");
  add("lead_commander", "INTEGER");
  add("lead_oathbreaker", "INTEGER");
  add("lead_brawl", "INTEGER");
}

// ---------- downloads and streaming ----------

/** Downloads a file (gzip as sent) to a path. Returns the bytes downloaded. */
export async function downloadFile(url: string, path: string, fetcher: Fetcher): Promise<number> {
  const response = await fetcher(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok || !response.body) throw new Error(`MTGJSON request failed: ${response.status} ${response.statusText}`);
  await mkdir(dirname(path), { recursive: true });
  const partial = `${path}.download`;
  try {
    await pipeline(Readable.fromWeb(response.body as unknown as import("node:stream/web").ReadableStream), createWriteStream(partial));
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  return (await stat(path)).size;
}

/** The download size of a file, from the server's answer to a HEAD request, or null. */
export async function downloadSize(url: string, fetcher: Fetcher): Promise<number | null> {
  try {
    const response = await fetcher(url, { method: "HEAD", headers: { "User-Agent": userAgent } });
    const size = Number(response.headers.get("content-length"));
    return response.ok && Number.isFinite(size) && size > 0 ? size : null;
  } catch {
    return null;
  }
}

/** Reads each entry of a file's top-level "data" object, one at a time, so very large files never sit in memory whole. */
export async function* dataEntries(path: string): AsyncGenerator<{ key: string; value: unknown }> {
  const gz = path.endsWith(".gz");
  const parts: unknown[] = [createReadStream(path)];
  if (gz) parts.push(createGunzip());
  parts.push(parser(), pick({ filter: "data" }), streamObject());
  for await (const item of chain(parts as never[])) yield item as { key: string; value: unknown };
}

// ---------- parts status ----------

export type PartResult = "Updated" | "Kept previous copy" | "Failed" | "Skipped" | "";

export function savePart(database: DatabaseSync, part: string, result: PartResult, count?: number, bytes?: number | null): void {
  if (result === "Updated") {
    database.prepare(`INSERT INTO mtgjson_parts (part, count, bytes, at, result) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(part) DO UPDATE SET count = excluded.count, bytes = excluded.bytes, at = excluded.at, result = excluded.result`)
      .run(part, count ?? 0, bytes ?? null, new Date().toISOString(), result);
  } else {
    database.prepare("INSERT INTO mtgjson_parts (part, result) VALUES (?, ?) ON CONFLICT(part) DO UPDATE SET result = excluded.result").run(part, result);
  }
}

const partAt = (database: DatabaseSync, part: string): string | null =>
  (database.prepare("SELECT at FROM mtgjson_parts WHERE part = ? AND result = 'Updated'").get(part)?.at as string | undefined) ?? null;

const due = (database: DatabaseSync, part: string, days: number) => {
  const at = partAt(database, part);
  return !at || Date.now() - Date.parse(at) > days * 86_400_000;
};

export const MTGJSON_PARTS = ["Card data", "Sealed products", "Decklists", "Price history", "Prices today", "TCGplayer SKUs", "Catalogs"] as const;

/** Administration, Card database: each MTGJSON part with its count, size on disk, date and the result of the last run. */
export function mtgjsonParts(database: DatabaseSync): Array<{ part: string; count: number; bytes: number | null; at: string | null; result: string }> {
  const saved = new Map(database.prepare("SELECT part, count, bytes, at, result FROM mtgjson_parts").all().map((row) => [String(row.part), row]));
  const counts: Record<string, () => number> = {
    "Card data": () => Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_records").get()?.n ?? 0),
    "Sealed products": () => Number(database.prepare("SELECT COUNT(*) AS n FROM sealed_products").get()?.n ?? 0),
    "Decklists": () => Number(database.prepare("SELECT COUNT(*) AS n FROM sealed_decks").get()?.n ?? 0),
    "Price history": () => Number(database.prepare("SELECT COUNT(*) AS n FROM store_price_history").get()?.n ?? 0),
    "Prices today": () => Number(database.prepare("SELECT COUNT(*) AS n FROM cards WHERE tcg_r IS NOT NULL OR tcg_rf IS NOT NULL OR ck_r IS NOT NULL OR ck_rf IS NOT NULL").get()?.n ?? 0),
    "TCGplayer SKUs": () => Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_skus").get()?.n ?? 0),
    "Catalogs": () => Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_meta").get()?.n ?? 0),
  };
  return MTGJSON_PARTS.map((part) => {
    const row = saved.get(part);
    return {
      part,
      count: counts[part]!(),
      bytes: row?.bytes == null ? null : Number(row.bytes),
      at: (row?.at as string | null) ?? null,
      result: String(row?.result ?? ""),
    };
  });
}

/** Printings MTGJSON lists that match no card in the database. */
export const unmatchedCount = (database: DatabaseSync) => Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_records WHERE card_id IS NULL").get()?.n ?? 0);

// ---------- AllPrintings ----------

type Rec = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const finishCode = (key: string) => (key === "foil" ? 1 : key === "etched" ? 2 : 0);

/** Saves the cards, tokens, booster contents and sealed product contents of every set in an AllPrintings file. */
export async function importAllPrintings(database: DatabaseSync, path: string): Promise<{ printings: number; matched: number; boosters: number; sealed: number }> {
  initializeMtgjson(database);
  const known = database.prepare("SELECT 1 AS ok FROM cards WHERE id = ? AND custom = 0");
  const saveRecord = database.prepare("INSERT INTO mtgjson_records (uuid, card_id, set_code, record) VALUES (?, ?, ?, ?) ON CONFLICT(uuid) DO UPDATE SET card_id = excluded.card_id, set_code = excluded.set_code, record = excluded.record");
  const saveCard = database.prepare(`UPDATE cards SET mtgjson_uuid = ?, original_text = ?, original_type = ?, is_reprint = ?, is_starter = ?,
    lead_commander = ?, lead_oathbreaker = ?, lead_brawl = ? WHERE id = ?`);
  const saveId = database.prepare("INSERT OR REPLACE INTO mtgjson_ids (store, ext_id, card_id, finish) VALUES (?, ?, ?, ?)");
  const saveSource = database.prepare("INSERT OR IGNORE INTO mtgjson_sources (card_id, finish, product_id) VALUES (?, ?, ?)");
  const saveBooster = database.prepare("INSERT OR REPLACE INTO boosters (set_code, name, config) VALUES (?, ?, ?)");
  const updateSealed = database.prepare("UPDATE sealed_products SET contents = ?, identifiers = ?, upc = ?, release_date = ?, card_count = COALESCE(card_count, ?) WHERE id = ?");
  const insertSealed = database.prepare(`INSERT OR IGNORE INTO sealed_products (id, set_code, name, short_name, category, subtype, product, card_count, contents, identifiers, upc, release_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let printings = 0;
  let matched = 0;
  let boosters = 0;
  let sealed = 0;
  const seen = new Set<string>();
  const clearIds = database.prepare("DELETE FROM mtgjson_ids WHERE card_id IN (SELECT id FROM cards WHERE set_code = ?)");
  const clearSources = database.prepare("DELETE FROM mtgjson_sources WHERE card_id IN (SELECT id FROM cards WHERE set_code = ?)");
  const clearBoosters = database.prepare("DELETE FROM boosters WHERE set_code = ?");
  let sets = 0;
  // saved a few sets at a time, so the rest of the program can keep saving changes while the file is read
  database.exec("BEGIN");
  try {
    for await (const { key, value } of dataEntries(path)) {
      const set = (value ?? {}) as Rec;
      const setCode = String(set.code ?? key).toLowerCase();
      clearIds.run(setCode);
      clearSources.run(setCode);
      clearBoosters.run(setCode);
      sets += 1;
      if (sets % 20 === 0) {
        database.exec("COMMIT");
        database.exec("BEGIN");
      }
      for (const card of [...(Array.isArray(set.cards) ? set.cards : []), ...(Array.isArray(set.tokens) ? set.tokens : [])] as Rec[]) {
        const uuid = str(card?.uuid);
        if (!uuid) continue;
        printings += 1;
        const identifiers = (card.identifiers ?? {}) as Rec;
        const scryfallId = str(identifiers.scryfallId);
        const cardId = scryfallId && known.get(scryfallId) ? scryfallId : null;
        saveRecord.run(uuid, cardId, setCode, gzipSync(JSON.stringify(card)));
        if (!cardId) continue;
        // a two-faced card has one MTGJSON record per face; the first face sets the card's details
        const first = !seen.has(cardId);
        seen.add(cardId);
        if (first) {
          matched += 1;
          const lead = (card.leadershipSkills ?? null) as Rec | null;
          saveCard.run(uuid, str(card.originalText) || null, str(card.originalType) || null, card.isReprint ? 1 : 0, card.isStarter ? 1 : 0,
            lead ? (lead.commander ? 1 : 0) : 0, lead ? (lead.oathbreaker ? 1 : 0) : 0, lead ? (lead.brawl ? 1 : 0) : 0, cardId);
        }
        const id = (store: string, value: unknown, finish: number | null) => {
          if ((typeof value === "string" && value) || typeof value === "number") saveId.run(store, String(value), cardId, finish);
        };
        id("mtgjson", uuid, null);
        id("tcgplayer", identifiers.tcgplayerProductId, null);
        id("tcgplayer", identifiers.tcgplayerEtchedProductId, 2);
        id("cardkingdom", identifiers.cardKingdomId, 0);
        id("cardkingdom", identifiers.cardKingdomFoilId, 1);
        id("cardkingdom", identifiers.cardKingdomEtchedId, 2);
        id("cardsphere", identifiers.cardsphereId, 0);
        id("cardsphere", identifiers.cardsphereFoilId, 1);
        id("cardmarket", identifiers.mcmId, null);
        id("mtgo", identifiers.mtgoId, 0);
        id("mtgo", identifiers.mtgoFoilId, 1);
        id("multiverse", identifiers.multiverseId, null);
        const sources = (card.sourceProducts ?? {}) as Rec;
        for (const [finish, list] of Object.entries(sources)) {
          if (!Array.isArray(list)) continue;
          for (const product of list) if (typeof product === "string") saveSource.run(cardId, finishCode(finish), product);
        }
      }
      const configs = (set.booster ?? {}) as Rec;
      for (const [name, config] of Object.entries(configs)) {
        if (!config || typeof config !== "object") continue;
        saveBooster.run(setCode, name, JSON.stringify(config));
        boosters += 1;
      }
      for (const product of (Array.isArray(set.sealedProduct) ? set.sealedProduct : []) as Rec[]) {
        const uuid = str(product?.uuid);
        if (!uuid || !str(product.name)) continue;
        const identifiers = (product.identifiers ?? {}) as Rec;
        const upcKey = Object.keys(identifiers).find((name) => /upc|gtin|ean|barcode/i.test(name));
        const upc = upcKey ? String(identifiers[upcKey]).replace(/\D/g, "") || null : null;
        const contents = product.contents ? JSON.stringify(product.contents) : null;
        const cardCount = Number.isInteger(product.cardCount) ? Number(product.cardCount) : null;
        const changed = updateSealed.run(contents, JSON.stringify(identifiers), upc, str(product.releaseDate) || null, cardCount, uuid).changes;
        if (!changed) {
          const category = str(product.category);
          const subtype = str(product.subtype);
          insertSealed.run(uuid, setCode, str(product.name).slice(0, 200), productNameOf(str(product.name), [str(set.name)]), category, subtype,
            productOfSealed(category, subtype, str(product.name)), cardCount, contents, JSON.stringify(identifiers), upc, str(product.releaseDate) || null);
        }
        sealed += 1;
      }
    }
    if (!printings) throw new Error("MTGJSON AllPrintings held no cards");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { printings, matched, boosters, sealed };
}

/** An MTGJSON record, by card id (the first face) or MTGJSON uuid. */
export function mtgjsonRecord(database: DatabaseSync, cardId: string): Rec | null {
  const row = database.prepare("SELECT record FROM mtgjson_records WHERE card_id = ? OR uuid = ? ORDER BY uuid LIMIT 1").get(cardId, cardId);
  if (!row) return null;
  try {
    return JSON.parse(gunzipSync(Buffer.from(row.record as Uint8Array)).toString("utf8")) as Rec;
  } catch {
    return null;
  }
}

// ---------- prices ----------

type Points = Record<string, Record<string, number>>;
type PriceRow = [number | null, number | null, number | null, number | null, number | null, number | null];

/** Turns one store's MTGJSON price list into a row of six prices per day. */
export function storeDays(list: Rec | undefined): Map<string, PriceRow> {
  const days = new Map<string, PriceRow>();
  if (!list) return days;
  const put = (points: unknown, offset: number) => {
    if (!points || typeof points !== "object") return;
    for (const [finish, byDay] of Object.entries(points as Points)) {
      const index = offset + finishCode(finish);
      if (!byDay || typeof byDay !== "object") continue;
      for (const [day, price] of Object.entries(byDay)) {
        if (typeof price !== "number" || !Number.isFinite(price) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        const row = days.get(day) ?? [null, null, null, null, null, null];
        row[index] = Math.round(price * 100) / 100;
        days.set(day, row);
      }
    }
  };
  put(list.retail, 0);
  put(list.buylist, 3);
  return days;
}

const sameRow = (a: PriceRow | null | undefined, b: PriceRow) => !!a && a.every((value, index) => value === b[index]);

/**
 * Saves the prices of an AllPrices or AllPricesToday file. Every store's days are kept in the price history only when
 * they differ from the day before (days already recorded are not changed), and each card's current store prices are
 * set from the newest day. Returns how many cards got prices.
 */
export async function importPrices(database: DatabaseSync, path: string): Promise<{ cards: number; rows: number }> {
  initializeMtgjson(database);
  const cardOf = database.prepare("SELECT card_id FROM mtgjson_records WHERE uuid = ?");
  const before = database.prepare("SELECT r, rf, re, b, bf, be FROM store_price_history WHERE card_id = ? AND store = ? AND day < ? ORDER BY day DESC LIMIT 1");
  const insert = database.prepare("INSERT OR IGNORE INTO store_price_history (card_id, store, day, r, rf, re, b, bf, be) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const setters = new Map(STORES.map((store) => [store.id, database.prepare(`UPDATE cards SET ${storeColumns(store.prefix).map((column) => `${column} = ?`).join(", ")} WHERE id = ?`)]));
  const newest = database.prepare("SELECT day, r, rf, re, b, bf, be FROM store_price_history WHERE card_id = ? AND store = ? ORDER BY day DESC LIMIT 1");
  let cards = 0;
  let rows = 0;
  let batch = 0;
  database.exec("BEGIN");
  try {
    for await (const { key, value } of dataEntries(path)) {
      const cardId = cardOf.get(key)?.card_id as string | null | undefined;
      if (!cardId) continue;
      const formats = (value ?? {}) as Record<string, Rec>;
      let priced = false;
      for (const store of STORES) {
        const days = storeDays(formats[store.group]?.[store.id] as Rec | undefined);
        if (!days.size) continue;
        const ordered = [...days.keys()].sort();
        const previous = before.get(cardId, store.code, ordered[0]!) as Record<string, number | null> | undefined;
        let last: PriceRow | null = previous ? [previous.r!, previous.rf!, previous.re!, previous.b!, previous.bf!, previous.be!] : null;
        for (const day of ordered) {
          const row = days.get(day)!;
          if (!sameRow(last, row)) rows += Number(insert.run(cardId, store.code, day, ...row).changes);
          last = row;
        }
        // the store's current prices are its newest recorded day
        const top = newest.get(cardId, store.code) as Record<string, number | null> | undefined;
        const current: Array<number | null> = top ? [top.r ?? null, top.rf ?? null, top.re ?? null, top.b ?? null, top.bf ?? null, top.be ?? null] : days.get(ordered[ordered.length - 1]!)!;
        setters.get(store.id)!.run(...current, cardId);
        priced = true;
      }
      if (priced) cards += 1;
      batch += 1;
      if (batch >= 5000) {
        database.exec("COMMIT");
        database.exec("BEGIN");
        batch = 0;
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { cards, rows };
}

/** A card's price history from every store, newest last. */
export function storeHistory(database: DatabaseSync, cardId: string): Array<{ store: string; day: string; r: number | null; rf: number | null; re: number | null; b: number | null; bf: number | null; be: number | null }> {
  return database.prepare("SELECT store, day, r, rf, re, b, bf, be FROM store_price_history WHERE card_id = ? ORDER BY day").all(cardId).map((row) => ({
    store: STORES.find((store) => store.code === Number(row.store))?.id ?? "tcgplayer",
    day: String(row.day),
    r: row.r as number | null, rf: row.rf as number | null, re: row.re as number | null,
    b: row.b as number | null, bf: row.bf as number | null, be: row.be as number | null,
  }));
}

/** The price of a card's finish from the main source on a day (or the newest before it), for Value when pulled. */
export function sourcePriceOn(database: DatabaseSync, cardId: string, finish: number, day: string, source: PriceSource): number | null {
  const column = finish === 1 ? "rf" : finish === 2 ? "re" : "r";
  const scryfall = finish === 1 ? "usd_foil" : finish === 2 ? "usd_etched" : "usd";
  for (const item of sourceChain(source)) {
    const row = item === "scryfall"
      ? database.prepare(`SELECT ${scryfall} AS price FROM price_history WHERE card_id = ? AND day <= ? ORDER BY day DESC LIMIT 1`).get(cardId, day)
      : database.prepare(`SELECT ${column} AS price FROM store_price_history WHERE card_id = ? AND store = ? AND day <= ? ORDER BY day DESC LIMIT 1`).get(cardId, storeOf(item)!.code, day);
    if (row && row.price != null) return Number(row.price);
  }
  return null;
}

// ---------- SKUs and catalogs ----------

const CONDITIONS: Record<string, string> = { "NEAR MINT": "NM", "LIGHTLY PLAYED": "LP", "MODERATELY PLAYED": "MP", "HEAVILY PLAYED": "HP", DAMAGED: "DMG" };
const LANGUAGES: Record<string, string> = {
  ENGLISH: "en", SPANISH: "es", FRENCH: "fr", GERMAN: "de", ITALIAN: "it", PORTUGUESE: "pt", JAPANESE: "ja", KOREAN: "ko", RUSSIAN: "ru",
  "CHINESE SIMPLIFIED": "zhs", "CHINESE TRADITIONAL": "zht",
};

/** Saves TCGplayer's SKUs: one id per printing, condition, language and finish. */
export async function importSkus(database: DatabaseSync, path: string): Promise<number> {
  initializeMtgjson(database);
  const cardOf = database.prepare("SELECT card_id FROM mtgjson_records WHERE uuid = ?");
  const insert = database.prepare("INSERT OR REPLACE INTO mtgjson_skus (sku_id, card_id, condition, language, finish) VALUES (?, ?, ?, ?, ?)");
  let saved = 0;
  database.exec("BEGIN");
  try {
    database.exec("DELETE FROM mtgjson_skus");
    for await (const { key, value } of dataEntries(path)) {
      const cardId = cardOf.get(key)?.card_id as string | null | undefined;
      if (!cardId || !Array.isArray(value)) continue;
      for (const sku of value as Rec[]) {
        const id = sku?.skuId;
        if (typeof id !== "number" && typeof id !== "string") continue;
        const finish = /etched/i.test(str(sku.finish)) ? 2 : /^foil$/i.test(str(sku.printing)) ? 1 : 0;
        insert.run(String(id), cardId, CONDITIONS[str(sku.condition).toUpperCase()] ?? "NM", LANGUAGES[str(sku.language).toUpperCase()] ?? "en", finish);
        saved += 1;
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return saved;
}

/** Saves MTGJSON's keyword list and card type list. */
export async function importCatalogs(database: DatabaseSync, fetcher: Fetcher): Promise<number> {
  initializeMtgjson(database);
  let saved = 0;
  for (const [key, url] of [["keywords", KEYWORDS_URL], ["card_types", CARD_TYPES_URL]] as const) {
    const response = await fetcher(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) throw new Error(`MTGJSON ${key} request failed: ${response.status} ${response.statusText}`);
    const body = await response.json() as { data?: unknown };
    if (!body?.data || typeof body.data !== "object") throw new Error(`MTGJSON ${key} has no data`);
    database.prepare("INSERT OR REPLACE INTO mtgjson_meta (key, value) VALUES (?, ?)").run(key, JSON.stringify(body.data));
    saved += 1;
  }
  return saved;
}

// ---------- the whole update ----------

export type MtgjsonOptions = {
  fetcher?: Fetcher;
  /** Where downloads are kept while they are read (removed afterward). */
  folder: string;
  /** Downloads the weekly parts even when they are less than a week old. */
  force?: boolean;
};

async function runPart(database: DatabaseSync, part: string, work: () => Promise<{ count: number; bytes?: number | null }>): Promise<boolean> {
  try {
    const { count, bytes } = await work();
    savePart(database, part, "Updated", count, bytes);
    console.log(`MTGJSON ${part}: ${count.toLocaleString()}`);
    return true;
  } catch (error) {
    const kept = Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_parts WHERE part = ? AND at IS NOT NULL").get(part)?.n ?? 0) > 0;
    savePart(database, part, kept ? "Kept previous copy" : "Failed");
    console.warn(`Could not update MTGJSON ${part}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function withDownload<T>(url: string, path: string, fetcher: Fetcher, read: (path: string, bytes: number) => Promise<T>): Promise<T> {
  try {
    const bytes = await downloadFile(url, path, fetcher);
    return await read(path, bytes);
  } finally {
    await rm(path, { force: true });
  }
}

/** The weekly MTGJSON parts: sealed products and decklists, AllPrintings, TCGplayer SKUs and the catalogs. */
export async function importMtgjsonWeekly(database: DatabaseSync, { fetcher = fetch, folder, force = false }: MtgjsonOptions): Promise<void> {
  initializeMtgjson(database);
  if (!force && !due(database, "Card data", WEEKLY_DAYS)) return;
  // the 0.20.0 sealed products and decklists (SetList and DeckList)
  await importSealedData(database, fetcher);
  const sealed = Number(database.prepare("SELECT COUNT(*) AS n FROM sealed_products").get()?.n ?? 0);
  const decks = Number(database.prepare("SELECT COUNT(*) AS n FROM sealed_decks").get()?.n ?? 0);
  if (sealed) savePart(database, "Sealed products", "Updated", sealed, null);
  if (decks) savePart(database, "Decklists", "Updated", decks, null);
  await runPart(database, "Card data", () => withDownload(ALL_PRINTINGS_URL, `${folder}/AllPrintings.json.gz`, fetcher, async (path, bytes) => {
    const result = await importAllPrintings(database, path);
    if (result.sealed) savePart(database, "Sealed products", "Updated", Number(database.prepare("SELECT COUNT(*) AS n FROM sealed_products").get()?.n ?? 0), null);
    return { count: result.printings, bytes };
  }));
  await runPart(database, "TCGplayer SKUs", () => withDownload(SKUS_URL, `${folder}/TcgplayerSkus.json.gz`, fetcher, async (path, bytes) => ({ count: await importSkus(database, path), bytes })));
  await runPart(database, "Catalogs", async () => ({ count: await importCatalogs(database, fetcher) }));
}

/** Today's prices from every store (AllPricesToday). */
export async function importPricesToday(database: DatabaseSync, { fetcher = fetch, folder }: MtgjsonOptions): Promise<boolean> {
  initializeMtgjson(database);
  return runPart(database, "Prices today", () => withDownload(PRICES_TODAY_URL, `${folder}/AllPricesToday.json.gz`, fetcher, async (path, bytes) => ({ count: (await importPrices(database, path)).cards, bytes })));
}

/** The 90 days of price history from every store (AllPrices). Downloaded only when an administrator asks for it. */
export async function importPriceHistory(database: DatabaseSync, { fetcher = fetch, folder }: MtgjsonOptions): Promise<boolean> {
  initializeMtgjson(database);
  return runPart(database, "Price history", () => withDownload(ALL_PRICES_URL, `${folder}/AllPrices.json.gz`, fetcher, async (path, bytes) => {
    await importPrices(database, path);
    database.prepare("INSERT OR REPLACE INTO mtgjson_meta (key, value) VALUES ('history_choice', '\"downloaded\"')").run();
    return { count: Number(database.prepare("SELECT COUNT(*) AS n FROM store_price_history").get()?.n ?? 0), bytes };
  }));
}

/** Whether the 90-day price history has been downloaded, skipped, or not chosen yet. */
export function historyChoice(database: DatabaseSync): "downloaded" | "skipped" | "ask" {
  initializeMtgjson(database);
  try {
    const value = JSON.parse(String(database.prepare("SELECT value FROM mtgjson_meta WHERE key = 'history_choice'").get()?.value ?? "\"ask\""));
    return value === "downloaded" || value === "skipped" ? value : "ask";
  } catch {
    return "ask";
  }
}

export function skipPriceHistory(database: DatabaseSync): void {
  initializeMtgjson(database);
  database.prepare("INSERT OR REPLACE INTO mtgjson_meta (key, value) VALUES ('history_choice', '\"skipped\"')").run();
  savePart(database, "Price history", "Skipped");
}

/** Every MTGJSON part after a card database update: the weekly parts when due, then today's prices when not saved today. */
export async function importMtgjson(database: DatabaseSync, options: MtgjsonOptions): Promise<void> {
  await importMtgjsonWeekly(database, options);
  const today = new Date().toISOString().slice(0, 10);
  if (options.force || (partAt(database, "Prices today") ?? "").slice(0, 10) !== today) await importPricesToday(database, options);
}

// ---------- reading for the interface ----------

/** The MTGJSON uuid of each card in a list, by card id, and the card id of each uuid. */
export function cardsOfUuids(database: DatabaseSync, uuids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!uuids.length) return map;
  const statement = database.prepare("SELECT card_id FROM mtgjson_records WHERE uuid = ?");
  for (const uuid of uuids) {
    const cardId = statement.get(uuid)?.card_id;
    if (typeof cardId === "string") map.set(uuid, cardId);
  }
  return map;
}
