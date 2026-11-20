// ---------- ribbon: tabs of grouped buttons, built from data; related commands share one button with a list ----------
import { useEffect, useState } from "react";
import type { Action } from "../actions";
import { Icon } from "../icons";
import { ACCOUNT_MENU, DEFAULT_RIBBON, type RibbonGroup } from "../ribbon";
import { PRESET_NAMES } from "../dock";
import { useApp } from "../store";

type Open = { id: string; x: number; y: number; items: string[] } | null;

/** A list of commands under a button. Commands that do not apply are left out. */
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
  return (
    <div id="dropdown" role="menu" style={{ left: open.x, top: open.y }} onMouseDown={(event) => event.stopPropagation()}>
      {open.items.map((item, index) => {
        if (item === "-") return <div className="ddsep" key={`sep-${index}`} />;
        const action = actions[item];
        if (!action || action.disabled) return null;
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

/** Whether a group's context applies now: a deck is open, or the collection view is shown. */
export function useGroupShown() {
  const store = useApp();
  return (group: RibbonGroup) => !group.context || (group.context === "deck" ? !!store.deck : store.view === "collection");
}

/** The top bar on the desktop: the program name, the open deck, and the account menu. */
export function TitleBar({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const [open, setOpen] = useState<Open>(null);
  return (
    <div id="titlebar">
      <span className="brand" aria-hidden="true">M</span>
      <span className="apptitle">Mana Vault</span>
      {store.serverName && <span className="servername">{store.serverName}</span>}
      <div id="docname">{store.deck ? `Deck: ${store.deck.name}` : ""}</div>
      <div
        id="acct"
        className={open ? "menu open" : "menu"}
        role="button"
        tabIndex={-1}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (open) return setOpen(null);
          const rect = event.currentTarget.getBoundingClientRect();
          setOpen({ id: "account", x: Math.max(4, rect.right - 230), y: rect.bottom, items: ACCOUNT_MENU.filter((id) => id !== "admin" || !!store.user.admin) });
        }}
      >
        {store.user.name}
        {store.offers.inbox.length > 0 && <span className="cbadge" title={`${store.offers.inbox.length} waiting in your Inbox`}>{store.offers.inbox.length}</span>}
      </div>
      {open && <DropDown open={open} actions={actions} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function Ribbon({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const ribbon = store.prefs.ribbon ?? DEFAULT_RIBBON;
  const active = ribbon.find((tab) => tab.id === store.prefs.ribbonTab) ?? ribbon[0];
  const shown = useGroupShown();
  const [open, setOpen] = useState<Open>(null);
  const [wsOpen, setWsOpen] = useState<{ x: number; y: number } | null>(null);

  // opening a deck shows the Decks tab, where its commands appear
  const deckId = store.deck?.id;
  useEffect(() => {
    if (deckId && ribbon.some((tab) => tab.id === "decks")) store.setPrefs({ ribbonTab: "decks" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const workspaceNames = [...PRESET_NAMES, ...Object.keys(store.prefs.workspaces)];
  const visible = (id: string) => {
    const action = actions[id];
    if (!action) return false;
    if (action.items) return action.items.some((item) => actions[item] && !actions[item]!.disabled);
    return !action.disabled;
  };

  return (
    <div id="toolbar" className={`rsize-${store.prefs.ribbonSize}`}>
      <div className="rtabs" role="tablist">
        {ribbon.map((tab) => (
          <div key={tab.id} role="tab" aria-selected={tab === active} className={`rtab${tab === active ? " active" : ""}`}
            onClick={() => store.setPrefs({ ribbonTab: tab.id })}>
            {tab.name}
          </div>
        ))}
        <div className="wsbox">
          Workspace
          <button type="button" className="wsbtn" aria-haspopup="menu" aria-expanded={wsOpen !== null}
            onMouseDown={(event) => {
              event.stopPropagation();
              if (wsOpen) return setWsOpen(null);
              const rect = event.currentTarget.getBoundingClientRect();
              setWsOpen({ x: Math.max(4, rect.right - 230), y: rect.bottom });
            }}>{workspaceNames.includes(store.prefs.workspace) ? store.prefs.workspace : "Custom"} ▾</button>
        </div>
      </div>
      <div className="rpanel" role="toolbar" aria-label={active?.name}>
        {active?.groups.filter(shown).map((group, index) => {
          const items = group.items.filter(visible);
          if (!items.length) return null;
          return (
            <div className={group.context ? "rgroup ctx" : "rgroup"} key={`${group.name}-${index}`}>
              <div className="ritems">
                {items.map((id, itemIndex) => {
                  const action = actions[id]!;
                  const list = action.items;
                  return (
                    <button
                      key={`${id}-${itemIndex}`}
                      type="button"
                      data-action={id}
                      data-label={action.label}
                      data-labels={list ? list.map((item) => actions[item]?.label ?? "").join("\n") : undefined}
                      aria-haspopup={list ? "menu" : undefined}
                      className={`rb${action.on ? " on" : ""}${list ? " rmenu" : ""}`}
                      title={`${action.label.replace(/^(Undo|Redo) .+/, "$1")}${action.key ? ` (${action.key})` : ""}`}
                      onMouseDown={list ? (event) => {
                        event.stopPropagation();
                        if (open?.id === id) return setOpen(null);
                        const rect = event.currentTarget.getBoundingClientRect();
                        setOpen({ id, x: rect.left, y: rect.bottom, items: list });
                      } : undefined}
                      onClick={list ? undefined : action.run}
                    >
                      <Icon name={action.icon} />
                      <span>{action.short ?? action.label}{list ? " ▾" : ""}</span>
                    </button>
                  );
                })}
              </div>
              <div className="rgname">{group.name}</div>
            </div>
          );
        })}
      </div>
      {open && <DropDown open={open} actions={actions} onClose={() => setOpen(null)} />}
      {wsOpen && <WorkspaceMenu at={wsOpen} names={workspaceNames} actions={actions} onClose={() => setWsOpen(null)} />}
    </div>
  );
}

/** The workspace list at the end of the ribbon tabs: every workspace, then the workspace commands. */
function WorkspaceMenu({ at, names, actions, onClose }: { at: { x: number; y: number }; names: string[]; actions: Record<string, Action>; onClose: () => void }) {
  const store = useApp();
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
  return (
    <div id="dropdown" role="menu" aria-label="Workspaces" style={{ left: at.x, top: at.y }} onMouseDown={(event) => event.stopPropagation()}>
      {names.map((name) => (
        <div key={name} role="menuitem" className="dd" onClick={() => { onClose(); store.applyWorkspace(name); }}>
          <span className="ck">{store.prefs.workspace === name ? "✓" : ""}</span><span className="dl">{name}</span><span className="k" />
        </div>
      ))}
      <div className="ddsep" />
      {["workspace.save", "workspace.manage", "workspace.reset"].map((id) => actions[id] && (
        <div key={id} role="menuitem" className="dd" onClick={() => { onClose(); actions[id]!.run(); }}>
          <span className="ck" /><span className="dl">{actions[id]!.label}</span><span className="k" />
        </div>
      ))}
    </div>
  );
}
