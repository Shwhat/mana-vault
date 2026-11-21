// ---------- collection view: cards, set completion and missing cards ----------
import { newEntry } from "./PurchasesView";
import { SetIcon } from "../components/CardMarks";
import type { SetProgress } from "../types";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "../actions";
import { rowMenu } from "../components/ContextMenu";
import { collectionDialog, copyDialog, moveDialog } from "../components/LibraryDialogs";
import { choosePrinting } from "../components/PrintingDialog";
import { CountPip, FinishBadge, FinishPip, finishName, PipBar, PricePip, RemovedPip, removeCard } from "../components/CardMarks";
import { Icon } from "../icons";
import { entryKey } from "../library-state";
import { type Store, useApp } from "../store";
import {
  ALL_COLLECTIONS, capitalize, COLOR_NAMES, COMPLETION_RULES, conditionName, copyLabel, copyPrice, FINISH_RULES, FINISHES, finishLabel, type Collection, type CollectionEntry,
  type CollectionSort, type GridSize,
  type CollectionTab, type Facets, languageName, money,
} from "../types";
import { choices, Picker } from "../components/Picker";
import { LayoutRows, OptionsButton } from "../components/Options";
import { EntryMenuButton, GroupedList, ListOptionRows, ManaCost } from "../components/GroupedList";
import { groupList } from "../list-groups";
import { Switcher } from "../components/Switcher";
import { StatsPanel } from "./StatsView";
import { Quantity, Thumb } from "./Views";

const ALL_FACETS: Facets = { rarity: undefined, color: undefined, type: undefined, set: undefined, curve: undefined, finish: undefined, trade: undefined, inDeck: undefined, proxy: undefined };
const SORTS: Array<[CollectionSort, string]> = [
  ["name", "Name"], ["mana", "Mana Value"], ["price-desc", "Price, highest first"], ["price-asc", "Price, lowest first"], ["rarity", "Rarity"], ["color", "Color"],
  ["quantity", "Quantity"], ["set", "Set and number"],
];

/** The chip text for each active filter tag. */
function facetLabels(store: Store): Array<[keyof Facets, string]> {
  const { facets } = store;
  const set = facets.set ? (store.collection ?? []).find((entry) => entry.set_code === facets.set)?.set_name ?? facets.set.toUpperCase() : "";
  const list: Array<[keyof Facets, string | false | undefined]> = [
    ["rarity", facets.rarity && `Rarity: ${capitalize(facets.rarity)}`],
    ["color", facets.color && `Color: ${COLOR_NAMES[facets.color] ?? facets.color}`],
    ["type", facets.type && `Type: ${facets.type}`],
    ["set", facets.set && `Set: ${set}`],
    ["curve", facets.curve && `Mana value: ${facets.curve}`],
    ["finish", facets.finish && `Finish: ${FINISHES.find(([code]) => String(code) === facets.finish)?.[1] ?? facets.finish}`],
    ["trade", facets.trade && "For trade"],
    ["inDeck", facets.inDeck && (facets.inDeck === "yes" ? "In a deck" : "Not in a deck")],
    ["proxy", facets.proxy && "Proxies"],
  ];
  return list.filter((item): item is [keyof Facets, string] => !!item[1]);
}

/** Set code and rarity on a row are tags: clicking one lists only the cards that share it. */
function Tags({ entry }: { entry: CollectionEntry }) {
  const store = useApp();
  const tag = (facet: Facets, text: string, className: string, title: string) => (
    <button type="button" className={`tag ${className}`} title={title} onClick={(event) => { event.stopPropagation(); store.setFacet(facet); }}>{text}</button>
  );
  const label = copyLabel(entry);
  return (
    <div className="rowmeta">{entry.collection_name && <span className="badge where" title={`In ${entry.collection_name}`}>{entry.collection_name}</span>} {entry.set_name} {tag({ set: entry.set_code }, entry.set_code.toUpperCase(), "badge", `Show only cards from ${entry.set_name}`)} {entry.collector_number}{" "}
      {tag({ rarity: entry.rarity }, capitalize(entry.rarity), `rar ${entry.rarity}`, `Show only ${entry.rarity} cards`)}
      {label && <span className="copylbl" title={[conditionName(entry.condition), languageName(entry.language)].join(", ")}> {label}</span>}
      {(entry.decks ?? []).length > 0 && (
        <span className="rowtags">
          {entry.decks!.map((deck) => (
            <button key={deck.id} type="button" className="tag badge deck" title={`${deck.quantity} in ${deck.name}`}
              onClick={(event) => { event.stopPropagation(); void store.openDeck(deck.id, true).then(() => store.setView("deck")); }}>
              {deck.name}{deck.quantity > 1 ? ` ×${deck.quantity}` : ""}</button>
          ))}
        </span>
      )}
    </div>
  );
}

/** Sell...: a card sale of this copy, at today's price. */
const sellEntry = (store: Store, entry: CollectionEntry) => {
  const collectionId = entry.collection_id ?? store.prefs.openCollection ?? "";
  newEntry(store, "card_sale", () => store.setView("purchases"), [{
    collectionId, collectionName: entry.collection_name ?? store.collectionName(collectionId), cardId: entry.id, foil: entry.foil, condition: entry.condition,
    language: entry.language, proxy: false, quantity: entry.quantity, name: entry.name, setCode: entry.set_code, collectorNumber: entry.collector_number,
    count: "1", price: String(copyPrice(entry, store.prefs.currency) ?? 0),
  }]);
};

/** Change printing... for a copy. */
const changeEntryPrinting = (store: Store, entry: CollectionEntry) => choosePrinting(entry.name, entry.id, entry.id, { finish: entry.foil, currency: store.prefs.currency, quantity: entry.quantity },
  (printing, finish, count) => void store.changeCopyPrinting(entry, printing, finish, count));

/** The menu of a collection row: right-click or long press. */
function entryMenu(store: Store, entry: CollectionEntry) {
  return rowMenu(store, entry.name, () => [
    { label: "Card page", run: () => store.setCardPage(entry.id) },
    { label: "Copy details...", run: () => copyDialog(store, entry) },
    !store.allCollections || entry.collection_id ? { label: "Change printing...", run: () => choosePrinting(entry.name, entry.id, entry.id, { finish: entry.foil, currency: store.prefs.currency, quantity: entry.quantity },
      (printing, finish, count) => void store.changeCopyPrinting(entry, printing, finish, count)) } : null,
    (store.collections?.length ?? 0) > 1 && { label: "Move...", run: () => moveDialog(store, [entry]) },
    !entry.proxy && { label: entry.trade >= entry.quantity ? "Unmark for trade" : "Mark for trade", run: () => void store.markTrade([entry], entry.trade < entry.quantity) },
    !!store.deck && { label: `Add to ${store.deck.name}`, run: () => void store.addToDeck(entry.id, entry.name, undefined, { finish: finishName(entry.foil) }) },
    { label: "Add to print list", run: () => void store.addToPrintList([{ card: entry, count: entry.quantity }], entry.name) },
    !entry.proxy && { label: "Sell...", run: () => sellEntry(store, entry) },
    entry.quantity > 1 && { label: "Reduce to 1", run: () => void store.setCollectionQuantity(entry, 1) },
    { label: "Remove", run: () => removeCard(store, entry.name, entry.quantity, (left) => void store.setCollectionQuantity(entry, left)) },
  ]);
}

const percent = (owned: number, total: number) => (total ? Math.floor((owned / total) * 1000) / 10 : 0);

/** A ratio against its whole: accent fill on a lighter track of the same hue. */
export function Meter({ owned, total, label }: { owned: number; total: number; label: string }) {
  const value = percent(owned, total);
  return (
    <span className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} title={`${owned} of ${total} (${value}%)`}>
      <span className="meterfill" style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

function CollectionHeader({ current, actions }: { current: Collection; actions: Record<string, Action> }) {
  const store = useApp();
  // a collection without a completion rule tracks no completion
  const tabs: Array<[CollectionTab, string]> = store.allCollections ? [["cards", "Cards"]] : current.completion === "none"
    ? [["cards", "Cards"], ["stats", "Statistics"]]
    : [["cards", "Cards"], ["completion", "Completion"], ["missing", "Missing"], ["stats", "Statistics"]];
  const currency = store.prefs.currency;
  const isTarget = store.prefs.targetCollection === current.id;
  const rows = store.collection?.length ?? current.entryCount;
  const shownRows = store.visibleCollection.length;
  const filtered = store.collectionTab === "cards" && store.collection !== null && shownRows < rows;
  const unpriced = current.value.unpricedUsd;
  return (
    <div id="pagetabs" className="colhead">
      <Switcher kind="collection" actions={actions} />
      <div className="seg" role="tablist" aria-label="Collection view">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={store.collectionTab === id} className={store.collectionTab === id ? "on" : ""} onClick={() => store.setCollectionTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {current.kind === "wishlist" && <span className="badge wish" title="Cards here are wanted, not owned">Wishlist</span>}
      {current.role === "member" && <span className="badge">Shared by {current.owner.name}</span>}
      {current.role === "owner" && current.sharedWith.length > 0 && <span className="badge">Shared with {current.sharedWith.map((person) => person.name).join(", ")}</span>}
      {store.collectionTab === "cards" && (
        <label className="searchbox">
          <Icon name="find" className="nicon" />
          <input value={store.collectionFilter} onChange={(event) => store.setCollectionFilter(event.target.value)} placeholder="Filter by card or set name" aria-label="Filter collection" />
        </label>
      )}
      {store.collectionTab === "cards" && <CollectionOptions />}
      {!store.allCollections && <button type="button" className="btn small addbtn" title={isTarget ? `Search for cards to add to ${current.name}` : `Add new cards to ${current.name}, then search for them`}
        onClick={() => { if (!isTarget) store.setTargetCollection(current.id); actions.find?.run(); }}>+ Add</button>}
      <span className="phpos" title={unpriced ? `${unpriced} cards have no price` : undefined}>
        {current.cardCount.toLocaleString()} cards ({rows.toLocaleString()} unique), {current.kind === "wishlist" ? "wanted " : ""}{money(current.value[currency], currency)}
        {filtered ? `, showing ${shownRows.toLocaleString()} of ${rows.toLocaleString()}` : ""}
      </span>
    </div>
  );
}

/** Sort, layout, card size, For trade only, In decks or not, wishlists in All collections and Select, behind one button with a count of active filters. */
function CollectionOptions() {
  const store = useApp();
  const active = (store.facets.trade ? 1 : 0) + (store.facets.inDeck ? 1 : 0);
  return (
    <OptionsButton title="Collection options" count={active}>
      <ListOptionRows id="opt-coll" group={store.prefs.listGroups.collection} onGroup={(group) => store.setPrefs({ listGroups: { ...store.prefs.listGroups, collection: group } })} />
      <div className="prow"><label htmlFor="opt-sort">Sort</label>
        <Picker id="opt-sort" label="Sort" value={store.prefs.collectionSort} onChange={(value) => store.setPrefs({ collectionSort: value as CollectionSort })}
          options={choices(SORTS)} /></div>
      <LayoutRows name="Collection" layout={store.layout} size={store.prefs.gridSize} onLayout={store.setCollectionLayout} onSize={(gridSize) => store.setPrefs({ gridSize })} />
      <div className="prow"><label htmlFor="opt-deck">Decks</label>
        <Picker id="opt-deck" label="Filter by deck" value={store.facets.inDeck ?? ""} onChange={(value) => store.setFacet({ inDeck: (value || undefined) as Facets["inDeck"] })}
          options={choices([["", "In decks or not"], ["yes", "In a deck"], ["no", "Not in a deck"]])} /></div>
      <label className="optcheck"><input type="checkbox" checked={!!store.facets.trade} onChange={() => store.setFacet({ trade: !store.facets.trade })} /> For trade only</label>
      {store.allCollections && (
        <label className="optcheck"><input type="checkbox" checked={store.prefs.allWishlists} onChange={() => store.setPrefs({ allWishlists: !store.prefs.allWishlists })} /> Include wishlists</label>
      )}
      <label className="optcheck"><input type="checkbox" checked={store.selectMode}
        onChange={() => { store.setSelectMode(!store.selectMode); if (store.selectMode) store.setChecked(new Set()); }} /> Select several cards</label>
    </OptionsButton>
  );
}

/** The active filter tags, as chips that remove themselves. */
function ChipBar() {
  const store = useApp();
  const chips = facetLabels(store);
  if (!chips.length) return null;
  return (
    <div className="filterbar">
      {chips.map(([key, text]) => (
        <span className="chip" key={key}>{text}<button type="button" aria-label={`Remove filter ${text}`} onClick={() => store.setFacet({ [key]: undefined })}>×</button></span>
      ))}
      {chips.length > 1 && <button type="button" className="lnk" onClick={() => store.setFacet(ALL_FACETS)}>Clear tags</button>}
    </div>
  );
}

/** The size of an element, kept current as it changes. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Entries of the same printing (and collection) together, in the order they are shown: one picture each. */
export function stacksOf(entries: CollectionEntry[]): CollectionEntry[][] {
  const stacks = new Map<string, CollectionEntry[]>();
  for (const entry of entries) {
    const key = `${entry.collection_id ?? ""}:${entry.id}`;
    const stack = stacks.get(key);
    if (stack) stack.push(entry);
    else stacks.set(key, [entry]);
  }
  return [...stacks.values()];
}

/** A line under a picture: pips for the finish (and condition, language, proxy when they differ) and how many. */
function StackLine({ entry }: { entry: CollectionEntry }) {
  const store = useApp();
  const key = entryKey(entry);
  const active = store.checked.has(key);
  const label = [finishLabel(entry.foil, entry.promo_types), entry.condition !== "NM" ? conditionName(entry.condition) : "",
    entry.language !== "en" ? languageName(entry.language) : "", entry.proxy ? "Proxy" : ""].filter(Boolean).join(", ");
  return (
    <div data-key={key} role="option" aria-selected={active} className={active ? "sline active" : "sline"} aria-label={`${label}, ${entry.quantity}`}
      onClick={(event) => { event.stopPropagation(); store.pickRow(entry, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey }); }}
      onDoubleClick={(event) => { event.stopPropagation(); copyDialog(store, entry); }} {...entryMenu(store, entry)}>
      <span className="sl-name"><CopyPips entry={entry} regular /></span>
      <span className="sl-qty">{entry.quantity}</span>
    </div>
  );
}

/** Pips for a copy: finish, condition and language when not NM English, Proxy, and how many are for trade. */
function CopyPips({ entry, regular = false }: { entry: CollectionEntry; regular?: boolean }) {
  return (
    <>
      {regular ? <FinishPip finish={entry.foil} promoTypes={entry.promo_types} /> : <FinishBadge finish={entry.foil} promoTypes={entry.promo_types} />}
      {entry.condition !== "NM" && <span className="badge" title={conditionName(entry.condition)}>{entry.condition}</span>}
      {entry.language !== "en" && <span className="badge" title={languageName(entry.language)}>{entry.language.toUpperCase()}</span>}
      {entry.proxy && <span className="badge proxy">Proxy</span>}
      {entry.trade > 0 && <span className="badge trade" title={`${entry.trade} for trade`}>T{entry.trade}</span>}
    </>
  );
}

/**
 * One picture for a printing, with pips on it for the count, finish and other copy details. When the printing is held
 * as more than one kind of copy, a line for each sits under it to pick one. No prices are shown on pictures; the List
 * layout has them. Clicking the picture selects the first copy. Used by the binder and the grid.
 */
function Stack({ entries }: { entries: CollectionEntry[] }) {
  const store = useApp();
  const first = entries[0]!;
  const active = entries.some((entry) => store.checked.has(entryKey(entry)));
  const count = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const split = entries.length > 1;
  return (
    <div className={active ? "stackcell active" : "stackcell"}>
      <div className={active ? "pocket active" : "pocket"} data-key={split ? undefined : entryKey(first)} role={split ? undefined : "option"} aria-selected={split ? undefined : active}
        title={`${first.name}, ${first.set_name} ${first.collector_number}${first.collection_name ? `, in ${first.collection_name}` : ""}`}
        onClick={(event) => store.pickRow(first, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })}
        onDoubleClick={() => copyDialog(store, first)} {...entryMenu(store, first)}>
        {first.image_url ? <img src={first.image_url} alt={first.name} loading="lazy" draggable={false} /> : <span className="pocketname">{first.name}</span>}
      </div>
      <PipBar>
        <CountPip count={count} />
        {split ? entries.map((entry) => <FinishBadge key={entryKey(entry)} finish={entry.foil} promoTypes={entry.promo_types} />) : <CopyPips entry={first} />}
        {first.removed && <RemovedPip onChange={() => changeEntryPrinting(store, first)} />}
        <PricePip price={copyPrice(first, store.prefs.currency)} />
      </PipBar>
      {split && (
        <div className="slines" role="group" aria-label={`Copies of ${first.name} (${first.set_code.toUpperCase()}) ${first.collector_number}`}>
          {entries.map((entry) => <StackLine key={entryKey(entry)} entry={entry} />)}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 9;

/** Pages of nine card pictures, like a binder sheet, as large as the space allows. Page Up and Page Down turn the pages. */
function Binder() {
  const store = useApp();
  const stacks = useMemo(() => stacksOf(store.visibleCollection), [store.visibleCollection]);
  const pages = Math.max(1, Math.ceil(stacks.length / PAGE_SIZE));
  const page = Math.min(store.binderPage, pages - 1);
  const shown = stacks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const [area, size] = useSize<HTMLDivElement>();
  const [typed, setTyped] = useState("");
  const gap = store.phone ? 6 : 10;
  // three pockets across and down, as big as fits; the sheet adds its padding and border
  // each pocket keeps room for about three lines under its picture
  const lines = 54;
  const pocket = Math.max(60, Math.floor(Math.min((size.width - 2 * gap - 4 * gap) / 3, ((size.height - 2 * gap - 4 * gap - 3 * lines) / 3) * (63 / 88))));
  const go = (next: number) => store.setBinderPage(Math.max(0, Math.min(pages - 1, next)));
  return (
    <div className="binderwrap">
      <div className="binderarea" ref={area}>
        <div className="binder" role="listbox" aria-label={`Binder page ${page + 1} of ${pages}`}
          style={{ gridTemplateColumns: `repeat(3, ${pocket}px)`, gap, padding: gap }}>
          {shown.map((stack) => <Stack key={entryKey(stack[0]!)} entries={stack} />)}
          {Array.from({ length: PAGE_SIZE - shown.length }, (_, index) => <div key={`empty-${index}`} className="stackcell"><div className="pocket emptypocket" aria-hidden="true" /></div>)}
        </div>
      </div>
      <div className="binderpager">
        <button type="button" className="btn small" disabled={page === 0} onClick={() => go(0)}>First</button>
        <button type="button" className="btn small" disabled={page === 0} onClick={() => go(page - 1)}>Previous page</button>
        <span>Page <input className="pagebox" inputMode="numeric" aria-label="Page number" value={typed || String(page + 1)}
          onFocus={(event) => { setTyped(String(page + 1)); event.target.select(); }}
          onChange={(event) => setTyped(event.target.value.replace(/\D/g, ""))}
          onBlur={() => setTyped("")}
          onKeyDown={(event) => { if (event.key === "Enter") { go(Number(typed || page + 1) - 1); (event.target as HTMLInputElement).blur(); } }} /> of {pages}</span>
        <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => go(page + 1)}>Next page</button>
        <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => go(pages - 1)}>Last</button>
      </div>
    </div>
  );
}

const GRID_STEP = 60;
const GRID_WIDTHS: Record<GridSize, number> = { s: 120, m: 170, l: 240 };
const PHONE_COLUMNS: Record<GridSize, number> = { s: 4, m: 3, l: 2 };

/** Card pictures that fill the width; more load while scrolling. */
function Grid() {
  const store = useApp();
  const entries = useMemo(() => stacksOf(store.visibleCollection), [store.visibleCollection]);
  const [count, setCount] = useState(GRID_STEP);
  const end = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // a new filter, sort or collection starts again at the top
  useEffect(() => {
    setCount(GRID_STEP);
    list.current?.scrollTo({ top: 0 });
  }, [store.prefs.openCollection, store.collectionFilter, store.facets, store.prefs.collectionSort]);
  useEffect(() => {
    const element = end.current;
    if (!element) return;
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((item) => item.isIntersecting)) setCount((current) => Math.min(entries.length, current + GRID_STEP));
    }, { root: list.current, rootMargin: "600px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [entries.length, count]);
  const size = store.prefs.gridSize;
  const columns = store.phone ? `repeat(${PHONE_COLUMNS[size]}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${GRID_WIDTHS[size]}px, 1fr))`;
  return (
    <div className="gridwrap" ref={list}>
      <div className={`cardgrid size-${size}`} role="listbox" aria-label="Collection" aria-multiselectable="true" style={{ gridTemplateColumns: columns }}>
        {entries.slice(0, count).map((stack) => <Stack key={entryKey(stack[0]!)} entries={stack} />)}
      </div>
      {count < entries.length && <div ref={end} className="gridmore">Loading more cards</div>}
    </div>
  );
}

function CardsTab({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { visibleCollection, collection, checked, selectMode } = store;
  const pickedCards = (collection ?? []).filter((entry) => checked.has(entryKey(entry))).reduce((sum, entry) => sum + entry.quantity, 0);
  const currency = store.prefs.currency;
  const pictures = store.layout !== "list" && (collection?.length ?? 0) > 0 && visibleCollection.length > 0;
  const group = store.prefs.listGroups.collection;
  return (
    <>
      {collection !== null && collection.length > 0 && <ChipBar />}
      {(checked.size > 1 || selectMode) && (
        <div className="pickbar" role="toolbar" aria-label="Picked cards">
          <span><b>{checked.size}</b> picked ({pickedCards} {pickedCards === 1 ? "card" : "cards"})</span>
          <button type="button" className="btn small" onClick={store.pickAll}>Select all</button>
          <button type="button" className="btn small" disabled={!checked.size || (store.collections?.length ?? 0) < 2} onClick={() => moveDialog(store, store.pickedEntries())}>Move...</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.markTrade(store.pickedEntries(), true)}>For trade</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.markTrade(store.pickedEntries(), false)}>Not for trade</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.reducePicked()}>Reduce to 1</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.removePicked()}>Remove...</button>
          <button type="button" className="btn small" onClick={() => { store.setChecked(new Set()); store.setSelectMode(false); }}>Done</button>
        </div>
      )}
      {pictures && store.layout === "binder" && <Binder />}
      {pictures && store.layout === "grid" && <Grid />}
      {!pictures && <div className="list" role="listbox" aria-label="Collection" aria-multiselectable="true">
        {collection === null && <div className="emptynote">Loading the collection</div>}
        {collection !== null && collection.length === 0 && (
          <div className="empty">
            <Icon name="collection" />
            <b>Nothing in this collection yet</b>
            <span className="btnrow">
              <button type="button" className="btn primary" onClick={() => store.setView("cards")}>Search cards</button>
              <button type="button" className="btn" onClick={actions.importCollection?.run}>Import...</button>
            </span>
          </div>
        )}
        {collection !== null && collection.length > 0 && visibleCollection.length === 0 && <div className="emptynote">No rows match the filter tags</div>}
        {visibleCollection.length > 0 && <GroupedList view={`collection-${store.prefs.openCollection ?? ""}`} headed={group !== "none"} label="Collection cards"
          sections={groupList(visibleCollection, group, null, (entry) => copyPrice(entry, currency), (entry) => entry.quantity)}
          render={(entry) => {
          const key = entryKey(entry);
          const active = checked.has(key);
          const price = copyPrice(entry, currency);
          return (
            <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "row active" : "row"}
              onClick={(event) => store.pickRow(entry, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })} {...entryMenu(store, entry)}>
              {selectMode && <input type="checkbox" className="rowcheck" checked={active} readOnly aria-label={`Pick ${entry.name}`} />}
              <Thumb url={entry.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{entry.name}</b><ManaCost cost={entry.mana_cost} />{entry.custom && <span className="badge custom">Custom</span>}{entry.removed && <RemovedPip onChange={() => changeEntryPrinting(store, entry)} />}<FinishBadge finish={entry.foil} promoTypes={entry.promo_types} />
                  {entry.proxy && <span className="badge proxy" title="A proxy: kept apart from real copies, with no value">PROXY</span>}
                  {entry.trade > 0 && <span className="badge trade" title={`${entry.trade} of ${entry.quantity} for trade`}>FOR TRADE {entry.trade}</span>}</div>
                <Tags entry={entry} />
              </div>
              <span className="price" title={entry.proxy ? "Proxies have no value" : price === null ? "No price in the card database" : `${money(price, currency)} each`}>
                {entry.proxy ? "Proxy" : money(price === null ? null : price * entry.quantity, currency)}</span>
              <Quantity value={entry.quantity} name={entry.name} onChange={(quantity) => void store.setCollectionQuantity(entry, quantity)} />
              <button type="button" className="btn small icon-only" title={`Copy details of ${entry.name}`} aria-label={`Copy details of ${entry.name}`}
                onClick={(event) => { event.stopPropagation(); copyDialog(store, entry); }}><Icon name="edit" /></button>
              <button type="button" className="btn small icon-only" title={`Move ${entry.name}`} aria-label={`Move ${entry.name} to another collection`}
                disabled={(store.collections?.length ?? 0) < 2}
                onClick={(event) => { event.stopPropagation(); moveDialog(store, [entry]); }}><Icon name="move" /></button>
              <button type="button" className="btn small icon-only" title={`Remove ${entry.name}`} aria-label={`Remove ${entry.name} from collection`}
                onClick={(event) => { event.stopPropagation(); removeCard(store, entry.name, entry.quantity, (left) => void store.setCollectionQuantity(entry, left)); }}><Icon name="del" /></button>
              <EntryMenuButton menu={entryMenu(store, entry)} name={entry.name} />
            </div>
          );
        }} />}
      </div>}
    </>
  );
}

function NoSets({ current }: { current: Collection }) {
  const store = useApp();
  return (
    <div className="empty">
      <Icon name="progress" />
      <b>{current.name} is not linked to a set</b>
      <button type="button" className="btn primary" onClick={() => collectionDialog(store, current)}>Collection settings...</button>
    </div>
  );
}

function CompletionTab({ current }: { current: Collection }) {
  const store = useApp();
  const report = store.completion;
  if (!current.sets.length) return <NoSets current={current} />;
  if (!report) return <div className="emptynote">Working out set completion</div>;
  const { owned, total } = report.overall;
  const rule = COMPLETION_RULES.find(([id]) => id === report.completion)?.[1];
  const finish = FINISH_RULES.find(([id]) => id === report.finish)?.[1];
  return (
    <div className="list compwrap">
      <div className="stattile">
        <div className="stlabel">Overall completion</div>
        <div className="stvalue">{percent(owned, total)}%</div>
        <div className="stsub">{owned} of {total} owned, {total - owned} missing</div>
        <Meter owned={owned} total={total} label="Overall completion" />
      </div>
      <div className="rulesline">
        <span>{rule}. {finish}.</span>
        <button type="button" className="lnk" onClick={() => collectionDialog(store, current)}>Change rules</button>
        <button type="button" className="lnk" onClick={() => store.setCollectionTab("missing")}>Show missing cards</button>
      </div>
      <div className="meterlist" role="table" aria-label="Completion by set">
        <div className="mrow mhead" role="row"><span role="columnheader">Set</span><span role="columnheader">Owned</span><span role="columnheader" className="mnum">Owned of total</span></div>
        {blockGroups(report.sets).flatMap(([block, sets]) => [
          ...(block ? [<div className="mrow mblock" role="row" key={`block-${block}`}><span role="cell">{block}</span></div>] : []),
          ...withChildren(sets).map(({ set, child }) => (
          <div className={child ? "mrow mchild" : "mrow"} role="row" key={set.code}>
            <span role="cell" className="mname">{child && <span className="mtree" aria-hidden="true">└</span>}<SetIcon code={set.code} />{set.name} <span className="badge">{set.code.toUpperCase()}</span>{set.digital && <span className="badge">Digital</span>}</span>
            <span role="cell"><Meter owned={set.owned} total={set.total} label={`${set.name} completion`} /></span>
            <span role="cell" className="mnum">{set.owned} / {set.total} <b>{percent(set.owned, set.total)}%</b></span>
          </div>
        ))])}
      </div>

    </div>
  );
}

/** Child sets (promos, tokens, commander decks of a set) listed right under their parent set when both are in the list. */
export function withChildren(sets: SetProgress[]): Array<{ set: SetProgress; child: boolean }> {
  const codes = new Set(sets.map((set) => set.code));
  const childrenOf = new Map<string, SetProgress[]>();
  for (const set of sets) {
    if (set.parentSetCode && codes.has(set.parentSetCode) && set.parentSetCode !== set.code) childrenOf.set(set.parentSetCode, [...(childrenOf.get(set.parentSetCode) ?? []), set]);
  }
  const placed = new Set<string>();
  const out: Array<{ set: SetProgress; child: boolean }> = [];
  const add = (set: SetProgress, child: boolean) => {
    if (placed.has(set.code)) return;
    placed.add(set.code);
    out.push({ set, child });
    for (const item of childrenOf.get(set.code) ?? []) add(item, true);
  };
  for (const set of sets) if (!(set.parentSetCode && codes.has(set.parentSetCode))) add(set, false);
  for (const set of sets) add(set, true);
  return out;
}

/** Sets grouped by their block (sets without a block, or alone in theirs, are listed on their own), in the report's order. */
export function blockGroups(sets: SetProgress[]): Array<[string, SetProgress[]]> {
  // a child set goes with its parent's block, so it can be listed under its parent
  const byCode = new Map(sets.map((set) => [set.code, set]));
  const blockOf = (set: SetProgress) => (set.parentSetCode && byCode.get(set.parentSetCode)?.block) || set.block || "";
  const counts = new Map<string, number>();
  for (const set of sets) { const block = blockOf(set); if (block) counts.set(block, (counts.get(block) ?? 0) + 1); }
  const groups: Array<[string, SetProgress[]]> = [];
  for (const set of sets) {
    const own = blockOf(set);
    const block = own && (counts.get(own) ?? 0) > 1 ? own : "";
    const last = groups[groups.length - 1];
    const found = block ? groups.find(([name]) => name === block) : undefined;
    if (found) found[1].push(set);
    else if (!block && last && !last[0]) last[1].push(set);
    else groups.push([block, [set]]);
  }
  return groups;
}

function MissingTab({ current, actions }: { current: Collection; actions: Record<string, Action> }) {
  const store = useApp();
  const report = store.completion;
  const [set, setSet] = useState("");
  const [rarity, setRarity] = useState("");
  const [color, setColor] = useState("");
  const shown = useMemo(() => (report?.missing ?? []).filter((card) =>
    (!set || card.set_code === set) && (!rarity || card.rarity === rarity) &&
    (!color || (color === "C" ? !card.colors : card.colors.includes(color)))), [report, set, rarity, color]);
  if (!current.sets.length) return <NoSets current={current} />;
  if (!report) return <div className="emptynote">Working out missing cards</div>;
  return (
    <>
      <div className="filterbar">
        <Picker label="Filter missing cards by set" value={set} onChange={setSet}
          options={[{ value: "", label: "All linked sets" }, ...report.sets.map((item) => ({ value: item.code, label: item.name }))]} />
        <Picker label="Filter missing cards by rarity" value={rarity} onChange={setRarity}
          options={[{ value: "", label: "Any rarity" }, ...["common", "uncommon", "rare", "mythic", "special", "bonus"].map((value) => ({ value, label: capitalize(value) }))]} />
        <Picker label="Filter missing cards by color" value={color} onChange={setColor}
          options={choices([["", "Any color"], ["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"], ["C", "Colorless"]])} />
        <span className="phpos">{shown.length} of {report.missing.length} missing</span>
        <button type="button" className="btn small" onClick={actions.exportMissing?.run}>Export...</button>
        {current.kind !== "wishlist" && <button type="button" className="btn small" onClick={actions["wishlist.missing"]?.run}>Add all to wishlist</button>}
      </div>
      <div className="list" role="listbox" aria-label="Missing cards">
        {report.missing.length === 0 && (
          <div className="empty"><Icon name="progress" /><b>Nothing is missing</b><span>{current.name} is complete under its current rules.</span></div>
        )}
        {shown.map((card) => {
          const key = `missing:${card.id}:${card.needs}`;
          const active = store.selection?.key === key;
          const foil = card.needs === "foil" ? true : card.needs === "regular" ? false : undefined;
          return (
            <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "row active" : "row"}
              onClick={() => store.select({ view: "cards", key, printingId: card.id })}>
              <Thumb url={card.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{card.name}</b><ManaCost cost={card.mana_cost} />
                  {card.needs !== "any" && <span className={card.needs === "foil" ? "badge foil" : "badge"}>{card.needs === "foil" ? "FOIL NEEDED" : "REGULAR NEEDED"}</span>}</div>
                <div className="rowsub">{card.type_line}</div>
                <div className="rowmeta">{card.set_name} <span className="badge">{card.set_code.toUpperCase()}</span> {card.collector_number} <span className={`rar ${card.rarity}`}>{capitalize(card.rarity)}</span></div>
              </div>
              <div className="rowact show">
                <button type="button" className="btn small" title={`Add this printing to ${current.name}`}
                  onClick={(event) => { event.stopPropagation(); void store.addToCollection(card.id, card.name, current.id, foil); }}>+ Collection</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** All collections as one collection for the header: totals of every collection, wishlists only when chosen in Options. */
function allCollections(store: Store): Collection | null {
  const list = store.collections ?? [];
  if (!list.length) return null;
  const counted = list.filter((item) => store.prefs.allWishlists || item.kind !== "wishlist");
  const sum = (pick: (item: Collection) => number) => counted.reduce((total, item) => total + pick(item), 0);
  return {
    id: ALL_COLLECTIONS, name: "All collections", realName: "All collections", description: "", completion: "none", finish: "any", kind: "collection", sets: [],
    entryCount: sum((item) => item.entryCount), cardCount: sum((item) => item.cardCount), tradeCount: sum((item) => item.tradeCount),
    value: { usd: sum((item) => item.value.usd), eur: sum((item) => item.value.eur), unpricedUsd: sum((item) => item.value.unpricedUsd), unpricedEur: sum((item) => item.value.unpricedEur) },
    progress: null, role: "owner", owner: { id: store.user.id, name: store.user.name }, displayName: null, sharedWith: [],
  };
}

export function CollectionView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const current = store.allCollections ? allCollections(store) : store.collections?.find((item) => item.id === store.prefs.openCollection) ?? null;
  if (store.collections === null) return <div className="view"><div className="emptynote">Loading collections</div></div>;
  if (!current) {
    return (
      <div className="view" id="view-collection">
        <div id="pagetabs"><span className="phname">Collections</span></div>
        <div className="empty">
          <Icon name="collection" />
          <b>No collections yet</b>
          <button type="button" className="btn primary" onClick={actions["collection.new"]?.run}>New collection...</button>
        </div>
      </div>
    );
  }
  return (
    <div className="view" id="view-collection">
      <CollectionHeader current={current} actions={actions} />
      {(store.collectionTab === "cards" || (current.completion === "none" && store.collectionTab !== "stats")) && <CardsTab actions={actions} />}
      {store.collectionTab === "completion" && current.completion !== "none" && <CompletionTab current={current} />}
      {store.collectionTab === "missing" && current.completion !== "none" && <MissingTab current={current} actions={actions} />}
      {store.collectionTab === "stats" && (
        <StatsPanel stats={store.collectionStats} kind="collection" onFacet={(facet) => { store.setFacet({ ...ALL_FACETS, ...facet }); store.setCollectionTab("cards"); }} />
      )}
    </div>
  );
}
