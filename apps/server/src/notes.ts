// ---------- notes and the Wiki (0.22.0): pages of markdown in trees, on decks, on collections and on their own ----------
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { access } from "./library.js";
import { logDeck } from "./decks.js";

export type NoteKind = "deck" | "collection";
type Row = Record<string, unknown>;

/** Limits. */
export const TITLE_LIMIT = 200;
export const BODY_LIMIT = 500_000;
export const FILE_LIMIT = 20 * 1024 * 1024;
/** Saves by the same account within this time join one version. */
export const VERSION_JOIN_MS = 10 * 60_000;
/** Versions kept: the newest 50, and the last one of each day for 90 days. */
export const VERSIONS_KEPT = 50;
export const VERSION_DAYS = 90;
const RECENT_KEPT = 10;
const FILE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif"]);
/** Picture addresses are public but long random codes, so the Android app and exported pages can show them. */
export const NOTES_PUBLIC = /^\/api\/notes\/files\/[0-9a-f-]{36}$/;
const ID = /^[0-9a-f-]{36}$/i;
const now = "strftime('%Y-%m-%d %H:%M:%f', 'now')";

/** The built-in templates; the account's own templates come after them. */
export const BUILT_IN_TEMPLATES: Array<{ id: string; name: string; body: string }> = [
  {
    id: "builtin:primer", name: "Deck primer",
    body: "## Overview\n\nWhat the deck does.\n\n## Game plan\n\nHow the deck wins.\n\n## Key cards\n\n- Card name\n\n## Mulligans\n\nWhat a keepable hand looks like.\n\n## Combos\n\n- Pieces and result\n\n## Matchups\n\n| Matchup | Plan |\n| --- | --- |\n| Opponent | Plan |\n\n## Changes\n\n- Date: change\n",
  },
  {
    id: "builtin:combo", name: "Combo",
    body: "## Pieces\n\n- Card name\n\n## Steps\n\n1. First step\n\n## Results\n\nWhat the combo does.\n",
  },
  {
    id: "builtin:sideboard", name: "Sideboard guide",
    body: "## Sideboard guide\n\n| Matchup | In | Out |\n| --- | --- | --- |\n| Opponent | Cards in | Cards out |\n",
  },
  {
    id: "builtin:plan", name: "Collection plan",
    body: "## Goals\n\nWhat this collection is for.\n\n## Wanted cards\n\n- [ ] Card name\n\n## Notes\n\nAnything else.\n",
  },
];

export function initializeNotes(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS note_pages (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT CHECK(kind IN ('deck', 'collection')),
      item_id TEXT,
      parent_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      position REAL NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (${now}),
      updated_at TEXT NOT NULL DEFAULT (${now}),
      updated_by INTEGER,
      builtin TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS note_pages_item ON note_pages(kind, item_id);
    CREATE INDEX IF NOT EXISTS note_pages_parent ON note_pages(parent_id);
    CREATE INDEX IF NOT EXISTS note_pages_owner ON note_pages(owner_id);
    CREATE TABLE IF NOT EXISTS note_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL REFERENCES note_pages(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (${now}),
      by INTEGER,
      client TEXT
    );
    CREATE INDEX IF NOT EXISTS note_versions_page ON note_versions(page_id, at);
    CREATE TABLE IF NOT EXISTS note_pins (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page_id TEXT NOT NULL REFERENCES note_pages(id) ON DELETE CASCADE,
      at TEXT NOT NULL DEFAULT (${now}),
      PRIMARY KEY (user_id, page_id)
    );
    CREATE TABLE IF NOT EXISTS note_recent (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page_id TEXT NOT NULL REFERENCES note_pages(id) ON DELETE CASCADE,
      at TEXT NOT NULL DEFAULT (${now}),
      PRIMARY KEY (user_id, page_id)
    );
    CREATE TABLE IF NOT EXISTS note_templates (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (${now})
    );
    CREATE TABLE IF NOT EXISTS note_files (
      id TEXT PRIMARY KEY,
      page_id TEXT REFERENCES note_pages(id) ON DELETE SET NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      bytes BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (${now})
    );
    CREATE TRIGGER IF NOT EXISTS note_pages_deck_gone AFTER DELETE ON decks BEGIN
      DELETE FROM note_pages WHERE kind = 'deck' AND item_id = OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS note_pages_collection_gone AFTER DELETE ON collections BEGIN
      DELETE FROM note_pages WHERE kind = 'collection' AND item_id = OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS note_pages_gone AFTER DELETE ON note_pages BEGIN
      DELETE FROM note_versions WHERE page_id = OLD.id;
      DELETE FROM note_pins WHERE page_id = OLD.id;
      DELETE FROM note_recent WHERE page_id = OLD.id;
      DELETE FROM note_files WHERE page_id = OLD.id;
    END;
  `);
  const columns = new Set(database.prepare("PRAGMA table_info(note_pages)").all().map((row) => String(row.name)));
  if (!columns.has("builtin")) database.exec("ALTER TABLE note_pages ADD COLUMN builtin TEXT");
  // pages deleted more than a day ago are gone for good (undo works for an hour)
  database.prepare("DELETE FROM note_pages WHERE deleted_at IS NOT NULL AND deleted_at < strftime('%Y-%m-%d %H:%M:%f', 'now', '-1 day')").run();
  descriptionPages(database);
}

/** Every deck description becomes the body of the deck's top page (0.22.0); decks without one get no page yet. */
export function descriptionPages(database: DatabaseSync): void {
  const decks = database.prepare(
    `SELECT d.id, d.name, d.owner_id, d.description FROM decks d WHERE COALESCE(d.description, '') != ''
       AND NOT EXISTS (SELECT 1 FROM note_pages p WHERE p.kind = 'deck' AND p.item_id = d.id AND p.parent_id IS NULL AND p.deleted_at IS NULL)`,
  ).all();
  for (const deck of decks) {
    const id = randomUUID();
    database.prepare("INSERT INTO note_pages (id, owner_id, kind, item_id, parent_id, title, body, updated_by) VALUES (?, ?, 'deck', ?, NULL, ?, ?, ?)")
      .run(id, Number(deck.owner_id), String(deck.id), String(deck.name), String(deck.description), Number(deck.owner_id));
    database.prepare("INSERT INTO note_versions (page_id, title, body, by) VALUES (?, ?, ?, ?)").run(id, String(deck.name), String(deck.description), Number(deck.owner_id));
  }
}

// ---------- access ----------

/** The SQL condition for pages an account can read and change (all members of a deck or collection can change it). */
const READABLE = `p.deleted_at IS NULL AND (
  (p.item_id IS NULL AND p.owner_id = :me)
  OR (p.kind = 'deck' AND p.item_id IN (SELECT id FROM decks WHERE owner_id = :me UNION SELECT item_id FROM members WHERE kind = 'deck' AND user_id = :me))
  OR (p.kind = 'collection' AND p.item_id IN (SELECT id FROM collections WHERE owner_id = :me UNION SELECT item_id FROM members WHERE kind = 'collection' AND user_id = :me)))`;

type Page = {
  id: string; owner_id: number; kind: NoteKind | null; item_id: string | null; parent_id: string | null; title: string; body: string;
  position: number; version: number; created_at: string; updated_at: string; updated_by: number | null; builtin: string | null;
};

function pageOf(database: DatabaseSync, id: string, userId: number): Page | null {
  const row = database.prepare(`SELECT * FROM note_pages p WHERE p.id = :id AND ${READABLE}`).get({ id, me: userId });
  return row ? toPage(row) : null;
}

const toPage = (row: Row): Page => ({
  id: String(row.id), owner_id: Number(row.owner_id), kind: (row.kind as NoteKind | null) ?? null, item_id: (row.item_id as string | null) ?? null,
  parent_id: (row.parent_id as string | null) ?? null, title: String(row.title), body: String(row.body), position: Number(row.position),
  version: Number(row.version), created_at: String(row.created_at), updated_at: String(row.updated_at), updated_by: row.updated_by === null ? null : Number(row.updated_by),
  builtin: typeof row.builtin === "string" ? row.builtin : null,
});

function itemName(database: DatabaseSync, kind: NoteKind, id: string): string | null {
  const row = database.prepare(`SELECT name FROM ${kind === "deck" ? "decks" : "collections"} WHERE id = ?`).get(id);
  return row ? String(row.name) : null;
}

function userName(database: DatabaseSync, id: number | null): string {
  if (id === null) return "";
  return String(database.prepare("SELECT name FROM users WHERE id = ?").get(id)?.name ?? "");
}

/** The top page of a deck or collection, made on first use (named after it). */
export function topPage(database: DatabaseSync, kind: NoteKind, itemId: string, userId: number, wantedId?: string): string {
  const existing = database.prepare("SELECT id FROM note_pages WHERE kind = ? AND item_id = ? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY created_at LIMIT 1").get(kind, itemId);
  if (existing) return String(existing.id);
  const id = wantedId && ID.test(wantedId) && !database.prepare("SELECT 1 FROM note_pages WHERE id = ?").get(wantedId) ? wantedId.toLowerCase() : randomUUID();
  const name = itemName(database, kind, itemId) ?? "Notes";
  const body = kind === "deck" ? String(database.prepare("SELECT description FROM decks WHERE id = ?").get(itemId)?.description ?? "") : "";
  database.prepare("INSERT INTO note_pages (id, owner_id, kind, item_id, parent_id, title, body, updated_by) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)")
    .run(id, userId, kind, itemId, name, body, userId);
  return id;
}

/** A deck's description is its top page: saving one changes the other. */
export function setDeckTopBody(database: DatabaseSync, deckId: string, body: string, userId: number): void {
  const id = topPage(database, "deck", deckId, userId);
  const page = database.prepare("SELECT body FROM note_pages WHERE id = ?").get(id);
  if (String(page?.body ?? "") === body) return;
  database.prepare(`UPDATE note_pages SET body = ?, version = version + 1, updated_at = ${now}, updated_by = ? WHERE id = ?`).run(body, userId, id);
  addVersion(database, id, String(database.prepare("SELECT title FROM note_pages WHERE id = ?").get(id)?.title ?? ""), body, userId);
}

const isTop = (page: Page) => page.item_id !== null && page.parent_id === null;

// ---------- versions ----------

/**
 * Keeps a version of a page. Saves from the same page or app of the same account within 10 minutes join the newest
 * version, so typing does not make a version every second.
 */
function addVersion(database: DatabaseSync, pageId: string, title: string, body: string, userId: number, client: string | null = null): boolean {
  const last = database.prepare("SELECT id, by, at, client FROM note_versions WHERE page_id = ? ORDER BY at DESC, id DESC LIMIT 1").get(pageId);
  const lastAt = last ? Date.parse(`${String(last.at).replace(" ", "T")}Z`) : 0;
  if (last && client && last.client === client && Number(last.by) === userId && Date.now() - lastAt < VERSION_JOIN_MS) {
    database.prepare(`UPDATE note_versions SET title = ?, body = ?, at = ${now} WHERE id = ?`).run(title, body, Number(last.id));
    return false;
  }
  database.prepare("INSERT INTO note_versions (page_id, title, body, by, client) VALUES (?, ?, ?, ?, ?)").run(pageId, title, body, userId, client);
  pruneVersions(database, pageId);
  return true;
}

/** Keeps the newest 50 versions and, older than those, the last version of each day for 90 days. */
export function pruneVersions(database: DatabaseSync, pageId: string): void {
  const rows = database.prepare("SELECT id, at FROM note_versions WHERE page_id = ? ORDER BY at DESC, id DESC").all(pageId);
  const cutoff = new Date(Date.now() - VERSION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const days = new Set<string>();
  const drop: number[] = [];
  rows.forEach((row, index) => {
    const day = String(row.at).slice(0, 10);
    const firstOfDay = !days.has(day);
    days.add(day);
    if (index < VERSIONS_KEPT) return;
    if (firstOfDay && day >= cutoff) return;
    drop.push(Number(row.id));
  });
  const remove = database.prepare("DELETE FROM note_versions WHERE id = ?");
  for (const id of drop) remove.run(id);
}

// ---------- tree helpers ----------

function descendants(database: DatabaseSync, id: string): string[] {
  const found: string[] = [];
  const children = database.prepare("SELECT id FROM note_pages WHERE parent_id = ? AND deleted_at IS NULL");
  const walk = (parent: string) => {
    for (const row of children.all(parent)) {
      const child = String(row.id);
      if (found.includes(child)) continue;
      found.push(child);
      walk(child);
    }
  };
  walk(id);
  return found;
}

/** Puts a page among its siblings, before the one named (at the end without one), and numbers the siblings again. */
function placePage(database: DatabaseSync, id: string, parentId: string | null, kind: NoteKind | null, itemId: string | null, ownerId: number, before: string | null): void {
  const siblings = parentId
    ? database.prepare("SELECT id FROM note_pages WHERE parent_id = ? AND deleted_at IS NULL AND id != ? ORDER BY position, created_at").all(parentId, id)
    : database.prepare("SELECT id FROM note_pages WHERE parent_id IS NULL AND item_id IS NULL AND owner_id = ? AND deleted_at IS NULL AND id != ? ORDER BY position, created_at").all(ownerId, id);
  const order = siblings.map((row) => String(row.id));
  const at = before ? order.indexOf(before) : -1;
  order.splice(at < 0 ? order.length : at, 0, id);
  const set = database.prepare("UPDATE note_pages SET position = ? WHERE id = ?");
  order.forEach((pageId, index) => set.run(index + 1, pageId));
  database.prepare("UPDATE note_pages SET parent_id = ? WHERE id = ?").run(parentId, id);
  const all = [id, ...descendants(database, id)];
  const update = database.prepare("UPDATE note_pages SET kind = ?, item_id = ?, owner_id = CASE WHEN ? IS NULL THEN ? ELSE owner_id END WHERE id = ?");
  for (const pageId of all) update.run(kind, itemId, itemId, ownerId, pageId);
}

/** Replaces links to a page's old title with its new one in every page the account can read. */
function renameLinks(database: DatabaseSync, from: string, to: string, userId: number, except: string): number {
  if (!from || from === to) return 0;
  const pattern = new RegExp(`\\[\\[${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\]`, "gi");
  const rows = database.prepare(`SELECT p.id, p.body FROM note_pages p WHERE ${READABLE} AND p.id != :except AND instr(lower(p.body), lower(:link)) > 0`)
    .all({ me: userId, except, link: `[[${from}]]` });
  let count = 0;
  for (const row of rows) {
    const body = String(row.body).replace(pattern, `[[${to}]]`);
    if (body === row.body) continue;
    database.prepare(`UPDATE note_pages SET body = ?, version = version + 1, updated_at = ${now}, updated_by = ? WHERE id = ?`).run(body, userId, String(row.id));
    count += 1;
  }
  return count;
}

function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

/** The plain text of a page body for search snippets. */
export function plainText(body: string): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[card:([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\[[ xX]\]\s/g, "")
    .replace(/[*_`~|]+/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(text: string, words: string[]): string {
  const lower = text.toLowerCase();
  const at = Math.min(...words.map((word) => { const index = lower.indexOf(word); return index < 0 ? Infinity : index; }));
  if (!Number.isFinite(at)) return text.slice(0, 120);
  const start = Math.max(0, at - 50);
  return `${start > 0 ? "..." : ""}${text.slice(start, start + 140)}${start + 140 < text.length ? "..." : ""}`;
}

// ---------- reading ----------

type PageMeta = {
  id: string; title: string; kind: NoteKind | null; itemId: string | null; parentId: string | null; position: number;
  updatedAt: string; updatedBy: string; version: number; pinned: boolean; empty: boolean; top: boolean; builtin: string | null;
};

export function notesTree(database: DatabaseSync, userId: number) {
  if (!database.prepare("SELECT 1 FROM note_pages WHERE owner_id = ? AND builtin = 'about' AND deleted_at IS NULL").get(userId)) {
    const position = Number(database.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM note_pages WHERE owner_id = ? AND parent_id IS NULL AND item_id IS NULL AND deleted_at IS NULL").get(userId)!.position);
    database.prepare("INSERT INTO note_pages (id, owner_id, title, body, position, updated_by, builtin) VALUES (?, ?, ?, ?, ?, ?, 'about')")
      .run(randomUUID(), userId, "About Mana Vault", "[Open the About Mana Vault guide](/about)\n", position, userId);
  }
  const rows = database.prepare(
    `SELECT p.id, p.title, p.kind, p.item_id, p.parent_id, p.position, p.updated_at, p.version, p.builtin, p.body = '' AS empty, u.name AS by_name,
            EXISTS(SELECT 1 FROM note_pins n WHERE n.user_id = :me AND n.page_id = p.id) AS pinned
     FROM note_pages p LEFT JOIN users u ON u.id = p.updated_by WHERE ${READABLE} ORDER BY p.position, p.created_at`,
  ).all({ me: userId });
  const names = new Map<string, string | null>();
  const nameOf = (kind: NoteKind, id: string) => {
    const key = `${kind}:${id}`;
    if (!names.has(key)) names.set(key, itemName(database, kind, id));
    return names.get(key) ?? null;
  };
  const pages: PageMeta[] = rows.map((row) => {
    const kind = (row.kind as NoteKind | null) ?? null;
    const itemId = (row.item_id as string | null) ?? null;
    const parentId = (row.parent_id as string | null) ?? null;
    const top = itemId !== null && parentId === null;
    return {
      id: String(row.id), title: top && kind && itemId ? nameOf(kind, itemId) ?? String(row.title) : String(row.title), kind, itemId, parentId,
      position: Number(row.position), updatedAt: String(row.updated_at), updatedBy: String(row.by_name ?? ""), version: Number(row.version),
      pinned: Number(row.pinned) === 1, empty: Number(row.empty) === 1, top, builtin: typeof row.builtin === "string" ? row.builtin : null,
    };
  });
  const items = [...new Set(pages.filter((page) => page.kind && page.itemId).map((page) => `${page.kind}:${page.itemId}`))].map((key) => {
    const [kind, id] = key.split(":") as [NoteKind, string];
    return { kind, id, name: nameOf(kind, id) ?? "" };
  });
  const recent = database.prepare(`SELECT r.page_id FROM note_recent r JOIN note_pages p ON p.id = r.page_id WHERE r.user_id = :me AND ${READABLE} ORDER BY r.at DESC LIMIT ${RECENT_KEPT}`)
    .all({ me: userId }).map((row) => String(row.page_id));
  const templates = [
    ...BUILT_IN_TEMPLATES.map((template) => ({ ...template, builtIn: true })),
    ...database.prepare("SELECT id, name, body FROM note_templates WHERE owner_id = ? ORDER BY name COLLATE NOCASE").all(userId)
      .map((row) => ({ id: String(row.id), name: String(row.name), body: String(row.body), builtIn: false })),
  ];
  return { pages, items, recent, templates };
}

function pageDetail(database: DatabaseSync, page: Page, userId: number) {
  const top = isTop(page);
  const title = top && page.kind && page.item_id ? itemName(database, page.kind, page.item_id) ?? page.title : page.title;
  const backlinks = database.prepare(
    `SELECT p.id, p.title, p.kind, p.item_id, p.parent_id FROM note_pages p WHERE ${READABLE} AND p.id != :id AND instr(lower(p.body), lower(:link)) > 0 ORDER BY p.title COLLATE NOCASE`,
  ).all({ me: userId, id: page.id, link: `[[${title}]]` }).map((row) => {
    const rowTop = row.item_id !== null && row.parent_id === null;
    return { id: String(row.id), title: rowTop ? itemName(database, row.kind as NoteKind, String(row.item_id)) ?? String(row.title) : String(row.title) };
  });
  return {
    id: page.id, title, body: page.body, kind: page.kind, itemId: page.item_id, parentId: page.parent_id, position: page.position, version: page.version,
    updatedAt: page.updated_at, updatedBy: userName(database, page.updated_by), createdAt: page.created_at, top, backlinks,
    pinned: !!database.prepare("SELECT 1 FROM note_pins WHERE user_id = ? AND page_id = ?").get(userId, page.id), builtin: page.builtin,
  };
}

export function searchNotes(database: DatabaseSync, userId: number, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const rows = database.prepare(`SELECT p.id, p.title, p.body, p.kind, p.item_id, p.parent_id FROM note_pages p WHERE ${READABLE}`).all({ me: userId });
  const found: Array<{ id: string; title: string; snippet: string; score: number }> = [];
  for (const row of rows) {
    const top = row.item_id !== null && row.parent_id === null;
    const title = top ? itemName(database, row.kind as NoteKind, String(row.item_id)) ?? String(row.title) : String(row.title);
    const text = plainText(String(row.body));
    const hay = `${title} ${text}`.toLowerCase();
    if (!words.every((word) => hay.includes(word))) continue;
    const inTitle = words.filter((word) => title.toLowerCase().includes(word)).length;
    found.push({ id: String(row.id), title, snippet: snippet(text, words), score: inTitle * 10 + (title.toLowerCase() === query.toLowerCase() ? 100 : 0) });
  }
  return found.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 100).map(({ score: _score, ...rest }) => rest);
}

// ---------- files ----------

function readFile(body: Record<string, unknown>): { name: string; type: string; bytes: Buffer } | string {
  const type = typeof body.type === "string" ? body.type.toLowerCase() : "";
  if (!FILE_TYPES.has(type)) return "Add a PNG, JPEG, GIF, WebP, AVIF or SVG picture";
  const data = typeof body.data === "string" ? body.data.replace(/^data:[^,]*,/, "") : "";
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length) return "The picture is empty";
  if (bytes.length > FILE_LIMIT) return "A picture can be up to 20 MB";
  const name = (typeof body.name === "string" && body.name.trim() ? body.name.trim() : "picture").slice(0, 200);
  return { name, type, bytes };
}

function saveFile(database: DatabaseSync, userId: number, pageId: string | null, file: { name: string; type: string; bytes: Buffer }, wanted?: unknown): string {
  const id = typeof wanted === "string" && ID.test(wanted) && !database.prepare("SELECT 1 FROM note_files WHERE id = ?").get(wanted) ? wanted.toLowerCase() : randomUUID();
  database.prepare("INSERT INTO note_files (id, page_id, owner_id, name, type, bytes) VALUES (?, ?, ?, ?, ?, ?)").run(id, pageId, userId, file.name, file.type, file.bytes);
  return id;
}

export const fileUrl = (id: string) => `/api/notes/files/${id}`;

/** A page or picture fetched from the web (0.23.0). */
export type Fetched = { url: string; type: string; bytes: Buffer };
/** Fetches an address with a size limit; throws an Error whose message is shown. Tests replace it. */
export type NoteFetcher = (url: string, limit: number) => Promise<Fetched>;

/** Keeps a picture for a page (or for no page yet). Returns its address, or a message when the page is not found. */
export function attachPicture(database: DatabaseSync, userId: number, pageId: string | null, file: { name: string; type: string; bytes: Buffer }, wanted?: unknown): { id: string; url: string } | string {
  if (pageId && !pageOf(database, pageId, userId)) return "Page not found";
  if (typeof wanted === "string" && database.prepare("SELECT 1 FROM note_files WHERE id = ?").get(wanted)) return { id: wanted, url: fileUrl(wanted) };
  const id = saveFile(database, userId, pageId, file, wanted);
  return { id, url: fileUrl(id) };
}

/** Pictures kept before their page was saved (copied from the web, added while making a page) join the page that shows them. */
function claimPictures(database: DatabaseSync, pageId: string, body: string, userId: number): void {
  const claim = database.prepare("UPDATE note_files SET page_id = ? WHERE id = ? AND page_id IS NULL AND owner_id = ?");
  for (const match of body.matchAll(/\/api\/notes\/files\/([0-9a-f-]{36})/g)) claim.run(pageId, match[1]!, userId);
}

// ---------- backups ----------

export type NotesBackup = {
  pages: Array<{ id: string; kind: NoteKind | null; item_id: string | null; parent_id: string | null; title: string; body: string; position: number; created_at: string; updated_at: string; builtin?: string | null }>;
  versions: Array<{ page_id: string; title: string; body: string; at: string }>;
  files: Array<{ id: string; page_id: string | null; name: string; type: string; bytes: string }>;
  pins: string[];
  templates: Array<{ name: string; body: string }>;
};

/** The account's pages: those on its own decks and collections and those not attached to anything, with their versions and pictures. */
export function notesBackup(database: DatabaseSync, userId: number): NotesBackup {
  const pages = database.prepare(
    `SELECT id, kind, item_id, parent_id, title, body, position, created_at, updated_at, builtin FROM note_pages p WHERE deleted_at IS NULL AND (
       (item_id IS NULL AND owner_id = :me) OR (kind = 'deck' AND item_id IN (SELECT id FROM decks WHERE owner_id = :me))
       OR (kind = 'collection' AND item_id IN (SELECT id FROM collections WHERE owner_id = :me))) ORDER BY created_at`,
  ).all({ me: userId }).map((row) => ({
    id: String(row.id), kind: (row.kind as NoteKind | null) ?? null, item_id: (row.item_id as string | null) ?? null, parent_id: (row.parent_id as string | null) ?? null,
    title: String(row.title), body: String(row.body), position: Number(row.position), created_at: String(row.created_at), updated_at: String(row.updated_at),
    builtin: typeof row.builtin === "string" ? row.builtin : null,
  }));
  const ids = new Set(pages.map((page) => page.id));
  const versions = database.prepare("SELECT page_id, title, body, at FROM note_versions ORDER BY at, id").all()
    .filter((row) => ids.has(String(row.page_id))).map((row) => ({ page_id: String(row.page_id), title: String(row.title), body: String(row.body), at: String(row.at) }));
  const files = database.prepare("SELECT id, page_id, name, type, bytes FROM note_files WHERE owner_id = ? OR page_id IN (SELECT value FROM json_each(?))").all(userId, JSON.stringify([...ids]))
    .map((row) => ({ id: String(row.id), page_id: (row.page_id as string | null) ?? null, name: String(row.name), type: String(row.type), bytes: Buffer.from(row.bytes as Uint8Array).toString("base64") }));
  return {
    pages, versions, files,
    pins: database.prepare("SELECT page_id FROM note_pins WHERE user_id = ?").all(userId).map((row) => String(row.page_id)).filter((id) => ids.has(id)),
    templates: database.prepare("SELECT name, body FROM note_templates WHERE owner_id = ? ORDER BY created_at").all(userId).map((row) => ({ name: String(row.name), body: String(row.body) })),
  };
}

/**
 * Replaces the account's unattached pages and templates with the backup's, and puts back the pages of the restored
 * decks and collections (whose ids are new). Picture addresses keep their codes, so links in page bodies keep working.
 */
export function restoreNotes(database: DatabaseSync, userId: number, backup: NotesBackup | undefined, mapItem: (kind: NoteKind, id: string) => string | null): void {
  if (!backup || !Array.isArray(backup.pages)) {
    descriptionPages(database);
    return;
  }
  database.prepare("DELETE FROM note_pages WHERE item_id IS NULL AND owner_id = ?").run(userId);
  database.prepare("DELETE FROM note_templates WHERE owner_id = ?").run(userId);
  const pageIds = new Map<string, string>();
  for (const page of backup.pages) pageIds.set(page.id, randomUUID());
  const insert = database.prepare(
    "INSERT INTO note_pages (id, owner_id, kind, item_id, parent_id, title, body, position, created_at, updated_at, updated_by, builtin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const page of backup.pages) {
    const itemId = page.kind && page.item_id ? mapItem(page.kind, page.item_id) : null;
    if (page.kind && !itemId) continue;
    // a deck or collection keeps one top page: the one from the backup replaces one made since
    if (page.kind && itemId && !page.parent_id) database.prepare("DELETE FROM note_pages WHERE kind = ? AND item_id = ? AND parent_id IS NULL").run(page.kind, itemId);
    insert.run(pageIds.get(page.id)!, userId, itemId ? page.kind : null, itemId, page.parent_id ? pageIds.get(page.parent_id) ?? null : null,
      String(page.title).slice(0, TITLE_LIMIT), String(page.body).slice(0, BODY_LIMIT), Number(page.position) || 0, page.created_at, page.updated_at, userId,
      page.builtin === "about" ? "about" : null);
  }
  const exists = (id: string) => !!database.prepare("SELECT 1 FROM note_pages WHERE id = ?").get(id);
  for (const version of backup.versions ?? []) {
    const id = pageIds.get(version.page_id);
    if (id && exists(id)) database.prepare("INSERT INTO note_versions (page_id, title, body, at, by) VALUES (?, ?, ?, ?, ?)").run(id, version.title, version.body, version.at, userId);
  }
  for (const file of backup.files ?? []) {
    const pageId = file.page_id ? pageIds.get(file.page_id) ?? null : null;
    const bytes = Buffer.from(file.bytes, "base64");
    database.prepare("DELETE FROM note_files WHERE id = ?").run(file.id);
    database.prepare("INSERT INTO note_files (id, page_id, owner_id, name, type, bytes) VALUES (?, ?, ?, ?, ?, ?)")
      .run(file.id, pageId && exists(pageId) ? pageId : null, userId, file.name, file.type, bytes);
  }
  for (const pin of backup.pins ?? []) {
    const id = pageIds.get(pin);
    if (id && exists(id)) database.prepare("INSERT OR IGNORE INTO note_pins (user_id, page_id) VALUES (?, ?)").run(userId, id);
  }
  for (const template of backup.templates ?? []) {
    database.prepare("INSERT INTO note_templates (id, owner_id, name, body) VALUES (?, ?, ?, ?)").run(randomUUID(), userId, String(template.name).slice(0, 100), String(template.body).slice(0, BODY_LIMIT));
  }
  descriptionPages(database);
  // the deck descriptions follow the restored top pages
  for (const row of database.prepare("SELECT item_id, body FROM note_pages WHERE kind = 'deck' AND parent_id IS NULL AND owner_id = ?").all(userId)) {
    database.prepare("UPDATE decks SET description = ? WHERE id = ?").run(String(row.body).slice(0, 20000), String(row.item_id));
  }
}

// ---------- routes ----------

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function registerNoteRoutes(app: FastifyInstance, database: DatabaseSync): void {
  initializeNotes(database);
  // the page or app that saves (the header every change carries), or the phone's device
  const clientOf = (request: { headers: Record<string, string | string[] | undefined>; deviceId?: string }) => {
    const client = request.headers["x-mana-vault-client"];
    return typeof client === "string" && client ? client.slice(0, 64) : request.deviceId ?? null;
  };
  const me = (request: { user: { id: number } | null }) => request.user!.id;
  const missing = (reply: FastifyReply) => reply.code(404).send({ error: "Page not found" });
  const readKind = (value: unknown): NoteKind | null | undefined => (value === "deck" || value === "collection" ? value : value === null || value === undefined || value === "" ? null : undefined);

  app.get("/api/notes", async (request) => notesTree(database, me(request)));

  app.get<{ Querystring: { q?: string } }>("/api/notes/search", async (request) => searchNotes(database, me(request), String(request.query.q ?? "").slice(0, 200)));

  /** A card named in a card link: its newest printing, for the picture shown on hover. */
  app.get<{ Querystring: { name?: string } }>("/api/notes/card", async (request, reply) => {
    const name = String(request.query.name ?? "").trim();
    if (!name) return reply.code(400).send({ error: "Type a card name" });
    const row = database.prepare(
      `SELECT id, name, image_url FROM cards WHERE (lower(name) = lower(?) OR lower(flavor_name) = lower(?) OR lower(name) LIKE lower(?) || ' // %')
       ORDER BY removed, lang != 'en', custom, released_at IS NULL, released_at DESC, promo, variation LIMIT 1`,
    ).get(name, name, name);
    if (!row) return reply.code(404).send({ error: `No card named ${name} in the card database` });
    return { id: String(row.id), name: String(row.name), image_url: (row.image_url as string | null) ?? null };
  });

  app.get<{ Params: { id: string } }>("/api/notes/pages/:id", async (request, reply) => {
    const page = pageOf(database, request.params.id, me(request));
    return page ? pageDetail(database, page, me(request)) : missing(reply);
  });

  /** The top page of a deck or collection; made the first time its Notes tab opens. */
  app.post<{ Params: { kind: string; id: string }; Body: { id?: unknown } }>("/api/notes/items/:kind/:id", async (request, reply) => {
    const kind = readKind(request.params.kind);
    if (!kind) return reply.code(400).send({ error: "Notes belong to a deck or a collection" });
    if (!access(database, kind, request.params.id, me(request))) return reply.code(404).send({ error: kind === "deck" ? "Deck not found" : "Collection not found" });
    const id = topPage(database, kind, request.params.id, me(request), typeof request.body?.id === "string" ? request.body.id : undefined);
    return pageDetail(database, pageOf(database, id, me(request))!, me(request));
  });

  app.post<{ Body: Record<string, unknown> }>("/api/notes/pages", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const userId = me(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > TITLE_LIMIT) return reply.code(400).send({ error: `A page title can be 1 to ${TITLE_LIMIT} characters` });
    const text = typeof body.body === "string" ? body.body : "";
    if (text.length > BODY_LIMIT) return reply.code(400).send({ error: "A page can be up to 500,000 characters" });
    if (body.id !== undefined && (typeof body.id !== "string" || !ID.test(body.id))) return reply.code(400).send({ error: "A new page id must be a UUID" });
    const id = typeof body.id === "string" ? body.id.toLowerCase() : randomUUID();
    // the phone sends a page again after a lost answer: the same page is returned
    const already = database.prepare("SELECT 1 FROM note_pages WHERE id = ?").get(id);
    if (already) {
      const page = pageOf(database, id, userId);
      return page ? pageDetail(database, page, userId) : reply.code(409).send({ error: "A page with this id already exists" });
    }
    let parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    let kind: NoteKind | null = null;
    let itemId: string | null = null;
    if (parentId) {
      const parent = pageOf(database, parentId, userId);
      if (!parent) return reply.code(404).send({ error: "The parent page was not found" });
      kind = parent.kind;
      itemId = parent.item_id;
    } else {
      const wantedKind = readKind(body.kind);
      if (wantedKind === undefined) return reply.code(400).send({ error: "Notes belong to a deck or a collection" });
      if (wantedKind && typeof body.itemId === "string") {
        if (!access(database, wantedKind, body.itemId, userId)) return reply.code(404).send({ error: wantedKind === "deck" ? "Deck not found" : "Collection not found" });
        kind = wantedKind;
        itemId = body.itemId;
        parentId = topPage(database, kind, itemId, userId);
      }
    }
    transaction(database, () => {
      database.prepare("INSERT INTO note_pages (id, owner_id, kind, item_id, parent_id, title, body, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, userId, kind, itemId, parentId, title, text, userId);
      let before = typeof body.before === "string" ? body.before : null;
      if (!parentId && !before) {
        const last = database.prepare("SELECT id, builtin FROM note_pages WHERE owner_id = ? AND parent_id IS NULL AND item_id IS NULL AND deleted_at IS NULL AND id != ? ORDER BY position DESC, created_at DESC LIMIT 1").get(userId, id);
        if (last?.builtin === "about") before = String(last.id);
      }
      placePage(database, id, parentId, kind, itemId, userId, before);
      if (text) addVersion(database, id, title, text, userId, clientOf(request));
      claimPictures(database, id, text, userId);
    });
    return reply.code(201).send(pageDetail(database, pageOf(database, id, userId)!, userId));
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/notes/pages/:id", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const userId = me(request);
    const page = pageOf(database, request.params.id, userId);
    if (!page) return missing(reply);
    const title = typeof body.title === "string" ? body.title.trim() : page.title;
    if (!title || title.length > TITLE_LIMIT) return reply.code(400).send({ error: `A page title can be 1 to ${TITLE_LIMIT} characters` });
    const text = typeof body.body === "string" ? body.body : page.body;
    if (text.length > BODY_LIMIT) return reply.code(400).send({ error: "A page can be up to 500,000 characters" });
    const base = typeof body.baseVersion === "number" ? body.baseVersion : null;
    if (base !== null && base !== page.version && body.force !== true && (text !== page.body || title !== page.title)) {
      return reply.code(409).send({
        error: `${userName(database, page.updated_by) || "Someone"} saved this page while you were editing it`,
        conflict: { title: pageDetail(database, page, userId).title, body: page.body, version: page.version, updatedBy: userName(database, page.updated_by), updatedAt: page.updated_at },
      });
    }
    if (title === page.title && text === page.body) return { version: page.version, updatedAt: page.updated_at, renamed: 0 };
    let renamed = 0;
    transaction(database, () => {
      // a top page is named after its deck or collection
      const keptTitle = isTop(page) ? page.title : title;
      database.prepare(`UPDATE note_pages SET title = ?, body = ?, version = version + 1, updated_at = ${now}, updated_by = ? WHERE id = ?`).run(keptTitle, text, userId, page.id);
      const started = addVersion(database, page.id, keptTitle, text, userId, clientOf(request));
      claimPictures(database, page.id, text, userId);
      // a deck's history names each new version of its notes (not every save)
      if (started && page.kind === "deck" && page.item_id) {
        logDeck(database, page.item_id, String(request.user?.name ?? ""), isTop(page) ? "Description changed" : `Notes page ${keptTitle} changed`);
      }
      if (!isTop(page)) renamed = renameLinks(database, page.title, keptTitle, userId, page.id);
      if (isTop(page) && page.kind === "deck") database.prepare("UPDATE decks SET description = ? WHERE id = ?").run(text.slice(0, 20000), page.item_id);
    });
    const after = pageOf(database, page.id, userId)!;
    return { version: after.version, updatedAt: after.updated_at, renamed };
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/notes/pages/:id/move", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const userId = me(request);
    const page = pageOf(database, request.params.id, userId);
    if (!page) return missing(reply);
    if (isTop(page)) return reply.code(400).send({ error: "The top page of a deck or collection stays with it" });
    const before = { parentId: page.parent_id, kind: page.kind, itemId: page.item_id, position: page.position };
    let parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    let kind: NoteKind | null = null;
    let itemId: string | null = null;
    if (parentId) {
      const parent = pageOf(database, parentId, userId);
      if (!parent) return reply.code(404).send({ error: "The parent page was not found" });
      if (parent.id === page.id || descendants(database, page.id).includes(parent.id)) return reply.code(400).send({ error: "A page cannot go under itself or one of its child pages" });
      kind = parent.kind;
      itemId = parent.item_id;
    } else {
      const wantedKind = readKind(body.kind);
      if (wantedKind === undefined) return reply.code(400).send({ error: "Notes belong to a deck or a collection" });
      if (wantedKind && typeof body.itemId === "string") {
        if (!access(database, wantedKind, body.itemId, userId)) return reply.code(404).send({ error: wantedKind === "deck" ? "Deck not found" : "Collection not found" });
        kind = wantedKind;
        itemId = body.itemId;
        parentId = topPage(database, kind, itemId, userId);
      }
    }
    transaction(database, () => {
      placePage(database, page.id, parentId, kind, itemId, userId, typeof body.before === "string" ? body.before : null);
      if (typeof body.position === "number") database.prepare("UPDATE note_pages SET position = ? WHERE id = ?").run(body.position, page.id);
    });
    return { status: "moved", before };
  });

  app.delete<{ Params: { id: string }; Querystring: { children?: string } }>("/api/notes/pages/:id", async (request, reply) => {
    const userId = me(request);
    const page = pageOf(database, request.params.id, userId);
    if (!page) return missing(reply);
    if (isTop(page)) return reply.code(400).send({ error: "The top page of a deck or collection cannot be deleted. Clear its text instead." });
    const lift = request.query.children === "lift";
    if (page.builtin === "about") return reply.code(400).send({ error: "The built-in About Mana Vault page cannot be deleted." });
    const removing = lift ? [page.id] : [page.id, ...descendants(database, page.id)];
    if (removing.some((id) => database.prepare("SELECT 1 FROM note_pages WHERE id = ? AND builtin = 'about'").get(id))) {
      return reply.code(400).send({ error: "Move the About Mana Vault page elsewhere before deleting its parent." });
    }
    const deleted: string[] = [page.id];
    const lifted: Array<{ id: string; parentId: string | null; position: number }> = [];
    transaction(database, () => {
      const children = database.prepare("SELECT id, parent_id, position FROM note_pages WHERE parent_id = ? AND deleted_at IS NULL ORDER BY position").all(page.id);
      if (lift) {
        for (const child of children) {
          lifted.push({ id: String(child.id), parentId: page.id, position: Number(child.position) });
          database.prepare("UPDATE note_pages SET parent_id = ?, position = ? WHERE id = ?").run(page.parent_id, page.position + Number(child.position) / 1000, String(child.id));
        }
      } else {
        deleted.push(...descendants(database, page.id));
      }
      const mark = database.prepare(`UPDATE note_pages SET deleted_at = ${now} WHERE id = ?`);
      for (const id of deleted) mark.run(id);
    });
    return { status: "deleted", undo: { deleted, lifted } };
  });

  /** Undo of a delete: the pages come back where they were. */
  app.post<{ Body: { deleted?: unknown; lifted?: unknown } }>("/api/notes/restore", async (request, reply) => {
    const userId = me(request);
    const deleted = Array.isArray(request.body?.deleted) ? request.body.deleted.filter((id): id is string => typeof id === "string") : [];
    const lifted = Array.isArray(request.body?.lifted) ? request.body.lifted.filter(isRecord) : [];
    const restored = transaction(database, () => {
      let count = 0;
      for (const id of deleted) {
        const row = database.prepare("SELECT * FROM note_pages WHERE id = ? AND deleted_at IS NOT NULL").get(id);
        if (!row) continue;
        database.prepare("UPDATE note_pages SET deleted_at = NULL WHERE id = ?").run(id);
        if (!pageOf(database, id, userId)) {
          database.prepare(`UPDATE note_pages SET deleted_at = ${now} WHERE id = ?`).run(id);
          continue;
        }
        count += 1;
      }
      for (const item of lifted) {
        if (typeof item.id !== "string" || !pageOf(database, item.id, userId)) continue;
        database.prepare("UPDATE note_pages SET parent_id = ?, position = ? WHERE id = ?").run(typeof item.parentId === "string" ? item.parentId : null, Number(item.position) || 0, item.id);
      }
      return count;
    });
    if (!restored && deleted.length) return reply.code(404).send({ error: "The page can no longer be put back" });
    return { status: "restored", restored };
  });

  app.put<{ Params: { id: string }; Body: { pinned?: unknown } }>("/api/notes/pages/:id/pin", async (request, reply) => {
    const userId = me(request);
    const page = pageOf(database, request.params.id, userId);
    if (!page) return missing(reply);
    if (request.body?.pinned === true) database.prepare("INSERT OR IGNORE INTO note_pins (user_id, page_id) VALUES (?, ?)").run(userId, page.id);
    else database.prepare("DELETE FROM note_pins WHERE user_id = ? AND page_id = ?").run(userId, page.id);
    return { pinned: request.body?.pinned === true };
  });

  app.post<{ Params: { id: string } }>("/api/notes/pages/:id/opened", async (request, reply) => {
    const userId = me(request);
    const page = pageOf(database, request.params.id, userId);
    if (!page) return missing(reply);
    database.prepare(`INSERT INTO note_recent (user_id, page_id, at) VALUES (?, ?, ${now}) ON CONFLICT(user_id, page_id) DO UPDATE SET at = excluded.at`).run(userId, page.id);
    database.prepare(`DELETE FROM note_recent WHERE user_id = ? AND page_id NOT IN (SELECT page_id FROM note_recent WHERE user_id = ? ORDER BY at DESC LIMIT ${RECENT_KEPT * 3})`).run(userId, userId);
    return { status: "ok" };
  });

  app.get<{ Params: { id: string } }>("/api/notes/pages/:id/versions", async (request, reply) => {
    const page = pageOf(database, request.params.id, me(request));
    if (!page) return missing(reply);
    return database.prepare("SELECT v.id, v.title, v.at, v.body, u.name AS by_name FROM note_versions v LEFT JOIN users u ON u.id = v.by WHERE v.page_id = ? ORDER BY v.at DESC, v.id DESC").all(page.id)
      .map((row) => ({ id: Number(row.id), title: String(row.title), at: String(row.at), by: String(row.by_name ?? ""), body: String(row.body) }));
  });

  app.post<{ Params: { id: string; version: string } }>("/api/notes/pages/:id/versions/:version/restore", async (request, reply) => {
    const userId = me(request);
    const page = pageOf(database, request.params.id, userId);
    if (!page) return missing(reply);
    const version = database.prepare("SELECT title, body FROM note_versions WHERE id = ? AND page_id = ?").get(Number(request.params.version), page.id);
    if (!version) return reply.code(404).send({ error: "Version not found" });
    const title = isTop(page) ? page.title : String(version.title);
    transaction(database, () => {
      database.prepare(`UPDATE note_pages SET title = ?, body = ?, version = version + 1, updated_at = ${now}, updated_by = ? WHERE id = ?`).run(title, String(version.body), userId, page.id);
      // a restore is always a version of its own
      database.prepare("INSERT INTO note_versions (page_id, title, body, by) VALUES (?, ?, ?, ?)").run(page.id, title, String(version.body), userId);
      pruneVersions(database, page.id);
      if (isTop(page) && page.kind === "deck") database.prepare("UPDATE decks SET description = ? WHERE id = ?").run(String(version.body).slice(0, 20000), page.item_id);
      if (!isTop(page)) renameLinks(database, page.title, title, userId, page.id);
    });
    return pageDetail(database, pageOf(database, page.id, userId)!, userId);
  });

  // ---------- templates ----------

  app.post<{ Body: { name?: unknown; body?: unknown; id?: unknown } }>("/api/notes/templates", async (request, reply) => {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!name || name.length > 100) return reply.code(400).send({ error: "A template name can be 1 to 100 characters" });
    const text = typeof request.body?.body === "string" ? request.body.body : "";
    if (text.length > BODY_LIMIT) return reply.code(400).send({ error: "A template can be up to 500,000 characters" });
    const id = typeof request.body?.id === "string" && ID.test(request.body.id) ? request.body.id.toLowerCase() : randomUUID();
    database.prepare("INSERT OR REPLACE INTO note_templates (id, owner_id, name, body) VALUES (?, ?, ?, ?)").run(id, me(request), name, text);
    return reply.code(201).send({ id, name, body: text, builtIn: false });
  });

  app.patch<{ Params: { id: string }; Body: { name?: unknown } }>("/api/notes/templates/:id", async (request, reply) => {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!name || name.length > 100) return reply.code(400).send({ error: "A template name can be 1 to 100 characters" });
    const result = database.prepare("UPDATE note_templates SET name = ? WHERE id = ? AND owner_id = ?").run(name, request.params.id, me(request));
    return result.changes ? { status: "saved" } : reply.code(404).send({ error: "Template not found" });
  });

  app.delete<{ Params: { id: string } }>("/api/notes/templates/:id", async (request, reply) => {
    const row = database.prepare("SELECT id, name, body FROM note_templates WHERE id = ? AND owner_id = ?").get(request.params.id, me(request));
    if (!row) return reply.code(404).send({ error: "Template not found" });
    database.prepare("DELETE FROM note_templates WHERE id = ?").run(request.params.id);
    return { status: "deleted", template: { id: String(row.id), name: String(row.name), body: String(row.body) } };
  });

  // ---------- pictures ----------

  app.post<{ Body: Record<string, unknown> }>("/api/notes/files", { bodyLimit: 30 * 1024 * 1024 }, async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const userId = me(request);
    let pageId: string | null = null;
    if (typeof body.pageId === "string" && body.pageId) {
      if (!pageOf(database, body.pageId, userId)) return missing(reply);
      pageId = body.pageId;
    }
    if (typeof body.id === "string" && database.prepare("SELECT 1 FROM note_files WHERE id = ?").get(body.id)) return { id: body.id, url: fileUrl(body.id) };
    const file = readFile(body);
    if (typeof file === "string") return reply.code(400).send({ error: file });
    const id = saveFile(database, userId, pageId, file, body.id);
    return reply.code(201).send({ id, url: fileUrl(id) });
  });

  app.get<{ Params: { id: string } }>("/api/notes/files/:id", async (request, reply) => {
    const row = database.prepare("SELECT type, bytes, name FROM note_files WHERE id = ?").get(request.params.id);
    if (!row) return reply.code(404).send({ error: "Picture not found" });
    reply.header("content-type", String(row.type));
    reply.header("cache-control", "private, max-age=31536000, immutable");
    if (String(row.type) === "image/svg+xml") reply.header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
    return reply.send(Buffer.from(row.bytes as Uint8Array));
  });

  // ---------- import and export ----------

  /** Pages for an export: one page and its children, a deck's or collection's tree, or every page the account can read. */
  app.get<{ Querystring: { page?: string; kind?: string; item?: string } }>("/api/notes/export", async (request, reply) => {
    const userId = me(request);
    const tree = notesTree(database, userId);
    let ids: string[];
    if (request.query.page) {
      const page = pageOf(database, request.query.page, userId);
      if (!page) return missing(reply);
      ids = [page.id, ...descendants(database, page.id)];
    } else if (request.query.kind && request.query.item) {
      ids = tree.pages.filter((page) => page.kind === request.query.kind && page.itemId === request.query.item).map((page) => page.id);
    } else ids = tree.pages.map((page) => page.id);
    const pages = ids.map((id) => pageOf(database, id, userId)).filter((page): page is Page => !!page).map((page) => {
      const meta = tree.pages.find((item) => item.id === page.id);
      return { id: page.id, title: meta?.title ?? page.title, parentId: page.parent_id, kind: page.kind, itemId: page.item_id, position: page.position, body: page.body };
    });
    return { pages, items: tree.items };
  });

  /**
   * Import: pages read from .md files (the browser reads the files and zips), with the pictures they use. Each page has
   * a key and its parent's key; pictures named in a page as attachments/name (or by their file name) are added and linked.
   */
  app.post<{ Body: Record<string, unknown> }>("/api/notes/import", { bodyLimit: 100 * 1024 * 1024 }, async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const userId = me(request);
    const pages = Array.isArray(body.pages) ? body.pages.filter(isRecord) : [];
    const files = Array.isArray(body.files) ? body.files.filter(isRecord) : [];
    if (!pages.length) return reply.code(400).send({ error: "There are no .md files to import" });
    if (pages.length > 2000) return reply.code(400).send({ error: "Import up to 2,000 pages at a time" });
    let rootParent: string | null = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    let kind: NoteKind | null = null;
    let itemId: string | null = null;
    if (rootParent) {
      const parent = pageOf(database, rootParent, userId);
      if (!parent) return reply.code(404).send({ error: "The parent page was not found" });
      kind = parent.kind;
      itemId = parent.item_id;
    } else {
      const wantedKind = readKind(body.kind);
      if (wantedKind && typeof body.itemId === "string") {
        if (!access(database, wantedKind, body.itemId, userId)) return reply.code(404).send({ error: wantedKind === "deck" ? "Deck not found" : "Collection not found" });
        kind = wantedKind;
        itemId = body.itemId;
        rootParent = topPage(database, kind, itemId, userId);
      }
    }
    const created: string[] = [];
    transaction(database, () => {
      const fileUrls = new Map<string, string>();
      for (const raw of files) {
        const file = readFile(raw);
        if (typeof file === "string") continue;
        const id = saveFile(database, userId, null, file);
        const name = String(raw.name ?? file.name);
        fileUrls.set(name, fileUrl(id));
        fileUrls.set(name.split("/").pop()!, fileUrl(id));
      }
      const keys = new Map<string, string>();
      for (const raw of pages) keys.set(String(raw.key ?? randomUUID()), randomUUID());
      for (const raw of pages) {
        const id = keys.get(String(raw.key))!;
        const title = (typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled").slice(0, TITLE_LIMIT);
        let text = typeof raw.body === "string" ? raw.body.slice(0, BODY_LIMIT) : "";
        // pictures: ![alt](attachments/name.png), ![alt](name.png) and Obsidian's ![[name.png]]
        text = text.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (whole, name: string) => {
          const url = fileUrls.get(name.trim()) ?? fileUrls.get(name.trim().split("/").pop()!);
          return url ? `![${name.trim()}](${url})` : whole;
        });
        text = text.replace(/!\[([^\]]*)\]\(<?([^)>\s]+)>?\)/g, (whole, alt: string, path: string) => {
          const name = decodeURIComponent(path).replace(/^\.\//, "");
          const url = fileUrls.get(name) ?? fileUrls.get(name.split("/").pop()!);
          return url ? `![${alt}](${url})` : whole;
        });
        const parentKey = typeof raw.parentKey === "string" ? raw.parentKey : null;
        const parentId = parentKey && keys.has(parentKey) ? keys.get(parentKey)! : rootParent;
        database.prepare("INSERT INTO note_pages (id, owner_id, kind, item_id, parent_id, title, body, position, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(id, userId, kind, itemId, parentId, title, text, created.length + 1, userId);
        if (text) addVersion(database, id, title, text, userId);
        created.push(id);
      }
      const attach = database.prepare("UPDATE note_files SET page_id = ? WHERE id = ? AND page_id IS NULL");
      for (const id of created) {
        const text = String(database.prepare("SELECT body FROM note_pages WHERE id = ?").get(id)?.body ?? "");
        for (const match of text.matchAll(/\/api\/notes\/files\/([0-9a-f-]{36})/g)) attach.run(id, match[1]!);
      }
      // pages put at the top of My pages follow the ones already there
      if (!rootParent) {
        const existing = database.prepare("SELECT id, builtin, position FROM note_pages WHERE parent_id IS NULL AND item_id IS NULL AND owner_id = ? AND deleted_at IS NULL AND id NOT IN (SELECT value FROM json_each(?)) ORDER BY position DESC, created_at DESC")
          .all(userId, JSON.stringify(created));
        const guide = existing[0]?.builtin === "about" ? existing[0] : null;
        const last = Number((guide ? existing[1] : existing[0])?.position ?? 0);
        const shift = database.prepare("UPDATE note_pages SET position = position + ? WHERE id = ? AND parent_id IS NULL");
        for (const id of created) shift.run(last, id);
        if (guide) database.prepare("UPDATE note_pages SET position = ? WHERE id = ?").run(last + created.length + 1, String(guide.id));
      }
    });
    return reply.code(201).send({ created: created.length, ids: created });
  });
}
