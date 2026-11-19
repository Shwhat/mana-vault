// ---------- central work area: card search, collection and deck views ----------
import type { Action } from "../actions";
import { Icon } from "../icons";
import { sortDeck, useApp, zoneLabel } from "../store";
import { capitalize, type DeckCard, ZONES, type Zone } from "../types";

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
            placeholder="Search names, types and rules text, or filters such as t:dragon c:red mv>=4"
            aria-label="Search cards"
          />
          <kbd>/</kbd>
        </label>
        {onFilters && <button type="button" className={anyFilter ? "btn on" : "btn"} onClick={onFilters}>Filters</button>}
        {onFilters && <button type="button" className="btn" onClick={actions.scan?.run}>Scan</button>}
        <span className="phpos">{loading ? "Searching" : `${cards.length} ${cards.length === 1 ? "result" : "results"}`}</span>
      </div>
      {deck && (
        <div className="ctxbar">
          Building <b>{deck.name}</b>, {deck.mode === "theme" ? "Theme mode: the selected printing is kept" : "Normal mode: any printing counts"}.
          New cards go to <b>{zoneLabel(store.prefs.zone).toLowerCase()}</b>.
        </div>
      )}
      <div className="list" role="listbox" aria-label="Search results">
        {searchError && <div className="emptynote err">{searchError}</div>}
        {!searchError && !loading && cards.length === 0 && (
          <div className="empty">
            <Icon name="find" />
            <b>{catalogEmpty ? "The card database is empty" : anyFilter ? "No matching cards" : "No cards found"}</b>
            <span>{catalogEmpty ? "Use Update card database on the Database tab to load the card catalog." : "Try a different search or clear a filter."}</span>
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
            >
              <Thumb url={card.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{card.name}</b><span className="mana">{card.mana_cost}</span></div>
                <div className="rowsub">{card.type_line}</div>
                <div className="rowmeta">{card.set_name} <span className="badge">{card.set_code.toUpperCase()}</span> {card.collector_number} <span className={`rar ${card.rarity}`}>{capitalize(card.rarity)}</span></div>
              </div>
              <div className="rowact">
                <button type="button" className="btn small" title="Add to collection (Enter)" onClick={(event) => { event.stopPropagation(); void store.addToCollection(card.id, card.name); }}>+ Collection</button>
                {deck && <button type="button" className="btn small" title="Add to deck (Shift+Enter)" onClick={(event) => { event.stopPropagation(); void store.addToDeck(card.id, card.name); }}>+ Deck</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CollectionView() {
  const store = useApp();
  const { visibleCollection, collection, selection } = store;
  const total = (collection ?? []).reduce((sum, entry) => sum + entry.quantity, 0);
  return (
    <div className="view" id="view-collection">
      <div id="pagetabs">
        <span className="phname">My collection</span>
        <label className="searchbox">
          <Icon name="find" className="nicon" />
          <input value={store.collectionFilter} onChange={(event) => store.setCollectionFilter(event.target.value)} placeholder="Filter by card or set name" aria-label="Filter collection" />
        </label>
        <span className="phpos">{visibleCollection.length} entries, {total} cards</span>
      </div>
      <div className="list" role="listbox" aria-label="Collection">
        {collection === null && <div className="emptynote">Loading the collection</div>}
        {collection !== null && collection.length === 0 && (
          <div className="empty">
            <Icon name="collection" />
            <b>Nothing in your collection yet</b>
            <span>Search the card database and add the printings you own, or import a collection CSV.</span>
            <button type="button" className="btn primary" onClick={() => store.setView("cards")}>Search cards</button>
          </div>
        )}
        {visibleCollection.map((entry) => {
          const key = `${entry.id}:${entry.foil}`;
          const active = selection?.view === "collection" && selection.key === key;
          return (
            <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "row active" : "row"}
              onClick={() => store.select({ view: "collection", key, printingId: entry.id })}>
              <Thumb url={entry.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{entry.name}</b>{entry.foil ? <span className="badge foil">FOIL</span> : null}</div>
                <div className="rowmeta">{entry.set_name} <span className="badge">{entry.set_code.toUpperCase()}</span> {entry.collector_number} <span className={`rar ${entry.rarity}`}>{capitalize(entry.rarity)}</span></div>
              </div>
              <Quantity
                value={entry.quantity}
                name={entry.name}
                onChange={(quantity) => void store.setCollectionQuantity(entry, quantity)}
              />
              <button type="button" className="btn small icon-only" title={`Remove ${entry.name}`} aria-label={`Remove ${entry.name} from collection`}
                onClick={(event) => { event.stopPropagation(); void store.setCollectionQuantity(entry, 0); }}><Icon name="del" /></button>
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
      <span>Open a deck or create a new one to start building.</span>
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

export function DeckView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { deck, selection } = store;
  if (!deck) return <div className="view"><div id="pagetabs"><span className="phname">Deck</span></div><NoDeck actions={actions} /></div>;
  const total = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
  return (
    <div className="view" id="view-deck">
      <div id="pagetabs">
        <span className="phname">{deck.name}</span>
        <span className="phdesc">{capitalize(deck.format)}</span>
        <span className={deck.mode === "theme" ? "badge main" : "badge"}>{deck.mode === "theme" ? "Theme" : "Normal"}</span>
        <span className="phwhere">{deck.mode === "theme" ? "Each card keeps the exact printing you selected" : "Cards are tracked by name; any printing counts"}</span>
        <span className="phpos">{total} cards</span>
      </div>
      <div className="list" role="listbox" aria-label="Deck cards">
        {deck.cards.length === 0 && (
          <div className="empty">
            <Icon name="deck" />
            <b>This deck is empty</b>
            <span>Search for cards and use Add to deck, or import a decklist.</span>
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
              return (
                <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "row active" : "row"}
                  onClick={() => store.select({ view: "deck", key, printingId: card.card_id })}>
                  <Thumb url={card.image_url} />
                  <div className="rowmain">
                    <div className="rowtitle"><b>{card.name}</b><span className="mana">{card.mana_cost}</span></div>
                    <div className="rowsub">{card.type_line}</div>
                    <div className="rowmeta">{card.printing_id ? <>{card.set_name} <span className="badge">{card.set_code.toUpperCase()}</span> {card.collector_number}</> : "Any printing"}</div>
                  </div>
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
      </div>
    </div>
  );
}
