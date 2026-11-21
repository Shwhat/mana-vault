// ---------- platform: what differs between the browser and the Android app ----------
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AppSettings = {
  /** Server address without a trailing slash, for example https://vault.example.com. */
  server: string;
  token: string;
  user: string;
  userId: number;
  notifications: boolean;
  wifiOnly: boolean;
};

export type TextLine = { text: string; left: number; top: number; right: number; bottom: number };

/** The app's own native plugin (apps/android, ManaVaultPlugin.kt). */
export interface ManaVaultNative {
  getSettings(): Promise<Partial<AppSettings>>;
  setSettings(options: Partial<AppSettings>): Promise<void>;
  clearSettings(): Promise<void>;
  /** Reads text in a JPEG picture (base64, no prefix) on the phone. Positions are in picture pixels. */
  recognize(options: { image: string }): Promise<{ lines: TextLine[]; width: number; height: number }>;
  /** Turns the background Inbox check on or off. Asks for notification permission when turning it on. */
  setNotifications(options: { enabled: boolean; wifiOnly: boolean }): Promise<{ granted: boolean }>;
  /** The offer a tapped notification opened the app for, once. */
  takeLaunchOffer(): Promise<{ offer: string | null }>;
  /** Writes a file (base64) and opens the Android share sheet so it can be saved or sent. */
  saveFile(options: { name: string; mime: string; data: string }): Promise<void>;
  /** Turns a back camera's light on or off from the phone itself, for cameras whose light the web view cannot reach. */
  setTorch?(options: { on: boolean }): Promise<{ ok: boolean; reason?: string }>;
  /** Puts the app in the background (the Back button on the first screen). */
  minimize(): Promise<void>;
  /** A file another app shared with Mana Vault (0.17.0), once: name, type and base64 data. */
  takeSharedFile?(): Promise<{ file: { name: string; type: string; data: string } | null }>;
  /** The changes waiting for the server (0.17.0), sent by the phone in the background as soon as it is online. */
  setPendingSync?(options: { changes: string }): Promise<void>;
  appInfo(): Promise<{ version: string; android: string; device: string }>;
  addListener(event: "backButton", listener: () => void): Promise<PluginListenerHandle>;
  /** A notification was tapped while the app was open. */
  addListener(event: "offer", listener: (data: { offer: string }) => void): Promise<PluginListenerHandle>;
  /** A file was shared into the app while it was open; takeSharedFile returns it. */
  addListener(event: "shared", listener: () => void): Promise<PluginListenerHandle>;
}

declare global {
  interface Window {
    /** Browser tests stand in for the native plugin with this object. */
    __manaVaultApp?: ManaVaultNative;
  }
}

let plugin: ManaVaultNative | null = null;

/** True inside the Android app (or a browser test standing in for it). */
export function isApp(): boolean {
  return Capacitor.isNativePlatform() || (typeof window !== "undefined" && !!window.__manaVaultApp);
}

export function native(): ManaVaultNative {
  plugin ??= window.__manaVaultApp ?? registerPlugin<ManaVaultNative>("ManaVault");
  return plugin;
}

const empty: AppSettings = { server: "", token: "", user: "", userId: 0, notifications: false, wifiOnly: false };
let settings: AppSettings = { ...empty };

export const appSettings = (): AppSettings => settings;
export const signedIn = () => !!settings.server && !!settings.token;

/** Loads the saved server address and sign-in. Runs once before the app starts. */
export async function loadSettings(): Promise<AppSettings> {
  settings = { ...empty, ...(await native().getSettings().catch(() => ({}))) };
  return settings;
}

export async function saveSettings(change: Partial<AppSettings>): Promise<void> {
  settings = { ...settings, ...change };
  await native().setSettings(change);
}

export async function clearSettings(): Promise<void> {
  settings = { ...empty };
  await native().clearSettings();
}

/** Turns a typed server address into its normal form: scheme, host and port, no trailing slash. */
export function normalizeServer(text: string): string | null {
  let value = text.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Addresses on a home network (and the phone itself), where plain HTTP is allowed. */
export function isPrivateAddress(server: string): boolean {
  let host = "";
  try {
    host = new URL(server).hostname;
  } catch {
    return false;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".home.arpa")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

/** The full address for an API path in the app, or the path itself in the browser. */
export function apiUrl(path: string): string {
  return isApp() && path.startsWith("/") ? `${settings.server}${path}` : path;
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(blob);
  });
}

/** Saves a file from the app through the Android share sheet. */
export async function saveBlob(filename: string, blob: Blob): Promise<void> {
  await native().saveFile({ name: filename, mime: blob.type || "application/octet-stream", data: await base64(blob) });
}

/**
 * The Back button: closes the open dialog or sheet, then the scanner or the About guide,
 * then goes back to the Cards view, then puts the app in the background.
 */
export function watchBackButton(handlers: { closeDialog: () => boolean; leaveView: () => boolean }): () => void {
  let handle: PluginListenerHandle | null = null;
  void native().addListener("backButton", () => {
    if (handlers.closeDialog()) return;
    if (document.querySelector(".sheetwrap, .scanpicker, .scansettings") || document.getElementById("dropdown") || document.getElementById("ctxmenu")) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    if (handlers.leaveView()) return;
    void native().minimize();
  }).then((created) => { handle = created; }).catch(() => undefined);
  return () => { void handle?.remove(); };
}
