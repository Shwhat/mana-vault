import { nameMatch } from "./collection-import.js";
import { parse } from "csv-parse/sync";
import type { DatabaseSync } from "node:sqlite";
import { linkOwnedCopies } from "./decks.js";

type Zone = "main" | "sideboard" | "commander" | "maybeboard";
export type DeckImportRow = {
  name: string; quantity: number; set: string; collectorNumber: string; zone: Zone | null; sourceRow?: number; finish?: "" | "foil" | "etched";
};

/**
 * Splits the card part of a list line into name, set, collector number and finish marks: "Sauron, the Dark Lord (HOC) 36 *F*",
 * "Sol Ring [C21] #263", "Opt (XLN) 65". `*F*` marks foil and `*E*` etched; other marks such as `*CMDR*` are dropped.
 */
export function splitPrinting(raw: string): { name: string; set: string; number: string; finish: "" | "foil" | "etched" } {
  let text = raw.trim();
  let finish: "" | "foil" | "etched" = "";
  for (;;) {
    const mark = /\s*\*([A-Za-z]+)\*\s*$/.exec(text);
    if (!mark) break;
    const code = mark[1]!.toUpperCase();
    if (code === "E") finish = "etched";
    else if (code === "F" && finish !== "etched") finish = "foil";
    text = text.slice(0, mark.index).trim();
  }
  const printing = /^(.*?)\s*[[(]([A-Za-z0-9]{2,6})[\])]\s*#?([A-Za-z0-9-]+[a-z\u2605\u2020]?)?$/.exec(text);
  return { name: (printing?.[1] ?? text).trim(), set: printing?.[2] ?? "", number: printing?.[3] ?? "", finish };
}

export interface DeckImportResult {
  matchedRows: number;
  importedQuantity: number;
  linked?: number;
  unmatched: Array<{ row: number; name: string; reason: string }>;
}

function cell(row: Record<string, string>, ...aliases: string[]): string {
  const key = Object.keys(row).find((candidate) => aliases.includes(candidate.trim().toLowerCase()));
  return key ? (row[key] ?? "").trim() : "";
}

function zoneFrom(value: string, fallback: Zone): Zone | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["main", "mainboard", "deck"].includes(normalized)) return "main";
  if (["side", "sideboard", "sb"].includes(normalized)) return "sideboard";
  if (["commander", "command zone"].includes(normalized)) return "commander";
  if (["maybe", "maybeboard", "considering"].includes(normalized)) return "maybeboard";
  return null;
}

function parseCsv(text: string): DeckImportRow[] | null {
  let rows: Record<string, string>[];
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true, max_record_size: 100_000 });
  } catch {
    return null;
  }
  if (!rows.length || !Object.keys(rows[0] ?? {}).some((key) => ["name", "card name"].includes(key.trim().toLowerCase()))) {
    return null;
  }
  return rows.map((row, index) => {
    const zone = zoneFrom(cell(row, "zone", "board", "section", "location"), "main");
    return {
      name: cell(row, "name", "card name"),
      quantity: Number(cell(row, "quantity", "count", "qty") || "1"),
      set: cell(row, "set", "set code", "edition"),
      collectorNumber: cell(row, "collector number", "collector_number", "number"),
      zone,
      sourceRow: index + 2,
    };
  });
}

export function parseText(text: string): DeckImportRow[] {
  let zone: Zone = "main";
  const result: DeckImportRow[] = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const section = trimmed.replace(/^(?:\/\/|#)\s*/, "").trim();
    const sectionZone = zoneFrom(section, zone);
    if (/^(?:(?:\/\/|#)\s*)?(?:main(?:board)?|deck|side(?:board)?|commander|maybe(?:board)?|considering)(?:\s*:)?$/i.test(trimmed)) {
      if (sectionZone) zone = sectionZone;
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    const match = /^(?:(SB|SIDEBOARD|COMMANDER)\s*:\s*)?(\d+)\s*x?\s+(.+)$/i.exec(trimmed);
    if (!match) {
      result.push({ name: trimmed, quantity: Number.NaN, set: "", collectorNumber: "", zone, sourceRow: lineIndex + 1 });
      continue;
    }
    const rowZone = match[1] ? zoneFrom(match[1], zone) ?? zone : zone;
    const card = splitPrinting(match[3] ?? "");
    result.push({
      quantity: Number(match[2] ?? "0"),
      name: card.name,
      set: card.set,
      collectorNumber: card.number,
      finish: card.finish,
      zone: rowZone,
      sourceRow: lineIndex + 1,
    });
  }
  return result;
}

export function importDecklist(
  database: DatabaseSync,
  deckId: string,
  _mode: "normal" | "theme",
  content: string,
  commit = true,
  userId?: number,
): DeckImportResult {
  const rows = parseCsv(content) ?? parseText(content);
  if (!rows.length) throw new Error("Decklist has no card rows");
  if (rows.length > 5000) throw new Error("Decklist can contain at most 5,000 rows per import");

  const find = printingFinder(database);
  const unmatched: DeckImportResult["unmatched"] = [];
  const additions = new Map<string, { oracleId: string; printingId: string | null; quantity: number; zone: Zone; finish: number; named: boolean }>();
  let matchedRows = 0;
  let importedQuantity = 0;
  let linked = 0;

  rows.forEach((row, index) => {
    const sourceRow = row.sourceRow ?? index + 1;
    if (!row.name) {
      unmatched.push({ row: sourceRow, name: "", reason: "Card name is empty" });
      return;
    }
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 100) {
      unmatched.push({ row: sourceRow, name: row.name, reason: "Quantity must be a whole number from 1 to 100" });
      return;
    }
    const printing = find(row.name, row.set, row.collectorNumber);
    if (!printing) {
      unmatched.push({
        row: sourceRow,
        name: row.name,
        reason: row.set || row.collectorNumber ? "No printing matched the supplied set and collector number" : "No card with this name exists in the card database",
      });
      return;
    }
    if (!row.zone) {
      unmatched.push({ row: sourceRow, name: row.name, reason: "Zone must be Main, Sideboard, Commander or Maybeboard" });
      return;
    }
    // every deck keeps a printing: the one named, or the newest printing of the card
    const finish = row.finish === "etched" ? 2 : row.finish === "foil" ? 1 : 0;
    const key = `${printing.oracle_id}\u0000${row.zone}\u0000${printing.id}\u0000${finish}`;
    const addition = additions.get(key) ?? {
      oracleId: printing.oracle_id,
      printingId: printing.id as string | null,
      quantity: 0,
      zone: row.zone,
      finish,
      named: false,
    };
    // a line naming its set and collector number is linked to free copies of exactly that printing and finish
    if (row.set && row.collectorNumber) addition.named = true;
    addition.quantity += row.quantity;
    additions.set(key, addition);
    matchedRows += 1;
    importedQuantity += row.quantity;
  });

  if (commit) {
    database.exec("BEGIN");
    try {
      for (const addition of additions.values()) {
        const insert = addition.printingId
          ? database.prepare(
            `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone, finish) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(deck_id, oracle_id, printing_id, zone, finish) WHERE printing_id IS NOT NULL
             DO UPDATE SET quantity = quantity + excluded.quantity`,
          )
          : database.prepare(
            `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone, finish) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(deck_id, oracle_id, zone) WHERE printing_id IS NULL
             DO UPDATE SET quantity = quantity + excluded.quantity`,
          );
        insert.run(deckId, addition.oracleId, addition.printingId, addition.quantity, addition.zone, addition.finish);
      }
      if (additions.size) database.prepare("UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(deckId);
      if (userId !== undefined) {
        const idOf = database.prepare("SELECT id FROM deck_cards WHERE deck_id = ? AND printing_id = ? AND zone = ? AND finish = ?");
        const ids = new Set([...additions.values()].filter((item) => item.named && item.printingId)
          .map((item) => Number(idOf.get(deckId, item.printingId, item.zone, item.finish)?.id ?? 0)));
        linked = ids.size ? linkOwnedCopies(database, deckId, userId, ids) : 0;
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  return { matchedRows, importedQuantity, linked, unmatched };
}

/** Finds the printing for a name, with an optional set and collector number: the named printing, or the newest one. */
export function printingFinder(database: DatabaseSync) {
  const statement = database.prepare(
    `SELECT id, oracle_id, name FROM cards
     WHERE (name = ? COLLATE NOCASE OR flavor_name = ? COLLATE NOCASE OR name LIKE ? ESCAPE '\\')
       AND (? = '' OR lower(set_code) = lower(?) OR set_name = ? COLLATE NOCASE)
       AND (? = '' OR collector_number = ?)
     ORDER BY name = ? COLLATE NOCASE DESC, released_at DESC, set_code, collector_number
     LIMIT 1`,
  );
  // a line whose name does not match (another language, a typo) is still found by its set and collector number
  const bySetNumber = database.prepare(
    "SELECT id, oracle_id, name FROM cards WHERE lower(set_code) = lower(?) AND collector_number = ? COLLATE NOCASE ORDER BY released_at DESC LIMIT 1",
  );
  return (name: string, set = "", number = "") =>
    (statement.get(...nameMatch(name), set, set, set, number, number, name)
      ?? (set && number ? bySetNumber.get(set, number) : undefined)) as { id: string; oracle_id: string; name: string } | undefined;
}
