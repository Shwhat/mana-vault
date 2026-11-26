// ---------- trade view: saved trades, the two-column builder, the balance, wishlist matches and sharing ----------
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Action } from "../actions";
import { request } from "../api";
import { type CardSearch, type FoundCard, sortFound } from "../card-search";
import { CardResults, countLine, SortPicker, useViewSearch } from "../components/CardResults";
import { choices, type Choice, Picker } from "../components/Picker";
import { acceptTradeDialog, completeTradeDialog, newTradeDialog, renameTradeDialog, sendTradeDialog, shareBinderDialog } from "../components/TradeDialogs";
import { matchesFilters, useServerMatch } from "../filters";
import { Icon } from "../icons";
import { entryKey } from "../library-state";
import { useApp } from "../store";
import { FinishBadge } from "../components/CardMarks";
import { lineEach, sideTotal, type Trade, type TradeLine, type TradeMatch, type TradeSide } from "../trade-state";
import { CONDITIONS, type CollectionEntry, FINISHES, money, priceOf, type Person } from "../types";
import { Quantity, SearchOptions, Thumb } from "./Views";
import { buylistOf } from "../types";

const STATUS: Record<Trade["status"], string> = { open: "Open", done: "Done", cancelled: "Cancelled" };
const FINISH_CHOICES: Choice[] = FINISHES.map(([value, label]) => ({ value: String(value), label }));
const CONDITION_CHOICES = choices(CONDITIONS);

/** The trade picker: every saved trade, grouped by status, with whom and whose turn it is. */
function TradePicker() {
  const store = useApp();
  const options: Choice[] = (store.trades ?? []).map((trade) => ({
    value: trade.id, label: trade.name, group: STATUS[trade.status],
    detail: [trade.with ? `with ${trade.with.name}` : "", trade.status === "open" && trade.turn === "me" ? "your turn" : "",
      `${trade.lines.reduce((sum, line) => sum + line.quantity, 0)} cards`].filter(Boolean).join(", "),
  }));
  if (!options.length) return <span className="phname">Trades</span>;
  return <Picker id="trade-pick" className="switcher" label="Trade" value={store.openTradeId ?? ""} onChange={store.chooseTrade}
    options={store.openTradeId && !options.some((item) => item.value === store.openTradeId) ? [{ value: store.openTradeId, label: "Choose a trade" }, ...options] : options} />;
}

/** You give against you get: a bar split by value and the difference. */
function Balance({ trade }: { trade: Trade }) {
  const store = useApp();
  const currency = store.prefs.currency;
  const give = sideTotal(trade, "give", currency);
  const get = sideTotal(trade, "get", currency);
  const difference = get - give;
  const share = give + get > 0 ? (give / (give + get)) * 100 : 50;
  const unpriced = trade.lines.filter((line) => lineEach(line, currency) === null).length;
  return (
    <div className="tradebalance" role="group" aria-label="Trade balance">
      <span className="tbside"><b>You give</b> {money(give, currency)}</span>
      <span className="tbbar" aria-hidden="true"><span className="tbgive" style={{ width: `${share}%` }} /><span className="tbget" style={{ width: `${100 - share}%` }} /></span>
      <span className="tbside right"><b>You get</b> {money(get, currency)}</span>
      <span className="tbdiff">{!trade.lines.length ? "Add cards to both sides to compare them"
        : difference === 0 ? "Even trade" : `${money(Math.abs(difference), currency)} ${difference > 0 ? "in your favor" : "in their favor"}`}
        {unpriced ? `, ${unpriced} without a price` : ""}</span>
    </div>
  );
}

/** One line: picture, name, count, finish, condition, price (marked when typed in) and remove. */
function LineRow({ trade, line, editable }: { trade: Trade; line: TradeLine; editable: boolean }) {
  const store = useApp();
  const currency = store.prefs.currency;
  const market = priceOf(line, line.foil, currency);
  const [price, setPrice] = useState(line.price === null ? "" : String(line.price));
  const [savingSource, setSavingSource] = useState(false);
  const canEdit = editable && !savingSource;
  useEffect(() => setPrice(line.price === null ? "" : String(line.price)), [line.price]);
  const change = (next: Partial<TradeLine>) => void store.changeLine(trade, line, next);
  const savePrice = () => {
    const value = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (value !== null && (!Number.isFinite(value) || value < 0)) { setPrice(line.price === null ? "" : String(line.price)); return store.flash("A price is a number of 0 or more", "err"); }
    if (value !== line.price) change({ price: value });
  };
  return (
    <div className={`row tline2${line.price !== null ? " edited" : ""}`} data-key={`${line.side}:${line.cardId}`}>
      <Thumb url={line.image_url} />
      <div className="rowmain">
        <div className="rowtitle"><b>{line.name}</b><FinishBadge finish={line.foil} /></div>
        <div className="rowmeta">{line.set_name} <span className="badge">{line.set_code.toUpperCase()}</span> {line.collector_number}
          {line.collectionName && <span className="sub"> from {line.collectionName}</span>}</div>
        <div className="tlctl">
          <Quantity value={line.quantity} name={line.name} max={999} onChange={(quantity) => (canEdit ? change({ quantity: Math.max(0, quantity) }) : undefined)} />
          {trade.status === "open" && line.side === "give" && <Picker label={`Source collection for ${line.name}`} value={line.collectionId ?? ""}
            disabled={savingSource}
            options={[{ value: "", label: "Choose source collection", disabled: true }, ...(store.collections ?? []).filter((item) => item.kind === "collection")
              .map((item) => ({ value: item.id, label: item.name }))]}
            onChange={(collectionId) => { setSavingSource(true); void store.setTradeSource(trade, line, collectionId).finally(() => setSavingSource(false)); }} />}
          <Picker label={`Finish of ${line.name}`} value={String(line.foil)} disabled={!canEdit} options={FINISH_CHOICES}
            onChange={(value) => change({ foil: Number(value) as TradeLine["foil"] })} />
          <Picker label={`Condition of ${line.name}`} value={line.condition} disabled={!canEdit} options={CONDITION_CHOICES}
            onChange={(value) => change({ condition: value as TradeLine["condition"] })} />
          <label className="tprice" title={line.price !== null ? `Price changed by hand. Card database price: ${money(market, currency)}` : "Price each from the card database"}>
            <input inputMode="decimal" value={price} placeholder={market === null ? "No price" : market.toFixed(2)} disabled={!canEdit} aria-label={`Price each of ${line.name}`}
              onChange={(event) => setPrice(event.target.value)} onBlur={savePrice} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
            {line.price !== null && <span className="badge edited" title="Changed by hand">EDITED</span>}
          </label>
          {canEdit && line.price !== null && <button type="button" className="lnk" onClick={() => change({ price: null })}>Use card price</button>}
        </div>
      </div>
      <span className="price">{money((lineEach(line, currency) ?? 0) * line.quantity, currency)}
        {(() => { const buy = buylistOf(line, line.foil); return buy === null ? null : <span className="sub buyline" title="The highest buylist price of any store">Buylist {money(buy * line.quantity, currency)}</span>; })()}</span>
      {canEdit && <button type="button" className="btn small icon-only" title={`Remove ${line.name}`} aria-label={`Remove ${line.name} from the trade`}
        onClick={() => change({ quantity: 0 })}><Icon name="del" /></button>}
    </div>
  );
}

/** A local search over loaded rows, shaped like a card database search so the same result views show it. */
function useLocalSearch(cards: FoundCard[]): CardSearch {
  const [count, setCount] = useState(60);
  useEffect(() => setCount(60), [cards]);
  return useMemo(() => ({
    cards: cards.slice(0, count), total: cards.length, loading: false, error: "",
    more: () => setCount((value) => value + 60), refresh: () => undefined, owned: () => undefined, reload: () => undefined,
  }), [cards, count]);
}

/** Cards marked for trade, or every card when the switch is on, as search results for You give. */
function GiveSearch({ trade, editable }: { trade: Trade | null; editable: boolean }) {
  const store = useApp();
  const all = store.prefs.tradeAllCards;
  const [rows, setRows] = useState<CollectionEntry[] | null>(null);
  useEffect(() => {
    let active = true;
    setRows(null);
    request<CollectionEntry[]>(all ? "/api/library/cards" : "/api/trade").then((list) => { if (active) setRows(list); }).catch((reason) => store.fail(reason, "Could not load your cards."));
    return () => { active = false; };
    // reload when the switch changes or the collections change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, store.collections]);
  const filters = store.filterSets.tradeGive;
  const byKey = useMemo(() => new Map((rows ?? []).map((row) => [entryKey(row), row])), [rows]);
  const { ids: match } = useServerMatch(filters, store.prefs.currency);
  const cards = useMemo(() => (rows ?? []).filter((row) => matchesFilters(row, filters, match)).map((row): FoundCard => ({
    id: entryKey(row), name: row.name, mana_cost: row.mana_cost, mana_value: row.mana_value, type_line: row.type_line, oracle_text: null, set_code: row.set_code,
    set_name: row.set_name, collector_number: row.collector_number, rarity: row.rarity, colors: row.colors, image_url: row.image_url,
    prices: { usd: priceOf(row, row.foil, "usd"), usd_foil: null, usd_etched: null },
  })), [rows, filters, match]);
  const sort = store.prefs.searchSort.tradeGive;
  const sorted = useMemo(() => sortFound(cards, sort, filters.query, store.prefs.currency), [cards, sort, filters.query, store.prefs.currency]);
  const search = useLocalSearch(sorted);
  const give = (card: FoundCard) => { const row = byKey.get(card.id); if (row) store.giveEntry(row); };
  return (
    <SideSearch side="give" search={rows === null ? { ...search, loading: true } : search} trade={trade} editable={editable}
      extra={<label className="optcheck inline"><input type="checkbox" checked={all} onChange={() => store.setPrefs({ tradeAllCards: !all })} /> All cards, not only for trade</label>}
      onAdd={give} buttonText={(card) => {
        const row = byKey.get(card.id);
        return row ? `+ Give${all ? "" : ` (${row.trade} for trade)`}` : "+ Give";
      }}
      detail={(card) => byKey.get(card.id)?.collection_name ?? ""} />
  );
}

function GetSearch({ trade, editable }: { trade: Trade | null; editable: boolean }) {
  const store = useApp();
  // trade lines are printings, so the trade search lists every printing
  const search = useViewSearch(store.filterSets.tradeGet, store.view === "trade", "tradeGet", false);
  return <SideSearch side="get" search={search} trade={trade} editable={editable} onAdd={(card) => void store.getCard(card.id)} buttonText={() => "+ Get"} />;
}

function SideSearch({ side, search, trade, editable, onAdd, buttonText, extra, detail }: {
  side: TradeSide; search: CardSearch; trade: Trade | null; editable: boolean; onAdd: (card: FoundCard) => void; buttonText: (card: FoundCard) => string;
  extra?: ReactNode; detail?: (card: FoundCard) => string;
}) {
  const store = useApp();
  const scope = side === "give" ? "tradeGive" : "tradeGet";
  const filters = store.filterSets[scope];
  const can = editable || !trade;
  return (
    <div className="tsearch">
      <div className="tsearchbar">
        <label className="searchbox">
          <Icon name="find" className="nicon" />
          <input value={filters.query} onFocus={() => store.setTradeSide(scope)} onChange={(event) => store.setScopeFilters({ query: event.target.value }, scope)}
            placeholder={side === "give" ? "Search your cards" : "Search all cards"} aria-label={side === "give" ? "Search cards you give" : "Search cards you get"} />
        </label>
        <SortPicker scope={scope} />
        <span className="sub">{countLine(search)}</span>
      </div>
      {extra}
      <CardResults section="trade" search={search} layout={store.searchLayout} filters={filters} size={store.prefs.searchSize} label={side === "give" ? "Cards you can give" : "Cards you can get"}
        resetKey={filters} onPick={() => store.setTradeSide(scope)} onOpen={(card) => { if (can) onAdd(card); }}
        menu={(card) => [can && { label: side === "give" ? "Add to what you give" : "Add to what you get", run: () => onAdd(card) }]}
        buttons={(card) => (
          <>
            {detail?.(card) && <span className="sub tdetail">{detail(card)}</span>}
            <button type="button" className="btn small" disabled={!can} onClick={(event) => { event.stopPropagation(); onAdd(card); }}>{buttonText(card)}</button>
          </>
        )}
        empty={<b>{side === "give" && !store.prefs.tradeAllCards ? "No cards marked for trade match" : "No matching cards"}</b>} />
    </div>
  );
}

function Column({ side, trade, editable }: { side: TradeSide; trade: Trade | null; editable: boolean }) {
  const store = useApp();
  const currency = store.prefs.currency;
  const lines = (trade?.lines ?? []).filter((line) => line.side === side);
  const title = side === "give" ? "You give" : "You get";
  return (
    <section className="tradecol" aria-label={title}>
      <div className="tradehead"><b>{title}</b><span className="cnt">{lines.reduce((sum, line) => sum + line.quantity, 0)}</span>
        <span className="tradesum">{money(sideTotal(trade, side, currency), currency)}</span>
        <span className="sub buytotal" title="What stores pay for these cards: the highest buylist price of any store">Buylist {money(lines.reduce((sum, line) => sum + (buylistOf(line, line.foil) ?? 0) * line.quantity, 0), currency)}</span></div>
      <div className="tlines">
        {lines.length === 0 && <p className="note pad">No cards yet</p>}
        {trade && lines.map((line) => <LineRow key={`${line.side}:${line.cardId}:${line.foil}:${line.condition}:${line.language}:${line.collectionId ?? ""}`} trade={trade} line={line} editable={editable} />)}
      </div>
      {side === "give" ? <GiveSearch trade={trade} editable={editable} /> : <GetSearch trade={trade} editable={editable} />}
    </section>
  );
}

/** Cards other accounts mark for trade that your wishlists want, and your trade cards their wishlists want. */
function Matches() {
  const store = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) void store.reloadMatches(); }, [open, store.reloadMatches]);
  const currency = store.prefs.currency;
  const row = (match: TradeMatch, side: TradeSide) => (
    <div className="row" key={`${side}:${match.user.id}:${match.cardId}:${match.foil}:${match.condition}:${match.language}:${match.collectionId ?? ""}`}>
      <Thumb url={match.image_url} />
      <div className="rowmain">
        <div className="rowtitle"><b>{match.name}</b><FinishBadge finish={match.foil} /></div>
        <div className="rowmeta">{match.set_name} <span className="badge">{match.set_code.toUpperCase()}</span> {match.collector_number}
          <span className="sub"> {side === "get" ? `${match.user.name} has ${match.quantity}` : `${match.user.name} wants ${match.quantity}`}</span></div>
      </div>
      <span className="price">{money(priceOf(match, match.foil, currency), currency)}</span>
      <button type="button" className="btn small" disabled={!!store.openTrade && (store.openTrade.status !== "open" || (!!store.openTrade.with && !store.openTrade.collectionId))} onClick={() => void store.addLine({
        side, cardId: match.cardId, foil: match.foil, condition: match.condition, language: match.language, quantity: 1, price: null,
        collectionId: side === "give" ? match.collectionId : null, collectionName: side === "give" && match.collectionId ? store.collectionName(match.collectionId) : null,
        name: match.name, set_code: match.set_code, set_name: match.set_name, collector_number: match.collector_number, image_url: match.image_url,
        price_usd: match.price_usd, price_usd_foil: match.price_usd_foil, price_usd_etched: match.price_usd_etched
      })}>{side === "get" ? "+ Get" : "+ Give"}</button>
    </div>
  );
  return (
    <section className="tmatches">
      <button type="button" className="lnk" aria-expanded={open} onClick={() => setOpen(!open)}>Wishlist matches {open ? "▴" : "▾"}</button>
      {open && !store.matches && <p className="note pad">Looking for matches</p>}
      {open && store.matches && (
        <div className="tmatchcols">
          <div><h4>Others have cards you want <span className="cnt">{store.matches.theyHave.length}</span></h4>
            {store.matches.theyHave.length === 0 && <p className="note pad">No account marks a card for trade that your wishlists want</p>}
            {store.matches.theyHave.map((match) => row(match, "get"))}</div>
          <div><h4>Others want your trade cards <span className="cnt">{store.matches.theyWant.length}</span></h4>
            {store.matches.theyWant.length === 0 && <p className="note pad">No wishlist wants a card you marked for trade</p>}
            {store.matches.theyWant.map((match) => row(match, "give"))}</div>
        </div>
      )}
    </section>
  );
}

type BinderCard = Omit<TradeMatch, "user" | "collectionId">;

function OtherBinder() {
  const store = useApp();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [userId, setUserId] = useState("");
  const [cards, setCards] = useState<BinderCard[] | null>(null);
  const [error, setError] = useState(false);
  const { loadUsers, fail } = store;
  useEffect(() => {
    if (!open) return;
    let active = true;
    loadUsers().then((list) => { if (active) setPeople(list); }).catch((reason) => { if (active) fail(reason, "Could not load the account list."); });
    return () => { active = false; };
  }, [open, loadUsers, fail]);
  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setCards(null);
    setError(false);
    request<BinderCard[]>(`/api/trades/binder/${encodeURIComponent(userId)}`).then((list) => { if (active) setCards(list); })
      .catch((reason) => { if (active) { setError(true); fail(reason, "Could not load the trade binder."); } });
    return () => { active = false; };
  }, [open, userId, fail]);
  return (
    <section className="tmatches">
      <button type="button" className="lnk" aria-expanded={open} onClick={() => setOpen(!open)}>Browse trade binders {open ? "▴" : "▾"}</button>
      {open && <>
        <Picker label="Account trade binder" value={userId} options={[{ value: "", label: "Choose an account", disabled: true },
          ...people.map((person) => ({ value: String(person.id), label: person.name }))]} onChange={setUserId} />
        {userId && !cards && <p className="note pad">{error ? "Could not load the trade binder" : "Loading trade binder"}</p>}
        {userId && cards?.length === 0 && <p className="note pad">Nothing is marked for trade</p>}
        {userId && cards?.map((card) => <div className="row" key={`${card.cardId}:${card.foil}:${card.condition}:${card.language}`}>
          <Thumb url={card.image_url} />
          <div className="rowmain"><div className="rowtitle"><b>{card.name}</b><FinishBadge finish={card.foil} /></div>
            <div className="rowmeta">{card.set_name} ({card.set_code.toUpperCase()}) {card.collector_number}, {card.condition}, {card.language.toUpperCase()}, {card.quantity} available</div></div>
          <span className="price">{money(priceOf(card, card.foil, store.prefs.currency), store.prefs.currency)}</span>
          <button type="button" className="btn small" disabled={!!store.openTrade && (store.openTrade.status !== "open" || (!!store.openTrade.with && !store.openTrade.collectionId))}
            onClick={() => void store.addLine({ ...card, side: "get", quantity: 1, price: null, collectionId: null })}>+ Get</button>
        </div>)}
      </>}
    </section>
  );
}

export function TradeView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const trade = store.openTrade;
  const { reloadTrades } = store;
  useEffect(() => { void reloadTrades(); }, [reloadTrades]);
  const editable = !!trade && trade.status === "open" && (!trade.with || !!trade.collectionId);
  const proposal = !!trade?.with && trade.status === "open";
  const lines = trade?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  return (
    <div className="view" id="view-trade">
      <div id="pagetabs" className="colhead tradetop">
        <TradePicker />
        {trade && <span className={`badge status-${trade.status}`}>{STATUS[trade.status]}</span>}
        {trade?.with && <span className="badge">{trade.mine ? "Sent to" : "From"} {trade.with.name}</span>}
        {proposal && <span className={trade.turn === "me" ? "badge wish" : "badge"}>{trade.turn === "me" ? "Your turn" : "Waiting for an answer"}</span>}
        <span className="btnrow tcmds">
          <button type="button" className="btn small" onClick={() => newTradeDialog(store)}>New...</button>
          <button type="button" className="btn small" disabled={!trade || trade.status === "done"} onClick={() => trade && renameTradeDialog(store, trade)}>Rename...</button>
          <button type="button" className="btn small" disabled={actions["trade.cancel"]?.disabled} onClick={actions["trade.cancel"]?.run}>{actions["trade.cancel"]?.label === "Reopen trade" ? "Reopen" : "Cancel"}</button>
          <button type="button" className="btn small" disabled={actions["trade.delete"]?.disabled} onClick={actions["trade.delete"]?.run}>Delete...</button>
        </span>
        <SearchOptions />
        <span className="phpos">{trade ? `${lines} ${lines === 1 ? "card" : "cards"}, ${STATUS[trade.status].toLowerCase()}` : `${store.trades?.length ?? 0} saved trades`}</span>
      </div>
      <div className="tradebody">
        {!trade && (
          <div className="empty compact">
            <Icon name="trade" />
            <b>{store.trades?.length ? "Choose a trade or start a new one" : "No trades yet"}</b>
            <span className="btnrow"><button type="button" className="btn primary" onClick={() => newTradeDialog(store)}>New trade...</button>
              <button type="button" className="btn" onClick={() => shareBinderDialog(store)}>Share trade binder...</button></span>
          </div>
        )}
        {trade && <Balance trade={trade} />}
        {trade && (
          <div className="btnrow tradeacts">
            {!trade.with && trade.status === "open" && <button type="button" className="btn primary" disabled={!trade.lines.length} onClick={() => completeTradeDialog(store, trade)}>Complete trade...</button>}
            {!trade.with && trade.status === "open" && trade.mine && <button type="button" className="btn" onClick={() => void sendTradeDialog(store, trade)}>Send to another account...</button>}
            {proposal && trade.turn === "me" && <button type="button" className="btn primary" onClick={() => acceptTradeDialog(store, trade)}>Accept trade...</button>}
            {proposal && <button type="button" className="btn" onClick={() => void store.cancelTrade(trade)}>{trade.mine ? "Cancel trade" : "Decline"}</button>}
            <button type="button" className="btn" disabled={!trade.lines.length} onClick={() => void store.copyTrade(trade)}>Copy list</button>
            <button type="button" className="btn" disabled={!trade.lines.length} onClick={() => store.exportTrade(trade)}>Export...</button>
            <button type="button" className="btn" onClick={() => shareBinderDialog(store)}>Share trade binder...</button>
            {proposal && <Picker label="Cards you get go to" value={trade.collectionId ?? ""}
              options={[{ value: "", label: "Choose destination collection", disabled: true }, ...(store.collections ?? []).filter((item) => item.kind === "collection")
                .map((item) => ({ value: item.id, label: item.name }))]}
              onChange={(collectionId) => void store.setTradeCollection(trade, collectionId)} />}
          </div>
        )}
        {trade?.status === "done" && <p className="note pad">This trade is done{trade.doneAt ? ` (${new Date(`${String(trade.doneAt).replace(" ", "T")}${String(trade.doneAt).endsWith("Z") ? "" : "Z"}`).toLocaleString()})` : ""}.</p>}
        {proposal && !trade.collectionId && <p className="note pad">Choose where the cards you get go before changing the offer.</p>}
        <div className="tradecols">
          <Column side="give" trade={trade} editable={editable} />
          <Column side="get" trade={trade} editable={editable} />
        </div>
        <Matches />
        <OtherBinder />
      </div>
    </div>
  );
}
