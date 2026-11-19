// ---------- application shells: the desktop layout and the phone layout ----------
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Action } from "../actions";
import { type PanelId } from "../dock";
import { Icon } from "../icons";
import { CardPanel, CollectionsPanel, DeckListPanel, DecksPanel, FiltersPanel, ReviewPanel } from "../panels/Panels";
import { MENUS } from "../ribbon";
import { useApp } from "../store";
import { CollectionView } from "../views/CollectionView";
import { TradeView } from "../views/TradeView";
import { CardsView, DeckView } from "../views/Views";
import { About } from "./About";
import CardScanner from "./CardScanner";
import { Dock } from "./Dock";
import { MenuBar } from "./MenuBar";
import { Ribbon } from "./Ribbon";
import { StatusBar } from "./StatusBar";

function CenterView({ actions, onFilters }: { actions: Record<string, Action>; onFilters?: () => void }) {
  const store = useApp();
  if (store.view === "about") return <About />;
  if (store.view === "collection") return <CollectionView actions={actions} />;
  if (store.view === "deck") return <DeckView actions={actions} />;
  if (store.view === "trade") return <TradeView actions={actions} />;
  return <CardsView actions={actions} onFilters={onFilters} />;
}

export function DesktopShell({ actions }: { actions: Record<string, Action> }) {
  const renderPanel = (panel: PanelId): ReactNode => {
    switch (panel) {
      case "filters": return <FiltersPanel actions={actions} />;
      case "collections": return <CollectionsPanel actions={actions} />;
      case "decks": return <DecksPanel actions={actions} />;
      case "card": return <CardPanel actions={actions} />;
      case "decklist": return <DeckListPanel actions={actions} />;
      case "review": return <ReviewPanel />;
    }
  };
  return (
    <div id="app">
      <MenuBar actions={actions} />
      <Ribbon actions={actions} />
      <Dock renderPanel={renderPanel}>
        <CenterView actions={actions} />
      </Dock>
      <StatusBar actions={actions} />
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="sheetwrap" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheethead"><b>{title}</b><button type="button" className="btn" onClick={onClose}>Close</button></div>
        <div className="sheetbody">{children}</div>
      </section>
    </div>
  );
}

// Menu items that only make sense with the desktop panels and ribbon.
const DESKTOP_ONLY = /^(panel\.|workspace\.|ribbon\.)/;

export function PhoneShell({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const [sheet, setSheet] = useState<"filters" | "card" | "more" | "decks" | null>(null);
  const lastKey = useRef<string | null>(null);

  // tapping a card opens its details
  useEffect(() => {
    const key = store.selection ? `${store.selection.view}:${store.selection.key}` : null;
    if (key && key !== lastKey.current && !store.selectMode) setSheet("card");
    lastKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selection]);

  const tab = (id: "cards" | "collection" | "deck", label: string, icon: string) => (
    <button type="button" className={store.view === id && !sheet && !store.scannerOpen ? "ptab on" : "ptab"}
      onClick={() => { setSheet(null); store.setScannerOpen(false); store.setView(id); }}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  );
  const close = () => setSheet(null);

  // opening another view from the menu leaves the scanner
  const shownView = useRef(store.view);
  useEffect(() => {
    if (shownView.current !== store.view) store.setScannerOpen(false);
    shownView.current = store.view;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.view]);

  return (
    <div id="app" className="phone">
      <div id="pbar">
        <span className="brand" aria-hidden="true">M</span>
        <span className="ptitle">{store.scannerOpen ? "Scan" : store.view === "deck" && store.deck ? store.deck.name : "Mana Vault"}</span>
        {store.offers.inbox.length > 0 && <button type="button" className="pbtn" onClick={actions.inbox?.run}>Inbox <span className="cbadge">{store.offers.inbox.length}</span></button>}
        {store.view === "deck" && !store.scannerOpen && <button type="button" className="pbtn" onClick={() => setSheet("decks")}>Decks</button>}
        <button type="button" className="pbtn" aria-label="Menu" onClick={() => setSheet("more")}><Icon name="menu" /></button>
      </div>
      <div id="pmain" className={store.scannerOpen ? "scanning" : undefined}>
        {store.scannerOpen
          ? <CardScanner phone onClose={() => store.setScannerOpen(false)} />
          : store.view === "deck" && !store.deck ? <DecksPanel actions={actions} /> : <CenterView actions={actions} onFilters={() => setSheet("filters")} />}
      </div>
      {store.flashMsg && <div className={store.flashMsg.kind === "err" ? "ptoast err" : "ptoast"} role="status" key={store.flashMsg.id}>{store.flashMsg.text}</div>}
      <nav id="ptabs" aria-label="Main">
        {tab("cards", "Cards", "cards")}
        {tab("collection", "Collection", "collection")}
        {tab("deck", "Decks", "deck")}
        <button type="button" className={store.scannerOpen && !sheet ? "ptab on" : "ptab"} onClick={() => { setSheet(null); store.setScannerOpen(true); }}>
          <Icon name="scan" /><span>Scan</span>
        </button>
        <button type="button" className={sheet === "more" ? "ptab on" : "ptab"} onClick={() => setSheet("more")}><Icon name="menu" /><span>More</span></button>
      </nav>
      {sheet === "filters" && <Sheet title="Filters" onClose={close}><FiltersPanel actions={actions} /></Sheet>}
      {sheet === "card" && store.cardDetail && <Sheet title="Card" onClose={close}><CardPanel actions={actions} /></Sheet>}
      {sheet === "decks" && <Sheet title="Decks" onClose={close}><DecksPanel actions={actions} /></Sheet>}
      {sheet === "more" && (
        <Sheet title="Menu" onClose={close}>
          <div className="pmenu">
            {MENUS.map((menu) => (
              <div key={menu.name}>
                <div className="navgroup">{menu.name}</div>
                {menu.items.filter((item) => item !== "-" && !DESKTOP_ONLY.test(item)).map((item) => {
                  const action = actions[item];
                  if (!action) return null;
                  return (
                    <button key={item} type="button" className={action.on ? "pmrow on" : "pmrow"} disabled={action.disabled}
                      onClick={() => { close(); action.run(); }}>
                      <Icon name={action.icon} /><span>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="navgroup">Account: {store.user.name}</div>
            {(["inbox", "password", "signout"] as const).map((item) => (
              <button key={item} type="button" className="pmrow" onClick={() => { close(); actions[item]?.run(); }}>
                <Icon name={actions[item]!.icon} /><span>{actions[item]!.label}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
