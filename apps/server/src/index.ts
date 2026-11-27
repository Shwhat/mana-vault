import { readFileSync } from "node:fs";

// "-healthcheck" asks the running server whether it is healthy and exits with 0 (healthy) or 1, for Docker.
if (process.argv.includes("-healthcheck")) {
  const port = Number(process.env.PORT ?? 3000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(4000) });
    process.exit(response.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
}

import { buildApp } from "./app.js";
import { applyPendingRestore } from "./admin.js";
import { catalogUpdateIntervalFromEnvironment, startCatalogUpdater } from "./catalog-updater.js";
import { captureLogs } from "./logs.js";
import { settingsFromEnvironment } from "./settings.js";

captureLogs();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const databasePath = process.env.DATABASE_PATH ?? "data/mana-vault.sqlite";
const secureSetting = (process.env.MANAVAULT_SECURE_COOKIE ?? "auto").trim().toLowerCase();
if (!["auto", "always", "never"].includes(secureSetting)) {
  throw new Error("MANAVAULT_SECURE_COOKIE must be auto, always or never");
}
const playmatUrl = process.env.MANAVAULT_PLAYMAT_URL?.trim();
const playmatTimeout = Number(process.env.MANAVAULT_PLAYMAT_TIMEOUT_MS ?? 15_000);
if (playmatUrl && (!Number.isSafeInteger(playmatTimeout) || playmatTimeout < 100 || playmatTimeout > 60_000)) {
  throw new Error("MANAVAULT_PLAYMAT_TIMEOUT_MS must be between 100 and 60000");
}
const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
// a restore saved in Administration is put in place before the database is opened
if (applyPendingRestore(databasePath)) console.log("Restored the server backup chosen in Administration");

// environment variables lock their settings; the rest are kept in the database and changed in Administration
const settingsEnv = settingsFromEnvironment();
const updater = startCatalogUpdater({
  intervalHours: settingsEnv.forced.updateIntervalHours ?? catalogUpdateIntervalFromEnvironment("0"),
  databasePath,
  dataPath: process.env.SCRYFALL_DATA_PATH ?? "data/default-cards.json",
});
const app = await buildApp(undefined, undefined, updater.getStatus, updater.requestRefresh, {
  settingsEnv,
  secureCookie: secureSetting as "auto" | "always" | "never",
  version,
  databasePath,
  ...(playmatUrl ? { playmat: { url: playmatUrl, timeoutMs: playmatTimeout } } : {}),
  exitAfterRestore: true,
  setUpdateInterval: updater.setIntervalHours,
});
updater.onUpdated(() => app.pictures.queue());
app.addHook("onClose", async () => updater.close());

try {
  await app.listen({ port, host });
  const settings = app.serverSettings.get();
  app.log.info(`Mana Vault ${version}, sign-up ${settings.signup}`);
  if (settings.updateIntervalHours > 0) {
    app.log.info(`Scheduled Scryfall refresh every ${settings.updateIntervalHours} hour(s)`);
  }
} catch (err) {
  app.log.error(err);
  updater.close();
  process.exit(1);
}
