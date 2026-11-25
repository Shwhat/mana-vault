// ---------- Purchases: the summary with its chart, the history of every entry, and one entry in full ----------
import { PickBar, usePicks } from "../components/Picks";
import { goNextPack, PURCHASES_CHANGED } from "../live";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKept, useKeptScroll } from "../kept";
import { downloadBlob, fetchFile, request } from "../api";
import { isApp } from "../android/platform";
import type { Action } from "../actions";
import { SetIcon } from "../components/CardMarks";
import { rowMenu } from "../components/ContextMenu";
import { choiceDialog, confirmDialog } from "../components/Dialog";
import { choices, Picker } from "../components/Picker";
import {
  entryDialog, fromPricesDialog, keepReceipt, openDialog, pickReceipt, placesDialog, purchaseFromReceipt, removeReceipt, type SaleCopy, tieCopiesDialog, useProductOptions, valueDialog,
  barcodeDialog, changeCollectionDialog, preconOpeningDialog, virtualPacksDialog,
} from "../components/PurchaseDialogs";
import {
  type ChartPoint, type Entry, type EntryKind, type EntryOpening, type EntryTie, type EntrySummary, KIND_LABELS, type PurchaseList, packLabel, reloadOpening, setActiveOpening, useActiveOpening,
} from "../purchase-state";
import { type Store, useApp } from "../store";
import { copyPrice, type Currency, money } from "../types";

type Period = "all" | "year" | "12m" | "30d";
const PERIODS: Array<[Period, string]> = [["all", "All time"], ["year", "This year"], ["12m", "Last 12 months"], ["30d", "Last 30 days"]];
const fromOf = (period: Period): string | null => {
  const now = new Date();
  if (period === "year") return `${now.getFullYear()}-01-01`;
  if (period === "12m") return new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  if (period === "30d") return new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  return null;
};
const SORTS: Array<[string, string]> = [["new", "Newest first"], ["old", "Oldest first"], ["gain", "Gain first"], ["loss", "Loss first"], ["out", "Most money out"]];
const signed = (value: number, currency: Currency) => (value > 0 ? `+${money(value, currency)}` : value < 0 ? `-${money(-value, currency)}` : money(0, currency));
const gainClass = (value: number) => (value > 0 ? "gain up" : value < 0 ? "gain down" : "gain");

/** New entry commands, shared by the view and the menus. */
export function newEntry(store: Store, kind: EntryKind, onSaved?: (entry: Entry) => void, sale: SaleCopy[] = []) {
  void request<PurchaseList>("/api/purchases").then((list) => entryDialog(store, list, kind, null, (entry) => {
    onSaved?.(entry);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("mana-vault:purchases", { detail: entry.id })), 0);
  }, sale)).catch((reason: unknown) => store.fail(reason, "Could not open purchase history."));
}

/** The copies picked in a collection, for Sell selected cards... */
export function saleCopies(store: Store): SaleCopy[] {
  const open = store.prefs.openCollection;
  return store.pickedEntries().filter((entry) => !entry.proxy).map((entry) => {
    const collectionId = entry.collection_id ?? open ?? "";
    return {
      collectionId, collectionName: entry.collection_name ?? store.collections?.find((item) => item.id === collectionId)?.name ?? "", cardId: entry.id, foil: entry.foil,
      condition: entry.condition, language: entry.language, proxy: !!entry.proxy, quantity: entry.quantity, name: entry.name, setCode: entry.set_code,
      collectorNumber: entry.collector_number, count: String(entry.quantity), price: String(copyPrice(entry, "usd") ?? 0),
    };
  });
}

export async function exportPurchases(store: Store, what: "entries" | "lines") {
  try {
    const response = await fetchFile(`/api/purchases/export${what === "lines" ? "?what=lines" : ""}`);
    if (!response.ok) throw new Error("Could not export the purchase history");
    const blob = await response.blob();
    downloadBlob(what === "lines" ? "mana-vault-purchase-lines.csv" : "mana-vault-purchases.csv", blob);
    store.flash(what === "lines" ? "Purchase lines exported" : "Purchase history exported");
  } catch (reason) {
    store.fail(reason, "Could not export the purchase history.");
  }
}

/** Money spent and the value of what it bought over time: two lines on one axis, a crosshair readout and a table. */
function SpendChart({ currency }: { currency: Currency }) {
  const [data, setData] = useState<{ points: ChartPoint[]; unpriced: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let live = true;
    void request<{ points: ChartPoint[]; unpriced: number }>(`/api/purchases/chart?currency=${currency}`).then((value) => { if (live) setData(value); }).catch(() => { if (live) setData({ points: [], unpriced: 0 }); });
    return () => { live = false; };
  }, [currency]);
  if (!data) return <p className="note">Loading the chart</p>;
  if (data.points.length < 1) return <p className="note">The chart shows once there is an entry.</p>;
  const points = data.points;
  const WIDTH = 640; const HEIGHT = 220; const PAD = { left: 70, right: 70, top: 14, bottom: 26 };
  const top = Math.max(1, ...points.map((point) => Math.max(point.spent, point.value))) * 1.1;
  const x = (index: number) => PAD.left + (points.length === 1 ? (WIDTH - PAD.left - PAD.right) / 2 : (index / (points.length - 1)) * (WIDTH - PAD.left - PAD.right));
  const y = (value: number) => PAD.top + (1 - value / top) * (HEIGHT - PAD.top - PAD.bottom);
  const path = (pick: (point: ChartPoint) => number) => points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(pick(point)).toFixed(1)}`).join(" ");
  const near = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const at = ((clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    for (let index = 1; index < points.length; index += 1) if (Math.abs(x(index) - at) < Math.abs(x(best) - at)) best = index;
    return best;
  };
  const last = points[points.length - 1]!;
  const point = hover === null ? null : points[hover];
  return (
    <div className="pricehist spendchart">
      <div className="phbar">
        <span className="legend"><span className="key spent" /> Spent</span>
        <span className="legend"><span className="key value" /> Value of what it bought</span>
        <span className="sub grow">{currency.toUpperCase()}</span>
        <button type="button" className="btn small" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <table className="phtable dtable grid">
          <thead><tr><th>Date</th><th>Spent</th><th>Value</th></tr></thead>
          <tbody>{[...points].reverse().map((item) => <tr key={item.date}><td>{item.date}</td><td>{money(item.spent, currency)}</td><td>{money(item.value, currency)}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="phchart">
          <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Spent and value from ${points[0]!.date} to ${last.date}`}
            onMouseMove={(event) => setHover(near(event.clientX))} onMouseLeave={() => setHover(null)} onTouchMove={(event) => setHover(near(event.touches[0]!.clientX))}>
            {[0, top / 2, top].map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="phgrid" />
                <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="phaxis">{money(tick, currency)}</text>
              </g>
            ))}
            <text x={PAD.left} y={HEIGHT - 6} className="phaxis">{points[0]!.date}</text>
            <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="phaxis">{last.date}</text>
            <path d={path((item) => item.spent)} className="chline spent" />
            <path d={path((item) => item.value)} className="chline value" />
            <text x={x(points.length - 1) + 6} y={y(last.spent) + 4} className="chlabel">Spent</text>
            <text x={x(points.length - 1) + 6} y={y(last.value) + (Math.abs(y(last.value) - y(last.spent)) < 12 ? 16 : 4)} className="chlabel">Value</text>
            {point && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="phcross" />
                <circle cx={x(hover)} cy={y(point.spent)} r={4} className="chdot spent" />
                <circle cx={x(hover)} cy={y(point.value)} r={4} className="chdot value" />
              </g>
            )}
          </svg>
          {point && <div className="phtip" role="status">{point.date}: spent <b>{money(point.spent, currency)}</b>, value <b>{money(point.value, currency)}</b></div>}
        </div>
      )}
      {data.unpriced > 0 && <p className="note">{data.unpriced.toLocaleString()} {data.unpriced === 1 ? "card has" : "cards have"} no price and count as 0.</p>}
    </div>
  );
}

function Tiles({ list, currency }: { list: PurchaseList; currency: Currency }) {
  const tile = (label: string, value: string, sub: string, className = "") => (
    <div className="stattile small"><div className="stlabel">{label}</div><div className={`stvalue ${className}`}>{value}</div><div className="stsub">{sub}</div></div>
  );
  const summary = list.summary;
  return (
    <div className="tiles purchasetiles">
      {tile("Spent", money(summary.spent, currency), "With tax, shipping and trade cash")}
      {tile("Received", money(summary.received, currency), "After fees and shipping")}
      {tile("Value now", money(summary.value, currency), summary.unpriced ? `${summary.unpriced} cards have no price` : "Cards held and sealed product")}
      {tile("Gain or loss", signed(summary.gain, currency), "Received + Value now - Spent", gainClass(summary.gain))}
    </div>
  );
}

function History({ list, currency, onOpen, onChanged }: { list: PurchaseList; currency: Currency; onOpen: (id: string) => void; onChanged: () => void }) {
  const store = useApp();
  // kept while the tab is closed (0.21.0)
  const [term, setTerm] = useKept("purchases:term", "");
  const [kind, setKind] = useKept("purchases:kind", "");
  const [product, setProduct] = useKept("purchases:product", "");
  const [setCode, setSetCode] = useKept("purchases:set", "");
  const [from, setFrom] = useKept("purchases:from", "");
  const [to, setTo] = useKept("purchases:to", "");
  const [sort, setSort] = useKept("purchases:sort", "new");
  const products = useProductOptions(list);
  const shown = useMemo(() => {
    const words = term.trim().toLowerCase();
    const rows = list.entries.filter((entry) => (!kind || entry.kind === kind) && (!product || entry.products.includes(product))
      && (!setCode || entry.sets.includes(setCode.toLowerCase())) && (!from || entry.date >= from) && (!to || entry.date <= to)
      && (!words || `${entry.description} ${entry.place} ${entry.note} ${entry.kindLabel}`.toLowerCase().includes(words)));
    const order: Record<string, (a: EntrySummary, b: EntrySummary) => number> = {
      new: (a, b) => b.date.localeCompare(a.date), old: (a, b) => a.date.localeCompare(b.date), gain: (a, b) => b.gain - a.gain, loss: (a, b) => a.gain - b.gain, out: (a, b) => b.out - a.out,
    };
    return [...rows].sort(order[sort]);
  }, [list, term, kind, product, setCode, from, to, sort]);
  const menu = (entry: EntrySummary) => rowMenu(store, `${entry.kindLabel} of ${entry.date}`, () => [{ label: "Open", run: () => onOpen(entry.id) }]);
  const picks = usePicks(shown.map((entry) => entry.id));
  // Delete picked... (0.19.0): one question and one undo step for every picked entry
  const deletePicked = async () => {
    const entries = shown.filter((entry) => picks.picked.has(entry.id));
    if (!entries.length) return;
    const sales = entries.some((entry) => entry.kind === "card_sale") ? " The sold copies of card sales go back to their collections." : "";
    const names = entries.slice(0, 6).map((entry) => `${entry.kindLabel.toLowerCase()} of ${entry.date}`).join(", ") + (entries.length > 6 ? `, and ${entries.length - 6} more` : "");
    if (!(await confirmDialog("Delete entries", `Delete ${entries.length} ${entries.length === 1 ? "entry" : "entries"} (${names})?${sales}`, "Delete"))) return;
    try {
      const snapshots: unknown[] = [];
      for (const entry of entries) snapshots.push((await request<{ snapshot: unknown }>(`/api/purchases/${entry.id}`, { method: "DELETE" })).snapshot);
      store.pushUndo({
        label: `Delete ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`,
        undo: async () => {
          for (const snapshot of snapshots) await request("/api/purchases/restore", { method: "POST", body: JSON.stringify({ snapshot }) });
          onChanged();
          await store.refreshAfterChange();
        },
        redo: async () => {
          for (const entry of entries) await request(`/api/purchases/${entry.id}`, { method: "DELETE" }).catch(() => undefined);
          onChanged();
          await store.refreshAfterChange();
        },
      });
      picks.clear();
      onChanged();
      await store.refreshAfterChange();
      store.flash(`${entries.length} ${entries.length === 1 ? "entry" : "entries"} deleted`);
    } catch (reason) {
      onChanged();
      store.fail(reason, "Could not delete the entries.");
    }
  };
  return (
    <div className="purchasehistory">
      <div className="btnrow phfilters">
        <input aria-label="Find entries" placeholder="Find by product, place or note" value={term} onChange={(event) => setTerm(event.target.value)} />
        <Picker label="Kind" value={kind} options={choices([["", "Every kind"], ...Object.entries(KIND_LABELS)])} onChange={setKind} />
        <Picker label="Product" value={product} options={[{ value: "", label: "Every product" }, ...products]} onChange={setProduct} />
        <input aria-label="Set code" className="setcode" placeholder="Set" value={setCode} maxLength={8} onChange={(event) => setSetCode(event.target.value)} />
        <input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <Picker label="Sort" value={sort} options={choices(SORTS)} onChange={setSort} />
      </div>
      <PickBar picks={picks}><button type="button" className="btn small" onClick={() => void deletePicked()}>Delete picked...</button></PickBar>
      <div className="gridwrapper"><table className="dtable ptable grid">
        <thead><tr><th className="pickcell">{picks.allBox("Pick every entry shown")}</th><th>Date</th><th>Kind</th><th>Description</th><th>Place</th><th className="numcell">Money out</th><th className="numcell">Money in</th><th className="numcell">Value now</th><th className="numcell">Gain or loss</th></tr></thead>
        <tbody>
          {!shown.length && <tr><td colSpan={9} className="sub">{list.entries.length ? "No entries match" : "No entries yet. Use New entry to record a purchase, a sale or a trade."}</td></tr>}
          {shown.map((entry) => (
            <tr key={entry.id} className={picks.picked.has(entry.id) ? "prow-entry picked" : "prow-entry"} tabIndex={0}
              onClick={(event) => { if (!picks.clickPicks(entry.id, event)) onOpen(entry.id); }} onKeyDown={(event) => { if (event.key === "Enter") onOpen(entry.id); }} {...menu(entry)}>
              <td className="pickcell">{picks.box(entry.id, `${entry.kindLabel} of ${entry.date}`)}</td>
              <td>{entry.date}</td>
              <td><span className={`badge kind-${entry.kind}`}>{entry.kindLabel}</span></td>
              <td>{entry.sets.slice(0, 3).map((code) => <SetIcon key={code} code={code} />)}{entry.description}{entry.note ? <span className="sub"> ({entry.note})</span> : null}</td>
              <td>{entry.place}</td>
              <td className="numcell">{entry.out ? money(entry.out, entry.currency) : ""}</td>
              <td className="numcell">{entry.in ? money(entry.in, entry.currency) : ""}</td>
              <td className="numcell">{entry.value ? money(entry.value, entry.currency) : ""}</td>
              <td className={`numcell ${gainClass(entry.gain)}`}>{signed(entry.gain, entry.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

    </div>
  );
}

function EntryPage({ id, list, onClose, onChanged, onMissing }: { id: string; list: PurchaseList; onClose: () => void; onChanged: () => void; onMissing?: () => void }) {
  const store = useApp();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setEntry(await request<Entry>(`/api/purchases/${id}`));
    } catch (reason) {
      // an entry deleted while the tab was closed (from another device, for example) opens History in its place (0.21.0)
      if (reason instanceof Error && /not in your purchase history/i.test(reason.message) && onMissing) {
        onMissing();
        return;
      }
      setError(reason instanceof Error ? reason.message : "Could not load the entry.");
    }
  }, [id, onMissing]);
  useEffect(() => { void load(); }, [load]);
  const tiePicks = usePicks((entry?.ties ?? []).map((tie) => String(tie.id)));
  // a change made on another device (0.18.0) loads the entry again
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener(PURCHASES_CHANGED, reload);
    return () => window.removeEventListener(PURCHASES_CHANGED, reload);
  }, [load]);
  if (error) return <p className="note err">{error}</p>;
  if (!entry) return <p className="note">Loading the entry</p>;
  const currency = entry.currency;
  const changed = () => { void load(); onChanged(); };
  const remove = async () => {
    const sold = entry.kind === "card_sale" ? " The sold copies go back to their collections." : "";
    if (!(await confirmDialog("Delete entry", `Delete the ${entry.kindLabel.toLowerCase()} of ${entry.date}?${sold}`, "Delete"))) return;
    try {
      const { snapshot } = await request<{ snapshot: unknown }>(`/api/purchases/${entry.id}`, { method: "DELETE" });
      store.pushUndo({
        label: `Delete ${entry.kindLabel.toLowerCase()} of ${entry.date}`,
        undo: async () => { await request("/api/purchases/restore", { method: "POST", body: JSON.stringify({ snapshot }) }); onChanged(); await store.refreshAfterChange(); },
        redo: async () => { await request(`/api/purchases/${entry.id}`, { method: "DELETE" }); onChanged(); await store.refreshAfterChange(); },
      });
      onClose();
      onChanged();
      await reloadOpening();
      if (entry.kind === "card_sale") await store.refreshAfterChange();
      store.flash(`${entry.kindLabel} of ${entry.date} deleted`);
    } catch (reason) {
      store.fail(reason, "Could not delete the entry.");
    }
  };
  const setOpening = async (openingId: string, active: boolean) => {
    try {
      await request(`/api/purchases/openings/${openingId}/active`, { method: "POST", body: JSON.stringify({ active }) });
      await reloadOpening();
      const opening = entry.openings.find((item) => item.id === openingId);
      if (active && opening?.collectionId) store.setTargetCollection(opening.collectionId);
      changed();
      store.flash(active ? `Opening ${opening?.name ?? ""} again` : "Done opening");
    } catch (reason) {
      store.fail(reason, "Could not change the opening.");
    }
  };
  /**
   * Remove from pack (0.18.0): the only way a card leaves the pack or purchase it came from. The person chooses to keep the
   * card in the collection or to delete it too. Both can be undone.
   */
  /**
   * Remove from pack (0.18.0), for one card or every picked card (0.19.0): the only way cards leave the pack or purchase
   * they came from. One question for all of them: keep the cards in their collections or delete them too. One undo step.
   */
  const removeFromPack = async (rows: EntryTie[]) => {
    if (!rows.length) return;
    const where = entry.kind === "purchase" && rows.some((row) => row.openingId) ? "pack" : "entry";
    const one = rows.length === 1 ? rows[0]! : null;
    const held = rows.reduce((sum, row) => sum + row.held, 0);
    const what = one ? (one.quantity > 1 ? `${one.quantity} copies of ${one.name}` : one.name) : `${rows.length} cards`;
    const answer = await choiceDialog(one ? `Remove ${one.name} from this ${where}` : `Remove ${rows.length} cards from this ${where}`, (
      <>Remove {what} from this {where}?{held ? ` ${held === 1 ? "1 copy is" : `${held} copies are`} still in the collection.` : ""}</>
    ), [["keep", one ? "Remove from pack, keep the card" : "Remove from pack, keep the cards", true], ...(held ? [["delete", one ? "Remove from pack and delete the card" : "Remove from pack and delete the cards"] as ["delete", string]] : [])]);
    if (!answer) return;
    const deleting = answer === "delete" && held > 0;
    type Removed = { tie: Record<string, unknown> & { collectionId: string }; held: number; have: number; row: EntryTie };
    const removed: Removed[] = [];
    // copies of one kind in one collection are lowered together
    const groups = new Map<string, { collectionId: string; key: Record<string, unknown>; have: number; lower: number }>();
    try {
      for (const row of rows) {
        const answerRow = await request<Omit<Removed, "row">>(`/api/purchases/ties/${row.id}`, { method: "DELETE" });
        removed.push({ ...answerRow, row });
        const key = { cardId: row.cardId, foil: row.foil, condition: row.condition, language: row.language, proxy: row.proxy };
        const id = `${answerRow.tie.collectionId}|${JSON.stringify(key)}`;
        const group = groups.get(id) ?? { collectionId: answerRow.tie.collectionId, key, have: answerRow.have, lower: 0 };
        group.lower += answerRow.held;
        groups.set(id, group);
      }
      const counts = async (which: "before" | "after") => {
        for (const group of groups.values()) {
          if (!group.lower) continue;
          await request(`/api/collections/${encodeURIComponent(group.collectionId)}/cards`, {
            method: "PUT", body: JSON.stringify({ items: [{ ...group.key, quantity: which === "before" ? group.have : Math.max(0, group.have - group.lower) }] }),
          });
        }
      };
      if (deleting) await counts("after");
      const label = one ? one.name : `${rows.length} cards`;
      store.pushUndo({
        label: deleting ? `Remove ${label} from the ${where} and delete` : `Remove ${label} from the ${where}`,
        undo: async () => {
          if (deleting) await counts("before");
          for (const item of removed) await request("/api/purchases/ties/restore", { method: "POST", body: JSON.stringify({ tie: item.tie }) });
          changed();
          await store.refreshAfterChange();
        },
        redo: async () => { store.flash(`Remove ${label} again from the ${where} page`, "err"); },
      });
      tiePicks.clear();
      changed();
      await store.refreshAfterChange();
      store.flash(deleting ? `${label} removed from the ${where} and deleted` : `${label} removed from the ${where}`);
    } catch (reason) {
      changed();
      store.fail(reason, "Could not remove the card.");
    }
  };
  /** Move to pack... (0.19.0): cards scanned into the wrong pack move to another pack of the same product, as one undo step. */
  const moveToPack = async (rows: EntryTie[]) => {
    const lineIds = [...new Set(rows.map((row) => row.lineId))];
    if (lineIds.length !== 1 || !lineIds[0]) return store.flash("Pick cards from the packs of one product", "err");
    const packs = entry.openings.filter((opening) => opening.lineId === lineIds[0] && rows.some((row) => row.openingId !== opening.id));
    if (!packs.length) return store.flash("This product has no other pack", "err");
    const target = await choiceDialog(rows.length === 1 ? `Move ${rows[0]!.name} to pack` : `Move ${rows.length} cards to pack`, "Which pack did the cards come from?",
      packs.map((opening) => [opening.id, opening.name] as [string, string]));
    if (!target) return;
    try {
      const { moved } = await request<{ moved: Array<{ id: number; from: string | null }> }>("/api/purchases/ties/move", { method: "POST", body: JSON.stringify({ ties: rows.map((row) => row.id), openingId: target }) });
      const back = async () => {
        for (const from of new Set(moved.map((item) => item.from))) {
          if (from) await request("/api/purchases/ties/move", { method: "POST", body: JSON.stringify({ ties: moved.filter((item) => item.from === from).map((item) => item.id), openingId: from }) });
        }
      };
      const name = rows.length === 1 ? rows[0]!.name : `${rows.length} cards`;
      store.pushUndo({
        label: `Move ${name} to another pack`,
        undo: async () => { await back(); changed(); },
        redo: async () => { await request("/api/purchases/ties/move", { method: "POST", body: JSON.stringify({ ties: rows.map((row) => row.id), openingId: target }) }); changed(); },
      });
      tiePicks.clear();
      changed();
      store.flash(`${name} moved to ${packs.find((opening) => opening.id === target)?.name ?? "the pack"}`);
    } catch (reason) {
      store.fail(reason, "Could not move the cards.");
    }
  };
  const addReceipt = async () => {
    const file = await pickReceipt();
    if (!file) return;
    try {
      await keepReceipt(store, entry.id, file, changed);
      changed();
      store.flash(`Receipt kept with the ${entry.kindLabel.toLowerCase()} of ${entry.date}`);
    } catch (reason) {
      store.fail(reason, "Could not keep the receipt.");
    }
  };
  const goAdd = (opening: Entry["openings"][number], scan: boolean) => {
    if (opening.collectionId) store.setTargetCollection(opening.collectionId);
    store.setPrefs({ addTo: "collection" });
    if (scan) store.setScannerOpen(true);
    else store.setView("cards");
    store.flash(`Adding to ${opening.name}`);
  };
  const figure = (label: string, value: string, className = "") => <div className="pfig"><span className="sub">{label}</span><b className={className}>{value}</b></div>;
  return (
    <div className="purchaseentry">
      <div className="btnrow pehead">
        <button type="button" className="btn small" onClick={onClose}>Back to history</button>
        <span className={`badge kind-${entry.kind}`}>{entry.kindLabel}</span>
        <b>{entry.date}</b>{entry.place && <span>{entry.place}</span>}{entry.note && !(entry.kind === "trade" && /^Trade \d{1,2}\/\d{1,2}\/\d{2,4}$/.test(entry.note)) && <span className="sub">{entry.note}</span>}
        <span className="grow" />
        <button type="button" className="btn small" onClick={() => entryDialog(store, list, entry.kind, entry, changed)}>Edit...</button>
        <button type="button" className="btn small" onClick={() => void remove()}>Delete...</button>
      </div>
      {entry.trade && (
        <div className="pfigs">
          {figure("Gave", money(entry.trade.gave, currency))}
          {figure("Got", money(entry.trade.got, currency))}
          {figure("Net", signed(entry.trade.net, currency), gainClass(entry.trade.net))}
          {figure("Original cost of cards given", money(entry.trade.originalCost, currency))}
          {figure("Value now", money(entry.value, currency))}
          {figure("Gain or loss", signed(entry.gain, currency), gainClass(entry.gain))}
        </div>
      )}
      {entry.trade && entry.trade.noCost.length > 0 && (
        <p className="note">{entry.trade.noCost.length} {entry.trade.noCost.length === 1 ? "card given has" : "cards given have"} no recorded cost and {entry.trade.noCost.length === 1 ? "counts" : "count"} at {entry.trade.noCost.length === 1 ? "its" : "their"} trade value ({money(entry.trade.noCostValue, currency)}): {entry.trade.noCost.join(", ")}.</p>
      )}
      {!entry.trade && <div className="pfigs">
        {entry.kind === "purchase" && figure("Cost", money(entry.out, currency))}
        {entry.kind === "purchase" && entry.tax + entry.shipping > 0 && figure("Tax and shipping", money(entry.tax + entry.shipping, currency))}
        {entry.kind !== "purchase" && figure("Money in", money(entry.in, currency))}
        {entry.kind === "trade" && figure("Money out", money(entry.out, currency))}
        {figure("Value now", money(entry.value, currency))}
        {entry.kind === "purchase" && figure("Sold for", money(entry.pulledIncome, currency))}
        {figure("Gain or loss", signed(entry.gain, currency), gainClass(entry.gain))}
      </div>}
      {entry.kind !== "trade" && entry.kind !== "purchase" && entry.shipping > 0 && (
        <p className="note">{entry.shippingBy === "buyer" ? `Shipping of ${money(entry.shipping, currency)} was paid by the buyer and is not counted.` : `Shipping of ${money(entry.shipping, currency)} was paid by you and lowers the money in.`}</p>
      )}
      <section className="receiptbox">
        <h4>Receipt</h4>
        {entry.receipt ? (
          <div className="btnrow">
            <span>{entry.receipt.name} <span className="sub">{Math.max(1, Math.round(entry.receipt.bytes / 1024))} KB</span></span>
            <button type="button" className="btn small" onClick={() => void viewReceipt(store, entry.id, entry.receipt!.name)}>View receipt</button>
            <button type="button" className="btn small" onClick={() => void addReceipt()}>Replace...</button>
            <button type="button" className="btn small" onClick={() => void removeReceipt(store, entry.id, changed).then(changed).catch((reason: unknown) => store.fail(reason, "Could not remove the receipt."))}>Remove</button>
          </div>
        ) : (
          <div className="btnrow"><span className="sub">No receipt kept</span><button type="button" className="btn small" onClick={() => void addReceipt()}>Add receipt...</button></div>
        )}
      </section>
      {entry.lines.length > 0 && (
        <section>
          <h4>Products</h4>
          <div className="gridwrapper"><table className="dtable grid">
            <thead><tr><th>Product</th><th>Set</th><th className="numcell">Quantity</th><th className="numcell">Full cost</th><th>State</th><th className="numcell">Value each</th>
              {entry.lines.some((line) => line.ev !== null && line.ev !== undefined) && <th className="numcell" title="Each pack's chance of each card times its price, added up">Expected value</th>}<th /></tr></thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.product === "single" ? line.name : line.productLabel}{line.product !== "single" && line.product !== "other" && line.name ? <b className="pname"> {line.name}</b> : null}{line.packs > 1 ? <span className="sub"> ({line.packs} packs each)</span> : null}</td>
                  <td>{line.setCode && <><SetIcon code={line.setCode} />{line.setCode.toUpperCase()}</>}</td>
                  <td className="numcell">{line.quantity}</td>
                  <td className="numcell">{money(line.full, currency)}</td>
                  <td>{line.product === "single" ? stateOf(entry.ties.filter((tie) => tie.lineId === line.id))
                    : line.packs > 0 && line.packsOpened > 0
                      ? [`${line.packsOpened} of ${line.quantity * line.packs} packs opened`, line.packsLeft ? `${line.packsLeft} left` : "", line.sold ? `${line.sold} sold` : ""].filter(Boolean).join(", ")
                      : [line.sealed ? `${line.sealed} sealed` : "", line.opened ? `${line.opened} opened` : "", line.sold ? `${line.sold} sold` : ""].filter(Boolean).join(", ")}</td>
                  <td className="numcell">{line.product === "single" ? valueThenOf(entry.ties.filter((tie) => tie.lineId === line.id), currency) : <>{money(line.sealedValue, currency)}{line.valueDate ? <span className="sub"> ({line.valueDate})</span> : <span className="sub"> (cost)</span>}</>}</td>
                  {entry.lines.some((item) => item.ev !== null && item.ev !== undefined) && <td className="numcell">{line.ev !== null && line.ev !== undefined
                    ? <>{line.evLine !== null && line.evLine !== undefined ? money(line.evLine, currency) : ""}<span className="sub"> ({money(line.ev, currency)} per {line.evLabel?.toLowerCase() ?? "pack"})</span></> : ""}</td>}
                  <td>{line.product !== "single" && (line.packs > 0 ? line.packsLeft > 0 : line.sealed > 0) && <span className="btnrow">
                    <button type="button" className="btn small" onClick={() => openDialog(store, entry, line, changed)}>{line.packs > 0 && line.packsOpened > 0 ? "Open more packs..." : "Open..."}</button>
                    <button type="button" className="btn small" onClick={() => valueDialog(store, entry, line, changed)}>Set current value...</button>
                  </span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
      {entry.openings.length > 0 && (
        <section>
          <h4>Openings</h4>
          {entry.lines.filter((line) => entry.openings.some((opening) => opening.lineId === line.id)).map((line) => {
            const packs = entry.openings.filter((opening) => opening.lineId === line.id);
            const sum = (pick: (opening: EntryOpening) => number) => packs.reduce((total, opening) => total + pick(opening), 0);
            const opened = sum((opening) => opening.packs);
            return (
              <div key={line.id} className="openingline">
                {/* the line's figures added up over its opened packs (0.19.0) */}
                <div className="openlinehead">
                  <b>{line.productLabel}{line.product !== "other" && line.name ? ` ${line.name}` : ""}{line.setCode ? `, ${line.setCode.toUpperCase()}` : ""}</b>
                  <span className="sub">{sum((opening) => opening.cards)} cards from {opened} {line.packs > 0 ? (opened === 1 ? "pack" : "packs") : "opened"}, {money(opened ? sum((opening) => opening.valuePulled) / opened : 0, currency)} per pack</span>
                  <span className="openfigs">
                    <span>Cost <b>{money(sum((opening) => opening.packCost), currency)}</b></span>
                    {packs.some((opening) => opening.ev !== null && opening.ev !== undefined) && <span title="Each pack's chance of each card times its price on the day it was opened">Expected value <b>{money(sum((opening) => opening.ev ?? 0), currency)}</b></span>}
                    <span>Value when pulled <b>{money(sum((opening) => opening.valueWhenPulled), currency)}</b></span>
                    <span>Pulled value <b>{money(sum((opening) => opening.valuePulled), currency)}</b></span>
                    <span>Value now <b>{money(sum((opening) => opening.valueNow), currency)}</b></span>
                    <span>Gain or loss <b className={gainClass(sum((opening) => opening.gain))}>{signed(sum((opening) => opening.gain), currency)}</b></span>
                  </span>
                </div>
                {packs.map((opening) => (
                  <div key={opening.id} className={`wsrow packrow${opening.active ? " active" : ""}${opening.waiting ? " waiting" : ""}`}
                    {...rowMenu(store, opening.name, () => [
                      { label: "Change collection...", run: () => changeCollectionDialog(store, { id: opening.id, entryId: entry.id, name: opening.name }, changed) },
                      !opening.waiting && { label: "Add existing copies...", run: () => tieCopiesDialog(store, opening.id, changed, opening.collectionId) },
                      !opening.waiting && line.product === "commander_deck" && line.packs === 0 && { label: "Add decklist...", run: () => preconOpeningDialog(store, opening, changed) },
                    ])}>
                    <span className="openinghead"><b>{opening.name}</b>
                      <span className="sub packcoll">Goes to {opening.collectionId ? store.collectionName(opening.collectionId) : "no collection"}</span>
                      <span className="sub">{opening.waiting ? "Waiting" : `${opening.cards} cards${opening.gone ? `, ${opening.gone} gone` : ""}`}{opening.packNumber === null ? `, ${money(opening.perPack, currency)} per pack` : ""}</span>
                      {!opening.waiting && (
                        <span className="openfigs">
                          <span title={line.packs > 0 ? "The product's full cost divided by its packs" : "The product's full cost for what was opened"}>{line.packs > 0 ? "Pack cost" : "Cost"} <b>{money(opening.packCost, currency)}</b></span>
                          {opening.ev !== null && opening.ev !== undefined && <span title="Each pack's chance of each card times its price on the day it was opened. This figure does not change.">Expected value <b>{money(opening.ev, currency)}</b></span>}
                          <span title="Every pull at its price on the day it was added. This figure does not change.">Value when pulled <b>{money(opening.valueWhenPulled, currency)}</b></span>
                          <span title="Every pull at today's price, owned or not">Pulled value <b>{money(opening.valuePulled, currency)}</b></span>
                          <span title="The pulls you still have, at today's price">Value now <b>{money(opening.valueNow, currency)}</b></span>
                          <span title="Value now + what its cards sold for - cost">Gain or loss <b className={gainClass(opening.gain)}>{signed(opening.gain, currency)}</b></span>
                        </span>
                      )}
                    </span>
                    {opening.active ? (
                      <span className="btnrow">
                        <span className="badge opening">Adding here</span>
                        <button type="button" className="btn small" onClick={() => goAdd(opening, false)}>Add cards</button>
                        <button type="button" className="btn small" onClick={() => goAdd(opening, true)}>Scan</button>
                        <button type="button" className="btn small" onClick={() => tieCopiesDialog(store, opening.id, changed, opening.collectionId)}>Add existing copies...</button>
                        {line.product === "commander_deck" && line.packs === 0 && <button type="button" className="btn small" onClick={() => preconOpeningDialog(store, opening, changed)}>Add decklist...</button>}
                        <button type="button" className="btn small" onClick={() => changeCollectionDialog(store, { id: opening.id, entryId: entry.id, name: opening.name }, changed)}>Change collection...</button>
                        {packs.some((other) => other.groupId && other.groupId === opening.groupId && other.waiting) && (
                          <button type="button" className="btn small primary" onClick={() => void goNextPack(store).then(changed)}>Next pack</button>
                        )}
                        <button type="button" className={`btn small${packs.some((other) => other.groupId && other.groupId === opening.groupId && other.waiting) ? "" : " primary"}`} onClick={() => void setOpening(opening.id, false)}>Done opening</button>
                      </span>
                    ) : (
                      <span className="btnrow">
                        {!opening.waiting && <button type="button" className="btn small" onClick={() => tieCopiesDialog(store, opening.id, changed, opening.collectionId)}>Add existing copies...</button>}
                        {!opening.waiting && line.product === "commander_deck" && line.packs === 0 && <button type="button" className="btn small" onClick={() => preconOpeningDialog(store, opening, changed)}>Add decklist...</button>}
                        <button type="button" className="btn small" onClick={() => changeCollectionDialog(store, { id: opening.id, entryId: entry.id, name: opening.name }, changed)}>Change collection...</button>
                        <button type="button" className="btn small" onClick={() => void setOpening(opening.id, true)}>{opening.waiting ? "Start this pack" : "Continue opening"}</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}
      {entry.ties.length > 0 && (
        <section>
          <h4>{entry.kind === "trade" ? "Cards got" : "Cards from this purchase"}</h4>
          <PickBar picks={tiePicks}>
            <button type="button" className="btn small" onClick={() => void removeFromPack(entry.ties.filter((tie) => tiePicks.picked.has(String(tie.id))))}>
              {entry.ties.some((tie) => tie.openingId) ? "Remove picked from pack..." : "Remove picked from purchase..."}
            </button>
            {entry.openings.length > 1 && <button type="button" className="btn small" onClick={() => void moveToPack(entry.ties.filter((tie) => tiePicks.picked.has(String(tie.id))))}>Move to pack...</button>}
          </PickBar>
          <div className="gridwrapper"><table className="dtable grid">
            <thead><tr><th className="pickcell">{tiePicks.allBox("Pick every card")}</th><th>Card</th>{entry.openings.length > 0 && <th>Pack</th>}<th>Finish</th><th>Set</th><th className="numcell">Count</th><th className="numcell">Still held</th>
              <th className="numcell">{entry.kind === "purchase" ? (entry.ties.some((tie) => tie.openingId) ? "Value when pulled" : "Value when added") : "Value when added"}</th>
              {entry.kind === "trade" && <th className="numcell">Trade price</th>}<th className="numcell">Price now</th><th>State</th><th /></tr></thead>
            <tbody>
              {entry.ties.map((tie) => (
                <tr key={tie.id} className={`${tie.held === 0 ? "gonerow" : ""}${tiePicks.picked.has(String(tie.id)) ? " picked" : ""}`}
                  onClick={(event) => { tiePicks.clickPicks(String(tie.id), event); }}>
                  <td className="pickcell">{tiePicks.box(String(tie.id), tie.name)}</td>
                  <td><button type="button" className="lnk" onClick={() => store.setCardPage(tie.cardId)}>{tie.name}</button>{tie.warning && <span className="badge pullwarn" title={tie.warning}>{tie.warning}</span>}</td>
                  {entry.openings.length > 0 && <td>{packName(entry.openings.find((opening) => opening.id === tie.openingId))}</td>}
                  <td>{tie.foil ? <span className="badge foil">{tie.foil === 1 ? "FOIL" : "ETCHED"}</span> : <span className="sub">Regular</span>}</td>
                  <td className="nowrap"><SetIcon code={tie.setCode} />{tie.setCode.toUpperCase()} #{tie.collectorNumber}</td>
                  <td className="numcell">{tie.quantity}</td>
                  <td className="numcell">{tie.held}</td>
                  <td className="numcell">{tie.valueThen === null ? "" : money(tie.valueThen, currency)}</td>
                  {entry.kind === "trade" && <td className="numcell">{money(tie.tradePrice, currency)}</td>}
                  <td className="numcell">{money(tie.price, currency)}</td>
                  <td>{stateOf([tie])}</td>
                  <td>{(tie.openingId || entry.kind === "purchase") && <button type="button" className="btn small" onClick={(event) => { event.stopPropagation(); void removeFromPack([tie]); }}>{tie.openingId ? "Remove from pack..." : "Remove from purchase..."}</button>}{tie.openingId && entry.openings.filter((opening) => opening.lineId === tie.lineId).length > 1 && <button type="button" className="btn small" onClick={(event) => { event.stopPropagation(); void moveToPack([tie]); }}>Move to pack...</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
      {entry.sales.length > 0 && (
        <section>
          <h4>{entry.kind === "trade" ? "Cards given" : "Sold"}</h4>
          <div className="gridwrapper"><table className="dtable grid">
            <thead><tr><th>{entry.kind === "product_sale" ? "Product" : "Card"}</th><th className="numcell">Count</th><th className="numcell">{entry.kind === "trade" ? "Trade value" : "Price"}</th>
              {entry.trade && <th className="numcell">Original cost</th>}<th>From</th></tr></thead>
            <tbody>
              {entry.sales.map((sale) => {
                const given = entry.trade?.given.find((row) => row.saleId === sale.id);
                const from = given?.from;
                return (
                  <tr key={sale.id}>
                    <td>{sale.name}{sale.setCode ? <span className="sub"> {sale.setCode.toUpperCase()}</span> : null}{sale.foil ? <span className="badge foil">{sale.foil === 1 ? "FOIL" : "ETCHED"}</span> : null}</td>
                    <td className="numcell">{sale.quantity}</td>
                    <td className="numcell">{money(sale.price, currency)}</td>
                    {entry.trade && <td className="numcell">{given?.cost === null || given?.cost === undefined ? <span className="sub">Not recorded</span> : money(given.cost, currency)}</td>}
                    <td>{from ? <button type="button" className="lnk" onClick={() => window.dispatchEvent(new CustomEvent("mana-vault:purchases", { detail: from.entryId }))}>Purchase of {from.date}: {from.description}</button>
                      : sale.sourceEntryId ? <button type="button" className="lnk" onClick={() => window.dispatchEvent(new CustomEvent("mana-vault:purchases", { detail: sale.sourceEntryId }))}>Its purchase</button>
                      : <span className="sub">No purchase recorded</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}

/** Where the cards of a line or tie are now (0.18.0): In collection, Sold, Traded, Gone, or a mix such as "1 in collection, 1 gone". */
function stateOf(ties: EntryTie[]): string {
  const total = (pick: (tie: EntryTie) => number) => ties.reduce((sum, tie) => sum + pick(tie), 0);
  const parts: Array<[number, string]> = [[total((tie) => tie.held), "in collection"], [total((tie) => tie.sold), "sold"], [total((tie) => tie.traded), "traded"], [total((tie) => tie.gone), "gone"]];
  const shown = parts.filter(([count]) => count > 0);
  if (!shown.length) return "";
  if (shown.length === 1) return shown[0]![1].charAt(0).toUpperCase() + shown[0]![1].slice(1);
  return shown.map(([count, label]) => `${count} ${label}`).join(", ");
}

/** The fixed value of a single card line: its card's price on the day it was added. */
function valueThenOf(ties: EntryTie[], currency: "usd") {
  const priced = ties.filter((tie) => tie.valueThen !== null);
  if (!priced.length) return "";
  const count = priced.reduce((sum, tie) => sum + tie.quantity, 0);
  return <>{money(priced.reduce((sum, tie) => sum + tie.valueThen! * tie.quantity, 0) / Math.max(1, count), currency)}<span className="sub"> (when added)</span></>;
}

/** Shows a kept receipt: pictures and PDFs open in a new tab (in the app, the share sheet). */
async function viewReceipt(store: Store, entryId: string, name: string) {
  try {
    const response = await fetchFile(`/api/purchases/${entryId}/receipt`);
    if (!response.ok) throw new Error("Could not load the receipt");
    const blob = await response.blob();
    if (isApp()) { downloadBlob(name, blob); return; }
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) downloadBlob(name, blob);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (reason) {
    store.fail(reason, "Could not show the receipt.");
  }
}

export function PurchasesView({ actions: _actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const currency: Currency = "usd";
  // the part shown, the period and the open entry are kept while the tab is closed (0.21.0)
  const [tab, setTab] = useKept<"summary" | "history">("purchases:tab", "summary");
  const [period, setPeriod] = useKept<Period>("purchases:period", "all");
  const [list, setList] = useState<PurchaseList | null>(null);
  const [open, setOpen] = useKept<string | null>("purchases:open", null);
  const [error, setError] = useState("");
  const opening = useActiveOpening();
  const load = useCallback(async () => {
    try {
      const from = fromOf(period);
      const result = await request<PurchaseList>(`/api/purchases${from ? `?from=${from}` : ""}`);
      setList(result);
      setActiveOpening(result.activeOpening);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the purchase history.");
    }
  }, [period]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const show = (event: Event) => { const id = (event as CustomEvent<string>).detail; void load(); if (id) setOpen(id); };
    const reload = () => void load();
    window.addEventListener("mana-vault:purchases", show);
    window.addEventListener(PURCHASES_CHANGED, reload);
    return () => {
      window.removeEventListener("mana-vault:purchases", show);
      window.removeEventListener(PURCHASES_CHANGED, reload);
    };
  }, [load]);
  // undo and redo change entries: the view reloads with them
  const undoCount = store.undoStack.length + store.redoStack.length;
  useEffect(() => { if (list) void load(); }, [undoCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = (entry: Entry) => { void load(); setOpen(entry.id); };
  const missingEntry = useCallback(() => { setOpen(null); setTab("history"); }, [setOpen, setTab]);
  // each part keeps its scroll position while the tab is closed (0.21.0)
  const wrap = useRef<HTMLDivElement>(null);
  useKeptScroll(`purchases:${open ?? tab}`, wrap, !!list);
  const kinds: Array<[EntryKind, string]> = [["purchase", "Purchase"], ["card_sale", "Card sale"], ["product_sale", "Product sale"], ["trade", "Trade"]];
  return (
    <div className="view" id="view-purchases">
      <div id="pagetabs" className="colhead">
        <span className="phname">Purchases</span>
        <div className="seg" role="tablist" aria-label="Purchases view">
          {([["summary", "Summary"], ["history", "History"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id && !open} className={tab === id && !open ? "on" : ""} onClick={() => { setTab(id); setOpen(null); }}>{label}</button>
          ))}
        </div>
        <button type="button" className="btn small primary" disabled={!list}
          onClick={() => void choiceDialog("New entry", "What do you want to record?", kinds).then((kind) => { if (list && kind) entryDialog(store, list, kind, null, saved); })}>New entry...</button>
        <button type="button" className="btn small" onClick={() => fromPricesDialog(store, () => void load())}>Make purchases from imported prices...</button>
        <button type="button" className="btn small" onClick={() => void pickReceipt().then((file) => { if (file) void purchaseFromReceipt(store, file, saved); })}>Read receipt...</button>
        <button type="button" className="btn small" onClick={() => barcodeDialog(store, saved)}>Scan barcode...</button>
        <button type="button" className="btn small" onClick={() => virtualPacksDialog(store)}>Open virtual packs...</button>
        <button type="button" className="btn small" onClick={() => placesDialog(store)}>Places...</button>
        <button type="button" className="btn small" onClick={() => void exportPurchases(store, "entries")}>Export...</button>
        {opening && <button type="button" className="badge opening openingchip" title="Cards added to its collection are tied to this opening. Click to open its purchase" onClick={() => setOpen(opening.entryId)}>Opening: {opening.name}{packLabel(opening) ? ` (${packLabel(opening)})` : ""}</button>}
        {opening?.hasNext && <button type="button" className="btn small" onClick={() => void goNextPack(store)}>Next pack</button>}
      </div>
      <div className="list purchasewrap" ref={wrap}>
        {error && <p className="note err">{error}</p>}
        {!list && !error && <p className="note">Loading the purchase history</p>}
        {list && open && <EntryPage key={open} id={open} list={list} onClose={() => setOpen(null)} onChanged={() => void load()} onMissing={missingEntry} />}
        {list && !open && tab === "summary" && (
          <>
            <div className="btnrow">
              <Picker label="Period" value={period} options={choices(PERIODS)} onChange={(value) => setPeriod(value as Period)} />
              <span className="sub">{list.entries.length} {list.entries.length === 1 ? "entry" : "entries"}</span>
            </div>
            <Tiles list={list} currency={currency} />
            <SpendChart key={`${currency}-${list.entries.length}`} currency={currency} />
          </>
        )}
        {list && !open && tab === "history" && <History list={list} currency={currency} onOpen={setOpen} onChanged={() => void load()} />}
      </div>
    </div>
  );
}

/** The short name of the pack a card came from: "Pack 3", or the opening's name for products without packs. */
function packName(opening: EntryOpening | undefined): string {
  if (!opening) return "";
  return opening.packNumber !== null ? `Pack ${opening.packNumber}` : opening.name.replace(/\s*\(Purchase of [^)]*\)$/, "");
}
