export type RequestId = string | number;

export type DeckCardInfo = Readonly<{
  amount: number;
  cardName: string;
  cardNumber: string;
  setCode: string;
}>;

export type DeckCardLists = Readonly<{
  cards: readonly DeckCardInfo[];
  sideboard: readonly DeckCardInfo[];
}>;

export type PlaymatRpcParams = {
  ping: [] | [sessionId: string] | [sessionId: string, pingInfo: string];
  connectUser: [userName: string, password: string, sessionId: string, restoreSessionId?: string | null];
  sessionGetRestoreToken: [sessionId: string];
  disconnectSession: [sessionId: string, keepGames?: boolean | null];
  serverGetMainRoomId: [];
  getServerState: [];
  getGameTypes: [];
  getPlayerTypes: [];
  getDeckTypes: [];
  lookupCards: [cards: readonly DeckCardInfo[]];
  deckValidate: [deckType: string, deck: DeckCardLists];
  roomCreateTable: [sessionId: string, roomId: string, options: Readonly<{ name: string; gameType: string; deckType: string; winsNeeded: number }>];
  roomJoinTable: [sessionId: string, roomId: string, tableId: string, name: string, playerType: string, skill: number, deck: DeckCardLists, password?: string | null];
  matchStart: [sessionId: string, roomId: string, tableId: string];
  roomLeaveTableOrTournament: [sessionId: string, roomId: string, tableId: string];
  gameJoin: [gameId: string, sessionId: string];
  gameResync: [gameId: string, sessionId: string];
  gameStateResync: [gameId: string, sessionId: string];
  matchQuit: [gameId: string, sessionId: string];
  sendPlayerAction: [action: string, gameId: string, sessionId: string, data?: unknown | null];
  sendPlayerUUID: [gameId: string, sessionId: string, data?: string | null];
  sendPlayerString: [gameId: string, sessionId: string, data: string];
  sendPlayerBoolean: [gameId: string, sessionId: string, data: boolean];
  sendPlayerInteger: [gameId: string, sessionId: string, data: number];
};

export type PlaymatRpcMethod = keyof PlaymatRpcParams;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

const METHODS: readonly PlaymatRpcMethod[] = [
  "ping", "connectUser", "sessionGetRestoreToken", "disconnectSession", "serverGetMainRoomId",
  "getServerState", "getGameTypes", "getPlayerTypes", "getDeckTypes", "lookupCards", "deckValidate",
  "roomCreateTable", "roomJoinTable", "matchStart", "roomLeaveTableOrTournament",
  "gameJoin", "gameResync", "gameStateResync", "matchQuit",
  "sendPlayerAction", "sendPlayerUUID", "sendPlayerString", "sendPlayerBoolean", "sendPlayerInteger",
];

export function isRequestId(value: unknown): value is RequestId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

export function request<M extends PlaymatRpcMethod>(id: RequestId, method: M, ...params: PlaymatRpcParams[M]): string {
  if (!isRequestId(id)) throw new ProtocolError("Invalid request id");
  if (!METHODS.includes(method)) throw new ProtocolError("Unsupported RPC method");
  if (method === "ping" && (params.length > 2 || !params.every((value) => typeof value === "string"))) {
    throw new ProtocolError("Invalid RPC parameters");
  }
  if (method === "connectUser"
    && (typeof params[0] !== "string" || typeof params[1] !== "string" || typeof params[2] !== "string"
      || (params.length > 3 && params[3] !== null && typeof params[3] !== "string"))) {
    throw new ProtocolError("Invalid login parameters");
  }
  if (method === "lookupCards" && (!Array.isArray(params[0]) || params[0].length > 500)) {
    throw new ProtocolError("Card lookup accepts at most 500 entries");
  }
  if (method === "sendPlayerBoolean" && typeof params[2] !== "boolean") throw new ProtocolError("Invalid boolean response");
  if (method === "sendPlayerInteger" && (typeof params[2] !== "number" || !Number.isSafeInteger(params[2]))) {
    throw new ProtocolError("Invalid integer response");
  }
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}
