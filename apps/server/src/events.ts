// ---------- live updates (0.18.0): open pages and the app hear about changes at once, through server-sent events ----------
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance, FastifyReply } from "fastify";

/** What changed, so a page reloads only the parts it shows. */
export type ChangeArea = "library" | "decks" | "purchases" | "trades" | "inbox" | "prints" | "prefs" | "opening" | "other";

export type ChangeEvent = { areas: ChangeArea[]; by: number; client: string | null; at: number; opening?: OpeningNote | null };
/** The active opening of an account (item 7): sent when an opening starts or ends. */
export type OpeningNote = {
  id: string; entryId: string; name: string; collectionId: string | null; packNumber?: number | null; groupIndex?: number; groupSize?: number; hasNext?: boolean;
} | null;

type Stream = { reply: FastifyReply; client: string | null };

/** The header each page sends with its changes, so its own changes are not sent back to it. */
export const CLIENT_HEADER = "x-mana-vault-client";

/** The areas a changed address belongs to. */
export function areasOf(path: string): ChangeArea[] {
  const areas = new Set<ChangeArea>();
  if (/^\/api\/(collections|cards\/add|copies|wishlists|scan|catalog|import|backups|restore)/.test(path)) areas.add("library");
  if (/^\/api\/decks/.test(path)) { areas.add("decks"); areas.add("library"); }
  if (/^\/api\/(collections|copies)/.test(path)) areas.add("decks");
  if (/^\/api\/(purchases|places|openings)/.test(path)) { areas.add("purchases"); areas.add("library"); }
  if (/^\/api\/(collections|copies|cards\/add)/.test(path)) areas.add("purchases");
  if (/^\/api\/trades?/.test(path)) { areas.add("trades"); areas.add("library"); }
  if (/^\/api\/(shares|offers|inbox|send)/.test(path)) { areas.add("inbox"); areas.add("library"); areas.add("decks"); }
  if (/^\/api\/(print|proxies)/.test(path)) areas.add("prints");
  if (/^\/api\/prefs/.test(path)) areas.add("prefs");
  if (/^\/api\/sync/.test(path)) { areas.add("library"); areas.add("decks"); areas.add("purchases"); areas.add("trades"); }
  if (!areas.size) areas.add("other");
  return [...areas];
}

export class Events {
  private readonly streams = new Map<number, Set<Stream>>();
  private readonly keepAlive: NodeJS.Timeout;

  constructor(private readonly database: DatabaseSync) {
    // a comment line every 25 seconds keeps proxies and tunnels from closing a quiet stream
    this.keepAlive = setInterval(() => {
      for (const set of this.streams.values()) for (const stream of set) stream.reply.raw.write(": keep-alive\n\n");
    }, 25_000);
    this.keepAlive.unref();
  }

  /** How many pages and apps are listening, for tests. */
  get count(): number {
    let total = 0;
    for (const set of this.streams.values()) total += set.size;
    return total;
  }

  add(userId: number, stream: Stream): () => void {
    const set = this.streams.get(userId) ?? new Set<Stream>();
    set.add(stream);
    this.streams.set(userId, set);
    return () => {
      set.delete(stream);
      if (!set.size) this.streams.delete(userId);
    };
  }

  /** The account and everyone sharing a collection, deck, trade or offer with it. */
  audience(userId: number): number[] {
    const rows = this.database.prepare(`
      SELECT m.user_id AS id FROM members m
        JOIN collections c ON m.kind = 'collection' AND c.id = m.item_id WHERE c.owner_id = :me
      UNION SELECT m.user_id FROM members m
        JOIN decks d ON m.kind = 'deck' AND d.id = m.item_id WHERE d.owner_id = :me
      UNION SELECT c.owner_id FROM members m JOIN collections c ON m.kind = 'collection' AND c.id = m.item_id WHERE m.user_id = :me
      UNION SELECT d.owner_id FROM members m JOIN decks d ON m.kind = 'deck' AND d.id = m.item_id WHERE m.user_id = :me
      UNION SELECT o.user_id FROM members m JOIN members o ON o.kind = m.kind AND o.item_id = m.item_id WHERE m.user_id = :me
      UNION SELECT to_user FROM shares WHERE from_user = :me
      UNION SELECT partner_id FROM trades WHERE owner_id = :me AND status = 'open'
      UNION SELECT owner_id FROM trades WHERE partner_id = :me AND status = 'open'
    `).all({ me: userId });
    const ids = new Set<number>([userId]);
    for (const row of rows) if (row.id !== null && row.id !== undefined) ids.add(Number(row.id));
    return [...ids];
  }

  /** Tells the account's pages (and those of the people it shares with) what changed; the page that made it is skipped. */
  publish(userId: number, areas: ChangeArea[], client: string | null, opening?: OpeningNote): void {
    const event: ChangeEvent = { areas, by: userId, client, at: Date.now(), ...(opening !== undefined ? { opening } : {}) };
    const data = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
    let audience: number[];
    try {
      audience = this.audience(userId);
    } catch {
      audience = [userId];
    }
    for (const id of audience) {
      for (const stream of this.streams.get(id) ?? []) {
        if (client && stream.client === client) continue;
        // the opening note is only for the account itself
        stream.reply.raw.write(id === userId || opening === undefined ? data : `event: change\ndata: ${JSON.stringify({ ...event, opening: undefined })}\n\n`);
      }
    }
  }

  close(): void {
    clearInterval(this.keepAlive);
    for (const set of this.streams.values()) for (const stream of set) stream.reply.raw.end();
    this.streams.clear();
  }
}

/**
 * GET /api/events: a stream of change events for the signed-in account. The app, which cannot add a header to the
 * stream, signs in with ?device=<token> (checked in the request hook).
 */
export function registerEventRoutes(app: FastifyInstance, events: Events, activeOpening: (userId: number) => OpeningNote): void {
  app.get<{ Querystring: { client?: string } }>("/api/events", async (request, reply) => {
    const user = request.user!;
    const client = typeof request.query.client === "string" && /^[\w-]{6,64}$/.test(request.query.client) ? request.query.client : null;
    const origin = reply.getHeader("access-control-allow-origin");
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // stops nginx and similar proxies from holding the stream back
      "x-accel-buffering": "no",
      ...(origin ? { "access-control-allow-origin": String(origin) } : {}),
    });
    reply.raw.write("retry: 3000\n\n");
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ opening: activeOpening(user.id), at: Date.now() })}\n\n`);
    const remove = events.add(user.id, { reply, client });
    request.raw.on("close", remove);
  });
}
