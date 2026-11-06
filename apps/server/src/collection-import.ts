import { parse } from "csv-parse/sync";
import type { DatabaseSync } from "node:sqlite";

type CsvRow = Record<string, string>;

export interface CollectionImportResult {
  matchedRows: number;
  importedQuantity: number;
  unmatched: Array<{ row: number; name: string; reason: string }>;
}

function findColumn(columns: string[], ...names: string[]): string | undefined {
  return columns.find((column) => names.includes(column.trim().toLowerCase()));
}

function readCell(row: CsvRow, column: string | undefined): string {
  return column ? (row[column] ?? "").trim() : "";
}

export function importCollectionCsv(database: DatabaseSync, csv: string): CollectionImportResult {
  let rows: CsvRow[];
  try {
    rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true, trim: true, max_record_size: 100_000 });
  } catch (error) {
    throw new Error(`Could not read CSV: ${error instanceof Error ? error.message : "invalid CSV"}`);
  }
  if (!rows.length) throw new Error("CSV has no card rows");

  const columns = Object.keys(rows[0] ?? {});
  const nameColumn = findColumn(columns, "name", "card name");
  if (!nameColumn) throw new Error('CSV needs a "Name" or "Card Name" column');
  if (rows.length > 5000) throw new Error("CSV can contain at most 5,000 rows per import");

  const quantityColumn = findColumn(columns, "count", "quantity", "qty");
  const setColumn = findColumn(columns, "edition", "set", "set code", "set name");
  const collectorColumn = findColumn(columns, "collector number", "collector_number", "number");
  const foilColumn = findColumn(columns, "foil");
  const findPrinting = database.prepare(
    `SELECT id FROM cards
     WHERE name = ? COLLATE NOCASE
       AND (? = '' OR lower(set_code) = lower(?) OR set_name = ? COLLATE NOCASE)
       AND (? = '' OR collector_number = ?)
     ORDER BY released_at DESC, set_code, collector_number
     LIMIT 1`,
  );
  const unmatched: CollectionImportResult["unmatched"] = [];
  const additions = new Map<string, { cardId: string; foil: boolean; quantity: number }>();
  let matchedRows = 0;
  let importedQuantity = 0;

  rows.forEach((row, index) => {
    const name = readCell(row, nameColumn);
    if (!name) {
      unmatched.push({ row: index + 2, name: "", reason: "Card name is empty" });
      return;
    }

    const quantityText = readCell(row, quantityColumn) || "1";
    const quantity = Number(quantityText);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      unmatched.push({ row: index + 2, name, reason: "Quantity must be a whole number from 1 to 10,000" });
      return;
    }

    const foilText = readCell(row, foilColumn).toLowerCase();
    if (!["", "false", "no", "n", "0", "true", "yes", "y", "1", "foil", "nonfoil", "non-foil"].includes(foilText)) {
      unmatched.push({ row: index + 2, name, reason: `Unrecognized foil value "${foilText}"` });
      return;
    }
    const foil = ["true", "yes", "y", "1", "foil"].includes(foilText);
    const set = readCell(row, setColumn);
    const collectorNumber = readCell(row, collectorColumn);
    const printing = findPrinting.get(name, set, set, set, collectorNumber, collectorNumber) as { id: string } | undefined;
    if (!printing) {
      const details = [set, collectorNumber].filter(Boolean).join(" ");
      unmatched.push({
        row: index + 2,
        name,
        reason: details ? `No printing matched ${details}` : "No card with this name exists in the local catalog",
      });
      return;
    }

    const key = `${printing.id}\u0000${foil ? "1" : "0"}`;
    const addition = additions.get(key) ?? { cardId: printing.id, foil, quantity: 0 };
    addition.quantity += quantity;
    additions.set(key, addition);
    matchedRows += 1;
    importedQuantity += quantity;
  });

  database.exec("BEGIN");
  try {
    const insert = database.prepare(
      `INSERT INTO collection_items (card_id, quantity, foil) VALUES (?, ?, ?)
       ON CONFLICT(card_id, foil) DO UPDATE SET quantity = quantity + excluded.quantity`,
    );
    for (const addition of additions.values()) {
      insert.run(addition.cardId, addition.quantity, addition.foil ? 1 : 0);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { matchedRows, importedQuantity, unmatched };
}
