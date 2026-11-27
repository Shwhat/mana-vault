import { describe, expect, it } from "vitest";
import type { DeckSnapshot, DeckSnapshotCard } from "./deck-snapshot.js";
import { convertDeckSnapshot, verifyEngineLookups } from "./deck-converter.js";

function entry(entryId: number, zone: DeckSnapshotCard["zone"], options: {
  printingId?: string | null;
  custom?: boolean;
} = {}): DeckSnapshotCard {
  const printingId = options.printingId === undefined ? `printing-${entryId}` : options.printingId;
  return {
    entryId,
    oracleId: `oracle-${entryId}`,
    printingId,
    quantity: 2,
    zone,
    finish: 0,
    printing: printingId === null ? null : {
      id: printingId,
      name: `Card ${entryId}`,
      setCode: "SET",
      collectorNumber: `${entryId}a`,
      imageUrl: null,
      custom: options.custom ?? false,
      removed: false,
    },
  };
}

function snapshot(cards: DeckSnapshotCard[]): DeckSnapshot {
  return { deckId: "deck-1", name: "Test deck", format: "commander", cards };
}

describe("play deck conversion", () => {
  it("preserves exact selected printings and quantities while excluding maybeboard cards", () => {
    const conversion = convertDeckSnapshot(snapshot([
      entry(1, "main"),
      entry(2, "commander"),
      entry(3, "maybeboard"),
    ]), { engineDeckType: "Commander", commanderAsSideboard: true });

    expect(conversion.issues).toEqual([]);
    expect(conversion.deck).toEqual({
      cards: [{ amount: 2, cardName: "Card 1", cardNumber: "1a", setCode: "SET" }],
      sideboard: [{ amount: 2, cardName: "Card 2", cardNumber: "2a", setCode: "SET" }],
    });
    expect(conversion.lookups).toHaveLength(2);
  });

  it("rejects commander and ordinary sideboard entries when the engine folds both into one zone", () => {
    const conversion = convertDeckSnapshot(snapshot([
      entry(1, "commander"),
      entry(2, "sideboard"),
    ]), { engineDeckType: "Commander", commanderAsSideboard: true });

    expect(conversion.deck).toBeNull();
    expect(conversion.issues).toMatchObject([{ entryId: 2, code: "commander-sideboard" }]);
  });

  it("blocks missing, unresolved and custom printings instead of substituting by name", () => {
    const conversion = convertDeckSnapshot(snapshot([
      entry(1, "main", { printingId: null }),
      entry(2, "main", { custom: true }),
    ]), { engineDeckType: "Modern", commanderAsSideboard: false });

    expect(conversion.deck).toBeNull();
    expect(conversion.issues).toMatchObject([
      { entryId: 1, code: "missing-printing" },
      { entryId: 2, code: "custom-card" },
    ]);
  });

  it("requires the engine lookup to return the same set and collector number", () => {
    const conversion = convertDeckSnapshot(snapshot([entry(1, "main")]), {
      engineDeckType: "Modern", commanderAsSideboard: false,
    });

    expect(verifyEngineLookups(conversion, [{ expansionSetCode: "set", cardNumber: "1A" }])).toEqual([]);
    expect(verifyEngineLookups(conversion, [{ expansionSetCode: "ALT", cardNumber: "9" }])).toMatchObject([
      { entryId: 1, code: "printing-fallback" },
    ]);
    expect(verifyEngineLookups(conversion, [null])).toMatchObject([
      { entryId: 1, code: "unsupported-card" },
    ]);
    expect(verifyEngineLookups(conversion, [])).toMatchObject([{ code: "lookup-count" }]);
  });
});
