// ---------- picking several rows (0.19.0): checkboxes, Ctrl or Cmd click, Shift click and Select all, used by purchase history ----------
import { type MouseEvent, type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

export type Picks = {
  picked: Set<string>;
  /** A row's checkbox. */
  box: (id: string, label: string) => ReactElement;
  /** The heading checkbox: picks or clears every row shown. */
  allBox: (label: string) => ReactElement;
  /** For a row's click: true when the click picked (Ctrl, Cmd or Shift held), so the row does not open. */
  clickPicks: (id: string, event: MouseEvent) => boolean;
  clear: () => void;
};

/** Picking among the rows shown, in their order. Picks of rows no longer shown are dropped. */
export function usePicks(ids: string[]): Picks {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    setPicked((current) => {
      const kept = new Set([...current].filter((id) => ids.includes(id)));
      return kept.size === current.size ? current : kept;
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback((id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  }, []);
  const range = useCallback((id: string) => {
    const from = anchor ? ids.indexOf(anchor) : -1;
    const to = ids.indexOf(id);
    if (from < 0 || to < 0) return toggle(id);
    const [a, b] = from < to ? [from, to] : [to, from];
    setPicked((current) => new Set([...current, ...ids.slice(a, b + 1)]));
  }, [anchor, ids, toggle]);
  return useMemo(() => ({
    picked,
    box: (id: string, label: string) => (
      <input type="checkbox" className="pickbox" aria-label={`Pick ${label}`} checked={picked.has(id)}
        onClick={(event) => { event.stopPropagation(); if (event.shiftKey) { event.preventDefault(); range(id); } }}
        onChange={(event) => { if (!(event.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey) toggle(id); }} />
    ),
    allBox: (label: string) => {
      const all = ids.length > 0 && ids.every((id) => picked.has(id));
      return (
        <input type="checkbox" className="pickbox" aria-label={label} checked={all} disabled={!ids.length}
          ref={(element) => { if (element) element.indeterminate = !all && picked.size > 0; }}
          onChange={() => setPicked(all ? new Set() : new Set(ids))} />
      );
    },
    clickPicks: (id: string, event: MouseEvent) => {
      if (event.shiftKey) { range(id); return true; }
      if (event.ctrlKey || event.metaKey) { toggle(id); return true; }
      return false;
    },
    clear: () => setPicked(new Set()),
  }), [picked, ids, range, toggle]);
}

/** The bar shown above a table while rows are picked: "N picked", the actions and Clear. */
export function PickBar({ picks, children }: { picks: Picks; children: ReactNode }) {
  if (!picks.picked.size) return null;
  return (
    <div className="pickbar" role="toolbar" aria-label="Picked rows">
      <b>{picks.picked.size} picked</b>
      {children}
      <button type="button" className="btn small" onClick={picks.clear}>Clear</button>
    </div>
  );
}
