// ---------- card fonts (0.17.0): free fonts with open licenses (SIL Open Font License), bundled with Mana Vault and
// close to the printed card look. Crimson Pro for rules and flavor text, Merriweather Sans for names, type lines and
// power and toughness. ----------
import rulesRegular from "@fontsource/crimson-pro/files/crimson-pro-latin-400-normal.woff2?url";
import rulesItalic from "@fontsource/crimson-pro/files/crimson-pro-latin-400-italic.woff2?url";
import rulesBold from "@fontsource/crimson-pro/files/crimson-pro-latin-700-normal.woff2?url";
import titleBold from "@fontsource/merriweather-sans/files/merriweather-sans-latin-700-normal.woff2?url";
import titleHeavy from "@fontsource/merriweather-sans/files/merriweather-sans-latin-800-normal.woff2?url";

/** The families the card renderer asks for, with a serif to fall back on while the fonts load. */
export const RULES_FONT = "'MV Card Rules', Georgia, 'Times New Roman', serif";
export const TITLE_FONT = "'MV Card Title', 'Segoe UI', Georgia, sans-serif";

const FACES: Array<[string, string, FontFaceDescriptors]> = [
  ["MV Card Rules", rulesRegular, { weight: "400", style: "normal" }],
  ["MV Card Rules", rulesItalic, { weight: "400", style: "italic" }],
  ["MV Card Rules", rulesBold, { weight: "700", style: "normal" }],
  ["MV Card Title", titleBold, { weight: "700", style: "normal" }],
  ["MV Card Title", titleHeavy, { weight: "800", style: "normal" }],
];

let loading: Promise<boolean> | null = null;
/** Loads the card fonts once; resolves true when they are ready (false keeps the fallback serif). */
export function loadCardFonts(): Promise<boolean> {
  if (typeof FontFace === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  loading ??= Promise.all(FACES.map(async ([family, url, descriptors]) => {
    const face = new FontFace(family, `url(${url})`, descriptors);
    document.fonts.add(await face.load());
  })).then(() => true).catch(() => false);
  return loading;
}
