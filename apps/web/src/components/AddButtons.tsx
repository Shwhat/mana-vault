// ---------- Add buttons that name where the card goes, with a button for each other finish the printing is made in ----------
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Store } from "../store";
import type { Card, FinishCode } from "../types";
import { finishName } from "./CardMarks";

const FINISH_LABEL: Record<FinishCode, string> = { 0: "Regular", 1: "Foil", 2: "Etched" };
const CODES: Record<string, FinishCode> = { nonfoil: 0, foil: 1, etched: 2 };

/** The finishes a printing is made in, regular first. Without finish data, regular and foil. */
export function finishesOfCard(card: Pick<Card, "finishes">): FinishCode[] {
  const codes = String(card.finishes ?? "").split(",").filter((name) => name in CODES).map((name) => CODES[name]!);
  return codes.length ? [...new Set(codes)].sort() : [0, 1];
}

/** The finish an Add button uses: foil while Add as foil is on and the printing has foil, otherwise its first finish. */
export function defaultFinish(store: Store, card: Pick<Card, "finishes">): FinishCode {
  const offered = finishesOfCard(card);
  if (store.prefs.foil && offered.includes(1)) return 1;
  return offered.includes(0) ? 0 : offered[0]!;
}

/** Where the add commands put cards: the deck when it was selected last, otherwise the target collection. */
export function addTargetName(store: Store): string {
  if (store.prefs.addTo === "deck" && store.deck) return store.deck.name;
  return store.prefs.targetCollection ? store.collectionName(store.prefs.targetCollection) : "a collection";
}

/** Adds a printing in a finish to the target collection, never the deck. */
export function addToCollectionIn(store: Store, card: Pick<Card, "id" | "name">, finish: FinishCode) {
  const target = store.prefs.targetCollection;
  if (!target) return store.flash("Create a collection first", "err");
  void store.addToCollection(card.id, card.name, target, finish);
}

/** Adds a printing in a finish to the open deck, in the target zone. */
export function addToDeckIn(store: Store, card: Pick<Card, "id" | "name">, finish: FinishCode) {
  void store.addToDeck(card.id, card.name, undefined, { zone: store.prefs.zone, finish: finishName(finish) });
}

/** Menu items for adding a card: to the target collection and the open deck, in each finish the printing is made in. */
export function addMenuItems(store: Store, card: Pick<Card, "id" | "name" | "finishes">) {
  const offered = finishesOfCard(card);
  const collection = store.prefs.targetCollection ? store.collectionName(store.prefs.targetCollection) : null;
  const deck = store.deck;
  const word = (code: FinishCode) => (code === 0 ? "" : ` as ${FINISH_LABEL[code].toLowerCase()}`);
  return [
    ...(collection ? offered.map((code) => ({ label: `Add to ${collection}${word(code)}`, run: () => addToCollectionIn(store, card, code) })) : []),
    ...(deck ? offered.map((code) => ({ label: `Add to ${deck.name}${word(code)}`, run: () => addToDeckIn(store, card, code) })) : []),
  ];
}

/**
 * The Add buttons of a card: "+ <collection>" and "+ <deck>" in the default finish, each followed by a button for every
 * other finish the printing is made in. `deck` false leaves the deck out (the deck's own Add tab has zone buttons).
 */
export function AddButtons({ store, card, deck = true, large = false }: { store: Store; card: Pick<Card, "id" | "name" | "finishes">; deck?: boolean; large?: boolean }) {
  const offered = finishesOfCard(card);
  const first = defaultFinish(store, card);
  const others = offered.filter((code) => code !== first);
  const size = large ? "btn" : "btn small";
  const stop = (run: () => void) => (event: ReactMouseEvent) => { event.stopPropagation(); run(); };
  const collection = store.prefs.targetCollection ? store.collectionName(store.prefs.targetCollection) : null;
  const strong = (kind: "collection" | "deck") => (kind === "deck" ? store.prefs.addTo === "deck" && !!store.deck : !(store.prefs.addTo === "deck" && store.deck));
  const group = (kind: "collection" | "deck", name: string, add: (code: FinishCode) => void, key: string) => (
    <span className="addfin" key={kind}>
      <button type="button" className={`${size}${large && strong(kind) ? " primary" : ""}`} title={`Add to ${name}${key ? ` (${key})` : ""}`}
        aria-label={`Add ${card.name} to ${name}${first ? ` as ${FINISH_LABEL[first].toLowerCase()}` : ""}`} onClick={stop(() => add(first))}>
        + {name}{first ? ` ${FINISH_LABEL[first].toLowerCase()}` : ""}</button>
      {others.map((code) => (
        <button key={code} type="button" className={size} title={`Add ${FINISH_LABEL[code].toLowerCase()} to ${name}`}
          aria-label={`Add ${card.name} to ${name} as ${FINISH_LABEL[code].toLowerCase()}`} onClick={stop(() => add(code))}>{FINISH_LABEL[code]}</button>
      ))}
    </span>
  );
  return (
    <>
      {collection && group("collection", collection, (code) => addToCollectionIn(store, card, code), strong("collection") ? "Enter" : "")}
      {deck && store.deck && group("deck", store.deck.name, (code) => addToDeckIn(store, card, code), "Shift+Enter")}
    </>
  );
}
