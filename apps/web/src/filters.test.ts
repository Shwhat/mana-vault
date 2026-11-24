import { describe, expect, it } from "vitest";
import { searchParams, serverQuery, filtersOn } from "./filters";
import { EMPTY_FILTERS } from "./types";

describe("syntax panel", () => {
  it("combines each search with panel syntax and other filters without changing OR precedence", () => {
    const filters = { ...EMPTY_FILTERS, query: "bolt or bear", syntax: "t:instant or t:creature", artist: "Rebecca Guay" };
    expect(filtersOn(filters, true)).toBe(true);
    expect(serverQuery(filters)).toBe('( t:instant or t:creature ) a:"Rebecca Guay"');
    expect(searchParams(filters, 0, 60).get("q")).toBe('( bolt or bear ) ( t:instant or t:creature ) a:"Rebecca Guay"');
    expect(filtersOn({ ...EMPTY_FILTERS }, true)).toBe(false);
  });
});
