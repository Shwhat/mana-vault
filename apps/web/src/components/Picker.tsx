// ---------- picker: the app's own choice list, used everywhere in place of the phone's or browser's own picker ----------
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePhone } from "../narrow";

/** A choice: its value, its text, and optionally a second line and a group heading. */
export type Choice = { value: string; label: string; detail?: string; group?: string; disabled?: boolean };
export const choices = (list: Array<[string, string]>): Choice[] => list.map(([value, label]) => ({ value, label }));

/**
 * A button showing the chosen item. It opens a list of the choices, with a search box when the list is long. Up and Down
 * move, Enter chooses, Esc closes. On a phone the list is a sheet over the screen.
 */
export function Picker({ id, label, value, options, onChange, className, prefix, disabled, title }: {
  id?: string; label: string; value: string; options: Choice[]; onChange: (value: string) => void; className?: string; prefix?: string; disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const current = options.find((item) => item.value === value);
  return (
    <>
      <button ref={button} id={id} type="button" className={`picker${className ? ` ${className}` : ""}`} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? "none"}`} title={title} disabled={disabled} data-value={value}
        onClick={(event) => { event.stopPropagation(); setOpen(!open); }}
        onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
        <span className="pkval">{prefix}{current?.label ?? ""}</span><span className="pkcaret" aria-hidden="true">▾</span>
      </button>
      {open && <PickerList label={label} value={value} options={options} anchor={button.current}
        onChoose={(next) => { setOpen(false); button.current?.focus(); if (next !== value) onChange(next); }} onClose={() => { setOpen(false); button.current?.focus(); }} />}
    </>
  );
}

export function PickerList({ label, value, options, anchor, onChoose, onClose, footer }: {
  label: string; value: string; options: Choice[]; anchor: HTMLElement | null; onChoose: (value: string) => void; onClose: () => void; footer?: ReactNode;
}) {
  const phone = usePhone();
  const [term, setTerm] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const searchable = options.length > 8;
  const shown = useMemo(() => {
    const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((item) => !words.length || words.every((word) => `${item.label} ${item.detail ?? ""} ${item.group ?? ""}`.toLowerCase().includes(word)));
  }, [options, term]);
  const usable = shown.filter((item) => !item.disabled);
  const [index, setIndex] = useState(() => Math.max(0, usable.findIndex((item) => item.value === value)));
  useEffect(() => setIndex(0), [term]);
  useEffect(() => {
    const close = (event: Event) => {
      if (event.target instanceof Node && (box.current?.contains(event.target) || anchor?.contains(event.target))) return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
    };
  }, [anchor, onClose]);
  useEffect(() => {
    if (!searchable) box.current?.querySelector<HTMLElement>(".pklist")?.focus();
    box.current?.querySelector(".pkopt.hi")?.scrollIntoView({ block: "nearest" });
  }, [index, searchable]);
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setIndex(Math.min(usable.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setIndex(Math.max(0, index - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); const item = usable[index]; if (item) onChoose(item.value); }
    else if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onClose(); }
  };
  const rect = anchor?.getBoundingClientRect();
  const width = Math.max(220, Math.min(380, rect?.width ?? 220));
  const below = rect ? window.innerHeight - rect.bottom : 0;
  const style = phone || !rect ? undefined : {
    left: Math.max(4, Math.min(rect.left, window.innerWidth - width - 4)), width,
    ...(below < 260 && rect.top > below ? { bottom: window.innerHeight - rect.top + 2 } : { top: rect.bottom + 2 }),
  };
  let lastGroup: string | undefined;
  const list = (
    <div ref={box} className={phone ? "pkpop phone" : "pkpop"} style={style} role="dialog" aria-label={label} onKeyDown={keys}
      onMouseDown={(event) => event.stopPropagation()}>
      {phone && <div className="pkhead"><b>{label}</b><button type="button" className="btn small" onClick={onClose}>Close</button></div>}
      {searchable && (
        <div className="pksearch"><input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find" aria-label={`Find in ${label}`} /></div>
      )}
      <div className="pklist" role="listbox" aria-label={label} tabIndex={-1}>
        {shown.length === 0 && <p className="note pad">Nothing matches</p>}
        {shown.map((item) => {
          const heading = item.group && item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          const position = usable.indexOf(item);
          return (
            <div key={`${item.group ?? ""}:${item.value}`}>
              {heading && <div className="pkgroup">{heading}</div>}
              <div role="option" aria-selected={item.value === value} aria-disabled={item.disabled} data-value={item.value}
                className={`pkopt${position === index && !item.disabled ? " hi" : ""}${item.value === value ? " cur" : ""}${item.disabled ? " off" : ""}`}
                onMouseEnter={() => { if (!item.disabled) setIndex(position); }}
                onClick={() => { if (!item.disabled) onChoose(item.value); }}>
                <span className="pkck" aria-hidden="true">{item.value === value ? "✓" : ""}</span>
                <span className="pktext"><span>{item.label}</span>{item.detail && <span className="pkdetail">{item.detail}</span>}</span>
              </div>
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
  // the list floats above dialogs and sheets
  return createPortal(list, document.querySelector("dialog#dlg[open]") ?? document.body);
}
