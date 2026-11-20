// ---------- scan matching: turns text read from a card photo into a card printing ----------
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { bestName, buildNameIndex, MIN_NAME_SCORE, type NameIndex, type NameMatch, readInfoLine } from "./scan-core.js";

export { MIN_NAME_SCORE, normalize, readInfoLine, similarity } from "./scan-core.js";

export type ScanCard = {
  id: string; oracle_id: string; name: string; set_code: string; set_name: string; collector_number: string;
  rarity: string; image_url: string | null; finishes: string; released_at: string | null;
};
export type ScanMatch = { card: ScanCard | null; score: number; by: "printing" | "name" | null; read: string };

const CARD_COLUMNS = "id, oracle_id, name, set_code, set_name, collector_number, rarity, image_url, finishes, released_at";
// newest first; regular printings before promos and variants
const NEWEST = "ORDER BY released_at IS NULL, released_at DESC, promo, variation, length(collector_number), collector_number";

/** An in-memory index of card names (and front face names), rebuilt when the card database changes. */
export class NameMatcher {
  private index: NameIndex | null = null;
  constructor(private readonly database: DatabaseSync) {}

  private load(): NameIndex {
    const stamp = this.database.prepare(
      "SELECT (SELECT COUNT(*) FROM cards) AS count, (SELECT value FROM catalog_metadata WHERE key = 'updated_at') AS updated",
    ).get();
    const key = `${String(stamp?.count)}:${String(stamp?.updated)}`;
    if (this.index?.key === key) return this.index;
    this.index = buildNameIndex(key, this.database.prepare("SELECT DISTINCT name, flavor_name FROM cards WHERE custom = 0").all() as Array<{ name: unknown; flavor_name: unknown }>);
    return this.index;
  }

  /** The closest card name to any of the lines, with a score from 0 to 1. */
  best(lines: string[]): NameMatch | null {
    return bestName(this.load(), lines);
  }
}

export function matchScan(database: DatabaseSync, matcher: NameMatcher, lines: string[], info: string): ScanMatch {
  const named = lines.length ? matcher.best(lines) : null;
  const nameOk = named && named.score >= MIN_NAME_SCORE ? named : null;
  const { numbers, sets } = readInfoLine(info);
  const knownSets = sets.filter((code) => database.prepare("SELECT 1 FROM cards WHERE set_code = ? LIMIT 1").get(code));

  // 1. set code and collector number: the exact printing, when its name agrees with the name line (or no name was read)
  if (knownSets.length && numbers.length) {
    const rows = database.prepare(
      `SELECT ${CARD_COLUMNS} FROM cards WHERE set_code IN (${knownSets.map(() => "?").join(",")})
       AND collector_number IN (${numbers.map(() => "?").join(",")}) ${NEWEST}`,
    ).all(...knownSets, ...numbers) as ScanCard[];
    const agree = rows.find((card) => !nameOk || card.name === nameOk.name);
    if (agree) return { card: agree, score: nameOk?.score ?? 1, by: "printing", read: nameOk?.read ?? info.trim() };
  }
  if (!nameOk) return { card: null, score: named?.score ?? 0, by: null, read: named?.read ?? "" };

  // 2. the name, in a set read from the info line when there is one, otherwise the newest printing
  const inSet = knownSets.length
    ? database.prepare(
      `SELECT ${CARD_COLUMNS} FROM cards WHERE name = ? AND set_code IN (${knownSets.map(() => "?").join(",")}) ${NEWEST} LIMIT 1`,
    ).get(nameOk.name, ...knownSets) as ScanCard | undefined
    : undefined;
  const flavored = !inSet && nameOk.flavor
    ? database.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE name = ? AND flavor_name = ? ${NEWEST} LIMIT 1`).get(nameOk.name, nameOk.flavor) as ScanCard | undefined
    : undefined;
  const card = inSet ?? flavored ?? database.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE name = ? AND custom = 0 ${NEWEST} LIMIT 1`).get(nameOk.name) as ScanCard | undefined;
  return { card: card ?? null, score: nameOk.score, by: inSet ? "printing" : "name", read: nameOk.read };
}

const textList = (value: unknown, count: number, length: number): string[] | null =>
  Array.isArray(value) && value.length <= count && value.every((item) => typeof item === "string" && item.length <= length) ? value as string[] : null;

export function registerScanRoutes(app: FastifyInstance, database: DatabaseSync) {
  const matcher = new NameMatcher(database);

  app.post<{ Body: { lines?: unknown; info?: unknown } }>("/api/scan/match", async (request, reply) => {
    const lines = textList(request.body?.lines ?? [], 8, 120);
    const info = request.body?.info ?? "";
    if (!lines || typeof info !== "string" || info.length > 300) {
      return reply.code(400).send({ error: "Send up to 8 text lines of 120 characters and an info line of 300 characters" });
    }
    return matchScan(database, matcher, lines, info);
  });

  app.get<{ Params: { cardId: string } }>("/api/cards/:cardId/printings", async (request, reply) => {
    const card = database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(request.params.cardId);
    if (!card) return reply.code(404).send({ error: "Card printing not found" });
    return database.prepare(
      `SELECT ${CARD_COLUMNS}, promo, variation, price_usd, price_usd_foil, price_usd_etched, price_eur, price_eur_foil FROM cards WHERE oracle_id = ? ${NEWEST}`,
    ).all(String(card.oracle_id));
  });
}
