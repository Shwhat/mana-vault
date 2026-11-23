// 0.21.0 in the browser: the new search syntax on the phone, commander eligibility from MTGJSON, and kept tab state.
import { describe, expect, it } from "vitest";
import { checkDeck } from "./deck-rules";
import { compileQuery, type QueryCard } from "./query-match";
import type { DeckCard } from "./types";

const card = (extra: Partial<QueryCard>): QueryCard => ({
  name: "Card", type_line: "Creature", oracle_text: "", mana_cost: "", mana_value: 1, colors: "", set_code: "tst", set_name: "Test", rarity: "rare", ...extra,
});

describe("0.21.0 search syntax on the phone", () => {
  it("reads reprints, starters, leaders, store and buylist prices as the server does", () => {
    const hero = card({ is_reprint: 1, lead_commander: 1, ck_r: 3, ck_rf: 30, tcg_r: 14, buy: 7 });
    const plain = card({ is_starter: 1, ck_r: 9 });
    expect(compileQuery("is:reprint")(hero)).toBe(true);
    expect(compileQuery("is:reprint")(plain)).toBe(false);
    expect(compileQuery("is:starter")(plain)).toBe(true);
    expect(compileQuery("can:commander")(hero)).toBe(true);
    expect(compileQuery("can:brawl")(hero)).toBe(false);
    expect(compileQuery("store:cardkingdom<5")(hero)).toBe(true);
    expect(compileQuery("store:cardkingdom<5")(plain)).toBe(false);
    expect(compileQuery("is:foil store:ck>20")(hero)).toBe(false);
    expect(compileQuery("buylist>5")(hero)).toBe(true);
    expect(compileQuery("buylist>5")(plain)).toBe(false);
    expect(() => compileQuery("can:legacy")).toThrow("can: takes commander, oathbreaker or brawl");
    expect(() => compileQuery('in:"collector booster"')).toThrow("in: needs a connection to the server");
    expect(() => compileQuery("store:nowhere<5")).toThrow("store:");
  });
});

describe("0.21.0 commander eligibility", () => {
  const deckCard = (extra: Partial<DeckCard>): DeckCard => ({
    entry_id: 1, card_id: "a", oracle_id: "o", printing_id: "a", quantity: 1, zone: "commander", name: "Leader", mana_cost: "", type_line: "Legendary Creature",
    set_code: "tst", set_name: "Test", collector_number: "1", image_url: null, custom: false, color_identity: "", legalities: { commander: "legal", brawl: "legal", oathbreaker: "legal" },
    ...extra,
  } as DeckCard);
  it("uses MTGJSON's leadership data when a card has it", () => {
    const cannot = deckCard({ name: "Not a leader", type_line: "Legendary Creature", leadership: { commander: false, oathbreaker: false, brawl: false } });
    expect(checkDeck("commander", [cannot]).problems.map((problem) => problem.text)).toContain("Not a leader cannot lead a Commander deck");
    const can = deckCard({ name: "Odd leader", type_line: "Artifact", leadership: { commander: true, oathbreaker: false, brawl: false } });
    expect(checkDeck("commander", [can]).problems.some((problem) => /lead|commander/i.test(problem.text) && problem.text.includes("Odd leader"))).toBe(false);
    // without the data, the type line decides as before
    const old = deckCard({ name: "Plain artifact", type_line: "Artifact" });
    expect(checkDeck("commander", [old]).problems.map((problem) => problem.text)).toContain("Plain artifact may not be able to be a commander");
  });
});
