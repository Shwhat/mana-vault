// ---------- the compact card catalog kept on the phone: offline search, card lookup and scan matching ----------
import { bestName, buildNameIndex, MIN_NAME_SCORE, normalize, readInfoLine, type NameIndex } from "../../../server/src/scan-core";
import type { Card, Currency, SearchSort } from "../types";
import { plainWords, sortFound } from "../search-sort";
import { compileQuery, type QueryCard } from "../query-match";
import { idbGet, idbSet } from "./idb";
import { appFetch, OfflineError } from "./net";

export type CompactCard = Card & {
  oracle_id: string; color_identity: string; finishes: string; flavor_name: string | null; promo: number; variation: number; released_at: string | null;
};
type Stored = { version: string; fields: string[]; rows: unknown[][]; formats?: string[] };
type Loaded = { version: string; cards: CompactCard[]; byId: Map<string, CompactCard>; names: NameIndex | null; formats: string[]; promoTypes: Set<string> };

let loaded: Loaded | null = null;
let loading: Promise<Loaded | null> | null = null;

function expand(stored: Stored): Loaded {
  const cards = stored.rows.map((row) => {
    const card: Record<string, unknown> = {};
    stored.fields.forEach((field, index) => { card[field] = row[index] ?? null; });
    if (!("oracle_text" in card)) card.oracle_text = null;
    return card as CompactCard;
  });
  const promoTypes = new Set(cards.flatMap((card) => String(card.promo_types ?? "").toLowerCase().split(",").filter(Boolean)));
  return { version: stored.version, cards, byId: new Map(cards.map((card) => [card.id, card])), names: null, formats: stored.formats ?? [], promoTypes };
}

/** The catalog on the phone, read into memory once. Null until the first download. */
export function catalog(): Promise<Loaded | null> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= idbGet<Stored>("meta", "catalog").then((stored) => {
    loaded = stored ? expand(stored) : null;
    loading = null;
    return loaded;
  });
  return loading;
}

export async function catalogVersion(): Promise<string | null> {
  return (await idbGet<string>("meta", "catalogVersion")) ?? null;
}

/** Downloads the catalog when the server has a newer one. Returns true when it changed. */
export async function refreshCatalog(): Promise<boolean> {
  const version = await catalogVersion();
  const response = await appFetch("/api/catalog/compact", { headers: version ? { "if-none-match": `"${version}"` } : {} }, 180_000);
  if (response.status === 304) return false;
  if (!response.ok) throw new Error(`The card list could not be downloaded (${response.status}).`);
  const stored = (await response.json()) as Stored;
  await idbSet("meta", "catalog", stored);
  await idbSet("meta", "catalogVersion", stored.version);
  loaded = expand(stored);
  return true;
}

async function needCatalog(): Promise<Loaded> {
  const current = await catalog();
  if (!current) throw new OfflineError("The card list is not on this phone yet. Connect to the server once to download it.");
  return current;
}

/** Downloads every ruling when the server has newer ones. Returns true when they changed. */
export async function refreshRulings(): Promise<boolean> {
  const version = (await idbGet<string>("meta", "rulingsVersion")) ?? null;
  const response = await appFetch("/api/rulings/compact", { headers: version ? { "if-none-match": `"${version}"` } : {} }, 180_000);
  if (response.status === 304) return false;
  if (!response.ok) throw new Error(`The rulings could not be downloaded (${response.status}).`);
  const stored = (await response.json()) as { version: string; rulings: Record<string, Array<[string, string]>> };
  await idbSet("meta", "rulings", stored.rulings);
  await idbSet("meta", "rulingsVersion", stored.version);
  rulings = stored.rulings;
  return true;
}

let rulings: Record<string, Array<[string, string]>> | null = null;
/** A card's rulings from the copy on the phone. */
export async function rulingsOf(id: string): Promise<Array<{ date: string; text: string }>> {
  rulings ??= (await idbGet<Record<string, Array<[string, string]>>>("meta", "rulings")) ?? {};
  const card = await compactCard(id);
  return card ? (rulings[card.oracle_id] ?? []).map(([date, text]) => ({ date, text })) : [];
}

export async function compactCard(id: string): Promise<CompactCard | null> {
  return (await catalog())?.byId.get(id) ?? null;
}

const newest = (a: CompactCard, b: CompactCard) =>
  (b.released_at ?? "").localeCompare(a.released_at ?? "") || a.promo - b.promo || a.variation - b.variation ||
  a.collector_number.length - b.collector_number.length || a.collector_number.localeCompare(b.collector_number);

/** The oracle ids of the cards the account owns, from the copy of All collections kept on the phone (for is:owned). */
async function ownedOnPhone(): Promise<Set<string> | null> {
  for (const url of ["/api/library/cards", "/api/library/cards?wishlists=1"]) {
    const rows = await idbGet<Array<{ oracle_id?: string; proxy?: boolean | number; collection_kind?: string }>>("cache", url).catch(() => undefined);
    if (Array.isArray(rows)) return new Set(rows.filter((row) => !row.proxy && row.collection_kind !== "wishlist").map((row) => String(row.oracle_id ?? "")).filter(Boolean));
  }
  return null;
}

/**
 * Card search on the phone (0.17.0): the full search syntax, read with the server's rules (query-match.ts), with the
 * filters from the Filters panel.
 */
export async function searchCards(params: URLSearchParams): Promise<Card[] | { total: number; cards: Card[] }> {
  if (params.get("scryfall")) throw new Error("Scryfall online search needs a connection to the server.");
  const { cards, formats, promoTypes } = await needCatalog();
  const query = params.get("q") ?? "";
  const matches = compileQuery(query, { formats, promoTypes, owned: /\b(is|not):owned\b/i.test(query) ? await ownedOnPhone() : null });
  const words = normalize(plainWords(query)).split(" ").filter(Boolean);
  const color = params.get("color")?.toUpperCase();
  const type = params.get("type")?.trim().toLowerCase();
  const set = params.get("set")?.trim().toLowerCase();
  const rarity = params.get("rarity")?.trim().toLowerCase();
  const min = params.get("mvMin") ? Number(params.get("mvMin")) : null;
  const max = params.get("mvMax") ? Number(params.get("mvMax")) : null;
  const limit = Math.min(100, Number(params.get("limit") ?? 40) || 40);
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const paged = params.get("paged") === "1";
  const sort = (params.get("sort") ?? "best") as SearchSort;
  const sorting = paged && (sort !== "best" || words.length > 0);
  const found: Card[] = [];
  let total = 0;
  for (const card of cards) {
    if (set && card.set_code !== set) continue;
    if (rarity && card.rarity !== rarity) continue;
    if (color && !card.colors.includes(color)) continue;
    if (type && !card.type_line.toLowerCase().includes(type)) continue;
    if (min !== null && (card.mana_value ?? 0) < min) continue;
    if (max !== null && (card.mana_value ?? 0) > max) continue;
    if (!matches(card as unknown as QueryCard)) continue;
    total += 1;
    if (sorting) found.push(card);
    else if (total > offset && found.length < limit) found.push(card);
    else if (!paged && found.length >= limit) break;
  }

  if (sorting) {
    const currency: Currency = "usd";
    return { total, cards: sortFound(found, sort, params.get("q") ?? "", currency).slice(offset, offset + limit) };
  }
  return paged ? { total, cards: found } : found;
}

/** Match all local printings for collection and deck filters. */
export async function matchCards(params: URLSearchParams): Promise<{ ids: string[] }> {
  if (params.get("scryfall")) throw new Error("Scryfall online search needs a connection to the server.");
  const { cards, formats, promoTypes } = await needCatalog();
  const query = params.get("q") ?? "";
  if (!query.trim() || query.length > 400) throw new Error("Invalid card search");
  const matches = compileQuery(query, { formats, promoTypes, owned: /\b(is|not):owned\b/i.test(query) ? await ownedOnPhone() : null });
  return { ids: cards.filter((card) => matches(card as unknown as QueryCard)).map((card) => card.id) };
}

/** Every printing of the card's name, newest first. */
export async function printingsOf(id: string): Promise<CompactCard[]> {
  const { cards, byId } = await needCatalog();
  const card = byId.get(id);
  if (!card) return [];
  return cards.filter((other) => other.oracle_id === card.oracle_id).sort(newest);
}

type Match = { card: CompactCard | null; score: number; by: "printing" | "name" | null; read: string; exact?: boolean };

/** The same matching rules as the server's scan matching (apps/server/src/scan.ts), against the catalog on the phone. */
export async function matchOnPhone(lines: string[], info: string): Promise<Match> {
  const current = await needCatalog();
  current.names ??= buildNameIndex(current.version, current.cards);
  const named = lines.length ? bestName(current.names, lines) : null;
  const nameOk = named && named.score >= MIN_NAME_SCORE ? named : null;
  const { numbers, sets } = readInfoLine(info);
  const known = new Set(current.cards.map((card) => card.set_code));
  const knownSets = sets.filter((code) => known.has(code));
  if (knownSets.length && numbers.length) {
    const rows = current.cards.filter((card) => knownSets.includes(card.set_code) && numbers.includes(card.collector_number)).sort(newest);
    const agree = rows.find((card) => !nameOk || card.name === nameOk.name);
    if (agree) return { card: agree, score: nameOk?.score ?? 1, by: "printing", read: nameOk?.read ?? info.trim() };
  }
  if (!nameOk) return { card: null, score: named?.score ?? 0, by: null, read: named?.read ?? "" };
  const named_ = current.cards.filter((card) => card.name === nameOk.name).sort(newest);
  const inSet = knownSets.length ? named_.find((card) => knownSets.includes(card.set_code)) : undefined;
  const flavored = !inSet && nameOk.flavor ? named_.find((card) => card.flavor_name === nameOk.flavor) : undefined;
  const card = inSet ?? flavored ?? named_[0] ?? null;
  return { card, score: nameOk.score, by: inSet ? "printing" : "name", read: nameOk.read, ...(inSet ? { exact: false } : {}) };
}

/** For tests: replaces the catalog in memory. */
export function setCatalogForTest(stored: Stored | null) {
  loaded = stored ? expand(stored) : null;
}

/** Suggestions offline: card names from the catalog on the phone, other lists from the copy kept of /api/catalog/lists. */
export async function suggestOnPhone(params: URLSearchParams, lists: Record<string, string[]> | undefined): Promise<string[]> {
  const term = (params.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(20, Math.max(1, Number(params.get("limit")) || 10));
  if (!term) return [];
  const list = params.get("list") ?? "names";
  const items = list === "names" ? [...new Set((await catalog())?.cards.map((card) => card.name) ?? [])] : lists?.[list] ?? [];
  const starts = items.filter((item) => item.toLowerCase().startsWith(term));
  const holds = items.filter((item) => !item.toLowerCase().startsWith(term) && item.toLowerCase().includes(term));
  return [...starts.sort((a, b) => a.length - b.length || a.localeCompare(b)), ...holds].slice(0, limit);
}
