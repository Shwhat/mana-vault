// ---------- host: everything that talks to the server ----------
export const APP_VERSION = __APP_VERSION__;

export class SignedOutError extends Error {}

/** Sends a request with the safety header the server requires on every change. A 401 returns to the sign-in page. */
export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
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

export function downloadBlob(filename: string, blob: Blob) {
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
