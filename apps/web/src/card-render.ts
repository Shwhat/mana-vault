// ---------- the card maker's card pictures: Mana Vault's own frames drawn on a canvas ----------
// A card is drawn in a 745 x 1040 layout (the size of Scryfall's full pictures) and saved at twice that size.
import { RULES_FONT, TITLE_FONT } from "./card-fonts";

export type CardKind = "normal" | "creature" | "planeswalker" | "saga" | "token" | "split";
export const FRAME_COLORS = ["W", "U", "B", "R", "G"] as const;
export const HYBRID_FRAMES = ["WU", "WB", "UB", "UR", "BR", "BG", "RG", "RW", "GW", "GU"] as const;
export const FRAMES = ["auto", "W", "U", "B", "R", "G", ...HYBRID_FRAMES, "gold", "artifact", "colorless", "land", "vehicle"] as const;
export type Frame = (typeof FRAMES)[number];

/** Where the art sits in the art box: offsets as parts of the box size, and the zoom (1 fills the box). */
export type ArtPlace = { x: number; y: number; zoom: number };

/** How the frame is drawn: Classic, Borderless (art fills the card), Full art (art behind the type line and text),
 * Showcase (an ornate gold-trimmed frame) and Nickname (a nickname in the name bar, the card name under it). */
export const FRAME_STYLES = ["classic", "borderless", "fullart", "showcase", "nickname", "showcasenickname"] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];
export const FRAME_STYLE_NAMES: Record<FrameStyle, string> = {
  classic: "Classic", borderless: "Borderless", fullart: "Full art", showcase: "Showcase", nickname: "Nickname", showcasenickname: "Showcase Nickname",
};
/** Automatic, always or never: the legendary crown (from the type line) and the power and toughness box (creatures and vehicles). */
export type Auto = "auto" | "on" | "off";
/** The second half of a split card: its own name, cost, type, text and art (the art is the back art picture). */
export type SplitHalf = { name: string; manaCost: string; typeLine: string; rulesText: string; flavorText: string; art: ArtPlace };

export type FaceDesign = {
  kind: CardKind;
  frame: Frame;
  style: FrameStyle;
  /** The nickname shown in the name bar of the Nickname style. */
  nickname: string;
  legendary: boolean;
  name: string;
  manaCost: string;
  typeLine: string;
  rulesText: string;
  flavorText: string;
  power: string;
  toughness: string;
  loyalty: string;
  /** Sizes of the rules and flavor text in percent of the normal size. Long text shrinks further to fit. */
  textSize: number;
  flavorSize: number;
  art: ArtPlace;
  /** 0.17.0: the legendary crown and the power and toughness box, each Automatic, On or Off. */
  crown?: Auto;
  ptBox?: Auto;
  /** 0.17.0: the second half of a split card. */
  split?: SplitHalf;
};

export type CardInfo = { rarity: string; artist: string; setCode: string; collectorNumber: string; back: boolean; face: "front" | "back" };

export type Assets = {
  art: CanvasImageSource | null;
  /** The second half's art of a split card. */
  splitArt?: CanvasImageSource | null;
  setSymbol: CanvasImageSource | null;
  /** Colors a one-color set symbol (an SVG, or a PNG or WebP with a transparent background since 0.21.0) by the card's rarity, with a light outline (0.15.0). */
  setSymbolTint?: boolean;
  /** Draws a tinted common symbol in white with a dark outline (0.21.0). */
  commonWhite?: boolean;
  /** Mana symbol pictures by code without slashes (W, 2, WU, WP, T). A missing symbol is drawn as a colored circle. */
  symbols: Map<string, CanvasImageSource | null>;
};

export const WIDTH = 745;
export const HEIGHT = 1040;
export const SCALE = 2;

export const blankFace = (): FaceDesign => ({
  kind: "normal", frame: "auto", style: "classic", nickname: "", legendary: false, name: "", manaCost: "", typeLine: "", rulesText: "", flavorText: "",
  power: "", toughness: "", loyalty: "", textSize: 100, flavorSize: 100, art: { x: 0, y: 0, zoom: 1 }, crown: "auto", ptBox: "auto",
});
export const blankHalf = (): SplitHalf => ({ name: "", manaCost: "", typeLine: "", rulesText: "", flavorText: "", art: { x: 0, y: 0, zoom: 1 } });

/** Whether a face shows the legendary crown: Automatic follows the word Legendary in the type line. */
export const hasCrown = (face: FaceDesign) => (face.crown === "on" || (face.crown === "off" ? false : /\blegendary\b/i.test(face.typeLine) || (face.crown === undefined && face.legendary)));
/** Whether a face shows the power and toughness box: Automatic shows it for creatures and vehicles. */
export const hasPtBox = (face: FaceDesign) => (face.kind === "planeswalker" ? !!face.loyalty
  : face.ptBox === "on" ? true : face.ptBox === "off" ? false
  : /\b(creature|vehicle)\b/i.test(face.typeLine) || face.kind === "creature" || (!face.ptBox && !!(face.power || face.toughness)));

const FRAME_NAMES: Record<string, string> = {
  auto: "Automatic", W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", gold: "Multicolor (gold)", artifact: "Artifact", colorless: "Colorless", land: "Land",
  vehicle: "Vehicle",
};
const COLOR_WORDS: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
export const frameName = (frame: string) => FRAME_NAMES[frame] ?? `Hybrid ${COLOR_WORDS[frame[0]!]!.toLowerCase()} and ${COLOR_WORDS[frame[1]!]!.toLowerCase()}`;

type Palette = { base: string; dark: string; bar: string; box: string; text: string };
const PALETTES: Record<string, Palette> = {
  W: { base: "#e6dfc6", dark: "#a99a6e", bar: "#f6f1e1", box: "#fbf8ef", text: "#1d1a14" },
  U: { base: "#3f7fbf", dark: "#1d4c7d", bar: "#d9e7f5", box: "#eef4fa", text: "#0f1d2c" },
  B: { base: "#4c4448", dark: "#211c1f", bar: "#d8d2cf", box: "#ece8e6", text: "#141112" },
  R: { base: "#cf5a3a", dark: "#86291a", bar: "#f6ddd2", box: "#fbefe9", text: "#2a1009" },
  G: { base: "#3f8a55", dark: "#1d5230", bar: "#d9ecdc", box: "#eef6ef", text: "#0e2114" },
  gold: { base: "#d2ad55", dark: "#88661c", bar: "#f5ebcf", box: "#fbf6e8", text: "#271d07" },
  artifact: { base: "#b5bdc5", dark: "#6f7982", bar: "#e8ecef", box: "#f4f6f8", text: "#151a1f" },
  colorless: { base: "#d3cec7", dark: "#918a80", bar: "#efece8", box: "#f8f7f5", text: "#1b1916" },
  land: { base: "#ad8664", dark: "#674a33", bar: "#efe3d6", box: "#f8f2eb", text: "#21160d" },
  vehicle: { base: "#8a6748", dark: "#4a3220", bar: "#ecdccb", box: "#f7efe6", text: "#22150a" },
};
const SYMBOL_FILL: Record<string, string> = { W: "#f8f6d8", U: "#c1d7e9", B: "#bab1ab", R: "#e49977", G: "#a3c095", C: "#ccc2c0" };
const RARITY_COLOR: Record<string, string> = { common: "#1a1a1a", uncommon: "#9fb1c2", rare: "#c9a227", mythic: "#d5552b", special: "#8a5fb8" };
// rules and flavor text in the rules font; names, type lines, power and toughness in the title font (card-fonts.ts)
const SERIF = RULES_FONT;

/** The mana symbols in a text, in order: {W}{U/R}{2} gives W, U/R, 2. */
export const symbolsIn = (text: string) => [...text.matchAll(/\{([^}]{1,6})\}/g)].map((match) => match[1]!.toUpperCase());
/** The file name of a symbol: W/U becomes WU, 2/W becomes 2W. */
export const symbolFile = (code: string) => code.toUpperCase().replace(/\//g, "");

/** The frame a face gets: the one chosen, or (Automatic) one worked out from its mana cost and type. */
export function frameOf(face: FaceDesign): Exclude<Frame, "auto"> {
  if (face.frame !== "auto") return face.frame;
  if (/\bland\b/i.test(face.typeLine) && !face.manaCost) return "land";
  const symbols = symbolsIn(face.manaCost);
  const colors = FRAME_COLORS.filter((color) => symbols.some((symbol) => symbol.split("/").includes(color)));
  if (colors.length === 0) return /\bvehicle\b/i.test(face.typeLine) ? "vehicle" : /\bartifact\b/i.test(face.typeLine) ? "artifact" : "colorless";
  if (colors.length === 1) return colors[0]!;
  const colored = symbols.filter((symbol) => FRAME_COLORS.some((color) => symbol.split("/").includes(color)));
  if (colors.length === 2 && colored.every((symbol) => symbol.includes("/") && symbol.split("/").every((part) => FRAME_COLORS.includes(part as never)))) {
    const pair = HYBRID_FRAMES.find((item) => item.includes(colors[0]!) && item.includes(colors[1]!));
    if (pair) return pair;
  }
  return "gold";
}

/** Where the art sits on the card, as in the drawing: used to move the art by dragging in the card maker. */
export function artBoxOf(face: FaceDesign): { x: number; y: number; w: number; h: number } {
  if (face.kind === "split") return splitArtBoxes()[0]!;
  if (face.style === "borderless") return { x: 0, y: 0, w: WIDTH, h: HEIGHT - 44 };
  if (face.style === "fullart") return { x: 40, y: 40, w: WIDTH - 80, h: HEIGHT - 124 };
  if (face.kind === "saga") return { x: WIDTH / 2 + 4, y: 126, w: WIDTH / 2 - 62, h: HEIGHT - 70 - 64 - 8 - 126 };
  return { x: 58, y: 126, w: WIDTH - 116, h: face.kind === "token" ? 520 : 438 };
}

/** The art boxes of the two halves of a split card. */
export function splitArtBoxes(): Array<{ x: number; y: number; w: number; h: number }> {
  const top = 26;
  const height = (HEIGHT - 44 - top - 10) / 2;
  return [top, top + height + 10].map((start) => ({ x: 56, y: start + 14 + 46 + 6, w: WIDTH - 112, h: height * 0.36 }));
}

/** A bar outline with cut corners, used by the Showcase style. */
function chamfered(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const c = Math.min(r, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

const GOLD = "#d9b860";

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fills a shape with a frame color; a hybrid frame shades from its first color on the left to its second on the right. */
function frameFill(ctx: CanvasRenderingContext2D, frame: string, key: keyof Palette, x: number, w: number): string | CanvasGradient {
  if (frame.length === 2 && PALETTES[frame[0]!] && PALETTES[frame[1]!]) {
    const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
    gradient.addColorStop(0.42, PALETTES[frame[0]!]![key]);
    gradient.addColorStop(0.58, PALETTES[frame[1]!]![key]);
    return gradient;
  }
  return PALETTES[frame]![key];
}
const paletteOf = (frame: string): Palette => (PALETTES[frame] ?? PALETTES[frame[0]!] ?? PALETTES.colorless!);

/** Draws one mana symbol: its picture, or a colored circle with its letters when the picture is missing. */
function drawSymbol(ctx: CanvasRenderingContext2D, code: string, x: number, y: number, size: number, assets: Assets) {
  const picture = assets.symbols.get(symbolFile(code));
  if (picture) {
    ctx.drawImage(picture, x, y, size, size);
    return;
  }
  const parts = code.split("/");
  const fill = SYMBOL_FILL[parts.find((part) => SYMBOL_FILL[part]) ?? "C"]!;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.stroke();
  ctx.fillStyle = "#151515";
  const label = code === "T" ? "↷" : code === "Q" ? "↶" : parts.join("");
  ctx.font = `700 ${size * (label.length > 2 ? 0.42 : label.length > 1 ? 0.52 : 0.66)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + size / 2, y + size / 2 + size * 0.04);
  ctx.restore();
}

// ---------- rules text layout: words and mana symbols, reminder text in italics, shrinking to fit ----------
type Run = { text: string; symbol: boolean; italic: boolean; width: number };
type Line = { runs: Run[]; width: number };
type Block = { lines: Line[]; badge: string | null; gapBefore: number };

function words(text: string, italicStart: boolean): Array<{ text: string; symbol: boolean; italic: boolean; space: boolean }> {
  const result: Array<{ text: string; symbol: boolean; italic: boolean; space: boolean }> = [];
  let italic = italicStart;
  for (const part of text.split(/(\{[^}]{1,6}\}|\s+|\(|\))/)) {
    if (!part) continue;
    if (part === "(") italic = true;
    if (/^\s+$/.test(part)) result.push({ text: " ", symbol: false, italic, space: true });
    else if (/^\{[^}]+\}$/.test(part)) result.push({ text: part.slice(1, -1).toUpperCase(), symbol: true, italic, space: false });
    else result.push({ text: part, symbol: false, italic, space: false });
    if (part === ")") italic = false;
  }
  return result;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, size: number, italicAll: boolean): Line[] {
  const lines: Line[] = [];
  let current: Line = { runs: [], width: 0 };
  let pendingSpace = 0;
  const font = (italic: boolean) => `${italic ? "italic " : ""}400 ${size}px ${SERIF}`;
  for (const piece of words(text, italicAll)) {
    if (piece.space) {
      ctx.font = font(piece.italic);
      pendingSpace = current.runs.length ? ctx.measureText(" ").width : 0;
      continue;
    }
    ctx.font = font(piece.italic);
    const pieceWidth = piece.symbol ? size * 0.92 : ctx.measureText(piece.text).width;
    if (current.runs.length && current.width + pendingSpace + pieceWidth > width) {
      lines.push(current);
      current = { runs: [], width: 0 };
      pendingSpace = 0;
    }
    if (pendingSpace) current.runs.push({ text: " ", symbol: false, italic: piece.italic, width: pendingSpace });
    current.runs.push({ text: piece.text, symbol: piece.symbol, italic: piece.italic, width: pieceWidth });
    current.width += pendingSpace + pieceWidth;
    pendingSpace = 0;
  }
  if (current.runs.length || !lines.length) lines.push(current);
  return lines;
}

const ABILITY = /^\s*([+−-]?(?:\d+|X)):\s*(.*)$/;
const CHAPTER = /^\s*((?:[IVX]+)(?:\s*,\s*[IVX]+)*):\s*(.*)$/;

/** Splits rules text into blocks: one per paragraph, with a loyalty cost or chapter badge where the face has them. */
function blocks(ctx: CanvasRenderingContext2D, face: FaceDesign, width: number, size: number): Block[] {
  const result: Block[] = [];
  for (const paragraph of face.rulesText.split(/\n/).map((line) => line.trim()).filter(Boolean)) {
    let badge: string | null = null;
    let text = paragraph;
    const ability = face.kind === "planeswalker" ? ABILITY.exec(paragraph) : null;
    const chapter = face.kind === "saga" ? CHAPTER.exec(paragraph) : null;
    if (ability) {
      badge = ability[1]!.replace("-", "−");
      text = ability[2]!;
    } else if (chapter) {
      badge = chapter[1]!.replace(/\s+/g, "");
      text = chapter[2]!;
    }
    const indent = badge ? size * 2.6 : 0;
    result.push({ lines: wrap(ctx, text, width - indent, size, false), badge, gapBefore: result.length ? size * 0.42 : 0 });
  }
  return result;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], x: number, y: number, size: number, color: string, assets: Assets): number {
  const lineHeight = size * 1.22;
  for (const line of lines) {
    let left = x;
    for (const run of line.runs) {
      if (run.symbol) drawSymbol(ctx, run.text, left + size * 0.04, y + size * 0.12, size * 0.86, assets);
      else {
        ctx.font = `${run.italic ? "italic " : ""}400 ${size}px ${SERIF}`;
        ctx.fillStyle = color;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText(run.text, left, y + size * 0.1);
      }
      left += run.width;
    }
    y += lineHeight;
  }
  return y;
}

/** Fits a single line of text into a width by shrinking it, and draws it. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight: number, color: string, align: CanvasTextAlign = "left") {
  let fontSize = size;
  ctx.font = `${weight} ${fontSize}px ${weight >= 600 ? TITLE_FONT : SERIF}`;
  while (fontSize > size * 0.5 && ctx.measureText(text).width > width) {
    fontSize -= 1;
    ctx.font = `${weight} ${fontSize}px ${weight >= 600 ? TITLE_FONT : SERIF}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

/** The text box: rules text and flavor text, shrunk until they fit. */
function drawTextBox(ctx: CanvasRenderingContext2D, face: FaceDesign, box: { x: number; y: number; w: number; h: number }, palette: Palette, assets: Assets) {
  const pad = 22;
  const width = box.w - pad * 2;
  let size = 30 * (face.textSize / 100);
  let flavorSize = 28 * (face.flavorSize / 100);
  let laid: Block[] = [];
  let flavor: Line[] = [];
  const measure = () => {
    laid = blocks(ctx, face, width, size);
    flavor = face.flavorText.trim() ? wrap(ctx, face.flavorText.trim(), width, flavorSize, true) : [];
    const rules = laid.reduce((sum, block) => sum + block.gapBefore + Math.max(block.lines.length * size * 1.22, block.badge ? size * 1.6 : 0), 0);
    const flavorHeight = flavor.length ? flavor.length * flavorSize * 1.22 + (laid.length ? size * 0.9 : 0) : 0;
    return rules + flavorHeight;
  };
  let total = measure();
  while (total > box.h - pad * 2 && size > 12) {
    size *= 0.94;
    flavorSize *= 0.94;
    total = measure();
  }
  // short text sits in the middle of the box, as on printed cards
  let y = box.y + Math.max(pad, (box.h - total) / 2);
  for (const block of laid) {
    y += block.gapBefore;
    const top = y;
    const indent = block.badge ? size * 2.6 : 0;
    if (block.badge) {
      const badgeWidth = size * 2.1;
      const badgeHeight = size * 1.35;
      ctx.save();
      ctx.fillStyle = face.kind === "saga" ? palette.dark : "#1f1f1f";
      if (face.kind === "saga") {
        rounded(ctx, box.x + pad - 4, top, badgeWidth, badgeHeight, 6);
      } else {
        // a loyalty cost in a small shield
        ctx.beginPath();
        ctx.moveTo(box.x + pad - 4, top);
        ctx.lineTo(box.x + pad - 4 + badgeWidth, top);
        ctx.lineTo(box.x + pad - 4 + badgeWidth, top + badgeHeight * 0.7);
        ctx.lineTo(box.x + pad - 4 + badgeWidth / 2, top + badgeHeight);
        ctx.lineTo(box.x + pad - 4, top + badgeHeight * 0.7);
        ctx.closePath();
      }
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${size * 0.82}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(block.badge, box.x + pad - 4 + badgeWidth / 2, top + badgeHeight * 0.46);
      ctx.restore();
    }
    y = drawLines(ctx, block.lines, box.x + pad + indent, y, size, palette.text, assets);
    if (block.badge) y = Math.max(y, top + size * 1.6);
  }
  if (flavor.length) {
    if (laid.length) {
      y += size * 0.35;
      ctx.strokeStyle = "rgba(0,0,0,.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(box.x + pad + width * 0.1, y);
      ctx.lineTo(box.x + pad + width * 0.9, y);
      ctx.stroke();
      y += size * 0.55;
    }
    drawLines(ctx, flavor, box.x + pad, y, flavorSize, palette.text, assets);
  }
}

/** Draws a whole card face. The canvas is 1490 x 2080 (two times 745 x 1040). */
export function renderCard(canvas: HTMLCanvasElement, face: FaceDesign, info: CardInfo, assets: Assets): void {
  canvas.width = WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const frame = frameOf(face);
  const palette = paletteOf(frame);
  const token = face.kind === "token";
  const style: FrameStyle = FRAME_STYLES.includes(face.style) ? face.style : "classic";
  // Borderless and Full art draw the art first and the bars over it, a little see-through
  const overArt = style === "borderless" || style === "fullart";
  const showcase = style === "showcase" || style === "showcasenickname";
  if (face.kind === "split") { renderSplit(ctx, face, info, assets, showcase); return; }
  const saga = face.kind === "saga";
  const shape = showcase ? chamfered : rounded;
  const veil = overArt ? 0.86 : 1;
  const drawArt = (box: { x: number; y: number; w: number; h: number }) => {
    ctx.save();
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    if (assets.art) {
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      const source = assets.art as { width: number; height: number };
      const cover = Math.max(box.w / source.width, box.h / source.height) * Math.max(0.2, face.art.zoom);
      const drawWidth = source.width * cover;
      const drawHeight = source.height * cover;
      const left = box.x + (box.w - drawWidth) / 2 + face.art.x * box.w;
      const top = box.y + (box.h - drawHeight) / 2 + face.art.y * box.h;
      ctx.drawImage(assets.art, left, top, drawWidth, drawHeight);
    } else {
      ctx.fillStyle = "#8a8f96";
      ctx.font = `400 26px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Art", box.x + box.w / 2, box.y + (overArt ? 330 : box.h / 2));
    }
    ctx.restore();
    if (!overArt) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = showcase ? GOLD : frameFill(ctx, frame, "dark", box.x, box.w);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
  };
  /** A name, type or power bar: filled with the frame's bar color and outlined, gold-trimmed for Showcase. */
  const bar = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.save();
    ctx.globalAlpha = veil;
    shape(ctx, x, y, w, h, r);
    ctx.fillStyle = frameFill(ctx, frame, "bar", x, w);
    ctx.fill();
    ctx.restore();
    shape(ctx, x, y, w, h, r);
    ctx.lineWidth = showcase ? 3.5 : 2.5;
    ctx.strokeStyle = showcase ? GOLD : frameFill(ctx, frame, "dark", x, w);
    ctx.stroke();
  };

  // the black border and the colored frame (Borderless has no frame: the art reaches the edges)
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (style !== "borderless") {
    rounded(ctx, 26, 26, WIDTH - 52, HEIGHT - 70, 18);
    ctx.fillStyle = frameFill(ctx, frame, "base", 26, WIDTH - 52);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = frameFill(ctx, frame, "dark", 26, WIDTH - 52);
    ctx.stroke();
  }
  if (overArt) {
    const box = style === "borderless" ? { x: 0, y: 0, w: WIDTH, h: HEIGHT - 44 } : { x: 40, y: 40, w: WIDTH - 80, h: HEIGHT - 124 };
    drawArt(box);
  }
  // Showcase: a gold double line inside the frame with a diamond at each corner
  if (showcase) {
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    rounded(ctx, 34, 34, WIDTH - 68, HEIGHT - 86, 14);
    ctx.stroke();
    ctx.lineWidth = 1;
    rounded(ctx, 39, 39, WIDTH - 78, HEIGHT - 96, 11);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    for (const [x, y] of [[34, 34], [WIDTH - 34, 34], [34, HEIGHT - 52], [WIDTH - 34, HEIGHT - 52]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y - 9); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 9, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // the legendary crown over the name bar
  if (hasCrown(face)) drawCrown(ctx, frame, showcase);

  // name bar with the mana cost
  const nameBar = { x: 44, y: 56, w: WIDTH - 88, h: 62 };
  bar(nameBar.x, nameBar.y, nameBar.w, nameBar.h, 14);
  const costSymbols = symbolsIn(face.manaCost);
  const symbolSize = 38;
  const costWidth = costSymbols.length * (symbolSize + 3);
  costSymbols.forEach((code, index) => drawSymbol(ctx, code, nameBar.x + nameBar.w - 16 - costWidth + index * (symbolSize + 3), nameBar.y + 12, symbolSize, assets));
  let nameLeft = nameBar.x + 20;
  if (info.back) {
    // two-faced cards show which face this is
    ctx.save();
    ctx.beginPath();
    ctx.arc(nameBar.x + 34, nameBar.y + nameBar.h / 2, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#1f1f1f";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const cx = nameBar.x + 34;
    const cy = nameBar.y + nameBar.h / 2;
    if (info.face === "front") { ctx.moveTo(cx - 9, cy + 6); ctx.lineTo(cx + 9, cy + 6); ctx.lineTo(cx, cy - 9); }
    else { ctx.moveTo(cx - 9, cy - 6); ctx.lineTo(cx + 9, cy - 6); ctx.lineTo(cx, cy + 9); }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    nameLeft += 36;
  }
  const nameWidth = nameBar.w - 40 - costWidth - (nameLeft - nameBar.x - 20);
  // the Nickname style puts the nickname in the name bar and the card name in a small bar under it
  const nickname = (style === "nickname" || style === "showcasenickname") && face.nickname.trim() ? face.nickname.trim() : "";
  const shownName = nickname || face.name || "Card name";
  if (token) fitText(ctx, shownName, WIDTH / 2, nameBar.y + nameBar.h / 2 + 2, nameWidth, 36, 700, palette.text, "center");
  else fitText(ctx, shownName, nameLeft, nameBar.y + nameBar.h / 2 + 2, nameWidth, 36, 700, palette.text);

  // the art: in its box (Classic, Showcase, Nickname), behind the type line and text (Full art), or over the whole card (Borderless)
  // a saga has its art down the right side and its chapters on the left, with the type line at the bottom
  const sagaType = { x: 44, y: HEIGHT - 70 - 64, w: WIDTH - 88, h: 56 };
  const artBox = style === "borderless" ? { x: 0, y: 0, w: WIDTH, h: HEIGHT - 44 }
    : style === "fullart" ? { x: 40, y: 40, w: WIDTH - 80, h: HEIGHT - 124 }
    : saga ? { x: WIDTH / 2 + 4, y: 126, w: WIDTH / 2 - 62, h: sagaType.y - 8 - 126 }
    : { x: 58, y: 126, w: WIDTH - 116, h: token ? 520 : 438 };
  if (!overArt) drawArt(artBox);
  if (nickname) {
    const sub = { x: 110, y: artBox.y + 8, w: WIDTH - 220, h: 42 };
    bar(sub.x, sub.y, sub.w, sub.h, 12);
    fitText(ctx, face.name || "Card name", WIDTH / 2, sub.y + sub.h / 2 + 1, sub.w - 24, 28, 600, palette.text, "center");
  }

  // type bar with the set symbol
  const typeBar = saga ? sagaType : { x: 44, y: (overArt ? 126 + (token ? 520 : 438) : artBox.y + artBox.h) + 8, w: WIDTH - 88, h: 56 };
  bar(typeBar.x, typeBar.y, typeBar.w, typeBar.h, 12);
  fitText(ctx, face.typeLine || "Type", typeBar.x + 20, typeBar.y + typeBar.h / 2 + 1, typeBar.w - 90, 30, 700, palette.text);
  const symbolBox = { x: typeBar.x + typeBar.w - 58, y: typeBar.y + 8, s: 40 };
  if (assets.setSymbol) {
    const picture = assets.setSymbolTint && hasTransparency(assets.setSymbol) ? tintedSymbol(assets.setSymbol, info.rarity, symbolBox.s, !!assets.commonWhite) : assets.setSymbol;
    ctx.drawImage(picture, symbolBox.x, symbolBox.y, symbolBox.s, symbolBox.s);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(symbolBox.x + symbolBox.s / 2, symbolBox.y + symbolBox.s / 2, symbolBox.s / 2.2, 0, Math.PI * 2);
    ctx.fillStyle = RARITY_COLOR[info.rarity] ?? RARITY_COLOR.common!;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111111";
    ctx.stroke();
    ctx.fillStyle = info.rarity === "common" ? "#ffffff" : "#111111";
    ctx.font = `700 15px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.setCode.toUpperCase().slice(0, 3), symbolBox.x + symbolBox.s / 2, symbolBox.y + symbolBox.s / 2 + 1);
    ctx.restore();
  }

  // text box
  const textBox = saga ? { x: 58, y: 126, w: WIDTH / 2 - 66, h: typeBar.y - 8 - 126 }
    : { x: 58, y: typeBar.y + typeBar.h + 8, w: WIDTH - 116, h: HEIGHT - 70 - (typeBar.y + typeBar.h + 8) - 20 };
  ctx.save();
  ctx.globalAlpha = veil;
  ctx.fillStyle = frameFill(ctx, frame, "box", textBox.x, textBox.w);
  ctx.fillRect(textBox.x, textBox.y, textBox.w, textBox.h);
  ctx.restore();
  ctx.lineWidth = showcase ? 3 : 2.5;
  ctx.strokeStyle = showcase ? GOLD : frameFill(ctx, frame, "dark", textBox.x, textBox.w);
  ctx.strokeRect(textBox.x, textBox.y, textBox.w, textBox.h);
  const statBox = !saga && hasPtBox(face);
  drawTextBox(ctx, face, { ...textBox, h: textBox.h - (statBox ? 26 : 0) }, palette, assets);

  // power and toughness, or loyalty
  if (statBox) {
    const box = { w: 132, h: 60, x: WIDTH - 44 - 132, y: textBox.y + textBox.h - 36 };
    ctx.save();
    if (face.kind === "planeswalker") {
      ctx.beginPath();
      const x = box.x + 30;
      ctx.moveTo(x, box.y);
      ctx.lineTo(x + 84, box.y);
      ctx.lineTo(x + 84, box.y + 44);
      ctx.lineTo(x + 42, box.y + 66);
      ctx.lineTo(x, box.y + 44);
      ctx.closePath();
      ctx.fillStyle = "#1f1f1f";
      ctx.fill();
      ctx.strokeStyle = "#d9b860";
      ctx.lineWidth = 2;
      ctx.stroke();
      fitText(ctx, face.loyalty, x + 42, box.y + 27, 70, 36, 700, "#ffffff", "center");
    } else if (frame === "vehicle") {
      // a vehicle's box is dark brown with light numbers
      rounded(ctx, box.x, box.y, box.w, box.h, 12);
      ctx.fillStyle = PALETTES.vehicle!.dark;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = showcase ? GOLD : "#2b1c10";
      ctx.stroke();
      fitText(ctx, `${face.power}/${face.toughness}`, box.x + box.w / 2, box.y + box.h / 2 + 2, box.w - 16, 38, 700, "#f6efe6", "center");
    } else {
      bar(box.x, box.y, box.w, box.h, 12);
      fitText(ctx, `${face.power}/${face.toughness}`, box.x + box.w / 2, box.y + box.h / 2 + 2, box.w - 16, 38, 700, palette.text, "center");
    }
    ctx.restore();
  }

  infoLine(ctx, info);
}

/** The information line: number, rarity, set and artist. */
function infoLine(ctx: CanvasRenderingContext2D, info: CardInfo) {
  const rarityLetter = (info.rarity[0] ?? "c").toUpperCase();
  ctx.fillStyle = "#e8e8e8";
  ctx.font = `400 17px ${SERIF}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`${info.collectorNumber || "1"} ${rarityLetter}   ${info.setCode.toUpperCase()}`, 50, HEIGHT - 28);
  if (info.artist) ctx.fillText(`Illus. ${info.artist}`, 210, HEIGHT - 28);
  ctx.textAlign = "right";
  ctx.fillText("Mana Vault custom card", WIDTH - 50, HEIGHT - 28);
}

/** The legendary crown: a band over the name bar with five points, in the frame's colors (gold-trimmed always). */
function drawCrown(ctx: CanvasRenderingContext2D, frame: string, showcase: boolean) {
  ctx.save();
  const left = 70;
  const right = WIDTH - 70;
  ctx.beginPath();
  ctx.moveTo(left, 62);
  // five points rising to the middle one
  const points = 5;
  for (let index = 0; index <= points * 2; index += 1) {
    const x = left + ((right - left) * index) / (points * 2);
    const middle = 1 - Math.abs(index - points) / points;
    const y = index % 2 === 1 ? 20 - middle * 12 : 44 - middle * 8;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(right, 62);
  ctx.closePath();
  ctx.fillStyle = frameFill(ctx, frame, "dark", left, right - left);
  ctx.fill();
  ctx.lineWidth = showcase ? 3 : 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  // a jewel at each point
  ctx.fillStyle = GOLD;
  for (let index = 1; index < points * 2; index += 2) {
    const x = left + ((right - left) * index) / (points * 2);
    const middle = 1 - Math.abs(index - points) / points;
    ctx.beginPath();
    ctx.arc(x, 20 - middle * 12 + 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A split card: two halves, one above the other, each with its own name and cost, art, type line and text. The first
 * half is the face itself; the second half is face.split, with its art from the back art picture.
 */
function renderSplit(ctx: CanvasRenderingContext2D, face: FaceDesign, info: CardInfo, assets: Assets, showcase: boolean) {
  const half = face.split ?? blankHalf();
  const shape = showcase ? chamfered : rounded;
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const area = { top: 26, bottom: HEIGHT - 44 };
  const height = (area.bottom - area.top - 10) / 2;
  const halves: Array<{ part: { name: string; manaCost: string; typeLine: string; rulesText: string; flavorText: string; art: ArtPlace }; art: CanvasImageSource | null; top: number }> = [
    { part: face, art: assets.art, top: area.top },
    { part: half, art: assets.splitArt ?? null, top: area.top + height + 10 },
  ];
  for (const { part, art, top } of halves) {
    const partFace: FaceDesign = { ...face, ...part, kind: "normal", split: undefined };
    const partFrame = frameOf(partFace);
    const partPalette = paletteOf(partFrame);
    rounded(ctx, 26, top, WIDTH - 52, height, 16);
    ctx.fillStyle = frameFill(ctx, partFrame, "base", 26, WIDTH - 52);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = showcase ? GOLD : frameFill(ctx, partFrame, "dark", 26, WIDTH - 52);
    ctx.stroke();
    const bar = (x: number, y: number, w: number, h: number) => {
      shape(ctx, x, y, w, h, 10);
      ctx.fillStyle = frameFill(ctx, partFrame, "bar", x, w);
      ctx.fill();
      ctx.lineWidth = showcase ? 3 : 2;
      ctx.strokeStyle = showcase ? GOLD : frameFill(ctx, partFrame, "dark", x, w);
      ctx.stroke();
    };
    const name = { x: 42, y: top + 14, w: WIDTH - 84, h: 46 };
    bar(name.x, name.y, name.w, name.h);
    const cost = symbolsIn(part.manaCost);
    const size = 30;
    const costWidth = cost.length * (size + 3);
    cost.forEach((code, index) => drawSymbol(ctx, code, name.x + name.w - 12 - costWidth + index * (size + 3), name.y + 8, size, assets));
    fitText(ctx, part.name || "Card name", name.x + 16, name.y + name.h / 2 + 1, name.w - 40 - costWidth, 28, 700, partPalette.text);
    const artBox = { x: 56, y: name.y + name.h + 6, w: WIDTH - 112, h: height * 0.36 };
    ctx.save();
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(artBox.x, artBox.y, artBox.w, artBox.h);
    if (art) {
      ctx.beginPath();
      ctx.rect(artBox.x, artBox.y, artBox.w, artBox.h);
      ctx.clip();
      const source = art as { width: number; height: number };
      const cover = Math.max(artBox.w / source.width, artBox.h / source.height) * Math.max(0.2, part.art.zoom);
      ctx.drawImage(art, artBox.x + (artBox.w - source.width * cover) / 2 + part.art.x * artBox.w, artBox.y + (artBox.h - source.height * cover) / 2 + part.art.y * artBox.h,
        source.width * cover, source.height * cover);
    } else {
      ctx.fillStyle = "#8a8f96";
      ctx.font = `400 22px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Art", artBox.x + artBox.w / 2, artBox.y + artBox.h / 2);
    }
    ctx.restore();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = showcase ? GOLD : frameFill(ctx, partFrame, "dark", artBox.x, artBox.w);
    ctx.strokeRect(artBox.x, artBox.y, artBox.w, artBox.h);
    const type = { x: 42, y: artBox.y + artBox.h + 6, w: WIDTH - 84, h: 40 };
    bar(type.x, type.y, type.w, type.h);
    fitText(ctx, part.typeLine || "Type", type.x + 16, type.y + type.h / 2 + 1, type.w - 32, 24, 700, partPalette.text);
    const text = { x: 56, y: type.y + type.h + 6, w: WIDTH - 112, h: top + height - 12 - (type.y + type.h + 6) };
    ctx.fillStyle = frameFill(ctx, partFrame, "box", text.x, text.w);
    ctx.fillRect(text.x, text.y, text.w, text.h);
    ctx.strokeStyle = showcase ? GOLD : frameFill(ctx, partFrame, "dark", text.x, text.w);
    ctx.strokeRect(text.x, text.y, text.w, text.h);
    drawTextBox(ctx, { ...partFace, textSize: face.textSize * 0.8, flavorSize: face.flavorSize * 0.8 }, text, partPalette, assets);
  }
  infoLine(ctx, info);
}

/** Loads a picture from a blob or address into an image element. Resolves null when it cannot be read. */
export function loadPicture(source: Blob | string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** The colors of a set symbol by rarity, from edge to middle to edge. */
const RARITY_TINT: Record<string, string[]> = {
  common: ["#111111", "#111111"], uncommon: ["#5f717a", "#dbe7ee", "#5f717a"], rare: ["#8a6d1d", "#f4d58d", "#8a6d1d"],
  mythic: ["#b4361b", "#f6a03a", "#b4361b"], special: ["#5b2a86", "#c59be6", "#5b2a86"], bonus: ["#5b2a86", "#c59be6", "#5b2a86"],
};

const transparent = new WeakMap<object, boolean>();
/**
 * Whether a picture has transparent pixels, so its shape can be filled with a rarity's colors (0.21.0). An SVG always
 * can; a JPEG, or a PNG or WebP with no transparent pixels, keeps its own colors.
 */
export function hasTransparency(picture: CanvasImageSource): boolean {
  const known = transparent.get(picture as object);
  if (known !== undefined) return known;
  let result = true;
  try {
    const source = picture as HTMLImageElement;
    if (!(typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement && /\.svg|svg\+xml/i.test(source.src))) {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.clearRect(0, 0, 48, 48);
      context.drawImage(picture, 0, 0, 48, 48);
      const pixels = context.getImageData(0, 0, 48, 48).data;
      result = false;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index]! < 250) { result = true; break; }
      }
    }
  } catch {
    result = true;
  }
  transparent.set(picture as object, result);
  return result;
}

/** A set symbol filled with its rarity's colors and outlined in white, the way printed cards show it. A white common symbol gets a dark outline (0.21.0). */
export function tintedSymbol(symbol: CanvasImageSource, rarity: string, size: number, commonWhite = false): HTMLCanvasElement {
  const scale = 4;
  const s = size * scale;
  const pad = 2 * scale;
  const shape = document.createElement("canvas");
  shape.width = s;
  shape.height = s;
  const sctx = shape.getContext("2d")!;
  sctx.drawImage(symbol, pad, pad, s - pad * 2, s - pad * 2);
  // the light outline: the shape in white, drawn around itself
  const outline = document.createElement("canvas");
  outline.width = s;
  outline.height = s;
  const octx = outline.getContext("2d")!;
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) octx.drawImage(shape, Math.cos(angle) * pad * 0.7, Math.sin(angle) * pad * 0.7);
  const white = commonWhite && (rarity === "common" || !RARITY_TINT[rarity]);
  octx.globalCompositeOperation = "source-in";
  octx.fillStyle = white ? "#111111" : "#ffffff";
  octx.fillRect(0, 0, s, s);
  // the shape filled with the rarity's colors
  sctx.globalCompositeOperation = "source-in";
  const stops = white ? ["#ffffff", "#ffffff"] : RARITY_TINT[rarity] ?? RARITY_TINT.common!;
  const gradient = sctx.createLinearGradient(0, s, s, 0);
  stops.forEach((color, index) => gradient.addColorStop(stops.length === 1 ? 0 : index / (stops.length - 1), color));
  sctx.fillStyle = gradient;
  sctx.fillRect(0, 0, s, s);
  // the shape keeps a dark edge so light colors stay visible on the white outline
  octx.globalCompositeOperation = "source-over";
  octx.drawImage(shape, 0, 0);
  return outline;
}
