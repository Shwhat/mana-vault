// ---------- host: everything that talks to the server ----------
import { appFetch, SignedOutError } from "./android/net";
import { appRequest } from "./android/offline";
import { apiUrl, isApp, saveBlob } from "./android/platform";

/**
 * In the Android app pages come from the phone, so the server's own picture addresses (custom card pictures and set
 * symbols, such as /api/custom/cards/.../picture, and card pictures under /pictures/) are made full addresses on the server.
 */
export function withServerPictures<T>(value: T): T {
  if (typeof value === "string") return (value.startsWith("/api/custom/") || value.startsWith("/api/set-symbols/") || value.startsWith("/api/art/") || value.startsWith("/pictures/") ? apiUrl(value) : value) as T;
  if (Array.isArray(value)) return value.map((item) => withServerPictures(item)) as T;
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const fixed = typeof item === "string" || (item && typeof item === "object") ? withServerPictures(item) : item;
      if (fixed !== item) changed = true;
      next[key] = fixed;
    }
    return (changed ? next : value) as T;
  }
  return value;
}

export { SignedOutError };
export const APP_VERSION = __APP_VERSION__;

/** Sends a request with the safety header the server requires on every change. A 401 returns to the sign-in page. */
export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (isApp()) return withServerPictures(await appRequest<T>(url, init));
  const method = (init.method ?? "GET").toUpperCase();
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(method !== "GET" ? { "x-mana-vault": "1" } : {}),
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (response.status === 401 && !url.startsWith("/api/password")) {
    window.location.href = "/login";
    throw new SignedOutError("You are signed out.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `The server answered with an error (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const jsonBody = (value: unknown) => JSON.stringify(value);

/** A plain request for a file from the server (such as a backup), signed in the same way as every other request. */
export async function fetchFile(url: string): Promise<Response> {
  if (isApp()) return appFetch(url, {}, 120_000);
  const response = await fetch(url, { credentials: "same-origin" });
  if (response.status === 401) {
    window.location.href = "/login";
    throw new SignedOutError("You are signed out.");
  }
  return response;
}

/** Sends a file (a receipt) as the body of a request and reads the JSON answer. Reading a receipt can take a while. */
export async function sendFile<T>(url: string, method: "POST" | "PUT", file: Blob, name = ""): Promise<T> {
  const init: RequestInit = { method, body: file, headers: { "content-type": file.type || "application/octet-stream", ...(name ? { "x-file-name": name } : {}) } };
  const response = isApp() ? await appFetch(url, init, 180_000)
    : await fetch(url, { ...init, credentials: "same-origin", headers: { ...(init.headers as Record<string, string>), "x-mana-vault": "1" } });
  if (response.status === 401) {
    if (!isApp()) window.location.href = "/login";
    throw new SignedOutError("You are signed out.");
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `The server answered with an error (${response.status}).`);
  return body;
}

export function downloadBlob(filename: string, blob: Blob) {
  if (isApp()) {
    void saveBlob(filename, blob).catch((reason: unknown) => console.error("Saving the file failed", reason));
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(filename: string, content: string, type: string) {
  downloadBlob(filename, new Blob([content], { type }));
}

export function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";

/** Opens the browser file picker for several files at once; resolves with the files chosen (none when cancelled). */
export function pickFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", () => { resolve([...(input.files ?? [])]); input.remove(); });
    input.addEventListener("cancel", () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

/** Opens the browser file picker and resolves with the chosen file, or null. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
