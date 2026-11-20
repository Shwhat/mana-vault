// ---------- deck builder: tags, quick add, editing the whole list as text, and the change history ----------
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { parseText, printingFinder } from "./deck-import.js";
import { logDeck, ZONES } from "./decks.js";
import { capDeckCardLinks, touchDeckCollections } from "./links.js";

const ZONE_NAMES: Record<string, string> = { main: "main deck", sideboard: "sideboard", commander: "commander", maybeboard: "maybeboard" };

function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** Tags are short words; each card keeps up to 12, in the order given, without repeats. */
export function readTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const tag = item.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > 40) return null;
    if (!tags.some((other) => other.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  return tags;
}

type Wanted = { oracleId: string; printingId: string; quantity: number; zone: string; name: string; named: boolean; finish: number };
export type ReplaceReport = { added: number; removed: number; changed: number; unmatched: Array<{ row: number; name: string; reason: string }> };

/**
 * Makes a deck match a decklist. Cards listed without a set keep the printing they already have in the deck. Cards
 * that stay keep their linked copies and tags (links above the new count are removed).
 */
export function replaceDeck(database: DatabaseSync, deckId: string, text: string, userName: string, commit = true): ReplaceReport {
  const rows = parseText(text);
  if (rows.length > 1000) throw new Error("A deck list can have at most 1,000 lines");
  const find = printingFinder(database);
  const current = database.prepare(
    "SELECT dc.id, dc.oracle_id, dc.printing_id, dc.quantity, dc.zone, dc.finish, c.name FROM deck_cards dc LEFT JOIN cards c ON c.id = dc.printing_id WHERE dc.deck_id = ?",
  ).all(deckId).map((row) => ({
    id: Number(row.id), oracleId: String(row.oracle_id), printingId: row.printing_id === null ? null : String(row.printing_id),
    quantity: Number(row.quantity), zone: String(row.zone), name: String(row.name ?? ""), finish: Number(row.finish ?? 0),
  }));
  const unmatched: ReplaceReport["unmatched"] = [];
  const wanted = new Map<string, Wanted>();
  for (const row of rows) {
    const line = row.sourceRow ?? 0;
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 100) {
      unmatched.push({ row: line, name: row.name, reason: "Start the line with a quantity from 1 to 100, such as 1 Sol Ring" });
      continue;
    }
    if (!row.zone || !ZONES.includes(row.zone)) {
      unmatched.push({ row: line, name: row.name, reason: "Zone must be Main, Sideboard, Commander or Maybeboard" });
      continue;
    }
    const found = find(row.name, row.set, row.collectorNumber);
    if (!found) {
      unmatched.push({ row: line, name: row.name, reason: row.set ? "No printing matched the set and collector number" : "No card with this name exists in the card database" });
      continue;
    }
    const named = !!row.set;
    // a line without a set keeps the printing already in the deck
    const kept = named ? null : current.find((card) => card.oracleId === found.oracle_id && card.zone === row.zone && card.printingId);
    const printingId = kept?.printingId ?? found.id;
    const key = `${found.oracle_id}\u0000${printingId}\u0000${row.zone}`;
    // a line's finish marks (*F*, *E*) set the deck card's finish; a line without one is regular
    const finish = row.finish === "etched" ? 2 : row.finish === "foil" ? 1 : 0;
    const item = wanted.get(key) ?? { oracleId: found.oracle_id, printingId, quantity: 0, zone: row.zone, name: found.name, named, finish };
    item.quantity = Math.min(100, item.quantity + row.quantity);
    wanted.set(key, item);
  }
  const report: ReplaceReport = { added: 0, removed: 0, changed: 0, unmatched };
  const changes: string[] = [];
  const plan: Array<() => void> = [];
  for (const card of current) {
    const item = wanted.get(`${card.oracleId}\u0000${card.printingId}\u0000${card.zone}`);
    if (!item) {
      report.removed += 1;
      changes.push(`-${card.quantity} ${card.name} (${ZONE_NAMES[card.zone]})`);
      plan.push(() => {
        touchDeckCollections(database, deckId, card.id);
        database.prepare("DELETE FROM deck_cards WHERE id = ?").run(card.id);
      });
      continue;
    }
    wanted.delete(`${card.oracleId}\u0000${card.printingId}\u0000${card.zone}`);
    if (item.finish !== card.finish) {
      report.changed += 1;
      changes.push(`${card.name} (${ZONE_NAMES[card.zone]}) is now ${item.finish === 2 ? "etched" : item.finish === 1 ? "foil" : "regular"}`);
      plan.push(() => { database.prepare("UPDATE deck_cards SET finish = ? WHERE id = ?").run(item.finish, card.id); });
    }
    if (item.quantity !== card.quantity) {
      if (item.finish === card.finish) report.changed += 1;
      changes.push(`${item.quantity > card.quantity ? "+" : "-"}${Math.abs(item.quantity - card.quantity)} ${card.name} (${ZONE_NAMES[card.zone]})`);
      plan.push(() => {
        touchDeckCollections(database, deckId, card.id);
        database.prepare("UPDATE deck_cards SET quantity = ? WHERE id = ?").run(item.quantity, card.id);
        capDeckCardLinks(database, card.id);
      });
    }
  }
  for (const item of wanted.values()) {
    report.added += 1;
    changes.push(`+${item.quantity} ${item.name} (${ZONE_NAMES[item.zone]})`);
    plan.push(() => {
      database.prepare("INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone, finish) VALUES (?, ?, ?, ?, ?, ?)")
        .run(deckId, item.oracleId, item.printingId, item.quantity, item.zone, item.finish);
    });
  }
  if (commit && plan.length) {
    transaction(database, () => {
      for (const step of plan) step();
      database.prepare("UPDATE decks SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(deckId);
      const summary = changes.length > 6 ? `${changes.slice(0, 6).join(", ")} and ${changes.length - 6} more` : changes.join(", ");
      logDeck(database, deckId, userName, `Edited as text: ${summary}`);
    });
  }
  return report;
}

export function registerDeckBuilderRoutes(app: FastifyInstance, database: DatabaseSync) {
  const nameOf = (request: { user: { name?: string } | null }) => String(request.user?.name ?? "");

  // the printing for a typed card name: "Sol Ring", or with a set and number such as "Sol Ring (C21) 263"
  app.get<{ Querystring: { name?: string; set?: string; number?: string } }>("/api/cards/resolve", async (request, reply) => {
    const name = String(request.query.name ?? "").trim();
    if (!name || name.length > 200) return reply.code(400).send({ error: "Type a card name" });
    const found = printingFinder(database)(name, String(request.query.set ?? "").trim(), String(request.query.number ?? "").trim());
    if (!found) return reply.code(404).send({ error: `No card named ${name} in the card database` });
    return { id: found.id, name: found.name };
  });

  app.put<{ Params: { deckId: string; entryId: string }; Body: { tags?: unknown } }>("/api/decks/:deckId/entries/:entryId/tags", async (request, reply) => {
    const entry = database.prepare("SELECT dc.id, c.name FROM deck_cards dc LEFT JOIN cards c ON c.id = dc.printing_id WHERE dc.id = ? AND dc.deck_id = ?")
      .get(Number(request.params.entryId), request.params.deckId);
    if (!entry) return reply.code(404).send({ error: "Deck card not found" });
    const tags = readTags(request.body?.tags);
    if (!tags) return reply.code(400).send({ error: "Send up to 12 tags of up to 40 characters each" });
    database.prepare("UPDATE deck_cards SET tags = ? WHERE id = ?").run(tags.join("\n"), Number(entry.id));
    database.prepare("UPDATE decks SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(request.params.deckId);
    logDeck(database, request.params.deckId, nameOf(request), tags.length ? `${String(entry.name ?? "A card")} tagged ${tags.join(", ")}` : `Tags removed from ${String(entry.name ?? "a card")}`);
    return { status: "saved", tags };
  });

  // the deck as a list, applied in one step; preview=1 reports without changing anything
  app.post<{ Params: { deckId: string }; Querystring: { preview?: string }; Body: { text?: unknown } }>("/api/decks/:deckId/replace", async (request, reply) => {
    const text = request.body?.text;
    if (typeof text !== "string" || text.length > 200_000) return reply.code(400).send({ error: "Send the deck list as text" });
    try {
      return replaceDeck(database, request.params.deckId, text, nameOf(request), request.query.preview !== "1");
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not apply the deck list" });
    }
  });

  app.get<{ Params: { deckId: string } }>("/api/decks/:deckId/history", async (request) =>
    database.prepare("SELECT id, at, user_name, change FROM deck_history WHERE deck_id = ? ORDER BY id DESC LIMIT 500").all(request.params.deckId)
      .map((row) => ({ id: Number(row.id), at: String(row.at), user: String(row.user_name), change: String(row.change) })));

  // the tokens the deck's cards create, with a printing of each to show
  app.get<{ Params: { deckId: string } }>("/api/decks/:deckId/tokens", async (request) => {
    const rows = database.prepare(
      "SELECT c.name AS source, c.tokens FROM deck_cards dc JOIN cards c ON c.id = dc.printing_id WHERE dc.deck_id = ? AND dc.zone != 'maybeboard' AND c.tokens != ''",
    ).all(request.params.deckId);
    const tokens = new Map<string, { id: string; name: string; image_url: string | null; type_line: string; from: string[] }>();
    const printing = database.prepare("SELECT id, name, image_url, type_line FROM cards WHERE id = ?");
    for (const row of rows) {
      let list: Array<{ id: string; name: string }> = [];
      try { list = JSON.parse(String(row.tokens)); } catch { list = []; }
      for (const token of list) {
        const card = printing.get(token.id);
        const typeLine = String(card?.type_line ?? "Token");
        const key = `${token.name}\u0000${typeLine}`;
        const item = tokens.get(key) ?? { id: token.id, name: token.name, image_url: (card?.image_url as string | null) ?? null, type_line: typeLine, from: [] };
        if (!item.from.includes(String(row.source))) item.from.push(String(row.source));
        tokens.set(key, item);
      }
    }
    return [...tokens.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
}
