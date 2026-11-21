// ---------- receipt reading (0.17.0): text from a PDF or a picture of a receipt, and the purchase fields found in it.
// PDFs are read with pdf.js; pictures with the same text recognition engine and English model the scanner uses, from the
// /ocr folder of the built interface, so reading works without the internet. ----------
import { existsSync } from "node:fs";
import { join } from "node:path";

export type ReceiptLine = { text: string; product: string; name: string; setCode: string | null; quantity: number; cost: number };
export type ReceiptFields = {
  date: string | null; place: string | null; lines: ReceiptLine[]; tax: number | null; shipping: number | null; total: number | null; linesTotal: number;
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
  [/collector'?s?\s+booster/i, "collector_booster"],
  [/set\s+booster/i, "set_booster"],
  [/draft\s+booster/i, "draft_booster"],
  [/play\s+booster/i, "play_booster"],
  [/jump\s?start/i, "jumpstart_booster"],
  [/booster\s+(box|display)|\bdisplay\b/i, "booster_box"],
  [/bundle|fat\s+pack/i, "bundle"],
  [/commander\s+(deck|precon)|\bprecon/i, "commander_deck"],
  [/pre-?release/i, "prerelease_kit"],
  [/secret\s+lair/i, "secret_lair"],
  [/booster|\bpack\b/i, "other_booster"],
  [/\bdeck\b/i, "deck"],
];
const SKIP = /\b(sub\s?-?total|total|tax|vat|gst|shipping|delivery|postage|handling|change|cash|tender|visa|mastercard|amex|discover|debit|credit|card\s+ending|balance|payment|paid|tip|gratuity|savings|you\s+saved|refund|points|rewards)\b/i;

/** The product a line is, by its words. */
export function productOf(text: string): string {
  for (const [pattern, product] of PRODUCT_WORDS) if (pattern.test(text)) return product;
  return "other";
}

/** The set a line names: the longest set name found in it. */
export function setOf(text: string, sets: Array<{ code: string; name: string }>): string | null {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9: ]+/g, " ").replace(/\s+/g, " ")} `;
  let best: { code: string; length: number } | null = null;
  for (const set of sets) {
    const name = set.name.toLowerCase().replace(/[^a-z0-9: ]+/g, " ").replace(/\s+/g, " ").trim();
    if (name.length < 4) continue;
    if (lower.includes(` ${name} `) && (!best || name.length > best.length)) best = { code: set.code, length: name.length };
  }
  return best?.code ?? null;
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
  const tax = pick(/\b(sales\s+)?tax\b|\bvat\b|\bgst\b/i, /before\s+tax|pre-?tax/i);
  const shipping = pick(/\bshipping\b|\bdelivery\b|\bpostage\b|\bhandling\b/i, /free\s+shipping/i);
  const place = rows.slice(0, 6).find((row) => /[a-z]{3}/i.test(row) && !/\d{3,}/.test(row) && !/receipt|invoice|order|thank|welcome|date|tel|phone|www\.|http/i.test(row) && row.length <= 60) ?? null;
  const lines: ReceiptLine[] = [];
  for (const row of rows) {
    if (SKIP.test(row)) continue;
    const cost = lastAmount(row);
    if (cost === null || cost <= 0) continue;
    let name = row.replace(AMOUNT, " ").replace(/\s+/g, " ").trim();
    if (!/[a-z]{3}/i.test(name)) continue;
    let quantity = 1;
    const quantityMatch = name.match(/^(\d{1,3})\s*(?:x|@|ea\b)\s*/i) ?? name.match(/\b(?:qty|quantity)[:\s]*(\d{1,3})\b/i) ?? name.match(/\s(?:x|@)\s*(\d{1,3})$/i);
    if (quantityMatch) {
      quantity = Math.max(1, Number(quantityMatch[1]));
      name = name.replace(quantityMatch[0], " ").replace(/\s+/g, " ").trim();
    }
    name = name.replace(/^[-*#:.\s]+|[-*#:.\s]+$/g, "").slice(0, 120);
    lines.push({ text: row, product: productOf(name), name, setCode: setOf(name, sets), quantity, cost: money(cost) });
  }
  return {
    date: findDate(text), place, lines, tax, shipping, total,
    linesTotal: money(lines.reduce((sum, line) => sum + line.cost, 0)),
  };
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
