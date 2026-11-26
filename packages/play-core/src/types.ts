export type PlayerId = string;
export type GameId = string;
export type CardInstanceId = string;

export type VisibleCard = {
  id: CardInstanceId;
  name: string;
  ownerId: PlayerId;
  controllerId: PlayerId;
  tapped: boolean;
};

export type ZoneView =
  | { kind: "visible"; id: string; name: string; cards: readonly VisibleCard[] }
  | { kind: "hidden"; id: string; name: string; count: number };

export type ZoneSource = {
  id: string;
  name: string;
  ownerId: PlayerId;
  visibility: "public" | "owner" | "hidden";
  cards: readonly VisibleCard[];
};

export function projectZone(zone: ZoneSource, viewerId: PlayerId): ZoneView {
  switch (zone.visibility) {
    case "hidden":
      return { kind: "hidden", id: zone.id, name: zone.name, count: zone.cards.length };
    case "owner":
      if (zone.ownerId !== viewerId) return { kind: "hidden", id: zone.id, name: zone.name, count: zone.cards.length };
      break;
    case "public":
      break;
    default:
      throw new Error("Invalid zone visibility");
  }
  return {
    kind: "visible", id: zone.id, name: zone.name,
    cards: zone.cards.map(({ id, name, ownerId, controllerId, tapped }) => ({ id, name, ownerId, controllerId, tapped })),
  };
}

export type PlayerBoard = {
  id: PlayerId;
  name: string;
  life: number;
  zones: readonly ZoneView[];
};

export type PlayerPrompt =
  | { kind: "choice"; id: string; message: string; choices: readonly { id: string; label: string }[] }
  | { kind: "target"; id: string; message: string; targets: readonly { id: string; label: string }[] }
  | { kind: "confirm"; id: string; message: string };

export type PlayerGameView = {
  gameId: GameId;
  viewerId: PlayerId;
  players: readonly PlayerBoard[];
  turn: number;
  activePlayerId: PlayerId;
  prompt: PlayerPrompt | null;
};

export type PlayAction =
  | { type: "passPriority" }
  | { type: "concede" }
  | { type: "choose"; promptId: string; choiceId: string }
  | { type: "target"; promptId: string; targetId: string }
  | { type: "confirm"; promptId: string; answer: boolean };

export type ActionType = PlayAction["type"];
