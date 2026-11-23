// ---------- notes (0.22.0): the editor's parts and the markdown they are saved as ----------
// Pages are edited as rich text and saved as markdown. Page links are [[Page title]], card links are [[card:Card name]],
// pictures are ![name](/api/notes/files/<code>), checklists are "- [ ] " lines and tables are markdown tables.
import { type AnyExtension, Node, mergeAttributes } from "@tiptap/core";
import { MarkdownManager, Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";

/** Turns a saved picture address into one the page can load (the Android app loads it from the server). */
let resolveFile: (src: string) => string = (src) => src;
export function setFileResolver(resolver: (src: string) => string) {
  resolveFile = resolver;
}

/** Whether a page title exists, for showing links to missing pages in red. Set by the notes state. */
let titleExists: (title: string) => boolean = () => true;
export const TITLES_CHANGED = "mana-vault-note-titles";
export function setTitleCheck(check: (title: string) => boolean) {
  titleExists = check;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TITLES_CHANGED));
}

type LinkToken = { type: string; raw: string; title: string };

/** A link to a page by its title: [[Page title]]. */
export const PageLink = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { title: { default: "", parseHTML: (element) => element.getAttribute("data-page-link") ?? "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-page-link]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-page-link": node.attrs.title, class: "notelink" }), node.attrs.title];
  },
  renderText({ node }) {
    return `[[${String(node.attrs.title)}]]`;
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "notelink";
      dom.setAttribute("data-page-link", String(node.attrs.title));
      dom.textContent = String(node.attrs.title);
      const mark = () => dom.classList.toggle("missing", !titleExists(String(node.attrs.title)));
      mark();
      window.addEventListener(TITLES_CHANGED, mark);
      return { dom, destroy: () => window.removeEventListener(TITLES_CHANGED, mark) };
    };
  },
  markdownTokenizer: {
    name: "pageLink",
    level: "inline",
    start: (src: string) => {
      const at = src.search(/\[\[(?!card:)/);
      return at;
    },
    tokenize(src: string) {
      const match = /^\[\[(?!card:)([^\]\n]+)\]\]/.exec(src);
      return match ? ({ type: "pageLink", raw: match[0], title: match[1]!.trim() } as LinkToken as never) : undefined;
    },
  },
  parseMarkdown(token) {
    return { type: "pageLink", attrs: { title: (token as unknown as LinkToken).title } };
  },
  renderMarkdown(node) {
    return `[[${String(node.attrs?.title ?? "")}]]`;
  },
});

/** A link to a card by its name: [[card:Card name]]. */
export const CardLink = Node.create({
  name: "cardLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { name: { default: "", parseHTML: (element) => element.getAttribute("data-card-link") ?? "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-card-link]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-card-link": node.attrs.name, class: "cardlink" }), node.attrs.name];
  },
  renderText({ node }) {
    return `[[card:${String(node.attrs.name)}]]`;
  },
  markdownTokenizer: {
    name: "cardLink",
    level: "inline",
    start: (src: string) => src.indexOf("[[card:"),
    tokenize(src: string) {
      const match = /^\[\[card:([^\]\n]*)\]\]/.exec(src);
      return match ? ({ type: "cardLink", raw: match[0], title: match[1]!.trim() } as LinkToken as never) : undefined;
    },
  },
  parseMarkdown(token) {
    return { type: "cardLink", attrs: { name: (token as unknown as LinkToken).title } };
  },
  renderMarkdown(node) {
    return `[[card:${String(node.attrs?.name ?? "")}]]`;
  },
});

/** Pictures kept on the server; shown through the file resolver. */
export const NotePicture = Image.extend({
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: resolveFile(String(HTMLAttributes.src ?? "")), class: "notepic" })];
  },
});

/** Every part the editor and the markdown reader use, in one list. */
export function noteExtensions(options: { onReadOnlyChecked?: (checked: boolean) => boolean } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      underline: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true, onReadOnlyChecked: options.onReadOnlyChecked ? (_node, checked) => options.onReadOnlyChecked!(checked) : undefined }),
    TableKit.configure({ table: { resizable: false } }),
    NotePicture.configure({ inline: false, allowBase64: true }),
    PageLink,
    CardLink,
  ];
}

export { Markdown };

let manager: MarkdownManager | null = null;
function markdown(): MarkdownManager {
  manager ??= new MarkdownManager({ extensions: noteExtensions() });
  return manager;
}

/** Reads markdown into the editor's document. */
export function parseNote(body: string) {
  return markdown().parse(body);
}

/** Writes the editor's document as markdown. */
export function writeNote(doc: Parameters<MarkdownManager["serialize"]>[0]): string {
  return tidy(markdown().serialize(doc));
}

/** Markdown as it is saved: no runs of blank lines, one newline at the end. */
export function tidy(text: string): string {
  const out = text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return out ? `${out}\n` : "";
}

/** The page titles a body links to. */
export function linkedTitles(body: string): string[] {
  return [...body.matchAll(/\[\[(?!card:)([^\]\n]+)\]\]/g)].map((match) => match[1]!.trim());
}

/** The card names a body links to. */
export function linkedCards(body: string): string[] {
  return [...body.matchAll(/\[\[card:([^\]\n]+)\]\]/g)].map((match) => match[1]!.trim());
}
