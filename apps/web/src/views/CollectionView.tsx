// ---------- collection view: cards, set completion and missing cards ----------
import { useMemo, useState } from "react";
import type { Action } from "../actions";
import { collectionDialog, moveDialog } from "../components/LibraryDialogs";
import { Icon } from "../icons";
import { entryKey } from "../library-state";
import { useApp } from "../store";
import { capitalize, COMPLETION_RULES, FINISH_RULES, type Collection, type CollectionTab } from "../types";
import { Quantity, Thumb } from "./Views";

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
  const tabs: Array<[CollectionTab, string]> = [["cards", "Cards"], ["completion", "Completion"], ["missing", "Missing"]];
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
      <span className="phpos">{current.entryCount} entries, {current.cardCount} cards</span>
    </div>
  );
}

function CardsTab({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { visibleCollection, collection, checked, selectMode } = store;
  const pickedCards = (collection ?? []).filter((entry) => checked.has(entryKey(entry))).reduce((sum, entry) => sum + entry.quantity, 0);
  return (
    <>
      {(checked.size > 1 || selectMode) && (
        <div className="pickbar" role="toolbar" aria-label="Picked rows">
          <span><b>{checked.size}</b> picked ({pickedCards} {pickedCards === 1 ? "card" : "cards"})</span>
          <button type="button" className="btn small" onClick={store.pickAll}>Select all</button>
          <button type="button" className="btn small" disabled={!checked.size || (store.collections?.length ?? 0) < 2} onClick={() => moveDialog(store, store.pickedEntries())}>Move...</button>
          <button type="button" className="btn small" disabled={!checked.size} onClick={() => void store.removePicked()}>Remove...</button>
          <button type="button" className="btn small" onClick={() => { store.setChecked(new Set()); store.setSelectMode(false); }}>Done</button>
        </div>
      )}
      <div className="list" role="listbox" aria-label="Collection" aria-multiselectable="true">
        {collection === null && <div className="emptynote">Loading the collection</div>}
        {collection !== null && collection.length === 0 && (
          <div className="empty">
            <Icon name="collection" />
            <b>Nothing in this collection yet</b>
            <span>Search the card database and add the printings you own, or import a collection CSV.</span>
            <span className="btnrow">
              <button type="button" className="btn primary" onClick={() => store.setView("cards")}>Search cards</button>
              <button type="button" className="btn" onClick={actions.importCollection?.run}>Import collection CSV...</button>
            </span>
          </div>
        )}
        {visibleCollection.map((entry) => {
          const key = entryKey(entry);
          const active = checked.has(key);
          return (
            <div key={key} data-key={key} role="option" aria-selected={active} className={active ? "row active" : "row"}
              onClick={(event) => store.pickRow(entry, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })}>
              {selectMode && <input type="checkbox" className="rowcheck" checked={active} readOnly aria-label={`Pick ${entry.name}`} />}
              <Thumb url={entry.image_url} />
              <div className="rowmain">
                <div className="rowtitle"><b>{entry.name}</b>{entry.foil ? <span className="badge foil">FOIL</span> : null}</div>
                <div className="rowmeta">{entry.set_name} <span className="badge">{entry.set_code.toUpperCase()}</span> {entry.collector_number} <span className={`rar ${entry.rarity}`}>{capitalize(entry.rarity)}</span></div>
              </div>
              <Quantity value={entry.quantity} name={entry.name} onChange={(quantity) => void store.setCollectionQuantity(entry, quantity)} />
              <button type="button" className="btn small icon-only" title={`Move ${entry.name}`} aria-label={`Move ${entry.name} to another collection`}
                disabled={(store.collections?.length ?? 0) < 2}
                onClick={(event) => { event.stopPropagation(); moveDialog(store, [entry]); }}><Icon name="move" /></button>
              <button type="button" className="btn small icon-only" title={`Remove ${entry.name}`} aria-label={`Remove ${entry.name} from collection`}
                onClick={(event) => { event.stopPropagation(); void store.setCollectionQuantity(entry, 0); }}><Icon name="del" /></button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function NoSets({ current }: { current: Collection }) {
  const store = useApp();
  return (
    <div className="empty">
      <Icon name="progress" />
      <b>{current.name} is not linked to a set</b>
      <span>Link one or more sets in the collection settings to see how much of each set you own and which cards are missing.</span>
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
  const unknown = report.completion === "main" && report.sets.some((set) => !set.known);
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
      {unknown && <p className="note pad">Some sets have no printed size yet, so Main set uses numbered cards that are not promos or variants. Update the card database to get printed sizes.</p>}
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
        <button type="button" className="btn small" onClick={actions.exportMissingText?.run}>Export text</button>
        <button type="button" className="btn small" onClick={actions.exportMissingCsv?.run}>Export CSV</button>
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
          <span>A collection holds the cards you own, such as a binder or a box. Link it to sets to track how much of each set you have.</span>
          <button type="button" className="btn primary" onClick={actions["collection.new"]?.run}>New collection...</button>
        </div>
      </div>
    );
  }
  return (
    <div className="view" id="view-collection">
      <CollectionHeader current={current} />
      {store.collectionTab === "cards" && <CardsTab actions={actions} />}
      {store.collectionTab === "completion" && <CompletionTab current={current} />}
      {store.collectionTab === "missing" && <MissingTab current={current} actions={actions} />}
    </div>
  );
}
