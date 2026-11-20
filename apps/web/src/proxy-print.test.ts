// Tests for 0.9.0: laying out proxies on pages and the MPC Autofill list.
import { describe, expect, it } from "vitest";
import { DEFAULT_SHEET, facesOf, layoutPages, mpcAutofillList, type PrintLine, printSlots, readSheet } from "./proxy-print";
import { blankFace, frameOf, symbolsIn } from "./card-render";

const card = (id: string, name: string, extra: Partial<PrintLine["card"]> = {}): PrintLine["card"] => ({
  id, oracle_id: `o-${id}`, name, type_line: "Instant", set_code: "tst", set_name: "Test", collector_number: "1", image_url: null, custom: false, hasBack: false, ...extra,
});
const line = (id: string, name: string, count: number, faces: PrintLine["faces"] = "front", extra: Partial<PrintLine["card"]> = {}): PrintLine =>
  ({ id: `l-${id}`, cardId: id, count, faces, card: card(id, name, extra) });

describe("proxy pages", () => {
  it("fits nine standard cards on a Letter page and centers the grid", () => {
    const layout = layoutPages([line("a", "Opt", 10)], DEFAULT_SHEET);
    expect([layout.columns, layout.rows, layout.perPage, layout.pages.length]).toEqual([3, 3, 9, 2]);
    expect(layout.pages[1]).toHaveLength(1);
    const first = layout.pages[0]![0]!;
    expect(first.width).toBe(63);
    expect(first.x).toBeCloseTo((215.9 - 189) / 2);
    expect(first.y).toBeCloseTo((279.4 - 264) / 2);
  });

  it("leaves room for bleed and gaps, and scales cards", () => {
    const layout = layoutPages([line("a", "Opt", 1)], { ...DEFAULT_SHEET, paper: "a4", bleed: 3, gap: 2 });
    expect([layout.columns, layout.rows]).toEqual([2, 2]);
    const small = layoutPages([line("a", "Opt", 1)], { ...DEFAULT_SHEET, scale: 80 });
    expect(small.pages[0]![0]!.width).toBeCloseTo(50.4);
    expect([small.columns, small.rows]).toEqual([4, 3]);
  });

  it("prints front, back or both faces, and only fronts of one-faced cards", () => {
    const dfc = line("d", "Delver of Secrets // Insectile Aberration", 2, "both", { hasBack: true });
    expect(facesOf(dfc)).toEqual(["front", "back"]);
    expect(facesOf(line("o", "Opt", 1, "both"))).toEqual(["front"]);
    expect(printSlots([dfc]).map((slot) => slot.face)).toEqual(["front", "back", "front", "back"]);
  });

  it("reads saved sheet settings within their limits", () => {
    expect(readSheet({ paper: "a4", bleed: 9, scale: 10, marks: "corners", background: "#000000" }))
      .toMatchObject({ paper: "a4", bleed: 3, scale: 50, marks: "corners", background: "#000000" });
    expect(readSheet(null)).toEqual(DEFAULT_SHEET);
  });

  it("writes the MPC Autofill list without custom cards", () => {
    const text = mpcAutofillList([
      line("a", "Opt", 2), line("b", "Opt", 1), line("c", "My Card", 3, "front", { custom: true }),
      line("d", "Delver of Secrets // Insectile Aberration", 1, "front", { hasBack: true }),
    ]);
    expect(text).toBe("3 Opt\n1 Delver of Secrets\n");
  });
});

describe("card maker frames", () => {
  it("picks the frame from the mana cost and type", () => {
    const face = (manaCost: string, typeLine = "Creature") => ({ ...blankFace(), manaCost, typeLine });
    expect(frameOf(face("{1}{R}"))).toBe("R");
    expect(frameOf(face("{W}{U}"))).toBe("gold");
    expect(frameOf(face("{W/U}{W/U}"))).toBe("WU");
    expect(frameOf(face("{3}", "Artifact"))).toBe("artifact");
    expect(frameOf(face("{3}"))).toBe("colorless");
    expect(frameOf(face("", "Land"))).toBe("land");
    expect(frameOf({ ...face("{G}"), frame: "B" })).toBe("B");
    expect(symbolsIn("{2}{w/u}{T}")).toEqual(["2", "W/U", "T"]);
  });
});
