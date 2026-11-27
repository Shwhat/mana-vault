import { describe, expect, it } from "vitest";
import { parseServerMessage, ProtocolError, request } from "./index.js";

describe("Playmat requests", () => {
  it("encodes discovery, authentication and gameplay methods without exposing arbitrary RPC", () => {
    expect(JSON.parse(request(5, "ping", "", "hello"))).toEqual({ jsonrpc: "2.0", id: 5, method: "ping", params: ["", "hello"] });
    expect(JSON.parse(request("id", "getDeckTypes"))).toEqual({ jsonrpc: "2.0", id: "id", method: "getDeckTypes", params: [] });
    expect(JSON.parse(request(9, "roomCreateTable", "session", "room", {
      name: "Mana Vault game",
      gameType: "Standard",
      deckType: "Constructed",
      winsNeeded: 1,
      playerTypes: ["HUMAN", "COMPUTER_MAD"],
    }))).toEqual({
      jsonrpc: "2.0",
      id: 9,
      method: "roomCreateTable",
      params: ["session", "room", {
        name: "Mana Vault game",
        gameType: "Standard",
        deckType: "Constructed",
        winsNeeded: 1,
        playerTypes: ["HUMAN", "COMPUTER_MAD"],
      }],
    });
    expect(JSON.parse(request(6, "connectUser", "mv_user", "", "session", "restore"))).toEqual({
      jsonrpc: "2.0", id: 6, method: "connectUser", params: ["mv_user", "", "session", "restore"],
    });
    expect(JSON.parse(request(7, "roomJoinTable", "session", "room", "table", "mv_user", "HUMAN", 5, {
      cards: [], sideboard: [],
    }))).toEqual({
      jsonrpc: "2.0", id: 7, method: "roomJoinTable",
      params: ["session", "room", "table", "mv_user", "HUMAN", 5, { cards: [], sideboard: [] }],
    });
    expect(JSON.parse(request(8, "sendPlayerBoolean", "game", "session", false))).toMatchObject({
      method: "sendPlayerBoolean", params: ["game", "session", false],
    });
    expect(() => request(1, "connectAdmin" as "ping")).toThrow("Unsupported RPC method");
    expect(() => request(1, "lookupCards", Array.from({ length: 501 }, () => ({
      amount: 1, cardName: "Card", cardNumber: "1", setCode: "SET",
    })))).toThrow("at most 500");
  });
});

describe("Playmat messages", () => {
  it("separates results, RPC errors and asynchronous events", () => {
    expect(parseServerMessage('{"jsonrpc":"2.0","id":1,"result":true}')).toEqual({ kind: "result", id: 1, result: true });
    expect(parseServerMessage('{"jsonrpc":"2.0","id":1,"error":{"code":-32001,"message":"Denied","data":{"reason":"signedInElsewhere"}}}'))
      .toEqual({ kind: "error", id: 1, error: { code: -32001, message: "Denied", data: { reason: "signedInElsewhere" } } });
    expect(parseServerMessage('{"method":"GAME_UPDATE","objectId":"game","messageId":12,"data":{"turn":1}}'))
      .toEqual({ kind: "event", method: "GAME_UPDATE", objectId: "game", messageId: 12, data: { turn: 1 } });
    expect(parseServerMessage('{"method":"GAME_CHOOSE_ABILITY","objectId":"game","messageId":13,"data":{}}').kind).toBe("event");
    expect(parseServerMessage('{"method":"USER_REQUEST_DIALOG","messageId":14,"data":{}}').kind).toBe("event");
    expect(parseServerMessage('{"method":"GAME_INIT","messageId":0,"state":{"seq":1},"data":{"turn":1}}').kind).toBe("event");
  });

  it("surfaces unknown events and rejects malformed messages and patches", () => {
    expect(parseServerMessage('{"method":"FUTURE_EVENT","messageId":0}')).toEqual({
      kind: "unknown-event", method: "FUTURE_EVENT", objectId: null, messageId: 0, data: undefined,
    });
    for (const text of [
      "{", "[]", '{"jsonrpc":"2.0","id":1,"result":true,"error":{}}',
      '{"jsonrpc":"2.0","id":1,"error":{"code":"bad","message":"no"}}',
      '{"method":"GAME_UPDATE","messageId":-1}', '{"method":"GAME_UPDATE","messageId":1,"state":null}',
      '{"method":"GAME_UPDATE","messageId":1,"state":{"seq":2,"base":1,"patch":{}}}',
    ]) expect(() => parseServerMessage(text)).toThrow(ProtocolError);
  });
});
