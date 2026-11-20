// ---------- application shells: the desktop layout and the phone layout ----------
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Action } from "../actions";
import { type PanelId } from "../dock";
import { Icon } from "../icons";
import { CardPanel, CollectionsPanel, DeckListPanel, DecksPanel, FiltersPanel, ReviewPanel } from "../panels/Panels";
import { ACCOUNT_MENU, APP_MENU, DEFAULT_RIBBON, DESKTOP_ONLY } from "../ribbon";
import { useApp } from "../store";
import { CardPage } from "../views/CardPage";
import { CollectionView } from "../views/CollectionView";
import { HomeView } from "../views/HomeView";
import { TradeView } from "../views/TradeView";
import { ProxiesView } from "../views/ProxiesView";
import { CardsView } from "../views/Views";
import { DeckView } from "../views/DeckView";
import { About } from "./About";
import CardScanner from "./CardScanner";
import { ContextMenuHost } from "./ContextMenu";
import { Dock } from "./Dock";
import { Ribbon, TitleBar, useGroupShown } from "./Ribbon";
import { StatusBar } from "./StatusBar";
import { SyncChip } from "../android/AppScreens";
import { isApp } from "../android/platform";

function CenterView({ actions, onFilters }: { actions: Record<string, Action>; onFilters?: () => void }) {
  const store = useApp();
  if (store.cardPage) return <CardPage actions={actions} />;
  if (store.view === "about") return <About />;
  if (store.view === "home") return <HomeView actions={actions} />;
  if (store.view === "collection") return <CollectionView actions={actions} />;
  if (store.view === "deck") return <DeckView actions={actions} />;
  if (store.view === "trade") return <TradeView actions={actions} />;
  if (store.view === "proxies") return <ProxiesView actions={actions} />;
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
      <TitleBar actions={actions} />
      <Ribbon actions={actions} />
      <Dock renderPanel={renderPanel}>
        <CenterView actions={actions} />
      </Dock>
      <StatusBar actions={actions} />
      <ContextMenuHost />
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

/** The phone menu: one section per ribbon tab, opened one at a time, with lists of related commands nested inside. */
function PhoneMenu({ actions, close }: { actions: Record<string, Action>; close: () => void }) {
  const store = useApp();
  const shown = useGroupShown();
  const usable = (id: string) => !DESKTOP_ONLY.test(id) && actions[id] && !actions[id]!.disabled;
  const row = (id: string) => {
    const action = actions[id]!;
    return (
      <button key={id} type="button" data-action={id} className={action.on ? "pmrow on" : "pmrow"} onClick={() => { close(); action.run(); }}>
        <Icon name={action.icon} /><span>{action.label}</span>
      </button>
    );
  };
  const sections = DEFAULT_RIBBON.map((tab) => ({
    name: tab.name,
    rows: tab.groups.filter(shown).flatMap((group) => group.items).filter((id) => !DESKTOP_ONLY.test(id) && actions[id]),
  })).filter((section) => section.rows.some((id) => (actions[id]!.items ? actions[id]!.items!.some(usable) : usable(id))));
  return (
    <div className="pmenu">
      {sections.map((section) => (
        <details key={section.name} className="pmsection">
          <summary>{section.name}</summary>
          {section.rows.map((id) => {
            const action = actions[id]!;
            if (!action.items) return usable(id) ? row(id) : null;
            const items = action.items.filter(usable);
            if (!items.length) return null;
            return (
              <details key={id} className="pmsub">
                <summary><Icon name={action.icon} /><span>{action.label}</span></summary>
                {items.map(row)}
              </details>
            );
          })}
        </details>
      ))}
      <details className="pmsection" open>
        <summary>Account: {store.user.name}</summary>
        {[...ACCOUNT_MENU, ...(isApp() ? APP_MENU : [])].filter(usable).map(row)}
      </details>
    </div>
  );
}

export function PhoneShell({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const [sheet, setSheet] = useState<"filters" | "menu" | null>(null);
  const lastKey = useRef<string | null>(null);

  // tapping a card opens its card page
  useEffect(() => {
    const key = store.selection ? `${store.selection.view}:${store.selection.key}` : null;
    if (key && key !== lastKey.current && !store.selectMode && store.selection) store.setCardPage(store.selection.printingId);
    lastKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selection]);

  const leave = () => { setSheet(null); store.setScannerOpen(false); store.setCardPage(null); };
  const tab = (id: "home" | "cards" | "collection" | "deck" | "trade" | "proxies", label: string, icon: string) => (
    <button type="button" className={store.view === id && !sheet && !store.scannerOpen && !store.cardPage ? "ptab on" : "ptab"}
      onClick={() => { leave(); store.setView(id); }}>
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

  const title = store.cardPage ? "Card" : store.scannerOpen ? "Scan" : store.view === "deck" && store.deck ? store.deck.name : "Mana Vault";
  return (
    <div id="app" className="phone">
      <div id="pbar">
        <span className="brand" aria-hidden="true">M</span>
        <span className="ptitle">{title}</span>
        {isApp() && <SyncChip />}
        {(store.view === "collection" || store.view === "deck" || store.view === "trade") && !store.cardPage && !store.scannerOpen && (
          <button type="button" className={store.filtersActive ? "pbtn on" : "pbtn"} onClick={() => setSheet(sheet === "filters" ? null : "filters")}>Filters</button>
        )}
        {store.waitingTrades > 0 && <button type="button" className="pbtn" onClick={() => { leave(); store.setView("trade"); }}>Trades <span className="cbadge">{store.waitingTrades}</span></button>}
        {store.offers.inbox.length > 0 && <button type="button" className="pbtn" onClick={actions.inbox?.run}>Inbox <span className="cbadge">{store.offers.inbox.length}</span></button>}
        <button type="button" className={sheet === "menu" ? "pbtn on" : "pbtn"} aria-label="Menu" onClick={() => setSheet(sheet === "menu" ? null : "menu")}><Icon name="menu" /></button>
      </div>
      <div id="pmain" className={store.scannerOpen && !store.cardPage ? "scanning" : undefined}>
        {store.scannerOpen && !store.cardPage
          ? <CardScanner phone onClose={() => store.setScannerOpen(false)} />
          : <CenterView actions={actions} onFilters={() => setSheet("filters")} />}
      </div>
      {store.flashMsg && <div className={store.flashMsg.kind === "err" ? "ptoast err" : "ptoast"} role="status" key={store.flashMsg.id}>{store.flashMsg.text}</div>}
      <nav id="ptabs" aria-label="Main">
        {tab("home", "Home", "home")}
        {tab("cards", "Search", "find")}
        {tab("collection", "Collection", "collection")}
        {tab("deck", "Decks", "deck")}
        {tab("trade", "Trade", "trade")}
        {tab("proxies", "Proxies", "print")}
        <button type="button" className={store.scannerOpen && !sheet && !store.cardPage ? "ptab on" : "ptab"} onClick={() => { setSheet(null); store.setCardPage(null); store.setScannerOpen(true); }}>
          <Icon name="scan" /><span>Scan</span>
        </button>
      </nav>
      {sheet === "filters" && <Sheet title="Filters" onClose={close}><FiltersPanel actions={actions} /></Sheet>}
      {sheet === "menu" && <Sheet title="Menu" onClose={close}><PhoneMenu actions={actions} close={close} /></Sheet>}
      <ContextMenuHost />
    </div>
  );
}
