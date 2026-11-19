// ---------- dockable panels: filters, decks, card, deck list and import review ----------
import { useState } from "react";
import type { Action } from "../actions";
import { Icon } from "../icons";
import { useApp, zoneLabel } from "../store";
import { capitalize, FORMATS } from "../types";
import { NoDeck, Quantity, zoneGroups } from "../views/Views";

export function FiltersPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { filters } = store;
  const select = (key: "color" | "rarity" | "format", options: Array<[string, string]>) => (
    <select id={`flt-${key}`} value={filters[key]} onChange={(event) => { store.setFilters({ [key]: event.target.value }); store.setView("cards"); }}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  );
  const text = (key: "type" | "set", placeholder: string) => (
    <input id={`flt-${key}`} value={filters[key]} placeholder={placeholder} onChange={(event) => { store.setFilters({ [key]: event.target.value }); store.setView("cards"); }} />
  );
  return (
    <div className="pbody">
      <div className="pgrp">
        <h4>Card</h4>
        <div className="prow"><label htmlFor="flt-type">Type</label>{text("type", "Creature")}</div>
        <div className="prow"><label htmlFor="flt-set">Set code</label>{text("set", "lea")}</div>
        <div className="prow"><label htmlFor="flt-color">Color</label>{select("color", [["", "Any color"], ["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]])}</div>
        <div className="prow"><label htmlFor="flt-rarity">Rarity</label>{select("rarity", [["", "Any rarity"], ["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"], ["mythic", "Mythic"]])}</div>
        <div className="prow"><label htmlFor="flt-format">Legal in</label>{select("format", [["", "Any format"], ...FORMATS.filter((f) => f !== "casual").map((f): [string, string] => [f, capitalize(f)])])}</div>
      </div>
      <div className="pgrp">
        <h4>Mana value</h4>
        <div className="prow"><label htmlFor="flt-mvmin">From</label>
          <input id="flt-mvmin" type="number" min="0" max="100" step="0.5" value={filters.mvMin} placeholder="Min" onChange={(event) => { store.setFilters({ mvMin: event.target.value }); store.setView("cards"); }} /></div>
        <div className="prow"><label htmlFor="flt-mvmax">To</label>
          <input id="flt-mvmax" type="number" min="0" max="100" step="0.5" value={filters.mvMax} placeholder="Max" onChange={(event) => { store.setFilters({ mvMax: event.target.value }); store.setView("cards"); }} /></div>
      </div>
      <div className="btnrow"><button type="button" className="btn" disabled={actions.clearFilters?.disabled} onClick={actions.clearFilters?.run}>Clear filters</button></div>
      <p className="note">The search box also accepts filters: <code>t:</code> type, <code>c:</code> color, <code>o:</code> rules text, <code>set:</code>, <code>r:</code> rarity, <code>mv</code> with =, &lt;, &gt;, &lt;=, &gt;=, and <code>legal:</code> format. All filters must match.</p>
    </div>
  );
}

export function DecksPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const [term, setTerm] = useState("");
  const shown = store.decks.filter((deck) => deck.name.toLowerCase().includes(term.trim().toLowerCase()));
  return (
    <div className="pbody flush">
      <div className="navbar">
        <input className="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a deck" aria-label="Find a deck" />
        <button type="button" className="btn small" onClick={actions.newDeck?.run}>New...</button>
      </div>
      {store.decks.length === 0 && <p className="note pad">No decks yet. Use New deck to create one.</p>}
      {shown.map((deck) => (
        <div key={deck.id} className={store.deck?.id === deck.id ? "navitem active" : "navitem"} role="button" onClick={() => void store.openDeck(deck.id)}
          onDoubleClick={() => store.setView("deck")}>
          <span className="nl">{deck.name}</span>
          <span className={deck.mode === "theme" ? "badge main" : "badge"}>{deck.mode === "theme" ? "Theme" : "Normal"}</span>
          <span className="cnt">{deck.card_count ?? 0}</span>
        </div>
      ))}
      {store.decks.length > 0 && <p className="note pad">Click a deck to open it. Double-click to show it in the work area.</p>}
    </div>
  );
}

export function CardPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const card = store.cardDetail;
  if (!card) return <div className="pbody"><p className="note">Select a card in a list to see its details here.</p></div>;
  const owned = card.owned;
  return (
    <div className="pbody">
      {card.image_url && <img className="cardimg" src={card.image_url} alt={card.name} />}
      <div className="ident">{card.name}</div>
      <div className="sub">{card.type_line}</div>
      <div className="btnrow">
        <button type="button" className="btn primary" onClick={actions.addCollection?.run}>Add to collection</button>
        <button type="button" className="btn" disabled={!store.deck} onClick={actions.addDeck?.run}>Add to deck</button>
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
      </div>
      <div className="pgrp">
        <h4>Owned</h4>
        <div className="prow"><label>This printing</label><span>{owned.regular} regular, {owned.foil} foil</span></div>
        <div className="prow"><label>All printings</label><span>{owned.allPrintings}</span></div>
      </div>
    </div>
  );
}

export function DeckListPanel({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { deck } = store;
  if (!deck) return <div className="pbody"><NoDeck actions={actions} compact /></div>;
  const total = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
  return (
    <div className="pbody flush">
      <div className="dlhead">
        <div className="ident">{deck.name}</div>
        <div className="sub">{capitalize(deck.format)}, {deck.mode === "theme" ? "Theme" : "Normal"} mode, {total} cards</div>
        <div className="seg" role="group" aria-label="Target zone">
          {(["zone.main", "zone.sideboard", "zone.commander"] as const).map((id) => (
            <button key={id} type="button" className={actions[id]?.on ? "on" : ""} onClick={actions[id]?.run}>{actions[id]?.short}</button>
          ))}
        </div>
      </div>
      {deck.cards.length === 0 && <p className="note pad">This deck is empty. Select a card and press Shift+Enter, or use Add to deck.</p>}
      {zoneGroups(deck.cards).map((group) => (
        <div key={group.zone}>
          <div className="navgroup">{zoneLabel(group.zone)} <span className="cnt">{group.count}</span></div>
          {group.cards.map((card) => {
            const key = String(card.entry_id);
            const active = store.selection?.view === "deck" && store.selection.key === key;
            return (
              <div key={key} className={active ? "dlrow active" : "dlrow"} onClick={() => store.select({ view: "deck", key, printingId: card.card_id })}>
                <span className="num">{card.quantity}</span>
                <span className="nl">{card.name}</span>
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
  if (!review) return <div className="pbody"><p className="note">After you preview or run an import, rows that did not match a card are listed here.</p></div>;
  return (
    <div className="pbody flush">
      <div className="revhead">
        <b>{review.title}</b>
        <span className="sub">{review.done ? "Imported" : "Preview"}: {review.report.matchedRows} matched rows ({review.report.importedQuantity} cards), {review.report.unmatched.length} skipped</span>
        <button type="button" className="btn small" onClick={() => store.setReview(null)}>Clear</button>
      </div>
      {review.report.unmatched.length === 0 && <p className="note pad">Every row matched a card.</p>}
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
