// ---------- more Scryfall data kept on the server (0.15.0): set symbols, the symbol list, printing changes, name and
// keyword lists and the card back. Each part is downloaded with the card database update; a part that fails keeps what
// was stored before. ----------
import type { DatabaseSync } from "node:sqlite";
import { cleanSvg } from "./svg.js";

type Fetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>;
}>;

const userAgent = "mana-vault/0.0.0 (local card database importer)";
const API = "https://api.scryfall.com";

async function getJson(fetcher: Fetcher, url: string): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Scryfall answered ${response.status} for ${url}`);
  return await response.json() as Record<string, unknown>;
}

async function getText(fetcher: Fetcher, url: string): Promise<string> {
  const response = await fetcher(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`Scryfall answered ${response.status} for ${url}`);
  return await response.text();
}

/** Runs the work for every item, a few at a time. */
async function inTurns<T>(items: T[], slots: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(slots, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  }));
}

const setMeta = (database: DatabaseSync, key: string, value: string) => database.prepare(
  "INSERT INTO catalog_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
).run(key, value);

// ---------- 7.1 set symbols ----------

/**
 * Downloads the symbol of every set whose symbol address changed since it was last saved (Scryfall's addresses carry a
 * stamp, so a changed symbol has a new address). Returns how many were saved.
 */
export async function downloadSetSymbols(database: DatabaseSync, fetcher: Fetcher): Promise<number> {
  const wanted = database.prepare(
    `SELECT s.code, s.icon_svg_uri AS uri FROM sets s LEFT JOIN set_symbols y ON y.code = s.code
     WHERE s.icon_svg_uri IS NOT NULL AND (y.uri IS NULL OR y.uri != s.icon_svg_uri)`,
  ).all() as Array<{ code: string; uri: string }>;
  const save = database.prepare(
    "INSERT INTO set_symbols (code, uri, svg) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET uri = excluded.uri, svg = excluded.svg, saved_at = strftime('%Y-%m-%d %H:%M:%f', 'now')",
  );
  // many sets share one symbol file, so each file is downloaded once
  const files = new Map<string, string | null>();
  let saved = 0;
  await inTurns([...new Set(wanted.map((row) => row.uri))], 6, async (uri) => {
    try {
      files.set(uri, cleanSvg(await getText(fetcher, uri)));
    } catch {
      files.set(uri, null);
    }
  });
  for (const row of wanted) {
    const svg = files.get(row.uri);
    if (!svg) continue;
    save.run(row.code, row.uri, svg);
    saved += 1;
  }
  setMeta(database, "set_symbols_at", new Date().toISOString());
  return saved;
}

// ---------- 7.2 the symbol list ----------

/** Downloads Scryfall's list of symbols with their pictures and keeps both. Returns how many symbols were saved. */
export async function importSymbology(database: DatabaseSync, fetcher: Fetcher): Promise<number> {
  const body = await getJson(fetcher, `${API}/symbology`);
  const data = Array.isArray(body.data) ? body.data as Array<Record<string, unknown>> : [];
  if (!data.length) throw new Error("Scryfall's symbol list is empty");
  const pictures = new Map<string, string>();
  await inTurns(data.filter((item) => typeof item.svg_uri === "string" && String(item.svg_uri).startsWith("https://svgs.scryfall.io/")), 6, async (item) => {
    try {
      const svg = cleanSvg(await getText(fetcher, String(item.svg_uri)));
      if (svg) pictures.set(String(item.symbol), svg);
    } catch {
      // a symbol picture that cannot be had is drawn as a circle with its letters
    }
  });
  const meta = database.prepare(
    `INSERT INTO symbology (symbol, code, english, mana_value, colors, hybrid, phyrexian, represents_mana, funny, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET code = excluded.code, english = excluded.english, mana_value = excluded.mana_value, colors = excluded.colors,
       hybrid = excluded.hybrid, phyrexian = excluded.phyrexian, represents_mana = excluded.represents_mana, funny = excluded.funny, position = excluded.position`,
  );
  const svg = database.prepare("INSERT INTO symbols (code, svg) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET svg = excluded.svg");
  database.exec("BEGIN");
  try {
    data.forEach((item, position) => {
      const symbol = String(item.symbol ?? "");
      if (!/^\{[^}]{1,8}\}$/.test(symbol)) return;
      const code = symbol.slice(1, -1).toUpperCase().replace(/\//g, "");
      meta.run(symbol, code, String(item.english ?? ""), typeof item.mana_value === "number" ? item.mana_value : null,
        Array.isArray(item.colors) ? (item.colors as string[]).join("") : "", item.hybrid === true ? 1 : 0, item.phyrexian === true ? 1 : 0,
        item.represents_mana === true ? 1 : 0, item.funny === true ? 1 : 0, position);
      const picture = pictures.get(symbol);
      if (picture) svg.run(code, picture);
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  setMeta(database, "symbology_at", new Date().toISOString());
  return data.length;
}

// ---------- 7.3 printing changes ----------

/** Moves everything held of one printing onto another (a Scryfall merge), joining entries that already exist. */
export function mergePrinting(database: DatabaseSync, oldId: string, newId: string): void {
  if (oldId === newId) return;
  // copies: the same copy of the new printing gets the count and trade count added
  const copies = database.prepare("SELECT rowid, * FROM collection_cards WHERE card_id = ?").all(oldId) as Array<Record<string, unknown>>;
  for (const copy of copies) {
    const same = database.prepare(
      "SELECT rowid, quantity, trade FROM collection_cards WHERE collection_id = ? AND card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?",
    ).get(copy.collection_id as string, newId, copy.foil as number, copy.condition as string, copy.language as string, copy.proxy as number);
    if (same) {
      database.prepare("UPDATE collection_cards SET quantity = MIN(10000, quantity + ?), trade = MIN(10000, trade + ?) WHERE rowid = ?")
        .run(Number(copy.quantity), Number(copy.trade ?? 0), Number(same.rowid));
      database.prepare("DELETE FROM collection_cards WHERE rowid = ?").run(Number(copy.rowid));
    } else {
      database.prepare("UPDATE collection_cards SET card_id = ? WHERE rowid = ?").run(newId, Number(copy.rowid));
    }
  }
  // deck links follow their copies
  const links = database.prepare("SELECT * FROM deck_links WHERE card_id = ?").all(oldId) as Array<Record<string, unknown>>;
  for (const link of links) {
    const same = database.prepare(
      "SELECT id FROM deck_links WHERE deck_card_id = ? AND collection_id = ? AND card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?",
    ).get(link.deck_card_id as number, link.collection_id as string, newId, link.foil as number, link.condition as string, link.language as string, link.proxy as number);
    if (same) {
      database.prepare("UPDATE deck_links SET quantity = quantity + ? WHERE id = ?").run(Number(link.quantity), Number(same.id));
      database.prepare("DELETE FROM deck_links WHERE id = ?").run(Number(link.id));
    } else {
      database.prepare("UPDATE deck_links SET card_id = ? WHERE id = ?").run(newId, Number(link.id));
    }
  }
  // deck cards: the same deck card of the new printing (zone and finish) gets the count and the links
  const deckCards = database.prepare("SELECT * FROM deck_cards WHERE printing_id = ?").all(oldId) as Array<Record<string, unknown>>;
  for (const card of deckCards) {
    const same = database.prepare("SELECT id FROM deck_cards WHERE deck_id = ? AND printing_id = ? AND zone = ? AND finish = ?")
      .get(card.deck_id as string, newId, card.zone as string, card.finish as number);
    if (same) {
      database.prepare("UPDATE deck_cards SET quantity = quantity + ? WHERE id = ?").run(Number(card.quantity), Number(same.id));
      for (const link of database.prepare("SELECT * FROM deck_links WHERE deck_card_id = ?").all(Number(card.id)) as Array<Record<string, unknown>>) {
        const twin = database.prepare(
          "SELECT id FROM deck_links WHERE deck_card_id = ? AND collection_id = ? AND card_id = ? AND foil = ? AND condition = ? AND language = ? AND proxy = ?",
        ).get(Number(same.id), link.collection_id as string, link.card_id as string, link.foil as number, link.condition as string, link.language as string, link.proxy as number);
        if (twin) {
          database.prepare("UPDATE deck_links SET quantity = quantity + ? WHERE id = ?").run(Number(link.quantity), Number(twin.id));
          database.prepare("DELETE FROM deck_links WHERE id = ?").run(Number(link.id));
        } else {
          database.prepare("UPDATE deck_links SET deck_card_id = ? WHERE id = ?").run(Number(same.id), Number(link.id));
        }
      }
      database.prepare("DELETE FROM deck_cards WHERE id = ?").run(Number(card.id));
    } else {
      database.prepare("UPDATE deck_cards SET printing_id = ? WHERE id = ?").run(newId, Number(card.id));
    }
  }
  database.prepare("UPDATE deck_cards SET want_card_id = ? WHERE want_card_id = ?").run(newId, oldId);
  database.prepare("UPDATE trade_lines SET card_id = ? WHERE card_id = ?").run(newId, oldId);
  // print lists keep their lines as a list per account
  for (const row of database.prepare("SELECT user_id, lines FROM print_lists WHERE lines LIKE ?").all(`%${oldId}%`) as Array<{ user_id: number; lines: string }>) {
    try {
      const lines = (JSON.parse(row.lines) as Array<{ cardId: string }>).map((line) => (line.cardId === oldId ? { ...line, cardId: newId } : line));
      database.prepare("UPDATE print_lists SET lines = ? WHERE user_id = ?").run(JSON.stringify(lines), row.user_id);
    } catch {
      // a list that cannot be read is left as it is
    }
  }
  for (const hook of mergeHooks) hook(database, oldId, newId);
  database.prepare("INSERT OR IGNORE INTO price_history (card_id, day, usd, usd_foil, usd_etched, eur, eur_foil) SELECT ?, day, usd, usd_foil, usd_etched, eur, eur_foil FROM price_history WHERE card_id = ?").run(newId, oldId);
  // the old printing is gone from search once nothing uses it
  database.prepare("UPDATE cards SET removed = 1 WHERE id = ? AND custom = 0").run(oldId);
}

/** Other parts of the program (purchase history) add the tables they keep printings in. */
export const mergeHooks: Array<(database: DatabaseSync, oldId: string, newId: string) => void> = [];

/**
 * Reads Scryfall's printing changes newer than the last one applied and applies them: merges move everything to the new
 * printing; deletions mark the printing removed, so copies keep their name and can be changed to another printing.
 */
export async function applyMigrations(database: DatabaseSync, fetcher: Fetcher, log: (text: string) => void = () => undefined): Promise<{ merged: number; removed: number }> {
  const known = database.prepare("SELECT 1 FROM migrations_applied WHERE id = ?");
  const found: Array<Record<string, unknown>> = [];
  let url: string | null = `${API}/migrations`;
  // the list is newest first: reading stops at the first change already applied
  pages: for (let page = 0; url && page < 400; page++) {
    const body = await getJson(fetcher, url);
    for (const item of Array.isArray(body.data) ? body.data as Array<Record<string, unknown>> : []) {
      if (typeof item.id !== "string") continue;
      if (known.get(item.id)) break pages;
      found.push(item);
    }
    url = body.has_more === true && typeof body.next_page === "string" && body.next_page.startsWith(API) ? body.next_page : null;
  }
  let merged = 0;
  let removed = 0;
  const record = database.prepare("INSERT OR IGNORE INTO migrations_applied (id, performed_at, strategy, old_id, new_id, note) VALUES (?, ?, ?, ?, ?, ?)");
  const held = database.prepare(
    `SELECT EXISTS (SELECT 1 FROM collection_cards WHERE card_id = ?1) OR EXISTS (SELECT 1 FROM deck_cards WHERE printing_id = ?1)
       OR EXISTS (SELECT 1 FROM trade_lines WHERE card_id = ?1) AS held`,
  );
  // oldest first, so a printing merged twice ends on the last one
  for (const item of found.reverse()) {
    const oldId = String(item.old_scryfall_id ?? "");
    const newId = typeof item.new_scryfall_id === "string" ? item.new_scryfall_id : null;
    const strategy = String(item.migration_strategy ?? "");
    if (!oldId) continue;
    database.exec("BEGIN");
    try {
      if (strategy === "merge" && newId && database.prepare("SELECT 1 FROM cards WHERE id = ?").get(newId)) {
        const wasHeld = Number(held.get(oldId)?.held) === 1;
        mergePrinting(database, oldId, newId);
        if (wasHeld) {
          merged += 1;
          log(`Printing ${oldId} merged into ${newId}${item.note ? `: ${String(item.note)}` : ""}`);
        }
      } else if (strategy === "delete") {
        database.prepare("UPDATE cards SET removed = 1 WHERE id = ? AND custom = 0").run(oldId);
        if (Number(held.get(oldId)?.held) === 1) {
          removed += 1;
          log(`Printing ${oldId} removed by Scryfall${item.note ? `: ${String(item.note)}` : ""}`);
        }
      }
      record.run(String(item.id), typeof item.performed_at === "string" ? item.performed_at : null, strategy, oldId, newId, typeof item.note === "string" ? item.note : null);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  setMeta(database, "migrations_at", new Date().toISOString());
  setMeta(database, "last_migrations", JSON.stringify({ merged, removed }));
  return { merged, removed };
}

// ---------- 7.4 name and keyword lists ----------

export const CATALOGS = [
  "card-names", "artist-names", "creature-types", "planeswalker-types", "land-types", "artifact-types", "enchantment-types", "spell-types",
  "keyword-abilities", "keyword-actions", "ability-words", "watermarks",
] as const;

/** Downloads Scryfall's name and keyword lists. Returns how many lists were saved. */
export async function importCatalogs(database: DatabaseSync, fetcher: Fetcher): Promise<number> {
  const save = database.prepare("INSERT INTO catalogs (name, items) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET items = excluded.items, saved_at = strftime('%Y-%m-%d %H:%M:%f', 'now')");
  let saved = 0;
  for (const name of CATALOGS) {
    try {
      const body = await getJson(fetcher, `${API}/catalog/${name}`);
      const items = Array.isArray(body.data) ? (body.data as unknown[]).filter((item): item is string => typeof item === "string") : [];
      if (!items.length) continue;
      save.run(name, JSON.stringify(items));
      saved += 1;
    } catch {
      // a list that cannot be had keeps the one stored before
    }
  }
  return saved;
}

/** Suggestions from a list: items that start with the words first, then items that hold them, up to the limit. */
export function suggest(database: DatabaseSync, names: readonly string[], query: string, limit = 10): string[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const starts: string[] = [];
  const holds: string[] = [];
  for (const name of names) {
    const row = database.prepare("SELECT items FROM catalogs WHERE name = ?").get(name);
    if (!row) continue;
    for (const item of JSON.parse(String(row.items)) as string[]) {
      const lower = item.toLowerCase();
      if (lower.startsWith(term)) starts.push(item);
      else if (holds.length < limit && lower.includes(term)) holds.push(item);
      if (starts.length >= limit) break;
    }
  }
  return [...new Set([...starts, ...holds])].slice(0, limit);
}

// ---------- 7.5 the card back ----------

/** The card back most cards in the card database use (Scryfall's standard Magic back). */
export const STANDARD_BACK = "0aeebaf5-8c7d-4636-9e82-8c27447861f7";

/** Downloads the standard card back once, in the largest size Scryfall has. */
export async function downloadCardBack(database: DatabaseSync, fetcher: Fetcher): Promise<boolean> {
  if (database.prepare("SELECT 1 FROM card_backs WHERE id = 'standard'").get()) return false;
  const id = STANDARD_BACK;
  for (const [size, type] of [["png", "image/png"], ["large", "image/jpeg"], ["normal", "image/jpeg"]] as const) {
    const url = `https://backs.scryfall.io/${size}/${id[0]}/${id[1]}/${id}.${size === "png" ? "png" : "jpg"}`;
    try {
      const response = await fetcher(url, { headers: { "User-Agent": userAgent } });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 1000) continue;
      database.prepare("INSERT INTO card_backs (id, bytes, type) VALUES ('standard', ?, ?) ON CONFLICT(id) DO UPDATE SET bytes = excluded.bytes, type = excluded.type").run(bytes, type);
      return true;
    } catch {
      // the next size is tried
    }
  }
  throw new Error("The card back could not be downloaded");
}

/** Runs every extra part, each on its own, and writes what happened to the log. */
export async function importScryfallExtras(database: DatabaseSync, fetcher: Fetcher, log: (text: string) => void = console.log): Promise<void> {
  const parts: Array<[string, () => Promise<string>]> = [
    ["set symbols", async () => `Saved ${await downloadSetSymbols(database, fetcher)} new or changed set symbols`],
    ["symbol list", async () => `Saved ${await importSymbology(database, fetcher)} symbols`],
    ["printing changes", async () => {
      const result = await applyMigrations(database, fetcher, (text) => recordActivity(database, text));
      return `${result.merged} printings merged, ${result.removed} removed`;
    }],
    ["name and keyword lists", async () => `Saved ${await importCatalogs(database, fetcher)} name and keyword lists`],
    ["card back", async () => ((await downloadCardBack(database, fetcher)) ? "Saved the card back" : "The card back is already saved")],
  ];
  for (const [name, run] of parts) {
    try {
      log(await run());
    } catch (error) {
      console.warn(`Could not update the ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Writes a line to Administration, Activity when that table exists (the server's own database). */
function recordActivity(database: DatabaseSync, text: string): void {
  try {
    database.prepare("INSERT INTO activity (kind, detail) VALUES ('Card database', ?)").run(text);
  } catch {
    // the importer run on its own has no activity table
  }
}
