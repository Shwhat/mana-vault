// ---------- notes (0.23.0): web pages into notes pages, simplified to what the editor shows ----------
// Pasted HTML keeps what was selected; whole pages (imported .html files and web addresses) keep their main article.
// Colors, fonts, columns and boxes go; embedded videos and maps become links; pictures from the web are copied.
import { Readability } from "@mozilla/readability";
import { generateJSON } from "@tiptap/core";
import { noteExtensions, writeNote } from "./notes-md";

const DROP = "script,style,noscript,template,form,input,button,select,textarea,link,meta,svg,canvas,dialog,object>param";
const EMBEDS = "iframe,video,audio,embed,object";

const LOCAL = "mv-local:";

const absolute = (value: string, base: string | null): string | null => {
  try {
    return base ? new URL(value, base).href : new URL(value).href;
  } catch {
    return null;
  }
};

/** The text of the link an embed becomes (no address in it, so it is not turned into a second link). */
function embedLabel(src: string, tag: string): string {
  if (/maps?\.|\/maps/i.test(src)) return "Open the map";
  if (tag === "audio") return "Listen to the audio";
  if (tag === "video" || /youtube|youtu\.be|vimeo|twitch|tiktok|dailymotion/i.test(src)) return "Watch the video";
  return "Open the embedded content";
}

/**
 * Simplifies HTML in place: drops scripts, forms and styling, turns embeds into links, makes link and picture addresses
 * full (when the page's address is known), unwraps links to places on the same page and lazy pictures.
 */
export function simplifyDocument(doc: Document, base: string | null, pictureBase: string | null = base): void {
  for (const element of [...doc.querySelectorAll(DROP)]) element.remove();
  for (const element of [...doc.querySelectorAll(EMBEDS)]) {
    const tag = element.tagName.toLowerCase();
    const src = element.getAttribute("src") ?? element.querySelector("source[src]")?.getAttribute("src") ?? element.getAttribute("data") ?? "";
    const full = src ? absolute(src, base) : null;
    if (!full || !/^https?:/.test(full)) {
      element.remove();
      continue;
    }
    const paragraph = doc.createElement("p");
    const link = doc.createElement("a");
    link.href = full;
    link.textContent = embedLabel(full, tag);
    paragraph.append(link);
    element.replaceWith(paragraph);
  }
  for (const link of [...doc.querySelectorAll("a")]) {
    const href = (link.getAttribute("href") ?? "").trim();
    const full = href && !href.startsWith("#") ? absolute(href, base) : null;
    if (!full || !/^(https?|mailto):/.test(full) || (base && full.split("#")[0] === base.split("#")[0] && href.includes("#"))) link.replaceWith(...link.childNodes);
    else link.setAttribute("href", full);
  }
  for (const picture of [...doc.querySelectorAll("img")]) {
    const lazy = picture.getAttribute("data-src") ?? picture.getAttribute("data-original") ?? picture.getAttribute("data-lazy-src");
    const srcset = (picture.getAttribute("srcset") ?? "").split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
    let src = picture.getAttribute("src") ?? "";
    if (lazy && (!src || src.startsWith("data:image/gif") || /blank|placeholder|spacer/i.test(src))) src = lazy;
    if (!src && srcset.length) src = srcset[srcset.length - 1]!;
    if (!src) {
      picture.remove();
      continue;
    }
    // pictures in a saved page's own folder keep their path, so the import finds them among the files chosen
    // (marked with a scheme of their own, so the article reader does not make them addresses on this site)
    const full = src.startsWith("data:") ? src : /^[a-z][a-z0-9+.-]*:/i.test(src) || pictureBase ? absolute(src, pictureBase) : `${LOCAL}${src.replace(/ /g, "%20")}`;
    if (!full) {
      picture.remove();
      continue;
    }
    for (const name of [...picture.getAttributeNames()]) if (name !== "alt" && name !== "title") picture.removeAttribute(name);
    picture.setAttribute("src", full);
  }
  for (const element of [...doc.querySelectorAll("[style],[class],[id],[width],[height],[align],[bgcolor],[color],[face]")]) {
    for (const name of ["style", "class", "id", "width", "height", "align", "bgcolor", "color", "face"]) element.removeAttribute(name);
  }
}

/** Pasted HTML, simplified; the editor then keeps what it can show. */
export function simplifyPasted(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.querySelector("base[href]")?.getAttribute("href") ?? null;
  simplifyDocument(doc, base && /^https?:/.test(base) ? base : null);
  return doc.body.innerHTML;
}

/** The address a saved web page came from: Chrome's "saved from" note, the canonical link or og:url. */
export function savedFrom(html: string, doc?: Document): string | null {
  const comment = /<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i.exec(html.slice(0, 2000))?.[1];
  if (comment && /^https?:/.test(comment)) return comment;
  const parsed = doc ?? new DOMParser().parseFromString(html, "text/html");
  const canonical = parsed.querySelector("link[rel=canonical]")?.getAttribute("href") ?? parsed.querySelector("meta[property='og:url']")?.getAttribute("content");
  return canonical && /^https?:/.test(canonical) ? canonical : null;
}

export type WebPage = { title: string; markdown: string };

/**
 * A whole web page as a notes page: its main article (or the whole body when no article is found), titled from the
 * article, the page's title, its first heading or the fallback, as markdown.
 */
export function pageFromHtml(html: string, options: { base: string | null; fallbackTitle: string; pictureBase?: string | null }): WebPage {
  const pictureBase = options.pictureBase === undefined ? options.base : options.pictureBase;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const pageTitle = doc.title.trim();
  // the article reader needs the page's own address for its links and pictures, so they are made full first
  simplifyDocument(doc, options.base, pictureBase);
  const heading = doc.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  let content = doc.body?.innerHTML ?? "";
  let title = pageTitle || doc.querySelector("h1")?.textContent?.trim() || options.fallbackTitle;
  try {
    const article = new Readability(doc.cloneNode(true) as Document, { keepClasses: false }).parse();
    if (article?.content && (article.textContent ?? "").trim().length > 40) {
      content = article.content;
      title = article.title?.trim() || title;
    }
    // a page title that adds the site's name to the article's heading ("Primer - Site") is shortened to the heading
    if (heading && heading.length < title.length && title.toLowerCase().startsWith(heading.toLowerCase())) title = heading;
  } catch {
    // a page the article reader cannot read is kept whole
  }
  const inner = new DOMParser().parseFromString(content, "text/html");
  simplifyDocument(inner, options.base, pictureBase);
  // the title is the page's title, so a first heading that repeats it goes
  const first = inner.body.querySelector("h1,h2");
  if (first && first.textContent?.trim().toLowerCase() === title.toLowerCase()) first.remove();
  const markdown = writeNote(generateJSON(inner.body.innerHTML, noteExtensions()) as Parameters<typeof writeNote>[0]).split(`](${LOCAL}`).join("](");
  return { title: title.replace(/\s+/g, " ").slice(0, 200) || options.fallbackTitle, markdown };
}

/** The line at the top of a page from the web or an imported file. */
export function sourceLine(source: string, at = new Date()): string {
  const date = at.toISOString().slice(0, 10);
  const shown = /^https?:/.test(source) ? `[${source}](${source})` : source.replace(/[[\]]/g, "");
  return `Source: ${shown}, copied ${date}\n\n`;
}

/** The web pictures (http and https) in a page's markdown, each once. */
export function webPictures(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]!))];
}
