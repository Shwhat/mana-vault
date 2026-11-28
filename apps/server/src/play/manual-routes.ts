import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { access } from "../library.js";
import { DeckSnapshotError, snapshotDeck, type DeckSnapshot } from "./deck-snapshot.js";

type Zone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command";
type GameCard = {
  id: string;
  name: string;
  imageUrl: string | null;
  custom: boolean;
  token: boolean;
  tapped: boolean;
  faceDown: boolean;
  counters: Record<string, number>;
  attachedTo?: string;
};
type PlayerState = {
  userId: number;
  name: string;
  seat: number;
  library: GameCard[];
  hand: GameCard[];
  battlefield: GameCard[];
  graveyard: GameCard[];
  exile: GameCard[];
  command: GameCard[];
  life: number;
  poison: number;
  commanderDamage: Record<string, number>;
  conceded: boolean;
  lost?: boolean;
  opening?: { mulligans: number; bottom: number };
};
type RandomResult =
  | { number: number; seat: number; kind: "d6" | "d20"; value: number }
  | { number: number; seat: number; kind: "coin"; value: "heads" | "tails" };
type GameState = { turn: number; activeSeat: number; players: PlayerState[]; lastRandom?: RandomResult };

const ZONES: readonly Zone[] = ["library", "hand", "battlefield", "graveyard", "exile", "command"];
const COUNTER_NAMES = new Set(["+1/+1", "-1/-1", "loyalty", "charge", "custom"]);

function isOut(player: PlayerState): boolean {
  return player.conceded || player.lost === true;
}

function removeFromGame(state: GameState, player: PlayerState, reason: "concede" | "loss"): void {
  if (reason === "concede") player.conceded = true;
  else player.lost = true;
  if (state.activeSeat === player.seat) {
    const currentIndex = state.players.findIndex((item) => item.seat === player.seat);
    const next = state.players.slice(currentIndex + 1).concat(state.players.slice(0, currentIndex))
      .find((item) => !isOut(item));
    if (next) {
      if (next.seat <= player.seat) state.turn += 1;
      state.activeSeat = next.seat;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function signedIn(request: FastifyRequest, reply: FastifyReply): number | null {
  const userId = request.user?.id;
  if (!userId) {
    reply.code(401).send({ error: "Sign in to use manual tables." });
    return null;
  }
  return userId;
}

function initializeManualTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS play_manual_tables (
      id TEXT PRIMARY KEY,
      invite_code TEXT NOT NULL UNIQUE,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      player_limit INTEGER NOT NULL CHECK(player_limit IN (2, 4)),
      status TEXT NOT NULL CHECK(status IN ('waiting', 'active', 'closed')),
      revision INTEGER NOT NULL DEFAULT 0,
      state_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS play_manual_members (
      table_id TEXT NOT NULL REFERENCES play_manual_tables(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seat INTEGER NOT NULL,
      player_name TEXT NOT NULL,
      deck_name TEXT NOT NULL,
      deck_snapshot TEXT NOT NULL,
      PRIMARY KEY(table_id, user_id),
      UNIQUE(table_id, seat)
    );
    CREATE INDEX IF NOT EXISTS play_manual_members_user_idx ON play_manual_members(user_id, table_id);
    CREATE TABLE IF NOT EXISTS play_manual_spectators (
      table_id TEXT NOT NULL REFERENCES play_manual_tables(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(table_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS play_manual_spectators_user_idx ON play_manual_spectators(user_id, table_id);
  `);
}

function checkedSnapshot(database: DatabaseSync, deckId: unknown, userId: number): DeckSnapshot {
  if (typeof deckId !== "string" || !deckId || deckId.length > 128) {
    throw new DeckSnapshotError("Choose a saved Commander deck.");
  }
  const snapshot = snapshotDeck(database, deckId, userId);
  const cards = snapshot.cards.filter((card) => card.zone === "main" || card.zone === "commander");
  if (!cards.some((card) => card.zone === "commander")) {
    throw new DeckSnapshotError("Add a commander to the saved deck before joining a table.");
  }
  const total = cards.reduce((sum, card) => sum + card.quantity, 0);
  if (total > 250) throw new DeckSnapshotError("The table supports decks of up to 250 cards.");
  if (cards.some((card) => !card.printing || card.printing.removed)) {
    throw new DeckSnapshotError("The saved deck contains a card without an available printing.");
  }
  return snapshot;
}

function createCards(snapshot: DeckSnapshot, zone: "main" | "commander"): GameCard[] {
  const cards: GameCard[] = [];
  for (const entry of snapshot.cards) {
    if (entry.zone !== zone) continue;
    if (!entry.printing || entry.printing.removed) throw new Error("Manual table snapshot contains an unavailable printing");
    for (let copy = 0; copy < entry.quantity; copy += 1) {
      cards.push({
        id: randomUUID(),
        name: entry.printing.name,
        imageUrl: entry.printing.imageUrl,
        custom: entry.printing.custom,
        token: false,
        tapped: false,
        faceDown: false,
        counters: {},
      });
    }
  }
  return cards;
}

function shuffle(cards: GameCard[]): void {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    const card = cards[index];
    const swapped = cards[swap];
    if (card && swapped) {
      cards[index] = swapped;
      cards[swap] = card;
    }
  }
}

function parseState(value: unknown): GameState {
  if (typeof value !== "string") throw new Error("Manual table state is missing");
  const state: unknown = JSON.parse(value);
  if (!isRecord(state) || !Number.isSafeInteger(state.turn) || !Number.isSafeInteger(state.activeSeat)
    || !Array.isArray(state.players) || !state.players.every((player) => isRecord(player)
      && Number.isSafeInteger(player.userId) && Number.isSafeInteger(player.seat)
      && Array.isArray(player.library) && Array.isArray(player.hand)
      && Array.isArray(player.battlefield) && Array.isArray(player.graveyard)
      && Array.isArray(player.exile) && Array.isArray(player.command))) {
    throw new Error("Manual table state is invalid");
  }
  return state as GameState;
}

function projectTable(database: DatabaseSync, table: Record<string, unknown>, userId: number, spectator = false) {
  const members = database.prepare(
    "SELECT user_id, seat, player_name, deck_name FROM play_manual_members WHERE table_id = ? ORDER BY seat",
  ).all(String(table.id));
  const state = table.state_json === null ? null : parseState(table.state_json);
  const players = members.map((member) => {
    const seat = Number(member.seat);
    const gamePlayer = state?.players.find((player) => player.seat === seat);
    const own = Number(member.user_id) === userId;
    return {
      seat,
      name: String(member.player_name),
      deckName: state ? undefined : String(member.deck_name),
      ready: true,
      life: gamePlayer?.life ?? 40,
      poison: gamePlayer?.poison ?? 0,
      libraryCount: gamePlayer?.library.length ?? null,
      handCount: gamePlayer?.hand.length ?? null,
      hand: own ? gamePlayer?.hand ?? [] : undefined,
      opening: own ? gamePlayer?.opening : undefined,
      battlefield: gamePlayer?.battlefield.map((card) => card.faceDown && !own
        ? { id: card.id, name: "Face down", imageUrl: null, custom: false, token: false, tapped: card.tapped, faceDown: true, counters: card.counters, attachedTo: card.attachedTo }
        : card) ?? [],
      graveyard: gamePlayer?.graveyard ?? [],
      exile: gamePlayer?.exile ?? [],
      command: gamePlayer?.command ?? [],
      commanderDamage: gamePlayer?.commanderDamage ?? {},
      conceded: gamePlayer?.conceded ?? false,
      lost: gamePlayer?.lost ?? false,
    };
  });
  return {
    id: String(table.id),
    status: String(table.status),
    playerLimit: Number(table.player_limit),
    revision: Number(table.revision),
    role: spectator ? "spectator" : "player",
    ...(Number(table.owner_id) === userId && typeof table.invite_code === "string" && table.status !== "closed"
      ? { inviteCode: table.invite_code } : {}),
    turn: state?.turn ?? null,
    activeSeat: state?.activeSeat ?? null,
    lastRandom: state?.lastRandom ?? null,
    players,
  };
}

function tableForUser(database: DatabaseSync, tableId: string, userId: number) {
  const table = database.prepare(
    `SELECT t.* FROM play_manual_tables t
     JOIN play_manual_members m ON m.table_id = t.id
     WHERE t.id = ? AND m.user_id = ?`,
  ).get(tableId, userId);
  return table ?? null;
}

function tableForSpectator(database: DatabaseSync, tableId: string, userId: number) {
  const table = database.prepare(
    `SELECT t.* FROM play_manual_tables t
     JOIN play_manual_spectators s ON s.table_id = t.id
     WHERE t.id = ? AND s.user_id = ?`,
  ).get(tableId, userId);
  return table ?? null;
}

function tableForViewer(database: DatabaseSync, tableId: string, userId: number) {
  const playerTable = tableForUser(database, tableId, userId);
  if (playerTable) return { table: playerTable, spectator: false };
  const spectatorTable = tableForSpectator(database, tableId, userId);
  return spectatorTable ? { table: spectatorTable, spectator: true } : null;
}

function responseError(reply: FastifyReply, error: unknown) {
  if (error instanceof DeckSnapshotError) return reply.code(422).send({ error: error.message });
  throw error;
}

function applyAction(state: GameState, actorId: number, action: unknown): string | null {
  if (!isRecord(action) || typeof action.type !== "string") return "Choose a valid table action.";
  const player = state.players.find((item) => item.userId === actorId);
  if (!player) return "You are not seated at this table.";
  if (isOut(player)) return "You are no longer in this game.";
  const type = action.type;
  if (player.opening && player.opening.bottom > 0 && !["mulligan", "bottom", "random", "concede", "loss"].includes(type)) {
    return "Put the required opening cards on the bottom of your library first.";
  }
  if (type === "mulligan") {
    if (!player.opening || player.opening.mulligans >= 8) return "You cannot mulligan this hand.";
    player.library.push(...player.hand);
    player.hand = [];
    shuffle(player.library);
    player.hand = player.library.splice(0, 7);
    player.opening.mulligans += 1;
    player.opening.bottom = Math.min(player.hand.length, player.opening.mulligans - 1);
  } else if (type === "bottom") {
    if (!player.opening || player.opening.bottom <= 0 || typeof action.cardId !== "string") {
      return "Choose an opening card to put on the bottom.";
    }
    const index = player.hand.findIndex((card) => card.id === action.cardId);
    if (index < 0) return "Choose a card from your hand.";
    const [card] = player.hand.splice(index, 1);
    if (!card) return "Choose a card from your hand.";
    player.library.push(card);
    player.opening.bottom -= 1;
    if (player.opening.bottom === 0) delete player.opening;
  } else if (type === "keep") {
    if (!player.opening) return "Your opening hand is already kept.";
    delete player.opening;
  } else if (type === "draw") {
    const card = player.library.shift();
    if (!card) return "Your library is empty.";
    player.hand.push(card);
  } else if (type === "shuffle") {
    shuffle(player.library);
  } else if (type === "random") {
    const number = (state.lastRandom?.number ?? 0) + 1;
    if (action.kind === "d6" || action.kind === "d20") {
      state.lastRandom = { number, seat: player.seat, kind: action.kind, value: randomInt(1, action.kind === "d6" ? 7 : 21) };
    } else if (action.kind === "coin") {
      state.lastRandom = { number, seat: player.seat, kind: "coin", value: randomInt(2) === 0 ? "heads" : "tails" };
    } else {
      return "Choose a d6, d20, or coin.";
    }
  } else if (type === "play" || type === "playFaceDown" || type === "move") {
    const cardId = action.cardId;
    const from = type === "move" ? action.from : "hand";
    const to = type === "move" ? action.to : "battlefield";
    if (typeof cardId !== "string" || !ZONES.includes(from as Zone) || !ZONES.includes(to as Zone) || from === to) {
      return "Choose a valid card and destination.";
    }
    if (action.position !== undefined && (to !== "library" || (action.position !== "top" && action.position !== "bottom"))) {
      return "Choose the top or bottom of your library.";
    }
    const source = player[from as Zone];
    const index = source.findIndex((card) => card.id === cardId);
    if (index < 0) return "That card is not in your zone.";
    const [card] = source.splice(index, 1);
    if (!card) return "That card is not in your zone.";
    card.counters = {};
    if (type === "playFaceDown") card.faceDown = true;
    if (to !== "battlefield") {
      card.faceDown = false;
      card.tapped = false;
      delete card.attachedTo;
      if (from === "battlefield") {
        for (const other of state.players.flatMap((item) => item.battlefield)) {
          if (other.attachedTo === card.id) delete other.attachedTo;
        }
      }
    }
    if (to === "library" && action.position === "top") player.library.unshift(card);
    else player[to as Zone].push(card);
  } else if (type === "attach") {
    const card = player.battlefield.find((item) => item.id === action.cardId);
    if (!card || (action.targetId !== null && typeof action.targetId !== "string")) {
      return "Choose one of your battlefield cards and a valid attachment target.";
    }
    if (action.targetId === null) {
      delete card.attachedTo;
    } else {
      const battlefield = state.players.flatMap((item) => item.battlefield);
      let target = battlefield.find((item) => item.id === action.targetId);
      if (!target) return "Choose a battlefield card as the attachment target.";
      const visited = new Set<string>();
      while (target) {
        if (target.id === card.id || visited.has(target.id)) return "Attachments cannot form a cycle.";
        visited.add(target.id);
        target = battlefield.find((item) => item.id === target?.attachedTo);
      }
      card.attachedTo = action.targetId;
    }
  } else if (type === "faceDown") {
    const card = player.battlefield.find((item) => item.id === action.cardId);
    if (!card) return "Choose one of your battlefield cards.";
    card.faceDown = !card.faceDown;
  } else if (type === "tap") {
    const card = player.battlefield.find((item) => item.id === action.cardId);
    if (!card) return "Choose one of your battlefield cards.";
    card.tapped = !card.tapped;
  } else if (type === "counter") {
    const card = player.battlefield.find((item) => item.id === action.cardId);
    const counter = typeof action.counter === "string" ? action.counter.trim().slice(0, 32) : "";
    const delta = action.delta;
    if (!card || !counter || (counter !== "custom" && !COUNTER_NAMES.has(counter))
      || (delta !== 1 && delta !== -1)) return "Choose a valid counter change.";
    const current = card.counters[counter] ?? 0;
    const next = current + delta;
    if (next < 0 || next > 999) return "Counter total must be between 0 and 999.";
    if (next === 0) delete card.counters[counter];
    else card.counters[counter] = next;
  } else if (type === "life" || type === "poison") {
    const delta = action.delta;
    if (delta !== 1 && delta !== -1) return "Choose a valid total change.";
    const key = type === "life" ? "life" : "poison";
    const next = player[key] + delta;
    const max = type === "life" ? 100_000 : 99;
    if (next < 0 || next > max) return "Total is outside the supported range.";
    player[key] = next;
  } else if (type === "token") {
    const name = typeof action.name === "string" ? action.name.trim().slice(0, 100) : "";
    if (!name) return "Enter a token name.";
    if (player.battlefield.length >= 500) return "Your battlefield supports up to 500 cards.";
    player.battlefield.push({
      id: randomUUID(), name, imageUrl: null, custom: false, token: true,
      tapped: false, faceDown: false, counters: {},
    });
  } else if (type === "copy") {
    const card = player.battlefield.find((item) => item.id === action.cardId);
    if (!card) return "Choose one of your battlefield cards.";
    if (player.battlefield.length >= 500) return "Your battlefield supports up to 500 cards.";
    player.battlefield.push({
      id: randomUUID(), name: card.name, imageUrl: card.imageUrl, custom: card.custom, token: true,
      tapped: false, faceDown: card.faceDown, counters: {},
    });
  } else if (type === "commanderDamage") {
    const targetSeat = action.targetSeat;
    const delta = action.delta;
    const target = state.players.find((item) => item.seat === targetSeat && item.userId !== actorId);
    if (!target || (delta !== 1 && delta !== -1)) return "Choose a valid opponent and damage change.";
    const key = String(player.seat);
    const next = (target.commanderDamage[key] ?? 0) + delta;
    if (next < 0 || next > 999) return "Commander damage must be between 0 and 999.";
    if (next === 0) delete target.commanderDamage[key];
    else target.commanderDamage[key] = next;
  } else if (type === "turn") {
    if (state.activeSeat !== player.seat) return "Only the active player can end the turn.";
    if (state.players.some((item) => !isOut(item) && (item.opening?.bottom ?? 0) > 0)) {
      return "Wait for players to put their opening cards on the bottom.";
    }
    const remaining = state.players.filter((item) => !isOut(item));
    if (remaining.length < 2) return "There are not enough active players to continue.";
    const currentIndex = remaining.findIndex((item) => item.seat === player.seat);
    const next = remaining[(currentIndex + 1) % remaining.length];
    if (!next) return "There are not enough active players to continue.";
    if (next.seat <= player.seat) state.turn += 1;
    state.activeSeat = next.seat;
    for (const item of state.players) delete item.opening;
    for (const card of next.battlefield) card.tapped = false;
  } else if (type === "concede" || type === "loss") {
    removeFromGame(state, player, type);
  } else {
    return "That table action is not supported.";
  }
  if (!["mulligan", "bottom", "keep", "random"].includes(type)) delete player.opening;
  return null;
}

export function registerManualPlayRoutes(app: FastifyInstance, database: DatabaseSync): void {
  initializeManualTables(database);

  app.get<{ Querystring: { before?: unknown } }>("/api/play/manual/history", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const before = request.query.before;
    if (before !== undefined && (typeof before !== "string" || !before || before.length > 128)) {
      return reply.code(400).send({ error: "Choose a valid history page." });
    }
    let beforeRow: number | null = null;
    if (typeof before === "string") {
      const cursor = database.prepare(
        `SELECT t.rowid AS row_id FROM play_manual_tables t
         JOIN play_manual_members m ON m.table_id = t.id
         WHERE t.id = ? AND m.user_id = ? AND t.status = 'closed' AND t.state_json IS NOT NULL`,
      ).get(before, userId);
      if (!cursor || typeof cursor.row_id !== "number") return reply.code(404).send({ error: "Game history not found." });
      beforeRow = cursor.row_id;
    }
    const rows = database.prepare(
      `SELECT t.id, t.created_at, t.state_json, m.deck_snapshot
       FROM play_manual_tables t
       JOIN play_manual_members m ON m.table_id = t.id
       WHERE m.user_id = ? AND t.status = 'closed' AND t.state_json IS NOT NULL
         AND (? IS NULL OR t.rowid < ?)
       ORDER BY t.rowid DESC LIMIT 51`,
    ).all(userId, beforeRow, beforeRow);
    const page = rows.slice(0, 50);
    return {
      nextBefore: rows.length > 50 ? String(rows[49]!.id) : null,
      games: page.map((row) => {
        const state = parseState(row.state_json);
        const snapshot = JSON.parse(String(row.deck_snapshot)) as DeckSnapshot;
        const remaining = state.players.filter((player) => !isOut(player)).length;
        return {
          id: String(row.id),
          startedAt: String(row.created_at),
          turn: state.turn,
          completed: remaining === 1,
          deckName: access(database, "deck", snapshot.deckId, userId) ? snapshot.name : null,
          players: state.players.map((player) => ({
            seat: player.seat,
            name: player.name,
            result: player.conceded ? "conceded" : player.lost ? "reported loss" : remaining === 1 ? "remaining" : "unfinished",
          })),
        };
      }),
    };
  });

  app.get<{ Params: { tableId: string } }>("/api/play/manual/history/:tableId/deck", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const row = database.prepare(
      `SELECT m.deck_snapshot FROM play_manual_tables t
       JOIN play_manual_members m ON m.table_id = t.id
       WHERE t.id = ? AND m.user_id = ? AND t.status = 'closed' AND t.state_json IS NOT NULL`,
    ).get(request.params.tableId, userId);
    if (!row) return reply.code(404).send({ error: "Game history not found." });
    const snapshot = JSON.parse(String(row.deck_snapshot)) as DeckSnapshot;
    if (!access(database, "deck", snapshot.deckId, userId)) {
      return reply.code(403).send({ error: "The original deck is no longer available to you." });
    }
    return { snapshot };
  });

  app.get("/api/play/manual/tables", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const tables = database.prepare(
      `SELECT t.*,
         CASE WHEN EXISTS (
           SELECT 1 FROM play_manual_members m WHERE m.table_id = t.id AND m.user_id = ?
         ) THEN 0 ELSE 1 END AS is_spectator
       FROM play_manual_tables t
       WHERE t.status != 'closed' AND (
         EXISTS (SELECT 1 FROM play_manual_members m WHERE m.table_id = t.id AND m.user_id = ?)
         OR EXISTS (SELECT 1 FROM play_manual_spectators s WHERE s.table_id = t.id AND s.user_id = ?)
       )
       ORDER BY t.created_at DESC`,
    ).all(userId, userId, userId);
    return {
      tables: tables.map((table) => projectTable(database, table, userId, Number(table.is_spectator) === 1)),
    };
  });

  app.post<{ Body: { deckId?: unknown; playerLimit?: unknown } }>("/api/play/manual/tables", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const limit = request.body?.playerLimit;
    if (limit !== 2 && limit !== 4) return reply.code(400).send({ error: "Choose a two-player or four-player table." });
    let snapshot: DeckSnapshot;
    try {
      snapshot = checkedSnapshot(database, request.body?.deckId, userId);
    } catch (error) {
      return responseError(reply, error);
    }
    const user = database.prepare("SELECT name FROM users WHERE id = ?").get(userId);
    if (!user || typeof user.name !== "string") return reply.code(401).send({ error: "Sign in to use manual tables." });
    const id = randomUUID();
    const inviteCode = randomBytes(10).toString("hex").toUpperCase();
    database.prepare(
      "INSERT INTO play_manual_tables (id, invite_code, owner_id, player_limit, status) VALUES (?, ?, ?, ?, 'waiting')",
    ).run(id, inviteCode, userId, limit);
    database.prepare(
      "INSERT INTO play_manual_members (table_id, user_id, seat, player_name, deck_name, deck_snapshot) VALUES (?, ?, 0, ?, ?, ?)",
    ).run(id, userId, user.name, snapshot.name, JSON.stringify(snapshot));
    const table = tableForUser(database, id, userId)!;
    return reply.code(201).send({ table: projectTable(database, table, userId), inviteCode });
  });

  app.post<{ Body: { inviteCode?: unknown; deckId?: unknown } }>("/api/play/manual/tables/join", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const code = typeof request.body?.inviteCode === "string" ? request.body.inviteCode.trim().toUpperCase() : "";
    if (!code || code.length > 32) return reply.code(400).send({ error: "Enter a valid invitation code." });
    const table = database.prepare("SELECT * FROM play_manual_tables WHERE invite_code = ?").get(code);
    if (!table || table.status !== "waiting" || typeof table.id !== "string") {
      return reply.code(404).send({ error: "Waiting table not found." });
    }
    if (tableForUser(database, table.id, userId)) {
      return { table: projectTable(database, table, userId) };
    }
    const occupied = new Set(database.prepare("SELECT seat FROM play_manual_members WHERE table_id = ?").all(table.id)
      .map((member) => Number(member.seat)));
    let seat = 0;
    while (occupied.has(seat) && seat < Number(table.player_limit)) seat += 1;
    if (seat >= Number(table.player_limit)) return reply.code(409).send({ error: "That table is full." });
    let snapshot: DeckSnapshot;
    try {
      snapshot = checkedSnapshot(database, request.body?.deckId, userId);
    } catch (error) {
      return responseError(reply, error);
    }
    const user = database.prepare("SELECT name FROM users WHERE id = ?").get(userId);
    if (!user || typeof user.name !== "string") return reply.code(401).send({ error: "Sign in to use manual tables." });
    database.prepare(
      "INSERT INTO play_manual_members (table_id, user_id, seat, player_name, deck_name, deck_snapshot) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(table.id, userId, seat, user.name, snapshot.name, JSON.stringify(snapshot));
    database.prepare("DELETE FROM play_manual_spectators WHERE table_id = ? AND user_id = ?").run(table.id, userId);
    database.prepare("UPDATE play_manual_tables SET revision = revision + 1 WHERE id = ? AND status = 'waiting'").run(table.id);
    const updated = tableForUser(database, table.id, userId)!;
    return { table: projectTable(database, updated, userId) };
  });

  app.post<{ Body: { inviteCode?: unknown } }>("/api/play/manual/tables/watch", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const code = typeof request.body?.inviteCode === "string" ? request.body.inviteCode.trim().toUpperCase() : "";
    if (!code || code.length > 32) return reply.code(400).send({ error: "Enter a valid invitation code." });
    const table = database.prepare("SELECT * FROM play_manual_tables WHERE invite_code = ?").get(code);
    if (!table || table.status === "closed" || typeof table.id !== "string") {
      return reply.code(404).send({ error: "Open table not found." });
    }
    const playerTable = tableForUser(database, table.id, userId);
    if (playerTable) return { table: projectTable(database, playerTable, userId) };
    database.prepare("INSERT OR IGNORE INTO play_manual_spectators (table_id, user_id) VALUES (?, ?)").run(table.id, userId);
    const watched = tableForSpectator(database, table.id, userId);
    if (!watched) return reply.code(409).send({ error: "This table is no longer available to watch." });
    return { table: projectTable(database, watched, userId, true) };
  });

  app.get<{ Params: { tableId: string } }>("/api/play/manual/tables/:tableId", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const view = tableForViewer(database, request.params.tableId, userId);
    if (!view) return reply.code(404).send({ error: "Table not found." });
    return { table: projectTable(database, view.table, userId, view.spectator) };
  });

  app.get<{ Params: { tableId: string } }>("/api/play/manual/tables/:tableId/library", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const table = tableForUser(database, request.params.tableId, userId);
    if (!table) return reply.code(404).send({ error: "Table not found." });
    if (table.status !== "active") return reply.code(409).send({ error: "This game is not active." });
    const player = parseState(table.state_json).players.find((item) => item.userId === userId);
    if (!player) return reply.code(404).send({ error: "Table seat not found." });
    if (isOut(player)) return reply.code(403).send({ error: "You are no longer in this game." });
    return {
      revision: Number(table.revision),
      cards: [...player.library].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    };
  });

  app.post<{ Params: { tableId: string } }>("/api/play/manual/tables/:tableId/start", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const table = tableForUser(database, request.params.tableId, userId);
    if (!table) return reply.code(404).send({ error: "Table not found." });
    if (Number(table.owner_id) !== userId) return reply.code(403).send({ error: "Only the table host can start the game." });
    if (table.status !== "waiting") return reply.code(409).send({ error: "This table is not waiting to start." });
    const members = database.prepare(
      "SELECT user_id, seat, player_name, deck_snapshot FROM play_manual_members WHERE table_id = ? ORDER BY seat",
    ).all(request.params.tableId);
    if (members.length !== Number(table.player_limit)) return reply.code(409).send({ error: "Wait until every seat has joined." });
    const players: PlayerState[] = members.map((member) => {
      const snapshot = JSON.parse(String(member.deck_snapshot)) as DeckSnapshot;
      const library = createCards(snapshot, "main");
      const command = createCards(snapshot, "commander");
      shuffle(library);
      return {
        userId: Number(member.user_id), name: String(member.player_name), seat: Number(member.seat),
        library, hand: library.splice(0, 7), battlefield: [], graveyard: [], exile: [], command,
        life: 40, poison: 0, commanderDamage: {}, conceded: false, opening: { mulligans: 0, bottom: 0 },
      };
    });
    const state: GameState = { turn: 1, activeSeat: 0, players };
    database.prepare(
      "UPDATE play_manual_tables SET status = 'active', state_json = ?, revision = revision + 1 WHERE id = ? AND status = 'waiting'",
    ).run(JSON.stringify(state), request.params.tableId);
    const updated = tableForUser(database, request.params.tableId, userId)!;
    return { table: projectTable(database, updated, userId) };
  });

  app.post<{ Params: { tableId: string }; Body: { revision?: unknown; action?: unknown } }>(
    "/api/play/manual/tables/:tableId/actions",
    async (request, reply) => {
      const userId = signedIn(request, reply);
      if (userId === null) return reply;
      const table = tableForUser(database, request.params.tableId, userId);
      if (!table) return reply.code(404).send({ error: "Table not found." });
      if (table.status !== "active") return reply.code(409).send({ error: "This game is not active." });
      if (!Number.isSafeInteger(request.body?.revision) || Number(request.body.revision) !== Number(table.revision)) {
        return reply.code(409).send({ error: "The table has changed. Refresh and try again.", revision: Number(table.revision) });
      }
      const state = parseState(table.state_json);
      const error = applyAction(state, userId, request.body?.action);
      if (error) {
        return reply.code(400).send({ error });
      }
      const status = state.players.filter((player) => !isOut(player)).length <= 1 ? "closed" : "active";
      const update = database.prepare(
        "UPDATE play_manual_tables SET state_json = ?, revision = revision + 1, status = ? WHERE id = ? AND revision = ? AND status = 'active'",
      ).run(JSON.stringify(state), status, request.params.tableId, Number(table.revision));
      if (Number(update.changes) !== 1) return reply.code(409).send({ error: "The table has changed. Refresh and try again." });
      const updated = tableForUser(database, request.params.tableId, userId)!;
      return { table: projectTable(database, updated, userId) };
    },
  );

  app.post<{ Params: { tableId: string } }>("/api/play/manual/tables/:tableId/leave", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const spectatorTable = tableForSpectator(database, request.params.tableId, userId);
    if (spectatorTable) {
      database.prepare("DELETE FROM play_manual_spectators WHERE table_id = ? AND user_id = ?").run(request.params.tableId, userId);
      return { left: true };
    }
    const table = tableForUser(database, request.params.tableId, userId);
    if (!table) return reply.code(404).send({ error: "Table not found." });
    if (table.status === "closed") return reply.code(409).send({ error: "This table is already closed." });
    if (table.status === "waiting") {
      if (Number(table.owner_id) === userId) {
        database.prepare("UPDATE play_manual_tables SET status = 'closed', revision = revision + 1 WHERE id = ?").run(request.params.tableId);
      } else {
        database.prepare("DELETE FROM play_manual_members WHERE table_id = ? AND user_id = ?").run(request.params.tableId, userId);
        database.prepare("UPDATE play_manual_tables SET revision = revision + 1 WHERE id = ? AND status = 'waiting'").run(request.params.tableId);
      }
      return { left: true };
    }
    const state = parseState(table.state_json);
    const player = state.players.find((item) => item.userId === userId);
    if (!player) return reply.code(404).send({ error: "Table seat not found." });
    if (isOut(player)) return { left: true };
    removeFromGame(state, player, "concede");
    const status = state.players.filter((item) => !isOut(item)).length <= 1 ? "closed" : "active";
    database.prepare(
      "UPDATE play_manual_tables SET state_json = ?, revision = revision + 1, status = ? WHERE id = ? AND revision = ? AND status = 'active'",
    ).run(JSON.stringify(state), status, request.params.tableId, Number(table.revision));
    return { left: true };
  });

  app.delete<{ Params: { tableId: string } }>("/api/play/manual/tables/:tableId", async (request, reply) => {
    const userId = signedIn(request, reply);
    if (userId === null) return reply;
    const table = tableForUser(database, request.params.tableId, userId);
    if (!table) return reply.code(404).send({ error: "Table not found." });
    if (Number(table.owner_id) !== userId) return reply.code(403).send({ error: "Only the table host can close it." });
    database.prepare("UPDATE play_manual_tables SET status = 'closed', revision = revision + 1 WHERE id = ?").run(request.params.tableId);
    return { closed: true };
  });
}
