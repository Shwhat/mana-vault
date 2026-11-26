import type { ActionType, GameId, PlayAction, PlayerGameView, PlayerId } from "./types.js";

export type EngineCapabilities = {
  mode: "manual" | "automated";
  actions: readonly ActionType[];
  reconnect: boolean;
};

export type ActionResult =
  | { status: "accepted" }
  | { status: "rejected"; reason: string }
  | { status: "unsupported"; action: ActionType };

export interface PlayEngine {
  readonly capabilities: EngineCapabilities;
  getView(gameId: GameId, viewerId: PlayerId): Promise<PlayerGameView>;
  act(gameId: GameId, playerId: PlayerId, action: PlayAction): Promise<ActionResult>;
}

export function supportsAction(capabilities: EngineCapabilities, action: PlayAction): boolean {
  return capabilities.actions.includes(action.type);
}
