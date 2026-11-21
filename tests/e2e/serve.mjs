// Starts the built server on a fresh temporary database with a small sample card catalog, for browser tests.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { buildApp } from "../../apps/server/dist/app.js";
import { cardExtrasStatement, cardInsertStatement, cardPricesStatement, initializeDatabase } from "../../apps/server/dist/database.js";
import { saveSets } from "../../apps/server/dist/sets.js";

const port = Number(process.env.E2E_PORT ?? 4317);
const directory = mkdtempSync(join(tmpdir(), "mana-vault-e2e-"));
const database = new DatabaseSync(join(directory, "test.sqlite"));
initializeDatabase(database);

const legal = JSON.stringify({ commander: "legal", modern: "legal", legacy: "legal", vintage: "legal" });
const cards = [
  ["bolt-lea", "o-bolt", "Lightning Bolt", "{R}", 1, "Instant", "Lightning Bolt deals 3 damage to any target.", "R", "lea", "Limited Edition Alpha", "161", "common", "1993-08-05", "Christopher Rush"],
  ["bolt-m10", "o-bolt", "Lightning Bolt", "{R}", 1, "Instant", "Lightning Bolt deals 3 damage to any target.", "R", "m10", "Magic 2010", "146", "common", "2009-07-17", "Christopher Moeller"],
  ["shivan", "o-shivan", "Shivan Dragon", "{4}{R}{R}", 6, "Creature - Dragon", "Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.", "R", "lea", "Limited Edition Alpha", "174", "rare", "1993-08-05", "Melissa Benson"],
  ["counterspell", "o-counter", "Counterspell", "{U}{U}", 2, "Instant", "Counter target spell.", "U", "lea", "Limited Edition Alpha", "54", "uncommon", "1993-08-05", "Mark Poole"],
  ["sol-ring", "o-sol", "Sol Ring", "{1}", 1, "Artifact", "{T}: Add {C}{C}.", "", "lea", "Limited Edition Alpha", "269", "uncommon", "1993-08-05", "Mark Tedin"],
  ["llanowar", "o-llanowar", "Llanowar Elves", "{G}", 1, "Creature - Elf Druid", "{T}: Add {G}.", "G", "lea", "Limited Edition Alpha", "210", "common", "1993-08-05", "Anson Maddocks"],
  ["swords", "o-swords", "Swords to Plowshares", "{W}", 1, "Instant", "Exile target creature. Its controller gains life equal to its power.", "W", "lea", "Limited Edition Alpha", "40", "uncommon", "1993-08-05", "Jeff A. Menges"],
  ["dark-ritual", "o-ritual", "Dark Ritual", "{B}", 1, "Instant", "Add {B}{B}{B}.", "B", "lea", "Limited Edition Alpha", "98", "common", "1993-08-05", "Sandra Everingham"],
  ["serra", "o-serra", "Serra Angel", "{3}{W}{W}", 5, "Creature - Angel", "Flying, vigilance", "W", "lea", "Limited Edition Alpha", "39", "uncommon", "1993-08-05", "Douglas Shuler"],
  ["atraxa", "o-atraxa", "Atraxa, Praetors' Voice", "{G}{W}{U}{B}", 4, "Legendary Creature - Phyrexian Angel Horror", "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.", "WUBG", "c16", "Commander 2016", "28", "mythic", "2016-11-11", "Victor Adame Minguez"],
];
// USD regular, USD foil, USD etched, EUR regular, EUR foil; Sol Ring has no price; Shivan Dragon is also printed as "Shivan the Mighty"
const prices = {
  "bolt-lea": [400, null, null, 350, null], "bolt-m10": [2.5, 12, null, 2, 10], shivan: [900, null, null, 800, null], counterspell: [150, null, null, 130, null],
  llanowar: [60, null, null, 55, null], swords: [120, null, null, 110, null], "dark-ritual": [40, null, null, 35, null], serra: [80, null, null, 70, null],
  atraxa: [12, 25, 30, 11, 22],
};
const insert = cardInsertStatement(database);
const extras = cardExtrasStatement(database);
const priced = cardPricesStatement(database);
for (const [id, oracle, name, cost, mv, type, text, colors, set, setName, number, rarity, released, artist] of cards) {
  insert.run(id, oracle, name, cost, mv, type, text, colors, colors, legal, set, setName, number, rarity, null, released, artist);
  extras.run("nonfoil,foil", 0, 0, id);
  priced.run(...(prices[id] ?? [null, null, null, null, null]), id === "shivan" ? "Shivan the Mighty" : null, id);
}
// Limited Edition Alpha is treated as a 9-card set here so set completion has something to count
saveSets(database, { data: [
  { code: "lea", name: "Limited Edition Alpha", set_type: "core", released_at: "1993-08-05", printed_size: 300, card_count: 9 },
  { code: "m10", name: "Magic 2010", set_type: "core", released_at: "2009-07-17", printed_size: 249, card_count: 1 },
] });
database.prepare("INSERT OR REPLACE INTO catalog_metadata (key, value) VALUES ('updated_at', ?)").run(new Date().toISOString());
// 0.15.0: a saved set symbol, Scryfall's name and keyword lists and a printing Scryfall removed (Sol Ring from M10 would be it)
const symbolSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 10 10"><path d="M5 0L10 10H0z"/></svg>';
database.prepare("UPDATE sets SET icon_svg_uri = 'https://svgs.scryfall.io/sets/lea.svg?1', block = 'Core Set' WHERE code IN ('lea', 'm10')").run();
database.prepare("INSERT INTO set_symbols (code, uri, svg) VALUES ('lea', 'https://svgs.scryfall.io/sets/lea.svg?1', ?)").run(symbolSvg);
const catalog = database.prepare("INSERT INTO catalogs (name, items) VALUES (?, ?)");
catalog.run("card-names", JSON.stringify(cards.map((card) => card[2])));
catalog.run("creature-types", JSON.stringify(["Angel", "Dragon", "Druid", "Elf", "Elemental", "Horror"]));
catalog.run("keyword-abilities", JSON.stringify(["Deathtouch", "Flying", "First strike", "Lifelink", "Vigilance"]));
catalog.run("artist-names", JSON.stringify(cards.map((card) => card[13])));
insert.run("sol-old", "o-sol", "Sol Ring", "{1}", 1, "Artifact", "{T}: Add {C}{C}.", "", "", legal, "m10", "Magic 2010", "999", "uncommon", null, "2009-07-17", "Mark Tedin");
extras.run("nonfoil", 0, 0, "sol-old");
database.prepare("UPDATE cards SET removed = 1 WHERE id = 'sol-old'").run();

const webRoot = fileURLToPath(new URL("../../apps/web/dist", import.meta.url));
// the test machine may not reach Scryfall: card pictures and mana symbols are never downloaded in the browser tests
const fetcher = async () => { throw new Error("No internet in the browser tests"); };
const app = await buildApp(database, webRoot, undefined, () => false, {
  passwordIterations: 1000, addressAttemptLimit: 10_000, version: "test", fetcher, pictureRetryDelay: 0, pictureDownloads: false, settingsEnv: { forced: {}, locks: {} },
});
// the tests start as if Setup was finished; the Setup test turns it back on
app.serverSettings.set({ setupDone: true });
// the first account is the server's admin; the other tests sign up accounts that are not admins
await app.inject({ method: "POST", url: "/api/signup", headers: { "x-mana-vault": "1" }, payload: { name: "admin", password: "correct horse" } });
await app.listen({ port, host: "127.0.0.1" });
console.log(`Mana Vault test server on http://127.0.0.1:${port}`);
