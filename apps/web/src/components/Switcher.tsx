// ---------- switcher: one searchable list for opening a collection or a deck ----------
import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "../actions";
import { Icon } from "../icons";
import { useApp } from "../store";
import { formatName, money, type SwitchSort } from "../types";

type Item = {
  id: string; name: string; detail: string; badge?: string; created: string; updated: string; cards: number; value: number; format: string; commander: string;
  image?: string | null;
};

const SORTS: Record<"collection" | "deck", Array<[SwitchSort, string]>> = {
  collection: [["recent", "Recently opened"], ["name", "Name"], ["created", "Date created"], ["cards", "Card count"], ["value", "Value"]],
  deck: [["recent", "Recently opened"], ["name", "Name"], ["created", "Date created"], ["cards", "Card count"], ["format", "Format"], ["commander", "Commander"]],
};

/**
 * The button with the open collection's or deck's name. It opens a list with a search box: typing filters the list,
 * Up and Down move through it, Enter opens the highlighted one and Escape closes the list.
 */
export function Switcher({ kind, actions }: { kind: "collection" | "deck"; actions: Record<string, Action> }) {
  const store = useApp();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const currentId = kind === "collection" ? store.prefs.openCollection : store.deck?.id ?? null;
  const currency = store.prefs.currency;
  const items: Item[] = useMemo(() => (kind === "collection"
    ? (store.collections ?? []).map((item) => ({
      id: item.id, name: item.name, detail: `${item.cardCount.toLocaleString()} cards, ${money(item.value[currency], currency)}`,
      badge: item.kind === "wishlist" ? "Wishlist" : item.role === "member" ? "Shared" : undefined,
      created: item.createdAt ?? "", updated: item.updatedAt ?? "", cards: item.cardCount, value: item.value[currency], format: "", commander: "",
    }))
    : store.decks.map((item) => ({
      id: item.id, name: item.name, detail: [item.commander, formatName(item.format), `${item.card_count ?? 0} cards`].filter(Boolean).join(", "),
      badge: item.role === "member" || (item.sharedWith?.length ?? 0) > 0 ? "Shared" : undefined,
      created: item.created_at ?? "", updated: item.updated_at ?? "", cards: item.card_count ?? 0, value: 0, format: item.format,
      commander: item.commander ?? "", image: item.image_url,
    }))), [kind, store.collections, store.decks, currency]);
  const current = items.find((item) => item.id === currentId);
  const label = current?.name ?? (kind === "collection" ? "Choose a collection" : "Choose a deck");
  return (
    <>
      <button ref={button} type="button" className="switcher" aria-haspopup="listbox" aria-expanded={open}
        aria-label={kind === "collection" ? `Collection: ${label}. Open another collection` : `Deck: ${label}. Open another deck`}
        onClick={() => setOpen(!open)}>
        <span className="swname">{label}</span><span className="swcaret" aria-hidden="true">▾</span>
      </button>
      {open && <SwitcherList kind={kind} items={items} currentId={currentId} anchor={button.current} actions={actions} onClose={() => setOpen(false)} />}
    </>
  );
}

function SwitcherList({ kind, items, currentId, anchor, actions, onClose }: {
  kind: "collection" | "deck"; items: Item[]; currentId: string | null; anchor: HTMLElement | null; actions: Record<string, Action>; onClose: () => void;
}) {
  const store = useApp();
  const [term, setTerm] = useState("");
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const sort = kind === "collection" ? store.prefs.collectionSwitchSort : store.prefs.deckSwitchSort;
  const setSort = (value: SwitchSort) => store.setPrefs(kind === "collection" ? { collectionSwitchSort: value } : { deckSwitchSort: value });
  const recent = store.prefs.recent;
  const shown = useMemo(() => {
    const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = items.filter((item) => words.every((word) => `${item.name} ${item.commander} ${item.format}`.toLowerCase().includes(word)));
    const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);
    const sorts: Record<SwitchSort, (a: Item, b: Item) => number> = {
      recent: (a, b) => (recent[b.id] ?? 0) - (recent[a.id] ?? 0) || b.updated.localeCompare(a.updated) || byName(a, b),
      name: byName,
      created: (a, b) => b.created.localeCompare(a.created) || byName(a, b),
      cards: (a, b) => b.cards - a.cards || byName(a, b),
      value: (a, b) => b.value - a.value || byName(a, b),
      format: (a, b) => a.format.localeCompare(b.format) || byName(a, b),
      commander: (a, b) => (a.commander ? 0 : 1) - (b.commander ? 0 : 1) || a.commander.localeCompare(b.commander) || byName(a, b),
    };
    return [...list].sort(sorts[sort]);
  }, [items, term, sort, recent]);

  useEffect(() => setIndex(0), [term, sort]);
  useEffect(() => {
    const close = (event: Event) => {
      if (event.target instanceof Node && (box.current?.contains(event.target) || anchor?.contains(event.target))) return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
    };
  }, [anchor, onClose]);
  useEffect(() => {
    box.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (kind === "collection") {
      store.openCollection(item.id);
      store.setView("collection");
    } else {
      void store.openDeck(item.id).then(() => store.setView("deck"));
    }
  };
  const rect = anchor?.getBoundingClientRect();
  const phone = store.phone;
  const style = phone || !rect ? undefined : { left: Math.max(4, Math.min(rect.left, window.innerWidth - 384)), top: rect.bottom + 2 };
  return (
    <div ref={box} className={phone ? "swpop phone" : "swpop"} style={style} role="dialog" aria-label={kind === "collection" ? "Open a collection" : "Open a deck"}>
      <div className="swhead">
        <label className="searchbox">
          <Icon name="find" className="nicon" />
          <input autoFocus value={term} placeholder={kind === "collection" ? "Find a collection" : "Find a deck"} aria-label={kind === "collection" ? "Find a collection" : "Find a deck"}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setIndex(Math.min(shown.length - 1, index + 1)); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setIndex(Math.max(0, index - 1)); }
              else if (event.key === "Enter") { event.preventDefault(); choose(shown[index]); }
              else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
            }} />
        </label>
        <select aria-label="Sort the list" value={sort} onChange={(event) => setSort(event.target.value as SwitchSort)}>
          {SORTS[kind].map(([value, text]) => <option key={value} value={value}>Sort: {text}</option>)}
        </select>
      </div>
      <div className="swlist" role="listbox" aria-label={kind === "collection" ? "Collections" : "Decks"}>
        {shown.length === 0 && <p className="note pad">{items.length ? "Nothing matches" : kind === "collection" ? "No collections yet" : "No decks yet"}</p>}
        {shown.map((item, position) => (
          <div key={item.id} data-index={position} role="option" aria-selected={position === index}
            className={`swrow${position === index ? " hi" : ""}${item.id === currentId ? " cur" : ""}`}
            onMouseEnter={() => setIndex(position)} onClick={() => choose(item)}>
            {kind === "deck" && (item.image ? <img className="swart" src={item.image} alt="" loading="lazy" /> : <span className="swart none" aria-hidden="true" />)}
            <span className="swtext">
              <span className="swtitle"><b>{item.name}</b>{item.badge && <span className={item.badge === "Wishlist" ? "badge wish" : "badge"}>{item.badge}</span>}</span>
              <span className="swdetail">{item.detail}</span>
            </span>
            {item.id === currentId && <span className="badge main">Open</span>}
          </div>
        ))}
      </div>
      <div className="swfoot">
        <span className="sub">{shown.length} of {items.length}</span>
        <button type="button" className="btn small" onClick={() => { onClose(); (kind === "collection" ? actions["collection.new"] : actions.newDeck)?.run(); }}>
          {kind === "collection" ? "New collection..." : "New deck..."}</button>
      </div>
    </div>
  );
}
