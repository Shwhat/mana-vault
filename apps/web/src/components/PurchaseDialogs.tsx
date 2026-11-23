// ---------- purchase history windows: new and edited entries, Open..., Set current value..., and imported prices ----------
import { useEffect, useMemo, useState } from "react";
import { pickFile, request, sendFile } from "../api";
import { isApp, native } from "../android/platform";
import type { FoundCard } from "../card-search";
import {
  type Entry, type EntryKind, type EntryLine, KIND_LABELS, type Place, type PlaceKind, PLACE_KINDS, type Product, type PurchaseList, type ReceiptFields, type ReceiptLine, reloadOpening, type SealedChoice, setActiveOpening,
} from "../purchase-state";
import { finishCode, type ScanCard, type ScanItem } from "../scan-state";
import { type Store } from "../store";
import { CONDITIONS, type Currency, finishLabel, type FinishCode, LANGUAGES, money } from "../types";
import { FinishBadge, SetIcon } from "./CardMarks";
import { LayoutRows, OptionsButton } from "./Options";
import { customDialog } from "./Dialog";
import { type Choice, choices, Picker } from "./Picker";
import { finishesOf, type Printing, PrintingList } from "./PrintingDialog";
import { Suggest } from "./Suggest";

const today = () => new Date().toISOString().slice(0, 10);
const num = (text: string) => {
  const value = Number(text.replace(",", "."));
  return text.trim() === "" ? 0 : Number.isFinite(value) ? value : NaN;
};
const fixed = (value: number) => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "");
const USD: Currency = "usd";

/** What happens after an entry is saved: the view reloads and opens it. */
type Saved = (entry: Entry) => void;

/** Saving an entry can be undone (it is deleted) and redone (it is put back as it was). */
export function recordCreated(store: Store, entry: Entry, after: () => void) {
  let snapshot: unknown = null;
  store.pushUndo({
    label: `${KIND_LABELS[entry.kind]} of ${entry.date}`,
    undo: async () => { snapshot = (await request<{ snapshot: unknown }>(`/api/purchases/${entry.id}`, { method: "DELETE" })).snapshot; after(); await store.refreshAfterChange(); },
    redo: async () => { await request("/api/purchases/restore", { method: "POST", body: JSON.stringify({ snapshot }) }); after(); await store.refreshAfterChange(); },
  });
}

/**
 * A text field with the app's own list of matches under it: pick a place from the list, or type a new name. The list
 * shows places whose name holds every word typed.
 */
export function PlaceField({ id, value, places, onValue, placeholder }: { id: string; value: string; places: Place[]; onValue: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = places.filter((place) => words.every((word) => `${place.name} ${place.note}`.toLowerCase().includes(word))).slice(0, 12);
  const exact = places.some((place) => place.name.toLowerCase() === value.trim().toLowerCase());
  const pick = (name: string) => { onValue(name); setOpen(false); };
  return (
    <span className="combo">
      <input id={id} value={value} maxLength={120} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open && shown.length > 0} aria-controls={`${id}-list`}
        onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => { onValue(event.target.value); setOpen(true); setIndex(0); }}
        onKeyDown={(event) => {
          if (!open || !shown.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setIndex(Math.min(shown.length - 1, index + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setIndex(Math.max(0, index - 1)); }
          else if (event.key === "Enter" && !exact) { event.preventDefault(); pick(shown[index]!.name); }
          else if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
        }} />
      {open && shown.length > 0 && (
        <div className="combolist" id={`${id}-list`} role="listbox">
          {shown.map((place, at) => (
            <div key={place.id} role="option" aria-selected={at === index} className={at === index ? "pkopt hi" : "pkopt"}
              onMouseDown={(event) => { event.preventDefault(); pick(place.name); }}>
              <span className="pktext"><span>{place.name}</span><span className="pkdetail">{PLACE_KINDS[place.kind] ?? "Store"}{place.note ? `, ${place.note}` : ""}</span></span>
            </div>
          ))}
        </div>
      )}
      {value.trim() && !exact && <span className="sub comboadd">New place</span>}
    </span>
  );
}

const sealedLists = new Map<string, Promise<SealedChoice[]>>();
/** The named sealed products of a set and product (0.20.0), loaded once per set and product. */
function sealedList(setCode: string, product: string): Promise<SealedChoice[]> {
  const key = `${setCode}\n${product}`;
  let list = sealedLists.get(key);
  if (!list) {
    list = request<SealedChoice[]>(`/api/purchases/products?set=${encodeURIComponent(setCode)}&product=${encodeURIComponent(product)}`).catch(() => {
      sealedLists.delete(key);
      return [];
    });
    sealedLists.set(key, list);
  }
  return list;
}

/**
 * Product name (0.20.0): the name of a named product, such as a Commander deck or a bundle. The list under it holds the
 * named products of the line's set and product; any other name can be typed.
 */
function ProductNameField({ id, label, setCode, product, value, placeholder, onValue }: {
  id: string; label: string; setCode: string; product: string; value: string; placeholder: string; onValue: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<SealedChoice[]>([]);
  useEffect(() => {
    let active = true;
    if (!setCode || product === "single") { setChoices([]); return; }
    void sealedList(setCode, product).then((list) => { if (active) setChoices(list); });
    return () => { active = false; };
  }, [setCode, product]);
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = choices.filter((choice) => words.every((word) => `${choice.name} ${choice.fullName}`.toLowerCase().includes(word))).slice(0, 12);
  const exact = choices.find((choice) => choice.name.toLowerCase() === value.trim().toLowerCase());
  const pick = (name: string) => { onValue(name); setOpen(false); };
  return (
    <span className="combo">
      <input id={id} aria-label={label} value={value} maxLength={120} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open && shown.length > 0} aria-controls={`${id}-list`}
        onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => { onValue(event.target.value); setOpen(true); setIndex(0); }}
        onKeyDown={(event) => {
          if (!open || !shown.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setIndex(Math.min(shown.length - 1, index + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setIndex(Math.max(0, index - 1)); }
          else if (event.key === "Enter" && !exact) { event.preventDefault(); pick(shown[index]!.name); }
          else if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
        }} />
      {open && shown.length > 0 && (
        <div className="combolist" id={`${id}-list`} role="listbox">
          {shown.map((choice, at) => (
            <div key={choice.id} role="option" aria-selected={at === index} className={at === index ? "pkopt hi" : "pkopt"}
              onMouseDown={(event) => { event.preventDefault(); pick(choice.name); }}>
              <span className="pktext"><span>{choice.name}</span><span className="pkdetail">{choice.fullName}{choice.hasDeck ? ", decklist" : ""}</span></span>
            </div>
          ))}
        </div>
      )}
      {exact && <span className="sub comboadd">{exact.hasDeck ? "Listed product, with decklist" : "Listed product"}</span>}
    </span>
  );
}

/** The header fields every entry has: date, place and note. Amounts are in USD. */
function HeaderFields({ value, set, places, kind }: {
  value: { date: string; place: string; note: string }; set: (change: Partial<{ date: string; place: string; note: string }>) => void;
  places: Place[]; kind: EntryKind;
}) {
  return (
    <>
      <div className="prow"><label htmlFor="pe-date">Date</label><input id="pe-date" type="date" value={value.date} onChange={(event) => set({ date: event.target.value })} /></div>
      <div className="prow"><label htmlFor="pe-place">{kind === "trade" ? "Traded with" : kind === "purchase" ? "Bought from" : "Sold to or on"}</label>
        <PlaceField id="pe-place" value={value.place} places={places} placeholder="Store, website or person" onValue={(place) => set({ place })} /></div>
      <div className="prow"><label htmlFor="pe-note">Note</label><input id="pe-note" value={value.note} maxLength={1000} onChange={(event) => set({ note: event.target.value })} /></div>
    </>
  );
}

// ---------- sets ----------

type SetRow = { code: string; name: string; set_type: string; released_at: string | null };
let setCache: Promise<SetRow[]> | null = null;
/** Every set of the card database, newest first, loaded once. */
export function loadSets(): Promise<SetRow[]> {
  if (!setCache) setCache = request<SetRow[]>("/api/sets").catch((reason: unknown) => { setCache = null; throw reason; });
  return setCache;
}

/** A searchable list of sets, each with its symbol, name and code. */
export function SetPicker({ label, value, onChange, disabled }: { label: string; value: string; onChange: (code: string) => void; disabled?: boolean }) {
  const [sets, setSets] = useState<SetRow[]>([]);
  useEffect(() => { void loadSets().then(setSets).catch(() => setSets([])); }, []);
  const options: Choice[] = useMemo(() => [
    { value: "", label: "No set" },
    ...sets.map((set) => ({ value: set.code, label: set.name, detail: `${set.code.toUpperCase()}${set.released_at ? `, ${set.released_at.slice(0, 4)}` : ""}`, icon: <SetIcon code={set.code} /> })),
    ...(value && !sets.some((set) => set.code === value) ? [{ value, label: value.toUpperCase(), icon: <SetIcon code={value} /> }] : []),
  ], [sets, value]);
  return <Picker label={label} value={value} options={options} onChange={onChange} disabled={disabled} className="setpick" />;
}

// ---------- single cards ----------

type SingleDraft = {
  id?: string; key: string; cardId: string; name: string; setCode: string; number: string; image: string | null; finishes: string; promoTypes: string | null;
  foil: FinishCode; condition: string; language: string; collectionId: string; quantity: string; each: string; total: string; locked: number;
};

type LineDraft = {
  id?: string; product: string; name: string; setCode: string; quantity: string; each: string; total: string; packs: string; locked: number;
};

/** The purchase window as typed so far, kept while the scanner is open. */
export type PurchaseDraft = {
  entry: Entry | null; head: { date: string; place: string; note: string }; tax: string; shipping: string; lines: LineDraft[]; singles: SingleDraft[];
  receipt: File | null;
  /** The receipt is read as the window opens (a picture or PDF shared into the app). */
  readNow?: boolean;
};

const draftOf = (line: EntryLine): LineDraft => ({
  id: line.id, product: line.product, name: line.name, setCode: line.setCode ?? "", quantity: String(line.quantity),
  each: fixed(line.cost / line.quantity), total: fixed(line.cost), packs: String(line.packs), locked: line.opened + line.sold,
});
const singleOf = (line: EntryLine): SingleDraft => ({
  id: line.id, key: line.id, cardId: line.cardId ?? "", name: line.name, setCode: line.setCode ?? "", number: "", image: null, finishes: "", promoTypes: null,
  foil: (line.foil ?? 0) as FinishCode, condition: line.condition ?? "NM", language: line.language ?? "en", collectionId: line.collectionId ?? "",
  quantity: String(line.quantity), each: fixed(line.cost / line.quantity), total: fixed(line.cost), locked: line.quantity,
});
const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A single cards line from a printing and finish. */
function singleFrom(card: Pick<ScanCard, "id" | "name" | "set_code" | "collector_number" | "image_url" | "finishes"> & { promo_types?: string | null },
  foil: FinishCode, collectionId: string, extra: Partial<SingleDraft> = {}): SingleDraft {
  return {
    key: newKey(), cardId: card.id, name: card.name, setCode: card.set_code, number: card.collector_number, image: card.image_url, finishes: card.finishes,
    promoTypes: card.promo_types ?? null, foil, condition: "NM", language: "en", collectionId, quantity: "1", each: "", total: "", locked: 0, ...extra,
  };
}

/** Find cards: a card search with pictures; picking a card shows its printings, and picking a printing adds it. */
function SingleFinder({ onAdd, onClose, start = "" }: { onAdd: (card: Printing, finish: FinishCode) => void; onClose: () => void; start?: string }) {
  const [term, setTerm] = useState(start);
  const [found, setFound] = useState<FoundCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<FoundCard | null>(null);
  useEffect(() => {
    if (term.trim().length < 2) { setFound([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      void request<{ total: number; cards: FoundCard[] }>(`/api/cards?paged=1&group=1&offset=0&limit=24&sort=best&q=${encodeURIComponent(term.trim())}`, { signal: controller.signal })
        .then((page) => setFound(page.cards)).catch(() => undefined).finally(() => setBusy(false));
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term]);
  if (chosen) {
    return (
      <div className="singlefind">
        <div className="btnrow"><button type="button" className="btn small" onClick={() => setChosen(null)}>Back to cards</button><b>Choose the printing of {chosen.name}</b></div>
        <PrintingList single cardId={chosen.id} currentId={chosen.id} finish={0} currency={USD} onPick={(printing, finish) => { onAdd(printing, finish); setChosen(null); }} />
      </div>
    );
  }
  return (
    <div className="singlefind">
      <div className="btnrow">
        <Suggest mode="search" className="search grow" autoFocus aria-label="Find a card" placeholder="Card name or search" value={term} onValue={setTerm} />
        <button type="button" className="btn small" onClick={onClose}>Done</button>
      </div>
      <p className="note">{busy ? "Searching" : term.trim().length < 2 ? "Type at least two letters of a card name" : `${found.length} cards`}</p>
      <div className="singlegrid" role="listbox" aria-label="Cards found">
        {found.map((card) => (
          <button key={card.id} type="button" role="option" aria-selected={false} className="singlecard" aria-label={card.name} title={card.name} onClick={() => setChosen(card)}>
            {card.image_url ? <img src={card.image_url} alt="" loading="lazy" /> : <span className="noimg">{card.name}</span>}
            <span className="singlename">{card.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One card-like receipt line in the Match cards step: the card chosen (or none), as a card or kept as a product. */
type MatchRow = { key: string; line: ReceiptLine; card: (Pick<ScanCard, "id" | "name" | "set_code" | "collector_number" | "image_url" | "finishes"> & { promo_types?: string | null; set_name?: string }) | null;
  finish: FinishCode; condition: string; kind: "card" | "product"; ok: boolean; mode: "" | "printing" | "find" };

/**
 * Match cards (0.19.0): after a receipt is read, each line that looks like a single card shows its best guess. OK keeps
 * it, Choose printing... picks the exact printing and finish, Keep as product leaves it a product line, and a line with no
 * match gets a search to find the card. Continue puts the cards into Single cards.
 */
function MatchCards({ rows: start, onContinue, onCancel }: { rows: MatchRow[]; onContinue: (rows: MatchRow[]) => void; onCancel: () => void }) {
  const [rows, setRows] = useState(start);
  const [error, setError] = useState("");
  const set = (key: string, change: Partial<MatchRow>) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const go = () => {
    const missing = rows.filter((row) => row.kind === "card" && !row.card);
    if (missing.length) return setError(`Find the card for ${missing.map((row) => row.line.name).join(", ")}, or keep ${missing.length === 1 ? "it" : "them"} as products.`);
    onContinue(rows);
  };
  return (
    <div className="matchcards">
      <p className="note">These receipt lines look like single cards. Check each one; cards go into Single cards with their finish, condition and price.</p>
      {error && <p className="note err">{error}</p>}
      {rows.map((row) => (
        <div key={row.key} className={`matchrow${row.kind === "product" ? " asproduct" : ""}${row.ok ? " ok" : ""}`}>
          <div className="matchtext">
            <span className="sub">From the receipt</span>
            <b>{row.line.name}</b>{row.line.note && <span className="sub"> {row.line.note}</span>}
            <span className="sub">{row.line.quantity} x {money(row.line.cost / Math.max(1, row.line.quantity), USD)}</span>
          </div>
          {row.kind === "product" ? (
            <div className="matchguess"><span className="sub">Kept as a product line</span>
              <button type="button" className="btn small" onClick={() => set(row.key, { kind: "card" })}>Match a card</button></div>
          ) : row.card ? (
            <div className="matchguess">
              {row.card.image_url ? <img className="thumb-img" src={row.card.image_url} alt="" /> : <span className="thumb-img none">MV</span>}
              <span className="matchcard"><b>{row.card.name}</b>
                <span className="sub"><SetIcon code={row.card.set_code} />({row.card.set_code.toUpperCase()}) {row.card.collector_number}{row.card.set_name ? `, ${row.card.set_name}` : ""}, {row.condition}</span>
                <FinishBadge finish={row.finish} promoTypes={row.card.promo_types} /></span>
              <span className="btnrow">
                <button type="button" className={row.ok ? "btn small primary" : "btn small"} aria-pressed={row.ok} onClick={() => set(row.key, { ok: true, mode: "" })}>OK</button>
                <button type="button" className="btn small" onClick={() => set(row.key, { mode: row.mode === "printing" ? "" : "printing" })}>Choose printing...</button>
                <button type="button" className="btn small" onClick={() => set(row.key, { mode: row.mode === "find" ? "" : "find" })}>Another card...</button>
                <button type="button" className="btn small" onClick={() => set(row.key, { kind: "product", mode: "" })}>Keep as product</button>
              </span>
            </div>
          ) : (
            <div className="matchguess"><span className="sub">No card found for this line</span>
              <span className="btnrow">
                <button type="button" className="btn small primary" onClick={() => set(row.key, { mode: "find" })}>Find the card...</button>
                <button type="button" className="btn small" onClick={() => set(row.key, { kind: "product", mode: "" })}>Keep as product</button>
              </span>
            </div>
          )}
          {row.kind === "card" && row.mode === "printing" && row.card && (
            <div className="matchpanel">
              <PrintingList cardId={row.card.id} currentId={row.card.id} finish={row.finish} currency={USD}
                onPick={(printing, finish) => set(row.key, { card: printing, finish, ok: true, mode: "" })} />
            </div>
          )}
          {row.kind === "card" && row.mode === "find" && (
            <div className="matchpanel">
              <SingleFinder start={row.line.name.replace(/[[(][^\])]*[\])]/g, " ").trim()} onAdd={(printing, finish) => set(row.key, { card: printing, finish, ok: true, mode: "" })}
                onClose={() => set(row.key, { mode: "" })} />
            </div>
          )}
        </div>
      ))}
      <div className="btnrow end">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={go}>Continue</button>
      </div>
    </div>
  );
}

/** From scanned list...: the scanner's list with a checkbox on each card; checked cards become single cards lines. */
function ScannedPicker({ store, onAdd, onClose }: { store: Store; onAdd: (items: ScanItem[]) => void; onClose: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(store.scanItems.map((item) => item.key)));
  const items = store.scanItems;
  return (
    <div className="singlefind">
      {!items.length && <p className="note">The scanned list is empty.</p>}
      <div className="scanpick">
        {items.map((item) => (
          <label key={item.key} className="check scanpickrow">
            <input type="checkbox" checked={checked.has(item.key)} onChange={(event) => {
              const next = new Set(checked);
              if (event.target.checked) next.add(item.key); else next.delete(item.key);
              setChecked(next);
            }} />
            {item.card.image_url ? <img className="thumb-img sm" src={item.card.image_url} alt="" /> : null}
            <span>{item.quantity}x {item.card.name} <span className="sub">{item.card.set_code.toUpperCase()} #{item.card.collector_number}</span> <FinishBadge finish={finishCode(item)} /></span>
          </label>
        ))}
      </div>
      <div className="btnrow end">
        <button type="button" className="btn small" onClick={onClose}>Cancel</button>
        <button type="button" className="btn small primary" disabled={!checked.size} onClick={() => {
          const chosen = items.filter((item) => checked.has(item.key));
          for (const item of chosen) store.removeScanItem(item.key);
          onAdd(chosen);
        }}>Add {[...checked].length} to the purchase</button>
      </div>
    </div>
  );
}

// ---------- scanning into a purchase ----------

let purchaseScan: { draft: PurchaseDraft; added: ScanItem[]; reopen: (draft: PurchaseDraft) => void } | null = null;
/** Whether the scanner was opened from a purchase window (its Add to... offers This purchase). */
export const scanningForPurchase = () => !!purchaseScan;
/** The scanner's Add to...: the scanned cards go to the purchase window, and leave the scanned list. */
export function deliverPurchaseScan(store: Store, items: ScanItem[]) {
  if (!purchaseScan) return;
  purchaseScan.added.push(...items);
  for (const item of items) store.removeScanItem(item.key);
  store.setScannerOpen(false);
}
/** The scanner closed: the purchase window comes back with any cards added. */
export function finishPurchaseScan() {
  const session = purchaseScan;
  if (!session) return;
  purchaseScan = null;
  const collectionId = session.draft.singles[0]?.collectionId ?? "";
  const singles = [...session.draft.singles, ...session.added.map((item) => singleFrom(item.card, finishCode(item), collectionId, {
    condition: item.condition ?? "NM", language: item.language ?? "en", quantity: String(item.quantity),
  }))];
  window.setTimeout(() => session.reopen({ ...session.draft, singles }), 0);
}

// ---------- receipts ----------

const RECEIPT_TYPES = "application/pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp";

/** Reads a receipt: on the Android app a photo is read on the phone, everything else by the server. */
export async function readReceipt(file: File): Promise<ReceiptFields> {
  if (isApp() && file.type.startsWith("image/")) {
    try {
      const text = await phoneText(file);
      return (await request<{ fields: ReceiptFields }>("/api/purchases/receipts/parse", { method: "POST", body: JSON.stringify({ text }) })).fields;
    } catch {
      // the phone could not read it: the server tries
    }
  }
  return (await sendFile<{ fields: ReceiptFields }>("/api/purchases/receipts/read", "POST", file)).fields;
}

/** The lines of text on a photo, read by the phone's text recognition and put in reading order. */
async function phoneText(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL("image/jpeg", 0.88).replace(/^data:[^,]*,/, "");
  const { lines } = await native().recognize({ image });
  const sorted = [...lines].sort((a, b) => a.top - b.top || a.left - b.left);
  const rows: Array<{ top: number; bottom: number; parts: typeof lines }> = [];
  for (const line of sorted) {
    const row = rows.find((item) => line.top < item.bottom - (item.bottom - item.top) * 0.4 && line.bottom > item.top + (item.bottom - item.top) * 0.4);
    if (row) { row.parts.push(line); row.bottom = Math.max(row.bottom, line.bottom); } else rows.push({ top: line.top, bottom: line.bottom, parts: [line] });
  }
  return rows.map((row) => row.parts.sort((a, b) => a.left - b.left).map((part) => part.text).join(" ")).join("\n");
}

/** Keeps a receipt with an entry, as one undo step (undo puts back the receipt kept before, or none). */
export async function keepReceipt(store: Store, entryId: string, file: File, after: () => void) {
  const { before } = await sendFile<{ before: StoredReceipt | null }>(`/api/purchases/${entryId}/receipt`, "PUT", file, file.name);
  store.pushUndo({
    label: "Receipt",
    undo: async () => { await putBack(entryId, before); after(); },
    redo: async () => { await sendFile(`/api/purchases/${entryId}/receipt`, "PUT", file, file.name); after(); },
  });
}

type StoredReceipt = { name: string; type: string; data: string };
async function putBack(entryId: string, receipt: StoredReceipt | null) {
  if (!receipt) { await request(`/api/purchases/${entryId}/receipt`, { method: "DELETE" }); return; }
  const bytes = Uint8Array.from(atob(receipt.data), (char) => char.charCodeAt(0));
  await sendFile(`/api/purchases/${entryId}/receipt`, "PUT", new Blob([bytes], { type: receipt.type }), receipt.name);
}

/** Removes the receipt of an entry, as one undo step. */
export async function removeReceipt(store: Store, entryId: string, after: () => void) {
  const { before } = await request<{ before: StoredReceipt | null }>(`/api/purchases/${entryId}/receipt`, { method: "DELETE" });
  store.pushUndo({ label: "Remove receipt", undo: async () => { await putBack(entryId, before); after(); }, redo: async () => { await request(`/api/purchases/${entryId}/receipt`, { method: "DELETE" }); after(); } });
}

/** Chooses a receipt file (on a phone the camera is one of the choices). */
export const pickReceipt = () => pickFile(RECEIPT_TYPES);

// ---------- the purchase window ----------

const PACK_PRODUCTS = ["booster_box", "bundle", "prerelease_kit", "other", "other_booster", "jumpstart_booster", "secret_lair"];

/** The purchase window: one line per product, single cards picked by printing, with tax and shipping spread over the lines by cost. */
function PurchaseEditor({ store, list, start, close, onSaved, reopen }: {
  store: Store; list: PurchaseList; start: PurchaseDraft; close: () => void; onSaved: Saved; reopen: (draft: PurchaseDraft) => void;
}) {
  const entry = start.entry;
  const owned = (store.collections ?? []).filter((item) => item.kind === "collection" && item.role === "owner");
  const defaultCollection = store.prefs.targetCollection && owned.some((item) => item.id === store.prefs.targetCollection) ? store.prefs.targetCollection : owned[0]?.id ?? "";
  const blank = (product = "play_booster"): LineDraft => ({
    product, name: "", setCode: "", quantity: "1", each: "", total: "", packs: String(list.products.find((item) => item.id === product)?.packs ?? 0), locked: 0,
  });
  const [head, setHead] = useState(start.head);
  const [tax, setTax] = useState(start.tax);
  const [shipping, setShipping] = useState(start.shipping);
  const [lines, setLines] = useState<LineDraft[]>(start.lines);
  const [singles, setSingles] = useState<SingleDraft[]>(start.singles);
  const [receipt, setReceipt] = useState<File | null>(start.receipt);
  const [panel, setPanel] = useState<"" | "find" | "scanned">("");
  const [matching, setMatching] = useState<MatchRow[] | null>(null);
  const lineFromReceipt = (line: ReceiptLine): LineDraft => ({
    product: line.product, name: line.product === "other" ? `${line.name}${line.note ? ` ${line.note}` : ""}` : line.productName ?? "", setCode: line.setCode ?? "", quantity: String(line.quantity),
    each: fixed(line.cost / Math.max(1, line.quantity)), total: fixed(line.cost), packs: String(list.products.find((item) => item.id === line.product)?.packs ?? 0), locked: 0,
  });
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = (): PurchaseDraft => ({ entry, head, tax, shipping, lines, singles, receipt });
  const setLine = (index: number, change: Partial<LineDraft>) => setLines(lines.map((line, at) => (at === index ? { ...line, ...change } : line)));
  const setSingle = (key: string, change: Partial<SingleDraft>) => setSingles(singles.map((line) => (line.key === key ? { ...line, ...change } : line)));
  // either cost each or the total fills the other
  const costOf = (line: { quantity: string; each: string }, field: "each" | "total", textValue: string) => {
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const value = num(textValue);
    return field === "each" ? { each: textValue, total: Number.isFinite(value) && textValue ? fixed(value * quantity) : "" } : { total: textValue, each: Number.isFinite(value) && textValue ? fixed(value / quantity) : "" };
  };
  const quantityOf = (line: { each: string; total: string }, quantity: string) => {
    const each = num(line.each);
    return { quantity, total: line.each && Number.isFinite(each) ? fixed(each * (Number(quantity) || 1)) : line.total };
  };
  const subtotal = [...lines, ...singles].reduce((sum, line) => sum + (num(line.total) || 0), 0);
  const extra = (num(tax) || 0) + (num(shipping) || 0);
  const count = lines.length + singles.length;
  const shareOf = (total: string) => (subtotal > 0 ? extra * (num(total) || 0) / subtotal : count ? extra / count : 0);
  const productOptions = list.products.filter((product: Product) => product.id !== "single").map((product: Product) => ({ value: product.id, label: product.label }));
  const addCard = (card: Printing, finish: FinishCode) => {
    setSingles([...singles, singleFrom(card, finish, singles.at(-1)?.collectionId || defaultCollection)]);
    store.flash(`${card.name} added to the purchase`);
  };
  const addScanned = (items: ScanItem[]) => {
    const collectionId = singles.at(-1)?.collectionId || defaultCollection;
    setSingles([...singles, ...items.map((item) => singleFrom(item.card, finishCode(item), collectionId, { condition: item.condition ?? "NM", language: item.language ?? "en", quantity: String(item.quantity) }))]);
    setPanel("");
  };
  const scan = () => {
    purchaseScan = { draft: draft(), added: [], reopen };
    close();
    store.setScannerOpen(true);
  };
  const read = async () => {
    const file = await pickReceipt();
    if (file) await readFrom(file);
  };
  useEffect(() => { if (start.readNow && start.receipt) void readFrom(start.receipt); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function readFrom(file: File) {
    setError("");
    setNote("Reading the receipt");
    setReceipt(file);
    try {
      const fields = await readReceipt(file);
      // single cards go to the Match cards step first (0.19.0)
      const cards = fields.lines.filter((line) => line.cardLike);
      if (cards.length) {
        setMatching(cards.map((line) => ({
          key: newKey(), line, kind: "card", ok: false, mode: "", finish: (line.card?.finish ?? 0) as FinishCode, condition: line.card?.condition ?? "NM",
          card: line.card ? { id: line.card.cardId, name: line.card.name, set_code: line.card.setCode, set_name: line.card.setName, collector_number: line.card.collectorNumber,
            image_url: line.card.imageUrl, finishes: line.card.finishes, promo_types: line.card.promoTypes } : null,
        })));
      }
      const found = fields.lines.filter((line) => !line.cardLike).map(lineFromReceipt);
      setHead({ date: fields.date ?? head.date, place: head.place || fields.place || "", note: head.note || fields.note || "" });
      if (fields.tax !== null) setTax(fixed(fields.tax));
      if (fields.shipping !== null) setShipping(fixed(fields.shipping));
      const kept = lines.filter((line) => line.id || num(line.total) > 0 || line.name);
      if (found.length) setLines([...kept, ...found]);
      const read = found.length || cards.length ? `${found.length + cards.length} ${found.length + cards.length === 1 ? "line" : "lines"} read` : "No product lines found";
      const total = fields.total === null ? "" : fields.total.toFixed(2) === (fields.linesTotal + (fields.tax ?? 0) + (fields.shipping ?? 0)).toFixed(2)
        ? `, matching the total of ${money(fields.total, USD)}` : `. The receipt total is ${money(fields.total, USD)}; the lines, tax and shipping read add up to ${money(fields.linesTotal + (fields.tax ?? 0) + (fields.shipping ?? 0), USD)}`;
      setNote(`${read}${total}. Check every field before saving.`);
    } catch (reason) {
      setNote("");
      setError(reason instanceof Error ? reason.message : "The receipt could not be read. Enter the purchase by hand.");
    }
  }
  const save = async () => {
    setError("");
    setBusy(true);
    try {
      const sent: Array<Record<string, unknown>> = lines.map((line) => ({
        id: line.id, product: line.product, name: line.name, setCode: line.setCode, quantity: Number(line.quantity), cost: num(line.total), packs: Number(line.packs || 0),
      }));
      for (const line of singles) {
        if (!line.collectionId) throw new Error(`Choose the collection ${line.name} goes to`);
        sent.push({
          id: line.id, product: "single", name: line.name, setCode: line.setCode, quantity: Number(line.quantity), cost: num(line.total), packs: 0,
          ...(line.id ? {} : { cardId: line.cardId, foil: line.foil, condition: line.condition, language: line.language, proxy: false, collectionId: line.collectionId }),
        });
      }
      if (!sent.length) throw new Error("Add at least one product or card");
      const body = { kind: "purchase", ...head, tax: num(tax), shipping: num(shipping), lines: sent };
      let saved: Entry;
      if (entry) {
        const newSingles = singles.filter((line) => !line.id);
        if (newSingles.length) throw new Error("Cards are added to a saved purchase from its page, with Add cards");
        const before = { date: entry.date, place: entry.place, note: entry.note, tax: entry.tax, shipping: entry.shipping,
          lines: entry.lines.map((line) => ({ id: line.id, product: line.product, name: line.name, setCode: line.setCode, quantity: line.quantity, cost: line.cost, packs: line.packs })) };
        saved = await request<Entry>(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) });
        store.pushUndo({
          label: `Edit purchase of ${entry.date}`,
          undo: async () => { await request(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(before) }); onSaved(saved); },
          redo: async () => { await request(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) }); onSaved(saved); },
        });
      } else {
        saved = await request<Entry>("/api/purchases", { method: "POST", body: JSON.stringify(body) });
        recordCreated(store, saved, () => onSaved(saved));
      }
      if (receipt && !(entry?.receipt && start.receipt === receipt)) await sendFile(`/api/purchases/${saved.id}/receipt`, "PUT", receipt, receipt.name).catch(() => store.flash("The receipt could not be kept with the purchase", "err"));
      close();
      onSaved(saved);
      if (singles.length) await store.refreshAfterChange();
      store.flash(`Purchase of ${saved.date} saved`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the purchase.");
    } finally {
      setBusy(false);
    }
  };
  if (matching) {
    return (
      <MatchCards rows={matching} onCancel={() => {
        // Cancel keeps the lines as products, so nothing read is lost
        setLines([...lines, ...matching.map((row) => lineFromReceipt(row.line))]);
        setMatching(null);
      }} onContinue={(rows) => {
        const collectionId = singles.at(-1)?.collectionId || defaultCollection;
        setSingles([...singles, ...rows.filter((row) => row.kind === "card" && row.card).map((row) => singleFrom(row.card!, row.finish, collectionId, {
          condition: row.condition, quantity: String(row.line.quantity), each: fixed(row.line.cost / Math.max(1, row.line.quantity)), total: fixed(row.line.cost),
        }))]);
        setLines([...lines, ...rows.filter((row) => row.kind === "product").map((row) => lineFromReceipt(row.line))]);
        setMatching(null);
      }} />
    );
  }
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      {note && <p className="note" role="status">{note}</p>}
      <div className="btnrow">
        <button type="button" className="btn small" onClick={() => void read()}>Read receipt...</button>
        {receipt && <span className="sub">Receipt: {receipt.name}</span>}
      </div>
      <HeaderFields value={head} set={(change) => setHead({ ...head, ...change })} places={list.places} kind="purchase" />
      <h4>Products</h4>
      <table className="dtable pelines">
        <thead><tr><th>Product</th><th>Set</th><th>Quantity</th><th>Cost each</th><th>Total</th><th>Packs in it</th><th>Full cost</th><th /></tr></thead>
        <tbody>
          {!lines.length && <tr><td colSpan={8} className="sub">No sealed products</td></tr>}
          {lines.map((line, index) => (
            <tr key={`l${index}`}>
              <td>
                <Picker label={`Product of line ${index + 1}`} value={line.product} options={productOptions}
                  onChange={(product) => setLine(index, { product, packs: String(list.products.find((item) => item.id === product)?.packs ?? 0) })} />
                <ProductNameField id={`pe-name-${index}`} label={`Name of line ${index + 1}`} setCode={line.setCode} product={line.product} value={line.name}
                  placeholder={line.product === "other" ? "Product name" : "Product name (optional)"} onValue={(name) => setLine(index, { name })} />
              </td>
              <td><SetPicker label={`Set of line ${index + 1}`} value={line.setCode} onChange={(setCode) => setLine(index, { setCode })} /></td>
              <td><input aria-label={`Quantity of line ${index + 1}`} type="number" min={Math.max(1, line.locked)} value={line.quantity} className="num"
                onChange={(event) => setLine(index, quantityOf(line, event.target.value))} /></td>
              <td><input aria-label={`Cost each of line ${index + 1}`} inputMode="decimal" value={line.each} className="num" onChange={(event) => setLine(index, costOf(line, "each", event.target.value))} /></td>
              <td><input aria-label={`Total of line ${index + 1}`} inputMode="decimal" value={line.total} className="num" onChange={(event) => setLine(index, costOf(line, "total", event.target.value))} /></td>
              <td>{PACK_PRODUCTS.includes(line.product)
                ? <input aria-label={`Packs in line ${index + 1}`} type="number" min={0} value={line.packs} className="num" onChange={(event) => setLine(index, { packs: event.target.value })} />
                : <span className="sub">{line.packs === "0" ? "" : line.packs}</span>}</td>
              <td className="numcell">{money((num(line.total) || 0) + shareOf(line.total), USD)}</td>
              <td><button type="button" className="btn small" disabled={line.locked > 0} title={line.locked ? "Opened or sold lines stay" : undefined}
                onClick={() => setLines(lines.filter((_, at) => at !== index))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btnrow"><button type="button" className="btn small" onClick={() => setLines([...lines, blank()])}>Add product</button></div>
      <h4>Single cards</h4>
      <table className="dtable pelines pesingles">
        <thead><tr><th>Card</th><th>Finish</th><th>Condition</th><th>Language</th><th>Collection</th><th>Quantity</th><th>Cost each</th><th>Total</th><th /></tr></thead>
        <tbody>
          {!singles.length && <tr><td colSpan={9} className="sub">No single cards</td></tr>}
          {singles.map((line) => {
            const finishes = line.finishes ? finishesOf({ finishes: line.finishes }) : [line.foil];
            const locked = !!line.id;
            return (
              <tr key={line.key}>
                <td className="singlecell">{line.image ? <img className="thumb-img sm" src={line.image} alt="" /> : null}
                  <span><b>{line.name}</b> <span className="sub">{line.setCode.toUpperCase()}{line.number ? ` #${line.number}` : ""}</span></span></td>
                <td><Picker label={`Finish of ${line.name}`} value={String(line.foil)} disabled={locked}
                  options={finishes.map((code) => ({ value: String(code), label: finishLabel(code, line.promoTypes) }))} onChange={(foil) => setSingle(line.key, { foil: Number(foil) as FinishCode })} /></td>
                <td><Picker label={`Condition of ${line.name}`} value={line.condition} disabled={locked} options={choices(CONDITIONS)} onChange={(condition) => setSingle(line.key, { condition })} /></td>
                <td><Picker label={`Language of ${line.name}`} value={line.language} disabled={locked} options={choices(LANGUAGES)} onChange={(language) => setSingle(line.key, { language })} /></td>
                <td><Picker label={`Collection of ${line.name}`} value={line.collectionId} disabled={locked} options={owned.map((item) => ({ value: item.id, label: item.name }))} onChange={(collectionId) => setSingle(line.key, { collectionId })} /></td>
                <td><input aria-label={`Quantity of ${line.name}`} type="number" min={locked ? line.locked : 1} disabled={locked} value={line.quantity} className="num" onChange={(event) => setSingle(line.key, quantityOf(line, event.target.value))} /></td>
                <td><input aria-label={`Cost each of ${line.name}`} inputMode="decimal" value={line.each} className="num" onChange={(event) => setSingle(line.key, costOf(line, "each", event.target.value))} /></td>
                <td><input aria-label={`Total of ${line.name}`} inputMode="decimal" value={line.total} className="num" onChange={(event) => setSingle(line.key, costOf(line, "total", event.target.value))} /></td>
                <td><button type="button" className="btn small" disabled={locked} title={locked ? "Cards already in the collection stay" : undefined}
                  onClick={() => setSingles(singles.filter((item) => item.key !== line.key))}>Remove</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!entry && (
        <div className="btnrow">
          <button type="button" className={panel === "find" ? "btn small on" : "btn small"} onClick={() => setPanel(panel === "find" ? "" : "find")}>Find cards</button>
          <button type="button" className="btn small" onClick={scan}>Scan</button>
          <button type="button" className={panel === "scanned" ? "btn small on" : "btn small"} onClick={() => setPanel(panel === "scanned" ? "" : "scanned")}>From scanned list...</button>
        </div>
      )}
      {panel === "find" && <SingleFinder onAdd={addCard} onClose={() => setPanel("")} />}
      {panel === "scanned" && <ScannedPicker store={store} onAdd={addScanned} onClose={() => setPanel("")} />}
      <div className="prow"><label htmlFor="pe-tax">Tax</label><input id="pe-tax" inputMode="decimal" className="num" value={tax} onChange={(event) => setTax(event.target.value)} /></div>
      <div className="prow"><label htmlFor="pe-shipping">Shipping</label><input id="pe-shipping" inputMode="decimal" className="num" value={shipping} onChange={(event) => setShipping(event.target.value)} /></div>
      <p className="petotal">Total <b>{money(subtotal + extra, USD)}</b></p>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save purchase</button>
      </div>
    </div>
  );
}

type CopyFound = {
  collectionId: string; collectionName: string; cardId: string; foil: number; condition: string; language: string; proxy: boolean; quantity: number;
  name: string; setCode: string; collectorNumber: string; prices: { usd: number | null; usdFoil: number | null; usdEtched: number | null };
};
export type SaleCopy = Omit<CopyFound, "prices"> & { count: string; price: string };
const copyId = (copy: { collectionId: string; cardId: string; foil: number; condition: string; language: string; proxy: boolean }) =>
  `${copy.collectionId}|${copy.cardId}|${copy.foil}|${copy.condition}|${copy.language}|${copy.proxy}`;
const priceOf = (copy: CopyFound) => (copy.foil === 0 ? copy.prices.usd : copy.foil === 1 ? copy.prices.usdFoil : copy.prices.usdEtched ?? copy.prices.usdFoil);

/** Shipping on a sale: paid by the buyer (it passes through and never counts) or by you (it lowers the gain). */
function ShippingFields({ id, shipping, setShipping, by, setBy }: { id: string; shipping: string; setShipping: (value: string) => void; by: "me" | "buyer"; setBy: (value: "me" | "buyer") => void }) {
  return (
    <>
      <div className="prow"><label htmlFor={`${id}-shipping`}>Shipping</label><input id={`${id}-shipping`} inputMode="decimal" className="num" value={shipping} onChange={(event) => setShipping(event.target.value)} /></div>
      <div className="prow"><label htmlFor={`${id}-by`}>Who paid shipping</label>
        <Picker id={`${id}-by`} label="Who paid shipping" value={by} options={choices([["buyer", "Buyer paid shipping"], ["me", "I paid shipping"]])} onChange={(value) => setBy(value as "me" | "buyer")} /></div>
    </>
  );
}

/** The card sale window: copies from collections with the sale price of each, fees and shipping. Saving removes the copies. */
function CardSaleEditor({ store, list, start, close, onSaved }: { store: Store; list: PurchaseList; start: SaleCopy[]; close: () => void; onSaved: Saved }) {
  const [head, setHead] = useState({ date: today(), place: "", note: "" });
  const [fees, setFees] = useState("");
  const [shipping, setShipping] = useState("");
  const [shippingBy, setShippingBy] = useState<"me" | "buyer">("buyer");
  const [rows, setRows] = useState<SaleCopy[]>(start);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<CopyFound[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (term.trim().length < 2) { setFound([]); return; }
    const timer = window.setTimeout(() => {
      void request<CopyFound[]>(`/api/purchases/copies?q=${encodeURIComponent(term.trim())}`).then(setFound).catch(() => setFound([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [term]);
  const add = (copy: CopyFound) => {
    if (rows.some((row) => copyId(row) === copyId(copy))) return;
    const { prices: _prices, ...rest } = copy;
    setRows([...rows, { ...rest, count: "1", price: fixed(priceOf(copy) ?? 0) }]);
  };
  const total = rows.reduce((sum, row) => sum + (num(row.price) || 0) * (Number(row.count) || 0), 0);
  const save = async () => {
    setError("");
    try {
      const body = {
        kind: "card_sale", ...head, fees: num(fees), shipping: num(shipping), shippingBy,
        sales: rows.map((row) => ({ collectionId: row.collectionId, cardId: row.cardId, foil: row.foil, condition: row.condition, language: row.language, proxy: row.proxy,
          quantity: Number(row.count), price: (num(row.price) || 0) * Number(row.count) })),
      };
      const saved = await request<Entry>("/api/purchases", { method: "POST", body: JSON.stringify(body) });
      recordCreated(store, saved, () => onSaved(saved));
      close();
      await store.refreshAfterChange();
      onSaved(saved);
      store.flash(`Card sale of ${saved.date} saved: ${rows.reduce((sum, row) => sum + Number(row.count), 0)} cards removed from collections`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the sale.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <HeaderFields value={head} set={(change) => setHead({ ...head, ...change })} places={list.places} kind="card_sale" />
      <div className="prow"><label htmlFor="cs-find">Find copies</label><input id="cs-find" value={term} placeholder="Card name" onChange={(event) => setTerm(event.target.value)} /></div>
      {found.length > 0 && (
        <div className="pefound">{found.map((copy) => (
          <button key={copyId(copy)} type="button" className="pefoundrow" onClick={() => add(copy)}>
            <b>{copy.name}</b> <span className="sub">{copy.setCode.toUpperCase()} #{copy.collectorNumber}{copy.foil ? (copy.foil === 1 ? " foil" : " etched") : ""} {copy.condition}, {copy.quantity} in {copy.collectionName}</span>
          </button>))}</div>
      )}
      <table className="dtable pelines">
        <thead><tr><th>Card</th><th>Collection</th><th>Count</th><th>Price each</th><th /></tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={5} className="sub">No copies chosen</td></tr>}
          {rows.map((row, index) => (
            <tr key={copyId(row)}>
              <td>{row.name} <span className="sub">{row.setCode.toUpperCase()}{row.foil ? (row.foil === 1 ? " foil" : " etched") : ""} {row.condition}</span></td>
              <td>{row.collectionName}</td>
              <td><input aria-label={`Count of ${row.name}`} type="number" min={1} max={row.quantity} className="num" value={row.count} onChange={(event) => setRows(rows.map((item, at) => (at === index ? { ...item, count: event.target.value } : item)))} /></td>
              <td><input aria-label={`Price of ${row.name}`} inputMode="decimal" className="num" value={row.price} onChange={(event) => setRows(rows.map((item, at) => (at === index ? { ...item, price: event.target.value } : item)))} /></td>
              <td><button type="button" className="btn small" onClick={() => setRows(rows.filter((_, at) => at !== index))}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="prow"><label htmlFor="cs-fees">Fees</label><input id="cs-fees" inputMode="decimal" className="num" value={fees} onChange={(event) => setFees(event.target.value)} /></div>
      <ShippingFields id="cs" shipping={shipping} setShipping={setShipping} by={shippingBy} setBy={setShippingBy} />
      <p className="petotal">Received <b>{money(total - (num(fees) || 0) - (shippingBy === "me" ? num(shipping) || 0 : 0), USD)}</b></p>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!rows.length} onClick={() => void save()}>Save sale</button>
      </div>
    </div>
  );
}

type SealedLine = { lineId: string; entryId: string; label: string; date: string; sealed: number };

/** The product sale window: sealed lines (or part of one) with the sale price. */
function ProductSaleEditor({ store, list, close, onSaved }: { store: Store; list: PurchaseList; close: () => void; onSaved: Saved }) {
  const [head, setHead] = useState({ date: today(), place: "", note: "" });
  const [fees, setFees] = useState("");
  const [shipping, setShipping] = useState("");
  const [shippingBy, setShippingBy] = useState<"me" | "buyer">("buyer");
  const [sealed, setSealed] = useState<SealedLine[] | null>(null);
  const [rows, setRows] = useState<Record<string, { count: string; price: string }>>({});
  const [error, setError] = useState("");
  useEffect(() => { void request<SealedLine[]>("/api/purchases/sealed").then(setSealed).catch(() => setSealed([])); }, []);
  const chosen = Object.entries(rows).filter(([, row]) => Number(row.count) > 0);
  const save = async () => {
    setError("");
    try {
      const body = { kind: "product_sale", ...head, fees: num(fees), shipping: num(shipping), shippingBy, sales: chosen.map(([lineId, row]) => ({ lineId, quantity: Number(row.count), price: num(row.price) })) };
      const saved = await request<Entry>("/api/purchases", { method: "POST", body: JSON.stringify(body) });
      recordCreated(store, saved, () => onSaved(saved));
      close();
      onSaved(saved);
      store.flash(`Product sale of ${saved.date} saved`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the sale.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <HeaderFields value={head} set={(change) => setHead({ ...head, ...change })} places={list.places} kind="product_sale" />
      {sealed?.length === 0 && <p className="note">No sealed product. Products bought stay sealed until they are opened or sold.</p>}
      <table className="dtable pelines">
        <thead><tr><th>Sealed product</th><th>Bought</th><th>Still sealed</th><th>Count sold</th><th>Sale price (total)</th></tr></thead>
        <tbody>
          {(sealed ?? []).map((line) => (
            <tr key={line.lineId}>
              <td>{line.label}</td><td>{line.date}</td><td className="numcell">{line.sealed}</td>
              <td><input aria-label={`Count sold of ${line.label}`} type="number" min={0} max={line.sealed} className="num" value={rows[line.lineId]?.count ?? ""}
                onChange={(event) => setRows({ ...rows, [line.lineId]: { count: event.target.value, price: rows[line.lineId]?.price ?? "" } })} /></td>
              <td><input aria-label={`Sale price of ${line.label}`} inputMode="decimal" className="num" value={rows[line.lineId]?.price ?? ""}
                onChange={(event) => setRows({ ...rows, [line.lineId]: { count: rows[line.lineId]?.count ?? "1", price: event.target.value } })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="prow"><label htmlFor="ps-fees">Fees</label><input id="ps-fees" inputMode="decimal" className="num" value={fees} onChange={(event) => setFees(event.target.value)} /></div>
      <ShippingFields id="ps" shipping={shipping} setShipping={setShipping} by={shippingBy} setBy={setShippingBy} />
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => void save()}>Save sale</button>
      </div>
    </div>
  );
}

/** Header fields of any entry, and for trades the cash added by each side (trades with cards are recorded when completed). */
function HeaderEditor({ store, list, entry, kind, close, onSaved }: { store: Store; list: PurchaseList; entry: Entry | null; kind: EntryKind; close: () => void; onSaved: Saved }) {
  const [head, setHead] = useState({ date: entry?.date ?? today(), place: entry?.place ?? "", note: entry?.note ?? "" });
  const [shippingBy, setShippingBy] = useState<"me" | "buyer">(entry?.shippingBy ?? "buyer");
  const [cashOut, setCashOut] = useState(entry ? fixed(entry.cashOut) : "");
  const [cashIn, setCashIn] = useState(entry ? fixed(entry.cashIn) : "");
  const [fees, setFees] = useState(entry ? fixed(entry.fees) : "");
  const [shipping, setShipping] = useState(entry ? fixed(entry.shipping) : "");
  const [error, setError] = useState("");
  const save = async () => {
    setError("");
    try {
      const body = { kind, ...head, ...(kind === "trade" ? { cashOut: num(cashOut), cashIn: num(cashIn) } : { fees: num(fees), shipping: num(shipping), shippingBy }) };
      if (entry) {
        const before = { date: entry.date, place: entry.place, note: entry.note, cashOut: entry.cashOut, cashIn: entry.cashIn, fees: entry.fees, shipping: entry.shipping, shippingBy: entry.shippingBy };
        const saved = await request<Entry>(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) });
        store.pushUndo({
          label: `Edit ${KIND_LABELS[kind].toLowerCase()} of ${entry.date}`,
          undo: async () => { await request(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(before) }); onSaved(saved); },
          redo: async () => { await request(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) }); onSaved(saved); },
        });
        close();
        onSaved(saved);
      } else {
        const saved = await request<Entry>("/api/purchases", { method: "POST", body: JSON.stringify(body) });
        recordCreated(store, saved, () => onSaved(saved));
        close();
        onSaved(saved);
      }
      store.flash(`${KIND_LABELS[kind]} of ${head.date} saved`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the entry.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <HeaderFields value={head} set={(change) => setHead({ ...head, ...change })} places={list.places} kind={kind} />
      {kind === "trade" ? (<>
        <div className="prow"><label htmlFor="tr-out">Cash you added</label><input id="tr-out" inputMode="decimal" className="num" value={cashOut} onChange={(event) => setCashOut(event.target.value)} /></div>
        <div className="prow"><label htmlFor="tr-in">Cash they added</label><input id="tr-in" inputMode="decimal" className="num" value={cashIn} onChange={(event) => setCashIn(event.target.value)} /></div>
      </>) : kind !== "purchase" ? (<>
        <div className="prow"><label htmlFor="he-fees">Fees</label><input id="he-fees" inputMode="decimal" className="num" value={fees} onChange={(event) => setFees(event.target.value)} /></div>
        <ShippingFields id="he" shipping={shipping} setShipping={setShipping} by={shippingBy} setBy={setShippingBy} />
      </>) : null}
      <div className="btnrow end">
        <button type="button" className="btn primary" onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}

/** New or edited entries, by kind. */
export function entryDialog(store: Store, list: PurchaseList, kind: EntryKind, entry: Entry | null, onSaved: Saved, sale: SaleCopy[] = []) {
  const title = `${entry ? "Edit" : "New"} ${KIND_LABELS[kind].toLowerCase()}`;
  if (kind === "purchase" && !(entry && !entry.lines.length)) {
    purchaseWindow(store, list, {
      entry, head: { date: entry?.date ?? today(), place: entry?.place ?? "", note: entry?.note ?? "" }, tax: entry ? fixed(entry.tax) : "", shipping: entry ? fixed(entry.shipping) : "",
      lines: entry ? entry.lines.filter((line) => line.product !== "single").map(draftOf) : [], singles: entry ? entry.lines.filter((line) => line.product === "single").map(singleOf) : [],
      receipt: null,
    }, onSaved);
  } else if (kind === "card_sale" && !entry) {
    customDialog(title, (close) => <CardSaleEditor store={store} list={list} start={sale} close={close} onSaved={onSaved} />, 860, "Cancel");
  } else if (kind === "product_sale" && !entry) {
    customDialog(title, (close) => <ProductSaleEditor store={store} list={list} close={close} onSaved={onSaved} />, 860, "Cancel");
  } else {
    customDialog(title, (close) => <HeaderEditor store={store} list={list} entry={entry} kind={kind} close={close} onSaved={onSaved} />, 560, "Cancel");
  }
}

/** A new purchase read from a receipt file (Read receipt... on the Purchases tab, or a picture or PDF shared into the app). */
export async function purchaseFromReceipt(store: Store, file: File, onSaved: Saved = () => undefined) {
  try {
    const list = await request<PurchaseList>("/api/purchases");
    purchaseWindow(store, list, { entry: null, head: { date: today(), place: "", note: "" }, tax: "", shipping: "", lines: [], singles: [], receipt: file, readNow: true }, onSaved);
  } catch (reason) {
    store.fail(reason, "Could not open purchase history.");
  }
}

/** Opens the purchase window with a draft (a new purchase, a saved one, or one coming back from the scanner). */
function purchaseWindow(store: Store, list: PurchaseList, draft: PurchaseDraft, onSaved: Saved) {
  const reopen = (next: PurchaseDraft) => purchaseWindow(store, list, next, onSaved);
  customDialog(`${draft.entry ? "Edit" : "New"} purchase`, (close) => <PurchaseEditor store={store} list={list} start={draft} close={close} onSaved={onSaved} reopen={reopen} />, 1040, "Cancel");
}

/** Open...: how many of a product line to open, and where the pulled cards go. */
function OpenEditor({ store, entry, line, close, onDone }: { store: Store; entry: Entry; line: EntryLine; close: () => void; onDone: () => void }) {
  const owned = (store.collections ?? []).filter((item) => item.kind === "collection" && item.role === "owner");
  // products with packs open a number of packs, one at a time (0.19.0); others open a number of the product
  const packs = line.packs > 0;
  const left = packs ? line.packsLeft : line.sealed;
  const [count, setCount] = useState(packs ? "1" : String(line.sealed));
  const [collectionId, setCollectionId] = useState(store.prefs.targetCollection && owned.some((item) => item.id === store.prefs.targetCollection) ? store.prefs.targetCollection : owned[0]?.id ?? "");
  const [error, setError] = useState("");
  // a named deck with a decklist adds its cards in one step (0.20.0)
  const deckList = !packs && line.hasDeck;
  const [useDeck, setUseDeck] = useState(true);
  const open = async () => {
    setError("");
    try {
      const opening = await request<{
        id: string; name: string; collectionId: string; entryId: string; packs: Array<{ id: string; name: string }>;
        deck: { name: string; cards: number; missing: number } | null; deckError?: string;
      }>(`/api/purchases/${entry.id}/lines/${line.id}/open`, {
        method: "POST", body: JSON.stringify({ count: Number(count), collectionId, decklist: deckList && useDeck }),
      });
      const where = owned.find((item) => item.id === collectionId)?.name ?? "the collection";
      if (!opening.deck) setActiveOpening({ ...opening, groupIndex: 1, groupSize: opening.packs.length, hasNext: opening.packs.length > 1 });
      store.setTargetCollection(collectionId);
      store.pushUndo({
        label: `Open ${opening.name}`,
        undo: async () => {
          await request(`/api/purchases/openings/${opening.id}${opening.deck ? "?copies=1" : ""}`, { method: "DELETE" });
          await reloadOpening();
          if (opening.deck) await store.refreshAfterChange();
          onDone();
        },
        redo: async () => { store.flash("Open the product again from its purchase", "err"); },
      });
      close();
      onDone();
      if (opening.deck) {
        await store.refreshAfterChange();
        store.flash(`${opening.deck.cards} cards of ${opening.deck.name} added to ${where} and tied to ${opening.name}${opening.deck.missing ? `. ${opening.deck.missing} are not in the card database` : ""}`);
        return;
      }
      if (opening.deckError) store.flash(`${opening.deckError}. Cards added to ${where} are tied to ${opening.name}`, "err");
      else store.flash(`Opening ${opening.packs.length > 1 ? `Pack 1 of ${opening.packs.length}, ` : ""}${opening.name}: cards added to ${where} are tied to it`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the product.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <div className="prow"><label htmlFor="op-count">{packs ? "Open how many packs?" : "How many to open"}</label>
        <input id="op-count" type="number" min={1} max={left} className="num" autoFocus value={count} onChange={(event) => setCount(event.target.value)} />
        <span className="sub">{packs ? `of ${left} ${left === 1 ? "pack" : "packs"} left${line.quantity * line.packs > 1 ? ` in the ${line.productLabel.toLowerCase()}${line.quantity > 1 ? "es" : ""}` : ""}` : `of ${line.sealed} sealed`}</span></div>
      {packs && Number(count) > 1 && <p className="note">Each pack is its own opening. Cards go to Pack 1 first; Next pack moves on to the next one.</p>}
      {deckList && <label className="ck"><input type="checkbox" checked={useDeck} onChange={(event) => setUseDeck(event.target.checked)} /> Add the decklist of {line.name}</label>}
      {deckList && useDeck && <p className="note">The deck's cards are added to the collection and tied to the opening. Printings and finishes can be changed afterward.</p>}
      <div className="prow"><label htmlFor="op-coll">Pulled cards go to</label>
        <Picker id="op-coll" label="Collection" value={collectionId} options={owned.map((item) => ({ value: item.id, label: item.name }))} onChange={setCollectionId} /></div>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!collectionId} onClick={() => void open()}>Open</button>
      </div>
    </div>
  );
}

export const openDialog = (store: Store, entry: Entry, line: EntryLine, onDone: () => void) =>
  customDialog(`Open ${line.product !== "other" && line.name ? line.name : line.productLabel}${line.setCode ? `, ${line.setCode.toUpperCase()}` : ""}`, (close) => <OpenEditor store={store} entry={entry} line={line} close={close} onDone={onDone} />, 520, "Cancel");

/** Set current value...: the value each of a sealed line is worth today. */
function ValueEditor({ store, entry, line, close, onDone }: { store: Store; entry: Entry; line: EntryLine; close: () => void; onDone: () => void }) {
  const [value, setValue] = useState(fixed(line.sealedValue));
  const [error, setError] = useState("");
  const save = async () => {
    setError("");
    try {
      const url = `/api/purchases/${entry.id}/lines/${line.id}/value`;
      const result = await request<{ date: string; before: number | null }>(url, { method: "POST", body: JSON.stringify({ value: num(value) }) });
      store.pushUndo({
        label: `Value of ${line.productLabel}`,
        undo: async () => { await request(url, { method: "POST", body: JSON.stringify({ value: result.before, date: result.date }) }); onDone(); },
        redo: async () => { await request(url, { method: "POST", body: JSON.stringify({ value: num(value), date: result.date }) }); onDone(); },
      });
      close();
      onDone();
      store.flash(`${line.productLabel} valued at ${money(num(value), USD)} each`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the value.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <div className="prow"><label htmlFor="sv-value">Value each today</label><input id="sv-value" autoFocus inputMode="decimal" className="num" value={value} onChange={(event) => setValue(event.target.value)} /></div>
      {line.values.length > 0 && <p className="note">Earlier values: {line.values.map((item) => `${item.date} ${money(item.value, USD)}`).join(", ")}</p>}
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!Number.isFinite(num(value))} onClick={() => void save()}>Save value</button>
      </div>
    </div>
  );
}

export const valueDialog = (store: Store, entry: Entry, line: EntryLine, onDone: () => void) =>
  customDialog(`Set current value of ${line.productLabel}`, (close) => <ValueEditor store={store} entry={entry} line={line} close={close} onDone={onDone} />, 480, "Cancel");

/** Make purchases from imported prices...: copies with a purchase price and no purchase become purchases. */
function FromPrices({ store, close, onDone }: { store: Store; close: () => void; onDone: () => void }) {
  const [counts, setCounts] = useState<{ priced: number; untied: number } | null>(null);
  const [mode, setMode] = useState<"one" | "date">("date");
  useEffect(() => { void request<{ priced: number; untied: number }>("/api/purchases/priced-copies").then(setCounts).catch(() => setCounts(null)); }, []);
  const make = async () => {
    try {
      const result = await request<{ created: string[] }>("/api/purchases/from-prices", { method: "POST", body: JSON.stringify({ mode }) });
      const snapshots: unknown[] = [];
      store.pushUndo({
        label: "Make purchases from imported prices",
        undo: async () => { snapshots.length = 0; for (const id of result.created) snapshots.push((await request<{ snapshot: unknown }>(`/api/purchases/${id}`, { method: "DELETE" })).snapshot); onDone(); },
        redo: async () => { for (const snapshot of snapshots) await request("/api/purchases/restore", { method: "POST", body: JSON.stringify({ snapshot }) }); onDone(); },
      });
      close();
      onDone();
      store.flash(`${result.created.length} ${result.created.length === 1 ? "purchase" : "purchases"} made from imported prices`);
    } catch (reason) {
      store.fail(reason, "Could not make the purchases.");
    }
  };
  return (
    <div className="purchaseedit">
      <p>{counts === null ? "Counting copies" : `${counts.untied.toLocaleString()} of ${counts.priced.toLocaleString()} copies with a purchase price have no purchase.`}</p>
      <div className="radios" role="radiogroup" aria-label="How to record the prices">
        <label className="check"><input type="radio" name="fpmode" checked={mode === "one"} onChange={() => setMode("one")} /> One purchase for these copies</label>
        <label className="check"><input type="radio" name="fpmode" checked={mode === "date"} onChange={() => setMode("date")} /> One purchase per date added</label>
      </div>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!counts?.untied} onClick={() => void make()}>Make purchases</button>
      </div>
    </div>
  );
}

export const fromPricesDialog = (store: Store, onDone: () => void) =>
  customDialog("Make purchases from imported prices", (close) => <FromPrices store={store} close={close} onDone={onDone} />, 520, "Cancel");

/** Keeps the product names for the history filters. */
export function useProductOptions(list: PurchaseList | null) {
  return useMemo(() => (list?.products ?? []).map((product) => ({ value: product.id, label: product.label })), [list]);
}

// ---------- Places...: the stores, websites and people shared by every account ----------

function PlacesEditor({ store }: { store: Store }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; kind: PlaceKind; note: string } | null>(null);
  const [merging, setMerging] = useState<Place | null>(null);
  const [into, setInto] = useState("");
  const [error, setError] = useState("");
  const admin = !!store.user.admin;
  const load = () => request<Place[]>("/api/places").then(setPlaces).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the places."));
  useEffect(() => { void load(); }, []);
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (places ?? []).filter((place) => words.every((word) => `${place.name} ${place.note} ${PLACE_KINDS[place.kind]}`.toLowerCase().includes(word)));
  const changed = () => { void load(); window.dispatchEvent(new CustomEvent("mana-vault:purchases", { detail: "" })); };
  const run = async (work: () => Promise<void>) => {
    setError("");
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change the place."); }
  };
  const save = () => run(async () => {
    if (!editing) return;
    const body = { name: editing.name, kind: editing.kind, note: editing.note };
    const { before } = await request<{ before: typeof body }>(`/api/places/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    const id = editing.id;
    store.pushUndo({
      label: `Edit place ${before.name}`,
      undo: async () => { await request(`/api/places/${id}`, { method: "PATCH", body: JSON.stringify(before) }); changed(); },
      redo: async () => { await request(`/api/places/${id}`, { method: "PATCH", body: JSON.stringify(body) }); changed(); },
    });
    setEditing(null);
    changed();
    store.flash(before.name === body.name ? `${body.name} saved` : `${before.name} renamed to ${body.name} on every entry`);
  });
  const restorable = (result: { place: Place; entryIds: string[] }, label: string, again: () => Promise<unknown>) => store.pushUndo({
    label, undo: async () => { await request("/api/places/restore", { method: "POST", body: JSON.stringify(result) }); changed(); }, redo: async () => { await again(); changed(); },
  });
  const merge = () => run(async () => {
    if (!merging || !into) return;
    const target = places?.find((place) => place.id === into);
    const url = `/api/places/${merging.id}/merge`;
    const body = JSON.stringify({ into });
    const result = await request<{ place: Place; entryIds: string[] }>(url, { method: "POST", body });
    restorable(result, `Merge ${merging.name} into ${target?.name ?? ""}`, () => request(url, { method: "POST", body }));
    store.flash(`${merging.name} merged into ${target?.name ?? "the place kept"}: ${result.entryIds.length} ${result.entryIds.length === 1 ? "entry" : "entries"} moved`);
    setMerging(null);
    setInto("");
    changed();
  });
  const remove = (place: Place) => run(async () => {
    const result = await request<{ place: Place; entryIds: string[] }>(`/api/places/${place.id}`, { method: "DELETE" });
    restorable(result, `Delete place ${place.name}`, () => request(`/api/places/${place.id}`, { method: "DELETE" }));
    store.flash(`${place.name} deleted`);
    changed();
  });
  const add = () => run(async () => {
    const name = term.trim();
    if (!name) return;
    const place = await request<Place>("/api/places", { method: "POST", body: JSON.stringify({ name, kind: "store" }) });
    setTerm("");
    changed();
    setEditing({ id: place.id, name: place.name, kind: place.kind, note: place.note });
  });
  return (
    <div className="purchaseedit placeswin">
      {error && <p className="note err">{error}</p>}
      <div className="btnrow">
        <input className="search grow" aria-label="Find a place" placeholder="Find a place, or type a new name" value={term} onChange={(event) => setTerm(event.target.value)} />
        <button type="button" className="btn small" disabled={!term.trim() || (places ?? []).some((place) => place.name.toLowerCase() === term.trim().toLowerCase())} onClick={() => void add()}>Add place</button>
      </div>
      {!places && !error && <p className="note">Loading the places</p>}
      <table className="dtable grid">
        <thead><tr><th>Name</th><th>Kind</th><th>Note</th><th className="numcell">Entries</th><th /></tr></thead>
        <tbody>
          {places && !shown.length && <tr><td colSpan={5} className="sub">{places.length ? "No place matches" : "No places yet. A place is added when an entry names it."}</td></tr>}
          {shown.map((place) => editing?.id === place.id ? (
            <tr key={place.id}>
              <td><input aria-label="Name" autoFocus value={editing.name} maxLength={120} onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }} /></td>
              <td><Picker label="Kind" value={editing.kind} options={Object.entries(PLACE_KINDS).map(([value, label]) => ({ value, label }))} onChange={(kind) => setEditing({ ...editing, kind: kind as PlaceKind })} /></td>
              <td><input aria-label="Note" value={editing.note} maxLength={500} onChange={(event) => setEditing({ ...editing, note: event.target.value })} /></td>
              <td className="numcell">{place.uses}</td>
              <td><span className="btnrow"><button type="button" className="btn small primary" onClick={() => void save()}>Save</button><button type="button" className="btn small" onClick={() => setEditing(null)}>Cancel</button></span></td>
            </tr>
          ) : (
            <tr key={place.id}>
              <td>{place.name}</td><td>{PLACE_KINDS[place.kind]}</td><td className="sub">{place.note}</td><td className="numcell">{place.uses}</td>
              <td><span className="btnrow">
                <button type="button" className="btn small" onClick={() => setEditing({ id: place.id, name: place.name, kind: place.kind, note: place.note })}>Edit</button>
                {admin && <button type="button" className="btn small" onClick={() => { setMerging(place); setInto(""); }}>Merge into...</button>}
                {admin && <button type="button" className="btn small" disabled={place.uses > 0} title={place.uses ? "Merge a place in use into another place" : undefined} onClick={() => void remove(place)}>Delete</button>}
              </span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {merging && (
        <div className="mergebox">
          <div className="prow"><label htmlFor="pl-into">Merge {merging.name} into</label>
            <Picker id="pl-into" label={`Merge ${merging.name} into`} value={into} onChange={setInto}
              options={[{ value: "", label: "Choose the place to keep" }, ...(places ?? []).filter((place) => place.id !== merging.id).map((place) => ({ value: place.id, label: place.name, detail: PLACE_KINDS[place.kind] }))]} /></div>
          <p className="note">Every entry of {merging.name} moves to the place kept, and {merging.name} leaves the list.</p>
          <div className="btnrow end"><button type="button" className="btn small" onClick={() => setMerging(null)}>Cancel</button><button type="button" className="btn small primary" disabled={!into} onClick={() => void merge()}>Merge</button></div>
        </div>
      )}
      {!admin && <p className="note">Any account can add a place and change its name, kind or note. Only an admin can merge or delete places.</p>}
    </div>
  );
}

export const placesDialog = (store: Store) => customDialog("Places", () => <PlacesEditor store={store} />, 760);

// ---------- Add existing copies... (0.19.0): pick copies from a chosen collection, in List, Grid or Binder ----------

type CollectionCopy = {
  collectionId: string; cardId: string; foil: number; condition: string; language: string; proxy: boolean; quantity: number; free: number; tiedTo: string[];
  name: string; setCode: string; setName: string; collectorNumber: string; imageUrl: string | null; promoTypes: string | null;
};
const copyKeyOf = (copy: Pick<CollectionCopy, "collectionId" | "cardId" | "foil" | "condition" | "language" | "proxy">) =>
  `${copy.collectionId}|${copy.cardId}|${copy.foil}|${copy.condition}|${copy.language}|${copy.proxy ? 1 : 0}`;

function TieCopies({ store, openingId, collectionId, close, onDone }: { store: Store; openingId: string; collectionId: string | null; close: () => void; onDone: () => void }) {
  const own = (store.collections ?? []).filter((item) => item.kind !== "wishlist" && item.role !== "member");
  const [collection, setCollection] = useState(collectionId && own.some((item) => item.id === collectionId) ? collectionId : own[0]?.id ?? "");
  const [term, setTerm] = useState("");
  const [all, setAll] = useState(false);
  const [copies, setCopies] = useState<CollectionCopy[] | null>(null);
  const [chosen, setChosen] = useState<Map<string, { copy: CollectionCopy; count: number }>>(new Map());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const layout = store.prefs.tieLayout;
  const size = store.prefs.tieSize;
  useEffect(() => {
    if (!collection) return;
    let live = true;
    setCopies(null);
    const timer = window.setTimeout(() => {
      void request<CollectionCopy[]>(`/api/purchases/collection-copies?collectionId=${encodeURIComponent(collection)}&q=${encodeURIComponent(term.trim())}`)
        .then((list) => { if (live) setCopies(list); })
        .catch((reason: unknown) => { if (live) { setCopies([]); setError(reason instanceof Error ? reason.message : "Could not load the collection."); } });
    }, term ? 200 : 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [collection, term]);
  useEffect(() => setPage(0), [collection, term, all]);
  const shown = (copies ?? []).filter((copy) => all || copy.free > 0);
  const pickable = shown.filter((copy) => copy.free > 0);
  const toggle = (copy: CollectionCopy, on?: boolean) => setChosen((current) => {
    const next = new Map(current);
    const key = copyKeyOf(copy);
    if (on ?? !next.has(key)) next.set(key, { copy, count: next.get(key)?.count ?? copy.free });
    else next.delete(key);
    return next;
  });
  const click = (copy: CollectionCopy, event: { shiftKey: boolean }) => {
    if (copy.free <= 0) return;
    const key = copyKeyOf(copy);
    if (event.shiftKey && anchor) {
      const from = pickable.findIndex((item) => copyKeyOf(item) === anchor);
      const to = pickable.findIndex((item) => copyKeyOf(item) === key);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        for (const item of pickable.slice(lo, hi + 1)) toggle(item, true);
        return;
      }
    }
    toggle(copy);
    setAnchor(key);
  };
  const allPicked = pickable.length > 0 && pickable.every((copy) => chosen.has(copyKeyOf(copy)));
  const label = (copy: CollectionCopy) => `${copy.name} (${copy.setCode.toUpperCase()}) ${copy.collectorNumber}${copy.foil ? ` ${copy.foil === 1 ? "foil" : "etched"}` : ""}`;
  const pickBox = (copy: CollectionCopy) => (
    <input type="checkbox" className="pickbox" aria-label={`Pick ${label(copy)}`} checked={chosen.has(copyKeyOf(copy))} disabled={copy.free <= 0}
      onClick={(event) => { event.stopPropagation(); if (event.shiftKey) { event.preventDefault(); click(copy, event); } }}
      onChange={(event) => { if (!(event.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey) click(copy, { shiftKey: false }); }} />
  );
  const tiedNote = (copy: CollectionCopy) => (copy.tiedTo.length ? <span className="sub">{copy.free ? `${copy.quantity - copy.free} on ` : "On "}{copy.tiedTo.join(", ")}</span> : null);
  const item = (copy: CollectionCopy) => {
    const key = copyKeyOf(copy);
    const on = chosen.has(key);
    const disabled = copy.free <= 0;
    if (layout === "list") {
      return (
        <div key={key} className={`row tierow${on ? " active" : ""}${disabled ? " off" : ""}`} onClick={(event) => click(copy, event)}>
          {pickBox(copy)}
          {copy.imageUrl ? <img className="thumb-img" src={copy.imageUrl} alt="" loading="lazy" /> : <span className="thumb-img none">MV</span>}
          <div className="rowmain">
            <div className="rowtitle"><b>{copy.name}</b><FinishBadge finish={copy.foil} promoTypes={copy.promoTypes} />{copy.proxy && <span className="badge proxy">Proxy</span>}</div>
            <div className="rowmeta"><SetIcon code={copy.setCode} />{copy.setName} ({copy.setCode.toUpperCase()}) {copy.collectorNumber}, {copy.condition}{copy.language !== "en" ? `, ${copy.language.toUpperCase()}` : ""} {tiedNote(copy)}</div>
          </div>
          <span className="sub">{copy.free} free{copy.free !== copy.quantity ? ` of ${copy.quantity}` : ""}</span>
        </div>
      );
    }
    return (
      <div key={key} className={`stackcell tiecell${on ? " active" : ""}${disabled ? " off" : ""}`} onClick={(event) => click(copy, event)} title={label(copy)}>
        <div className={on ? "pocket active" : "pocket"}>
          {copy.imageUrl ? <img src={copy.imageUrl} alt={copy.name} loading="lazy" draggable={false} /> : <span className="pocketname">{copy.name}</span>}
          {on && <span className="badge tiecheck" aria-hidden="true">✓</span>}
        </div>
        <div className="pipbar">{pickBox(copy)}<FinishBadge finish={copy.foil} promoTypes={copy.promoTypes} /><span className="sub">{copy.free} free</span></div>
        {disabled && tiedNote(copy)}
      </div>
    );
  };
  const pages = Math.max(1, Math.ceil(shown.length / 9));
  const pageShown = layout === "binder" ? shown.slice(page * 9, page * 9 + 9) : shown;
  const rows = [...chosen.values()];
  const save = async () => {
    setError("");
    try {
      const items = rows.map(({ copy, count }) => ({ collectionId: copy.collectionId, cardId: copy.cardId, foil: copy.foil, condition: copy.condition, language: copy.language, proxy: copy.proxy, quantity: count }));
      let ids = (await request<{ ids: number[] }>(`/api/purchases/openings/${openingId}/ties`, { method: "POST", body: JSON.stringify({ items }) })).ids ?? [];
      store.pushUndo({
        label: `Tie ${items.length} ${items.length === 1 ? "card" : "cards"} to the opening`,
        undo: async () => { for (const id of ids) await request(`/api/purchases/ties/${id}`, { method: "DELETE" }).catch(() => undefined); onDone(); },
        redo: async () => { ids = (await request<{ ids: number[] }>(`/api/purchases/openings/${openingId}/ties`, { method: "POST", body: JSON.stringify({ items }) })).ids ?? []; onDone(); },
      });
      store.flash(`${items.reduce((sum, row) => sum + row.quantity, 0)} cards tied to the opening`);
      close();
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not tie the cards.");
    }
  };
  return (
    <div className="purchaseedit tiecopies">
      {error && <p className="note err">{error}</p>}
      <div className="btnrow tiehead">
        <Picker label="Collection" prefix="Collection: " value={collection} onChange={setCollection} options={own.map((item) => ({ value: item.id, label: item.name }))} />
        <input aria-label="Find copies" className="grow" autoFocus value={term} placeholder="Find a card in this collection" onChange={(event) => setTerm(event.target.value)} />
        <label className="check"><input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} /> Show all</label>
        <OptionsButton title="Add existing copies options">
          <LayoutRows name="Copies" layout={layout} size={size} onLayout={(tieLayout) => store.setPrefs({ tieLayout })} onSize={(tieSize) => store.setPrefs({ tieSize })} />
        </OptionsButton>
      </div>
      <div className="btnrow">
        <label className="check"><input type="checkbox" checked={allPicked} disabled={!pickable.length}
          onChange={() => { for (const copy of pickable) toggle(copy, !allPicked); }} /> Select all</label>
        <span className="sub">{copies === null ? "Loading" : `${shown.length} ${shown.length === 1 ? "copy" : "copies"}${all ? "" : " not on a pack or purchase"}`}</span>
      </div>
      <div className={`tielist ${layout === "list" ? "list" : `cardgrid tiegrid size-${layout === "binder" ? "binder" : size}`}`} role="listbox" aria-label="Copies in the collection">
        {copies !== null && !shown.length && <p className="note pad">{term ? "No copies match" : "No free copies in this collection"}</p>}
        {pageShown.map(item)}
      </div>
      {layout === "binder" && pages > 1 && (
        <div className="binderpager">
          <button type="button" className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next page</button>
        </div>
      )}
      <h4>Chosen</h4>
      <table className="dtable grid tiechosen">
        <thead><tr><th>Card</th><th>Collection</th><th className="numcell">Count</th><th /></tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={4} className="sub">No copies chosen</td></tr>}
          {rows.map(({ copy, count }) => (
            <tr key={copyKeyOf(copy)}>
              <td>{copy.name} <span className="sub">{copy.setCode.toUpperCase()} #{copy.collectorNumber}</span><FinishBadge finish={copy.foil} promoTypes={copy.promoTypes} /></td>
              <td>{store.collectionName(copy.collectionId)}</td>
              <td className="numcell"><input aria-label={`Count of ${copy.name}`} type="number" min={1} max={copy.free} className="num" value={count}
                onChange={(event) => setChosen((current) => new Map(current).set(copyKeyOf(copy), { copy, count: Math.max(1, Math.min(copy.free, Math.floor(Number(event.target.value)) || 1)) }))} /></td>
              <td><button type="button" className="btn small" onClick={() => toggle(copy, false)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btnrow end"><button type="button" className="btn primary" disabled={!rows.length} onClick={() => void save()}>Tie to the opening</button></div>
    </div>
  );
}

export const tieCopiesDialog = (store: Store, openingId: string, onDone: () => void, collectionId: string | null = null) =>
  customDialog("Add existing copies", (close) => <TieCopies store={store} openingId={openingId} collectionId={collectionId} close={close} onDone={onDone} />, 980, "Cancel");
