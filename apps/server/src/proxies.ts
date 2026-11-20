// ---------- proxies: the print list, full-size card pictures and mana symbols for printing and the card maker ----------
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;

const FACES = ["front", "back", "both"];
const SIZES = ["png", "large", "art_crop"];
/** Mana symbol codes as written between braces, such as W, 2, X, W/U, 2/W, W/P, T, Q, S, E. */
const SYMBOL = /^[0-9A-Z/]{1,6}$/;

export function initializeProxyTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS print_lists (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      lines TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE TABLE IF NOT EXISTS symbols (
      code TEXT PRIMARY KEY,
      svg TEXT NOT NULL,
      saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
  `);
}

type PrintLine = { id: string; cardId: string; count: number; faces: string };

/** A print list sent by the app: up to 1,000 lines of a printing, a count from 1 to 100 and the faces to print. */
export function readPrintLines(value: unknown): PrintLine[] | string {
  if (!Array.isArray(value) || value.length > 1000) return "A print list can have up to 1,000 lines";
  const lines: PrintLine[] = [];
  for (const item of value) {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const count = Number(raw.count);
    if (typeof raw.id !== "string" || !raw.id || raw.id.length > 64 || typeof raw.cardId !== "string" || !raw.cardId || raw.cardId.length > 80 ||
      !Number.isInteger(count) || count < 1 || count > 100) {
      return "Each line needs a card and a count from 1 to 100";
    }
    lines.push({ id: raw.id, cardId: raw.cardId, count, faces: FACES.includes(String(raw.faces)) ? String(raw.faces) : "front" });
  }
  return lines;
}

/** The address of a Scryfall picture in another size: normal pictures become png (745 x 1040), large or art_crop pictures. */
export function scryfallSize(url: string, size: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "cards.scryfall.io") return null;
  const parts = parsed.pathname.split("/");
  if (parts.length < 3) return null;
  parts[1] = size;
  if (size === "png") parts[parts.length - 1] = parts[parts.length - 1]!.replace(/\.jpg$/, ".png");
  else parts[parts.length - 1] = parts[parts.length - 1]!.replace(/\.png$/, ".jpg");
  parsed.pathname = parts.join("/");
  return parsed.toString();
}

/** A few recent pictures kept in memory, so a print list with many copies of one card fetches it once. */
class PictureCache {
  private items = new Map<string, { bytes: Buffer; type: string }>();
  constructor(private limit: number) {}
  get(key: string) {
    const item = this.items.get(key);
    if (item) {
      this.items.delete(key);
      this.items.set(key, item);
    }
    return item;
  }
  set(key: string, item: { bytes: Buffer; type: string }) {
    this.items.set(key, item);
    while (this.items.size > this.limit) this.items.delete(this.items.keys().next().value!);
  }
}

export function registerProxyRoutes(app: FastifyInstance, database: DatabaseSync, fetcher: Fetcher = fetch as unknown as Fetcher) {
  initializeProxyTables(database);
  const userOf = (request: { user: { id: number } | null }) => request.user!.id;
  const cache = new PictureCache(60);

  const download = async (url: string, timeoutMs = 20_000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`The picture server answered ${response.status}`);
      return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "application/octet-stream" };
    } finally {
      clearTimeout(timer);
    }
  };

  // ---------- the print list, kept per account ----------
  app.get("/api/proxies/list", async (request) => {
    const row = database.prepare("SELECT lines FROM print_lists WHERE user_id = ?").get(userOf(request));
    let lines: PrintLine[] = [];
    try {
      const parsed = row ? JSON.parse(String(row.lines)) : [];
      lines = Array.isArray(parsed) ? parsed : [];
    } catch {
      lines = [];
    }
    // lines of cards no longer in the card database (a deleted custom card) are left out; each line carries its card's details
    const card = database.prepare(
      `SELECT id, oracle_id, name, type_line, set_code, set_name, collector_number, image_url, back_image_url, custom, tokens,
              (SELECT back_picture IS NOT NULL FROM custom_cards WHERE custom_cards.id = cards.id) AS custom_back
       FROM cards WHERE id = ?`,
    );
    return lines.flatMap((line) => {
      const row = card.get(line.cardId);
      if (!row) return [];
      return [{
        ...line,
        card: {
          id: String(row.id), oracle_id: String(row.oracle_id), name: String(row.name), type_line: String(row.type_line), set_code: String(row.set_code),
          set_name: String(row.set_name), collector_number: String(row.collector_number), image_url: (row.image_url as string | null) ?? null,
          custom: Number(row.custom) === 1, hasBack: Number(row.custom) === 1 ? Number(row.custom_back) === 1 : !!row.back_image_url,
        },
      }];
    });
  });

  app.put<{ Body: { lines?: unknown } }>("/api/proxies/list", { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    const lines = readPrintLines(request.body?.lines);
    if (typeof lines === "string") return reply.code(400).send({ error: lines });
    database.prepare(
      `INSERT INTO print_lists (user_id, lines) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET lines = excluded.lines, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`,
    ).run(userOf(request), JSON.stringify(lines));
    return { status: "saved", count: lines.length };
  });

  // ---------- full-size pictures for printing and card art for the card maker ----------
  app.get<{ Params: { cardId: string }; Querystring: { face?: string; size?: string } }>("/api/card-images/:cardId", async (request, reply) => {
    const face = request.query.face === "back" ? "back" : "front";
    const size = SIZES.includes(String(request.query.size)) ? String(request.query.size) : "png";
    const card = database.prepare("SELECT id, image_url, back_image_url, custom FROM cards WHERE id = ?").get(request.params.cardId);
    if (!card) return reply.code(404).send({ error: "Card printing not found" });
    if (Number(card.custom) === 1) {
      const column = size === "art_crop" ? (face === "back" ? "back_art" : "art") : face === "back" ? "back_picture" : "picture";
      const row = database.prepare(`SELECT ${column} AS bytes, ${column}_type AS type FROM custom_cards WHERE id = ?`).get(String(card.id));
      if (!row?.bytes) return reply.code(404).send({ error: face === "back" ? "This card has no back face" : "This card has no picture" });
      return reply.header("cache-control", "private, max-age=300").type(String(row.type)).send(Buffer.from(row.bytes as Uint8Array));
    }
    const source = face === "back" ? (card.back_image_url as string | null) : (card.image_url as string | null);
    if (!source) return reply.code(404).send({ error: face === "back" ? "This card has no back face" : "This card has no picture" });
    const url = scryfallSize(source, size);
    if (!url) return reply.code(404).send({ error: "This card has no picture" });
    const key = `${url}`;
    let picture = cache.get(key);
    if (!picture) {
      try {
        picture = await download(url);
      } catch {
        return reply.code(502).send({ error: "The card picture could not be downloaded from Scryfall" });
      }
      cache.set(key, picture);
    }
    return reply.header("cache-control", "private, max-age=86400").type(picture.type).send(picture.bytes);
  });

  // ---------- mana symbols, downloaded from Scryfall once and kept in the database ----------
  app.get<{ Params: { code: string } }>("/api/symbols/:code", async (request, reply) => {
    const code = decodeURIComponent(request.params.code).toUpperCase();
    if (!SYMBOL.test(code)) return reply.code(400).send({ error: "Unknown mana symbol" });
    const file = code.replace(/\//g, "");
    const saved = database.prepare("SELECT svg FROM symbols WHERE code = ?").get(file);
    if (saved) return reply.header("cache-control", "private, max-age=86400").type("image/svg+xml").send(String(saved.svg));
    let svg: string;
    try {
      const { bytes } = await download(`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(file)}.svg`, 10_000);
      svg = bytes.toString("utf8");
    } catch {
      return reply.code(502).send({ error: "The mana symbol could not be downloaded from Scryfall" });
    }
    if (!svg.trimStart().startsWith("<svg") && !svg.trimStart().startsWith("<?xml")) return reply.code(502).send({ error: "The mana symbol could not be read" });
    database.prepare("INSERT INTO symbols (code, svg) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET svg = excluded.svg").run(file, svg);
    return reply.header("cache-control", "private, max-age=86400").type("image/svg+xml").send(svg);
  });

  // ---------- the tokens a list of cards makes ----------
  app.post<{ Body: { ids?: unknown } }>("/api/cards/tokens", async (request, reply) => {
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some((id) => typeof id !== "string")) return reply.code(400).send({ error: "Send up to 1,000 card ids" });
    const found = new Map<string, string>();
    const read = database.prepare("SELECT tokens FROM cards WHERE id = ?");
    for (const id of ids as string[]) {
      try {
        const tokens = JSON.parse(String(read.get(id)?.tokens || "[]")) as Array<{ id: string; name: string }>;
        for (const token of tokens) if (typeof token.id === "string" && !found.has(token.id)) found.set(token.id, String(token.name));
      } catch {
        // a card without token data adds nothing
      }
    }
    const exists = database.prepare("SELECT id, name, set_code, collector_number, image_url FROM cards WHERE id = ?");
    return [...found.keys()].flatMap((id) => {
      const row = exists.get(id);
      return row ? [{ id: String(row.id), name: String(row.name), set_code: String(row.set_code), collector_number: String(row.collector_number), image_url: row.image_url ?? null }] : [];
    });
  });
}
