// ---------- status bar ----------
import { openOpeningEntry, packLabel, useActiveOpening } from "../purchase-state";
import { goNextPack } from "../live";
import { request } from "../api";
import type { Action } from "../actions";
import { customDialog } from "./Dialog";
import { useApp, zoneLabel } from "../store";
import { changeCollectionDialog } from "./PurchaseDialogs";
import { PURCHASES_CHANGED } from "../live";

const VIEW_NAMES = { home: "Home", cards: "Card search", collection: "Collection", deck: "Deck", trade: "Trade", proxies: "Proxies", purchases: "Purchases", about: "About", admin: "Administration" } as const;

export function StatusBar({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { catalog } = store;
  const count = store.view === "cards" ? `${store.cards.length} ${store.cards.length === 1 ? "result" : "results"}`
    : store.view === "collection" ? `${store.visibleCollection.length} entries`
      : store.view === "deck" && store.deck ? `${store.deck.cards.reduce((sum, card) => sum + card.quantity, 0)} cards` : "";
  const failed = catalog?.update.lastError;
  const target = store.collections?.find((item) => item.id === store.prefs.targetCollection);
  // cards go to the deck when a deck was selected last
  const deckTarget = store.prefs.addTo === "deck" ? store.deck : null;
  const picked = store.view === "collection" && store.checked.size > 1 ? store.checked.size : 0;
  const opening = useActiveOpening();

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
      {store.pictureProgress && (
        <span id="st-pictures" role="button" tabIndex={-1} title="Open Pictures in Administration" onClick={() => store.openAdmin("pictures")}>
          {store.pictureProgress.paused ? "Picture downloads paused" : "Downloading pictures"}: {store.pictureProgress.done.toLocaleString()} of {store.pictureProgress.total.toLocaleString()}
        </span>
      )}
      {!!catalog?.migrations && (catalog.migrations.merged > 0 || catalog.migrations.removed > 0) && !catalog.update.isUpdating && (
        <span id="st-migrations" role="button" tabIndex={-1} title="Open Activity in Administration" onClick={() => store.openAdmin("activity")}>
          {catalog.migrations.merged} printings merged, {catalog.migrations.removed} removed
        </span>
      )}
      {!!catalog?.skipped?.count && !catalog.update.isUpdating && (
        <span
          id="st-skipped"
          className="st-warn pt"
          role="button"
          onClick={() => customDialog("Cards skipped in the last update", () => (
            <>
              <p className="dlgq">{catalog.skipped!.count.toLocaleString()} {catalog.skipped!.count === 1 ? "card was" : "cards were"} left out of the last card database update because the record from Scryfall failed a check. The next update tries them again.</p>
              <ul className="skipped">{catalog.skipped!.names.map((name, index) => <li key={index}>{name}</li>)}</ul>
              {catalog.skipped!.count > catalog.skipped!.names.length && <p className="note">and {(catalog.skipped!.count - catalog.skipped!.names.length).toLocaleString()} more</p>}
            </>
          ), 480)}
        >
          {catalog.skipped.count.toLocaleString()} skipped
        </span>
      )}
      {failed && !catalog?.update.isUpdating && (
        <span
          className="st-err pt"
          role="button"
          onClick={() => customDialog("Card database update failed", () => <p className="dlgq">The last card database update failed: {failed}</p>, 420)}
        >
          Last update failed
        </span>
      )}
      {opening && (
        <span id="st-opening" className="pt on" role="button" title="Cards added to the collection are tied to this opening. Click to open its purchase"
          onClick={() => openOpeningEntry(store, opening.entryId)}>
          OPENING: {opening.name.toUpperCase()}{packLabel(opening) ? ` (${packLabel(opening).toUpperCase()})` : ""}
        </span>
      )}
      {opening?.hasNext && (
        <span id="st-nextpack" className="pt" role="button" title="This pack is done: the next pack becomes where cards are tied" onClick={() => void goNextPack(store)}>NEXT PACK</span>
      )}
      {opening && (
        <span id="st-changecoll" className="pt" role="button" title={`Where this pack's cards go: ${opening.collectionId ? store.collectionName(opening.collectionId) : "no collection"}. Click to change it`}
          onClick={() => changeCollectionDialog(store, opening, () => window.dispatchEvent(new Event(PURCHASES_CHANGED)))}>CHANGE COLLECTION...</span>
      )}
      <span id="st-toggles">
        <span id="st-target" className="pt on-plain addingto" role="button"
          title={store.deck ? "Where Enter and + Add put cards. Click to switch between the open deck and the target collection (C cycles the collections)"
            : "Where Enter and + Add put cards (C cycles the collections)"}
          onClick={() => {
            if (!store.deck) return actions["collection.target"]?.run();
            const next = store.prefs.addTo === "deck" ? "collection" : "deck";
            store.setPrefs({ addTo: next });
            store.flash(`Adding to ${next === "deck" ? store.deck.name : target?.name ?? "the target collection"}`);
          }}>
          ADDING TO: {deckTarget ? `DECK ${deckTarget.name.toUpperCase()}` : opening && target && opening.collectionId === target.id ? opening.name.toUpperCase() : target ? target.name.toUpperCase() : "NO COLLECTION"}
        </span>
        <span className={`pt${store.prefs.foil ? " on" : ""}`} role="button" title={actions.foil?.label} onClick={actions.foil?.run}>FOIL</span>
        <span className="pt on-plain" role="button" title="Target zone for Add to deck (Z cycles it)" onClick={actions["zone.cycle"]?.run}>
          ZONE: {zoneLabel(store.prefs.zone).toUpperCase()}
        </span>
      </span>
      <span id="st-msg" className={store.flashMsg?.kind === "err" ? "err" : ""} role="status" key={store.flashMsg?.id}>{store.flashMsg?.text ?? ""}</span>
    </div>
  );
}
