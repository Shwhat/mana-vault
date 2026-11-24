/** Parse implicit AND, OR, parentheses and negation without interpreting individual search terms. */
export function searchExpression<T>(
  query: string,
  term: (token: string) => T,
  combine: (operator: "and" | "or", left: T, right: T) => T,
  negate: (value: T) => T,
): T | null {
  const tokens: string[] = [];
  let word = "";
  let quoted = false;
  for (const char of query) {
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === "(" || char === ")" || /\s/.test(char))) {
      if (word) tokens.push(word);
      word = "";
      if (char === "(" || char === ")") tokens.push(char);
    } else {
      word += char;
    }
  }
  if (quoted) throw new Error("Unclosed quote in search");
  if (word) tokens.push(word);
  if (!tokens.length) return null;

  let at = 0;
  const isOr = (token: string | undefined) => token?.toLowerCase() === "or";
  const atom = (): T => {
    const token = tokens[at++];
    if (!token || token === ")" || isOr(token)) throw new Error("Expected a search term");
    if (token === "-" && tokens[at] === "(") {
      at++;
      const value = expression();
      if (tokens[at++] !== ")") throw new Error("Unclosed parenthesis in search");
      return negate(value);
    }
    if (token === "(") {
      const value = expression();
      if (tokens[at++] !== ")") throw new Error("Unclosed parenthesis in search");
      return value;
    }
    return term(token);
  };
  const conjunction = (): T => {
    let value = atom();
    while (at < tokens.length && tokens[at] !== ")" && !isOr(tokens[at])) {
      value = combine("and", value, atom());
    }
    return value;
  };
  const expression = (): T => {
    let value = conjunction();
    while (isOr(tokens[at])) {
      at++;
      value = combine("or", value, conjunction());
    }
    return value;
  };
  const result = expression();
  if (at !== tokens.length) throw new Error("Unexpected parenthesis in search");
  return result;
}

const COLOR_NAMES: Record<string, string> = {
  white: "W", blue: "U", black: "B", red: "R", green: "G",
  azorius: "WU", dimir: "UB", rakdos: "BR", gruul: "RG", selesnya: "GW",
  orzhov: "WB", izzet: "UR", golgari: "BG", boros: "RW", simic: "GU",
  bant: "WUG", esper: "WUB", grixis: "UBR", jund: "BRG", naya: "RGW",
  abzan: "WBG", jeskai: "WUR", sultai: "UBG", mardu: "WBR", temur: "URG",
  lorehold: "RW", prismari: "UR", quandrix: "GU", silverquill: "WB", witherbloom: "BG",
  chaos: "UBRG", aggression: "WBRG", altruism: "WURG", growth: "WUBG", artifice: "WUBR",
};
const RARITY_NAMES: Record<string, string> = { c: "common", u: "uncommon", r: "rare", m: "mythic" };

const LOCAL_PROMO_TYPES = new Set([
  "surgefoil", "galaxyfoil", "halofoil", "textured", "manafoil", "raisedfoil", "rainbowfoil", "confettifoil",
  "oilslick", "ripplefoil", "fracturefoil", "doublerainbow", "stepandcompleat", "firstplacefoil", "neonink",
  "invisibleink", "gilded", "silverfoil", "dragonscalefoil", "singularityfoil", "cosmicfoil", "ampersand",
  "embossed", "headliner", "prerelease",
]);

export const searchPromoType = (word: string): boolean => LOCAL_PROMO_TYPES.has(word);

/** Read display directives without interpreting Scryfall's filtering language. */
export function scryfallDirectives(query: string): Partial<Record<"unique" | "display" | "order" | "direction" | "prefer", string>> {
  const found: Partial<Record<"unique" | "display" | "order" | "direction" | "prefer", string>> = {};
  const tokens = query.match(/(?:[^\s()"\/]|"(?:\\.|[^"\\])*"|\/(?:\\.|[^\/\\])*\/)+/g) ?? [];
  for (const token of tokens) {
    if (token === "++") found.unique = "prints";
    if (token === "@@") found.unique = "art";
    const match = /^(unique|display|as|order|sort|direction|dir|prefer):([a-z0-9-]+)$/i.exec(token);
    if (match) {
      const aliases: Record<string, keyof typeof found> = { as: "display", sort: "order", dir: "direction" };
      const key = match[1]!.toLowerCase();
      found[aliases[key] ?? key as keyof typeof found] = match[2]!.toLowerCase();
    }
  }
  return found;
}

export function searchRarity(value: string): string {
  const word = value.toLowerCase();
  return RARITY_NAMES[word] ?? word;
}

/** Returns distinct color letters, an empty string for colorless, or null for an invalid value. */
export function searchColors(value: string): string | null {
  const word = value.toLowerCase().replace(/[\s,]+/g, "");
  if (word === "c" || word === "colorless") return "";
  const letters = COLOR_NAMES[word] ?? word.toUpperCase();
  if (!letters || ![...letters].every((letter) => "WUBRG".includes(letter))) return null;
  return [...new Set(letters)].join("");
}

/** Plain positive words used to rank results, excluding operators and filter terms. */
export function searchPlainWords(query: string): string {
  const tokens = query.match(/(?:[^\s()"]+|"[^"]*")+/g) ?? [];
  return tokens.filter((token) => !/^(-?)([a-z]+)(>=|<=|!=|>|<|=|:)/i.test(token)
    && !token.startsWith("-") && token.toLowerCase() !== "or")
    .map((token) => token.replace(/^!/, "").replace(/^"|"$/g, "")).filter(Boolean).join(" ");
}
