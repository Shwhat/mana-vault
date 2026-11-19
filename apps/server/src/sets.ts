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
    `INSERT INTO sets (code, name, set_type, released_at, printed_size, card_count) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, set_type = excluded.set_type, released_at = excluded.released_at,
       printed_size = excluded.printed_size, card_count = excluded.card_count`,
  );
  let saved = 0;
  database.exec("BEGIN");
  try {
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const set = entry as Record<string, unknown>;
      if (typeof set.code !== "string" || typeof set.name !== "string") continue;
      const integer = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
      upsert.run(
        set.code.toLowerCase(), set.name, typeof set.set_type === "string" ? set.set_type : "",
        typeof set.released_at === "string" ? set.released_at : null, integer(set.printed_size), integer(set.card_count),
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

/**
 * Every set that has printings in the card database, with its name and printed size. Sets missing from
 * the Scryfall set list (before the first update after 0.2.0) use the name from their printings.
 */
export function listSets(database: DatabaseSync, query = ""): Array<SetRow & { printings: number }> {
  const term = `%${query.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  return database.prepare(
    `SELECT * FROM (
       SELECT c.set_code AS code, COALESCE(s.name, MAX(c.set_name)) AS name, COALESCE(s.set_type, '') AS set_type,
              COALESCE(s.released_at, MAX(c.released_at)) AS released_at, s.printed_size, s.card_count, COUNT(*) AS printings
       FROM cards c LEFT JOIN sets s ON s.code = c.set_code
       GROUP BY c.set_code
     ) WHERE code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
     ORDER BY released_at DESC, name`,
  ).all(term, term) as Array<SetRow & { printings: number }>;
}
