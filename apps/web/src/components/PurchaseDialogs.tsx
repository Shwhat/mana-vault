// ---------- purchase history windows: new and edited entries, Open..., Set current value..., and imported prices ----------
import { useEffect, useMemo, useState } from "react";
import { request } from "../api";
import { type Entry, type EntryKind, type EntryLine, KIND_LABELS, type Product, type PurchaseList, reloadOpening, setActiveOpening } from "../purchase-state";
import { type Store } from "../store";
import { CONDITIONS, type Currency, money } from "../types";
import { SetIcon } from "./CardMarks";
import { customDialog } from "./Dialog";
import { choices, Picker } from "./Picker";
import { Suggest } from "./Suggest";

const today = () => new Date().toISOString().slice(0, 10);
const num = (text: string) => {
  const value = Number(text.replace(",", "."));
  return text.trim() === "" ? 0 : Number.isFinite(value) ? value : NaN;
};
const fixed = (value: number) => (Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "");

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

/** The header fields every entry has: date, place, currency and note. */
function HeaderFields({ value, set, places, kind }: {
  value: { date: string; place: string; currency: Currency; note: string }; set: (change: Partial<{ date: string; place: string; currency: Currency; note: string }>) => void;
  places: string[]; kind: EntryKind;
}) {
  return (
    <>
      <div className="prow"><label htmlFor="pe-date">Date</label><input id="pe-date" type="date" value={value.date} onChange={(event) => set({ date: event.target.value })} /></div>
      <div className="prow"><label htmlFor="pe-place">{kind === "trade" ? "Traded with" : kind === "purchase" ? "Bought from" : "Sold to or on"}</label>
        <input id="pe-place" list="pe-places" value={value.place} maxLength={120} placeholder="Store, website or person" onChange={(event) => set({ place: event.target.value })} />
        <datalist id="pe-places">{places.map((place) => <option key={place} value={place} />)}</datalist></div>
      <div className="prow"><label htmlFor="pe-currency">Currency</label>
        <Picker id="pe-currency" label="Currency" value={value.currency} options={choices([["usd", "USD"], ["eur", "EUR"]])} onChange={(currency) => set({ currency: currency as Currency })} /></div>
      <div className="prow"><label htmlFor="pe-note">Note</label><input id="pe-note" value={value.note} maxLength={1000} onChange={(event) => set({ note: event.target.value })} /></div>
    </>
  );
}

type LineDraft = {
  id?: string; product: string; name: string; setCode: string; quantity: string; each: string; total: string; packs: string;
  card: string; cardId: string | null; foil: string; condition: string; collectionId: string; locked: number;
};

const draftOf = (line: EntryLine): LineDraft => ({
  id: line.id, product: line.product, name: line.product === "other" ? line.name : "", setCode: line.setCode ?? "", quantity: String(line.quantity),
  each: fixed(line.cost / line.quantity), total: fixed(line.cost), packs: String(line.packs), card: line.product === "single" ? line.name : "", cardId: line.cardId,
  foil: String(line.foil ?? 0), condition: line.condition ?? "NM", collectionId: line.collectionId ?? "", locked: line.opened + line.sold,
});

/** The purchase window: one line per product, with tax and shipping spread over the lines by cost. */
function PurchaseEditor({ store, list, entry, close, onSaved }: { store: Store; list: PurchaseList; entry: Entry | null; close: () => void; onSaved: Saved }) {
  const owned = (store.collections ?? []).filter((item) => item.kind === "collection" && item.role === "owner");
  const blank = (product = "play_booster"): LineDraft => ({
    product, name: "", setCode: "", quantity: "1", each: "", total: "", packs: String(list.products.find((item) => item.id === product)?.packs ?? 0),
    card: "", cardId: null, foil: "0", condition: "NM", collectionId: store.prefs.targetCollection && owned.some((item) => item.id === store.prefs.targetCollection) ? store.prefs.targetCollection : owned[0]?.id ?? "", locked: 0,
  });
  const [head, setHead] = useState({ date: entry?.date ?? today(), place: entry?.place ?? "", currency: (entry?.currency ?? store.prefs.currency) as Currency, note: entry?.note ?? "" });
  const [tax, setTax] = useState(entry ? fixed(entry.tax) : "");
  const [shipping, setShipping] = useState(entry ? fixed(entry.shipping) : "");
  const [lines, setLines] = useState<LineDraft[]>(entry ? entry.lines.map(draftOf) : [blank()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setLine = (index: number, change: Partial<LineDraft>) => setLines(lines.map((line, at) => (at === index ? { ...line, ...change } : line)));
  // either cost each or the total fills the other
  const costChange = (index: number, field: "each" | "total", textValue: string) => {
    const line = lines[index]!;
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const value = num(textValue);
    setLine(index, field === "each" ? { each: textValue, total: Number.isFinite(value) && textValue ? fixed(value * quantity) : "" } : { total: textValue, each: Number.isFinite(value) && textValue ? fixed(value / quantity) : "" });
  };
  const subtotal = lines.reduce((sum, line) => sum + (num(line.total) || 0), 0);
  const extra = (num(tax) || 0) + (num(shipping) || 0);
  const productOptions = list.products.map((product: Product) => ({ value: product.id, label: product.label }));
  const save = async () => {
    setError("");
    setBusy(true);
    try {
      const sent = [];
      for (const line of lines) {
        const quantity = Number(line.quantity);
        let cardId = line.cardId;
        if (line.product === "single" && !line.id) {
          if (!line.card.trim()) throw new Error("Type the card name of every Single cards line");
          cardId = (await request<{ id: string }>(`/api/cards/resolve?name=${encodeURIComponent(line.card.trim())}${line.setCode.trim() ? `&set=${encodeURIComponent(line.setCode.trim())}` : ""}`)).id;
        }
        sent.push({
          id: line.id, product: line.product, name: line.name, setCode: line.setCode, quantity, cost: num(line.total), packs: Number(line.packs || 0),
          ...(line.product === "single" && !line.id ? { cardId, foil: Number(line.foil), condition: line.condition, language: "en", proxy: false, collectionId: line.collectionId } : {}),
        });
      }
      const body = { kind: "purchase", ...head, tax: num(tax), shipping: num(shipping), lines: sent };
      if (entry) {
        const before = { date: entry.date, place: entry.place, currency: entry.currency, note: entry.note, tax: entry.tax, shipping: entry.shipping,
          lines: entry.lines.map((line) => ({ id: line.id, product: line.product, name: line.name, setCode: line.setCode, quantity: line.quantity, cost: line.cost, packs: line.packs })) };
        const saved = await request<Entry>(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) });
        store.pushUndo({
          label: `Edit purchase of ${entry.date}`,
          undo: async () => { await request(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(before) }); onSaved(saved); },
          redo: async () => { await request(`/api/purchases/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) }); onSaved(saved); },
        });
        close();
        onSaved(saved);
        store.flash(`Purchase of ${saved.date} saved`);
      } else {
        const saved = await request<Entry>("/api/purchases", { method: "POST", body: JSON.stringify(body) });
        recordCreated(store, saved, () => onSaved(saved));
        close();
        onSaved(saved);
        if (lines.some((line) => line.product === "single")) await store.refreshAfterChange();
        store.flash(`Purchase of ${saved.date} saved`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the purchase.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <HeaderFields value={head} set={(change) => setHead({ ...head, ...change })} places={list.places} kind="purchase" />
      <table className="dtable pelines">
        <thead><tr><th>Product</th><th>Set</th><th>Quantity</th><th>Cost each</th><th>Total</th><th>Packs in it</th><th>Full cost</th><th /></tr></thead>
        <tbody>
          {lines.map((line, index) => {
            const share = subtotal > 0 ? extra * (num(line.total) || 0) / subtotal : extra / lines.length;
            return [
              <tr key={`l${index}`}>
                <td>
                  <Picker label={`Product of line ${index + 1}`} value={line.product} options={productOptions} disabled={!!line.id && line.product === "single"}
                    onChange={(product) => setLine(index, { product, packs: String(list.products.find((item) => item.id === product)?.packs ?? 0) })} />
                  {line.product === "other" && <input aria-label={`Name of line ${index + 1}`} value={line.name} placeholder="Product name" maxLength={120} onChange={(event) => setLine(index, { name: event.target.value })} />}
                </td>
                <td><span className="withbtn"><input aria-label={`Set of line ${index + 1}`} className="setcode" value={line.setCode} maxLength={8} placeholder="Code"
                  disabled={!!line.id && line.product === "single"} onChange={(event) => setLine(index, { setCode: event.target.value.toLowerCase() })} />{line.setCode.length >= 2 && <SetIcon code={line.setCode} />}</span></td>
                <td><input aria-label={`Quantity of line ${index + 1}`} type="number" min={Math.max(1, line.locked)} value={line.quantity} className="num"
                  onChange={(event) => { const quantity = event.target.value; const each = num(line.each); setLine(index, { quantity, total: line.each && Number.isFinite(each) ? fixed(each * (Number(quantity) || 1)) : line.total }); }} /></td>
                <td><input aria-label={`Cost each of line ${index + 1}`} inputMode="decimal" value={line.each} className="num" onChange={(event) => costChange(index, "each", event.target.value)} /></td>
                <td><input aria-label={`Total of line ${index + 1}`} inputMode="decimal" value={line.total} className="num" onChange={(event) => costChange(index, "total", event.target.value)} /></td>
                <td>{["booster_box", "bundle", "prerelease_kit", "other", "other_booster", "jumpstart_booster", "secret_lair"].includes(line.product)
                  ? <input aria-label={`Packs in line ${index + 1}`} type="number" min={0} value={line.packs} className="num" onChange={(event) => setLine(index, { packs: event.target.value })} />
                  : <span className="sub">{line.packs === "0" ? "" : line.packs}</span>}</td>
                <td className="numcell">{money((num(line.total) || 0) + share, head.currency)}</td>
                <td><button type="button" className="btn small" disabled={lines.length === 1 || line.locked > 0} title={line.locked ? "Opened or sold lines stay" : undefined}
                  onClick={() => setLines(lines.filter((_, at) => at !== index))}>Remove</button></td>
              </tr>,
              line.product === "single" && !line.id ? (
                <tr key={`s${index}`} className="pesingle"><td colSpan={8}>
                  <span className="btnrow">
                    <Suggest mode="name" aria-label={`Card of line ${index + 1}`} placeholder="Card name" value={line.card} onValue={(card) => setLine(index, { card })} />
                    <Picker label={`Finish of line ${index + 1}`} value={line.foil} options={choices([["0", "Regular"], ["1", "Foil"], ["2", "Etched"]])} onChange={(foil) => setLine(index, { foil })} />
                    <Picker label={`Condition of line ${index + 1}`} value={line.condition} options={choices(CONDITIONS)} onChange={(condition) => setLine(index, { condition })} />
                    <Picker label={`Collection of line ${index + 1}`} value={line.collectionId} options={owned.map((item) => ({ value: item.id, label: item.name }))} onChange={(collectionId) => setLine(index, { collectionId })} />
                  </span>
                </td></tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
      <div className="btnrow">
        <button type="button" className="btn small" onClick={() => setLines([...lines, blank()])}>Add product</button>
        <button type="button" className="btn small" onClick={() => setLines([...lines, blank("single")])}>Add single card</button>
      </div>
      <div className="prow"><label htmlFor="pe-tax">Tax</label><input id="pe-tax" inputMode="decimal" className="num" value={tax} onChange={(event) => setTax(event.target.value)} /></div>
      <div className="prow"><label htmlFor="pe-shipping">Shipping</label><input id="pe-shipping" inputMode="decimal" className="num" value={shipping} onChange={(event) => setShipping(event.target.value)} /></div>
      <p className="petotal">Total <b>{money(subtotal + extra, head.currency)}</b></p>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save purchase</button>
      </div>
    </div>
  );
}

type CopyFound = {
  collectionId: string; collectionName: string; cardId: string; foil: number; condition: string; language: string; proxy: boolean; quantity: number;
  name: string; setCode: string; collectorNumber: string; prices: { usd: number | null; usdFoil: number | null; usdEtched: number | null; eur: number | null; eurFoil: number | null };
};
export type SaleCopy = Omit<CopyFound, "prices"> & { count: string; price: string };
const copyId = (copy: { collectionId: string; cardId: string; foil: number; condition: string; language: string; proxy: boolean }) =>
  `${copy.collectionId}|${copy.cardId}|${copy.foil}|${copy.condition}|${copy.language}|${copy.proxy}`;
const priceOf = (copy: CopyFound, currency: Currency) => (currency === "eur" ? (copy.foil ? copy.prices.eurFoil : copy.prices.eur)
  : copy.foil === 0 ? copy.prices.usd : copy.foil === 1 ? copy.prices.usdFoil : copy.prices.usdEtched ?? copy.prices.usdFoil);

/** The card sale window: copies from collections with the sale price of each, fees and shipping. Saving removes the copies. */
function CardSaleEditor({ store, list, start, close, onSaved }: { store: Store; list: PurchaseList; start: SaleCopy[]; close: () => void; onSaved: Saved }) {
  const [head, setHead] = useState({ date: today(), place: "", currency: store.prefs.currency as Currency, note: "" });
  const [fees, setFees] = useState("");
  const [shipping, setShipping] = useState("");
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
    setRows([...rows, { ...rest, count: "1", price: fixed(priceOf(copy, head.currency) ?? 0) }]);
  };
  const total = rows.reduce((sum, row) => sum + (num(row.price) || 0) * (Number(row.count) || 0), 0);
  const save = async () => {
    setError("");
    try {
      const body = {
        kind: "card_sale", ...head, fees: num(fees), shipping: num(shipping),
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
      <div className="prow"><label htmlFor="cs-shipping">Shipping</label><input id="cs-shipping" inputMode="decimal" className="num" value={shipping} onChange={(event) => setShipping(event.target.value)} /></div>
      <p className="petotal">Received <b>{money(total - (num(fees) || 0) - (num(shipping) || 0), head.currency)}</b></p>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!rows.length} onClick={() => void save()}>Save sale</button>
      </div>
    </div>
  );
}

type SealedLine = { lineId: string; entryId: string; label: string; date: string; sealed: number };

/** The product sale window: sealed lines (or part of one) with the sale price. */
function ProductSaleEditor({ store, list, close, onSaved }: { store: Store; list: PurchaseList; close: () => void; onSaved: Saved }) {
  const [head, setHead] = useState({ date: today(), place: "", currency: store.prefs.currency as Currency, note: "" });
  const [fees, setFees] = useState("");
  const [shipping, setShipping] = useState("");
  const [sealed, setSealed] = useState<SealedLine[] | null>(null);
  const [rows, setRows] = useState<Record<string, { count: string; price: string }>>({});
  const [error, setError] = useState("");
  useEffect(() => { void request<SealedLine[]>("/api/purchases/sealed").then(setSealed).catch(() => setSealed([])); }, []);
  const chosen = Object.entries(rows).filter(([, row]) => Number(row.count) > 0);
  const save = async () => {
    setError("");
    try {
      const body = { kind: "product_sale", ...head, fees: num(fees), shipping: num(shipping), sales: chosen.map(([lineId, row]) => ({ lineId, quantity: Number(row.count), price: num(row.price) })) };
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
      <div className="prow"><label htmlFor="ps-shipping">Shipping</label><input id="ps-shipping" inputMode="decimal" className="num" value={shipping} onChange={(event) => setShipping(event.target.value)} /></div>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => void save()}>Save sale</button>
      </div>
    </div>
  );
}

/** Header fields of any entry, and for trades the cash added by each side (trades with cards are recorded when completed). */
function HeaderEditor({ store, list, entry, kind, close, onSaved }: { store: Store; list: PurchaseList; entry: Entry | null; kind: EntryKind; close: () => void; onSaved: Saved }) {
  const [head, setHead] = useState({ date: entry?.date ?? today(), place: entry?.place ?? "", currency: (entry?.currency ?? store.prefs.currency) as Currency, note: entry?.note ?? "" });
  const [cashOut, setCashOut] = useState(entry ? fixed(entry.cashOut) : "");
  const [cashIn, setCashIn] = useState(entry ? fixed(entry.cashIn) : "");
  const [fees, setFees] = useState(entry ? fixed(entry.fees) : "");
  const [shipping, setShipping] = useState(entry ? fixed(entry.shipping) : "");
  const [error, setError] = useState("");
  const save = async () => {
    setError("");
    try {
      const body = { kind, ...head, ...(kind === "trade" ? { cashOut: num(cashOut), cashIn: num(cashIn) } : { fees: num(fees), shipping: num(shipping) }) };
      if (entry) {
        const before = { date: entry.date, place: entry.place, currency: entry.currency, note: entry.note, cashOut: entry.cashOut, cashIn: entry.cashIn, fees: entry.fees, shipping: entry.shipping };
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
        <div className="prow"><label htmlFor="he-shipping">Shipping</label><input id="he-shipping" inputMode="decimal" className="num" value={shipping} onChange={(event) => setShipping(event.target.value)} /></div>
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
    customDialog(title, (close) => <PurchaseEditor store={store} list={list} entry={entry} close={close} onSaved={onSaved} />, 980, "Cancel");
  } else if (kind === "card_sale" && !entry) {
    customDialog(title, (close) => <CardSaleEditor store={store} list={list} start={sale} close={close} onSaved={onSaved} />, 860, "Cancel");
  } else if (kind === "product_sale" && !entry) {
    customDialog(title, (close) => <ProductSaleEditor store={store} list={list} close={close} onSaved={onSaved} />, 860, "Cancel");
  } else {
    customDialog(title, (close) => <HeaderEditor store={store} list={list} entry={entry} kind={kind} close={close} onSaved={onSaved} />, 560, "Cancel");
  }
}

/** Open...: how many of a product line to open, and where the pulled cards go. */
function OpenEditor({ store, entry, line, close, onDone }: { store: Store; entry: Entry; line: EntryLine; close: () => void; onDone: () => void }) {
  const owned = (store.collections ?? []).filter((item) => item.kind === "collection" && item.role === "owner");
  const [count, setCount] = useState(String(line.sealed));
  const [collectionId, setCollectionId] = useState(store.prefs.targetCollection && owned.some((item) => item.id === store.prefs.targetCollection) ? store.prefs.targetCollection : owned[0]?.id ?? "");
  const [error, setError] = useState("");
  const open = async () => {
    setError("");
    try {
      const opening = await request<{ id: string; name: string; collectionId: string; entryId: string }>(`/api/purchases/${entry.id}/lines/${line.id}/open`, {
        method: "POST", body: JSON.stringify({ count: Number(count), collectionId }),
      });
      setActiveOpening(opening);
      store.setTargetCollection(collectionId);
      store.pushUndo({
        label: `Open ${opening.name}`,
        undo: async () => { await request(`/api/purchases/openings/${opening.id}`, { method: "DELETE" }); await reloadOpening(); onDone(); },
        redo: async () => { store.flash("Open the product again from its purchase", "err"); },
      });
      close();
      onDone();
      store.flash(`Opening ${opening.name}: cards added to ${owned.find((item) => item.id === collectionId)?.name ?? "the collection"} are tied to it`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the product.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <div className="prow"><label htmlFor="op-count">How many to open</label><input id="op-count" type="number" min={1} max={line.sealed} className="num" value={count} onChange={(event) => setCount(event.target.value)} />
        <span className="sub">of {line.sealed} sealed</span></div>
      <div className="prow"><label htmlFor="op-coll">Pulled cards go to</label>
        <Picker id="op-coll" label="Collection" value={collectionId} options={owned.map((item) => ({ value: item.id, label: item.name }))} onChange={setCollectionId} /></div>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!collectionId} onClick={() => void open()}>Open</button>
      </div>
    </div>
  );
}

export const openDialog = (store: Store, entry: Entry, line: EntryLine, onDone: () => void) =>
  customDialog(`Open ${line.productLabel}${line.setCode ? `, ${line.setCode.toUpperCase()}` : ""}`, (close) => <OpenEditor store={store} entry={entry} line={line} close={close} onDone={onDone} />, 520, "Cancel");

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
      store.flash(`${line.productLabel} valued at ${money(num(value), entry.currency)} each`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the value.");
    }
  };
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <div className="prow"><label htmlFor="sv-value">Value each today</label><input id="sv-value" autoFocus inputMode="decimal" className="num" value={value} onChange={(event) => setValue(event.target.value)} /></div>
      {line.values.length > 0 && <p className="note">Earlier values: {line.values.map((item) => `${item.date} ${money(item.value, entry.currency)}`).join(", ")}</p>}
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
