// ---------- receipt reading (0.17.0): text from a PDF or a picture of a receipt, and the purchase fields found in it.
// PDFs are read with pdf.js; pictures with the same text recognition engine and English model the scanner uses, from the
// /ocr folder of the built interface, so reading works without the internet. ----------
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SPECIAL_FOILS } from "./foil-types.js";

/**
 * One line read from a receipt. `note` holds a condition or finish written on the line or the row under it (such as
 * "Near Mint Foil"); `card` is the card it was matched to (0.19.0), filled in by the server when the name is a card.
 */
export type ReceiptCard = {
  cardId: string; name: string; setCode: string; setName: string; collectorNumber: string; imageUrl: string | null; finish: number; condition: string; promoTypes: string; finishes: string;
  warning?: string;
};
/** `productName` is the name of a named product (0.20.0), such as "Landing Party"; `sealedId` the MTGJSON product it matched. */
export type ReceiptLine = {
  text: string; product: string; name: string; setCode: string | null; quantity: number; cost: number; note: string; cardLike: boolean; card: ReceiptCard | null;
  productName: string; sealedId: string | null;
};
export type ReceiptFields = {
  date: string | null; place: string | null; note: string | null; lines: ReceiptLine[]; tax: number | null; shipping: number | null; total: number | null; linesTotal: number;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (value: number) => String(value).padStart(2, "0");
const money = (value: number) => Math.round(value * 100) / 100;

function validDate(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
  const text = `${year}-${pad(month)}-${pad(day)}`;
  return Number.isFinite(Date.parse(text)) ? text : null;
}

/**
 * The order date (0.19.0): a date after Confirmed, Ordered, Order date, Placed or Purchased, before any other date (pickup,
 * shipping, delivery). A date without a year takes the latest such date not after today.
 */
export function findOrderDate(text: string, today = new Date()): string | null {
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
  const keyword = /\b(confirmed|ordered|order\s+date|order\s+placed|placed(?:\s+on)?|purchased|date\s+of\s+purchase)\b[:\s]*(?:on\s+)?/i;
  for (const row of text.split(/\r?\n/)) {
    const at = row.search(keyword);
    if (at < 0) continue;
    const rest = row.slice(at).replace(keyword, "");
    const full = findDate(rest);
    if (full) return full;
    const short = rest.match(new RegExp(`^\\s*${month}\\s+(\\d{1,2})\\b`, "i")) ?? rest.match(new RegExp(`^\\s*(\\d{1,2})\\s+${month}`, "i"));
    if (short) {
      const [monthName, day] = /^\d/.test(short[1]!) ? [short[2]!, Number(short[1])] : [short[1]!, Number(short[2])];
      const index = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
      let year = today.getFullYear();
      let date = validDate(year, index + 1, day);
      if (date && date > today.toISOString().slice(0, 10)) date = validDate((year -= 1), index + 1, day);
      if (date) return date;
    }
    const numeric = rest.match(/^\s*(\d{1,2})\/(\d{1,2})\b(?!\/)/);
    if (numeric) {
      const date = validDate(today.getFullYear(), Number(numeric[1]), Number(numeric[2]));
      if (date) return date > today.toISOString().slice(0, 10) ? validDate(today.getFullYear() - 1, Number(numeric[1]), Number(numeric[2])) : date;
    }
  }
  return findDate(text);
}

/** The first calendar date in the text. */
export function findDate(text: string): string | null {
  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string | null]> = [
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => validDate(+m[1]!, +m[2]!, +m[3]!)],
    [/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/, (m) => validDate(+m[3]!, +m[1]!, +m[2]!)],
    [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i, (m) => validDate(+m[3]!, MONTHS.indexOf(m[1]!.toLowerCase()) + 1, +m[2]!)],
    [/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i, (m) => validDate(+m[3]!, MONTHS.indexOf(m[2]!.toLowerCase()) + 1, +m[1]!)],
  ];
  let best: { index: number; date: string } | null = null;
  for (const [pattern, read] of patterns) {
    const match = text.match(pattern);
    const date = match ? read(match) : null;
    if (match && date && (!best || match.index! < best.index)) best = { index: match.index!, date };
  }
  return best?.date ?? null;
}

const AMOUNT = /-?\$?\s?(\d{1,3}(?:,\d{3})*|\d+)[.,](\d{2})\b/g;
function amounts(line: string): number[] {
  return [...line.matchAll(AMOUNT)].map((match) => Number(`${match[1]!.replace(/,/g, "")}.${match[2]}`) * (match[0].trim().startsWith("-") ? -1 : 1));
}
const lastAmount = (line: string) => amounts(line).at(-1) ?? null;

const PRODUCT_WORDS: Array<[RegExp, string]> = [
  [/booster\s+(box|display)|\bdisplay\b/i, "booster_box"],
  [/collector'?s?\s+booster/i, "collector_booster"],
  [/set\s+booster/i, "set_booster"],
  [/draft\s+booster/i, "draft_booster"],
  [/play\s+booster/i, "play_booster"],
  [/jump\s?start/i, "jumpstart_booster"],
  [/bundle|fat\s+pack/i, "bundle"],
  [/commander\s+(deck|precon)|\bprecon/i, "commander_deck"],
  [/pre-?release/i, "prerelease_kit"],
  [/secret\s+lair/i, "secret_lair"],
  [/booster|\bpack\b/i, "other_booster"],
  [/\bdeck\b/i, "deck"],
];
const SKIP = /\b(sub\s?-?total|total|tax(es)?|sales\s+tax|vat|gst|shipping|delivery|pick\s?-?up|postage|handling|change|cash|tender|visa|mastercard|amex|discover|debit|credit|card\s+ending|balance|payment|paid|tip|gratuity|savings|you\s+saved|refund|points|rewards|discount)(?![a-z])/i;
/** Buttons, links and status text of order pages (0.19.0): never products, places or notes. */
const IGNORED = /\b(buy\s+again|track\s+(all\s+)?(your\s+)?orders?|view\s+(order|details|receipt)|re-?order|order\s+again|picked\s+up|ready\s+for\s+pickup|confirmed|shipped|delivered|out\s+for\s+delivery|write\s+a\s+review|return\s+items?|contact\s+(us|store|seller)|need\s+help|continue\s+shopping|sign\s+in|log\s+in|shop\s+now|\bat\s+\d{1,2}:\d{2})\b/i;
/** A condition or finish note, such as "Near Mint Foil", "NM", "Lightly Played Etched". */
const conditionWords = "near\\s+mint|lightly\\s+played|moderately\\s+played|heavily\\s+played|damaged|mint|nm|lp|mp|hp|dmg";
const foilPatterns = Object.entries(SPECIAL_FOILS).map(([type, label]) => ({
  type, pattern: label.replace(/[ -]+/g, "[\\s-]*"),
}));
const finishWords = `${foilPatterns.map(({ pattern }) => pattern).join("|")}|non-?foil|foil|etched`;
export const CONDITION_NOTE = new RegExp(`\\b(?:${conditionWords}|${finishWords})\\b`, "i");
const noteAtEnd = new RegExp(`(?:\\b(?:${conditionWords})\\b\\s*)?(?:\\b(?:${finishWords})\\b)?\\s*$`, "i");
export const specialFoilOf = (text: string): string | null =>
  foilPatterns.find(({ pattern }) => new RegExp(`\\b${pattern}\\b`, "i").test(text))?.type ?? null;
const CONDITIONS: Array<[RegExp, string]> = [
  [/\bnear\s+mint\b|\bnm\b/i, "NM"], [/\blightly\s+played\b|\blp\b/i, "LP"], [/\bmoderately\s+played\b|\bmp\b/i, "MP"],
  [/\bheavily\s+played\b|\bhp\b/i, "HP"], [/\bdamaged\b|\bdmg\b/i, "DMG"], [/\bmint\b/i, "M"],
];
/** The condition written on a receipt line, NM when none. */
export const conditionOf = (text: string) => CONDITIONS.find(([pattern]) => pattern.test(text))?.[1] ?? "NM";
/** The finish written on a receipt line: 2 etched, 1 foil, 0 regular. */
export const finishOf = (text: string) => (/\betched\b/i.test(text) ? 2 : (specialFoilOf(text) || /\bfoil\b/i.test(text)) && !/\bnon-?foil\b/i.test(text) ? 1 : 0);

/** The product a line is, by its words. */
export function productOf(text: string): string {
  for (const [pattern, product] of PRODUCT_WORDS) if (pattern.test(text)) return product;
  return "other";
}

/**
 * The set a line names: the longest set name found in it. Punctuation is ignored (0.19.0: "Star Trek: Commander Deck"
 * names Star Trek), and a Commander product also finds the set's Commander companion ("Tales of Middle-earth Commander")
 * from the main set's name.
 */
export function setOf(text: string, sets: Array<{ code: string; name: string }>): string | null {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const lower = ` ${clean(text)} `;
  const commander = /\bcommander\b/i.test(text);
  let best: { code: string; length: number } | null = null;
  for (const set of sets) {
    const full = clean(set.name);
    const base = full.replace(/\s+commander$/, "");
    for (const name of base !== full ? [full, base] : [full]) {
      if (name.length < 4 || !lower.includes(` ${name} `)) continue;
      // a match on the main set's name counts as the Commander set only for Commander products, and the other way round
      const length = name.length + (commander === full.endsWith(" commander") ? 0.5 : 0);
      if (!best || length > best.length) best = { code: set.code, length };
    }
  }
  return best?.code ?? null;
}

const BRAND = /\b(magic\s*:?\s*the\s+gathering|magic\s+tg|mtg|tcg)\b/gi;
const FILLER = /\b(the|of|and|a|an|english|en|sealed|new|factory|magic|gathering|edition|product|cards?|game|wotc|wizards|commander|decks?|precon|preconstructed|boosters?|box|display|bundle|fat|packs?|sets?|draft|play|collector'?s?|jump\s?start|pre-?release|kit|secret|lair|starter|qty|quantity|each|item|sku)\b/gi;

/**
 * The name of a named product (0.20.0) in a line of text: what is left after the brand, the set name and the product
 * words, from the parts between colons, dashes, commas and brackets. "Magic the Gathering: Star Trek: Commander Deck:
 * Landing Party" gives "Landing Party"; "Star Trek Beam Me Up Bundle" gives "Beam Me Up Bundle"; "Bloomburrow Bundle"
 * gives nothing.
 */
export function productNameOf(text: string, setNames: string[]): string {
  let rest = ` ${text} `.replace(BRAND, " ");
  const names = setNames.flatMap((name) => {
    const base = name.replace(/\s+commander$/i, "");
    return base !== name ? [name, base] : [name];
  });
  for (const name of names) {
    const words = name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    rest = rest.replace(new RegExp(`(^|[^a-z0-9])${words.join("[^a-z0-9]+")}(?=$|[^a-z0-9])`, "gi"), "$1 ");
  }
  const segments = rest.split(/\s*(?::|\s[-\u2013\u2014|]\s|[()[\],])\s*/)
    .map((segment) => segment.replace(/^[^a-z0-9]+|[^a-z0-9!?']+$/gi, "").replace(/\s+/g, " ").trim())
    .filter((segment) => segment.replace(FILLER, " ").replace(/[^a-z]/gi, "").length >= 3);
  return segments.join(" ").slice(0, 120);
}

function prereleaseNameOf(text: string, setNames: string[]): string {
  const months = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  return productNameOf(text, setNames)
    .replace(new RegExp(`\\b(?:${months})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi"), " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?\b/gi, " ")
    .replace(/\bpre-?release(?:\s+events?)?\b|\b(?:kit|sealed|entry|for|ea|each)\b/gi, " ")
    .replace(/\b\d+\b|\bB\b\u00ae?/gi, " ")
    .replace(/\u00ae/g, " ")
    .replace(/^(?:\d+\s*)?x\b/i, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\W]+|[\s\W]+$/g, "");
}

/** Reads the fields of a purchase from the text of a receipt. Fields not found stay empty. */
export function parseReceipt(text: string, sets: Array<{ code: string; name: string }> = []): ReceiptFields {
  const rows = text.split(/\r?\n/).map((row) => row.replace(/\s+/g, " ").trim()).filter(Boolean);
  const pick = (pattern: RegExp, not?: RegExp) => {
    for (const row of [...rows].reverse()) if (pattern.test(row) && !(not?.test(row))) {
      const value = lastAmount(row);
      if (value !== null) return Math.abs(value);
    }
    return null;
  };
  const total = pick(/\b(grand\s+)?total\b|amount\s+due|order\s+total/i, /sub\s?-?total|total\s+(savings|items|qty|quantity)/i);
  const tax = pick(/\b(sales\s+)?tax(es)?\b|\bvat\b|\bgst\b/i, /before\s+tax|pre-?tax/i);
  // shipping and store pickup (a "Free" pickup counts as 0)
  const shipping = pick(/\bshipping\b|\bdelivery\b|\bpostage\b|\bhandling\b|\bpick\s?-?up\b/i, /free\s+shipping/i)
    ?? (rows.some((row) => /\b(shipping|delivery|pick\s?-?up)\b.*\bfree\b/i.test(row)) ? 0 : null);
  // the place is never a row with a price or a product name (0.19.1: "MAGIC Magic the Gathering: Star $64.99" is the first row of a cropped screenshot)
  // only rows above the first line with a price can name the place
  const firstPrice = rows.findIndex((row) => !SKIP.test(row) && (lastAmount(row) ?? 0) > 0);
  const place = rows.slice(0, Math.min(6, firstPrice < 0 ? 6 : firstPrice)).find((row) => /[a-z]{3}/i.test(row) && !/\d{3,}/.test(row) && !IGNORED.test(row)
    && lastAmount(row) === null && productOf(row) === "other" && !/magic\s*(:|the\s+gathering)|\bmtg\b|\btcg\b/i.test(row)
    && !/receipt|invoice|order|thank|welcome|date|tel|phone|www\.|http|track|shop\b/i.test(row) && row.length <= 60) ?? null;
  const orderNumber = text.match(/\border\s*(?:#|no\.?|number)\s*:?\s*#?\s*([A-Z0-9][A-Z0-9-]{3,})/i);
  const lines: ReceiptLine[] = [];
  let pendingQuantity: number | null = null;
  for (const row of rows) {
    if (SKIP.test(row) || IGNORED.test(row) || /\border\s*(#|no\.?|number)/i.test(row)) {
      pendingQuantity = null;
      continue;
    }
    if (/^\d{1,3}$/.test(row)) {
      pendingQuantity = Number(row);
      continue;
    }
    const adjacentQuantity = pendingQuantity;
    pendingQuantity = null;
    const cost = lastAmount(row);
    // a condition or finish on its own row belongs to the line above it ("Near Mint Foil" under the card name)
    if ((cost === null || cost <= 0) && lines.length && CONDITION_NOTE.test(row) && row.replace(new RegExp(CONDITION_NOTE.source, "gi"), "").replace(/[^a-z]/gi, "").length < 4) {
      const last = lines.at(-1)!;
      last.note = `${last.note} ${row}`.trim();
      last.text = `${last.text} ${row}`;
      continue;
    }
    // a name that wraps onto the next rows (0.19.1): "Magic the Gathering: Star $64.99", "Trek: Commander Deck:", "Landing Party"
    if (cost === null || cost <= 0) {
      const last = lines.at(-1);
      const text = cleanRow(row);
      if (last && !last.note && /[a-z]{3}/i.test(text) && (unfinished(last.name) || /[:,&-]\s*$/.test(text))) {
        last.name = `${last.name} ${text}`.replace(/\s+/g, " ").slice(0, 160);
        last.text = `${last.text} ${row}`;
        last.product = productOf(last.name);
        last.setCode = setOf(last.name, sets);
      }
      continue;
    }
    let name = cleanRow(row.replace(AMOUNT, " "));
    if (!/[a-z]{3}/i.test(name)) continue;
    let quantity = adjacentQuantity ?? 1;
    const quantityMatch = name.match(/^(\d{1,3})\s*(?:x|@|ea\b)\s*/i) ?? name.match(/\b(?:qty|quantity)[:\s]*(\d{1,3})\b/i)
      ?? name.match(/\s(?:x|@)\s*(\d{1,3})$/i) ?? name.match(/^(\d{1,3})\s+(?=[A-Za-z])/);
    if (quantityMatch) {
      quantity = Math.max(1, Number(quantityMatch[1]));
      name = name.replace(quantityMatch[0], " ").replace(/\s+/g, " ").trim();
    }
    name = name.replace(/^[-*#:.|\s]+|[-*#:.|\s]+$/g, "").slice(0, 120);
    const note = CONDITION_NOTE.test(name) && productOf(name) === "other" ? (name.match(noteAtEnd)?.[0] ?? "").trim() : "";
    if (note) name = name.slice(0, name.length - note.length).trim();
    lines.push({ text: row, product: productOf(name), name, setCode: setOf(name, sets), quantity, cost: money(cost), note, cardLike: false, card: null, productName: "", sealedId: null });
  }
  const setName = (code: string | null) => sets.find((set) => set.code === code)?.name;
  for (const line of lines) {
    const named = setName(line.setCode);
    line.productName = line.product === "other" ? ""
      : line.product === "prerelease_kit" ? prereleaseNameOf(line.name, named ? [named] : [])
        : productNameOf(line.name, named ? [named] : []);
  }
  return {
    date: findOrderDate(text), place, note: orderNumber ? `Order #${orderNumber[1]}` : null, lines, tax, shipping, total,
    linesTotal: money(lines.reduce((sum, line) => sum + line.cost, 0)),
  };
}

/**
 * A row of text without leading marks, and without a word in capitals that repeats the next word (0.19.1: the text on a
 * product's picture, "MAGIC Magic the Gathering", read beside its name).
 */
function cleanRow(row: string): string {
  let text = row.replace(/^[|!\]\[}{()•·*-]+\s*/, "").replace(/\s+/g, " ").trim();
  const words = text.split(" ");
  while (words.length > 1 && /^[A-Z]{2,}$/.test(words[0]!) && words[0]!.toLowerCase() === words[1]!.toLowerCase()) words.shift();
  text = words.join(" ");
  return text;
}

/** A line name that goes on: an open bracket, or an ending such as ":", ",", "&", "-", "of", "the" or "and". */
function unfinished(name: string): boolean {
  const open = (name.match(/[[(]/g) ?? []).length > (name.match(/[\])]/g) ?? []).length;
  return open || /[:,&-]\s*$|\b(the|of|and|a|an|for)\s*$/i.test(name);
}

// ---------- reading text from files ----------

/** The text of a PDF, one line per row of text. */
export async function pdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data, useSystemFonts: false });
  const document = await task.promise;
  const out: string[] = [];
  for (let number = 1; number <= Math.min(document.numPages, 20); number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (!item.str?.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5]! / 3);
      rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4]!, text: item.str }]);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) out.push(rows.get(y)!.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
  }
  await task.destroy();
  return out.join("\n");
}

type Worker = { recognize: (image: Buffer) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };
let worker: Promise<Worker> | null = null;
let idle: NodeJS.Timeout | null = null;

/** The text of a picture, read with the bundled English model. */
export async function pictureText(data: Buffer, ocrFolder: string): Promise<string> {
  if (!existsSync(join(ocrFolder, "eng.traineddata.gz"))) throw new Error("Text recognition files are missing from this installation");
  if (!worker) {
    worker = import("tesseract.js").then(({ createWorker }) => createWorker("eng", 1, { langPath: ocrFolder, cachePath: ocrFolder, cacheMethod: "none", gzip: true }) as unknown as Promise<Worker>);
  }
  const ready = await worker;
  if (idle) clearTimeout(idle);
  try {
    return (await ready.recognize(data)).data.text;
  } finally {
    idle = setTimeout(() => {
      void ready.terminate();
      worker = null;
    }, 120_000);
    idle.unref();
  }
}
