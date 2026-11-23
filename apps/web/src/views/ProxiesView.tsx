// ---------- proxies view: the print list, sheet settings with a page preview, and the exports; the card maker in its own tab ----------
import { EntryMenuButton, GroupedList, ListOptionRows, ManaCost } from "../components/GroupedList";
import { rowMenu } from "../components/ContextMenu";
import { groupList } from "../list-groups";
import { useEffect, useMemo, useState } from "react";
import type { Action } from "../actions";
import { downloadBlob, downloadText, pickFile, request } from "../api";
import { blobToData } from "../components/CustomSets";
import { CardMaker } from "../components/CardMaker";
import { SetMaker } from "../components/CustomSets";
import { choiceDialog, confirmDialog, customDialog, dialog } from "../components/Dialog";
import { choosePrinting } from "../components/PrintingDialog";
import { choices, type Choice, Picker } from "../components/Picker";
import { parseQuickAdd } from "../deck-rules";
import { Icon } from "../icons";
import { entryKey } from "../library-state";
import {
  buildMpcZip, buildPdf, DEFAULT_SHEET, forgetCardBack, facesOf, missingPictures, type Faces, layoutPages, mpcAutofillList, PRINT_SORTS, type PrintLine, printPrice, printSlots,
  type PrintSort, type SheetSettings, sortPrintLines,
} from "../proxy-print";
import type { CardForPrint } from "../proxy-state";
import { type Store, useApp } from "../store";
import type { Card, CollectionEntry, DeckDetail } from "../types";
import { Quantity, Thumb } from "./Views";
import { CountPip, PricePip } from "../components/CardMarks";
import { CardFrame } from "../components/CardFrame";
import { LayoutRows, OptionsButton } from "../components/Options";
import type { GridSize } from "../types";

const FACE_CHOICES: Choice[] = choices([["front", "Front"], ["back", "Back"], ["both", "Both faces"]]);
const PAPER_CHOICES: Choice[] = choices([["letter", "Letter (8.5 x 11 in)"], ["a4", "A4 (210 x 297 mm)"], ["legal", "Legal (8.5 x 14 in)"], ["custom", "Custom size"]]);
const MARK_CHOICES: Choice[] = choices([["lines", "Cut lines"], ["corners", "Corner marks"], ["none", "None"]]);
const BACK_CHOICES: Choice[] = choices([["none", "None"], ["standard", "Standard back"], ["mine", "Uploaded back"]]);
const SIZE_CHOICES: Choice[] = choices([["standard", "Standard (63 x 88 mm)"], ["custom", "Custom size"]]);

// ---------- adding cards ----------
export function addFromDeckDialog(store: Store, onlyMissing = false) {
  if (!store.decks.length) return store.flash("Create a deck first", "err");
  dialog(onlyMissing ? "Print missing cards" : "Print a deck", [
    ["deck", "Deck", store.deck?.id ?? store.decks[0]!.id, "select", store.decks.map((deck) => [deck.id, deck.name])],
    ["what", "Cards", onlyMissing ? "missing" : "all", "select", [["all", "Every card (not the maybeboard)"], ["missing", "Only missing cards"]]],
  ], async (values) => {
    try {
      const deck = await request<DeckDetail>(`/api/decks/${encodeURIComponent(String(values.deck))}`);
      const cards = deck.cards.filter((card) => card.zone !== "maybeboard")
        .map((card) => ({ card: { ...card, id: card.card_id } as CardForPrint, count: values.what === "missing" ? card.missing ?? 0 : card.quantity }))
        .filter((item) => item.count > 0);
      if (!cards.length) {
        store.flash(values.what === "missing" ? `${deck.name} has no missing cards` : `${deck.name} has no cards`, "err");
        return;
      }
      await store.addToPrintList(cards, values.what === "missing" ? `The missing cards of ${deck.name}` : deck.name);
    } catch (reason) {
      store.fail(reason, "Could not load the deck.");
      return false;
    }
  }, "Add");
}

/**
 * Send to print list... from a deck's right-click menu (0.17.0): the whole deck, only its missing cards, or chosen zones,
 * each card in its deck printing and count, as one undo step.
 */
function SendDeckToPrint({ store, deck, close }: { store: Store; deck: { id: string; name: string }; close: () => void }) {
  const [what, setWhat] = useState<"all" | "missing" | "zones">("all");
  const [zones, setZones] = useState<Set<string>>(new Set(["commander", "main"]));
  const [error, setError] = useState("");
  const send = async () => {
    setError("");
    try {
      const detail = await request<DeckDetail>(`/api/decks/${encodeURIComponent(deck.id)}`);
      const cards = detail.cards
        .filter((card) => (what === "zones" ? zones.has(card.zone) : card.zone !== "maybeboard"))
        .map((card) => ({ card: { ...card, id: card.card_id } as CardForPrint, count: what === "missing" ? card.missing ?? 0 : card.quantity }))
        .filter((item) => item.count > 0);
      if (!cards.length) { setError(what === "missing" ? `${deck.name} has no missing cards` : "No cards to send"); return; }
      close();
      await store.addToPrintList(cards, what === "missing" ? `The missing cards of ${deck.name}` : deck.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the deck.");
    }
  };
  const zoneLabels: Array<[string, string]> = [["commander", "Commander"], ["main", "Main deck"], ["sideboard", "Sideboard"], ["maybeboard", "Maybeboard"]];
  return (
    <div className="purchaseedit">
      {error && <p className="note err">{error}</p>}
      <div className="radios" role="radiogroup" aria-label="Cards to send">
        <label className="check"><input type="radio" name="sdp" checked={what === "all"} onChange={() => setWhat("all")} /> The whole deck (not the maybeboard)</label>
        <label className="check"><input type="radio" name="sdp" checked={what === "missing"} onChange={() => setWhat("missing")} /> Missing cards only</label>
        <label className="check"><input type="radio" name="sdp" checked={what === "zones"} onChange={() => setWhat("zones")} /> Chosen zones</label>
      </div>
      {what === "zones" && (
        <div className="btnrow">{zoneLabels.map(([zone, label]) => (
          <label key={zone} className="check"><input type="checkbox" checked={zones.has(zone)} onChange={(event) => {
            const next = new Set(zones);
            if (event.target.checked) next.add(zone); else next.delete(zone);
            setZones(next);
          }} /> {label}</label>
        ))}</div>
      )}
      <div className="btnrow end"><button type="button" className="btn primary" disabled={what === "zones" && !zones.size} onClick={() => void send()}>Send to print list</button></div>
    </div>
  );
}

export const sendDeckToPrintDialog = (store: Store, deck: { id: string; name: string }) =>
  customDialog(`Send ${deck.name} to the print list`, (close) => <SendDeckToPrint store={store} deck={deck} close={close} />, 480, "Cancel");

function addFromCollectionDialog(store: Store) {
  const list = store.collections ?? [];
  if (!list.length) return store.flash("Create a collection first", "err");
  dialog("Print a collection", [
    ["collection", "Collection", list.find((item) => item.id === store.prefs.openCollection)?.id ?? list[0]!.id, "select", list.map((item) => [item.id, item.name])],
  ], async (values) => {
    try {
      const rows = await request<CollectionEntry[]>(`/api/collections/${encodeURIComponent(String(values.collection))}/cards`);
      await store.addToPrintList(rows.map((row) => ({ card: row, count: row.quantity })), store.collectionName(String(values.collection)));
    } catch (reason) {
      store.fail(reason, "Could not load the collection.");
      return false;
    }
  }, "Add");
}

function addSelected(store: Store) {
  const picked = (store.collection ?? []).filter((entry) => store.checked.has(entryKey(entry)));
  if (!picked.length) return store.flash("Pick cards in a collection first (Select several cards in Options, or Ctrl+click)", "err");
  void store.addToPrintList(picked.map((entry) => ({ card: entry, count: entry.quantity })), `${picked.length} selected ${picked.length === 1 ? "card" : "cards"}`);
}

/** Pasted lines in the deck list format: "4 Lightning Bolt", "1 Sol Ring (C21) 263", with *F* and *E* marks. */
function pasteDialog(store: Store) {
  let text = "";
  customDialog("Paste a card list", (close) => {
    const run = async () => {
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("//") && !line.startsWith("#") && !/^(deck|sideboard|commander|maybeboard)$/i.test(line));
      if (!lines.length) return store.flash("Paste at least one card", "err");
      const found: Array<{ card: CardForPrint; count: number }> = [];
      const missing: string[] = [];
      for (const line of lines.slice(0, 1000)) {
        const parsed = parseQuickAdd(line.replace(/^SB:\s*/i, ""));
        if (!parsed) { missing.push(line); continue; }
        try {
          const params = new URLSearchParams({ name: parsed.name, set: parsed.set, number: parsed.number });
          const card = await request<{ id: string; name: string }>(`/api/cards/resolve?${params}`);
          const detail = await request<CardForPrint>(`/api/cards/${encodeURIComponent(card.id)}`);
          found.push({ card: detail, count: parsed.quantity });
        } catch {
          missing.push(line);
        }
      }
      close();
      if (found.length) await store.addToPrintList(found);
      if (missing.length) {
        customDialog("Lines not added", () => (
          <><p className="dlgq">{missing.length} {missing.length === 1 ? "line does" : "lines do"} not match a card in the card database:</p>
            <ul className="skipped">{missing.map((line, index) => <li key={index}>{line}</li>)}</ul></>
        ), 460);
      }
    };
    return (
      <div className="iowin">
        <textarea className="pastebox" autoFocus rows={12} aria-label="Card list" placeholder={"4 Lightning Bolt\n1 Sol Ring (C21) 263\n1 Opt (XLN) 65 *F*"}
          onChange={(event) => { text = event.target.value; }} />
        <div className="btnrow end"><button type="button" className="btn primary" onClick={() => void run()}>Add to print list</button></div>
      </div>
    );
  }, 520, "Cancel");
}

async function addTokens(store: Store) {
  const ids = (store.printList ?? []).map((line) => line.cardId);
  if (!ids.length) return store.flash("Add cards to the print list first", "err");
  try {
    const tokens = await request<CardForPrint[]>("/api/cards/tokens", { method: "POST", body: JSON.stringify({ ids }) });
    const listed = new Set(ids);
    const fresh = tokens.filter((token) => !listed.has(token.id));
    if (!fresh.length) return store.flash("The listed cards make no tokens that are not already listed", "err");
    await store.addToPrintList(fresh.map((card) => ({ card, count: 1 })), `${fresh.length} ${fresh.length === 1 ? "token" : "tokens"}`);
  } catch (reason) {
    store.fail(reason, "Could not find the tokens.");
  }
}

/** A search box that adds a card to the print list: card search syntax, custom cards included. */
function PrintSearch() {
  const store = useApp();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const run = async () => {
    setError("");
    if (!term.trim()) return setResults(null);
    try {
      setResults(await request<Card[]>(`/api/cards?q=${encodeURIComponent(term.trim())}&limit=12`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not search.");
    }
  };
  return (
    <div className="psearch">
      <label className="searchbox">
        <Icon name="find" className="nicon" />
        <input value={term} onChange={(event) => setTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void run(); if (event.key === "Escape") setResults(null); }}
          placeholder="Find a card to print (Enter)" aria-label="Find a card to print" />
      </label>
      {error && <p className="note err">{error}</p>}
      {results && (
        <div className="presults" role="listbox" aria-label="Cards to print">
          {results.length === 0 && <p className="note pad">No matching cards</p>}
          {results.map((card) => (
            <div key={card.id} className="row" role="option" aria-selected={false}>
              <Thumb url={card.image_url} small />
              <div className="rowmain"><b>{card.name}</b> <span className="sub">{card.set_code.toUpperCase()} {card.collector_number}</span>
                {card.custom && <span className="badge custom">Custom</span>}</div>
              <button type="button" className="btn small" onClick={() => void store.addToPrintList([{ card, count: 1 }], card.name)}>+ Print</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- the list ----------
function LineRow({ line }: { line: PrintLine }) {
  const store = useApp();
  return (
    <div className="row pline">
      <Thumb url={line.card.image_url} small />
      <div className="rowmain">
        <div className="rowtitle"><b>{line.card.name}</b><ManaCost cost={line.card.mana_cost} />{line.card.custom && <span className="badge custom">Custom</span>}</div>
        <div className="rowmeta">{line.card.set_name} <span className="badge">{line.card.set_code.toUpperCase()}</span> {line.card.collector_number}
          <button type="button" className="lnk" onClick={() => choosePrinting(line.card.name, line.cardId, line.cardId, { currency: store.prefs.currency }, (printing) => {
            store.setPrintLine(line.id, { cardId: printing.id, card: { ...line.card, id: printing.id, set_code: printing.set_code, set_name: printing.set_name, collector_number: printing.collector_number, image_url: printing.image_url } });
            void store.loadPrintList();
          })}>Printing...</button>
        </div>
      </div>
      {line.card.hasBack && <Picker label={`Faces of ${line.card.name}`} value={line.faces} options={FACE_CHOICES} onChange={(value) => store.setPrintLine(line.id, { faces: value as Faces })} />}
      <Quantity value={line.count} name={line.card.name} max={100} onChange={(count) => (count < 1 ? store.removePrintLine(line.id) : store.setPrintLine(line.id, { count: Math.min(100, count) }))} />
      <button type="button" className="btn small" aria-label={`Remove ${line.card.name} from the print list`} onClick={() => store.removePrintLine(line.id)}>Remove</button>
      <EntryMenuButton menu={rowMenu(store, line.card.name, () => [
        { label: "Card page", run: () => store.setCardPage(line.cardId) },
        { label: "Change printing...", run: () => choosePrinting(line.card.name, line.cardId, line.cardId, { currency: store.prefs.currency }, (printing) => {
          store.setPrintLine(line.id, { cardId: printing.id, card: { ...line.card, id: printing.id, set_code: printing.set_code, set_name: printing.set_name, collector_number: printing.collector_number, image_url: printing.image_url } });
          void store.loadPrintList();
        }) },
        { label: "Remove from the print list", run: () => store.removePrintLine(line.id) },
      ])} name={line.card.name} />
    </div>
  );
}

const PRINT_WIDTHS: Record<GridSize, number> = { s: 110, m: 150, l: 210 };
const PRINT_PHONE_COLUMNS: Record<GridSize, number> = { s: 4, m: 3, l: 2 };

/** One print list line as a picture: the count and the price pips on it, and its count and Remove under it. */
function LinePicture({ line }: { line: PrintLine }) {
  const store = useApp();
  return (
    <CardFrame section="proxies" className="stackcell printcell" picture={(
      <div className="pocket" title={`${line.card.name}, ${line.card.set_name} ${line.card.collector_number}`}>
        {line.card.image_url ? <img src={line.card.image_url} alt={line.card.name} loading="lazy" draggable={false} /> : <span className="pocketname">{line.card.name}</span>}
      </div>
    )} pieces={{
      count: <CountPip count={line.count} />,
      marks: line.card.custom ? <span className="badge custom">Custom</span> : null,
      price: <PricePip price={printPrice(line.card, store.prefs.currency)} />,
      buttons: (
        <div className="printctl">
          <Quantity value={line.count} name={line.card.name} max={100} onChange={(count) => (count < 1 ? store.removePrintLine(line.id) : store.setPrintLine(line.id, { count: Math.min(100, count) }))} />
          <button type="button" className="btn small" aria-label={`Remove ${line.card.name} from the print list`} onClick={() => store.removePrintLine(line.id)}>Remove</button>
        </div>
      ),
    }} />
  );
}

/** The print list as List, Grid or Binder (nine pockets a page), in the sort chosen. */
function PrintLines({ lines }: { lines: PrintLine[] }) {
  const store = useApp();
  const [page, setPage] = useState(0);
  const layout = store.prefs.printLayout;
  const size = store.prefs.printSize;
  const pages = Math.max(1, Math.ceil(lines.length / 9));
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [page, pages]);
  const group = store.prefs.listGroups.print;
  if (layout === "list") {
    return <GroupedList view="print" headed={group !== "none"} label="Print list" render={(line) => <LineRow key={line.id} line={line} />}
      sections={groupList(lines.map((line) => ({ ...line.card, line })), group, null, (item) => printPrice(item, store.prefs.currency), (item) => item.line.count)
        .map((section) => ({ ...section, cards: section.cards.map((item) => item.line) }))} />;
  }
  const columns = layout === "binder" ? "repeat(3, minmax(0, 1fr))"
    : store.phone ? `repeat(${PRINT_PHONE_COLUMNS[size]}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${PRINT_WIDTHS[size]}px, 1fr))`;
  const shown = layout === "binder" ? lines.slice(page * 9, page * 9 + 9) : lines;
  return (
    <>
      <div className={`cardgrid size-${size}${layout === "binder" ? " printbinder" : ""}`} aria-label="Print list" style={{ gridTemplateColumns: columns }}>
        {shown.map((line) => <LinePicture key={line.id} line={line} />)}
      </div>
      {layout === "binder" && pages > 1 && (
        <div className="btnrow pagerow">
          <button type="button" className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button>
          <span className="sub">Page {page + 1} of {pages}</span>
          <button type="button" className="btn small" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next page</button>
        </div>
      )}
    </>
  );
}

/** Sort and Options (layout and card size) for the print list, like the other card lists. */
function PrintListBar() {
  const store = useApp();
  return (
    <div className="navbar printbar">
      <Picker label="Sort the print list" prefix="Sort: " value={store.prefs.printSort} options={choices(PRINT_SORTS)} onChange={(value) => store.setPrefs({ printSort: value as PrintSort })} />
      <OptionsButton title="Print list options">
        <ListOptionRows id="print-opt" group={store.prefs.listGroups.print} onGroup={(group) => store.setPrefs({ listGroups: { ...store.prefs.listGroups, print: group } })} />
        <LayoutRows name="Print list" layout={store.prefs.printLayout} size={store.prefs.printSize}
          onLayout={(printLayout) => store.setPrefs({ printLayout })} onSize={(printSize) => store.setPrefs({ printSize })} />
      </OptionsButton>
    </div>
  );
}

// ---------- settings, preview and exports ----------
function NumberField({ label, value, min, max, step = 0.5, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (value: number) => void }) {
  const id = `ps-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="prow"><label htmlFor={id}>{label}</label>
      <span className="numfield"><input id={id} type="number" value={value} min={min} max={max} step={step}
        onChange={(event) => { const number = Number(event.target.value); if (Number.isFinite(number)) onChange(Math.min(max, Math.max(min, number))); }} /> {unit}</span>
    </div>
  );
}

/** Uploads the account's own card back, used when Card backs is Uploaded back. */
async function uploadBack(store: Store) {
  const file = await pickFile("image/jpeg,image/png,image/webp");
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) return store.flash("A card back can be up to 6 MB", "err");
  try {
    await request("/api/card-backs/mine", { method: "PUT", body: JSON.stringify({ picture: await blobToData(file) }) });
    forgetCardBack();
    store.flash("Card back uploaded");
  } catch (reason) {
    store.fail(reason, "Could not upload the card back.");
  }
}

function SheetPanel() {
  const store = useApp();
  const sheet = store.prefs.proxySheet;
  const set = (change: Partial<SheetSettings>) => store.setPrefs({ proxySheet: { ...sheet, ...change } });
  return (
    <section className="psheet" aria-label="Sheet settings">
      <h4>Sheet</h4>
      <div className="prow"><label htmlFor="ps-paper">Paper</label>
        <Picker id="ps-paper" label="Paper" value={sheet.paper} options={PAPER_CHOICES} onChange={(value) => set({ paper: value as SheetSettings["paper"] })} /></div>
      {sheet.paper === "custom" && <>
        <NumberField label="Page width" value={sheet.pageWidth} min={50} max={1000} unit="mm" onChange={(pageWidth) => set({ pageWidth })} />
        <NumberField label="Page height" value={sheet.pageHeight} min={50} max={1000} unit="mm" onChange={(pageHeight) => set({ pageHeight })} />
      </>}
      <NumberField label="Margins" value={sheet.margin} min={0} max={50} unit="mm" onChange={(margin) => set({ margin })} />
      <div className="prow"><label htmlFor="ps-size">Card size</label>
        <Picker id="ps-size" label="Card size" value={sheet.cardSize} options={SIZE_CHOICES} onChange={(value) => set({ cardSize: value as SheetSettings["cardSize"] })} /></div>
      {sheet.cardSize === "custom" && <>
        <NumberField label="Card width" value={sheet.cardWidth} min={20} max={300} unit="mm" onChange={(cardWidth) => set({ cardWidth })} />
        <NumberField label="Card height" value={sheet.cardHeight} min={20} max={300} unit="mm" onChange={(cardHeight) => set({ cardHeight })} />
      </>}
      <NumberField label="Scale" value={sheet.scale} min={50} max={150} step={1} unit="%" onChange={(scale) => set({ scale })} />
      <NumberField label="Gap" value={sheet.gap} min={0} max={20} unit="mm" onChange={(gap) => set({ gap })} />
      <NumberField label="Bleed" value={sheet.bleed} min={0} max={3} step={0.25} unit="mm" onChange={(bleed) => set({ bleed })} />
      <div className="prow"><label htmlFor="ps-marks">Cutting guides</label>
        <Picker id="ps-marks" label="Cutting guides" value={sheet.marks} options={MARK_CHOICES} onChange={(value) => set({ marks: value as SheetSettings["marks"] })} /></div>
      <div className="prow"><label htmlFor="ps-bg">Background</label>
        <input id="ps-bg" type="color" value={sheet.background} onChange={(event) => set({ background: event.target.value })} /></div>
      <div className="prow"><label htmlFor="ps-backs">Card backs</label>
        <Picker id="ps-backs" label="Card backs" value={sheet.cardBacks} options={BACK_CHOICES} onChange={(value) => set({ cardBacks: value as SheetSettings["cardBacks"] })} /></div>
      {sheet.cardBacks === "mine" && <div className="prow"><span />
        <span className="btnrow"><button type="button" className="btn small" onClick={() => void uploadBack(store)}>Upload back...</button></span></div>}
      <div className="btnrow"><button type="button" className="btn small" onClick={() => store.setPrefs({ proxySheet: DEFAULT_SHEET })}>Reset sheet</button></div>
    </section>
  );
}

function Preview({ lines }: { lines: PrintLine[] }) {
  const store = useApp();
  const sheet = store.prefs.proxySheet;
  const layout = useMemo(() => layoutPages(lines, sheet), [lines, sheet]);
  const pictures = new Map(lines.map((line) => [line.cardId, line.card.image_url]));
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;
  return (
    <section className="ppreview" aria-label="Page preview">
      <h4>Preview <span className="cnt">{layout.pages.length} {layout.pages.length === 1 ? "page" : "pages"}, {layout.columns} x {layout.rows} per page</span></h4>
      {layout.pages.length === 0 && <p className="note pad">Add cards to see the pages</p>}
      <div className="ppages">
        {layout.pages.map((slots, index) => (
          <div key={index} className="ppage" style={{ aspectRatio: `${layout.width} / ${layout.height}`, background: sheet.background }} aria-label={`Page ${index + 1}`} role="img">
            {slots.map((slot, place) => (
              <div key={place} className={`pslot${slot.face === "back" ? " back" : ""}`}
                style={{ left: pct(slot.x - sheet.bleed, layout.width), top: pct(slot.y - sheet.bleed, layout.height), width: pct(slot.width + sheet.bleed * 2, layout.width), height: pct(slot.height + sheet.bleed * 2, layout.height) }}>
                {slot.face === "front" && pictures.get(slot.cardId) ? <img src={pictures.get(slot.cardId)!} alt="" loading="lazy" /> : <span>{slot.name}{slot.face === "back" ? " (back)" : ""}</span>}
              </div>
            ))}
            <span className="pnum">{index + 1}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExportPanel({ lines }: { lines: PrintLine[] }) {
  const store = useApp();
  const [busy, setBusy] = useState("");
  const [after, setAfter] = useState(false);
  const targets: Choice[] = [
    ...(store.collections ?? []).filter((item) => item.kind === "collection").map((item) => ({ value: `collection:${item.id}`, label: item.name, group: "Collections" })),
    ...store.decks.map((deck) => ({ value: `deck:${deck.id}`, label: deck.name, group: "Decks" })),
  ];
  const [target, setTarget] = useState(targets[0]?.value ?? "");
  const [holder, setHolder] = useState((store.collections ?? []).find((item) => item.kind === "collection")?.id ?? "");
  const [kind, id] = target.split(":") as ["collection" | "deck", string];
  const cardCount = printSlots(lines).length;

  const afterExport = async () => {
    if (!after || !target) return;
    // each printed card counts once, whatever faces were printed
    const counts = new Map<string, { cardId: string; name: string; count: number }>();
    for (const line of lines) {
      const item = counts.get(line.cardId) ?? { cardId: line.cardId, name: line.card.name, count: 0 };
      item.count += line.count;
      counts.set(line.cardId, item);
    }
    await store.addPrintedAsProxies([...counts.values()], { kind, id, collectionId: kind === "deck" ? holder : undefined });
  };

  /**
   * Loads every picture to print first. When some cannot be had, the cards are listed with Try again and Make anyway,
   * instead of quietly printing them as white cards. Resolves false when the person stops.
   */
  const picturesReady = async (from: PrintLine[]): Promise<boolean> => {
    for (;;) {
      setBusy("Loading the card pictures");
      const faces = from.flatMap((line) => facesOf(line).map((face) => ({ cardId: line.cardId, face, name: line.card.name })));
      const missing = await missingPictures(faces, (done, total) => setBusy(`Loading the card pictures: ${done} of ${total}`));
      setBusy("");
      if (!missing.length) return true;
      const answer = await choiceDialog("Some card pictures are missing", (
        <>
          The {missing.length === 1 ? "picture of this card" : `pictures of these ${missing.length} cards`} could not be downloaded.
          Without a picture a card prints as a white card with its name.
          <span className="misslist">{missing.join(", ")}</span>
        </>
      ), [["again", "Try again", true], ["anyway", "Make it anyway"]]);
      if (answer === "anyway") return true;
      if (answer !== "again") return false;
    }
  };

  const run = async (what: "pdf" | "mpc" | "autofill") => {
    if (!lines.length) return store.flash("Add cards to the print list first", "err");
    try {
      if (what !== "autofill" && !(await picturesReady(lines))) return;
      if (what === "autofill" && lines.some((line) => line.card.custom) && !(await picturesReady(lines.filter((line) => line.card.custom)))) return;
      if (what === "pdf") {
        setBusy("Making the PDF");
        const bytes = await buildPdf(lines, store.prefs.proxySheet, (done, total) => setBusy(`Making the PDF: card ${done} of ${total}`));
        downloadBlob("proxies.pdf", new Blob([bytes as BlobPart], { type: "application/pdf" }));
        store.flash(`PDF with ${cardCount} cards on ${layoutPages(lines, store.prefs.proxySheet).pages.length * (store.prefs.proxySheet.cardBacks === "none" ? 1 : 2)} pages saved`);
      } else if (what === "mpc") {
        setBusy("Making the pictures");
        const bytes = await buildMpcZip(lines, (done, total) => setBusy(`Making the pictures: ${done} of ${total}`), store.prefs.proxySheet.cardBacks);
        downloadBlob("makeplayingcards.zip", new Blob([bytes as BlobPart], { type: "application/zip" }));
        store.flash("MakePlayingCards pictures saved");
      } else {
        const text = mpcAutofillList(lines);
        const custom = lines.filter((line) => line.card.custom);
        if (text) downloadText("mpc-autofill.txt", text, "text/plain");
        if (custom.length) {
          setBusy("Making the pictures of custom cards");
          const bytes = await buildMpcZip(custom, (done, total) => setBusy(`Making the pictures of custom cards: ${done} of ${total}`), store.prefs.proxySheet.cardBacks);
          downloadBlob("custom-cards.zip", new Blob([bytes as BlobPart], { type: "application/zip" }));
        }
        store.flash(custom.length ? "MPC Autofill list and custom card pictures saved" : "MPC Autofill list saved");
      }
      setBusy("");
      await afterExport();
    } catch (reason) {
      setBusy("");
      store.fail(reason, "Could not export the proxies.");
    }
  };

  return (
    <section className="pexport" aria-label="Export">
      <h4>Export <span className="cnt">{cardCount} {cardCount === 1 ? "card" : "cards"}</span></h4>
      <div className="btnrow">
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => void run("pdf")}>Export PDF</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => void run("mpc")}>MakePlayingCards pictures</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => void run("autofill")}>MPC Autofill list</button>
      </div>
      {busy && <p className="note" role="status">{busy}</p>}
      <label className="ck"><input type="checkbox" checked={after} onChange={(event) => setAfter(event.target.checked)} /> After exporting, add the printed cards as proxies to</label>
      {after && <>
        <Picker label="Add the printed proxies to" value={target} options={targets} onChange={setTarget} />
        {kind === "deck" && (
          <div className="prow"><label htmlFor="pp-holder">Proxy copies go in</label>
            <Picker id="pp-holder" label="Proxy copies go in" value={holder}
              options={(store.collections ?? []).filter((item) => item.kind === "collection").map((item) => ({ value: item.id, label: item.name }))} onChange={setHolder} /></div>
        )}
      </>}
    </section>
  );
}

function PrintTab() {
  const store = useApp();
  const { printList, loadPrintList } = store;
  useEffect(() => { if (printList === null) void loadPrintList(); }, [printList, loadPrintList]);
  const lines = useMemo(() => sortPrintLines(printList ?? [], store.prefs.printSort, store.prefs.currency), [printList, store.prefs.printSort, store.prefs.currency]);
  const total = lines.reduce((sum, line) => sum + line.count * facesOf(line).length, 0);
  return (
    <div className="proxybody">
      <section className="plist" aria-label="Print list">
        <div className="btnrow padd">
          <button type="button" className="btn small" onClick={() => addFromDeckDialog(store)}>From deck...</button>
          <button type="button" className="btn small" onClick={() => addFromDeckDialog(store, true)}>Missing cards...</button>
          <button type="button" className="btn small" onClick={() => addFromCollectionDialog(store)}>From collection...</button>
          <button type="button" className="btn small" onClick={() => addSelected(store)}>Selected cards</button>
          <button type="button" className="btn small" onClick={() => pasteDialog(store)}>Paste list...</button>
          <button type="button" className="btn small" onClick={() => void addTokens(store)}>Add tokens</button>
        </div>
        <PrintSearch />
        {lines.length > 0 && <PrintListBar />}
        <div className="plines">
          {printList === null && <p className="note pad">Loading the print list</p>}
          {printList !== null && lines.length === 0 && <div className="empty compact"><Icon name="print" /><b>The print list is empty</b><span className="sub">Add a deck, a collection, or cards from the search</span></div>}
          <PrintLines lines={lines} />
        </div>
        <div className="pfoot"><span className="sub">{lines.length} {lines.length === 1 ? "line" : "lines"}, {total} {total === 1 ? "card" : "cards"} to print</span>
          <button type="button" className="btn small" disabled={!lines.length} onClick={() => void confirmDialog("Clear the print list", "Remove every card from the print list?", "Clear")
            .then((ok) => { if (ok) store.clearPrintList(); })}>Clear list</button>
        </div>
      </section>
      <div className="pside">
        <ExportPanel lines={lines} />
        <SheetPanel />
        <Preview lines={lines} />
      </div>
    </div>
  );
}

export function ProxiesView({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const tab = store.prefs.proxyTab;
  return (
    <div className="view" id="view-proxies">
      <div id="pagetabs" className="colhead">
        <span className="phname">Proxies</span>
        <div className="seg" role="tablist" aria-label="Proxies view">
          <button type="button" role="tab" aria-selected={tab === "print"} className={tab === "print" ? "on" : ""} onClick={actions["proxies.print"]?.run}>Print</button>
          <button type="button" role="tab" aria-selected={tab === "maker"} className={tab === "maker" ? "on" : ""} onClick={actions["proxies.maker"]?.run}>Card maker</button>
          <button type="button" role="tab" aria-selected={tab === "sets"} className={tab === "sets" ? "on" : ""} onClick={actions["proxies.sets"]?.run}>Custom sets</button>
        </div>
      </div>
      {tab === "print" ? <PrintTab /> : tab === "sets" ? <SetMaker /> : <CardMaker />}
    </div>
  );
}
