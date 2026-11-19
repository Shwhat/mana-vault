// ---------- copies: the key of a collection row (printing, finish, condition, language) and price rules ----------

/** 0 regular, 1 foil, 2 etched. */
export type FinishCode = 0 | 1 | 2;
export type Condition = "M" | "NM" | "LP" | "MP" | "HP" | "DMG";
export type CopyKey = { cardId: string; foil: FinishCode; condition: Condition; language: string };
export type Currency = "usd" | "eur";

export const CONDITIONS: Array<[Condition, string]> = [
  ["M", "Mint"], ["NM", "Near mint"], ["LP", "Lightly played"], ["MP", "Moderately played"], ["HP", "Heavily played"], ["DMG", "Damaged"],
];

/** Languages Scryfall prints cards in, with the names CSV files use for them. */
export const LANGUAGES: Array<[string, string]> = [
  ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"],
  ["ja", "Japanese"], ["ko", "Korean"], ["ru", "Russian"], ["zhs", "Simplified Chinese"], ["zht", "Traditional Chinese"],
  ["he", "Hebrew"], ["la", "Latin"], ["grc", "Ancient Greek"], ["ar", "Arabic"], ["sa", "Sanskrit"], ["ph", "Phyrexian"],
];

const CONDITION_WORDS: Record<string, Condition> = {
  m: "M", mint: "M",
  nm: "NM", "near mint": "NM", near_mint: "NM", "near-mint": "NM",
  lp: "LP", "lightly played": "LP", lightly_played: "LP", excellent: "LP", ex: "LP", sp: "LP", "slightly played": "LP",
  mp: "MP", "moderately played": "MP", moderately_played: "MP", good: "MP", gd: "MP", played: "MP", pl: "MP",
  hp: "HP", "heavily played": "HP", heavily_played: "HP", poor: "HP",
  d: "DMG", dmg: "DMG", damaged: "DMG",
};

/** Reads a condition from a code or a written name. An empty value is Near mint. */
export function readCondition(value: unknown): Condition | null {
  if (value === undefined || value === null || value === "") return "NM";
  if (typeof value !== "string") return null;
  return CONDITION_WORDS[value.trim().toLowerCase()] ?? null;
}

/** Reads a language from a Scryfall code or an English name. An empty value is English. */
export function readLanguage(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "en";
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  const found = LANGUAGES.find(([code, name]) => code === text || name.toLowerCase() === text);
  if (found) return found[0];
  if (text === "chinese simplified" || text === "zh" || text === "zh-hans") return "zhs";
  if (text === "chinese traditional" || text === "zh-hant") return "zht";
  return null;
}

/** Reads a finish: true or 1 is foil, 2 or "etched" is etched, false or 0 is regular. */
export function readFinish(value: unknown): FinishCode | null {
  if (value === undefined || value === false || value === 0 || value === "regular" || value === "nonfoil") return 0;
  if (value === true || value === 1 || value === "foil") return 1;
  if (value === 2 || value === "etched") return 2;
  return null;
}

/** Reads the key of a copy from a request item. */
export function readCopyKey(value: Record<string, unknown>): CopyKey | null {
  const foil = readFinish(value.foil);
  const condition = readCondition(value.condition);
  const language = readLanguage(value.language);
  if (typeof value.cardId !== "string" || !value.cardId || foil === null || !condition || !language) return null;
  return { cardId: value.cardId, foil, condition, language };
}

export const FINISH_NAMES = ["regular", "foil", "etched"] as const;

/**
 * The SQL price of one copy in a currency. Etched copies use the etched price, or the foil price when there is none.
 * EUR has one foil price, used for foil and etched copies. A copy without a price counts as no value.
 */
export function priceSql(currency: Currency, finish = "i.foil", card = "c"): string {
  return currency === "eur"
    ? `(CASE ${finish} WHEN 0 THEN ${card}.price_eur ELSE ${card}.price_eur_foil END)`
    : `(CASE ${finish} WHEN 0 THEN ${card}.price_usd WHEN 1 THEN ${card}.price_usd_foil ELSE COALESCE(${card}.price_usd_etched, ${card}.price_usd_foil) END)`;
}

export const readCurrency = (value: unknown): Currency => (value === "eur" ? "eur" : "usd");

export const PRICE_COLUMNS = "c.price_usd, c.price_usd_foil, c.price_usd_etched, c.price_eur, c.price_eur_foil";
