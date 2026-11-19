// ---------- docking: panels in left, right and bottom areas, tabbed groups, splitters and floating windows ----------
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  type AreaId, clone, type DropTarget, type Group, type Layout, movePanel, type PanelId, PANELS, removePanel,
} from "../dock";
import { Icon } from "../icons";
import { useApp } from "../store";

type Hint = { left: number; top: number; width: number; height: number } | null;

function startPointerDrag(event: ReactPointerEvent, onMove: (dx: number, dy: number, e: PointerEvent) => void, onUp?: (e: PointerEvent) => void) {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const move = (e: PointerEvent) => onMove(e.clientX - startX, e.clientY - startY, e);
  const up = (e: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.classList.remove("dragging");
    onUp?.(e);
  };
  document.body.classList.add("dragging");
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

export function Dock({ renderPanel, children }: { renderPanel: (panel: PanelId) => ReactNode; children: ReactNode }) {
  const store = useApp();
  const layout = store.prefs.layout;
  const setLayout = store.setLayout;
  const main = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<Hint>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);
  // the floating window being moved lets the pointer see what is under it
  const [moving, setMoving] = useState<string | null>(null);

  const markCustom = (next: Layout) => setLayout(next);

  function targetAt(x: number, y: number, dragging: PanelId): { target: DropTarget; hint: Hint } | null {
    const box = main.current?.getBoundingClientRect();
    if (!box) return null;
    const edge = 26;
    if (x < box.left + edge) return { target: { kind: "area", area: "left" }, hint: { left: box.left, top: box.top, width: 240, height: box.height } };
    if (x > box.right - edge) return { target: { kind: "area", area: "right" }, hint: { left: box.right - 280, top: box.top, width: 280, height: box.height } };
    if (y > box.bottom - edge) return { target: { kind: "area", area: "bottom" }, hint: { left: box.left, top: box.bottom - 170, width: box.width, height: 170 } };
    const element = document.elementFromPoint(x, y);
    const groupElement = element?.closest<HTMLElement>("[data-dgroup]");
    if (groupElement) {
      const groupId = groupElement.dataset.dgroup ?? "";
      const r = groupElement.getBoundingClientRect();
      const floating = !!groupElement.closest(".dfloat");
      const whole = { left: r.left, top: r.top, width: r.width, height: r.height };
      if (element?.closest(".dtabs") || floating) return { target: { kind: "tab", groupId }, hint: whole };
      const fx = (x - r.left) / r.width;
      const fy = (y - r.top) / r.height;
      if (fx < 0.22) return { target: { kind: "column", groupId, side: "before" }, hint: { ...whole, width: r.width / 2 } };
      if (fx > 0.78) return { target: { kind: "column", groupId, side: "after" }, hint: { ...whole, left: r.left + r.width / 2, width: r.width / 2 } };
      if (fy < 0.3) return { target: { kind: "split", groupId, side: "before" }, hint: { ...whole, height: r.height / 2 } };
      if (fy > 0.7) return { target: { kind: "split", groupId, side: "after" }, hint: { ...whole, top: r.top + r.height / 2, height: r.height / 2 } };
      return { target: { kind: "tab", groupId }, hint: whole };
    }
    if (element?.closest("#dockmid")) {
      const left = Math.max(box.left, x - 60);
      const top = Math.max(box.top, y - 12);
      return { target: { kind: "float", x: left, y: top }, hint: { left, top, width: 300, height: 360 } };
    }
    void dragging;
    return null;
  }

  function onTabPointerDown(event: ReactPointerEvent, group: Group, panel: PanelId) {
    if ((event.target as HTMLElement).closest(".tabx") || event.button !== 0) return;
    let dragging = false;
    let found: ReturnType<typeof targetAt> = null;
    startPointerDrag(event, (dx, dy, e) => {
      if (!dragging && Math.hypot(dx, dy) < 6) return;
      dragging = true;
      setGhost({ x: e.clientX + 12, y: e.clientY + 8, title: PANELS[panel].title });
      found = targetAt(e.clientX, e.clientY, panel);
      setHint(found?.hint ?? null);
    }, () => {
      setGhost(null);
      setHint(null);
      if (!dragging) {
        const next = clone(layout);
        for (const item of [...(["left", "right", "bottom"] as AreaId[]).flatMap((id) => next[id].columns.flatMap((c) => c.groups)), ...next.floating.map((f) => f.group)]) {
          if (item.id === group.id) item.active = panel;
        }
        setLayout(next);
        return;
      }
      if (found) markCustom(movePanel(layout, panel, found.target));
    });
  }

  function renderGroup(group: Group, style?: React.CSSProperties) {
    return (
      <div className="dgroup" data-dgroup={group.id} key={group.id} style={style}>
        <div className="dtabs">
          {group.panels.map((panel) => (
            <div
              key={panel}
              className={panel === group.active ? "tab active" : "tab"}
              data-panel={panel}
              onPointerDown={(event) => onTabPointerDown(event, group, panel)}
            >
              <Icon name={PANELS[panel].icon} className="nicon" />
              {PANELS[panel].title}
              <span className="tabx" title={`Close ${PANELS[panel].title}`} role="button" onClick={() => setLayout(removePanel(layout, panel))}>×</span>
            </div>
          ))}
        </div>
        <div className="dgbody">{renderPanel(group.active)}</div>
      </div>
    );
  }

  function areaResize(event: ReactPointerEvent, id: AreaId) {
    const start = layout[id].size;
    startPointerDrag(event, (dx, dy) => {
      const delta = id === "left" ? dx : id === "right" ? -dx : -dy;
      const limit = id === "bottom" ? window.innerHeight * 0.6 : window.innerWidth * 0.45;
      const next = clone(layout);
      next[id].size = Math.round(Math.max(160, Math.min(limit, start + delta)));
      setLayout(next);
    });
  }

  function weightResize(event: ReactPointerEvent, id: AreaId, columnIndex: number, groupIndex: number | null) {
    const container = (event.currentTarget as HTMLElement).parentElement;
    if (!container) return;
    const horizontal = groupIndex === null;
    const total = horizontal ? container.clientWidth : container.clientHeight;
    const base = clone(layout);
    const index = groupIndex === null ? columnIndex : groupIndex;
    const baseItems = groupIndex === null ? base[id].columns : base[id].columns[columnIndex]?.groups ?? [];
    const startWeight = baseItems[index]?.weight ?? 1;
    startPointerDrag(event, (dx, dy) => {
      const next = clone(base);
      const items = groupIndex === null ? next[id].columns : next[id].columns[columnIndex]?.groups ?? [];
      const a = items[index];
      const b = items[index + 1];
      if (!a || !b) return;
      const sum = items.reduce((s, item) => s + item.weight, 0);
      const change = ((horizontal ? dx : dy) / Math.max(1, total)) * sum;
      const pair = a.weight + b.weight;
      const min = pair * 0.12;
      a.weight = Math.max(min, Math.min(pair - min, startWeight + change));
      b.weight = pair - a.weight;
      setLayout(next);
    });
  }

  function renderArea(id: AreaId) {
    const area = layout[id];
    if (!area.columns.length) return null;
    const style = id === "bottom" ? { height: area.size } : { width: area.size };
    return (
      <div className="dock" id={`dock-${id}`} style={style}>
        {area.columns.map((column, columnIndex) => (
          <FragmentWithSplit key={column.id} show={columnIndex > 0} split={<div className="dsplit v" onPointerDown={(event) => weightResize(event, id, columnIndex - 1, null)} />}>
            <div className="dcol" style={{ flex: `${column.weight} 1 0` }}>
              {column.groups.map((group, groupIndex) => (
                <FragmentWithSplit key={group.id} show={groupIndex > 0} split={<div className="dsplit h" onPointerDown={(event) => weightResize(event, id, columnIndex, groupIndex - 1)} />}>
                  {renderGroup(group, { flex: `${group.weight} 1 0` })}
                </FragmentWithSplit>
              ))}
            </div>
          </FragmentWithSplit>
        ))}
        <div className="dedge" onPointerDown={(event) => areaResize(event, id)} />
      </div>
    );
  }

  /**
   * Dragging a floating window by its grip moves it. Over another panel, a window edge or a docked area it shows where
   * the window will land, and letting go docks all its panels there (joined as tabs, split beside, or docked at the
   * edge). In open space its edges snap to the edges of other floating windows.
   */
  function floatMove(event: ReactPointerEvent, floatId: string, mode: string) {
    if ((event.target as HTMLElement).closest(".tab") && mode === "move") return;
    const base = layout.floating.find((item) => item.id === floatId);
    if (!base) return;
    let found: ReturnType<typeof targetAt> = null;
    if (mode === "move") setMoving(floatId);
    startPointerDrag(event, (dx, dy, e) => {
      const next = clone(layout);
      const item = next.floating.find((f) => f.id === floatId);
      if (!item) return;
      if (mode === "move") {
        found = targetAt(e.clientX, e.clientY, base.group.active);
        if (found?.target.kind === "float") found = null;
        setHint(found?.hint ?? null);
        let x = Math.max(0, Math.min(window.innerWidth - 80, base.x + dx));
        let y = Math.max(0, Math.min(window.innerHeight - 40, base.y + dy));
        if (!found) [x, y] = snapEdges(next.floating.filter((other) => other.id !== floatId), x, y, item.w, item.h);
        item.x = x;
        item.y = y;
      } else {
        if (mode.includes("e")) item.w = Math.max(180, base.w + dx);
        if (mode.includes("s")) item.h = Math.max(120, base.h + dy);
        if (mode.includes("w")) { item.w = Math.max(180, base.w - dx); item.x = base.x + base.w - item.w; }
        if (mode.includes("n")) { item.h = Math.max(120, base.h - dy); item.y = base.y + base.h - item.h; }
      }
      setLayout(next);
    }, () => {
      setMoving(null);
      setHint(null);
      if (mode === "move" && found) markCustom(dockGroup(layout, base.group.panels, base.group.active, found.target));
    });
  }

  return (
    <div id="main" ref={main}>
      {renderArea("left")}
      <div id="center">
        <div id="dockmid">{children}</div>
        {renderArea("bottom")}
      </div>
      {renderArea("right")}
      <div id="dockfloat">
        {layout.floating.map((item) => (
          <div className={moving === item.id ? "dfloat moving" : "dfloat"} key={item.id} style={{ left: item.x, top: item.y, width: item.w, height: item.h }}>
            <div className="dgrip" onPointerDown={(event) => floatMove(event, item.id, "move")} title="Drag to move" />
            {renderGroup(item.group)}
            {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((mode) => (
              <div key={mode} className={`drs ${mode}`} onPointerDown={(event) => floatMove(event, item.id, mode)} />
            ))}
          </div>
        ))}
      </div>
      {hint && <div id="dockhint" style={hint} />}
      {ghost && <div className="dragghost" style={{ left: ghost.x, top: ghost.y }}>{ghost.title}</div>}
    </div>
  );
}

function FragmentWithSplit({ show, split, children }: { show: boolean; split: ReactNode; children: ReactNode }) {
  return <>{show && split}{children}</>;
}

const SNAP = 10;
/** Moves a floating window's position so an edge that comes within a few pixels of another window's edge lines up with it. */
export function snapEdges(others: Array<{ x: number; y: number; w: number; h: number }>, x: number, y: number, w: number, h: number): [number, number] {
  let bestX: number | null = null;
  let bestY: number | null = null;
  for (const other of others) {
    const overlapY = y < other.y + other.h + SNAP && y + h > other.y - SNAP;
    const overlapX = x < other.x + other.w + SNAP && x + w > other.x - SNAP;
    if (overlapY) {
      for (const candidate of [other.x + other.w, other.x - w, other.x, other.x + other.w - w]) {
        if (Math.abs(candidate - x) <= SNAP && (bestX === null || Math.abs(candidate - x) < Math.abs(bestX - x))) bestX = candidate;
      }
    }
    if (overlapX) {
      for (const candidate of [other.y + other.h, other.y - h, other.y, other.y + other.h - h]) {
        if (Math.abs(candidate - y) <= SNAP && (bestY === null || Math.abs(candidate - y) < Math.abs(bestY - y))) bestY = candidate;
      }
    }
  }
  return [bestX ?? x, bestY ?? y];
}

/** Docks every panel of a group at a drop target: the first goes to the target, the rest join it as tabs. */
export function dockGroup(layout: Layout, panels: PanelId[], active: PanelId, target: DropTarget): Layout {
  const [first, ...rest] = panels;
  if (!first) return layout;
  let next = movePanel(layout, first, target);
  const home = () => [...(["left", "right", "bottom"] as AreaId[]).flatMap((id) => next[id].columns.flatMap((c) => c.groups)), ...next.floating.map((f) => f.group)]
    .find((item) => item.panels.includes(first));
  for (const panel of rest) {
    const group = home();
    if (group) next = movePanel(next, panel, { kind: "tab", groupId: group.id });
  }
  const group = home();
  if (group && group.panels.includes(active)) group.active = active;
  return next;
}
