export interface SearchClause {
  sql: string;
  values: string[];
}

const colors: Record<string, string> = {
  white: "W", blue: "U", black: "B", red: "R", green: "G",
};
const rarities = new Set(["common", "uncommon", "rare", "mythic", "special", "bonus"]);

export function parseCardQuery(query: string): SearchClause[] {
  const clauses: SearchClause[] = [];
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (const token of tokens) {
    const filter = /^(-?)([a-z]+)(>=|<=|>|<|=|:)(.*)$/i.exec(token);
    if (!filter) {
      const term = token.replace(/^"|"$/g, "");
      if (term) clauses.push({
        sql: "(name LIKE ? ESCAPE '\\' OR type_line LIKE ? ESCAPE '\\' OR oracle_text LIKE ? ESCAPE '\\')",
        values: Array(3).fill(pattern(term)),
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
        sql = "name LIKE ? ESCAPE '\\'";
        values = [pattern(value)];
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
