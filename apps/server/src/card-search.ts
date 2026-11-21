export interface SearchClause {
  sql: string;
  values: string[];
}

const colors: Record<string, string> = {
  white: "W", blue: "U", black: "B", red: "R", green: "G",
};
const rarities = new Set(["common", "uncommon", "rare", "mythic", "special", "bonus"]);

/** Tags (Art or Oracle) with a label, and every tag under them, as a SQL list of tag ids. */
const tagIds = (kind: "art" | "oracle") => `(WITH RECURSIVE found(id) AS (
    SELECT id FROM tags WHERE kind = '${kind}' AND (label = ? COLLATE NOCASE OR replace(label, '-', ' ') = ? COLLATE NOCASE)
    UNION SELECT c.child_id FROM tag_children c JOIN found ON c.tag_id = found.id
  ) SELECT id FROM found)`;

const COMPARE = ["=", ":", ">", "<", ">=", "<="];
const compare = (operator: string) => (operator === ":" ? "=" : operator);

// is: words for printings: finishes, frames and the special foils Scryfall lists as promo types
const IS_WORDS: Record<string, string> = {
  custom: "custom = 1",
  foil: "(',' || finishes || ',') LIKE '%,foil,%'",
  nonfoil: "(',' || finishes || ',') LIKE '%,nonfoil,%'",
  etched: "(',' || finishes || ',') LIKE '%,etched,%'",
  fullart: "full_art = 1",
  borderless: "border_color = 'borderless'",
  showcase: "(',' || frame_effects || ',') LIKE '%,showcase,%'",
  extendedart: "(',' || frame_effects || ',') LIKE '%,extendedart,%'",
  promo: "promo = 1",
  variation: "variation = 1",
};

export type SearchContext = { userId?: number };

export function parseCardQuery(query: string, context: SearchContext = {}): SearchClause[] {
  const clauses: SearchClause[] = [];
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (const token of tokens) {
    const filter = /^(-?)([a-z]+)(>=|<=|>|<|=|:)(.*)$/i.exec(token);
    if (!filter) {
      const term = token.replace(/^"|"$/g, "");
      if (term) clauses.push({
        sql: "(name LIKE ? ESCAPE '\\' OR type_line LIKE ? ESCAPE '\\' OR oracle_text LIKE ? ESCAPE '\\' OR flavor_name LIKE ? ESCAPE '\\')",
        values: Array(4).fill(pattern(term)),
      });
      continue;
    }

    const negative = filter[1] ?? "";
    const rawKey = filter[2] ?? "";
    const operator = filter[3] ?? "";
    const rawValue = filter[4] ?? "";
    const key = rawKey.toLowerCase();
    const value = rawValue.replace(/^"|"$/g, "");
    if (!value) throw new Error(`Search filter ${rawKey} needs a value`);
    const negate = negative ? "NOT " : "";
    if (["name", "type", "t", "o", "oracle", "set", "r", "rarity", "m", "mana"].includes(key)) {
      if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`);
      let sql: string;
      let values: string[];
      if (key === "name") {
        sql = "(name LIKE ? ESCAPE '\\' OR flavor_name LIKE ? ESCAPE '\\')";
        values = [pattern(value), pattern(value)];
      } else if (key === "type" || key === "t") {
        sql = "type_line LIKE ? ESCAPE '\\'";
        values = [pattern(value)];
      } else if (key === "o" || key === "oracle") {
        sql = "oracle_text LIKE ? ESCAPE '\\'";
        values = [pattern(value)];
      } else if (key === "set") {
        sql = "(lower(set_code) = lower(?) OR set_name LIKE ? ESCAPE '\\')";
        values = [value, pattern(value)];
      } else if (key === "r" || key === "rarity") {
        if (!rarities.has(value.toLowerCase())) throw new Error(`Unknown rarity "${value}"`);
        sql = "rarity = ?";
        values = [value.toLowerCase()];
      } else {
        sql = "mana_cost LIKE ? ESCAPE '\\'";
        values = [pattern(value)];
      }
      clauses.push({ sql: `${negate}(${sql})`, values });
      continue;
    }

    if (key === "c" || key === "color" || key === "id") {
      if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`);
      const identity = key === "id";
      if (["c", "colorless"].includes(value.toLowerCase())) {
        clauses.push({ sql: `${negate}(${identity ? "color_identity" : "colors"} = '')`, values: [] });
        continue;
      }
      const colorsValue = normalizeColors(value);
      if (!colorsValue) throw new Error(`Invalid color filter "${value}"`);
      const field = identity ? "color_identity" : "colors";
      clauses.push({
        sql: `${negate}(${[...colorsValue].map(() => `instr(${field}, ?) > 0`).join(" AND ")})`,
        values: [...colorsValue],
      });
      continue;
    }

    if (key === "mv" || key === "cmc") {
      if (!["=", ":", ">", "<", ">=", "<="].includes(operator)) throw new Error("Mana value needs a comparison operator");
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100) throw new Error("Mana value must be from 0 to 100");
      clauses.push({ sql: `${negate}(mana_value ${operator === ":" ? "=" : operator} ?)`, values: [String(amount)] });
      continue;
    }

    if (key === "usd" || key === "eur") {
      if (!["=", ":", ">", "<", ">=", "<="].includes(operator)) throw new Error(`${rawKey} needs a comparison operator`);
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new Error("Prices must be a number of 0 or more");
      // the regular price, or the foil price for printings that only come in foil
      const field = key === "usd" ? "COALESCE(price_usd, price_usd_foil, price_usd_etched)" : "COALESCE(price_eur, price_eur_foil)";
      clauses.push({ sql: `${negate}(${field} ${operator === ":" ? "=" : operator} CAST(? AS REAL))`, values: [String(amount)] });
      continue;
    }

    if (key === "is" || key === "not") {
      if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`);
      const word = value.toLowerCase();
      const flip = (key === "not") !== !!negative ? "NOT " : "";
      if (word === "owned") {
        if (!context.userId) throw new Error("is:owned needs a signed-in account");
        // any printing of the card in the account's own or shared collections (not wishlists or proxies)
        clauses.push({
          sql: `${flip}(oracle_id IN (SELECT o.oracle_id FROM collection_cards cc JOIN cards o ON o.id = cc.card_id JOIN collections col ON col.id = cc.collection_id
            LEFT JOIN members m ON m.kind = 'collection' AND m.item_id = col.id AND m.user_id = ?
            WHERE col.kind = 'collection' AND cc.proxy = 0 AND (col.owner_id = ? OR m.user_id IS NOT NULL)))`,
          values: [String(context.userId), String(context.userId)],
        });
        continue;
      }
      if (IS_WORDS[word]) {
        clauses.push({ sql: `${flip}(${IS_WORDS[word]})`, values: [] });
        continue;
      }
      // any Scryfall promo type, such as is:surgefoil, is:galaxyfoil, is:textured
      if (/^[a-z0-9]{3,30}$/.test(word)) {
        clauses.push({ sql: `${flip}((',' || promo_types || ',') LIKE ?)`, values: [`%,${word},%`] });
        continue;
      }
      throw new Error(`Unknown card kind "${value}"`);
    }

    if (key === "art" || key === "atag" || key === "role" || key === "function" || key === "otag") {
      if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`);
      const label = value.trim();
      if (key === "art" || key === "atag") {
        clauses.push({ sql: `${negate}(id IN (SELECT ci.card_id FROM card_illustrations ci JOIN tag_links l ON l.ref = ci.illustration_id WHERE l.tag_id IN ${tagIds("art")}))`, values: [label, label] });
      } else {
        clauses.push({ sql: `${negate}(oracle_id IN (SELECT l.ref FROM tag_links l WHERE l.tag_id IN ${tagIds("oracle")}))`, values: [label, label] });
      }
      continue;
    }

    if (key === "pow" || key === "power" || key === "tou" || key === "toughness") {
      if (!COMPARE.includes(operator)) throw new Error(`${rawKey} needs a comparison operator`);
      const amount = Number(value);
      if (!Number.isFinite(amount)) throw new Error(`${rawKey} must be a number`);
      const field = key.startsWith("p") ? "power" : "toughness";
      clauses.push({ sql: `${negate}(${field} GLOB '[0-9]*' AND CAST(${field} AS REAL) ${compare(operator)} CAST(? AS REAL))`, values: [String(amount)] });
      continue;
    }

    if (key === "year") {
      if (!COMPARE.includes(operator)) throw new Error("year needs a comparison operator");
      if (!/^\d{4}$/.test(value)) throw new Error("year must be four digits, such as 2019");
      clauses.push({ sql: `${negate}(CAST(substr(released_at, 1, 4) AS INTEGER) ${compare(operator)} CAST(? AS INTEGER))`, values: [value] });
      continue;
    }

    if (key === "a" || key === "artist" || key === "kw" || key === "keyword" || key === "frame" || key === "lang" || key === "border") {
      if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`);
      if (key === "a" || key === "artist") clauses.push({ sql: `${negate}(artist LIKE ? ESCAPE '\\')`, values: [pattern(value)] });
      else if (key === "kw" || key === "keyword") clauses.push({ sql: `${negate}((',' || lower(keywords) || ',') LIKE ?)`, values: [`%,${value.toLowerCase()},%`] });
      else if (key === "frame") clauses.push({ sql: `${negate}(frame = ? OR (',' || frame_effects || ',') LIKE ?)`, values: [value.toLowerCase(), `%,${value.toLowerCase()},%`] });
      else if (key === "border") clauses.push({ sql: `${negate}(border_color = ?)`, values: [value.toLowerCase()] });
      else clauses.push({ sql: `${negate}(lang = ?)`, values: [value.toLowerCase()] });
      continue;
    }

    if (key === "legal" || key === "f") {
      if (operator !== ":") throw new Error(`${rawKey} only supports the ":" operator`);
      if (!/^[a-z0-9-]{2,30}$/i.test(value)) throw new Error(`Invalid format "${value}"`);
      clauses.push({
        sql: `${negate}(json_extract(legalities, ?) = 'legal')`,
        values: [`$.${value.toLowerCase()}`],
      });
      continue;
    }
    throw new Error(`Unsupported search filter "${rawKey}"`);
  }
  return clauses;
}

function normalizeColors(value: string): string {
  const normalized = value.toLowerCase().replace(/[\s,]+/g, "");
  const expanded = colors[normalized] ?? normalized;
  return [...expanded.toUpperCase()].every((color) => "WUBRG".includes(color)) ? expanded.toUpperCase() : "";
}

function pattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

/** How card search results can be ordered. Best match is the default. */
export const SEARCH_SORTS = ["best", "name", "newest", "oldest", "priceHigh", "priceLow", "mv", "rarity", "color", "set", "owned"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

/** The plain words of a search (the words that are not filters like t:creature), joined by spaces. */
export function plainWords(query: string): string {
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return tokens.filter((token) => !/^(-?)([a-z]+)(>=|<=|>|<|=|:)/i.test(token) && !token.startsWith("-"))
    .map((token) => token.replace(/^"|"$/g, "")).filter(Boolean).join(" ");
}

/** An ORDER BY for card search; `with` is a WITH step it needs (its values come first). */
export type SearchOrder = { sql: string; values: (string | number)[]; with?: string; withValues?: (string | number)[] };

/**
 * The ORDER BY for card search, on rows named `x`. Best match puts cards named exactly as the search words first,
 * then names that start with them, then names that hold every word, then everything else, each by name.
 */
export function searchOrder(sort: SearchSort, query: string, options: { currency?: string; userId?: number } = {}): SearchOrder {
  const words = plainWords(query).toLowerCase();
  const byName = "x.name, x.lang != 'en', x.released_at DESC";
  const usd = options.currency === "eur" ? "COALESCE(x.price_eur, x.price_eur_foil)" : "COALESCE(x.price_usd, x.price_usd_foil, x.price_usd_etched)";
  switch (sort) {
    case "name": return { sql: byName, values: [] };
    case "newest": return { sql: `x.released_at IS NULL, x.released_at DESC, ${byName}`, values: [] };
    case "oldest": return { sql: `x.released_at IS NULL, x.released_at, ${byName}`, values: [] };
    case "priceHigh": return { sql: `${usd} IS NULL, ${usd} DESC, ${byName}`, values: [] };
    case "priceLow": return { sql: `${usd} IS NULL, ${usd}, ${byName}`, values: [] };
    case "mv": return { sql: `x.mana_value, ${byName}`, values: [] };
    case "rarity": return { sql: `CASE x.rarity WHEN 'mythic' THEN 0 WHEN 'rare' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'common' THEN 3 ELSE 4 END, ${byName}`, values: [] };
    case "color": return {
      sql: `CASE WHEN COALESCE(x.colors, '') = '' THEN 7 WHEN length(replace(x.colors, ',', '')) > 1 THEN 6 ELSE instr('WUBRG', replace(x.colors, ',', '')) END, ${byName}`,
      values: [],
    };
    case "set": return { sql: `x.set_name, CAST(x.collector_number AS INTEGER), x.collector_number, ${byName}`, values: [] };
    case "owned": {
      if (!options.userId) return { sql: byName, values: [] };
      // the account's copies are counted once per search (the owned step) and looked up for each card
      return {
        with: `owned AS MATERIALIZED (SELECT o.oracle_id, SUM(i.quantity) AS n FROM collection_cards i JOIN cards o ON o.id = i.card_id
                 JOIN collections col ON col.id = i.collection_id
                 WHERE i.proxy = 0 AND col.kind = 'collection'
                   AND (col.owner_id = ? OR EXISTS (SELECT 1 FROM members m WHERE m.kind = 'collection' AND m.item_id = col.id AND m.user_id = ?))
                 GROUP BY o.oracle_id)`,
        withValues: [options.userId, options.userId],
        sql: `COALESCE((SELECT owned.n FROM owned WHERE owned.oracle_id = x.oracle_id), 0) DESC, ${byName}`,
        values: [],
      };
    }
    default: {
      if (!words) return { sql: byName, values: [] };
      const like = (value: string) => value.replace(/[\\%_]/g, "\\$&");
      const all = words.split(/\s+/);
      return {
        sql: `CASE WHEN lower(x.name) = ? OR lower(COALESCE(x.flavor_name, '')) = ? OR lower(x.name) LIKE ? ESCAPE '\\' THEN 0
                   WHEN lower(x.name) LIKE ? ESCAPE '\\' THEN 1
                   WHEN ${all.map(() => "lower(x.name) LIKE ? ESCAPE '\\'").join(" AND ")} THEN 2 ELSE 3 END, ${byName}`,
        values: [words, words, `${like(words)} // %`, `${like(words)}%`, ...all.map((word) => `%${like(word)}%`)],
      };
    }
  }
}
