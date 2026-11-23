// ---------- the card maker: custom cards with a live preview, saved to the card database for every account ----------
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob, fetchFile, pickFile, request, slugify } from "../api";
import { refreshCardSearches } from "../card-search";
import { forgetCardPicture } from "../proxy-print";
import {
  artBoxOf, type Auto, blankHalf, splitArtBoxes, type SplitHalf, type Assets, blankFace, type CardKind, type FaceDesign, type Frame, frameName, FRAMES, FRAME_STYLE_NAMES, FRAME_STYLES, type FrameStyle, HEIGHT, loadPicture, renderCard, SCALE, symbolFile, symbolsIn, WIDTH,
} from "../card-render";
import { Icon } from "../icons";
import { type Store, useApp } from "../store";
import { type Card, FORMATS, formatName } from "../types";
import { ArtLibrary, type ArtItem } from "./ArtLibrary";
import { blobToData, type CustomSet, customSetMenuItems, makerAsked, openSetsTab, symbolFor, takeMakerAsk } from "./CustomSets";
import { rowMenu } from "./ContextMenu";
import { loadCardFonts } from "../card-fonts";
import { confirmDialog, customDialog } from "./Dialog";
import { choices, type Choice, Picker } from "./Picker";
import { Suggest } from "./Suggest";
import { symbolPicture, SymbolWindow } from "./SymbolPicker";

export type { CustomSet };
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

const KIND_CHOICES: Choice[] = choices([["normal", "Normal"], ["creature", "Creature"], ["planeswalker", "Planeswalker"], ["saga", "Saga"], ["token", "Token"], ["split", "Split card"]]);
const AUTO_CHOICES: Choice[] = choices([["auto", "Automatic"], ["on", "On"], ["off", "Off"]]);
const STYLE_CHOICES: Choice[] = FRAME_STYLES.map((style) => ({ value: style, label: FRAME_STYLE_NAMES[style] }));
const FRAME_CHOICES: Choice[] = FRAMES.map((frame) => ({ value: frame, label: frameName(frame), group: frame.length === 2 ? "Hybrid" : undefined }));
const RARITY_CHOICES: Choice[] = choices([["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"], ["mythic", "Mythic rare"], ["special", "Special"]]);
const COLORS = ["W", "U", "B", "R", "G"] as const;
const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const FINISH_NAMES: Array<[string, string]> = [["nonfoil", "Regular"], ["foil", "Foil"], ["etched", "Etched"]];
const LEGAL_FORMATS = FORMATS.filter((format) => format !== "casual");
const newDraft = (setCode = ""): Draft => ({
  front: blankFace(), back: null, setCode, collectorNumber: "1", rarity: "common", artist: "", finishes: ["nonfoil"], priceUsd: "", priceEur: "",
  legal: [], colorsAuto: true, colors: [], identityAuto: true, identity: [], tokens: [],
});
const noArt = (): Art => ({ image: null, data: null, changed: false });

// ---------- set symbols are loaded once ----------
const setSymbolCache = new Map<string, Promise<HTMLImageElement | null>>();
function setSymbolPicture(url: string): Promise<HTMLImageElement | null> {
  let promise = setSymbolCache.get(url);
  if (!promise) {
    promise = fetchFile(url).then(async (response) => (response.ok ? loadPicture(await response.blob()) : null)).catch(() => null);
    setSymbolCache.set(url, promise);
  }
  return promise;
}
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
    price: { usd: draft.priceUsd.trim() ? Number(draft.priceUsd) : null, eur: null },
    tokens: draft.tokens, flavorText: draft.front.flavorText.trim(),
  };
}

/** Renders one face to a JPEG data address at full size, for saving. */
function pictureData(face: FaceDesign, info: Parameters<typeof renderCard>[2], assets: Assets): string {
  const canvas = document.createElement("canvas");
  renderCard(canvas, face, info, assets);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Draws the saved pictures of a custom set's cards again (0.21.0), after the set's symbol colors change. Only cards
 * the account made are saved again. Returns how many were drawn.
 */
export async function redrawSetCards(store: Store, code: string): Promise<number> {
  const [cards, sets] = await Promise.all([request<CustomCardSummary[]>("/api/custom/cards"), request<CustomSet[]>("/api/custom/sets")]);
  const set = sets.find((item) => item.code === code) ?? null;
  await loadCardFonts();
  let drawn = 0;
  for (const summary of cards.filter((card) => card.setCode === code && card.ownerId === store.user.id)) {
    try {
      const detail = await request<CustomCardDetail>(`/api/custom/cards/${encodeURIComponent(summary.id)}`);
      const design = detail.design ?? {};
      const draft: Draft = {
        ...newDraft(code), ...design, setCode: code, collectorNumber: summary.collectorNumber,
        front: { ...blankFace(), ...(design.front ?? {}) }, back: design.back ? { ...blankFace(), ...design.back } : null,
      };
      const pictureOf = async (url: string | null) => {
        if (!url) return null;
        const response = await fetchFile(url);
        return response.ok ? loadPicture(await response.blob()) : null;
      };
      const [front, back] = await Promise.all([pictureOf(detail.artUrl), pictureOf(detail.backArtUrl)]);
      const symbol = symbolFor(set, draft.rarity);
      const setSymbol = symbol.url ? await setSymbolPicture(symbol.url) : null;
      const codes = [...new Set([draft.front, draft.back].flatMap((face) => (face ? [...symbolsIn(face.manaCost), ...symbolsIn(face.rulesText)] : [])))];
      const symbols = new Map<string, HTMLImageElement | null>(await Promise.all(codes.map(async (item) => [symbolFile(item), await symbolPicture(item)] as [string, HTMLImageElement | null])));
      const assets = (which: "front" | "back"): Assets => ({ art: which === "front" ? front : back, splitArt: back, setSymbol, symbols, setSymbolTint: symbol.tint, commonWhite: symbol.commonWhite });
      const info = (which: "front" | "back") => ({ rarity: draft.rarity, artist: draft.artist, setCode: code, collectorNumber: draft.collectorNumber, back: !!draft.back, face: which });
      await request(`/api/custom/cards/${encodeURIComponent(summary.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          card: cardData(draft), design: draft, picture: pictureData(draft.front, info("front"), assets("front")),
          backPicture: draft.back ? pictureData(draft.back, info("back"), assets("back")) : null,
        }),
      });
      forgetCardPicture(summary.id);
      drawn += 1;
    } catch {
      // a card that cannot be drawn keeps its picture
    }
  }
  if (drawn) refreshCardSearches();
  return drawn;
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
  // the first time the card maker opens, it shows the card worked on last instead of a blank card
  const fresh = useRef(memory === null);
  const lastKey = `mana-vault.makerLast.${store.user.id}`;
  const remember = (cardId: string | null) => { try { if (cardId) window.localStorage.setItem(lastKey, cardId); } catch { /* storage blocked */ } };
  const canvas = useRef<HTMLCanvasElement>(null);
  // the card fonts load once; the card is drawn again when they are ready
  const [, setFontsReady] = useState(false);
  useEffect(() => { void loadCardFonts().then(setFontsReady); }, []);
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const drag = useRef<{ x: number; y: number; art: FaceDesign["art"] } | null>(null);
  const tap = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [full, setFull] = useState<string | null>(null);
  const mine = id === null || ownerId === store.user.id;
  const current = face === "back" && draft.back ? draft.back : draft.front;

  const openRef = useRef<((summary: CustomCardSummary, quiet?: boolean) => Promise<void>) | null>(null);
  const loadLists = useCallback(async () => {
    try {
      const [cardList, setList] = await Promise.all([request<CustomCardSummary[]>("/api/custom/cards"), request<CustomSet[]>("/api/custom/sets")]);
      setCards(cardList);
      setSets(setList);
      if (fresh.current && makerAsked()) fresh.current = false;
      if (fresh.current) {
        fresh.current = false;
        let last: string | null = null;
        try { last = window.localStorage.getItem(lastKey); } catch { last = null; }
        const pick = cardList.find((card) => card.id === last) ?? cardList.find((card) => card.ownerId === store.user.id) ?? cardList[0];
        if (pick) void openRef.current?.(pick, true);
      }
      // a set whose code changed (Edit set) or that was deleted is replaced by one of your sets
      setDraft((value) => ((value.setCode && setList.some((set) => set.code === value.setCode)) || !setList.length ? value
        : { ...value, setCode: setList.find((set) => set.ownerId === store.user.id)?.code ?? setList[0]!.code }));
    } catch (reason) {
      store.fail(reason, "Could not load the custom cards.");
    }
  }, [store]);
  useEffect(() => { void loadLists(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the Custom sets tab asked for a new card in a set or for a card (0.20.0)
  useEffect(() => {
    if (!cards || !makerAsked()) return;
    const ask = takeMakerAsk();
    if (ask?.newIn) void newInSet(ask.newIn);
    else if (ask?.open) {
      const summary = cards.find((card) => card.id === ask.open);
      if (summary) void open(summary);
    }
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // the symbol of the card's rarity, or the set's main symbol (0.20.0)
  const symbol = symbolFor(set, draft.rarity);
  useEffect(() => {
    let active = true;
    if (!symbol.url) { setSetSymbol(null); return; }
    void setSymbolPicture(symbol.url).then((picture) => { if (active) setSetSymbol(picture); });
    return () => { active = false; };
  }, [symbol.url]);

  const info = (which: "front" | "back") => ({ rarity: draft.rarity, artist: draft.artist, setCode: draft.setCode || "XXX", collectorNumber: draft.collectorNumber, back: !!draft.back, face: which });
  const assets = (which: "front" | "back"): Assets => ({
    art: arts[which].image, splitArt: arts.back.image, setSymbol, symbols, setSymbolTint: symbol.tint, commonWhite: symbol.commonWhite,
  });

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

  /** Puts a symbol code at the cursor of the mana cost or rules text field used last (the mana cost before any is used). */
  const insertSymbol = (code: string) => {
    const field = lastField.current?.dataset.field === "rulesText" || lastField.current?.dataset.field === "manaCost" ? lastField.current : null;
    const text = `{${code}}`;
    const key = field?.dataset.field === "rulesText" ? "rulesText" : "manaCost";
    const value = current[key];
    const start = field ? field.selectionStart ?? value.length : value.length;
    const end = field ? field.selectionEnd ?? value.length : value.length;
    changeFace({ [key]: value.slice(0, start) + text + value.slice(end) } as Partial<FaceDesign>);
    window.setTimeout(() => {
      const target = field ?? document.querySelector<HTMLInputElement>('[data-field="manaCost"]');
      if (!target) return;
      // a field chosen since the click keeps the focus
      const active = document.activeElement;
      if (active && active !== target && active !== document.body && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      lastField.current = target;
      if (!store.phone) target.focus();
      target.setSelectionRange(start + text.length, start + text.length);
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

  /** A new card in a chosen custom set, numbered after its last card. */
  const newInSet = async (code: string) => {
    if (!(await confirmLeave())) return;
    setId(null); setOwnerId(store.user.id); setFace("front");
    setDraft({ ...newDraft(code), collectorNumber: nextNumber(code, null) });
    setArts({ front: noArt(), back: noArt() });
    setDirty(false);
  };

  const open = async (summary: CustomCardSummary, quiet = false) => {
    if (!quiet && !(await confirmLeave())) return;
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
      remember(detail.id);
      setDraft(loaded);
      setArts({ front, back });
      setDirty(false);
    } catch (reason) {
      store.fail(reason, "Could not open the custom card.");
    }
  };
  openRef.current = open;

  const duplicate = () => {
    setId(null); setOwnerId(store.user.id);
    setDraft((value) => ({ ...value, front: { ...value.front, name: value.front.name ? `${value.front.name} (copy)` : "" }, collectorNumber: nextNumber(value.setCode, null) }));
    setArts((value) => ({ front: { ...value.front, changed: !!value.front.data }, back: { ...value.back, changed: !!value.back.data } }));
    setDirty(true);
    store.flash("Copy made, not saved yet");
  };

  const save = async () => {
    if (!draft.setCode) return store.flash("Create a custom set first (Custom sets tab)", "err");
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
      remember(saved.id);
      setArts((value) => ({ front: { ...value.front, changed: false }, back: { ...value.back, changed: false } }));
      setDirty(false);
      store.flash(`${saved.name} saved to the card database`);
      // every place that shows the card shows the new version: searches, the print list and printed pictures
      forgetCardPicture(saved.id);
      refreshCardSearches();
      await loadLists();
      await Promise.all([store.refreshAfterChange(), store.loadPrintList()]);
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

  // a split card keeps its second half's art in the back art picture, and its place in split.art
  const [artHalf, setArtHalf] = useState<"front" | "back">("front");
  const splitHalf: SplitHalf = current.split ?? blankHalf();
  const artWhich: "front" | "back" = current.kind === "split" ? artHalf : face;
  const artPlace = current.kind === "split" && artHalf === "back" ? splitHalf.art : current.art;
  const setPlace = (art: FaceDesign["art"]) => (current.kind === "split" && artHalf === "back" ? changeFace({ split: { ...splitHalf, art } }) : changeFace({ art }));
  const setArt = (which: "front" | "back", data: string | null, image: HTMLImageElement | null) => {
    setArts((value) => ({ ...value, [which]: { image, data, changed: true } }));
    setPlace({ x: 0, y: 0, zoom: 1 });
  };
  const uploadArt = async () => {
    const file = await pickFile("image/jpeg,image/png,image/webp");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return store.flash("Art can be up to 10 MB", "err");
    const data = await blobToData(file);
    setArt(artWhich, data, await loadPicture(data));
  };
  const artFromCard = () => customDialog("Use the art of a card", (close) => (
    <ArtSearch onPick={(card) => {
      close();
      void (async () => {
        const response = await fetchFile(`/api/card-images/${encodeURIComponent(card.id)}?size=art_crop`);
        if (!response.ok) return store.flash("The art of that card could not be downloaded", "err");
        const blob = await response.blob();
        setArt(artWhich, await blobToData(blob), await loadPicture(blob));
        if (!draft.artist && "artist" in card && typeof (card as { artist?: unknown }).artist === "string") change({ artist: String((card as { artist?: string }).artist) });
      })();
    }} />
  ), 720, "Cancel");

  const useLibraryArt = async (art: ArtItem) => {
    const response = await fetchFile(art.url);
    if (!response.ok) return store.flash("That art could not be loaded", "err");
    const blob = await response.blob();
    setArt(artWhich, await blobToData(blob), await loadPicture(blob));
    store.flash(`${art.name} used on the card`);
  };
  const artFromLibrary = () => customDialog("Art library", (close) => (
    <ArtLibrary store={store} canUse={mine} onUse={(art) => { close(); void useLibraryArt(art); }} />
  ), 760);

  // dragging in the art box moves the art
  // the same art areas as the drawing: the whole card (Borderless), behind the bars (Full art), or the art box
  const artBox = () => (current.kind === "split" ? splitArtBoxes()[artHalf === "back" ? 1 : 0]! : artBoxOf(current));
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    tap.current = { x: event.clientX, y: event.clientY };
    if (!mine || !arts[artWhich].image) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const box = artBox();
    if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, art: artPlace };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const box = artBox();
    const dx = ((event.clientX - drag.current.x) / rect.width) * WIDTH / box.w;
    const dy = ((event.clientY - drag.current.y) / rect.height) * HEIGHT / box.h;
    setPlace({ ...drag.current.art, x: drag.current.art.x + dx, y: drag.current.art.y + dy });
  };
  // on the phone a tap (no drag) on the small preview shows the card full size
  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drag.current = null;
    const start = tap.current;
    moved.current = !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8;
    tap.current = null;
  };
  const showFull = () => {
    if (store.phone && !moved.current && canvas.current) setFull(canvas.current.toDataURL("image/jpeg", 0.92));
    moved.current = false;
  };

  const words = term.trim().toLowerCase();
  const shown = (cards ?? []).filter((card) => `${card.name} ${card.setCode} ${card.typeLine}`.toLowerCase().includes(words));
  const textField = (key: "name" | "manaCost" | "typeLine" | "power" | "toughness" | "loyalty", label: string, placeholder = "") => (
    <div className="prow"><label htmlFor={`cm-${key}`}>{label}</label>
      <input id={`cm-${key}`} data-field={key} value={current[key]} placeholder={placeholder} disabled={!mine}
        onFocus={(event) => focusField(event.currentTarget)} onChange={(event) => changeFace({ [key]: event.target.value } as Partial<FaceDesign>)} /></div>
  );
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [symbolTarget, setSymbolTarget] = useState<"manaCost" | "rulesText">("manaCost");
  const focusField = (element: HTMLInputElement | HTMLTextAreaElement) => {
    lastField.current = element;
    if (element.dataset.field === "manaCost" || element.dataset.field === "rulesText") setSymbolTarget(element.dataset.field);
  };
  const openSets = (code = draft.setCode || "new") => openSetsTab(store, code);
  const toggle = (list: string[], value: string, on: boolean) => (on ? [...new Set([...list, value])] : list.filter((item) => item !== value));

  return (
    <div className="makerbody">
      <section className="makerlist" aria-label="Custom cards">
        <div className="navbar">
          <input className="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find a custom card" aria-label="Find a custom card" />
          <button type="button" className="btn small" onClick={() => void startNew()}>New card</button>
        </div>
        {cards === null && <p className="note pad">Loading custom cards</p>}
        {cards?.length === 0 && <p className="note pad">No custom cards yet</p>}
        {/* cards under their custom set; right-click (or long press) a set for its commands */}
        {[...new Set(shown.map((card) => card.setCode))].map((code) => {
          const setInfo = sets.find((item) => item.code === code);
          return (
            <div key={code} className="makerset">
              <div className="grouphead csetlist" role="button" tabIndex={0} title={setInfo ? `${setInfo.name}: right-click for its commands` : undefined}
                {...(setInfo ? rowMenu(store, `${setInfo.name} (${code.toUpperCase()})`, () => customSetMenuItems(store, setInfo, () => void loadLists(), (setCode) => void newInSet(setCode))) : {})}>
                {setInfo?.symbolUrl && <img className="setsym" src={setInfo.symbolUrl} alt="" />}{setInfo?.name ?? code.toUpperCase()} <span className="cnt">{code.toUpperCase()}</span>
              </div>
              {shown.filter((card) => card.setCode === code).map((card) => (
                <div key={card.id} role="button" className={card.id === id ? "navitem colitem active" : "navitem colitem"} onClick={() => void open(card)}>
                  <span className="colline"><span className="nl">{card.name}</span><span className="badge">{card.setCode.toUpperCase()} {card.collectorNumber}</span></span>
                  <span className="colline sub"><span className="cnt">{card.typeLine}, by {card.ownerName}</span></span>
                </div>
              ))}
            </div>
          );
        })}
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
            : <button type="button" className="btn small" onClick={() => openSets("new")}>Create a custom set...</button>}
        </div>
        <div className="prow"><label htmlFor="cm-number">Collector number</label>
          <input id="cm-number" value={draft.collectorNumber} maxLength={10} disabled={!mine} onChange={(event) => change({ collectorNumber: event.target.value })} /></div>
        <div className="prow"><label htmlFor="cm-rarity">Rarity</label>
          <Picker id="cm-rarity" label="Rarity" value={draft.rarity} options={RARITY_CHOICES} disabled={!mine} onChange={(value) => change({ rarity: value })} /></div>
        <div className="prow"><label htmlFor="cm-artist">Artist</label>
          <input id="cm-artist" value={draft.artist} maxLength={100} disabled={!mine} onChange={(event) => change({ artist: event.target.value })} /></div>
        <label className="ck"><input type="checkbox" checked={!!draft.back} disabled={!mine || draft.front.kind === "split"}
          onChange={(event) => { change({ back: event.target.checked ? { ...blankFace(), frame: draft.front.frame } : null }); if (!event.target.checked) setFace("front"); }} /> Double-faced card</label>

        {draft.back && (
          <div className="seg" role="tablist" aria-label="Card face">
            <button type="button" role="tab" aria-selected={face === "front"} className={face === "front" ? "on" : ""} onClick={() => setFace("front")}>Front face</button>
            <button type="button" role="tab" aria-selected={face === "back"} className={face === "back" ? "on" : ""} onClick={() => setFace("back")}>Back face</button>
          </div>
        )}

        <div className="facehead"><h4>{draft.back ? (face === "front" ? "Front face" : "Back face") : "Face"}</h4>
          <button type="button" className={symbolsOpen ? "btn small on" : "btn small"} aria-expanded={symbolsOpen} disabled={!mine}
            onMouseDown={(event) => event.preventDefault()} onClick={() => setSymbolsOpen(!symbolsOpen)}>Symbols</button></div>
        <div className="prow"><label htmlFor="cm-kind">Kind</label>
          <Picker id="cm-kind" label="Kind" value={current.kind} options={KIND_CHOICES} disabled={!mine} onChange={(value) => changeFace({ kind: value as CardKind })} /></div>
        <div className="prow"><label htmlFor="cm-style">Style</label>
          <Picker id="cm-style" label="Style" value={current.style} options={STYLE_CHOICES} disabled={!mine} onChange={(value) => changeFace({ style: value as FrameStyle })} /></div>
        <div className="prow"><label htmlFor="cm-frame">Frame</label>
          <span className="btnrow"><Picker id="cm-frame" label="Frame" value={current.frame} options={FRAME_CHOICES} disabled={!mine} onChange={(value) => changeFace({ frame: value as Frame })} />
            <button type="button" className="btn small" disabled={!mine} onClick={() => framePickerDialog(current, info(face), assets(face), (style, frame) => changeFace({ style, frame }))}>Choose frame...</button></span></div>
        <div className="prow"><label htmlFor="cm-crown">Legendary crown</label>
          <Picker id="cm-crown" label="Legendary crown" value={current.crown ?? (current.legendary ? "on" : "auto")} options={AUTO_CHOICES} disabled={!mine}
            onChange={(value) => changeFace({ crown: value as Auto, legendary: value === "on" })} /></div>
        {current.kind !== "planeswalker" && current.kind !== "saga" && current.kind !== "split" && (
          <div className="prow"><label htmlFor="cm-pt">Power and toughness box</label>
            <Picker id="cm-pt" label="Power and toughness box" value={current.ptBox ?? "auto"} options={AUTO_CHOICES} disabled={!mine} onChange={(value) => changeFace({ ptBox: value as Auto })} /></div>
        )}
        <div className="prow"><label htmlFor="cm-name">Name</label>
          <Suggest id="cm-name" data-field="name" mode="name" value={current.name} disabled={!mine}
            onFocus={(event) => focusField(event.currentTarget)} onValue={(value) => changeFace({ name: value })} /></div>
        {(current.style === "nickname" || current.style === "showcasenickname") && (
          <div className="prow"><label htmlFor="cm-nickname">Nickname</label>
            <input id="cm-nickname" value={current.nickname} maxLength={100} disabled={!mine} placeholder="Shown in the name bar"
              onChange={(event) => changeFace({ nickname: event.target.value })} /></div>
        )}
        <div className="prow"><label htmlFor="cm-manaCost">Mana cost</label>
          <input id="cm-manaCost" data-field="manaCost" value={current.manaCost} placeholder="{2}{R}" disabled={!mine}
            onFocus={(event) => focusField(event.currentTarget)} onSelect={(event) => focusField(event.currentTarget)} onChange={(event) => changeFace({ manaCost: event.target.value })} /></div>
        <div className="prow"><label htmlFor="cm-typeLine">Type line</label>
          <Suggest id="cm-typeLine" data-field="typeLine" mode="typeLine" value={current.typeLine} disabled={!mine}
            placeholder={current.kind === "token" ? "Token Creature - Goblin" : "Creature - Goblin"}
            onFocus={(event) => focusField(event.currentTarget)} onValue={(value) => changeFace({ typeLine: value })} /></div>
        <div className="prow top"><label htmlFor="cm-rules">Rules text</label>
          <Suggest multiline id="cm-rules" data-field="rulesText" mode="rules" rows={6} value={current.rulesText} disabled={!mine}
            placeholder={current.kind === "planeswalker" ? "+1: Draw a card.\n-3: Destroy target creature." : current.kind === "saga" ? "I: Create a 1/1 Soldier token.\nII, III: Draw a card." : "Flying\n{T}: Add {R}. (Reminder text is in parentheses.)"}
            onFocus={(event) => focusField(event.currentTarget)} onSelect={(event) => focusField(event.currentTarget)} onValue={(value) => changeFace({ rulesText: value })} /></div>
        <div className="prow"><label htmlFor="cm-textsize">Rules text size</label>
          <span className="numfield"><input id="cm-textsize" type="range" min={60} max={140} value={current.textSize} disabled={!mine} onChange={(event) => changeFace({ textSize: Number(event.target.value) })} /> {current.textSize}%</span></div>
        <div className="prow top"><label htmlFor="cm-flavor">Flavor text</label>
          <textarea id="cm-flavor" rows={3} value={current.flavorText} disabled={!mine} onChange={(event) => changeFace({ flavorText: event.target.value })} /></div>
        <div className="prow"><label htmlFor="cm-flavorsize">Flavor text size</label>
          <span className="numfield"><input id="cm-flavorsize" type="range" min={60} max={140} value={current.flavorSize} disabled={!mine} onChange={(event) => changeFace({ flavorSize: Number(event.target.value) })} /> {current.flavorSize}%</span></div>
        {current.kind === "planeswalker" ? textField("loyalty", "Loyalty") : current.kind === "split" ? null : <>{textField("power", "Power")}{textField("toughness", "Toughness")}</>}
        {current.kind === "split" && (
          <>
            <h4>Second half</h4>
            {(["name", "manaCost", "typeLine"] as const).map((key) => (
              <div className="prow" key={key}><label htmlFor={`cm-split-${key}`}>{key === "name" ? "Name" : key === "manaCost" ? "Mana cost" : "Type line"}</label>
                <input id={`cm-split-${key}`} value={splitHalf[key]} disabled={!mine} placeholder={key === "manaCost" ? "{1}{U}" : ""}
                  onChange={(event) => changeFace({ split: { ...splitHalf, [key]: event.target.value } })} /></div>
            ))}
            <div className="prow top"><label htmlFor="cm-split-rules">Rules text</label>
              <textarea id="cm-split-rules" rows={4} value={splitHalf.rulesText} disabled={!mine} onChange={(event) => changeFace({ split: { ...splitHalf, rulesText: event.target.value } })} /></div>
            <div className="prow top"><label htmlFor="cm-split-flavor">Flavor text</label>
              <textarea id="cm-split-flavor" rows={2} value={splitHalf.flavorText} disabled={!mine} onChange={(event) => changeFace({ split: { ...splitHalf, flavorText: event.target.value } })} /></div>
          </>
        )}

        <h4>Art</h4>
        {current.kind === "split" && (
          <div className="seg" role="tablist" aria-label="Art of">
            <button type="button" role="tab" aria-selected={artHalf === "front"} className={artHalf === "front" ? "on" : ""} onClick={() => setArtHalf("front")}>First half</button>
            <button type="button" role="tab" aria-selected={artHalf === "back"} className={artHalf === "back" ? "on" : ""} onClick={() => setArtHalf("back")}>Second half</button>
          </div>
        )}
        <div className="btnrow">
          <button type="button" className="btn small" disabled={!mine} onClick={() => void uploadArt()}>Upload art...</button>
          <button type="button" className="btn small" disabled={!mine} onClick={artFromLibrary}>Art library...</button>
          <button type="button" className="btn small" disabled={!mine} onClick={artFromCard}>Art of a card...</button>
          <button type="button" className="btn small" disabled={!mine || !arts[artWhich].image} onClick={() => setArt(artWhich, null, null)}>Remove art</button>
        </div>
        <div className="prow"><label htmlFor="cm-zoom">Zoom</label>
          <span className="numfield"><input id="cm-zoom" type="range" min={50} max={300} value={Math.round(artPlace.zoom * 100)} disabled={!mine || !arts[artWhich].image}
            onChange={(event) => setPlace({ ...artPlace, zoom: Number(event.target.value) / 100 })} /> {Math.round(artPlace.zoom * 100)}%</span></div>

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
        <div className="prow top"><label>Legal in</label>
          <div className="legalgrid">{LEGAL_FORMATS.map((format) => (
            <label key={format} className="ck"><input type="checkbox" checked={draft.legal.includes(format)} disabled={!mine} onChange={(event) => change({ legal: toggle(draft.legal, format, event.target.checked) })} /> {formatName(format)}</label>
          ))}</div></div>
        <div className="prow top"><label>Tokens it makes</label><TokenPicker value={draft.tokens} disabled={!mine} onChange={(tokens) => change({ tokens })} /></div>
      </section>

      <section className="makerpreview" aria-label="Card preview">
        <canvas ref={canvas} className="cardcanvas" width={WIDTH * SCALE} height={HEIGHT * SCALE} aria-label={`Preview of ${current.name || "the card"}`} role="img"
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; tap.current = null; }} onClick={showFull} />
      </section>
      {symbolsOpen && <SymbolWindow phone={store.phone} disabled={!mine} onPick={insertSymbol} onClose={() => setSymbolsOpen(false)}
        target={symbolTarget === "rulesText" ? "the rules text" : "the mana cost"} />}
      {full && (
        <div className="cardfull" role="dialog" aria-modal="true" aria-label="Card full size" onClick={() => setFull(null)}>
          <img src={full} alt={`${current.name || "The card"}, full size`} />
          <button type="button" className="btn" onClick={() => setFull(null)}>Close</button>
        </div>
      )}
    </div>
  );
}

// ---------- Choose frame...: a style, then a frame, from small pictures of each (0.17.0) ----------

const FRAME_LIST = FRAMES.filter((frame) => frame !== "auto") as Array<Exclude<Frame, "auto">>;

/** A small picture of the card in a style and frame, drawn from the card being made. */
function FrameThumb({ face, info, assets, style, frame }: { face: FaceDesign; info: Parameters<typeof renderCard>[2]; assets: Assets; style: FrameStyle; frame: Frame }) {
  const small = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const big = document.createElement("canvas");
    renderCard(big, { ...face, style, frame, name: face.name || frameName(frame) }, info, assets);
    const target = small.current;
    if (!target) return;
    target.width = 150;
    target.height = Math.round(150 * HEIGHT / WIDTH);
    target.getContext("2d")?.drawImage(big, 0, 0, target.width, target.height);
  }, [face, info, assets, style, frame]);
  return <canvas ref={small} className="framethumb" aria-hidden="true" />;
}

function FramePicker({ face, info, assets, onPick }: { face: FaceDesign; info: Parameters<typeof renderCard>[2]; assets: Assets; onPick: (style: FrameStyle, frame: Frame) => void }) {
  const [style, setStyle] = useState<FrameStyle | null>(null);
  if (!style) {
    return (
      <div className="framepick" role="list" aria-label="Choose a frame style">
        <p className="sub">CHOOSE A FRAME STYLE</p>
        {FRAME_STYLES.map((item) => (
          <button key={item} type="button" role="listitem" className={item === face.style ? "framestyle on" : "framestyle"} onClick={() => setStyle(item)}>
            <b>{FRAME_STYLE_NAMES[item]}</b><span className="sub">{FRAME_LIST.length} frames ›</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="framepick">
      <div className="btnrow"><button type="button" className="btn small" onClick={() => setStyle(null)}>Back to styles</button><b>{FRAME_STYLE_NAMES[style]}</b></div>
      <div className="framegrid" role="listbox" aria-label={`${FRAME_STYLE_NAMES[style]} frames`}>
        <button type="button" role="option" aria-selected={face.frame === "auto"} className="framecell auto" onClick={() => onPick(style, "auto")}>
          <span className="frameauto">Automatic</span><span className="sub">From the mana cost and type</span>
        </button>
        {FRAME_LIST.map((frame) => (
          <button key={frame} type="button" role="option" aria-selected={face.style === style && face.frame === frame} className="framecell" onClick={() => onPick(style, frame)}>
            <FrameThumb face={face} info={info} assets={assets} style={style} frame={frame} /><span className="sub">{frameName(frame)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function framePickerDialog(face: FaceDesign, info: Parameters<typeof renderCard>[2], assets: Assets, onPick: (style: FrameStyle, frame: Frame) => void) {
  customDialog("Choose frame", (close) => <FramePicker face={face} info={info} assets={assets} onPick={(style, frame) => { close(); onPick(style, frame); }} />, 820, "Cancel");
}
