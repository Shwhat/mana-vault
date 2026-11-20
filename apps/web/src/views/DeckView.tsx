// ---------- deck view: the deck builder (cards, ownership, statistics, playtest, description and history) ----------
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { Action } from "../actions";
import { request } from "../api";
import { renderMarkdown } from "../components/About";
import { rowMenu } from "../components/ContextMenu";
import { formatDialog, tagsDialog } from "../components/DeckDialogs";
import { linkDialog } from "../components/LibraryDialogs";
import { choosePrinting } from "../components/PrintingDialog";
import { Switcher } from "../components/Switcher";
import { cardPrice, checkDeck, type Legality, MANA_COLORS, manaBalance, sections, shuffle, ZONE_ORDER } from "../deck-rules";
import { Icon } from "../icons";
import { type Store, useApp, zoneLabel } from "../store";
import {
  COLOR_NAMES, copyLabel, type DeckCard, type DeckChange, type DeckGroup, type DeckSort, type DeckTab, type DeckToken, type DeckView as DeckViewKind,
  formatName, money, ZONES, type Zone,
} from "../types";
import { StatsPanel } from "./StatsView";
import { NoDeck, OwnershipTab, Quantity, SearchOptions, Thumb } from "./Views";
import type { CardSearch, FoundCard } from "../card-search";
import { CardResults, countLine, useViewSearch } from "../components/CardResults";
import { OptionsButton, Segments } from "../components/Options";
import { choices, type Choice, Picker } from "../components/Picker";
import { filterCount, matchesFilters } from "../filters";

type Hover = { url: string; x: number; y: number } | null;
type HoverProps = { onHover?: (url: string | null, event?: ReactMouseEvent) => void };

const GROUPS: Array<[DeckGroup, string]> = [["type", "Type"], ["mana", "Mana value"], ["color", "Color"], ["rarity", "Rarity"], ["tag", "Tag"], ["none", "None"]];
const SORTS: Array<[DeckSort, string]> = [["name", "Name"], ["mana", "Mana value"], ["price", "Price"]];
const VIEWS: Array<[DeckViewKind, string]> = [["list", "List"], ["text", "Text"], ["stacks", "Stacks"], ["grid", "Grid"]];
const ZONE_CHOICES: Choice[] = ZONES.map((zone) => ({ value: zone.id, label: zone.label }));

/** The commands for one deck card: right-click on the desktop, a long press on a phone. Also used by the Deck list panel. */
export function cardMenu(store: Store, card: DeckCard) {
  const missing = card.missing ?? 0;
  return rowMenu(store, card.name, () => [
    { label: "Card page", run: () => store.setCardPage(card.card_id) },
    { label: "Change printing...", run: () => choosePrinting(card.name, card.card_id, card.card_id, { currency: store.prefs.currency },
      (printing) => void store.changeDeckPrinting(card, printing)) },
    card.zone !== "maybeboard" && { label: "Link copies...", run: () => void linkDialog(store, card) },
    { label: "Tags...", run: () => tagsDialog(store, card) },
    ...ZONES.filter((zone) => zone.id !== card.zone).map((zone) => ({ label: `Move to ${zone.label}`, run: () => void store.moveDeckCard(card, zone.id) })),
    store.deck?.cover_card_id !== card.card_id && { label: "Use as cover card", run: () => void store.updateDeckInfo({ coverCardId: card.card_id }, `${card.name} is the cover card`) },
    missing > 0 && {
      label: "Add missing to wishlist",
      run: () => void store.addToWishlist([{ cardId: card.card_id, foil: 0, condition: "NM", language: "en", proxy: false, quantity: missing }], card.name),
    },
    { label: "Add to print list", run: () => void store.addToPrintList([{ card: { ...card, id: card.card_id }, count: card.quantity }], card.name) },
    { label: "Remove from deck", run: () => void store.setDeckQuantity(card, 0) },
  ]);
}

/** Selecting a deck card: the Card panel shows it, and on a phone its card page opens. */
const pick = (store: Store, card: DeckCard) => store.select({ view: "deck", key: String(card.entry_id), printingId: card.card_id });
const isActive = (store: Store, card: DeckCard) => store.selection?.view === "deck" && store.selection.key === String(card.entry_id);

function hoverHandlers(card: DeckCard, onHover?: HoverProps["onHover"]) {
  if (!onHover || !card.image_url) return {};
  return {
    onMouseEnter: (event: ReactMouseEvent) => onHover(card.image_url, event),
    onMouseMove: (event: ReactMouseEvent) => onHover(card.image_url, event),
    onMouseLeave: () => onHover(null),
  };
}

function Flag({ text }: { text?: string }) {
  return text ? <span className="badge illegal" title={text}>Not legal</span> : null;
}

/** A full row: picture, name, printing, linked copies, tags and the controls. */
function ListRow({ card, flag, onHover }: { card: DeckCard; flag?: string } & HoverProps) {
  const store = useApp();
  const key = String(card.entry_id);
  const missing = card.missing ?? 0;
  const currency = store.prefs.currency;
  const price = cardPrice(card, currency);
  return (
    <div data-key={key} role="option" aria-selected={isActive(store, card)} className={isActive(store, card) ? "row active" : "row"}
      onClick={() => pick(store, card)} {...cardMenu(store, card)}>
      <Thumb url={card.image_url} />
      <div className="rowmain" {...hoverHandlers(card, onHover)}>
        <div className="rowtitle"><b>{card.name}</b>{card.custom && <span className="badge custom">Custom</span>}<span className="mana">{card.mana_cost}</span><Flag text={flag} /></div>
        <div className="rowsub">{card.type_line}</div>
        <div className="rowmeta">{card.set_name} <span className="badge">{card.set_code.toUpperCase()}</span> {card.collector_number}</div>
        <div className="rowtags">
          {(card.tags ?? []).map((tag) => (
            <button key={tag} type="button" className="tag badge dtag" title={`Group by tag (${tag})`}
              onClick={(event) => { event.stopPropagation(); store.setPrefs({ deckGroup: "tag" }); }}>{tag}</button>
          ))}
          {(card.links ?? []).map((link) => (
            <button key={`${link.collectionId}:${link.cardId}:${link.foil}:${link.condition}:${link.language}:${link.proxy ? 1 : 0}`} type="button" className="tag badge col"
              title={`${link.quantity} from ${link.collectionName}${copyLabel(link) ? `, ${copyLabel(link)}` : ""}`}
              onClick={(event) => { event.stopPropagation(); store.openCollection(link.collectionId); store.setView("collection"); }}>
              {link.collectionName}{link.quantity > 1 ? ` ×${link.quantity}` : ""}</button>
          ))}
          {(card.links ?? []).some((link) => link.proxy) && <span className="badge proxy">PROXY</span>}
          {missing > 0 && <span className="badge miss">Missing{missing < card.quantity ? ` ${missing}` : ""}</span>}
          {missing > 0 && (
            <button type="button" className="tag badge wish" title={`Add ${missing} ${card.name} to your wishlist`}
              onClick={(event) => {
                event.stopPropagation();
                void store.addToWishlist([{ cardId: card.card_id, foil: 0, condition: "NM", language: "en", proxy: false, quantity: missing }], card.name);
              }}>+ Wishlist</button>
          )}
        </div>
      </div>
      <span className="price">{money(price === null ? null : price * card.quantity, currency)}</span>
      {card.zone !== "maybeboard" && (
        <button type="button" className="btn small icon-only" title={`Link copies of ${card.name}`} aria-label={`Link copies of ${card.name}`}
          onClick={(event) => { event.stopPropagation(); void linkDialog(store, card); }}><Icon name="link" /></button>
      )}
      <Quantity value={card.quantity} name={card.name} max={100} onChange={(quantity) => void store.setDeckQuantity(card, quantity)} />
      <span onClick={(event) => event.stopPropagation()}>
        <Picker className="zonesel" label={`Move ${card.name} to zone`} value={card.zone}
          onChange={(value) => void store.moveDeckCard(card, value as Zone)} options={ZONE_CHOICES} />
      </span>
      <button type="button" className="btn small icon-only" title={`Remove ${card.name}`} aria-label={`Remove ${card.name} from deck`}
        onClick={(event) => { event.stopPropagation(); void store.setDeckQuantity(card, 0); }}><Icon name="del" /></button>
    </div>
  );
}

/** A compact line: count, name, mana cost and price. */
function TextRow({ card, flag, onHover }: { card: DeckCard; flag?: string } & HoverProps) {
  const store = useApp();
  const currency = store.prefs.currency;
  const price = cardPrice(card, currency);
  return (
    <div data-key={String(card.entry_id)} role="option" aria-selected={isActive(store, card)}
      className={`tline${isActive(store, card) ? " active" : ""}${flag ? " bad" : ""}${(card.missing ?? 0) > 0 ? " miss" : ""}`}
      title={flag} onClick={() => pick(store, card)} {...cardMenu(store, card)} {...hoverHandlers(card, onHover)}>
      <span className="tq">{card.quantity}</span>
      <span className="tn">{card.name}</span>
      <span className="mana">{card.mana_cost}</span>
      <span className="tp">{money(price === null ? null : price * card.quantity, currency)}</span>
    </div>
  );
}

/** A card picture with its count, used by Stacks and Grid. */
function Picture({ card, flag }: { card: DeckCard; flag?: string }) {
  const store = useApp();
  return (
    <div data-key={String(card.entry_id)} role="option" aria-selected={isActive(store, card)}
      className={`dcard${isActive(store, card) ? " active" : ""}${flag ? " bad" : ""}`} title={flag ? `${card.name}: ${flag}` : card.name}
      onClick={() => pick(store, card)} {...cardMenu(store, card)}>
      {card.image_url ? <img src={card.image_url} alt={card.name} loading="lazy" draggable={false} /> : <span className="pocketname">{card.name}</span>}
      {card.quantity > 1 && <span className="pocketqty">{card.quantity}</span>}
      {(card.missing ?? 0) > 0 && <span className="badge miss dmiss">Missing</span>}
    </div>
  );
}

function Board({ zone, cards, legality, onHover }: { zone: Zone; cards: DeckCard[]; legality: Legality } & HoverProps) {
  const store = useApp();
  const { deckView: view, deckGroup, deckSort, currency } = store.prefs;
  const list = sections(cards, zone === "commander" ? "none" : deckGroup, deckSort, currency);
  // the commander zone and ungrouped lists have no group headings
  const headed = zone !== "commander" && deckGroup !== "none";
  const count = cards.reduce((sum, card) => sum + card.quantity, 0);
  const flag = (card: DeckCard) => legality.flagged.get(card.entry_id);
  return (
    <section className="board" aria-label={zoneLabel(zone)}>
      <div className="boardhead">{zoneLabel(zone)} <span className="cnt">{count}</span></div>
      {view === "stacks" && (
        <div className="stacks">
          {list.map((section) => (
            <div className="stack" key={section.key}>
              {headed && <div className="grouphead">{section.label} <span className="cnt">{section.count}</span></div>}
              <div className="stackcards">{section.cards.map((card) => <Picture key={card.entry_id} card={card} flag={flag(card)} />)}</div>
            </div>
          ))}
        </div>
      )}
      {view === "grid" && list.map((section) => (
        <div key={section.key}>
          {headed && <div className="grouphead">{section.label} <span className="cnt">{section.count}</span></div>}
          <div className="dgrid">{section.cards.map((card) => <Picture key={card.entry_id} card={card} flag={flag(card)} />)}</div>
        </div>
      ))}
      {view === "text" && (
        <div className="tcols">
          {list.map((section) => (
            <div className="tgroup" key={section.key}>
              {headed && <div className="grouphead">{section.label} <span className="cnt">{section.count}</span></div>}
              {section.cards.map((card) => <TextRow key={card.entry_id} card={card} flag={flag(card)} onHover={onHover} />)}
            </div>
          ))}
        </div>
      )}
      {view === "list" && list.map((section) => (
        <div key={section.key}>
          {headed && <div className="grouphead">{section.label} <span className="cnt">{section.count}</span></div>}
          {section.cards.map((card) => <ListRow key={card.entry_id} card={card} flag={flag(card)} onHover={onHover} />)}
        </div>
      ))}
    </section>
  );
}

/** Quick add: a card name with an optional count, such as 2 Sol Ring, added to the chosen zone. Names are suggested while typing. */
function QuickAdd() {
  const store = useApp();
  const [text, setText] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const zone = store.prefs.zone;
  useEffect(() => {
    const name = text.replace(/^\s*\d+\s*x?\s+/i, "").replace(/\s*[[(].*$/, "").trim();
    if (name.length < 2) {
      setNames([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      request<Array<{ name: string }>>(`/api/cards?q=${encodeURIComponent(name)}`, { signal: controller.signal })
        .then((found) => setNames([...new Set(found.map((card) => card.name))].slice(0, 8)))
        .catch(() => undefined);
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [text]);
  const count = /^\s*(\d+)\s*x?\s+/i.exec(text)?.[1];
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await store.quickAdd(text, zone)) setText("");
    setBusy(false);
  };
  return (
    <form className="quickadd" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <input id="quickadd" list="quicknames" value={text} onChange={(event) => setText(event.target.value)} placeholder="Add a card: 2 Sol Ring" aria-label="Quick add"
        autoComplete="off" />
      <datalist id="quicknames">{names.map((name) => <option key={name} value={count ? `${count} ${name}` : name} />)}</datalist>
      <Picker id="quickzone" label="Add to zone" value={zone} onChange={(value) => store.setPrefs({ zone: value as Zone })} options={ZONE_CHOICES} />
      <button type="submit" className="btn small primary" disabled={busy || !text.trim()}>Add</button>
    </form>
  );
}

function LegalityBar({ legality, format }: { legality: Legality; format: string }) {
  const store = useApp();
  const [open, setOpen] = useState(false);
  if (!legality.checked) return null;
  const errors = legality.problems.filter((item) => item.level === "err").length;
  if (!legality.problems.length) return <div className="legalbar ok"><Icon name="legal" className="nicon" /> Legal in {formatName(format)}</div>;
  return (
    <div className={errors ? "legalbar bad" : "legalbar warn"}>
      <button type="button" className="lnk" aria-expanded={open} onClick={() => setOpen(!open)}>
        {errors ? `Not legal in ${formatName(format)}: ${errors} ${errors === 1 ? "problem" : "problems"}` : `${legality.problems.length} to check`} {open ? "▴" : "▾"}</button>
      {open && (
        <ul>
          {legality.problems.map((item, index) => (
            <li key={index} className={item.level}>
              {item.entries.length ? (
                <button type="button" className="lnk" onClick={() => {
                  const card = store.deck?.cards.find((other) => other.entry_id === item.entries[0]);
                  if (card) pick(store, card);
                }}>{item.text}</button>
              ) : item.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tokens() {
  const store = useApp();
  const [tokens, setTokens] = useState<DeckToken[]>([]);
  const deckId = store.deck?.id;
  const updated = store.deck?.updated_at;
  useEffect(() => {
    if (!deckId) return;
    let live = true;
    request<DeckToken[]>(`/api/decks/${encodeURIComponent(deckId)}/tokens`).then((list) => { if (live) setTokens(list); }).catch(() => undefined);
    return () => { live = false; };
  }, [deckId, updated]);
  if (!tokens.length) return null;
  return (
    <section className="board" aria-label="Tokens">
      <div className="boardhead">Tokens <span className="cnt">{tokens.length}</span></div>
      <div className="dgrid tokens">
        {tokens.map((token) => (
          <div key={`${token.id}-${token.name}`} className="dcard" title={`${token.name}: made by ${token.from.join(", ")}`} onClick={() => store.setCardPage(token.id)}>
            {token.image_url ? <img src={token.image_url} alt={token.name} loading="lazy" draggable={false} /> : <span className="pocketname">{token.name}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** View, group, sort and Edit as text for the Cards tab, with a count of active filters. */
function DeckOptions({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { deckView: view, deckGroup, deckSort } = store.prefs;
  return (
    <OptionsButton title="Deck options" count={filterCount(store.filterSets.deck, true)}>
      <div className="prow"><label>View</label><Segments label="Show cards as" value={view} options={VIEWS} onChange={(deckView) => store.setPrefs({ deckView })} /></div>
      <div className="prow"><label htmlFor="deck-group">Group</label>
        <Picker id="deck-group" label="Group by" value={deckGroup} onChange={(value) => store.setPrefs({ deckGroup: value as DeckGroup })} options={choices(GROUPS)} /></div>
      <div className="prow"><label htmlFor="deck-sort">Sort</label>
        <Picker id="deck-sort" label="Sort by" value={deckSort} onChange={(value) => store.setPrefs({ deckSort: value as DeckSort })} options={choices(SORTS)} /></div>
      {filterCount(store.filterSets.deck, true) > 0 && (
        <div className="prow"><label>Filters</label><button type="button" className="btn small" onClick={() => store.clearFilters("deck")}>Clear filters</button></div>
      )}
      <div className="btnrow"><button type="button" className="btn small" onClick={actions["deck.editText"]?.run}>Edit as text...</button></div>
    </OptionsButton>
  );
}

/** The deck's cards, by zone, filtered by the deck's filter box and Filters panel. */
function CardsTab({ actions, legality, cards }: { actions: Record<string, Action>; legality: Legality; cards: DeckCard[] }) {
  const store = useApp();
  const deck = store.deck!;
  const [hover, setHover] = useState<Hover>(null);
  const onHover = store.phone ? undefined : (url: string | null, event?: ReactMouseEvent) => setHover(url && event ? { url, x: event.clientX, y: event.clientY } : null);
  return (
    <>
      <LegalityBar legality={legality} format={deck.format} />
      <div className="list deckbody" role="listbox" aria-label="Deck cards" onScroll={() => setHover(null)}>
        {deck.cards.length === 0 && (
          <div className="empty">
            <Icon name="deck" />
            <b>This deck is empty</b>
            <span className="btnrow">
              <button type="button" className="btn primary" onClick={() => store.setDeckTab("add")}>Add cards</button>
              <button type="button" className="btn" onClick={actions.importDeck?.run}>Import decklist...</button>
            </span>
          </div>
        )}
        {deck.cards.length > 0 && cards.length === 0 && <div className="emptynote">No deck cards match the filters</div>}
        {ZONE_ORDER.map((zone) => {
          const inZone = cards.filter((card) => card.zone === zone);
          return inZone.length ? <Board key={zone} zone={zone} cards={inZone} legality={legality} onHover={onHover} /> : null;
        })}
        {cards.length === deck.cards.length && <Tokens />}
      </div>
      {hover && (
        <img className="hoverpreview" src={hover.url} alt="" aria-hidden="true"
          style={{ left: hover.x + 260 + 24 > window.innerWidth ? hover.x - 284 : hover.x + 24, top: Math.max(8, Math.min(hover.y - 120, window.innerHeight - 372)) }} />
      )}
    </>
  );
}

const ADD_BUTTONS: Array<[Zone, string]> = [["main", "Main"], ["sideboard", "Side"], ["maybeboard", "Maybe"], ["commander", "Commander"]];

/** The Add tab: Quick add, Edit as text and a full card search; each result adds to Main, Side, Maybe or Commander. */
function AddTab({ actions, search }: { actions: Record<string, Action>; search: CardSearch }) {
  const store = useApp();
  const deck = store.deck!;
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of deck.cards) map.set(`${card.oracle_id}:${card.zone}`, (map.get(`${card.oracle_id}:${card.zone}`) ?? 0) + card.quantity);
    return map;
  }, [deck.cards]);
  const inDeck = (card: FoundCard, zone: Zone) => counts.get(`${card.oracle_id ?? ""}:${zone}`) ?? 0;
  const add = (card: FoundCard, zone: Zone) => void store.addToDeck(card.id, card.name, undefined, { zone });
  return (
    <>
      <div className="deckbar">
        <QuickAdd />
        <button type="button" className="btn small" onClick={actions["deck.editText"]?.run}>Edit as text...</button>
      </div>
      <CardResults
        search={search} layout={store.searchLayout} size={store.prefs.searchSize} label="Cards to add" resetKey={store.filterSets.deckAdd}
        activeId={store.selection?.view === "cards" ? store.selection.key : null}
        onPick={(card) => store.select({ view: "cards", key: card.id, printingId: card.id })}
        onOpen={(card) => add(card, store.prefs.zone)}
        menu={(card) => [
          { label: "Card page", run: () => store.setCardPage(card.id) },
          ...ADD_BUTTONS.map(([zone]) => ({ label: `Add to ${zoneLabel(zone)}`, run: () => add(card, zone) })),
          { label: "Add to wishlist", run: () => void store.addToWishlist([{ cardId: card.id, foil: 0, condition: "NM", language: "en", proxy: false, quantity: 1 }], card.name) },
        ]}
        onTag={(change) => store.setScopeFilters(change, "deckAdd")}
        buttons={(card) => ADD_BUTTONS.map(([zone, text]) => {
          const count = inDeck(card, zone);
          return (
            <button key={zone} type="button" className={count ? "btn small on" : "btn small"} title={`Add to ${zoneLabel(zone)}${count ? ` (${count} in the deck)` : ""}`}
              aria-label={`Add ${card.name} to ${zoneLabel(zone)}`}
              onClick={(event) => { event.stopPropagation(); add(card, zone); }}>+ {text}{count ? <span className="cbadge">{count}</span> : null}</button>
          );
        })}
        empty={<b>No matching cards</b>}
      />
    </>
  );
}

/** Colored mana symbols in the spells' costs beside the cards that can make each color. */
function ManaBalance({ cards }: { cards: DeckCard[] }) {
  const { pips, sources } = manaBalance(cards);
  const colors = MANA_COLORS.filter((color) => pips[color] || sources[color]);
  const max = Math.max(1, ...colors.map((color) => Math.max(pips[color]!, sources[color]!)));
  const totalPips = colors.reduce((sum, color) => sum + pips[color]!, 0);
  if (!colors.length) return null;
  return (
    <section className="chartcard wide" aria-label="Mana symbols and sources">
      <h4>Mana symbols and sources</h4>
      <div className="manatable" role="table" aria-label="Mana symbols and sources">
        <div className="mtrow mthead" role="row"><span role="columnheader">Color</span><span role="columnheader">Symbols in costs</span><span role="columnheader">Cards that make it</span></div>
        {colors.map((color) => (
          <div className="mtrow" role="row" key={color}>
            <span role="cell">{COLOR_NAMES[color] ?? color}</span>
            <span role="cell" className="bartrack"><span className="barfill" style={{ width: `${(pips[color]! / max) * 100}%` }} />
              <span className="barfig">{pips[color]}{totalPips ? ` (${Math.round((pips[color]! / totalPips) * 100)}%)` : ""}</span></span>
            <span role="cell" className="bartrack"><span className="barfill" style={{ width: `${(sources[color]! / max) * 100}%` }} /><span className="barfig">{sources[color]}</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}

type Playing = { uid: number; card: DeckCard; tapped?: boolean };

/** Shuffle, draw an opening hand, mulligan, draw and play cards. Nothing here changes the deck. */
function Playtest() {
  const store = useApp();
  const deck = store.deck!;
  const library0 = useMemo(() => {
    let uid = 0;
    return deck.cards.filter((card) => card.zone === "main").flatMap((card) => Array.from({ length: card.quantity }, () => ({ uid: uid++, card })));
  }, [deck.cards]);
  const commanders = deck.cards.filter((card) => card.zone === "commander");
  const [state, setState] = useState<Game>(() => start(library0, 0));
  useEffect(() => setState(start(library0, 0)), [library0]);
  const { library, hand, field, graveyard, turn, mulligans, bottom } = state;
  const draw = (count = 1) => setState((current) => ({ ...current, hand: [...current.hand, ...current.library.slice(0, count)], library: current.library.slice(count) }));
  const fromHand = (item: Playing) => setState((current) => current.bottom > 0
    ? { ...current, hand: current.hand.filter((other) => other !== item), library: [...current.library, item], bottom: current.bottom - 1 }
    : { ...current, hand: current.hand.filter((other) => other !== item), field: [...current.field, item] });
  const tap = (item: Playing) => setState((current) => ({ ...current, field: current.field.map((other) => (other === item ? { ...other, tapped: !other.tapped } : other)) }));
  const toGraveyard = (item: Playing) => setState((current) => ({ ...current, field: current.field.filter((other) => other !== item), graveyard: [...current.graveyard, item] }));
  const picture = (item: Playing, onClick: () => void, extra?: ReactNode) => (
    <div key={item.uid} className={item.tapped ? "ptcard tapped" : "ptcard"} title={item.card.name} onClick={onClick}>
      {item.card.image_url ? <img src={item.card.image_url} alt={item.card.name} draggable={false} /> : <span className="pocketname">{item.card.name}</span>}
      {extra}
    </div>
  );
  if (!library0.length) return <div className="empty"><Icon name="playtest" /><b>Add cards to the main deck to playtest</b></div>;
  return (
    <div className="list playtest">
      <div className="ptbar">
        <button type="button" className="btn small primary" onClick={() => setState(start(library0, 0))}>New game</button>
        <button type="button" className="btn small" onClick={() => setState(start(library0, mulligans + 1))}>Mulligan</button>
        <button type="button" className="btn small" disabled={!library.length} onClick={() => draw()}>Draw</button>
        <button type="button" className="btn small" disabled={!library.length}
          onClick={() => setState((current) => ({ ...current, turn: current.turn + 1, field: current.field.map((item) => ({ ...item, tapped: false })) }))}>Next turn</button>
        <span className="phpos">Turn {turn}, {library.length} in library{mulligans ? `, ${mulligans} ${mulligans === 1 ? "mulligan" : "mulligans"}` : ""}</span>
      </div>
      {bottom > 0 && <div className="legalbar warn">Choose {bottom} {bottom === 1 ? "card" : "cards"} from your hand to put on the bottom of the library</div>}
      {commanders.length > 0 && (
        <section><h4>Command zone</h4><div className="ptrow">{commanders.map((card) => picture({ uid: -card.entry_id, card }, () => store.setCardPage(card.card_id)))}</div></section>
      )}
      <section><h4>Battlefield <span className="cnt">{field.length}</span></h4>
        <div className="ptrow">{field.map((item) => picture(item, () => tap(item),
          <button type="button" className="ptx" title="Put into the graveyard" aria-label={`Put ${item.card.name} into the graveyard`}
            onClick={(event) => { event.stopPropagation(); toGraveyard(item); }}>×</button>))}</div>
      </section>
      <section><h4>Hand <span className="cnt">{hand.length}</span></h4>
        <div className="ptrow">{hand.map((item) => picture(item, () => fromHand(item)))}</div>
      </section>
      {graveyard.length > 0 && <section><h4>Graveyard <span className="cnt">{graveyard.length}</span></h4>
        <div className="ptrow small">{graveyard.map((item) => picture(item, () => undefined))}</div></section>}
    </div>
  );
}

/** A new game: the library shuffled and seven cards drawn. After a mulligan, that many cards go back to the bottom. */
type Game = { library: Playing[]; hand: Playing[]; field: Playing[]; graveyard: Playing[]; turn: number; mulligans: number; bottom: number };
function start(cards: Playing[], mulligans: number): Game {
  const library: Playing[] = shuffle(cards).map((item) => ({ ...item, tapped: false }));
  return { library: library.slice(7), hand: library.slice(0, 7), field: [] as Playing[], graveyard: [] as Playing[], turn: 1, mulligans, bottom: Math.min(7, mulligans) };
}

function Description() {
  const store = useApp();
  const deck = store.deck!;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(deck.description ?? "");
  useEffect(() => { if (!editing) setText(deck.description ?? ""); }, [deck.description, editing]);
  const cover = deck.cards.find((card) => card.card_id === deck.cover_card_id);
  return (
    <div className="list deckinfo">
      <div className="prow"><label htmlFor="deck-cover">Cover card</label>
        <Picker id="deck-cover" label="Cover card" value={deck.cover_card_id ?? ""}
          onChange={(value) => void store.updateDeckInfo({ coverCardId: value || null }, value ? "Cover card changed" : "Cover card removed")}
          options={[{ value: "", label: "The commander" }, ...[...new Map(deck.cards.map((card) => [card.card_id, card])).values()].sort((a, b) => a.name.localeCompare(b.name))
            .map((card) => ({ value: card.card_id, label: card.name, detail: card.set_code.toUpperCase() }))]} /></div>
      {(cover?.image_url ?? deck.image_url) && <img className="coverimg" src={cover?.image_url ?? deck.image_url ?? ""} alt="" />}
      <div className="prow"><label>Format</label><span><button type="button" className="lnk" onClick={() => formatDialog(store)}>{formatName(deck.format)}</button></span></div>
      <h4>Description</h4>
      {editing ? (
        <>
          <textarea className="desctext" aria-label="Deck description" value={text} onChange={(event) => setText(event.target.value)} />
          <div className="btnrow">
            <button type="button" className="btn primary" onClick={() => void store.updateDeckInfo({ description: text }, "Description saved").then((ok) => { if (ok) setEditing(false); })}>Save</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {deck.description ? <div className="abpage desc" dangerouslySetInnerHTML={{ __html: renderMarkdown(deck.description) }} /> : <p className="note">No description yet</p>}
          <div className="btnrow"><button type="button" className="btn" onClick={() => setEditing(true)}>Edit description</button></div>
        </>
      )}
    </div>
  );
}

function History() {
  const store = useApp();
  const [items, setItems] = useState<DeckChange[] | null>(null);
  const deckId = store.deck?.id;
  const updated = store.deck?.updated_at;
  useEffect(() => {
    if (!deckId) return;
    let live = true;
    request<DeckChange[]>(`/api/decks/${encodeURIComponent(deckId)}/history`).then((list) => { if (live) setItems(list); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [deckId, updated]);
  if (!items) return <div className="emptynote">Loading the history</div>;
  return (
    <div className="list" role="table" aria-label="Deck history">
      {items.length === 0 && <p className="note pad">No changes recorded yet</p>}
      {items.map((item) => (
        <div className="histrow" role="row" key={item.id}>
          <span role="cell" className="sub">{new Date(`${item.at.replace(" ", "T")}Z`).toLocaleString()}</span>
          <span role="cell" className="sub">{item.user}</span>
          <span role="cell">{item.change}</span>
        </div>
      ))}
    </div>
  );
}

export function DeckView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const { deck } = store;
  const legality = useMemo(() => checkDeck(deck?.format ?? "casual", deck?.cards ?? []), [deck?.format, deck?.cards]);
  const filters = store.filterSets.deck;
  const shown = useMemo(() => (deck?.cards ?? []).filter((card) => matchesFilters(card, filters)), [deck?.cards, filters]);
  const search = useViewSearch(store.filterSets.deckAdd, !!deck && store.deckTab === "add");
  if (!deck) {
    return (
      <div className="view" id="view-deck">
        <div id="pagetabs" className="colhead"><Switcher kind="deck" actions={actions} /></div>
        <NoDeck actions={actions} />
      </div>
    );
  }
  const counted = deck.cards.filter((card) => card.zone === "main" || card.zone === "commander").reduce((sum, card) => sum + card.quantity, 0);
  const tabs: Array<[DeckTab, string]> = [["cards", "Cards"], ["add", "Add"], ["ownership", "Ownership"], ["stats", "Statistics"], ["playtest", "Playtest"],
    ["description", "Description"], ["history", "History"]];
  const currency = store.prefs.currency;
  const errors = legality.problems.filter((item) => item.level === "err").length;
  const tab = store.deckTab;
  const filtered = tab === "cards" && shown.length < deck.cards.length;
  return (
    <div className="view" id="view-deck">
      <div id="pagetabs" className="colhead deckhead">
        <Switcher kind="deck" actions={actions} />
        <div className="seg tabscroll" role="tablist" aria-label="Deck view">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => store.setDeckTab(id)}>{label}</button>
          ))}
        </div>
        {deck.role === "member" && <span className="badge">Shared by {deck.owner?.name}</span>}
        {deck.role === "owner" && (deck.sharedWith?.length ?? 0) > 0 && <span className="badge">Shared with {deck.sharedWith!.map((person) => person.name).join(", ")}</span>}
        {tab === "cards" && (
          <label className="searchbox">
            <Icon name="find" className="nicon" />
            <input value={filters.query} onChange={(event) => store.setScopeFilters({ query: event.target.value }, "deck")} placeholder="Filter deck cards" aria-label="Filter deck cards" />
          </label>
        )}
        {tab === "add" && (
          <label className="searchbox">
            <Icon name="find" className="nicon" />
            <input value={store.filterSets.deckAdd.query} onChange={(event) => store.setScopeFilters({ query: event.target.value }, "deckAdd")}
              placeholder="Search cards to add" aria-label="Search cards to add" />
          </label>
        )}
        {tab === "cards" && <DeckOptions actions={actions} />}
        {tab === "add" && <SearchOptions />}
        <span className="phpos">
          <button type="button" className={legality.checked ? (errors ? "badge illegal fmt" : "badge own fmt") : "badge fmt"}
            title={legality.checked ? (errors ? `${errors} legality problems` : `Legal in ${formatName(deck.format)}`) : "Casual decks are not checked"}
            onClick={() => formatDialog(store)}>{formatName(deck.format)}</button>{" "}
          {tab === "add" ? countLine(search) : <>{counted} cards{store.deckStats ? `, ${money(store.deckStats.value, currency)}` : ""}
            {store.ownership && store.ownership.needed > 0 ? `, ${store.ownership.owned} owned` : ""}
            {filtered ? `, showing ${shown.reduce((sum, card) => sum + card.quantity, 0)}` : ""}</>}
        </span>
      </div>
      {tab === "cards" && <CardsTab actions={actions} legality={legality} cards={shown} />}
      {tab === "add" && <AddTab actions={actions} search={search} />}
      {tab === "ownership" && <OwnershipTab actions={actions} />}
      {tab === "stats" && <StatsPanel stats={store.deckStats} kind="deck" extra={<ManaBalance cards={deck.cards} />} />}
      {tab === "playtest" && <Playtest />}
      {tab === "description" && <Description />}
      {tab === "history" && <History />}
    </div>
  );
}
