import { describe, expect, it } from "vitest";
import {
  addManualToken, changeManualCounter, changeManualTotal, drawManualCards, moveManualCard,
  nextManualTurn, playManualCard, startManualGame, toggleManualTap,
} from "./manual-play";

const cards = [
  { entry_id: 1, name: "Island", image_url: null, type_line: "Basic Land - Island", custom: false, quantity: 8, zone: "main" as const },
  { entry_id: 2, name: "Custom Bear", image_url: null, type_line: "Creature", custom: true, quantity: 1, zone: "commander" as const },
];

describe("offline manual play", () => {
  it("deals a seven-card hand, keeps commanders separate, and never mutates the deck", () => {
    const game = startManualGame(cards, 0, () => 0.5);
    expect(game.hand).toHaveLength(7);
    expect(game.library).toHaveLength(1);
    expect(game.command.map((card) => card.name)).toEqual(["Custom Bear"]);
    expect(game.hand.every((card) => card.name === "Island")).toBe(true);
    expect(cards[0]?.quantity).toBe(8);
  });

  it("returns mulligan selections to the library bottom before allowing play", () => {
    const opening = startManualGame(cards, 1, () => 0.5);
    const chosen = opening.hand[0];
    if (!chosen) throw new Error("Missing opening card");
    const bottomed = playManualCard(opening, chosen.id);
    expect(bottomed.bottom).toBe(0);
    expect(bottomed.library.at(-1)?.id).toBe(chosen.id);
    expect(bottomed.battlefield).toHaveLength(0);
    const played = playManualCard(bottomed, bottomed.hand[0]!.id);
    expect(played.battlefield).toHaveLength(1);
  });

  it("plays an original custom card through the offline manual game", () => {
    const customDeck = [
      { entry_id: 3, name: "Custom Bear", image_url: null, type_line: "Creature - Bear", custom: true, quantity: 1, zone: "main" as const },
    ];
    const opening = startManualGame(customDeck, 0, () => 0);
    expect(opening.hand).toHaveLength(1);
    expect(opening.hand[0]).toMatchObject({ name: "Custom Bear", typeLine: "Creature - Bear", custom: true });

    const played = playManualCard(opening, opening.hand[0]!.id);
    expect(played.hand).toHaveLength(0);
    expect(played.battlefield[0]).toMatchObject({ name: "Custom Bear", custom: true });
    expect(customDeck[0]?.quantity).toBe(1);
  });

  it("moves public cards, tracks counters and totals, creates tokens, and untaps on the next turn", () => {
    const opening = startManualGame(cards, 0, () => 0.5);
    const played = playManualCard(opening, opening.hand[0]!.id);
    const id = played.battlefield[0]!.id;
    const tapped = toggleManualTap(played, id);
    const counted = changeManualCounter(tapped, id, "+1/+1", 2);
    const tokened = addManualToken(counted, "Wolf");
    const moved = moveManualCard(tokened, id, "battlefield", "graveyard");
    const next = nextManualTurn(moved);
    expect(next.graveyard[0]?.tapped).toBe(false);
    expect(next.battlefield[0]?.name).toBe("Wolf");
    expect(next.battlefield[0]?.counters).toEqual({});
    expect(changeManualTotal(changeManualTotal(next, "life", -2), "poison", 1)).toMatchObject({ life: 18, poison: 1 });
    expect(drawManualCards(next).hand).toHaveLength(7);
  });
});
