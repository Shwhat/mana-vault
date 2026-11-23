// ---------- routes for MTGJSON data (0.21.0): Administration's MTGJSON parts, store prices and their history, original
// printed text, commander eligibility, Found in, precons as decks and collections, product barcodes, booster values and
// virtual packs. ----------
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isAdmin } from "./admin.js";
import { boosterConfig, boosterLabel, boosterNames, openPacks, setBoosterValues } from "./boosters.js";
import type { CopyKey } from "./copies.js";
import { logDeck } from "./decks.js";
import { access } from "./library.js";
import { relinkRemoved } from "./links.js";
import {
  ALL_PRICES_URL, downloadSize, historyChoice, importMtgjson, importPriceHistory, importPricesToday, initializeMtgjson,
  mtgjsonParts, mtgjsonRecord, priceSourceOf, skipPriceHistory, STORES, storeHistory, unmatchedCount,
} from "./mtgjson.js";
import { activeSource } from "./price-context.js";
import { deckList, listedCopies } from "./sealed.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const PRODUCT_LABELS: Record<string, string> = {
  play_booster: "Play booster", draft_booster: "Draft booster", set_booster: "Set booster", collector_booster: "Collector booster",
  jumpstart_booster: "Jumpstart booster", other_booster: "Other booster", booster_box: "Booster box", bundle: "Bundle",
  commander_deck: "Commander deck", deck: "Starter or other deck", prerelease_kit: "Prerelease kit", secret_lair: "Secret Lair", other: "Other",
};

export type MtgjsonRunner = { running: () => string | null; run: (what: "data" | "prices" | "history") => boolean; stop: () => void };

/**
 * Runs MTGJSON updates in the background on their own connection to the database file (the same connection for a
 * database kept in memory, as in tests), and checks once an hour whether today's prices are saved.
 */
export function startMtgjsonRunner(database: DatabaseSync, options: { fetcher?: Fetcher; databasePath?: string; schedule?: boolean }): MtgjsonRunner {
  const file = String(database.prepare("PRAGMA database_list").all().find((row) => row.name === "main")?.file ?? "");
  const folder = join(dirname(file || options.databasePath || "data/mana-vault.sqlite"), "mtgjson");
  let current: string | null = null;
  const run = (what: "data" | "prices" | "history") => {
    if (current) return false;
    current = what;
    const connection = file ? new DatabaseSync(file) : database;
    if (file) connection.exec("PRAGMA busy_timeout = 30000");
    const work = what === "history"
      ? importPriceHistory(connection, { fetcher: options.fetcher, folder })
      : what === "prices" ? importPricesToday(connection, { fetcher: options.fetcher, folder })
        : importMtgjson(connection, { fetcher: options.fetcher, folder, force: true });
    void Promise.resolve(work).catch((error: unknown) => console.warn(`MTGJSON update failed: ${error instanceof Error ? error.message : String(error)}`)).finally(() => {
      if (file) connection.close();
      current = null;
    });
    return true;
  };
  const timer = options.schedule === false ? null : setInterval(() => {
    const at = mtgjsonParts(database).find((part) => part.part === "Prices today")?.at ?? "";
    if (at.slice(0, 10) !== new Date().toISOString().slice(0, 10) && Number(database.prepare("SELECT COUNT(*) AS n FROM mtgjson_records").get()?.n ?? 0) > 0) run("prices");
  }, 60 * 60 * 1000);
  timer?.unref();
  return { running: () => current, run, stop: () => { if (timer) clearInterval(timer); } };
}

export function registerMtgjsonRoutes(app: FastifyInstance, database: DatabaseSync, runner: MtgjsonRunner, fetcher: Fetcher = fetch) {
  initializeMtgjson(database);
  const userOf = (request: FastifyRequest) => request.user!.id;
  const admin = (request: FastifyRequest, reply: FastifyReply) => {
    if (isAdmin(database, request.user?.id)) return true;
    void reply.code(403).send({ error: "Only an admin can do this." });
    return false;
  };

  // ---------- Administration, Card database: MTGJSON parts ----------
  app.get("/api/admin/mtgjson", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    return { parts: mtgjsonParts(database), unmatched: unmatchedCount(database), history: historyChoice(database), running: runner.running() };
  });
  app.get("/api/admin/mtgjson/history-size", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    return { bytes: await downloadSize(ALL_PRICES_URL, fetcher) };
  });
  app.post<{ Body: { what?: unknown } }>("/api/admin/mtgjson/update", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const what = request.body?.what === "prices" ? "prices" : request.body?.what === "history" ? "history" : "data";
    if (!runner.run(what)) return reply.code(409).send({ error: "An MTGJSON update is already running" });
    return { started: what };
  });
  app.post("/api/admin/mtgjson/history/skip", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    skipPriceHistory(database);
    return { history: historyChoice(database) };
  });

  // ---------- card details from MTGJSON ----------
  app.get<{ Params: { cardId: string } }>("/api/cards/:cardId/market", async (request, reply) => {
    const columns = STORES.flatMap((store) => ["r", "rf", "re", "b", "bf", "be"].map((kind) => `${store.prefix}_${kind}`)).join(", ");
    const row = database.prepare(
      `SELECT id, oracle_text, type_line, original_text, original_type, is_reprint, is_starter, lead_commander, lead_oathbreaker, lead_brawl, mtgjson_uuid,
              price_usd, price_usd_foil, price_usd_etched, ${columns} FROM cards WHERE id = ?`,
    ).get(request.params.cardId);
    if (!row) return reply.code(404).send({ error: "Card printing not found" });
    const value = (name: string) => (typeof row[name] === "number" ? row[name] as number : null);
    const prices = [
      ...STORES.map((store) => ({
        store: store.id, label: store.label, currency: store.currency,
        r: value(`${store.prefix}_r`), rf: value(`${store.prefix}_rf`), re: value(`${store.prefix}_re`),
        b: value(`${store.prefix}_b`), bf: value(`${store.prefix}_bf`), be: value(`${store.prefix}_be`),
      })),
      { store: "scryfall", label: "Scryfall", currency: "USD", r: value("price_usd"), rf: value("price_usd_foil"), re: value("price_usd_etched"), b: null, bf: null, be: null },
    ];
    const foundIn = database.prepare(
      `SELECT DISTINCT p.id, p.name, p.set_code, p.product, p.category, p.deck_name, p.deck_code, s.finish
       FROM mtgjson_sources s JOIN sealed_products p ON p.id = s.product_id WHERE s.card_id = ? ORDER BY p.product, p.name`,
    ).all(request.params.cardId);
    const products = new Map<string, { id: string; name: string; setCode: string; product: string; productLabel: string; deckName: string | null; deckCode: string | null; finishes: number[] }>();
    for (const item of foundIn) {
      const id = String(item.id);
      const have = products.get(id) ?? {
        id, name: String(item.name), setCode: String(item.set_code), product: String(item.product), productLabel: PRODUCT_LABELS[String(item.product)] ?? "Other",
        deckName: item.deck_name ? String(item.deck_name) : null, deckCode: item.deck_code ? String(item.deck_code) : null, finishes: [],
      };
      if (!have.finishes.includes(Number(item.finish))) have.finishes.push(Number(item.finish));
      products.set(id, have);
    }
    const lead = row.lead_commander === null || row.lead_commander === undefined ? null
      : { commander: Number(row.lead_commander) === 1, oathbreaker: Number(row.lead_oathbreaker) === 1, brawl: Number(row.lead_brawl) === 1 };
    return {
      mainSource: activeSource(),
      prices,
      oracleText: row.oracle_text ?? null, typeLine: row.type_line ?? null,
      printedText: row.original_text ?? null, printedType: row.original_type ?? null,
      isReprint: Number(row.is_reprint ?? 0) === 1, isStarter: Number(row.is_starter ?? 0) === 1,
      leadership: lead,
      hasRecord: !!row.mtgjson_uuid,
      foundIn: [...products.values()],
    };
  });

  app.get<{ Params: { cardId: string } }>("/api/cards/:cardId/store-history", async (request) => storeHistory(database, request.params.cardId));

  app.get<{ Params: { cardId: string } }>("/api/cards/:cardId/mtgjson-record", async (request, reply) => mtgjsonRecord(database, request.params.cardId) ?? reply.code(404).send({ error: "MTGJSON has no record of this printing" }));

  // ---------- precons ----------
  app.get<{ Querystring: { q?: string } }>("/api/precons", async (request) => {
    const words = String(request.query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    const rows = database.prepare(
      `SELECT d.code, d.name, d.type, d.cards IS NOT NULL AS kept, s.name AS set_name, s.released_at
       FROM sealed_decks d LEFT JOIN sets s ON s.code = lower(d.code) ORDER BY s.released_at DESC, d.name`,
    ).all();
    return rows.filter((row) => words.every((word) => `${String(row.name)} ${String(row.code)} ${String(row.set_name ?? "")} ${String(row.type)}`.toLowerCase().includes(word)))
      .slice(0, 300).map((row) => ({
        code: String(row.code), name: String(row.name), type: String(row.type ?? ""), setName: row.set_name ? String(row.set_name) : String(row.code),
        releasedAt: row.released_at ? String(row.released_at) : null, kept: Number(row.kept) === 1,
      }));
  });

  const readPrecon = async (body: { code?: unknown; name?: unknown } | undefined, reply: FastifyReply) => {
    if (typeof body?.code !== "string" || typeof body.name !== "string") {
      void reply.code(400).send({ error: "Choose a precon" });
      return null;
    }
    try {
      const deck = await deckList(database, body.code, body.name, fetcher);
      if (!deck) void reply.code(404).send({ error: "That precon is not in the deck list" });
      return deck;
    } catch (error) {
      void reply.code(502).send({ error: `The decklist could not be downloaded. ${error instanceof Error ? error.message : ""}`.trim() });
      return null;
    }
  };

  app.post<{ Body: { code?: unknown; name?: unknown } }>("/api/precons/deck", async (request, reply) => {
    const deck = await readPrecon(request.body, reply);
    if (!deck) return reply;
    const { cards, missing } = listedCopies(database, deck.list, ["commander", "main", "sideboard"]);
    const id = randomUUID();
    const format = cards.some((card) => card.zone === "commander") ? "commander" : "casual";
    const userId = userOf(request);
    database.exec("BEGIN");
    try {
      database.prepare("INSERT INTO decks (id, name, format, mode, owner_id) VALUES (?, ?, ?, 'theme', ?)").run(id, deck.name.slice(0, 100), format, userId);
      const insert = database.prepare("INSERT INTO deck_cards (deck_id, oracle_id, printing_id, quantity, zone, finish) VALUES (?, ?, ?, ?, ?, ?)");
      for (const card of cards) insert.run(id, card.oracleId, card.key.cardId, Math.min(100, card.quantity), card.zone, card.key.foil);
      logDeck(database, id, request.user!.name, `Made from the precon ${deck.name}`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return reply.code(201).send({ id, name: deck.name, cards: cards.reduce((sum, card) => sum + card.quantity, 0), missing });
  });

  app.post<{ Body: { code?: unknown; name?: unknown; collectionId?: unknown } }>("/api/precons/collection", async (request, reply) => {
    const userId = userOf(request);
    const collectionId = request.body?.collectionId;
    if (typeof collectionId !== "string" || !access(database, "collection", collectionId, userId)) return reply.code(404).send({ error: "Collection not found" });
    const deck = await readPrecon(request.body, reply);
    if (!deck) return reply;
    const { cards, missing } = listedCopies(database, deck.list, ["commander", "main", "sideboard"]);
    const merged = new Map<string, { key: CopyKey; quantity: number }>();
    for (const card of cards) {
      const id = `${card.key.cardId}:${card.key.foil}`;
      const have = merged.get(id);
      if (have) have.quantity += card.quantity;
      else merged.set(id, { key: card.key, quantity: card.quantity });
    }
    const added: Array<{ cardId: string; foil: number; condition: string; language: string; proxy: boolean; quantity: number }> = [];
    database.exec("BEGIN");
    try {
      const put = database.prepare(
        `INSERT INTO collection_cards (collection_id, card_id, foil, condition, language, proxy, quantity, added_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(collection_id, card_id, foil, condition, language, proxy) DO UPDATE SET quantity = MIN(10000, quantity + excluded.quantity)`,
      );
      for (const { key, quantity } of merged.values()) {
        put.run(collectionId, key.cardId, key.foil, key.condition, key.language, quantity);
        relinkRemoved(database, collectionId, key);
        added.push({ cardId: key.cardId, foil: key.foil, condition: key.condition, language: key.language, proxy: false, quantity });
      }
      database.prepare("UPDATE collections SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(collectionId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return { name: deck.name, added, cards: added.reduce((sum, card) => sum + card.quantity, 0), missing };
  });

  // ---------- product barcodes ----------
  app.get<{ Params: { code: string } }>("/api/sealed/barcode/:code", async (request, reply) => {
    const code = String(request.params.code).replace(/\D/g, "");
    if (code.length < 8 || code.length > 14) return reply.code(400).send({ error: "A barcode has 8 to 14 digits" });
    // UPC-A codes are also written with a leading 0 as EAN-13
    const row = database.prepare("SELECT id, set_code, name, short_name, product FROM sealed_products WHERE upc = ? OR upc = ? OR ltrim(upc, '0') = ltrim(?, '0') LIMIT 1")
      .get(code, code.padStart(13, "0"), code);
    if (!row) return reply.code(404).send({ error: "No product has that barcode" });
    return { sealedId: String(row.id), setCode: String(row.set_code), name: String(row.short_name || row.name), fullName: String(row.name), product: String(row.product) };
  });

  // ---------- booster contents ----------
  app.get<{ Querystring: { set?: string } }>("/api/boosters", async (request, reply) => {
    const setCode = String(request.query.set ?? "").toLowerCase();
    if (!/^[a-z0-9]{2,8}$/.test(setCode)) return reply.code(400).send({ error: "Choose a set" });
    return setBoosterValues(database, setCode, activeSource());
  });

  app.get("/api/boosters/sets", async () => database.prepare(
    `SELECT DISTINCT b.set_code, s.name, s.released_at FROM boosters b LEFT JOIN sets s ON s.code = b.set_code ORDER BY s.released_at DESC, b.set_code`,
  ).all().map((row) => ({ code: String(row.set_code), name: row.name ? String(row.name) : String(row.set_code).toUpperCase(), releasedAt: row.released_at ? String(row.released_at) : null, boosters: boosterNames(database, String(row.set_code)).map((name) => ({ name, label: boosterLabel(name) })) })));

  app.post<{ Body: { set?: unknown; booster?: unknown; count?: unknown } }>("/api/boosters/open", async (request, reply) => {
    const setCode = String(request.body?.set ?? "").toLowerCase();
    const name = String(request.body?.booster ?? "");
    const count = Number(request.body?.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 36) return reply.code(400).send({ error: "Open 1 to 36 packs at a time" });
    const config = boosterConfig(database, setCode, name);
    if (!config) return reply.code(404).send({ error: "That set has no contents for this booster" });
    const source = priceSourceOf(database, userOf(request));
    const packs = openPacks(database, config, count, source);
    const ids = [...new Set(packs.flatMap((pack) => pack.cards.map((card) => card.cardId)))];
    const cardRow = database.prepare("SELECT id, name, set_code, collector_number, rarity, image_url, finishes FROM cards WHERE id = ?");
    const cards = Object.fromEntries(ids.map((id) => {
      const row = cardRow.get(id)!;
      return [id, { id, name: String(row.name), set_code: String(row.set_code), collector_number: String(row.collector_number), rarity: String(row.rarity), image_url: row.image_url ?? null, finishes: String(row.finishes ?? "") }];
    }));
    return { packs, cards, expected: setBoosterValues(database, setCode, source).find((item) => item.name === name)?.value ?? null };
  });
}
