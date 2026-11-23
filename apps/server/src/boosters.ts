// ---------- booster contents (0.21.0): expected value per pack, virtual packs and the pull check, from MTGJSON's
// booster sheets (each booster type is a list of pack layouts with weights; each layout takes cards from sheets). ----------
import type { DatabaseSync } from "node:sqlite";
import { type PriceSource, sourcePrice } from "./mtgjson.js";

type Sheet = { cards?: Record<string, number>; foil?: boolean; totalWeight?: number; allowDuplicates?: boolean };
type Layout = { contents?: Record<string, number>; weight?: number };
export type BoosterConfig = { boosters?: Layout[]; boostersTotalWeight?: number; sheets?: Record<string, Sheet>; name?: string };

/** MTGJSON's booster names for each purchase line product, in the order they are tried. */
const BOOSTERS_OF: Record<string, string[]> = {
  play_booster: ["play", "default"],
  draft_booster: ["draft", "default"],
  set_booster: ["set"],
  collector_booster: ["collector"],
  jumpstart_booster: ["jumpstart"],
  other_booster: ["default", "play", "draft"],
  booster_box: ["play", "draft", "default", "set", "collector"],
  bundle: ["play", "set", "draft", "default"],
  prerelease_kit: ["play", "draft", "default"],
};

/** The products whose packs can be checked and valued from booster contents. */
export const BOOSTER_PRODUCTS = new Set(Object.keys(BOOSTERS_OF));

const NAMES: Record<string, string> = {
  default: "Booster", play: "Play booster", draft: "Draft booster", set: "Set booster", collector: "Collector booster", jumpstart: "Jumpstart booster",
  arena: "Arena booster", tournament: "Tournament pack", prerelease: "Prerelease pack",
};
export const boosterLabel = (name: string) => NAMES[name] ?? `${name.replace(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase())} booster`;

export function boosterConfig(database: DatabaseSync, setCode: string, name: string): BoosterConfig | null {
  const row = database.prepare("SELECT config FROM boosters WHERE set_code = ? AND name = ?").get(setCode.toLowerCase(), name);
  if (!row) return null;
  try {
    return JSON.parse(String(row.config)) as BoosterConfig;
  } catch {
    return null;
  }
}

export function boosterNames(database: DatabaseSync, setCode: string): string[] {
  return database.prepare("SELECT name FROM boosters WHERE set_code = ? ORDER BY name").all(setCode.toLowerCase()).map((row) => String(row.name));
}

/**
 * The booster type of a purchase line: from the linked sealed product's packs when it names one, otherwise the first of
 * the product's usual booster types that the set has.
 */
export function lineBooster(database: DatabaseSync, line: Record<string, unknown>): { setCode: string; name: string } | null {
  const product = String(line.product ?? "");
  if (!BOOSTERS_OF[product]) return null;
  if (line.sealed_id) {
    try {
      const contents = JSON.parse(String(database.prepare("SELECT contents FROM sealed_products WHERE id = ?").get(String(line.sealed_id))?.contents ?? "null")) as { pack?: Array<{ code?: unknown; set?: unknown }> } | null;
      const pack = contents?.pack?.[0];
      if (pack && typeof pack.code === "string" && typeof pack.set === "string" && boosterConfig(database, pack.set, pack.code)) return { setCode: pack.set.toLowerCase(), name: pack.code };
    } catch {
      // no contents saved for this product
    }
  }
  const setCode = String(line.set_code ?? "").toLowerCase();
  if (!setCode) return null;
  const have = new Set(boosterNames(database, setCode));
  const name = BOOSTERS_OF[product]!.find((item) => have.has(item));
  return name ? { setCode, name } : null;
}

type Priced = { cardId: string; n: number | null; f: number | null; e: number | null };

/** The card id and prices (main source) of each MTGJSON uuid in a booster. */
function pricesOf(database: DatabaseSync, uuids: string[], source: PriceSource): Map<string, Priced> {
  const map = new Map<string, Priced>();
  const cardOf = database.prepare(
    `SELECT r.uuid, c.id, ${sourcePrice(source, "", "c")} AS n, ${sourcePrice(source, "_foil", "c")} AS f, ${sourcePrice(source, "_etched", "c")} AS e
     FROM mtgjson_records r JOIN cards c ON c.id = r.card_id WHERE r.uuid = ?`,
  );
  for (const uuid of uuids) {
    const row = cardOf.get(uuid);
    if (row) map.set(uuid, { cardId: String(row.id), n: row.n as number | null, f: row.f as number | null, e: row.e as number | null });
  }
  return map;
}

const uuidsOf = (config: BoosterConfig) => [...new Set(Object.values(config.sheets ?? {}).flatMap((sheet) => Object.keys(sheet.cards ?? {})))];
const priceIn = (card: Priced | undefined, foil: boolean) => (!card ? 0 : foil ? (card.f ?? card.e ?? 0) : (card.n ?? 0));

/** The expected value of one pack: each layout's chance, times each sheet's cards by their chance and price. */
export function packValue(database: DatabaseSync, config: BoosterConfig, source: PriceSource): number {
  const prices = pricesOf(database, uuidsOf(config), source);
  const sheetValue = new Map<string, number>();
  for (const [name, sheet] of Object.entries(config.sheets ?? {})) {
    const cards = Object.entries(sheet.cards ?? {});
    const total = sheet.totalWeight || cards.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    sheetValue.set(name, cards.reduce((sum, [uuid, weight]) => sum + (weight / total) * priceIn(prices.get(uuid), !!sheet.foil), 0));
  }
  const layouts = config.boosters ?? [];
  const totalWeight = config.boostersTotalWeight || layouts.reduce((sum, layout) => sum + (layout.weight ?? 0), 0) || 1;
  const value = layouts.reduce((sum, layout) => sum + ((layout.weight ?? 0) / totalWeight)
    * Object.entries(layout.contents ?? {}).reduce((part, [sheet, count]) => part + count * (sheetValue.get(sheet) ?? 0), 0), 0);
  return Math.round(value * 100) / 100;
}

/** The expected value of each booster type of a set. */
export function setBoosterValues(database: DatabaseSync, setCode: string, source: PriceSource): Array<{ name: string; label: string; value: number }> {
  return boosterNames(database, setCode).flatMap((name) => {
    const config = boosterConfig(database, setCode, name);
    return config ? [{ name, label: boosterLabel(name), value: packValue(database, config, source) }] : [];
  });
}

/** A purchase line's expected value per pack, or null when its booster contents are not known. */
export function lineValue(database: DatabaseSync, line: Record<string, unknown>, source: PriceSource): { perPack: number; booster: string; label: string } | null {
  const booster = lineBooster(database, line);
  if (!booster) return null;
  const config = boosterConfig(database, booster.setCode, booster.name);
  return config ? { perPack: packValue(database, config, source), booster: booster.name, label: boosterLabel(booster.name) } : null;
}

const pickWeighted = <T>(items: Array<[T, number]>, random: () => number): T | undefined => {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1]?.[0];
};

/** Opens virtual packs: a layout by its weight, then each sheet's cards by their weights. Nothing is saved. */
export function openPacks(database: DatabaseSync, config: BoosterConfig, count: number, source: PriceSource, random: () => number = Math.random): Array<{ cards: Array<{ cardId: string; foil: boolean; price: number | null }>; total: number }> {
  const prices = pricesOf(database, uuidsOf(config), source);
  const layouts = (config.boosters ?? []).map((layout): [Layout, number] => [layout, layout.weight ?? 0]);
  const packs = [];
  for (let index = 0; index < count; index += 1) {
    const layout = pickWeighted(layouts, random);
    const cards: Array<{ cardId: string; foil: boolean; price: number | null }> = [];
    for (const [sheetName, take] of Object.entries(layout?.contents ?? {})) {
      const sheet = config.sheets?.[sheetName];
      if (!sheet) continue;
      const pool = Object.entries(sheet.cards ?? {}).filter(([uuid]) => prices.has(uuid));
      const drawn = new Set<string>();
      for (let pick = 0; pick < take && pool.length; pick += 1) {
        const choices = sheet.allowDuplicates ? pool : pool.filter(([uuid]) => !drawn.has(uuid));
        const uuid = pickWeighted(choices.length ? choices : pool, random);
        if (!uuid) break;
        drawn.add(uuid);
        const card = prices.get(uuid)!;
        const price = sheet.foil ? (card.f ?? card.e) : card.n;
        cards.push({ cardId: card.cardId, foil: !!sheet.foil, price: price ?? null });
      }
    }
    packs.push({ cards, total: Math.round(cards.reduce((sum, card) => sum + (card.price ?? 0), 0) * 100) / 100 });
  }
  return packs;
}

/**
 * The finishes each card can come in from a booster type: regular from regular sheets, foil or etched from foil sheets.
 * Null when the booster's contents are not known.
 */
export function pullsAllowed(database: DatabaseSync, setCode: string, name: string): Map<string, Set<number>> | null {
  const config = boosterConfig(database, setCode, name);
  if (!config) return null;
  const allowed = new Map<string, Set<number>>();
  const cardOf = database.prepare("SELECT card_id FROM mtgjson_records WHERE uuid = ?");
  for (const sheet of Object.values(config.sheets ?? {})) {
    for (const uuid of Object.keys(sheet.cards ?? {})) {
      const cardId = cardOf.get(uuid)?.card_id;
      if (typeof cardId !== "string") continue;
      const finishes = allowed.get(cardId) ?? new Set<number>();
      if (sheet.foil) {
        finishes.add(1);
        finishes.add(2);
      } else finishes.add(0);
      allowed.set(cardId, finishes);
    }
  }
  return allowed;
}
