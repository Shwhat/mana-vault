import type { DeckCard } from "./types";

export type ManualZone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command";

export type ManualCard = Readonly<{
  id: string;
  name: string;
  imageUrl: string | null;
  typeLine: string;
  custom: boolean;
  token: boolean;
  tapped: boolean;
  faceDown: boolean;
  counters: Readonly<Record<string, number>>;
  attachedTo?: string;
}>;

export type ManualGame = Readonly<{
  library: readonly ManualCard[];
  hand: readonly ManualCard[];
  battlefield: readonly ManualCard[];
  graveyard: readonly ManualCard[];
  exile: readonly ManualCard[];
  command: readonly ManualCard[];
  turn: number;
  life: number;
  poison: number;
  mulligans: number;
  bottom: number;
  nextTokenId: number;
}>;

type ManualDeckEntry = Pick<DeckCard, "entry_id" | "name" | "image_url" | "type_line" | "custom" | "quantity" | "zone">;
type MoveOptions = { tapped?: boolean; faceDown?: boolean; libraryPosition?: "top" | "bottom" };

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function instances(cards: readonly ManualDeckEntry[], zone: "main" | "commander"): ManualCard[] {
  return cards.filter((card) => card.zone === zone).flatMap((card) =>
    Array.from({ length: card.quantity }, (_, copy) => ({
      id: `${card.entry_id}:${copy}`,
      name: card.name,
      imageUrl: card.image_url,
      typeLine: card.type_line,
      custom: card.custom ?? false,
      token: false,
      tapped: false,
      faceDown: false,
      counters: {},
    })));
}

export function startManualGame(
  cards: readonly ManualDeckEntry[],
  mulligans = 0,
  random: () => number = Math.random,
): ManualGame {
  const library = shuffled(instances(cards, "main"), random);
  return {
    library: library.slice(7),
    hand: library.slice(0, 7),
    battlefield: [],
    graveyard: [],
    exile: [],
    command: instances(cards, "commander"),
    turn: 1,
    life: 20,
    poison: 0,
    mulligans,
    bottom: Math.min(7, mulligans),
    nextTokenId: 1,
  };
}

export function drawManualCards(game: ManualGame, count = 1): ManualGame {
  const drawn = game.library.slice(0, Math.max(0, count));
  return { ...game, library: game.library.slice(drawn.length), hand: [...game.hand, ...drawn] };
}

export function shuffleManualLibrary(game: ManualGame, random: () => number = Math.random): ManualGame {
  return { ...game, library: shuffled(game.library, random) };
}

export function playManualCard(game: ManualGame, id: string): ManualGame {
  const card = game.hand.find((item) => item.id === id);
  if (!card) return game;
  if (game.bottom > 0) {
    return {
      ...game,
      hand: game.hand.filter((item) => item.id !== id),
      library: [...game.library, card],
      bottom: game.bottom - 1,
    };
  }
  return {
    ...game,
    hand: game.hand.filter((item) => item.id !== id),
    battlefield: [...game.battlefield, card],
  };
}

export function moveManualCard(
  game: ManualGame,
  id: string,
  from: ManualZone,
  to: ManualZone,
  options: MoveOptions = {},
): ManualGame {
  const source = game[from];
  const card = source.find((item) => item.id === id);
  if (!card) return game;
  const moved: ManualCard = {
    ...card,
    tapped: options.tapped ?? (to === "battlefield" ? card.tapped : false),
    faceDown: options.faceDown ?? (to === "battlefield" ? card.faceDown : false),
    attachedTo: to === "battlefield" ? card.attachedTo : undefined,
    counters: from === to ? card.counters : {},
  };
  return {
    ...game,
    ...(from === to
      ? { [from]: source.map((item) => item.id === id ? moved : item) }
      : { [from]: source.filter((item) => item.id !== id).map((item) =>
        from === "battlefield" && item.attachedTo === id ? { ...item, attachedTo: undefined } : item),
      [to]: to === "library" && options.libraryPosition === "top" ? [moved, ...game[to]] : [...game[to], moved] }),
  };
}

export function canAttachManualCard(game: ManualGame, id: string, targetId: string | null): boolean {
  if (!game.battlefield.some((item) => item.id === id)) return false;
  if (targetId !== null) {
    let target = game.battlefield.find((item) => item.id === targetId);
    if (!target) return false;
    const visited = new Set<string>();
    while (target) {
      if (target.id === id || visited.has(target.id)) return false;
      visited.add(target.id);
      target = game.battlefield.find((item) => item.id === target?.attachedTo);
    }
  }
  return true;
}

export function attachManualCard(game: ManualGame, id: string, targetId: string | null): ManualGame {
  if (!canAttachManualCard(game, id, targetId)) return game;
  return {
    ...game,
    battlefield: game.battlefield.map((item) => item.id === id ? { ...item, attachedTo: targetId ?? undefined } : item),
  };
}

export function toggleManualTap(game: ManualGame, id: string): ManualGame {
  return {
    ...game,
    battlefield: game.battlefield.map((card) => card.id === id ? { ...card, tapped: !card.tapped } : card),
  };
}

export function changeManualCounter(game: ManualGame, id: string, name: string, delta: number): ManualGame {
  if (!name.trim() || name.length > 32 || !Number.isSafeInteger(delta) || Math.abs(delta) > 100) return game;
  return {
    ...game,
    battlefield: game.battlefield.map((card) => {
      if (card.id !== id) return card;
      const count = Math.max(0, (card.counters[name] ?? 0) + delta);
      const counters = { ...card.counters };
      if (count) counters[name] = count;
      else delete counters[name];
      return { ...card, counters };
    }),
  };
}

export function addManualToken(game: ManualGame, name: string): ManualGame {
  const cleanName = name.trim().slice(0, 100);
  if (!cleanName) return game;
  const token: ManualCard = {
    id: `token:${game.nextTokenId}`,
    name: cleanName,
    imageUrl: null,
    typeLine: "Token",
    custom: false,
    token: true,
    tapped: false,
    faceDown: false,
    counters: {},
  };
  return { ...game, battlefield: [...game.battlefield, token], nextTokenId: game.nextTokenId + 1 };
}

export function copyManualCard(game: ManualGame, id: string): ManualGame {
  const card = game.battlefield.find((item) => item.id === id);
  if (!card) return game;
  const copy: ManualCard = {
    ...card, id: `token:${game.nextTokenId}`, token: true,
    tapped: false, counters: {}, attachedTo: undefined,
  };
  return { ...game, battlefield: [...game.battlefield, copy], nextTokenId: game.nextTokenId + 1 };
}

export function changeManualTotal(game: ManualGame, key: "life" | "poison", delta: number): ManualGame {
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > 1000) return game;
  return { ...game, [key]: Math.max(0, Math.min(100_000, game[key] + delta)) };
}

export function nextManualTurn(game: ManualGame): ManualGame {
  return {
    ...game,
    turn: game.turn + 1,
    battlefield: game.battlefield.map((card) => ({ ...card, tapped: false })),
  };
}
