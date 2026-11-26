import { isRequestId, ProtocolError, type RequestId } from "./rpc.js";

export type RpcResponse =
  | { kind: "result"; id: RequestId | null; result: unknown }
  | { kind: "error"; id: RequestId | null; error: { code: number; message: string; data?: unknown } };

export type ServerEvent = {
  kind: "event" | "unknown-event";
  method: string;
  objectId: string | null;
  messageId: number;
  data: unknown;
};

export type ServerMessage = RpcResponse | ServerEvent;

const EVENTS: readonly string[] = ["GAME_INIT", "GAME_UPDATE", "GAME_SELECT", "GAME_ASK", "GAME_TARGET", "GAME_OVER"];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseServerMessage(text: string): ServerMessage {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new ProtocolError("Invalid JSON from engine");
    throw error;
  }
  if (!object(value)) throw new ProtocolError("Invalid engine message");
  if ("jsonrpc" in value) {
    if (value.jsonrpc !== "2.0" || !(value.id === null || isRequestId(value.id))
      || ("result" in value) === ("error" in value)) throw new ProtocolError("Invalid RPC response");
    if ("error" in value) {
      const error = value.error;
      if (!object(error) || typeof error.code !== "number" || !Number.isInteger(error.code) || typeof error.message !== "string") {
        throw new ProtocolError("Invalid RPC error");
      }
      return { kind: "error", id: value.id, error: { code: error.code, message: error.message, ...("data" in error ? { data: error.data } : {}) } };
    }
    return { kind: "result", id: value.id, result: value.result };
  }
  if (typeof value.method !== "string" || !value.method || typeof value.messageId !== "number"
    || !Number.isSafeInteger(value.messageId) || value.messageId < 0
    || !(value.objectId === undefined || value.objectId === null || typeof value.objectId === "string")) {
    throw new ProtocolError("Invalid engine event");
  }
  if ("state" in value) {
    if (!object(value.state) || typeof value.state.seq !== "number" || !Number.isSafeInteger(value.state.seq) || value.state.seq < 0) {
      throw new ProtocolError("Invalid engine state header");
    }
    if ("base" in value.state || "patch" in value.state) throw new ProtocolError("State patches are not supported");
  }
  return {
    kind: EVENTS.includes(value.method) ? "event" : "unknown-event",
    method: value.method,
    objectId: value.objectId ?? null,
    messageId: value.messageId,
    data: value.data,
  };
}
