import { scryfallDirectives } from "./search-expression.js";

type SearchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

export type SearchFetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<SearchResponse>;

type SearchPage = { data?: unknown; has_more?: unknown; details?: unknown; code?: unknown; warnings?: unknown };
export type ScryfallPrinting = {
  id: string;
  art: string;
  set: string;
  released: string | null;
  usd: number | null;
  eur: number | null;
  tix: number | null;
};
type CacheEntry = { expires: number; printings: ScryfallPrinting[] };
type Pending = { promise: Promise<ScryfallPrinting[]>; controller: AbortController; waiters: number };

function sleep(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, delay);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Search Scryfall without sending Mana Vault's local filters or ownership data. */
export function createScryfallSearch(fetcher: SearchFetcher = fetch) {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Pending>();
  let queue: Promise<void> = Promise.resolve();
  let nextRequest = 0;
  let blockedUntil = 0;

  const page = async (query: string, number: number, signal: AbortSignal, variations: boolean, rollup?: "cards" | "art"): Promise<SearchPage> => {
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      signal.throwIfAborted();
      const delay = Math.max(nextRequest, blockedUntil) - Date.now();
      if (delay > 0) await sleep(delay, signal);
      nextRequest = Date.now() + 550;
      const params = new URLSearchParams({ q: query, unique: rollup ?? "prints", page: String(number) });
      if (variations) params.set("include_variations", "true");
      const response = await fetcher(`https://api.scryfall.com/cards/search?${params}`, {
        headers: { "User-Agent": "ManaVault/0.24.1", Accept: "application/json" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
      if (response.status === 429) {
        blockedUntil = Date.now() + 30_000;
        throw new Error("Scryfall rate limit reached. Try again in 30 seconds.");
      }
      const body = await response.json() as SearchPage;
      if (!body || typeof body !== "object") throw new Error("Scryfall returned an invalid search response.");
      if (Array.isArray(body.warnings) && body.warnings.length) throw new Error(`Scryfall: ${body.warnings.join(" ")}`);
      if (response.status === 404 && body.code === "not_found" && number === 1) return { data: [], has_more: false };
      if (response.status === 404 && body.code === "not_found") throw new Error("Scryfall pagination ended unexpectedly. Try the search again.");
      if (!response.ok) throw new Error(typeof body.details === "string" ? `Scryfall: ${body.details}` : `Scryfall search failed (${response.status}).`);
      if (!Array.isArray(body.data) || typeof body.has_more !== "boolean") throw new Error("Scryfall returned an invalid search response.");
      return body;
    } finally {
      release();
    }
  };

  const search = async (query: string, signal: AbortSignal, variations: boolean, rollup?: "cards" | "art"): Promise<ScryfallPrinting[]> => {
    const directive = scryfallDirectives(query).unique;
    const unrolled = !rollup && directive && directive !== "prints" ? `${query} ++` : query;
    if ([...unrolled].length > 1000) throw new Error("Shorten the Scryfall search to leave room for printing-level filtering.");
    const printings: ScryfallPrinting[] = [];
    const seen = new Set<string>();
    for (let number = 1; ; number++) {
      const result = await page(unrolled, number, signal, variations, rollup);
      for (const card of result.data as unknown[]) {
        if (!card || typeof card !== "object" || typeof (card as { id?: unknown }).id !== "string") {
          throw new Error("Scryfall returned a card without an ID.");
        }
        const row = card as Record<string, unknown> & { id: string };
        if (seen.has(row.id)) throw new Error("Scryfall results changed while paging. Try the search again.");
        seen.add(row.id);
        const faces = Array.isArray(row.card_faces) ? row.card_faces : [];
        const illustrations = [row.illustration_id, ...faces.map((face: unknown) =>
          face && typeof face === "object" ? (face as Record<string, unknown>).illustration_id : null)]
          .filter((id): id is string => typeof id === "string" && !!id);
        const prices = row.prices && typeof row.prices === "object" ? row.prices as Record<string, unknown> : {};
        const price = (...keys: string[]) => {
          for (const key of keys) {
            const value = prices[key];
            if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
          }
          return null;
        };
        printings.push({
          id: row.id, art: illustrations.length ? JSON.stringify(illustrations) : row.id,
          set: typeof row.set === "string" ? row.set : "", released: typeof row.released_at === "string" ? row.released_at : null,
          usd: price("usd", "usd_foil", "usd_etched"), eur: price("eur", "eur_foil"), tix: price("tix"),
        });
      }
      if (!result.has_more) break;
      if (!(result.data as unknown[]).length) throw new Error("Scryfall returned an empty page with more results.");
    }
    return printings;
  };

  return async (query: string, signal?: AbortSignal, variations = false, rollup?: "cards" | "art"): Promise<ScryfallPrinting[]> => {
    if (!query.trim() || [...query].length > 1000) throw new Error("Scryfall search must be between 1 and 1000 characters.");
    signal?.throwIfAborted();
    const key = `${variations ? "v:" : "q:"}${rollup ?? "prints"}:${query}`;
    const found = cache.get(key);
    if (found && found.expires > Date.now()) return found.printings;
    let task = pending.get(key);
    if (!task) {
      const controller = new AbortController();
      const work = search(query, controller.signal, variations, rollup).then((printings) => {
        if (cache.size >= 4) cache.delete(cache.keys().next().value!);
        cache.set(key, { printings, expires: Date.now() + 24 * 60 * 60 * 1000 });
        return printings;
      }).finally(() => { if (pending.get(key)?.promise === work) pending.delete(key); });
      task = { promise: work, controller, waiters: 0 };
      pending.set(key, task);
    }
    task.waiters++;
    const current = task;
    try {
      if (!signal) return await current.promise;
      return await new Promise<ScryfallPrinting[]>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        current.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
        if (signal.aborted) abort();
      });
    } finally {
      current.waiters--;
      if (!current.waiters && pending.get(key) === current) {
        pending.delete(key);
        current.controller.abort();
      }
    }
  };
}
