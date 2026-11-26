import { describe, expect, it } from "vitest";
import { supportsAction, type EngineCapabilities } from "./engine.js";
import { projectZone, type ZoneSource } from "./types.js";

describe("engine capabilities", () => {
  it("distinguishes a supported action from one the engine cannot handle", () => {
    const capabilities: EngineCapabilities = { mode: "automated", actions: ["passPriority", "choose"], reconnect: false };
    expect(supportsAction(capabilities, { type: "choose", promptId: "p1", choiceId: "c1" })).toBe(true);
    expect(supportsAction(capabilities, { type: "target", promptId: "p1", targetId: "t1" })).toBe(false);
  });

  describe("player zone views", () => {
    const card = { id: "card-1", name: "Secret", ownerId: "alice", controllerId: "alice", tapped: false, privateData: "do not send" };
    const zone: ZoneSource = { id: "hand", name: "Hand", ownerId: "alice", visibility: "owner", cards: [card] };

    it("hides another player's hand and a library even from its owner", () => {
      expect(projectZone(zone, "bob")).toEqual({ kind: "hidden", id: "hand", name: "Hand", count: 1 });
      expect(projectZone({ ...zone, visibility: "hidden" }, "alice")).toEqual({ kind: "hidden", id: "hand", name: "Hand", count: 1 });
    });

    it("exposes only the selected public card fields to authorized viewers", () => {
      const expected = { kind: "visible", id: "hand", name: "Hand", cards: [
        { id: "card-1", name: "Secret", ownerId: "alice", controllerId: "alice", tapped: false },
      ] };
      expect(projectZone(zone, "alice")).toEqual(expected);
      expect(projectZone({ ...zone, visibility: "public" }, "bob")).toEqual(expected);
    });
  });
});
