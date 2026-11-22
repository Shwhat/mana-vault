// ---------- card frame (0.18.0): one card picture with its pips and buttons placed by the card layout, and the Card layout window ----------
import { Fragment, type ReactNode, useState } from "react";
import { useApp } from "../store";
import {
  hiddenItems, LAYOUT_SECTIONS, type LayoutSection, layoutFor, moveItem, PIP_ITEMS, PIP_SLOTS, type PipItem, type PipLayout, type PipSlot,
  defaultPipLayout, setLayout, setSame,
} from "../card-layout";
import { Segments } from "./Options";
import { customDialog } from "./Dialog";
import { FinishPip } from "./CardMarks";

/** The layout one section uses. */
export function useCardLayout(section: LayoutSection): PipLayout {
  return layoutFor(useApp().prefs.cardLayout, section);
}

/**
 * A card picture with its pips and buttons where the card layout puts them: on the picture's corners, in the row under
 * it (left and right), on a second line, or at the bottom. Every picture view uses it, so they all follow the layout.
 * `above` puts the rows above the picture (the deck's Stacks view, where the cards overlap). `after` comes under the
 * rows (the finish lines of a picture with more than one kind of copy).
 */
export function CardFrame({ section, picture, pieces, above = false, after, className = "" }: {
  section: LayoutSection;
  picture: ReactNode;
  pieces: Partial<Record<PipItem, ReactNode>>;
  above?: boolean;
  after?: ReactNode;
  className?: string;
}) {
  const layout = useCardLayout(section);
  const fill = (slot: PipSlot) => layout[slot].map((item) => (pieces[item] ? <Fragment key={item}>{pieces[item]}</Fragment> : null));
  const rows = (
    <>
      <div className="pipbar cfrow"><span className="cfleft">{fill("left")}</span><span className="cfright">{fill("right")}</span></div>
      <div className="pipbar cffull">{fill("full")}</div>
    </>
  );
  return (
    <div className={`cardframe${className ? ` ${className}` : ""}`}>
      {above && rows}
      <div className="cfpic">
        {picture}
        {(["tl", "tr", "bl", "br"] as const).map((slot) => <div key={slot} className={`cfcorner ${slot}`}>{fill(slot)}</div>)}
      </div>
      {!above && rows}
      {after}
      <div className="cfbottom">{fill("bottom")}</div>
    </div>
  );
}

const ITEM_NAME = Object.fromEntries(PIP_ITEMS) as Record<PipItem, string>;
const SLOT_NAME = Object.fromEntries(PIP_SLOTS) as Record<PipSlot, string>;
const SHORT: Record<PipSlot, string> = { tl: "Top left", tr: "Top right", bl: "Bottom left", br: "Bottom right", left: "Under, left", right: "Under, right", full: "Second line", bottom: "Bottom" };

/**
 * View, Card layout...: drag each thing into a place around the sample card, or into Hidden. On a phone (or without a
 * mouse) tap a thing, then tap the place. Changes apply at once.
 */
function CardLayoutEditor() {
  const store = useApp();
  const prefs = store.prefs.cardLayout;
  const [section, setSection] = useState<LayoutSection>("search");
  const [picked, setPicked] = useState<PipItem | null>(null);
  const layout = layoutFor(prefs, section);
  const save = (next: PipLayout) => store.setPrefs({ cardLayout: setLayout(prefs, section, next) });
  const place = (slot: PipSlot | "off", before?: PipItem) => {
    if (!picked) return;
    save(moveItem(layout, picked, slot, before));
    setPicked(null);
  };
  const chip = (item: PipItem) => (
    <button key={item} type="button" draggable data-item={item} className={picked === item ? "clchip on" : "clchip"} aria-pressed={picked === item}
      onDragStart={(event) => { event.dataTransfer.setData("text/plain", item); setPicked(item); }}
      onDragEnd={() => setPicked(null)}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const item2 = event.dataTransfer.getData("text/plain") as PipItem; if (item2 && item2 !== item) { save(moveItem(layout, item2, slotOf(layout, item) ?? "off", item)); setPicked(null); } }}
      onDragOver={(event) => event.preventDefault()}
      onClick={(event) => { event.stopPropagation(); setPicked(picked === item ? null : item); }}>{ITEM_NAME[item]}</button>
  );
  const zone = (slot: PipSlot | "off", extra = "") => (
    <div className={`clzone ${extra}${picked ? " ready" : ""}`} data-slot={slot} role="group" aria-label={slot === "off" ? "Hidden" : SLOT_NAME[slot]}
      title={slot === "off" ? "Hidden" : SLOT_NAME[slot]}
      onClick={() => place(slot)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const item = event.dataTransfer.getData("text/plain") as PipItem;
        if (item) save(moveItem(layout, item, slot));
        setPicked(null);
      }}>
      <span className="clname" aria-hidden="true">{slot === "off" ? "Hidden" : SHORT[slot]}</span>
      {(slot === "off" ? hiddenItems(layout) : layout[slot]).map(chip)}
    </div>
  );
  return (
    <div className="cleditor">
      <label className="checkrow"><input type="checkbox" checked={prefs.same} onChange={(event) => store.setPrefs({ cardLayout: setSame(prefs, event.target.checked, section) })} /> Same layout everywhere</label>
      {!prefs.same && <Segments label="Section" value={section} options={LAYOUT_SECTIONS} onChange={setSection} />}
      <p className="note">Drag each item to a place around the card, or into Hidden. Or click an item, then click a place.</p>
      <div className="clsample">
        <div className="clpicture">
          {zone("tl", "corner tl")}{zone("tr", "corner tr")}{zone("bl", "corner bl")}{zone("br", "corner br")}
          <span className="clpicname">Card picture</span>
        </div>
        <div className="clrow">{zone("left", "left")}{zone("right", "right")}</div>
        {zone("full", "full")}
        {zone("bottom", "bottom")}
      </div>
      <div className="clhidden">{zone("off", "off")}</div>
      <div className="btnrow end">
        <button type="button" className="btn" onClick={() => save(defaultPipLayout())}>Reset to default</button>
      </div>
    </div>
  );
}

const slotOf = (layout: PipLayout, item: PipItem): PipSlot | undefined => PIP_SLOTS.map(([slot]) => slot).find((slot) => layout[slot].includes(item));

export function cardLayoutDialog() {
  customDialog("Card layout", () => <CardLayoutEditor />, 560);
}

/**
 * With Finish lines hidden (0.19.0): clicking a picture that stands for more than one kind of copy asks which one, listing
 * each with its finish pip and count. Resolves with the chosen key, or null.
 */
export function chooseKind(kinds: Array<{ key: string; finish: number; promoTypes?: string | null; count: number; detail?: string }>, name: string): Promise<string | null> {
  return new Promise((resolve) => {
    let answered = false;
    customDialog(`Which ${name}?`, (close) => (
      <div className="kindchoice" role="listbox" aria-label={`Kinds of ${name}`}>
        {kinds.map((kind, index) => (
          <button key={kind.key} type="button" className="row kindrow" autoFocus={index === 0}
            onClick={() => { answered = true; close(); resolve(kind.key); }}>
            <FinishPip finish={kind.finish} promoTypes={kind.promoTypes} />
            {kind.detail && <span className="sub">{kind.detail}</span>}
            <span className="grow" />
            <b>{kind.count}</b>
          </button>
        ))}
      </div>
    ), 360, "Cancel");
    // a closed window without a choice resolves with nothing
    window.setTimeout(function wait() {
      if (answered) return;
      if (!document.querySelector("dialog#dlg[open] .kindchoice")) return resolve(null);
      window.setTimeout(wait, 300);
    }, 300);
  });
}
