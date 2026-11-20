// ---------- Administration: first-run setup, accounts, sign-up, card database, pictures, storage, devices, security, server, activity ----------
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { request } from "../api";
import { choiceDialog, closeDialog, confirmDialog, customDialog, dialog } from "../components/Dialog";
import { Picker } from "../components/Picker";
import { useApp } from "../store";

const SIZES = ["small", "normal", "large", "png", "art_crop", "border_crop"] as const;
type Size = (typeof SIZES)[number];
const SIZE_NAMES: Record<Size, [string, string]> = {
  small: ["Small", "Lists and the Deck list panel"], normal: ["Normal", "Grid, binder and search"], large: ["Large", "Card page and hover previews"],
  png: ["Full-size PNG", "Printing proxies"], art_crop: ["Art crop", "Card maker and picture search"], border_crop: ["Border crop", "Proxies without the black border"],
};
// rough average picture sizes until they are measured
const ROUGH_BYTES: Record<Size, number> = { small: 10_000, normal: 75_000, large: 180_000, png: 1_000_000, art_crop: 65_000, border_crop: 150_000 };

type Settings = {
  signup: "open" | "closed" | "invite"; sessionDays: number; attemptLimit: number; minPasswordLength: number; serverName: string; updateIntervalHours: number;
  extraLanguages: boolean; pictureSizes: Size[]; picturesDir: string; minFreeGb: number; backupIntervalHours: number; backupKeep: number; backupDir: string;
  setupDone: boolean; pictureEstimates: Partial<Record<Size, { bytes: number; at: string }>>;
};
type Space = { free: number; total: number } | null;
type PictureSummary = {
  folder: string; defaultFolder: string; available: boolean; locked: string | null; drive: Space; printings: number;
  sizes: Record<Size, { files: number; bytes: number }>; estimates: Settings["pictureEstimates"];
  status: { running: boolean; paused: boolean; size: Size | null; done: number; total: number; failed: number; stoppedForSpace: boolean; lastError: string | null };
  moving: { to: string; copied: boolean; error: string | null } | null;
};
type Overview = {
  settings: Settings; locks: Partial<Record<keyof Settings | "secureCookie", string>>; version: string; uptimeSeconds: number;
  storage: { dataFolder: string; databaseBytes: number; drive: Space; backupFolder: string; backups: Array<{ name: string; size: number; at: string }> };
  pictures: PictureSummary;
};
type Account = {
  id: number; name: string; createdAt: string; lastSignInAt: string | null; admin: boolean; disabled: boolean; mustChange: boolean;
  devices: number; collections: number; decks: number; cards: number; you: boolean;
};
type Catalog = {
  printingCount: number; updatedAt: string | null; skipped: { count: number; names: string[] };
  update: { isUpdating: boolean; lastError: string | null; lastAttemptAt: string | null };
  tags?: { art: number; oracle: number }; languages?: Array<{ lang: string; count: number }>; priceHistoryDays?: number;
};

const TABS = [
  ["setup", "Setup"], ["accounts", "Accounts"], ["signup", "Sign-up"], ["catalog", "Card database"], ["pictures", "Pictures"],
  ["storage", "Storage and backups"], ["devices", "Devices"], ["security", "Security"], ["server", "Server"], ["activity", "Activity"],
] as const;
export type AdminTab = (typeof TABS)[number][0];

export function bytes(value: number | null | undefined): string {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
}
const when = (value: string | null | undefined) => (value ? new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).toLocaleString() : "Never");
const duration = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", `${minutes} min`].filter(Boolean).join(" ");
};

/** The estimated download of a picture size: printings times the measured (or rough) average picture. */
export function estimate(summary: Pick<PictureSummary, "printings" | "estimates">, size: Size): { bytes: number; measured: boolean } {
  const measured = summary.estimates[size]?.bytes;
  return { bytes: summary.printings * (measured ?? ROUGH_BYTES[size]), measured: !!measured };
}

function Locked({ by }: { by?: string }) {
  return by ? <p className="note">Set by {by} on the server and cannot be changed here.</p> : null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="admsec"><h3>{title}</h3>{children}</section>;
}

/** A folder chooser for folders on the server (the picture and backup folders). */
export function chooseServerFolder(title: string, start: string, onChoose: (path: string) => void) {
  function Browser({ close }: { close: () => void }) {
    const [state, setState] = useState<{ path: string; parent: string | null; folders: string[]; space: Space } | null>(null);
    const [error, setError] = useState("");
    const open = useCallback((path: string) => {
      request<{ path: string; parent: string | null; folders: string[]; space: Space }>(`/api/admin/folders?path=${encodeURIComponent(path)}`)
        .then((value) => { setState(value); setError(""); })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "That folder cannot be opened."));
    }, []);
    useEffect(() => open(start), [open]);
    return (
      <div className="folderpick">
        <div className="prow"><label htmlFor="fp-path">Folder</label>
          <input id="fp-path" value={state?.path ?? start} onChange={(event) => setState((current) => (current ? { ...current, path: event.target.value } : current))}
            onKeyDown={(event) => { if (event.key === "Enter") open((event.target as HTMLInputElement).value); }} /></div>
        {error && <p className="note err">{error}</p>}
        <div className="folderlist" role="listbox" aria-label="Folders">
          {state?.parent && <button type="button" className="row" onClick={() => open(state.parent!)}>.. (up one folder)</button>}
          {state?.folders.map((name) => (
            <button key={name} type="button" className="row" onClick={() => open(`${state.path.replace(/[\\/]$/, "")}/${name}`)}>{name}</button>
          ))}
          {state && !state.folders.length && <p className="note">No folders inside</p>}
        </div>
        {state?.space && <p className="note">{bytes(state.space.free)} free of {bytes(state.space.total)} on this drive</p>}
        <div className="choicerow">
          <button type="button" className="btn primary" disabled={!state} onClick={() => { close(); onChoose(state!.path); }}>Use this folder</button>
        </div>
      </div>
    );
  }
  customDialog(title, (close) => <Browser close={close} />, 560, "Cancel");
}

export function AdminView() {
  const store = useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const tab = store.adminTab as AdminTab;
  const load = useCallback(async () => {
    try {
      setOverview(await request<Overview>("/api/admin/overview"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Administration could not be loaded.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = useCallback(async (changes: Partial<Settings>, message = "Settings saved") => {
    try {
      await request("/api/admin/settings", { method: "PUT", body: JSON.stringify(changes) });
      store.flash(message);
      await load();
    } catch (reason) {
      store.fail(reason, "Could not save the settings.");
    }
  }, [load, store]);
  const tabs = TABS.filter(([id]) => id !== "setup" || (overview && !overview.settings.setupDone) || tab === "setup");
  return (
    <div className="view aboutview" id="view-admin">
      <div id="pagetabs">
        <span className="phname">Administration</span>
        {overview && <span className="phwhere">Version {overview.version}</span>}
        <button type="button" className="btn small closebtn" onClick={store.closeAdmin} aria-label="Close Administration">Close</button>
      </div>
      <div className="aboutwrap">
        <div className="about">
          <nav className="abtoc" aria-label="Administration pages">
            {tabs.map(([id, label]) => (
              <a key={id} href={`#${id}`} className={id === tab ? "on" : ""} onClick={(event) => { event.preventDefault(); store.setAdminTab(id); }}>{label}</a>
            ))}
          </nav>
          <Picker className="abselect" label="Administration page" value={tab} onChange={(value) => store.setAdminTab(value as AdminTab)}
            options={tabs.map(([id, label]) => ({ value: id, label }))} />
          <article className="abpage admpage">
            {error && <p className="note err">{error}</p>}
            {overview && tab === "setup" && <SetupTab overview={overview} save={save} reload={load} />}
            {overview && tab === "accounts" && <AccountsTab />}
            {overview && tab === "signup" && <SignupTab overview={overview} save={save} />}
            {overview && tab === "catalog" && <CatalogTab overview={overview} save={save} />}
            {overview && tab === "pictures" && <PicturesTab overview={overview} save={save} reload={load} />}
            {overview && tab === "storage" && <StorageTab overview={overview} save={save} reload={load} />}
            {overview && tab === "devices" && <DevicesTab />}
            {overview && tab === "security" && <SecurityTab overview={overview} save={save} />}
            {overview && tab === "server" && <ServerTab overview={overview} save={save} />}
            {overview && tab === "activity" && <ActivityTab />}
          </article>
        </div>
      </div>
    </div>
  );
}

type TabProps = { overview: Overview; save: (changes: Partial<Settings>, message?: string) => Promise<void>; reload?: () => Promise<void> };

function useCatalog(): [Catalog | null, () => void] {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const load = useCallback(() => { void request<Catalog>("/api/catalog/status").then(setCatalog).catch(() => setCatalog(null)); }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [load]);
  return [catalog, load];
}

function SizeChecks({ summary, chosen, onChange }: { summary: PictureSummary; chosen: Size[]; onChange: (sizes: Size[]) => void }) {
  const total = chosen.reduce((sum, size) => sum + estimate(summary, size).bytes, 0);
  return (
    <>
      <table className="admtable">
        <thead><tr><th /><th>Picture size</th><th>Used for</th><th>Estimated download</th><th>Saved now</th></tr></thead>
        <tbody>
          {SIZES.map((size) => {
            const guess = estimate(summary, size);
            return (
              <tr key={size}>
                <td><input type="checkbox" aria-label={SIZE_NAMES[size][0]} checked={chosen.includes(size)}
                  onChange={(event) => onChange(event.target.checked ? [...chosen, size] : chosen.filter((item) => item !== size))} /></td>
                <td>{SIZE_NAMES[size][0]}</td>
                <td className="sub">{SIZE_NAMES[size][1]}</td>
                <td>{guess.measured ? "" : "About "}{bytes(guess.bytes)}</td>
                <td className="sub">{summary.sizes[size]?.files ? `${summary.sizes[size].files.toLocaleString()} pictures, ${bytes(summary.sizes[size].bytes)}` : "None"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">Selected: about {bytes(total)} for {summary.printings.toLocaleString()} pictures per size.
        {summary.drive ? ` ${bytes(summary.drive.free)} free on the picture drive.` : ""}</p>
    </>
  );
}

function FolderRow({ summary, onChoose }: { summary: PictureSummary; onChoose: (path: string) => void }) {
  return (
    <>
      <div className="prow"><label>Picture folder</label><span className="pathtext">{summary.folder}</span></div>
      {!summary.available && <p className="note err">Picture folder not available. Pictures load from Scryfall until it is back.</p>}
      <Locked by={summary.locked ?? undefined} />
      {!summary.locked && (
        <div className="btnrow">
          <button type="button" className="btn" onClick={() => chooseServerFolder("Picture folder", summary.folder, onChoose)}>Choose folder...</button>
        </div>
      )}
    </>
  );
}

function SetupTab({ overview, save, reload }: TabProps) {
  const store = useApp();
  const [catalog, loadCatalog] = useCatalog();
  const [sizes, setSizes] = useState<Size[]>(overview.settings.pictureSizes);
  const [folder, setFolder] = useState(overview.settings.picturesDir);
  const summary = overview.pictures;
  const measure = async () => {
    try {
      await request("/api/admin/pictures/estimate", { method: "POST" });
      await reload?.();
      store.flash("Picture sizes measured");
    } catch (reason) {
      store.fail(reason, "Could not measure the pictures.");
    }
  };
  const finish = async (skip: boolean) => {
    await save(skip ? { setupDone: true } : { setupDone: true, pictureSizes: sizes, ...(overview.locks.picturesDir || folder === overview.settings.picturesDir ? {} : { picturesDir: folder }) },
      skip ? "Setup skipped. Everything is in Administration." : "Setup finished");
    store.setAdminTab("pictures");
  };
  return (
    <>
      <h1>Setup</h1>
      <p>These choices apply to the whole server. Every step can be skipped and changed later in Administration.</p>
      <Section title="1. Card database">
        <p>Card data, rulings, Art and Oracle tags and prices, about 400 MB to download.</p>
        <p className="note">{catalog ? `${catalog.printingCount.toLocaleString()} printings, updated ${when(catalog.updatedAt)}${catalog.update.isUpdating ? ". Updating now." : ""}` : "Loading"}</p>
        <button type="button" className="btn" disabled={catalog?.update.isUpdating}
          onClick={() => void request("/api/catalog/update", { method: "POST" }).then(() => { store.flash("Card database update started"); loadCatalog(); }).catch((reason) => store.fail(reason, "Could not start the update."))}>
          Download the card database now</button>
      </Section>
      <Section title="2. Pictures to keep on the server">
        <SizeChecks summary={summary} chosen={sizes} onChange={setSizes} />
        <button type="button" className="btn small" onClick={() => void measure()}>Measure sizes</button>
      </Section>
      <Section title="3. Picture folder">
        <FolderRow summary={{ ...summary, folder: folder || summary.defaultFolder }} onChoose={setFolder} />
      </Section>
      <div className="btnrow">
        <button type="button" className="btn primary" onClick={() => void finish(false)}>Finish</button>
        <button type="button" className="btn" onClick={() => void finish(true)}>Skip for now</button>
      </div>
    </>
  );
}

function AccountsTab() {
  const store = useApp();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const load = useCallback(() => { void request<Account[]>("/api/admin/accounts").then(setAccounts).catch((reason) => store.fail(reason, "Could not load the accounts.")); }, [store]);
  useEffect(load, [load]);
  const act = async (run: () => Promise<unknown>, message: string) => {
    try {
      await run();
      store.flash(message);
      load();
    } catch (reason) {
      store.fail(reason, "That did not work.");
    }
  };
  const showPassword = (name: string, password: string) => customDialog(`Password for ${name}`, () => (
    <>
      <p>Give this temporary password to {name}. They choose their own password the first time they sign in.</p>
      <p className="bigcode" aria-label="Temporary password">{password}</p>
    </>
  ), 420, "Done");
  const create = () => dialog("New account", [["name", "User name", "", "text"], ["admin", "Make this account an admin", false, "check"]], async (values) => {
    try {
      const made = await request<{ name: string; password: string }>("/api/admin/accounts", { method: "POST", body: JSON.stringify({ name: values.name, admin: values.admin === true }) });
      load();
      showPassword(made.name, made.password);
    } catch (reason) {
      store.fail(reason, "Could not create the account.");
      return false;
    }
  }, "Create");
  const remove = async (account: Account) => {
    const others = (accounts ?? []).filter((item) => item.id !== account.id);
    const answer = await choiceDialog(`Delete ${account.name}`, <>Delete the account {account.name}? Its {account.collections} collections and {account.decks} decks can move to another account first.</>, [
      ["move", "Move them, then delete", true], ["all", "Delete everything"],
    ]);
    if (answer === "all") {
      if (await confirmDialog(`Delete ${account.name}`, `Delete ${account.name} with every collection, deck and trade? This cannot be undone.`, "Delete")) {
        await act(() => request(`/api/admin/accounts/${account.id}`, { method: "DELETE" }), `${account.name} deleted`);
      }
    } else if (answer === "move") {
      dialog(`Move ${account.name}'s collections and decks`, [["to", "Move them to", String(others[0]?.id ?? ""), "select", others.map((item) => [String(item.id), item.name])]], async (values) => {
        await act(() => request(`/api/admin/accounts/${account.id}?transferTo=${values.to}`, { method: "DELETE" }), `${account.name} deleted, collections and decks moved`);
      }, "Move and delete");
    }
  };
  return (
    <>
      <h1>Accounts</h1>
      <div className="btnrow"><button type="button" className="btn primary" onClick={create}>New account...</button></div>
      {!accounts ? <p className="note">Loading</p> : (
        <table className="admtable">
          <thead><tr><th>Account</th><th>Created</th><th>Last sign-in</th><th>Devices</th><th>Collections</th><th>Decks</th><th>Cards</th><th /></tr></thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className={account.disabled ? "off" : ""}>
                <td><b>{account.name}</b>{account.you && <span className="badge">You</span>}{account.admin && <span className="badge">Admin</span>}
                  {account.disabled && <span className="badge miss">Turned off</span>}{account.mustChange && <span className="badge">New password needed</span>}</td>
                <td className="sub">{when(account.createdAt)}</td>
                <td className="sub">{when(account.lastSignInAt)}</td>
                <td>{account.devices}</td><td>{account.collections}</td><td>{account.decks}</td><td>{account.cards.toLocaleString()}</td>
                <td className="admacts">
                  <button type="button" className="btn small" onClick={() => void act(async () => {
                    const answer = await request<{ password: string }>(`/api/admin/accounts/${account.id}/password`, { method: "POST" });
                    showPassword(account.name, answer.password);
                  }, `Password of ${account.name} reset`)}>Reset password</button>
                  {!account.you && <button type="button" className="btn small" onClick={() => void act(() => request(`/api/admin/accounts/${account.id}`, { method: "PUT", body: JSON.stringify({ disabled: !account.disabled }) }),
                    account.disabled ? `${account.name} turned on` : `${account.name} turned off`)}>{account.disabled ? "Turn on" : "Turn off"}</button>}
                  <button type="button" className="btn small" onClick={() => void act(() => request(`/api/admin/accounts/${account.id}`, { method: "PUT", body: JSON.stringify({ admin: !account.admin }) }),
                    account.admin ? `${account.name} is no longer an admin` : `${account.name} is an admin`)}>{account.admin ? "Remove admin" : "Make admin"}</button>
                  <button type="button" className="btn small" onClick={() => void act(() => request(`/api/admin/accounts/${account.id}/signout`, { method: "POST" }), `${account.name} signed out everywhere`)}>Sign out everywhere</button>
                  {!account.you && <button type="button" className="btn small" onClick={() => void remove(account)}>Delete...</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function SignupTab({ overview, save }: TabProps) {
  const store = useApp();
  const [invites, setInvites] = useState<Array<{ code: string; note: string; createdBy: string; createdAt: string; usedBy: string | null; usedAt: string | null }> | null>(null);
  const load = useCallback(() => { void request<typeof invites>("/api/admin/invites").then(setInvites).catch(() => setInvites([])); }, []);
  useEffect(load, [load]);
  const mode = overview.settings.signup;
  return (
    <>
      <h1>Sign-up</h1>
      <div className="seg" role="group" aria-label="Who can create an account">
        {([["open", "Open"], ["invite", "Invite codes"], ["closed", "Closed"]] as const).map(([value, label]) => (
          <button key={value} type="button" className={mode === value ? "on" : ""} aria-pressed={mode === value} disabled={!!overview.locks.signup}
            onClick={() => void save({ signup: value }, `Sign-up is ${label.toLowerCase()}`)}>{label}</button>
        ))}
      </div>
      <p className="note">{mode === "open" ? "Anyone who can reach this server can create an account." : mode === "invite" ? "New accounts need a one-time invite code." : "Only admins can create accounts, in Accounts."}</p>
      <Locked by={overview.locks.signup} />
      <Section title="Invite codes">
        <div className="btnrow"><button type="button" className="btn" onClick={() => dialog("New invite code", [["note", "Who it is for (optional)", "", "text"]], async (values) => {
          try {
            const made = await request<{ code: string }>("/api/admin/invites", { method: "POST", body: JSON.stringify({ note: values.note }) });
            load();
            customDialog("Invite code", () => <><p>Give this code to the person. It works once.</p><p className="bigcode">{made.code}</p></>, 380, "Done");
          } catch (reason) {
            store.fail(reason, "Could not create the code.");
          }
        }, "Create")}>New invite code...</button></div>
        {!invites?.length ? <p className="note">No invite codes</p> : (
          <table className="admtable">
            <thead><tr><th>Code</th><th>For</th><th>Made</th><th>Used by</th><th /></tr></thead>
            <tbody>{invites.map((invite) => (
              <tr key={invite.code}>
                <td className="mono">{invite.code}</td><td>{invite.note}</td><td className="sub">{when(invite.createdAt)} by {invite.createdBy}</td>
                <td>{invite.usedBy ? `${invite.usedBy}, ${when(invite.usedAt)}` : <span className="sub">Not used</span>}</td>
                <td><button type="button" className="btn small" onClick={() => void request(`/api/admin/invites/${invite.code}`, { method: "DELETE" }).then(load)}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>
    </>
  );
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", ph: "Phyrexian", qya: "Quenya", he: "Hebrew", la: "Latin", grc: "Ancient Greek", ar: "Arabic", sa: "Sanskrit" };

function NumberSetting({ id, label, value, locked, min, max, unit, onSave }: { id: string; label: string; value: number; locked?: string; min: number; max: number; unit: string; onSave: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="prow"><label htmlFor={id}>{label}</label>
      <span className="rangebox">
        <input id={id} type="number" min={min} max={max} value={text} disabled={!!locked} onChange={(event) => setText(event.target.value)} />
        <span className="sub">{unit}</span>
        <button type="button" className="btn small" disabled={!!locked || text === String(value)} onClick={() => onSave(Number(text))}>Save</button>
      </span>
    </div>
  );
}

function CatalogTab({ overview, save }: TabProps) {
  const store = useApp();
  const [catalog, load] = useCatalog();
  return (
    <>
      <h1>Card database</h1>
      {!catalog ? <p className="note">Loading</p> : (
        <table className="admtable kv"><tbody>
          <tr><th>Printings</th><td>{catalog.printingCount.toLocaleString()}</td></tr>
          <tr><th>Last update</th><td>{when(catalog.updatedAt)}{catalog.update.isUpdating ? ", updating now" : ""}</td></tr>
          {catalog.update.lastError && <tr><th>Last error</th><td className="err">{catalog.update.lastError}</td></tr>}
          <tr><th>Skipped cards</th><td>{catalog.skipped.count ? `${catalog.skipped.count}: ${catalog.skipped.names.join(", ")}` : "None"}</td></tr>
          <tr><th>Art tags</th><td>{(catalog.tags?.art ?? 0).toLocaleString()}</td></tr>
          <tr><th>Role tags</th><td>{(catalog.tags?.oracle ?? 0).toLocaleString()}</td></tr>
          <tr><th>Languages</th><td>{(catalog.languages ?? []).map((item) => `${LANGUAGE_NAMES[item.lang] ?? item.lang} ${item.count.toLocaleString()}`).join(", ")}</td></tr>
          <tr><th>Price history</th><td>{catalog.priceHistoryDays ?? 0} days saved</td></tr>
        </tbody></table>
      )}
      <div className="btnrow">
        <button type="button" className="btn primary" disabled={catalog?.update.isUpdating}
          onClick={() => void request("/api/catalog/update", { method: "POST" }).then(() => { store.flash("Card database update started"); load(); }).catch((reason) => store.fail(reason, "Could not start the update."))}>Update now</button>
      </div>
      <Section title="Schedule">
        <NumberSetting id="adm-interval" label="Update every" value={overview.settings.updateIntervalHours} locked={overview.locks.updateIntervalHours} min={0} max={8760} unit="hours (0 is off)"
          onSave={(updateIntervalHours) => void save({ updateIntervalHours }, updateIntervalHours ? `Card database updates every ${updateIntervalHours} hours` : "Scheduled updates turned off")} />
        <Locked by={overview.locks.updateIntervalHours} />
      </Section>
      <Section title="Languages">
        <label className="check"><input type="checkbox" checked={overview.settings.extraLanguages}
          onChange={(event) => void save({ extraLanguages: event.target.checked })} /> Also keep printings in Scryfall's unofficial languages (Phyrexian, Quenya and others)</label>
        <p className="note">This reads Scryfall's All Cards file (several hundred MB) with each update.</p>
      </Section>
    </>
  );
}

function PicturesTab({ overview, save, reload }: TabProps) {
  const store = useApp();
  const [summary, setSummary] = useState(overview.pictures);
  useEffect(() => setSummary(overview.pictures), [overview.pictures]);
  useEffect(() => {
    const timer = window.setInterval(() => { void request<PictureSummary>("/api/admin/pictures").then(setSummary).catch(() => undefined); }, 3000);
    return () => window.clearInterval(timer);
  }, []);
  const call = async (url: string, method: string, message: string, body?: unknown) => {
    try {
      setSummary(await request<PictureSummary>(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }));
      store.flash(message);
      await reload?.();
    } catch (reason) {
      store.fail(reason, "That did not work.");
    }
  };
  const changeSizes = async (sizes: Size[]) => {
    const removed = overview.settings.pictureSizes.filter((size) => !sizes.includes(size));
    await save({ pictureSizes: sizes }, "Picture sizes saved");
    for (const size of removed) {
      if (!summary.sizes[size]?.files) continue;
      const answer = await choiceDialog("Picture size removed", <>Delete the {summary.sizes[size].files.toLocaleString()} {SIZE_NAMES[size][0].toLowerCase()} pictures already saved ({bytes(summary.sizes[size].bytes)})?</>, [
        ["delete", "Delete them", true], ["keep", "Keep them"],
      ]);
      if (answer === "delete") await call(`/api/admin/pictures/${size}`, "DELETE", `${SIZE_NAMES[size][0]} pictures deleted`);
    }
  };
  const status = summary.status;
  return (
    <>
      <h1>Pictures</h1>
      <SizeChecks summary={summary} chosen={overview.settings.pictureSizes} onChange={(sizes) => void changeSizes(sizes)} />
      <div className="btnrow"><button type="button" className="btn small" onClick={() => void call("/api/admin/pictures/estimate", "POST", "Picture sizes measured")}>Measure sizes</button></div>
      <Section title="Downloads">
        <p role="status">{status.running ? `Downloading ${status.size ? SIZE_NAMES[status.size][0].toLowerCase() : ""} pictures: ${status.done.toLocaleString()} of ${status.total.toLocaleString()}${status.failed ? `, ${status.failed} failed` : ""}`
          : status.paused ? "Paused" : overview.settings.pictureSizes.length ? "Up to date" : "No picture sizes chosen"}</p>
        {status.lastError && <p className="note err">{status.lastError}</p>}
        <div className="btnrow">
          {status.paused
            ? <button type="button" className="btn" onClick={() => void call("/api/admin/pictures/resume", "POST", "Picture downloads resumed")}>Resume</button>
            : <button type="button" className="btn" onClick={() => void call("/api/admin/pictures/pause", "POST", "Picture downloads paused")}>Pause</button>}
        </div>
        <NumberSetting id="adm-minfree" label="Minimum free space" value={overview.settings.minFreeGb} min={1} max={10000} unit="GB"
          onSave={(minFreeGb) => void save({ minFreeGb }, `Downloads stop below ${minFreeGb} GB free`)} />
      </Section>
      <Section title="Picture folder">
        <FolderRow summary={summary} onChoose={(path) => void call("/api/admin/pictures/move", "POST", "Moving pictures. The old folder is left for you to delete.", { path })} />
        {summary.moving && <p className="note">{summary.moving.error ? `Move failed: ${summary.moving.error}` : summary.moving.copied ? `Pictures now in ${summary.moving.to}. The old folder can be deleted.` : `Copying pictures to ${summary.moving.to}`}</p>}
      </Section>
    </>
  );
}

function StorageTab({ overview, save, reload }: TabProps) {
  const store = useApp();
  const storage = overview.storage;
  const pictureBytes = Object.values(overview.pictures.sizes).reduce((sum, size) => sum + size.bytes, 0);
  const backupNow = async () => {
    try {
      await request("/api/admin/backups", { method: "POST" });
      store.flash("Server backup written");
      await reload?.();
    } catch (reason) {
      store.fail(reason, "Could not write the backup.");
    }
  };
  const restore = async (from?: string, file?: File) => {
    const ok = await confirmDialog("Restore server backup", "Restore this backup? Every account, collection and deck goes back to the backup, and the server restarts. The current data is kept beside it.", "Restore");
    if (!ok) return;
    try {
      if (from) await request(`/api/admin/restore?from=${encodeURIComponent(from)}`, { method: "POST" });
      else await request("/api/admin/restore", { method: "POST", body: file, headers: { "content-type": "application/vnd.sqlite3" } });
      customDialog("Restoring", () => <p>The server is restarting on the restored data. Reload the page in a minute.</p>, 380, "Close");
    } catch (reason) {
      store.fail(reason, "Could not restore the backup.");
    }
  };
  return (
    <>
      <h1>Storage and backups</h1>
      <table className="admtable kv"><tbody>
        <tr><th>Data folder</th><td className="pathtext">{storage.dataFolder}</td></tr>
        <tr><th>Database</th><td>{bytes(storage.databaseBytes)}</td></tr>
        <tr><th>Pictures</th><td>{bytes(pictureBytes)} in {overview.pictures.folder}</td></tr>
        <tr><th>Free space</th><td>{storage.drive ? `${bytes(storage.drive.free)} of ${bytes(storage.drive.total)}` : "Unknown"}</td></tr>
      </tbody></table>
      <Section title="Whole-server backups">
        <p className="note">A server backup holds every account, collection, deck, trade, setting and the card database. Pictures are not included.</p>
        <NumberSetting id="adm-backup" label="Back up every" value={overview.settings.backupIntervalHours} min={0} max={8760} unit="hours (0 is off)"
          onSave={(backupIntervalHours) => void save({ backupIntervalHours })} />
        <NumberSetting id="adm-keep" label="Backups to keep" value={overview.settings.backupKeep} min={1} max={365} unit="newest"
          onSave={(backupKeep) => void save({ backupKeep })} />
        <div className="prow"><label>Backup folder</label><span className="pathtext">{storage.backupFolder}</span></div>
        <Locked by={overview.locks.backupDir} />
        <div className="btnrow">
          {!overview.locks.backupDir && <button type="button" className="btn" onClick={() => chooseServerFolder("Backup folder", storage.backupFolder, (backupDir) => void save({ backupDir }, "Backup folder saved"))}>Choose folder...</button>}
          <button type="button" className="btn primary" onClick={() => void backupNow()}>Back up now</button>
          <label className="btn">Restore from a file...<input type="file" accept=".sqlite" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void restore(undefined, file); }} /></label>
        </div>
        {!storage.backups.length ? <p className="note">No server backups yet</p> : (
          <table className="admtable">
            <thead><tr><th>Backup</th><th>Size</th><th /></tr></thead>
            <tbody>{storage.backups.map((backup) => (
              <tr key={backup.name}>
                <td>{when(backup.at)}</td><td>{bytes(backup.size)}</td>
                <td className="admacts">
                  <a className="btn small" href={`/api/admin/backups/${backup.name}`} download>Download</a>
                  <button type="button" className="btn small" onClick={() => void restore(backup.name)}>Restore...</button>
                  <button type="button" className="btn small" onClick={() => void request(`/api/admin/backups/${backup.name}`, { method: "DELETE" }).then(() => reload?.())}>Delete</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>
    </>
  );
}

function DevicesTab() {
  const store = useApp();
  const [devices, setDevices] = useState<Array<{ id: string; name: string; account: string; createdAt: string; lastSeen: string }> | null>(null);
  const load = useCallback(() => { void request<typeof devices>("/api/admin/devices").then(setDevices).catch(() => setDevices([])); }, []);
  useEffect(load, [load]);
  return (
    <>
      <h1>Devices</h1>
      <p className="note">Phones signed in with the Android app, on every account.</p>
      {!devices?.length ? <p className="note">{devices ? "No devices are signed in" : "Loading"}</p> : (
        <table className="admtable">
          <thead><tr><th>Device</th><th>Account</th><th>Signed in</th><th>Last seen</th><th /></tr></thead>
          <tbody>{devices.map((device) => (
            <tr key={device.id}>
              <td>{device.name}</td><td>{device.account}</td><td className="sub">{when(device.createdAt)}</td><td className="sub">{when(device.lastSeen)}</td>
              <td><button type="button" className="btn small" onClick={() => void request(`/api/admin/devices/${device.id}`, { method: "DELETE" })
                .then(() => { store.flash(`${device.name} signed out`); load(); }).catch((reason) => store.fail(reason, "Could not remove the device."))}>Remove</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

function SecurityTab({ overview, save }: TabProps) {
  const settings = overview.settings;
  return (
    <>
      <h1>Security</h1>
      <NumberSetting id="adm-session" label="Sign-ins last" value={settings.sessionDays} min={1} max={365} unit="days" onSave={(sessionDays) => void save({ sessionDays })} />
      <NumberSetting id="adm-attempts" label="Sign-in attempts" value={settings.attemptLimit} locked={overview.locks.attemptLimit} min={3} max={1000} unit="per address in 15 minutes"
        onSave={(attemptLimit) => void save({ attemptLimit })} />
      <NumberSetting id="adm-minpass" label="Minimum password length" value={settings.minPasswordLength} min={8} max={64} unit="characters"
        onSave={(minPasswordLength) => void save({ minPasswordLength })} />
      <p className="note">Secure cookies: {overview.locks.secureCookie ? `set by ${overview.locks.secureCookie}` : "automatic (secure when the page is opened over HTTPS)"}.</p>
    </>
  );
}

function ServerTab({ overview, save }: TabProps) {
  const [info, setInfo] = useState<{ version: string; uptimeSeconds: number; scryfall: boolean; update: { latest: string | null; newer: boolean; error?: string }; log: string[] } | null>(null);
  const [name, setName] = useState(overview.settings.serverName);
  const load = useCallback(() => { void request<typeof info>("/api/admin/server").then(setInfo).catch(() => setInfo(null)); }, []);
  useEffect(load, [load]);
  return (
    <>
      <h1>Server</h1>
      <table className="admtable kv"><tbody>
        <tr><th>Version</th><td>{overview.version}</td></tr>
        <tr><th>Updates</th><td>{!info ? "Checking" : info.update.error ? info.update.error : info.update.newer ? `Version ${info.update.latest} is available. Update the stack in Dockhand.` : info.update.latest ? "Up to date" : "No release published yet"}</td></tr>
        <tr><th>Running for</th><td>{duration(info?.uptimeSeconds ?? overview.uptimeSeconds)}</td></tr>
        <tr><th>Scryfall</th><td>{!info ? "Checking" : info.scryfall ? "Reachable" : "Not reachable"}</td></tr>
      </tbody></table>
      <div className="prow"><label htmlFor="adm-name">Server name</label>
        <span className="rangebox"><input id="adm-name" value={name} maxLength={60} placeholder="Shown in the title bar" onChange={(event) => setName(event.target.value)} />
          <button type="button" className="btn small" disabled={name === overview.settings.serverName} onClick={() => void save({ serverName: name }, "Server name saved")}>Save</button></span></div>
      <Section title="Recent server log">
        <div className="btnrow"><button type="button" className="btn small" onClick={load}>Refresh</button></div>
        <pre className="admlog" aria-label="Server log">{info?.log.slice(-200).join("\n") || "No log lines"}</pre>
      </Section>
    </>
  );
}

function ActivityTab() {
  const [rows, setRows] = useState<Array<{ at: string; account: string; kind: string; detail: string; address: string }> | null>(null);
  useEffect(() => { void request<typeof rows>("/api/admin/activity").then(setRows).catch(() => setRows([])); }, []);
  return (
    <>
      <h1>Activity</h1>
      {!rows?.length ? <p className="note">{rows ? "Nothing yet" : "Loading"}</p> : (
        <table className="admtable">
          <thead><tr><th>When</th><th>Account</th><th>What</th><th>Details</th><th>Address</th></tr></thead>
          <tbody>{rows.map((row, index) => (
            <tr key={index} className={row.kind === "Failed sign-in" ? "warn" : ""}>
              <td className="sub">{when(row.at)}</td><td>{row.account}</td><td>{row.kind}</td><td>{row.detail}</td><td className="sub">{row.address}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

/** For an account with a temporary password: asks for a new one before anything else. */
export function forcePasswordChange() {
  dialog("Choose a new password", [["old", "Temporary password", "", "password"], ["new", "New password", "", "password"]], async (values) => {
    try {
      await request("/api/password", { method: "POST", body: JSON.stringify({ old: values.old, new: values.new }) });
      closeDialog();
      window.location.reload();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "Could not change the password.");
      return false;
    }
  }, "Save");
}
