import type { DatabaseSync } from "node:sqlite";
import type { ServerEvent } from "@mana-vault/playmat-protocol";
import { engineIdentity } from "./engine-identity.js";
import { PlaymatConnection, PlaymatRpcError } from "./playmat-connection.js";

export type PlaySessionOptions = Readonly<{
  url: string;
  timeoutMs?: number;
}>;

export type PlayerEvent = Readonly<{
  id: number;
  event: ServerEvent;
}>;

const MAX_EVENTS_PER_USER = 1000;
const GAME_EVENTS = new Set([
  "START_GAME", "GAME_INIT", "GAME_UPDATE_AND_INFORM", "GAME_INFORM_PERSONAL", "GAME_ERROR", "GAME_UPDATE",
  "GAME_TARGET", "GAME_CHOOSE_ABILITY", "GAME_CHOOSE_PILE", "GAME_CHOOSE_CHOICE", "GAME_ASK", "GAME_SELECT",
  "GAME_PLAY_MANA", "GAME_PLAY_XMANA", "GAME_GET_AMOUNT", "GAME_GET_MULTI_AMOUNT", "GAME_OVER", "END_GAME_INFO",
]);
const PLAYER_PROMPT_EVENTS = new Set([
  "GAME_TARGET", "GAME_CHOOSE_ABILITY", "GAME_CHOOSE_PILE", "GAME_CHOOSE_CHOICE", "GAME_ASK", "GAME_SELECT",
  "GAME_PLAY_MANA", "GAME_PLAY_XMANA", "GAME_GET_AMOUNT", "GAME_GET_MULTI_AMOUNT",
]);

export class PlaySessionManager {
  readonly #connections = new Map<number, Promise<PlaymatConnection>>();
  readonly #events = new Map<number, PlayerEvent[]>();
  readonly #games = new Map<number, Set<string>>();
  readonly #gameMessageIds = new Map<number, Map<string, number>>();
  readonly #claimedGameMessages = new Map<number, Set<string>>();
  readonly #listeners = new Map<number, Set<(event: PlayerEvent) => void>>();
  readonly #takenOver = new Set<number>();
  #nextEventId = 0;

  constructor(
    private readonly database: DatabaseSync,
    private readonly options: PlaySessionOptions,
  ) {}

  async connectionFor(userId: number): Promise<PlaymatConnection> {
    if (this.#takenOver.has(userId)) throw new Error("Playmat session was signed in elsewhere");
    const existing = this.#connections.get(userId);
    if (existing) {
      const connection = await existing;
      const current = this.#connections.get(userId);
      if (current !== existing) {
        if (!current) throw new Error("Playmat session ended while connecting");
        return current;
      }
      if (!connection.isClosed) return connection;
      if (connection.wasTakenOver) {
        this.#connections.delete(userId);
        this.#takenOver.add(userId);
        throw new Error("Playmat session was signed in elsewhere");
      }

      let reconnecting: Promise<PlaymatConnection>;
      reconnecting = connection.reconnect().catch((error: unknown) => {
        if (this.#connections.get(userId) === reconnecting) this.#connections.set(userId, existing);
        if (error instanceof PlaymatRpcError && error.reason === "signedInElsewhere") this.#takenOver.add(userId);
        throw error;
      });
      this.#connections.set(userId, reconnecting);
      const restored = await reconnecting;
      if (this.#connections.get(userId) !== reconnecting) {
        await restored.disconnect();
        throw new Error("Playmat session ended while reconnecting");
      }
      for (const gameId of this.#games.get(userId) ?? []) {
        const joined = await restored.call("gameJoin", gameId, restored.sessionId);
        if (joined !== true) throw new Error("Playmat could not restore the active game");
      }
      return restored;
    }

    let opening: Promise<PlaymatConnection>;
    opening = PlaymatConnection.connect({
      url: this.options.url,
      engineName: engineIdentity(this.database, userId),
      timeoutMs: this.options.timeoutMs,
      onEvent: (event) => this.#recordEvent(userId, event),
    }).catch((error: unknown) => {
      if (this.#connections.get(userId) === opening) this.#connections.delete(userId);
      if (error instanceof PlaymatRpcError && error.reason === "signedInElsewhere") this.#takenOver.add(userId);
      throw error;
    });
    this.#connections.set(userId, opening);
    const connection = await opening;
    if (this.#connections.get(userId) !== opening) {
      await connection.disconnect();
      throw new Error("Playmat session ended while connecting");
    }
    return connection;
  }

  startSession(userId: number): Promise<PlaymatConnection> {
    this.#takenOver.delete(userId);
    return this.connectionFor(userId);
  }

  eventsFor(userId: number, afterId: number, limit = 100): readonly PlayerEvent[] {
    return (this.#events.get(userId) ?? [])
      .filter(({ id }) => id > afterId)
      .slice(0, limit);
  }

  latestEventId(userId: number): number {
    return this.#events.get(userId)?.at(-1)?.id ?? this.#nextEventId;
  }

  async waitForEvent(
    userId: number,
    afterId: number,
    predicate: (event: ServerEvent) => boolean,
    timeoutMs = 15_000,
  ): Promise<PlayerEvent> {
    const queued = this.eventsFor(userId, afterId, MAX_EVENTS_PER_USER).find(({ event }) => predicate(event));
    if (queued) return queued;
    return new Promise((resolve, reject) => {
      const listeners = this.#listeners.get(userId) ?? new Set<(event: PlayerEvent) => void>();
      const cleanup = () => {
        clearTimeout(timer);
        listeners.delete(listener);
        if (!listeners.size) this.#listeners.delete(userId);
      };
      const listener = (playerEvent: PlayerEvent) => {
        if (playerEvent.id <= afterId || !predicate(playerEvent.event)) return;
        cleanup();
        resolve(playerEvent);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for the Playmat game event"));
      }, timeoutMs);
      listeners.add(listener);
      this.#listeners.set(userId, listeners);
    });
  }

  registerGame(userId: number, gameId: string): void {
    const games = this.#games.get(userId) ?? new Set<string>();
    games.add(gameId);
    this.#games.set(userId, games);
  }

  unregisterGame(userId: number, gameId: string): void {
    const games = this.#games.get(userId);
    games?.delete(gameId);
    if (!games?.size) this.#games.delete(userId);
    const messageIds = this.#gameMessageIds.get(userId);
    messageIds?.delete(gameId);
    if (!messageIds?.size) this.#gameMessageIds.delete(userId);
    const claimed = this.#claimedGameMessages.get(userId);
    claimed?.delete(gameId);
    if (!claimed?.size) this.#claimedGameMessages.delete(userId);
  }

  ownsGame(userId: number, gameId: string): boolean {
    return this.#games.get(userId)?.has(gameId) ?? false;
  }

  claimGameMessage(userId: number, gameId: string, messageId: number): boolean {
    if (this.#gameMessageIds.get(userId)?.get(gameId) !== messageId) return false;
    const claimed = this.#claimedGameMessages.get(userId) ?? new Set<string>();
    if (claimed.has(gameId)) return false;
    claimed.add(gameId);
    this.#claimedGameMessages.set(userId, claimed);
    return true;
  }

  finishGameMessage(userId: number, gameId: string, messageId: number, accepted: boolean): void {
    const claimed = this.#claimedGameMessages.get(userId);
    claimed?.delete(gameId);
    if (!claimed?.size) this.#claimedGameMessages.delete(userId);
    if (accepted && this.#gameMessageIds.get(userId)?.get(gameId) === messageId) {
      this.#gameMessageIds.get(userId)?.delete(gameId);
    }
  }

  async disconnectUser(userId: number): Promise<void> {
    const connection = this.#connections.get(userId);
    this.#connections.delete(userId);
    this.#takenOver.delete(userId);
    this.#events.delete(userId);
    this.#games.delete(userId);
    this.#gameMessageIds.delete(userId);
    this.#claimedGameMessages.delete(userId);
    if (!connection) return;
    await (await connection).disconnect();
  }

  async disconnectIfUnauthorized(userId: number): Promise<void> {
    const account = this.database.prepare("SELECT disabled FROM users WHERE id = ?").get(userId);
    const session = this.database.prepare(
      "SELECT 1 FROM sessions WHERE user_id = ? AND expires_at > ? LIMIT 1",
    ).get(userId, Date.now());
    const device = this.database.prepare("SELECT 1 FROM devices WHERE user_id = ? LIMIT 1").get(userId);
    if (account && Number(account.disabled) === 0 && (session || device)) return;
    await this.disconnectUser(userId);
  }

  async disconnectAll(onError: (userId: number, error: unknown) => void): Promise<void> {
    const userIds = [...this.#connections.keys()];
    const results = await Promise.allSettled(userIds.map((userId) => this.disconnectUser(userId)));
    this.#takenOver.clear();
    results.forEach((result, index) => {
      if (result.status === "rejected") onError(userIds[index]!, result.reason);
    });
  }

  startExpirySweep(onError: (userId: number, error: unknown) => void): () => void {
    const timer = setInterval(() => {
      void this.#disconnectExpired(onError);
    }, 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }

  #recordEvent(userId: number, event: ServerEvent): void {
    if (event.kind !== "event" || !GAME_EVENTS.has(event.method)) return;
    const queue = this.#events.get(userId) ?? [];
    const playerEvent = Object.freeze({ id: ++this.#nextEventId, event });
    queue.push(playerEvent);
    if (queue.length > MAX_EVENTS_PER_USER) queue.splice(0, queue.length - MAX_EVENTS_PER_USER);
    this.#events.set(userId, queue);
    if (event.objectId && PLAYER_PROMPT_EVENTS.has(event.method)) {
      const messageIds = this.#gameMessageIds.get(userId) ?? new Map<string, number>();
      messageIds.set(event.objectId, event.messageId);
      this.#gameMessageIds.set(userId, messageIds);
    }
    if (event.objectId && event.method === "GAME_OVER") this.unregisterGame(userId, event.objectId);
    for (const listener of [...(this.#listeners.get(userId) ?? [])]) listener(playerEvent);
  }

  async #disconnectExpired(onError: (userId: number, error: unknown) => void): Promise<void> {
    for (const userId of this.#connections.keys()) {
      try {
        await this.disconnectIfUnauthorized(userId);
      } catch (error) {
        onError(userId, error);
      }
    }
  }
}
