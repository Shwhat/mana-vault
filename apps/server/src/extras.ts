// ---------- routes for the Scryfall extras (0.15.0): set symbols, the symbol list, suggestions, card backs, the art
// library and the parts of the card database for Administration ----------
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { isAdmin } from "./admin.js";
import { OFFICIAL_LANGUAGES } from "./import-bulk.js";
import { CATALOGS, suggest } from "./scryfall-extras.js";
import { setsWithSymbols } from "./sets.js";
import type { Settings } from "./settings.js";
import { SVG_HEADERS } from "./svg.js";

/** Addresses anyone can load (set symbols are drawn on shared pages and in the Android app's pictures). */
export const EXTRAS_PUBLIC = /^\/api\/set-symbols\/[a-z0-9]{2,8}$/;

const IMAGE_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_ART = 10 * 1024 * 1024;
const MAX_BACK = 6 * 1024 * 1024;

function readImage(value: unknown, limit: number): { bytes: Uint8Array; type: string } | string {
  if (typeof value !== "string") return "Pictures must be sent as JPEG, PNG or WebP data";
  const match = IMAGE_PATTERN.exec(value);
  if (!match) return "Pictures must be JPEG, PNG or WebP";
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > limit) return `Pictures can be up to ${Math.round(limit / 1024 / 1024)} MB`;
  return { bytes: new Uint8Array(bytes), type: match[1]! };
}

const cleanName = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "");

/** The card types, supertypes and subtypes, for suggestions after t: and in the card maker's type line. */
const CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Instant", "Kindred", "Land", "Planeswalker", "Sorcery", "Basic", "Legendary", "Snow", "World", "Ongoing", "Token"];
const LISTS: Record<string, readonly string[]> = {
  names: ["card-names"],
  artists: ["artist-names"],
  types: ["creature-types", "planeswalker-types", "land-types", "artifact-types", "enchantment-types", "spell-types"],
  keywords: ["keyword-abilities", "keyword-actions", "ability-words"],
  watermarks: ["watermarks"],
};

/** Puts each custom card's art into its maker's art library, once (0.15.0). */
export function importCustomArt(database: DatabaseSync): void {
  if (database.prepare("SELECT 1 FROM catalog_metadata WHERE key = 'art_library_imported'").get()) return;
  const save = database.prepare("INSERT INTO art_library (id, user_id, name, bytes, type) VALUES (?, ?, ?, ?, ?)");
  database.exec("BEGIN");
  try {
    for (const row of database.prepare(
      `SELECT cc.owner_id, cc.art, cc.art_type, cc.back_art, cc.back_art_type, c.name FROM custom_cards cc LEFT JOIN cards c ON c.id = cc.id
       WHERE cc.owner_id IS NOT NULL AND (cc.art IS NOT NULL OR cc.back_art IS NOT NULL)`,
    ).all()) {
      const name = String(row.name ?? "Custom card");
      if (row.art && row.art_type) save.run(randomUUID(), Number(row.owner_id), name, row.art as Uint8Array, String(row.art_type));
      if (row.back_art && row.back_art_type) save.run(randomUUID(), Number(row.owner_id), `${name} (back)`, row.back_art as Uint8Array, String(row.back_art_type));
    }
    database.prepare("INSERT INTO catalog_metadata (key, value) VALUES ('art_library_imported', ?)").run(new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/**
 * 0.17.0: one art library for the server. Pictures kept more than once (by different accounts) are joined, keeping the
 * oldest; user_id now records who added a picture. Runs once.
 */
export function shareArtLibrary(database: DatabaseSync): void {
  if (database.prepare("SELECT 1 FROM catalog_metadata WHERE key = 'art_library_shared'").get()) return;
  database.exec("BEGIN");
  try {
    database.exec(`DELETE FROM art_library WHERE rowid IN (
      SELECT later.rowid FROM art_library later JOIN art_library first
        ON length(first.bytes) = length(later.bytes) AND first.bytes = later.bytes
       AND (first.created_at < later.created_at OR (first.created_at = later.created_at AND first.rowid < later.rowid)))`);
    database.prepare("INSERT INTO catalog_metadata (key, value) VALUES ('art_library_shared', ?)").run(new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** Adds a picture to the art library unless the same picture is already there (added by anyone). Returns its id. */
export function addToArtLibrary(database: DatabaseSync, userId: number, name: string, picture: { bytes: Uint8Array; type: string }): string {
  const same = database.prepare("SELECT id FROM art_library WHERE length(bytes) = ? AND bytes = ?").get(picture.bytes.length, picture.bytes);
  if (same) return String(same.id);
  const id = randomUUID();
  database.prepare("INSERT INTO art_library (id, user_id, name, bytes, type) VALUES (?, ?, ?, ?, ?)").run(id, userId, name || "Art", picture.bytes, picture.type);
  return id;
}

/** Rough numbers of printings Scryfall has in each official language, for the size estimate before the first download. */
const LANGUAGE_PRINTINGS: Record<string, number> = {
  es: 26000, fr: 26000, de: 27000, it: 25000, pt: 18000, ja: 26000, ko: 8000, ru: 10000, zhs: 12000, zht: 8000,
};
const UNOFFICIAL_PRINTINGS = 1500;
const ROUGH_PICTURE: Record<string, number> = { small: 12_000, normal: 70_000, large: 160_000, png: 1_100_000, art_crop: 90_000, border_crop: 140_000 };

export function registerExtrasRoutes(app: FastifyInstance, database: DatabaseSync, settings: Settings, fetcher: typeof fetch = fetch) {
  const userOf = (request: FastifyRequest) => request.user!.id;
  const admin = (request: FastifyRequest, reply: FastifyReply) => {
    if (isAdmin(database, request.user?.id)) return true;
    void reply.code(403).send({ error: "Only an admin can do this." });
    return false;
  };
  try {
    importCustomArt(database);
    shareArtLibrary(database);
  } catch (error) {
    console.warn(`Could not put custom card art in the art library: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ---------- set symbols ----------
  app.get<{ Params: { code: string } }>("/api/set-symbols/:code", async (request, reply) => {
    const code = request.params.code.toLowerCase();
    const custom = database.prepare("SELECT symbol, symbol_type FROM custom_sets WHERE code = ? AND symbol IS NOT NULL").get(code);
    if (custom) {
      reply.header("Cache-Control", "private, max-age=60");
      if (String(custom.symbol_type) === "image/svg+xml") reply.headers(SVG_HEADERS);
      return reply.type(String(custom.symbol_type)).send(Buffer.from(custom.symbol as Uint8Array));
    }
    const row = database.prepare("SELECT svg FROM set_symbols WHERE code = ?").get(code);
    if (!row) return reply.code(404).send({ error: "This set has no symbol" });
    reply.headers(SVG_HEADERS);
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.type("image/svg+xml").send(String(row.svg));
  });
  app.get<{ Querystring: { q?: string } }>("/api/sets/symbols", async (request) =>
    setsWithSymbols(database, typeof request.query.q === "string" ? request.query.q.slice(0, 60) : ""));

  // ---------- the symbol list ----------
  app.get("/api/symbology", async () => database.prepare(
    `SELECT y.symbol, y.code, y.english, y.mana_value, y.colors, y.hybrid, y.phyrexian, y.represents_mana, y.funny, s.code IS NOT NULL AS has_picture
     FROM symbology y LEFT JOIN symbols s ON s.code = y.code ORDER BY y.position`,
  ).all().map((row) => ({
    symbol: String(row.symbol), code: String(row.code), name: String(row.english), manaValue: row.mana_value === null ? null : Number(row.mana_value),
    colors: String(row.colors), hybrid: Number(row.hybrid) === 1, phyrexian: Number(row.phyrexian) === 1, mana: Number(row.represents_mana) === 1,
    funny: Number(row.funny) === 1, picture: Number(row.has_picture) === 1,
  })));

  // ---------- suggestions ----------
  app.get<{ Querystring: { list?: string; q?: string; limit?: string } }>("/api/catalog/suggest", async (request, reply) => {
    const list = String(request.query.list ?? "names");
    const q = typeof request.query.q === "string" ? request.query.q.slice(0, 100) : "";
    const limit = Math.min(20, Math.max(1, Number(request.query.limit) || 10));
    if (!(list in LISTS)) return reply.code(400).send({ error: "Choose names, artists, types, keywords or watermarks" });
    const found = suggest(database, LISTS[list]!, q, limit);
    if (list !== "types") return found;
    const term = q.trim().toLowerCase();
    const basic = term ? CARD_TYPES.filter((type) => type.toLowerCase().startsWith(term)) : [];
    return [...new Set([...basic, ...found])].slice(0, limit);
  });
  // every list in one reply, for the Android app to suggest offline
  app.get("/api/catalog/lists", async () => {
    const lists: Record<string, string[]> = {};
    for (const [name, parts] of Object.entries(LISTS)) {
      if (name === "names") continue;
      lists[name] = parts.flatMap((part) => {
        const row = database.prepare("SELECT items FROM catalogs WHERE name = ?").get(part);
        return row ? JSON.parse(String(row.items)) as string[] : [];
      });
    }
    lists.types = [...CARD_TYPES, ...(lists.types ?? [])];
    return lists;
  });

  // ---------- card backs ----------
  app.get<{ Params: { which: string } }>("/api/card-backs/:which", async (request, reply) => {
    const id = request.params.which === "mine" ? `user:${userOf(request)}` : request.params.which === "standard" ? "standard" : null;
    if (!id) return reply.code(404).send({ error: "Choose the standard back or your own" });
    const row = database.prepare("SELECT bytes, type FROM card_backs WHERE id = ?").get(id);
    if (!row) {
      return reply.code(404).send({
        error: id === "standard" ? "The card back is not downloaded yet. Update the card database to download it" : "No card back is uploaded",
      });
    }
    reply.header("Cache-Control", "private, max-age=60");
    return reply.type(String(row.type)).send(Buffer.from(row.bytes as Uint8Array));
  });
  app.put<{ Body: { picture?: unknown } }>("/api/card-backs/mine", { bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    const picture = readImage(request.body?.picture, MAX_BACK);
    if (typeof picture === "string") return reply.code(400).send({ error: picture });
    database.prepare("INSERT INTO card_backs (id, bytes, type) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET bytes = excluded.bytes, type = excluded.type, saved_at = strftime('%Y-%m-%d %H:%M:%f', 'now')")
      .run(`user:${userOf(request)}`, picture.bytes, picture.type);
    return { ok: true };
  });
  app.delete("/api/card-backs/mine", async (request) => {
    database.prepare("DELETE FROM card_backs WHERE id = ?").run(`user:${userOf(request)}`);
    return { ok: true };
  });
  app.get("/api/card-backs", async (request) => ({
    standard: !!database.prepare("SELECT 1 FROM card_backs WHERE id = 'standard'").get(),
    mine: !!database.prepare("SELECT 1 FROM card_backs WHERE id = ?").get(`user:${userOf(request)}`),
  }));

  // ---------- art library ----------
  // one library for every account: anyone uses any picture; the person who added it, or an admin, renames or deletes it
  const artRow = (request: FastifyRequest) => (row: Record<string, unknown>) => ({
    id: String(row.id), name: String(row.name), type: String(row.type), bytes: Number(row.size), createdAt: String(row.created_at),
    url: `/api/art/${String(row.id)}/picture`, addedBy: row.added_by ? String(row.added_by) : null,
    canChange: Number(row.user_id) === userOf(request) || isAdmin(database, request.user?.id),
  });
  const ART_ROW = "SELECT a.id, a.name, a.type, a.user_id, length(a.bytes) AS size, a.created_at, u.name AS added_by FROM art_library a LEFT JOIN users u ON u.id = a.user_id";
  const ownArt = (request: FastifyRequest<{ Params: { id: string } }>) => {
    const row = database.prepare("SELECT id, user_id FROM art_library WHERE id = ?").get(request.params.id);
    return row && (Number(row.user_id) === userOf(request) || isAdmin(database, request.user?.id)) ? row : null;
  };
  const artMissing = (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) =>
    database.prepare("SELECT 1 FROM art_library WHERE id = ?").get(request.params.id)
      ? reply.code(403).send({ error: "Only the person who added this art, or an admin, can change it" })
      : reply.code(404).send({ error: "That art is not in the library" });
  app.get("/api/art", async (request) => database.prepare(`${ART_ROW} ORDER BY a.created_at DESC, a.name`).all().map(artRow(request)));
  app.post<{ Body: { name?: unknown; picture?: unknown } }>("/api/art", { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const picture = readImage(request.body?.picture, MAX_ART);
    if (typeof picture === "string") return reply.code(400).send({ error: picture });
    const id = addToArtLibrary(database, userOf(request), cleanName(request.body?.name), picture);
    const row = database.prepare(`${ART_ROW} WHERE a.id = ?`).get(id)!;
    return reply.code(201).send(artRow(request)(row));
  });
  app.patch<{ Params: { id: string }; Body: { name?: unknown } }>("/api/art/:id", async (request, reply) => {
    if (!ownArt(request)) return artMissing(request, reply);
    const name = cleanName(request.body?.name);
    if (!name) return reply.code(400).send({ error: "Enter a name" });
    database.prepare("UPDATE art_library SET name = ? WHERE id = ?").run(name, request.params.id);
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/art/:id", async (request, reply) => {
    if (!ownArt(request)) return artMissing(request, reply);
    database.prepare("DELETE FROM art_library WHERE id = ?").run(request.params.id);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>("/api/art/:id/picture", async (request, reply) => {
    const row = database.prepare("SELECT bytes, type FROM art_library WHERE id = ?").get(request.params.id);
    if (!row) return reply.code(404).send({ error: "That art is not in the library" });
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.type(String(row.type)).send(Buffer.from(row.bytes as Uint8Array));
  });

  // ---------- Administration, Card database ----------
  const meta = (key: string) => (database.prepare("SELECT value FROM catalog_metadata WHERE key = ?").get(key)?.value as string | undefined) ?? null;
  const count = (sql: string, ...values: (string | number)[]) => Number(database.prepare(sql).get(...values)?.n ?? 0);
  app.get("/api/admin/card-database", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const languages = database.prepare("SELECT lang, COUNT(*) AS n FROM cards WHERE custom = 0 GROUP BY lang ORDER BY COUNT(*) DESC").all()
      .map((row) => ({ lang: String(row.lang), printings: Number(row.n) }));
    let lastMigrations = { merged: 0, removed: 0 };
    try {
      lastMigrations = { ...lastMigrations, ...JSON.parse(meta("last_migrations") ?? "{}") };
    } catch {
      // the first update has not run yet
    }
    const updated = meta("updated_at");
    return {
      parts: [
        { part: "Card printings", count: count("SELECT COUNT(*) AS n FROM cards WHERE custom = 0 AND removed = 0"), at: updated },
        { part: "Sets", count: count("SELECT COUNT(*) AS n FROM sets WHERE set_type != 'custom'"), at: updated },
        { part: "Set symbols", count: count("SELECT COUNT(*) AS n FROM set_symbols"), at: meta("set_symbols_at") },
        { part: "Symbols", count: count("SELECT COUNT(*) AS n FROM symbology"), at: meta("symbology_at") },
        { part: "Rulings", count: count("SELECT COUNT(*) AS n FROM rulings"), at: meta("rulings_at") },
        { part: "Art tags", count: count("SELECT COUNT(*) AS n FROM tags WHERE kind = 'art'"), at: updated },
        { part: "Oracle tags", count: count("SELECT COUNT(*) AS n FROM tags WHERE kind = 'oracle'"), at: updated },
        { part: "Printing changes", count: count("SELECT COUNT(*) AS n FROM migrations_applied"), at: meta("migrations_at") },
        { part: "Name and keyword lists", count: count("SELECT COUNT(*) AS n FROM catalogs"), at: database.prepare("SELECT MAX(saved_at) AS at FROM catalogs").get()?.at as string ?? null },
        { part: "Card back", count: count("SELECT COUNT(*) AS n FROM card_backs WHERE id = 'standard'"), at: database.prepare("SELECT saved_at AS at FROM card_backs WHERE id = 'standard'").get()?.at as string ?? null },
        { part: "Price history", count: count("SELECT COUNT(*) AS n FROM price_history"), at: database.prepare("SELECT MAX(day) AS at FROM price_history").get()?.at as string ?? null },
      ],
      languages,
      lastMigrations,
      removedHeld: count(
        `SELECT COUNT(*) AS n FROM cards c WHERE c.removed = 1 AND (EXISTS (SELECT 1 FROM collection_cards i WHERE i.card_id = c.id)
           OR EXISTS (SELECT 1 FROM deck_cards d WHERE d.printing_id = c.id))`,
      ),
      catalogs: CATALOGS.length,
    };
  });

  /** The download and the growth of the card database for a choice of languages, before it is saved. */
  app.post<{ Body: { cardLanguages?: unknown; extraLanguages?: unknown; languagePictures?: unknown } }>("/api/admin/card-languages/estimate", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const chosen = Array.isArray(request.body?.cardLanguages) ? (request.body.cardLanguages as unknown[]).filter((lang): lang is string => typeof lang === "string" && OFFICIAL_LANGUAGES.has(lang)) : [];
    const extra = request.body?.extraLanguages !== false;
    const pictures = request.body?.languagePictures === true;
    const stored = new Map(database.prepare("SELECT lang, COUNT(*) AS n FROM cards WHERE custom = 0 GROUP BY lang").all().map((row) => [String(row.lang), Number(row.n)]));
    const printingsOf = (lang: string) => stored.get(lang) || LANGUAGE_PRINTINGS[lang] || 0;
    const unofficial = [...stored.entries()].filter(([lang]) => lang !== "en" && !OFFICIAL_LANGUAGES.has(lang)).reduce((sum, [, n]) => sum + n, 0) || UNOFFICIAL_PRINTINGS;
    const printings = chosen.reduce((sum, lang) => sum + printingsOf(lang), 0) + (extra ? unofficial : 0);
    // bytes per printing measured from the database as it is
    const pageBytes = Number(database.prepare("PRAGMA page_size").get()?.page_size ?? 4096) * Number(database.prepare("PRAGMA page_count").get()?.page_count ?? 0);
    const allPrintings = Math.max(1, count("SELECT COUNT(*) AS n FROM cards"));
    const perPrinting = Math.min(40_000, Math.max(2_000, Math.round(pageBytes / allPrintings)));
    const added = chosen.reduce((sum, lang) => sum + (stored.has(lang) ? 0 : printingsOf(lang)), 0)
      + (extra && ![...stored.keys()].some((lang) => lang !== "en" && !OFFICIAL_LANGUAGES.has(lang)) ? UNOFFICIAL_PRINTINGS : 0);
    let download: number | null = null;
    if (chosen.length || extra) {
      try {
        const response = await fetcher("https://api.scryfall.com/bulk-data", { headers: { "User-Agent": "mana-vault/0.0.0 (local card database importer)", Accept: "application/json" } });
        const body = await response.json() as { data?: Array<{ type?: string; size?: number }> };
        download = body.data?.find((entry) => entry.type === "all_cards")?.size ?? null;
      } catch {
        download = null;
      }
    }
    const sizes = settings.get().pictureSizes;
    const estimates = settings.get().pictureEstimates;
    const picturesBytes = pictures ? sizes.reduce((sum, size) => sum + printings * (estimates[size]?.bytes ?? ROUGH_PICTURE[size] ?? 100_000), 0) : 0;
    return { printings, growthBytes: added * perPrinting, downloadBytes: download, picturesBytes };
  });
}
