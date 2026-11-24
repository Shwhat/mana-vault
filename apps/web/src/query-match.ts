// ---------- the search syntax, read in the browser (0.17.0): the Android app answers card searches with the same
// rules as the server (card-search.ts) from the card list kept on the phone. Each rule here matches one on the server;
// a change to one is made to both. ----------

import { searchColors, searchExpression, searchRarity } from "../../server/src/search-expression";

/** What a card on the phone carries for searching. */
export type QueryCard = {
  oracle_id?: string; name: string; type_line: string; oracle_text: string | null; flavor_name?: string | null; mana_cost: string | null;
  mana_value: number | null; colors: string; color_identity?: string | null; set_code: string; set_name: string; rarity: string;
  released_at?: string | null; finishes?: string | null; promo?: number | null; variation?: number | null; artist?: string | null;
  keywords?: string | null; promo_types?: string | null; frame?: string | null; frame_effects?: string | null; border_color?: string | null;
  full_art?: number | null; lang?: string | null; custom?: number | boolean | null; legal?: number | null; usd?: number | null;
  power?: string | null; toughness?: string | null;
  // from MTGJSON (0.21.0)
  is_reprint?: number | null; is_starter?: number | null; lead_commander?: number | null; lead_oathbreaker?: number | null; lead_brawl?: number | null;
  tcg_r?: number | null; tcg_rf?: number | null; tcg_re?: number | null; ck_r?: number | null; ck_rf?: number | null; ck_re?: number | null;
  cs_r?: number | null; cs_rf?: number | null; cs_re?: number | null; cm_r?: number | null; cm_rf?: number | null; cm_re?: number | null;
  ch_r?: number | null; ch_rf?: number | null; buy?: number | null;
};

/** Store names the store: filter takes, with their price fields (0.21.0), the same as on the server. */
const STORE_KEYS: Record<string, "tcg" | "ck" | "cs" | "cm" | "ch"> = {
  tcgplayer: "tcg", tcg: "tcg", cardkingdom: "ck", ck: "ck", cardsphere: "cs", cs: "cs", cardmarket: "cm", mcm: "cm", cardhoarder: "ch",
};

export type QueryContext = {
  /** The formats in the order of the legal bits of each card. */
  formats?: string[];
  /** Oracle ids of the cards the account owns, for is:owned; without them is:owned needs the server. */
  owned?: Set<string> | null;
};

type Test = (card: QueryCard) => boolean;

const RARITIES = new Set(["common", "uncommon", "rare", "mythic", "special", "bonus"]);
const COMPARE = ["=", ":", ">", "<", ">=", "<=", "!="];

const has = (list: string | null | undefined, word: string) => `,${(list ?? "").toLowerCase()},`.includes(`,${word},`);
const like = (text: string | null | undefined, value: string) => (text ?? "").toLowerCase().includes(value.toLowerCase());
const compare = (left: number, operator: string, right: number) => {
  switch (operator) {
    case ">": return left > right;
    case "<": return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "!=": return left !== right;
    default: return left === right;
  }
};

const IS_WORDS: Record<string, Test> = {
  custom: (card) => !!card.custom,
  foil: (card) => has(card.finishes, "foil"),
  nonfoil: (card) => has(card.finishes, "nonfoil"),
  etched: (card) => has(card.finishes, "etched"),
  fullart: (card) => Number(card.full_art ?? 0) === 1,
  full: (card) => Number(card.full_art ?? 0) === 1,
  borderless: (card) => card.border_color === "borderless",
  showcase: (card) => has(card.frame_effects, "showcase"),
  extendedart: (card) => has(card.frame_effects, "extendedart"),
  promo: (card) => Number(card.promo ?? 0) === 1,
  variation: (card) => Number(card.variation ?? 0) === 1,
  reprint: (card) => Number(card.is_reprint ?? 0) === 1,
  starter: (card) => Number(card.is_starter ?? 0) === 1,
  commander: (card) => Number(card.lead_commander ?? 0) === 1,
  brawler: (card) => Number(card.lead_brawl ?? 0) === 1,
  oathbreaker: (card) => Number(card.lead_oathbreaker ?? 0) === 1,
};

/** Reads a search into one test for a card. Throws an Error with the server's message for a search it cannot read. */
export function compileQuery(query: string, context: QueryContext = {}): Test {
  return searchExpression(query, (token) => compileTerm(token, query, context),
    (operator, left, right) => operator === "and" ? (card) => left(card) && right(card) : (card) => left(card) || right(card),
    (test) => (card) => !test(card)) ?? (() => true);
}

function compileTerm(input: string, query: string, context: QueryContext): Test {
  const tests: Test[] = [];
  for (const token of [input]) {
    const filter = /^(-?)([a-z]+)(>=|<=|!=|>|<|=|:)(.*)$/i.exec(token);
    if (!filter) {
      const negative = token.startsWith("-");
      const raw = negative ? token.slice(1) : token;
      const exact = raw.startsWith("!");
      const term = (exact ? raw.slice(1) : raw).replace(/^"|"$/g, "");
      if (!term) throw new Error("Expected a search term");
      const test: Test = exact
        ? (card) => card.name.toLowerCase() === term.toLowerCase() || card.flavor_name?.toLowerCase() === term.toLowerCase()
        : (card) => like(card.name, term) || like(card.type_line, term) || like(card.oracle_text, term) || like(card.flavor_name, term);
      tests.push(negative ? (card) => !test(card) : test);
      continue;
    }
    const negative = !!filter[1];
    const rawKey = filter[2] ?? "";
    const operator = filter[3] ?? "";
    const key = ({ s: "set", e: "set", edition: "set", identity: "id", manavalue: "mv", format: "legal" } as Record<string, string>)[rawKey.toLowerCase()] ?? rawKey.toLowerCase();
    const value = (filter[4] ?? "").replace(/^"|"$/g, "");
    if (!value) throw new Error(`Search filter ${rawKey} needs a value`);
    if (value.startsWith("/")) throw new Error("Regular expression searches are not supported");
    const add = (test: Test) => tests.push(negative ? (card) => !test(card) : test);
    const colonOnly = () => { if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`); };

    if (["name", "type", "t", "o", "oracle", "set", "r", "rarity", "m", "mana"].includes(key)) {
      colonOnly();
      if (key === "name") add((card) => like(card.name, value) || like(card.flavor_name, value));
      else if (key === "type" || key === "t") add((card) => like(card.type_line, value));
      else if (key === "o" || key === "oracle") add((card) => like(card.oracle_text, value));
      else if (key === "set") add((card) => card.set_code.toLowerCase() === value.toLowerCase() || like(card.set_name, value));
      else if (key === "r" || key === "rarity") {
        const rarity = searchRarity(value);
        if (!RARITIES.has(rarity)) throw new Error(`Unknown rarity "${value}"`);
        add((card) => card.rarity === rarity);
      } else add((card) => like(card.mana_cost, value));
      continue;
    }
    if (key === "c" || key === "color" || key === "id") {
      const field = (card: QueryCard) => (key === "id" ? card.color_identity ?? "" : card.colors ?? "");
      const count = (card: QueryCard) => [..."WUBRG"].filter((color) => field(card).includes(color)).length;
      if (/^[0-5]$/.test(value)) { add((card) => compare(count(card), operator, Number(value))); continue; }
      if (["m", "multicolor"].includes(value.toLowerCase())) {
        if (operator !== ":" && operator !== "=") throw new Error(`${rawKey} multicolor only supports ":" or "="`);
        add((card) => count(card) > 1);
        continue;
      }
      const wanted = searchColors(value);
      if (wanted === null) throw new Error(`Invalid color filter "${value}"`);
      add((card) => {
        const contains = [...wanted].every((color) => field(card).includes(color));
        const subset = [..."WUBRG"].every((color) => !field(card).includes(color) || wanted.includes(color));
        const exact = contains && subset;
        if (operator === ":" && wanted) return contains;
        if (operator === ":" || operator === "=") return exact;
        if (operator === "!=") return !exact;
        if (operator === ">=") return contains;
        if (operator === "<=") return subset;
        return operator === ">" ? contains && !exact : subset && !exact;
      });
      continue;
    }
    if (key === "mv" || key === "cmc") {
      if (!COMPARE.includes(operator)) throw new Error("Mana value needs a comparison operator");
      if (operator === ":" && ["even", "odd"].includes(value.toLowerCase())) {
        const remainder = value.toLowerCase() === "even" ? 0 : 1;
        add((card) => card.mana_value !== null && card.mana_value % 2 === remainder);
        continue;
      }
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100) throw new Error("Mana value must be from 0 to 100");
      add((card) => compare(card.mana_value ?? 0, operator, amount));
      continue;
    }
    if (key === "usd") {
      if (!COMPARE.includes(operator)) throw new Error(`${rawKey} needs a comparison operator`);
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new Error("Prices must be a number of 0 or more");
      add((card) => card.usd !== null && card.usd !== undefined && compare(card.usd, operator, amount));
      continue;
    }
    if (key === "can") {
      colonOnly();
      const format = value.toLowerCase();
      if (format !== "commander" && format !== "oathbreaker" && format !== "brawl") throw new Error("can: takes commander, oathbreaker or brawl");
      add((card) => Number(card[`lead_${format}`] ?? 0) === 1);
      continue;
    }
    if (key === "store") {
      const found = /^([a-z]+)(>=|<=|>|<|=)(\d+(?:\.\d+)?)$/i.exec(value);
      const prefix = found ? STORE_KEYS[found[1]!.toLowerCase()] : undefined;
      if (!found || !prefix) throw new Error("Write store: as a store and a price, such as store:cardkingdom<5");
      const foilOnly = /(^|[\s(])is:foil(?=$|[\s)])/i.test(query);
      const field = (card: QueryCard) => {
        const read = (suffix: string) => (card as Record<string, unknown>)[`${prefix}_${suffix}`] as number | null | undefined;
        return (foilOnly ? read("rf") ?? read("re") : read("r") ?? read("rf") ?? read("re")) ?? null;
      };
      add((card) => { const price = field(card); return price !== null && compare(price, found[2]!, Number(found[3])); });
      continue;
    }
    if (key === "buylist") {
      if (!COMPARE.includes(operator)) throw new Error(`${rawKey} needs a comparison operator`);
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Prices must be a number of 0 or more");
      add((card) => card.buy !== null && card.buy !== undefined && compare(card.buy, operator, amount));
      continue;
    }
    if (key === "in") throw new Error("in: needs a connection to the server");
    if (key === "is" || key === "not") {
      colonOnly();
      const word = value.toLowerCase();
      const flip = (key === "not") !== negative;
      const push = (test: Test) => tests.push(flip ? (card) => !test(card) : test);
      if (word === "owned") {
        if (!context.owned) throw new Error("is:owned needs a connection to the server, or a collection opened before");
        const owned = context.owned;
        push((card) => !!card.oracle_id && owned.has(card.oracle_id));
        continue;
      }
      if (IS_WORDS[word]) { push(IS_WORDS[word]); continue; }
      if (/^[a-z0-9]{3,30}$/.test(word)) { push((card) => has(card.promo_types, word)); continue; }
      throw new Error(`Unknown card kind "${value}"`);
    }
    if (key === "art" || key === "atag" || key === "role" || key === "function" || key === "otag") {
      throw new Error("Art tags and Oracle tags need a connection to the server");
    }
    if (key === "pow" || key === "power" || key === "tou" || key === "toughness") {
      if (!COMPARE.includes(operator)) throw new Error(`${rawKey} needs a comparison operator`);
      const amount = Number(value);
      if (!Number.isFinite(amount)) throw new Error(`${rawKey} must be a number`);
      const field = key.startsWith("p") ? "power" : "toughness";
      add((card) => /^[0-9]/.test(card[field] ?? "") && compare(Number.parseFloat(card[field]!), operator, amount));
      continue;
    }
    if (key === "year") {
      if (!COMPARE.includes(operator)) throw new Error("year needs a comparison operator");
      if (!/^\d{4}$/.test(value)) throw new Error("year must be four digits, such as 2019");
      add((card) => !!card.released_at && compare(Number(card.released_at.slice(0, 4)), operator, Number(value)));
      continue;
    }
    if (["a", "artist", "kw", "keyword", "frame", "lang", "border"].includes(key)) {
      colonOnly();
      const lower = value.toLowerCase();
      if (key === "a" || key === "artist") add((card) => like(card.artist, value));
      else if (key === "kw" || key === "keyword") add((card) => has(card.keywords, lower));
      else if (key === "frame") add((card) => card.frame === lower || has(card.frame_effects, lower));
      else if (key === "border") add((card) => card.border_color === lower);
      else add((card) => (card.lang ?? "en") === lower);
      continue;
    }
    if (key === "legal" || key === "f") {
      colonOnly();
      if (!/^[a-z0-9-]{2,30}$/i.test(value)) throw new Error(`Invalid format "${value}"`);
      const bit = (context.formats ?? []).indexOf(value.toLowerCase());
      add((card) => bit >= 0 && ((card.legal ?? 0) & (1 << bit)) !== 0);
      continue;
    }
    throw new Error(`Unsupported search filter "${rawKey}"`);
  }
  return tests[0]!;
}
