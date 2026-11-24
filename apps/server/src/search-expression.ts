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
