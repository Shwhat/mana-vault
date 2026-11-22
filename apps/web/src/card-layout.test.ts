// Tests for 0.18.0: the card layout model (places, moving, hiding, one layout or one per section).
import { describe, expect, it } from "vitest";
import { defaultCardLayout, defaultPipLayout, hiddenItems, layoutFor, moveItem, readCardLayout, readPipLayout, setLayout, setSame } from "./card-layout";

describe("card layout", () => {
  it("starts with the pips in one row, the price at its right and the buttons at the bottom", () => {
    const layout = defaultPipLayout();
    expect(layout.left).toEqual(["count", "printings", "finish", "marks"]);
    expect(layout.right).toEqual(["price"]);
    expect(layout.bottom).toEqual(["buttons"]);
    expect(hiddenItems(layout)).toEqual([]);
  });

  it("moves an item to a place, before another item, or hides it", () => {
    let layout = moveItem(defaultPipLayout(), "count", "tl");
    expect(layout.tl).toEqual(["count"]);
    expect(layout.left).not.toContain("count");
    layout = moveItem(layout, "price", "left", "finish");
    expect(layout.left).toEqual(["printings", "price", "finish", "marks"]);
    layout = moveItem(layout, "buttons", "off");
    expect(hiddenItems(layout)).toEqual(["buttons"]);
  });

  it("reads saved layouts, dropping unknown places, unknown items and repeats", () => {
    const layout = readPipLayout({ tl: ["count", "nonsense"], left: ["count", "price"], nowhere: ["finish"] });
    expect(layout.tl).toEqual(["count"]);
    expect(layout.left).toEqual(["price"]);
    expect(hiddenItems(layout)).toEqual(["printings", "finish", "marks", "buttons"]);
    expect(readCardLayout(null)).toEqual(defaultCardLayout());
  });

  it("keeps one layout for all sections, or one per section starting from the current one", () => {
    let prefs = defaultCardLayout();
    prefs = setLayout(prefs, "deck", moveItem(layoutFor(prefs, "deck"), "price", "br"));
    expect(layoutFor(prefs, "search").br).toEqual(["price"]);
    prefs = setSame(prefs, false, "search");
    prefs = setLayout(prefs, "deck", moveItem(layoutFor(prefs, "deck"), "price", "tr"));
    expect(layoutFor(prefs, "deck").tr).toEqual(["price"]);
    expect(layoutFor(prefs, "search").br).toEqual(["price"]);
    prefs = setSame(prefs, true, "deck");
    expect(layoutFor(prefs, "collection").tr).toEqual(["price"]);
  });
});
