// ---------- Administration: accounts, sign-up, devices, security, backups, server, activity ----------
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, statfsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type AuthStore, validName, validPassword } from "./auth.js";
import { createCollection } from "./library.js";
import { logLines } from "./logs.js";
import { readSettingsInput, type Settings } from "./settings.js";

export type AdminContext = {
  database: DatabaseSync;
  auth: AuthStore;
  settings: Settings;
  version: string;
  startedAt: number;
  databasePath: string;
  fetcher: (url: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  /** Runs after settings change so the server applies them (limits, schedules, pictures). */
  applySettings: () => void;
  /** After a restore is saved the server stops so Docker starts it on the restored data; tests turn this off. */
  exitAfterRestore: boolean;
  /** Picture totals for the overview. */
  pictureSummary: () => unknown;
  /** Ends the user's server-managed engine session when auth is revoked. */
  disconnectPlaySession?: (userId: number) => Promise<void>;
  /** Ends the engine session only when the user has no remaining valid sign-in. */
  disconnectPlaySessionIfUnauthorized?: (userId: number) => Promise<void>;
};

export function initializeAdminTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_by TEXT,
      used_at TEXT
    );
  `);
}

/** Records something in Administration > Activity; keeps the newest 5,000 entries. */
export function logActivity(database: DatabaseSync, userName: string, kind: string, detail = "", address = ""): void {
  database.prepare("INSERT INTO activity (user_name, kind, detail, address) VALUES (?, ?, ?, ?)").run(userName, kind, detail, address);
  database.exec("DELETE FROM activity WHERE id <= (SELECT id FROM activity ORDER BY id DESC LIMIT 1 OFFSET 5000)");
}

export const isAdmin = (database: DatabaseSync, userId: number | undefined) =>
  !!userId && Number(database.prepare("SELECT is_admin FROM users WHERE id = ?").get(userId)?.is_admin ?? 0) === 1;

/** Uses an invite code; returns false when it is unknown or used. */
export function useInvite(database: DatabaseSync, code: string, name: string): boolean {
  return database.prepare("UPDATE invites SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE code = ? AND used_by IS NULL").run(name, code.trim().toUpperCase()).changes > 0;
}

const readableCode = () => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  const code = [...bytes].map((byte) => letters[byte % letters.length]).join("");
  return `${code.slice(0, 5)}-${code.slice(5)}`;
};

const temporaryPassword = () => randomBytes(9).toString("base64url");

/** Free and total space of the drive a path is on, in bytes; null when it cannot be read. */
export function driveSpace(path: string): { free: number; total: number } | null {
  try {
    let probe = resolve(path);
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
    const stats = statfsSync(probe);
    return { free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize };
  } catch {
    return null;
  }
}

const fileSize = (path: string) => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

const BACKUP_NAME = /^mana-vault-\d{8}-\d{6}\.sqlite$/;

export function backupFolder(context: AdminContext): string {
  return context.settings.get().backupDir || join(dirname(resolve(context.databasePath)), "backups");
}

/** Writes a whole-server backup (every account and the card database) and removes the oldest beyond the number kept. */
export function makeServerBackup(context: AdminContext): string {
  const folder = backupFolder(context);
  mkdirSync(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const name = `mana-vault-${stamp}.sqlite`;
  const path = join(folder, name);
  if (existsSync(path)) rmSync(path);
  context.database.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
  const keep = context.settings.get().backupKeep;
  const files = listBackups(context);
  for (const old of files.slice(keep)) rmSync(join(folder, old.name), { force: true });
  return name;
}

export function listBackups(context: AdminContext): Array<{ name: string; size: number; at: string }> {
  const folder = backupFolder(context);
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((name) => BACKUP_NAME.test(name))
    .map((name) => {
      const stats = statSync(join(folder, name));
      return { name, size: stats.size, at: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Starts the backup schedule; returns a function that stops it. */
export function startBackupSchedule(context: AdminContext): () => void {
  const timer = setInterval(() => {
    const hours = context.settings.get().backupIntervalHours;
    if (!hours) return;
    const newest = listBackups(context)[0];
    if (newest && Date.now() - Date.parse(newest.at) < hours * 3_600_000) return;
    try {
      const name = makeServerBackup(context);
      logActivity(context.database, "", "Backup", `Scheduled backup ${name}`);
    } catch (error) {
      console.error("Scheduled backup failed:", error);
    }
  }, 10 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

/** Puts a restored database in place of the current one, before the server opens it. Called at startup. */
export function applyPendingRestore(databasePath: string): boolean {
  const pending = `${databasePath}.restore`;
  if (!existsSync(pending)) return false;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  if (existsSync(databasePath)) {
    // the database before the restore is kept beside it
    const kept = `${databasePath}.before-restore-${stamp}`;
    const source = new DatabaseSync(databasePath);
    try {
      source.exec(`VACUUM INTO '${kept.replace(/'/g, "''")}'`);
    } finally {
      source.close();
    }
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
  }
  const restored = new DatabaseSync(pending);
  try {
    restored.exec(`VACUUM INTO '${databasePath.replace(/'/g, "''")}'`);
  } finally {
    restored.close();
  }
  rmSync(pending, { force: true });
  return true;
}

function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.replace(/^v/, "").split(/[.-]/).map((part) => Number(part) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index += 1) if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) - (y[index] ?? 0);
  return 0;
}

export function registerAdminRoutes(app: FastifyInstance, context: AdminContext): void {
  const { database, auth, settings } = context;
  initializeAdminTables(database);

  const admin = (request: FastifyRequest, reply: FastifyReply) => {
    if (isAdmin(database, request.user?.id)) return true;
    void reply.code(403).send({ error: "Only an admin can do this." });
    return false;
  };
  const log = (request: FastifyRequest, kind: string, detail: string) => logActivity(database, request.user?.name ?? "", kind, detail, request.ip);
  const disconnectPlaySession = async (request: FastifyRequest, reply: FastifyReply, userId: number) => {
    if (!context.disconnectPlaySession) return true;
    try {
      await context.disconnectPlaySession(userId);
      return true;
    } catch (error) {
      request.log.error({ error, userId }, "Could not close Playmat session after account access changed");
      void reply.code(503).send({ error: "Account access was revoked, but the play engine could not confirm session cleanup." });
      return false;
    }
  };
  const disconnectPlaySessionIfUnauthorized = async (request: FastifyRequest, reply: FastifyReply, userId: number) => {
    if (!context.disconnectPlaySessionIfUnauthorized) return true;
    try {
      await context.disconnectPlaySessionIfUnauthorized(userId);
      return true;
    } catch (error) {
      request.log.error({ error, userId }, "Could not close Playmat session after device access changed");
      void reply.code(503).send({ error: "Device access was revoked, but the play engine could not confirm session cleanup." });
      return false;
    }
  };
  const adminCount = () => Number(database.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND disabled = 0").get()?.n ?? 0);

  app.get("/api/admin/overview", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const dataFolder = dirname(resolve(context.databasePath));
    return {
      settings: settings.get(), locks: settings.locks, version: context.version, startedAt: new Date(context.startedAt).toISOString(),
      uptimeSeconds: Math.round((Date.now() - context.startedAt) / 1000),
      storage: {
        dataFolder, databaseBytes: fileSize(resolve(context.databasePath)) + fileSize(`${resolve(context.databasePath)}-wal`),
        drive: driveSpace(dataFolder), backupFolder: backupFolder(context), backups: listBackups(context),
      },
      pictures: context.pictureSummary(),
    };
  });

  app.put<{ Body: unknown }>("/api/admin/settings", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const changes = readSettingsInput(request.body);
    if (typeof changes === "string") return reply.code(400).send({ error: changes });
    const refused = settings.set(changes);
    if (refused) return reply.code(400).send({ error: refused });
    context.applySettings();
    log(request, "Settings", `Changed ${Object.keys(changes).join(", ")}`);
    return { settings: settings.get() };
  });

  // ---------- accounts ----------
  app.get("/api/admin/accounts", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    return database.prepare(
      `SELECT u.id, u.name, u.created_at, u.last_sign_in_at, u.is_admin, u.disabled, u.must_change,
              (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS devices,
              (SELECT COUNT(*) FROM collections c WHERE c.owner_id = u.id) AS collections,
              (SELECT COUNT(*) FROM decks k WHERE k.owner_id = u.id) AS decks,
              (SELECT COALESCE(SUM(cc.quantity), 0) FROM collection_cards cc JOIN collections c ON c.id = cc.collection_id WHERE c.owner_id = u.id) AS cards
       FROM users u ORDER BY u.name COLLATE NOCASE`,
    ).all().map((row) => ({
      id: Number(row.id), name: String(row.name), createdAt: String(row.created_at), lastSignInAt: row.last_sign_in_at ? String(row.last_sign_in_at) : null,
      admin: Number(row.is_admin) === 1, disabled: Number(row.disabled) === 1, mustChange: Number(row.must_change) === 1,
      devices: Number(row.devices), collections: Number(row.collections), decks: Number(row.decks), cards: Number(row.cards),
      you: Number(row.id) === request.user!.id,
    }));
  });

  app.post<{ Body: { name?: unknown; password?: unknown; admin?: unknown } }>("/api/admin/accounts", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!validName(name)) return reply.code(400).send({ error: "User names are 3 to 32 letters, digits, dots, dashes or underscores, starting with a letter or digit." });
    const given = typeof request.body?.password === "string" ? request.body.password : "";
    const minimum = settings.get().minPasswordLength;
    if (given && !validPassword(given, minimum)) return reply.code(400).send({ error: `Passwords need at least ${minimum} characters.` });
    const password = given || temporaryPassword();
    const user = auth.addUser(name, password);
    if (!user) return reply.code(409).send({ error: "That user name is taken." });
    // the person chooses their own password the first time they sign in
    auth.setPassword(user.id, password, true);
    if (request.body?.admin === true) database.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(user.id);
    createCollection(database, user.id, { name: "Main collection", description: "", completion: "main", finish: "any", kind: "collection", sets: [] });
    log(request, "Account created", name);
    return { id: user.id, name, password };
  });

  const target = (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    const row = database.prepare("SELECT id, name, is_admin, disabled FROM users WHERE id = ?").get(Number(request.params.userId));
    if (!row) {
      void reply.code(404).send({ error: "That account does not exist." });
      return null;
    }
    return { id: Number(row.id), name: String(row.name), admin: Number(row.is_admin) === 1, disabled: Number(row.disabled) === 1 };
  };

  app.post<{ Params: { userId: string } }>("/api/admin/accounts/:userId/password", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const user = target(request, reply);
    if (!user) return reply;
    const password = temporaryPassword();
    auth.setPassword(user.id, password, true);
    database.prepare("DELETE FROM devices WHERE user_id = ?").run(user.id);
    if (!await disconnectPlaySession(request, reply, user.id)) return reply;
    log(request, "Password reset", user.name);
    return { password };
  });

  app.put<{ Params: { userId: string }; Body: { admin?: unknown; disabled?: unknown } }>("/api/admin/accounts/:userId", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const user = target(request, reply);
    if (!user) return reply;
    const makeAdmin = request.body?.admin;
    const disable = request.body?.disabled;
    const losesAdmin = (makeAdmin === false && user.admin) || (disable === true && user.admin && !user.disabled);
    if (losesAdmin && adminCount() <= 1) return reply.code(400).send({ error: "The server needs at least one admin. Make another account an admin first." });
    if (typeof makeAdmin === "boolean") {
      database.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(makeAdmin ? 1 : 0, user.id);
      log(request, makeAdmin ? "Made admin" : "Admin removed", user.name);
    }
    if (typeof disable === "boolean") {
      database.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disable ? 1 : 0, user.id);
      if (disable) {
        database.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
        database.prepare("DELETE FROM devices WHERE user_id = ?").run(user.id);
        if (!await disconnectPlaySession(request, reply, user.id)) return reply;
      }
      log(request, disable ? "Account disabled" : "Account enabled", user.name);
    }
    return { status: "saved" };
  });

  app.post<{ Params: { userId: string } }>("/api/admin/accounts/:userId/signout", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const user = target(request, reply);
    if (!user) return reply;
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    database.prepare("DELETE FROM devices WHERE user_id = ?").run(user.id);
    if (!await disconnectPlaySession(request, reply, user.id)) return reply;
    log(request, "Signed out everywhere", user.name);
    return { status: "signed out" };
  });

  // deletes an account; with transferTo its collections, decks and custom sets go to that account first
  app.delete<{ Params: { userId: string }; Querystring: { transferTo?: string } }>("/api/admin/accounts/:userId", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const user = target(request, reply);
    if (!user) return reply;
    if (user.id === request.user!.id) return reply.code(400).send({ error: "You cannot delete your own account here." });
    if (user.admin && adminCount() <= 1) return reply.code(400).send({ error: "The server needs at least one admin. Make another account an admin first." });
    const to = request.query.transferTo ? Number(request.query.transferTo) : null;
    if (to !== null && (to === user.id || !database.prepare("SELECT 1 FROM users WHERE id = ?").get(to))) {
      return reply.code(400).send({ error: "Choose another account to receive the collections and decks." });
    }
    if (!await disconnectPlaySession(request, reply, user.id)) return reply;
    database.exec("BEGIN");
    try {
      if (to !== null) {
        database.prepare("UPDATE collections SET owner_id = ? WHERE owner_id = ?").run(to, user.id);
        database.prepare("UPDATE decks SET owner_id = ? WHERE owner_id = ?").run(to, user.id);
        database.prepare("UPDATE custom_sets SET owner_id = ? WHERE owner_id = ?").run(to, user.id);
        database.prepare("DELETE FROM members WHERE user_id = ? AND item_id IN (SELECT id FROM collections WHERE owner_id = ? UNION SELECT id FROM decks WHERE owner_id = ?)").run(to, to, to);
      }
      database.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not delete the account" });
    }
    const receiver = to !== null ? String(database.prepare("SELECT name FROM users WHERE id = ?").get(to)?.name ?? "") : "";
    log(request, "Account deleted", receiver ? `${user.name}, collections and decks moved to ${receiver}` : user.name);
    return { status: "deleted" };
  });

  // ---------- invites ----------
  app.get("/api/admin/invites", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    return database.prepare("SELECT code, note, created_by, created_at, used_by, used_at FROM invites ORDER BY created_at DESC").all()
      .map((row) => ({
        code: String(row.code), note: String(row.note), createdBy: String(row.created_by), createdAt: String(row.created_at),
        usedBy: row.used_by ? String(row.used_by) : null, usedAt: row.used_at ? String(row.used_at) : null,
      }));
  });

  app.post<{ Body: { note?: unknown } }>("/api/admin/invites", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const note = typeof request.body?.note === "string" ? request.body.note.trim().slice(0, 80) : "";
    const code = readableCode();
    database.prepare("INSERT INTO invites (code, note, created_by) VALUES (?, ?, ?)").run(code, note, request.user!.name);
    log(request, "Invite created", note ? `${code} (${note})` : code);
    return { code };
  });

  app.delete<{ Params: { code: string } }>("/api/admin/invites/:code", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const result = database.prepare("DELETE FROM invites WHERE code = ?").run(request.params.code);
    if (!result.changes) return reply.code(404).send({ error: "That invite code does not exist." });
    log(request, "Invite removed", request.params.code);
    return { status: "removed" };
  });

  // ---------- devices ----------
  app.get("/api/admin/devices", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    return database.prepare("SELECT d.id, d.name, d.created_at, d.last_seen, u.name AS user_name FROM devices d JOIN users u ON u.id = d.user_id ORDER BY d.last_seen DESC").all()
      .map((row) => ({ id: String(row.id), name: String(row.name), account: String(row.user_name), createdAt: String(row.created_at), lastSeen: String(row.last_seen) }));
  });

  app.delete<{ Params: { deviceId: string } }>("/api/admin/devices/:deviceId", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const row = database.prepare("SELECT d.name, d.user_id, u.name AS user_name FROM devices d JOIN users u ON u.id = d.user_id WHERE d.id = ?").get(request.params.deviceId);
    if (!row) return reply.code(404).send({ error: "That device is not signed in." });
    database.prepare("DELETE FROM devices WHERE id = ?").run(request.params.deviceId);
    if (!await disconnectPlaySessionIfUnauthorized(request, reply, Number(row.user_id))) return reply;
    log(request, "Device removed", `${String(row.name)} (${String(row.user_name)})`);
    return { status: "removed" };
  });

  // ---------- activity ----------
  app.get<{ Querystring: { limit?: string } }>("/api/admin/activity", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const limit = Math.min(1000, Math.max(1, Number(request.query.limit) || 300));
    return database.prepare("SELECT at, user_name, kind, detail, address FROM activity ORDER BY id DESC LIMIT ?").all(limit)
      .map((row) => ({ at: String(row.at), account: String(row.user_name), kind: String(row.kind), detail: String(row.detail), address: String(row.address) }));
  });

  // ---------- server ----------
  app.get("/api/admin/server", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const check = async (url: string) => {
      try {
        const response = await context.fetcher(url, { headers: { "User-Agent": `ManaVault/${context.version}`, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
        return response;
      } catch {
        return null;
      }
    };
    const scryfall = await check("https://api.scryfall.com/sets/lea");
    let update: { latest: string | null; newer: boolean; error?: string } = { latest: null, newer: false };
    const releases = await check("https://api.github.com/repos/Shwhat/mana-vault/releases?per_page=20");
    if (!releases || !releases.ok) update = { latest: null, newer: false, error: "Could not reach GitHub" };
    else {
      const list = await releases.json() as Array<{ tag_name?: string; draft?: boolean; prerelease?: boolean }>;
      const latest = list.find((release) => !release.draft && !release.prerelease && typeof release.tag_name === "string")?.tag_name ?? null;
      update = { latest, newer: latest ? compareVersions(latest, context.version) > 0 : false };
    }
    return { version: context.version, uptimeSeconds: Math.round((Date.now() - context.startedAt) / 1000), scryfall: !!scryfall?.ok, update, log: logLines() };
  });

  // a folder browser for choosing the picture and backup folders on the server
  app.get<{ Querystring: { path?: string } }>("/api/admin/folders", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const path = resolve(request.query.path || dirname(resolve(context.databasePath)));
    try {
      const folders = readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name).sort((a, b) => a.localeCompare(b)).slice(0, 500);
      return { path, parent: dirname(path) === path ? null : dirname(path), folders, space: driveSpace(path) };
    } catch {
      return reply.code(400).send({ error: "That folder cannot be opened." });
    }
  });

  // ---------- whole-server backups ----------
  app.post("/api/admin/backups", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    try {
      const name = makeServerBackup(context);
      log(request, "Backup", name);
      return { name, backups: listBackups(context) };
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? `Could not write the backup: ${error.message}` : "Could not write the backup" });
    }
  });

  app.get<{ Params: { name: string } }>("/api/admin/backups/:name", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    if (!BACKUP_NAME.test(request.params.name)) return reply.code(404).send({ error: "Backup not found" });
    const path = join(backupFolder(context), request.params.name);
    if (!existsSync(path)) return reply.code(404).send({ error: "Backup not found" });
    reply.header("content-type", "application/vnd.sqlite3");
    reply.header("content-disposition", `attachment; filename="${request.params.name}"`);
    return reply.send(createReadStream(path));
  });

  app.delete<{ Params: { name: string } }>("/api/admin/backups/:name", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    if (!BACKUP_NAME.test(request.params.name)) return reply.code(404).send({ error: "Backup not found" });
    rmSync(join(backupFolder(context), request.params.name), { force: true });
    log(request, "Backup deleted", request.params.name);
    return { backups: listBackups(context) };
  });

  // restores a whole-server backup: the file is checked, saved beside the database and put in place when the server starts again
  app.addContentTypeParser("application/vnd.sqlite3", (_request, payload, done) => done(null, payload));
  app.post<{ Querystring: { from?: string } }>("/api/admin/restore", { bodyLimit: 64 * 1024 * 1024 * 1024 }, async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const pending = `${resolve(context.databasePath)}.restore`;
    try {
      if (request.query.from) {
        if (!BACKUP_NAME.test(request.query.from)) return reply.code(404).send({ error: "Backup not found" });
        const source = new DatabaseSync(join(backupFolder(context), request.query.from));
        try {
          source.exec(`VACUUM INTO '${pending.replace(/'/g, "''")}'`);
        } finally {
          source.close();
        }
      } else {
        await pipeline(request.body as Readable, createWriteStream(pending));
      }
      const check = new DatabaseSync(pending, { readOnly: true });
      try {
        const ok = check.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
        if (!ok) throw new Error("not a Mana Vault backup");
      } finally {
        check.close();
      }
    } catch {
      rmSync(pending, { force: true });
      return reply.code(400).send({ error: "That file is not a Mana Vault server backup." });
    }
    log(request, "Restore", request.query.from ?? "uploaded file");
    if (context.exitAfterRestore) setTimeout(() => process.exit(0), 800).unref();
    return { status: "restoring" };
  });
}
