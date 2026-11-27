import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { PlaymatConnection } from "./playmat-connection.js";

const servers: WebSocketServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function engine(handler: (socket: WebSocket, method: string, params: unknown[], id: number) => void) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  server.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const request = JSON.parse(raw.toString()) as { id: number; method: string; params: unknown[] };
      handler(socket, request.method, request.params, request.id);
    });
  });
  const address = server.address() as AddressInfo;
  return { url: `ws://127.0.0.1:${address.port}`, server };
}

function respond(socket: WebSocket, id: number, result: unknown): void {
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

function loginEngine() {
  return engine((socket, method, params, id) => {
    if (method === "connectUser") respond(socket, id, true);
    else if (method === "sessionGetRestoreToken") respond(socket, id, "synthetic-restore-token-0001");
    else if (method === "disconnectSession") respond(socket, id, true);
    else respond(socket, id, []);
  });
}

describe("Playmat server connection", () => {
  it("uses a connection-bound synthetic identity and handles RPC responses and game events", async () => {
    const observed: Array<{ method: string; params: unknown[] }> = [];
    let receiveEvent!: (event: unknown) => void;
    const eventReceived = new Promise<unknown>((resolve) => { receiveEvent = resolve; });
    const { url, server } = await engine((socket, method, params, id) => {
      observed.push({ method, params });
      if (method === "connectUser") respond(socket, id, true);
      else if (method === "sessionGetRestoreToken") respond(socket, id, "synthetic-restore-token-0001");
      else if (method === "getDeckTypes") respond(socket, id, ["Commander"]);
      else if (method === "disconnectSession") respond(socket, id, true);
    });
    let headerValue: string | string[] | undefined;
    server.on("connection", (_socket, request) => { headerValue = request.headers["x-mana-vault-user"]; });

    const connection = await PlaymatConnection.connect({
      url, engineName: "mvtest001", onEvent: receiveEvent,
    });
    expect(headerValue).toBe("mvtest001");
    expect(await connection.call("getDeckTypes")).toEqual(["Commander"]);
    for (const client of server.clients) {
      client.send(JSON.stringify({ method: "GAME_UPDATE", objectId: "game-1", messageId: 1, data: { turn: 1 } }));
    }
    await expect(eventReceived).resolves.toMatchObject({ kind: "event", method: "GAME_UPDATE" });
    expect(observed.slice(0, 2)).toEqual([
      { method: "connectUser", params: ["mvtest001", "", expect.any(String), null] },
      { method: "sessionGetRestoreToken", params: [expect.any(String)] },
    ]);
    await connection.disconnect();
  });

  it("restores only after an ordinary disconnect and uses the rotated token", async () => {
    const logins: unknown[][] = [];
    let count = 0;
    const { url } = await engine((socket, method, params, id) => {
      if (method === "connectUser") {
        logins.push(params);
        respond(socket, id, true);
      } else if (method === "sessionGetRestoreToken") {
        count += 1;
        respond(socket, id, `synthetic-restore-token-${String(count).padStart(4, "0")}`);
      } else if (method === "getDeckTypes" && logins.length === 1) {
        socket.close(1011, "synthetic network interruption");
      } else if (method === "disconnectSession") respond(socket, id, true);
      else respond(socket, id, []);
    });

    const first = await PlaymatConnection.connect({ url, engineName: "mvtest002", onEvent: () => undefined });
    await expect(first.call("getDeckTypes")).rejects.toThrow("closed");
    const restored = await first.reconnect();
    expect(logins).toHaveLength(2);
    expect(logins[1]?.[3]).toBe("synthetic-restore-token-0001");
    await restored.disconnect();
  });

  it("refuses automatic reconnect after a takeover close code", async () => {
    const { url } = await engine((socket, method, params, id) => {
      if (method === "connectUser") respond(socket, id, true);
      else if (method === "sessionGetRestoreToken") respond(socket, id, "synthetic-restore-token-0001");
      else if (method === "getDeckTypes") socket.close(4001, "signed in elsewhere");
      else if (method === "disconnectSession") respond(socket, id, true);
    });
    const connection = await PlaymatConnection.connect({ url, engineName: "mvtest003", onEvent: () => undefined });
    await expect(connection.call("getDeckTypes")).rejects.toThrow("signed in elsewhere");
    expect(connection.wasTakenOver).toBe(true);
    await expect(connection.reconnect()).rejects.toThrow("do not reconnect automatically");
  });

  it("rejects unsafe URLs and invalid engine identities before opening a socket", async () => {
    await expect(PlaymatConnection.connect({
      url: "https://example.test", engineName: "mv_user", onEvent: () => undefined,
    })).rejects.toThrow("ws or wss");
    await expect(PlaymatConnection.connect({
      url: "ws://user:password@localhost", engineName: "mv_user", onEvent: () => undefined,
    })).rejects.toThrow("credentials");
    await expect(PlaymatConnection.connect({
      url: "ws://localhost", engineName: "not-an-engine-name", onEvent: () => undefined,
    })).rejects.toThrow("account name");
  });
});
