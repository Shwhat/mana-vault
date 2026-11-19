import { describe, expect, it } from "vitest";
import { CARD_RATIO, guideBox, guideInVideo } from "./recognize";
import { finishFor, hasFinish, scanCount } from "./scan-state";

describe("scanner helpers", () => {
  it("knows which finishes a printing comes in", () => {
    expect(hasFinish({ finishes: "nonfoil,foil" }, true)).toBe(true);
    expect(hasFinish({ finishes: "nonfoil" }, true)).toBe(false);
    expect(hasFinish({ finishes: "etched" }, true)).toBe(true);
    expect(hasFinish({ finishes: "" }, false)).toBe(true);
  });

  it("gives new scans the chosen finish unless the printing only has the other", () => {
    const card = { id: "a", oracle_id: "o", name: "A", set_code: "x", set_name: "X", collector_number: "1", rarity: "common", image_url: null, released_at: null };
    expect(finishFor({ ...card, finishes: "nonfoil,foil" }, true)).toBe(true);
    expect(finishFor({ ...card, finishes: "foil" }, false)).toBe(true);
    expect(finishFor({ ...card, finishes: "nonfoil" }, true)).toBe(false);
  });

  it("counts copies", () => {
    expect(scanCount([{ quantity: 2 }, { quantity: 3 }] as never)).toBe(5);
  });

  it("places the card outline in the view and in the camera picture", () => {
    const box = guideBox(390, 744);
    expect(box.width / box.height).toBeCloseTo(CARD_RATIO);
    expect(box.x).toBeCloseTo((390 - box.width) / 2);
    // the outline stays clear of the button column at the right
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 64);
    // a 720 x 1280 portrait picture covering a 390 x 744 view is scaled by 0.58125 and cut at the sides
    const inVideo = guideInVideo(720, 1280, 390, 744);
    expect(inVideo.height).toBeCloseTo(box.height / 0.58125);
    expect(inVideo.x).toBeCloseTo((box.x + 14.25) / 0.58125);
  });
});
