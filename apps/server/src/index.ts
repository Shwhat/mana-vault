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
import { catalogUpdateIntervalFromEnvironment, startCatalogUpdater } from "./catalog-updater.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const intervalHours = catalogUpdateIntervalFromEnvironment();
const signup = (process.env.MANAVAULT_SIGNUP ?? "on").trim().toLowerCase() !== "off";
const secureSetting = (process.env.MANAVAULT_SECURE_COOKIE ?? "auto").trim().toLowerCase();
if (!["auto", "always", "never"].includes(secureSetting)) {
  throw new Error("MANAVAULT_SECURE_COOKIE must be auto, always or never");
}
const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

const updater = startCatalogUpdater({
  intervalHours,
  databasePath: process.env.DATABASE_PATH ?? "data/mana-vault.sqlite",
  dataPath: process.env.SCRYFALL_DATA_PATH ?? "data/default-cards.json",
});
const app = await buildApp(undefined, undefined, updater.getStatus, updater.requestRefresh, {
  signup,
  secureCookie: secureSetting as "auto" | "always" | "never",
  version,
});
app.addHook("onClose", async () => updater.close());

try {
  await app.listen({ port, host });
  app.log.info(`Mana Vault ${version}, new accounts ${signup ? "on" : "off"}`);
  if (intervalHours > 0) {
    app.log.info(`Scheduled Scryfall refresh every ${intervalHours} hour(s)`);
  }
} catch (err) {
  app.log.error(err);
  updater.close();
  process.exit(1);
}
