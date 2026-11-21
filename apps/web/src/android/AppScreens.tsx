// ---------- screens and windows that only the Android app has ----------
import { Icon } from "../icons";
import { useEffect, useState, type FormEvent } from "react";
import { APP_VERSION, request } from "../api";
import { customDialog } from "../components/Dialog";
import { idbWipe } from "./idb";
import { appFetch, readJson } from "./net";
import { onSyncStatus, syncNow, syncStatus, type SyncProblem, type SyncStatus } from "./offline";
import { apiUrl, clearSettings, isApp, native, normalizeServer, saveSettings } from "./platform";

type ServerInfo = { server: string; version: string | null; signup: boolean };

async function checkServer(text: string): Promise<ServerInfo> {
  const server = normalizeServer(text);
  if (!server) throw new Error("Enter the server address, for example https://vault.example.com.");
  // 0.17.0: the app connects over https only (the phone's own address, used for testing, is the one exception)
  if (server.startsWith("http:") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(server)) {
    throw new Error("The app connects over https only. Enter the https address of the server.");
  }
  let health: { status?: string; version?: string | null };
  try {
    const response = await fetch(`${server}/api/health`, { credentials: "omit" });
    health = (await response.json()) as typeof health;
  } catch {
    throw new Error("No Mana Vault server answered at that address.");
  }
  if (health.status !== "ok") throw new Error("No Mana Vault server answered at that address.");
  const config = await fetch(`${server}/api/config`, { credentials: "omit" }).then((response) => response.json() as Promise<{ signup?: boolean }>).catch(() => ({ signup: false }));
  return { server, version: health.version ?? null, signup: !!config.signup };
}

/** The first screen in the app: server address, then sign in or create an account. */
export function AppSignIn({ onDone }: { onDone: () => void }) {
  const [address, setAddress] = useState("");
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      setInfo(await checkServer(address));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No Mana Vault server answered at that address.");
    }
    setBusy(false);
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!info) return;
    if (mode === "up" && password !== repeat) return setMessage("The passwords do not match.");
    setBusy(true);
    setMessage("");
    const post = (path: string, body: unknown) => fetch(`${info.server}${path}`, {
      method: "POST", credentials: "omit", headers: { "content-type": "application/json", "x-mana-vault": "1" }, body: JSON.stringify(body),
    });
    try {
      if (mode === "up") {
        const created = await post("/api/signup", { name: name.trim(), password });
        if (!created.ok) throw new Error(((await created.json().catch(() => ({}))) as { error?: string }).error ?? "The account could not be created.");
      }
      const device = (await native().appInfo().catch(() => ({ device: "Android phone" }))).device;
      const response = await post("/api/devices", { name: name.trim(), password, device });
      const result = (await response.json().catch(() => ({}))) as { error?: string; token?: string; id?: number; name?: string };
      if (!response.ok || !result.token) throw new Error(result.error ?? "Something went wrong.");
      await idbWipe();
      await saveSettings({ server: info.server, token: result.token, user: result.name ?? name.trim(), userId: result.id ?? 0 });
      onDone();
      return;
    } catch (reason) {
      setMessage(reason instanceof Error && reason.message !== "Failed to fetch" ? reason.message : "The server could not be reached.");
    }
    setBusy(false);
  };

  return (
    <div className="appsign">
      {!info ? (
        <form className="appcard" onSubmit={connect}>
          <div className="appbrand"><span className="brand" aria-hidden="true">M</span><h1>Mana Vault</h1></div>
          <label htmlFor="server">Server address</label>
          <input id="server" value={address} onChange={(event) => setAddress(event.target.value)} autoCapitalize="none" autoCorrect="off"
            inputMode="url" placeholder="https://vault.example.com" required autoFocus />
          <button type="submit" className="btn primary go" disabled={busy}>Continue</button>
          <div className="appmsg" role="alert">{message}</div>
        </form>
      ) : (
        <form className="appcard" onSubmit={signIn}>
          <div className="appbrand"><span className="brand" aria-hidden="true">M</span><h1>Mana Vault</h1></div>
          <p className="note">{info.server}{info.version ? ` (version ${info.version})` : ""}</p>

          {info.signup && (
            <div className="seg apptabs">
              <button type="button" className={mode === "in" ? "on" : undefined} onClick={() => setMode("in")}>Sign in</button>
              <button type="button" className={mode === "up" ? "on" : undefined} onClick={() => setMode("up")}>Create account</button>
            </div>
          )}
          <label htmlFor="name">User name</label>
          <input id="name" value={name} onChange={(event) => setName(event.target.value)} autoCapitalize="none" autoComplete="username" required autoFocus />
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} required />
          {mode === "up" && (
            <>
              <label htmlFor="pw2">Repeat password</label>
              <input id="pw2" type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" required />
            </>
          )}
          <button type="submit" className="btn primary go" disabled={busy}>{mode === "up" ? "Create account" : "Sign in"}</button>
          <button type="button" className="lnk" onClick={() => { setInfo(null); setMessage(""); }}>Change server</button>
          <div className="appmsg" role="alert">{message}</div>
        </form>
      )}
    </div>
  );
}

/** Signs this phone out: removes its device sign-in on the server (when reachable) and everything kept on the phone. */
export async function signOutApp(): Promise<void> {
  await appFetch("/api/logout", { method: "POST", body: "{}" }, 5000).catch(() => undefined);
  await native().setNotifications({ enabled: false, wifiOnly: false }).catch(() => undefined);
  await idbWipe().catch(() => undefined);
  await clearSettings();
  window.location.reload();
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState(syncStatus);
  useEffect(() => onSyncStatus(setStatus), []);
  return status;
}

/** Always shown in the app's top bar: Synced with the time of the last sync, Waiting, Offline or Syncing. Tapping it syncs now. */
export function SyncChip() {
  const status = useSyncStatus();
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const ago = (at: number | null) => {
    if (!at) return "";
    const minutes = Math.floor((Date.now() - at) / 60_000);
    return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  };
  const label = status.state === "syncing" ? "Syncing" : status.state === "offline" ? "Offline" : status.pending ? "Waiting" : `Synced ${ago(status.lastSync)}`.trim();
  return (
    <button type="button" className={`pbtn syncchip ${status.state}${status.error ? " warn" : ""}`} title={status.error ?? "Sync now"} aria-label={`${label}. Sync now`}
      onClick={() => { void syncNow(true); }}>
      <Icon name="sync" />{label}{status.pending > 0 && <span className="cbadge">{status.pending}</span>}
    </button>
  );
}

export function showSyncProblems(problems: SyncProblem[]) {
  customDialog("Changes not applied", () => (
    <div>
      <ul className="synclist">
        {problems.map((problem, index) => <li key={index}><b>{problem.label}</b><span>{problem.error}</span></li>)}
      </ul>
    </div>
  ), 460);
}

type Device = { id: string; name: string; createdAt: string; lastSeen: string; current: boolean };

/** The Devices window: phones signed in to this account, with Remove. */
export function DeviceList() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState("");
  // in the browser the cookie signs the request in, in the app the device token
  const call = (path: string, init: RequestInit = {}) => isApp()
    ? appFetch(path, init)
    : fetch(path, { ...init, credentials: "same-origin", headers: init.method ? { "x-mana-vault": "1" } : {} });
  const load = () => {
    call("/api/devices").then((response) => readJson<Device[]>(response)).then(setDevices)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The device list could not be loaded."));
  };
  useEffect(load, []);
  const remove = async (device: Device) => {
    try {
      await readJson(await call(`/api/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" }));
      if (device.current) {
        await signOutApp();
        return;
      }
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The device could not be removed.");
    }
  };
  if (error) return <p className="note err">{error}</p>;
  if (!devices) return <p className="note">Loading</p>;
  if (!devices.length) return <p className="note">No phones signed in</p>;
  return (
    <table className="devlist">
      <thead><tr><th>Device</th><th>Last seen</th><th /></tr></thead>
      <tbody>
        {devices.map((device) => (
          <tr key={device.id}>
            <td>{device.name}{device.current && <span className="pill">This phone</span>}</td>
            <td>{device.lastSeen.slice(0, 16)}</td>
            <td><button type="button" className="btn small" onClick={() => { void remove(device); }}>Remove</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const UPDATE_KEY = "mana-vault.updateCheck";

/** True when version a is newer than version b (both X.Y.Z). */
export function newerVersion(a: string, b: string): boolean {
  const parse = (value: string) => value.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let index = 0; index < 3; index++) if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) > (y[index] ?? 0);
  return false;
}

/** Looks for a newer app on GitHub. Without `always`, checks at most once a day and stays quiet when there is none. */
export async function checkForUpdate(always = false): Promise<void> {
  const last = Number(localStorage.getItem(UPDATE_KEY) ?? 0);
  if (!always && Date.now() - last < 86_400_000) return;
  localStorage.setItem(UPDATE_KEY, String(Date.now()));
  // 0.17.0: the app asks its own server, which offers the app that matches the server's version
  let latest: { version: string; url: string } | null = null;
  try {
    latest = await request<{ version: string; url: string }>("/api/app/latest");
  } catch {
    latest = null;
  }
  const version = latest?.version ?? "";
  if (version && newerVersion(version, APP_VERSION)) {
    customDialog("Update available", () => (
      <div>
        <p>Your server runs Mana Vault {version}. This phone has {APP_VERSION}.</p>
        <p><a className="lnk" href={apiUrl(latest!.url)} target="_blank" rel="noreferrer">Download the app for {version}</a></p>
      </div>
    ), 400);
  } else if (always) {
    customDialog("Check for updates", () => (
      <div>
        <p>{version ? `This phone has the app for the server's version (${APP_VERSION}).` : "The server could not be reached."}</p>
      </div>
    ), 400);
  }
}

