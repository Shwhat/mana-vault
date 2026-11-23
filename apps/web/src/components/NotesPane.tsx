// ---------- notes (0.22.0): the page tree and the open page, used by the Wiki tab and by each Notes tab ----------
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { strToU8, zipSync } from "fflate";
import { readMarkdownFiles, safeName } from "../notes-io";
import { pageFromHtml, savedFrom, sourceLine, webPictures } from "../notes-html";
import { downloadBlob, fetchFile, pickFiles, request, slugify } from "../api";
import { setKept, useKept } from "../kept";
import { usePhone } from "../narrow";
import {
  childrenOf, type ClashDetail, type Conflict, createPage, deletePage, deleteTemplate, descendantsOf, findByTitle, movePage, NOTE_CLASH, NOTES_CHANGED, openItemNotes,
  type NoteKind, notesTree, type PageDetail, type PageMeta, pageOpened, pageVersions, pathOf, pinPage, readPage, reloadNotes, renameTemplate, restorePages,
  restoreVersion, savePage, saveTemplate, searchNotes, copyWebPictures, fetchWebPage, type Found, type Template, topOf, useNotesTree, type Version,
} from "../notes-state";
import { type Store, useApp } from "../store";
import { Icon } from "../icons";
import { choiceDialog, closeDialog, confirmDialog, customDialog, dialog } from "./Dialog";
import { rowMenu } from "./ContextMenu";
import { NoteEditor } from "./NoteEditor";

export type NotesScope = { kind: NoteKind; itemId: string; name: string } | null;
type Status = "saved" | "saving" | "waiting" | "error";
const SAVE_DELAY = 1000;

// ---------- dialogs ----------

/** New page: a title and a template (Blank, the built-in ones and the account's own). */
export function newPageDialog(store: Store, where: { parentId?: string | null; kind?: NoteKind | null; itemId?: string | null }, opened: (page: PageDetail) => void) {
  const templates = notesTree()?.templates ?? [];
  dialog("New page", [
    ["title", "Title", ""],
    ["template", "Start from", "", "select", [["", "Blank"], ...templates.map((template): [string, string] => [template.id, template.name])]],
  ], async (values) => {
    const title = String(values.title).trim();
    if (!title) {
      store.flash("Type a title for the page", "err");
      return false;
    }
    const template = templates.find((item) => item.id === values.template);
    try {
      const page = await createPage({ title, body: template?.body ?? "", ...where });
      store.pushUndo({
        label: `New page ${title}`,
        undo: async () => { await deletePage(page.id, "delete"); },
        redo: async () => { await createPage({ title, body: template?.body ?? "", ...where }); },
      });
      store.flash(`Page ${title} made`);
      opened(page);
    } catch (reason) {
      store.fail(reason, "Could not make the page.");
      return false;
    }
  }, "Make page");
}

function ClashView({ mine, theirs, close, choose }: { mine: { title: string; body: string }; theirs: Conflict; close: () => void; choose: (answer: "mine" | "theirs" | "both") => void }) {
  return (
    <>
      <p className="dlgq">{theirs.updatedBy || "Someone"} saved this page at {when(theirs.updatedAt)} while you were editing it. Choose which text to keep.</p>
      <div className="clashcols">
        <div><h4>Your text</h4><pre className="clashtext" aria-label="Your text">{mine.body || "(empty)"}</pre></div>
        <div><h4>Their text</h4><pre className="clashtext" aria-label="Their text">{theirs.body || "(empty)"}</pre></div>
      </div>
      <div className="choicerow">
        <button type="button" className="btn primary" onClick={() => { close(); choose("mine"); }}>Keep mine</button>
        <button type="button" className="btn" onClick={() => { close(); choose("theirs"); }}>Keep theirs</button>
        <button type="button" className="btn" onClick={() => { close(); choose("both"); }}>Keep both</button>
      </div>
    </>
  );
}

/** Asks which text to keep when someone else saved the page first. Resolves null when the window is closed. */
export function clashDialog(mine: { title: string; body: string }, theirs: Conflict): Promise<"mine" | "theirs" | "both" | null> {
  return new Promise((resolve) => {
    let answered = false;
    customDialog("Page changed by someone else", (close) => <ClashView mine={mine} theirs={theirs} close={close} choose={(answer) => { answered = true; resolve(answer); }} />, 860, "Decide later");
    const watch = window.setInterval(() => {
      if (!document.querySelector("dialog#dlg[open]")) {
        window.clearInterval(watch);
        if (!answered) resolve(null);
      }
    }, 150);
  });
}

/** Settles a clash: keep mine (saved over theirs), keep theirs, or keep both (mine becomes a new page beside it). */
export async function settleClash(store: Store, pageId: string, mine: { title: string; body: string }, theirs: Conflict, answer: "mine" | "theirs" | "both"): Promise<PageDetail | null> {
  if (answer === "mine") {
    await savePage(pageId, { title: mine.title, body: mine.body, baseVersion: theirs.version, force: true });
    store.flash("Your text was kept");
  } else if (answer === "both") {
    const page = await readPage(pageId);
    await createPage({ title: `${mine.title} (my copy)`, body: mine.body, parentId: page.top ? page.id : page.parentId, kind: page.kind, itemId: page.itemId, before: null });
    store.flash(`Your text was kept as ${mine.title} (my copy)`);
  } else store.flash("Their text was kept");
  await reloadNotes();
  return readPage(pageId);
}

function HistoryView({ page, close, restored }: { page: PageDetail; close: () => void; restored: (page: PageDetail) => void }) {
  const store = useApp();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    pageVersions(page.id).then((list) => { setVersions(list); setShown(list[0]?.id ?? null); }).catch((reason) => { store.fail(reason, "Could not load the versions."); setVersions([]); });
  }, [page.id, store]);
  const version = versions?.find((item) => item.id === shown) ?? null;
  return (
    <div className="nhistory">
      <div className="list nhlist" role="listbox" aria-label="Versions">
        {versions === null && <p className="note pad">Loading the versions</p>}
        {versions?.length === 0 && <p className="note pad">No versions saved yet</p>}
        {versions?.map((item, index) => (
          <button key={item.id} type="button" role="option" aria-selected={item.id === shown} className={item.id === shown ? "row on" : "row"} onClick={() => setShown(item.id)}>
            <span className="rowmain"><span className="rowtitle">{when(item.at)}{index === 0 && <span className="badge">Current</span>}</span><span className="rowmeta">{item.by}</span></span>
          </button>
        ))}
      </div>
      <div className="nhview">
        {version && <>
          <div className="btnrow">
            <b>{version.title}</b>
            <button type="button" className="btn primary" disabled={versions?.[0]?.id === version.id} onClick={() => {
              void restoreVersion(page.id, version.id).then((next) => {
                close();
                store.flash(`Version of ${when(version.at)} restored`);
                restored(next);
              }).catch((reason) => store.fail(reason, "Could not restore the version."));
            }}>Restore</button>
          </div>
          <NoteEditor key={version.id} pageId={`v${version.id}`} body={version.body} editable={false} near={{ kind: page.kind, itemId: page.itemId }} onChange={() => undefined} onOpenPage={() => undefined} />
        </>}
      </div>
    </div>
  );
}

export function historyDialog(page: PageDetail, restored: (page: PageDetail) => void) {
  customDialog(`History: ${page.title}`, (close) => <HistoryView page={page} close={close} restored={restored} />, 980);
}

function TemplatesView() {
  const store = useApp();
  const tree = useNotesTree();
  const own = (tree?.templates ?? []).filter((template) => !template.builtIn);
  return (
    <div className="list">
      {(tree?.templates ?? []).filter((template) => template.builtIn).map((template) => (
        <div className="wsrow" key={template.id}><span>{template.name} <span className="sub">Built in</span></span></div>
      ))}
      {own.map((template) => (
        <div className="wsrow" key={template.id}>
          <span>{template.name}</span>
          <span className="btnrow">
            <button type="button" className="btn small" onClick={() => {
              dialog("Rename template", [["name", "Template name", template.name]], async (values) => {
                const name = String(values.name).trim();
                if (!name) return false;
                try {
                  await renameTemplate(template.id, name);
                  store.flash("Template renamed");
                } catch (reason) {
                  store.fail(reason, "Could not rename the template.");
                  return false;
                }
                templatesDialog();
              }, "Rename");
            }}>Rename</button>
            <button type="button" className="btn small" onClick={() => void deleteTemplate(template.id).then((gone) => {
              store.flash(`Template ${gone.name} deleted`);
              store.pushUndo({ label: `Delete template ${gone.name}`, undo: async () => { await saveTemplate(gone.name, gone.body); }, redo: async () => undefined });
            }).catch((reason) => store.fail(reason, "Could not delete the template."))}>Delete</button>
          </span>
        </div>
      ))}
      {!own.length && <p className="note pad">Use Save as template on a page to add your own templates.</p>}
    </div>
  );
}

export function templatesDialog() {
  customDialog("Templates", () => <TemplatesView />, 480);
}

/** Move to...: under another page, at the top of a deck's or collection's notes, or into My pages. */
export function moveToDialog(store: Store, page: PageMeta) {
  const tree = notesTree();
  if (!tree) return;
  const blocked = new Set([page.id, ...descendantsOf(tree.pages, page.id)]);
  const options: Array<[string, string]> = [["mine", "My pages (top level)"]];
  for (const deck of store.decks) options.push([`deck:${deck.id}`, `Deck: ${deck.name}`]);
  for (const collection of store.collections ?? []) options.push([`collection:${collection.id}`, `Collection: ${collection.name}`]);
  for (const other of tree.pages) if (!blocked.has(other.id) && !other.top) options.push([`page:${other.id}`, `Under ${pathOf(tree.pages, other.id)}`]);
  dialog(`Move ${page.title}`, [["to", "Move to", "mine", "select", options]], async (values) => {
    const to = String(values.to);
    const before = { parentId: page.parentId, kind: page.kind, itemId: page.itemId };
    try {
      if (to === "mine") await movePage(page.id, { parentId: null });
      else if (to.startsWith("page:")) await movePage(page.id, { parentId: to.slice(5) });
      else {
        const [kind, itemId] = to.split(":") as [NoteKind, string];
        await movePage(page.id, { parentId: null, kind, itemId });
      }
      store.pushUndo({
        label: `Move ${page.title}`,
        undo: async () => { await movePage(page.id, before.parentId ? { parentId: before.parentId } : { parentId: null, kind: before.kind, itemId: before.itemId }); },
        redo: async () => undefined,
      });
      store.flash(`${page.title} moved`);
    } catch (reason) {
      store.fail(reason, "Could not move the page.");
      return false;
    }
  }, "Move");
}

export async function askDelete(store: Store, page: PageMeta, done?: () => void) {
  const pages = notesTree()?.pages ?? [];
  const children = childrenOf(pages, page.id).length;
  let mode: "delete" | "lift" = "delete";
  if (children) {
    const answer = await choiceDialog("Delete page", <>Delete {page.title}? It has {children} child {children === 1 ? "page" : "pages"}.</>,
      [["delete", "Delete with child pages", true], ["lift", "Move child pages up"]]);
    if (!answer) return;
    mode = answer;
  } else if (!(await confirmDialog("Delete page", <>Delete {page.title}?</>, "Delete"))) return;
  try {
    const undo = await deletePage(page.id, mode);
    store.pushUndo({ label: `Delete ${page.title}`, undo: () => restorePages(undo), redo: async () => { await deletePage(page.id, mode); } });
    store.flash(`${page.title} deleted`);
    done?.();
  } catch (reason) {
    store.fail(reason, "Could not delete the page.");
  }
}

// ---------- import and export ----------


/** Exports pages as a zip of .md files in folders that follow the tree, with their pictures in attachments. */
export async function exportNotes(store: Store, query: string, fileName: string) {
  try {
    const result = await request<{ pages: Array<{ id: string; title: string; parentId: string | null; body: string; position: number }> }>(`/api/notes/export${query}`);
    if (!result.pages.length) return store.flash("There are no pages to export", "err");
    const byId = new Map(result.pages.map((page) => [page.id, page]));
    const folderOf = (id: string): string[] => {
      const parts: string[] = [];
      let page = byId.get(id);
      const seen = new Set<string>();
      while (page?.parentId && byId.has(page.parentId) && !seen.has(page.parentId)) {
        seen.add(page.parentId);
        page = byId.get(page.parentId)!;
        parts.unshift(safeName(page.title));
      }
      return parts;
    };
    const files: Record<string, Uint8Array> = {};
    const pictures = new Map<string, string>();
    for (const page of result.pages) {
      for (const match of page.body.matchAll(/\/api\/notes\/files\/([0-9a-f-]{36})/g)) {
        const id = match[1]!;
        if (pictures.has(id)) continue;
        try {
          const response = await fetchFile(`/api/notes/files/${id}`);
          if (!response.ok) continue;
          const type = response.headers.get("content-type") ?? "image/png";
          const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" } as Record<string, string>)[type] ?? "png";
          const name = `attachments/${id}.${extension}`;
          files[name] = new Uint8Array(await response.arrayBuffer());
          pictures.set(id, name);
        } catch {
          // a picture that cannot be fetched keeps its address
        }
      }
    }
    for (const page of result.pages) {
      const folder = folderOf(page.id);
      const depth = folder.length;
      const body = page.body.replace(/\/api\/notes\/files\/([0-9a-f-]{36})/g, (whole, id: string) => (pictures.has(id) ? `${"../".repeat(depth)}${pictures.get(id)}` : whole));
      let path = [...folder, `${safeName(page.title)}.md`].join("/");
      while (files[path]) path = path.replace(/\.md$/, " 2.md");
      files[path] = strToU8(body);
    }
    downloadBlob(`${slugify(fileName) || "notes"}.zip`, new Blob([zipSync(files) as BlobPart], { type: "application/zip" }));
    store.flash(`Exported ${result.pages.length} ${result.pages.length === 1 ? "page" : "pages"}`);
  } catch (reason) {
    store.fail(reason, "Could not export the pages.");
  }
}

export function exportDialog(store: Store, page: PageMeta | null) {
  const choices: Array<["page" | "tree" | "all", string, boolean?]> = [];
  if (page) choices.push(["page", "This page and its child pages", true]);
  if (page?.kind && page.itemId) choices.push(["tree", "The whole deck or collection tree"]);
  choices.push(["all", "The whole Wiki", !page]);
  void choiceDialog("Export notes", "Export pages as markdown files in a zip, with their pictures.", choices).then((what) => {
    if (what === "page" && page) void exportNotes(store, `?page=${encodeURIComponent(page.id)}`, page.title);
    else if (what === "tree" && page?.kind && page.itemId) void exportNotes(store, `?kind=${page.kind}&item=${encodeURIComponent(page.itemId)}`, page.title);
    else if (what === "all") void exportNotes(store, "", "wiki");
  });
}

/** Import pages...: markdown, text and HTML files, or zips of them (an Obsidian vault, a saved web page with its folder). */
export async function importPages(store: Store, where: { parentId?: string | null; kind?: NoteKind | null; itemId?: string | null }) {
  const picked = await pickFiles(".md,.markdown,.txt,.html,.htm,.zip,.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,text/markdown,text/html,application/zip,image/*");
  if (!picked.length) return;
  try {
    const read = await readMarkdownFiles(await Promise.all(picked.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }))));
    if (!read.pages.length) return store.flash("There are no .md or .html files to import", "err");
    // web pages: their main article, simplified, with a source line and copies of their web pictures
    let failed = 0;
    for (const page of read.pages) {
      if (page.html === undefined) continue;
      const source = savedFrom(page.html);
      // pictures of a saved page are in its own folder among the files, so their paths are kept as they are
      const converted = pageFromHtml(page.html, { base: source, fallbackTitle: page.title, pictureBase: null });
      const copied = await copyWebPictures(converted.markdown, null, webPictures(converted.markdown));
      failed += copied.failed.length;
      page.title = converted.title;
      page.body = `${sourceLine(source ?? `${page.key.split("/").pop()}.html`)}${copied.markdown}`;
      delete page.html;
    }
    const result = await request<{ created: number; ids: string[] }>("/api/notes/import", { method: "POST", body: JSON.stringify({ ...where, ...read }) });
    await reloadNotes();
    store.pushUndo({
      label: `Import ${result.created} pages`,
      undo: async () => { await restorePagesGone(result.ids); },
      redo: async () => undefined,
    });
    store.flash(`Imported ${result.created} ${result.created === 1 ? "page" : "pages"}${failed ? `; ${failed} ${failed === 1 ? "picture" : "pictures"} could not be copied and stay as links` : ""}`);
  } catch (reason) {
    store.fail(reason, "Could not import the files.");
  }
}

/** New page from web address...: the page's main article as a new page, with copies of its pictures. */
export function newPageFromWeb(store: Store, where: { parentId?: string | null; kind?: NoteKind | null; itemId?: string | null }, opened: (page: PageDetail) => void) {
  dialog("New page from web address", [["url", "Web address", ""]], async (values) => {
    const typed = String(values.url).trim();
    if (!typed) {
      store.flash("Type a web address", "err");
      return false;
    }
    const address = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`;
    store.flash("Fetching the page");
    try {
      const fetched = await fetchWebPage(address);
      const converted = pageFromHtml(fetched.html, { base: fetched.url, fallbackTitle: new URL(fetched.url).hostname });
      const copied = await copyWebPictures(converted.markdown, null, webPictures(converted.markdown));
      const page = await createPage({ title: converted.title, body: `${sourceLine(fetched.url)}${copied.markdown}`, ...where });
      store.pushUndo({
        label: `New page ${page.title}`,
        undo: async () => { await deletePage(page.id, "delete"); },
        redo: async () => undefined,
      });
      store.flash(copied.failed.length
        ? `Page ${page.title} made; ${copied.failed.length} ${copied.failed.length === 1 ? "picture" : "pictures"} could not be copied and stay as links`
        : `Page ${page.title} made`);
      opened(page);
    } catch (reason) {
      store.fail(reason, "Could not fetch the page.");
      return false;
    }
  }, "Make page");
}

async function restorePagesGone(ids: string[]) {
  const pages = notesTree()?.pages ?? [];
  // the top imported pages are deleted with their children
  for (const id of ids) if (!ids.includes(pages.find((page) => page.id === id)?.parentId ?? "")) await deletePage(id, "delete").catch(() => undefined);
}

// ---------- the tree ----------

type Drop = { id: string; where: "before" | "after" | "inside" } | null;

function pageMenu(store: Store, page: PageMeta, open: (id: string) => void) {
  return rowMenu(store, page.title, () => [
    { label: "New child page...", run: () => newPageDialog(store, { parentId: page.id }, (made) => open(made.id)) },
    !page.top && { label: "Rename...", run: () => renameDialog(store, page) },
    { label: page.pinned ? "Unpin" : "Pin", run: () => void pinPage(page.id, !page.pinned).catch((reason) => store.fail(reason, "Could not pin the page.")) },
    { label: "Save as template...", run: () => void readPage(page.id).then((detail) => saveTemplateDialog(store, detail)) },
    !page.top && { label: "Move to...", run: () => moveToDialog(store, page) },
    { label: "Export...", run: () => exportDialog(store, page) },
    { label: "New child page from web address...", run: () => newPageFromWeb(store, { parentId: page.id }, (made) => open(made.id)) },
    { label: "Import pages here...", run: () => void importPages(store, { parentId: page.id }) },
    { label: "History...", run: () => void readPage(page.id).then((detail) => historyDialog(detail, () => void reloadNotes())) },
    !page.top && { label: "Delete...", run: () => void askDelete(store, page) },
  ]);
}

function renameDialog(store: Store, page: PageMeta) {
  dialog(`Rename ${page.title}`, [["title", "Title", page.title]], async (values) => {
    const title = String(values.title).trim();
    if (!title) return false;
    try {
      const detail = await readPage(page.id);
      const result = await savePage(page.id, { title, baseVersion: detail.version });
      if (!result.ok) throw new Error("Someone changed the page meanwhile. Try again.");
      await reloadNotes();
      window.dispatchEvent(new Event(NOTES_CHANGED));
      store.flash(result.renamed ? `Renamed to ${title}, ${result.renamed} ${result.renamed === 1 ? "link" : "links"} changed` : `Renamed to ${title}`);
    } catch (reason) {
      store.fail(reason, "Could not rename the page.");
      return false;
    }
  }, "Rename");
}

function saveTemplateDialog(store: Store, page: PageDetail) {
  dialog("Save as template", [["name", "Template name", page.title]], async (values) => {
    const name = String(values.name).trim();
    if (!name) return false;
    try {
      await saveTemplate(name, page.body);
      store.flash(`Template ${name} saved`);
    } catch (reason) {
      store.fail(reason, "Could not save the template.");
      return false;
    }
  }, "Save");
}

function TreeRows({ pages, parentId, depth, openId, open, drag, setDrag, drop, setDrop, phone, filter }: {
  pages: PageMeta[]; parentId: string | null; depth: number; openId: string | null; open: (id: string) => void;
  drag: string | null; setDrag: (id: string | null) => void; drop: Drop; setDrop: (drop: Drop) => void; phone: boolean; filter?: (page: PageMeta) => boolean;
}) {
  const store = useApp();
  const [folded, setFolded] = useKept<string[]>("wiki:folded", []);
  const rows = childrenOf(pages, parentId, filter);
  const dropOn = async (event: DragEvent, target: PageMeta) => {
    event.preventDefault();
    const moving = drag;
    const spot = drop;
    setDrag(null);
    setDrop(null);
    if (!moving || !spot || moving === target.id) return;
    const page = pages.find((item) => item.id === moving);
    if (!page || descendantsOf(pages, moving).includes(target.id)) return;
    const before = { parentId: page.parentId, kind: page.kind, itemId: page.itemId };
    const siblings = childrenOf(pages, target.parentId).filter((item) => item.id !== moving);
    const next = siblings[siblings.findIndex((item) => item.id === target.id) + 1];
    const to = spot.where === "inside" ? { parentId: target.id, before: null }
      : target.parentId ? { parentId: target.parentId, before: spot.where === "before" ? target.id : next?.id ?? null }
        : { parentId: null, kind: target.kind, itemId: target.itemId, before: spot.where === "before" ? target.id : next?.id ?? null };
    if (target.top && spot.where !== "inside") return;
    try {
      await movePage(moving, to);
      const back = before.parentId ? { parentId: before.parentId } : { parentId: null, kind: before.kind, itemId: before.itemId };
      store.pushUndo({ label: `Move ${page.title}`, undo: async () => { await movePage(moving, back); }, redo: async () => { await movePage(moving, to); } });
      store.flash(`${page.title} moved`);
    } catch (reason) {
      store.fail(reason, "Could not move the page.");
    }
  };
  return (
    <>
      {rows.map((page) => {
        const kids = childrenOf(pages, page.id, filter).length;
        const isFolded = folded.includes(page.id);
        const mark = drop?.id === page.id ? ` drop${drop.where}` : "";
        return (
          <div key={page.id} role="none">
            <div role="treeitem" aria-level={depth + 1} aria-selected={page.id === openId} aria-expanded={kids ? !isFolded : undefined} data-page={page.id}
              className={`trow${page.id === openId ? " on" : ""}${mark}`} style={{ paddingLeft: 6 + depth * 14 }}
              draggable={!phone && !page.top} onDragStart={(event) => { event.dataTransfer.setData("text/plain", page.id); event.dataTransfer.effectAllowed = "move"; setDrag(page.id); }}
              onDragEnd={() => { setDrag(null); setDrop(null); }}
              onDragOver={(event) => {
                if (!drag || drag === page.id) return;
                event.preventDefault();
                const box = event.currentTarget.getBoundingClientRect();
                const y = (event.clientY - box.top) / box.height;
                const where = page.top ? "inside" : y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
                if (drop?.id !== page.id || drop.where !== where) setDrop({ id: page.id, where });
              }}
              onDrop={(event) => void dropOn(event, page)}
              onClick={() => open(page.id)} {...pageMenu(store, page, open)}>
              <button type="button" className="tfold" aria-label={isFolded ? `Show pages under ${page.title}` : `Hide pages under ${page.title}`} disabled={!kids}
                onClick={(event) => { event.stopPropagation(); setFolded(isFolded ? folded.filter((id) => id !== page.id) : [...folded, page.id]); }}>
                {kids ? (isFolded ? "\u25B8" : "\u25BE") : ""}
              </button>
              <span className="ttitle">{page.title}</span>
              {page.pinned && <span className="tpin" title="Pinned">*</span>}
            </div>
            {kids > 0 && !isFolded && (
              <div role="group">
                <TreeRows pages={pages} parentId={page.id} depth={depth + 1} openId={openId} open={open} drag={drag} setDrag={setDrag} drop={drop} setDrop={setDrop} phone={phone} filter={filter} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const [folded, setFolded] = useKept<boolean>(`wiki:section:${title}`, false);
  return (
    <section className="tsection">
      <h4>
        <button type="button" className="tsechead" aria-expanded={!folded} onClick={() => setFolded(!folded)}>{folded ? "\u25B8" : "\u25BE"} {title}</button>
        {action}
      </h4>
      {!folded && children}
    </section>
  );
}

function SearchResults({ term, open }: { term: string; open: (id: string) => void }) {
  const [found, setFound] = useState<Found[] | null>(null);
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      searchNotes(term).then((list) => { if (live) setFound(list); }).catch(() => { if (live) setFound([]); });
    }, 200);
    return () => { live = false; window.clearTimeout(timer); };
  }, [term]);
  if (!found) return <p className="note pad">Searching</p>;
  if (!found.length) return <p className="note pad">No pages match</p>;
  return (
    <div role="listbox" aria-label="Pages found">
      {found.map((item) => (
        <button key={item.id} type="button" role="option" aria-selected={false} className="trow found" onClick={() => open(item.id)}>
          <span className="rowmain"><span className="ttitle">{item.title}</span><span className="rowmeta">{item.snippet}</span></span>
        </button>
      ))}
    </div>
  );
}

function Tree({ scope, openId, open }: { scope: NotesScope; openId: string | null; open: (id: string) => void }) {
  const store = useApp();
  const tree = useNotesTree();
  const phone = usePhone();
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [term, setTerm] = useKept(`wiki:search:${scope ? `${scope.kind}:${scope.itemId}` : "all"}`, "");
  const pages = tree?.pages ?? [];
  const common = { pages, openId, open, drag, setDrag, drop, setDrop, phone };
  const quick = (id: string) => pages.find((page) => page.id === id);
  const list = (ids: string[], label: string) => (
    <div role="list" aria-label={label}>
      {ids.map(quick).filter((page): page is PageMeta => !!page).map((page) => (
        <button key={page.id} type="button" className={page.id === openId ? "trow on" : "trow"} onClick={() => open(page.id)} {...pageMenu(store, page, open)}>
          <span className="ttitle">{page.title}</span><span className="sub">{page.kind ? pathOf(pages, page.id).split(" > ")[0] : "My pages"}</span>
        </button>
      ))}
    </div>
  );
  if (!tree) return <div className="ntree"><p className="note pad">Loading the pages</p></div>;
  const top = scope ? topOf(pages, scope.kind, scope.itemId) : null;
  const myTops = childrenOf(pages, null, (page) => !page.kind);
  // in the Wiki a deck or collection is listed once it has text or child pages
  const shownItem = (page: PageMeta) => !page.empty || pages.some((child) => child.parentId === page.id);
  return (
    <nav className="ntree" aria-label={scope ? `${scope.name} notes` : "Wiki pages"}>
      <label className="searchbox">
        <Icon name="find" className="nicon" />
        <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search notes" aria-label="Search notes" />
      </label>
      {term.trim() ? <SearchResults term={term.trim()} open={open} /> : scope ? (
        <div role="tree" aria-label="Pages">
          {top ? <TreeRows {...common} parentId={null} depth={0} filter={(page) => page.id === top.id || page.kind === scope.kind && page.itemId === scope.itemId} />
            : <p className="note pad">Loading the pages</p>}
        </div>
      ) : (
        <>
          {pages.some((page) => page.pinned) && <Section title="Pinned">{list(pages.filter((page) => page.pinned).map((page) => page.id), "Pinned pages")}</Section>}
          {tree.recent.length > 0 && <Section title="Recent">{list(tree.recent, "Recent pages")}</Section>}
          <Section title="Decks">
            <div role="tree" aria-label="Deck pages">
              <TreeRows {...common} parentId={null} depth={0} filter={(page) => page.kind === "deck" && (!page.top || shownItem(page))} />
            </div>
            {!pages.some((page) => page.kind === "deck" && page.top && shownItem(page)) && <p className="note pad">Notes written in a deck's Notes tab show here</p>}
          </Section>
          <Section title="Collections">
            <div role="tree" aria-label="Collection pages">
              <TreeRows {...common} parentId={null} depth={0} filter={(page) => page.kind === "collection" && (!page.top || shownItem(page))} />
            </div>
            {!pages.some((page) => page.kind === "collection" && page.top && shownItem(page)) && <p className="note pad">Notes written in a collection's Notes tab show here</p>}
          </Section>
          <Section title="My pages" action={<button type="button" className="btn small" onClick={() => newPageDialog(store, {}, (page) => open(page.id))}>New page...</button>}>
            <div role="tree" aria-label="My pages">
              <TreeRows {...common} parentId={null} depth={0} filter={(page) => !page.kind} />
            </div>
            {!myTops.length && <p className="note pad">Pages not attached to a deck or collection</p>}
          </Section>
        </>
      )}
    </nav>
  );
}

// ---------- the open page ----------

const when = (at: string) => new Date(`${at.replace(" ", "T")}${/Z$|[+-]\d\d:\d\d$/.test(at) ? "" : "Z"}`).toLocaleString();

function PageView({ id, open, onGone }: { id: string; open: (id: string) => void; onGone: () => void }) {
  const store = useApp();
  const phone = usePhone();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("saved");
  const [editing, setEditing] = useState(!phone);
  const [title, setTitle] = useState("");
  const base = useRef(0);
  const pending = useRef<{ title?: string; body?: string } | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<PageDetail | null>(null);
  current.current = page;

  const load = useCallback(async (keepEditing = false) => {
    try {
      const detail = await readPage(id);
      setPage(detail);
      setTitle(detail.title);
      base.current = detail.version;
      setFailed(null);
      if (!keepEditing) pageOpened(id);
    } catch (reason) {
      setFailed(reason instanceof Error ? reason.message : "This page could not be opened.");
    }
  }, [id]);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (saving.current) {
      await saving.current;
      if (!pending.current) return;
    }
    const change = pending.current;
    const shown = current.current;
    if (!change || !shown) return;
    pending.current = null;
    setStatus("saving");
    saving.current = (async () => {
      try {
        const result = await savePage(id, { ...change, baseVersion: base.current });
        if (result.ok) {
          base.current = result.version;
          setPage((before) => (before ? { ...before, ...change, version: result.version, updatedAt: result.updatedAt } : before));
          if (change.title !== undefined || result.renamed) void reloadNotes();
          setStatus(pending.current ? "waiting" : "saved");
        } else {
          const mine = { title: change.title ?? shown.title, body: change.body ?? shown.body };
          setStatus("waiting");
          const answer = await clashDialog(mine, result.conflict);
          if (!answer) {
            pending.current = { ...change, ...pending.current };
            base.current = result.conflict.version;
            setStatus("error");
            return;
          }
          const next = await settleClash(store, id, mine, result.conflict, answer);
          if (next) {
            setPage(next);
            setTitle(next.title);
            base.current = next.version;
          }
          setStatus("saved");
        }
      } catch (reason) {
        pending.current = { ...change, ...pending.current };
        setStatus("error");
        store.fail(reason, "Could not save the page.");
      } finally {
        saving.current = null;
      }
    })();
    await saving.current;
    if (pending.current) void flush();
  }, [id, store]);

  const change = useCallback((next: { title?: string; body?: string }) => {
    pending.current = { ...pending.current, ...next };
    setStatus("waiting");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
  }, [flush]);

  useEffect(() => {
    setPage(null);
    void load();
    return () => { void flush(); };
  }, [load, flush]);

  useEffect(() => {
    // another page or device saved: show its text when nothing here is waiting
    const changed = () => {
      if (pending.current || saving.current) return;
      void readPage(id).then((detail) => {
        if (pending.current || saving.current || detail.version === base.current && detail.title === current.current?.title) return;
        setPage(detail);
        setTitle(detail.title);
        base.current = detail.version;
      }).catch(() => onGone());
    };
    const hidden = () => { if (document.visibilityState === "hidden") void flush(); };
    window.addEventListener(NOTES_CHANGED, changed);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener(NOTES_CHANGED, changed);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [id, flush, onGone]);

  // the app found a clash while sending changes made offline
  useEffect(() => {
    const clash = (event: Event) => {
      const detail = (event as CustomEvent<ClashDetail>).detail;
      if (detail.pageId !== id) return;
      void clashDialog(detail.mine, detail.theirs).then(async (answer) => {
        if (!answer) return;
        const next = await settleClash(store, id, detail.mine, detail.theirs, answer);
        if (next) { setPage(next); setTitle(next.title); base.current = next.version; }
      });
    };
    window.addEventListener(NOTE_CLASH, clash);
    return () => window.removeEventListener(NOTE_CLASH, clash);
  }, [id, store]);

  const meta = useNotesTree()?.pages.find((item) => item.id === id) ?? null;
  if (failed) return <div className="npage"><div className="empty"><b>{failed}</b></div></div>;
  if (!page) return <div className="npage"><p className="note pad">Loading the page</p></div>;
  const near = { kind: page.kind, itemId: page.itemId };
  const openTitle = async (linked: string) => {
    await flush();
    const target = findByTitle(notesTree()?.pages ?? [], linked, near);
    if (target) return open(target.id);
    // a link to a missing page makes the page, beside the page it is on
    try {
      const made = await createPage({ title: linked, parentId: page.top ? page.id : page.parentId, kind: page.kind, itemId: page.itemId });
      store.flash(`Page ${linked} made`);
      open(made.id);
    } catch (reason) {
      store.fail(reason, "Could not make the page.");
    }
  };
  const statusText = status === "saving" ? "Saving" : status === "waiting" ? "Not saved yet" : status === "error" ? "Not saved" : "Saved";
  return (
    <div className="npage">
      <div className="nhead">
        {page.top
          ? <h2 className="ntitle">{page.title}</h2>
          : <input className="ntitle" aria-label="Page title" value={title} readOnly={!editing} maxLength={200}
            onChange={(event) => { setTitle(event.target.value); if (event.target.value.trim()) change({ title: event.target.value.trim() }); }} />}
        <span className={`nstatus ${status}`} role="status" aria-label="Save status">{statusText}</span>
        <span className="btnrow">
          {phone && <button type="button" className={editing ? "btn small on" : "btn small"} onClick={() => { if (editing) void flush(); setEditing(!editing); }}>{editing ? "Done" : "Edit"}</button>}
          <button type="button" className="btn small" onClick={() => newPageDialog(store, { parentId: page.id }, (made) => open(made.id))}>New child page...</button>
          {meta && <button type="button" className="btn small" aria-pressed={page.pinned} onClick={() => void pinPage(page.id, !page.pinned).then(() => setPage({ ...page, pinned: !page.pinned }))}>{page.pinned ? "Unpin" : "Pin"}</button>}
          <button type="button" className="btn small" onClick={() => void flush().then(() => historyDialog({ ...page, title }, (next) => { setPage(next); setTitle(next.title); base.current = next.version; }))}>History...</button>
          {meta && <button type="button" className="btn small" aria-label="More" onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            pageMenu(store, meta, open).onContextMenu({ preventDefault: () => undefined, clientX: box.left, clientY: box.bottom } as unknown as React.MouseEvent);
          }}>More...</button>}
        </span>
      </div>
      <div className="nsub">{page.updatedBy ? `Saved ${when(page.updatedAt)} by ${page.updatedBy}` : `Saved ${when(page.updatedAt)}`}{page.kind ? `, in ${pathOf(notesTree()?.pages ?? [], page.id).split(" > ")[0]}` : ", in My pages"}</div>
      <NoteEditor pageId={page.id} body={page.body} editable={editing} near={near} onChange={(body) => change({ body })} onOpenPage={(linked) => void openTitle(linked)}
        onTick={() => undefined} />
      {page.backlinks.length > 0 && (
        <div className="nbacklinks">
          <h4>Linked from</h4>
          {page.backlinks.map((link) => <button key={link.id} type="button" className="lnk" onClick={() => open(link.id)}>{link.title}</button>)}
        </div>
      )}
    </div>
  );
}

// ---------- the pane ----------

/** Opens a page in the Wiki tab. */
export function openWikiPage(id: string) {
  setKept("wiki:open", id);
}


/**
 * The tree on the left and the open page on the right (on a phone the tree is a list opened with Pages). With a scope
 * it shows one deck's or collection's notes; without one it is the Wiki.
 */
export function NotesPane({ scope, view }: { scope: NotesScope; view: string }) {
  const store = useApp();
  const phone = usePhone();
  const key = scope ? `${view}:notes:${scope.kind}:${scope.itemId}` : `${view}:open`;
  const [openId, setOpenId] = useKept<string | null>(key, null);
  const [showTree, setShowTree] = useKept<boolean>(`${key}:tree`, !scope);
  const tree = useNotesTree();
  useEffect(() => {
    if (!scope || openId) return;
    let live = true;
    openItemNotes(scope.kind, scope.itemId).then((top) => { if (live) setOpenId(top.id); })
      .catch((reason) => store.fail(reason, "Could not open the notes."));
    return () => { live = false; };
  }, [scope?.kind, scope?.itemId, openId, setOpenId, store]);
  // a page that was deleted or moved away is closed
  const known = openId && tree?.pages.some((page) => page.id === openId);
  useEffect(() => {
    if (tree && openId && !known && !scope) setOpenId(null);
  }, [tree, openId, known, scope, setOpenId]);
  const open = (id: string) => {
    setOpenId(id);
    if (phone) setShowTree(false);
  };
  // a page opened from outside (New page... in the Wiki's header or a menu) shows on a phone too
  const lastOpen = useRef(openId);
  useEffect(() => {
    if (phone && openId && openId !== lastOpen.current) setShowTree(false);
    lastOpen.current = openId;
  }, [openId, phone, setShowTree]);
  const where = useMemo(() => (scope ? { kind: scope.kind, itemId: scope.itemId } : {}), [scope]);
  return (
    <div className={`notespane${phone ? " phone" : ""}${phone && showTree ? " treeshown" : ""}`}>
      {(!phone || showTree) && <Tree scope={scope} openId={openId} open={open} />}
      {(!phone || !showTree) && (
        <div className="nmain">
          {phone && <div className="btnrow nphonebar"><button type="button" className="btn small" onClick={() => setShowTree(true)}>Pages</button></div>}
          {openId ? <PageView key={openId} id={openId} open={open} onGone={() => setOpenId(null)} /> : (
            <div className="empty">
              <Icon name="notes" />
              <b>{scope ? "Loading the notes" : "Open a page from the list, or make one"}</b>
              {!scope && (
                <span className="btnrow">
                  <button type="button" className="btn primary" onClick={() => newPageDialog(store, where, (page) => open(page.id))}>New page...</button>
                  <button type="button" className="btn" onClick={() => newPageFromWeb(store, where, (page) => open(page.id))}>New page from web address...</button>
                  <button type="button" className="btn" onClick={() => void importPages(store, where)}>Import pages...</button>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { closeDialog, type Template };
