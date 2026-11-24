// ---------- notes in the Android app (0.22.0): pages kept on the phone, read, searched and changed without a connection ----------
import { keepLocalFile } from "../note-files";
import type { NotesTree, PageDetail, PageMeta } from "../notes-state";
import { catalog } from "./catalog";
import { idbGet, idbSet } from "./idb";

type Local = { response: unknown; label: string; url?: string };
const enc = encodeURIComponent;
const TREE = "/api/notes";
const pageUrl = (id: string) => `/api/notes/pages/${enc(id)}`;
const getCopy = <T>(url: string) => idbGet<T>("cache", url);
const setCopy = (url: string, value: unknown) => idbSet("cache", url, value);
const stamp = () => new Date().toISOString().replace("T", " ").replace("Z", "");

async function treeCopy(): Promise<NotesTree> {
  return (await getCopy<NotesTree>(TREE)) ?? { pages: [], items: [], recent: [], templates: [] };
}

async function saveMeta(meta: PageMeta) {
  const tree = await treeCopy();
  await setCopy(TREE, { ...tree, pages: [...tree.pages.filter((page) => page.id !== meta.id), meta] });
}

function metaOf(page: PageDetail): PageMeta {
  return {
    id: page.id, title: page.title, kind: page.kind, itemId: page.itemId, parentId: page.parentId, position: page.position, updatedAt: page.updatedAt,
    updatedBy: page.updatedBy, version: page.version, pinned: page.pinned, empty: page.body === "", top: page.top, builtin: page.builtin,
  };
}

async function itemName(kind: string, id: string): Promise<string> {
  const list = (await getCopy<Array<{ id: string; name: string }>>(kind === "deck" ? "/api/decks" : "/api/collections")) ?? [];
  return list.find((item) => item.id === id)?.name ?? "Notes";
}

function nextPosition(tree: NotesTree, parentId: string | null) {
  return Math.max(0, ...tree.pages.filter((page) => page.parentId === parentId).map((page) => page.position)) + 1;
}

/** Applies a notes change to the copy on the phone. Null when the change needs a connection. */
export async function applyNotesLocally(method: string, path: string, body: Record<string, unknown>): Promise<Local | null> {
  let match: RegExpExecArray | null;
  if (method === "POST" && (match = /^\/api\/notes\/items\/(deck|collection)\/([^/]+)$/.exec(path))) {
    const kind = match[1] as "deck" | "collection";
    const itemId = decodeURIComponent(match[2]!);
    const tree = await treeCopy();
    const top = tree.pages.find((page) => page.top && page.kind === kind && page.itemId === itemId);
    if (top) {
      const detail = await getCopy<PageDetail>(pageUrl(top.id));
      if (detail) return { response: detail, label: `Open notes of ${top.title}` };
    }
    const title = await itemName(kind, itemId);
    const detail: PageDetail = {
      id: typeof body.id === "string" ? body.id : crypto.randomUUID(), title, body: "", kind, itemId, parentId: null, position: 0, version: 1,
      updatedAt: stamp(), updatedBy: "", createdAt: stamp(), top: true, backlinks: [], pinned: false,
    };
    await setCopy(pageUrl(detail.id), detail);
    await saveMeta(metaOf(detail));
    return { response: detail, label: `Notes of ${title}` };
  }
  if (method === "POST" && path === "/api/notes/pages" && typeof body.id === "string" && typeof body.title === "string") {
    const tree = await treeCopy();
    let parentId = typeof body.parentId === "string" ? body.parentId : null;
    let kind = null as PageDetail["kind"];
    let itemId: string | null = null;
    if (parentId) {
      const parent = tree.pages.find((page) => page.id === parentId);
      if (!parent) return null;
      kind = parent.kind;
      itemId = parent.itemId;
    } else if ((body.kind === "deck" || body.kind === "collection") && typeof body.itemId === "string") {
      const top = tree.pages.find((page) => page.top && page.kind === body.kind && page.itemId === body.itemId);
      if (!top) return null;
      kind = body.kind;
      itemId = body.itemId;
      parentId = top.id;
    }
    const siblings = tree.pages.filter((page) => page.parentId === parentId && (parentId !== null || !page.kind)).sort((a, b) => a.position - b.position);
    const last = siblings[siblings.length - 1];
    const position = !parentId && !body.before && last?.builtin === "about" ? last.position - 0.5 : nextPosition(tree, parentId);
    const detail: PageDetail = {
      id: body.id, title: body.title.trim(), body: typeof body.body === "string" ? body.body : "", kind, itemId, parentId, position,
      version: 1, updatedAt: stamp(), updatedBy: "", createdAt: stamp(), top: false, backlinks: [], pinned: false,
    };
    await setCopy(pageUrl(detail.id), detail);
    await saveMeta(metaOf(detail));
    return { response: detail, label: `New page ${detail.title}` };
  }
  if (method === "PUT" && (match = /^\/api\/notes\/pages\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(match[1]!);
    const detail = await getCopy<PageDetail>(pageUrl(id));
    if (!detail) return null;
    const next: PageDetail = {
      ...detail, title: typeof body.title === "string" && !detail.top ? body.title.trim() : detail.title, body: typeof body.body === "string" ? body.body : detail.body,
      version: detail.version + 1, updatedAt: stamp(),
    };
    await setCopy(pageUrl(id), next);
    await saveMeta(metaOf(next));
    return { response: { version: next.version, updatedAt: next.updatedAt, renamed: 0 }, label: `Change page ${next.title}` };
  }
  if (method === "PATCH" && (match = /^\/api\/notes\/pages\/([^/]+)\/move$/.exec(path))) {
    const id = decodeURIComponent(match[1]!);
    const tree = await treeCopy();
    const page = tree.pages.find((item) => item.id === id);
    if (!page || page.top) return null;
    const before = { parentId: page.parentId, kind: page.kind, itemId: page.itemId, position: page.position };
    let parentId = typeof body.parentId === "string" ? body.parentId : null;
    let kind = null as PageMeta["kind"];
    let itemId: string | null = null;
    if (parentId) {
      const parent = tree.pages.find((item) => item.id === parentId);
      if (!parent) return null;
      kind = parent.kind;
      itemId = parent.itemId;
    } else if ((body.kind === "deck" || body.kind === "collection") && typeof body.itemId === "string") {
      const top = tree.pages.find((item) => item.top && item.kind === body.kind && item.itemId === body.itemId);
      if (!top) return null;
      kind = body.kind;
      itemId = body.itemId;
      parentId = top.id;
    }
    const moving = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of tree.pages) if (item.parentId && moving.has(item.parentId) && !moving.has(item.id)) { moving.add(item.id); grew = true; }
    }
    const beforeSibling = typeof body.before === "string" ? tree.pages.find((item) => item.id === body.before) : undefined;
    const position = beforeSibling ? beforeSibling.position - 0.5 : nextPosition(tree, parentId);
    const pages = tree.pages.map((item) => (item.id === id ? { ...item, parentId, kind, itemId, position } : moving.has(item.id) ? { ...item, kind, itemId } : item));
    await setCopy(TREE, { ...tree, pages });
    return { response: { status: "moved", before }, label: `Move page ${page.title}` };
  }
  if (method === "DELETE" && (match = /^\/api\/notes\/pages\/([^/]+)$/.exec(path))) {
    const id = decodeURIComponent(match[1]!);
    const tree = await treeCopy();
    const page = tree.pages.find((item) => item.id === id);
    if (!page || page.top) return null;
    const lift = /children=lift/.test(path) || body.children === "lift";
    const deleted = [id];
    if (!lift) {
      let grew = true;
      while (grew) {
        grew = false;
        for (const item of tree.pages) if (item.parentId && deleted.includes(item.parentId) && !deleted.includes(item.id)) { deleted.push(item.id); grew = true; }
      }
    }
    if (tree.pages.some((item) => deleted.includes(item.id) && item.builtin === "about")) return null;
    const lifted = lift ? tree.pages.filter((item) => item.parentId === id).map((item) => ({ id: item.id, parentId: id, position: item.position })) : [];
    const pages = tree.pages.filter((item) => !deleted.includes(item.id)).map((item) => (item.parentId === id ? { ...item, parentId: page.parentId } : item));
    await setCopy(TREE, { ...tree, pages });
    return { response: { status: "deleted", undo: { deleted, lifted } }, label: `Delete page ${page.title}` };
  }
  if (method === "PUT" && (match = /^\/api\/notes\/pages\/([^/]+)\/pin$/.exec(path))) {
    const id = decodeURIComponent(match[1]!);
    const tree = await treeCopy();
    await setCopy(TREE, { ...tree, pages: tree.pages.map((item) => (item.id === id ? { ...item, pinned: body.pinned === true } : item)) });
    const detail = await getCopy<PageDetail>(pageUrl(id));
    if (detail) await setCopy(pageUrl(id), { ...detail, pinned: body.pinned === true });
    return { response: { pinned: body.pinned === true }, label: body.pinned === true ? "Pin a page" : "Unpin a page" };
  }
  if (method === "POST" && path === "/api/notes/files" && typeof body.id === "string" && typeof body.data === "string" && typeof body.type === "string") {
    const url = `/api/notes/files/${body.id}`;
    keepLocalFile(url, `data:${body.type};base64,${body.data}`);
    return { response: { id: body.id, url }, label: `Add picture ${typeof body.name === "string" ? body.name : ""}`.trim() };
  }
  return null;
}

/** Answers notes questions from the copy on the phone. Undefined when the address is not a notes address. */
export async function answerNotes(path: string, query: URLSearchParams): Promise<unknown> {
  if (path === "/api/notes/search") {
    const words = (query.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const tree = await treeCopy();
    const found: Array<{ id: string; title: string; snippet: string }> = [];
    for (const meta of tree.pages) {
      const detail = await getCopy<PageDetail>(pageUrl(meta.id));
      const text = (detail?.body ?? "").replace(/[#*_`>[\]|]+/g, " ").replace(/\s+/g, " ").trim();
      const hay = `${meta.title} ${text}`.toLowerCase();
      if (!words.length || !words.every((word) => hay.includes(word))) continue;
      const at = Math.max(0, text.toLowerCase().indexOf(words[0]!) - 50);
      found.push({ id: meta.id, title: meta.title, snippet: `${at > 0 ? "..." : ""}${text.slice(at, at + 140)}` });
    }
    return found;
  }
  if (path === "/api/notes/card") {
    const name = (query.get("name") ?? "").trim().toLowerCase();
    const cards = (await catalog())?.cards ?? [];
    const card = cards.filter((item) => item.name.toLowerCase() === name || item.name.toLowerCase().startsWith(`${name} // `))
      .sort((a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? ""))[0];
    if (!card) throw new Error(`No card named ${query.get("name") ?? ""} in the card database`);
    return { id: card.id, name: card.name, image_url: card.image_url };
  }
  return undefined;
}

/** Brings the pages on the phone up to date: the tree, then each page whose version changed. */
export async function refreshNotes(get: <T>(url: string) => Promise<T | null>): Promise<void> {
  const before = await treeCopy();
  const tree = await get<NotesTree>(TREE);
  if (!tree) return;
  for (const page of tree.pages) {
    const old = before.pages.find((item) => item.id === page.id);
    if (old && old.version === page.version && (await getCopy(pageUrl(page.id))) !== undefined) continue;
    await get(pageUrl(page.id));
  }
}
