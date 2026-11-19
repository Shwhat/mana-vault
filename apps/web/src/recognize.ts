// ---------- text recognition: reads the name line and the info line from the card in the camera guide ----------
import { isApp, native } from "./android/platform";
type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;

export type ReadText = { lines: string[]; info: string };
export type Box = { x: number; y: number; width: number; height: number };

/** Card proportions (63 x 88 mm). */
export const CARD_RATIO = 63 / 88;

/** Where the card guide sits in a view of the given size: centered, filling most of the height. */
export function guideBox(viewWidth: number, viewHeight: number): Box {
  const height = Math.min(viewHeight * 0.84, (viewWidth * 0.86) / CARD_RATIO);
  const width = height * CARD_RATIO;
  return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
}

/** The guide in video pixels, for a video drawn with object-fit: cover into a view of the given size. */
export function guideInVideo(videoWidth: number, videoHeight: number, viewWidth: number, viewHeight: number): Box {
  const scale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight);
  const offsetX = (viewWidth - videoWidth * scale) / 2;
  const offsetY = (viewHeight - videoHeight * scale) / 2;
  const guide = guideBox(viewWidth, viewHeight);
  return { x: (guide.x - offsetX) / scale, y: (guide.y - offsetY) / scale, width: guide.width / scale, height: guide.height / scale };
}

// parts of the card, as fractions of the card: the title bar (with room for a card held a little high or low)
// and the info line at the bottom left with the collector number and set code
const NAME_PART = { x: 0.04, y: 0.015, width: 0.76, height: 0.125 };
const INFO_PART = { x: 0.02, y: 0.87, width: 0.55, height: 0.115 };
// overlapping narrow strips around the top and bottom, for a card held larger, smaller or off center
// (one large area with a lot of empty table in it hides the text from the reader)
const NAME_STRIPS = [-0.14, -0.06, 0.02, 0.1].map((y) => ({ x: -0.06, y, width: 1, height: 0.13 }));
const INFO_STRIPS = [0.8, 0.88, 0.96].map((y) => ({ x: -0.06, y, width: 0.75, height: 0.11 }));
// a card held well inside the outline: about this size, centered
const SMALL_CARD = 0.62;

/** Which areas a read uses: the card's own lines, wider areas around them, or those of a smaller card in the middle. */
export type ReadMode = "card" | "wide" | "small";

/** Copies part of the image into a canvas, enlarged, in gray with the contrast stretched. */
export function prepare(source: CanvasImageSource, card: Box, part: Box, outWidth: number, limit?: { width: number; height: number }): HTMLCanvasElement {
  let sx = card.x + part.x * card.width;
  let sy = card.y + part.y * card.height;
  let sw = part.width * card.width;
  let sh = part.height * card.height;
  if (limit) {
    // keep the area inside the picture
    const right = Math.min(limit.width, sx + sw);
    const bottom = Math.min(limit.height, sy + sh);
    sx = Math.max(0, sx);
    sy = Math.max(0, sy);
    sw = Math.max(1, right - sx);
    sh = Math.max(1, bottom - sy);
  }
  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = Math.max(1, Math.round((outWidth * sh) / sw));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const histogram = new Uint32Array(256);
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]!);
    data[index] = gray;
    histogram[gray]!++;
  }
  // stretch between the 2nd and 98th percentile so faint text on dark or light frames gets full contrast
  const pixels = data.length / 4;
  let low = 0;
  let high = 255;
  for (let total = 0; low < 255 && (total += histogram[low]!) < pixels * 0.02;) low++;
  for (let total = 0; high > 0 && (total += histogram[high]!) < pixels * 0.02;) high--;
  const span = Math.max(1, high - low);
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.max(0, Math.min(255, ((data[index]! - low) * 255) / span));
    data[index] = value;
    sum += value;
  }
  // light text on a dark title bar (borderless and showcase frames) is turned into dark text on light
  const invert = sum / pixels < 110;
  for (let index = 0; index < data.length; index += 4) {
    const value = invert ? 255 - data[index]! : data[index]!;
    data[index] = data[index + 1] = data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

declare global {
  interface Window {
    /** Browser tests replace text recognition with this function. */
    __manaVaultScanText?: () => ReadText | null | Promise<ReadText | null>;
  }
}

let worker: OcrWorker | null = null;
let loading: Promise<OcrWorker> | null = null;

/** Starts the text recognition engine once. Its files are served by Mana Vault itself (folder /ocr). */
export function loadRecognizer(): Promise<unknown> {
  // the Android app reads text with the phone's own text recognition, which needs no files
  if (window.__manaVaultScanText || isApp()) return Promise.resolve();
  if (worker) return Promise.resolve(worker);
  loading ??= (async () => {
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    const base = `${window.location.origin}/ocr`;
    const created = await createWorker("eng", OEM.LSTM_ONLY, { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base, gzip: true });
    await created.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    worker = created;
    return created;
  })().catch((reason: unknown) => {
    loading = null;
    throw reason;
  });
  return loading;
}

export async function stopRecognizer() {
  const current = worker;
  worker = null;
  loading = null;
  await current?.terminate();
}

const linesOf = (text: string) => text.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, " ")).filter((line) => line.length >= 3);

/** Reads the name and info lines from the card in the guide. */
export async function readCard(source: HTMLVideoElement, card: Box, mode: ReadMode = "card"): Promise<ReadText | null> {
  if (window.__manaVaultScanText) return window.__manaVaultScanText();
  if (isApp()) return readOnPhone(source, card, mode);
  if (!worker) await loadRecognizer();
  if (!worker) return null;
  const limit = { width: source.videoWidth, height: source.videoHeight };
  if (mode === "small") {
    card = {
      x: card.x + (card.width * (1 - SMALL_CARD)) / 2, y: card.y + (card.height * (1 - SMALL_CARD)) / 2,
      width: card.width * SMALL_CARD, height: card.height * SMALL_CARD,
    };
  }
  const read = async (parts: Box[]) => {
    let text = "";
    for (const part of parts) text += `${(await worker!.recognize(prepare(source, card, part, 1000, limit))).data.text}\n`;
    return text;
  };
  const name = await read(mode === "card" ? [NAME_PART] : NAME_STRIPS);
  const info = await read(mode === "card" ? [INFO_PART] : INFO_STRIPS);
  return { lines: linesOf(name).slice(0, 8), info: info.slice(0, 300) };
}

/**
 * The Android app: one picture of the card and a margin around it goes to the phone's text recognition,
 * and each line read is sorted into the name line or the info line by where it sits on the card.
 */
export async function readOnPhone(source: HTMLVideoElement, card: Box, mode: ReadMode = "card"): Promise<ReadText | null> {
  const margin = mode === "card" ? 0.08 : 0.2;
  const left = Math.max(0, card.x - card.width * margin);
  const top = Math.max(0, card.y - card.height * margin);
  const right = Math.min(source.videoWidth, card.x + card.width * (1 + margin));
  const bottom = Math.min(source.videoHeight, card.y + card.height * (1 + margin));
  if (right <= left || bottom <= top) return null;
  const scale = Math.min(1, 1280 / (right - left));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((right - left) * scale);
  canvas.height = Math.round((bottom - top) * scale);
  canvas.getContext("2d")?.drawImage(source, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL("image/jpeg", 0.85).replace(/^data:[^,]*,/, "");
  const { lines } = await native().recognize({ image });
  const target = mode === "small"
    ? { x: card.x + (card.width * (1 - SMALL_CARD)) / 2, y: card.y + (card.height * (1 - SMALL_CARD)) / 2, width: card.width * SMALL_CARD, height: card.height * SMALL_CARD }
    : card;
  return sortLines(lines.map((line) => ({
    text: line.text,
    x: (left + line.left / scale - target.x) / target.width,
    y: (top + (line.top + line.bottom) / 2 / scale - target.y) / target.height,
  })), mode);
}

/** Sorts lines (positions as fractions of the card) into the name line near the top and the info line at the bottom left. */
export function sortLines(lines: Array<{ text: string; x: number; y: number }>, mode: ReadMode = "card"): ReadText {
  const slack = mode === "card" ? 0 : 0.12;
  const ordered = [...lines].sort((a, b) => a.y - b.y);
  const name = ordered.filter((line) => line.y > -0.06 - slack && line.y < 0.16 + slack && line.x < 0.8).map((line) => line.text.trim().replace(/\s+/g, " "));
  const info = ordered.filter((line) => line.y > 0.84 - slack && line.y < 1.04 + slack && line.x < 0.65).map((line) => line.text).join("\n");
  return { lines: name.filter((line) => line.length >= 3).slice(0, 8), info: info.slice(0, 300) };
}
