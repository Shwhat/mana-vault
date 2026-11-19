// ---------- Options: a button that opens a small panel of view settings ----------
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import type { CollectionLayout, GridSize } from "../types";

/** The Options button: a count of active settings beside it, the panel under it (a sheet at the top on a phone), Done or Escape closes it. */
export function OptionsButton({ label = "Options", title, count = 0, children }: { label?: string; title: string; count?: number; children: ReactNode }) {
  const store = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && (box.current?.contains(event.target) || button.current?.contains(event.target))) return;
      // a picker list opened from the panel is part of it
      if (event.target instanceof Element && event.target.closest(".pkpop")) return;
      setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector(".pkpop")) setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  const rect = button.current?.getBoundingClientRect();
  const style = store.phone || !rect ? undefined : { left: Math.max(4, Math.min(rect.left, window.innerWidth - 300)), top: rect.bottom + 2 };
  return (
    <>
      <button ref={button} type="button" className={count ? "btn small on" : "btn small"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}{count ? <span className="cbadge">{count}</span> : null} ▾</button>
      {open && (
        <div ref={box} className={store.phone ? "optpop phone" : "optpop"} style={style} role="dialog" aria-label={title}>
          {children}
          <div className="btnrow end"><button type="button" className="btn small" onClick={() => setOpen(false)}>Done</button></div>
        </div>
      )}
    </>
  );
}

/** A row of buttons where one is on, such as Grid, Binder, List. */
export function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([item, text]) => (
        <button key={item} type="button" className={value === item ? "on" : ""} aria-pressed={value === item} onClick={() => onChange(item)}>{text}</button>
      ))}
    </div>
  );
}

export const LAYOUTS: Array<[CollectionLayout, string]> = [["grid", "Grid"], ["binder", "Binder"], ["list", "List"]];
export const SIZES: Array<[GridSize, string]> = [["s", "Small"], ["m", "Medium"], ["l", "Large"]];

/** Layout and card size rows for an Options panel. */
export function LayoutRows({ layout, size, onLayout, onSize, name }: {
  layout: CollectionLayout; size: GridSize; onLayout: (value: CollectionLayout) => void; onSize: (value: GridSize) => void; name: string;
}) {
  return (
    <>
      <div className="prow"><label>Layout</label><Segments label={`${name} layout`} value={layout} options={LAYOUTS} onChange={onLayout} /></div>
      {layout === "grid" && <div className="prow"><label>Card size</label><Segments label="Card size" value={size} options={SIZES} onChange={onSize} /></div>}
    </>
  );
}
