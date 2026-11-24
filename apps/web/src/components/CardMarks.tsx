// ---------- card marks shared by every view: finish badges, Upgrade wanted, owned versions of missing cards, Remove how many ----------
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { type Store, useApp } from "../store";
import { type Candidate, type DeckCard, type FinishCode, type InOtherDeck, copyLabel, finishLabel, money } from "../types";
import { request } from "../api";
import { closeDialog, confirmDialog, customDialog, dialog } from "./Dialog";
import { apiUrl } from "../android/platform";

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
export function UpgradeBadge({ card, className = "", compact = false }: { card: DeckCard; className?: string; compact?: boolean }) {
  if (!card.want_card_id) return null;
  return <span className={`badge upgrade${className ? ` ${className}` : ""}`} title={`Upgrade wanted: ${wantedLabel(card)}`}>{compact ? "UPGRADE" : "Upgrade wanted"}</span>;
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
        onClick={stop(() => linkExact(store, card))}>{compact ? "OWNED" : "Owned, link"}</button>
    );
  }
  if (other.length) {
    return (
      <button type="button" className={`tag badge other${compact ? " dmark" : ""}`} title="You own another version of this card. Choose one to switch to."
        aria-label="Other version owned" onClick={stop(() => switchVersionDialog(store, card))}>{compact ? "OTHER" : "Other version owned"}</button>
    );
  }
  return null;
}

/**
 * In Deck A (0.17.0): a missing card whose copies all fill other decks names those decks; Move to this deck unlinks a
 * copy from the other deck (which then misses it) and links it here, as one undo step.
 */
export function InDeckMarks({ store, card, compact = false }: { store: Store; card: DeckCard; compact?: boolean }) {
  if ((card.missing ?? 0) <= 0 || card.zone === "maybeboard" || !card.inDecks?.length) return null;
  const { exact, other } = ownedVersions(card);
  if (exact.length || other.length) return null;
  const names = [...new Set(card.inDecks.map((item) => item.deckName))];
  return (
    <>
      {names.map((name) => (
        <button key={name} type="button" className={`tag badge indeck${compact ? " dmark" : ""}`} title={`Your copy fills ${name}. Move it to this deck`}
          onClick={(event) => { event.stopPropagation(); moveToDeckDialog(store, card); }}>{compact ? `IN ${name.toUpperCase()}` : `In ${name}`}</button>
      ))}
    </>
  );
}

/** Lists the copies of a card that fill other decks, each with Move to this deck. */
export function moveToDeckDialog(store: Store, card: DeckCard) {
  const deckId = store.deck?.id;
  if (!deckId || !card.inDecks?.length) return;
  const move = async (item: InOtherDeck, close: () => void) => {
    try {
      const result = await request<{ moved: number; linkId: number | null; from: { deckId: string; deckName: string; entryId: number } }>(
        `/api/decks/${encodeURIComponent(deckId)}/entries/${card.entry_id}/take`, { method: "POST", body: JSON.stringify({ linkId: item.linkId }) });
      close();
      store.pushUndo({
        label: `Move ${card.name} from ${item.deckName}`,
        undo: async () => {
          if (result.linkId) await request(`/api/decks/${encodeURIComponent(result.from.deckId)}/entries/${result.from.entryId}/take`, { method: "POST", body: JSON.stringify({ linkId: result.linkId, quantity: result.moved }) });
          await store.refreshAfterChange();
        },
        redo: async () => { store.flash("Move the copy again from the deck card", "err"); },
      });
      await store.refreshAfterChange();
      store.flash(`${card.name} moved from ${item.deckName} to this deck. ${item.deckName} now misses it`);
    } catch (reason) {
      store.fail(reason, "Could not move the copy.");
    }
  };
  customDialog(`${card.name} in other decks`, (close) => (
    <div className="versionlist">
      <p className="note">Moving a copy here makes the other deck miss it.</p>
      {card.inDecks!.map((item) => (
        <div key={item.linkId} className="row versionrow">
          <div className="rowmain">
            <div className="rowtitle"><b>{item.deckName}</b> <span className="sub">({item.set_code.toUpperCase()}) {item.collector_number}</span><FinishBadge finish={item.foil} /></div>
            <div className="rowmeta">{item.quantity} from {item.collectionName}</div>
          </div>
          <button type="button" className="btn small primary" onClick={() => void move(item, close)}>Move to this deck</button>
        </div>
      ))}
    </div>
  ), 520);
}

/**
 * Remove for one card: with one copy it is removed at once; with more the person chooses how many to remove, Reduce to 1
 * or Remove all.
 */
export function removeCard(store: Store, name: string, quantity: number, apply: (left: number) => void, note = "") {
  if (quantity <= 1 && !note) return apply(0);
  if (quantity <= 1) {
    void confirmDialog(`Remove ${name}`, <>Remove {name}? {note}</>, "Remove").then((yes) => { if (yes) apply(0); });
    return;
  }
  dialog(`Remove ${name}`, [["count", "How many to remove", "1", "number"]], (values) => {
    const count = Number(values.count);
    if (!Number.isInteger(count) || count < 1 || count > quantity) {
      store.flash(`Enter a number from 1 to ${quantity}`, "err");
      return false;
    }
    apply(quantity - count);
  }, "Remove", (
    <div className="choicerow">
      <span className="note">There are {quantity} copies.{note ? ` ${note}` : ""}</span>
      <button type="button" className="btn" onClick={() => { closeDialog(); apply(1); }}>Reduce to 1</button>
      <button type="button" className="btn" onClick={() => { closeDialog(); apply(0); }}>Remove all</button>
    </div>
  ));
}

/** The count in a picture's pip bar, when more than one copy is shown. Used by every picture view. */
export function CountPip({ count }: { count: number }) {
  return count > 1 ? <span className="badge pipcount" title={`${count} copies`}>{count}x</span> : null;
}

/**
 * The pip bar under a card picture (0.15.0): the count, finish, copy details, deck marks and the price sit here instead
 * of on the picture, so nothing covers the card. In the deck's Stacks view the bar sits above each card, where it stays
 * in view while the cards overlap.
 */
export function PipBar({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="pipbar" aria-label={label}>{children}</div>;
}

/**
 * The finish of one line under a card picture as a pip: FOIL, ETCHED, a special foil, or REGULAR. Lines appear only
 * when a picture stands for more than one kind of copy.
 */
export function FinishPip({ finish, promoTypes }: { finish: FinishCode | number | undefined | null; promoTypes?: string | null }) {
  const code = Number(finish ?? 0);
  return code === 1 || code === 2 ? <FinishBadge finish={code} promoTypes={promoTypes} /> : <span className="badge regular">REGULAR</span>;
}

/**
 * The price pip of a card picture, placed by the card layout and shown when View, Prices on pictures is on. The price is for the
 * copy's finish where there is one, in the chosen currency. Used by every picture view.
 */
export function PricePip({ price }: { price: number | null | undefined }) {
  const store = useApp();
  if (!store.prefs.pricesOnPictures || price === null || price === undefined) return null;
  // where the price sits is set by the card layout (0.18.0)
  return <span className="pricepip" title="Price">{money(price, store.prefs.currency)}</span>;
}

/** A set's symbol (its Scryfall symbol, or a custom set's own), hidden when the set has none. */
export function SetIcon({ code, big = false, symbolUrl }: { code: string; big?: boolean; symbolUrl?: string | null }) {
  return <img className={big ? "setico big" : "setico"} src={apiUrl(symbolUrl ?? `/api/set-symbols/${encodeURIComponent(code.toLowerCase())}`)} alt="" loading="lazy"
    onError={(event) => { event.currentTarget.style.display = "none"; }} />;
}

/** The language of a printing other than English, as a pip (JA, DE, PH...). */
export function LanguagePip({ lang }: { lang?: string | null }) {
  if (!lang || lang === "en") return null;
  return <span className="badge langpip" title={`Printed in ${lang.toUpperCase()}`}>{lang.toUpperCase()}</span>;
}

/** A printing Scryfall removed: the copy keeps its name, and Change printing moves it to another printing. */
export function RemovedPip({ onChange }: { onChange: () => void }) {
  return <button type="button" className="badge removedpip" title="Scryfall removed this printing. Change printing..."
    onClick={(event) => { event.stopPropagation(); onChange(); }}>Printing removed</button>;
}
