import type { DeckSnapshot, DeckSnapshotCard } from "./deck-snapshot.js";

export type EngineDeckCard = Readonly<{
  amount: number;
  cardName: string;
  cardNumber: string;
  setCode: string;
}>;

export type EngineDeckLists = Readonly<{
  cards: readonly EngineDeckCard[];
  sideboard: readonly EngineDeckCard[];
}>;

export type DeckCompatibilityIssue = Readonly<{
  entryId: number | null;
  code: "missing-printing" | "custom-card" | "commander-format" | "commander-sideboard" | "unsupported-card" | "printing-fallback" | "lookup-count";
  message: string;
}>;

export type DeckLookupEntry = Readonly<{
  entryId: number;
  card: EngineDeckCard;
}>;

export type DeckConversion = Readonly<{
  engineDeckType: string;
  deck: EngineDeckLists | null;
  lookups: readonly DeckLookupEntry[];
  issues: readonly DeckCompatibilityIssue[];
}>;

export type DeckConversionOptions = Readonly<{
  engineDeckType: string;
  commanderAsSideboard: boolean;
}>;

export type EngineLookupCard = Readonly<{
  cardNumber?: unknown;
  expansionSetCode?: unknown;
}>;

function isValidPrinting(
  card: DeckSnapshotCard,
): card is DeckSnapshotCard & { printingId: string; printing: NonNullable<DeckSnapshotCard["printing"]> } {
  return card.printingId !== null
    && card.printing !== null
    && !card.printing.custom
    && card.printing.name.trim().length > 0
    && card.printing.setCode.trim().length > 0
    && card.printing.collectorNumber.trim().length > 0;
}

function issue(
  entryId: number | null,
  code: DeckCompatibilityIssue["code"],
  message: string,
): DeckCompatibilityIssue {
  return Object.freeze({ entryId, code, message });
}

export function convertDeckSnapshot(snapshot: DeckSnapshot, options: DeckConversionOptions): DeckConversion {
  const engineDeckType = options.engineDeckType.trim();
  if (!engineDeckType) throw new Error("Choose a supported engine deck type");

  const issues: DeckCompatibilityIssue[] = [];
  const lookups: DeckLookupEntry[] = [];
  const main: EngineDeckCard[] = [];
  const sideboard: EngineDeckCard[] = [];
  const commanders = snapshot.cards.filter((card) => card.zone === "commander");
  const sideboardCards = snapshot.cards.filter((card) => card.zone === "sideboard");

  if (commanders.length && !options.commanderAsSideboard) {
    for (const card of commanders) {
      issues.push(issue(card.entryId, "commander-format", "The selected engine deck type has no verified commander zone mapping."));
    }
  }
  if (commanders.length && sideboardCards.length && options.commanderAsSideboard) {
    for (const card of sideboardCards) {
      issues.push(issue(card.entryId, "commander-sideboard", "This engine deck type uses the sideboard as its command zone, so ordinary sideboard cards cannot be included safely."));
    }
  }

  for (const entry of snapshot.cards) {
    if (entry.zone === "maybeboard") continue;
    if (entry.zone === "commander" && !options.commanderAsSideboard) continue;
    if (entry.zone === "sideboard" && commanders.length && options.commanderAsSideboard) continue;
    if (entry.printing?.custom) {
      issues.push(issue(entry.entryId, "custom-card", "Custom cards need an explicit supported engine rules-card mapping before play."));
      continue;
    }
    if (!isValidPrinting(entry)) {
      issues.push(issue(entry.entryId, "missing-printing", "Choose an exact, supported catalog printing before starting an engine game."));
      continue;
    }

    const card = Object.freeze({
      amount: entry.quantity,
      cardName: entry.printing.name,
      cardNumber: entry.printing.collectorNumber,
      setCode: entry.printing.setCode,
    });
    const destination = entry.zone === "sideboard" || entry.zone === "commander" ? sideboard : main;
    destination.push(card);
    lookups.push(Object.freeze({ entryId: entry.entryId, card }));
  }

  return Object.freeze({
    engineDeckType,
    deck: issues.length ? null : Object.freeze({ cards: Object.freeze(main), sideboard: Object.freeze(sideboard) }),
    lookups: Object.freeze(lookups),
    issues: Object.freeze(issues),
  });
}

export function verifyEngineLookups(
  conversion: DeckConversion,
  results: readonly (EngineLookupCard | null)[],
): readonly DeckCompatibilityIssue[] {
  if (!conversion.deck) return conversion.issues;
  if (results.length !== conversion.lookups.length) {
    return Object.freeze([issue(null, "lookup-count", "The engine returned an incomplete card lookup response. Retry compatibility checking.")]);
  }

  const issues: DeckCompatibilityIssue[] = [];
  conversion.lookups.forEach(({ entryId, card }, index) => {
    const result = results[index];
    if (!result) {
      issues.push(issue(entryId, "unsupported-card", `${card.cardName} is not available in the selected engine version.`));
      return;
    }
    if (typeof result.expansionSetCode !== "string" || typeof result.cardNumber !== "string"
      || result.expansionSetCode.toLowerCase() !== card.setCode.toLowerCase()
      || result.cardNumber.toLowerCase() !== card.cardNumber.toLowerCase()) {
      issues.push(issue(entryId, "printing-fallback", `${card.cardName} did not resolve to its exact ${card.setCode} ${card.cardNumber} printing.`));
    }
  });
  return Object.freeze(issues);
}
