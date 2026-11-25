import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRequest } from "./offline";
import { idbGet, idbSet } from "./idb";

vi.mock("./idb", () => {
  const data = new Map<string, unknown>();
  return {
    idbGet: vi.fn(async (store: string, key: string) => data.get(`${store}:${key}`)),
    idbSet: vi.fn(async (store: string, key: string, value: unknown) => { data.set(`${store}:${key}`, structuredClone(value)); }),
    idbAll: vi.fn(async () => []),
    idbDelete: vi.fn(),
  };
});

vi.mock("./catalog", () => ({
  compactCard: vi.fn(async (id: string) => ({
    id, oracle_id: `oracle-${id}`, name: id, mana_cost: "{G}", type_line: "Creature", set_code: "tst", set_name: "Test",
    collector_number: id, image_url: null, color_identity: "G", oracle_text: "Landfall \u2014 Create a Food token.",
  })),
}));

vi.mock("./net", () => ({
  appFetch: vi.fn(async () => new Response("{}")),
  readJson: vi.fn(async () => ({ status: "ok" })),
  OfflineError: class OfflineError extends Error {},
  SignedOutError: class SignedOutError extends Error {},
}));

describe("phone deck profiles", () => {
  beforeEach(async () => {
    const deck = { id: "deck", name: "Deck", format: "casual", mode: "theme", color_identity: "", themes: [] };
    await idbSet("cache", "/api/decks", [deck]);
    await idbSet("cache", "/api/decks/deck", { ...deck, cards: [] });
  });

  it("updates cached deck colors and themes when cards are added or removed", async () => {
    for (const cardId of ["one", "two"]) {
      await appRequest("/api/decks/deck/cards", { method: "POST", body: JSON.stringify({ cardId }) });
    }
    expect(await idbGet("cache", "/api/decks")).toEqual([expect.objectContaining({ color_identity: "G", themes: ["Landfall", "Tokens", "Food"] })]);
    const detail = await idbGet<{ cards: Array<{ entry_id: number; oracle_id: string }> }>("cache", "/api/decks/deck");
    const first = detail!.cards[0]!;
    await appRequest(`/api/decks/deck/cards/${first.oracle_id}?zone=main&entryId=${first.entry_id}`, { method: "DELETE" });
    expect(await idbGet("cache", "/api/decks")).toEqual([expect.objectContaining({ color_identity: "G", themes: [] })]);
    expect(await idbGet("cache", "/api/decks/deck")).toMatchObject({ color_identity: "G", themes: [] });
  });
});
