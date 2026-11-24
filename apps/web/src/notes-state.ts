// ---------- notes (0.22.0): the page tree shared by the Wiki tab and the Notes tabs, and the calls to the server ----------
import { useEffect, useSyncExternalStore } from "react";
import { request } from "./api";
import { setFileResolver, setTitleCheck } from "./notes-md";
import { apiUrl, isApp } from "./android/platform";
import { localFile } from "./note-files";
import { SYNCED_EVENT } from "./android/offline";

// pictures load from the server; in the Android app from its address, or from the phone for pictures not sent yet
setFileResolver((src) => localFile(src) ?? (isApp() && src.startsWith("/") ? apiUrl(src) : src));

export type NoteKind = "deck" | "collection";
export type PageMeta = {
  id: string; title: string; kind: NoteKind | null; itemId: string | null; parentId: string | null; position: number;
  updatedAt: string; updatedBy: string; version: number; pinned: boolean; empty: boolean; top: boolean; builtin?: string | null;
};
export type Template = { id: string; name: string; body: string; builtIn: boolean };
export type NotesTree = { pages: PageMeta[]; items: Array<{ kind: NoteKind; id: string; name: string }>; recent: string[]; templates: Template[] };
export type PageDetail = {
  id: string; title: string; body: string; kind: NoteKind | null; itemId: string | null; parentId: string | null; position: number; version: number;
  updatedAt: string; updatedBy: string; createdAt: string; top: boolean; backlinks: Array<{ id: string; title: string }>; pinned: boolean; builtin?: string | null;
};
export type Conflict = { title: string; body: string; version: number; updatedBy: string; updatedAt: string };
export type Version = { id: number; title: string; at: string; by: string; body: string };
export type Found = { id: string; title: string; snippet: string };

/** Sent by live updates when another page or device changed notes. */
export const NOTES_CHANGED = "mana-vault-notes-changed";
export { NOTE_CLASH } from "./note-files";
export type ClashDetail = { pageId: string; mine: { title: string; body: string }; theirs: Conflict };

const enc = encodeURIComponent;
let tree: NotesTree | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: NotesTree) {
  tree = next;
  const titles = new Set(next.pages.map((page) => page.title.toLowerCase()));
  setTitleCheck((title) => titles.has(title.toLowerCase()));
  for (const listener of listeners) listener();
}

/** Loads the tree again (after a change here, or one reported by a live update). */
export function reloadNotes(): Promise<void> {
  loading ??= request<NotesTree>("/api/notes").then(publish).catch(() => undefined).finally(() => { loading = null; });
  return loading;
}

export const notesTree = () => tree;

/** The tree, loaded on first use and kept up to date by live updates. */
export function useNotesTree(): NotesTree | null {
  const value = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, () => tree);
  useEffect(() => {
    if (!tree) void reloadNotes();
    const changed = () => void reloadNotes();
    window.addEventListener(NOTES_CHANGED, changed);
    // the Android app brought its copy up to date
    window.addEventListener(SYNCED_EVENT, changed);
    return () => {
      window.removeEventListener(NOTES_CHANGED, changed);
      window.removeEventListener(SYNCED_EVENT, changed);
    };
  }, []);
  return value;
}

// ---------- tree helpers ----------

export const childrenOf = (pages: PageMeta[], parentId: string | null, filter?: (page: PageMeta) => boolean) =>
  pages.filter((page) => page.parentId === parentId && (!filter || filter(page))).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));

export function descendantsOf(pages: PageMeta[], id: string): string[] {
  const found: string[] = [];
  const walk = (parent: string) => {
    for (const child of pages.filter((page) => page.parentId === parent)) {
      if (found.includes(child.id)) continue;
      found.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return found;
}

export const topOf = (pages: PageMeta[], kind: NoteKind, itemId: string) => pages.find((page) => page.top && page.kind === kind && page.itemId === itemId) ?? null;

/** The page a link names: one in the same deck or collection first, then any page with that title. */
export function findByTitle(pages: PageMeta[], title: string, near?: { kind: NoteKind | null; itemId: string | null }): PageMeta | null {
  const wanted = title.trim().toLowerCase();
  const same = pages.filter((page) => page.title.toLowerCase() === wanted);
  return same.find((page) => near && page.kind === near.kind && page.itemId === near.itemId) ?? same[0] ?? null;
}

/** "Deck > Page > Child" for a page, for lists and the Move to list. */
export function pathOf(pages: PageMeta[], id: string): string {
  const names: string[] = [];
  let page = pages.find((item) => item.id === id);
  const seen = new Set<string>();
  while (page && !seen.has(page.id)) {
    seen.add(page.id);
    names.unshift(page.title);
    page = page.parentId ? pages.find((item) => item.id === page!.parentId) : undefined;
  }
  return names.join(" > ");
}

// ---------- calls ----------

export const readPage = (id: string) => request<PageDetail>(`/api/notes/pages/${enc(id)}`);

export async function openItemNotes(kind: NoteKind, itemId: string): Promise<PageDetail> {
  const page = await request<PageDetail>(`/api/notes/items/${kind}/${enc(itemId)}`, { method: "POST", body: JSON.stringify({ id: crypto.randomUUID() }) });
  if (!tree?.pages.some((item) => item.id === page.id)) void reloadNotes();
  return page;
}

export async function createPage(input: { title: string; body?: string; parentId?: string | null; kind?: NoteKind | null; itemId?: string | null; before?: string | null }): Promise<PageDetail> {
  const page = await request<PageDetail>("/api/notes/pages", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), ...input }) });
  await reloadNotes();
  return page;
}

export type SaveResult = { ok: true; version: number; updatedAt: string; renamed: number } | { ok: false; conflict: Conflict } ;

/** Saves a page. A save made from an older version than the server's comes back as a clash to settle. */
export async function savePage(id: string, change: { title?: string; body?: string; baseVersion: number; force?: boolean }): Promise<SaveResult> {
  try {
    const result = await request<{ version: number; updatedAt: string; renamed: number }>(`/api/notes/pages/${enc(id)}`, { method: "PUT", body: JSON.stringify(change) });
    return { ok: true, ...result };
  } catch (reason) {
    const conflict = (reason as { body?: { conflict?: Conflict } }).body?.conflict;
    if (conflict) return { ok: false, conflict };
    throw reason;
  }
}

export async function movePage(id: string, to: { parentId: string | null; kind?: NoteKind | null; itemId?: string | null; before?: string | null }) {
  const result = await request<{ before: { parentId: string | null; kind: NoteKind | null; itemId: string | null; position: number } }>(
    `/api/notes/pages/${enc(id)}/move`, { method: "PATCH", body: JSON.stringify(to) });
  await reloadNotes();
  return result.before;
}

export type DeleteUndo = { deleted: string[]; lifted: Array<{ id: string; parentId: string | null; position: number }> };
export async function deletePage(id: string, children: "delete" | "lift"): Promise<DeleteUndo> {
  const result = await request<{ undo: DeleteUndo }>(`/api/notes/pages/${enc(id)}?children=${children}`, { method: "DELETE" });
  await reloadNotes();
  return result.undo;
}

export async function restorePages(undo: DeleteUndo) {
  await request("/api/notes/restore", { method: "POST", body: JSON.stringify(undo) });
  await reloadNotes();
}

export async function pinPage(id: string, pinned: boolean) {
  await request(`/api/notes/pages/${enc(id)}/pin`, { method: "PUT", body: JSON.stringify({ pinned }) });
  await reloadNotes();
}

export function pageOpened(id: string) {
  void request(`/api/notes/pages/${enc(id)}/opened`, { method: "POST", body: "{}" }).then(() => {
    if (tree) publish({ ...tree, recent: [id, ...tree.recent.filter((item) => item !== id)].slice(0, 10) });
  }).catch(() => undefined);
}

export const pageVersions = (id: string) => request<Version[]>(`/api/notes/pages/${enc(id)}/versions`);
export const restoreVersion = (id: string, version: number) =>
  request<PageDetail>(`/api/notes/pages/${enc(id)}/versions/${version}/restore`, { method: "POST", body: "{}" });
export const searchNotes = (query: string) => request<Found[]>(`/api/notes/search?q=${enc(query)}`);

export async function saveTemplate(name: string, body: string): Promise<Template> {
  const template = await request<Template>("/api/notes/templates", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), name, body }) });
  await reloadNotes();
  return template;
}
export async function renameTemplate(id: string, name: string) {
  await request(`/api/notes/templates/${enc(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
  await reloadNotes();
}
export async function deleteTemplate(id: string): Promise<Template> {
  const result = await request<{ template: Template }>(`/api/notes/templates/${enc(id)}`, { method: "DELETE" });
  await reloadNotes();
  return result.template;
}

/** Reads a picture file and sends it to the server. Large pictures are made smaller first (2,000 pixels at most). */
export async function uploadPicture(file: Blob, name: string, pageId: string | null): Promise<string> {
  const { data, type } = await shrink(file);
  const result = await request<{ url: string }>("/api/notes/files", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), pageId, name, type, data }) });
  return result.url;
}

const MAX_EDGE = 2000;
async function shrink(file: Blob): Promise<{ data: string; type: string }> {
  const read = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The picture could not be read."));
    reader.readAsDataURL(blob);
  });
  const type = file.type || "image/png";
  if (type === "image/svg+xml" || type === "image/gif" || typeof createImageBitmap === "undefined") return { data: (await read(file)).replace(/^data:[^,]*,/, ""), type };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2 * 1024 * 1024) return { data: (await read(file)).replace(/^data:[^,]*,/, ""), type };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const outType = type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outType, 0.88));
    if (!blob) return { data: (await read(file)).replace(/^data:[^,]*,/, ""), type };
    return { data: (await read(blob)).replace(/^data:[^,]*,/, ""), type: outType };
  } catch {
    return { data: (await read(file)).replace(/^data:[^,]*,/, ""), type };
  }
}

/** Keeps a copy of a picture from the web (0.23.0). Returns its address on the server. */
export async function copyPicture(url: string, pageId: string | null): Promise<string> {
  const result = await request<{ url: string }>("/api/notes/files/copy", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), url, pageId }) });
  return result.url;
}

/** Copies every web picture in a page's markdown. Pictures that cannot be copied keep their web address. */
export async function copyWebPictures(markdown: string, pageId: string | null, pictures: string[]): Promise<{ markdown: string; failed: string[] }> {
  const failed: string[] = [];
  let out = markdown;
  for (const url of pictures) {
    try {
      const copy = await copyPicture(url, pageId);
      out = out.split(`](${url})`).join(`](${copy})`);
    } catch {
      failed.push(url);
    }
  }
  return { markdown: out, failed };
}

/** Fetches a web page through the server, for New page from web address.... */
export const fetchWebPage = (url: string) => request<{ url: string; html: string }>("/api/notes/fetch", { method: "POST", body: JSON.stringify({ url }) });

/** The newest printing of a card named in a card link, for its picture. Kept for the session. */
const cards = new Map<string, Promise<{ id: string; name: string; image_url: string | null } | null>>();
export function cardForLink(name: string) {
  const key = name.toLowerCase();
  if (!cards.has(key)) cards.set(key, request<{ id: string; name: string; image_url: string | null }>(`/api/notes/card?name=${enc(name)}`).catch(() => { cards.delete(key); return null; }));
  return cards.get(key)!;
}
