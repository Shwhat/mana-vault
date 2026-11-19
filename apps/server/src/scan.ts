// ---------- scan matching: turns text read from a card photo into a card printing ----------
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";

export type ScanCard = {
  id: string; oracle_id: string; name: string; set_code: string; set_name: string; collector_number: string;
  rarity: string; image_url: string | null; finishes: string; released_at: string | null;
};
export type ScanMatch = { card: ScanCard | null; score: number; by: "printing" | "name" | null; read: string };

const CARD_COLUMNS = "id, oracle_id, name, set_code, set_name, collector_number, rarity, image_url, finishes, released_at";
// newest first; regular printings before promos and variants
const NEWEST = "ORDER BY released_at IS NULL, released_at DESC, promo, variation, length(collector_number), collector_number";
export const MIN_NAME_SCORE = 0.72;

/** Lower case letters, digits and single spaces only. */
export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (!longest) return 0;
  return 1 - distance(a, b) / longest;
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

const trigrams = (text: string) => {
  const padded = `  ${text} `;
  const set = new Set<string>();
  for (let index = 0; index < padded.length - 2; index++) set.add(padded.slice(index, index + 3));
  return set;
};

// flavor: the flavor name a title came from, so the printing that carries it can be chosen
type NameIndex = { key: string; names: string[]; normal: string[]; full: string[]; flavor: Array<string | null>; grams: Map<string, number[]> };

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
    const names: string[] = [];
    const normal: string[] = [];
    const full: string[] = [];
    const flavor: Array<string | null> = [];
    const grams = new Map<string, number[]>();
    const add = (shown: string, name: string, flavorName: string | null = null) => {
      const text = normalize(shown);
      if (text.length < 2) return;
      const at = names.length;
      names.push(shown);
      normal.push(text);
      full.push(name);
      flavor.push(flavorName);
      for (const gram of trigrams(text)) {
        const list = grams.get(gram);
        if (list) list.push(at); else grams.set(gram, [at]);
      }
    };
    for (const row of this.database.prepare("SELECT DISTINCT name, flavor_name FROM cards").all()) {
      const name = String(row.name);
      add(name, name);
      // double-faced and split cards print each face name on its own
      if (name.includes(" // ")) for (const face of name.split(" // ")) add(face, name);
      // printings with a flavor name (such as the Godzilla series) print it as the title
      if (typeof row.flavor_name === "string" && row.flavor_name) {
        for (const title of row.flavor_name.split(" // ")) add(title, name, row.flavor_name);
      }
    }
    this.index = { key, names, normal, full, flavor, grams };
    return this.index;
  }

  /** The closest card name to any of the lines, with a score from 0 to 1. */
  best(lines: string[]): { name: string; score: number; read: string; flavor: string | null } | null {
    const index = this.load();
    let best: { name: string; score: number; read: string; flavor: string | null } | null = null;
    for (const line of lines) {
      for (const text of variants(normalize(line))) {
        if (text.length < 3) continue;
        const counts = new Map<number, number>();
        for (const gram of trigrams(text)) {
          for (const at of index.grams.get(gram) ?? []) counts.set(at, (counts.get(at) ?? 0) + 1);
        }
        const candidates = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
        for (const [at] of candidates) {
          const score = similarity(text, index.normal[at]!);
          if (!best || score > best.score) best = { name: index.full[at]!, score, read: line.trim(), flavor: index.flavor[at] ?? null };
        }
      }
    }
    return best;
  }
}

/** The line itself, plus versions without stray characters at the ends (mana symbols and frame edges read as text). */
function variants(text: string): string[] {
  const words = text.split(" ");
  const list = new Set([text]);
  for (let start = 0; start <= Math.min(2, words.length - 1); start++) {
    for (let end = words.length; end >= Math.max(start + 1, words.length - 3); end--) list.add(words.slice(start, end).join(" "));
  }
  return [...list];
}

/** Collector numbers and set codes printed on the card's info line (for example "0164 C" and "TRK EN"). */
export function readInfoLine(text: string): { numbers: string[]; sets: string[] } {
  const numbers = new Set<string>();
  const sets = new Set<string>();
  for (const match of text.matchAll(/\b0*(\d{1,4})([a-z]?)(?:\s*\/\s*\d{1,4})?\b/gi)) {
    numbers.add(`${match[1]}${(match[2] ?? "").toLowerCase()}`);
  }
  for (const match of text.matchAll(/\b([A-Z0-9]{3,5})\b/g)) {
    const code = match[1]!;
    if (!/^\d+$/.test(code) && !["EN", "TM"].includes(code)) sets.add(code.toLowerCase());
  }
  return { numbers: [...numbers], sets: [...sets] };
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
  const card = inSet ?? flavored ?? database.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE name = ? ${NEWEST} LIMIT 1`).get(nameOk.name) as ScanCard | undefined;
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
    return database.prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE oracle_id = ? ${NEWEST}`).all(String(card.oracle_id));
  });
}
