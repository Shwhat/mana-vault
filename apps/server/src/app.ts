import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { initializeDatabase, openDatabase, type CardRow } from "./database.js";

export function buildApp(database = openDatabase()): FastifyInstance {
  initializeDatabase(database);
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.get<{ Querystring: { q?: string; color?: string; type?: string; set?: string; limit?: string } }>(
    "/api/cards",
    async (request, reply) => {
      const { q = "", color, type, set, limit = "40" } = request.query;
      const parsedLimit = Number(limit);
      if (
        typeof q !== "string" ||
        q.length > 200 ||
        (color !== undefined && typeof color !== "string") ||
        (type !== undefined && typeof type !== "string") ||
        (set !== undefined && typeof set !== "string") ||
        typeof limit !== "string" ||
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 100
      ) {
        return reply.code(400).send({ error: "Invalid search parameters" });
      }
      if (color && !/^[WUBRG]$/.test(color.toUpperCase())) {
        return reply.code(400).send({ error: "Color must be one of W, U, B, R, or G" });
      }

      const conditions: string[] = [];
      const values: (string | number)[] = [];
      if (q.trim()) {
        const pattern = `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push("(name LIKE ? ESCAPE '\\' OR type_line LIKE ? ESCAPE '\\' OR oracle_text LIKE ? ESCAPE '\\')");
        values.push(pattern, pattern, pattern);
      }
      if (color) {
        conditions.push("instr(colors, ?) > 0");
        values.push(color.toUpperCase());
      }
      if (type?.trim()) {
        conditions.push("type_line LIKE ? ESCAPE '\\'");
        values.push(`%${type.trim().replace(/[\\%_]/g, "\\$&")}%`);
      }
      if (set?.trim()) {
        conditions.push("set_code = ?");
        values.push(set.trim().toLowerCase());
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = database.prepare(
        `SELECT id, oracle_id, name, mana_cost, type_line, oracle_text, colors, set_code, set_name, collector_number, rarity, image_url, released_at
         FROM cards ${where} ORDER BY name, released_at DESC LIMIT ?`,
      ).all(...values, parsedLimit);
      return rows.map(toCardRow);
    },
  );

  app.get("/api/collection", async () =>
    database.prepare(
      `SELECT c.id, c.name, c.set_code, c.set_name, c.collector_number, c.rarity, c.image_url,
              i.quantity, i.foil
       FROM collection_items i JOIN cards c ON c.id = i.card_id
       ORDER BY c.name, c.set_code`,
    ).all(),
  );

  app.patch<{ Params: { cardId: string }; Body: { quantity?: number; foil?: boolean } }>(
    "/api/collection/:cardId",
    async (request, reply) => {
      const { quantity, foil = false } = request.body ?? {};
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || typeof foil !== "boolean") {
        return reply.code(400).send({ error: "Provide a quantity from 1 to 10000 and a foil flag" });
      }
      const result = database.prepare(
        "UPDATE collection_items SET quantity = ? WHERE card_id = ? AND foil = ?",
      ).run(quantity, request.params.cardId, foil ? 1 : 0);
      if (!result.changes) return reply.code(404).send({ error: "Collection entry not found" });
      return { status: "updated" };
    },
  );

  app.delete<{ Params: { cardId: string }; Querystring: { foil?: string } }>(
    "/api/collection/:cardId",
    async (request, reply) => {
      const foil = request.query.foil ?? "false";
      if (foil !== "true" && foil !== "false") return reply.code(400).send({ error: "Foil must be true or false" });
      const result = database.prepare(
        "DELETE FROM collection_items WHERE card_id = ? AND foil = ?",
      ).run(request.params.cardId, foil === "true" ? 1 : 0);
      if (!result.changes) return reply.code(404).send({ error: "Collection entry not found" });
      return { status: "removed" };
    },
  );

  app.post<{ Body: { cardId?: string; quantity?: number; foil?: boolean } }>(
    "/api/collection",
    async (request, reply) => {
      const { cardId, quantity = 1, foil = false } = request.body ?? {};
      if (!cardId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000 || typeof foil !== "boolean") {
        return reply.code(400).send({ error: "Provide a cardId, a quantity from 1 to 10000, and a foil flag" });
      }
      const result = database.prepare(
        `INSERT INTO collection_items (card_id, quantity, foil)
         SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM cards WHERE id = ?)
         ON CONFLICT(card_id, foil) DO UPDATE SET quantity = quantity + excluded.quantity`,
      ).run(cardId, quantity, foil ? 1 : 0, cardId);
      if (result.changes === 0) {
        return reply.code(404).send({ error: "Card printing not found" });
      }
      const entry = database.prepare(
        `SELECT c.id, c.name, c.set_code, c.set_name, c.collector_number, c.rarity, c.image_url,
                i.quantity, i.foil
         FROM collection_items i JOIN cards c ON c.id = i.card_id
         WHERE i.card_id = ? AND i.foil = ?`,
      ).get(cardId, foil ? 1 : 0);
      return reply.code(200).send(entry);
    },
  );

  app.get("/api/decks", async () =>
    database.prepare(
      `SELECT d.id, d.name, d.format, d.mode, d.created_at, d.updated_at,
              COALESCE(SUM(dc.quantity), 0) AS card_count
       FROM decks d LEFT JOIN deck_cards dc ON dc.deck_id = d.id
       GROUP BY d.id ORDER BY d.updated_at DESC, d.name`,
    ).all(),
  );

  app.post<{ Body: { name?: string; format?: string; mode?: string } }>(
    "/api/decks",
    async (request, reply) => {
      const { name, format = "casual", mode = "normal" } = request.body ?? {};
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return reply.code(400).send({ error: "Deck name must be between 1 and 100 characters" });
      }
      if (!["normal", "theme"].includes(mode)) {
        return reply.code(400).send({ error: "Deck mode must be normal or theme" });
      }
      if (typeof format !== "string" || !["casual", "commander", "standard", "pioneer", "modern", "legacy", "pauper", "vintage"].includes(format)) {
        return reply.code(400).send({ error: "Choose a supported deck format" });
      }
      const id = randomUUID();
      database.prepare("INSERT INTO decks (id, name, format, mode) VALUES (?, ?, ?, ?)").run(id, name.trim(), format, mode);
      return reply.code(201).send(database.prepare(
        `SELECT id, name, format, mode, created_at, updated_at FROM decks WHERE id = ?`,
      ).get(id));
    },
  );

  app.get<{ Params: { deckId: string } }>("/api/decks/:deckId", async (request, reply) => {
    const deck = database.prepare(
      `SELECT id, name, format, mode, created_at, updated_at FROM decks WHERE id = ?`,
    ).get(request.params.deckId);
    if (!deck) return reply.code(404).send({ error: "Deck not found" });
    const cards = database.prepare(
      `SELECT dc.oracle_id, dc.printing_id, dc.quantity, dc.zone, c.name, c.mana_cost,
              c.type_line, c.set_code, c.set_name, c.collector_number, c.image_url
       FROM deck_cards dc JOIN cards c ON c.id = COALESCE(
         dc.printing_id,
         (SELECT p.id FROM cards p WHERE p.oracle_id = dc.oracle_id ORDER BY p.released_at DESC LIMIT 1)
       )
       WHERE dc.deck_id = ? ORDER BY dc.zone, c.name`,
    ).all(request.params.deckId);
    return { ...deck, cards };
  });

  app.post<{ Params: { deckId: string }; Body: { cardId?: string; quantity?: number; zone?: string } }>(
    "/api/decks/:deckId/cards",
    async (request, reply) => {
      const { cardId, quantity = 1, zone = "main" } = request.body ?? {};
      if (!cardId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !["main", "sideboard", "commander"].includes(zone)) {
        return reply.code(400).send({ error: "Provide a printing, quantity from 1 to 100, and a valid deck zone" });
      }
      const deck = database.prepare("SELECT id, mode FROM decks WHERE id = ?").get(request.params.deckId);
      if (!deck) return reply.code(404).send({ error: "Deck not found" });
      const card = database.prepare("SELECT id, oracle_id FROM cards WHERE id = ?").get(cardId);
      if (!card) return reply.code(404).send({ error: "Card printing not found" });
      if (typeof card.oracle_id !== "string") throw new Error("Card printing has no valid oracle ID");
      const selectedPrinting = deck.mode === "theme" ? cardId : null;
      database.prepare(
        `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(deck_id, oracle_id, zone) DO UPDATE SET
           printing_id = excluded.printing_id, quantity = quantity + excluded.quantity`,
      ).run(request.params.deckId, card.oracle_id, selectedPrinting, quantity, zone);
      database.prepare("UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(request.params.deckId);
      return reply.code(201).send({ status: "added" });
    },
  );

  app.patch<{ Params: { deckId: string; oracleId: string }; Querystring: { zone?: string }; Body: { quantity?: number; zone?: string } }>(
    "/api/decks/:deckId/cards/:oracleId",
    async (request, reply) => {
      const currentZone = request.query.zone ?? "main";
      const nextZone = request.body?.zone ?? currentZone;
      const { quantity } = request.body ?? {};
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        quantity > 100 ||
        !["main", "sideboard", "commander"].includes(currentZone) ||
        !["main", "sideboard", "commander"].includes(nextZone)
      ) {
        return reply.code(400).send({ error: "Provide a quantity from 0 to 100 and valid deck zones" });
      }
      const existing = database.prepare(
        `SELECT printing_id FROM deck_cards WHERE deck_id = ? AND oracle_id = ? AND zone = ?`,
      ).get(request.params.deckId, request.params.oracleId, currentZone);
      if (!existing) return reply.code(404).send({ error: "Deck card not found" });
      if (quantity === 0) {
        database.prepare("DELETE FROM deck_cards WHERE deck_id = ? AND oracle_id = ? AND zone = ?")
          .run(request.params.deckId, request.params.oracleId, currentZone);
      } else if (currentZone === nextZone) {
        database.prepare("UPDATE deck_cards SET quantity = ? WHERE deck_id = ? AND oracle_id = ? AND zone = ?")
          .run(quantity, request.params.deckId, request.params.oracleId, currentZone);
      } else {
        database.exec("BEGIN");
        try {
          database.prepare(
            `INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone)
             SELECT deck_id, oracle_id, printing_id, ?, ? FROM deck_cards
             WHERE deck_id = ? AND oracle_id = ? AND zone = ?
             ON CONFLICT(deck_id, oracle_id, zone) DO UPDATE SET
               printing_id = excluded.printing_id, quantity = quantity + excluded.quantity`,
          ).run(quantity, nextZone, request.params.deckId, request.params.oracleId, currentZone);
          database.prepare("DELETE FROM deck_cards WHERE deck_id = ? AND oracle_id = ? AND zone = ?")
            .run(request.params.deckId, request.params.oracleId, currentZone);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      }
      database.prepare("UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(request.params.deckId);
      return { status: quantity === 0 ? "removed" : "updated" };
    },
  );

  app.delete<{ Params: { deckId: string; oracleId: string }; Querystring: { zone?: string } }>(
    "/api/decks/:deckId/cards/:oracleId",
    async (request, reply) => {
      const zone = request.query.zone ?? "main";
      if (!["main", "sideboard", "commander"].includes(zone)) {
        return reply.code(400).send({ error: "Invalid deck zone" });
      }
      const result = database.prepare(
        "DELETE FROM deck_cards WHERE deck_id = ? AND oracle_id = ? AND zone = ?",
      ).run(request.params.deckId, request.params.oracleId, zone);
      if (!result.changes) return reply.code(404).send({ error: "Deck card not found" });
      database.prepare("UPDATE decks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(request.params.deckId);
      return { status: "removed" };
    },
  );

  return app;
}

function toCardRow(row: Record<string, unknown>): CardRow {
  const required = (key: string): string => {
    const value = row[key];
    if (typeof value !== "string") throw new Error(`Invalid card database value for ${key}`);
    return value;
  };
  const optional = (key: string): string | null => {
    const value = row[key];
    if (value === null || typeof value === "string") return value;
    throw new Error(`Invalid card database value for ${key}`);
  };
  return {
    id: required("id"),
    oracle_id: required("oracle_id"),
    name: required("name"),
    mana_cost: optional("mana_cost"),
    type_line: required("type_line"),
    oracle_text: optional("oracle_text"),
    colors: required("colors"),
    set_code: required("set_code"),
    set_name: required("set_name"),
    collector_number: required("collector_number"),
    rarity: required("rarity"),
    image_url: optional("image_url"),
    released_at: optional("released_at"),
  };
}
