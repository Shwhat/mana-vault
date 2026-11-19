// ---------- docking model: areas hold columns, columns hold groups, groups hold panels as tabs ----------
import type { View } from "./types";

export type PanelId = "filters" | "decks" | "card" | "decklist" | "review";
export type AreaId = "left" | "right" | "bottom";

export const PANELS: Record<PanelId, { title: string; icon: string }> = {
  filters: { title: "Filters", icon: "filters" },
  decks: { title: "Decks", icon: "deck" },
  card: { title: "Card", icon: "cards" },
  decklist: { title: "Deck list", icon: "zone" },
  review: { title: "Import review", icon: "listin" },
};
export const PANEL_IDS = Object.keys(PANELS) as PanelId[];

export type Group = { id: string; panels: PanelId[]; active: PanelId; weight: number };
export type Column = { id: string; groups: Group[]; weight: number };
export type Area = { size: number; columns: Column[] };
export type Floating = { id: string; x: number; y: number; w: number; h: number; group: Group };
export type Layout = { left: Area; right: Area; bottom: Area; floating: Floating[] };
export type Workspace = { layout: Layout; view: Exclude<View, "about"> };

let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const group = (panels: PanelId[], weight = 1): Group => ({ id: uid(), panels, active: panels[0] as PanelId, weight });
const column = (groups: Group[], weight = 1): Column => ({ id: uid(), groups, weight });
const area = (size: number, columns: Column[] = []): Area => ({ size, columns });

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const PRESETS: Record<string, () => Workspace> = {
  Search: () => ({
    view: "cards",
    layout: {
      left: area(240, [column([group(["filters"])])]),
      right: area(300, [column([group(["card"])])]),
      bottom: area(170),
      floating: [],
    },
  }),
  Collection: () => ({
    view: "collection",
    layout: {
      left: area(220),
      right: area(300, [column([group(["card"])])]),
      bottom: area(170, [column([group(["review"])])]),
      floating: [],
    },
  }),
  "Deck building": () => ({
    view: "cards",
    layout: {
      left: area(250, [column([group(["filters", "decks"])])]),
      right: area(330, [column([group(["decklist"], 1.4), group(["card"], 1)])]),
      bottom: area(170),
      floating: [],
    },
  }),
};
export const PRESET_NAMES = Object.keys(PRESETS);
export const DEFAULT_WORKSPACE = "Deck building";

const AREAS: AreaId[] = ["left", "right", "bottom"];

export function allGroups(layout: Layout): Group[] {
  return [
    ...AREAS.flatMap((id) => layout[id].columns.flatMap((col) => col.groups)),
    ...layout.floating.map((item) => item.group),
  ];
}

export function isOpen(layout: Layout, panel: PanelId): boolean {
  return allGroups(layout).some((item) => item.panels.includes(panel));
}

/** Removes a panel wherever it is, then removes any group, column or floating window left empty. */
export function removePanel(layout: Layout, panel: PanelId): Layout {
  const next = clone(layout);
  for (const id of AREAS) {
    for (const col of next[id].columns) {
      for (const item of col.groups) {
        item.panels = item.panels.filter((p) => p !== panel);
        if (item.active === panel && item.panels.length) item.active = item.panels[0] as PanelId;
      }
      col.groups = col.groups.filter((item) => item.panels.length);
    }
    next[id].columns = next[id].columns.filter((col) => col.groups.length);
  }
  next.floating = next.floating.filter((item) => {
    item.group.panels = item.group.panels.filter((p) => p !== panel);
    if (item.group.active === panel && item.group.panels.length) item.group.active = item.group.panels[0] as PanelId;
    return item.group.panels.length;
  });
  return next;
}

export type DropTarget =
  | { kind: "tab"; groupId: string }
  | { kind: "split"; groupId: string; side: "before" | "after" }
  | { kind: "column"; groupId: string; side: "before" | "after" }
  | { kind: "area"; area: AreaId }
  | { kind: "float"; x: number; y: number };

function findGroup(layout: Layout, groupId: string): { group: Group; column?: Column; area?: AreaId } | null {
  for (const id of AREAS) {
    for (const col of layout[id].columns) {
      const found = col.groups.find((item) => item.id === groupId);
      if (found) return { group: found, column: col, area: id };
    }
  }
  const floating = layout.floating.find((item) => item.group.id === groupId);
  return floating ? { group: floating.group } : null;
}

/** Moves a panel to a drop target and makes it the active tab there. */
export function movePanel(layout: Layout, panel: PanelId, target: DropTarget): Layout {
  // dropping a panel onto its own single-panel group changes nothing
  if (target.kind === "tab" || target.kind === "split" || target.kind === "column") {
    const current = findGroup(layout, target.groupId);
    if (current && current.group.panels.length === 1 && current.group.panels[0] === panel) return layout;
  }
  const next = removePanel(layout, panel);
  if (target.kind === "float") {
    next.floating.push({ id: uid(), x: target.x, y: target.y, w: 300, h: 360, group: group([panel]) });
    return next;
  }
  if (target.kind === "area") {
    const area = next[target.area];
    if (!area.columns.length) area.columns.push(column([group([panel])]));
    else if (target.area === "right") area.columns.push(column([group([panel])]));
    else if (target.area === "left") area.columns.unshift(column([group([panel])]));
    else area.columns.push(column([group([panel])]));
    return next;
  }
  const found = findGroup(next, target.groupId);
  if (!found) {
    next.floating.push({ id: uid(), x: 200, y: 160, w: 300, h: 360, group: group([panel]) });
    return next;
  }
  if (target.kind === "tab") {
    found.group.panels.push(panel);
    found.group.active = panel;
    return next;
  }
  if (!found.column || !found.area) {
    // splitting a floating window adds the panel as a tab
    found.group.panels.push(panel);
    found.group.active = panel;
    return next;
  }
  if (target.kind === "split") {
    const index = found.column.groups.indexOf(found.group);
    found.column.groups.splice(target.side === "before" ? index : index + 1, 0, group([panel]));
    return next;
  }
  const columns = next[found.area].columns;
  const index = columns.indexOf(found.column);
  columns.splice(target.side === "before" ? index : index + 1, 0, column([group([panel])]));
  return next;
}

/** Shows a closed panel in the area it normally lives in. */
export function openPanel(layout: Layout, panel: PanelId): Layout {
  if (isOpen(layout, panel)) return activatePanel(layout, panel);
  const home: AreaId = panel === "filters" || panel === "decks" ? "left" : panel === "review" ? "bottom" : "right";
  const next = clone(layout);
  const first = next[home].columns[0]?.groups[0];
  if (first) {
    first.panels.push(panel);
    first.active = panel;
    return next;
  }
  return movePanel(next, panel, { kind: "area", area: home });
}

export function activatePanel(layout: Layout, panel: PanelId): Layout {
  const next = clone(layout);
  for (const item of allGroups(next)) if (item.panels.includes(panel)) item.active = panel;
  return next;
}

/** Checks a stored layout and falls back to the default when it is damaged. */
export function validLayout(value: unknown): value is Layout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<Layout>;
  const areaOk = (item: unknown) => !!item && typeof item === "object" && Array.isArray((item as Area).columns) && typeof (item as Area).size === "number";
  if (!areaOk(layout.left) || !areaOk(layout.right) || !areaOk(layout.bottom) || !Array.isArray(layout.floating)) return false;
  const panels = allGroups(layout as Layout).flatMap((item) => item.panels);
  return panels.every((p) => PANEL_IDS.includes(p)) && new Set(panels).size === panels.length;
}
