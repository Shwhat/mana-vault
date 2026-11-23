// ---------- custom sets (0.20.0): the Custom sets tab of the Proxies view, with the set list, the set's fields, a symbol
// for the set and for each rarity, a sample card and the set's cards; and the right-click menu of a set ----------
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFile, pickFile, request } from "../api";
import { blankFace, hasTransparency, HEIGHT, loadPicture, renderCard, SCALE, WIDTH } from "../card-render";
import { loadCardFonts } from "../card-fonts";
import { type Store, useApp } from "../store";
import { rowMenu } from "./ContextMenu";
import { confirmDialog } from "./Dialog";
import { choices, type Choice, Picker } from "./Picker";
import { redrawSetCards } from "./CardMaker";

export const RARITIES = ["common", "uncommon", "rare", "mythic", "special"] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_NAMES: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", mythic: "Mythic rare", special: "Special" };
const RARITY_CHOICES: Choice[] = choices(RARITIES.map((rarity) => [rarity, RARITY_NAMES[rarity]] as [string, string]));

export type CustomSet = {
  code: string; name: string; releasedAt: string | null; ownerId: number | null; ownerName: string; hasSymbol: boolean; cardCount: number;
  symbolUrl: string | null; symbolType: string | null; rarityColors: boolean;
  /** The common symbol in white with a dark outline, when Rarity colors is on (0.21.0). */
  commonWhite?: boolean;
  /** The symbols of single rarities, used instead of the main symbol on cards of that rarity. */
  rarities: Partial<Record<Rarity, { url: string; type: string }>>;
};
type ScryfallSet = { code: string; name: string; released_at: string | null; symbolUrl: string };
type CardSummary = { id: string; ownerName: string; name: string; setCode: string; collectorNumber: string; rarity: string };

export const blobToData = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("The picture could not be read"));
  reader.readAsDataURL(blob);
});

/** The symbol a card of a rarity uses: the rarity's own, or the set's main symbol (tinted by rarity when the set says so). */
export function symbolFor(set: CustomSet | null, rarity: string): { url: string | null; tint: boolean; commonWhite: boolean } {
  const own = set?.rarities[rarity as Rarity];
  if (own) return { url: own.url, tint: false, commonWhite: false };
  // SVG, PNG and WebP symbols (0.21.0); a picture with no transparent background keeps its colors when drawn
  return { url: set?.symbolUrl ?? null, tint: !!set?.rarityColors && TINTABLE.has(set.symbolType ?? ""), commonWhite: !!set?.commonWhite };
}

/** Symbol pictures that can be drawn in rarity colors (0.21.0). */
export const TINTABLE = new Set(["image/svg+xml", "image/png", "image/webp"]);

// ---------- the tab is opened from other places on a chosen set ----------
let askedSet: string | null = null;
/** Opens the Custom sets tab on a set, or on a new set with "new". */
export function openSetsTab(store: Store, code: string | "new") {
  askedSet = code;
  store.setPrefs({ proxyTab: "sets" });
  store.setView("proxies");
}

/** What the card maker does when it opens next: a new card in a set, or a card. */
export type MakerAsk = { newIn?: string; open?: string };
let makerAsk: MakerAsk | null = null;
export const askMaker = (ask: MakerAsk) => { makerAsk = ask; };
export const takeMakerAsk = () => { const ask = makerAsk; makerAsk = null; return ask; };
export const makerAsked = () => makerAsk !== null;

/** The commands for one custom set, the same in the Custom sets tab and in the card maker's list. */
export function customSetMenuItems(store: Store, set: CustomSet, onChange: () => void, onNewCard: (code: string) => void, onEdit?: () => void) {
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
    mine && { label: "Edit set...", run: onEdit ?? (() => openSetsTab(store, set.code)) },
    { label: "Show its cards", run: () => { store.setFilters({ query: `set:${set.code}` }); store.setView("cards"); } },
    { label: "New card in this set", run: () => onNewCard(set.code) },
    mine && { label: "Delete...", run: () => void remove() },
  ];
}

// ---------- symbols ----------

/** A symbol chosen and not saved yet: a file's data, a Scryfall set's symbol, or removed. Null keeps the saved one. */
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

const symbolBody = (choice: SymbolChoice): Record<string, unknown> =>
  !choice ? {} : "data" in choice ? { symbol: choice.data } : "from" in choice ? { symbolFrom: choice.from } : { symbol: "" };
const choiceUrl = (choice: SymbolChoice, saved: string | null) => (!choice ? saved : "data" in choice ? choice.data : "from" in choice ? choice.url : null);
/** Whether the main symbol can be drawn in rarity colors: SVG, PNG or WebP (0.21.0); Scryfall symbols are SVG. */
const choiceTintable = (choice: SymbolChoice, savedType: string | null) =>
  !choice ? TINTABLE.has(savedType ?? "") : "data" in choice ? /^data:image\/(svg\+xml|png|webp)/.test(choice.data) : "from" in choice;

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
      <div className="symsetgrid" role="list">
        {sets?.map((set) => (
          <button key={set.code} type="button" className="symset" title={`${set.name} (${set.code.toUpperCase()})`} onClick={() => onPick(set)}>
            <img src={set.symbolUrl} alt="" loading="lazy" /><span>{set.name}</span><span className="sub">{set.code.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One symbol row: the symbol shown, Upload..., Scryfall set symbol... and Remove. */
function SymbolRow({ store, label, saved, choice, setChoice, fallback, disabled }: {
  store: Store; label: string; saved: string | null; choice: SymbolChoice; setChoice: (choice: SymbolChoice) => void; fallback: string; disabled: boolean;
}) {
  const [browsing, setBrowsing] = useState(false);
  const shown = choiceUrl(choice, saved);
  return (
    <div className="symrow" role="group" aria-label={`${label} symbol`}>
      <div className="prow"><label>{label}</label>
        <div className="symchoose">
          {shown ? <img className="setsym big" src={shown} alt={`${label} symbol`} /> : <span className="sub">{fallback}</span>}
          <button type="button" className="btn small" disabled={disabled} onClick={() => void uploadSymbol(store).then((data) => { if (data) setChoice({ data }); })}>Upload...</button>
          <button type="button" className={browsing ? "btn small on" : "btn small"} disabled={disabled} aria-expanded={browsing} onClick={() => setBrowsing(!browsing)}>Scryfall set symbol...</button>
          <button type="button" className="btn small" disabled={disabled || !shown} onClick={() => setChoice({ none: true })}>Remove</button>
        </div>
      </div>
      {browsing && <ScryfallSymbols onPick={(set) => { setChoice({ from: set.code, url: set.symbolUrl }); setBrowsing(false); }} />}
    </div>
  );
}

// ---------- the tab ----------

type SetDraft = { code: string; name: string; date: string; rarityColors: boolean; commonWhite: boolean; main: SymbolChoice; rarities: Partial<Record<Rarity, SymbolChoice>> };
const blankDraft = (): SetDraft => ({ code: "", name: "", date: new Date().toISOString().slice(0, 10), rarityColors: true, commonWhite: false, main: null, rarities: {} });
const draftOf = (set: CustomSet): SetDraft => ({ code: set.code.toUpperCase(), name: set.name, date: set.releasedAt ?? "", rarityColors: set.rarityColors, commonWhite: !!set.commonWhite, main: null, rarities: {} });

let lastChosen: string | null = null;

/** Reads a saved symbol as a data address, so a change can be undone. "" when there is none. */
async function savedData(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  const response = await fetchFile(url);
  return response.ok ? blobToData(await response.blob()) : "";
}

export function SetMaker() {
  const store = useApp();
  const [sets, setSets] = useState<CustomSet[] | null>(null);
  const [cards, setCardList] = useState<CardSummary[]>([]);
  const [term, setTerm] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [draft, setDraft] = useState<SetDraft>(blankDraft());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rarity, setRarity] = useState<Rarity>("rare");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [, setFontsReady] = useState(false);
  useEffect(() => { void loadCardFonts().then(setFontsReady); }, []);
  const set = sets?.find((item) => item.code === chosen) ?? null;
  const mine = !set || set.ownerId === store.user.id;

  const load = useCallback(async () => {
    try {
      const [list, cardList] = await Promise.all([request<CustomSet[]>("/api/custom/sets"), request<CardSummary[]>("/api/custom/cards")]);
      setSets(list);
      setCardList(cardList);
      return list;
    } catch (reason) {
      store.fail(reason, "Could not load the custom sets.");
      return null;
    }
  }, [store]);

  // the set asked for, the set chosen last, or your first set
  useEffect(() => {
    void load().then((list) => {
      if (!list) return;
      const ask = askedSet;
      askedSet = null;
      if (ask === "new") return startNew(true);
      const pick = list.find((item) => item.code === ask) ?? list.find((item) => item.code === lastChosen) ?? list.find((item) => item.ownerId === store.user.id) ?? list[0];
      if (pick) choose(pick, true);
      else startNew(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmLeave = async () => !dirty || confirmDialog("Unsaved changes", "Leave this set without saving the changes?", "Leave");
  const choose = (item: CustomSet, quiet = false) => {
    void (quiet ? Promise.resolve(true) : confirmLeave()).then((ok) => {
      if (!ok) return;
      setChosen(item.code);
      lastChosen = item.code;
      setDraft(draftOf(item));
      setDirty(false);
      setError("");
    });
  };
  function startNew(quiet = false) {
    void (quiet ? Promise.resolve(true) : confirmLeave()).then((ok) => {
      if (!ok) return;
      setChosen(null);
      setDraft(blankDraft());
      setDirty(false);
      setError("");
    });
  }
  const change = (patch: Partial<SetDraft>) => { setDraft((value) => ({ ...value, ...patch })); setDirty(true); };
  const changeRarity = (which: Rarity, choice: SymbolChoice) => change({ rarities: { ...draft.rarities, [which]: choice } });

  // what each rarity shows now, with the changes not saved yet
  const mainUrl = choiceUrl(draft.main, set?.symbolUrl ?? null);
  const mainTintable = choiceTintable(draft.main, set?.symbolType ?? null);
  const rarityUrl = (which: Rarity) => choiceUrl(draft.rarities[which] ?? null, set?.rarities[which]?.url ?? null);

  // the sample card, drawn again after every change
  const [picture, setPicture] = useState<{ url: string | null; image: HTMLImageElement | null }>({ url: null, image: null });
  const previewUrl = rarityUrl(rarity) ?? mainUrl;
  const tint = !rarityUrl(rarity) && draft.rarityColors && mainTintable;
  // a main picture with no transparent background keeps its own colors (0.21.0)
  const [mainOpaque, setMainOpaque] = useState(false);
  useEffect(() => {
    let active = true;
    setMainOpaque(false);
    if (!mainUrl) return;
    const source = mainUrl.startsWith("data:") ? Promise.resolve(mainUrl) : fetchFile(mainUrl).then((response) => (response.ok ? response.blob() : null));
    void source.then((data) => (data ? loadPicture(data) : null)).then((image) => { if (active && image) setMainOpaque(!hasTransparency(image)); }).catch(() => undefined);
    return () => { active = false; };
  }, [mainUrl]);
  useEffect(() => {
    let active = true;
    if (!previewUrl) { setPicture({ url: null, image: null }); return; }
    const source = previewUrl.startsWith("data:") ? Promise.resolve(previewUrl) : fetchFile(previewUrl).then((response) => (response.ok ? response.blob() : null));
    void source.then((data) => (data ? loadPicture(data) : null)).then((image) => { if (active) setPicture({ url: previewUrl, image }); });
    return () => { active = false; };
  }, [previewUrl]);
  useEffect(() => {
    if (!canvas.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (!canvas.current) return;
      const face = { ...blankFace(), name: draft.name ? `${draft.name} sample` : "Sample card", typeLine: "Creature", rulesText: `A ${RARITY_NAMES[rarity].toLowerCase()} card of this set.`, power: "2", toughness: "2" };
      renderCard(canvas.current, face, { rarity, artist: "", setCode: draft.code || "XXX", collectorNumber: "1", back: false, face: "front" },
        { art: null, splitArt: null, setSymbol: picture.url === previewUrl ? picture.image : null, symbols: new Map(), setSymbolTint: tint, commonWhite: draft.commonWhite });
    });
    return () => window.cancelAnimationFrame(frame);
  });

  const save = async () => {
    setError("");
    setBusy(true);
    const code = draft.code.toLowerCase();
    const rarityBody = Object.fromEntries(Object.entries(draft.rarities).filter(([, choice]) => choice).map(([which, choice]) => [which, symbolBody(choice!)]));
    const hasRarities = Object.keys(rarityBody).length > 0;
    try {
      if (!set) {
        const create = { code, name: draft.name, releasedAt: draft.date, ...symbolBody(draft.main) };
        const finish = async () => {
          await request("/api/custom/sets", { method: "POST", body: JSON.stringify(create) });
          await request(`/api/custom/sets/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify({ rarityColors: draft.rarityColors, commonWhite: draft.commonWhite, ...(hasRarities ? { rarities: rarityBody } : {}) }) });
        };
        await finish();
        store.pushUndo({
          label: `New set ${draft.name}`,
          undo: async () => { await request(`/api/custom/sets/${encodeURIComponent(code)}`, { method: "DELETE" }); await load(); },
          redo: async () => { await finish(); await load(); },
        });
        store.flash(`Custom set ${code.toUpperCase()} created`);
      } else {
        // what the set was, so the change can be undone
        const before: Record<string, unknown> = { name: set.name, code: set.code, rarityColors: set.rarityColors, commonWhite: !!set.commonWhite, ...(set.releasedAt ? { releasedAt: set.releasedAt } : {}) };
        if (draft.main) before.symbol = await savedData(set.symbolUrl);
        if (hasRarities) {
          before.rarities = Object.fromEntries(await Promise.all(Object.keys(rarityBody).map(async (which) => [which, { symbol: await savedData(set.rarities[which as Rarity]?.url) }] as const)));
        }
        const body: Record<string, unknown> = { name: draft.name, code, releasedAt: draft.date || undefined, rarityColors: draft.rarityColors, commonWhite: draft.commonWhite, ...symbolBody(draft.main), ...(hasRarities ? { rarities: rarityBody } : {}) };
        const saved = await request<CustomSet>(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "PATCH", body: JSON.stringify(body) });
        store.pushUndo({
          label: `Edit set ${set.name}`,
          undo: async () => { await request(`/api/custom/sets/${encodeURIComponent(saved.code)}`, { method: "PATCH", body: JSON.stringify(before) }); await reloadOn(set.code); },
          redo: async () => { await request(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "PATCH", body: JSON.stringify({ ...body, code: saved.code }) }); await reloadOn(saved.code); },
        });
        store.flash(`${saved.name} (${saved.code.toUpperCase()}) saved`);
        // the saved pictures of the set's cards are drawn again with the new symbol colors (0.21.0)
        if ((set.rarityColors !== draft.rarityColors || !!set.commonWhite !== draft.commonWhite || draft.main) && set.cardCount > 0) {
          const count = await redrawSetCards(store, saved.code);
          if (count) store.flash(`${saved.name} saved; ${count} ${count === 1 ? "card picture" : "card pictures"} drawn again`);
        }
      }
      await reloadOn(code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the set.");
    } finally {
      setBusy(false);
    }
  };
  /** Loads the lists again and shows a set as saved. */
  const reloadOn = async (code: string) => {
    const list = await load();
    const item = list?.find((entry) => entry.code === code);
    if (item) {
      setChosen(item.code);
      lastChosen = item.code;
      setDraft(draftOf(item));
      setDirty(false);
    }
  };

  const newCard = (code: string) => {
    void confirmLeave().then((ok) => {
      if (!ok) return;
      askMaker({ newIn: code });
      store.setPrefs({ proxyTab: "maker" });
    });
  };
  const openCard = (id: string) => {
    void confirmLeave().then((ok) => {
      if (!ok) return;
      askMaker({ open: id });
      store.setPrefs({ proxyTab: "maker" });
    });
  };

  const words = term.trim().toLowerCase();
  const shown = (sets ?? []).filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(words));
  const setCards = cards.filter((card) => card.setCode === chosen).sort((a, b) => a.collectorNumber.localeCompare(b.collectorNumber, undefined, { numeric: true }));
  const menu = (item: CustomSet) => rowMenu(store, `${item.name} (${item.code.toUpperCase()})`, () => customSetMenuItems(store, item, () => void load().then((list) => {
    if (list && !list.some((entry) => entry.code === chosen)) startNew(true);
  }), newCard, () => { if (item.code !== chosen) choose(item); }));

  return (
    <div className="makerbody setmaker">
      <section className="makerlist" aria-label="Custom sets">
        <div className="navbar">
          <input className="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a custom set" aria-label="Find a custom set" />
          <button type="button" className="btn small" onClick={() => startNew()}>New set</button>
        </div>
        {sets === null && <p className="note pad">Loading custom sets</p>}
        {sets?.length === 0 && <p className="note pad">No custom sets yet</p>}
        {shown.map((item) => (
          <div key={item.code} role="button" tabIndex={0} className={item.code === chosen ? "navitem colitem active" : "navitem colitem"} {...menu(item)}
            onClick={() => { if (item.code !== chosen) choose(item); }}
            onKeyDown={(event) => { if (event.key === "Enter") choose(item); }}>
            <span className="colline">{item.symbolUrl && <img className="setsym" src={item.symbolUrl} alt="" />}<span className="nl">{item.name}</span><span className="badge">{item.code.toUpperCase()}</span></span>
            <span className="colline sub"><span className="cnt">{item.cardCount} {item.cardCount === 1 ? "card" : "cards"}, by {item.ownerName}</span></span>
          </div>
        ))}
      </section>

      <section className="makerform" aria-label="Set fields">
        {!mine && <p className="note">Made by {set?.ownerName || "another account"}. Only its maker can change it.</p>}
        <div className="btnrow">
          <button type="button" className="btn primary" disabled={!mine || busy || draft.code.length < 2 || !draft.name.trim()} onClick={() => void save()}>{set ? "Save" : "Create set"}</button>
          {set && <button type="button" className="btn small" onClick={() => newCard(set.code)}>New card in this set</button>}
        </div>
        {dirty && <p className="note">Not saved yet</p>}
        {error && <p className="note err">{error}</p>}

        <h4>Set</h4>
        <div className="prow"><label htmlFor="sm-name">Name</label>
          <input id="sm-name" value={draft.name} maxLength={100} disabled={!mine} onChange={(event) => change({ name: event.target.value })} /></div>
        <div className="prow"><label htmlFor="sm-code">Code</label>
          <input id="sm-code" value={draft.code} maxLength={6} placeholder="XXX" disabled={!mine} onChange={(event) => change({ code: event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() })} /></div>
        {set && draft.code.toLowerCase() !== set.code && set.cardCount > 0 && <p className="note">The {set.cardCount} {set.cardCount === 1 ? "card" : "cards"} of the set move to the new code.</p>}
        <div className="prow"><label htmlFor="sm-date">Release date</label>
          <input id="sm-date" type="date" value={draft.date} disabled={!mine} onChange={(event) => change({ date: event.target.value })} /></div>
        <label className="ck"><input type="checkbox" checked={draft.rarityColors} disabled={!mine} onChange={(event) => change({ rarityColors: event.target.checked })} /> Rarity colors (a one-color SVG, PNG or WebP main symbol)</label>
        {draft.rarityColors && (
          <div className="prow"><label htmlFor="sm-common">Common symbol</label>
            <Picker id="sm-common" label="Common symbol" value={draft.commonWhite ? "white" : "black"} options={choices([["black", "Black"], ["white", "White"]])} disabled={!mine}
              onChange={(value) => change({ commonWhite: value === "white" })} /></div>
        )}
        {draft.rarityColors && mainUrl && mainOpaque && <p className="note">This picture has no transparent background, so it keeps its own colors.</p>}

        <h4>Symbols</h4>
        <SymbolRow store={store} label="Main" saved={set?.symbolUrl ?? null} choice={draft.main} setChoice={(main) => change({ main, ...(main ? { rarityColors: true } : {}) })} fallback="No symbol" disabled={!mine} />
        {RARITIES.map((which) => (
          <SymbolRow key={which} store={store} label={RARITY_NAMES[which]} saved={set?.rarities[which]?.url ?? null} choice={draft.rarities[which] ?? null}
            setChoice={(choice) => changeRarity(which, choice)} fallback="Uses the main symbol" disabled={!mine} />
        ))}

        {set && (
          <>
            <h4>Cards in the set</h4>
            {!setCards.length && <p className="note">No cards in this set yet</p>}
            {setCards.length > 0 && (
              <table className="dtable setcards">
                <thead><tr><th>Number</th><th>Name</th><th>Rarity</th><th>Made by</th></tr></thead>
                <tbody>
                  {setCards.map((card) => (
                    <tr key={card.id} tabIndex={0} title="Double-click to open it in the card maker" onDoubleClick={() => openCard(card.id)}
                      onKeyDown={(event) => { if (event.key === "Enter") openCard(card.id); }}>
                      <td>{card.collectorNumber}</td><td>{card.name}</td><td>{RARITY_NAMES[card.rarity as Rarity] ?? card.rarity}</td><td>{card.ownerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <section className="makerpreview" aria-label="Sample card">
        <div className="prow"><label htmlFor="sm-rarity">Rarity</label>
          <Picker id="sm-rarity" label="Rarity of the sample card" value={rarity} options={RARITY_CHOICES} onChange={(value) => setRarity(value as Rarity)} /></div>
        <canvas ref={canvas} className="cardcanvas" width={WIDTH * SCALE} height={HEIGHT * SCALE} role="img" aria-label={`Sample ${RARITY_NAMES[rarity].toLowerCase()} card`} />
      </section>
    </div>
  );
}
