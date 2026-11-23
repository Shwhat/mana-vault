// ---------- notes (0.22.0): the rich text editor with its toolbar; pages are saved as markdown ----------
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { noteExtensions, parseNote, writeNote } from "../notes-md";
import { cardForLink, copyPicture, findByTitle, type NoteKind, notesTree, uploadPicture } from "../notes-state";
import { simplifyPasted } from "../notes-html";
import { SYNCED_EVENT } from "../android/offline";
import { request } from "../api";
import { useApp } from "../store";
import { customDialog, dialog } from "./Dialog";

type Near = { kind: NoteKind | null; itemId: string | null };

// ---------- pictures in pasted web pages (0.23.0) ----------
// Pasted pictures from the web are copied to the server. Pictures that could not be copied because the phone was
// offline are kept in a list and copied the next time their page is opened online.
// Each page's list maps a web address to its copy's address once copied ("" until then), so a copy made after the
// page was closed is shown the next time it opens without copying again.
const WAITING = "mana-vault-note-pictures";
type Waiting = Record<string, string>;
function waitingPictures(): Record<string, Waiting> {
  try {
    const all = JSON.parse(localStorage.getItem(WAITING) ?? "{}") as Record<string, Waiting>;
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}
function setWaiting(pageId: string, waiting: Waiting) {
  try {
    const all = waitingPictures();
    if (Object.keys(waiting).length) all[pageId] = waiting;
    else delete all[pageId];
    localStorage.setItem(WAITING, JSON.stringify(all));
  } catch {
    // the list is a convenience; without storage the pictures stay as links
  }
}
const offline = (reason: unknown) => !navigator.onLine || (reason instanceof Error && (reason.name === "OfflineError" || /offline/i.test(reason.message)));

/** Puts the copy's address on every picture that shows the web address. */
function swapPicture(editor: Editor, from: string, to: string): boolean {
  const { tr } = editor.state;
  let changed = false;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image" && node.attrs.src === from) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: to });
      changed = true;
    }
  });
  if (changed) editor.view.dispatch(tr);
  return changed;
}

/** The web pictures (http and https) shown in the editor. */
function webPicturesIn(editor: Editor): string[] {
  const found = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image" && /^https?:/.test(String(node.attrs.src ?? ""))) found.add(String(node.attrs.src));
  });
  return [...found];
}

/** The searchable list behind the page link and card link buttons, and behind typing [[. */
function LinkFinder({ kind, close, onPick }: { kind: "page" | "card"; close: () => void; onPick: (text: string) => void }) {
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let live = true;
    const words = term.trim().toLowerCase();
    if (kind === "page") {
      const pages = notesTree()?.pages ?? [];
      const titles = [...new Set(pages.map((page) => page.title))].filter((title) => !words || title.toLowerCase().includes(words)).sort((a, b) => a.localeCompare(b));
      setFound(titles.slice(0, 50));
    } else if (words.length >= 2) {
      const timer = window.setTimeout(() => {
        request<unknown>(`/api/cards?q=${encodeURIComponent(term.trim())}&limit=30&group=1`).then((answer) => {
          if (!live) return;
          const list = (Array.isArray(answer) ? answer : (answer as { cards?: unknown[] }).cards ?? []) as Array<{ name: string }>;
          setFound([...new Set(list.map((card) => card.name))].slice(0, 30));
        }).catch(() => { if (live) setFound([]); });
      }, 200);
      return () => { live = false; window.clearTimeout(timer); };
    } else setFound([]);
    return () => { live = false; };
  }, [term, kind]);
  useEffect(() => setIndex(0), [term]);
  const typed = term.trim();
  const rows = kind === "page" && typed && !found.some((title) => title.toLowerCase() === typed.toLowerCase()) ? [...found, typed] : found;
  const pick = (text: string) => { close(); onPick(text); };
  return (
    <div className="linkfind">
      <input autoFocus className="input" aria-label={kind === "page" ? "Page title" : "Card name"} placeholder={kind === "page" ? "Type a page title" : "Type a card name"}
        value={term} onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setIndex(Math.min(rows.length - 1, index + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setIndex(Math.max(0, index - 1)); }
          else if (event.key === "Enter") { event.preventDefault(); const row = rows[index] ?? typed; if (row) pick(row); }
        }} />
      <div className="lflist" role="listbox" aria-label={kind === "page" ? "Pages" : "Cards"}>
        {rows.map((row, at) => (
          <button key={`${row}-${at}`} type="button" role="option" aria-selected={at === index} className={at === index ? "pkopt hi" : "pkopt"} onMouseEnter={() => setIndex(at)} onClick={() => pick(row)}>
            {kind === "page" && at === found.length ? <>New page: <b>{row}</b></> : row}
          </button>
        ))}
        {!rows.length && <p className="note pad">{kind === "card" && typed.length < 2 ? "Type at least two letters" : "Nothing found"}</p>}
      </div>
    </div>
  );
}

export function findLink(kind: "page" | "card", onPick: (text: string) => void) {
  customDialog(kind === "page" ? "Link to a page" : "Link to a card", (close) => <LinkFinder kind={kind} close={close} onPick={onPick} />, 440, "Cancel");
}

/** Asks for a page or card and puts the link where the cursor was, then puts the cursor after it. */
function insertLink(editor: Editor, kind: "page" | "card") {
  const at = editor.state.selection.from;
  // the window would give the focus back to the start of the page when it closes
  (editor.view.dom as HTMLElement).blur();
  findLink(kind, (text) => {
    const node = kind === "page" ? { type: "pageLink", attrs: { title: text } } : { type: "cardLink", attrs: { name: text } };
    editor.chain().setTextSelection(Math.min(at, editor.state.doc.content.size)).insertContent([node, { type: "text", text: " " }]).run();
    const after = editor.state.selection.from;
    window.setTimeout(() => editor.commands.focus(after), 0);
  });
}

function Tool({ label, title, on, disabled, run, children }: { label: string; title?: string; on?: boolean; disabled?: boolean; run: () => void; children?: ReactNode }) {
  return (
    <button type="button" className={on ? "ntool on" : "ntool"} aria-label={label} aria-pressed={on} title={title ?? label} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} onClick={run}>{children ?? label}</button>
  );
}

function Toolbar({ editor, pageId }: { editor: Editor; pageId: string }) {
  const store = useApp();
  const file = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  const addPicture = async (picked: File) => {
    try {
      const url = await uploadPicture(picked, picked.name, pageId);
      editor.chain().focus().setImage({ src: url, alt: picked.name.replace(/\.[a-z0-9]+$/i, "") }).run();
    } catch (reason) {
      store.fail(reason, "Could not add the picture.");
    }
  };
  return (
    <div className="ntoolbar" role="toolbar" aria-label="Formatting">
      <span className="ngroup">
        <Tool label="H1" title="Heading 1" on={editor.isActive("heading", { level: 1 })} run={() => chain().toggleHeading({ level: 1 }).run()} />
        <Tool label="H2" title="Heading 2" on={editor.isActive("heading", { level: 2 })} run={() => chain().toggleHeading({ level: 2 }).run()} />
        <Tool label="H3" title="Heading 3" on={editor.isActive("heading", { level: 3 })} run={() => chain().toggleHeading({ level: 3 }).run()} />
      </span>
      <span className="ngroup">
        <Tool label="Bold" title="Bold (Ctrl+B)" on={editor.isActive("bold")} run={() => chain().toggleBold().run()}><b>B</b></Tool>
        <Tool label="Italic" title="Italic (Ctrl+I)" on={editor.isActive("italic")} run={() => chain().toggleItalic().run()}><i>I</i></Tool>
        <Tool label="Strikethrough" on={editor.isActive("strike")} run={() => chain().toggleStrike().run()}><s>S</s></Tool>
        <Tool label="Code" title="Inline code" on={editor.isActive("code")} run={() => chain().toggleCode().run()}><code>{"<>"}</code></Tool>
      </span>
      <span className="ngroup">
        <Tool label="Bullet list" on={editor.isActive("bulletList")} run={() => chain().toggleBulletList().run()}>&bull; List</Tool>
        <Tool label="Numbered list" on={editor.isActive("orderedList")} run={() => chain().toggleOrderedList().run()}>1. List</Tool>
        <Tool label="Checklist" on={editor.isActive("taskList")} run={() => chain().toggleTaskList().run()}>&#9745; Checklist</Tool>
        <Tool label="Quote" on={editor.isActive("blockquote")} run={() => chain().toggleBlockquote().run()}>&ldquo; Quote</Tool>
        <Tool label="Code block" on={editor.isActive("codeBlock")} run={() => chain().toggleCodeBlock().run()}>{"{ }"}</Tool>
        <Tool label="Divider" run={() => chain().setHorizontalRule().run()}>Line</Tool>
      </span>
      <span className="ngroup">
        <Tool label="Table" on={inTable} run={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} disabled={inTable}>Table</Tool>
        {inTable && <>
          <Tool label="Add row" run={() => chain().addRowAfter().run()}>+ Row</Tool>
          <Tool label="Add column" run={() => chain().addColumnAfter().run()}>+ Column</Tool>
          <Tool label="Delete row" run={() => chain().deleteRow().run()}>- Row</Tool>
          <Tool label="Delete column" run={() => chain().deleteColumn().run()}>- Column</Tool>
          <Tool label="Delete table" run={() => chain().deleteTable().run()}>Delete table</Tool>
        </>}
      </span>
      <span className="ngroup">
        <Tool label="Link" title="Link (Ctrl+K)" on={editor.isActive("link")} run={() => askLink(editor)} />
        <Tool label="Page link" title="Page link ([[)" run={() => insertLink(editor, "page")} />
        <Tool label="Card link" run={() => insertLink(editor, "card")} />
        <Tool label="Picture" run={() => file.current?.click()} />
        <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml" hidden aria-label="Picture file"
          onChange={(event) => { const picked = event.target.files?.[0]; event.target.value = ""; if (picked) void addPicture(picked); }} />
      </span>
      <span className="ngroup">
        <Tool label="Undo" title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} run={() => chain().undo().run()}>&#8630;</Tool>
        <Tool label="Redo" title="Redo (Ctrl+Y)" disabled={!editor.can().redo()} run={() => chain().redo().run()}>&#8631;</Tool>
      </span>
    </div>
  );
}

function askLink(editor: Editor) {
  const current = String(editor.getAttributes("link").href ?? "");
  dialog("Link", [["url", "Address", current]], (values) => {
    const url = String(values.url).trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("/") ? url : `https://${url}`;
    if (editor.state.selection.empty && !editor.isActive("link")) editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href } }] }).run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, "Save");
}

/**
 * The editor. It shows the page rendered at all times; the toolbar and the usual shortcuts change it. Every change is
 * passed on as markdown. `body` replaces what is shown when it changes from outside (another save), unless there are
 * changes not yet passed on.
 */
export function NoteEditor({ pageId, body, editable, near, onChange, onOpenPage, onTick }: {
  pageId: string; body: string; editable: boolean; near: Near; onChange: (markdown: string) => void; onOpenPage: (title: string) => void;
  /** A checklist box ticked while not editing. */
  onTick?: () => void;
}) {
  const store = useApp();
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const tickRef = useRef(onTick);
  tickRef.current = onTick;
  const shown = useRef(body);
  const [hover, setHover] = useState<{ url: string; x: number; y: number } | null>(null);
  const [copying, setCopying] = useState(0);
  const pasted = useRef(new Set<string>());
  /** Copies web pictures to the server, one at a time, and shows the copies in their place. */
  const copyPictures = async (urls: string[]) => {
    const current = editorRef.current;
    if (!current || !urls.length) return;
    setCopying((count) => count + urls.length);
    let failed = 0;
    for (const url of urls) {
      const waiting = { ...(waitingPictures()[pageId] ?? {}) };
      try {
        const copy = waiting[url] || await copyPicture(url, pageId.startsWith("v") ? null : pageId);
        // the copy's address is kept until the page is opened showing it, so a page closed before the copy came
        // back (or before its save reached the server) shows the copy the next time it opens
        const live = editorRef.current && !editorRef.current.isDestroyed ? editorRef.current : null;
        if (live) swapPicture(live, url, copy);
        waiting[url] = copy;
      } catch (reason) {
        if (offline(reason)) waiting[url] = "";
        else {
          delete waiting[url];
          failed += 1;
        }
      } finally {
        setCopying((count) => Math.max(0, count - 1));
        setWaiting(pageId, waiting);
      }
    }
    if (failed) store.flash(`${failed} ${failed === 1 ? "picture" : "pictures"} could not be copied and stay as links`, "err");
  };
  const copyRef = useRef(copyPictures);
  copyRef.current = copyPictures;
  const editor = useEditor({
    extensions: noteExtensions({ onReadOnlyChecked: () => { window.setTimeout(() => tickRef.current?.(), 0); return true; } }),
    content: parseNote(body),
    editable,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: "notebody abpage", "aria-label": "Page text", role: "textbox", "aria-multiline": "true" },
      handleTextInput(view, from, _to, text) {
        // typing [[ opens the page list
        if (text !== "[" || from < 1) return false;
        const before = view.state.doc.textBetween(from - 1, from, "", "");
        if (before !== "[") return false;
        view.dispatch(view.state.tr.delete(from - 1, from));
        window.setTimeout(() => { if (editorRef.current) insertLink(editorRef.current, "page"); }, 0);
        return true;
      },
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          if (editorRef.current) askLink(editorRef.current);
          return true;
        }
        return false;
      },
      transformPastedHTML(html) {
        const simple = simplifyPasted(html);
        for (const match of simple.matchAll(/<img[^>]+src="(https?:[^"]+)"/g)) pasted.current.add(match[1]!.replace(/&amp;/g, "&"));
        window.setTimeout(() => {
          const urls = [...pasted.current];
          pasted.current.clear();
          void copyRef.current(urls);
        }, 0);
        return simple;
      },
      handlePaste(_view, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter((item) => item.type.startsWith("image/"));
        if (!files.length) return false;
        for (const picked of files) void addFile(picked);
        return true;
      },
      handleDrop(_view, event) {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((item) => item.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        for (const picked of files) void addFile(picked);
        return true;
      },
    },
    onUpdate: ({ editor: changed }) => {
      const markdown = writeNote(changed.getJSON());
      if (markdown === shown.current) return;
      shown.current = markdown;
      changeRef.current(markdown);
    },
  }, [pageId]);
  const editorRef = useRef<Editor | null>(editor);
  editorRef.current = editor;
  const addFile = async (picked: File) => {
    try {
      const url = await uploadPicture(picked, picked.name || "picture", pageId);
      editorRef.current?.chain().focus().setImage({ src: url, alt: (picked.name || "picture").replace(/\.[a-z0-9]+$/i, "") }).run();
    } catch (reason) {
      store.fail(reason, "Could not add the picture.");
    }
  };

  useEffect(() => { editor?.setEditable(editable, false); }, [editor, editable]);
  // pictures pasted while offline are copied when the page is opened online, or when the connection comes back
  useEffect(() => {
    if (!editor) return;
    let busy = false;
    const retry = () => {
      if (busy || !navigator.onLine) return;
      const waiting = waitingPictures()[pageId] ?? {};
      if (!Object.keys(waiting).length) return;
      const shown = new Set(webPicturesIn(editor));
      const still = Object.keys(waiting).filter((url) => shown.has(url));
      // addresses the page no longer shows are done
      const kept: Waiting = {};
      for (const url of still) kept[url] = waiting[url]!;
      setWaiting(pageId, kept);
      if (!still.length) return;
      busy = true;
      void copyRef.current(still).finally(() => { busy = false; });
    };
    retry();
    window.addEventListener("online", retry);
    window.addEventListener(SYNCED_EVENT, retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener(SYNCED_EVENT, retry);
    };
  }, [editor, pageId]);
  // a newer text from the server replaces the shown text when nothing here is waiting to be saved
  useEffect(() => {
    if (!editor || body === shown.current) return;
    shown.current = body;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(parseNote(body), { emitUpdate: false });
    const size = editor.state.doc.content.size;
    if (editor.isFocused) editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
  }, [editor, body]);

  if (!editor) return null;
  const click = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const page = target.closest<HTMLElement>("[data-page-link]");
    if (page) {
      event.preventDefault();
      onOpenPage(page.getAttribute("data-page-link") ?? "");
      return;
    }
    const card = target.closest<HTMLElement>("[data-card-link]");
    if (card) {
      event.preventDefault();
      const name = card.getAttribute("data-card-link") ?? "";
      setHover(null);
      void cardForLink(name).then((found) => {
        if (found) store.setCardPage(found.id);
        else store.flash(`No card named ${name} in the card database`, "err");
      });
      return;
    }
    // a picture opens full size with a click while reading, or a double click while editing
    if (target instanceof HTMLImageElement && target.classList.contains("notepic") && (!editable || event.detail >= 2)) {
      event.preventDefault();
      window.open(target.src, "_blank", "noopener,noreferrer");
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (link && (!editable || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      window.open(link.href, "_blank", "noopener,noreferrer");
    }
  };
  const over = (event: React.MouseEvent) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-card-link]");
    if (!card) {
      if (hover) setHover(null);
      return;
    }
    const { clientX, clientY } = event;
    void cardForLink(card.getAttribute("data-card-link") ?? "").then((found) => {
      if (found?.image_url) setHover({ url: found.image_url, x: clientX, y: clientY });
    });
  };
  const menu = (event: React.MouseEvent) => {
    if (!editable || !(event.target as HTMLElement).closest("table")) return;
    event.preventDefault();
    const chain = () => editor.chain().focus();
    store.setContextMenu({
      x: event.clientX, y: event.clientY, title: "Table",
      items: [
        { label: "Add row above", run: () => chain().addRowBefore().run() },
        { label: "Add row below", run: () => chain().addRowAfter().run() },
        { label: "Add column left", run: () => chain().addColumnBefore().run() },
        { label: "Add column right", run: () => chain().addColumnAfter().run() },
        { label: "Delete row", run: () => chain().deleteRow().run() },
        { label: "Delete column", run: () => chain().deleteColumn().run() },
        { label: "Delete table", run: () => chain().deleteTable().run() },
      ],
    });
  };
  void near;
  return (
    <div className={editable ? "noteedit" : "noteedit reading"}>
      {editable && <Toolbar editor={editor} pageId={pageId} />}
      {copying > 0 && <div className="ncopying" role="status">Copying {copying} {copying === 1 ? "picture" : "pictures"}</div>}
      <div className="notescroll" onClick={click} onMouseOver={over} onMouseLeave={() => setHover(null)} onContextMenu={menu}>
        <EditorContent editor={editor} />
      </div>
      {hover && (
        <img className="hoverpreview" src={hover.url} alt="" aria-hidden="true"
          style={{ left: hover.x + 260 + 24 > window.innerWidth ? hover.x - 284 : hover.x + 24, top: Math.max(8, Math.min(hover.y - 120, window.innerHeight - 372)) }} />
      )}
    </div>
  );
}

/** Finds the page a link names, near the page it is on. */
export const linkTarget = (title: string, near: Near) => findByTitle(notesTree()?.pages ?? [], title, near);
