// ---------- customize ribbon: add, remove and reorder tabs, groups and buttons ----------
import { useState } from "react";
import { useActions } from "../actions";
import { clone } from "../dock";
import { DEFAULT_RIBBON, type RibbonTab } from "../ribbon";
import { useApp } from "../store";

function move<T>(list: T[], index: number, step: number): T[] {
  const next = [...list];
  const target = index + step;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

export function RibbonCustomize() {
  const store = useApp();
  const actions = useActions(store);
  const ribbon: RibbonTab[] = store.prefs.ribbon ?? DEFAULT_RIBBON;
  const [tabIndex, setTabIndex] = useState(0);
  const [groupIndex, setGroupIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(-1);
  const [command, setCommand] = useState("");
  const tab = ribbon[tabIndex];
  const group = tab?.groups[groupIndex];

  const save = (next: RibbonTab[]) => store.setPrefs({ ribbon: next });
  const edit = (change: (draft: RibbonTab[]) => void) => {
    const draft = clone(ribbon);
    change(draft);
    save(draft);
  };
  const [nameText, setNameText] = useState("");
  const ask = (_question: string, _value: string) => {
    const name = nameText.trim();
    if (!name) store.flash("Type a name in the Name box first", "err");
    else setNameText("");
    return name;
  };

  return (
    <div>
      <div className="cz">
        <div>
          <h4>Tabs</h4>
          <div className="cz-list">
            {ribbon.map((item, index) => (
              <div key={item.id} className={index === tabIndex ? "cz-row on" : "cz-row"} onClick={() => { setTabIndex(index); setGroupIndex(0); setItemIndex(-1); }}>
                {item.name}{item.contextual ? " (contextual)" : ""}
              </div>
            ))}
          </div>
          <div className="cz-btns">
            <button type="button" className="btn small" onClick={() => {
              const name = ask("New tab name", "New tab");
              if (name) edit((draft) => { draft.push({ id: `tab-${Date.now().toString(36)}`, name, groups: [{ name: "Group", items: [] }] }); });
            }}>Add</button>
            <button type="button" className="btn small" disabled={!tab} onClick={() => {
              const name = tab && ask("Tab name", tab.name);
              if (name) edit((draft) => { draft[tabIndex]!.name = name; });
            }}>Rename</button>
            <button type="button" className="btn small" disabled={!tab || ribbon.length < 2} onClick={() => { edit((draft) => { draft.splice(tabIndex, 1); }); setTabIndex(0); }}>Remove</button>
            <button type="button" className="btn small" onClick={() => { save(move(ribbon, tabIndex, -1)); setTabIndex(Math.max(0, tabIndex - 1)); }}>Up</button>
            <button type="button" className="btn small" onClick={() => { save(move(ribbon, tabIndex, 1)); setTabIndex(Math.min(ribbon.length - 1, tabIndex + 1)); }}>Down</button>
          </div>
        </div>
        <div>
          <h4>Groups</h4>
          <div className="cz-list">
            {tab?.groups.map((item, index) => (
              <div key={`${item.name}-${index}`} className={index === groupIndex ? "cz-row on" : "cz-row"} onClick={() => { setGroupIndex(index); setItemIndex(-1); }}>{item.name}</div>
            ))}
          </div>
          <div className="cz-btns">
            <button type="button" className="btn small" disabled={!tab} onClick={() => {
              const name = ask("New group name", "Group");
              if (name) edit((draft) => { draft[tabIndex]!.groups.push({ name, items: [] }); });
            }}>Add</button>
            <button type="button" className="btn small" disabled={!group} onClick={() => {
              const name = group && ask("Group name", group.name);
              if (name) edit((draft) => { draft[tabIndex]!.groups[groupIndex]!.name = name; });
            }}>Rename</button>
            <button type="button" className="btn small" disabled={!group} onClick={() => { edit((draft) => { draft[tabIndex]!.groups.splice(groupIndex, 1); }); setGroupIndex(0); }}>Remove</button>
            <button type="button" className="btn small" disabled={!group} onClick={() => { edit((draft) => { draft[tabIndex]!.groups = move(draft[tabIndex]!.groups, groupIndex, -1); }); setGroupIndex(Math.max(0, groupIndex - 1)); }}>Up</button>
            <button type="button" className="btn small" disabled={!group} onClick={() => { edit((draft) => { draft[tabIndex]!.groups = move(draft[tabIndex]!.groups, groupIndex, 1); }); setGroupIndex(Math.min((tab?.groups.length ?? 1) - 1, groupIndex + 1)); }}>Down</button>
          </div>
        </div>
        <div>
          <h4>Buttons</h4>
          <div className="cz-list">
            {group?.items.map((id, index) => (
              <div key={`${id}-${index}`} className={index === itemIndex ? "cz-row on" : "cz-row"} onClick={() => setItemIndex(index)}>{actions[id]?.label ?? id}</div>
            ))}
          </div>
          <div className="cz-btns">
            <button type="button" className="btn small" disabled={itemIndex < 0} onClick={() => { edit((draft) => { draft[tabIndex]!.groups[groupIndex]!.items.splice(itemIndex, 1); }); setItemIndex(-1); }}>Remove</button>
            <button type="button" className="btn small" disabled={itemIndex < 0} onClick={() => { edit((draft) => { const g = draft[tabIndex]!.groups[groupIndex]!; g.items = move(g.items, itemIndex, -1); }); setItemIndex(Math.max(0, itemIndex - 1)); }}>Up</button>
            <button type="button" className="btn small" disabled={itemIndex < 0} onClick={() => { edit((draft) => { const g = draft[tabIndex]!.groups[groupIndex]!; g.items = move(g.items, itemIndex, 1); }); setItemIndex(Math.min((group?.items.length ?? 1) - 1, itemIndex + 1)); }}>Down</button>
          </div>
        </div>
        <div>
          <h4>All commands</h4>
          <div className="cz-list">
            {Object.entries(actions).sort(([, a], [, b]) => a.label.localeCompare(b.label)).map(([id, action]) => (
              <div key={id} className={id === command ? "cz-row on" : "cz-row"} onClick={() => setCommand(id)} onDoubleClick={() => {
                if (group) edit((draft) => { draft[tabIndex]!.groups[groupIndex]!.items.push(id); });
              }}>{action.label.replace(/^(Undo|Redo) .+/, "$1")}</div>
            ))}
          </div>
          <div className="cz-btns">
            <button type="button" className="btn small" disabled={!command || !group} onClick={() => edit((draft) => { draft[tabIndex]!.groups[groupIndex]!.items.push(command); })}>Add to group</button>
          </div>
        </div>
      </div>
      <div className="prow cz-name">
        <label htmlFor="cz-name">Name</label>
        <input id="cz-name" value={nameText} onChange={(event) => setNameText(event.target.value)} placeholder="Name for Add or Rename" />
      </div>
      <div className="btnrow" style={{ marginTop: 10 }}>
        <button type="button" className="btn" onClick={() => { save(clone(DEFAULT_RIBBON)); setTabIndex(0); setGroupIndex(0); store.flash("Ribbon reset"); }}>Reset ribbon</button>
      </div>
      <p className="note">Changes apply at once and are saved for your account. Type a name, then use Add or Rename under Tabs or Groups. Double-click a command to add it to the selected group.</p>
    </div>
  );
}
