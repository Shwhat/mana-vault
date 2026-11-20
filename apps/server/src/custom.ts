// ---------- custom cards and custom sets: cards made in the card maker, stored in the card database for every account ----------
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { FORMATS } from "./decks.js";

const LEGALITY_FORMATS = FORMATS.filter((format) => format !== "casual");
const RARITIES = ["common", "uncommon", "rare", "mythic", "special"];
const FINISHES = ["nonfoil", "foil", "etched"];
const COLORS = ["W", "U", "B", "R", "G"];
/** Card pictures and art are sent as data URLs of JPEG, PNG or WebP pictures. */
const IMAGE_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_ART = 10 * 1024 * 1024;
const MAX_PICTURE = 6 * 1024 * 1024;
const MAX_SYMBOL = 512 * 1024;

type Picture = { bytes: Uint8Array; type: string };

function readPicture(value: unknown, limit: number): Picture | null | string {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return "Pictures must be sent as JPEG, PNG or WebP data";
  const match = IMAGE_PATTERN.exec(value);
  if (!match) return "Pictures must be JPEG, PNG or WebP";
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length > limit) return `Pictures can be up to ${Math.round(limit / 1024 / 1024)} MB`;
  return { bytes: new Uint8Array(bytes), type: match[1]! };
}

/** The mana value of a mana cost: numbers count as themselves, X as 0, hybrid like {2/W} as its larger part, every other symbol as 1. */
export function manaValueOf(cost: string): number {
  let total = 0;
  for (const [, symbol] of cost.matchAll(/\{([^}]+)\}/g)) {
    const upper = symbol!.toUpperCase();
    if (/^\d+$/.test(upper)) total += Number(upper);
    else if (upper === "X" || upper === "Y" || upper === "Z") continue;
    else if (upper.includes("/")) total += Math.max(...upper.split("/").map((part) => (/^\d+$/.test(part) ? Number(part) : 1)));
    else total += 1;
  }
  return total;
}

/** The colors named by mana symbols in a text, in WUBRG order. */
export function colorsIn(text: string): string[] {
  const found = new Set<string>();
  for (const [, symbol] of text.matchAll(/\{([^}]+)\}/g)) {
    for (const part of symbol!.toUpperCase().split("/")) if (COLORS.includes(part)) found.add(part);
  }
  return COLORS.filter((color) => found.has(color));
}

type Face = { name: string; manaCost: string; typeLine: string; oracleText: string; power: string; toughness: string; loyalty: string };

type CardInput = {
  setCode: string; collectorNumber: string; rarity: string; artist: string; finishes: string[];
  front: Face; back: Face | null; colors: string[] | null; colorIdentity: string[] | null;
  legalities: Record<string, string>; price: { usd: number | null; eur: number | null }; tokens: Array<{ id: string; name: string }>;
  flavorText: string;
};

const text = (value: unknown, limit: number) => (typeof value === "string" ? value.trim().slice(0, limit) : "");

function readFace(value: unknown): Face | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    name: text(raw.name, 150), manaCost: text(raw.manaCost, 100), typeLine: text(raw.typeLine, 200), oracleText: text(raw.oracleText, 4000),
    power: text(raw.power, 10), toughness: text(raw.toughness, 10), loyalty: text(raw.loyalty, 10),
  };
}

function readColors(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return null;
  const list = value.map((item) => String(item).toUpperCase());
  return COLORS.filter((color) => list.includes(color));
}

function readPrice(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 1_000_000 ? Math.round(number * 100) / 100 : null;
}

export function readCardInput(body: unknown): CardInput | string {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const front = readFace(raw.front);
  if (!front?.name) return "Give the card a name";
  if (!front.typeLine) return "Give the card a type line";
  const back = raw.back ? readFace(raw.back) : null;
  if (raw.back && !back?.name) return "Give the back face a name";
  const setCode = text(raw.setCode, 6).toLowerCase();
  if (!setCode) return "Choose a custom set";
  const collectorNumber = text(raw.collectorNumber, 10);
  if (!/^[A-Za-z0-9-]{1,10}$/.test(collectorNumber)) return "The collector number can have up to 10 letters, digits and dashes";
  const rarity = RARITIES.includes(String(raw.rarity)) ? String(raw.rarity) : "common";
  const finishes = Array.isArray(raw.finishes) ? FINISHES.filter((finish) => (raw.finishes as unknown[]).includes(finish)) : ["nonfoil"];
  if (!finishes.length) return "Choose at least one finish";
  const legalities: Record<string, string> = {};
  const given = raw.legalities && typeof raw.legalities === "object" ? raw.legalities as Record<string, unknown> : {};
  // a format the maker did not mark legal is not legal; new custom cards are legal in Casual only
  for (const format of LEGALITY_FORMATS) legalities[format] = given[format] === "legal" ? "legal" : "not_legal";
  const prices = raw.price && typeof raw.price === "object" ? raw.price as Record<string, unknown> : {};
  const tokens = Array.isArray(raw.tokens)
    ? raw.tokens.slice(0, 20).flatMap((item) => {
      const token = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return typeof token.id === "string" && typeof token.name === "string" ? [{ id: token.id.slice(0, 80), name: token.name.slice(0, 150) }] : [];
    })
    : [];
  return {
    setCode, collectorNumber, rarity, artist: text(raw.artist, 100), finishes, front, back,
    colors: readColors(raw.colors), colorIdentity: readColors(raw.colorIdentity), legalities,
    price: { usd: readPrice(prices.usd), eur: readPrice(prices.eur) }, tokens, flavorText: text(raw.flavorText, 1000),
  };
}

const ownerName = (database: DatabaseSync, id: unknown) =>
  typeof id === "number" ? String(database.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name ?? "") : "";

/** Where a custom card is used: copies and deck cards of other accounts block deleting it. */
export function customCardUse(database: DatabaseSync, cardId: string, userId: number) {
  const others = Number(database.prepare(
    `SELECT (SELECT COUNT(*) FROM collection_cards i JOIN collections c ON c.id = i.collection_id WHERE i.card_id = ? AND c.owner_id != ?)
          + (SELECT COUNT(*) FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.printing_id = ? AND d.owner_id != ?)
          + (SELECT COUNT(*) FROM trade_lines l JOIN trades t ON t.id = l.trade_id WHERE l.card_id = ? AND (t.owner_id != ? OR t.partner_id IS NOT NULL)) AS n`,
  ).get(cardId, userId, cardId, userId, cardId, userId)?.n ?? 0);
  const copies = Number(database.prepare(
    "SELECT COALESCE(SUM(i.quantity), 0) AS n FROM collection_cards i JOIN collections c ON c.id = i.collection_id WHERE i.card_id = ? AND c.owner_id = ?",
  ).get(cardId, userId)?.n ?? 0);
  const deckCards = Number(database.prepare(
    "SELECT COALESCE(SUM(dc.quantity), 0) AS n FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.printing_id = ? AND d.owner_id = ?",
  ).get(cardId, userId)?.n ?? 0);
  return { others, copies, deckCards };
}

/** Writes the card database row of a custom card from its card data. */
function writeCardRow(database: DatabaseSync, id: string, oracleId: string, input: CardInput, version: number): void {
  const set = database.prepare("SELECT name, released_at FROM sets WHERE code = ?").get(input.setCode);
  const faces = input.back ? [input.front, input.back] : [input.front];
  const name = faces.map((face) => face.name).join(" // ");
  const typeLine = faces.map((face) => face.typeLine).join(" // ");
  const oracle = faces.map((face) => [face.oracleText, face.loyalty ? `Loyalty: ${face.loyalty}` : ""].filter(Boolean).join("\n")).join("\n//\n");
  const manaCost = faces.map((face) => face.manaCost).filter(Boolean).join(" // ");
  const allText = faces.map((face) => `${face.manaCost} ${face.oracleText}`).join(" ");
  const colors = input.colors ?? colorsIn(input.front.manaCost);
  const identity = input.colorIdentity ?? colorsIn(allText);
  const image = `/api/custom/cards/${id}/picture?v=${version}`;
  database.prepare(
    `INSERT INTO cards (id, oracle_id, name, mana_cost, mana_value, type_line, oracle_text, colors, color_identity, legalities, set_code, set_name,
       collector_number, rarity, image_url, released_at, artist, custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, mana_cost = excluded.mana_cost, mana_value = excluded.mana_value, type_line = excluded.type_line,
       oracle_text = excluded.oracle_text, colors = excluded.colors, color_identity = excluded.color_identity, legalities = excluded.legalities,
       set_code = excluded.set_code, set_name = excluded.set_name, collector_number = excluded.collector_number, rarity = excluded.rarity,
       image_url = excluded.image_url, released_at = excluded.released_at, artist = excluded.artist, custom = 1`,
  ).run(id, oracleId, name, manaCost || null, manaValueOf(input.front.manaCost), typeLine, oracle || null, colors.join(""), identity.join(""),
    JSON.stringify(input.legalities), input.setCode, String(set?.name ?? input.setCode.toUpperCase()), input.collectorNumber, input.rarity, image,
    (set?.released_at as string | null) ?? null, input.artist || null);
  database.prepare("UPDATE cards SET finishes = ?, promo = 0, variation = 0 WHERE id = ?").run(input.finishes.join(","), id);
  database.prepare("UPDATE cards SET price_usd = ?, price_usd_foil = ?, price_usd_etched = NULL, price_eur = ?, price_eur_foil = ?, flavor_name = NULL WHERE id = ?")
    .run(input.price.usd, input.finishes.includes("foil") ? input.price.usd : null, input.price.eur, input.finishes.includes("foil") ? input.price.eur : null, id);
  database.prepare("UPDATE cards SET power = ?, toughness = ? WHERE id = ?").run(input.front.power || null, input.front.toughness || null, id);
  database.prepare("UPDATE cards SET produced_mana = '', tokens = ? WHERE id = ?").run(input.tokens.length ? JSON.stringify(input.tokens) : "", id);
}

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

/** Custom sets with their maker and card count. */
export function listCustomSets(database: DatabaseSync) {
  return database.prepare(
    `SELECT cs.code, s.name, s.released_at, cs.owner_id, u.name AS owner_name, cs.symbol IS NOT NULL AS has_symbol,
            (SELECT COUNT(*) FROM cards c WHERE c.set_code = cs.code AND c.custom = 1) AS card_count
     FROM custom_sets cs JOIN sets s ON s.code = cs.code LEFT JOIN users u ON u.id = cs.owner_id ORDER BY s.name`,
  ).all().map((row) => ({
    code: String(row.code), name: String(row.name), releasedAt: (row.released_at as string | null) ?? null, ownerId: (row.owner_id as number | null) ?? null,
    ownerName: String(row.owner_name ?? ""), hasSymbol: Number(row.has_symbol) === 1, cardCount: Number(row.card_count),
    symbolUrl: Number(row.has_symbol) === 1 ? `/api/custom/sets/${String(row.code)}/symbol` : null,
  }));
}

/** Every custom card with the card maker's design, for the card maker's list. */
export function listCustomCards(database: DatabaseSync) {
  return database.prepare(
    `SELECT cc.id, cc.owner_id, u.name AS owner_name, cc.updated_at, cc.back_picture IS NOT NULL AS has_back, c.name, c.set_code, c.set_name,
            c.collector_number, c.rarity, c.type_line, c.image_url
     FROM custom_cards cc JOIN cards c ON c.id = cc.id LEFT JOIN users u ON u.id = cc.owner_id ORDER BY c.name, c.set_code, c.collector_number`,
  ).all().map((row) => ({
    id: String(row.id), ownerId: (row.owner_id as number | null) ?? null, ownerName: String(row.owner_name ?? ""), updatedAt: String(row.updated_at),
    name: String(row.name), setCode: String(row.set_code), setName: String(row.set_name), collectorNumber: String(row.collector_number),
    rarity: String(row.rarity), typeLine: String(row.type_line), imageUrl: String(row.image_url ?? ""), hasBack: Number(row.has_back) === 1,
  }));
}

export function registerCustomRoutes(app: FastifyInstance, database: DatabaseSync) {
  // the phone downloads the card list again when a custom card changes
  const onChange = () => database.prepare(
    "INSERT INTO catalog_metadata (key, value) VALUES ('custom_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(new Date().toISOString());
  const userOf = (request: { user: { id: number } | null }) => request.user!.id;
  const big = { bodyLimit: 40 * 1024 * 1024 };

  // ---------- sets ----------
  app.get("/api/custom/sets", async () => listCustomSets(database));

  app.post<{ Body: Record<string, unknown> }>("/api/custom/sets", async (request, reply) => {
    const code = text(request.body?.code, 6).toLowerCase();
    const name = text(request.body?.name, 100);
    const releasedAt = text(request.body?.releasedAt, 10) || new Date().toISOString().slice(0, 10);
    if (!/^[a-z0-9]{2,6}$/.test(code)) return reply.code(400).send({ error: "A set code has 2 to 6 letters or digits, such as XXX" });
    if (!name) return reply.code(400).send({ error: "Give the set a name" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releasedAt)) return reply.code(400).send({ error: "The release date must be a date such as 2026-11-19" });
    if (database.prepare("SELECT 1 FROM sets WHERE code = ? UNION SELECT 1 FROM cards WHERE set_code = ? LIMIT 1").get(code, code)) {
      return reply.code(409).send({ error: `The set code ${code.toUpperCase()} is already used by another set` });
    }
    const symbol = readPicture(request.body?.symbol, MAX_SYMBOL);
    if (typeof symbol === "string") return reply.code(400).send({ error: symbol });
    transaction(database, () => {
      database.prepare("INSERT INTO sets (code, name, set_type, released_at, printed_size, card_count) VALUES (?, ?, 'custom', ?, NULL, NULL)").run(code, name, releasedAt);
      database.prepare("INSERT INTO custom_sets (code, owner_id, symbol, symbol_type) VALUES (?, ?, ?, ?)").run(code, userOf(request), symbol?.bytes ?? null, symbol?.type ?? null);
    });
    onChange();
    return reply.code(201).send(listCustomSets(database).find((set) => set.code === code));
  });

  const ownSet = (code: string) => database.prepare("SELECT owner_id FROM custom_sets WHERE code = ?").get(code.toLowerCase());

  app.patch<{ Params: { code: string }; Body: Record<string, unknown> }>("/api/custom/sets/:code", async (request, reply) => {
    const code = request.params.code.toLowerCase();
    const set = ownSet(code);
    if (!set) return reply.code(404).send({ error: "Custom set not found" });
    if (set.owner_id !== userOf(request)) return reply.code(403).send({ error: "Only the account that made this set can change it" });
    const name = request.body?.name === undefined ? null : text(request.body.name, 100);
    if (name === "") return reply.code(400).send({ error: "Give the set a name" });
    const releasedAt = request.body?.releasedAt === undefined ? null : text(request.body.releasedAt, 10);
    if (releasedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(releasedAt)) return reply.code(400).send({ error: "The release date must be a date such as 2026-11-19" });
    const symbol = request.body?.symbol === undefined ? undefined : readPicture(request.body.symbol, MAX_SYMBOL);
    if (typeof symbol === "string") return reply.code(400).send({ error: symbol });
    transaction(database, () => {
      if (name) {
        database.prepare("UPDATE sets SET name = ? WHERE code = ?").run(name, code);
        database.prepare("UPDATE cards SET set_name = ? WHERE set_code = ? AND custom = 1").run(name, code);
      }
      if (releasedAt) {
        database.prepare("UPDATE sets SET released_at = ? WHERE code = ?").run(releasedAt, code);
        database.prepare("UPDATE cards SET released_at = ? WHERE set_code = ? AND custom = 1").run(releasedAt, code);
      }
      if (symbol !== undefined) database.prepare("UPDATE custom_sets SET symbol = ?, symbol_type = ? WHERE code = ?").run(symbol?.bytes ?? null, symbol?.type ?? null, code);
    });
    onChange();
    return listCustomSets(database).find((item) => item.code === code);
  });

  app.delete<{ Params: { code: string } }>("/api/custom/sets/:code", async (request, reply) => {
    const code = request.params.code.toLowerCase();
    const set = ownSet(code);
    if (!set) return reply.code(404).send({ error: "Custom set not found" });
    if (set.owner_id !== userOf(request)) return reply.code(403).send({ error: "Only the account that made this set can delete it" });
    if (database.prepare("SELECT 1 FROM cards WHERE set_code = ? AND custom = 1 LIMIT 1").get(code)) {
      return reply.code(409).send({ error: "Delete or move the cards in this set first" });
    }
    transaction(database, () => {
      database.prepare("DELETE FROM custom_sets WHERE code = ?").run(code);
      database.prepare("DELETE FROM sets WHERE code = ?").run(code);
    });
    onChange();
    return { status: "deleted" };
  });

  // set symbols are pictures on cards, so they load without sign-in like card pictures
  app.get<{ Params: { code: string } }>("/api/custom/sets/:code/symbol", async (request, reply) => {
    const row = database.prepare("SELECT symbol, symbol_type FROM custom_sets WHERE code = ?").get(request.params.code.toLowerCase());
    if (!row?.symbol) return reply.code(404).send({ error: "This set has no symbol" });
    return reply.header("cache-control", "private, max-age=300").type(String(row.symbol_type)).send(Buffer.from(row.symbol as Uint8Array));
  });

  // ---------- cards ----------
  app.get("/api/custom/cards", async () => listCustomCards(database));

  app.get<{ Params: { id: string } }>("/api/custom/cards/:id", async (request, reply) => {
    const row = database.prepare(
      "SELECT cc.id, cc.owner_id, cc.design, cc.version, cc.art IS NOT NULL AS has_art, cc.back_art IS NOT NULL AS has_back_art FROM custom_cards cc WHERE cc.id = ?",
    ).get(request.params.id);
    if (!row) return reply.code(404).send({ error: "Custom card not found" });
    let design: unknown = {};
    try {
      design = JSON.parse(String(row.design));
    } catch {
      design = {};
    }
    return {
      id: String(row.id), ownerId: (row.owner_id as number | null) ?? null, ownerName: ownerName(database, row.owner_id), design, version: Number(row.version),
      artUrl: Number(row.has_art) === 1 ? `/api/custom/cards/${String(row.id)}/art?v=${Number(row.version)}` : null,
      backArtUrl: Number(row.has_back_art) === 1 ? `/api/custom/cards/${String(row.id)}/art?face=back&v=${Number(row.version)}` : null,
      use: customCardUse(database, String(row.id), userOf(request)),
    };
  });

  /** Reads the card data, design and pictures of a save. Returns an error message or the parts. */
  const readSave = (body: Record<string, unknown> | undefined, cardId: string | null) => {
    const input = readCardInput(body?.card);
    if (typeof input === "string") return input;
    if (!database.prepare("SELECT 1 FROM custom_sets WHERE code = ?").get(input.setCode)) return "Choose a custom set";
    const taken = database.prepare("SELECT id FROM cards WHERE set_code = ? AND collector_number = ? COLLATE NOCASE AND id IS NOT ?")
      .get(input.setCode, input.collectorNumber, cardId);
    if (taken) return `${input.setCode.toUpperCase()} already has a card numbered ${input.collectorNumber}`;
    const picture = readPicture(body?.picture, MAX_PICTURE);
    if (typeof picture === "string") return picture;
    const backPicture = readPicture(body?.backPicture, MAX_PICTURE);
    if (typeof backPicture === "string") return backPicture;
    const art = body?.art === undefined ? undefined : readPicture(body.art, MAX_ART);
    if (typeof art === "string") return art;
    const backArt = body?.backArt === undefined ? undefined : readPicture(body.backArt, MAX_ART);
    if (typeof backArt === "string") return backArt;
    const design = JSON.stringify(body?.design && typeof body.design === "object" ? body.design : {});
    if (design.length > 200_000) return "The card design is too large";
    return { input, picture, backPicture, art, backArt, design };
  };

  app.post<{ Body: Record<string, unknown> }>("/api/custom/cards", big, async (request, reply) => {
    const parts = readSave(request.body, null);
    if (typeof parts === "string") return reply.code(400).send({ error: parts });
    if (!parts.picture) return reply.code(400).send({ error: "The card picture is missing" });
    const id = `custom-${randomUUID()}`;
    transaction(database, () => {
      writeCardRow(database, id, `custom-oracle-${randomUUID()}`, parts.input, 1);
      database.prepare(
        `INSERT INTO custom_cards (id, owner_id, design, picture, picture_type, back_picture, back_picture_type, art, art_type, back_art, back_art_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, userOf(request), parts.design, parts.picture!.bytes, parts.picture!.type, parts.backPicture?.bytes ?? null, parts.backPicture?.type ?? null,
        parts.art?.bytes ?? null, parts.art?.type ?? null, parts.backArt?.bytes ?? null, parts.backArt?.type ?? null);
    });
    onChange();
    return reply.code(201).send(listCustomCards(database).find((card) => card.id === id));
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/custom/cards/:id", big, async (request, reply) => {
    const id = request.params.id;
    const row = database.prepare("SELECT owner_id, version FROM custom_cards WHERE id = ?").get(id);
    if (!row) return reply.code(404).send({ error: "Custom card not found" });
    if (row.owner_id !== userOf(request)) return reply.code(403).send({ error: "Only the account that made this card can change it" });
    const parts = readSave(request.body, id);
    if (typeof parts === "string") return reply.code(400).send({ error: parts });
    const version = Number(row.version) + 1;
    const oracleId = String(database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(id)?.oracle_id ?? `custom-oracle-${randomUUID()}`);
    transaction(database, () => {
      writeCardRow(database, id, oracleId, parts.input, version);
      database.prepare("UPDATE custom_cards SET design = ?, version = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(parts.design, version, id);
      if (parts.picture) database.prepare("UPDATE custom_cards SET picture = ?, picture_type = ? WHERE id = ?").run(parts.picture.bytes, parts.picture.type, id);
      // a card without a back face loses its back picture
      database.prepare("UPDATE custom_cards SET back_picture = ?, back_picture_type = ? WHERE id = ?")
        .run(parts.input.back ? parts.backPicture?.bytes ?? null : null, parts.input.back ? parts.backPicture?.type ?? null : null, id);
      if (parts.art !== undefined) database.prepare("UPDATE custom_cards SET art = ?, art_type = ? WHERE id = ?").run(parts.art?.bytes ?? null, parts.art?.type ?? null, id);
      if (parts.backArt !== undefined) database.prepare("UPDATE custom_cards SET back_art = ?, back_art_type = ? WHERE id = ?").run(parts.backArt?.bytes ?? null, parts.backArt?.type ?? null, id);
      database.prepare("UPDATE collections SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id IN (SELECT collection_id FROM collection_cards WHERE card_id = ?)").run(id);
      database.prepare("UPDATE decks SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id IN (SELECT deck_id FROM deck_cards WHERE printing_id = ?)").run(id);
    });
    onChange();
    return listCustomCards(database).find((card) => card.id === id);
  });

  app.delete<{ Params: { id: string } }>("/api/custom/cards/:id", async (request, reply) => {
    const id = request.params.id;
    const row = database.prepare("SELECT owner_id FROM custom_cards WHERE id = ?").get(id);
    if (!row) return reply.code(404).send({ error: "Custom card not found" });
    const userId = userOf(request);
    if (row.owner_id !== userId) return reply.code(403).send({ error: "Only the account that made this card can delete it" });
    const use = customCardUse(database, id, userId);
    if (use.others > 0) return reply.code(409).send({ error: "Other accounts have this card in a collection, deck or trade, so it cannot be deleted" });
    transaction(database, () => {
      database.prepare("DELETE FROM deck_links WHERE card_id = ?").run(id);
      database.prepare("DELETE FROM deck_cards WHERE printing_id = ?").run(id);
      database.prepare("DELETE FROM collection_cards WHERE card_id = ?").run(id);
      database.prepare("DELETE FROM trade_lines WHERE card_id = ?").run(id);
      database.prepare("DELETE FROM custom_cards WHERE id = ?").run(id);
      database.prepare("DELETE FROM cards WHERE id = ? AND custom = 1").run(id);
    });
    onChange();
    return { status: "deleted", removedCopies: use.copies, removedDeckCards: use.deckCards };
  });

  // card pictures load without sign-in, like the Scryfall pictures of other cards (the id cannot be guessed)
  app.get<{ Params: { id: string }; Querystring: { face?: string } }>("/api/custom/cards/:id/picture", async (request, reply) => {
    const back = request.query.face === "back";
    const row = database.prepare(`SELECT ${back ? "back_picture AS bytes, back_picture_type AS type" : "picture AS bytes, picture_type AS type"} FROM custom_cards WHERE id = ?`)
      .get(request.params.id);
    if (!row?.bytes) return reply.code(404).send({ error: "Card picture not found" });
    return reply.header("cache-control", "private, max-age=86400").type(String(row.type)).send(Buffer.from(row.bytes as Uint8Array));
  });

  app.get<{ Params: { id: string }; Querystring: { face?: string } }>("/api/custom/cards/:id/art", async (request, reply) => {
    const back = request.query.face === "back";
    const row = database.prepare(`SELECT ${back ? "back_art AS bytes, back_art_type AS type" : "art AS bytes, art_type AS type"} FROM custom_cards WHERE id = ?`)
      .get(request.params.id);
    if (!row?.bytes) return reply.code(404).send({ error: "Card art not found" });
    return reply.header("cache-control", "private, max-age=86400").type(String(row.type)).send(Buffer.from(row.bytes as Uint8Array));
  });
}

/** Paths that load without sign-in: custom card pictures and set symbols. */
export const CUSTOM_PUBLIC = /^\/api\/custom\/(?:cards\/custom-[0-9a-f-]{36}\/picture|sets\/[a-z0-9]{2,6}\/symbol)$/;
