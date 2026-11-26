export type RequestId = string | number;

export type DiscoveryParams = {
  ping: [] | [sessionId: string] | [sessionId: string, pingInfo: string];
  getServerState: [];
  getGameTypes: [];
  getPlayerTypes: [];
  getDeckTypes: [];
};

export type DiscoveryMethod = keyof DiscoveryParams;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

const METHODS: readonly string[] = ["ping", "getServerState", "getGameTypes", "getPlayerTypes", "getDeckTypes"];

export function isRequestId(value: unknown): value is RequestId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

export function request<M extends DiscoveryMethod>(id: RequestId, method: M, ...params: DiscoveryParams[M]): string {
  if (!isRequestId(id)) throw new ProtocolError("Invalid request id");
  if (!METHODS.includes(method)) throw new ProtocolError("Unsupported RPC method");
  if ((method === "ping" && (params.length > 2 || !params.every((value) => typeof value === "string")))
    || (method !== "ping" && params.length !== 0)) throw new ProtocolError("Invalid RPC parameters");
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}
