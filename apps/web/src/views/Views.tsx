// ---------- central work area: card search, collection and deck views ----------
import type { Action } from "../actions";
import type { FoundCard } from "../card-search";
import { CardResults, countLine } from "../components/CardResults";
import { LayoutRows, OptionsButton } from "../components/Options";
import { linkDialog } from "../components/LibraryDialogs";
import { Icon } from "../icons";
import { sortDeck, type Store, useApp, zoneLabel } from "../store";
import { copyLabel, type DeckCard, type DeckTab, money, ZONES, type Zone } from "../types";
import { StatsPanel } from "./StatsView";

export function Thumb({ url, small }: { url: string | null; small?: boolean }) {
  return url
    ? <img className={small ? "thumb-img sm" : "thumb-img"} src={url} alt="" loading="lazy" />
    : <span className={small ? "thumb-img sm none" : "thumb-img none"}>MV</span>;
}

/** The menu and buttons of a search result in card search. */
export function searchMenu(store: Store, card: FoundCard) {
  const wish = () => void store.addToWishlist([{ cardId: card.id, foil: store.prefs.foil ? 1 : 0, condition: "NM", language: "en", proxy: false, quantity: 1 }], card.name);
  return [
    { label: "Card page", run: () => store.setCardPage(card.id) },
    { label: "Add to collection", run: () => void store.addToCollection(card.id, card.name) },
    { label: "Add as proxy", run: () => void store.addToCollection(card.id, card.name, undefined, undefined, true) },
    { label: "Add to wishlist", run: wish },
    !!store.deck && { label: `Add to ${store.deck.name}`, run: () => void store.addToDeck(card.id, card.name) },
    { label: "Add to trade (you get)", run: () => void store.getCard(card.id) },
    { label: "Add to print list", run: () => void store.addToPrintList([{ card, count: 1 }], card.name) },
  ];
}

/** Layout and card size for search results. The deck's Add tab and the trade searches share them. */
export function SearchOptions() {
  const store = useApp();
  return (
    <OptionsButton title="Search options">
      <LayoutRows name="Search results" layout={store.searchLayout} size={store.prefs.searchSize} onLayout={store.setSearchLayout} onSize={(searchSize) => store.setPrefs({ searchSize })} />
    </OptionsButton>
  );
}

export function CardsView({ actions, onFilters }: { actions: Record<string, Action>; onFilters?: () => void }) {
  const store = useApp();
  const { filters, selection, deck, search } = store;
  const anyFilter = store.filtersActive;
  const catalogEmpty = store.catalog?.printingCount === 0;
  const add = (card: FoundCard) => void store.addToCollection(card.id, card.name);
  return (
    <div className="view" id="view-cards">
      <div id="pagetabs">
        <span className="phname">Card search</span>
        <label className="searchbox">
          <Icon name="find" className="nicon" />
          <input
            ref={(node) => { store.searchInput.current = node; }}
            value={filters.query}
            onChange={(event) => store.setFilters({ query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); store.moveSelection(1); (event.target as HTMLInputElement).blur(); }
              if (event.key === "Escape") (event.target as HTMLInputElement).blur();
            }}
            placeholder="Search cards"
            aria-label="Search cards"
          />
          <kbd>/</kbd>
        </label>
        {onFilters && <button type="button" className={anyFilter ? "btn on" : "btn"} onClick={onFilters}>Filters</button>}
        <SearchOptions />
        <span className="phpos">{countLine(search)}</span>
      </div>
      <CardResults
        search={search} layout={store.searchLayout} size={store.prefs.searchSize} label="Search results" resetKey={filters}
        activeId={selection?.view === "cards" ? selection.key : null}
        onPick={(card) => store.select({ view: "cards", key: card.id, printingId: card.id })}
        onOpen={add}
        menu={(card) => searchMenu(store, card)}
        onTag={(change) => store.setFilters(change)}
        buttons={(card) => (
          <>
            <button type="button" className="btn small" title="Add to collection (Enter)" onClick={(event) => { event.stopPropagation(); add(card); }}>+ Collection</button>
            <button type="button" className="btn small" title="Add to wishlist (W)" onClick={(event) => {
              event.stopPropagation();
              void store.addToWishlist([{ cardId: card.id, foil: store.prefs.foil ? 1 : 0, condition: "NM", language: "en", proxy: false, quantity: 1 }], card.name);
            }}>+ Wishlist</button>
            {deck && <button type="button" className="btn small" title="Add to deck (Shift+Enter)" onClick={(event) => { event.stopPropagation(); void store.addToDeck(card.id, card.name); }}>+ Deck</button>}
          </>
        )}
        empty={<>
          <b>{catalogEmpty ? "The card database is empty" : anyFilter ? "No matching cards" : "No cards found"}</b>
          {catalogEmpty && <button type="button" className="btn primary" onClick={actions.updateCatalog?.run} disabled={actions.updateCatalog?.disabled}>Update card database</button>}
        </>}
      />
    </div>
  );
}

export function Quantity({ value, name, onChange, max }: { value: number; name: string; onChange: (value: number) => void; max?: number }) {
  return (
    <span className="qty" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="btn small" aria-label={`Remove one ${name}`} onClick={() => onChange(value - 1)}>−</button>
      <span className="qn">{value}</span>
      <button type="button" className="btn small" aria-label={`Add one ${name}`} disabled={max !== undefined && value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

export function NoDeck({ actions, compact }: { actions: Record<string, Action>; compact?: boolean }) {
  return (
    <div className={compact ? "empty compact" : "empty"}>
      <Icon name="deck" />
      <b>No deck is open</b>
      <span className="btnrow">
        <button type="button" className="btn primary" onClick={actions.newDeck?.run}>New deck...</button>
        <button type="button" className="btn" onClick={actions.openDeck?.run}>Open deck...</button>
      </span>
    </div>
  );
}

export function zoneGroups(cards: DeckCard[]): Array<{ zone: Zone; cards: DeckCard[]; count: number }> {
  const sorted = sortDeck(cards);
  return (["commander", "main", "sideboard", "maybeboard"] as Zone[])
    .map((zone) => {
      const inZone = sorted.filter((card) => card.zone === zone);
      return { zone, cards: inZone, count: inZone.reduce((sum, card) => sum + card.quantity, 0) };
    })
    .filter((group) => group.cards.length);
}

export function OwnershipTab({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const report = store.ownership;
  if (!report) return <div className="emptynote">Checking which cards you own</div>;
  const currency = report.currency;
  const percent = report.needed ? Math.floor((report.owned / report.needed) * 1000) / 10 : 0;
  return (
    <div className="list compwrap">
      <div className="stattile">
        <div className="stlabel">Cards you own</div>
        <div className="stvalue">{percent}%</div>
        <div className="stsub">{report.owned} of {report.needed} owned, {report.missing} missing{report.missing ? `, ${money(report.missingValue, currency)} to buy` : ""}
          {report.unpriced ? ` (${report.unpriced} without a price)` : ""}</div>
        <span className="meter" role="meter" aria-label="Cards you own" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span className="meterfill" style={{ width: `${percent}%` }} /></span>
      </div>
      <div className="rulesline">
        <button type="button" className="btn small" disabled={!report.missing} onClick={actions["deck.missingWishlist"]?.run}>Add missing to wishlist</button>
        <button type="button" className="btn small" disabled={!report.missing} onClick={actions["deck.exportMissing"]?.run}>Export missing</button>
      </div>
      <div className="meterlist" role="table" aria-label="Deck ownership">
        <div className="mrow orow mhead" role="row"><span role="columnheader">Card</span><span role="columnheader">Owned</span><span role="columnheader">Where</span>
          <span role="columnheader" className="mnum">To buy</span></div>
        {report.entries.map((entry) => (
          <div className={`mrow orow${entry.missing ? "" : " done"}`} role="row" key={entry.entryId}
            onClick={() => store.select({ view: "deck", key: String(entry.entryId), printingId: entry.cardId })}>
            <span role="cell" className="mname">{entry.name}{entry.zone !== "main" && <span className="badge"> {zoneLabel(entry.zone)}</span>}</span>
            <span role="cell"><span className={entry.missing ? "badge" : "badge own"}>{entry.owned} of {entry.needed}</span></span>
            <span role="cell" className="sub">{entry.where.length ? entry.where.map((place) => `${place.name} (${place.quantity})`).join(", ") : "Missing"}{entry.proxies ? ` (${entry.proxies} proxy)` : ""}</span>
            <span role="cell" className="mnum">{entry.missing ? `${entry.missing} x ${money(entry.price, currency)}` : "Owned"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
