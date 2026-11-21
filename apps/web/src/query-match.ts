// ---------- the search syntax, read in the browser (0.17.0): the Android app answers card searches with the same
// rules as the server (card-search.ts) from the card list kept on the phone. Each rule here matches one on the server;
// a change to one is made to both. ----------

/** What a card on the phone carries for searching. */
export type QueryCard = {
  oracle_id?: string; name: string; type_line: string; oracle_text: string | null; flavor_name?: string | null; mana_cost: string | null;
  mana_value: number | null; colors: string; color_identity?: string | null; set_code: string; set_name: string; rarity: string;
  released_at?: string | null; finishes?: string | null; promo?: number | null; variation?: number | null; artist?: string | null;
  keywords?: string | null; promo_types?: string | null; frame?: string | null; frame_effects?: string | null; border_color?: string | null;
  full_art?: number | null; lang?: string | null; custom?: number | boolean | null; legal?: number | null; usd?: number | null;
  power?: string | null; toughness?: string | null;
};

export type QueryContext = {
  /** The formats in the order of the legal bits of each card. */
  formats?: string[];
  /** Oracle ids of the cards the account owns, for is:owned; without them is:owned needs the server. */
  owned?: Set<string> | null;
};

type Test = (card: QueryCard) => boolean;

const COLORS: Record<string, string> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
const RARITIES = new Set(["common", "uncommon", "rare", "mythic", "special", "bonus"]);
const COMPARE = ["=", ":", ">", "<", ">=", "<="];

const has = (list: string | null | undefined, word: string) => `,${(list ?? "").toLowerCase()},`.includes(`,${word},`);
const like = (text: string | null | undefined, value: string) => (text ?? "").toLowerCase().includes(value.toLowerCase());
const compare = (left: number, operator: string, right: number) => {
  switch (operator) {
    case ">": return left > right;
    case "<": return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    default: return left === right;
  }
};

const IS_WORDS: Record<string, Test> = {
  custom: (card) => !!card.custom,
  foil: (card) => has(card.finishes, "foil"),
  nonfoil: (card) => has(card.finishes, "nonfoil"),
  etched: (card) => has(card.finishes, "etched"),
  fullart: (card) => Number(card.full_art ?? 0) === 1,
  borderless: (card) => card.border_color === "borderless",
  showcase: (card) => has(card.frame_effects, "showcase"),
  extendedart: (card) => has(card.frame_effects, "extendedart"),
  promo: (card) => Number(card.promo ?? 0) === 1,
  variation: (card) => Number(card.variation ?? 0) === 1,
};

function normalizeColors(value: string): string {
  const normalized = value.toLowerCase().replace(/[\s,]+/g, "");
  const expanded = COLORS[normalized] ?? normalized;
  return [...expanded.toUpperCase()].every((color) => "WUBRG".includes(color)) ? expanded.toUpperCase() : "";
}

/** Reads a search into one test for a card. Throws an Error with the server's message for a search it cannot read. */
export function compileQuery(query: string, context: QueryContext = {}): Test {
  const tests: Test[] = [];
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (const token of tokens) {
    const filter = /^(-?)([a-z]+)(>=|<=|>|<|=|:)(.*)$/i.exec(token);
    if (!filter) {
      const term = token.replace(/^"|"$/g, "");
      if (term) tests.push((card) => like(card.name, term) || like(card.type_line, term) || like(card.oracle_text, term) || like(card.flavor_name, term));
      continue;
    }
    const negative = !!filter[1];
    const rawKey = filter[2] ?? "";
    const operator = filter[3] ?? "";
    const key = rawKey.toLowerCase();
    const value = (filter[4] ?? "").replace(/^"|"$/g, "");
    if (!value) throw new Error(`Search filter ${rawKey} needs a value`);
    const add = (test: Test) => tests.push(negative ? (card) => !test(card) : test);
    const colonOnly = () => { if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`); };

    if (["name", "type", "t", "o", "oracle", "set", "r", "rarity", "m", "mana"].includes(key)) {
      colonOnly();
      if (key === "name") add((card) => like(card.name, value) || like(card.flavor_name, value));
      else if (key === "type" || key === "t") add((card) => like(card.type_line, value));
      else if (key === "o" || key === "oracle") add((card) => like(card.oracle_text, value));
      else if (key === "set") add((card) => card.set_code.toLowerCase() === value.toLowerCase() || like(card.set_name, value));
      else if (key === "r" || key === "rarity") {
        if (!RARITIES.has(value.toLowerCase())) throw new Error(`Unknown rarity "${value}"`);
        add((card) => card.rarity === value.toLowerCase());
      } else add((card) => like(card.mana_cost, value));
      continue;
    }
    if (key === "c" || key === "color" || key === "id") {
      colonOnly();
      const field = (card: QueryCard) => (key === "id" ? card.color_identity ?? "" : card.colors ?? "");
      if (["c", "colorless"].includes(value.toLowerCase())) { add((card) => field(card) === ""); continue; }
      const wanted = normalizeColors(value);
      if (!wanted) throw new Error(`Invalid color filter "${value}"`);
      add((card) => [...wanted].every((color) => field(card).includes(color)));
      continue;
    }
    if (key === "mv" || key === "cmc") {
      if (!COMPARE.includes(operator)) throw new Error("Mana value needs a comparison operator");
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
  return (card) => tests.every((test) => test(card));
}
