// ---------- notes (0.22.0): reading markdown files and zips into pages for an import ----------
import { strFromU8, unzipSync } from "fflate";

/** A page title as a file or folder name. */
export const safeName = (text: string) => text.replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";

const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif" };
const base64 = (bytes: Uint8Array) => {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
};

/** Reads .md files and zips (an Obsidian-style folder) into pages: folders become parent pages. */
export async function readMarkdownFiles(files: Array<{ name: string; bytes: Uint8Array }>) {
  const entries: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      for (const [path, bytes] of Object.entries(unzipSync(file.bytes))) if (!path.endsWith("/") && !/(^|\/)(\.|__MACOSX)/.test(path)) entries.push({ path, bytes });
    } else entries.push({ path: file.name, bytes: file.bytes });
  }
  const pages: Array<{ key: string; parentKey: string | null; title: string; body: string }> = [];
  const keys = new Set<string>();
  const folder = (path: string): string | null => {
    const parts = path.split("/");
    parts.pop();
    if (!parts.length) return null;
    const key = parts.join("/");
    if (!keys.has(key)) {
      keys.add(key);
      pages.push({ key, parentKey: folder(key), title: parts[parts.length - 1]!, body: "" });
    }
    return key;
  };
  const markdown = entries.filter((entry) => /\.(md|markdown|txt)$/i.test(entry.path)).sort((a, b) => a.path.localeCompare(b.path));
  // a note named like its folder (Folder.md beside Folder/) is the folder's page
  for (const entry of markdown) {
    const key = entry.path.replace(/\.(md|markdown|txt)$/i, "");
    const body = strFromU8(entry.bytes).replace(/^---\n[\s\S]*?\n---\n/, "");
    const existing = pages.find((page) => page.key === key);
    if (existing) {
      existing.body = body;
      continue;
    }
    keys.add(key);
    pages.push({ key, parentKey: folder(entry.path), title: key.split("/").pop()!, body });
  }
  const pictures = entries.filter((entry) => PICTURE.test(entry.path)).map((entry) => ({
    name: entry.path, type: TYPES[entry.path.split(".").pop()!.toLowerCase()] ?? "image/png", data: base64(entry.bytes),
  }));
  return { pages, files: pictures };
}

