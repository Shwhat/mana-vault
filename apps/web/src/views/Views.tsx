// ---------- central work area: card search, collection and deck views ----------
import type { Action } from "../actions";
import { rowMenu } from "../components/ContextMenu";
import { linkDialog } from "../components/LibraryDialogs";
import { Icon } from "../icons";
import { sortDeck, useApp, zoneLabel } from "../store";
import { anyPrice, capitalize, copyLabel, type DeckCard, type DeckTab, money, pricesOf, ZONES, type Zone } from "../types";
import { StatsPanel } from "./StatsView";

export function Thumb({ url, small }: { url: string | null; small?: boolean }) {
  return url
    ? <img className={small ? "thumb-img sm" : "thumb-img"} src={url} alt="" loading="lazy" />
    : <span className={small ? "thumb-img sm none" : "thumb-img none"}>MV</span>;
}

export function CardsView({ actions, onFilters }: { actions: Record<string, Action>; onFilters?: () => void }) {
  const store = useApp();
  const { filters, cards, loading, searchError, selection, deck } = store;
  const anyFilter = store.filtersActive;
  const catalogEmpty = store.catalog?.printingCount === 0;
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
        <span className="phpos">{loading ? "Searching" : `${cards.length} ${cards.length === 1 ? "result" : "results"}`}</span>
      </div>
      <div className="list" role="listbox" aria-label="Search results">
        {searchError && <div className="emptynote err">{searchError}</div>}
        {!searchError && !loading && cards.length === 0 && (
          <div className="empty">
            <Icon name="find" />
            <b>{catalogEmpty ? "The card database is empty" : anyFilter ? "No matching cards" : "No cards found"}</b>

            {catalogEmpty && <button type="button" className="btn primary" onClick={actions.updateCatalog?.run} disabled={actions.updateCatalog?.disabled}>Update card database</button>}
          </div>
        )}
        {cards.map((card) => {
          const active = selection?.view === "cards" && selection.key === card.id;
          return (
            <div
              key={card.id}
              data-key={card.id}
              role="option"
              aria-selected={active}
              className={active ? "row active" : "row"}
              onClick={() => store.select({ view: "cards", key: card.id, printingId: card.id })}
              onDoubleClick={() => void store.addToCollection(card.id, card.name)}
              {...rowMenu(store, card.name, () => [
                { label: "Card page", run: () => store.setCardPage(card.id) },
                { label: "Add to collection", run: () => void store.addToCollection(card.id, card.name) },
                { label: "Add as proxy", run: () => void store.addToCollection(card.id, card.name, undefined, undefined, true) },
                { label: "Add to wishlist", run: () => void store.addToWishlist([{ cardId: card.id, foil: store.prefs.foil ? 1 : 0, condition: "NM", language: "en", proxy: false, quantity: 1 }], card.name) },
                !!deck && { label: `Add to ${deck.name}`, run: () => void store.addToDeck(card.id, card.name) },
                { label: "Add to trade (you get)", run: () => void store.getCard(card.id) },
              ])}
            >
              <Thumb url={card.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{card.name}</b><span className="mana">{card.mana_cost}</span></div>
                <div className="rowsub">{card.type_line}</div>
                <div className="rowmeta">{card.set_name}{" "}
                  <button type="button" className="tag badge" title={`Show only cards from ${card.set_name}`}
                    onClick={(event) => { event.stopPropagation(); store.setFilters({ set: card.set_code }); }}>{card.set_code.toUpperCase()}</button>{" "}
                  {card.collector_number}{" "}
                  <button type="button" className={`tag rar ${card.rarity}`} title={`Show only ${card.rarity} cards`}
                    onClick={(event) => { event.stopPropagation(); store.setFilters({ rarity: card.rarity }); }}>{capitalize(card.rarity)}</button>
                  {card.flavor_name && <span className="copylbl"> Also printed as {card.flavor_name}</span>}
                </div>
              </div>
              <span className="price">{money(anyPrice(pricesOf(card), store.prefs.currency), store.prefs.currency)}</span>
              <div className="rowact">
                <button type="button" className="btn small" title="Add to collection (Enter)" onClick={(event) => { event.stopPropagation(); void store.addToCollection(card.id, card.name); }}>+ Collection</button>
                <button type="button" className="btn small" title="Add to wishlist (W)" onClick={(event) => {
                  event.stopPropagation();
                  void store.addToWishlist([{ cardId: card.id, foil: store.prefs.foil ? 1 : 0, condition: "NM", language: "en", proxy: false, quantity: 1 }], card.name);
                }}>+ Wishlist</button>
                {deck && <button type="button" className="btn small" title="Add to deck (Shift+Enter)" onClick={(event) => { event.stopPropagation(); void store.addToDeck(card.id, card.name); }}>+ Deck</button>}
              </div>
            </div>
          );
        })}
      </div>
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
  return (["commander", "main", "sideboard"] as Zone[])
    .map((zone) => {
      const inZone = sorted.filter((card) => card.zone === zone);
      return { zone, cards: inZone, count: inZone.reduce((sum, card) => sum + card.quantity, 0) };
    })
    .filter((group) => group.cards.length);
}

function OwnershipTab({ actions }: { actions: Record<string, Action> }) {
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

export function DeckView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { deck, selection } = store;
  if (!deck) return <div className="view"><div id="pagetabs"><span className="phname">Deck</span></div><NoDeck actions={actions} /></div>;
  const total = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
  const tabs: Array<[DeckTab, string]> = [["cards", "Cards"], ["ownership", "Ownership"], ["stats", "Statistics"]];
  const currency = store.prefs.currency;
  return (
    <div className="view" id="view-deck">
      <div id="pagetabs">
        <span className="phname">{deck.name}</span>
        <span className="phdesc">{capitalize(deck.format)}</span>
        {deck.role === "member" && <span className="badge">Shared by {deck.owner?.name}</span>}
        {deck.role === "owner" && (deck.sharedWith?.length ?? 0) > 0 && <span className="badge">Shared with {deck.sharedWith!.map((person) => person.name).join(", ")}</span>}
        <div className="seg" role="tablist" aria-label="Deck view">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={store.deckTab === id} className={store.deckTab === id ? "on" : ""} onClick={() => store.setDeckTab(id)}>{label}</button>
          ))}
        </div>
        <span className="phpos">{total} cards{store.deckStats ? `, value ${money(store.deckStats.value, currency)}` : ""}
          {store.ownership && store.ownership.needed > 0 ? `, ${store.ownership.owned} owned` : ""}</span>
      </div>
      {store.deckTab === "ownership" && <OwnershipTab actions={actions} />}
      {store.deckTab === "stats" && <StatsPanel stats={store.deckStats} kind="deck" />}
      {store.deckTab === "cards" && <div className="list" role="listbox" aria-label="Deck cards">
        {deck.cards.length === 0 && (
          <div className="empty">
            <Icon name="deck" />
            <b>This deck is empty</b>
            <span className="btnrow">
              <button type="button" className="btn primary" onClick={() => store.setView("cards")}>Search cards</button>
              <button type="button" className="btn" onClick={actions.importDeck?.run}>Import decklist...</button>
            </span>
          </div>
        )}
        {zoneGroups(deck.cards).map((group) => (
          <div key={group.zone}>
            <div className="zonehead">{zoneLabel(group.zone)} <span>{group.count}</span></div>
            {group.cards.map((card) => {
              const key = String(card.entry_id);
              const active = selection?.view === "deck" && selection.key === key;
              const missing = card.missing ?? 0;
              return (
                <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "row active" : "row"}
                  onClick={() => store.select({ view: "deck", key, printingId: card.card_id })}
                  {...rowMenu(store, card.name, () => [
                    { label: "Card page", run: () => store.setCardPage(card.card_id) },
                    { label: "Link copies...", run: () => void linkDialog(store, card) },
                    missing > 0 && { label: "Add missing to wishlist", run: () => void store.addToWishlist([{ cardId: card.card_id, foil: 0, condition: "NM", language: "en", proxy: false, quantity: missing }], card.name) },
                    { label: "Remove from deck", run: () => void store.setDeckQuantity(card, 0) },
                  ])}>
                  <Thumb url={card.image_url} />
                  <div className="rowmain">
                    <div className="rowtitle"><b>{card.name}</b><span className="mana">{card.mana_cost}</span></div>
                    <div className="rowsub">{card.type_line}</div>
                    <div className="rowmeta">{card.set_name} <span className="badge">{card.set_code.toUpperCase()}</span> {card.collector_number}</div>
                    <div className="rowtags">
                      {(card.links ?? []).map((link) => (
                        <button key={`${link.collectionId}:${link.cardId}:${link.foil}:${link.condition}:${link.language}:${link.proxy ? 1 : 0}`} type="button" className="tag badge col"
                          title={`${link.quantity} from ${link.collectionName}${copyLabel(link) ? `, ${copyLabel(link)}` : ""}`}
                          onClick={(event) => { event.stopPropagation(); store.openCollection(link.collectionId); store.setView("collection"); }}>
                          {link.collectionName}{link.quantity > 1 ? ` ×${link.quantity}` : ""}</button>
                      ))}
                      {(card.links ?? []).some((link) => link.proxy) && <span className="badge proxy">PROXY</span>}
                      {missing > 0 && <span className="badge miss">Missing{missing < card.quantity ? ` ${missing}` : ""}</span>}
                      {missing > 0 && (
                        <button type="button" className="tag badge wish" title={`Add ${missing} ${card.name} to your wishlist`}
                          onClick={(event) => { event.stopPropagation(); void store.addToWishlist([{ cardId: card.card_id, foil: 0, condition: "NM", language: "en", proxy: false, quantity: missing }], card.name); }}>
                          + Wishlist</button>
                      )}
                    </div>
                  </div>
                  <button type="button" className="btn small icon-only" title={`Link copies of ${card.name}`} aria-label={`Link copies of ${card.name}`}
                    onClick={(event) => { event.stopPropagation(); void linkDialog(store, card); }}><Icon name="link" /></button>
                  <Quantity value={card.quantity} name={card.name} max={100} onChange={(quantity) => void store.setDeckQuantity(card, quantity)} />
                  <select className="zonesel" aria-label={`Move ${card.name} to zone`} value={card.zone}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => void store.moveDeckCard(card, event.target.value as Zone)}>
                    {ZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
                  </select>
                  <button type="button" className="btn small icon-only" title={`Remove ${card.name}`} aria-label={`Remove ${card.name} from deck`}
                    onClick={(event) => { event.stopPropagation(); void store.setDeckQuantity(card, 0); }}><Icon name="del" /></button>
                </div>
              );
            })}
          </div>
        ))}
      </div>}
    </div>
  );
}
