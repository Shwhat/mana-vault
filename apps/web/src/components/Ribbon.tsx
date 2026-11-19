// ---------- ribbon: tabs of grouped buttons, built from data ----------
import { useEffect } from "react";
import type { Action } from "../actions";
import { Icon } from "../icons";
import { DEFAULT_RIBBON } from "../ribbon";
import { PRESET_NAMES } from "../dock";
import { useApp } from "../store";

export function Ribbon({ actions }: { actions: Record<string, Action> }) {
  const store = useApp();
  const ribbon = store.prefs.ribbon ?? DEFAULT_RIBBON;
  const deckOpen = !!store.deck;
  const tabs = ribbon.filter((tab) => tab.contextual !== "deck" || deckOpen);
  const active = tabs.find((tab) => tab.id === store.prefs.ribbonTab) ?? tabs[0];
  const contextualId = ribbon.find((tab) => tab.contextual === "deck")?.id;

  // the contextual Deck tab is selected automatically when a deck is opened
  const deckId = store.deck?.id;
  useEffect(() => {
    if (deckId && contextualId) store.setPrefs({ ribbonTab: contextualId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const workspaceNames = [...PRESET_NAMES, ...Object.keys(store.prefs.workspaces)];

  return (
    <div id="toolbar">
      <div className="rtabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab === active}
            className={`rtab${tab === active ? " active" : ""}${tab.contextual ? " ctx" : ""}`}
            onClick={() => store.setPrefs({ ribbonTab: tab.id })}
          >
            {tab.name}
          </div>
        ))}
        <label className="wsbox">
          Workspace
          <select
            aria-label="Workspace"
            value={workspaceNames.includes(store.prefs.workspace) ? store.prefs.workspace : ""}
            onChange={(event) => store.applyWorkspace(event.target.value)}
          >
            {!workspaceNames.includes(store.prefs.workspace) && <option value="">Custom</option>}
            {workspaceNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <div className="rpanel" role="toolbar" aria-label={active?.name}>
        {active?.groups.map((group, index) => (
          <div className="rgroup" key={`${group.name}-${index}`}>
            <div className="ritems">
              {group.items.map((id, itemIndex) => {
                const action = actions[id];
                if (!action) return null;
                return (
                  <button
                    key={`${id}-${itemIndex}`}
                    type="button"
                    data-action={id}
                    className={`rb${action.on ? " on" : ""}`}
                    title={`${action.label.replace(/^(Undo|Redo) .+/, "$1")}${action.key ? ` (${action.key})` : ""}`}
                    disabled={action.disabled}
                    onClick={action.run}
                  >
                    <Icon name={action.icon} />
                    <span>{action.short ?? action.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="rgname">{group.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
