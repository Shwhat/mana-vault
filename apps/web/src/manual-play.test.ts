import { describe, expect, it } from "vitest";
import {
  addManualToken, attachManualCard, changeManualCounter, changeManualTotal, copyManualCard, drawManualCards, moveManualCard,
  nextManualTurn, playManualCard, shuffleManualLibrary, startManualGame, toggleManualTap,
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

  it("searches and shuffles the library without mutating the saved deck or prior state", () => {
    const deck = [{ ...cards[0]!, quantity: 11 }];
    const opening = startManualGame(deck, 0, () => 0.5);
    const libraryBefore = opening.library.map((card) => card.id);
    const selected = opening.library[2]!;
    const searched = moveManualCard(opening, selected.id, "library", "hand");
    expect(searched.hand.at(-1)?.id).toBe(selected.id);
    expect(searched.library.map((card) => card.id)).not.toContain(selected.id);
    const shuffled = shuffleManualLibrary(searched, () => 0);
    expect(shuffled.library.map((card) => card.id)).toEqual([searched.library[1]!.id, searched.library[2]!.id, searched.library[0]!.id]);
    expect(opening.library.map((card) => card.id)).toEqual(libraryBefore);
    expect(deck[0]?.quantity).toBe(11);
  });

  it("moves a battlefield card to the bottom of the library and resets battlefield state", () => {
    const opening = startManualGame(cards, 0, () => 0.5);
    const played = playManualCard(opening, opening.hand[0]!.id);
    const id = played.battlefield[0]!.id;
    const counted = changeManualCounter(toggleManualTap(played, id), id, "+1/+1", 1);
    const faceDown = moveManualCard(counted, id, "battlefield", "battlefield", { faceDown: true });
    const moved = moveManualCard(faceDown, id, "battlefield", "library");
    expect(moved.battlefield).toHaveLength(0);
    expect(moved.library.at(-1)).toMatchObject({ id, tapped: false, faceDown: false, counters: {} });
    expect(moveManualCard(faceDown, id, "battlefield", "library", { libraryPosition: "top" }).library[0]?.id).toBe(id);
    expect(faceDown.battlefield).toHaveLength(1);
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

  it("attaches battlefield cards without cycles and detaches them when their target leaves", () => {
    const opening = startManualGame(cards, 0, () => 0.5);
    const first = playManualCard(opening, opening.hand[0]!.id);
    const second = playManualCard(first, first.hand[0]!.id);
    const [a, b] = second.battlefield;
    if (!a || !b) throw new Error("Missing battlefield cards");
    const attached = attachManualCard(second, a.id, b.id);
    expect(attached.battlefield[0]?.attachedTo).toBe(b.id);
    expect(second.battlefield[0]?.attachedTo).toBeUndefined();
    expect(attachManualCard(attached, b.id, a.id)).toBe(attached);
    expect(attachManualCard(attached, a.id, a.id)).toBe(attached);
    expect(attachManualCard(attached, a.id, "missing")).toBe(attached);
    expect(attachManualCard(attached, a.id, null).battlefield[0]?.attachedTo).toBeUndefined();
    const sourceMoved = moveManualCard(attached, a.id, "battlefield", "graveyard");
    expect(sourceMoved.graveyard[0]?.attachedTo).toBeUndefined();
    const moved = moveManualCard(attached, b.id, "battlefield", "graveyard");
    expect(moved.battlefield[0]?.attachedTo).toBeUndefined();
  });

  it("copies battlefield cards without copying counters, tap state or attachments", () => {
    const opening = startManualGame(cards, 0, () => 0.5);
    const played = playManualCard(opening, opening.hand[0]!.id);
    const id = played.battlefield[0]!.id;
    const withTarget = addManualToken(played, "Wolf");
    const attached = attachManualCard(withTarget, id, withTarget.battlefield[1]!.id);
    const counted = changeManualCounter(toggleManualTap(attached, id), id, "+1/+1", 1);
    const facedown = moveManualCard(counted, id, "battlefield", "battlefield", { faceDown: true });
    const copied = copyManualCard(facedown, id);
    expect(copied.battlefield).toHaveLength(3);
    expect(copied.battlefield[2]).toMatchObject({ name: "Island", token: true, faceDown: true, tapped: false, counters: {} });
    expect(copied.battlefield[2]!.attachedTo).toBeUndefined();
    expect(copied.battlefield[2]!.id).not.toBe(id);
    expect(facedown.battlefield).toHaveLength(2);
    expect(copyManualCard(facedown, "missing")).toBe(facedown);
  });
});
