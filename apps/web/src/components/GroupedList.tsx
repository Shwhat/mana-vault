// ---------- the list view every card list shares (0.17.0): group headings with counts that fold, groups set out in
// columns that fill a wide screen, mana costs as symbols, and a menu button on each entry ----------
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { groupChoices, type ListGroup, type ListSection, LIST_SORTS, type ListSort } from "../list-groups";
import { useApp } from "../store";
import { rowMenu } from "./ContextMenu";
import { choices, Picker } from "./Picker";
import { SymbolText } from "./SymbolPicker";

/** A mana cost as symbol pictures. The text stays in the page (hidden) so it can still be copied and found. */
export function ManaCost({ cost }: { cost: string | null | undefined }) {
  if (!cost) return null;
  return <span className="mana symcost" aria-label={`Mana cost ${cost}`}>{cost.split(" // ").map((part, index) => (
    <span key={index}>{index > 0 && <span className="manasep"> // </span>}<SymbolText text={part} /></span>
  ))}</span>;
}

/** The button at the end of an entry that opens the same menu as a right-click or long press. */
export function EntryMenuButton({ menu, name }: { menu: ReturnType<typeof rowMenu>; name: string }) {
  return (
    <button type="button" className="btn small icon-only rowmenu" title="Menu" aria-label={`Menu of ${name}`} aria-haspopup="menu"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        const box = event.currentTarget.getBoundingClientRect();
        menu.onContextMenu({ preventDefault: () => undefined, clientX: box.left, clientY: box.bottom } as unknown as ReactMouseEvent);
      }}>
      <span aria-hidden="true">⋯</span>
    </button>
  );
}

/** Group by and Sort rows for an Options button. Without onSort, only Group by is offered (the view sorts elsewhere). */
export function ListOptionRows({ id, group, onGroup, sort, onSort, tags = false }: {
  id: string; group: ListGroup; onGroup: (group: ListGroup) => void; sort?: ListSort; onSort?: (sort: ListSort) => void; tags?: boolean;
}) {
  return (
    <>
      <div className="prow"><label htmlFor={`${id}-group`}>Group</label>
        <Picker id={`${id}-group`} label="Group by" value={group} options={choices(groupChoices(tags))} onChange={(value) => onGroup(value as ListGroup)} /></div>
      {onSort && sort && (
        <div className="prow"><label htmlFor={`${id}-sort`}>Sort</label>
          <Picker id={`${id}-sort`} label="Sort by" value={sort} options={choices(LIST_SORTS)} onChange={(value) => onSort(value as ListSort)} /></div>
      )}
    </>
  );
}

/**
 * Sections of cards with their headings. Headings show the count and fold the group shut (remembered per view). On a
 * wide screen the groups are set out in columns that fill the width; on a phone, one column.
 */
export function GroupedList<T>({ view, sections, headed, render, className = "", label }: {
  /** The name of the view, for the folded groups it remembers. */
  view: string; sections: Array<ListSection<T>>; headed: boolean; render: (card: T) => ReactNode; className?: string; label?: string;
}) {
  const store = useApp();
  const folds = store.prefs.listFolds;
  const toggle = (key: string) => {
    const id = `${view}:${key}`;
    store.setPrefs({ listFolds: folds.includes(id) ? folds.filter((item) => item !== id) : [...folds, id].slice(-300) });
  };
  if (!headed) return <div className={`glist flat ${className}`} aria-label={label}>{sections.flatMap((section) => section.cards.map(render))}</div>;
  return (
    <div className={`glist ${className}`} aria-label={label}>
      {sections.map((section) => {
        const folded = folds.includes(`${view}:${section.key}`);
        return (
          <div className="gsection" key={section.key}>
            <button type="button" className="grouphead gfold" aria-expanded={!folded} onClick={() => toggle(section.key)}
              title={folded ? `Show ${section.label}` : `Fold ${section.label}`}>
              {section.label} <span className="cnt">{section.count}</span>
            </button>
            {!folded && section.cards.map(render)}
          </div>
        );
      })}
    </div>
  );
}
