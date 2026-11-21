// ---------- printing proxies: page layout, the PDF, MakePlayingCards pictures and the MPC Autofill list ----------
import { zipSync } from "fflate";
import { fetchFile } from "./api";

export type Faces = "front" | "back" | "both";
export type PrintCard = {
  id: string; oracle_id: string; name: string; type_line: string; set_code: string; set_name: string; collector_number: string;
  image_url: string | null; custom: boolean; hasBack: boolean;
  /** Details for sorting and the price pip (0.14.0); lines added before the list is loaded again may lack them. */
  mana_value?: number; rarity?: string; colors?: string; finishes?: string;
  price_usd?: number | null; price_usd_foil?: number | null; price_usd_etched?: number | null; price_eur?: number | null; price_eur_foil?: number | null;
};

/** How the print list is ordered; the PDF and the pictures follow the same order. */
export type PrintSort = "added" | "name" | "set" | "mv" | "rarity" | "color" | "price" | "count";
export const PRINT_SORTS: Array<[PrintSort, string]> = [
  ["added", "Order added"], ["name", "Name"], ["set", "Set"], ["mv", "Mana value"], ["rarity", "Rarity"], ["color", "Color"], ["price", "Price"], ["count", "Count"],
];
const RARITY_ORDER: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
const colorOrder = (colors = "") => {
  const list = colors.replace(/[\s,]/g, "");
  return !list ? 7 : list.length > 1 ? 6 : "WUBRG".indexOf(list) + 1;
};
export const printPrice = (card: PrintCard, currency: "usd" | "eur") => (currency === "eur"
  ? card.price_eur ?? card.price_eur_foil ?? null
  : card.price_usd ?? card.price_usd_foil ?? card.price_usd_etched ?? null);

/** The print list in the chosen order (Order added keeps the list as it is), each sort falling back to the name. */
export function sortPrintLines(lines: PrintLine[], sort: PrintSort, currency: "usd" | "eur"): PrintLine[] {
  if (sort === "added") return lines;
  const name = (a: PrintLine, b: PrintLine) => a.card.name.localeCompare(b.card.name);
  const compare: Record<Exclude<PrintSort, "added">, (a: PrintLine, b: PrintLine) => number> = {
    name,
    set: (a, b) => a.card.set_name.localeCompare(b.card.set_name) || a.card.collector_number.localeCompare(b.card.collector_number, undefined, { numeric: true }) || name(a, b),
    mv: (a, b) => (a.card.mana_value ?? 0) - (b.card.mana_value ?? 0) || name(a, b),
    rarity: (a, b) => (RARITY_ORDER[a.card.rarity ?? ""] ?? 4) - (RARITY_ORDER[b.card.rarity ?? ""] ?? 4) || name(a, b),
    color: (a, b) => colorOrder(a.card.colors) - colorOrder(b.card.colors) || name(a, b),
    price: (a, b) => (printPrice(b.card, currency) ?? -1) - (printPrice(a.card, currency) ?? -1) || name(a, b),
    count: (a, b) => b.count - a.count || name(a, b),
  };
  return [...lines].sort(compare[sort]);
}
export type PrintLine = { id: string; cardId: string; count: number; faces: Faces; card: PrintCard };

export type Paper = "letter" | "a4" | "legal" | "custom";
export type Marks = "lines" | "corners" | "none";
export type SheetSettings = {
  paper: Paper; pageWidth: number; pageHeight: number; margin: number;
  cardSize: "standard" | "custom"; cardWidth: number; cardHeight: number; scale: number;
  gap: number; bleed: number; marks: Marks; background: string;
};

export const DEFAULT_SHEET: SheetSettings = {
  paper: "letter", pageWidth: 215.9, pageHeight: 279.4, margin: 6, cardSize: "standard", cardWidth: 63, cardHeight: 88, scale: 100,
  gap: 0, bleed: 0, marks: "lines", background: "#ffffff",
};

export const PAPERS: Record<Exclude<Paper, "custom">, [number, number]> = { letter: [215.9, 279.4], a4: [210, 297], legal: [215.9, 355.6] };

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Sheet settings from saved preferences, with every number kept in a usable range. */
export function readSheet(value: unknown): SheetSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const paper: Paper = ["letter", "a4", "legal", "custom"].includes(String(raw.paper)) ? raw.paper as Paper : DEFAULT_SHEET.paper;
  const marks: Marks = ["lines", "corners", "none"].includes(String(raw.marks)) ? raw.marks as Marks : DEFAULT_SHEET.marks;
  return {
    paper,
    pageWidth: clamp(raw.pageWidth, 50, 1000, DEFAULT_SHEET.pageWidth),
    pageHeight: clamp(raw.pageHeight, 50, 1000, DEFAULT_SHEET.pageHeight),
    margin: clamp(raw.margin, 0, 50, DEFAULT_SHEET.margin),
    cardSize: raw.cardSize === "custom" ? "custom" : "standard",
    cardWidth: clamp(raw.cardWidth, 20, 300, DEFAULT_SHEET.cardWidth),
    cardHeight: clamp(raw.cardHeight, 20, 300, DEFAULT_SHEET.cardHeight),
    scale: clamp(raw.scale, 50, 150, DEFAULT_SHEET.scale),
    gap: clamp(raw.gap, 0, 20, DEFAULT_SHEET.gap),
    bleed: clamp(raw.bleed, 0, 3, DEFAULT_SHEET.bleed),
    marks,
    background: typeof raw.background === "string" && /^#[0-9a-f]{6}$/i.test(raw.background) ? raw.background : DEFAULT_SHEET.background,
  };
}

/** One card on a page: which card and face, and where (millimetres from the top left of the page, the cut size). */
export type Slot = { cardId: string; face: "front" | "back"; name: string; x: number; y: number; width: number; height: number };
export type PageLayout = { width: number; height: number; columns: number; rows: number; pages: Slot[][]; perPage: number };

/** The faces printed for a line, in order: front, back, or both (a card without a back face prints its front). */
export function facesOf(line: Pick<PrintLine, "faces"> & { card: Pick<PrintCard, "hasBack"> }): Array<"front" | "back"> {
  if (!line.card.hasBack) return ["front"];
  return line.faces === "both" ? ["front", "back"] : [line.faces];
}

/** Every card printed, in list order. */
export function printSlots(lines: PrintLine[]): Array<{ cardId: string; face: "front" | "back"; name: string }> {
  return lines.flatMap((line) => Array.from({ length: line.count }, () => facesOf(line).map((face) => ({ cardId: line.cardId, face, name: line.card.name }))).flat());
}

/** Places the cards on pages: as many columns and rows as fit inside the margins, the grid centered on the page. */
export function layoutPages(lines: PrintLine[], sheet: SheetSettings): PageLayout {
  const [width, height] = sheet.paper === "custom" ? [sheet.pageWidth, sheet.pageHeight] : PAPERS[sheet.paper];
  const baseWidth = sheet.cardSize === "custom" ? sheet.cardWidth : 63;
  const baseHeight = sheet.cardSize === "custom" ? sheet.cardHeight : 88;
  const cardWidth = baseWidth * (sheet.scale / 100);
  const cardHeight = baseHeight * (sheet.scale / 100);
  const cellWidth = cardWidth + sheet.bleed * 2;
  const cellHeight = cardHeight + sheet.bleed * 2;
  const usableWidth = width - sheet.margin * 2;
  const usableHeight = height - sheet.margin * 2;
  const columns = Math.max(1, Math.floor((usableWidth + sheet.gap) / (cellWidth + sheet.gap)));
  const rows = Math.max(1, Math.floor((usableHeight + sheet.gap) / (cellHeight + sheet.gap)));
  const gridWidth = columns * cellWidth + (columns - 1) * sheet.gap;
  const gridHeight = rows * cellHeight + (rows - 1) * sheet.gap;
  const left = (width - gridWidth) / 2;
  const top = (height - gridHeight) / 2;
  const perPage = columns * rows;
  const pages: Slot[][] = [];
  printSlots(lines).forEach((slot, index) => {
    const page = Math.floor(index / perPage);
    const place = index % perPage;
    const column = place % columns;
    const row = Math.floor(place / columns);
    (pages[page] ??= []).push({
      ...slot,
      x: left + column * (cellWidth + sheet.gap) + sheet.bleed,
      y: top + row * (cellHeight + sheet.gap) + sheet.bleed,
      width: cardWidth, height: cardHeight,
    });
  });
  return { width, height, columns, rows, pages, perPage };
}

// ---------- card pictures ----------
const pictureCache = new Map<string, Promise<HTMLImageElement | null>>();
/** Pictures are asked for a few at a time: asking for a whole sheet at once made some downloads fail. */
const PICTURE_SLOTS = 3;
let active = 0;
const waiting: Array<() => void> = [];
async function inTurn<T>(run: () => Promise<T>): Promise<T> {
  if (active >= PICTURE_SLOTS) await new Promise<void>((go) => waiting.push(go));
  active += 1;
  try {
    return await run();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

/**
 * The full-size picture of a card face, through the server, or null when it cannot be had. A picture is tried twice; a
 * failure is not remembered, so the next request (another preview, Try again, the PDF) asks again.
 */
export function cardPicture(cardId: string, face: "front" | "back"): Promise<HTMLImageElement | null> {
  const key = `${cardId}:${face}`;
  let promise = pictureCache.get(key);
  if (!promise) {
    const once = () => inTurn(() => fetchFile(`/api/card-images/${encodeURIComponent(cardId)}?face=${face}&size=png`)
      .then(async (response) => (response.ok ? loadImage(await response.blob()) : null))
      .catch(() => null));
    promise = once().then((picture) => picture ?? once());
    pictureCache.set(key, promise);
    void promise.then((picture) => { if (!picture && pictureCache.get(key) === promise) pictureCache.delete(key); });
  }
  return promise;
}

/** Loads the pictures of every face to print and returns the names of the cards whose picture could not be had. */
export async function missingPictures(faces: Array<{ cardId: string; face: "front" | "back"; name: string }>, progress?: (done: number, total: number) => void): Promise<string[]> {
  const distinct = [...new Map(faces.map((item) => [`${item.cardId}:${item.face}`, item])).values()];
  let done = 0;
  const results = await Promise.all(distinct.map(async (item) => {
    const picture = await cardPicture(item.cardId, item.face);
    done += 1;
    progress?.(done, distinct.length);
    return picture ? null : `${item.name}${item.face === "back" ? " (back)" : ""}`;
  }));
  return [...new Set(results.filter((name): name is string => !!name))];
}

function loadImage(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = URL.createObjectURL(blob);
  });
}

/**
 * Draws a card face for printing: the picture at the cut size, with the bleed filled by the same picture stretched behind
 * it. A card whose picture cannot be downloaded prints as a white card with its name.
 */
export function drawPrint(picture: HTMLImageElement | null, name: string, widthPx: number, heightPx: number, bleedPx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthPx + bleedPx * 2);
  canvas.height = Math.round(heightPx + bleedPx * 2);
  const ctx = canvas.getContext("2d")!;
  if (picture) {
    if (bleedPx > 0) ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, bleedPx, bleedPx, widthPx, heightPx);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = Math.max(2, widthPx / 120);
    ctx.strokeRect(bleedPx + ctx.lineWidth, bleedPx + ctx.lineWidth, widthPx - ctx.lineWidth * 2, heightPx - ctx.lineWidth * 2);
    ctx.fillStyle = "#111111";
    ctx.font = `700 ${Math.round(widthPx / 14)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = name.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > widthPx * 0.84 && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    const lineHeight = widthPx / 11;
    lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * lineHeight));
  }
  return canvas;
}

const toJpeg = (canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) return reject(new Error("The card picture could not be made"));
    void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)));
  }, "image/jpeg", quality);
});

const PT = 72 / 25.4;
const DPI = 300;
const px = (mm: number) => Math.round((mm / 25.4) * DPI);

function hexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Builds the PDF of a print list. Each distinct card face is drawn once at 300 DPI and placed wherever it prints. */
export async function buildPdf(lines: PrintLine[], sheet: SheetSettings, progress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const layout = layoutPages(lines, sheet);
  const pdf = await PDFDocument.create();
  pdf.setTitle("Proxies");
  pdf.setCreator("Mana Vault");
  const embedded = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>>>();
  const distinct = [...new Map(layout.pages.flat().map((slot) => [`${slot.cardId}:${slot.face}`, slot])).values()];
  let done = 0;
  for (const slot of distinct) {
    const picture = await cardPicture(slot.cardId, slot.face);
    const canvas = drawPrint(picture, slot.name, px(slot.width), px(slot.height), px(sheet.bleed));
    embedded.set(`${slot.cardId}:${slot.face}`, await pdf.embedJpg(await toJpeg(canvas)));
    done += 1;
    progress?.(done, distinct.length);
  }
  const [red, green, blue] = hexColor(sheet.background);
  const markColor = rgb(0.55, 0.55, 0.55);
  for (const slots of layout.pages) {
    const page = pdf.addPage([layout.width * PT, layout.height * PT]);
    if (sheet.background.toLowerCase() !== "#ffffff") page.drawRectangle({ x: 0, y: 0, width: layout.width * PT, height: layout.height * PT, color: rgb(red, green, blue) });
    for (const slot of slots) {
      const image = embedded.get(`${slot.cardId}:${slot.face}`)!;
      // PDF positions count from the bottom left
      page.drawImage(image, {
        x: (slot.x - sheet.bleed) * PT, y: (layout.height - slot.y - slot.height - sheet.bleed) * PT,
        width: (slot.width + sheet.bleed * 2) * PT, height: (slot.height + sheet.bleed * 2) * PT,
      });
    }
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1 * PT, y: (layout.height - y1) * PT }, end: { x: x2 * PT, y: (layout.height - y2) * PT }, thickness: 0.4, color: markColor });
    if (sheet.marks === "lines") {
      // cut lines run through the whole page along every card edge
      for (const x of new Set(slots.flatMap((slot) => [slot.x, slot.x + slot.width]))) line(x, 0, x, layout.height);
      for (const y of new Set(slots.flatMap((slot) => [slot.y, slot.y + slot.height]))) line(0, y, layout.width, y);
    } else if (sheet.marks === "corners") {
      const mark = 3;
      for (const slot of slots) {
        for (const [x, y, dx, dy] of [[slot.x, slot.y, -1, -1], [slot.x + slot.width, slot.y, 1, -1], [slot.x, slot.y + slot.height, -1, 1], [slot.x + slot.width, slot.y + slot.height, 1, 1]] as const) {
          line(x, y + dy * sheet.bleed, x, y + dy * (sheet.bleed + mark));
          line(x + dx * sheet.bleed, y, x + dx * (sheet.bleed + mark), y);
        }
      }
    }
  }
  return pdf.save();
}

// ---------- MakePlayingCards ----------
/** MakePlayingCards cards with bleed: 2.74 x 3.74 inches at 300 DPI, the cut size 2.5 x 3.5 inches in the middle. */
export const MPC_SIZE = { width: 822, height: 1122, cutWidth: 750, cutHeight: 1050 };

const safeName = (text: string) => text.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "card";

/** One picture per card face in print order, named with the order and the count, such as "003 4x Sol Ring.jpg". */
export async function buildMpcZip(lines: PrintLine[], progress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const faces = lines.flatMap((line) => facesOf(line).map((face) => ({ line, face })));
  let done = 0;
  for (const [index, { line, face }] of faces.entries()) {
    const picture = await cardPicture(line.cardId, face);
    const bleed = (MPC_SIZE.width - MPC_SIZE.cutWidth) / 2;
    const canvas = drawPrint(picture, line.card.name, MPC_SIZE.cutWidth, MPC_SIZE.cutHeight, bleed);
    const back = face === "back" ? " (back)" : "";
    files[`${String(index + 1).padStart(3, "0")} ${line.count}x ${safeName(line.card.name)}${back}.jpg`] = await toJpeg(canvas, 0.95);
    done += 1;
    progress?.(done, faces.length);
  }
  return zipSync(files, { level: 0 });
}

/** The card list for MPC Autofill: one line per card with its count. Custom cards are left out (they go in a zip of pictures). */
export function mpcAutofillList(lines: PrintLine[]): string {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (line.card.custom) continue;
    const name = line.card.hasBack && line.faces === "back" ? line.card.name.split(" // ")[1] ?? line.card.name : line.card.hasBack && line.faces === "front" ? line.card.name.split(" // ")[0]! : line.card.name;
    counts.set(name, (counts.get(name) ?? 0) + line.count);
  }
  return [...counts].map(([name, count]) => `${count} ${name}`).join("\n") + (counts.size ? "\n" : "");
}
