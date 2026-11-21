// The search syntax on the phone follows the server's rules (0.17.0).
import { describe, expect, it } from "vitest";
import { compileQuery, type QueryCard } from "./query-match";

const bolt: QueryCard = {
  oracle_id: "o-bolt", name: "Lightning Bolt", type_line: "Instant", oracle_text: "Lightning Bolt deals 3 damage to any target.", mana_cost: "{R}", mana_value: 1,
  colors: "R", color_identity: "R", set_code: "2x2", set_name: "Double Masters 2022", rarity: "uncommon", released_at: "2022-07-08", finishes: "nonfoil,foil",
  artist: "Christopher Moeller", keywords: "", promo_types: "", frame: "2015", frame_effects: "", border_color: "black", full_art: 0, lang: "en", usd: 1.5,
  legal: 0b10000000, power: null, toughness: null,
};
const bear: QueryCard = {
  ...bolt, oracle_id: "o-bear", name: "Grizzly Bears", type_line: "Creature \u2014 Bear", oracle_text: "", mana_cost: "{1}{G}", mana_value: 2, colors: "G", color_identity: "G",
  rarity: "common", power: "2", toughness: "2", border_color: "borderless", promo_types: "surgefoil", usd: null, legal: 0, released_at: "1995-01-01",
};
const formats = ["standard", "future", "historic", "timeless", "gladiator", "pioneer", "explorer", "modern"];
const run = (query: string, owned: Set<string> | null = null) => [bolt, bear].filter(compileQuery(query, { formats, owned })).map((card) => card.name);

describe("search syntax on the phone", () => {
  it("matches words in names, type lines and rules text", () => {
    expect(run("bolt")).toEqual(["Lightning Bolt"]);
    expect(run("damage")).toEqual(["Lightning Bolt"]);
    expect(run("bear")).toEqual(["Grizzly Bears"]);
  });
  it("reads filters as the server does", () => {
    expect(run("t:creature")).toEqual(["Grizzly Bears"]);
    expect(run("c:r")).toEqual(["Lightning Bolt"]);
    expect(run("id:g mv>=2")).toEqual(["Grizzly Bears"]);
    expect(run("-r:common")).toEqual(["Lightning Bolt"]);
    expect(run("usd<2")).toEqual(["Lightning Bolt"]);
    expect(run("pow=2")).toEqual(["Grizzly Bears"]);
    expect(run("year<2000")).toEqual(["Grizzly Bears"]);
    expect(run("is:borderless")).toEqual(["Grizzly Bears"]);
    expect(run("is:surgefoil")).toEqual(["Grizzly Bears"]);
    expect(run("not:foil")).toEqual([]);
    expect(run("a:moeller")).toEqual(["Lightning Bolt", "Grizzly Bears"]);
    expect(run("legal:modern")).toEqual(["Lightning Bolt"]);
    expect(run("is:owned", new Set(["o-bear"]))).toEqual(["Grizzly Bears"]);
  });
  it("gives the server's messages for searches it cannot read", () => {
    expect(() => run("r:shiny")).toThrow('Unknown rarity "shiny"');
    expect(() => run("mv:abc")).toThrow("Mana value must be from 0 to 100");
    expect(() => run("zzz:1")).toThrow('Unsupported search filter "zzz"');
    expect(() => run("is:owned")).toThrow("is:owned needs a connection");
    expect(() => run("otag:removal")).toThrow("need a connection");
  });
});
