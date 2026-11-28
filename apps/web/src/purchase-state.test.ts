import { beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "./api";
import { currentOpening, reloadOpening, setActiveOpening, type Opening } from "./purchase-state";

vi.mock("./api", () => ({ request: vi.fn() }));

const active: Opening = { id: "opening", entryId: "entry", name: "Pack", collectionId: null };

beforeEach(() => {
  vi.mocked(request).mockReset();
  setActiveOpening(null);
});

describe("opening refresh", () => {
  it("does not overwrite a newer live opening with an older response", async () => {
    let resolve!: (value: { activeOpening: Opening | null }) => void;
    vi.mocked(request).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const reload = reloadOpening();
    setActiveOpening(active);
    resolve({ activeOpening: null });
    await reload;
    expect(currentOpening()).toEqual(active);
  });

  it("keeps the result of the latest refresh when responses arrive out of order", async () => {
    let resolve!: (value: { activeOpening: Opening | null }) => void;
    vi.mocked(request)
      .mockReturnValueOnce(new Promise((done) => { resolve = done; }))
      .mockResolvedValueOnce({ activeOpening: active });
    const older = reloadOpening();
    await reloadOpening();
    resolve({ activeOpening: null });
    await older;
    expect(currentOpening()).toEqual(active);
  });
});
