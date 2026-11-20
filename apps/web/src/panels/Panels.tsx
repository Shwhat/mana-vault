// ---------- dockable panels: filters, decks, card, deck list and import review ----------
import { useState } from "react";
import type { Action } from "../actions";
import { Icon } from "../icons";
import { useApp, zoneLabel } from "../store";
import { capitalize, type Deck, type Filters, FORMATS, formatName, money, type OwnedIn } from "../types";
import { collectionMenu, deckMenu } from "../components/ItemMenus";
import { choices, Picker } from "../components/Picker";
import { SCOPE_NAMES } from "../filters";
import { Meter } from "../views/CollectionView";
import { NoDeck, Quantity, zoneGroups } from "../views/Views";
import { cardMenu } from "../views/DeckView";
import { FinishBadge, UpgradeBadge } from "../components/CardMarks";
import { AddButtons } from "../components/AddButtons";
import { entryKey } from "../library-state";

/** The Filters panel: it filters the open view (card search, the collection, the deck or a search inside it); each keeps its own filters. */
export function FiltersPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const filters = store.scopeFilters;
  const set = (change: Partial<Filters>) => store.setScopeFilters(change);
  const pick = (key: "color" | "rarity" | "format", options: Array<[string, string]>, label: string) => (
    <Picker id={`flt-${key}`} label={label} value={filters[key]} onChange={(value) => set({ [key]: value })} options={choices(options)} />
  );
  const text = (key: "type" | "set", placeholder: string) => (
    <input id={`flt-${key}`} value={filters[key]} placeholder={placeholder} onChange={(event) => set({ [key]: event.target.value })} />
  );
  return (
    <div className="pbody">
      <div className="fltscope" role="status">Filtering: <b>{SCOPE_NAMES[store.filterScope]}</b></div>
      <div className="pgrp">
        <h4>Card</h4>
        <div className="prow"><label htmlFor="flt-type">Type</label>{text("type", "Creature")}</div>
        <div className="prow"><label htmlFor="flt-set">Set code</label>{text("set", "lea")}</div>
        <div className="prow"><label htmlFor="flt-color">Color</label>{pick("color", [["", "Any color"], ["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]], "Color")}</div>
        <div className="prow"><label htmlFor="flt-rarity">Rarity</label>{pick("rarity", [["", "Any rarity"], ["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"], ["mythic", "Mythic"]], "Rarity")}</div>
        <div className="prow"><label htmlFor="flt-format">Legal in</label>{pick("format", [["", "Any format"], ...FORMATS.filter((f) => f !== "casual").map((f): [string, string] => [f, formatName(f)])], "Legal in")}</div>
      </div>
      <div className="pgrp">
        <h4>Mana value</h4>
        <div className="prow"><label htmlFor="flt-mvmin">From</label>
          <input id="flt-mvmin" type="number" min="0" max="100" step="0.5" value={filters.mvMin} placeholder="Min" onChange={(event) => set({ mvMin: event.target.value })} /></div>
        <div className="prow"><label htmlFor="flt-mvmax">To</label>
          <input id="flt-mvmax" type="number" min="0" max="100" step="0.5" value={filters.mvMax} placeholder="Max" onChange={(event) => set({ mvMax: event.target.value })} /></div>
      </div>
      <div className="btnrow"><button type="button" className="btn" disabled={actions.clearFilters?.disabled} onClick={actions.clearFilters?.run}>Clear filters</button></div>
    </div>
  );
}

export function CollectionsPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const list = store.collections ?? [];
  return (
    <div className="pbody flush">
      <div className="navbar">
        <span className="sub grow">{list.length} {list.length === 1 ? "collection" : "collections"}</span>
        <button type="button" className="btn small" onClick={actions["collection.new"]?.run}>New...</button>
      </div>
      {store.collections !== null && list.length === 0 && <p className="note pad">No collections yet</p>}
      {list.map((item) => {
        // the collection selected last is where new cards go; with a deck selected last no collection is highlighted
        const selected = store.prefs.addTo === "collection" && store.prefs.targetCollection === item.id;
        return (
          <div key={item.id} className={selected ? "navitem colitem active" : "navitem colitem"} role="button" aria-current={selected || undefined}
            onClick={() => { store.openCollection(item.id); store.setView("collection"); }} {...collectionMenu(store, item)}>
            <span className="colline">
              <span className="nl">{item.name}</span>
              {store.prefs.targetCollection === item.id && (
                <span className={selected ? "target-mark strong" : "target-mark"} title={selected ? "Enter and + Add put cards here" : "+ Add to collection puts cards here"}>
                  {selected ? "Adding here" : "Target"}</span>
              )}
              {item.kind === "wishlist" && <span className="badge wish" title="Cards here are wanted, not owned">Wishlist</span>}
              {item.role === "member" && <span className="badge" title={`Shared by ${item.owner.name}`}>Shared</span>}
              {item.role === "owner" && item.sharedWith.length > 0 && <span className="badge" title={`Shared with ${item.sharedWith.map((person) => person.name).join(", ")}`}>Shared</span>}
            </span>
            <span className="colline sub">
              <span className="cnt">{item.cardCount} cards, {money(item.value[store.prefs.currency], store.prefs.currency)}</span>
              {item.progress && <><Meter owned={item.progress.owned} total={item.progress.total} label={`${item.name} completion`} />
                <span className="cnt">{item.progress.total ? Math.floor((item.progress.owned / item.progress.total) * 100) : 0}%</span></>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Decks grouped by format in the order of the format list, Casual last; each group keeps the list's order. */
export function deckGroups(decks: Deck[]): Array<[string, Deck[]]> {
  const groups = new Map<string, Deck[]>();
  for (const deck of decks) groups.set(deck.format, [...(groups.get(deck.format) ?? []), deck]);
  const order: readonly string[] = FORMATS;
  const rank = (format: string) => (format === "casual" ? order.length : order.includes(format) ? order.indexOf(format) : order.length - 1);
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
}

export function DecksPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const [term, setTerm] = useState("");
  const words = term.trim().toLowerCase();
  const shown = store.decks.filter((deck) => `${deck.name} ${deck.commander ?? ""}`.toLowerCase().includes(words));
  return (
    <div className="pbody flush">
      <div className="navbar">
        <input className="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a deck" aria-label="Find a deck" />
        <button type="button" className="btn small" onClick={actions.newDeck?.run}>New...</button>
      </div>
      {store.decks.length === 0 && <p className="note pad">No decks yet</p>}
      {deckGroups(shown).map(([format, decks]) => (
        <div key={format} role="group" aria-label={formatName(format)}>
          <div className="navgroup">{formatName(format)} <span className="cnt">{decks.length}</span></div>
          {decks.map((deck) => {
            // the deck selected last is where new cards go; with a collection selected last no deck is highlighted
            const selected = store.prefs.addTo === "deck" && store.deck?.id === deck.id;
            return (
              <div key={deck.id} className={selected ? "navitem colitem active" : "navitem colitem"} role="button" aria-current={selected || undefined}
                title={[deck.commander, formatName(deck.format)].filter(Boolean).join(", ")}
                onClick={() => void store.openDeck(deck.id).then(() => store.setView("deck"))} {...deckMenu(store, deck)}>
                <span className="colline">
                  <span className="nl">{deck.name}</span>
                  {store.deck?.id === deck.id && (
                    <span className={selected ? "target-mark strong" : "target-mark"} title={selected ? "Enter and + Add put cards here" : "+ Add to deck puts cards here"}>
                      {selected ? "Adding here" : "Target"}</span>
                  )}
                  {(deck.role === "member" || (deck.sharedWith?.length ?? 0) > 0) && <span className="badge">Shared</span>}
                </span>
                <span className="colline sub">
                  <span className="cnt">{deck.card_count ?? 0} cards, {money(deck.value?.[store.prefs.currency] ?? 0, store.prefs.currency)}</span>
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function CardPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const card = store.cardDetail;
  if (!card) return <div className="pbody"><p className="note">No card selected</p></div>;
  const owned = card.owned;
  const currency = store.prefs.currency;
  const prices = card.prices;
  const copies = (item: Pick<OwnedIn, "regular" | "foil" | "etched">) =>
    [`${item.regular} regular`, `${item.foil} foil`, ...(item.etched ? [`${item.etched} etched`] : [])].join(", ");
  // the deck card or collection copy selected, for its finish
  const pickedDeckCard = store.selection?.view === "deck" ? store.deck?.cards.find((item) => String(item.entry_id) === store.selection!.key) : undefined;
  const pickedEntry = store.selection?.view === "collection" ? store.collection?.find((item) => entryKey(item) === store.selection!.key) : undefined;
  return (
    <div className="pbody">
      {card.image_url && <img className="cardimg" src={card.image_url} alt={card.name} />}
      <div className="ident">{card.name} <FinishBadge finish={pickedDeckCard?.finish ?? pickedEntry?.foil} />{pickedDeckCard && <UpgradeBadge card={pickedDeckCard} />}</div>
      <div className="sub">{card.type_line}</div>
      <div className="btnrow">
        <AddButtons store={store} card={card} large />
        <button type="button" className="btn" onClick={actions["wishlist.add"]?.run}>Add to wishlist</button>
        <button type="button" className="btn" onClick={actions["trade.get"]?.run}>You get</button>
      </div>
      <div className="pgrp">
        <h4>Card</h4>
        <div className="prow"><label>Mana cost</label><span>{card.mana_cost || "None"}</span></div>
        <div className="prow"><label>Mana value</label><span>{card.mana_value ?? 0}</span></div>
        {card.oracle_text && <div className="oracle">{card.oracle_text}</div>}
      </div>
      <div className="pgrp">
        <h4>Printing</h4>
        <div className="prow"><label>Set</label><span>{card.set_name} ({card.set_code.toUpperCase()})</span></div>
        <div className="prow"><label>Number</label><span>{card.collector_number}</span></div>
        <div className="prow"><label>Rarity</label><span>{capitalize(card.rarity)}</span></div>
        {card.artist && <div className="prow"><label>Artist</label><span>{card.artist}</span></div>}
        {card.released_at && <div className="prow"><label>Released</label><span>{card.released_at}</span></div>}
        {card.flavor_name && <div className="prow"><label>Also printed as</label><span>{card.flavor_name}</span></div>}
      </div>
      <div className="pgrp">
        <h4>Prices</h4>
        <div className="prow"><label>Regular</label><span>{money(currency === "usd" ? prices?.usd : prices?.eur, currency)}</span></div>
        <div className="prow"><label>Foil</label><span>{money(currency === "usd" ? prices?.usd_foil : prices?.eur_foil, currency)}</span></div>
        {currency === "usd" && prices?.usd_etched !== null && prices?.usd_etched !== undefined && (
          <div className="prow"><label>Etched</label><span>{money(prices.usd_etched, currency)}</span></div>)}
        {card.pricesUpdatedAt && <p className="note">{new Date(card.pricesUpdatedAt).toLocaleDateString()}</p>}
      </div>
      <div className="pgrp">
        <h4>Owned</h4>
        <div className="prow"><label>This printing</label><span>{copies(owned)}</span></div>
        <div className="prow"><label>All printings</label><span>{owned.allPrintings}</span></div>
        {owned.collections.map((item) => (
          <div className="prow" key={item.id}><label title={item.name}>{item.name}</label>
            <span>{item.regular || item.foil || item.etched ? copies(item) : "Other printings only"}
              {item.allPrintings > item.regular + item.foil + item.etched ? ` (${item.allPrintings} with other printings)` : ""}{item.trade ? `, ${item.trade} for trade` : ""}</span></div>
        ))}
        {!owned.collections.length && <p className="note">Not owned</p>}
        {card.wanted.map((item) => (
          <div className="prow" key={item.id}><label title={item.name}>{item.name}</label><span>Wanted: {item.allPrintings} {item.allPrintings === 1 ? "copy" : "copies"} (wishlist)</span></div>
        ))}
      </div>
    </div>
  );
}

export function DeckListPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { deck } = store;
  if (!deck) return <div className="pbody"><NoDeck actions={actions} compact /></div>;
  const total = deck.cards.filter((card) => card.zone === "main" || card.zone === "commander").reduce((sum, card) => sum + card.quantity, 0);
  return (
    <div className="pbody flush">
      <div className="dlhead">
        <div className="ident">{deck.name}</div>
        <div className="sub">{formatName(deck.format)}, {total} cards</div>
        <div className="seg" role="group" aria-label="Target zone">
          {(["zone.main", "zone.sideboard", "zone.commander", "zone.maybeboard"] as const).map((id) => (
            <button key={id} type="button" className={actions[id]?.on ? "on" : ""} onClick={actions[id]?.run}>{actions[id]?.short}</button>
          ))}
        </div>
      </div>
      {deck.cards.length === 0 && <p className="note pad">This deck is empty</p>}
      {zoneGroups(deck.cards).map((group) => (
        <div key={group.zone}>
          <div className="navgroup">{zoneLabel(group.zone)} <span className="cnt">{group.count}</span></div>
          {group.cards.map((card) => {
            const key = String(card.entry_id);
            const active = store.selection?.view === "deck" && store.selection.key === key;
            return (
              <div key={key} className={active ? "dlrow active" : "dlrow"} onClick={() => store.select({ view: "deck", key, printingId: card.card_id })} {...cardMenu(store, card)}>
                <span className="num">{card.quantity}</span>
                <span className="nl">{card.name}</span>
                <FinishBadge finish={card.finish} /><UpgradeBadge card={card} />
                {(card.missing ?? 0) > 0 && <span className="badge miss" title={`${card.missing} missing`}>Missing</span>}
                <Quantity value={card.quantity} name={card.name} max={100} onChange={(quantity) => void store.setDeckQuantity(card, quantity)} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function ReviewPanel() {
  const store = useApp();
  const { review } = store;
  if (!review) return <div className="pbody"><p className="note">No import yet</p></div>;
  return (
    <div className="pbody flush">
      <div className="revhead">
        <b>{review.title}</b>
        <span className="sub">{review.done ? "Imported" : "Preview"}: {review.report.matchedRows} matched lines ({review.report.importedQuantity} cards), {review.report.unmatched.length} skipped</span>
        <button type="button" className="btn small" onClick={() => store.setReview(null)}>Clear</button>
      </div>
      {review.report.unmatched.length === 0 && <p className="note pad">Every row matched</p>}
      {review.report.unmatched.map((item) => (
        <div className="msg" key={`${item.row}-${item.name}`}>
          <span className="lv w">Skipped</span>
          <span className="rown">Row {item.row}</span>
          <span>{item.name ? <b>{item.name}: </b> : null}{item.reason}</span>
        </div>
      ))}
    </div>
  );
}

export function PanelIcon({ name }: { name: string }) {
  return <Icon name={name} className="nicon" />;
}
