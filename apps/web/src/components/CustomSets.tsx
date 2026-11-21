// ---------- custom sets: the Custom sets window, its right-click menu, Edit set and the set symbol choices ----------
import { useCallback, useEffect, useState } from "react";
import { fetchFile, pickFile, request } from "../api";
import { type Store } from "../store";
import { rowMenu } from "./ContextMenu";
import { confirmDialog, customDialog } from "./Dialog";

export type CustomSet = {
  code: string; name: string; releasedAt: string | null; ownerId: number | null; ownerName: string; hasSymbol: boolean; cardCount: number;
  symbolUrl: string | null; symbolType: string | null; rarityColors: boolean;
};
type ScryfallSet = { code: string; name: string; released_at: string | null; symbolUrl: string };

export const blobToData = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("The picture could not be read"));
  reader.readAsDataURL(blob);
});

/** A set symbol chosen in a window: a file's data, a Scryfall set's code, or none. */
type SymbolChoice = { data: string } | { from: string; url: string } | { none: true } | null;

const SYMBOL_FILES = "image/svg+xml,.svg,image/png,image/jpeg,image/webp";
async function uploadSymbol(store: Store): Promise<string | null> {
  const file = await pickFile(SYMBOL_FILES);
  if (!file) return null;
  if (file.size > 512 * 1024) {
    store.flash("A set symbol can be up to 512 KB", "err");
    return null;
  }
  const data = await blobToData(file);
  // some systems give SVG files no type: the data address is made an SVG one
  return /\.svg$/i.test(file.name) && !data.startsWith("data:image/svg+xml") ? data.replace(/^data:[^;]*;/, "data:image/svg+xml;") : data;
}

/** Chooses the symbol of a Scryfall set, from the symbols the card database update saved. */
function ScryfallSymbols({ onPick }: { onPick: (set: ScryfallSet) => void }) {
  const [term, setTerm] = useState("");
  const [sets, setSets] = useState<ScryfallSet[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      request<ScryfallSet[]>(`/api/sets/symbols?q=${encodeURIComponent(term.trim())}`).then(setSets)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the set symbols."));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [term]);
  return (
    <div className="symsets">
      <input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a set by name or code" aria-label="Find a set" />
      {error && <p className="note err">{error}</p>}
      {sets?.length === 0 && <p className="note">No set symbols yet. Update the card database to load the set symbols.</p>}
      <div className="symsetgrid">
        {sets?.map((set) => (
          <button key={set.code} type="button" className="symset" title={`${set.name} (${set.code.toUpperCase()})`} onClick={() => onPick(set)}>
            <img src={set.symbolUrl} alt="" loading="lazy" /><span>{set.name}</span><span className="sub">{set.code.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The symbol part of the set windows: the symbol shown, Upload symbol..., Scryfall set symbol... and Remove symbol. */
function SymbolChooser({ store, current, choice, setChoice }: { store: Store; current: string | null; choice: SymbolChoice; setChoice: (choice: SymbolChoice) => void }) {
  const [browsing, setBrowsing] = useState(false);
  const shown = choice && "data" in choice ? choice.data : choice && "url" in choice ? choice.url : choice && "none" in choice ? null : current;
  return (
    <span className="symchooser">
      <span className="btnrow">
        {shown ? <img className="setsym" src={shown} alt="Set symbol" /> : <span className="sub">No symbol</span>}
        <button type="button" className="btn small" onClick={() => void uploadSymbol(store).then((data) => { if (data) setChoice({ data }); })}>Upload symbol...</button>
        <button type="button" className={browsing ? "btn small on" : "btn small"} aria-expanded={browsing} onClick={() => setBrowsing(!browsing)}>Scryfall set symbol...</button>
        <button type="button" className="btn small" disabled={!shown} onClick={() => setChoice({ none: true })}>Remove symbol</button>
      </span>
      {browsing && <ScryfallSymbols onPick={(set) => { setChoice({ from: set.code, url: set.symbolUrl }); setBrowsing(false); }} />}
    </span>
  );
}

const symbolBody = (choice: SymbolChoice): Record<string, unknown> =>
  !choice ? {} : "data" in choice ? { symbol: choice.data } : "from" in choice ? { symbolFrom: choice.from } : { symbol: "" };

/** The Edit set window: name, code, release date, symbol and rarity colors. Saving can be undone. */
function EditSet({ store, set, onSaved, close }: { store: Store; set: CustomSet; onSaved: () => void; close: () => void }) {
  const [code, setCode] = useState(set.code.toUpperCase());
  const [name, setName] = useState(set.name);
  const [date, setDate] = useState(set.releasedAt ?? "");
  const [rarityColors, setRarityColors] = useState(set.rarityColors);
  const [choice, setChoice] = useState<SymbolChoice>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const svg = choice && "data" in choice ? choice.data.startsWith("data:image/svg+xml") : choice && "from" in choice ? true : choice && "none" in choice ? false : set.symbolType === "image/svg+xml";
  const save = async () => {
    setError("");
    setBusy(true);
    try {
      // what the set was, so the change can be undone
      let oldSymbol = "";
      if (choice && set.symbolUrl) {
        const response = await fetchFile(set.symbolUrl);
        if (response.ok) oldSymbol = await blobToData(await response.blob());
      }
      const body: Record<string, unknown> = { name, code: code.toLowerCase(), releasedAt: date || undefined, rarityColors, ...symbolBody(choice) };
      const saved = await request<CustomSet>(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "PATCH", body: JSON.stringify(body) });
      const before: Record<string, unknown> = { name: set.name, code: set.code, rarityColors: set.rarityColors, ...(set.releasedAt ? { releasedAt: set.releasedAt } : {}), ...(choice ? { symbol: oldSymbol } : {}) };
      const after = { ...body, code: saved.code };
      store.pushUndo({
        label: `Edit set ${set.name}`,
        undo: async () => { await request(`/api/custom/sets/${encodeURIComponent(saved.code)}`, { method: "PATCH", body: JSON.stringify(before) }); onSaved(); },
        redo: async () => { await request(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "PATCH", body: JSON.stringify(after) }); onSaved(); },
      });
      close();
      onSaved();
      store.flash(`${saved.name} (${saved.code.toUpperCase()}) saved`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the set.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="setmanager">
      {error && <p className="note err">{error}</p>}
      <div className="prow"><label htmlFor="es-name">Set name</label><input id="es-name" autoFocus value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></div>
      <div className="prow"><label htmlFor="es-code">Set code</label><input id="es-code" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} /></div>
      {code.toLowerCase() !== set.code && set.cardCount > 0 && <p className="note">The {set.cardCount} {set.cardCount === 1 ? "card" : "cards"} of the set move to the new code.</p>}
      <div className="prow"><label htmlFor="es-date">Release date</label><input id="es-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      <div className="prow"><label>Set symbol</label><SymbolChooser store={store} current={set.symbolUrl} choice={choice} setChoice={setChoice} /></div>
      <label className="ck"><input type="checkbox" checked={rarityColors} disabled={!svg} onChange={(event) => setRarityColors(event.target.checked)} /> Rarity colors (SVG symbols)</label>
      <div className="btnrow end">
        <button type="button" className="btn primary" disabled={busy || code.length < 2 || !name.trim()} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}

export function editSetDialog(store: Store, set: CustomSet, onSaved: () => void) {
  customDialog(`Edit set ${set.name}`, (close) => <EditSet store={store} set={set} onSaved={onSaved} close={close} />, 620, "Cancel");
}

/** The Custom sets window: every custom set, with a right-click (long-press) menu, and a form for a new set. */
/** The commands for one custom set, the same in the Custom sets window and in the card maker's list (0.17.0). */
export function customSetMenuItems(store: Store, set: CustomSet, onChange: () => void, onNewCard: (code: string) => void) {
  const mine = set.ownerId === store.user.id;
  const remove = async () => {
    if (set.cardCount > 0) return store.flash("Delete or move the cards of the set first", "err");
    if (!(await confirmDialog("Delete custom set", `Delete the custom set ${set.name} (${set.code.toUpperCase()})?`, "Delete set"))) return;
    try {
      await request(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "DELETE" });
      onChange();
      store.flash(`${set.name} deleted`);
    } catch (reason) {
      store.fail(reason, "Could not delete the set.");
    }
  };
  return [
    mine && { label: "Edit set...", run: () => editSetDialog(store, set, onChange) },
    { label: "Show its cards", run: () => { store.setFilters({ query: `set:${set.code}` }); store.setView("cards"); } },
    { label: "New card in this set", run: () => onNewCard(set.code) },
    mine && { label: "Delete...", run: () => void remove() },
  ];
}

export function SetManager({ store, onChange, onNewCard }: { store: Store; onChange: () => void; onNewCard: (code: string) => void }) {
  const [sets, setSets] = useState<CustomSet[] | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [choice, setChoice] = useState<SymbolChoice>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => setSets(await request<CustomSet[]>("/api/custom/sets")), []);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the sets.")); }, [load]);
  const changed = () => { void load(); onChange(); };
  const create = async () => {
    setError("");
    try {
      await request("/api/custom/sets", { method: "POST", body: JSON.stringify({ code, name, releasedAt: date, ...symbolBody(choice) }) });
      setCode(""); setName(""); setChoice(null);
      changed();
      store.flash(`Custom set ${code.toUpperCase()} created`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the set.");
    }
  };
  const remove = async (set: CustomSet) => {
    if (set.cardCount > 0) return store.flash("Delete or move the cards of the set first", "err");
    if (!(await confirmDialog("Delete custom set", `Delete the custom set ${set.name} (${set.code.toUpperCase()})?`, "Delete set"))) return;
    try {
      await request(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "DELETE" });
      changed();
      store.flash(`${set.name} deleted`);
    } catch (reason) {
      store.fail(reason, "Could not delete the set.");
    }
  };
  const showCards = (set: CustomSet) => {
    store.setFilters({ query: `set:${set.code}` });
    store.setView("cards");
  };
  const reopen = () => customDialog("Custom sets", () => <SetManager store={store} onChange={onChange} onNewCard={onNewCard} />, 760);
  const menu = (set: CustomSet) => rowMenu(store, `${set.name} (${set.code.toUpperCase()})`, () => {
    const mine = set.ownerId === store.user.id;
    return [
      mine && { label: "Edit set...", run: () => editSetDialog(store, set, () => { onChange(); reopen(); }) },
      { label: "Show its cards", run: () => showCards(set) },
      { label: "New card in this set", run: () => onNewCard(set.code) },
      mine && { label: "Delete...", run: () => void remove(set) },
    ];
  });
  return (
    <div className="setmanager">
      {error && <p className="note err">{error}</p>}
      <table className="dtable">
        <thead><tr><th>Symbol</th><th>Code</th><th>Name</th><th>Released</th><th>Cards</th><th>Made by</th></tr></thead>
        <tbody>
          {sets?.length === 0 && <tr><td colSpan={6} className="sub">No custom sets yet</td></tr>}
          {sets?.map((set) => (
            <tr key={set.code} className="csetrow" tabIndex={0} {...menu(set)}
              onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); menu(set).onContextMenu({ preventDefault: () => undefined, clientX: box.left + 40, clientY: box.bottom } as never); } }}
              onDoubleClick={() => { if (set.ownerId === store.user.id) editSetDialog(store, set, () => { onChange(); reopen(); }); }}>
              <td>{set.symbolUrl ? <img className="setsym" src={set.symbolUrl} alt="" /> : <span className="sub">None</span>}</td>
              <td><b>{set.code.toUpperCase()}</b></td>
              <td>{set.name}</td>
              <td>{set.releasedAt}</td>
              <td>{set.cardCount}</td>
              <td>{set.ownerName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>New custom set</h4>
      <div className="prow"><label htmlFor="cs-code">Set code</label><input id="cs-code" value={code} maxLength={6} placeholder="XXX" onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9]/g, ""))} /></div>
      <div className="prow"><label htmlFor="cs-name">Set name</label><input id="cs-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></div>
      <div className="prow"><label htmlFor="cs-date">Release date</label><input id="cs-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      <div className="prow"><label>Set symbol</label><SymbolChooser store={store} current={null} choice={choice} setChoice={setChoice} /></div>
      <div className="btnrow end"><button type="button" className="btn primary" disabled={code.length < 2 || !name.trim()} onClick={() => void create()}>Create set</button></div>
    </div>
  );
}
