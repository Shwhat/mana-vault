// ---------- collection view: cards, set completion and missing cards ----------
import { useMemo, useState } from "react";
import type { Action } from "../actions";
import { rowMenu } from "../components/ContextMenu";
import { collectionDialog, copyDialog, moveDialog } from "../components/LibraryDialogs";
import { Icon } from "../icons";
import { entryKey } from "../library-state";
import { type Store, useApp } from "../store";
import {
  capitalize, COLOR_NAMES, COMPLETION_RULES, conditionName, copyLabel, copyPrice, FINISH_RULES, FINISHES, type Collection, type CollectionEntry, type CollectionSort,
  type CollectionTab, type Facets, languageName, money,
} from "../types";
import { StatsPanel } from "./StatsView";
import { Quantity, Thumb } from "./Views";

const ALL_FACETS: Facets = { rarity: undefined, color: undefined, type: undefined, set: undefined, curve: undefined, finish: undefined, trade: undefined, inDeck: undefined, proxy: undefined };
const SORTS: Array<[CollectionSort, string]> = [
  ["name", "Name"], ["price-desc", "Price, highest first"], ["price-asc", "Price, lowest first"], ["quantity", "Quantity"], ["set", "Set and number"],
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
    <div className="rowmeta">{entry.set_name} {tag({ set: entry.set_code }, entry.set_code.toUpperCase(), "badge", `Show only cards from ${entry.set_name}`)} {entry.collector_number}{" "}
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

/** The menu of a collection row: right-click or long press. */
function entryMenu(store: Store, entry: CollectionEntry) {
  return rowMenu(store, entry.name, () => [
    { label: "Card page", run: () => store.setCardPage(entry.id) },
    { label: "Copy details...", run: () => copyDialog(store, entry) },
    (store.collections?.length ?? 0) > 1 && { label: "Move...", run: () => moveDialog(store, [entry]) },
    !entry.proxy && { label: entry.trade >= entry.quantity ? "Unmark for trade" : "Mark for trade", run: () => void store.markTrade([entry], entry.trade < entry.quantity) },
    !entry.proxy && { label: "Add to trade (you give)", run: () => store.giveEntry(entry) },
    !!store.deck && { label: `Add to ${store.deck.name}`, run: () => void store.addToDeck(entry.id, entry.name) },
    { label: "Remove", run: () => void store.setCollectionQuantity(entry, 0) },
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

function CollectionHeader({ current }: { current: Collection }) {
  const store = useApp();
  // a collection without a completion rule tracks no completion
  const tabs: Array<[CollectionTab, string]> = current.completion === "none"
    ? [["cards", "Cards"], ["stats", "Statistics"]]
    : [["cards", "Cards"], ["completion", "Completion"], ["missing", "Missing"], ["stats", "Statistics"]];
  const currency = store.prefs.currency;
  const isTarget = store.prefs.targetCollection === current.id;
  return (
    <div id="pagetabs" className="colhead">
      <select className="colpick" aria-label="Open collection" value={current.id} onChange={(event) => store.openCollection(event.target.value)}>
        {(store.collections ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="seg" role="tablist" aria-label="Collection view">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={store.collectionTab === id} className={store.collectionTab === id ? "on" : ""} onClick={() => store.setCollectionTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {isTarget
        ? <span className="badge main" title="Add to collection puts cards here">Adds here</span>
        : <button type="button" className="lnk" onClick={() => store.setTargetCollection(current.id)}>Add cards here</button>}
      {current.kind === "wishlist" && <span className="badge wish" title="Cards here are wanted, not owned">Wishlist</span>}
      {current.role === "member" && <span className="badge">Shared by {current.owner.name}</span>}
      {current.role === "owner" && current.sharedWith.length > 0 && <span className="badge">Shared with {current.sharedWith.map((person) => person.name).join(", ")}</span>}
      {store.collectionTab === "cards" && (
        <label className="searchbox">
          <Icon name="find" className="nicon" />
          <input value={store.collectionFilter} onChange={(event) => store.setCollectionFilter(event.target.value)} placeholder="Filter by card or set name" aria-label="Filter collection" />
        </label>
      )}
      {store.collectionTab === "cards" && (
        <button type="button" className={store.selectMode ? "btn small on" : "btn small"} aria-pressed={store.selectMode}
          onClick={() => { store.setSelectMode(!store.selectMode); if (store.selectMode) store.setChecked(new Set()); }}>Select</button>
      )}
      <span className="phpos" title={current.value[currency === "usd" ? "unpricedUsd" : "unpricedEur"] ? `${current.value[currency === "usd" ? "unpricedUsd" : "unpricedEur"]} cards have no price` : undefined}>
        {current.cardCount} cards
      </span>
    </div>
  );
}

function CardsBar() {
  const store = useApp();
  const current = store.collections?.find((item) => item.id === store.prefs.openCollection);
  const chips = facetLabels(store);
  const layout = store.prefs.collectionLayout;
  return (
    <div className="filterbar">
      <select aria-label="Sort collection" value={store.prefs.collectionSort} onChange={(event) => store.setPrefs({ collectionSort: event.target.value as CollectionSort })}>
        {SORTS.map(([value, label]) => <option key={value} value={value}>Sort: {label}</option>)}
      </select>
      <div className="seg" role="group" aria-label="Collection layout">
        <button type="button" className={layout === "list" ? "on" : ""} aria-pressed={layout === "list"} onClick={() => store.setPrefs({ collectionLayout: "list" })}>List</button>
        <button type="button" className={layout === "binder" ? "on" : ""} aria-pressed={layout === "binder"} onClick={() => store.setPrefs({ collectionLayout: "binder" })}>Binder</button>
      </div>
      <button type="button" className={store.facets.trade ? "btn small on" : "btn small"} aria-pressed={!!store.facets.trade}
        onClick={() => store.setFacet({ trade: !store.facets.trade })}>For trade only</button>
      <select aria-label="Filter by deck" value={store.facets.inDeck ?? ""} onChange={(event) => store.setFacet({ inDeck: (event.target.value || undefined) as Facets["inDeck"] })}>
        <option value="">In decks or not</option>
        <option value="yes">In a deck</option>
        <option value="no">Not in a deck</option>
      </select>
      {chips.map(([key, text]) => (
        <span className="chip" key={key}>{text}<button type="button" aria-label={`Remove filter ${text}`} onClick={() => store.setFacet({ [key]: undefined })}>×</button></span>
      ))}
      {chips.length > 1 && <button type="button" className="lnk" onClick={() => store.setFacet(ALL_FACETS)}>Clear tags</button>}
      <span className="phpos">{store.visibleCollection.length} of {store.collection?.length ?? 0} rows, {current?.kind === "wishlist" ? "wanted value" : "value"} {money(current?.value[store.prefs.currency] ?? 0, store.prefs.currency)}</span>
    </div>
  );
}

const PAGE_SIZE = 9;

/** Pages of nine card images, like a binder sheet. Page Up and Page Down turn the pages. */
function Binder() {
  const store = useApp();
  const entries = store.visibleCollection;
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.min(store.binderPage, pages - 1);
  const shown = entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const currency = store.prefs.currency;
  return (
    <div className="binderwrap">
      <div className="binder" role="listbox" aria-label={`Binder page ${page + 1} of ${pages}`}>
        {shown.map((entry) => {
          const key = entryKey(entry);
          const active = store.checked.has(key);
          const label = copyLabel(entry);
          return (
            <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "pocket active" : "pocket"}
              title={`${entry.name}, ${entry.set_name} ${entry.collector_number}${label ? `, ${label}` : ""}`}
              onClick={(event) => store.pickRow(entry, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })}
              onDoubleClick={() => copyDialog(store, entry)} {...entryMenu(store, entry)}>
              {entry.image_url ? <img src={entry.image_url} alt={entry.name} loading="lazy" /> : <span className="pocketname">{entry.name}</span>}
              {entry.foil > 0 && <span className="badge foil pocketfoil">{entry.foil === 2 ? "ETCHED" : "FOIL"}</span>}
              {entry.proxy && <span className="badge proxy pocketproxy">PROXY</span>}
              <span className="pocketqty">{entry.quantity}</span>
              {entry.trade > 0 && <span className="badge trade pockettrade">TRADE {entry.trade}</span>}
              <span className="pocketprice">{entry.proxy ? "Proxy" : money(copyPrice(entry, currency), currency)}</span>
            </div>
          );
        })}
        {Array.from({ length: PAGE_SIZE - shown.length }, (_, index) => <div key={`empty-${index}`} className="pocket emptypocket" aria-hidden="true" />)}
      </div>
      <div className="binderpager">
        <button type="button" className="btn small" disabled={page === 0} onClick={() => store.setBinderPage(page - 1)}>Previous page</button>
        <span>Page {page + 1} of {pages}</span>
        <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => store.setBinderPage(page + 1)}>Next page</button>
      </div>
    </div>
  );
}

function CardsTab({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { visibleCollection, collection, checked, selectMode } = store;
  const pickedCards = (collection ?? []).filter((entry) => checked.has(entryKey(entry))).reduce((sum, entry) => sum + entry.quantity, 0);
  const currency = store.prefs.currency;
  const binder = store.prefs.collectionLayout === "binder" && (collection?.length ?? 0) > 0;
  return (
    <>
      {collection !== null && collection.length > 0 && <CardsBar />}
      {(checked.size > 1 || selectMode) && (
        <div className="pickbar" role="toolbar" aria-label="Picked rows">
          <span><b>{checked.size}</b> picked ({pickedCards} {pickedCards === 1 ? "card" : "cards"})</span>
          <button type="button" className="btn small" onClick={store.pickAll}>Select all</button>
          <button type="button" className="btn small" disabled={!checked.size || (store.collections?.length ?? 0) < 2} onClick={() => moveDialog(store, store.pickedEntries())}>Move...</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.markTrade(store.pickedEntries(), true)}>For trade</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.markTrade(store.pickedEntries(), false)}>Not for trade</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.removePicked()}>Remove...</button>
          <button type="button" className="btn small" onClick={() => { store.setChecked(new Set()); store.setSelectMode(false); }}>Done</button>
        </div>
      )}
      {binder && <Binder />}
      {!binder && <div className="list" role="listbox" aria-label="Collection" aria-multiselectable="true">
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
        {visibleCollection.map((entry) => {
          const key = entryKey(entry);
          const active = checked.has(key);
          const price = copyPrice(entry, currency);
          return (
            <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "row active" : "row"}
              onClick={(event) => store.pickRow(entry, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })} {...entryMenu(store, entry)}>
              {selectMode && <input type="checkbox" className="rowcheck" checked={active} readOnly aria-label={`Pick ${entry.name}`} />}
              <Thumb url={entry.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{entry.name}</b>{entry.foil ? <span className="badge foil">{entry.foil === 2 ? "ETCHED" : "FOIL"}</span> : null}
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
                onClick={(event) => { event.stopPropagation(); void store.setCollectionQuantity(entry, 0); }}><Icon name="del" /></button>
            </div>
          );
        })}
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
        {report.sets.map((set) => (
          <div className="mrow" role="row" key={set.code}>
            <span role="cell" className="mname">{set.name} <span className="badge">{set.code.toUpperCase()}</span></span>
            <span role="cell"><Meter owned={set.owned} total={set.total} label={`${set.name} completion`} /></span>
            <span role="cell" className="mnum">{set.owned} / {set.total} <b>{percent(set.owned, set.total)}%</b></span>
          </div>
        ))}
      </div>

    </div>
  );
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
        <select aria-label="Filter missing cards by set" value={set} onChange={(event) => setSet(event.target.value)}>
          <option value="">All linked sets</option>
          {report.sets.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        <select aria-label="Filter missing cards by rarity" value={rarity} onChange={(event) => setRarity(event.target.value)}>
          <option value="">Any rarity</option>
          {["common", "uncommon", "rare", "mythic", "special", "bonus"].map((value) => <option key={value} value={value}>{capitalize(value)}</option>)}
        </select>
        <select aria-label="Filter missing cards by color" value={color} onChange={(event) => setColor(event.target.value)}>
          <option value="">Any color</option>
          {[["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"], ["C", "Colorless"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
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
                <div className="rowtitle"><b>{card.name}</b><span className="mana">{card.mana_cost}</span>
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

export function CollectionView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const current = store.collections?.find((item) => item.id === store.prefs.openCollection) ?? null;
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
      <CollectionHeader current={current} />
      {(store.collectionTab === "cards" || (current.completion === "none" && store.collectionTab !== "stats")) && <CardsTab actions={actions} />}
      {store.collectionTab === "completion" && current.completion !== "none" && <CompletionTab current={current} />}
      {store.collectionTab === "missing" && current.completion !== "none" && <MissingTab current={current} actions={actions} />}
      {store.collectionTab === "stats" && (
        <StatsPanel stats={store.collectionStats} kind="collection" onFacet={(facet) => { store.setFacet({ ...ALL_FACETS, ...facet }); store.setCollectionTab("cards"); }} />
      )}
    </div>
  );
}
