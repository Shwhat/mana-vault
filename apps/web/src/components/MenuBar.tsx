// ---------- menu bar ----------
import { useEffect, useRef, useState } from "react";
import type { Action } from "../actions";
import { MENUS, type MenuItem } from "../ribbon";
import { useApp } from "../store";

type Open = { name: string; x: number; y: number; items: MenuItem[] } | null;

export function DropDown({ open, actions, onClose }: { open: NonNullable<Open>; actions: Record<string, Action>; onClose: () => void }) {
  return (
    <div id="dropdown" role="menu" style={{ left: open.x, top: open.y }} onMouseDown={(event) => event.stopPropagation()}>
      {open.items.map((item, index) => {
        if (item === "-") return <div className="ddsep" key={`sep-${index}`} />;
        const action = actions[item];
        if (!action) return null;
        return (
          <div
            key={item}
            role="menuitem"
            data-action={item}
            className={`dd${action.disabled ? " off" : ""}`}
            aria-disabled={action.disabled || undefined}
            onClick={() => {
              if (action.disabled) return;
              onClose();
              action.run();
            }}
          >
            <span className="ck">{action.on ? "✓" : ""}</span>
            <span className="dl">{action.label}</span>
            <span className="k">{action.key ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MenuBar({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const [open, setOpen] = useState<Open>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const openMenu = (name: string, items: MenuItem[], element: HTMLElement, alignRight = false) => {
    const rect = element.getBoundingClientRect();
    const x = alignRight ? Math.max(4, rect.right - 230) : rect.left;
    setOpen({ name, x, y: rect.bottom, items });
  };

  const account: MenuItem[] = ["inbox", "-", "password", "devices", "-", "signout"];

  return (
    <div id="menubar" ref={bar}>
      <span className="brand" aria-hidden="true">M</span>
      {MENUS.map((menu) => (
        <div
          key={menu.name}
          className={open?.name === menu.name ? "menu open" : "menu"}
          role="button"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.stopPropagation();
            if (open?.name === menu.name) setOpen(null);
            else openMenu(menu.name, menu.items, event.currentTarget);
          }}
          onMouseEnter={(event) => { if (open && open.name !== menu.name) openMenu(menu.name, menu.items, event.currentTarget); }}
        >
          {menu.name}
        </div>
      ))}
      <div id="docname">{store.deck ? `Deck: ${store.deck.name}` : "No deck open"}</div>
      <div
        id="acct"
        className={open?.name === "account" ? "menu open" : "menu"}
        role="button"
        tabIndex={-1}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (open?.name === "account") setOpen(null);
          else openMenu("account", account, event.currentTarget, true);
        }}
      >
        {store.user.name}
        {store.offers.inbox.length > 0 && <span className="cbadge" title={`${store.offers.inbox.length} waiting in your Inbox`}>{store.offers.inbox.length}</span>}
      </div>
      {open && <DropDown open={open} actions={actions} onClose={() => setOpen(null)} />}
    </div>
  );
}
