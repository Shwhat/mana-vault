import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { buildApp } from "../app.js";
import { cardExtrasStatement, cardInsertStatement } from "../database.js";

const cleanup: Array<() => Promise<void>> = [];
const servers: WebSocketServer[] = [];

afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function engine(takeOverOnFirstDeckQuery = false, eventDelayMs = 0) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const identities = new Map<string, WebSocket>();
  const calls: Array<{ identity: string; method: string; params: unknown[] }> = [];
  let connectionCount = 0;
  server.on("connection", (socket, request) => {
    connectionCount += 1;
    const identity = String(request.headers["x-mana-vault-user"] ?? "");
    identities.set(identity, socket);
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { id: number; method: string; params: unknown[] };
      calls.push({ identity, method: message.method, params: message.params });
      if (takeOverOnFirstDeckQuery && connectionCount === 1 && message.method === "getDeckTypes") {
        socket.close(4001, "signed in elsewhere");
        return;
      }
      const results: Record<string, unknown> = {
        connectUser: true,
        sessionGetRestoreToken: "test-restore-token-00000001",
        serverGetMainRoomId: "test-room",
        getGameTypes: [{ name: "Two Player Duel" }],
        getPlayerTypes: ["HUMAN", "COMPUTER_MAD"],
        getDeckTypes: ["Constructed"],
        disconnectSession: true,
        deckValidate: { valid: true, errors: [] },
        roomCreateTable: { tableId: "table-test" },
        roomJoinTable: true,
        matchStart: true,
        gameJoin: true,
        roomLeaveTableOrTournament: true,
        matchQuit: true,
        sendPlayerBoolean: true,
        sendPlayerAction: true,
      };
      const result = message.method === "lookupCards"
        ? (message.params[0] as Array<{ cardNumber: string; setCode: string }>).map(({ cardNumber, setCode }) => ({
          cardNumber, expansionSetCode: setCode,
        }))
        : results[message.method] ?? [];
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
      if (message.method === "matchStart") {
        const emitStart = () => socket.send(JSON.stringify({
          method: "START_GAME", objectId: "game-test", messageId: 1, data: { gameId: "game-test" },
        }));
        if (eventDelayMs) setTimeout(emitStart, eventDelayMs);
        else emitStart();
      }
      if (message.method === "gameJoin") {
        const emitGameEvents = () => {
          socket.send(JSON.stringify({ method: "GAME_INIT", objectId: "game-test", messageId: 2, data: { turn: 1 } }));
          socket.send(JSON.stringify({ method: "GAME_ASK", objectId: "game-test", messageId: 3, data: { question: "Keep?" } }));
          socket.send(JSON.stringify({ method: "GAME_UPDATE", objectId: "game-test", messageId: 4, data: { turn: 1 } }));
          socket.send(JSON.stringify({ method: "CHATMESSAGE", objectId: "game-test", messageId: 5, data: { text: "not forwarded" } }));
          socket.send(JSON.stringify({ method: "UNRECOGNIZED_EVENT", objectId: "game-test", messageId: 6, data: { secret: true } }));
        };
        if (eventDelayMs) setTimeout(emitGameEvents, eventDelayMs);
        else emitGameEvents();
      }
    });
  });
  const address = server.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${address.port}`, identities, calls, get connectionCount() { return connectionCount; } };
}

async function signedInApp(url?: string, timeoutMs = 1000) {
  const root = await mkdtemp(join(tmpdir(), "mana-vault-play-"));
  await writeFile(join(root, "index.html"), "<!doctype html><title>App</title>", "utf8");
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, root, undefined, undefined, {
    passwordIterations: 1000,
    pictureDownloads: false,
    mtgjsonSchedule: false,
    ...(url ? { playmat: { url, timeoutMs } } : {}),
  });
  cleanup.push(async () => {
    await app.close();
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  const guard = { "x-mana-vault": "1", "content-type": "application/json" };
  const signup = await app.inject({
    method: "POST",
    url: "/api/signup",
    headers: guard,
    payload: { name: "player-one", password: "correct horse" },
  });
  const cookie = String(signup.headers["set-cookie"]).split(";")[0] ?? "";
  return { app, database, guard, cookie };
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)
      && "name" in entry && typeof entry.name === "string") return [entry.name];
    return [];
  });
}

describe("authenticated Playmat sessions", () => {
  it("keeps the play routes disabled when no engine endpoint is configured", async () => {
    const { app, cookie } = await signedInApp();
    const response = await app.inject({ method: "GET", url: "/api/play/status", headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain("not configured");
  });

  it("uses an opaque engine identity, returns discovery data and closes the engine session on logout", async () => {
    const engineServer = await engine();
    const { app, guard, cookie } = await signedInApp(engineServer.url);

    expect((await app.inject({ method: "GET", url: "/api/play/status" })).statusCode).toBe(401);
    const connected = await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie }, payload: {} });
    expect(connected.statusCode).toBe(200);
    expect(connected.json()).toEqual({ connected: true });

    const options = await app.inject({ method: "GET", url: "/api/play/options", headers: { cookie } });
    expect(options.statusCode).toBe(200);
    expect(options.json()).toEqual({
      roomId: "test-room",
      gameTypes: [{ name: "Two Player Duel" }],
      playerTypes: ["HUMAN", "COMPUTER_MAD"],
      deckTypes: ["Constructed"],
    });

    const identity = [...engineServer.identities.keys()][0]!;
    expect(identity).toMatch(/^mv[0-9a-z]{12}$/);
    expect(identity).not.toContain("player-one");
    expect(connected.body).not.toContain(identity);
    expect(engineServer.calls[0]).toMatchObject({
      identity,
      method: "connectUser",
      params: [identity, "", expect.any(String), null],
    });

    const loggedOut = await app.inject({ method: "POST", url: "/api/logout", headers: { ...guard, cookie }, payload: {} });
    expect(loggedOut.statusCode).toBe(200);
    expect(engineServer.calls.some(({ method }) => method === "disconnectSession")).toBe(true);
  });

  it("keeps the shared engine session while another valid Mana Vault session remains", async () => {
    const engineServer = await engine();
    const { app, guard, cookie: firstCookie } = await signedInApp(engineServer.url);
    const secondLogin = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: guard,
      payload: { name: "player-one", password: "correct horse" },
    });
    const secondCookie = String(secondLogin.headers["set-cookie"]).split(";")[0] ?? "";
    await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie: firstCookie }, payload: {} });

    const loggedOut = await app.inject({ method: "POST", url: "/api/logout", headers: { ...guard, cookie: firstCookie }, payload: {} });
    expect(loggedOut.statusCode).toBe(200);
    expect(engineServer.calls.some(({ method }) => method === "disconnectSession")).toBe(false);
    expect((await app.inject({ method: "GET", url: "/api/play/options", headers: { cookie: secondCookie } })).statusCode).toBe(200);
  });

  it("does not automatically reconnect after an engine takeover", async () => {
    const engineServer = await engine(true);
    const { app, guard, cookie } = await signedInApp(engineServer.url);
    await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie }, payload: {} });

    expect((await app.inject({ method: "GET", url: "/api/play/options", headers: { cookie } })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/api/play/options", headers: { cookie } })).statusCode).toBe(503);
    expect(engineServer.connectionCount).toBe(1);

    expect((await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie }, payload: {} })).statusCode).toBe(200);
    expect(engineServer.connectionCount).toBe(2);
  });

  it("closes the affected engine session when an admin disables its account", async () => {
    const engineServer = await engine();
    const { app, database, guard, cookie: adminCookie } = await signedInApp(engineServer.url);
    const created = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "player-two", password: "correct horse" },
    });
    const playerCookie = String(created.headers["set-cookie"]).split(";")[0] ?? "";
    await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie: playerCookie }, payload: {} });

    const playerId = Number(database.prepare("SELECT id FROM users WHERE name = 'player-two'").get()?.id);
    expect(Number.isSafeInteger(playerId)).toBe(true);
    const disabled = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${playerId}`,
      headers: { ...guard, cookie: adminCookie },
      payload: { disabled: true },
    });

    expect(disabled.statusCode).toBe(200);
    const playerIdentity = [...engineServer.identities.keys()][0];
    expect(playerIdentity).toBeDefined();
    expect(engineServer.calls.some(({ identity, method }) => identity === playerIdentity && method === "disconnectSession")).toBe(true);
  });

  it("closes the affected engine session when an admin deletes its account", async () => {
    const engineServer = await engine();
    const { app, database, guard, cookie: adminCookie } = await signedInApp(engineServer.url);
    const created = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "player-two", password: "correct horse" },
    });
    const playerCookie = String(created.headers["set-cookie"]).split(";")[0] ?? "";
    await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie: playerCookie }, payload: {} });

    const playerId = Number(database.prepare("SELECT id FROM users WHERE name = 'player-two'").get()?.id);
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/admin/accounts/${playerId}`,
      headers: { ...guard, cookie: adminCookie },
      payload: {},
    });

    expect(deleted.statusCode, deleted.body).toBe(200);
    const playerIdentity = [...engineServer.identities.keys()][0];
    expect(playerIdentity).toBeDefined();
    expect(engineServer.calls.some(({ identity, method }) => identity === playerIdentity && method === "disconnectSession")).toBe(true);
  });

  it("closes the engine session when the last authorized device is removed", async () => {
    const engineServer = await engine();
    const { app, database, guard, cookie: adminCookie } = await signedInApp(engineServer.url);
    const created = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "player-two", password: "correct horse" },
    });
    const playerCookie = String(created.headers["set-cookie"]).split(";")[0] ?? "";
    const device = await app.inject({
      method: "POST",
      url: "/api/devices",
      headers: { ...guard, cookie: playerCookie },
      payload: { name: "player-two", password: "correct horse", device: "Test device" },
    });
    await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie: playerCookie }, payload: {} });

    const playerId = Number(database.prepare("SELECT id FROM users WHERE name = 'player-two'").get()?.id);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(playerId);
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/admin/devices/${device.json().device}`,
      headers: { ...guard, cookie: adminCookie },
      payload: {},
    });

    expect(removed.statusCode, removed.body).toBe(200);
    const playerIdentity = [...engineServer.identities.keys()][0];
    expect(playerIdentity).toBeDefined();
    expect(engineServer.calls.some(({ identity, method }) => identity === playerIdentity && method === "disconnectSession")).toBe(true);
  });

  it("starts a private AI game from an authorized immutable saved-deck snapshot", async () => {
    const engineServer = await engine(false, 10);
    const { app, database, guard, cookie } = await signedInApp(engineServer.url);
    cardInsertStatement(database).run(
      "print-test", "oracle-test", "Test Card", "{1}", 1, "Artifact", "", "", "",
      JSON.stringify({ standard: "legal" }), "tst", "Test Set", "1", "common", null, "2024-01-01", "Test Artist",
    );
    cardExtrasStatement(database).run("nonfoil", 0, 0, "print-test");
    const created = await app.inject({
      method: "POST",
      url: "/api/decks",
      headers: { ...guard, cookie },
      payload: { name: "Test deck", format: "standard" },
    });
    const deckId = String(created.json().id);
    await app.inject({
      method: "POST",
      url: `/api/decks/${deckId}/cards`,
      headers: { ...guard, cookie },
      payload: { cardId: "print-test", quantity: 1 },
    });
    const before = database.prepare("SELECT quantity, printing_id, zone FROM deck_cards WHERE deck_id = ?").all(deckId);

    const createdGame = await app.inject({
      method: "POST",
      url: "/api/play/games",
      headers: { ...guard, cookie },
      payload: { deckId, gameType: "Two Player Duel", deckType: "Constructed" },
    });

    expect(createdGame.statusCode).toBe(200);
    expect(createdGame.json()).toEqual({ tableId: "table-test", gameId: "game-test" });
    expect(engineServer.calls.some(({ method, params }) => method === "roomCreateTable"
      && (params[2] as { playerTypes?: string[] }).playerTypes?.join(",") === "HUMAN,COMPUTER_MAD")).toBe(true);
    expect(engineServer.calls.filter(({ method }) => method === "roomJoinTable")).toHaveLength(2);
    expect(database.prepare("SELECT quantity, printing_id, zone FROM deck_cards WHERE deck_id = ?").all(deckId)).toEqual(before);
    const events = await app.inject({ method: "GET", url: "/api/play/events", headers: { cookie } });
    expect(events.json().events.map(({ event }: { event: { method: string } }) => event.method)).toContain("GAME_INIT");
    const eventMethods = events.json().events.map(({ event }: { event: { method: string } }) => event.method);
    expect(eventMethods).toContain("GAME_ASK");
    expect(eventMethods).toContain("GAME_UPDATE");
    expect(eventMethods).not.toContain("CHATMESSAGE");
    expect(eventMethods).not.toContain("UNRECOGNIZED_EVENT");
    const nonPromptUpdate = await app.inject({
      method: "POST",
      url: "/api/play/games/game-test/actions",
      headers: { ...guard, cookie },
      payload: { expectedMessageId: 4, type: "sendPlayerBoolean", data: false },
    });
    expect(nonPromptUpdate.statusCode).toBe(409);
    const response = await app.inject({
      method: "POST",
      url: "/api/play/games/game-test/actions",
      headers: { ...guard, cookie },
      payload: { expectedMessageId: 3, type: "sendPlayerBoolean", data: false },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: true });
    const stale = await app.inject({
      method: "POST",
      url: "/api/play/games/game-test/actions",
      headers: { ...guard, cookie },
      payload: { expectedMessageId: 3, type: "sendPlayerBoolean", data: false },
    });
    expect(stale.statusCode).toBe(409);

    const otherSignup = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "another-user", password: "correct horse" },
    });
    const otherCookie = String(otherSignup.headers["set-cookie"]).split(";")[0] ?? "";
    const denied = await app.inject({
      method: "POST",
      url: "/api/play/games",
      headers: { ...guard, cookie: otherCookie },
      payload: { deckId, gameType: "Two Player Duel", deckType: "Constructed" },
    });
    expect(denied.statusCode).toBe(404);
    const privateGame = await app.inject({
      method: "POST",
      url: "/api/play/games/game-test/actions",
      headers: { ...guard, cookie: otherCookie },
      payload: { expectedMessageId: 3, type: "sendPlayerBoolean", data: false },
    });
    expect(privateGame.statusCode).toBe(404);
  });

  it.skipIf(!process.env.MANAVAULT_PLAYMAT_URL)(
    "completes a real AI game from an exact-printing saved deck without changing it",
    async () => {
      const { app, database, guard, cookie } = await signedInApp(process.env.MANAVAULT_PLAYMAT_URL, 15_000);
      cardInsertStatement(database).run(
        "m21-island-265", "oracle-basic-island", "Island", "", 0, "Basic Land - Island", "", "", "",
        JSON.stringify({ standard: "legal", modern: "legal", legacy: "legal", vintage: "legal", commander: "legal" }),
        "M21", "Core Set 2021", "265", "common", null, "2020-07-03", "Mana Vault integration test",
      );
      cardExtrasStatement(database).run("nonfoil", 0, 0, "m21-island-265");
      const deckResponse = await app.inject({
        method: "POST",
        url: "/api/decks",
        headers: { ...guard, cookie },
        payload: { name: "Live engine test", format: "modern" },
      });
      const deckId = String(deckResponse.json().id);
      await app.inject({
        method: "POST",
        url: `/api/decks/${deckId}/cards`,
        headers: { ...guard, cookie },
        payload: { cardId: "m21-island-265", quantity: 60 },
      });
      const before = database.prepare(
        "SELECT quantity, printing_id, zone FROM deck_cards WHERE deck_id = ? ORDER BY id",
      ).all(deckId);
      const options = await app.inject({ method: "GET", url: "/api/play/options", headers: { cookie } });
      expect(options.statusCode).toBe(200);
      const gameType = names(options.json().gameTypes).find((name) => name === "Two Player Duel");
      const deckType = names(options.json().deckTypes).find((name) => name === "Constructed - Modern");
      expect(gameType, JSON.stringify(options.json().gameTypes)).toBeDefined();
      expect(deckType, JSON.stringify(options.json().deckTypes)).toBeDefined();

      const createdGame = await app.inject({
        method: "POST",
        url: "/api/play/games",
        headers: { ...guard, cookie },
        payload: { deckId, gameType, deckType },
      });
      expect(createdGame.statusCode).toBe(200);
      const { gameId } = createdGame.json() as { gameId: string };
      let cursor = 0;
      let conceded = false;
      let gameOver = false;
      const deadline = Date.now() + 120_000;

      while (Date.now() < deadline && !gameOver) {
        const response = await app.inject({
          method: "GET",
          url: `/api/play/events?after=${cursor}`,
          headers: { cookie },
        });
        expect(response.statusCode).toBe(200);
        const events = response.json().events as Array<{
          id: number;
          event: { method: string; objectId: string | null; messageId: number; data: unknown };
        }>;
        for (const { id, event } of events) {
          cursor = Math.max(cursor, id);
          if (event.objectId !== gameId) continue;
          if (event.method === "GAME_OVER" || event.method === "END_GAME_INFO") {
            gameOver = true;
            break;
          }
          if (conceded || ![
            "GAME_TARGET", "GAME_CHOOSE_ABILITY", "GAME_CHOOSE_PILE", "GAME_CHOOSE_CHOICE", "GAME_ASK",
            "GAME_SELECT", "GAME_PLAY_MANA", "GAME_PLAY_XMANA", "GAME_GET_AMOUNT", "GAME_GET_MULTI_AMOUNT",
          ].includes(event.method)) continue;
          const promptData = event.data !== null && typeof event.data === "object" && !Array.isArray(event.data)
            ? event.data as { targets?: unknown }
            : {};
          const action = event.method === "GAME_ASK"
            ? { type: "sendPlayerBoolean", data: false }
            : event.method === "GAME_TARGET" && Array.isArray(promptData.targets) && typeof promptData.targets[0] === "string"
              ? { type: "sendPlayerUUID", data: promptData.targets[0] }
              : { type: "sendPlayerAction", data: "CONCEDE" };
          const submitted = await app.inject({
            method: "POST",
            url: `/api/play/games/${gameId}/actions`,
            headers: { ...guard, cookie },
            payload: { expectedMessageId: event.messageId, ...action },
          });
          if (submitted.statusCode === 200 && action.type === "sendPlayerAction") conceded = true;
          else if (submitted.statusCode !== 200) expect(submitted.statusCode).toBe(409);
        }
        if (!gameOver) await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(conceded).toBe(true);
      expect(gameOver).toBe(true);
      expect(database.prepare(
        "SELECT quantity, printing_id, zone FROM deck_cards WHERE deck_id = ? ORDER BY id",
      ).all(deckId)).toEqual(before);
    },
    150_000,
  );
});
