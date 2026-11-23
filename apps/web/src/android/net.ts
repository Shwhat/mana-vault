// ---------- network calls from the Android app: server address, device token and time limits ----------
import { apiUrl, appSettings } from "./platform";

export class SignedOutError extends Error {}
/** The server could not be reached (no connection, server down, or no answer in time). */
export class OfflineError extends Error {}

const SIGNED_OUT = "mana-vault-signed-out";

/** Called when the server no longer accepts this phone's sign-in. */
export function onSignedOut(listener: () => void): () => void {
  window.addEventListener(SIGNED_OUT, listener);
  return () => window.removeEventListener(SIGNED_OUT, listener);
}

/** Sends a request to the server with the device token. Throws OfflineError when the server cannot be reached. */
export async function appFetch(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const token = appSettings().token;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  init.signal?.addEventListener("abort", () => controller.abort());
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: "omit",
      signal: controller.signal,
      headers: {
        ...(method !== "GET" ? { "x-mana-vault": "1" } : {}),
        ...(init.body !== undefined && typeof init.body === "string" ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (response.status === 401 && token && !path.startsWith("/api/password")) {
      window.dispatchEvent(new Event(SIGNED_OUT));
      throw new SignedOutError("This phone is signed out. Sign in again to continue.");
    }
    return response;
  } catch (reason) {
    if (reason instanceof SignedOutError) throw reason;
    if (init.signal?.aborted) throw reason;
    throw new OfflineError("The server cannot be reached.");
  } finally {
    window.clearTimeout(timer);
  }
}

/** Reads a JSON answer, turning an error answer into an Error with the server's message. */
export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw Object.assign(new Error(body.error ?? `The server answered with an error (${response.status}).`), { status: response.status, body });
  }
  return response.json() as Promise<T>;
}
