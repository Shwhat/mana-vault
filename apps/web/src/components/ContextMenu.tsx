// ---------- right-click and long-press menus on cards and rows ----------
import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { type ContextMenu, type Store, useApp } from "../store";

type Item = { label: string; run: () => void };

/**
 * Props for a row that opens a menu: right-click on the desktop, a long press (half a second) on a phone.
 * A long press does not also count as a tap.
 */
export function rowMenu(store: Store, title: string, build: () => Array<Item | false | null | undefined>) {
  const open = (x: number, y: number) => {
    const items = build().filter((item): item is Item => !!item);
    if (items.length) store.setContextMenu({ x, y, title, items });
  };
  let timer: number | undefined;
  let start: { x: number; y: number } | null = null;
  return {
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      open(event.clientX, event.clientY);
    },
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      start = { x: event.clientX, y: event.clientY };
      const { clientX, clientY } = event;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        start = null;
        // the click that follows the long press is swallowed
        const swallow = (click: Event) => { click.stopPropagation(); click.preventDefault(); };
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 600);
        open(clientX, clientY);
      }, 500);
    },
    onPointerMove: (event: PointerEvent) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) window.clearTimeout(timer);
    },
    onPointerUp: () => window.clearTimeout(timer),
    onPointerCancel: () => window.clearTimeout(timer),
  };
}

export function ContextMenuHost() {
  const store = useApp();
  const menu: ContextMenu = store.contextMenu;
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (element.current && event.target instanceof Node && element.current.contains(event.target)) return;
      store.setContextMenu(null);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") store.setContextMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [menu, store]);
  if (!menu) return null;
  // kept inside the window
  const width = 240;
  const x = Math.max(4, Math.min(menu.x, window.innerWidth - width - 4));
  const y = Math.max(4, Math.min(menu.y, window.innerHeight - (menu.items.length * 40 + 40)));
  // inside an open window (a modal dialog) the menu is put in the window, so it can be used there
  const host = document.querySelector<HTMLDialogElement>("dialog#dlg[open]");
  const content = (
    <div id="ctxmenu" ref={element} role="menu" aria-label={menu.title} style={{ left: x, top: y, width }}>
      <div className="ctxtitle">{menu.title}</div>
      {menu.items.map((item) => (
        <div key={item.label} role="menuitem" className="dd" onClick={() => { store.setContextMenu(null); item.run(); }}>
          <span className="dl">{item.label}</span>
        </div>
      ))}
    </div>
  );
  return host ? createPortal(content, host) : content;
}
