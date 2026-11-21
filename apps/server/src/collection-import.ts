import { parse } from "csv-parse/sync";
import type { DatabaseSync } from "node:sqlite";
import { type Condition, type CopyKey, type FinishCode, readCondition, readFlag, readLanguage } from "./copies.js";

type CsvRow = Record<string, string>;

/** The files a collection can be imported from. Detection picks one; the person can choose another. */
export const IMPORT_FORMATS = {
  manavault: "Mana Vault CSV",
  moxfield: "Moxfield CSV",
  manabox: "ManaBox CSV",
  archidekt: "Archidekt CSV",
  deckbox: "Deckbox CSV",
  tcgplayer: "TCGplayer CSV",
  text: "Plain text list",
} as const;
export type ImportFormat = keyof typeof IMPORT_FORMATS;

export interface CollectionImportResult {
  format: ImportFormat;
  formatName: string;
  matchedRows: number;
  importedQuantity: number;
  unmatched: Array<{ row: number; name: string; reason: string }>;
  /** Copies with a purchase price (0.16.0), for the purchase history question. */
  pricedCopies: number;
  /** What was added, for purchase history (not sent to the browser). */
  additions?: Array<{ key: CopyKey; quantity: number; price: number | null; currency: string | null; added: string | null }>;
}

/** A name matches a card's name, its flavor name, or the front face of a two-faced card. */
export function nameMatch(name: string): [string, string, string] {
  return [name, name, `${name.replace(/[\\%_]/g, "\\$&")} // %`];
}

const firstLine = (text: string) => text.replace(/^﻿/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
const headerCells = (text: string) => {
  try {
    const rows = parse(firstLine(text), { relax_quotes: true }) as string[][];
    return (rows[0] ?? []).map((cell) => cell.trim().toLowerCase());
  } catch {
    return [];
  }
};

/** Works out which program a file came from by its header row. A file without a CSV header is a plain text list. */
export function detectFormat(text: string): ImportFormat {
  const header = headerCells(text);
  const has = (...names: string[]) => names.every((name) => header.includes(name));
  // a list line starts with a count ("4 Lightning Bolt"); a file whose first line has several cells is a CSV file
  if (/^\s*\d+\s*x?\s+\S/i.test(firstLine(text)) || header.length < 2) return "text";
  if (has("manabox id")) return "manabox";
  if (has("scryfall id", "finish", "proxy", "trade")) return "manavault";
  if (has("product id") || has("simple name") || (has("printing") && has("set code"))) return "tcgplayer";
  if (has("edition code", "finish") || has("date added", "edition name")) return "archidekt";
  if (has("edition code") || has("card number") || has("artist proof") || has("printing id")) return "deckbox";
  if (has("tradelist count") || has("edition") || has("last modified")) return "moxfield";
  return "moxfield";
}

/** Each detail a row can have, and the column names the supported programs use for it, most specific first. */
const COLUMNS = {
  name: ["name", "card name", "card"],
  quantity: ["count", "quantity", "qty", "amount"],
  setCode: ["set code", "edition code", "set_code"],
  set: ["edition", "set", "set name", "edition name"],
  number: ["collector number", "collector_number", "card number", "number", "cn"],
  finish: ["finish", "foil", "printing"],
  condition: ["condition"],
  language: ["language", "lang"],
  trade: ["tradelist count", "trade count", "trade"],
  scryfall: ["scryfall id", "scryfall_id", "scryfallid"],
  price: ["purchase price", "price paid"],
  currency: ["purchase price currency", "purchase currency"],
  added: ["added", "date added"],
  proxy: ["proxy"],
  misprint: ["misprint"],
  altered: ["altered", "alter", "altered art"],
  signed: ["signed"],
} as const;

type Parsed = {
  sourceRow: number; name: string; quantity: string; set: string; setCode: string; number: string; finish: string; condition: string;
  language: string; trade: string; scryfall: string; price: string; currency: string; added: string; proxy: string; misprint: string;
  altered: string; signed: string;
};

function readCsvRows(text: string, format: ImportFormat): Parsed[] {
  let rows: CsvRow[];
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true, max_record_size: 100_000, relax_column_count: true });
  } catch (error) {
    throw new Error(`Could not read CSV: ${error instanceof Error ? error.message : "invalid CSV"}`);
  }
  if (!rows.length) throw new Error("The file has no card rows");
  const columns = Object.keys(rows[0] ?? {});
  const find = (names: readonly string[]) => {
    for (const name of names) {
      const found = columns.find((column) => column.trim().toLowerCase() === name);
      if (found) return found;
    }
    return undefined;
  };
  const mapped = Object.fromEntries(Object.entries(COLUMNS).map(([key, names]) => [key, find(names)])) as Record<keyof typeof COLUMNS, string | undefined>;
  // Deckbox's Edition is the set name; Moxfield's Edition is the set code. Both are matched either way.
  if (format === "deckbox" && mapped.set && !mapped.setCode) mapped.setCode = find(["edition code"]);
  if (!mapped.name) throw new Error('The file needs a "Name" or "Card Name" column');
  return rows.map((row, index) => {
    const cell = (key: keyof typeof COLUMNS) => (mapped[key] ? (row[mapped[key]!] ?? "").trim() : "");
    return {
      sourceRow: index + 2, name: cell("name"), quantity: cell("quantity"), set: cell("set"), setCode: cell("setCode"), number: cell("number"),
      finish: cell("finish"), condition: cell("condition"), language: cell("language"), trade: cell("trade"), scryfall: cell("scryfall"),
      price: cell("price"), currency: cell("currency"), added: cell("added"), proxy: cell("proxy"), misprint: cell("misprint"),
      altered: cell("altered"), signed: cell("signed"),
    };
  });
}

/** Lines such as "4 Lightning Bolt", "1x Sol Ring (C21) 263" or "2 Opt (XLN) 65 *F*". Lines starting with // or # are skipped. */
function readTextRows(text: string): Parsed[] {
  const result: Parsed[] = [];
  text.replace(/^﻿/, "").split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#") || /^(deck|sideboard|commander|maybeboard)$/i.test(line)) return;
    const match = /^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,8})\)(?:\s+([A-Za-z0-9-]+[a-z★†]?))?)?((?:\s+\*[A-Z]+\*)*)\s*$/.exec(line)
      ?? /^()(.+?)(?:\s+\(([A-Za-z0-9]{2,8})\)(?:\s+(\S+))?)?((?:\s+\*[A-Z]+\*)*)\s*$/.exec(line);
    if (!match) return;
    const marks = (match[5] ?? "").toUpperCase();
    result.push({
      sourceRow: index + 1, name: match[2]!.trim(), quantity: match[1] || "1", set: "", setCode: match[3] ?? "", number: match[4] ?? "",
      finish: marks.includes("*E*") ? "etched" : marks.includes("*F*") ? "foil" : "", condition: "", language: "", trade: "", scryfall: "",
      price: "", currency: "", added: "", proxy: "", misprint: "", altered: "", signed: "",
    });
  });
  if (!result.length) throw new Error("The file has no card lines");
  return result;
}

/** Reads a finish written by any supported program. TCGplayer puts "Foil" after the condition. */
function readFinishCell(finish: string, condition: string): FinishCode | null {
  const text = finish.trim().toLowerCase();
  if (/\bfoil$/i.test(condition.trim()) && !text) return 1;
  if (["", "false", "no", "n", "0", "nonfoil", "non-foil", "normal", "regular"].includes(text)) return 0;
  if (["true", "yes", "y", "1", "foil"].includes(text)) return 1;
  if (text === "etched" || text === "etched foil") return 2;
  return null;
}

const toNumber = (text: string) => {
  const value = Number(text.replace(/^[$€£]/, "").replace(",", "."));
  return text && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
};
const toDate = (text: string) => (text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null);

type Addition = {
  cardId: string; foil: FinishCode; condition: Condition; language: string; proxy: boolean; quantity: number; trade: number;
  price: number | null; currency: string | null; added: string | null; misprint: boolean; altered: boolean; signed: boolean;
};

/**
 * Imports a collection file. Without a format the file's header decides it. Rows are matched by Scryfall id when the
 * file has one, otherwise by name, set and collector number.
 */
export function importCollectionCsv(database: DatabaseSync, text: string, commit = true, collectionId = "", format?: ImportFormat): CollectionImportResult {
  const chosen: ImportFormat = format && format in IMPORT_FORMATS ? format : detectFormat(text);
  const rows = chosen === "text" ? readTextRows(text) : readCsvRows(text, chosen);
  if (rows.length > 5000) throw new Error("A file can contain at most 5,000 rows per import");

  const findPrinting = database.prepare(
    `SELECT id FROM cards
     WHERE (name = ? COLLATE NOCASE OR flavor_name = ? COLLATE NOCASE OR name LIKE ? ESCAPE '\\')
       AND (? = '' OR lower(set_code) = lower(?) OR set_name = ? COLLATE NOCASE)
       AND (? = '' OR collector_number = ?)
     ORDER BY removed, lang != 'en', name = ? COLLATE NOCASE DESC, released_at DESC, set_code, collector_number
     LIMIT 1`,
  );
  const byId = database.prepare("SELECT id FROM cards WHERE id = ?");
  const unmatched: CollectionImportResult["unmatched"] = [];
  const additions = new Map<string, Addition>();
  let matchedRows = 0;
  let importedQuantity = 0;

  for (const row of rows) {
    const skip = (reason: string) => unmatched.push({ row: row.sourceRow, name: row.name, reason });
    if (!row.name && !row.scryfall) {
      skip("Card name is empty");
      continue;
    }
    const quantity = Number(row.quantity || "1");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      skip("Quantity must be a whole number from 1 to 10,000");
      continue;
    }
    const foil = readFinishCell(row.finish, row.condition);
    if (foil === null) {
      skip(`Unrecognized finish "${row.finish}"`);
      continue;
    }
    const condition = readCondition(row.condition.replace(/\s+foil$/i, ""));
    if (!condition) {
      skip(`Unrecognized condition "${row.condition}"`);
      continue;
    }
    const language = readLanguage(row.language);
    if (!language) {
      skip(`Unrecognized language "${row.language}"`);
      continue;
    }
    const trade = Number(row.trade || "0");
    if (!Number.isInteger(trade) || trade < 0) {
      skip("Tradelist count must be a whole number of 0 or more");
      continue;
    }
    const set = row.setCode || row.set;
    const named = set === row.set ? "" : row.set;
    const printing = (row.scryfall ? byId.get(row.scryfall.toLowerCase()) : undefined)
      ?? findPrinting.get(...nameMatch(row.name), set, set, set, row.number, row.number, row.name)
      ?? (named ? findPrinting.get(...nameMatch(row.name), named, named, named, row.number, row.number, row.name) : undefined);
    if (!printing) {
      const details = [set, row.number].filter(Boolean).join(" ");
      skip(details ? `No printing matched ${details}` : "No card with this name exists in the card database");
      continue;
    }
    const proxy = readFlag(row.proxy);
    const key = [printing.id, foil, condition, language, proxy].join("\u0000");
    const addition = additions.get(key) ?? {
      cardId: String(printing.id), foil, condition, language, proxy, quantity: 0, trade: 0, price: toNumber(row.price),
      currency: /^[A-Za-z]{3}$/.test(row.currency) ? row.currency.toUpperCase() : row.price ? "USD" : null, added: toDate(row.added),
      misprint: readFlag(row.misprint), altered: readFlag(row.altered), signed: readFlag(row.signed),
    };
    addition.quantity += quantity;
    addition.trade += Math.min(trade, quantity);
    additions.set(key, addition);
    matchedRows += 1;
    importedQuantity += quantity;
  }

  if (commit) {
    database.exec("BEGIN");
    try {
      const insert = database.prepare(
        `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, trade, purchase_price, price_currency, added_at, misprint, altered, signed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, ?, ?)
         ON CONFLICT(collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity),
           trade = MIN(MIN(10000, quantity + excluded.quantity), trade + excluded.trade), purchase_price = COALESCE(purchase_price, excluded.purchase_price),
           price_currency = COALESCE(price_currency, excluded.price_currency), misprint = MAX(misprint, excluded.misprint),
           altered = MAX(altered, excluded.altered), signed = MAX(signed, excluded.signed)`,
      );
      for (const item of additions.values()) {
        insert.run(collectionId, item.cardId, item.foil, item.condition, item.language, item.proxy ? 1 : 0, Math.min(10_000, item.quantity),
          Math.min(10_000, item.trade), item.price, item.currency, item.added, item.misprint ? 1 : 0, item.altered ? 1 : 0, item.signed ? 1 : 0);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const list = [...additions.values()];
  return {
    format: chosen, formatName: IMPORT_FORMATS[chosen], matchedRows, importedQuantity, unmatched,
    pricedCopies: list.filter((item) => item.price !== null && item.price > 0 && !item.proxy).reduce((sum, item) => sum + item.quantity, 0),
    additions: list.map((item) => ({
      key: { cardId: item.cardId, foil: item.foil, condition: item.condition, language: item.language, proxy: item.proxy }, quantity: Math.min(10_000, item.quantity),
      price: item.proxy ? null : item.price, currency: item.currency, added: item.added,
    })),
  };
}
