// ---------- server settings: saved by Mana Vault, or locked by an environment variable ----------
import type { DatabaseSync } from "node:sqlite";

export const PICTURE_SIZES = ["small", "normal", "large", "png", "art_crop", "border_crop"] as const;
export type PictureSize = (typeof PICTURE_SIZES)[number];
export type SignupMode = "open" | "closed" | "invite";

export type ServerSettings = {
  /** Who may create an account: anyone, nobody, or people with an invite code. */
  signup: SignupMode;
  /** Days a sign-in lasts. */
  sessionDays: number;
  /** Failed sign-ins (and new accounts) allowed per address in 15 minutes. */
  attemptLimit: number;
  minPasswordLength: number;
  /** Shown in the title bar; empty shows Mana Vault only. */
  serverName: string;
  /** Hours between scheduled card database updates; 0 turns the schedule off. */
  updateIntervalHours: number;
  /** Also keep Scryfall's unofficial languages (Phyrexian, Quenya and others), read from the All Cards file. */
  extraLanguages: boolean;
  pictureSizes: PictureSize[];
  /** The picture folder chosen in the program; empty uses the default. */
  picturesDir: string;
  /** Downloads stop when the picture drive has less free space than this, in GB. */
  minFreeGb: number;
  /** Hours between whole-server backups; 0 turns them off. */
  backupIntervalHours: number;
  backupKeep: number;
  /** Folder for whole-server backups; empty uses "backups" in the data folder. */
  backupDir: string;
  /** The first-run setup was finished or skipped. */
  setupDone: boolean;
  /** Measured average picture sizes, by size name. */
  pictureEstimates: Partial<Record<PictureSize, { bytes: number; at: string }>>;
};

export const DEFAULT_SETTINGS: ServerSettings = {
  signup: "open", sessionDays: 30, attemptLimit: 30, minPasswordLength: 8, serverName: "", updateIntervalHours: 168, extraLanguages: true,
  pictureSizes: [], picturesDir: "", minFreeGb: 10, backupIntervalHours: 0, backupKeep: 7, backupDir: "", setupDone: false, pictureEstimates: {},
};

/** Settings an environment variable sets; these show as locked in Administration. */
export type Locks = Partial<Record<keyof ServerSettings | "secureCookie", string>>;

export function initializeSettings(database: DatabaseSync): void {
  database.exec("CREATE TABLE IF NOT EXISTS server_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

/** Checks a partial settings object; returns the clean values or an error message. */
export function readSettingsInput(body: unknown): Partial<ServerSettings> | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Settings must be an object";
  const input = body as Record<string, unknown>;
  const out: Partial<ServerSettings> = {};
  const int = (key: keyof ServerSettings, min: number, max: number, label: string) => {
    if (input[key] === undefined) return null;
    const number = Number(input[key]);
    if (!Number.isInteger(number) || number < min || number > max) return `${label} must be a whole number from ${min} to ${max}`;
    (out as Record<string, unknown>)[key] = number;
    return null;
  };
  const errors = [
    int("sessionDays", 1, 365, "Sign-in length"), int("attemptLimit", 3, 1000, "Sign-in attempts"),
    int("minPasswordLength", 8, 64, "Minimum password length"), int("updateIntervalHours", 0, 8760, "Update schedule"),
    int("minFreeGb", 1, 10000, "Minimum free space"), int("backupIntervalHours", 0, 8760, "Backup schedule"), int("backupKeep", 1, 365, "Backups to keep"),
  ].filter(Boolean);
  if (errors.length) return String(errors[0]);
  if (input.signup !== undefined) {
    if (input.signup !== "open" && input.signup !== "closed" && input.signup !== "invite") return "Sign-up must be open, closed or invite";
    out.signup = input.signup;
  }
  if (input.serverName !== undefined) {
    if (typeof input.serverName !== "string" || input.serverName.trim().length > 60) return "The server name can have up to 60 characters";
    out.serverName = input.serverName.trim();
  }
  for (const key of ["extraLanguages", "setupDone"] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") return `${key} must be true or false`;
      out[key] = input[key] as boolean;
    }
  }
  if (input.pictureSizes !== undefined) {
    if (!Array.isArray(input.pictureSizes) || input.pictureSizes.some((size) => !PICTURE_SIZES.includes(size as PictureSize))) return "Unknown picture size";
    out.pictureSizes = PICTURE_SIZES.filter((size) => (input.pictureSizes as unknown[]).includes(size));
  }
  for (const key of ["picturesDir", "backupDir"] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "string" || (input[key] as string).length > 500) return "Folders must be a path of up to 500 characters";
      out[key] = (input[key] as string).trim();
    }
  }
  return out;
}

export class Settings {
  private cache: ServerSettings | null = null;
  constructor(private readonly database: DatabaseSync, readonly locks: Locks = {}, private readonly forced: Partial<ServerSettings> = {}) {
    initializeSettings(database);
  }

  /** The settings in force: locked values from the environment win over saved ones. */
  get(): ServerSettings {
    if (!this.cache) {
      const saved: Record<string, unknown> = {};
      for (const row of this.database.prepare("SELECT key, value FROM server_settings").all()) {
        try {
          saved[String(row.key)] = JSON.parse(String(row.value));
        } catch {
          // a value that cannot be read keeps its default
        }
      }
      const clean = readSettingsInput(saved);
      const base = { ...DEFAULT_SETTINGS, ...(typeof clean === "string" ? {} : clean) };
      if (saved.pictureEstimates && typeof saved.pictureEstimates === "object") base.pictureEstimates = saved.pictureEstimates as ServerSettings["pictureEstimates"];
      this.cache = { ...base, ...this.forced };
    }
    return this.cache;
  }

  /** Saves settings; locked ones are refused. */
  set(changes: Partial<ServerSettings>): string | null {
    const locked = Object.keys(changes).find((key) => key in this.forced);
    if (locked) return `This setting is set by ${this.locks[locked as keyof Locks] ?? "the server's environment"} and cannot be changed here`;
    const save = this.database.prepare("INSERT INTO server_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    for (const [key, value] of Object.entries(changes)) save.run(key, JSON.stringify(value));
    this.cache = null;
    return null;
  }
}

/** Reads the environment variables that lock settings. Unset variables leave the setting to Mana Vault. */
export function settingsFromEnvironment(env: NodeJS.ProcessEnv = process.env): { forced: Partial<ServerSettings>; locks: Locks } {
  const forced: Partial<ServerSettings> = {};
  const locks: Locks = {};
  const signup = env.MANAVAULT_SIGNUP?.trim().toLowerCase();
  if (signup) {
    forced.signup = signup === "off" || signup === "closed" ? "closed" : signup === "invite" ? "invite" : "open";
    locks.signup = "MANAVAULT_SIGNUP";
  }
  const interval = env.MANAVAULT_CARD_UPDATE_INTERVAL_HOURS ?? env.CARD_UPDATE_INTERVAL_HOURS;
  if (interval !== undefined && interval.trim() !== "") {
    forced.updateIntervalHours = clampInt(interval.trim(), 0, 8760, 0);
    locks.updateIntervalHours = env.MANAVAULT_CARD_UPDATE_INTERVAL_HOURS !== undefined ? "MANAVAULT_CARD_UPDATE_INTERVAL_HOURS" : "CARD_UPDATE_INTERVAL_HOURS";
  }
  if (env.MANAVAULT_PICTURES_DIR?.trim()) {
    forced.picturesDir = env.MANAVAULT_PICTURES_DIR.trim();
    locks.picturesDir = "MANAVAULT_PICTURES_DIR";
  }
  if (env.MANAVAULT_BACKUP_DIR?.trim()) {
    forced.backupDir = env.MANAVAULT_BACKUP_DIR.trim();
    locks.backupDir = "MANAVAULT_BACKUP_DIR";
  }
  if (env.MANAVAULT_SECURE_COOKIE?.trim()) locks.secureCookie = "MANAVAULT_SECURE_COOKIE";
  return { forced, locks };
}
