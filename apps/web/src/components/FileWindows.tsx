// ---------- import and export windows: one place to pick what, which format and where ----------
import { useEffect, useMemo, useState } from "react";
import { downloadText, pickFile, request, slugify } from "../api";
import { entryKey } from "../library-state";
import { EXPORT_FORMATS, type ExportFormat, exportText, type ExportRow, IMPORT_FORMATS } from "../formats";
import type { Store } from "../store";
import { useApp } from "../store";
import type { CollectionEntry, CompletionReport, ImportReport } from "../types";
import { closeDialog, customDialog } from "./Dialog";
import { choices as pickerChoices, Picker } from "./Picker";

type ImportKind = "collection" | "deck";
const NEW = "__new__";

function ImportWindow({ initial }: { initial: ImportKind }) {
  const store = useApp();
  const [kind, setKind] = useState<ImportKind>(initial === "deck" && !store.deck ? "collection" : initial);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [format, setFormat] = useState("");
  const [detected, setDetected] = useState("");
  const collections = store.collections ?? [];
  const [into, setInto] = useState(store.prefs.openCollection ?? collections[0]?.id ?? NEW);
  const [newName, setNewName] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    const picked = await pickFile(".csv,.txt,text/csv,text/plain");
    if (!picked) return;
    if (picked.size > 5 * 1024 * 1024) return setError("The file must be 5 MB or smaller");
    setFile({ name: picked.name, text: await picked.text() });
    setFormat("");
    setDetected("");
  };

  // the preview runs again whenever the file, the format or the kind changes
  const previewTarget = kind === "deck" ? store.deck?.id : (into !== NEW ? into : collections[0]?.id);
  useEffect(() => {
    if (!file || !previewTarget) return;
    let active = true;
    setError("");
    setReport(null);
    const url = kind === "deck"
      ? `/api/decks/${encodeURIComponent(previewTarget)}/import/preview`
      : `/api/collections/${encodeURIComponent(previewTarget)}/import/preview${format ? `?format=${format}` : ""}`;
    request<ImportReport>(url, { method: "POST", headers: { "content-type": file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "text/plain" }, body: file.text })
      .then((result) => {
        if (!active) return;
        setReport(result);
        if (!format && result.format) setDetected(result.format);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not read the file."); });
    return () => { active = false; };
  }, [file, format, kind, previewTarget]);

  const run = async () => {
    if (!file || !report || busy) return;
    setBusy(true);
    try {
      let target = kind === "deck" ? store.deck?.id ?? "" : into;
      if (kind === "collection" && into === NEW) {
        const name = newName.trim();
        if (!name) {
          setError("Enter a name for the new collection");
          return;
        }
        target = (await store.createCollection({ name, description: "", completion: "none", finish: "any", kind: "collection", sets: [] })).id;
      }
      const url = kind === "deck"
        ? `/api/decks/${encodeURIComponent(target)}/import`
        : `/api/collections/${encodeURIComponent(target)}/import${format || detected ? `?format=${format || detected}` : ""}`;
      const result = await request<ImportReport>(url, { method: "POST", headers: { "content-type": "text/csv" }, body: file.text });
      const where = kind === "deck" ? store.deck?.name ?? "the deck" : store.collectionName(target);
      store.showReview(`Import into ${where}: ${file.name}`, result, true);
      store.flash(`Imported ${result.importedQuantity} cards from ${result.matchedRows} lines into ${where}`);
      closeDialog();
      await store.refreshAfterChange();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import the file.");
    } finally {
      setBusy(false);
    }
  };

  const detectedName = IMPORT_FORMATS.find(([id]) => id === detected)?.[1];
  return (
    <div className="iowin">
      <div className="prow"><label>Import into</label>
        <div className="seg" role="group" aria-label="Import into">
          <button type="button" className={kind === "collection" ? "on" : ""} aria-pressed={kind === "collection"} onClick={() => setKind("collection")}>Collection</button>
          <button type="button" className={kind === "deck" ? "on" : ""} aria-pressed={kind === "deck"} disabled={!store.deck} onClick={() => setKind("deck")}>Deck</button>
        </div>
      </div>
      <div className="prow"><label>File</label>
        <span className="iofile"><button type="button" className="btn" onClick={() => void choose()}>Choose file...</button> <b>{file?.name ?? "No file chosen"}</b></span>
      </div>
      {kind === "collection" && (
        <div className="prow"><label htmlFor="io-format">Format</label>
          <Picker id="io-format" label="Format" value={format} onChange={setFormat}
            options={[{ value: "", label: detectedName ? `Detected: ${detectedName}` : "Detect from the file" }, ...pickerChoices(IMPORT_FORMATS)]} />
        </div>
      )}
      {kind === "collection" ? (
        <div className="prow"><label htmlFor="io-into">Collection</label>
          <Picker id="io-into" label="Collection" value={into} onChange={setInto}
            options={[...collections.map((item) => ({ value: item.id, label: item.name, detail: `${item.cardCount} cards` })), { value: NEW, label: "New collection..." }]} />
        </div>
      ) : (
        <div className="prow"><label>Deck</label><b>{store.deck?.name}</b></div>
      )}
      {kind === "collection" && into === NEW && (
        <div className="prow"><label htmlFor="io-new">Name</label><input id="io-new" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} /></div>
      )}
      {error && <p className="note err">{error}</p>}
      {report && (
        <div className="dlgtext">
          <p>{report.matchedRows} lines ({report.importedQuantity} cards) match. {report.unmatched.length} lines are skipped.</p>
          {report.unmatched.length > 0 && (
            <div className="msglist">
              {report.unmatched.slice(0, 8).map((item) => (
                <div className="msg" key={`${item.row}-${item.name}`}><span className="lv w">Row {item.row}</span><span>{item.name ? `${item.name}: ` : ""}{item.reason}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={!report || !report.matchedRows || busy} onClick={() => void run()}>Import</button>
      </div>
    </div>
  );
}

export function importWindow(_store: Store, kind: ImportKind = "collection") {
  customDialog("Import", () => <ImportWindow initial={kind} />, 560, "Cancel");
}

type ExportWhat = "collection" | "filtered" | "selected" | "missing" | "deck";

const fromEntry = (entry: CollectionEntry): ExportRow => ({
  quantity: entry.quantity, trade: entry.trade, name: entry.name, set_code: entry.set_code, set_name: entry.set_name, collector_number: entry.collector_number,
  rarity: entry.rarity, cardId: entry.id, foil: entry.foil, condition: entry.condition, language: entry.language, proxy: entry.proxy,
  purchase_price: entry.purchase_price, price_currency: entry.price_currency, added_at: entry.added_at, misprint: entry.misprint, altered: entry.altered, signed: entry.signed,
});

function ExportWindow({ initial, collectionId }: { initial: ExportWhat; collectionId?: string }) {
  const store = useApp();
  // a collection's right-click menu exports that collection, open or not
  const other = !!collectionId && collectionId !== store.prefs.openCollection;
  const open = store.collections?.find((item) => item.id === (collectionId ?? store.prefs.openCollection)) ?? null;
  const filtered = other ? 0 : store.visibleCollection.length;
  const picked = store.checked.size;
  const choices = useMemo(() => {
    const list: Array<[ExportWhat, string, boolean]> = [
      ["collection", open ? `Whole collection: ${open.name}` : "Whole collection", !!open],
      ["filtered", `Filtered cards (${filtered} shown)`, !!open && filtered > 0 && filtered !== (store.collection?.length ?? 0)],
      ["selected", `Selected cards (${picked} picked)`, picked > 0 && !other],
      ["missing", "Missing cards", !!open && open.completion !== "none" && open.sets.length > 0],
      ["deck", store.deck ? `Deck: ${store.deck.name}` : "Deck", !!store.deck && !other],
    ];
    return list.filter(([, , ok]) => ok);
  }, [open, filtered, picked, store.deck, store.collection, other]);
  const [what, setWhat] = useState<ExportWhat>(choices.some(([id]) => id === initial) ? initial : choices[0]?.[0] ?? "collection");
  const [format, setFormat] = useState<ExportFormat>(initial === "deck" ? "text" : "manavault");
  const [error, setError] = useState("");

  const run = async () => {
    setError("");
    try {
      let rows: ExportRow[] = [];
      let name = open?.name ?? "collection";
      if (what === "collection" && open) rows = (await request<CollectionEntry[]>(`/api/collections/${encodeURIComponent(open.id)}/cards`)).map(fromEntry);
      if (what === "filtered") rows = store.visibleCollection.map(fromEntry);
      if (what === "selected") rows = (store.collection ?? []).filter((entry) => store.checked.has(entryKey(entry))).map(fromEntry);
      if (what === "missing" && open) {
        const report = await request<CompletionReport>(`/api/collections/${encodeURIComponent(open.id)}/completion`);
        rows = report.missing.map((card) => ({
          quantity: 1, name: card.name, set_code: card.set_code, set_name: card.set_name, collector_number: card.collector_number, rarity: card.rarity,
          cardId: card.id, foil: card.needs === "foil" ? 1 : 0,
        }));
        name = `${open.name} missing`;
      }
      if (what === "deck" && store.deck) {
        name = store.deck.name;
        rows = store.deck.cards.map((card) => ({
          quantity: card.quantity, name: card.name, set_code: card.set_code, set_name: card.set_name, collector_number: card.collector_number,
          cardId: card.card_id, foil: (card.links?.[0]?.foil ?? 0) as 0 | 1 | 2,
        }));
      }
      if (!rows.length) return setError("There is nothing to export");
      const file = exportText(rows, format);
      downloadText(`${slugify(name)}.${file.extension}`, file.text, file.type);
      store.flash(`${rows.length} cards exported`);
      closeDialog();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export.");
    }
  };

  if (!choices.length) return <p className="note">Open a collection or a deck to export</p>;
  return (
    <div className="iowin">
      <div className="prow"><label htmlFor="ex-what">Export</label>
        <Picker id="ex-what" label="Export" value={what} onChange={(value) => setWhat(value as ExportWhat)} options={choices.map(([value, label]) => ({ value, label }))} />
      </div>
      <div className="prow"><label htmlFor="ex-format">Format</label>
        <Picker id="ex-format" label="Format" value={format} onChange={(value) => setFormat(value as ExportFormat)} options={pickerChoices(EXPORT_FORMATS)} />
      </div>
      {error && <p className="note err">{error}</p>}
      <div className="btnrow end"><button type="button" className="btn primary" onClick={() => void run()}>Export</button></div>
    </div>
  );
}

export function exportWindow(_store: Store, what: ExportWhat = "collection", collectionId?: string) {
  customDialog("Export", () => <ExportWindow initial={what} collectionId={collectionId} />, 480, "Cancel");
}
