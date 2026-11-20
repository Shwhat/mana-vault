// ---------- deck rules: grouping, sorting, legality, mana and the deck as text ----------
import { capitalize, COLOR_NAMES, type Currency, type DeckCard, type DeckGroup, type DeckSort, formatName, priceOf, type Zone } from "./types";

export const ZONE_ORDER: Zone[] = ["commander", "main", "sideboard", "maybeboard"];

const frontType = (typeLine: string) => typeLine.split(" // ")[0] ?? typeLine;

/** The heading a card is listed under in Type groups. Creatures win over other types ("Artifact Creature" is a creature). */
export const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"] as const;
export function mainType(typeLine: string): string {
  const front = frontType(typeLine);
  if (front.includes("Land") && !front.includes("Creature")) return "Land";
  return TYPE_ORDER.find((type) => front.includes(type)) ?? "Other";
}

const plural: Record<string, string> = {
  Creature: "Creatures", Planeswalker: "Planeswalkers", Battle: "Battles", Instant: "Instants", Sorcery: "Sorceries", Artifact: "Artifacts",
  Enchantment: "Enchantments", Land: "Lands", Other: "Other",
};

/** The groups a card is listed under. A card with several tags is listed under each tag. */
export function groupsOf(card: DeckCard, group: DeckGroup): Array<{ key: string; label: string; order: number }> {
  switch (group) {
    case "type": {
      const type = mainType(card.type_line);
      return [{ key: type, label: plural[type] ?? type, order: TYPE_ORDER.indexOf(type as (typeof TYPE_ORDER)[number]) }];
    }
    case "mana": {
      if (mainType(card.type_line) === "Land") return [{ key: "land", label: "Lands", order: 99 }];
      const value = Math.floor(card.mana_value ?? 0);
      const key = value >= 7 ? "7+" : String(Math.max(0, value));
      return [{ key, label: `Mana value ${key}`, order: Math.min(7, Math.max(0, value)) }];
    }
    case "color": {
      const colors = card.colors ?? "";
      const key = colors.length === 0 ? "C" : colors.length > 1 ? "M" : colors;
      return [{ key, label: COLOR_NAMES[key] ?? key, order: "WUBRGMC".indexOf(key) }];
    }
    case "rarity": {
      const rarity = card.rarity ?? "common";
      return [{ key: rarity, label: capitalize(rarity), order: ["common", "uncommon", "rare", "mythic", "special", "bonus"].indexOf(rarity) }];
    }
    case "tag": {
      const tags = card.tags ?? [];
      return tags.length ? tags.map((tag) => ({ key: `t:${tag.toLowerCase()}`, label: tag, order: 0 })) : [{ key: "none", label: "No tag", order: 1 }];
    }
    default:
      return [{ key: "all", label: "Cards", order: 0 }];
  }
}

/** A deck card's price in its finish, or in another finish of the printing when that one has no price. */
export const cardPrice = (card: DeckCard, currency: Currency) => {
  const prices = {
    price_usd: card.price_usd ?? null, price_usd_foil: card.price_usd_foil ?? null, price_usd_etched: card.price_usd_etched ?? null,
    price_eur: card.price_eur ?? null, price_eur_foil: card.price_eur_foil ?? null,
  };
  const finish = card.finish ?? 0;
  return priceOf(prices, finish, currency) ?? priceOf(prices, 0, currency) ?? priceOf(prices, 1, currency) ?? priceOf(prices, 2, currency);
};

export function sortCards(cards: DeckCard[], sort: DeckSort, currency: Currency): DeckCard[] {
  const byName = (a: DeckCard, b: DeckCard) => a.name.localeCompare(b.name);
  if (sort === "mana") return [...cards].sort((a, b) => (a.mana_value ?? 0) - (b.mana_value ?? 0) || byName(a, b));
  if (sort === "price") return [...cards].sort((a, b) => (cardPrice(b, currency) ?? -1) - (cardPrice(a, currency) ?? -1) || byName(a, b));
  return [...cards].sort(byName);
}

export type Section = { key: string; label: string; count: number; cards: DeckCard[] };
/** The cards of one zone, grouped and sorted. Groups are in a fixed order; tag groups are alphabetical with No tag last. */
export function sections(cards: DeckCard[], group: DeckGroup, sort: DeckSort, currency: Currency): Section[] {
  const map = new Map<string, Section & { order: number }>();
  for (const card of cards) {
    for (const item of groupsOf(card, group)) {
      const section = map.get(item.key) ?? { key: item.key, label: item.label, order: item.order, count: 0, cards: [] };
      section.cards.push(card);
      section.count += card.quantity;
      map.set(item.key, section);
    }
  }
  return [...map.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(({ order: _order, ...section }) => ({ ...section, cards: sortCards(section.cards, sort, currency) }));
}

// ---------- legality ----------
const COMMANDER_FORMATS: Record<string, number> = {
  commander: 100, duel: 100, paupercommander: 100, predh: 100, brawl: 100, standardbrawl: 60, oathbreaker: 60,
};
const isBasic = (card: DeckCard) => /\bBasic\b/.test(frontType(card.type_line)) && frontType(card.type_line).includes("Land");
const anyNumber = (card: DeckCard) => /A deck can have any number of cards named/i.test(card.oracle_text ?? "");
const copiesAllowed = (card: DeckCard) => /A deck can have up to (\w+) cards named/i.exec(card.oracle_text ?? "")?.[1];
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export type Problem = { level: "err" | "warn"; text: string; entries: number[] };
export type Legality = { checked: boolean; problems: Problem[]; flagged: Map<number, string> };

/**
 * Checks a deck against its format: the size of the deck and sideboard, how many copies of a card it holds, cards
 * that are banned or not legal, and for commander formats, that every card fits the commander's color identity.
 * Casual decks are not checked. Maybeboard cards are never counted.
 */
export function checkDeck(format: string, cards: DeckCard[]): Legality {
  const flagged = new Map<number, string>();
  const problems: Problem[] = [];
  if (format === "casual") return { checked: false, problems, flagged };
  const inDeck = cards.filter((card) => card.zone !== "maybeboard");
  const commanderSize = COMMANDER_FORMATS[format];
  const main = inDeck.filter((card) => card.zone === "main");
  const commanders = inDeck.filter((card) => card.zone === "commander");
  const sideboard = inDeck.filter((card) => card.zone === "sideboard");
  const count = (list: DeckCard[]) => list.reduce((sum, card) => sum + card.quantity, 0);
  const name = formatName(format);
  if (commanderSize) {
    const size = count(main) + count(commanders);
    if (!commanders.length) problems.push({ level: "err", text: `${name} decks need a commander`, entries: [] });
    if (size !== commanderSize) {
      problems.push({ level: "err", text: `${name} decks have exactly ${commanderSize} cards with the commander; this deck has ${size}`, entries: [] });
    }
  } else {
    if (count(main) < 60) problems.push({ level: "err", text: `${name} decks have at least 60 cards in the main deck; this deck has ${count(main)}`, entries: [] });
    if (count(sideboard) > 15) problems.push({ level: "err", text: `The sideboard can have at most 15 cards; it has ${count(sideboard)}`, entries: [] });
  }
  // copies by card name, across the zones that count
  const counted = commanderSize ? [...main, ...commanders] : [...main, ...sideboard];
  const byName = new Map<string, { cards: DeckCard[]; total: number }>();
  for (const card of counted) {
    const item = byName.get(card.oracle_id) ?? { cards: [], total: 0 };
    item.cards.push(card);
    item.total += card.quantity;
    byName.set(card.oracle_id, item);
  }
  for (const { cards: list, total } of byName.values()) {
    const card = list[0]!;
    if (isBasic(card) || anyNumber(card)) continue;
    const restricted = card.legalities?.[format] === "restricted";
    const special = copiesAllowed(card);
    const limit = special ? WORDS[special.toLowerCase()] ?? Number(special) : commanderSize || restricted ? 1 : 4;
    if (total > limit) {
      const text = `${card.name}: ${total} copies, the limit is ${limit}${restricted ? " (restricted)" : ""}`;
      problems.push({ level: "err", text, entries: list.map((item) => item.entry_id) });
      for (const item of list) flagged.set(item.entry_id, text);
    }
  }
  for (const card of inDeck) {
    const status = card.legalities?.[format];
    if (!card.legalities || !Object.keys(card.legalities).length || !status) continue;
    if (status === "banned" || status === "not_legal") {
      const text = `${card.name} is ${status === "banned" ? "banned" : "not legal"} in ${name}`;
      problems.push({ level: "err", text, entries: [card.entry_id] });
      flagged.set(card.entry_id, text);
    }
  }
  if (commanderSize && commanders.length) {
    const identity = new Set(commanders.flatMap((card) => [...(card.color_identity ?? "")]));
    for (const card of main) {
      const outside = [...(card.color_identity ?? "")].filter((color) => !identity.has(color));
      if (outside.length) {
        const text = `${card.name} is outside the commander's colors (${outside.map((color) => COLOR_NAMES[color] ?? color).join(", ")})`;
        problems.push({ level: "err", text, entries: [card.entry_id] });
        if (!flagged.has(card.entry_id)) flagged.set(card.entry_id, text);
      }
    }
    for (const card of commanders) {
      const type = frontType(card.type_line);
      const can = /can be your commander/i.test(card.oracle_text ?? "") || (type.includes("Legendary") && (type.includes("Creature") || type.includes("Planeswalker")));
      if (!can && format !== "oathbreaker") problems.push({ level: "warn", text: `${card.name} may not be able to be a commander`, entries: [card.entry_id] });
    }
  }
  return { checked: true, problems, flagged };
}

// ---------- mana ----------
export const MANA_COLORS = ["W", "U", "B", "R", "G", "C"] as const;

/** Colored mana symbols in the costs of the deck's spells, and the cards that can make each color. */
export function manaBalance(cards: DeckCard[]) {
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const sources: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const card of cards) {
    if (card.zone === "maybeboard" || card.zone === "sideboard") continue;
    for (const symbol of (card.mana_cost ?? "").match(/\{[^}]+\}/g) ?? []) {
      for (const color of MANA_COLORS) if (symbol.slice(1, -1).split("/").includes(color)) pips[color]! += card.quantity;
    }
    for (const color of card.produced_mana ?? "") if (color in sources) sources[color]! += card.quantity;
  }
  return { pips, sources };
}

// ---------- text ----------
const ZONE_HEADINGS: Record<Zone, string> = { commander: "Commander", main: "Deck", sideboard: "Sideboard", maybeboard: "Maybeboard" };

/** The deck as text, one line per card with its printing: "1 Sol Ring (C21) 263", under a heading for each zone. */
export function deckText(cards: DeckCard[]): string {
  return ZONE_ORDER.map((zone) => {
    const list = cards.filter((card) => card.zone === zone).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return "";
    const mark = (card: DeckCard) => (card.finish === 2 ? " *E*" : card.finish === 1 ? " *F*" : "");
    return [ZONE_HEADINGS[zone], ...list.map((card) => `${card.quantity} ${card.name} (${card.set_code.toUpperCase()}) ${card.collector_number}${mark(card)}`)].join("\n");
  }).filter(Boolean).join("\n\n");
}

/** A typed line for Quick add: "2 Sol Ring", "2x Sol Ring", "Sol Ring" or "1 Sol Ring (C21) 263". */
export type Finish = "" | "foil" | "etched";

/**
 * Splits the card part of a list line into name, set, collector number and finish marks, the same way as the server:
 * "Sauron, the Dark Lord (HOC) 36 *F*". `*F*` marks foil and `*E*` etched; other marks are dropped.
 */
export function splitPrinting(raw: string): { name: string; set: string; number: string; finish: Finish } {
  let text = raw.trim();
  let finish: Finish = "";
  for (;;) {
    const mark = /\s*\*([A-Za-z]+)\*\s*$/.exec(text);
    if (!mark) break;
    const code = mark[1]!.toUpperCase();
    if (code === "E") finish = "etched";
    else if (code === "F" && finish !== "etched") finish = "foil";
    text = text.slice(0, mark.index).trim();
  }
  const printing = /^(.*?)\s*[[(]([A-Za-z0-9]{2,6})[\])]\s*#?([A-Za-z0-9-]+[a-z\u2605\u2020]?)?$/.exec(text);
  return { name: (printing?.[1] ?? text).trim(), set: printing?.[2] ?? "", number: printing?.[3] ?? "", finish };
}

export function parseQuickAdd(text: string): { quantity: number; name: string; set: string; number: string; finish: Finish } | null {
  const match = /^\s*(?:(\d+)\s*x?\s+)?(.+?)\s*$/i.exec(text);
  if (!match || !match[2]) return null;
  const quantity = match[1] ? Number(match[1]) : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  const card = splitPrinting(match[2]);
  return card.name ? { quantity, ...card } : null;
}

// ---------- playtest ----------
/** A shuffled copy of a list (Fisher-Yates). */
export function shuffle<T>(list: T[], random: () => number = Math.random): T[] {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
