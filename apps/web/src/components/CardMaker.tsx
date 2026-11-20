// ---------- the card maker: custom cards with a live preview, saved to the card database for every account ----------
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob, fetchFile, pickFile, request, slugify } from "../api";
import {
  type Assets, blankFace, type CardKind, type FaceDesign, type Frame, frameName, FRAMES, HEIGHT, loadPicture, renderCard, SCALE, symbolFile, symbolsIn, WIDTH,
} from "../card-render";
import { Icon } from "../icons";
import { type Store, useApp } from "../store";
import { type Card, FORMATS, formatName } from "../types";
import { confirmDialog, customDialog } from "./Dialog";
import { choices, type Choice, Picker } from "./Picker";

export type CustomSet = {
  code: string; name: string; releasedAt: string | null; ownerId: number | null; ownerName: string; hasSymbol: boolean; cardCount: number; symbolUrl: string | null;
};
export type CustomCardSummary = {
  id: string; ownerId: number | null; ownerName: string; updatedAt: string; name: string; setCode: string; setName: string; collectorNumber: string;
  rarity: string; typeLine: string; imageUrl: string; hasBack: boolean;
};
type CustomCardDetail = { id: string; ownerId: number | null; ownerName: string; design: Partial<Draft>; version: number; artUrl: string | null; backArtUrl: string | null;
  use: { others: number; copies: number; deckCards: number } };

/** Everything the card maker edits, saved as the card's design. */
type Draft = {
  front: FaceDesign; back: FaceDesign | null; setCode: string; collectorNumber: string; rarity: string; artist: string; finishes: string[];
  priceUsd: string; priceEur: string; legal: string[]; colorsAuto: boolean; colors: string[]; identityAuto: boolean; identity: string[];
  tokens: Array<{ id: string; name: string }>;
};
/** The art of a face: the picture shown, its data to upload, and whether it changed since the last save. */
type Art = { image: HTMLImageElement | null; data: string | null; changed: boolean };

const KIND_CHOICES: Choice[] = choices([["normal", "Normal"], ["creature", "Creature"], ["planeswalker", "Planeswalker"], ["saga", "Saga"], ["token", "Token"]]);
const FRAME_CHOICES: Choice[] = FRAMES.map((frame) => ({ value: frame, label: frameName(frame), group: frame.length === 2 ? "Hybrid" : undefined }));
const RARITY_CHOICES: Choice[] = choices([["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"], ["mythic", "Mythic rare"], ["special", "Special"]]);
const COLORS = ["W", "U", "B", "R", "G"] as const;
const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const FINISH_NAMES: Array<[string, string]> = [["nonfoil", "Regular"], ["foil", "Foil"], ["etched", "Etched"]];
const LEGAL_FORMATS = FORMATS.filter((format) => format !== "casual");
const BASIC_SYMBOLS = ["W", "U", "B", "R", "G", "C", "X", "S", "T", "Q"];
const GENERIC = Array.from({ length: 21 }, (_, number) => String(number));
const HYBRID = ["W/U", "W/B", "U/B", "U/R", "B/R", "B/G", "R/G", "R/W", "G/W", "G/U", "2/W", "2/U", "2/B", "2/R", "2/G"];
const PHYREXIAN = ["W/P", "U/P", "B/P", "R/P", "G/P"];

const newDraft = (setCode = ""): Draft => ({
  front: blankFace(), back: null, setCode, collectorNumber: "1", rarity: "common", artist: "", finishes: ["nonfoil"], priceUsd: "", priceEur: "",
  legal: [], colorsAuto: true, colors: [], identityAuto: true, identity: [], tokens: [],
});
const noArt = (): Art => ({ image: null, data: null, changed: false });

// ---------- pictures: mana symbols and set symbols are loaded once ----------
const symbolCache = new Map<string, Promise<HTMLImageElement | null>>();
function symbolPicture(code: string): Promise<HTMLImageElement | null> {
  const file = symbolFile(code);
  let promise = symbolCache.get(file);
  if (!promise) {
    promise = fetchFile(`/api/symbols/${encodeURIComponent(code.toUpperCase())}`)
      .then(async (response) => (response.ok ? loadPicture(await response.blob()) : null))
      .catch(() => null);
    symbolCache.set(file, promise);
  }
  return promise;
}
const setSymbolCache = new Map<string, Promise<HTMLImageElement | null>>();
function setSymbolPicture(url: string): Promise<HTMLImageElement | null> {
  let promise = setSymbolCache.get(url);
  if (!promise) {
    promise = fetchFile(url).then(async (response) => (response.ok ? loadPicture(await response.blob()) : null)).catch(() => null);
    setSymbolCache.set(url, promise);
  }
  return promise;
}
const blobToData = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("The picture could not be read"));
  reader.readAsDataURL(blob);
});

/** The card data sent to the server from the card maker's fields. */
function cardData(draft: Draft) {
  const face = (design: FaceDesign) => ({
    name: design.name.trim(), manaCost: design.manaCost.trim(), typeLine: design.typeLine.trim(), oracleText: design.rulesText.trim(),
    power: design.power.trim(), toughness: design.toughness.trim(), loyalty: design.loyalty.trim(),
  });
  return {
    setCode: draft.setCode, collectorNumber: draft.collectorNumber.trim(), rarity: draft.rarity, artist: draft.artist.trim(), finishes: draft.finishes,
    front: face(draft.front), back: draft.back ? face(draft.back) : null,
    colors: draft.colorsAuto ? null : draft.colors, colorIdentity: draft.identityAuto ? null : draft.identity,
    legalities: Object.fromEntries(draft.legal.map((format) => [format, "legal"])),
    price: { usd: draft.priceUsd.trim() ? Number(draft.priceUsd) : null, eur: draft.priceEur.trim() ? Number(draft.priceEur) : null },
    tokens: draft.tokens, flavorText: draft.front.flavorText.trim(),
  };
}

/** Renders one face to a JPEG data address at full size, for saving. */
function pictureData(face: FaceDesign, info: Parameters<typeof renderCard>[2], assets: Assets): string {
  const canvas = document.createElement("canvas");
  renderCard(canvas, face, info, assets);
  return canvas.toDataURL("image/jpeg", 0.9);
}

// ---------- custom sets ----------
function SetManager({ store, onChange }: { store: Store; onChange: () => void }) {
  const [sets, setSets] = useState<CustomSet[] | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [symbol, setSymbol] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => setSets(await request<CustomSet[]>("/api/custom/sets")), []);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the sets.")); }, [load]);
  const pickSymbol = async (apply: (data: string) => void) => {
    const file = await pickFile("image/png,image/jpeg,image/webp");
    if (!file) return;
    if (file.size > 512 * 1024) return setError("A set symbol can be up to 512 KB");
    apply(await blobToData(file));
  };
  const create = async () => {
    setError("");
    try {
      await request("/api/custom/sets", { method: "POST", body: JSON.stringify({ code, name, releasedAt: date, symbol }) });
      setCode(""); setName(""); setSymbol(null);
      await load();
      onChange();
      store.flash(`Custom set ${code.toUpperCase()} created`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the set.");
    }
  };
  const change = async (set: CustomSet, body: Record<string, unknown>, done: string) => {
    setError("");
    try {
      await request(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "PATCH", body: JSON.stringify(body) });
      setSymbolCache.clear();
      await load();
      onChange();
      store.flash(done);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change the set.");
    }
  };
  const remove = async (set: CustomSet) => {
    if (!(await confirmDialog("Delete custom set", `Delete the custom set ${set.name} (${set.code.toUpperCase()})?`, "Delete set"))) return;
    try {
      await request(`/api/custom/sets/${encodeURIComponent(set.code)}`, { method: "DELETE" });
      await load();
      onChange();
      store.flash(`${set.name} deleted`);
    } catch (reason) {
      store.fail(reason, "Could not delete the set.");
    }
  };
  return (
    <div className="setmanager">
      {error && <p className="note err">{error}</p>}
      <table className="dtable">
        <thead><tr><th>Code</th><th>Name</th><th>Released</th><th>Cards</th><th>Made by</th><th /></tr></thead>
        <tbody>
          {sets?.length === 0 && <tr><td colSpan={6} className="sub">No custom sets yet</td></tr>}
          {sets?.map((set) => {
            const mine = set.ownerId === store.user.id;
            return (
              <tr key={set.code}>
                <td><b>{set.code.toUpperCase()}</b></td>
                <td>{mine ? <input aria-label={`Name of ${set.code.toUpperCase()}`} defaultValue={set.name}
                  onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== set.name) void change(set, { name: event.target.value }, "Set renamed"); }} /> : set.name}</td>
                <td>{mine ? <input type="date" aria-label={`Release date of ${set.code.toUpperCase()}`} defaultValue={set.releasedAt ?? ""}
                  onBlur={(event) => { if (event.target.value && event.target.value !== set.releasedAt) void change(set, { releasedAt: event.target.value }, "Release date changed"); }} /> : set.releasedAt}</td>
                <td>{set.cardCount}</td>
                <td>{set.ownerName}</td>
                <td className="btnrow">{mine && <>
                  <button type="button" className="btn small" onClick={() => void pickSymbol((data) => void change(set, { symbol: data }, "Set symbol changed"))}>{set.hasSymbol ? "Change symbol..." : "Add symbol..."}</button>
                  <button type="button" className="btn small" disabled={set.cardCount > 0} title={set.cardCount ? "Delete or move its cards first" : undefined} onClick={() => void remove(set)}>Delete</button>
                </>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h4>New custom set</h4>
      <div className="prow"><label htmlFor="cs-code">Set code</label><input id="cs-code" value={code} maxLength={6} placeholder="XXX" onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9]/g, ""))} /></div>
      <div className="prow"><label htmlFor="cs-name">Set name</label><input id="cs-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></div>
      <div className="prow"><label htmlFor="cs-date">Release date</label><input id="cs-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      <div className="prow"><label>Set symbol</label>
        <span className="btnrow"><button type="button" className="btn small" onClick={() => void pickSymbol(setSymbol)}>{symbol ? "Change..." : "Choose picture..."}</button>
          {symbol && <img className="setsym" src={symbol} alt="Set symbol" />}</span></div>
      <div className="btnrow end"><button type="button" className="btn primary" disabled={code.length < 2 || !name.trim()} onClick={() => void create()}>Create set</button></div>
    </div>
  );
}

/** Chooses the art of any card in the card database. */
function ArtSearch({ onPick }: { onPick: (card: Card) => void }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const run = async () => {
    setError("");
    try {
      setResults(await request<Card[]>(`/api/cards?q=${encodeURIComponent(term.trim())}&limit=24`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not search.");
    }
  };
  return (
    <div className="artsearch">
      <label className="searchbox"><Icon name="find" className="nicon" />
        <input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void run(); }}
          placeholder="Find a card (Enter)" aria-label="Find a card for its art" /></label>
      {error && <p className="note err">{error}</p>}
      <div className="artgrid">
        {results?.length === 0 && <p className="note pad">No matching cards</p>}
        {results?.map((card) => (
          <button key={card.id} type="button" className="artpick" onClick={() => onPick(card)} title={`${card.name} (${card.set_code.toUpperCase()}) ${card.collector_number}`}>
            {card.image_url ? <img src={card.image_url} alt={card.name} loading="lazy" /> : <span>{card.name}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Adds tokens the card makes, found in the card database. */
function TokenPicker({ value, onChange, disabled }: { value: Draft["tokens"]; onChange: (tokens: Draft["tokens"]) => void; disabled: boolean }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const run = async () => {
    if (!term.trim()) return setResults([]);
    try {
      setResults(await request<Card[]>(`/api/cards?q=${encodeURIComponent(`t:token ${term.trim()}`)}&limit=8`));
    } catch {
      setResults([]);
    }
  };
  return (
    <div className="tokenpick">
      <div className="chips">{value.map((token) => (
        <span key={token.id} className="chip">{token.name}
          {!disabled && <button type="button" className="lnk" aria-label={`Remove ${token.name}`} onClick={() => onChange(value.filter((item) => item.id !== token.id))}>x</button>}</span>
      ))}</div>
      {!disabled && <input value={term} placeholder="Find a token (Enter)" aria-label="Find a token the card makes"
        onChange={(event) => setTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void run(); } }} />}
      {results.length > 0 && (
        <div className="tokresults">{results.map((card) => (
          <button key={card.id} type="button" className="btn small" onClick={() => { onChange([...value.filter((item) => item.id !== card.id), { id: card.id, name: card.name }]); setResults([]); setTerm(""); }}>
            + {card.name} ({card.set_code.toUpperCase()})</button>
        ))}</div>
      )}
    </div>
  );
}

/** The card being made stays while other views are used, saved or not. */
let memory: { id: string | null; ownerId: number | null; draft: Draft; arts: { front: Art; back: Art }; face: "front" | "back"; dirty: boolean } | null = null;

// ---------- the editor ----------
export function CardMaker() {
  const store = useApp();
  const [cards, setCards] = useState<CustomCardSummary[] | null>(null);
  const [sets, setSets] = useState<CustomSet[]>([]);
  const [term, setTerm] = useState("");
  const [id, setId] = useState<string | null>(memory?.id ?? null);
  const [ownerId, setOwnerId] = useState<number | null>(memory?.ownerId ?? null);
  const [draft, setDraft] = useState<Draft>(memory?.draft ?? newDraft());
  const [arts, setArts] = useState<{ front: Art; back: Art }>(memory?.arts ?? { front: noArt(), back: noArt() });
  const [face, setFace] = useState<"front" | "back">(memory?.face ?? "front");
  const [symbols, setSymbols] = useState<Map<string, HTMLImageElement | null>>(new Map());
  const [setSymbol, setSetSymbol] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(memory?.dirty ?? false);
  useEffect(() => { memory = { id, ownerId, draft, arts, face, dirty }; }, [id, ownerId, draft, arts, face, dirty]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const drag = useRef<{ x: number; y: number; art: FaceDesign["art"] } | null>(null);
  const mine = id === null || ownerId === store.user.id;
  const current = face === "back" && draft.back ? draft.back : draft.front;

  const loadLists = useCallback(async () => {
    try {
      const [cardList, setList] = await Promise.all([request<CustomCardSummary[]>("/api/custom/cards"), request<CustomSet[]>("/api/custom/sets")]);
      setCards(cardList);
      setSets(setList);
      setDraft((value) => (value.setCode || !setList.length ? value : { ...value, setCode: setList.find((set) => set.ownerId === store.user.id)?.code ?? setList[0]!.code }));
    } catch (reason) {
      store.fail(reason, "Could not load the custom cards.");
    }
  }, [store]);
  useEffect(() => { void loadLists(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // mana symbols used on the card are loaded as they appear
  const codes = useMemo(() => [...new Set([draft.front, draft.back].flatMap((item) => (item ? [...symbolsIn(item.manaCost), ...symbolsIn(item.rulesText)] : [])))], [draft]);
  useEffect(() => {
    let active = true;
    const missing = codes.filter((code) => !symbols.has(symbolFile(code)));
    if (!missing.length) return;
    void Promise.all(missing.map(async (code) => [symbolFile(code), await symbolPicture(code)] as const)).then((loaded) => {
      if (!active) return;
      setSymbols((map) => {
        const next = new Map(map);
        for (const [file, picture] of loaded) next.set(file, picture);
        return next;
      });
    });
    return () => { active = false; };
  }, [codes, symbols]);
  const set = sets.find((item) => item.code === draft.setCode) ?? null;
  useEffect(() => {
    let active = true;
    if (!set?.symbolUrl) { setSetSymbol(null); return; }
    void setSymbolPicture(`${set.symbolUrl}?n=${set.hasSymbol ? 1 : 0}`).then((picture) => { if (active) setSetSymbol(picture); });
    return () => { active = false; };
  }, [set?.symbolUrl, set?.hasSymbol]);

  const info = (which: "front" | "back") => ({ rarity: draft.rarity, artist: draft.artist, setCode: draft.setCode || "XXX", collectorNumber: draft.collectorNumber, back: !!draft.back, face: which });
  const assets = (which: "front" | "back"): Assets => ({ art: arts[which].image, setSymbol, symbols });

  // the preview is drawn again after every change
  useEffect(() => {
    if (!canvas.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (canvas.current) renderCard(canvas.current, current, info(face), assets(face));
    });
    return () => window.cancelAnimationFrame(frame);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch: Partial<Draft>) => { setDraft((value) => ({ ...value, ...patch })); setDirty(true); };
  const changeFace = (patch: Partial<FaceDesign>) => {
    setDraft((value) => (face === "back" && value.back ? { ...value, back: { ...value.back, ...patch } } : { ...value, front: { ...value.front, ...patch } }));
    setDirty(true);
  };

  /** Puts a symbol code at the cursor of the mana cost or rules text field used last. */
  const insertSymbol = (code: string) => {
    const field = lastField.current;
    const text = `{${code}}`;
    const key = field?.dataset.field === "rulesText" ? "rulesText" : "manaCost";
    const value = current[key];
    const start = field && field.dataset.field === key ? field.selectionStart ?? value.length : value.length;
    const end = field && field.dataset.field === key ? field.selectionEnd ?? value.length : value.length;
    changeFace({ [key]: value.slice(0, start) + text + value.slice(end) } as Partial<FaceDesign>);
    window.setTimeout(() => {
      if (field && field.dataset.field === key) {
        field.focus();
        field.setSelectionRange(start + text.length, start + text.length);
      }
    }, 0);
  };

  const nextNumber = (code: string, except: string | null) => {
    const used = (cards ?? []).filter((card) => card.setCode === code && card.id !== except).map((card) => Number.parseInt(card.collectorNumber, 10)).filter(Number.isFinite);
    return String(used.length ? Math.max(...used) + 1 : 1);
  };

  const confirmLeave = async () => !dirty || confirmDialog("Unsaved changes", "Leave this card without saving the changes?", "Leave");

  const startNew = async () => {
    if (!(await confirmLeave())) return;
    const code = draft.setCode || sets[0]?.code || "";
    setId(null); setOwnerId(store.user.id); setFace("front");
    setDraft({ ...newDraft(code), collectorNumber: nextNumber(code, null) });
    setArts({ front: noArt(), back: noArt() });
    setDirty(false);
  };

  const open = async (summary: CustomCardSummary) => {
    if (!(await confirmLeave())) return;
    try {
      const detail = await request<CustomCardDetail>(`/api/custom/cards/${encodeURIComponent(summary.id)}`);
      const base = newDraft(summary.setCode);
      const design = detail.design ?? {};
      const loaded: Draft = {
        ...base, ...design, setCode: summary.setCode, collectorNumber: summary.collectorNumber,
        front: { ...blankFace(), ...(design.front ?? {}) }, back: design.back ? { ...blankFace(), ...design.back } : null,
      };
      const artOf = async (url: string | null): Promise<Art> => {
        if (!url) return noArt();
        const response = await fetchFile(url);
        if (!response.ok) return noArt();
        const blob = await response.blob();
        return { image: await loadPicture(blob), data: await blobToData(blob), changed: false };
      };
      const [front, back] = await Promise.all([artOf(detail.artUrl), artOf(detail.backArtUrl)]);
      setId(detail.id); setOwnerId(detail.ownerId); setFace("front");
      setDraft(loaded);
      setArts({ front, back });
      setDirty(false);
    } catch (reason) {
      store.fail(reason, "Could not open the custom card.");
    }
  };

  const duplicate = () => {
    setId(null); setOwnerId(store.user.id);
    setDraft((value) => ({ ...value, front: { ...value.front, name: value.front.name ? `${value.front.name} (copy)` : "" }, collectorNumber: nextNumber(value.setCode, null) }));
    setArts((value) => ({ front: { ...value.front, changed: !!value.front.data }, back: { ...value.back, changed: !!value.back.data } }));
    setDirty(true);
    store.flash("Copy made, not saved yet");
  };

  const save = async () => {
    if (!draft.setCode) return store.flash("Create a custom set first (Custom sets...)", "err");
    if (!draft.front.name.trim()) return store.flash("Give the card a name", "err");
    if (!draft.front.typeLine.trim()) return store.flash("Give the card a type line", "err");
    if (draft.back && !draft.back.name.trim()) return store.flash("Give the back face a name", "err");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        card: cardData(draft), design: draft,
        picture: pictureData(draft.front, info("front"), assets("front")),
        backPicture: draft.back ? pictureData(draft.back, info("back"), assets("back")) : null,
      };
      if (arts.front.changed) body.art = arts.front.data;
      if (arts.back.changed) body.backArt = arts.back.data;
      const saved = id
        ? await request<CustomCardSummary>(`/api/custom/cards/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) })
        : await request<CustomCardSummary>("/api/custom/cards", { method: "POST", body: JSON.stringify(body) });
      setId(saved.id); setOwnerId(saved.ownerId);
      setArts((value) => ({ front: { ...value.front, changed: false }, back: { ...value.back, changed: false } }));
      setDirty(false);
      store.flash(`${saved.name} saved to the card database`);
      await loadLists();
      await store.refreshAfterChange();
    } catch (reason) {
      store.fail(reason, "Could not save the card.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    try {
      const detail = await request<CustomCardDetail>(`/api/custom/cards/${encodeURIComponent(id)}`);
      if (detail.use.others > 0) return store.flash("Other accounts have this card in a collection, deck or trade, so it cannot be deleted", "err");
      const extra = detail.use.copies || detail.use.deckCards
        ? ` Your ${detail.use.copies} ${detail.use.copies === 1 ? "copy" : "copies"} in collections and ${detail.use.deckCards} ${detail.use.deckCards === 1 ? "card" : "cards"} in decks are removed too.` : "";
      if (!(await confirmDialog("Delete custom card", `Delete ${draft.front.name} from the card database?${extra} This cannot be undone.`, "Delete card"))) return;
      await request(`/api/custom/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
      store.flash(`${draft.front.name} deleted`);
      setId(null); setOwnerId(null);
      setDraft(newDraft(draft.setCode));
      setArts({ front: noArt(), back: noArt() });
      setDirty(false);
      await loadLists();
      await store.refreshAfterChange();
    } catch (reason) {
      store.fail(reason, "Could not delete the card.");
    }
  };

  const exportPng = () => {
    const output = document.createElement("canvas");
    renderCard(output, current, info(face), assets(face));
    output.toBlob((blob) => { if (blob) downloadBlob(`${slugify(current.name || "custom-card")}${face === "back" ? "-back" : ""}.png`, blob); }, "image/png");
  };

  const setArt = (which: "front" | "back", data: string | null, image: HTMLImageElement | null) => {
    setArts((value) => ({ ...value, [which]: { image, data, changed: true } }));
    changeFace({ art: { x: 0, y: 0, zoom: 1 } });
  };
  const uploadArt = async () => {
    const file = await pickFile("image/jpeg,image/png,image/webp");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return store.flash("Art can be up to 10 MB", "err");
    const data = await blobToData(file);
    setArt(face, data, await loadPicture(data));
  };
  const artFromCard = () => customDialog("Use the art of a card", (close) => (
    <ArtSearch onPick={(card) => {
      close();
      void (async () => {
        const response = await fetchFile(`/api/card-images/${encodeURIComponent(card.id)}?size=art_crop`);
        if (!response.ok) return store.flash("The art of that card could not be downloaded", "err");
        const blob = await response.blob();
        setArt(face, await blobToData(blob), await loadPicture(blob));
        if (!draft.artist && "artist" in card && typeof (card as { artist?: unknown }).artist === "string") change({ artist: String((card as { artist?: string }).artist) });
      })();
    }} />
  ), 720, "Cancel");

  // dragging in the art box moves the art
  const artBox = () => ({ x: 58, y: 126, w: WIDTH - 116, h: current.kind === "token" ? 520 : 438 });
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!mine || !arts[face].image) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const box = artBox();
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, art: current.art };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const box = artBox();
    const dx = ((event.clientX - drag.current.x) / rect.width) * WIDTH / box.w;
    const dy = ((event.clientY - drag.current.y) / rect.height) * HEIGHT / box.h;
    changeFace({ art: { ...drag.current.art, x: drag.current.art.x + dx, y: drag.current.art.y + dy } });
  };
  const pointerUp = () => { drag.current = null; };

  const words = term.trim().toLowerCase();
  const shown = (cards ?? []).filter((card) => `${card.name} ${card.setCode} ${card.typeLine}`.toLowerCase().includes(words));
  const textField = (key: "name" | "manaCost" | "typeLine" | "power" | "toughness" | "loyalty", label: string, placeholder = "") => (
    <div className="prow"><label htmlFor={`cm-${key}`}>{label}</label>
      <input id={`cm-${key}`} data-field={key} value={current[key]} placeholder={placeholder} disabled={!mine}
        onFocus={(event) => { lastField.current = event.currentTarget; }} onChange={(event) => changeFace({ [key]: event.target.value } as Partial<FaceDesign>)} /></div>
  );
  const symbolButtons = (
    <div className="symbols" role="group" aria-label="Mana symbols">
      {BASIC_SYMBOLS.map((code) => <button key={code} type="button" className="btn small sym" title={`Insert {${code}}`} disabled={!mine}
        onMouseDown={(event) => event.preventDefault()} onClick={() => insertSymbol(code)}>{`{${code}}`}</button>)}
      <Picker label="Generic mana" prefix="Number: " value="" options={[{ value: "", label: "Choose" }, ...GENERIC.map((code) => ({ value: code, label: `{${code}}` }))]}
        onChange={(value) => { if (value) insertSymbol(value); }} disabled={!mine} />
      <Picker label="Hybrid mana" prefix="Hybrid: " value="" options={[{ value: "", label: "Choose" }, ...HYBRID.map((code) => ({ value: code, label: `{${code}}` }))]}
        onChange={(value) => { if (value) insertSymbol(value); }} disabled={!mine} />
      <Picker label="Phyrexian mana" prefix="Phyrexian: " value="" options={[{ value: "", label: "Choose" }, ...PHYREXIAN.map((code) => ({ value: code, label: `{${code}}` }))]}
        onChange={(value) => { if (value) insertSymbol(value); }} disabled={!mine} />
    </div>
  );
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((item) => item !== value));

  return (
    <div className="makerbody">
      <section className="makerlist" aria-label="Custom cards">
        <div className="navbar">
          <input className="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a custom card" aria-label="Find a custom card" />
          <button type="button" className="btn small" onClick={() => void startNew()}>New card</button>
        </div>
        <div className="navbar"><button type="button" className="btn small grow" onClick={() => customDialog("Custom sets", () => <SetManager store={store} onChange={() => void loadLists()} />, 760)}>Custom sets...</button></div>
        {cards === null && <p className="note pad">Loading custom cards</p>}
        {cards?.length === 0 && <p className="note pad">No custom cards yet</p>}
        {shown.map((card) => (
          <div key={card.id} role="button" className={card.id === id ? "navitem colitem active" : "navitem colitem"} onClick={() => void open(card)}>
            <span className="colline"><span className="nl">{card.name}</span><span className="badge">{card.setCode.toUpperCase()} {card.collectorNumber}</span></span>
            <span className="colline sub"><span className="cnt">{card.typeLine}, by {card.ownerName}</span></span>
          </div>
        ))}
      </section>

      <section className="makerform" aria-label="Card fields">
        {!mine && <p className="note">Made by {cards?.find((card) => card.id === id)?.ownerName ?? "another account"}. Only its maker can change it.</p>}
        <div className="btnrow">
          <button type="button" className="btn primary" disabled={!mine || busy} onClick={() => void save()}>{id ? "Save" : "Save to card database"}</button>
          <button type="button" className="btn small" disabled={!id} onClick={duplicate}>Duplicate</button>
          <button type="button" className="btn small" onClick={exportPng}>Export PNG</button>
          <button type="button" className="btn small" disabled={!id || dirty}
            onClick={() => id && void store.addToPrintList([{ card: { id, name: draft.back ? `${draft.front.name} // ${draft.back.name}` : draft.front.name, set_code: draft.setCode, collector_number: draft.collectorNumber, custom: true, hasBack: !!draft.back }, count: 1, faces: draft.back ? "both" : "front" }], draft.front.name)}>Add to print list</button>
          <button type="button" className="btn small" disabled={!id || !mine} onClick={() => void remove()}>Delete...</button>
        </div>
        {dirty && <p className="note">Not saved yet</p>}

        <h4>Card</h4>
        <div className="prow"><label htmlFor="cm-set">Custom set</label>
          {sets.length
            ? <Picker id="cm-set" label="Custom set" value={draft.setCode} disabled={!mine}
              options={sets.map((item) => ({ value: item.code, label: `${item.name} (${item.code.toUpperCase()})` }))}
              onChange={(value) => change({ setCode: value, collectorNumber: id ? draft.collectorNumber : nextNumber(value, id) })} />
            : <button type="button" className="btn small" onClick={() => customDialog("Custom sets", () => <SetManager store={store} onChange={() => void loadLists()} />, 760)}>Create a custom set...</button>}
        </div>
        <div className="prow"><label htmlFor="cm-number">Collector number</label>
          <input id="cm-number" value={draft.collectorNumber} maxLength={10} disabled={!mine} onChange={(event) => change({ collectorNumber: event.target.value })} /></div>
        <div className="prow"><label htmlFor="cm-rarity">Rarity</label>
          <Picker id="cm-rarity" label="Rarity" value={draft.rarity} options={RARITY_CHOICES} disabled={!mine} onChange={(value) => change({ rarity: value })} /></div>
        <div className="prow"><label htmlFor="cm-artist">Artist</label>
          <input id="cm-artist" value={draft.artist} maxLength={100} disabled={!mine} onChange={(event) => change({ artist: event.target.value })} /></div>
        <label className="ck"><input type="checkbox" checked={!!draft.back} disabled={!mine}
          onChange={(event) => { change({ back: event.target.checked ? { ...blankFace(), frame: draft.front.frame } : null }); if (!event.target.checked) setFace("front"); }} /> Double-faced card</label>

        {draft.back && (
          <div className="seg" role="tablist" aria-label="Card face">
            <button type="button" role="tab" aria-selected={face === "front"} className={face === "front" ? "on" : ""} onClick={() => setFace("front")}>Front face</button>
            <button type="button" role="tab" aria-selected={face === "back"} className={face === "back" ? "on" : ""} onClick={() => setFace("back")}>Back face</button>
          </div>
        )}

        <h4>{draft.back ? (face === "front" ? "Front face" : "Back face") : "Face"}</h4>
        <div className="prow"><label htmlFor="cm-kind">Kind</label>
          <Picker id="cm-kind" label="Kind" value={current.kind} options={KIND_CHOICES} disabled={!mine} onChange={(value) => changeFace({ kind: value as CardKind })} /></div>
        <div className="prow"><label htmlFor="cm-frame">Frame</label>
          <Picker id="cm-frame" label="Frame" value={current.frame} options={FRAME_CHOICES} disabled={!mine} onChange={(value) => changeFace({ frame: value as Frame })} /></div>
        <label className="ck"><input type="checkbox" checked={current.legendary} disabled={!mine} onChange={(event) => changeFace({ legendary: event.target.checked })} /> Legendary</label>
        {textField("name", "Name")}
        {textField("manaCost", "Mana cost", "{2}{R}")}
        {symbolButtons}
        {textField("typeLine", "Type line", current.kind === "token" ? "Token Creature - Goblin" : "Creature - Goblin")}
        <div className="prow top"><label htmlFor="cm-rules">Rules text</label>
          <textarea id="cm-rules" data-field="rulesText" rows={6} value={current.rulesText} disabled={!mine}
            placeholder={current.kind === "planeswalker" ? "+1: Draw a card.\n-3: Destroy target creature." : current.kind === "saga" ? "I: Create a 1/1 Soldier token.\nII, III: Draw a card." : "Flying\n{T}: Add {R}. (Reminder text is in parentheses.)"}
            onFocus={(event) => { lastField.current = event.currentTarget; }} onChange={(event) => changeFace({ rulesText: event.target.value })} /></div>
        <div className="prow"><label htmlFor="cm-textsize">Rules text size</label>
          <span className="numfield"><input id="cm-textsize" type="range" min={60} max={140} value={current.textSize} disabled={!mine} onChange={(event) => changeFace({ textSize: Number(event.target.value) })} /> {current.textSize}%</span></div>
        <div className="prow top"><label htmlFor="cm-flavor">Flavor text</label>
          <textarea id="cm-flavor" rows={3} value={current.flavorText} disabled={!mine} onChange={(event) => changeFace({ flavorText: event.target.value })} /></div>
        <div className="prow"><label htmlFor="cm-flavorsize">Flavor text size</label>
          <span className="numfield"><input id="cm-flavorsize" type="range" min={60} max={140} value={current.flavorSize} disabled={!mine} onChange={(event) => changeFace({ flavorSize: Number(event.target.value) })} /> {current.flavorSize}%</span></div>
        {current.kind === "planeswalker" ? textField("loyalty", "Loyalty") : <>{textField("power", "Power")}{textField("toughness", "Toughness")}</>}

        <h4>Art</h4>
        <div className="btnrow">
          <button type="button" className="btn small" disabled={!mine} onClick={() => void uploadArt()}>Upload art...</button>
          <button type="button" className="btn small" disabled={!mine} onClick={artFromCard}>Art of a card...</button>
          <button type="button" className="btn small" disabled={!mine || !arts[face].image} onClick={() => setArt(face, null, null)}>Remove art</button>
        </div>
        <div className="prow"><label htmlFor="cm-zoom">Zoom</label>
          <span className="numfield"><input id="cm-zoom" type="range" min={50} max={300} value={Math.round(current.art.zoom * 100)} disabled={!mine || !arts[face].image}
            onChange={(event) => changeFace({ art: { ...current.art, zoom: Number(event.target.value) / 100 } })} /> {Math.round(current.art.zoom * 100)}%</span></div>

        <h4>Card data</h4>
        <label className="ck"><input type="checkbox" checked={draft.colorsAuto} disabled={!mine} onChange={(event) => change({ colorsAuto: event.target.checked })} /> Colors from the mana cost</label>
        {!draft.colorsAuto && <div className="chips">{COLORS.map((color) => (
          <label key={color} className="ck"><input type="checkbox" checked={draft.colors.includes(color)} disabled={!mine} onChange={(event) => change({ colors: toggle(draft.colors, color, event.target.checked) })} /> {COLOR_NAMES[color]}</label>
        ))}</div>}
        <label className="ck"><input type="checkbox" checked={draft.identityAuto} disabled={!mine} onChange={(event) => change({ identityAuto: event.target.checked })} /> Color identity from the mana symbols on the card</label>
        {!draft.identityAuto && <div className="chips">{COLORS.map((color) => (
          <label key={color} className="ck"><input type="checkbox" checked={draft.identity.includes(color)} disabled={!mine} onChange={(event) => change({ identity: toggle(draft.identity, color, event.target.checked) })} /> {COLOR_NAMES[color]}</label>
        ))}</div>}
        <div className="prow"><label>Finishes</label><span className="chips">{FINISH_NAMES.map(([value, label]) => (
          <label key={value} className="ck"><input type="checkbox" checked={draft.finishes.includes(value)} disabled={!mine} onChange={(event) => change({ finishes: toggle(draft.finishes, value, event.target.checked) })} /> {label}</label>
        ))}</span></div>
        <div className="prow"><label htmlFor="cm-usd">Price (USD)</label>
          <input id="cm-usd" type="number" min={0} step={0.01} value={draft.priceUsd} disabled={!mine} onChange={(event) => change({ priceUsd: event.target.value })} /></div>
        <div className="prow"><label htmlFor="cm-eur">Price (EUR)</label>
          <input id="cm-eur" type="number" min={0} step={0.01} value={draft.priceEur} disabled={!mine} onChange={(event) => change({ priceEur: event.target.value })} /></div>
        <div className="prow top"><label>Legal in</label>
          <div className="legalgrid">{LEGAL_FORMATS.map((format) => (
            <label key={format} className="ck"><input type="checkbox" checked={draft.legal.includes(format)} disabled={!mine} onChange={(event) => change({ legal: toggle(draft.legal, format, event.target.checked) })} /> {formatName(format)}</label>
          ))}</div></div>
        <div className="prow top"><label>Tokens it makes</label><TokenPicker value={draft.tokens} disabled={!mine} onChange={(tokens) => change({ tokens })} /></div>
      </section>

      <section className="makerpreview" aria-label="Card preview">
        <canvas ref={canvas} className="cardcanvas" width={WIDTH * SCALE} height={HEIGHT * SCALE} aria-label={`Preview of ${current.name || "the card"}`} role="img"
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
      </section>
    </div>
  );
}
