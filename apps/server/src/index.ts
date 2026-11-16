import { buildApp } from "./app.js";
import { catalogUpdateIntervalFromEnvironment, startCatalogUpdater } from "./catalog-updater.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const intervalHours = catalogUpdateIntervalFromEnvironment();

const updater = startCatalogUpdater({
  intervalHours,
  databasePath: process.env.DATABASE_PATH ?? "data/mana-vault.sqlite",
  dataPath: process.env.SCRYFALL_DATA_PATH ?? "data/default-cards.json",
});
const app = await buildApp(undefined, undefined, updater.getStatus, updater.requestRefresh);
app.addHook("onClose", async () => updater.close());

try {
  await app.listen({ port, host });
  if (intervalHours > 0) {
    app.log.info(`Scheduled Scryfall refresh every ${intervalHours} hour(s)`);
  }
} catch (err) {
  app.log.error(err);
  updater.close();
  process.exit(1);
}
