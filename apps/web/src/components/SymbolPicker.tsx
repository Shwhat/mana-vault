// ---------- mana symbols: the pictures, Scryfall's symbol list and the floating Symbols window of the card maker ----------
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { fetchFile, request } from "../api";
import { loadPicture, symbolFile } from "../card-render";

/** One symbol of Scryfall's symbol list (Administration, Card database, Symbols). */
export type SymbolInfo = {
  symbol: string; code: string; name: string; manaValue: number | null; colors: string; hybrid: boolean; phyrexian: boolean; mana: boolean;
  funny: boolean; picture: boolean;
};

/** The symbol picker's sections, used before the first card database update loads Scryfall's list. */
export const SYMBOL_GROUPS: Array<[string, string[]]> = [
  ["Numbers", [...Array.from({ length: 21 }, (_, number) => String(number)), "X"]],
  ["Colors", ["W", "U", "B", "R", "G", "C", "S"]],
  ["Phyrexian", ["W/P", "U/P", "B/P", "R/P", "G/P"]],
  ["Hybrid", ["W/U", "W/B", "U/B", "U/R", "B/R", "B/G", "R/G", "R/W", "G/W", "G/U"]],
  ["Two or color", ["2/W", "2/U", "2/B", "2/R", "2/G"]],
  ["Other", ["T", "Q", "E"]],
];

let symbology: Promise<SymbolInfo[]> | null = null;
/** Scryfall's symbol list, loaded once (empty until the first card database update with 0.15.0). */
export function loadSymbology(): Promise<SymbolInfo[]> {
  symbology ??= request<SymbolInfo[]>("/api/symbology").catch(() => {
    symbology = null;
    return [];
  });
  return symbology;
}

/** The symbol list, grouped for the picker: playable symbols only, in Scryfall's order. */
export function symbolGroups(list: SymbolInfo[]): Array<[string, Array<{ code: string; name: string }>]> {
  const named = new Map(list.map((item) => [item.symbol.slice(1, -1).toUpperCase(), item.name]));
  if (!list.length) return SYMBOL_GROUPS.map(([group, codes]) => [group, codes.map((code) => ({ code, name: `{${code}}` }))]);
  const groups: Record<string, Array<{ code: string; name: string }>> = { Numbers: [], Colors: [], Phyrexian: [], Hybrid: [], "Two or color": [], Other: [] };
  for (const item of list) {
    const code = item.symbol.slice(1, -1).toUpperCase();
    if (item.funny || !/^[0-9A-Z/]{1,6}$/.test(code)) continue;
    const entry = { code, name: item.name || named.get(code) || item.symbol };
    if (/^(\d+|X|Y|Z|½|∞)$/.test(code)) groups.Numbers!.push(entry);
    else if (item.phyrexian) groups.Phyrexian!.push(entry);
    else if (/^2\//.test(code)) groups["Two or color"]!.push(entry);
    else if (item.hybrid) groups.Hybrid!.push(entry);
    else if (/^[WUBRGCS]$/.test(code)) groups.Colors!.push(entry);
    else groups.Other!.push(entry);
  }
  return Object.entries(groups).filter(([, items]) => items.length);
}

const symbolCache = new Map<string, Promise<HTMLImageElement | null>>();
/** The picture of a mana symbol, loaded once. */
export function symbolPicture(code: string): Promise<HTMLImageElement | null> {
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

/** One mana symbol, drawn from the same picture the card uses (a colored circle with its code while it loads). */
export function SymbolGlyph({ code, size = 22 }: { code: string; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const draw = (picture: HTMLImageElement | null) => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx || !live) return;
      ctx.clearRect(0, 0, 48, 48);
      if (picture) ctx.drawImage(picture, 0, 0, 48, 48);
      else {
        ctx.fillStyle = "#cac5c0";
        ctx.beginPath();
        ctx.arc(24, 24, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.font = "700 18px Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(code.replace("/", ""), 24, 25);
      }
    };
    draw(null);
    void symbolPicture(code).then(draw);
    return () => { live = false; };
  }, [code]);
  return <canvas ref={canvas} width={48} height={48} style={{ width: size, height: size }} className="symglyph" aria-hidden="true" />;
}

/** Text with {W}-style symbols shown as symbol pictures (rules text on the card page). */
export function SymbolText({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]{1,8}\})/g);
  return <>{parts.map((part, index) => (/^\{[^}]{1,8}\}$/.test(part)
    ? <span key={index} className="inlinesym" title={part}><SymbolGlyph code={part.slice(1, -1)} size={15} /><span className="symtext">{part}</span></span>
    : <span key={index}>{part}</span>))}</>;
}

/**
 * The Symbols window: floats over the card maker on a desktop (moved by its title bar) and is a sheet at the bottom of
 * a phone screen. A click puts the symbol at the cursor of the mana cost or rules text field used last.
 */
export function SymbolWindow({ onPick, onClose, disabled, phone, target }: {
  onPick: (code: string) => void; onClose: () => void; disabled: boolean; phone: boolean; target: string;
}) {
  const [groups, setGroups] = useState(() => symbolGroups([]));
  const [place, setPlace] = useState({ x: Math.max(8, window.innerWidth - 420), y: 120 });
  const drag = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null);
  useEffect(() => { void loadSymbology().then((list) => setGroups(symbolGroups(list))); }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phone || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: place };
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const x = drag.current.start.x + event.clientX - drag.current.x;
    const y = drag.current.start.y + event.clientY - drag.current.y;
    setPlace({ x: Math.max(0, Math.min(window.innerWidth - 120, x)), y: Math.max(0, Math.min(window.innerHeight - 40, y)) });
  };
  return (
    <div className={phone ? "symwindow sheet" : "symwindow"} role="dialog" aria-label="Symbols" style={phone ? undefined : { left: place.x, top: place.y }}>
      <div className="symtitle" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
        <b>Symbols</b><span className="sub">Into {target}</span>
        <button type="button" className="btn small" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>Close</button>
      </div>
      <div className="sympicker" role="group" aria-label="Mana symbols">
        {groups.map(([name, items]) => (
          <div key={name} className="symgroup">
            <div className="symname">{name}</div>
            <div className="symrow">
              {items.map((item) => (
                <button key={item.code} type="button" className="symbtn" title={`{${item.code}} ${item.name}`} aria-label={`Insert {${item.code}}`} disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(item.code)}><SymbolGlyph code={item.code} /></button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
