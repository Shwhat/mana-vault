import { describe, expect, it, vi } from "vitest";
import { matchCards } from "./catalog";
import { idbGet } from "./idb";

vi.mock("./idb", () => ({ idbGet: vi.fn(), idbSet: vi.fn() }));

describe("offline catalog matching", () => {
  it("finds all matching printing IDs and reports unsupported queries", async () => {
    vi.mocked(idbGet).mockResolvedValue({
      version: "test",
      fields: ["id", "oracle_id", "name", "type_line", "oracle_text", "mana_cost", "mana_value", "colors", "color_identity", "set_code", "set_name", "rarity"],
      rows: [
        ["one", "o1", "First Angel", "Creature - Angel", "", "{W}", 1, "W", "W", "lea", "Alpha", "rare"],
        ["two", "o2", "Second Elf", "Creature - Elf", "", "{G}", 1, "G", "G", "lea", "Alpha", "common"],
      ],
      formats: [],
    });
    expect(await matchCards(new URLSearchParams({ q: "(t:angel or t:dragon) c:w" }))).toEqual({ ids: ["one"] });
    await expect(matchCards(new URLSearchParams({ q: "art:cat" }))).rejects.toThrow("need a connection");
  });
});
