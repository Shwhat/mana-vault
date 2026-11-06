import { parse } from "csv-parse/sync";
import type { DatabaseSync } from "node:sqlite";

type Zone = "main" | "sideboard" | "commander";
type DeckImportRow = { name: string; quantity: number; set: string; collectorNumber: string; zone: Zone | null; sourceRow?: number };

export interface DeckImportResult {
  matchedRows: number;
  importedQuantity: number;
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

function parseText(text: string): DeckImportRow[] {
  let zone: Zone = "main";
  const result: DeckImportRow[] = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const section = trimmed.replace(/^(?:\/\/|#)\s*/, "").trim();
    const sectionZone = zoneFrom(section, zone);
    if (/^(?:(?:\/\/|#)\s*)?(?:main(?:board)?|deck|side(?:board)?|commander)(?:\s*:)?$/i.test(trimmed)) {
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
    const rawCard = match[3] ?? "";
    const printing = /^(.*?)\s*[\[(]([A-Za-z0-9]{2,6})[\])]\s*#?([A-Za-z0-9-]+)?$/.exec(rawCard.trim());
    result.push({
      quantity: Number(match[2] ?? "0"),
      name: (printing?.[1] ?? rawCard).trim(),
      set: printing?.[2] ?? "",
      collectorNumber: printing?.[3] ?? "",
      zone: rowZone,
      sourceRow: lineIndex + 1,
    });
  }
  return result;
}

export function importDecklist(
  database: DatabaseSync,
  deckId: string,
  mode: "normal" | "theme",
  content: string,
): DeckImportResult {
  const rows = parseCsv(content) ?? parseText(content);
  if (!rows.length) throw new Error("Decklist has no card rows");
  if (rows.length > 5000) throw new Error("Decklist can contain at most 5,000 rows per import");

  const findPrinting = database.prepare(
    `SELECT id, oracle_id FROM cards
     WHERE name = ? COLLATE NOCASE
       AND (? = '' OR lower(set_code) = lower(?) OR set_name = ? COLLATE NOCASE)
       AND (? = '' OR collector_number = ?)
     ORDER BY released_at DESC, set_code, collector_number
     LIMIT 1`,
  );
  const unmatched: DeckImportResult["unmatched"] = [];
  const additions = new Map<string, { oracleId: string; printingId: string | null; quantity: number; zone: Zone }>();
  let matchedRows = 0;
  let importedQuantity = 0;

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
    if (mode === "theme" && (!row.set || !row.collectorNumber)) {
      unmatched.push({ row: sourceRow, name: row.name, reason: "Theme decks need both a set and collector number" });
      return;
    }
    const printing = findPrinting.get(
      row.name, row.set, row.set, row.set, row.collectorNumber, row.collectorNumber,
    ) as { id: string; oracle_id: string } | undefined;
    if (!printing) {
      unmatched.push({
        row: sourceRow,
        name: row.name,
        reason: row.set || row.collectorNumber ? "No printing matched the supplied set and collector number" : "No card with this name exists in the local catalog",
      });
      return;
    }
    if (!row.zone) {
      unmatched.push({ row: sourceRow, name: row.name, reason: "Zone must be Main, Sideboard, or Commander" });
      return;
    }
    const key = `${printing.oracle_id}\u0000${row.zone}\u0000${mode === "theme" ? printing.id : ""}`;
    const addition = additions.get(key) ?? {
      oracleId: printing.oracle_id,
      printingId: mode === "theme" ? printing.id : null,
      quantity: 0,
      zone: row.zone,
    };
    addition.quantity += row.quantity;
    if (mode === "theme") addition.printingId = printing.id;
    additions.set(key, addition);
    matchedRows += 1;
    importedQuantity += row.quantity;
  });

  database.exec("BEGIN");
  try {
    for (const addition of additions.values()) {
      const insert = addition.printingId
        ? database.prepare(
          `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(deck_id, oracle_id, printing_id, zone) WHERE printing_id IS NOT NULL
           DO UPDATE SET quantity = quantity + excluded.quantity`,
        )
        : database.prepare(
          `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(deck_id, oracle_id, zone) WHERE printing_id IS NULL
           DO UPDATE SET quantity = quantity + excluded.quantity`,
        );
      insert.run(deckId, addition.oracleId, addition.printingId, addition.quantity, addition.zone);
    }
    if (additions.size) database.prepare("UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(deckId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { matchedRows, importedQuantity, unmatched };
}
