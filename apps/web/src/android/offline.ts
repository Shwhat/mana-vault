// ---------- offline use in the Android app: a copy of the library on the phone, queued changes and sync ----------
import { answerNotes, applyNotesLocally, refreshNotes } from "./notes-offline";
import type { ClashDetail, Conflict } from "../notes-state";
import { NOTE_CLASH } from "../note-files";
import type { CardDetail, Collection, CollectionEntry, DeckCard, DeckDetail, Deck, DeckLink, FinishCode } from "../types";
import { compactCard, matchCards, matchOnPhone, printingsOf, refreshCatalog, refreshRulings, rulingsOf, searchCards, suggestOnPhone } from "./catalog";
import { idbAll, idbDelete, idbGet, idbSet } from "./idb";
import { appFetch, OfflineError, readJson, SignedOutError } from "./net";
import { native } from "./platform";

export type SyncState = "online" | "offline" | "syncing";
export type SyncStatus = { state: SyncState; pending: number; lastSync: number | null; error?: string | null };
export type SyncProblem = { label: string; error: string };

type Queued = { id: string; seq: number; at: number; method: string; url: string; body?: unknown; base?: unknown; label: string };
type Item = { cardId: string; foil: FinishCode; condition: string; language: string; proxy: boolean; quantity: number; trade?: number };

export const SYNCED_EVENT = "mana-vault-synced";
export const PROBLEM_EVENT = "mana-vault-sync-problems";
const CHECK_MS = 60_000;
const RETRY_MS = 10_000;
const NEEDS_CONNECTION = "You are offline. This needs a connection to the server.";

let status: SyncStatus = { state: "online", pending: 0, lastSync: null };
const listeners = new Set<(next: SyncStatus) => void>();
let seq = 0;
let flushing: Promise<void> | null = null;

export const syncStatus = () => status;
export function onSyncStatus(listener: (next: SyncStatus) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function setStatus(change: Partial<SyncStatus>) {
  status = { ...status, ...change };
  for (const listener of listeners) listener(status);
}

// ---------- the copy on the phone ----------

/** Answers that are kept for offline use: everything under /api except these. */
const NOT_KEPT = /^\/api\/(cards\?|cards\/match\?|cards\/[^/]+\/printings|catalog\/(?!lists$)|backup|sync|devices|users|scan\/|health|config)/;
const keep = (url: string) => url.startsWith("/api/") && !NOT_KEPT.test(url);
const getCopy = <T>(url: string) => idbGet<T>("cache", url);
const setCopy = (url: string, value: unknown) => idbSet("cache", url, value);

async function queue(): Promise<Queued[]> {
  return (await idbAll<Queued>("queue")).sort((a, b) => a.seq - b.seq);
}

/** Waiting changes shown to the user (a settings change is sent along, but is not counted). */
async function countQueue() {
  const waiting = await queue();
  setStatus({ pending: waiting.filter((item) => item.url !== "/api/prefs").length });
  // the phone keeps its own copy of the waiting changes and sends them as soon as it is online, even with the app closed
  void native().setPendingSync?.({ changes: JSON.stringify(waiting.map(({ id, method, url, body, base }) => ({ id, method, url, body, base }))) }).catch(() => undefined);
}

// ---------- changes made on the phone ----------

const enc = encodeURIComponent;
const finishCode = (value: unknown): FinishCode => (value === true || value === 1 ? 1 : value === 2 ? 2 : 0);
const readItem = (raw: Record<string, unknown>): Item => ({
  cardId: String(raw.cardId ?? ""), foil: finishCode(raw.foil), condition: typeof raw.condition === "string" ? raw.condition : "NM",
  language: typeof raw.language === "string" ? raw.language : "en", proxy: raw.proxy === true, quantity: Number(raw.quantity ?? 1),
  ...(typeof raw.trade === "number" ? { trade: raw.trade } : {}),
});
const sameCopy = (entry: CollectionEntry, item: Item) =>
  entry.id === item.cardId && entry.foil === item.foil && entry.condition === item.condition && entry.language === item.language && !!entry.proxy === item.proxy;

async function newEntry(item: Item): Promise<CollectionEntry | null> {
  const card = await compactCard(item.cardId);
  if (!card) return null;
  return {
    id: card.id, oracle_id: card.oracle_id, name: card.name, set_code: card.set_code, set_name: card.set_name, collector_number: card.collector_number,
    rarity: card.rarity, image_url: card.image_url, colors: card.colors, mana_cost: card.mana_cost, mana_value: card.mana_value, type_line: card.type_line,
    price_usd: null, price_usd_foil: null, price_usd_etched: null,
    quantity: 0, foil: item.foil, condition: item.condition as CollectionEntry["condition"], language: item.language, trade: 0, proxy: item.proxy, decks: [],
  };
}

async function entries(collectionId: string): Promise<CollectionEntry[]> {
  return (await getCopy<CollectionEntry[]>(`/api/collections/${enc(collectionId)}/cards`)) ?? [];
}

async function saveEntries(collectionId: string, list: CollectionEntry[]) {
  const kept = list.filter((entry) => entry.quantity > 0).sort((a, b) => a.name.localeCompare(b.name) || a.set_code.localeCompare(b.set_code));
  await setCopy(`/api/collections/${enc(collectionId)}/cards`, kept);
  const collections = await getCopy<Collection[]>("/api/collections");
  if (collections) {
    await setCopy("/api/collections", collections.map((item) => item.id !== collectionId ? item : {
      ...item, entryCount: kept.length, cardCount: kept.reduce((sum, entry) => sum + entry.quantity, 0), tradeCount: kept.reduce((sum, entry) => sum + entry.trade, 0),
    }));
  }
}

/** Adds (or with a negative amount, removes) copies in the copy on the phone. Returns the count before and after. */
async function addCopies(collectionId: string, items: Item[]): Promise<{ before: Item[]; after: Item[]; entries: CollectionEntry[] }> {
  const list = await entries(collectionId);
  const before: Item[] = [];
  const after: Item[] = [];
  for (const item of items) {
    let entry = list.find((candidate) => sameCopy(candidate, item));
    if (!entry) {
      const created = await newEntry(item);
      if (!created) continue;
      list.push(created);
      entry = created;
    }
    const { trade: _trade, ...key } = item;
    before.push({ ...key, quantity: entry.quantity, trade: entry.trade });
    entry.quantity = Math.max(0, Math.min(10_000, entry.quantity + item.quantity));
    entry.trade = Math.min(entry.trade, entry.quantity);
    after.push({ ...key, quantity: entry.quantity, trade: entry.trade });
  }
  await saveEntries(collectionId, list);
  return { before, after, entries: list };
}

async function collectionName(id: string): Promise<string> {
  return (await getCopy<Collection[]>("/api/collections"))?.find((item) => item.id === id)?.name ?? "a collection";
}
async function deckName(id: string): Promise<string> {
  return (await getCopy<DeckDetail>(`/api/decks/${enc(id)}`))?.name ?? "a deck";
}

type Local = { response: unknown; base?: unknown; url?: string; label: string };

/** Applies a change to the copy on the phone, for changes that can wait for the server. Null when the change needs a connection. */
async function applyLocally(method: string, url: string, body: Record<string, unknown>): Promise<Local | null> {
  let match: RegExpExecArray | null;
  const path = url.split("?")[0]!;
  if (path.startsWith("/api/notes")) {
    const children = new URLSearchParams(url.split("?")[1] ?? "").get("children");
    return applyNotesLocally(method, path, children ? { ...body, children } : body);
  }
  if (method === "PUT" && url === "/api/prefs") {
    await setCopy("/api/prefs", body);
    return { response: { ok: true }, label: "Settings" };
  }
  if ((match = /^\/api\/collections\/([^/]+)\/cards$/.exec(path))) {
    const id = decodeURIComponent(match[1]!);
    const name = await collectionName(id);
    if (method === "POST") {
      const item = readItem(body);
      const { entries: list } = await addCopies(id, [item]);
      const entry = list.find((candidate) => sameCopy(candidate, item));
      if (!entry) throw new Error("That card is not on this phone.");
      return { response: entry, label: `Add ${item.quantity} ${entry.name} to ${name}` };
    }
    if (method === "PUT" && Array.isArray(body.items)) {
      const items = (body.items as Array<Record<string, unknown>>).map(readItem);
      const list = await entries(id);
      const base = items.map((item) => ({ ...item, quantity: list.find((entry) => sameCopy(entry, item))?.quantity ?? 0 }));
      for (const item of items) {
        let entry = list.find((candidate) => sameCopy(candidate, item));
        if (!entry) {
          const created = await newEntry(item);
          if (!created) continue;
          list.push(created);
          entry = created;
        }
        entry.quantity = item.quantity;
        entry.trade = Math.min(item.trade ?? entry.trade, item.quantity);
      }
      await saveEntries(id, list);
      return { response: { status: "saved", count: items.length }, base, label: `Change ${items.length === 1 ? "a card" : `${items.length} cards`} in ${name}` };
    }
  }
  if (method === "POST" && (match = /^\/api\/collections\/([^/]+)\/cards\/add$/.exec(path)) && Array.isArray(body.items)) {
    const id = decodeURIComponent(match[1]!);
    const items = (body.items as Array<Record<string, unknown>>).map(readItem);
    const { before, after } = await addCopies(id, items);
    const added = after.reduce((sum, item, index) => sum + item.quantity - before[index]!.quantity, 0);
    return { response: { added, before, after }, label: `Add ${added} cards to ${await collectionName(id)}` };
  }
  if (method === "POST" && (match = /^\/api\/collections\/([^/]+)\/move$/.exec(path)) && Array.isArray(body.items) && typeof body.to === "string") {
    const from = decodeURIComponent(match[1]!);
    const items = (body.items as Array<Record<string, unknown>>).map(readItem);
    const list = await entries(from);
    const moving = items.map((item) => ({ ...item, quantity: Math.min(item.quantity, list.find((entry) => sameCopy(entry, item))?.quantity ?? 0) })).filter((item) => item.quantity > 0);
    await addCopies(from, moving.map((item) => ({ ...item, quantity: -item.quantity })));
    await addCopies(body.to, moving);
    return { response: { moved: moving.map(({ trade: _trade, ...item }) => item) }, label: `Move cards from ${await collectionName(from)} to ${await collectionName(body.to)}` };
  }
  if (method === "PATCH" && (match = /^\/api\/collections\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(match[1]!);
    const collections = (await getCopy<Collection[]>("/api/collections")) ?? [];
    const current = collections.find((item) => item.id === id);
    if (!current) return null;
    // the name and description can change offline; set links and rules only when they stay the same
    const same = (key: string) => key === "sets"
      ? JSON.stringify([...(body.sets as string[] ?? [])].sort()) === JSON.stringify(current.sets.map((set) => set.code).sort())
      : body[key] === (current as Record<string, unknown>)[key];
    if (Object.keys(body).some((key) => !["name", "description"].includes(key) && !same(key))) return null;
    const saved = { ...current, ...(typeof body.name === "string" ? { name: body.name, realName: body.name } : {}), ...(typeof body.description === "string" ? { description: body.description } : {}) };
    await setCopy("/api/collections", collections.map((item) => (item.id === id ? saved : item)));
    return { response: saved, label: `Rename ${current.name}` };
  }
  if (method === "POST" && path === "/api/collections" && typeof body.id === "string" && typeof body.name === "string") {
    const me = (await getCopy<{ id: number; name: string }>("/api/me")) ?? { id: 0, name: "" };
    const created: Collection = {
      id: body.id, name: body.name, realName: body.name, description: typeof body.description === "string" ? body.description : "",
      completion: "none", finish: "any", kind: body.kind === "wishlist" ? "wishlist" : "collection", sets: [], entryCount: 0, cardCount: 0, tradeCount: 0,
      value: { usd: 0, eur: 0, unpricedUsd: 0, unpricedEur: 0 }, progress: null, role: "owner", owner: me, displayName: null, sharedWith: [],
    };
    if (Array.isArray(body.sets) && body.sets.length) return null;
    await setCopy("/api/collections", [...((await getCopy<Collection[]>("/api/collections")) ?? []), created]);
    await setCopy(`/api/collections/${enc(body.id)}/cards`, []);
    return { response: created, label: `Create ${body.name}` };
  }
  if (method === "POST" && path === "/api/decks" && typeof body.id === "string" && typeof body.name === "string") {
    const me = (await getCopy<{ id: number; name: string }>("/api/me")) ?? { id: 0, name: "" };
    const created: Deck = {
      id: body.id, name: body.name, realName: body.name, format: typeof body.format === "string" ? body.format : "casual", mode: "theme", card_count: 0,
      collection_id: typeof body.collectionId === "string" ? body.collectionId : null, role: "owner", owner: me, displayName: null, sharedWith: [],
    };
    await setCopy("/api/decks", [created, ...((await getCopy<Deck[]>("/api/decks")) ?? [])]);
    await setCopy(`/api/decks/${enc(body.id)}`, { ...created, cards: [] } satisfies DeckDetail);
    return { response: created, label: `Create ${body.name}` };
  }
  if ((match = /^\/api\/decks\/([^/]+)$/.exec(path)) && method === "PATCH" && typeof body.collectionId !== "undefined" && body.name === undefined) {
    const id = decodeURIComponent(match[1]!);
    const decks = await getCopy<Deck[]>("/api/decks");
    if (decks) await setCopy("/api/decks", decks.map((deck) => (deck.id === id ? { ...deck, collection_id: body.collectionId as string | null } : deck)));
    const detail = await getCopy<DeckDetail>(`/api/decks/${enc(id)}`);
    if (detail) await setCopy(`/api/decks/${enc(id)}`, { ...detail, collection_id: body.collectionId as string | null });
    return { response: { status: "saved" }, label: "Deck settings" };
  }
  if ((match = /^\/api\/decks\/([^/]+)$/.exec(path)) && method === "PATCH" && typeof body.name === "string") {
    const id = decodeURIComponent(match[1]!);
    const detail = await getCopy<DeckDetail>(`/api/decks/${enc(id)}`);
    const label = `Rename ${detail?.name ?? "a deck"}`;
    if (detail) await setCopy(`/api/decks/${enc(id)}`, { ...detail, name: body.name, realName: body.name });
    const decks = await getCopy<Deck[]>("/api/decks");
    if (decks) await setCopy("/api/decks", decks.map((deck) => (deck.id === id ? { ...deck, name: body.name as string, realName: body.name as string } : deck)));
    return { response: { status: "renamed" }, label };
  }
  if ((match = /^\/api\/decks\/([^/]+)\/cards$/.exec(path)) && method === "POST") {
    const id = decodeURIComponent(match[1]!);
    const detail = await getCopy<DeckDetail>(`/api/decks/${enc(id)}`);
    const card = await compactCard(String(body.cardId ?? ""));
    if (!detail || !card) return null;
    const quantity = Number(body.quantity ?? 1);
    const zone = (typeof body.zone === "string" ? body.zone : "main") as DeckCard["zone"];
    const printing = card.id;
    const finish = (body.finish === 2 || body.finish === "etched" ? 2 : body.finish === 1 || body.finish === true || body.finish === "foil" ? 1 : 0) as FinishCode;
    let existing = detail.cards.find((entry) => entry.oracle_id === card.oracle_id && entry.zone === zone && entry.printing_id === printing && (entry.finish ?? 0) === finish);
    if (existing) existing.quantity += quantity;
    else {
      existing = {
        entry_id: -Date.now() - Math.floor(Math.random() * 1000), card_id: card.id, oracle_id: card.oracle_id, printing_id: printing, quantity, zone,
        name: card.name, mana_cost: card.mana_cost, type_line: card.type_line, set_code: card.set_code, set_name: card.set_name,
        collector_number: card.collector_number, image_url: card.image_url, links: [], finish,
      };
      detail.cards.push(existing);
    }
    // the copies sent with the card fill it on the phone too; the server checks they are free when the change arrives
    if (Array.isArray(body.links)) {
      const collections = (await getCopy<Collection[]>("/api/collections")) ?? [];
      for (const raw of body.links as Array<Record<string, unknown>>) {
        const item = readItem(raw);
        const collectionId = String(raw.collectionId ?? "");
        existing.links = [...(existing.links ?? []), {
          ...item, collectionId, collectionName: collections.find((entry) => entry.id === collectionId)?.name ?? "a collection",
          quantity: Math.min(item.quantity, quantity),
        } as DeckLink];
      }
    }
    existing.missing = Math.max(0, existing.quantity - (existing.links ?? []).reduce((sum, link) => sum + link.quantity, 0));
    await setCopy(`/api/decks/${enc(id)}`, detail);
    return { response: { status: "added" }, label: `Add ${quantity} ${card.name} to ${detail.name}` };
  }
  if ((match = /^\/api\/decks\/([^/]+)\/cards\/([^/]+)$/.exec(path)) && (method === "PATCH" || method === "DELETE")) {
    const id = decodeURIComponent(match[1]!);
    const oracle = decodeURIComponent(match[2]!);
    const query = new URLSearchParams(url.split("?")[1] ?? "");
    const zone = query.get("zone") ?? "main";
    const entryId = Number(query.get("entryId") ?? NaN);
    const detail = await getCopy<DeckDetail>(`/api/decks/${enc(id)}`);
    if (!detail) return null;
    const entry = detail.cards.find((candidate) => (Number.isFinite(entryId) ? candidate.entry_id === entryId : candidate.oracle_id === oracle && candidate.zone === zone));
    if (!entry) throw new Error("That card is not in the deck.");
    // an entry added on the phone has no number on the server yet, so the server finds it by card and zone
    let sendUrl = url;
    if (entry.entry_id < 0) {
      query.delete("entryId");
      sendUrl = `${path}?${query}`;
    }
    const base = { quantity: entry.quantity };
    const quantity = method === "DELETE" ? 0 : Number(body.quantity ?? entry.quantity);
    const nextZone = (method === "PATCH" && typeof body.zone === "string" ? body.zone : entry.zone) as DeckCard["zone"];
    if (quantity === 0) detail.cards = detail.cards.filter((candidate) => candidate !== entry);
    else {
      const target = nextZone !== entry.zone ? detail.cards.find((candidate) => candidate !== entry && candidate.oracle_id === entry.oracle_id && candidate.zone === nextZone && candidate.printing_id === entry.printing_id) : undefined;
      if (target) {
        target.quantity += quantity;
        detail.cards = detail.cards.filter((candidate) => candidate !== entry);
      } else {
        entry.quantity = quantity;
        entry.zone = nextZone;
      }
    }
    await setCopy(`/api/decks/${enc(id)}`, detail);
    return { response: { status: quantity === 0 ? "removed" : "updated" }, base: method === "PATCH" ? base : undefined, url: sendUrl, label: `Change ${entry.name} in ${await deckName(id)}` };
  }
  return null;
}

async function addToQueue(method: string, url: string, body: unknown, local: Local) {
  // only the newest settings change matters
  if (url === "/api/prefs") for (const old of await queue()) if (old.url === "/api/prefs") await idbDelete("queue", old.id);
  // saves of one notes page join into one change, sent from the version the first one started from
  if (method === "PUT" && /^\/api\/notes\/pages\/[^/]+$/.test(url)) {
    const waiting = (await queue()).filter((old) => old.url === url && old.method === "PUT");
    const first = waiting[0];
    if (first) {
      const joined = { ...(first.body as Record<string, unknown>), ...(body as Record<string, unknown>), baseVersion: (first.body as Record<string, unknown>).baseVersion };
      await idbSet("queue", first.id, { ...first, body: joined, at: Date.now() });
      for (const old of waiting.slice(1)) await idbDelete("queue", old.id);
      await countQueue();
      return;
    }
  }
  const id = crypto.randomUUID();
  seq = Math.max(seq, ...(await queue()).map((item) => item.seq)) + 1;
  const item: Queued = { id, seq, at: Date.now(), method, url: local.url ?? url, body, label: local.label, ...(local.base !== undefined ? { base: local.base } : {}) };
  await idbSet("queue", id, item);
  await countQueue();
}

// ---------- answers on the phone ----------

async function detailOnPhone(id: string): Promise<CardDetail> {
  const card = await compactCard(id);
  if (!card) throw new OfflineError(NEEDS_CONNECTION);
  const cached = await getCopy<CardDetail>(`/api/cards/${enc(id)}`);
  const collections = ((await getCopy<Collection[]>("/api/collections")) ?? []);
  const owned: CardDetail["owned"]["collections"] = [];
  for (const collection of collections) {
    const list = (await entries(collection.id)).filter((entry) => entry.oracle_id === card.oracle_id);
    if (!list.length) continue;
    const of = (finish: FinishCode) => list.filter((entry) => entry.id === id && entry.foil === finish).reduce((sum, entry) => sum + entry.quantity, 0);
    owned.push({
      id: collection.id, name: collection.name, wishlist: collection.kind === "wishlist", regular: of(0), foil: of(1), etched: of(2),
      trade: list.reduce((sum, entry) => sum + entry.trade, 0), allPrintings: list.reduce((sum, entry) => sum + entry.quantity, 0),
    });
  }
  const have = owned.filter((item) => !item.wishlist);
  const sum = (key: "regular" | "foil" | "etched" | "allPrintings") => have.reduce((total, item) => total + item[key], 0);
  return {
    ...card, ...(cached ? { oracle_text: cached.oracle_text, artist: cached.artist, prices: cached.prices } : {}),
    owned: { regular: sum("regular"), foil: sum("foil"), etched: sum("etched"), allPrintings: sum("allPrintings"), collections: have },
    wanted: owned.filter((item) => item.wishlist), pricesUpdatedAt: cached?.pricesUpdatedAt ?? null,
  };
}

async function answerOnPhone(url: string): Promise<unknown> {
  const [path, query = ""] = url.split("?") as [string, string?];
  if (path === "/api/cards") return searchCards(new URLSearchParams(query));
  if (path === "/api/cards/match") return matchCards(new URLSearchParams(query));
  if (path.startsWith("/api/notes/")) {
    const notes = await answerNotes(path, new URLSearchParams(query));
    if (notes !== undefined) return notes;
  }
  if (path === "/api/catalog/suggest") return suggestOnPhone(new URLSearchParams(query), await getCopy<Record<string, string[]>>("/api/catalog/lists"));
  let match: RegExpExecArray | null;
  if ((match = /^\/api\/cards\/([^/]+)\/printings$/.exec(path))) return printingsOf(decodeURIComponent(match[1]!));
  if ((match = /^\/api\/cards\/([^/]+)\/rulings$/.exec(path))) return rulingsOf(decodeURIComponent(match[1]!));
  if ((match = /^\/api\/cards\/([^/]+)$/.exec(path))) return detailOnPhone(decodeURIComponent(match[1]!));
  const copy = await getCopy(url);
  if (copy !== undefined) return copy;
  // statistics and similar answers kept for another currency still help
  if (query) {
    const near = await getCopy(path);
    if (near !== undefined) return near;
  }
  throw new OfflineError(NEEDS_CONNECTION);
}

// ---------- requests ----------

function parseBody(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string" || !init.body) return {};
  const type = String((init.headers as Record<string, string> | undefined)?.["content-type"] ?? "application/json");
  if (!type.includes("json") || type.includes("backup")) return {};
  try {
    const value: unknown = JSON.parse(init.body);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * A request failed to reach the server. The app only goes offline when a quick health check also fails: a slow answer
 * or a busy moment is not a lost connection.
 */
let probing: Promise<boolean> | null = null;
let lastProbe = 0;
function reachable(): Promise<boolean> {
  probing ??= (async () => {
    lastProbe = Date.now();
    try {
      const response = await appFetch("/api/health", {}, 5_000);
      return response.ok;
    } catch {
      return false;
    } finally {
      probing = null;
    }
  })();
  return probing;
}

async function goneOffline(): Promise<boolean> {
  if (await reachable()) return false;
  if (status.state !== "offline") setStatus({ state: "offline" });
  scheduleRetry();
  return true;
}

/** While offline, any use of the app checks (at most every 10 seconds) whether the server is back. */
function checkBack() {
  if (status.state === "offline" && Date.now() - lastProbe > RETRY_MS) {
    void reachable().then((ok) => { if (ok) void syncNow(); });
  }
}

async function network<T>(url: string, init: RequestInit): Promise<T> {
  const [path, query = ""] = url.split("?");
  const onlineSearch = (path === "/api/cards" || path === "/api/cards/match") && new URLSearchParams(query).has("scryfall");
  return readJson<T>(await appFetch(url, init, onlineSearch ? 0 : 15_000));
}

/** Every request from the Android app goes through here. */
const offline = () => status.state === "offline";
const pending = () => status.pending > 0;

export async function appRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  checkBack();
  if (method === "GET") {
    if (!offline()) {
      if (pending()) await syncNow();
      if (!offline() && !pending()) {
        try {
          const value = await network<T>(url, init);
          if (keep(url)) void setCopy(url, value);
          return value;
        } catch (reason) {
          if (!(reason instanceof OfflineError)) throw reason;
          await goneOffline();
        }
      }
    }
    return answerOnPhone(url) as Promise<T>;
  }
  if (url === "/api/scan/match") {
    if (!offline()) {
      try {
        return await network<T>(url, init);
      } catch (reason) {
        if (!(reason instanceof OfflineError)) throw reason;
        await goneOffline();
      }
    }
    const body = parseBody(init);
    return matchOnPhone(Array.isArray(body.lines) ? body.lines as string[] : [], typeof body.info === "string" ? body.info : "") as Promise<T>;
  }
  if (!offline() && pending()) await syncNow();
  if (!offline() && !pending()) {
    try {
      const answer = await network<T>(url, init);
      // keep the copy on the phone in step, so it is right even if the connection drops before the next sync
      await applyLocally(method, url, parseBody(init)).catch(() => null);
      return answer;
    } catch (reason) {
      if (!(reason instanceof OfflineError)) throw reason;
      await goneOffline();
    }
  }
  const body = parseBody(init);
  const local = await applyLocally(method, url, body);
  if (!local) throw new OfflineError(NEEDS_CONNECTION);
  await addToQueue(method, url, Object.keys(body).length ? body : undefined, local);
  return local.response as T;
}

// ---------- sync ----------

let retryTimer: number | null = null;
function scheduleRetry() {
  if (retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void syncNow();
  }, RETRY_MS);
}

async function sendQueue(): Promise<SyncProblem[]> {
  const problems: SyncProblem[] = [];
  for (;;) {
    const batch = (await queue()).slice(0, 100);
    if (!batch.length) return problems;
    const answer = await readJson<{ results: Array<{ id: string; status: number; error: string | null }> }>(
      await appFetch("/api/sync", { method: "POST", body: JSON.stringify({ changes: batch.map(({ id, method, url, body, base }) => ({ id, method, url, body, base })) }) }, 60_000),
    );
    for (const result of answer.results as Array<{ id: string; status: number; error: string | null; body?: unknown }>) {
      const item = batch.find((candidate) => candidate.id === result.id);
      if (result.status >= 500) throw new OfflineError("The server could not take the changes now.");
      // a page saved offline met a newer save on the server: the page asks which text to keep
      const conflict = (result.body as { conflict?: Conflict } | null)?.conflict;
      if (result.status === 409 && conflict && item && /^\/api\/notes\/pages\/[^/]+$/.test(item.url)) {
        const mine = item.body as { title?: string; body?: string };
        const pageId = decodeURIComponent(item.url.split("/").pop()!);
        window.dispatchEvent(new CustomEvent<ClashDetail>(NOTE_CLASH, { detail: { pageId, mine: { title: mine.title ?? conflict.title, body: mine.body ?? conflict.body }, theirs: conflict } }));
        await idbDelete("queue", result.id);
        continue;
      }
      if (result.status >= 400 && item) problems.push({ label: item.label, error: result.error ?? "The server refused this change." });
      await idbDelete("queue", result.id);
    }
    await countQueue();
  }
}

/**
 * Brings the copy on the phone up to date when anything changed on the server: the lists first, then only the
 * collections and decks whose change time moved. A newer card list and newer rulings are downloaded too.
 */
async function refreshCopy(force: boolean): Promise<boolean> {
  const state = await readJson<{ revision: string; catalog: string | null; rulings?: string | null }>(await appFetch("/api/sync/state"));
  let changed = false;
  if (force || state.revision !== (await idbGet<string>("meta", "revision"))) {
    const get = async <T>(url: string): Promise<T | null> => {
      try {
        const value = await readJson<T>(await appFetch(url, {}, 60_000));
        await setCopy(url, value);
        return value;
      } catch (reason) {
        if (reason instanceof OfflineError || reason instanceof SignedOutError) throw reason;
        return null;
      }
    };
    const oldCollections = new Map(((await getCopy<Collection[]>("/api/collections")) ?? []).map((item) => [item.id, item]));
    const oldDecks = new Map(((await getCopy<Deck[]>("/api/decks")) ?? []).map((item) => [item.id, item]));
    await Promise.all(["/api/me", "/api/prefs", "/api/shares", "/api/trade"].map((url) => get(url)));
    const collections = (await get<Collection[]>("/api/collections")) ?? [];
    for (const collection of collections) {
      const before = oldCollections.get(collection.id);
      const cardsUrl = `/api/collections/${enc(collection.id)}/cards`;
      if (!force && before && before.updatedAt === collection.updatedAt && (await getCopy(cardsUrl)) !== undefined) continue;
      await get(cardsUrl);
      await get(`/api/collections/${enc(collection.id)}/completion`);
    }
    const decks = (await get<Deck[]>("/api/decks")) ?? [];
    // notes pages (0.22.0)
    await refreshNotes(get);
    for (const deck of decks) {
      const before = oldDecks.get(deck.id) as (Deck & { updated_at?: string }) | undefined;
      const url = `/api/decks/${enc(deck.id)}`;
      if (!force && before && before.updated_at === (deck as Deck & { updated_at?: string }).updated_at && (await getCopy(url)) !== undefined) continue;
      await get(url);
    }
    await idbSet("meta", "revision", state.revision);
    changed = true;
  }
  if (state.catalog !== ((await idbGet<string | null>("meta", "catalogStamp")) ?? null) || !(await idbGet("meta", "catalogVersion"))) {
    if (await refreshCatalog()) changed = true;
    await idbSet("meta", "catalogStamp", state.catalog);
  }
  if (state.rulings && state.rulings !== (await idbGet<string | null>("meta", "rulingsStamp"))) {
    try {
      await refreshRulings();
      await idbSet("meta", "rulingsStamp", state.rulings);
    } catch (reason) {
      if (reason instanceof OfflineError || reason instanceof SignedOutError) throw reason;
    }
  }
  return changed;
}

/** Sends waiting changes, then brings the copy on the phone up to date. Safe to call at any time. */
export function syncNow(force = false): Promise<void> {
  flushing ??= (async () => {
    setStatus({ state: "syncing" });
    try {
      const problems = await sendQueue();
      const changed = await refreshCopy(force || problems.length > 0);
      setStatus({ state: "online", lastSync: Date.now(), error: null });
      if (problems.length) window.dispatchEvent(new CustomEvent<SyncProblem[]>(PROBLEM_EVENT, { detail: problems }));
      if (changed) window.dispatchEvent(new Event(SYNCED_EVENT));
    } catch (reason) {
      // only a lost connection makes the app offline; any other failure keeps it online and is tried again at the next sync
      if (reason instanceof SignedOutError) setStatus({ state: "online" });
      else if (reason instanceof OfflineError) {
        if (!(await goneOffline())) setStatus({ state: "online", error: reason.message });
      } else setStatus({ state: "online", error: reason instanceof Error ? reason.message : "The sync did not finish." });
    } finally {
      await countQueue();
      flushing = null;
    }
  })();
  return flushing;
}

let started = false;
/** Starts the sync loop: at once, when the connection returns, and every minute. */
export function startSync(): void {
  if (started) return;
  started = true;
  void countQueue().then(() => syncNow());
  window.addEventListener("online", () => { void syncNow(); });
  window.addEventListener("offline", () => goneOffline());
  window.setInterval(() => {
    if (status.state === "online") void syncNow();
  }, CHECK_MS);
}
