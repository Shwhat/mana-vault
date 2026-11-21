// ---------- the Android app's update check (0.17.0): the app asks its own server, which offers the APK that matches
// the server's version. The APK is fetched once from the GitHub release of that version and kept in the data folder. ----------
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Fetcher } from "./proxies.js";

export const RELEASE_URL = (version: string) => `https://github.com/Shwhat/mana-vault/releases/download/v${version}/mana-vault-${version}.apk`;

export function registerAppUpdateRoutes(app: FastifyInstance, options: { version: string; databasePath: string; fetcher?: Fetcher }) {
  const folder = join(dirname(resolve(options.databasePath)), "apk");
  const file = join(folder, `mana-vault-${options.version}.apk`);
  let fetching: Promise<boolean> | null = null;

  /** Downloads the APK of the server's version once. Resolves false when GitHub does not have it (yet). */
  const fetchApk = () => {
    fetching ??= (async () => {
      try {
        const response = await (options.fetcher ?? (fetch as unknown as Fetcher))(RELEASE_URL(options.version));
        if (!response.ok) return false;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 1024 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
        mkdirSync(folder, { recursive: true });
        writeFileSync(`${file}.part`, bytes);
        renameSync(`${file}.part`, file);
        return true;
      } catch {
        return false;
      } finally {
        fetching = null;
      }
    })();
    return fetching;
  };

  // the version the server runs, and whether its APK is ready on the server
  app.get("/api/app/latest", async () => ({ version: options.version, apk: existsSync(file) ? { bytes: statSync(file).size } : null, url: "/api/app/apk" }));

  app.get("/api/app/apk", async (_request, reply) => {
    if (!options.version) return reply.code(404).send({ error: "This server has no version number" });
    if (!existsSync(file) && !(await fetchApk())) {
      return reply.code(502).send({ error: `The app for version ${options.version} could not be fetched from GitHub. Try again later.` });
    }
    reply.header("Content-Type", "application/vnd.android.package-archive");
    reply.header("Content-Disposition", `attachment; filename="mana-vault-${options.version}.apk"`);
    return reply.send(createReadStream(file));
  });
}
