// ---------- menu bar and mode tabs: File, Edit, View and Help menus built from data, and the tabs that switch the program ----------
import { useEffect, useState } from "react";
import type { Action } from "../actions";
import { ACCOUNT_MENU, MENUS, MODE_TABS } from "../menus";
import { PRESET_NAMES } from "../dock";
import { useApp } from "../store";

type Open = { id: string; x: number; y: number; items: string[] } | null;

/** A list of commands under a menu. Commands that do not apply are left out, and so are separators with nothing between. */
export function DropDown({ open, actions, onClose }: { open: NonNullable<Open>; actions: Record<string, Action>; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);
  const shown = open.items.filter((item) => item === "-" || (actions[item] && !actions[item]!.disabled));
  const items = shown.filter((item, index) => item !== "-" || (index > 0 && index < shown.length - 1 && shown[index - 1] !== "-"));
  return (
    <div id="dropdown" role="menu" style={{ left: open.x, top: open.y }} onMouseDown={(event) => event.stopPropagation()}>
      {items.map((item, index) => {
        if (item === "-") return <div className="ddsep" key={`sep-${index}`} />;
        const action = actions[item]!;
        return (
          <div key={item} role="menuitem" data-action={item} className="dd" onClick={() => { onClose(); action.run(); }}>
            <span className="ck">{action.on ? "✓" : ""}</span>
            <span className="dl">{action.label}</span>
            <span className="k">{action.key ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The workspaces as menu commands (ws:name), checked when in use; "workspaces" in a menu stands for all of them. */
export function useWorkspaceActions(actions: Record<string, Action>) {
  const store = useApp();
  const names = [...PRESET_NAMES, ...Object.keys(store.prefs.workspaces)];
  const extra: Record<string, Action> = {};
  for (const name of names) extra[`ws:${name}`] = { label: `${name} workspace`, icon: "panels", on: store.prefs.workspace === name, run: () => store.applyWorkspace(name) };
  const expand = (items: string[]) => items.flatMap((item) => (item === "workspaces" ? names.map((name) => `ws:${name}`) : [item]));
  return { all: { ...actions, ...extra }, expand };
}

/**
 * The top bar on the desktop: the program name, the File, Edit, View and Help menus, the open deck, and the account menu.
 * A menu opens on click; while one is open, moving to another menu opens that one.
 */
export function TitleBar({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const [open, setOpen] = useState<Open>(null);
  const { all, expand } = useWorkspaceActions(actions);
  const openMenu = (id: string, element: HTMLElement) => {
    const menu = MENUS.find((item) => item.id === id);
    if (!menu) return;
    const rect = element.getBoundingClientRect();
    setOpen({ id, x: rect.left, y: rect.bottom, items: expand(menu.items) });
  };
  return (
    <div id="titlebar">
      <span className="brand" aria-hidden="true">M</span>
      <span className="apptitle">Mana Vault</span>
      {store.serverName && <span className="servername">{store.serverName}</span>}
      <nav id="menubar" role="menubar" aria-label="Menus">
        {MENUS.map((menu) => (
          <div key={menu.id} role="menuitem" aria-haspopup="menu" aria-expanded={open?.id === menu.id} data-menu={menu.name}
            className={open?.id === menu.id ? "mbtn open" : "mbtn"}
            onMouseDown={(event) => {
              event.stopPropagation();
              if (open?.id === menu.id) return setOpen(null);
              openMenu(menu.id, event.currentTarget);
            }}
            onMouseEnter={(event) => { if (open && open.id !== menu.id && open.id !== "account") openMenu(menu.id, event.currentTarget); }}>
            {menu.name}
          </div>
        ))}
      </nav>
      <div id="docname">{store.deck ? `Deck: ${store.deck.name}` : ""}</div>
      <div
        id="acct"
        className={open?.id === "account" ? "menu open" : "menu"}
        role="button"
        tabIndex={-1}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (open?.id === "account") return setOpen(null);
          const rect = event.currentTarget.getBoundingClientRect();
          setOpen({ id: "account", x: Math.max(4, rect.right - 230), y: rect.bottom, items: ACCOUNT_MENU.filter((id) => id !== "admin" || !!store.user.admin) });
        }}
      >
        {store.user.name}
        {store.offers.inbox.length > 0 && <span className="cbadge" title={`${store.offers.inbox.length} waiting in your Inbox`}>{store.offers.inbox.length}</span>}
      </div>
      {open && <DropDown open={open} actions={all} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The mode tabs: Home, Search, Collection, Decks, Trade and Proxies. A tab switches the program to that part. */
export function ModeTabs({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const current = store.cardPage ? null : store.view;
  return (
    <div id="modetabs" role="tablist" aria-label="Mode">
      {MODE_TABS.map((tab) => {
        const action = actions[tab.action];
        const on = current === tab.view;
        return (
          <div key={tab.action} role="tab" aria-selected={on} className={on ? "mtab active" : "mtab"} title={action?.key ? `${tab.name} (${action.key})` : tab.name}
            onClick={() => { store.setCardPage(null); action?.run(); }}>
            {tab.name}
            {tab.view === "trade" && store.waitingTrades > 0 && <span className="cbadge">{store.waitingTrades}</span>}
          </div>
        );
      })}
    </div>
  );
}
