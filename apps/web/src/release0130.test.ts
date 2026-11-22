// Tests for 0.13.0 in the browser code: search sorting kept in the browser, one click picks and a second click opens,
// and the saved sort choices.
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchRank, plainWords, sortFound } from "./search-sort";
import type { MouseEvent, PointerEvent } from "react";
import { DOUBLE_TAP_MS, pickOrOpen } from "./components/PickOpen";
import type { Card } from "./types";

const card = (name: string, extra: Partial<Card> = {}): Card => ({
  id: name, name, mana_cost: "", mana_value: 1, type_line: "Artifact", oracle_text: null, set_code: "tst", set_name: "Test", collector_number: "1",
  rarity: "common", colors: "", image_url: null, ...extra,
} as Card);

describe("search sorting in the browser", () => {
  it("ranks exact names, then names that start with the words, then names holding every word", () => {
    expect(matchRank("Sol Ring", "sol ring")).toBe(0);
    expect(matchRank("Sol Ring Echo", "sol ring")).toBe(1);
    expect(matchRank("Ring of Sol", "sol ring")).toBe(2);
    expect(matchRank("Mana Vault", "sol ring")).toBe(3);
    expect(matchRank("Fire // Ice", "fire")).toBe(0);
    expect(plainWords("sol ring t:artifact")).toBe("sol ring");
  });

  it("orders by best match by default and by the other sorts", () => {
    const list = [card("Mana Vault", { rarity: "rare", colors: "B" }), card("Ring of Sol", { rarity: "mythic", colors: "W,U" }), card("Sol Ring", { colors: "" }), card("Sol Ring Echo", { colors: "W" })];
    expect(sortFound(list, "best", "sol ring", "usd").map((item) => item.name)).toEqual(["Sol Ring", "Sol Ring Echo", "Ring of Sol", "Mana Vault"]);
    expect(sortFound(list, "rarity", "", "usd").map((item) => item.name)).toEqual(["Ring of Sol", "Mana Vault", "Sol Ring", "Sol Ring Echo"]);
    expect(sortFound(list, "color", "", "usd").map((item) => item.name)).toEqual(["Sol Ring Echo", "Mana Vault", "Ring of Sol", "Sol Ring"]);
  });
});

describe("pick or open (0.18.0)", () => {
  afterEach(() => vi.useRealTimers());
  const click = (detail: number) => ({ detail }) as unknown as MouseEvent<Element>;
  const down = (pointerType: string) => ({ pointerType }) as unknown as PointerEvent<Element>;

  it("picks on a single click, opens only on a true double click, and a slow second click only picks", () => {
    const pick = vi.fn();
    const open = vi.fn();
    const a = pickOrOpen("row-a", pick, open);
    a.onPointerDown(down("mouse"));
    a.onClick(click(1));
    expect([pick.mock.calls.length, open.mock.calls.length]).toEqual([1, 0]);
    a.onClick(click(1));
    expect([pick.mock.calls.length, open.mock.calls.length]).toEqual([2, 0]);
    a.onClick(click(2));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens on one click in the Collection and Deck tabs", () => {
    const pick = vi.fn();
    const open = vi.fn();
    pickOrOpen("row-a", pick, open, true).onClick(click(1));
    expect([pick.mock.calls.length, open.mock.calls.length]).toEqual([0, 1]);
  });

  it("picks on a tap and opens on a double tap of the same row", () => {
    vi.useFakeTimers();
    const pick = vi.fn();
    const open = vi.fn();
    const a = pickOrOpen("row-t", pick, open);
    const b = pickOrOpen("row-u", pick, open);
    a.onPointerDown(down("touch"));
    a.onClick(click(1));
    vi.advanceTimersByTime(100);
    a.onClick(click(1));
    expect(open).toHaveBeenCalledTimes(1);
    b.onClick(click(1));
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
    b.onClick(click(1));
    expect(open).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledTimes(3);
  });
});

describe("Suggest: the word being typed", async () => {
  const { partAt } = await import("./components/Suggest");
  it("finds types after t:, names for plain words and keeps a Quick add count", () => {
    expect(partAt("search", "c:red t:dra", 11)).toMatchObject({ list: "types", term: "dra", start: 8 });
    expect(partAt("search", "lightning", 9)).toMatchObject({ list: "names", term: "lightning" });
    expect(partAt("search", "c:red bolt", 10)).toBeNull();
    expect(partAt("quick", "2 Sol R", 7)).toMatchObject({ list: "names", term: "Sol R", start: 2 });
    expect(partAt("typeLine", "Creature - El", 13)).toMatchObject({ list: "types", term: "El", start: 11 });
    expect(partAt("search", "a:rebecca gu", 12)?.wrap("Rebecca Guay")).toBe('"Rebecca Guay"');
  });
});
