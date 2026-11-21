// ---------- SVG cleaning: set symbols may be SVG files, which can carry scripts; only the drawing is kept ----------

/** The rules an SVG is sent with: nothing in it can run, load or open anything, even when opened on its own. */
export const SVG_HEADERS = {
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  "x-content-type-options": "nosniff",
};

const DRAWING = /<(path|circle|ellipse|rect|polygon|polyline|line|text|use)\b/i;
const REMOVED_ELEMENTS = ["script", "foreignObject", "iframe", "embed", "object", "audio", "video", "canvas", "handler", "listener", "set", "animate[a-zA-Z]*"];

/**
 * Cleans an SVG so only the drawing stays: no scripts, event attributes, embedded pages, outside links, entities or style
 * imports. Returns null when the text is not an SVG or nothing drawable is left.
 */
export function cleanSvg(text: string): string | null {
  let svg = text.replace(/^﻿/, "");
  // declarations and processing instructions (entities and outside style sheets) go first
  svg = svg.replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!ENTITY[\s\S]*?>/gi, "");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");
  for (const name of REMOVED_ELEMENTS) {
    svg = svg.replace(new RegExp(`<${name}\\b[\\s\\S]*?</${name}\\s*>`, "gi"), "").replace(new RegExp(`<${name}\\b[^>]*/?>`, "gi"), "");
  }
  // event attributes, and links that are not to a part of the same drawing
  svg = svg.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  svg = svg.replace(/\s((?:xlink:)?href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, _name: string, value: string) => (/^["']?#/.test(value) ? match : ""));
  // styles may not load anything from outside
  svg = svg.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, "none").replace(/expression\s*\(/gi, "");
  svg = svg.replace(/javascript:/gi, "");
  const start = svg.search(/<svg\b/i);
  const end = svg.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) return null;
  svg = svg.slice(start, end + 6).trim();
  if (!DRAWING.test(svg)) return null;
  // a drawing without a size gets one from its view box, so it is drawn at a sensible size
  if (!/<svg\b[^>]*\swidth=/i.test(svg)) svg = svg.replace(/<svg\b/i, '<svg width="96" height="96"');
  return svg;
}
