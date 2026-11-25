// ---------- sealed products (0.20.0): MTGJSON's named products of each set (Commander decks, bundles, boxes) and the
// decklists of preconstructed decks. The product list is saved with each card database update; a decklist is downloaded
// the first time a named deck is opened and kept. ----------
import type { DatabaseSync } from "node:sqlite";
import type { CopyKey, FinishCode } from "./copies.js";
import { productNameOf } from "./receipts.js";

export const SET_LIST_URL = "https://mtgjson.com/api/v5/SetList.json";
export const DECK_LIST_URL = "https://mtgjson.com/api/v5/DeckList.json";
export const deckFileUrl = (fileName: string) => `https://mtgjson.com/api/v5/decks/${encodeURIComponent(fileName)}.json`;
const userAgent = "ManaVault/0.21 (self-hosted)";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function initializeSealed(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sealed_products (
      id TEXT PRIMARY KEY,
      set_code TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      subtype TEXT NOT NULL DEFAULT '',
      product TEXT NOT NULL DEFAULT 'other',
      card_count INTEGER,
      deck_name TEXT,
      deck_code TEXT
    );
    CREATE INDEX IF NOT EXISTS sealed_products_set ON sealed_products(set_code);
    CREATE TABLE IF NOT EXISTS sealed_decks (
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      cards TEXT,
      PRIMARY KEY (code, name)
    );
  `);
}

/** The purchase line product of an MTGJSON sealed product, by its category and subtype. */
export function productOfSealed(category: string, subtype: string): string {
  const kind = category.toLowerCase();
  const sub = subtype.toLowerCase();
  if (sub === "secret_lair" || sub.includes("secret")) return "secret_lair";
  if (kind === "booster_pack") {
    if (sub === "set") return "set_booster";
    if (sub === "draft") return "draft_booster";
    if (sub === "play") return "play_booster";
    if (sub === "collector") return "collector_booster";
    if (sub === "jumpstart") return "jumpstart_booster";
    return "other_booster";
  }
  if (kind === "booster_box") return "booster_box";
  if (kind === "bundle") return "bundle";
  if (kind === "deck" || kind === "deck_box") return sub === "commander" ? "commander_deck" : "deck";
  if (kind === "kit") {
    if (sub === "prerelease") return "prerelease_kit";
    if (sub === "beginner" || sub.includes("beginner")) return "beginner_box";
    return "other";
  }
  if (kind === "box_set") {
    if (sub === "beginner" || sub.includes("beginner")) return "beginner_box";
    if (sub === "starter" || sub.includes("starter")) return "starter_collection";
    return "other";
  }
  return "other";
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

type SetListEntry = {
  code?: unknown; name?: unknown;
  sealedProduct?: Array<{ uuid?: unknown; name?: unknown; category?: unknown; subtype?: unknown; cardCount?: unknown; contents?: { deck?: Array<{ name?: unknown; set?: unknown }> } }>;
  decks?: Array<{ name?: unknown; code?: unknown; sealedProductUuids?: unknown }>;
};

/** Replaces the sealed products from MTGJSON's set list. Returns how many were saved. */
export function saveSealedProducts(database: DatabaseSync, setList: unknown): number {
  const data = (setList as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("MTGJSON set list has no data");
  const rows: Array<[string, string, string, string, string, string, string, number | null, string | null, string | null]> = [];
  for (const set of data as SetListEntry[]) {
    if (typeof set?.code !== "string" || !Array.isArray(set.sealedProduct)) continue;
    const code = set.code.toLowerCase();
    const setName = typeof set.name === "string" ? set.name : "";
    // decks of the set linked to their products
    const deckOf = new Map<string, { name: string; code: string }>();
    for (const deck of set.decks ?? []) {
      if (typeof deck?.name !== "string" || !Array.isArray(deck.sealedProductUuids)) continue;
      for (const uuid of deck.sealedProductUuids) if (typeof uuid === "string") deckOf.set(uuid, { name: deck.name, code: String(deck.code ?? set.code).toUpperCase() });
    }
    for (const product of set.sealedProduct) {
      if (typeof product?.uuid !== "string" || typeof product.name !== "string") continue;
      const category = typeof product.category === "string" ? product.category : "";
      const subtype = typeof product.subtype === "string" ? product.subtype : "";
      const listed = product.contents?.deck?.length === 1 && typeof product.contents.deck[0]!.name === "string"
        ? { name: String(product.contents.deck[0]!.name), code: String(product.contents.deck[0]!.set ?? set.code).toUpperCase() } : null;
      const deck = deckOf.get(product.uuid) ?? listed;
      rows.push([product.uuid, code, product.name.slice(0, 200), productNameOf(product.name, [setName]), category, subtype, productOfSealed(category, subtype),
        Number.isInteger(product.cardCount) ? Number(product.cardCount) : null, deck?.name ?? null, deck?.code ?? null]);
    }
  }
  if (!rows.length) throw new Error("MTGJSON set list has no sealed products");
  database.exec("BEGIN");
  try {
    database.exec("DELETE FROM sealed_products");
    const insert = database.prepare(
      "INSERT OR REPLACE INTO sealed_products (id, set_code, name, short_name, category, subtype, product, card_count, deck_name, deck_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const row of rows) insert.run(...row);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return rows.length;
}

/** Saves MTGJSON's deck list (names and file names). A deck already downloaded keeps its cards while its file is the same. */
export function saveDeckList(database: DatabaseSync, deckList: unknown): number {
  const data = (deckList as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("MTGJSON deck list has no data");
  const decks = (data as Array<Record<string, unknown>>)
    .filter((deck) => typeof deck?.code === "string" && typeof deck.name === "string" && typeof deck.fileName === "string")
    .map((deck) => ({ code: String(deck.code).toUpperCase(), name: String(deck.name), fileName: String(deck.fileName), type: String(deck.type ?? "") }));
  database.exec("BEGIN");
  try {
    const kept = new Map(database.prepare("SELECT code, name, file_name, cards FROM sealed_decks WHERE cards IS NOT NULL").all()
      .map((row) => [`${String(row.code)}\n${String(row.name)}\n${String(row.file_name)}`, String(row.cards)]));
    database.exec("DELETE FROM sealed_decks");
    const insert = database.prepare("INSERT OR REPLACE INTO sealed_decks (code, name, file_name, type, cards) VALUES (?, ?, ?, ?, ?)");
    for (const deck of decks) insert.run(deck.code, deck.name, deck.fileName, deck.type, kept.get(`${deck.code}\n${deck.name}\n${deck.fileName}`) ?? null);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return decks.length;
}

/** Downloads MTGJSON's set list and deck list. Each part that fails keeps what was saved before. */
export async function importSealedData(database: DatabaseSync, fetcher: Fetcher = fetch): Promise<void> {
  initializeSealed(database);
  try {
    const response = await fetcher(SET_LIST_URL, { headers: { "User-Agent": userAgent } });
    if (!response.ok) throw new Error(`MTGJSON set list request failed: ${response.status} ${response.statusText}`);
    console.log(`Saved ${saveSealedProducts(database, await response.json()).toLocaleString()} sealed products`);
  } catch (error) {
    console.warn(`Could not update the sealed products: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const response = await fetcher(DECK_LIST_URL, { headers: { "User-Agent": userAgent } });
    if (!response.ok) throw new Error(`MTGJSON deck list request failed: ${response.status} ${response.statusText}`);
    console.log(`Saved ${saveDeckList(database, await response.json()).toLocaleString()} preconstructed decks`);
  } catch (error) {
    console.warn(`Could not update the deck list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A set, its parent and its children: Commander decks of a set can be listed under its Commander set and the other way round. */
export function relatedSets(database: DatabaseSync, setCode: string | null): string[] {
  if (!setCode) return [];
  const code = setCode.toLowerCase();
  const parent = database.prepare("SELECT parent_set_code FROM sets WHERE code = ?").get(code)?.parent_set_code;
  const codes = new Set([code]);
  if (typeof parent === "string" && parent) codes.add(parent.toLowerCase());
  for (const row of database.prepare("SELECT code FROM sets WHERE parent_set_code = ? OR (? != '' AND parent_set_code = ?)").all(code, String(parent ?? ""), String(parent ?? ""))) {
    codes.add(String(row.code));
  }
  return [...codes];
}

export type SealedChoice = { id: string; name: string; fullName: string; setCode: string; product: string; hasDeck: boolean };

/** The sealed products a purchase line of this set and product can be, its own set first. */
export function sealedChoices(database: DatabaseSync, setCode: string | null, product?: string | null): SealedChoice[] {
  const codes = relatedSets(database, setCode);
  if (!codes.length) return [];
  const rows = database.prepare(
    `SELECT * FROM sealed_products WHERE set_code IN (${codes.map(() => "?").join(", ")}) ORDER BY set_code = ? DESC, short_name = '', short_name, name`,
  ).all(...codes, codes[0]!);
  return rows
    .filter((row) => !product || product === "other" || String(row.product) === product)
    .map((row) => ({
      id: String(row.id), name: String(row.short_name) || String(row.name), fullName: String(row.name), setCode: String(row.set_code), product: String(row.product),
      hasDeck: !!row.deck_name,
    }));
}

/**
 * The sealed product a line names: a product whose short or full name is the line's name, or, when `text` is given (a
 * receipt line), the product whose short name appears in it, the longest first.
 */
export function matchSealed(database: DatabaseSync, line: { setCode: string | null; product: string; name: string; text?: string }): SealedChoice | null {
  if (line.product === "single") return null;
  const choices = sealedChoices(database, line.setCode, line.product);
  const name = norm(line.name);
  if (name) {
    const exact = choices.find((choice) => norm(choice.name) === name || norm(choice.fullName) === name);
    if (exact) return exact;
  }
  if (line.text) {
    const text = ` ${norm(line.text)} `;
    const found = choices.filter((choice) => choice.name !== choice.fullName && norm(choice.name).length >= 3 && text.includes(` ${norm(choice.name)} `))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (found) return found;
  }
  return null;
}

type DeckCard = { key: CopyKey; quantity: number };

type ListedCard = { scryfallId: string; setCode: string; number: string; count: number; foil: boolean; zone?: "commander" | "main" | "sideboard" };

/** A preconstructed deck's list (commander, main board and side board), downloaded once from MTGJSON and kept. */
export async function deckList(database: DatabaseSync, code: string, name: string, fetcher: Fetcher = fetch): Promise<{ code: string; name: string; type: string; list: ListedCard[] } | null> {
  const deck = database.prepare("SELECT * FROM sealed_decks WHERE name = ? AND code = ?").get(name, code)
    ?? database.prepare("SELECT * FROM sealed_decks WHERE name = ? ORDER BY code = ? DESC LIMIT 1").get(name, code);
  if (!deck) return null;
  let list = deck.cards ? JSON.parse(String(deck.cards)) as ListedCard[] : null;
  // lists kept before 0.21.0 have no zones: their cards count as main board
  if (!list) {
    const response = await fetcher(deckFileUrl(String(deck.file_name)), { headers: { "User-Agent": userAgent } });
    if (!response.ok) throw new Error(`The decklist could not be downloaded (${response.status})`);
    const body = await response.json() as { data?: { commander?: unknown[]; mainBoard?: unknown[]; sideBoard?: unknown[] } };
    const read = (zone: "commander" | "main" | "sideboard") => (raw: unknown): ListedCard[] => {
      const card = raw as { identifiers?: { scryfallId?: unknown }; setCode?: unknown; number?: unknown; count?: unknown; isFoil?: unknown };
      const count = Number(card?.count);
      if (!Number.isInteger(count) || count < 1) return [];
      return [{ scryfallId: String(card.identifiers?.scryfallId ?? ""), setCode: String(card.setCode ?? "").toLowerCase(), number: String(card.number ?? ""), count, foil: card.isFoil === true, zone }];
    };
    list = [...(body.data?.commander ?? []).flatMap(read("commander")), ...(body.data?.mainBoard ?? []).flatMap(read("main")), ...(body.data?.sideBoard ?? []).flatMap(read("sideboard"))];
    if (!list.length) throw new Error("The decklist has no cards");
    database.prepare("UPDATE sealed_decks SET cards = ? WHERE code = ? AND name = ?").run(JSON.stringify(list), String(deck.code), String(deck.name));
  }
  return { code: String(deck.code), name: String(deck.name), type: String(deck.type ?? ""), list };
}

/** The printing and finish of each card in a decklist, as copies to add, with the zone each is in. */
export function listedCopies(database: DatabaseSync, list: ListedCard[], zones: Array<"commander" | "main" | "sideboard">): { cards: Array<DeckCard & { zone: string; oracleId: string }>; missing: number } {
  const cards = new Map<string, DeckCard & { zone: string; oracleId: string }>();
  let missing = 0;
  for (const item of list) {
    if (!zones.includes(item.zone ?? "main")) continue;
    const row = (item.scryfallId ? database.prepare("SELECT id, oracle_id, finishes FROM cards WHERE id = ?").get(item.scryfallId) : undefined)
      ?? database.prepare("SELECT id, oracle_id, finishes FROM cards WHERE set_code = ? AND collector_number = ? AND lang = 'en' LIMIT 1").get(item.setCode, item.number);
    if (!row) {
      missing += item.count;
      continue;
    }
    const finishes = String(row.finishes ?? "").split(",");
    const foil: FinishCode = item.foil
      ? (finishes.includes("foil") || !finishes.includes("etched") ? 1 : 2)
      : finishes.includes("nonfoil") || finishes[0] === "" ? 0 : finishes.includes("foil") ? 1 : 2;
    const key: CopyKey = { cardId: String(row.id), foil, condition: "NM", language: "en", proxy: false };
    const id = `${key.cardId}:${key.foil}:${item.zone ?? "main"}`;
    const have = cards.get(id);
    if (have) have.quantity += item.count;
    else cards.set(id, { key, quantity: item.count, zone: item.zone ?? "main", oracleId: String(row.oracle_id) });
  }
  return { cards: [...cards.values()], missing };
}

/**
 * The cards of the deck in a sealed product (commander and main board), as copies to add: each printing the decklist
 * names, foil when the decklist says so. Downloaded once from MTGJSON and kept. Null when the product has no decklist.
 */
export async function sealedDeckCards(database: DatabaseSync, sealedId: string, fetcher: Fetcher = fetch): Promise<{ name: string; cards: DeckCard[]; missing: number } | null> {
  const product = database.prepare("SELECT deck_name, deck_code FROM sealed_products WHERE id = ?").get(sealedId);
  if (!product?.deck_name) return null;
  return preconDeckCards(database, String(product.deck_code ?? ""), String(product.deck_name), fetcher);
}

/** The commander and main-board copies of a selected catalog precon. */
export async function preconDeckCards(database: DatabaseSync, code: string, name: string, fetcher: Fetcher = fetch): Promise<{ name: string; cards: DeckCard[]; missing: number } | null> {
  const deck = await deckList(database, code, name, fetcher);
  if (!deck) return null;
  const { cards, missing } = listedCopies(database, deck.list, ["commander", "main"]);
  // the same printing and finish in two zones is one copy line
  const merged = new Map<string, DeckCard>();
  for (const card of cards) {
    const id = `${card.key.cardId}:${card.key.foil}`;
    const have = merged.get(id);
    if (have) have.quantity += card.quantity;
    else merged.set(id, { key: card.key, quantity: card.quantity });
  }
  return { name: deck.name, cards: [...merged.values()], missing };
}
