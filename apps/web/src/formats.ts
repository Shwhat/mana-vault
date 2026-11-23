// ---------- export formats: the files other programs read ----------
import { csvCell } from "./api";
import { conditionName, languageName } from "./types";

export type ExportFormat = "manavault" | "moxfield" | "manabox" | "archidekt" | "deckbox" | "tcgplayer" | "text";

export const EXPORT_FORMATS: Array<[ExportFormat, string]> = [
  ["manavault", "Mana Vault CSV"],
  ["moxfield", "Moxfield CSV"],
  ["manabox", "ManaBox CSV"],
  ["archidekt", "Archidekt CSV"],
  ["deckbox", "Deckbox CSV"],
  ["tcgplayer", "TCGplayer CSV"],
  ["text", "Plain text list"],
];

/** Every format an import can read; the server works out which one a file is. */
export const IMPORT_FORMATS: Array<[string, string]> = EXPORT_FORMATS;

/** One line of an export: a printing in a finish, condition and language, with its copy details. */
export type ExportRow = {
  quantity: number; trade?: number; name: string; set_code: string; set_name: string; collector_number: string; rarity?: string; cardId: string;
  foil: 0 | 1 | 2; condition?: string; language?: string; proxy?: boolean; purchase_price?: number | null; price_currency?: string | null;
  added_at?: string | null; misprint?: boolean; altered?: boolean; signed?: boolean;
};

const MOXFIELD_CONDITIONS: Record<string, string> = {
  M: "Mint", NM: "Near Mint", LP: "Lightly Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Damaged",
};
const MANABOX_CONDITIONS: Record<string, string> = {
  M: "mint", NM: "near_mint", LP: "light_played", MP: "good", HP: "played", DMG: "poor",
};
const finishWord = (foil: number) => (foil === 2 ? "etched" : foil === 1 ? "foil" : "");
const yes = (value: boolean | undefined) => (value ? "true" : "false");
const csv = (rows: Array<Array<string | number | boolean | null | undefined>>) => rows.map((row) => row.map((cell) => csvCell(cell ?? "")).join(",")).join("\r\n");

/**
 * Builds the file text for a list of rows. A deck's notes (its top notes page, 0.22.0) go at the end of a plain text
 * list as comment lines starting with "//", which deck imports skip.
 */
export function exportText(rows: ExportRow[], format: ExportFormat, notes = ""): { text: string; extension: string; type: string } {
  const condition = (row: ExportRow) => row.condition ?? "NM";
  const language = (row: ExportRow) => row.language ?? "en";
  if (format === "text") {
    const lines = rows.map((row) => `${row.quantity} ${row.name} (${row.set_code.toUpperCase()}) ${row.collector_number}${row.foil === 2 ? " *E*" : row.foil ? " *F*" : ""}`);
    if (notes.trim()) lines.push("", "// Notes", ...notes.trim().split(/\r?\n/).map((line) => (line ? `// ${line}` : "//")));
    return { text: lines.join("\r\n"), extension: "txt", type: "text/plain;charset=utf-8" };
  }
  const table: Array<Array<string | number | boolean | null | undefined>> = [];
  switch (format) {
    case "manavault":
      table.push(["Quantity", "Trade", "Name", "Set code", "Collector number", "Finish", "Condition", "Language", "Proxy", "Purchase price", "Purchase currency",
        "Added", "Misprint", "Altered", "Signed", "Scryfall ID"]);
      for (const row of rows) {
        table.push([row.quantity, row.trade ?? 0, row.name, row.set_code, row.collector_number, finishWord(row.foil) || "normal", condition(row), language(row),
          yes(row.proxy), row.purchase_price ?? "", row.price_currency ?? "", row.added_at ?? "", yes(row.misprint), yes(row.altered), yes(row.signed), row.cardId]);
      }
      break;
    case "moxfield":
      table.push(["Count", "Tradelist Count", "Name", "Edition", "Condition", "Language", "Foil", "Tags", "Last Modified", "Collector Number", "Alter", "Proxy", "Purchase Price"]);
      for (const row of rows) {
        table.push([row.quantity, row.trade ?? 0, row.name, row.set_code, MOXFIELD_CONDITIONS[condition(row)] ?? conditionName(condition(row)), languageName(language(row)),
          finishWord(row.foil), "", "", row.collector_number, row.altered ? "True" : "False", row.proxy ? "True" : "False", row.purchase_price ?? ""]);
      }
      break;
    case "manabox":
      table.push(["Name", "Set code", "Set name", "Collector number", "Foil", "Rarity", "Quantity", "ManaBox ID", "Scryfall ID", "Purchase price", "Misprint",
        "Altered", "Signed", "Condition", "Language", "Proxy", "Purchase price currency", "Added"]);
      for (const row of rows) {
        table.push([row.name, row.set_code.toUpperCase(), row.set_name, row.collector_number, finishWord(row.foil) || "normal", row.rarity ?? "", row.quantity, "", row.cardId,
          row.purchase_price ?? "", yes(row.misprint), yes(row.altered), yes(row.signed), MANABOX_CONDITIONS[condition(row)] ?? "near_mint", language(row), yes(row.proxy),
          row.price_currency ?? "", row.added_at ?? ""]);
      }
      break;
    case "archidekt":
      table.push(["Quantity", "Name", "Finish", "Condition", "Date Added", "Language", "Purchase Price", "Tags", "Edition Name", "Edition Code", "Collector Number", "Scryfall ID"]);
      for (const row of rows) {
        table.push([row.quantity, row.name, row.foil === 2 ? "Etched" : row.foil ? "Foil" : "Normal", condition(row), row.added_at?.slice(0, 10) ?? "", language(row).toUpperCase(),
          row.purchase_price ?? "", "", row.set_name, row.set_code, row.collector_number, row.cardId]);
      }
      break;
    case "deckbox":
      table.push(["Count", "Tradelist Count", "Name", "Edition", "Edition Code", "Card Number", "Condition", "Language", "Foil", "Signed", "Artist Proof", "Altered Art", "Misprint",
        "Promo", "Textless", "My Price"]);
      for (const row of rows) {
        table.push([row.quantity, row.trade ?? 0, row.name, row.set_name, row.set_code, row.collector_number, MOXFIELD_CONDITIONS[condition(row)] ?? "Near Mint",
          languageName(language(row)), row.foil ? "foil" : "", row.signed ? "signed" : "", "", row.altered ? "altered" : "", row.misprint ? "misprint" : "", "", "", ""]);
      }
      break;
    case "tcgplayer":
      table.push(["Quantity", "Name", "Set", "Card Number", "Set Code", "Printing", "Condition", "Language", "Rarity"]);
      for (const row of rows) {
        table.push([row.quantity, row.name, row.set_name, row.collector_number, row.set_code.toUpperCase(), row.foil ? "Foil" : "Normal",
          MOXFIELD_CONDITIONS[condition(row)] ?? "Near Mint", languageName(language(row)), row.rarity ?? ""]);
      }
      break;
  }
  return { text: csv(table), extension: "csv", type: "text/csv;charset=utf-8" };
}
