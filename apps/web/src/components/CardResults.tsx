// ---------- card results: search results as a grid, binder pages or a list, loading more as needed ----------
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type CardSearch, type FoundCard, useCardSearch } from "../card-search";
import { Icon } from "../icons";
import { type Store, useApp } from "../store";
import { anyPrice, capitalize, type CollectionLayout, type Filters, type GridSize, money, pricesOf } from "../types";
import { Thumb } from "../views/Views";
import { rowMenu } from "./ContextMenu";

type MenuItem = { label: string; run: () => void } | false | null | undefined;
export type ResultProps = {
  search: CardSearch;
  layout: CollectionLayout;
  size: GridSize;
  /** The accessible name of the results list. */
  label: string;
  activeId?: string | null;
  /** Click: selects the card. */
  onPick: (card: FoundCard) => void;
  /** Double-click: the main action, such as adding the card. */
  onOpen: (card: FoundCard) => void;
  /** Right-click or long press. */
  menu: (card: FoundCard) => MenuItem[];
  /** The buttons on each result. */
  buttons?: (card: FoundCard) => ReactNode;
  /** Set code and rarity tags narrow the search. */
  onTag?: (change: { set?: string; rarity?: string }) => void;
  /** Shown when there are no results. */
  empty: ReactNode;
  /** A change of this value scrolls back to the top. */
  resetKey: unknown;
};

const GRID_WIDTHS: Record<GridSize, number> = { s: 120, m: 170, l: 240 };
const PHONE_COLUMNS: Record<GridSize, number> = { s: 4, m: 3, l: 2 };
const SHEET = 9;

/** The line under a search box: how many cards match and how many are shown. */
export function countLine(search: CardSearch) {
  if (search.loading && !search.cards.length) return "Searching";
  const total = search.total.toLocaleString();
  return `${total} ${search.total === 1 ? "result" : "results"}${search.cards.length < search.total ? `, ${search.cards.length.toLocaleString()} loaded` : ""}`;
}

/** Loads the next page when the end of the list comes into view. */
function useMoreOnScroll(search: CardSearch) {
  const root = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = end.current;
    if (!element) return;
    const observer = new IntersectionObserver((seen) => { if (seen.some((item) => item.isIntersecting)) search.more(); }, { root: root.current, rootMargin: "600px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [search, search.cards.length]);
  return { root, end };
}

function OwnedBadge({ owned }: { owned?: number }) {
  return owned ? <span className="badge own" title={`You own ${owned} ${owned === 1 ? "copy" : "copies"} of this printing`}>OWNED {owned}</span> : null;
}

/** One card picture with its price and owned count. */
function ResultPicture({ card, props, store }: { card: FoundCard; props: ResultProps; store: Store }) {
  const currency = store.prefs.currency;
  const active = props.activeId === card.id;
  return (
    <div className={active ? "rescard active" : "rescard"}>
      <div data-key={card.id} role="option" aria-selected={active} className={active ? "pocket active" : "pocket"}
        title={`${card.name}, ${card.set_name} ${card.collector_number}`}
        onClick={() => props.onPick(card)} onDoubleClick={() => props.onOpen(card)} {...rowMenu(store, card.name, () => props.menu(card))}>
        {card.image_url ? <img src={card.image_url} alt={card.name} loading="lazy" draggable={false} /> : <span className="pocketname">{card.name}</span>}
        {!!card.owned && <span className="pocketqty" title={`You own ${card.owned}`}>{card.owned}</span>}
        <span className="pocketprice">{money(anyPrice(pricesOf(card), currency), currency)}</span>
      </div>
      {props.buttons && <div className="resbtns">{props.buttons(card)}</div>}
    </div>
  );
}

function ResultRow({ card, props, store }: { card: FoundCard; props: ResultProps; store: Store }) {
  const active = props.activeId === card.id;
  const currency = store.prefs.currency;
  return (
    <div data-key={card.id} role="option" aria-selected={active} className={active ? "row active" : "row"}
      onClick={() => props.onPick(card)} onDoubleClick={() => props.onOpen(card)} {...rowMenu(store, card.name, () => props.menu(card))}>
      <Thumb url={card.image_url} />
      <div className="rowmain">
        <div className="rowtitle"><b>{card.name}</b><span className="mana">{card.mana_cost}</span><OwnedBadge owned={card.owned} /></div>
        <div className="rowsub">{card.type_line}</div>
        <div className="rowmeta">{card.set_name}{" "}
          {props.onTag
            ? <button type="button" className="tag badge" title={`Show only cards from ${card.set_name}`}
              onClick={(event) => { event.stopPropagation(); props.onTag!({ set: card.set_code }); }}>{card.set_code.toUpperCase()}</button>
            : <span className="badge">{card.set_code.toUpperCase()}</span>}{" "}
          {card.collector_number}{" "}
          {props.onTag
            ? <button type="button" className={`tag rar ${card.rarity}`} title={`Show only ${card.rarity} cards`}
              onClick={(event) => { event.stopPropagation(); props.onTag!({ rarity: card.rarity }); }}>{capitalize(card.rarity)}</button>
            : <span className={`rar ${card.rarity}`}>{capitalize(card.rarity)}</span>}
          {card.flavor_name && <span className="copylbl"> Also printed as {card.flavor_name}</span>}
        </div>
      </div>
      <span className="price">{money(anyPrice(pricesOf(card), currency), currency)}</span>
      {props.buttons && <div className="rowact">{props.buttons(card)}</div>}
    </div>
  );
}

function ResultGrid({ props, store }: { props: ResultProps; store: Store }) {
  const { root, end } = useMoreOnScroll(props.search);
  useEffect(() => { root.current?.scrollTo({ top: 0 }); }, [props.resetKey, root]);
  const size = props.size;
  const columns = store.phone ? `repeat(${PHONE_COLUMNS[size]}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${GRID_WIDTHS[size]}px, 1fr))`;
  const { cards, total } = props.search;
  return (
    <div className="gridwrap" ref={root}>
      <div className={`cardgrid size-${size}`} role="listbox" aria-label={props.label} style={{ gridTemplateColumns: columns }}>
        {cards.map((card) => <ResultPicture key={card.id} card={card} props={props} store={store} />)}
      </div>
      {cards.length < total && <div ref={end} className="gridmore">Loading more cards</div>}
    </div>
  );
}

function ResultList({ props, store }: { props: ResultProps; store: Store }) {
  const { root, end } = useMoreOnScroll(props.search);
  useEffect(() => { root.current?.scrollTo({ top: 0 }); }, [props.resetKey, root]);
  const { cards, total } = props.search;
  return (
    <div className="list" role="listbox" aria-label={props.label} ref={root}>
      {cards.map((card) => <ResultRow key={card.id} card={card} props={props} store={store} />)}
      {cards.length < total && <div ref={end} className="gridmore">Loading more cards</div>}
    </div>
  );
}

/** Binder sheets of nine; turning to a page past the loaded results loads more. */
function ResultBinder({ props }: { props: ResultProps; store: Store }) {
  const store = useApp();
  const [page, setPage] = useState(0);
  const { cards, total } = props.search;
  const pages = Math.max(1, Math.ceil(total / SHEET));
  const shown = cards.slice(page * SHEET, page * SHEET + SHEET);
  useEffect(() => setPage(0), [props.resetKey]);
  useEffect(() => {
    if ((page + 2) * SHEET > cards.length && cards.length < total) props.search.more();
  }, [page, cards.length, total, props.search]);
  const go = (next: number) => setPage(Math.max(0, Math.min(pages - 1, next)));
  return (
    <div className="binderwrap">
      <div className="binderarea">
        <div className="binder" role="listbox" aria-label={`${props.label}, page ${page + 1} of ${pages}`}>
          {shown.map((card) => <ResultPicture key={card.id} card={card} props={props} store={store} />)}
          {Array.from({ length: Math.max(0, SHEET - shown.length) }, (_, index) => <div key={`empty-${index}`} className="pocket emptypocket" aria-hidden="true" />)}
        </div>
      </div>
      <div className="binderpager">
        <button type="button" className="btn small" disabled={page === 0} onClick={() => go(page - 1)}>Previous page</button>
        <span>Page {page + 1} of {pages}</span>
        <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => go(page + 1)}>Next page</button>
      </div>
    </div>
  );
}

/** Search results in the chosen layout, with the error or empty message when there are none. */
export function CardResults(props: ResultProps) {
  const store = useApp();
  const { search } = props;
  if (search.error) return <div className="emptynote err">{search.error}</div>;
  if (!search.loading && search.cards.length === 0) return <div className="empty"><Icon name="find" />{props.empty}</div>;
  if (props.layout === "grid") return <ResultGrid props={props} store={store} />;
  if (props.layout === "binder") return <ResultBinder props={props} store={store} />;
  return <ResultList props={props} store={store} />;
}

/** A card search inside a view (the deck's Add tab, the trade searches) whose owned counts follow cards being added. */
export function useViewSearch(filters: Filters, enabled: boolean): CardSearch {
  const store = useApp();
  const search = useCardSearch(filters, enabled);
  const hooks = store.ownedHooks;
  useEffect(() => {
    const hook = search.owned;
    hooks.current.add(hook);
    return () => { hooks.current.delete(hook); };
  }, [hooks, search.owned]);
  return search;
}
