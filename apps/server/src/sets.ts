// ---------- sets: Scryfall's set list, used for set names and printed sizes in set completion ----------
import type { DatabaseSync } from "node:sqlite";

export type SetRow = {
  code: string;
  name: string;
  set_type: string;
  released_at: string | null;
  printed_size: number | null;
  card_count: number | null;
};

/** Saves the "data" list from https://api.scryfall.com/sets. Returns how many sets were saved. */
export function saveSets(database: DatabaseSync, body: unknown): number {
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) throw new Error("Scryfall sets response has no data list");
  const upsert = database.prepare(
    `INSERT INTO sets (code, name, set_type, released_at, printed_size, card_count, icon_svg_uri, parent_set_code, block, block_code, digital, foil_only, nonfoil_only)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, set_type = excluded.set_type, released_at = excluded.released_at,
       printed_size = excluded.printed_size, card_count = excluded.card_count, icon_svg_uri = excluded.icon_svg_uri,
       parent_set_code = excluded.parent_set_code, block = excluded.block, block_code = excluded.block_code, digital = excluded.digital,
       foil_only = excluded.foil_only, nonfoil_only = excluded.nonfoil_only`,
  );
  let saved = 0;
  database.exec("BEGIN");
  try {
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const set = entry as Record<string, unknown>;
      if (typeof set.code !== "string" || typeof set.name !== "string") continue;
      const integer = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
      const textOf = (value: unknown) => (typeof value === "string" && value ? value : null);
      const flag = (value: unknown) => (value === true ? 1 : 0);
      // the set symbol must be one of Scryfall's own SVG files
      const icon = textOf(set.icon_svg_uri);
      upsert.run(
        set.code.toLowerCase(), set.name, typeof set.set_type === "string" ? set.set_type : "",
        typeof set.released_at === "string" ? set.released_at : null, integer(set.printed_size), integer(set.card_count),
        icon && icon.startsWith("https://svgs.scryfall.io/") ? icon : null, textOf(set.parent_set_code)?.toLowerCase() ?? null,
        textOf(set.block), textOf(set.block_code)?.toLowerCase() ?? null, flag(set.digital), flag(set.foil_only), flag(set.nonfoil_only),
      );
      saved += 1;
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return saved;
}

/** The symbol and details of a set (0.15.0), as the interface shows them. */
export type SetDetails = {
  symbolUrl: string | null; block: string | null; parentSetCode: string | null; digital: boolean; foilOnly: boolean; nonfoilOnly: boolean;
};

const DETAIL_COLUMNS = `s.block, s.parent_set_code, s.digital, s.foil_only, s.nonfoil_only, y.uri AS symbol_uri,
  (SELECT length(cs.symbol) FROM custom_sets cs WHERE cs.code = s.code AND cs.symbol IS NOT NULL) AS custom_symbol`;

/** The address of a set's symbol: a custom set's own symbol, or the Scryfall symbol the card database update saved. */
function symbolUrlOf(code: string, row: Record<string, unknown>): string | null {
  if (row.custom_symbol != null) return `/api/custom/sets/${code}/symbol?v=${Number(row.custom_symbol)}`;
  if (row.symbol_uri != null) return `/api/set-symbols/${code}?v=${encodeURIComponent(String(row.symbol_uri).split("?")[1] ?? "1")}`;
  return null;
}

const detailsOf = (code: string, row: Record<string, unknown> | undefined): SetDetails => ({
  symbolUrl: row ? symbolUrlOf(code, row) : null, block: typeof row?.block === "string" ? row.block : null,
  parentSetCode: typeof row?.parent_set_code === "string" ? row.parent_set_code : null, digital: Number(row?.digital ?? 0) === 1,
  foilOnly: Number(row?.foil_only ?? 0) === 1, nonfoilOnly: Number(row?.nonfoil_only ?? 0) === 1,
});

/** The symbol and details of one set. */
export function setDetails(database: DatabaseSync, code: string): SetDetails {
  const row = database.prepare(`SELECT ${DETAIL_COLUMNS} FROM sets s LEFT JOIN set_symbols y ON y.code = s.code WHERE s.code = ?`).get(code) as Record<string, unknown> | undefined;
  return detailsOf(code, row);
}

/**
 * Every set that has printings in the card database, with its name, printed size, symbol and details. Sets missing from
 * the Scryfall set list (before the first update after 0.2.0) use the name from their printings.
 */
export function listSets(database: DatabaseSync, query = ""): Array<SetRow & SetDetails & { printings: number }> {
  const term = `%${query.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  const rows = database.prepare(
    `SELECT * FROM (
       SELECT c.set_code AS code, COALESCE(s.name, MAX(c.set_name)) AS name, COALESCE(s.set_type, '') AS set_type,
              COALESCE(s.released_at, MAX(c.released_at)) AS released_at, s.printed_size, s.card_count, COUNT(*) AS printings, ${DETAIL_COLUMNS}
       FROM cards c LEFT JOIN sets s ON s.code = c.set_code LEFT JOIN set_symbols y ON y.code = c.set_code
       WHERE c.removed = 0
       GROUP BY c.set_code
     ) WHERE code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
     ORDER BY released_at DESC, name`,
  ).all(term, term) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const { block: _block, parent_set_code: _parent, digital: _digital, foil_only: _foil, nonfoil_only: _nonfoil, symbol_uri: _uri, custom_symbol: _custom, ...base } = row;
    return { ...(base as unknown as SetRow & { printings: number }), ...detailsOf(String(row.code), row) };
  });
}

/** Scryfall sets that have a saved symbol, for choosing a custom set's symbol (Scryfall set symbol...). */
export function setsWithSymbols(database: DatabaseSync, query = ""): Array<{ code: string; name: string; released_at: string | null; symbolUrl: string }> {
  const term = `%${query.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  return (database.prepare(
    `SELECT s.code, s.name, s.released_at, y.uri FROM sets s JOIN set_symbols y ON y.code = s.code
     WHERE s.set_type != 'custom' AND (s.code LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\') ORDER BY s.released_at DESC, s.name LIMIT 300`,
  ).all(term, term) as Array<Record<string, unknown>>).map((row) => ({
    code: String(row.code), name: String(row.name), released_at: (row.released_at as string | null) ?? null,
    symbolUrl: `/api/set-symbols/${String(row.code)}?v=${encodeURIComponent(String(row.uri).split("?")[1] ?? "1")}`,
  }));
}
