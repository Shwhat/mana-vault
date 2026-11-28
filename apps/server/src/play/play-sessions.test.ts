import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { ServerEvent } from "@mana-vault/playmat-protocol";
import { buildApp } from "../app.js";
import { cardExtrasStatement, cardInsertStatement } from "../database.js";
import { PlaymatConnection } from "./playmat-connection.js";
import { PlaySessionManager } from "./play-sessions.js";

const cleanup: Array<() => Promise<void>> = [];
const servers: WebSocketServer[] = [];

afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function engine(takeOverOnFirstDeckQuery = false, eventDelayMs = 0, rejectLogin: () => boolean = () => false,
  joinGame?: (gameId: string) => Promise<boolean>) {
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
    socket.on("message", async (raw) => {
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
        gameJoin: message.method === "gameJoin" && joinGame ? await joinGame(String(message.params[0])) : true,
        roomLeaveTableOrTournament: true,
        matchQuit: true,
        sendPlayerBoolean: true,
        sendPlayerString: true,
        sendPlayerAction: true,
      };
      const result = message.method === "connectUser" && rejectLogin()
        ? false
        : message.method === "lookupCards"
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function liveEvents() {
  const events: ServerEvent[] = [];
  const listeners = new Set<(event: ServerEvent) => void>();
  return {
    all() {
      return events;
    },
    add(event: ServerEvent) {
      events.push(event);
      for (const listener of [...listeners]) listener(event);
    },
    waitFor(predicate: (event: ServerEvent) => boolean, timeoutMs = 15_000, label = "event"): Promise<ServerEvent> {
      const queued = events.find(predicate);
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          listeners.delete(listener);
        };
        const listener = (event: ServerEvent) => {
          if (!predicate(event)) return;
          cleanup();
          resolve(event);
        };
        const timer = setTimeout(() => {
          cleanup();
          const observed = events.map(({ method, data }) => {
            const payload = objectValue(data);
            const view = objectValue(payload?.gameView) ?? payload;
            const hand = objectValue(view?.myHand);
            const players = Array.isArray(view?.players)
              ? view.players.map((player) => {
                const item = objectValue(player);
                return `${String(item?.name ?? "?")}:${String(item?.handCount ?? "?")}:${String(item?.controlled ?? "?")}`;
              }).join("/")
              : "n/a";
            return `${method}(viewer=${String(view?.myPlayerId ?? "?")},hand=${hand ? Object.keys(hand).length : "n/a"},players=${players})`;
          }).join(", ");
          reject(new Error(`Timed out waiting for live Playmat ${label}; observed: ${observed || "none"}`));
        }, timeoutMs);
        listeners.add(listener);
      });
    },
  };
}

function privateHandView(event: ServerEvent): { hand: Record<string, unknown>; view: Record<string, unknown> } | null {
  if (!["GAME_INIT", "GAME_UPDATE", "GAME_UPDATE_AND_INFORM"].includes(event.method)) return null;
  const payload = objectValue(event.data);
  const view = objectValue(payload?.gameView) ?? payload;
  const hand = objectValue(view?.myHand);
  return view && hand && Object.keys(hand).length ? { hand, view } : null;
}

describe("authenticated Playmat sessions", () => {
  it("keeps multiplayer manual-game zones private and applies revision-checked shared actions", async () => {
    const { app, database, guard, cookie: firstCookie } = await signedInApp();
    const secondSignup = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "player-two", password: "correct horse" },
    });
    expect(secondSignup.statusCode).toBe(200);
    const secondCookie = String(secondSignup.headers["set-cookie"]).split(";")[0] ?? "";
    const thirdSignup = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "player-three", password: "correct horse" },
    });
    expect(thirdSignup.statusCode).toBe(200);
    const thirdCookie = String(thirdSignup.headers["set-cookie"]).split(";")[0] ?? "";
    const fourthSignup = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "player-four", password: "correct horse" },
    });
    expect(fourthSignup.statusCode).toBe(200);
    const fourthCookie = String(fourthSignup.headers["set-cookie"]).split(";")[0] ?? "";

    const manualCards: Array<[string, string, string]> = [
      ["red-commander", "red-commander-oracle", "Red Commander"],
      ["red-hidden", "red-hidden-oracle", "Red Hidden Card"],
      ["blue-commander", "blue-commander-oracle", "Blue Commander"],
      ["blue-hidden", "blue-hidden-oracle", "Blue Hidden Card"],
      ["green-commander", "green-commander-oracle", "Green Commander"],
      ["green-hidden", "green-hidden-oracle", "Green Hidden Card"],
      ["yellow-commander", "yellow-commander-oracle", "Yellow Commander"],
      ["yellow-hidden", "yellow-hidden-oracle", "Yellow Hidden Card"],
    ];
    for (const [id, oracle, name] of manualCards) {
      cardInsertStatement(database).run(
        id, oracle, name, "", 0, "Legendary Creature - Test", "", "", "",
        JSON.stringify({ commander: "legal" }), "tst", "Test Set", id, "rare", null, "2024-01-01", "Mana Vault test",
      );
      cardExtrasStatement(database).run("nonfoil", 0, 0, id);
    }

    const createDeck = async (cookie: string, name: string, commanderId: string, cardId: string, quantity = 8) => {
      const created = await app.inject({
        method: "POST",
        url: "/api/decks",
        headers: { ...guard, cookie },
        payload: { name, format: "commander" },
      });
      expect(created.statusCode).toBe(201);
      const deckId = String(created.json().id);
      const commander = await app.inject({
        method: "POST",
        url: `/api/decks/${deckId}/cards`,
        headers: { ...guard, cookie },
        payload: { cardId: commanderId, quantity: 1, zone: "commander" },
      });
      const main = await app.inject({
        method: "POST",
        url: `/api/decks/${deckId}/cards`,
        headers: { ...guard, cookie },
        payload: { cardId, quantity, zone: "main" },
      });
      expect(commander.statusCode).toBe(201);
      expect(main.statusCode).toBe(201);
      return deckId;
    };
    const redDeck = await createDeck(firstCookie, "Red test deck", "red-commander", "red-hidden", 9);
    const blueDeck = await createDeck(secondCookie, "Blue test deck", "blue-commander", "blue-hidden");
    const greenDeck = await createDeck(thirdCookie, "Green test deck", "green-commander", "green-hidden");
    const yellowDeck = await createDeck(fourthCookie, "Yellow test deck", "yellow-commander", "yellow-hidden");
    const openingTable = await app.inject({
      method: "POST", url: "/api/play/manual/tables", headers: { ...guard, cookie: firstCookie },
      payload: { deckId: redDeck, playerLimit: 2 },
    });
    const openingId = openingTable.json().table.id;
    const openingCode = openingTable.json().inviteCode;
    expect((await app.inject({
      method: "POST", url: "/api/play/manual/tables/join", headers: { ...guard, cookie: secondCookie },
      payload: { inviteCode: openingCode, deckId: blueDeck },
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST", url: "/api/play/manual/tables/watch", headers: { ...guard, cookie: thirdCookie },
      payload: { inviteCode: openingCode },
    })).statusCode).toBe(200);
    const openingStarted = await app.inject({
      method: "POST", url: `/api/play/manual/tables/${openingId}/start`, headers: { ...guard, cookie: firstCookie }, payload: {},
    });
    const openingActions = `/api/play/manual/tables/${openingId}/actions`;
    const firstMulligan = await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
      payload: { revision: openingStarted.json().table.revision, action: { type: "mulligan" } },
    });
    expect(firstMulligan.statusCode).toBe(200);
    expect(firstMulligan.json().table.players[0]).toMatchObject({ opening: { mulligans: 1, bottom: 0 }, handCount: 7 });
    const secondMulligan = await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
      payload: { revision: firstMulligan.json().table.revision, action: { type: "mulligan" } },
    });
    expect(secondMulligan.statusCode).toBe(200);
    const openingView = secondMulligan.json().table;
    expect(openingView.players[0]).toMatchObject({ opening: { mulligans: 2, bottom: 1 }, handCount: 7 });
    const chosenId = openingView.players[0].hand[0].id;
    for (const cookie of [secondCookie, thirdCookie]) {
      const view = (await app.inject({ method: "GET", url: `/api/play/manual/tables/${openingId}`, headers: { cookie } })).json().table;
      expect(view.players[0]).not.toHaveProperty("opening");
      expect(JSON.stringify(view)).not.toContain("Red Hidden Card");
    }
    for (const action of [{ type: "draw" }, { type: "keep" }, { type: "turn" }, { type: "bottom", cardId: "not-in-hand" }]) {
      const rejected = await app.inject({
        method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
        payload: { revision: openingView.revision, action },
      });
      expect(rejected.statusCode).toBe(400);
    }
    expect((await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: thirdCookie },
      payload: { revision: openingView.revision, action: { type: "bottom", cardId: chosenId } },
    })).statusCode).toBe(404);
    const bottomed = await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
      payload: { revision: openingView.revision, action: { type: "bottom", cardId: chosenId } },
    });
    expect(bottomed.statusCode).toBe(200);
    expect(bottomed.json().table.players[0].hand).toHaveLength(6);
    expect(bottomed.json().table.players[0]).not.toHaveProperty("opening");
    const storedOpening = JSON.parse(String(database.prepare("SELECT state_json FROM play_manual_tables WHERE id = ?").get(openingId)?.state_json));
    expect(storedOpening.players[0].library.at(-1).id).toBe(chosenId);
    expect((await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
      payload: { revision: openingView.revision, action: { type: "mulligan" } },
    })).statusCode).toBe(409);
    expect((await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
      payload: { revision: bottomed.json().table.revision, action: { type: "mulligan" } },
    })).statusCode).toBe(400);
    const guestFirst = await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: secondCookie },
      payload: { revision: bottomed.json().table.revision, action: { type: "mulligan" } },
    });
    const guestSecond = await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: secondCookie },
      payload: { revision: guestFirst.json().table.revision, action: { type: "mulligan" } },
    });
    expect(guestSecond.statusCode).toBe(200);
    const guestOpening = guestSecond.json().table;
    expect((await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
      payload: { revision: guestOpening.revision, action: { type: "turn" } },
    })).statusCode).toBe(400);
    const guestBottomed = await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: secondCookie },
      payload: { revision: guestOpening.revision, action: { type: "bottom", cardId: guestOpening.players[1].hand[0].id } },
    });
    expect(guestBottomed.statusCode).toBe(200);
    expect((await app.inject({
      method: "POST", url: openingActions, headers: { ...guard, cookie: firstCookie },
      payload: { revision: guestBottomed.json().table.revision, action: { type: "turn" } },
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "DELETE", url: `/api/play/manual/tables/${openingId}`, headers: { ...guard, cookie: firstCookie }, payload: {},
    })).statusCode).toBe(200);
    const history = await app.inject({ method: "GET", url: "/api/play/manual/history", headers: { cookie: firstCookie } });
    expect(history.statusCode).toBe(200);
    expect(history.headers["cache-control"]).toBe("no-store");
    expect(history.json().games).toHaveLength(1);
    expect(history.json().games[0]).toMatchObject({ id: openingId, completed: false, deckName: "Red test deck" });
    expect(history.json().games[0].startedAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(history.json().games[0].endedAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    database.prepare("UPDATE play_manual_tables SET ended_at = ? WHERE id = ?").run("2020-01-01 00:00:00", openingId);
    expect((await app.inject({
      method: "DELETE", url: `/api/play/manual/tables/${openingId}`, headers: { ...guard, cookie: firstCookie }, payload: {},
    })).statusCode).toBe(200);
    expect(database.prepare("SELECT ended_at FROM play_manual_tables WHERE id = ?").get(openingId)?.ended_at).toBe("2020-01-01 00:00:00");
    expect(JSON.stringify(history.json())).not.toContain("Hidden Card");
    expect((await app.inject({ method: "GET", url: "/api/play/manual/history", headers: { cookie: thirdCookie } })).json().games).toEqual([]);
    const snapshotUrl = `/api/play/manual/history/${openingId}/deck`;
    const savedSnapshot = await app.inject({ method: "GET", url: snapshotUrl, headers: { cookie: firstCookie } });
    expect(savedSnapshot.statusCode).toBe(200);
    expect(savedSnapshot.json().snapshot.name).toBe("Red test deck");
    expect(JSON.stringify(savedSnapshot.json())).not.toContain("Blue Hidden Card");
    const guestSnapshot = await app.inject({ method: "GET", url: snapshotUrl, headers: { cookie: secondCookie } });
    expect(guestSnapshot.json().snapshot.name).toBe("Blue test deck");
    expect(JSON.stringify(guestSnapshot.json())).not.toContain("Red Hidden Card");
    expect((await app.inject({ method: "GET", url: snapshotUrl, headers: { cookie: thirdCookie } })).statusCode).toBe(404);
    database.prepare("UPDATE decks SET name = ? WHERE id = ?").run("Renamed after game", redDeck);
    expect((await app.inject({ method: "GET", url: snapshotUrl, headers: { cookie: firstCookie } })).json().snapshot.name).toBe("Red test deck");
    const redOwner = database.prepare("SELECT owner_id FROM decks WHERE id = ?").get(redDeck)?.owner_id;
    const blueOwner = database.prepare("SELECT owner_id FROM decks WHERE id = ?").get(blueDeck)?.owner_id;
    expect(typeof redOwner).toBe("number");
    expect(typeof blueOwner).toBe("number");
    database.prepare("UPDATE decks SET owner_id = ? WHERE id = ?").run(Number(blueOwner), redDeck);
    expect((await app.inject({ method: "GET", url: snapshotUrl, headers: { cookie: firstCookie } })).statusCode).toBe(403);
    expect((await app.inject({
      method: "GET", url: `/api/play/manual/decks/${redDeck}/results`, headers: { cookie: firstCookie },
    })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/play/manual/history", headers: { cookie: firstCookie } })).json().games[0].deckName).toBeNull();
    database.prepare("UPDATE decks SET owner_id = ?, name = ? WHERE id = ?").run(Number(redOwner), "Red test deck", redDeck);
    const createdTable = await app.inject({
      method: "POST",
      url: "/api/play/manual/tables",
      headers: { ...guard, cookie: firstCookie },
      payload: { deckId: redDeck, playerLimit: 2 },
    });
    expect(createdTable.statusCode).toBe(201);
    const { table: waitingTable, inviteCode } = createdTable.json();
    const joined = await app.inject({
      method: "POST",
      url: "/api/play/manual/tables/join",
      headers: { ...guard, cookie: secondCookie },
      payload: { inviteCode, deckId: blueDeck },
    });
    expect(joined.statusCode).toBe(200);
    const unauthorized = await app.inject({
      method: "GET",
      url: `/api/play/manual/tables/${waitingTable.id}`,
      headers: { cookie: thirdCookie },
    });
    expect(unauthorized.statusCode).toBe(404);
    const started = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${waitingTable.id}/start`,
      headers: { ...guard, cookie: firstCookie },
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    const firstView = started.json().table;
    const firstHand = firstView.players[0].hand;
    expect(firstHand).toHaveLength(7);
    expect(firstHand.every((card: { name: string }) => card.name === "Red Hidden Card")).toBe(true);
    expect(JSON.stringify(firstView)).not.toContain("Blue Hidden Card");
    expect(firstView.players[1]).not.toHaveProperty("hand");

    const secondViewResponse = await app.inject({
      method: "GET",
      url: `/api/play/manual/tables/${waitingTable.id}`,
      headers: { cookie: secondCookie },
    });
    const secondView = secondViewResponse.json().table;
    expect(secondView.players[1].hand).toHaveLength(7);
    expect(secondView.players[1].hand.every((card: { name: string }) => card.name === "Blue Hidden Card")).toBe(true);
    expect(JSON.stringify(secondView)).not.toContain("Red Hidden Card");
    expect(secondView.players[0]).not.toHaveProperty("hand");

    const watched = await app.inject({
      method: "POST",
      url: "/api/play/manual/tables/watch",
      headers: { ...guard, cookie: thirdCookie },
      payload: { inviteCode },
    });
    expect(watched.statusCode).toBe(200);
    expect(watched.json().table.role).toBe("spectator");
    expect(watched.json().table.players[0]).not.toHaveProperty("hand");
    expect(watched.json().table.players[1]).not.toHaveProperty("hand");
    expect(JSON.stringify(watched.json().table)).not.toContain("Red Hidden Card");
    expect(JSON.stringify(watched.json().table)).not.toContain("Blue Hidden Card");
    const libraryUrl = `/api/play/manual/tables/${waitingTable.id}/library`;
    const redLibrary = await app.inject({ method: "GET", url: libraryUrl, headers: { cookie: firstCookie } });
    const blueLibrary = await app.inject({ method: "GET", url: libraryUrl, headers: { cookie: secondCookie } });
    expect(redLibrary.statusCode).toBe(200);
    expect(redLibrary.headers["cache-control"]).toBe("no-store");
    expect(redLibrary.json().cards).toHaveLength(2);
    const redIds = redLibrary.json().cards.map((card: { id: string }) => card.id);
    expect(redIds).toEqual([...redIds].sort());
    expect(JSON.stringify(redLibrary.json())).not.toContain("Blue Hidden Card");
    expect(blueLibrary.json().cards).toHaveLength(1);
    expect(JSON.stringify(blueLibrary.json())).not.toContain("Red Hidden Card");
    expect((await app.inject({ method: "GET", url: libraryUrl, headers: { cookie: thirdCookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: libraryUrl, headers: { cookie: fourthCookie } })).statusCode).toBe(404);
    const actionsUrl = `/api/play/manual/tables/${waitingTable.id}/actions`;
    const faceDown = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: firstView.revision, action: { type: "playFaceDown", cardId: firstHand[0].id } },
    });
    expect(faceDown.statusCode).toBe(200);
    expect(faceDown.json().table.players[0].battlefield[0].name).toBe("Red Hidden Card");
    for (const cookie of [secondCookie, thirdCookie]) {
      const view = (await app.inject({ method: "GET", url: `/api/play/manual/tables/${waitingTable.id}`, headers: { cookie } })).json().table;
      expect(view.players[0].battlefield[0]).toMatchObject({ name: "Face down", imageUrl: null, faceDown: true });
      expect(JSON.stringify(view)).not.toContain("Red Hidden Card");
    }
    const unauthorizedCopy = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: faceDown.json().table.revision, action: { type: "copy", cardId: firstHand[0].id } },
    });
    expect(unauthorizedCopy.statusCode).toBe(400);
    const copied = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: faceDown.json().table.revision, action: { type: "copy", cardId: firstHand[0].id } },
    });
    expect(copied.statusCode).toBe(200);
    expect(copied.json().table.players[0].battlefield[1]).toMatchObject({
      name: "Red Hidden Card", token: true, faceDown: true, tapped: false, counters: {},
    });
    expect(copied.json().table.players[0].battlefield[1].id).not.toBe(firstHand[0].id);
    for (const cookie of [secondCookie, thirdCookie]) {
      const view = (await app.inject({ method: "GET", url: `/api/play/manual/tables/${waitingTable.id}`, headers: { cookie } })).json().table;
      expect(view.players[0].battlefield[1]).toMatchObject({ name: "Face down", imageUrl: null, faceDown: true });
      expect(JSON.stringify(view)).not.toContain("Red Hidden Card");
    }
    const unauthorizedReveal = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: copied.json().table.revision, action: { type: "faceDown", cardId: firstHand[0].id } },
    });
    expect(unauthorizedReveal.statusCode).toBe(400);
    const revealed = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: copied.json().table.revision, action: { type: "faceDown", cardId: firstHand[0].id } },
    });
    expect(revealed.statusCode).toBe(200);
    const publicView = (await app.inject({
      method: "GET", url: `/api/play/manual/tables/${waitingTable.id}`, headers: { cookie: secondCookie },
    })).json().table;
    expect(publicView.players[0].battlefield[0].name).toBe("Red Hidden Card");
    const turnedDown = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: revealed.json().table.revision, action: { type: "faceDown", cardId: firstHand[0].id } },
    });
    expect(turnedDown.statusCode).toBe(200);
    const returned = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: turnedDown.json().table.revision, action: { type: "move", cardId: firstHand[0].id, from: "battlefield", to: "hand" } },
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json().table.players[0].hand.find((card: { id: string }) => card.id === firstHand[0].id).faceDown).toBe(false);
    const redPlayed = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: returned.json().table.revision, action: { type: "playFaceDown", cardId: firstHand[0].id } },
    });
    expect(redPlayed.statusCode).toBe(200);
    const blueId = secondView.players[1].hand[0].id;
    const bluePlayed = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: redPlayed.json().table.revision, action: { type: "play", cardId: blueId } },
    });
    expect(bluePlayed.statusCode).toBe(200);
    const attach = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: bluePlayed.json().table.revision, action: { type: "attach", cardId: blueId, targetId: firstHand[0].id } },
    });
    expect(attach.statusCode).toBe(200);
    expect(attach.json().table.players[1].battlefield[0].attachedTo).toBe(firstHand[0].id);
    const spectatorView = (await app.inject({
      method: "GET", url: `/api/play/manual/tables/${waitingTable.id}`, headers: { cookie: thirdCookie },
    })).json().table;
    expect(spectatorView.players[0].battlefield[0].name).toBe("Face down");
    expect(spectatorView.players[1].battlefield[0].attachedTo).toBe(firstHand[0].id);
    expect(JSON.stringify(spectatorView)).not.toContain("Red Hidden Card");
    const cycle = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: attach.json().table.revision, action: { type: "attach", cardId: firstHand[0].id, targetId: blueId } },
    });
    expect(cycle.statusCode).toBe(400);
    const unauthorizedAttach = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: attach.json().table.revision, action: { type: "attach", cardId: firstHand[0].id, targetId: null } },
    });
    expect(unauthorizedAttach.statusCode).toBe(400);
    const targetMoved = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision: attach.json().table.revision, action: { type: "move", cardId: firstHand[0].id, from: "battlefield", to: "hand" } },
    });
    expect(targetMoved.statusCode).toBe(200);
    expect(targetMoved.json().table.players[1].battlefield[0].attachedTo).toBeUndefined();
    const countedBlue = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: targetMoved.json().table.revision, action: { type: "counter", cardId: blueId, counter: "+1/+1", delta: 1 } },
    });
    expect(countedBlue.statusCode).toBe(200);
    const exiledBlue = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: countedBlue.json().table.revision, action: { type: "move", cardId: blueId, from: "battlefield", to: "exile" } },
    });
    expect(exiledBlue.statusCode).toBe(200);
    expect(exiledBlue.json().table.players[1].exile[0].counters).toEqual({});
    const topBlue = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: exiledBlue.json().table.revision, action: { type: "move", cardId: blueId, from: "exile", to: "library", position: "top" } },
    });
    expect(topBlue.statusCode).toBe(200);
    const drewBlue = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: topBlue.json().table.revision, action: { type: "draw" } },
    });
    expect(drewBlue.statusCode).toBe(200);
    expect(drewBlue.json().table.players[1].hand.at(-1).id).toBe(blueId);
    let revision = drewBlue.json().table.revision;
    for (const [index, kind] of (["d6", "d20", "coin"] as const).entries()) {
      const rolled = await app.inject({
        method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
        payload: { revision, action: { type: "random", kind } },
      });
      expect(rolled.statusCode).toBe(200);
      revision = rolled.json().table.revision;
      const result = rolled.json().table.lastRandom;
      expect(result).toMatchObject({ number: index + 1, seat: 0, kind });
      if (kind === "coin") expect(["heads", "tails"]).toContain(result.value);
      else {
        expect(Number.isInteger(result.value)).toBe(true);
        expect(result.value).toBeGreaterThanOrEqual(1);
        expect(result.value).toBeLessThanOrEqual(kind === "d6" ? 6 : 20);
      }
      for (const cookie of [secondCookie, thirdCookie]) {
        const view = (await app.inject({ method: "GET", url: `/api/play/manual/tables/${waitingTable.id}`, headers: { cookie } })).json().table;
        expect(view.lastRandom).toEqual(result);
        expect(JSON.stringify(view)).not.toContain("Red Hidden Card");
      }
    }
    const repeatedCoin = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision, action: { type: "random", kind: "coin" } },
    });
    expect(repeatedCoin.statusCode).toBe(200);
    expect(repeatedCoin.json().table.lastRandom).toMatchObject({ number: 4, seat: 0, kind: "coin" });
    revision = repeatedCoin.json().table.revision;
    const invalidRoll = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: firstCookie },
      payload: { revision, action: { type: "random", kind: "d100" } },
    });
    expect(invalidRoll.statusCode).toBe(400);
    const staleRoll = await app.inject({
      method: "POST", url: actionsUrl, headers: { ...guard, cookie: secondCookie },
      payload: { revision: revision - 1, action: { type: "random", kind: "coin" } },
    });
    expect(staleRoll.statusCode).toBe(409);
    const spectatorAction = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${waitingTable.id}/actions`,
      headers: { ...guard, cookie: thirdCookie },
      payload: { revision, action: { type: "random", kind: "coin" } },
    });
    expect(spectatorAction.statusCode).toBe(404);
    expect((await app.inject({
      method: "GET",
      url: "/api/play/manual/tables",
      headers: { cookie: thirdCookie },
    })).json().tables).toHaveLength(1);
    const leftAsSpectator = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${waitingTable.id}/leave`,
      headers: { ...guard, cookie: thirdCookie },
      payload: {},
    });
    expect(leftAsSpectator.statusCode).toBe(200);
    expect((await app.inject({
      method: "GET",
      url: `/api/play/manual/tables/${waitingTable.id}`,
      headers: { cookie: thirdCookie },
    })).statusCode).toBe(404);

    const currentView = (await app.inject({
      method: "GET",
      url: `/api/play/manual/tables/${waitingTable.id}`,
      headers: { cookie: firstCookie },
    })).json().table;
    const stolenCard = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${waitingTable.id}/actions`,
      headers: { ...guard, cookie: firstCookie },
      payload: { revision: currentView.revision, action: { type: "play", cardId: secondView.players[1].hand[0].id } },
    });
    expect(stolenCard.statusCode).toBe(400);
    const searched = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${waitingTable.id}/actions`,
      headers: { ...guard, cookie: firstCookie },
      payload: { revision: currentView.revision, action: { type: "move", cardId: redLibrary.json().cards[0].id, from: "library", to: "hand" } },
    });
    expect(searched.statusCode).toBe(200);
    expect(searched.json().table.players[0].hand).toHaveLength(8);
    expect(searched.json().table.players[0].libraryCount).toBe(1);
    const drew = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${waitingTable.id}/actions`,
      headers: { ...guard, cookie: firstCookie },
      payload: { revision: searched.json().table.revision, action: { type: "draw" } },
    });
    expect(drew.statusCode).toBe(200);
    expect(drew.json().table.revision).toBe(currentView.revision + 2);
    const stale = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${waitingTable.id}/actions`,
      headers: { ...guard, cookie: secondCookie },
      payload: { revision: currentView.revision, action: { type: "draw" } },
    });
    expect(stale.statusCode).toBe(409);

    const fourPlayerTable = await app.inject({
      method: "POST",
      url: "/api/play/manual/tables",
      headers: { ...guard, cookie: firstCookie },
      payload: { deckId: redDeck, playerLimit: 4 },
    });
    const fourPlayerCode = fourPlayerTable.json().inviteCode;
    for (const [cookie, deckId] of [
      [secondCookie, blueDeck],
      [thirdCookie, greenDeck],
      [fourthCookie, yellowDeck],
    ]) {
      const joinedSeat = await app.inject({
        method: "POST",
        url: "/api/play/manual/tables/join",
        headers: { ...guard, cookie },
        payload: { inviteCode: fourPlayerCode, deckId },
      });
      expect(joinedSeat.statusCode).toBe(200);
    }
    const fourPlayerStart = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${fourPlayerTable.json().table.id}/start`,
      headers: { ...guard, cookie: firstCookie },
      payload: {},
    });
    expect(fourPlayerStart.statusCode).toBe(200);
    expect(fourPlayerStart.json().table.players).toHaveLength(4);
    expect(JSON.stringify(fourPlayerStart.json().table)).not.toContain("Blue Hidden Card");
    expect(JSON.stringify(fourPlayerStart.json().table)).not.toContain("Green Hidden Card");
    expect(JSON.stringify(fourPlayerStart.json().table)).not.toContain("Yellow Hidden Card");
    const firstFourPlayerView = fourPlayerStart.json().table;
    const endTurn = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${fourPlayerTable.json().table.id}/actions`,
      headers: { ...guard, cookie: firstCookie },
      payload: { revision: firstFourPlayerView.revision, action: { type: "turn" } },
    });
    expect(endTurn.json().table.activeSeat).toBe(1);
    const leaveFourPlayerGame = await app.inject({
      method: "POST",
      url: `/api/play/manual/tables/${fourPlayerTable.json().table.id}/leave`,
      headers: { ...guard, cookie: secondCookie },
      payload: {},
    });
    expect(leaveFourPlayerGame.statusCode).toBe(200);
    const afterLeave = await app.inject({
      method: "GET",
      url: `/api/play/manual/tables/${fourPlayerTable.json().table.id}`,
      headers: { cookie: firstCookie },
    });
    expect(afterLeave.json().table.status).toBe("active");
    expect(afterLeave.json().table.players[1].conceded).toBe(true);
    const fourActions = `/api/play/manual/tables/${fourPlayerTable.json().table.id}/actions`;
    const lost = await app.inject({
      method: "POST", url: fourActions, headers: { ...guard, cookie: thirdCookie },
      payload: { revision: afterLeave.json().table.revision, action: { type: "loss" } },
    });
    expect(lost.statusCode).toBe(200);
    expect(lost.json().table.status).toBe("active");
    expect(lost.json().table.players[2]).toMatchObject({ lost: true, conceded: false });
    expect(lost.json().table.activeSeat).toBe(3);
    const lostAction = await app.inject({
      method: "POST", url: fourActions, headers: { ...guard, cookie: thirdCookie },
      payload: { revision: lost.json().table.revision, action: { type: "draw" } },
    });
    expect(lostAction.statusCode).toBe(400);
    expect((await app.inject({
      method: "GET", url: `/api/play/manual/tables/${fourPlayerTable.json().table.id}/library`, headers: { cookie: thirdCookie },
    })).statusCode).toBe(403);
    const lostLeave = await app.inject({
      method: "POST", url: `/api/play/manual/tables/${fourPlayerTable.json().table.id}/leave`,
      headers: { ...guard, cookie: thirdCookie }, payload: {},
    });
    expect(lostLeave.statusCode).toBe(200);
    const finalLoss = await app.inject({
      method: "POST", url: fourActions, headers: { ...guard, cookie: fourthCookie },
      payload: { revision: lost.json().table.revision, action: { type: "loss" } },
    });
    expect(finalLoss.statusCode).toBe(200);
    expect(finalLoss.json().table.status).toBe("closed");
    expect(finalLoss.json().table.players.map((player: { conceded: boolean; lost: boolean }) => [player.conceded, player.lost]))
      .toEqual([[false, false], [true, false], [false, true], [false, true]]);
    const completedHistory = (await app.inject({ method: "GET", url: "/api/play/manual/history", headers: { cookie: thirdCookie } })).json().games;
    expect(completedHistory).toHaveLength(1);
    expect(completedHistory[0]).toMatchObject({ completed: true, deckName: "Green test deck" });
    expect(completedHistory[0].players.map((player: { result: string }) => player.result))
      .toEqual(["remaining", "conceded", "reported loss", "reported loss"]);
  });

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

  it("keeps pushed game events inside the authenticated user's queue", async () => {
    const engineServer = await engine();
    const { app, guard, cookie: firstCookie } = await signedInApp(engineServer.url);
    const secondSignup = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: guard,
      payload: { name: "player-two", password: "correct horse" },
    });
    const secondCookie = String(secondSignup.headers["set-cookie"]).split(";")[0] ?? "";
    for (const cookie of [firstCookie, secondCookie]) {
      const connected = await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie }, payload: {} });
      expect(connected.statusCode).toBe(200);
    }

    const identities = [...engineServer.identities.keys()];
    expect(identities).toHaveLength(2);
    identities.forEach((identity, index) => {
      const socket = engineServer.identities.get(identity);
      if (!socket) throw new Error("Missing synthetic Playmat connection");
      socket.send(JSON.stringify({
        method: "GAME_UPDATE",
        objectId: `private-game-${index}`,
        messageId: 1,
        data: { privateValue: identity },
      }));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const firstEvents = await app.inject({ method: "GET", url: "/api/play/events", headers: { cookie: firstCookie } });
    const secondEvents = await app.inject({ method: "GET", url: "/api/play/events", headers: { cookie: secondCookie } });
    expect(firstEvents.statusCode).toBe(200);
    expect(secondEvents.statusCode).toBe(200);
    expect(JSON.stringify(firstEvents.json())).toContain(identities[0]);
    expect(JSON.stringify(firstEvents.json())).not.toContain(identities[1]);
    expect(JSON.stringify(secondEvents.json())).toContain(identities[1]);
    expect(JSON.stringify(secondEvents.json())).not.toContain(identities[0]);
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

  it("retries a transient reconnect failure with the retained restore token", async () => {
    let rejectLogin = false;
    const engineServer = await engine(false, 0, () => rejectLogin);
    const { app, guard, cookie } = await signedInApp(engineServer.url);
    await app.inject({ method: "POST", url: "/api/play/session", headers: { ...guard, cookie }, payload: {} });

    const firstIdentity = [...engineServer.identities.keys()][0];
    if (!firstIdentity) throw new Error("Missing first Playmat identity");
    const firstSocket = engineServer.identities.get(firstIdentity);
    if (!firstSocket) throw new Error("Missing first Playmat connection");
    firstSocket.terminate();
    await new Promise((resolve) => setTimeout(resolve, 10));

    rejectLogin = true;
    const outage = await app.inject({ method: "GET", url: "/api/play/options", headers: { cookie } });
    expect(outage.statusCode).toBe(503);

    rejectLogin = false;
    const restored = await app.inject({ method: "GET", url: "/api/play/options", headers: { cookie } });
    expect(restored.statusCode).toBe(200);
    const logins = engineServer.calls.filter(({ method }) => method === "connectUser");
    expect(logins).toHaveLength(3);
    expect(logins[1]?.params[3]).toBe("test-restore-token-00000001");
    expect(logins[2]?.params[3]).toBe("test-restore-token-00000001");
  });

  it("retries failed game rejoining without repeating successful joins", async () => {
    let rejectSecond = true;
    const engineServer = await engine(false, 0, () => false, async (gameId) => gameId !== "game-two" || !rejectSecond);
    const { database } = await signedInApp(engineServer.url);
    const userId = Number(database.prepare("SELECT id FROM users WHERE name = 'player-one'").get()?.id);
    const sessions = new PlaySessionManager(database, { url: engineServer.url, timeoutMs: 1000 });
    cleanup.unshift(() => sessions.disconnectAll((_id, error) => { throw error; }));
    const original = await sessions.connectionFor(userId);
    sessions.registerGame(userId, "game-one");
    sessions.registerGame(userId, "game-two");
    engineServer.identities.values().next().value?.terminate();
    await vi.waitFor(() => expect(original.isClosed).toBe(true));

    await expect(sessions.connectionFor(userId)).rejects.toThrow("could not restore the active game");
    expect(engineServer.calls.filter(({ method }) => method === "gameJoin").map(({ params }) => params[0]))
      .toEqual(["game-one", "game-two"]);
    rejectSecond = false;
    await sessions.connectionFor(userId);
    expect(engineServer.calls.filter(({ method }) => method === "gameJoin").map(({ params }) => params[0]))
      .toEqual(["game-one", "game-two", "game-two"]);
    expect(engineServer.connectionCount).toBe(2);
  });

  it("waits for game rejoining before returning a restored connection to concurrent callers", async () => {
    let finishJoin: ((value: boolean) => void) | undefined;
    const engineServer = await engine(false, 0, () => false, () => new Promise<boolean>((resolve) => { finishJoin = resolve; }));
    const { database } = await signedInApp(engineServer.url);
    const userId = Number(database.prepare("SELECT id FROM users WHERE name = 'player-one'").get()?.id);
    const sessions = new PlaySessionManager(database, { url: engineServer.url, timeoutMs: 1000 });
    cleanup.unshift(() => sessions.disconnectAll((_id, error) => { throw error; }));
    const original = await sessions.connectionFor(userId);
    sessions.registerGame(userId, "game-one");
    engineServer.identities.values().next().value?.terminate();
    await vi.waitFor(() => expect(original.isClosed).toBe(true));

    let secondCompleted = false;
    const first = sessions.connectionFor(userId);
    await vi.waitFor(() => expect(finishJoin).toBeDefined());
    const second = sessions.connectionFor(userId).then((connection) => {
      secondCompleted = true;
      return connection;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(secondCompleted).toBe(false);
    finishJoin?.(true);
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toBe(firstResult);
    expect(engineServer.calls.filter(({ method }) => method === "gameJoin")).toHaveLength(1);
  });

  it("closes a restored connection when the user signs out during game rejoining", async () => {
    let finishJoin: ((value: boolean) => void) | undefined;
    const engineServer = await engine(false, 0, () => false, () => new Promise<boolean>((resolve) => { finishJoin = resolve; }));
    const { database } = await signedInApp(engineServer.url);
    const userId = Number(database.prepare("SELECT id FROM users WHERE name = 'player-one'").get()?.id);
    const sessions = new PlaySessionManager(database, { url: engineServer.url, timeoutMs: 1000 });
    cleanup.unshift(() => sessions.disconnectAll((_id, error) => { throw error; }));
    const original = await sessions.connectionFor(userId);
    sessions.registerGame(userId, "game-one");
    engineServer.identities.values().next().value?.terminate();
    await vi.waitFor(() => expect(original.isClosed).toBe(true));

    const reconnect = expect(sessions.connectionFor(userId)).rejects.toThrow("session ended while reconnecting");
    await vi.waitFor(() => expect(finishJoin).toBeDefined());
    const disconnect = sessions.disconnectUser(userId);
    finishJoin?.(true);
    await expect(disconnect).resolves.toBeUndefined();
    await reconnect;
    expect(sessions.ownsGame(userId, "game-one")).toBe(false);
    expect(engineServer.calls.filter(({ method }) => method === "disconnectSession")).toHaveLength(1);
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
    const engineSocket = [...engineServer.identities.values()][0];
    if (!engineSocket) throw new Error("Missing engine connection");
    engineSocket.send(JSON.stringify({
      method: "GAME_CHOOSE_CHOICE", objectId: "game-test", messageId: 7,
      data: { choice: { required: false, choices: ["A"] } },
    }));
    await expect.poll(async () => {
      const currentEvents = await app.inject({ method: "GET", url: "/api/play/events", headers: { cookie } });
      return currentEvents.json().events.some(({ event }: { event: { messageId: number } }) => event.messageId === 7);
    }).toBe(true);
    const invalidChoice = await app.inject({
      method: "POST",
      url: "/api/play/games/game-test/actions",
      headers: { ...guard, cookie },
      payload: { expectedMessageId: 7, type: "sendPlayerString" },
    });
    expect(invalidChoice.statusCode).toBe(400);
    const cancelChoice = await app.inject({
      method: "POST",
      url: "/api/play/games/game-test/actions",
      headers: { ...guard, cookie },
      payload: { expectedMessageId: 7, type: "sendPlayerString", data: "" },
    });
    expect(cancelChoice.statusCode).toBe(200);
    expect(engineServer.calls.some(({ method, params }) => method === "sendPlayerString"
      && params[0] === "game-test" && params[2] === "")).toBe(true);

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

  it.skipIf(!process.env.MANAVAULT_PLAYMAT_URL)(
    "keeps each human player's opening hand private in a real two-player game",
    async () => {
      const engineUrl = process.env.MANAVAULT_PLAYMAT_URL;
      if (!engineUrl) throw new Error("MANAVAULT_PLAYMAT_URL is required for the live privacy test");
      const events = [liveEvents(), liveEvents()];
      const engineNames = [0, 1].map(() => `mv${randomUUID().replace(/-/g, "").slice(0, 12)}`);
      const connections: PlaymatConnection[] = [];
      let gameId: string | null = null;
      try {
        for (let index = 0; index < engineNames.length; index += 1) {
          connections.push(await PlaymatConnection.connect({
            url: engineUrl,
            engineName: engineNames[index]!,
            onEvent: (event) => events[index]!.add(event),
            timeoutMs: 15_000,
          }));
        }

        const first = connections[0]!;
        const second = connections[1]!;
        const roomIdValue = await first.call("serverGetMainRoomId");
        if (typeof roomIdValue !== "string") throw new Error("Playmat returned an invalid room ID");

        const gameTypes = names(await first.call("getGameTypes"));
        const deckTypes = names(await first.call("getDeckTypes"));
        expect(gameTypes).toContain("Two Player Duel");
        expect(deckTypes).toContain("Constructed - Modern");

        const mountain = { amount: 60, cardName: "Mountain", cardNumber: "269", setCode: "M21" };
        const island = { amount: 60, cardName: "Island", cardNumber: "263", setCode: "M21" };
        const mountainDeck = { cards: [mountain], sideboard: [] };
        const islandDeck = { cards: [island], sideboard: [] };
        const lookup = await first.call("lookupCards", [mountain, island]);
        expect(lookup).toEqual(expect.arrayContaining([
          expect.objectContaining({ cardNumber: "269", expansionSetCode: "M21" }),
          expect.objectContaining({ cardNumber: "263", expansionSetCode: "M21" }),
        ]));
        expect(await first.call("deckValidate", "Constructed - Modern", mountainDeck)).toMatchObject({ valid: true });
        expect(await second.call("deckValidate", "Constructed - Modern", islandDeck)).toMatchObject({ valid: true });

        const table = objectValue(await first.call("roomCreateTable", first.sessionId, roomIdValue, {
          name: "Mana Vault privacy integration test",
          gameType: "Two Player Duel",
          deckType: "Constructed - Modern",
          winsNeeded: 1,
          rated: false,
          spectatorsAllowed: false,
          playerTypes: ["HUMAN", "HUMAN"],
        }));
        const tableId = typeof table?.tableId === "string" ? table.tableId : null;
        if (!tableId) throw new Error("Playmat returned an invalid table ID");
        expect(await first.call(
          "roomJoinTable", first.sessionId, roomIdValue, tableId, engineNames[0]!, "HUMAN", 5, mountainDeck,
        )).toBe(true);
        expect(await second.call(
          "roomJoinTable", second.sessionId, roomIdValue, tableId, engineNames[1]!, "HUMAN", 5, islandDeck,
        )).toBe(true);

        expect(await first.call("matchStart", first.sessionId, roomIdValue, tableId)).toBe(true);
        const started = await events[0]!.waitFor((event) => event.method === "START_GAME" && event.objectId !== null, 15_000, "game start");
        const startedGameId = started.objectId;
        if (!startedGameId) throw new Error("Playmat did not identify the started game");
        gameId = startedGameId;
        expect(await first.call("gameJoin", startedGameId, first.sessionId)).toBe(true);
        expect(await second.call("gameJoin", startedGameId, second.sessionId)).toBe(true);

        const views: Array<ReturnType<typeof privateHandView>> = [null, null];
        const eventIndexes = [0, 0];
        const answeredPrompts = new Set<string>();
        const deadline = Date.now() + 60_000;
        while (views.some((view) => view === null)) {
          for (let index = 0; index < events.length; index += 1) {
            const connection = connections[index]!;
            const received = events[index]!.all();
            while (eventIndexes[index]! < received.length) {
              const event = received[eventIndexes[index]!]!;
              eventIndexes[index] = eventIndexes[index]! + 1;
              if (event.objectId !== startedGameId) continue;
              const view = privateHandView(event);
              if (view) {
                views[index] = view;
                continue;
              }
              const promptKey = `${index}:${event.messageId}`;
              if (answeredPrompts.has(promptKey)) continue;
              const prompt = objectValue(event.data);
              if (event.method === "GAME_ASK") {
                const accepted = await connection.call("sendPlayerBoolean", startedGameId, connection.sessionId, true);
                if (accepted !== true) throw new Error("Playmat rejected the opening-hand confirmation");
                answeredPrompts.add(promptKey);
              } else if (event.method === "GAME_TARGET" && Array.isArray(prompt?.targets)
                && typeof prompt.targets[0] === "string") {
                const accepted = await connection.call("sendPlayerUUID", startedGameId, connection.sessionId, prompt.targets[0]);
                if (accepted !== true) throw new Error("Playmat rejected the initial target selection");
                answeredPrompts.add(promptKey);
              }
            }
          }
          if (views.every((view) => view !== null)) break;
          if (Date.now() >= deadline) {
            const summary = events.map((source) => source.all().map(({ method }) => method).join(", ") || "none").join(" | ");
            throw new Error(`Timed out waiting for each private opening hand; observed player events: ${summary}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const mountainView = views[0];
        const islandView = views[1];
        if (!mountainView || !islandView) throw new Error("Playmat did not provide both private player views");
        const mountainNames = Object.values(mountainView.hand)
          .map((card) => objectValue(card)?.name)
          .filter((name): name is string => typeof name === "string");
        const islandNames = Object.values(islandView.hand)
          .map((card) => objectValue(card)?.name)
          .filter((name): name is string => typeof name === "string");

        expect(mountainNames.length).toBeGreaterThan(0);
        expect(islandNames.length).toBeGreaterThan(0);
        expect(mountainNames).toHaveLength(7);
        expect(islandNames).toHaveLength(7);
        expect(mountainNames.every((name) => name === "Mountain")).toBe(true);
        expect(islandNames.every((name) => name === "Island")).toBe(true);
        expect(mountainView.view.myPlayerId).not.toBe(islandView.view.myPlayerId);
        const controlledPlayers = [mountainView, islandView].map((playerView) => {
          const players = Array.isArray(playerView.view.players) ? playerView.view.players : [];
          return players.map(objectValue).filter((player) => player?.controlled === true);
        });
        expect(controlledPlayers.map((players) => players.map((player) => player?.name))).toEqual([
          [engineNames[0]],
          [engineNames[1]],
        ]);
        expect(JSON.stringify(mountainView.view)).not.toContain("Island");
        expect(JSON.stringify(islandView.view)).not.toContain("Mountain");
      } finally {
        try {
          if (gameId && connections[0]) await connections[0].call("matchQuit", gameId, connections[0].sessionId);
        } finally {
          await Promise.all(connections.map((connection) => connection.disconnect()));
        }
      }
    },
    150_000,
  );

  it.skipIf(!process.env.MANAVAULT_PLAYMAT_UNTRUSTED_URL)(
    "rejects a trusted-header identity supplied by an untrusted engine peer",
    async () => {
      const engineUrl = process.env.MANAVAULT_PLAYMAT_UNTRUSTED_URL;
      if (!engineUrl) throw new Error("MANAVAULT_PLAYMAT_UNTRUSTED_URL is required for the untrusted-peer test");
      await expect(PlaymatConnection.connect({
        url: engineUrl,
        engineName: `mv${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        timeoutMs: 5000,
        onEvent: () => {},
      })).rejects.toThrow("Playmat refused the server-managed user session");
    },
    15_000,
  );
});
