// ---------- status bar ----------
import type { Action } from "../actions";
import { customDialog } from "./Dialog";
import { useApp, zoneLabel } from "../store";

const VIEW_NAMES = { home: "Home", cards: "Card search", collection: "Collection", deck: "Deck", trade: "Trade", about: "About" } as const;

export function StatusBar({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { catalog } = store;
  const count = store.view === "cards" ? `${store.cards.length} ${store.cards.length === 1 ? "result" : "results"}`
    : store.view === "collection" ? `${store.visibleCollection.length} entries`
      : store.view === "deck" && store.deck ? `${store.deck.cards.reduce((sum, card) => sum + card.quantity, 0)} cards` : "";
  const failed = catalog?.update.lastError;
  const target = store.collections?.find((item) => item.id === store.prefs.targetCollection);
  const picked = store.view === "collection" && store.checked.size > 1 ? store.checked.size : 0;

  return (
    <div id="status">
      <span id="st-view">{VIEW_NAMES[store.view]}</span>
      {count && <span id="st-count">{count}</span>}
      {picked > 0 && <span id="st-picked">{picked} picked</span>}
      <span id="st-catalog" title={catalog?.update.scheduled ? `Automatic refresh every ${catalog.update.intervalHours} hours` : "Automatic refresh is off"}>
        {catalog
          ? `${catalog.printingCount.toLocaleString()} printings${catalog.updatedAt ? `, updated ${new Date(catalog.updatedAt).toLocaleDateString()}` : ""}`
          : "Card database loading"}
      </span>
      {catalog?.update.isUpdating && <span className="st-warn">Updating card database</span>}
      {failed && !catalog?.update.isUpdating && (
        <span
          className="st-err pt"
          role="button"
          onClick={() => customDialog("Card database update failed", () => <p className="dlgq">The last card database update failed: {failed}</p>, 420)}
        >
          Last update failed
        </span>
      )}
      <span id="st-toggles">
        <span className="pt on-plain" role="button" title="Collection that Add to collection puts cards into (C cycles it)" onClick={actions["collection.target"]?.run}>
          ADD TO: {target ? target.name.toUpperCase() : "NO COLLECTION"}
        </span>
        <span className={`pt${store.prefs.foil ? " on" : ""}`} role="button" title={actions.foil?.label} onClick={actions.foil?.run}>FOIL</span>
        <span className="pt on-plain" role="button" title="Currency for prices and values (click to switch)"
          onClick={actions[store.prefs.currency === "usd" ? "currency.eur" : "currency.usd"]?.run}>PRICES: {store.prefs.currency.toUpperCase()}</span>
        <span className="pt on-plain" role="button" title="Target zone for Add to deck (Z cycles it)" onClick={actions["zone.cycle"]?.run}>
          ZONE: {zoneLabel(store.prefs.zone).toUpperCase()}
        </span>
      </span>
      <span id="st-msg" className={store.flashMsg?.kind === "err" ? "err" : ""} role="status" key={store.flashMsg?.id}>{store.flashMsg?.text ?? ""}</span>
    </div>
  );
}
