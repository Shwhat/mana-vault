// ---------- card pictures kept on the server: the picture folder, background downloads, estimates and moving ----------
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { driveSpace, isAdmin, logActivity } from "./admin.js";
import { PICTURE_SIZES, type PictureSize, type Settings } from "./settings.js";

const SCRYFALL = "https://cards.scryfall.io/";
// a picture address under /pictures mirrors Scryfall's: size, face, two folders, the printing id
const PICTURE_PATH = /^(small|normal|large|png|art_crop|border_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.(jpg|png)$/;
const MARKER = ".mana-vault-pictures";
const BATCH = 6;

export type PictureStatus = {
  running: boolean;
  paused: boolean;
  size: PictureSize | null;
  done: number;
  total: number;
  failed: number;
  downloadedBytes: number;
  stoppedForSpace: boolean;
  lastError: string | null;
};

export type PictureController = {
  /** Re-reads the settings and starts or stops downloading. */
  apply(): void;
  /** Checks for new or changed pictures (after a card database update). */
  queue(): void;
  stop(): void;
  summary(): unknown;
};

type Fetch = (url: string, init?: { method?: string; signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean; status: number; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** The Scryfall address of a printing's picture in a size, from its stored picture address. */
export function sizeUrl(url: string, size: PictureSize): string | null {
  if (!url.startsWith(SCRYFALL)) return null;
  const [path, query] = url.slice(SCRYFALL.length).split("?");
  const parts = path!.split("/");
  if (parts.length < 5) return null;
  parts[0] = size;
  parts[parts.length - 1] = parts[parts.length - 1]!.replace(/\.(jpg|png)$/, size === "png" ? ".png" : ".jpg");
  return `${SCRYFALL}${parts.join("/")}${query ? `?${query}` : ""}`;
}

let readLocal: (url: string) => Buffer | null = () => null;
/** A picture from the picture folder for a Scryfall address, when it was downloaded (used by proxy printing). */
export const localPicture = (url: string) => readLocal(url);

export function registerPictureRoutes(app: FastifyInstance, options: {
  database: DatabaseSync; settings: Settings; databasePath: string; fetcher?: unknown; downloads: boolean;
}): PictureController {
  const { database, settings } = options;
  const fetcher = (options.fetcher ?? fetch) as Fetch;
  database.exec(`
    CREATE TABLE IF NOT EXISTS pictures (
      path TEXT PRIMARY KEY,
      stamp TEXT NOT NULL DEFAULT '',
      bytes INTEGER NOT NULL DEFAULT 0
    );
  `);
  const defaultFolder = () => join(dirname(resolve(options.databasePath)), "pictures");
  const folder = () => (settings.get().picturesDir ? resolve(settings.get().picturesDir) : defaultFolder());
  const chosen = () => !!settings.get().picturesDir;

  /**
   * Whether the picture folder can be used. A folder that was chosen but is missing (a drive not plugged in) is never
   * created, and a folder without the Mana Vault marker is only taken when no pictures were downloaded before, so an
   * empty mount point is never filled by mistake.
   */
  const available = (): boolean => {
    const root = folder();
    try {
      if (!existsSync(root)) {
        if (chosen()) return false;
        mkdirSync(root, { recursive: true });
      }
      if (existsSync(join(root, MARKER))) return true;
      if (database.prepare("SELECT 1 FROM pictures LIMIT 1").get()) return false;
      writeFileSync(join(root, MARKER), "Mana Vault card pictures\n");
      return true;
    } catch {
      return false;
    }
  };

  readLocal = (url: string) => {
    if (!url.startsWith(SCRYFALL)) return null;
    const path = url.slice(SCRYFALL.length).split("?")[0]!;
    if (!PICTURE_PATH.test(path) || !available()) return null;
    try {
      return readFileSync(join(folder(), path));
    } catch {
      return null;
    }
  };

  // every answer of the program points card pictures at the server, which sends the downloaded copy or Scryfall's
  app.addHook("onSend", async (_request, reply, payload) => {
    if (typeof payload !== "string" || !String(reply.getHeader("content-type") ?? "").includes("json") || !payload.includes(SCRYFALL)) return payload;
    return payload.split(SCRYFALL).join("/pictures/");
  });

  const servePicture = async (request: FastifyRequest<{ Params: { "*": string } }>, reply: FastifyReply) => {
    const path = request.params["*"];
    if (!PICTURE_PATH.test(path)) return reply.code(404).send({ error: "Not found" });
    if (available()) {
      const file = join(folder(), path);
      if (existsSync(file)) {
        return reply.header("cache-control", "public, max-age=604800").type(path.endsWith(".png") ? "image/png" : "image/jpeg").send(createReadStream(file));
      }
    }
    const query = request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
    return reply.redirect(`${SCRYFALL}${path}${query}`, 302);
  };
  app.get<{ Params: { "*": string } }>("/pictures/*", servePicture);

  // ---------- background downloads ----------
  const status: PictureStatus = { running: false, paused: false, size: null, done: 0, total: 0, failed: 0, downloadedBytes: 0, stoppedForSpace: false, lastError: null };
  let wanted = false;
  let stopped = false;

  const enoughSpace = () => {
    const space = driveSpace(folder());
    return !space || space.free > settings.get().minFreeGb * 1024 ** 3;
  };

  const download = async (url: string, target: string) => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "ManaVault (picture download)" } });
    if (!response.ok) throw new Error(`Scryfall answered ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    mkdirSync(dirname(target), { recursive: true });
    const partial = `${target}.part`;
    await writeFile(partial, bytes);
    await rename(partial, target);
    return bytes.length;
  };

  const run = async () => {
    if (status.running || stopped || !options.downloads) return;
    const sizes = settings.get().pictureSizes;
    if (!sizes.length || status.paused) return;
    if (!available()) {
      status.lastError = "Picture folder not available";
      return;
    }
    status.running = true;
    status.stoppedForSpace = false;
    status.lastError = null;
    wanted = false;
    try {
      const cards = database.prepare("SELECT image_url, back_image_url FROM cards WHERE custom = 0 AND image_url IS NOT NULL").all();
      const save = database.prepare("INSERT INTO pictures (path, stamp, bytes) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET stamp = excluded.stamp, bytes = excluded.bytes");
      for (const size of sizes) {
        if (stopped || status.paused || !settings.get().pictureSizes.includes(size)) break;
        const known = new Map(database.prepare("SELECT path, stamp FROM pictures WHERE path LIKE ?").all(`${size}/%`).map((row) => [String(row.path), String(row.stamp)]));
        const jobs: Array<{ url: string; path: string; stamp: string }> = [];
        for (const card of cards) {
          for (const source of [card.image_url, card.back_image_url]) {
            const url = typeof source === "string" ? sizeUrl(source, size) : null;
            if (!url) continue;
            const [path, stamp = ""] = url.slice(SCRYFALL.length).split("?");
            if (!PICTURE_PATH.test(path!)) continue;
            // only new pictures, or ones Scryfall changed since (their address carries a new stamp)
            if (known.get(path!) === stamp) continue;
            jobs.push({ url, path: path!, stamp });
          }
        }
        status.size = size;
        status.done = 0;
        status.total = jobs.length;
        status.failed = 0;
        for (let index = 0; index < jobs.length; index += BATCH) {
          if (stopped || status.paused || !settings.get().pictureSizes.includes(size)) break;
          if (index % (BATCH * 20) === 0 && !enoughSpace()) {
            status.stoppedForSpace = true;
            status.lastError = `Stopped: less than ${settings.get().minFreeGb} GB free on the picture drive`;
            return;
          }
          await Promise.all(jobs.slice(index, index + BATCH).map(async (job) => {
            try {
              const bytes = await download(job.url, join(folder(), job.path));
              save.run(job.path, job.stamp, bytes);
              status.downloadedBytes += bytes;
            } catch (error) {
              status.failed += 1;
              status.lastError = error instanceof Error ? error.message : String(error);
            } finally {
              status.done += 1;
            }
          }));
        }
      }
      if (!status.paused && !stopped) status.size = null;
    } finally {
      status.running = false;
      if (wanted && !stopped) setTimeout(() => void run(), 1000).unref();
    }
  };

  const queue = () => {
    wanted = true;
    if (!status.running) setTimeout(() => void run(), 500).unref();
  };

  const summary = () => {
    const sizes = Object.fromEntries(PICTURE_SIZES.map((size) => [size, { files: 0, bytes: 0 }]));
    for (const row of database.prepare("SELECT substr(path, 1, instr(path, '/') - 1) AS size, COUNT(*) AS files, COALESCE(SUM(bytes), 0) AS bytes FROM pictures GROUP BY size").all()) {
      if (sizes[String(row.size)]) sizes[String(row.size)] = { files: Number(row.files), bytes: Number(row.bytes) };
    }
    const printings = Number(database.prepare("SELECT COUNT(*) AS n FROM cards WHERE custom = 0 AND image_url IS NOT NULL").get()?.n ?? 0)
      + Number(database.prepare("SELECT COUNT(*) AS n FROM cards WHERE custom = 0 AND back_image_url IS NOT NULL").get()?.n ?? 0);
    return {
      folder: folder(), defaultFolder: defaultFolder(), available: available(), locked: settings.locks.picturesDir ?? null,
      drive: driveSpace(folder()), sizes, printings, estimates: settings.get().pictureEstimates, status: { ...status }, moving,
    };
  };

  // ---------- Administration > Pictures ----------
  const admin = (request: FastifyRequest, reply: FastifyReply) => {
    if (isAdmin(database, request.user?.id)) return true;
    void reply.code(403).send({ error: "Only an admin can do this." });
    return false;
  };

  app.get("/api/admin/pictures", async (request, reply) => (admin(request, reply) ? summary() : reply));

  app.post("/api/admin/pictures/pause", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    status.paused = true;
    return summary();
  });

  app.post("/api/admin/pictures/resume", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    status.paused = false;
    queue();
    return summary();
  });

  // measures the average picture size of each size from a sample, for the download estimates
  app.post("/api/admin/pictures/estimate", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const sample = database.prepare("SELECT image_url FROM cards WHERE custom = 0 AND image_url LIKE ? ORDER BY random() LIMIT 40").all(`${SCRYFALL}%`);
    if (!sample.length) return reply.code(400).send({ error: "Download the card database first." });
    const estimates = { ...settings.get().pictureEstimates };
    let measured = 0;
    for (const size of PICTURE_SIZES) {
      const lengths: number[] = [];
      await Promise.all(sample.map(async (row) => {
        const url = sizeUrl(String(row.image_url), size);
        if (!url) return;
        try {
          const response = await fetcher(url, { method: "HEAD", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "ManaVault (picture estimate)" } });
          const length = Number(response.headers.get("content-length"));
          if (response.ok && length > 0) lengths.push(length);
        } catch {
          // a picture that cannot be measured is left out of the average
        }
      }));
      if (lengths.length) {
        estimates[size] = { bytes: Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length), at: new Date().toISOString() };
        measured += 1;
      }
    }
    if (!measured) return reply.code(502).send({ error: "Scryfall could not be reached to measure the pictures." });
    settings.set({ pictureEstimates: estimates });
    return summary();
  });

  // deletes the downloaded pictures of one size
  app.delete<{ Params: { size: string } }>("/api/admin/pictures/:size", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    const size = request.params.size as PictureSize;
    if (!PICTURE_SIZES.includes(size)) return reply.code(404).send({ error: "Unknown picture size" });
    if (available()) await rm(join(folder(), size), { recursive: true, force: true });
    database.prepare("DELETE FROM pictures WHERE path LIKE ?").run(`${size}/%`);
    logActivity(database, request.user?.name ?? "", "Pictures deleted", size, request.ip);
    return summary();
  });

  // copies every picture to a new folder, checks the copy, then uses the new folder; the old folder is left in place
  let moving: { to: string; copied: boolean; error: string | null } | null = null;
  app.post<{ Body: { path?: unknown } }>("/api/admin/pictures/move", async (request, reply) => {
    if (!admin(request, reply)) return reply;
    if (settings.locks.picturesDir) return reply.code(400).send({ error: `The picture folder is set by ${settings.locks.picturesDir} and cannot be changed here.` });
    const target = typeof request.body?.path === "string" ? resolve(request.body.path.trim()) : "";
    if (!request.body?.path || !target) return reply.code(400).send({ error: "Choose a folder." });
    if (target === folder()) return reply.code(400).send({ error: "The pictures are already in that folder." });
    if (moving && !moving.copied && !moving.error) return reply.code(409).send({ error: "Pictures are already being moved." });
    const from = folder();
    status.paused = true;
    moving = { to: target, copied: false, error: null };
    const job = moving;
    void (async () => {
      try {
        mkdirSync(target, { recursive: true });
        if (existsSync(from)) await cp(from, target, { recursive: true, force: false, errorOnExist: false });
        const count = async (root: string): Promise<number> => {
          if (!existsSync(root)) return 0;
          let files = 0;
          for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) if (entry.isFile()) files += 1;
          return files;
        };
        if ((await count(target)) < (await count(from))) throw new Error("The copy has fewer files than the old folder");
        if (!existsSync(join(target, MARKER))) writeFileSync(join(target, MARKER), "Mana Vault card pictures\n");
        settings.set({ picturesDir: target });
        job.copied = true;
        logActivity(database, request.user?.name ?? "", "Pictures moved", `${from} to ${target}`, request.ip);
      } catch (error) {
        job.error = error instanceof Error ? error.message : String(error);
      } finally {
        status.paused = false;
        queue();
      }
    })();
    return summary();
  });

  const apply = () => {
    if (settings.get().pictureSizes.length) queue();
  };

  return {
    apply, queue, summary,
    stop: () => {
      stopped = true;
    },
  };
}

/** Bytes in a file, or 0. */
export const sizeOf = (path: string) => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};
