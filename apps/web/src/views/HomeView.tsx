// ---------- home: totals, recent scans and the Inbox ----------
import type { Action } from "../actions";
import { Icon } from "../icons";
import { useApp } from "../store";
import { money } from "../types";
import { Thumb } from "./Views";

export function HomeView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const currency = store.prefs.currency;
  const owned = (store.collections ?? []).filter((item) => item.kind === "collection");
  const cards = owned.reduce((sum, item) => sum + item.cardCount, 0);
  const value = owned.reduce((sum, item) => sum + item.value[currency], 0);
  const recent = store.scanItems.slice(0, 6);
  const offers = store.offers.inbox;
  const recentCollections = [...owned].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 4);
  const recentDecks = [...store.decks].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).slice(0, 4);
  const waiting = (store.trades ?? []).filter((trade) => trade.status === "open" && trade.turn === "me");
  const tile = (label: string, text: string, onClick?: () => void) => (
    <button type="button" className="stattile hometile" onClick={onClick} disabled={!onClick}>
      <span className="stlabel">{label}</span><span className="stvalue">{text}</span>
    </button>
  );
  return (
    <div className="view" id="view-home">
      <div id="pagetabs" className="homehead"><span className="phname">Home</span></div>
      <div className="list homewrap">
        <div className="hometiles">
          {tile("Cards owned", cards.toLocaleString(), () => store.setView("collection"))}
          {tile("Value", money(value, currency), () => store.setView("collection"))}
          {tile("Collections", String(owned.length), () => store.setView("collection"))}
          {tile("Decks", String(store.decks.length), () => store.setView("deck"))}
          {tile("Cards for trade", owned.reduce((sum, item) => sum + item.tradeCount, 0).toLocaleString(), () => store.setView("trade"))}
          {tile("Trades awaiting you", String(waiting.length), () => store.setView("trade"))}
        </div>
        <div className="btnrow homeacts">
          <button type="button" className="btn primary" onClick={actions.scan?.run}><Icon name="scan" /> Scan cards</button>
          <button type="button" className="btn" onClick={actions.find?.run}><Icon name="find" /> Search</button>
          <button type="button" className="btn" onClick={actions["io.import"]?.run}><Icon name="csvin" /> Import</button>
          <button type="button" className="btn" onClick={actions["view.purchases"]?.run}><Icon name="usd" /> Purchases</button>
          <button type="button" className="btn" onClick={actions["view.wiki"]?.run}><Icon name="notes" /> Wiki</button>
        </div>
        {offers.length > 0 && (
          <section className="homesec">
            <h4>Inbox</h4>
            {offers.map((offer) => (
              <div className="wsrow" key={offer.id}>
                <span><b>{offer.itemName}</b> <span className="sub">from {offer.user}</span></span>
                <button type="button" className="btn small" onClick={actions.inbox?.run}>Open</button>
              </div>
            ))}
          </section>
        )}
        {waiting.length > 0 && <section className="homesec"><h4>Trades awaiting your answer</h4>
          {waiting.map((trade) => <div className="wsrow" key={trade.id}><span><b>{trade.name}</b> <span className="sub">with {trade.with?.name}</span></span>
            <button type="button" className="btn small" onClick={() => { store.chooseTrade(trade.id); store.setView("trade"); }}>Open trade</button></div>)}
        </section>}
        <div className="homecolumns">
          <section className="homesec"><h4>Recent collections</h4>
            {!recentCollections.length && <p className="note">No collections yet</p>}
            {recentCollections.map((item) => <div className="wsrow" key={item.id}><span><b>{item.name}</b> <span className="sub">{item.cardCount.toLocaleString()} cards</span></span>
              <button type="button" className="btn small" onClick={() => { store.openCollection(item.id); store.setView("collection"); }}>Open</button></div>)}
          </section>
          <section className="homesec"><h4>Recent decks</h4>
            {!recentDecks.length && <p className="note">No decks yet</p>}
            {recentDecks.map((deck) => <div className="wsrow" key={deck.id}><span><b>{deck.name}</b> <span className="sub">{deck.card_count ?? 0} cards</span></span>
              <button type="button" className="btn small" onClick={() => void store.openDeck(deck.id).then(() => store.setView("deck"))}>Open</button></div>)}
          </section>
        </div>
        <section className="homesec">
          <h4>Recent scans</h4>
          {!recent.length && <p className="note">No scans yet</p>}
          {recent.map((item) => (
            <div className="row" key={item.key} onClick={() => store.setCardPage(item.card.id)}>
              <Thumb url={item.card.image_url} small />
              <div className="rowmain">
                <div className="rowtitle"><b>{item.quantity}x {item.card.name}</b>{item.foil && <span className="badge foil">FOIL</span>}{item.proxy && <span className="badge proxy">PROXY</span>}</div>
                <div className="rowmeta">{item.card.set_name} {item.card.set_code.toUpperCase()} #{item.card.collector_number}</div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
