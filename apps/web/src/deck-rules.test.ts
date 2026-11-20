import { describe, expect, it } from "vitest";
import { checkDeck, deckText, mainType, manaBalance, parseQuickAdd, sections, shuffle } from "./deck-rules";
import { snapEdges, dockGroup } from "./components/Dock";
import { PRESETS } from "./dock";
import type { DeckCard } from "./types";

let id = 0;
function card(name: string, extra: Partial<DeckCard> = {}): DeckCard {
  id += 1;
  return {
    entry_id: id, card_id: `c${id}`, oracle_id: `o-${name}`, printing_id: `c${id}`, name, mana_cost: "{1}", type_line: "Artifact", set_code: "tst",
    set_name: "Test", collector_number: String(id), image_url: null, quantity: 1, zone: "main", mana_value: 1, colors: "", color_identity: "",
    legalities: { commander: "legal", modern: "legal" }, ...extra,
  };
}

describe("deck rules", () => {
  it("lists a card under its main type, creatures first", () => {
    expect(mainType("Artifact Creature - Golem")).toBe("Creature");
    expect(mainType("Artifact Land")).toBe("Land");
    expect(mainType("Land Creature - Forest Dryad")).toBe("Creature");
    expect(mainType("Kindred Instant - Elf")).toBe("Instant");
    expect(mainType("Sorcery // Land")).toBe("Sorcery");
  });

  it("groups and sorts cards, and lists a card under each of its tags", () => {
    const cards = [
      card("Bear", { type_line: "Creature - Bear", mana_value: 2, tags: ["Beaters"] }),
      card("Wolf", { type_line: "Creature - Wolf", mana_value: 1, tags: ["Beaters", "Cheap"] }),
      card("Forest", { type_line: "Basic Land - Forest", mana_value: 0 }),
    ];
    expect(sections(cards, "type", "name", "usd").map((item) => [item.label, item.cards.map((c) => c.name)])).toEqual([
      ["Creatures", ["Bear", "Wolf"]], ["Lands", ["Forest"]],
    ]);
    expect(sections(cards, "type", "mana", "usd")[0]!.cards.map((c) => c.name)).toEqual(["Wolf", "Bear"]);
    expect(sections(cards, "mana", "name", "usd").map((item) => item.label)).toEqual(["Mana value 1", "Mana value 2", "Lands"]);
    expect(sections(cards, "tag", "name", "usd").map((item) => [item.label, item.count])).toEqual([["Beaters", 2], ["Cheap", 1], ["No tag", 1]]);
  });

  it("checks a commander deck: size, single copies, color identity and banned cards", () => {
    const commander = card("Goblin King", { zone: "commander", type_line: "Legendary Creature - Goblin", color_identity: "R" });
    const ring = card("Sol Ring", { quantity: 2 });
    const elf = card("Elf", { color_identity: "G", type_line: "Creature - Elf" });
    const banned = card("Bad Card", { legalities: { commander: "banned" } });
    const forests = card("Forest", { quantity: 30, type_line: "Basic Land - Forest" });
    const maybe = card("Maybe", { zone: "maybeboard", quantity: 40, color_identity: "U" });
    const result = checkDeck("commander", [commander, ring, elf, banned, forests, maybe]);
    expect(result.problems.map((item) => item.text)).toEqual([
      "Commander decks have exactly 100 cards with the commander; this deck has 35",
      "Sol Ring: 2 copies, the limit is 1",
      "Bad Card is banned in Commander",
      "Elf is outside the commander's colors (Green)",
    ]);
    expect(result.flagged.has(forests.entry_id)).toBe(false);
    expect(result.flagged.has(maybe.entry_id)).toBe(false);
    expect(checkDeck("casual", [ring]).checked).toBe(false);
  });

  it("checks a 60-card deck: four copies, sideboard of 15, restricted cards", () => {
    const bolts = card("Bolt", { quantity: 5 });
    const rats = card("Relentless Rats", { quantity: 20, oracle_text: "A deck can have any number of cards named Relentless Rats." });
    const side = card("Side", { zone: "sideboard", quantity: 16 });
    const lands = card("Mountain", { quantity: 40, type_line: "Basic Land - Mountain" });
    const result = checkDeck("modern", [bolts, rats, side, lands]);
    expect(result.problems.map((item) => item.text)).toEqual([
      "The sideboard can have at most 15 cards; it has 16",
      "Bolt: 5 copies, the limit is 4",
      "Side: 16 copies, the limit is 4",
    ]);
    const lotus = card("Lotus", { quantity: 2, legalities: { vintage: "restricted" } });
    expect(checkDeck("vintage", [lotus, card("Island", { quantity: 58, type_line: "Basic Land - Island" })]).problems.map((item) => item.text))
      .toEqual(["Lotus: 2 copies, the limit is 1 (restricted)"]);
  });

  it("counts colored mana symbols and the cards that make each color", () => {
    const spell = card("Spell", { mana_cost: "{1}{G}{G/W}", quantity: 2 });
    const land = card("Savannah", { mana_cost: "", produced_mana: "GW", quantity: 1 });
    const side = card("Side", { mana_cost: "{U}", zone: "sideboard" });
    expect(manaBalance([spell, land, side])).toEqual({ pips: { W: 2, U: 0, B: 0, R: 0, G: 4, C: 0 }, sources: { W: 1, U: 0, B: 0, R: 0, G: 1, C: 0 } });
  });

  it("writes the deck as text and reads quick add lines", () => {
    const text = deckText([card("Ring", { zone: "main", set_code: "c21", collector_number: "263" }), card("King", { zone: "commander", set_code: "m10", collector_number: "1" }),
      card("Bolt", { zone: "main", set_code: "m10", collector_number: "146", finish: 1 })]);
    expect(text).toBe("Commander\n1 King (M10) 1\n\nDeck\n1 Bolt (M10) 146 *F*\n1 Ring (C21) 263");
    expect(parseQuickAdd("2 Sol Ring")).toEqual({ quantity: 2, name: "Sol Ring", set: "", number: "", finish: "" });
    expect(parseQuickAdd("3x Bolt (M10) 146")).toEqual({ quantity: 3, name: "Bolt", set: "M10", number: "146", finish: "" });
    expect(parseQuickAdd("Forest")).toEqual({ quantity: 1, name: "Forest", set: "", number: "", finish: "" });
    expect(parseQuickAdd("1 Sauron, the Dark Lord (HOC) 36 *F*")).toEqual({ quantity: 1, name: "Sauron, the Dark Lord", set: "HOC", number: "36", finish: "foil" });
    expect(parseQuickAdd("1 Opt (XLN) 65 *E*")).toEqual({ quantity: 1, name: "Opt", set: "XLN", number: "65", finish: "etched" });
    expect(parseQuickAdd("1 Island (HOB) 195 *F* *CMDR*")).toEqual({ quantity: 1, name: "Island", set: "HOB", number: "195", finish: "foil" });
    expect(parseQuickAdd("1 Lightning Bolt (2X2) 117\u2605")).toEqual({ quantity: 1, name: "Lightning Bolt", set: "2X2", number: "117\u2605", finish: "" });
    expect(parseQuickAdd("500 Forest")).toBeNull();
    expect(parseQuickAdd("  ")).toBeNull();
  });

  it("shuffles without losing cards", () => {
    const list = Array.from({ length: 20 }, (_, index) => index);
    const mixed = shuffle(list, () => 0.3);
    expect([...mixed].sort((a, b) => a - b)).toEqual(list);
    expect(mixed).not.toEqual(list);
  });
});

describe("docking", () => {
  it("snaps a floating window's edges to a nearby window", () => {
    const other = { x: 100, y: 100, w: 300, h: 200 };
    expect(snapEdges([other], 406, 150, 200, 200)).toEqual([400, 150]);
    expect(snapEdges([other], 150, 306, 200, 200)).toEqual([150, 300]);
    expect(snapEdges([other], 450, 150, 200, 200)).toEqual([450, 150]);
  });

  it("docks every panel of a floating window together", () => {
    const layout = PRESETS.Search!().layout;
    layout.floating.push({ id: "f", x: 10, y: 10, w: 300, h: 300, group: { id: "g", panels: ["decks", "review"], active: "review", weight: 1 } });
    const target = layout.right.columns[0]!.groups[0]!;
    const next = dockGroup(layout, ["decks", "review"], "review", { kind: "tab", groupId: target.id });
    expect(next.floating).toHaveLength(0);
    const group = next.right.columns[0]!.groups[0]!;
    expect(group.panels).toEqual(["card", "decks", "review"]);
    expect(group.active).toBe("review");
  });
});
