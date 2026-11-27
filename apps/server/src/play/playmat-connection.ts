import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import {
  parseServerMessage, ProtocolError, request,
  type PlaymatRpcMethod, type PlaymatRpcParams, type ServerEvent,
} from "@mana-vault/playmat-protocol";

const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

export type PlaymatConnectionOptions = Readonly<{
  url: string;
  engineName: string;
  identityHeader?: string;
  timeoutMs?: number;
  onEvent: (event: ServerEvent) => void;
}>;

export class PlaymatRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly reason: string | null,
  ) {
    super(message);
    this.name = "PlaymatRpcError";
  }
}

function validatedUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Playmat URL must be a valid WebSocket URL");
  }
  if ((url.protocol !== "ws:" && url.protocol !== "wss:")
    || url.username || url.password || url.search || url.hash) {
    throw new Error("Playmat URL must use ws or wss without credentials, query parameters or fragments");
  }
  return url.toString();
}

function validatedHeader(value: string): string {
  if (!/^[!#$%&'*+-.^_`|~0-9A-Za-z]+$/.test(value)) throw new Error("Invalid Playmat identity header name");
  return value;
}

function reasonOf(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const reason = (value as Record<string, unknown>).reason;
  return typeof reason === "string" ? reason : null;
}

type Pending = {
  method: PlaymatRpcMethod;
  timer: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class PlaymatConnection {
  readonly #url: string;
  readonly #engineName: string;
  readonly #identityHeader: string;
  readonly #timeoutMs: number;
  readonly #onEvent: (event: ServerEvent) => void;
  readonly #socket: WebSocket;
  readonly #sessionId = randomUUID();
  readonly #pending = new Map<number, Pending>();
  #restoreToken: string | null = null;
  #nextId = 0;
  #closed = false;
  #takenOver = false;

  private constructor(options: PlaymatConnectionOptions) {
    this.#url = validatedUrl(options.url);
    if (!/^[A-Za-z0-9_]{3,14}$/.test(options.engineName)) throw new Error("Invalid Playmat account name");
    this.#engineName = options.engineName;
    this.#identityHeader = validatedHeader(options.identityHeader ?? "X-Mana-Vault-User");
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 100 || this.#timeoutMs > 60_000) {
      throw new Error("Playmat request timeout must be between 100 and 60000 milliseconds");
    }
    this.#onEvent = options.onEvent;
    this.#socket = new WebSocket(this.#url, {
      headers: { [this.#identityHeader]: this.#engineName },
      maxPayload: MAX_MESSAGE_BYTES,
      perMessageDeflate: false,
    });
    this.#socket.on("message", (data, isBinary) => this.#receive(data, isBinary));
    this.#socket.on("close", (code) => this.#handleClose(code));
    this.#socket.on("error", (error) => this.#fail(new Error("Playmat WebSocket failed", { cause: error })));
  }

  static async connect(options: PlaymatConnectionOptions, restoreToken: string | null = null): Promise<PlaymatConnection> {
    const connection = new PlaymatConnection(options);
    try {
      await connection.#waitUntilOpen();
      const signedIn = await connection.call("connectUser", connection.#engineName, "", connection.#sessionId, restoreToken);
      if (signedIn !== true) throw new Error("Playmat refused the server-managed user session");
      const nextToken = await connection.call("sessionGetRestoreToken", connection.#sessionId);
      if (typeof nextToken !== "string" || nextToken.length < 16) throw new ProtocolError("Playmat returned an invalid restore token");
      connection.#restoreToken = nextToken;
      return connection;
    } catch (error) {
      connection.#socket.terminate();
      throw error;
    }
  }

  get wasTakenOver(): boolean {
    return this.#takenOver;
  }

  async call<M extends PlaymatRpcMethod>(method: M, ...params: PlaymatRpcParams[M]): Promise<unknown> {
    if (this.#closed || this.#socket.readyState !== WebSocket.OPEN) throw new Error("Playmat connection is not open");
    if (this.#nextId >= Number.MAX_SAFE_INTEGER) throw new Error("Playmat request id space exhausted");
    const id = ++this.#nextId;
    const payload = request(id, method, ...params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Playmat ${method} request timed out`));
      }, this.#timeoutMs);
      this.#pending.set(id, { method, timer, resolve, reject });
      this.#socket.send(payload, (error) => {
        if (!error) return;
        const pending = this.#pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.#pending.delete(id);
        pending.reject(new Error(`Could not send Playmat ${method} request`, { cause: error }));
      });
    });
  }

  async reconnect(): Promise<PlaymatConnection> {
    if (!this.#closed) throw new Error("Reconnect is only available after the Playmat connection closes");
    if (this.#takenOver) throw new Error("Playmat session was signed in elsewhere; do not reconnect automatically");
    if (!this.#restoreToken) throw new Error("Playmat restore token is unavailable");
    const connection = await PlaymatConnection.connect({
      url: this.#url,
      engineName: this.#engineName,
      identityHeader: this.#identityHeader,
      timeoutMs: this.#timeoutMs,
      onEvent: this.#onEvent,
    }, this.#restoreToken);
    this.#restoreToken = null;
    return connection;
  }

  async disconnect(keepGames = false): Promise<void> {
    if (this.#closed) {
      this.#restoreToken = null;
      return;
    }
    try {
      const disconnected = await this.call("disconnectSession", this.#sessionId, keepGames);
      if (disconnected !== true) throw new Error("Playmat did not confirm session logout");
    } finally {
      this.#restoreToken = null;
      this.#socket.close(1000, "Mana Vault session ended");
    }
  }

  #waitUntilOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out connecting to Playmat"));
      }, this.#timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.#socket.off("open", onOpen);
        this.#socket.off("error", onError);
        this.#socket.off("close", onClose);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(new Error("Could not connect to Playmat", { cause: error }));
      };
      const onClose = (code: number) => {
        cleanup();
        reject(new Error(`Playmat closed the connection before login (${code})`));
      };
      this.#socket.once("open", onOpen);
      this.#socket.once("error", onError);
      this.#socket.once("close", onClose);
    });
  }

  #receive(data: RawData, isBinary: boolean): void {
    if (isBinary) {
      this.#fail(new ProtocolError("Playmat sent an unsupported binary message"));
      this.#socket.close(1003, "Text messages required");
      return;
    }
    let message;
    try {
      message = parseServerMessage(data.toString());
    } catch (error) {
      this.#fail(error instanceof ProtocolError ? error : new Error("Could not parse Playmat message", { cause: error }));
      this.#socket.close(1002, "Invalid engine message");
      return;
    }
    if (message.kind === "result" || message.kind === "error") {
      if (message.id === null || typeof message.id !== "number") {
        this.#fail(new ProtocolError("Playmat returned a response without a numeric request id"));
        this.#socket.close(1002, "Invalid RPC response");
        return;
      }
      const pending = this.#pending.get(message.id);
      if (!pending) {
        this.#fail(new ProtocolError("Playmat returned an unknown request id"));
        this.#socket.close(1002, "Unknown RPC response");
        return;
      }
      clearTimeout(pending.timer);
      this.#pending.delete(message.id);
      if (message.kind === "result") pending.resolve(message.result);
      else pending.reject(new PlaymatRpcError(message.error.code, message.error.message, reasonOf(message.error.data)));
      return;
    }
    try {
      this.#onEvent(message);
    } catch (error) {
      this.#fail(new Error("Playmat event handler failed", { cause: error }));
      this.#socket.close(1011, "Event handler failed");
    }
  }

  #handleClose(code: number): void {
    this.#closed = true;
    this.#takenOver = code === 4001;
    const error = this.#takenOver
      ? new Error("Playmat session was signed in elsewhere")
      : new Error(`Playmat connection closed (${code})`);
    this.#fail(error);
  }

  #fail(error: Error): void {
    this.#closed = true;
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      this.#pending.delete(id);
      pending.reject(error);
    }
  }
}
