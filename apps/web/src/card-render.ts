// ---------- the card maker's card pictures: Mana Vault's own frames drawn on a canvas ----------
// A card is drawn in a 745 x 1040 layout (the size of Scryfall's full pictures) and saved at twice that size.

export type CardKind = "normal" | "creature" | "planeswalker" | "saga" | "token";
export const FRAME_COLORS = ["W", "U", "B", "R", "G"] as const;
export const HYBRID_FRAMES = ["WU", "WB", "UB", "UR", "BR", "BG", "RG", "RW", "GW", "GU"] as const;
export const FRAMES = ["auto", "W", "U", "B", "R", "G", ...HYBRID_FRAMES, "gold", "artifact", "colorless", "land"] as const;
export type Frame = (typeof FRAMES)[number];

/** Where the art sits in the art box: offsets as parts of the box size, and the zoom (1 fills the box). */
export type ArtPlace = { x: number; y: number; zoom: number };

export type FaceDesign = {
  kind: CardKind;
  frame: Frame;
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
};

export type CardInfo = { rarity: string; artist: string; setCode: string; collectorNumber: string; back: boolean; face: "front" | "back" };

export type Assets = {
  art: CanvasImageSource | null;
  setSymbol: CanvasImageSource | null;
  /** Mana symbol pictures by code without slashes (W, 2, WU, WP, T). A missing symbol is drawn as a colored circle. */
  symbols: Map<string, CanvasImageSource | null>;
};

export const WIDTH = 745;
export const HEIGHT = 1040;
export const SCALE = 2;

export const blankFace = (): FaceDesign => ({
  kind: "normal", frame: "auto", legendary: false, name: "", manaCost: "", typeLine: "", rulesText: "", flavorText: "",
  power: "", toughness: "", loyalty: "", textSize: 100, flavorSize: 100, art: { x: 0, y: 0, zoom: 1 },
});

const FRAME_NAMES: Record<string, string> = {
  auto: "Automatic", W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", gold: "Multicolor (gold)", artifact: "Artifact", colorless: "Colorless", land: "Land",
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
};
const SYMBOL_FILL: Record<string, string> = { W: "#f8f6d8", U: "#c1d7e9", B: "#bab1ab", R: "#e49977", G: "#a3c095", C: "#ccc2c0" };
const RARITY_COLOR: Record<string, string> = { common: "#1a1a1a", uncommon: "#9fb1c2", rare: "#c9a227", mythic: "#d5552b", special: "#8a5fb8" };
const SERIF = "Georgia, 'Times New Roman', serif";

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
  if (colors.length === 0) return /\bartifact\b/i.test(face.typeLine) ? "artifact" : "colorless";
  if (colors.length === 1) return colors[0]!;
  const colored = symbols.filter((symbol) => FRAME_COLORS.some((color) => symbol.split("/").includes(color)));
  if (colors.length === 2 && colored.every((symbol) => symbol.includes("/") && symbol.split("/").every((part) => FRAME_COLORS.includes(part as never)))) {
    const pair = HYBRID_FRAMES.find((item) => item.includes(colors[0]!) && item.includes(colors[1]!));
    if (pair) return pair;
  }
  return "gold";
}

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
  ctx.font = `${weight} ${fontSize}px ${SERIF}`;
  while (fontSize > size * 0.5 && ctx.measureText(text).width > width) {
    fontSize -= 1;
    ctx.font = `${weight} ${fontSize}px ${SERIF}`;
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

  // the black border and the colored frame
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  rounded(ctx, 26, 26, WIDTH - 52, HEIGHT - 70, 18);
  ctx.fillStyle = frameFill(ctx, frame, "base", 26, WIDTH - 52);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = frameFill(ctx, frame, "dark", 26, WIDTH - 52);
  ctx.stroke();

  // a legendary crest over the name bar
  if (face.legendary) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(46, 60);
    ctx.quadraticCurveTo(WIDTH / 2, 8, WIDTH - 46, 60);
    ctx.lineTo(WIDTH - 46, 78);
    ctx.quadraticCurveTo(WIDTH / 2, 30, 46, 78);
    ctx.closePath();
    ctx.fillStyle = frameFill(ctx, frame, "dark", 46, WIDTH - 92);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#d9b860";
    ctx.stroke();
    ctx.restore();
  }

  // name bar with the mana cost
  const nameBar = { x: 44, y: 56, w: WIDTH - 88, h: 62 };
  rounded(ctx, nameBar.x, nameBar.y, nameBar.w, nameBar.h, 14);
  ctx.fillStyle = frameFill(ctx, frame, "bar", nameBar.x, nameBar.w);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = frameFill(ctx, frame, "dark", nameBar.x, nameBar.w);
  ctx.stroke();
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
  if (token) fitText(ctx, face.name || "Card name", WIDTH / 2, nameBar.y + nameBar.h / 2 + 2, nameWidth, 36, 700, palette.text, "center");
  else fitText(ctx, face.name || "Card name", nameLeft, nameBar.y + nameBar.h / 2 + 2, nameWidth, 36, 700, palette.text);

  // the art box
  const artBox = { x: 58, y: 126, w: WIDTH - 116, h: token ? 520 : 438 };
  ctx.save();
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(artBox.x, artBox.y, artBox.w, artBox.h);
  if (assets.art) {
    ctx.beginPath();
    ctx.rect(artBox.x, artBox.y, artBox.w, artBox.h);
    ctx.clip();
    const source = assets.art as { width: number; height: number };
    const cover = Math.max(artBox.w / source.width, artBox.h / source.height) * Math.max(0.2, face.art.zoom);
    const drawWidth = source.width * cover;
    const drawHeight = source.height * cover;
    const left = artBox.x + (artBox.w - drawWidth) / 2 + face.art.x * artBox.w;
    const top = artBox.y + (artBox.h - drawHeight) / 2 + face.art.y * artBox.h;
    ctx.drawImage(assets.art, left, top, drawWidth, drawHeight);
  } else {
    ctx.fillStyle = "#8a8f96";
    ctx.font = `400 26px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Art", artBox.x + artBox.w / 2, artBox.y + artBox.h / 2);
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = frameFill(ctx, frame, "dark", artBox.x, artBox.w);
  ctx.strokeRect(artBox.x, artBox.y, artBox.w, artBox.h);

  // type bar with the set symbol
  const typeBar = { x: 44, y: artBox.y + artBox.h + 8, w: WIDTH - 88, h: 56 };
  rounded(ctx, typeBar.x, typeBar.y, typeBar.w, typeBar.h, 12);
  ctx.fillStyle = frameFill(ctx, frame, "bar", typeBar.x, typeBar.w);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = frameFill(ctx, frame, "dark", typeBar.x, typeBar.w);
  ctx.stroke();
  fitText(ctx, face.typeLine || "Type", typeBar.x + 20, typeBar.y + typeBar.h / 2 + 1, typeBar.w - 90, 30, 700, palette.text);
  const symbolBox = { x: typeBar.x + typeBar.w - 58, y: typeBar.y + 8, s: 40 };
  if (assets.setSymbol) {
    ctx.drawImage(assets.setSymbol, symbolBox.x, symbolBox.y, symbolBox.s, symbolBox.s);
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
  const textBox = { x: 58, y: typeBar.y + typeBar.h + 8, w: WIDTH - 116, h: HEIGHT - 70 - (typeBar.y + typeBar.h + 8) - 20 };
  ctx.fillStyle = frameFill(ctx, frame, "box", textBox.x, textBox.w);
  ctx.fillRect(textBox.x, textBox.y, textBox.w, textBox.h);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = frameFill(ctx, frame, "dark", textBox.x, textBox.w);
  ctx.strokeRect(textBox.x, textBox.y, textBox.w, textBox.h);
  const statBox = face.kind === "planeswalker" ? !!face.loyalty : !!(face.power || face.toughness);
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
    } else {
      rounded(ctx, box.x, box.y, box.w, box.h, 12);
      ctx.fillStyle = frameFill(ctx, frame, "bar", box.x, box.w);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = frameFill(ctx, frame, "dark", box.x, box.w);
      ctx.stroke();
      fitText(ctx, `${face.power}/${face.toughness}`, box.x + box.w / 2, box.y + box.h / 2 + 2, box.w - 16, 38, 700, palette.text, "center");
    }
    ctx.restore();
  }

  // the information line: number, rarity, set and artist
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
