// ---------- suggestions as you type: card names, types, keywords and artists from Scryfall's lists ----------
import { type InputHTMLAttributes, type KeyboardEvent, type TextareaHTMLAttributes, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { request } from "../api";
import { isApp } from "../android/platform";

// the Android app keeps the lists so suggestions also work offline
let listsKept = false;

export type SuggestList = "names" | "types" | "keywords" | "artists";
/** How the words being typed are found and replaced. */
export type SuggestMode = "search" | "name" | "quick" | "typeLine" | "rules" | "types" | "keywords" | "artists";

type Part = { list: SuggestList; term: string; start: number; end: number; wrap: (item: string) => string };

/** The part of the text being typed at the cursor, and the list it is suggested from. */
export function partAt(mode: SuggestMode, text: string, cursor: number): Part | null {
  if (mode === "types" || mode === "keywords" || mode === "artists") {
    return text.trim().length >= 1 ? { list: mode, term: text.trim(), start: 0, end: text.length, wrap: (item) => item } : null;
  }
  if (mode === "name") return text.trim().length >= 2 ? { list: "names", term: text.trim(), start: 0, end: text.length, wrap: (item) => item } : null;
  if (mode === "quick") {
    // Quick add: "2 Sol Ring" keeps its count
    const prefix = /^\s*\d+\s*x?\s+/i.exec(text)?.[0] ?? "";
    const term = text.slice(prefix.length).replace(/\s*[[(].*$/, "").trim();
    return term.length >= 2 ? { list: "names", term, start: prefix.length, end: text.length, wrap: (item) => item } : null;
  }
  if (mode === "typeLine") {
    // the word being typed in the type line, after a space or the dash
    const before = text.slice(0, cursor);
    const start = Math.max(before.lastIndexOf(" "), before.lastIndexOf("-")) + 1;
    const term = before.slice(start);
    return term.length >= 1 ? { list: "types", term, start, end: cursor, wrap: (item) => item } : null;
  }
  if (mode === "rules") {
    // a keyword at the start of a line or after a comma
    const before = text.slice(0, cursor);
    const start = Math.max(before.lastIndexOf("\n"), before.lastIndexOf(",")) + 1;
    const term = before.slice(start).trimStart();
    if (term.length < 2 || term.includes(" ") && term.split(" ").length > 3) return null;
    return { list: "keywords", term, start: cursor - term.length, end: cursor, wrap: (item) => item };
  }
  // card search: t: types, kw: keywords, a: artists, or card names for plain words
  const before = text.slice(0, cursor);
  const token = /(?:^|\s)(-?)(t|type|kw|keyword|a|artist):("?)([^"]*)$/i.exec(before);
  if (token) {
    const key = token[2]!.toLowerCase();
    const list: SuggestList = key === "t" || key === "type" ? "types" : key === "a" || key === "artist" ? "artists" : "keywords";
    const term = token[4]!;
    if (!term.length) return null;
    const start = cursor - term.length - token[3]!.length;
    return { list, term, start, end: cursor, wrap: (item) => (/\s/.test(item) ? `"${item}"` : item) };
  }
  if (/(^|\s)-?[a-z]+(:|>=|<=|>|<|=)/i.test(text) || text.trim().length < 2) return null;
  return { list: "names", term: text.trim(), start: 0, end: text.length, wrap: (item) => item };
}

type Common = { value: string; onValue: (value: string) => void; mode: SuggestMode; onPicked?: (value: string) => void };
type InputProps = Common & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;
type AreaProps = Common & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">;

/**
 * A text field with suggestions under it. Up and Down move through them, Enter or a click takes one, and Esc closes them.
 * Enter with no suggestion chosen works as the field's own Enter.
 */
export const Suggest = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps | AreaProps>(function Suggest(props, ref) {
  const { value, onValue, mode, onPicked, multiline, onKeyDown, onBlur, ...rest } = props as InputProps & { multiline?: boolean };
  const field = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => field.current!);
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [part, setPart] = useState<Part | null>(null);
  const typed = useRef(false);
  useEffect(() => {
    if (!isApp() || listsKept) return;
    listsKept = true;
    void request("/api/catalog/lists").catch(() => { listsKept = false; });
  }, []);
  useEffect(() => {
    if (!typed.current) return;
    const cursor = field.current?.selectionStart ?? value.length;
    const next = partAt(mode, value, cursor);
    setPart(next);
    if (!next) { setItems([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      request<string[]>(`/api/catalog/suggest?list=${next.list}&q=${encodeURIComponent(next.term)}&limit=8`)
        .then((found) => { if (live) { setItems(found.filter((item) => item.toLowerCase() !== next.term.toLowerCase())); setActive(-1); } })
        .catch(() => { if (live) setItems([]); });
    }, 150);
    return () => { live = false; window.clearTimeout(timer); };
  }, [value, mode]);
  const take = (item: string) => {
    if (!part) return;
    const inserted = part.wrap(item);
    const next = value.slice(0, part.start) + inserted + value.slice(part.end);
    typed.current = false;
    setItems([]);
    onValue(next);
    onPicked?.(next);
    const cursor = part.start + inserted.length;
    window.setTimeout(() => { field.current?.focus(); field.current?.setSelectionRange(cursor, cursor); }, 0);
  };
  const keys = (event: KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) => {
    if (items.length) {
      // in card search, Down goes to the results (as before) until Tab has moved into the suggestions
      const intoResults = mode === "search" && active < 0;
      if (event.key === "Tab" && mode === "search") { event.preventDefault(); setActive(event.shiftKey ? (active <= 0 ? items.length - 1 : active - 1) : (active + 1) % items.length); return; }
      if (event.key === "ArrowDown" && !intoResults) { event.preventDefault(); setActive((active + 1) % items.length); return; }
      if (event.key === "ArrowDown" && intoResults) setItems([]);
      if (event.key === "ArrowUp" && !intoResults) { event.preventDefault(); setActive(active <= 0 ? items.length - 1 : active - 1); return; }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setItems([]); return; }
      if ((event.key === "Enter" || (event.key === "Tab" && mode !== "search")) && active >= 0) { event.preventDefault(); take(items[active]!); return; }
    }
    if (event.key === "Enter") setItems([]);
    onKeyDown?.(event as never);
  };
  const shared = {
    ...rest,
    ref: field as never,
    value,
    "aria-autocomplete": "list" as const,
    "aria-expanded": items.length > 0,
    onChange: (event: { target: { value: string } }) => { typed.current = true; onValue(event.target.value); },
    onKeyDown: keys,
    onBlur: (event: never) => { window.setTimeout(() => setItems([]), 150); (onBlur as ((event: never) => void) | undefined)?.(event); },
  };
  return (
    <span className="suggestwrap">
      {multiline ? <textarea {...(shared as TextareaHTMLAttributes<HTMLTextAreaElement>)} /> : <input {...(shared as InputHTMLAttributes<HTMLInputElement>)} />}
      {items.length > 0 && (
        <span className="suggestlist" role="listbox" aria-label="Suggestions">
          {items.map((item, index) => (
            <span key={item} role="option" aria-selected={index === active} className={index === active ? "suggestitem on" : "suggestitem"}
              onMouseDown={(event) => { event.preventDefault(); take(item); }}>{item}</span>
          ))}
        </span>
      )}
    </span>
  );
});
