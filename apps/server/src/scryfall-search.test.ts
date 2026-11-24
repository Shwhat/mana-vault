import { describe, expect, it, vi } from "vitest";
import { createScryfallSearch } from "./scryfall-search.js";

describe("Scryfall search", () => {
  it("rejects searches Scryfall warns it ignored", async () => {
    const search = createScryfallSearch(async () => ({
      ok: true, status: 200, json: async () => ({ data: [], has_more: false, warnings: ["Invalid expression was ignored."] }),
    }));
    await expect(search("is:owned")).rejects.toThrow("Invalid expression was ignored.");
  });

  it("shares an in-flight search without cancelling another caller", async () => {
    let finish!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    let remoteSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => {
      remoteSignal = init.signal;
      return new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve) => { finish = resolve; });
    });
    const search = createScryfallSearch(fetcher);
    const first = new AbortController();
    const a = search("is:reserved", first.signal);
    const b = search("is:reserved");
    await Promise.resolve();
    first.abort();
    await expect(a).rejects.toThrow();
    expect(remoteSignal?.aborted).toBe(false);
    finish({ ok: true, status: 200, json: async () => ({ data: [{ id: "one" }], has_more: false }) });
    await expect(b).resolves.toMatchObject([{ id: "one" }]);
    await expect(search("is:reserved")).resolves.toMatchObject([{ id: "one" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requests every printing before applying a grouping directive", async () => {
    let remoteQuery = "";
    const search = createScryfallSearch(async (url) => {
      remoteQuery = new URL(url).searchParams.get("q") ?? "";
      return { ok: true, status: 200, json: async () => ({ data: [], has_more: false }) };
    });
    await search("set:neo unique:cards prefer:oldest");
    expect(remoteQuery).toBe("set:neo unique:cards prefer:oldest ++");
  });

  it("reports duplicated pages rather than returning inconsistent results", async () => {
    let page = 0;
    const search = createScryfallSearch(async () => ({
      ok: true, status: 200, json: async () => ({ data: [{ id: "one" }], has_more: ++page === 1 }),
    }));
    await expect(search("set:neo")).rejects.toThrow("results changed while paging");
  });

  it("cancels the remote request when its last caller leaves", async () => {
    let remoteSignal: AbortSignal | undefined;
    const search = createScryfallSearch(async (_url, init) => {
      remoteSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    });
    const controller = new AbortController();
    const result = search("is:reserved", controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toThrow();
    expect(remoteSignal?.aborted).toBe(true);
  });

  it("backs off for 30 seconds after a rate limit", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [], has_more: false }) });
      const search = createScryfallSearch(fetcher);
      await expect(search("first")).rejects.toThrow("rate limit");
      const next = search("second");
      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(next).resolves.toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
