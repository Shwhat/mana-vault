// ---------- trade view: the trade list and the trade calculator ----------
import { useState } from "react";
import type { Action } from "../actions";
import { Icon } from "../icons";
import { type TradeLine, useApp } from "../store";
import { copyLabel, money, priceOf } from "../types";
import { Quantity, Thumb } from "./Views";

function Side({ side, title, empty }: { side: "give" | "get"; title: string; empty: string }) {
  const store = useApp();
  const currency = store.prefs.currency;
  const lines: TradeLine[] = store.trade[side];
  return (
    <section className="tradeside" aria-label={title}>
      <div className="tradehead"><b>{title}</b><span className="tradesum">{money(store.tradeTotal(side), currency)}</span></div>
      {lines.length === 0 && <p className="note pad">{empty}</p>}
      {lines.map((line) => {
        const price = priceOf(line.prices, line.foil, currency);
        return (
          <div className="dlrow tradeline" key={line.id}>
            <span className="nl">{line.name} <span className="badge">{line.set_code.toUpperCase()}</span> {line.collector_number}
              {line.foil > 0 && <span className="badge foil">{line.foil === 2 ? "ETCHED" : "FOIL"}</span>}
              {line.from && <span className="sub"> from {line.from}</span>}</span>
            <span className="price" title={price === null ? "No price in the card database" : `${money(price, currency)} each`}>{money(price === null ? null : price * line.quantity, currency)}</span>
            <Quantity value={line.quantity} name={line.name} max={999} onChange={(quantity) => store.setTradeQuantity(side, line.id, quantity)} />
          </div>
        );
      })}
    </section>
  );
}

function Calculator({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const currency = store.prefs.currency;
  const give = store.tradeTotal("give");
  const get = store.tradeTotal("get");
  const difference = get - give;
  const unpriced = [...store.trade.give, ...store.trade.get].filter((line) => priceOf(line.prices, line.foil, currency) === null).length;
  return (
    <div className="tradecalc">
      <div className="stattile">
        <div className="stlabel">Difference</div>
        <div className="stvalue">{money(Math.abs(difference), currency)}</div>
        <div className="stsub">{!store.trade.give.length && !store.trade.get.length ? "Add cards to both sides to compare them"
          : difference === 0 ? "An even trade" : difference > 0 ? "In your favor: you get more than you give" : "In their favor: you give more than you get"}
          {unpriced ? `. ${unpriced} ${unpriced === 1 ? "line has" : "lines have"} no price and count as nothing` : ""}</div>
      </div>
      <div className="btnrow">
        <button type="button" className="btn" disabled={actions["trade.copy"]?.disabled} onClick={actions["trade.copy"]?.run}>Copy trade summary</button>
        <button type="button" className="btn" disabled={actions["trade.clear"]?.disabled} onClick={actions["trade.clear"]?.run}>Clear trade...</button>
      </div>
      <div className="tradesides">
        <Side side="give" title="You give" empty="Use Give on your trade list, or select a row in a collection and press T." />
        <Side side="get" title="You get" empty="Select a card in Card search and press G, or use Add to trade (you get)." />
      </div>
    </div>
  );
}

function TradeList() {
  const store = useApp();
  const currency = store.prefs.currency;
  const list = store.tradeList;
  const [term, setTerm] = useState("");
  const shown = (list ?? []).filter((entry) => `${entry.name} ${entry.set_name} ${entry.collection_name}`.toLowerCase().includes(term.trim().toLowerCase()));
  const total = (list ?? []).reduce((sum, entry) => sum + (priceOf(entry, entry.foil, currency) ?? 0) * entry.trade, 0);
  return (
    <section className="tradelist" aria-label="Your trade list">
      <div className="filterbar">
        <b>Your trade list</b>
        <input className="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a card" aria-label="Find a card on the trade list" />
        <span className="phpos">{(list ?? []).reduce((sum, entry) => sum + entry.trade, 0)} cards, {money(total, currency)}</span>
      </div>
      <div className="list" role="listbox" aria-label="Trade list">
        {list === null && <div className="emptynote">Loading the trade list</div>}
        {list !== null && list.length === 0 && (
          <div className="empty">
            <Icon name="trade" />
            <b>Nothing is marked for trade</b>
          </div>
        )}
        {shown.map((entry) => {
          const price = priceOf(entry, entry.foil, currency);
          const label = copyLabel(entry);
          return (
            <div key={`${entry.collection_id}:${entry.id}:${entry.foil}:${entry.condition}:${entry.language}`} className="row" role="option" aria-selected={false}
              onClick={() => store.select({ view: "cards", key: `trade:${entry.id}`, printingId: entry.id })}>
              <Thumb url={entry.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{entry.name}</b>{entry.foil > 0 && <span className="badge foil">{entry.foil === 2 ? "ETCHED" : "FOIL"}</span>}
                  <span className="badge trade">{entry.trade} of {entry.quantity}</span></div>
                <div className="rowmeta">{entry.set_name} <span className="badge">{entry.set_code.toUpperCase()}</span> {entry.collector_number}
                  {label && <span className="copylbl"> {label}</span>} <span className="sub">in {entry.collection_name}</span></div>
              </div>
              <span className="price">{money(price, currency)}</span>
              <button type="button" className="btn small" title="Add one copy to what you give" onClick={(event) => { event.stopPropagation(); store.giveEntry(entry, entry.collection_name); }}>Give</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TradeView({ actions }: { actions: Record<string, Action> }) {
  return (
    <div className="view" id="view-trade">
      <div id="pagetabs">
        <span className="phname">Trade</span>
      </div>
      <div className="tradegrid">
        <TradeList />
        <Calculator actions={actions} />
      </div>
    </div>
  );
}
