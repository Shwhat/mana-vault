// ---------- adding a card: one button that names where it goes, then the printing and finish chosen ----------
import type { MouseEvent as ReactMouseEvent } from "react";
import { request } from "../api";
import type { Store } from "../store";
import type { Card, FinishCode, Zone } from "../types";
import { currentOpening } from "../purchase-state";
import { finishName } from "./CardMarks";
import { chooseFinish, choosePrinting, finishesOf, type Printing } from "./PrintingDialog";

const CODES: Record<string, FinishCode> = { nonfoil: 0, foil: 1, etched: 2 };

/** The finishes a printing is made in, regular first. Without finish data, regular and foil. */
export function finishesOfCard(card: Pick<Card, "finishes">): FinishCode[] {
  const codes = String(card.finishes ?? "").split(",").filter((name) => name in CODES).map((name) => CODES[name]!);
  return codes.length ? [...new Set(codes)].sort() : [0, 1];
}

/** The finish to start with: foil while Add as foil is on and the printing has foil, otherwise its first finish. */
export function defaultFinish(store: Store, card: Pick<Card, "finishes">): FinishCode {
  const offered = finishesOfCard(card);
  if (store.prefs.foil && offered.includes(1)) return 1;
  return offered.includes(0) ? 0 : offered[0]!;
}

export type AddTarget = "auto" | "collection" | "deck";

/** Where an add puts cards: the deck when it was selected last (or asked for), otherwise the target collection. */
export function addTargetOf(store: Store, target: AddTarget = "auto"): { kind: "collection" | "deck"; name: string } | null {
  const deck = store.deck;
  if (target === "deck" || (target === "auto" && store.prefs.addTo === "deck" && deck)) return deck ? { kind: "deck", name: deck.name } : null;
  const collection = store.prefs.targetCollection;
  // while an opening ties the cards added to its collection, the opening is named as where they go
  const opening = currentOpening();
  if (collection && opening?.collectionId === collection) return { kind: "collection", name: opening.name };
  return collection ? { kind: "collection", name: store.collectionName(collection) } : null;
}

const printingCache = new Map<string, Printing[]>();

/** Adds the chosen printing in the chosen finish to the target. */
function addPrinting(store: Store, printing: Pick<Card, "id" | "name">, finish: FinishCode, target: { kind: "collection" | "deck" }, zone?: Zone) {
  if (target.kind === "deck") void store.addToDeck(printing.id, printing.name, undefined, { zone: zone ?? store.prefs.zone, finish: finishName(finish) });
  else void store.addToCollection(printing.id, printing.name, store.prefs.targetCollection ?? undefined, finish);
}

/**
 * Adds a card: the printing chooser opens with the printing shown already selected, so Enter takes it; a card made in
 * only one printing and one finish is added at once.
 */
export async function addCard(store: Store, card: Pick<Card, "id" | "name" | "finishes">, target: AddTarget = "auto", zone?: Zone) {
  const where = addTargetOf(store, target);
  if (!where) return store.flash(target === "deck" ? "Open a deck first" : "Create a collection first", "err");
  let printings = printingCache.get(card.id);
  if (!printings) {
    try {
      printings = await request<Printing[]>(`/api/cards/${encodeURIComponent(card.id)}/printings`);
      printingCache.set(card.id, printings);
    } catch {
      printings = [];
    }
  }
  // one printing (0.18.0): no printing list; one finish adds at once, more ask only for the finish
  if (printings.length === 1) {
    const only = printings[0]!;
    const finishes = finishesOf(only);
    if (finishes.length === 1) return addPrinting(store, only, finishes[0]!, where, zone);
    return chooseFinish(`Add ${card.name} to ${where.name}`, only, store.prefs.currency, (finish) => addPrinting(store, only, finish, where, zone), defaultFinish(store, card));
  }
  if (printings.length === 0 && finishesOfCard(card).length === 1) return addPrinting(store, card, finishesOfCard(card)[0]!, where, zone);
  choosePrinting(card.name, card.id, card.id, {
    finish: defaultFinish(store, card), currency: store.prefs.currency, title: `Add ${card.name} to ${where.name}`, allowCurrent: true,
  }, (printing, finish) => addPrinting(store, printing, finish, where, zone));
}

/** The right-click menu item for adding a card to where cards go. */
export function addMenuItems(store: Store, card: Pick<Card, "id" | "name" | "finishes">) {
  const where = addTargetOf(store);
  return where ? [{ label: `Add to ${where.name}...`, run: () => void addCard(store, card) }] : [];
}

/** One button that names where the card goes and follows the collection or deck selected last. */
export function AddButtons({ store, card, large = false }: { store: Store; card: Pick<Card, "id" | "name" | "finishes">; large?: boolean }) {
  const where = addTargetOf(store);
  if (!where) return null;
  const add = (event: ReactMouseEvent) => {
    event.stopPropagation();
    void addCard(store, card);
  };
  return (
    <button type="button" className={large ? "btn primary" : "btn small"} title={`Add to ${where.name} (Enter)`} aria-label={`Add ${card.name} to ${where.name}`} onClick={add}>
      {large ? `Add to ${where.name}` : `+ ${where.name}`}
    </button>
  );
}
