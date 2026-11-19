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
  const tile = (label: string, text: string, onClick?: () => void) => (
    <button type="button" className="stattile hometile" onClick={onClick} disabled={!onClick}>
      <span className="stlabel">{label}</span><span className="stvalue">{text}</span>
    </button>
  );
  return (
    <div className="view" id="view-home">
      <div id="pagetabs"><span className="phname">Home</span></div>
      <div className="list homewrap">
        <div className="hometiles">
          {tile("Cards owned", cards.toLocaleString(), () => store.setView("collection"))}
          {tile("Value", money(value, currency), () => store.setView("collection"))}
          {tile("Collections", String(owned.length), () => store.setView("collection"))}
          {tile("Decks", String(store.decks.length), () => store.setView("deck"))}
        </div>
        <div className="btnrow homeacts">
          <button type="button" className="btn primary" onClick={actions.scan?.run}><Icon name="scan" /> Scan cards</button>
          <button type="button" className="btn" onClick={actions.find?.run}><Icon name="find" /> Search</button>
          <button type="button" className="btn" onClick={actions["io.import"]?.run}><Icon name="csvin" /> Import</button>
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
