// Tests for 0.23.1: deck type groups in the order Moxfield uses.
import { describe, expect, it } from "vitest";
import { groupList } from "./list-groups";

const card = (name: string, type_line: string) => ({ name, type_line, set_code: "tst" });

describe("type group order", () => {
  it("lists Planeswalkers, Creatures, Sorceries, Instants, Artifacts, Enchantments, Battles, Lands, Other", () => {
    const cards = [
      card("Island", "Basic Land - Island"), card("Sol Ring", "Artifact"), card("Bolt", "Instant"), card("Wrath", "Sorcery"), card("Elf", "Creature - Elf"),
      card("Jace", "Legendary Planeswalker - Jace"), card("Seal", "Enchantment"), card("Invasion", "Battle - Siege"), card("Token", "Conspiracy"),
      card("Golem", "Artifact Creature - Golem"), card("Vault", "Artifact Land"),
    ];
    const sections = groupList(cards, "type", "name", () => null);
    expect(sections.map((section) => section.label)).toEqual(["Planeswalkers", "Creatures", "Sorceries", "Instants", "Artifacts", "Enchantments", "Battles", "Lands", "Other"]);
    // a card with several types still goes under the type that wins (an artifact creature is a creature, an artifact land a land)
    expect(sections.find((section) => section.label === "Creatures")!.cards.map((item) => item.name)).toEqual(["Elf", "Golem"]);
    expect(sections.find((section) => section.label === "Lands")!.cards.map((item) => item.name)).toEqual(["Island", "Vault"]);
  });
});
