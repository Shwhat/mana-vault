// ---------- grouping and sorting shared by every list view (0.17.0): deck lists, collection lists, All collections,
// card search and the print list. One set of rules, so a card is grouped and sorted the same way everywhere. ----------
import { capitalize, COLOR_NAMES } from "./types";

export type ListGroup = "type" | "subtype" | "typetag" | "rarity" | "color" | "identity" | "mana" | "set" | "artist" | "tag" | "none";
export type ListSort = "name" | "mana" | "price" | "rarity" | "color";
/** The list views with their own Group by choice (decks keep theirs in deckGroup). */
export type ListScope = "collection" | "search" | "print";

/** Group by choices; Type and Tag and Tag only where cards have tags (decks). */
export const LIST_GROUPS: Array<[ListGroup, string]> = [
  ["type", "Type"], ["subtype", "SubType"], ["typetag", "Type and Tag"], ["rarity", "Rarity"], ["color", "Color"], ["identity", "Color Identity"],
  ["mana", "Mana Value"], ["set", "Set"], ["artist", "Artist"], ["tag", "Tag"], ["none", "No grouping"],
];
export const LIST_SORTS: Array<[ListSort, string]> = [["name", "Name"], ["mana", "Mana Value"], ["price", "Price"], ["rarity", "Rarity"], ["color", "Color"]];
export const groupChoices = (tags: boolean) => LIST_GROUPS.filter(([id]) => tags || (id !== "tag" && id !== "typetag"));
export const readGroup = (value: unknown, fallback: ListGroup = "type"): ListGroup => LIST_GROUPS.find(([id]) => id === value)?.[0] ?? fallback;
export const readSort = (value: unknown, fallback: ListSort = "name"): ListSort => LIST_SORTS.find(([id]) => id === value)?.[0] ?? fallback;

/** What a card needs for grouping and sorting. */
export type GroupCard = {
  name: string; type_line: string; mana_value?: number | null; colors?: string | null; color_identity?: string | null; rarity?: string | null;
  set_code: string; set_name?: string | null; released_at?: string | null; artist?: string | null; tags?: string[] | null;
};

const frontType = (typeLine: string) => typeLine.split(" // ")[0] ?? typeLine;

/** The heading a card is listed under in Type groups. Creatures win over other types ("Artifact Creature" is a creature). */
// TYPE_ORDER decides which type a card with several types is listed under; TYPE_GROUP_ORDER is the order the groups
// are shown in (0.23.1: the order Moxfield uses).
export const TYPE_GROUP_ORDER = ["Planeswalker", "Creature", "Sorcery", "Instant", "Artifact", "Enchantment", "Battle", "Land", "Other"] as const;
export const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"] as const;
export function mainType(typeLine: string): string {
  const front = frontType(typeLine);
  if (front.includes("Land") && !front.includes("Creature")) return "Land";
  return TYPE_ORDER.find((type) => front.includes(type)) ?? "Other";
}
const PLURAL: Record<string, string> = {
  Creature: "Creatures", Planeswalker: "Planeswalkers", Battle: "Battles", Instant: "Instants", Sorcery: "Sorceries", Artifact: "Artifacts",
  Enchantment: "Enchantments", Land: "Lands", Other: "Other",
};
const RARITY_ORDER = ["common", "uncommon", "rare", "mythic", "special", "bonus"];
const colorKey = (colors: string | null | undefined) => {
  const value = colors ?? "";
  return value.length === 0 ? "C" : value.length > 1 ? "M" : value;
};
/** Color identity groups: each combination by name, in the usual order of the colors. */
const identityLabel = (identity: string) => {
  if (!identity) return "Colorless";
  if (identity.length === 1) return COLOR_NAMES[identity] ?? identity;
  return [...identity].sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b)).map((color) => COLOR_NAMES[color] ?? color).join(" and ");
};

type Key = { key: string; label: string; order: number | string };

function typeKey(card: GroupCard): Key {
  const type = mainType(card.type_line);
  return { key: type, label: PLURAL[type] ?? type, order: TYPE_GROUP_ORDER.indexOf(type as (typeof TYPE_GROUP_ORDER)[number]) };
}

/** The groups a card is listed under. A card with several tags is listed under each tag. */
export function groupsOf(card: GroupCard, group: ListGroup): Key[] {
  switch (group) {
    case "type": return [typeKey(card)];
    case "subtype": {
      const sub = frontType(card.type_line).split(/\s+[\u2014-]\s+/)[1]?.trim();
      return [sub ? { key: `s:${sub.toLowerCase()}`, label: sub, order: 0 } : { key: "none", label: "No subtype", order: 1 }];
    }
    case "typetag": {
      const tags = card.tags ?? [];
      if (tags.length) return tags.map((tag) => ({ key: `t:${tag.toLowerCase()}`, label: tag, order: 0 }));
      const type = typeKey(card);
      return [{ ...type, order: 1 + Number(type.order) }];
    }
    case "mana": {
      if (mainType(card.type_line) === "Land") return [{ key: "land", label: "Lands", order: 99 }];
      const value = Math.floor(card.mana_value ?? 0);
      const key = value >= 7 ? "7+" : String(Math.max(0, value));
      return [{ key, label: `Mana value ${key}`, order: Math.min(7, Math.max(0, value)) }];
    }
    case "color": {
      const key = colorKey(card.colors);
      return [{ key, label: COLOR_NAMES[key] ?? key, order: "WUBRGMC".indexOf(key) }];
    }
    case "identity": {
      const identity = [...(card.color_identity ?? "")].sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b)).join("");
      return [{ key: `i:${identity}`, label: identityLabel(identity), order: identity.length === 0 ? 99 : identity.length * 10 + "WUBRG".indexOf(identity[0]!) }];
    }
    case "rarity": {
      const rarity = card.rarity || "common";
      return [{ key: rarity, label: capitalize(rarity), order: RARITY_ORDER.indexOf(rarity) }];
    }
    case "set": {
      // newest set first: the order is the release date, read backwards
      const released = card.released_at ?? "";
      return [{ key: `set:${card.set_code}`, label: `${card.set_name || card.set_code.toUpperCase()} (${card.set_code.toUpperCase()})`, order: released ? `0${9999 - Number(released.slice(0, 4))}${released}` : "1" }];
    }
    case "artist": {
      const artist = card.artist?.trim();
      return [artist ? { key: `a:${artist.toLowerCase()}`, label: artist, order: 0 } : { key: "none", label: "No artist", order: 1 }];
    }
    case "tag": {
      const tags = card.tags ?? [];
      return tags.length ? tags.map((tag) => ({ key: `t:${tag.toLowerCase()}`, label: tag, order: 0 })) : [{ key: "none", label: "No tag", order: 1 }];
    }
    default:
      return [{ key: "all", label: "Cards", order: 0 }];
  }
}

/** Sorts cards; ties are broken by name. Price sorts the most valuable first and cards without a price last. */
export function sortList<T extends GroupCard>(cards: T[], sort: ListSort, priceOf: (card: T) => number | null): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const ordered = [...cards];
  if (sort === "mana") return ordered.sort((a, b) => (a.mana_value ?? 0) - (b.mana_value ?? 0) || byName(a, b));
  if (sort === "price") return ordered.sort((a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1) || byName(a, b));
  if (sort === "rarity") return ordered.sort((a, b) => RARITY_ORDER.indexOf(b.rarity || "common") - RARITY_ORDER.indexOf(a.rarity || "common") || byName(a, b));
  if (sort === "color") return ordered.sort((a, b) => "WUBRGMC".indexOf(colorKey(a.colors)) - "WUBRGMC".indexOf(colorKey(b.colors)) || byName(a, b));
  return ordered.sort(byName);
}

export type ListSection<T> = { key: string; label: string; count: number; cards: T[] };

/** Cards grouped and sorted. Groups are in a fixed order; named groups (subtypes, tags, artists) are alphabetical with the empty group last. */
export function groupList<T extends GroupCard>(cards: T[], group: ListGroup, sort: ListSort | null, priceOf: (card: T) => number | null,
  countOf: (card: T) => number = () => 1): Array<ListSection<T>> {
  const map = new Map<string, ListSection<T> & { order: number | string }>();
  for (const card of cards) {
    for (const item of groupsOf(card, group)) {
      const section = map.get(item.key) ?? { key: item.key, label: item.label, order: item.order, count: 0, cards: [] };
      section.cards.push(card);
      section.count += countOf(card);
      map.set(item.key, section);
    }
  }
  const compare = (a: number | string, b: number | string) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)));
  return [...map.values()]
    .sort((a, b) => compare(a.order, b.order) || a.label.localeCompare(b.label))
    // without a sort the cards keep the order they came in (a search sorted by the server, a sorted collection)
    .map(({ order: _order, ...section }) => ({ ...section, cards: sort ? sortList(section.cards, sort, priceOf) : section.cards }));
}
