// ---------- card marks shared by every view: finish badges, Upgrade wanted, owned versions of missing cards, Remove how many ----------
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Store } from "../store";
import { type Candidate, type DeckCard, type FinishCode, copyLabel, finishLabel } from "../types";
import { closeDialog, customDialog, dialog } from "./Dialog";

const FINISH_WORD: Record<FinishCode, string> = { 0: "regular", 1: "foil", 2: "etched" };
export const finishWord = (finish: FinishCode | undefined | null) => FINISH_WORD[(finish ?? 0) as FinishCode];
/** A finish code as the name addToDeck takes: "" (regular), "foil" or "etched". */
export const finishName = (finish: FinishCode | number | undefined | null): "" | "foil" | "etched" => (finish === 2 ? "etched" : finish === 1 ? "foil" : "");

/**
 * FOIL, ETCHED or the special foil (SURGE FOIL, GALAXY FOIL...) on a card line or picture; nothing for a regular card.
 * Used everywhere a card is shown.
 */
export function FinishBadge({ finish, promoTypes, className = "" }: { finish: FinishCode | number | boolean | undefined | null; promoTypes?: string | null; className?: string }) {
  const code = finish === true ? 1 : Number(finish ?? 0);
  if (code !== 1 && code !== 2) return null;
  return <span className={`badge foil${className ? ` ${className}` : ""}`}>{finishLabel(code, promoTypes).toUpperCase()}</span>;
}

/** The version a card marked Upgrade wanted is wanted in, such as "(LEA) 161 foil". */
export function wantedLabel(card: Pick<DeckCard, "want_set_code" | "want_collector_number" | "want_finish">): string {
  const finish = card.want_finish ? ` ${finishWord(card.want_finish)}` : "";
  return `(${String(card.want_set_code ?? "").toUpperCase()}) ${card.want_collector_number ?? ""}${finish}`;
}

/** The Upgrade wanted badge, with the version wanted in its tooltip. */
export function UpgradeBadge({ card, className = "" }: { card: DeckCard; className?: string }) {
  if (!card.want_card_id) return null;
  return <span className={`badge upgrade${className ? ` ${className}` : ""}`} title={`Upgrade wanted: ${wantedLabel(card)}`}>Upgrade wanted</span>;
}

/** A free copy as a version: set, number and finish. */
const versionLabel = (item: Candidate) => `(${item.set_code.toUpperCase()}) ${item.collector_number}${item.foil ? ` ${finishWord(item.foil)}` : ""}`;

/** The owned copies that could fill a missing deck card: of exactly its version, and of other versions. */
export function ownedVersions(card: DeckCard) {
  const owned = card.owned ?? [];
  const exact = owned.filter((item) => item.cardId === card.card_id && item.foil === (card.finish ?? 0));
  const other = owned.filter((item) => !(item.cardId === card.card_id && item.foil === (card.finish ?? 0)));
  return { exact, other };
}

/** Links free copies of the exact version to a missing deck card, from one collection, up to the number missing. */
export function linkExact(store: Store, card: DeckCard) {
  const { exact } = ownedVersions(card);
  let wanted = card.missing ?? 0;
  const place = exact[0]?.collectionId;
  const links = [...(card.links ?? []).map((link) => ({ ...link }))];
  for (const item of exact.filter((copy) => copy.collectionId === place)) {
    if (wanted <= 0) break;
    const take = Math.min(wanted, item.free);
    links.push({ collectionId: item.collectionId, collectionName: item.collectionName, cardId: item.cardId, foil: item.foil, condition: item.condition, language: item.language, proxy: item.proxy, quantity: take });
    wanted -= take;
  }
  void store.setDeckLinks(card, links);
}

/** Lists the other versions owned of a missing deck card; Switch changes the missing cards to that version and links them. */
export function switchVersionDialog(store: Store, card: DeckCard) {
  const { other } = ownedVersions(card);
  if (!other.length) return store.flash(`No other version of ${card.name} is free in your collections`, "err");
  const missing = card.missing ?? 0;
  customDialog(`Other versions of ${card.name}`, (close) => (
    <div className="versionlist">
      <p className="note">The deck has {card.quantity} of ({card.set_code.toUpperCase()}) {card.collector_number}{card.finish ? ` ${finishWord(card.finish)}` : ""}, {missing} missing.</p>
      {other.map((item) => (
        <div key={`${item.collectionId}:${item.cardId}:${item.foil}:${item.condition}:${item.language}:${item.proxy ? 1 : 0}`} className="row versionrow">
          <div className="rowmain">
            <div className="rowtitle"><b>{versionLabel(item)}</b><FinishBadge finish={item.foil} /></div>
            <div className="rowsub">{item.collectionName}{copyLabel(item) ? `, ${copyLabel(item)}` : ""}{item.proxy ? ", proxy" : ""}, {item.free} free</div>
          </div>
          <button type="button" className="btn small primary" aria-label={`Switch ${card.name} to ${versionLabel(item)}`}
            onClick={() => {
              close();
              void store.changeDeckPrinting(card, { id: item.cardId, set_code: item.set_code, collector_number: item.collector_number }, item.foil,
                item.collectionId, Math.min(missing, other.filter((copy) => copy.cardId === item.cardId && copy.foil === item.foil && copy.collectionId === item.collectionId)
                  .reduce((sum, copy) => sum + copy.free, 0)));
            }}>Switch</button>
        </div>
      ))}
    </div>
  ), 520, "Cancel");
}

/** "Owned" (link the free copies) or "Other version owned" (choose one to switch to) for a deck card with missing copies. */
export function OwnedMarks({ store, card, compact = false }: { store: Store; card: DeckCard; compact?: boolean }) {
  if ((card.missing ?? 0) <= 0 || card.zone === "maybeboard") return null;
  const { exact, other } = ownedVersions(card);
  const stop = (run: () => void) => (event: ReactMouseEvent) => { event.stopPropagation(); run(); };
  if (exact.length) {
    return (
      <button type="button" className={`tag badge owned${compact ? " dmark" : ""}`} title={`Free copies of this version are in ${exact[0]!.collectionName}. Link them.`}
        onClick={stop(() => linkExact(store, card))}>Owned, link</button>
    );
  }
  if (other.length) {
    return (
      <button type="button" className={`tag badge other${compact ? " dmark" : ""}`} title="You own another version of this card. Choose one to switch to."
        onClick={stop(() => switchVersionDialog(store, card))}>Other version owned</button>
    );
  }
  return null;
}

/**
 * Remove for one card: with one copy it is removed at once; with more the person chooses how many to remove, Reduce to 1
 * or Remove all.
 */
export function removeCard(store: Store, name: string, quantity: number, apply: (left: number) => void) {
  if (quantity <= 1) return apply(0);
  dialog(`Remove ${name}`, [["count", "How many to remove", "1", "number"]], (values) => {
    const count = Number(values.count);
    if (!Number.isInteger(count) || count < 1 || count > quantity) {
      store.flash(`Enter a number from 1 to ${quantity}`, "err");
      return false;
    }
    apply(quantity - count);
  }, "Remove", (
    <div className="choicerow">
      <span className="note">There are {quantity} copies.</span>
      <button type="button" className="btn" onClick={() => { closeDialog(); apply(1); }}>Reduce to 1</button>
      <button type="button" className="btn" onClick={() => { closeDialog(); apply(0); }}>Remove all</button>
    </div>
  ));
}
