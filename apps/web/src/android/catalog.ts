// ---------- the compact card catalog kept on the phone: offline search, card lookup and scan matching ----------
import { bestName, buildNameIndex, MIN_NAME_SCORE, normalize, readInfoLine, type NameIndex } from "../../../server/src/scan-core";
import type { Card } from "../types";
import { idbGet, idbSet } from "./idb";
import { appFetch, OfflineError } from "./net";

export type CompactCard = Card & {
  oracle_id: string; finishes: string; flavor_name: string | null; promo: number; variation: number; released_at: string | null;
};
type Stored = { version: string; fields: string[]; rows: unknown[][] };
type Loaded = { version: string; cards: CompactCard[]; byId: Map<string, CompactCard>; names: NameIndex | null };

let loaded: Loaded | null = null;
let loading: Promise<Loaded | null> | null = null;

function expand(stored: Stored): Loaded {
  const cards = stored.rows.map((row) => {
    const card: Record<string, unknown> = {};
    stored.fields.forEach((field, index) => { card[field] = row[index] ?? null; });
    if (!("oracle_text" in card)) card.oracle_text = null;
    return card as CompactCard;
  });
  return { version: stored.version, cards, byId: new Map(cards.map((card) => [card.id, card])), names: null };
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

/** Card search on the phone: every word must appear in the name (or flavor name), with the filters from the Filters panel. */
export async function searchCards(params: URLSearchParams): Promise<Card[]> {
  const { cards } = await needCatalog();
  const words = normalize(params.get("q") ?? "").split(" ").filter(Boolean);
  const color = params.get("color")?.toUpperCase();
  const type = params.get("type")?.trim().toLowerCase();
  const set = params.get("set")?.trim().toLowerCase();
  const rarity = params.get("rarity")?.trim().toLowerCase();
  const min = params.get("mvMin") ? Number(params.get("mvMin")) : null;
  const max = params.get("mvMax") ? Number(params.get("mvMax")) : null;
  const limit = Math.min(100, Number(params.get("limit") ?? 40) || 40);
  const found: Card[] = [];
  for (const card of cards) {
    if (set && card.set_code !== set) continue;
    if (rarity && card.rarity !== rarity) continue;
    if (color && !card.colors.includes(color)) continue;
    if (type && !card.type_line.toLowerCase().includes(type)) continue;
    if (min !== null && (card.mana_value ?? 0) < min) continue;
    if (max !== null && (card.mana_value ?? 0) > max) continue;
    if (words.length) {
      const text = normalize(`${card.name} ${card.flavor_name ?? ""}`);
      if (!words.every((word) => text.includes(word))) continue;
    }
    found.push(card);
    if (found.length >= limit) break;
  }
  return found;
}

/** Every printing of the card's name, newest first. */
export async function printingsOf(id: string): Promise<CompactCard[]> {
  const { cards, byId } = await needCatalog();
  const card = byId.get(id);
  if (!card) return [];
  return cards.filter((other) => other.oracle_id === card.oracle_id).sort(newest);
}

type Match = { card: CompactCard | null; score: number; by: "printing" | "name" | null; read: string };

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
  return { card, score: nameOk.score, by: inSet ? "printing" : "name", read: nameOk.read };
}

/** For tests: replaces the catalog in memory. */
export function setCatalogForTest(stored: Stored | null) {
  loaded = stored ? expand(stored) : null;
}
