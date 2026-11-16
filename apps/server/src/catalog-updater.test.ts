import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogUpdateIntervalFromEnvironment, startCatalogUpdater } from "./catalog-updater.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("catalog update scheduling", () => {
  it("defaults to disabled and validates configured intervals", () => {
    expect(catalogUpdateIntervalFromEnvironment(undefined)).toBe(0);
    expect(catalogUpdateIntervalFromEnvironment("168")).toBe(168);
    expect(() => catalogUpdateIntervalFromEnvironment("0.5")).toThrow("CARD_UPDATE_INTERVAL_HOURS");
    expect(() => catalogUpdateIntervalFromEnvironment("-1")).toThrow("CARD_UPDATE_INTERVAL_HOURS");
  });

  it("runs refreshes on schedule and reports failures", async () => {
    vi.useFakeTimers();
    const updateCatalog = vi.fn<() => Promise<number>>().mockRejectedValue(new Error("network unavailable"));
    const onError = vi.fn();
    const updater = startCatalogUpdater({
      intervalHours: 1,
      databasePath: "test.sqlite",
      dataPath: "cards.json",
      updateCatalog,
      onError,
    });

    expect(updater.getStatus()).toMatchObject({ scheduled: true, intervalHours: 1, isUpdating: false });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(updateCatalog).toHaveBeenCalledWith("test.sqlite", "cards.json");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "network unavailable" }));
    expect(updater.getStatus()).toMatchObject({ isUpdating: false, lastError: "network unavailable" });

    updater.close();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(updateCatalog).toHaveBeenCalledTimes(1);
  });

  it("supports manual refreshes when automatic scheduling is disabled", async () => {
    let finishUpdate: (importedCount: number) => void = () => {};
    const update = new Promise<number>((resolve) => { finishUpdate = resolve; });
    const updater = startCatalogUpdater({
      intervalHours: 0,
      databasePath: "test.sqlite",
      dataPath: "cards.json",
      updateCatalog: vi.fn(() => update),
    });

    expect(updater.getStatus()).toMatchObject({ scheduled: false, isUpdating: false });
    expect(updater.requestRefresh()).toBe(true);
    expect(updater.getStatus().isUpdating).toBe(true);
    expect(updater.requestRefresh()).toBe(false);
    finishUpdate(120_042);
    await vi.waitFor(() => expect(updater.getStatus()).toMatchObject({
      isUpdating: false,
      lastImportedCount: 120_042,
      lastError: null,
    }));
    updater.close();
  });
});
