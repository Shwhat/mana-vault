import { priceCols, usdEtchedSql, usdFoilSql, usdSql } from "./price-context.js";
// ---------- copies: the key of a collection row (printing, finish, condition, language) and price rules ----------

/** 0 regular, 1 foil, 2 etched. */
export type FinishCode = 0 | 1 | 2;
export type Condition = "M" | "NM" | "LP" | "MP" | "HP" | "DMG";
/** A proxy is a stand-in printed copy: kept apart from real copies, with no value. */
export type CopyKey = { cardId: string; foil: FinishCode; condition: Condition; language: string; proxy: boolean };
/** Details of a copy row that are not part of its key. */
export type CopyExtras = {
  purchasePrice: number | null; priceCurrency: string | null; addedAt: string | null; misprint: boolean; altered: boolean; signed: boolean;
};
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

/** Reads a yes or no flag: true, 1, "true", "yes" and "1" are yes. */
export function readFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return typeof value === "string" && ["true", "yes", "y", "1"].includes(value.trim().toLowerCase());
}

/** Reads the key of a copy from a request item. */
export function readCopyKey(value: Record<string, unknown>): CopyKey | null {
  const foil = readFinish(value.foil);
  const condition = readCondition(value.condition);
  const language = readLanguage(value.language);
  if (typeof value.cardId !== "string" || !value.cardId || foil === null || !condition || !language) return null;
  return { cardId: value.cardId, foil, condition, language, proxy: readFlag(value.proxy) };
}

/** Reads the details of a copy from a request item. Missing details are empty. */
export function readCopyExtras(value: Record<string, unknown>): CopyExtras | string {
  const price = value.purchasePrice;
  if (price !== undefined && price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 1_000_000)) {
    return "A purchase price must be a number from 0 to 1,000,000";
  }
  const currency = value.priceCurrency;
  if (currency !== undefined && currency !== null && (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency))) {
    return "A purchase currency is a three letter code such as USD";
  }
  const added = value.addedAt;
  if (added !== undefined && added !== null && (typeof added !== "string" || !Number.isFinite(Date.parse(added)))) {
    return "The date added must be a date";
  }
  return {
    purchasePrice: typeof price === "number" ? Math.round(price * 100) / 100 : null,
    priceCurrency: typeof currency === "string" ? currency.toUpperCase() : null,
    addedAt: typeof added === "string" ? new Date(added).toISOString() : null,
    misprint: readFlag(value.misprint), altered: readFlag(value.altered), signed: readFlag(value.signed),
  };
}

export const NO_EXTRAS: CopyExtras = { purchasePrice: null, priceCurrency: null, addedAt: null, misprint: false, altered: false, signed: false };

export const FINISH_NAMES = ["regular", "foil", "etched"] as const;

/**
 * The SQL price of one copy in a currency. Etched copies use the etched price, or the foil price when there is none.
 * EUR has one foil price, used for foil and etched copies. A copy without a price counts as no value.
 */
export function priceSql(currency: Currency, finish = "i.foil", card = "c"): string {
  return currency === "eur"
    ? `(CASE ${finish} WHEN 0 THEN ${card}.price_eur ELSE ${card}.price_eur_foil END)`
    : `(CASE ${finish} WHEN 0 THEN ${usdSql(card)} WHEN 1 THEN ${usdFoilSql(card)} ELSE COALESCE(${usdEtchedSql(card)}, ${usdFoilSql(card)}) END)`;
}

export const readCurrency = (value: unknown): Currency => (value === "eur" ? "eur" : "usd");

/** The price columns the interface reads, from the main price source of the request (0.21.0). */
export const priceColumnList = () => priceCols("c");
