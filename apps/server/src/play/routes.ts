import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { DeckSnapshotError, snapshotDeck } from "./deck-snapshot.js";
import { convertDeckSnapshot, verifyEngineLookups, type EngineLookupCard } from "./deck-converter.js";
import type { PlaymatConnection } from "./playmat-connection.js";
import { PlaySessionManager } from "./play-sessions.js";

function fail(reply: FastifyReply, request: FastifyRequest, error: unknown) {
  request.log.error({ error }, "Playmat request failed");
  return reply.code(503).send({
    error: "The play engine is unavailable. Try again later.",
    ...(process.env.NODE_ENV === "test" && error instanceof Error ? { detail: error.message } : {}),
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function names(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result = value.map((entry) => {
    if (typeof entry === "string") return entry;
    const item = record(entry);
    return typeof item?.name === "string" ? item.name : null;
  });
  return result.every((entry): entry is string => entry !== null) ? result : null;
}

function lookupResults(value: unknown): readonly (EngineLookupCard | null)[] {
  if (!Array.isArray(value)) throw new Error("Playmat returned invalid card lookup data");
  return value.map((entry) => {
    if (entry === null) return null;
    const card = record(entry);
    if (!card) throw new Error("Playmat returned invalid card lookup data");
    return {
      ...(typeof card.cardNumber === "string" ? { cardNumber: card.cardNumber } : {}),
      ...(typeof card.expansionSetCode === "string" ? { expansionSetCode: card.expansionSetCode } : {}),
    };
  });
}

type PlayerResponse =
  | { type: "sendPlayerUUID"; data: string }
  | { type: "sendPlayerString"; data: string }
  | { type: "sendPlayerBoolean"; data: boolean }
  | { type: "sendPlayerInteger"; data: number }
  | { type: "sendPlayerAction"; data: "PASS_PRIORITY_UNTIL_NEXT_MAIN_PHASE" | "CONCEDE" };

function playerResponse(type: unknown, data: unknown): PlayerResponse | null {
  if (type === "sendPlayerUUID" && typeof data === "string" && /^[0-9a-f-]{36}$/i.test(data)) {
    return { type, data };
  }
  if (type === "sendPlayerString" && typeof data === "string" && data.length <= 1000) {
    return { type, data };
  }
  if (type === "sendPlayerBoolean" && typeof data === "boolean") return { type, data };
  if (type === "sendPlayerInteger" && typeof data === "number" && Number.isSafeInteger(data) && Math.abs(data) <= 10_000) {
    return { type, data };
  }
  if (type === "sendPlayerAction" && (data === "PASS_PRIORITY_UNTIL_NEXT_MAIN_PHASE" || data === "CONCEDE")) {
    return { type, data };
  }
  return null;
}

export function registerPlayRoutes(
  app: FastifyInstance,
  database: DatabaseSync,
  sessions: PlaySessionManager | null,
): void {
  const unavailable = (reply: FastifyReply) => reply.code(503).send({ error: "The play engine is not configured." });

  app.get("/api/play/status", async (_request, reply) => {
    if (!sessions) return unavailable(reply);
    return { enabled: true };
  });

  app.get<{ Querystring: { after?: string } }>("/api/play/events", async (request, reply) => {
    if (!sessions) return unavailable(reply);
    const userId = request.user?.id;
    if (!userId) return reply.code(401).send({ error: "Sign in to use the play engine." });
    const afterId = request.query.after === undefined ? 0 : Number(request.query.after);
    if (!Number.isSafeInteger(afterId) || afterId < 0) {
      return reply.code(400).send({ error: "The event cursor must be a non-negative integer." });
    }
    try {
      await sessions.connectionFor(userId);
      return { events: sessions.eventsFor(userId, afterId) };
    } catch (error) {
      return fail(reply, request, error);
    }
  });

  app.post("/api/play/session", async (request, reply) => {
    if (!sessions) return unavailable(reply);
    const userId = request.user?.id;
    if (!userId) return reply.code(401).send({ error: "Sign in to use the play engine." });
    try {
      await sessions.startSession(userId);
      return { connected: true };
    } catch (error) {
      return fail(reply, request, error);
    }
  });

  app.delete("/api/play/session", async (request, reply) => {
    if (!sessions) return unavailable(reply);
    const userId = request.user?.id;
    if (!userId) return reply.code(401).send({ error: "Sign in to use the play engine." });
    try {
      await sessions.disconnectUser(userId);
      return { connected: false };
    } catch (error) {
      return fail(reply, request, error);
    }
  });

  app.get("/api/play/options", async (request, reply) => {
    if (!sessions) return unavailable(reply);
    const userId = request.user?.id;
    if (!userId) return reply.code(401).send({ error: "Sign in to use the play engine." });
    try {
      const connection = await sessions.connectionFor(userId);
      const [roomId, gameTypes, playerTypes, deckTypes] = await Promise.all([
        connection.call("serverGetMainRoomId"),
        connection.call("getGameTypes"),
        connection.call("getPlayerTypes"),
        connection.call("getDeckTypes"),
      ]);
      if (typeof roomId !== "string" || !Array.isArray(gameTypes)
        || !Array.isArray(playerTypes) || !playerTypes.every((value) => typeof value === "string")
        || !Array.isArray(deckTypes) || !deckTypes.every((value) => typeof value === "string")) {
        throw new Error("Playmat returned invalid discovery data");
      }
      return { roomId, gameTypes, playerTypes, deckTypes };
    } catch (error) {
      return fail(reply, request, error);
    }
  });

  app.post<{
    Body: { deckId?: unknown; gameType?: unknown; deckType?: unknown };
  }>("/api/play/games", async (request, reply) => {
    if (!sessions) return unavailable(reply);
    const user = request.user;
    if (!user) return reply.code(401).send({ error: "Sign in to use the play engine." });
    const { deckId, gameType, deckType } = request.body ?? {};
    if (typeof deckId !== "string" || deckId.length > 128
      || typeof gameType !== "string" || !gameType.trim() || gameType.length > 100
      || typeof deckType !== "string" || !deckType.trim() || deckType.length > 100) {
      return reply.code(400).send({ error: "Choose a saved deck, game type and deck format." });
    }

    let snapshot;
    try {
      snapshot = snapshotDeck(database, deckId, user.id);
    } catch (error) {
      if (error instanceof DeckSnapshotError) return reply.code(404).send({ error: error.message });
      throw error;
    }
    const conversion = convertDeckSnapshot(snapshot, { engineDeckType: deckType, commanderAsSideboard: false });
    if (!conversion.deck) return reply.code(422).send({ error: "The saved deck cannot be represented by this engine format.", issues: conversion.issues });

    let tableId: string | null = null;
    let gameId: string | null = null;
    let roomId: string | null = null;
    let connection: PlaymatConnection | null = null;
    try {
      connection = await sessions.connectionFor(user.id);
      const [roomIdValue, gameTypeValues, playerTypeValues, deckTypeValues] = await Promise.all([
        connection.call("serverGetMainRoomId"),
        connection.call("getGameTypes"),
        connection.call("getPlayerTypes"),
        connection.call("getDeckTypes"),
      ]);
      const availableGameTypes = names(gameTypeValues);
      const availablePlayerTypes = names(playerTypeValues);
      const availableDeckTypes = names(deckTypeValues);
      if (typeof roomIdValue !== "string" || !availableGameTypes || !availablePlayerTypes || !availableDeckTypes) {
        throw new Error("Playmat returned invalid game discovery data");
      }
      roomId = roomIdValue;
      if (!availableGameTypes.includes(gameType) || !availableDeckTypes.includes(deckType)
        || !availablePlayerTypes.includes("HUMAN") || !availablePlayerTypes.includes("COMPUTER_MAD")) {
        return reply.code(422).send({ error: "The selected game or deck format is not supported by the engine." });
      }

      const lookups: Array<EngineLookupCard | null> = [];
      for (let offset = 0; offset < conversion.lookups.length; offset += 500) {
        const batch = conversion.lookups.slice(offset, offset + 500);
        const result = await connection.call("lookupCards", batch.map(({ card }) => card));
        lookups.push(...lookupResults(result));
      }
      const lookupIssues = verifyEngineLookups(conversion, lookups);
      if (lookupIssues.length) {
        return reply.code(422).send({ error: "The saved deck contains cards the engine cannot match exactly.", issues: lookupIssues });
      }

      const validation = record(await connection.call("deckValidate", deckType, conversion.deck));
      if (validation?.valid !== true) {
        const errors = Array.isArray(validation?.errors) ? validation.errors : [];
        return reply.code(422).send({ error: "The engine rejected this deck for the selected format.", issues: errors });
      }

      const table = record(await connection.call("roomCreateTable", connection.sessionId, roomIdValue, {
        name: `Mana Vault: ${snapshot.name}`.slice(0, 100),
        gameType,
        deckType,
        winsNeeded: 1,
        rated: false,
        spectatorsAllowed: false,
        playerTypes: ["HUMAN", "COMPUTER_MAD"],
      }));
      if (typeof table?.tableId !== "string" || !table.tableId) throw new Error("Playmat returned an invalid table");
      tableId = table.tableId;
      const humanJoined = await connection.call(
        "roomJoinTable", connection.sessionId, roomIdValue, tableId, user.name, "HUMAN", 5, conversion.deck,
      );
      if (humanJoined !== true) throw new Error("Playmat could not seat the player");
      const aiJoined = await connection.call(
        "roomJoinTable", connection.sessionId, roomIdValue, tableId, "Mana Vault AI", "COMPUTER_MAD", 5, conversion.deck,
      );
      if (aiJoined !== true) throw new Error("Playmat could not seat the AI opponent");

      const startCursor = sessions.latestEventId(user.id);
      const matchStarted = await connection.call("matchStart", connection.sessionId, roomIdValue, tableId);
      if (matchStarted !== true) throw new Error("Playmat could not start the match");
      const startEvent = await sessions.waitForEvent(
        user.id,
        startCursor,
        (event) => event.method === "START_GAME" && event.objectId !== null,
      ).catch((error: unknown) => {
        throw new Error("Timed out waiting for the started game notification", { cause: error });
      });
      const game = record(startEvent.event.data);
      if (typeof game?.gameId !== "string" || !game.gameId) throw new Error("Playmat did not identify the started game");
      gameId = game.gameId;
      if (startEvent.event.objectId !== gameId) throw new Error("Playmat returned inconsistent game identity");
      sessions.registerGame(user.id, gameId);
      const joined = await connection.call("gameJoin", gameId, connection.sessionId);
      if (joined !== true) throw new Error("Playmat could not join the started game");
      await sessions.waitForEvent(
        user.id,
        startCursor,
        (event) => event.objectId === gameId && (event.method === "GAME_INIT" || event.method === "GAME_UPDATE"),
      ).catch((error: unknown) => {
        throw new Error("Timed out waiting for the initial game state", { cause: error });
      });
      return { tableId, gameId };
    } catch (error) {
      if (gameId && connection) {
        try {
          await connection.call("matchQuit", gameId, connection.sessionId);
          sessions.unregisterGame(user.id, gameId);
        } catch (cleanupError) {
          request.log.error({ error: cleanupError, tableId, gameId }, "Could not stop incomplete Playmat game");
        }
      } else if (tableId && roomId && connection) {
        try {
          await connection.call("roomLeaveTableOrTournament", connection.sessionId, roomId, tableId);
        } catch (cleanupError) {
          request.log.error({ error: cleanupError, tableId }, "Could not remove incomplete Playmat table");
        }
      }
      return fail(reply, request, error);
    }
  });

  app.post<{
    Params: { gameId: string };
    Body: { expectedMessageId?: unknown; type?: unknown; data?: unknown };
  }>("/api/play/games/:gameId/actions", async (request, reply) => {
    if (!sessions) return unavailable(reply);
    const userId = request.user?.id;
    if (!userId) return reply.code(401).send({ error: "Sign in to use the play engine." });
    const gameId = request.params.gameId;
    if (!sessions.ownsGame(userId, gameId)) return reply.code(404).send({ error: "Game not found." });
    const { expectedMessageId, type, data } = request.body ?? {};
    if (typeof expectedMessageId !== "number" || !Number.isSafeInteger(expectedMessageId) || expectedMessageId < 0) {
      return reply.code(400).send({ error: "Provide the current game message id." });
    }
    const response = playerResponse(type, data);
    if (!response) return reply.code(400).send({ error: "Choose a valid supported game response." });
    if (!sessions.claimGameMessage(userId, gameId, expectedMessageId)) {
      return reply.code(409).send({ error: "The game state changed. Refresh the game before responding." });
    }

    try {
      const connection = await sessions.connectionFor(userId);
      let result: unknown;
      switch (response.type) {
        case "sendPlayerUUID":
          result = await connection.call(response.type, gameId, connection.sessionId, response.data);
          break;
        case "sendPlayerString":
          result = await connection.call(response.type, gameId, connection.sessionId, response.data);
          break;
        case "sendPlayerBoolean":
          result = await connection.call(response.type, gameId, connection.sessionId, response.data);
          break;
        case "sendPlayerInteger":
          result = await connection.call(response.type, gameId, connection.sessionId, response.data);
          break;
        case "sendPlayerAction":
          result = await connection.call(response.type, response.data, gameId, connection.sessionId);
          break;
      }
      if (result !== true) {
        sessions.finishGameMessage(userId, gameId, expectedMessageId, false);
        return reply.code(409).send({ error: "The engine did not accept that response." });
      }
      sessions.finishGameMessage(userId, gameId, expectedMessageId, true);
      if (response.type === "sendPlayerAction" && response.data === "CONCEDE") sessions.unregisterGame(userId, gameId);
      return { accepted: true };
    } catch (error) {
      sessions.finishGameMessage(userId, gameId, expectedMessageId, false);
      return fail(reply, request, error);
    }
  });
}
