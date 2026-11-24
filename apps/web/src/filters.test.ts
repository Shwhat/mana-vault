import { describe, expect, it } from "vitest";
import { onlineDirectives, searchParams, serverQuery, filtersOn } from "./filters";
import { EMPTY_FILTERS } from "./types";
import { matchCards, searchCards } from "./android/catalog";

describe("syntax panel", () => {
  it("combines each search with panel syntax and other filters without changing OR precedence", () => {
    const filters = { ...EMPTY_FILTERS, query: "bolt or bear", syntax: "t:instant or t:creature", artist: "Rebecca Guay" };
    expect(filtersOn(filters, true)).toBe(true);
    expect(serverQuery(filters)).toBe('( t:instant or t:creature ) a:"Rebecca Guay"');
    expect(searchParams(filters, 0, 60).get("q")).toBe('( bolt or bear ) ( t:instant or t:creature ) a:"Rebecca Guay"');
    expect(filtersOn({ ...EMPTY_FILTERS }, true)).toBe(false);
  });
  it("keeps the online expression separate from local search and ownership filters", () => {
    const filters = { ...EMPTY_FILTERS, syntaxMode: "online" as const, syntax: "is:reserved unique:prints order:usd display:full", query: "bolt", owned: "owned" };
    const params = searchParams(filters, 0, 60, { group: true });
    expect(params.get("q")).toBe("( bolt ) is:owned");
    expect(params.get("scryfall")).toBe(filters.syntax);
    expect(params.has("group")).toBe(false);
    expect(onlineDirectives(filters)).toEqual({ unique: "prints", order: "usd", display: "full" });
    expect(filtersOn({ ...EMPTY_FILTERS, syntaxMode: "online" })).toBe(false);
    expect(onlineDirectives({ ...filters, syntax: 'o:"display:grid" o:/unique:prints/ display:text' })).toEqual({ display: "text" });
    expect(onlineDirectives({ ...filters, syntax: "t:dragon @@" }).unique).toBe("art");
    expect(onlineDirectives({ ...filters, syntax: "t:dragon ++" }).unique).toBe("prints");
    expect(onlineDirectives({ ...filters, syntax: "t:dragon sort:usd dir:desc as:checklist" }))
      .toEqual({ order: "usd", direction: "desc", display: "checklist" });
  });
  it("does not silently answer an online search from the offline catalog", async () => {
    const params = new URLSearchParams({ scryfall: "is:reserved" });
    await expect(searchCards(params)).rejects.toThrow("needs a connection");
    await expect(matchCards(params)).rejects.toThrow("needs a connection");
  });
});
