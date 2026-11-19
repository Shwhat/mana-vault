// Starts the built server on a fresh temporary database with a small sample card catalog, for browser tests.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { buildApp } from "../../apps/server/dist/app.js";
import { cardExtrasStatement, cardInsertStatement, initializeDatabase } from "../../apps/server/dist/database.js";
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
const insert = cardInsertStatement(database);
const extras = cardExtrasStatement(database);
for (const [id, oracle, name, cost, mv, type, text, colors, set, setName, number, rarity, released, artist] of cards) {
  insert.run(id, oracle, name, cost, mv, type, text, colors, colors, legal, set, setName, number, rarity, null, released, artist);
  extras.run("nonfoil,foil", 0, 0, id);
}
// Limited Edition Alpha is treated as a 9-card set here so set completion has something to count
saveSets(database, { data: [
  { code: "lea", name: "Limited Edition Alpha", set_type: "core", released_at: "1993-08-05", printed_size: 300, card_count: 9 },
  { code: "m10", name: "Magic 2010", set_type: "core", released_at: "2009-07-17", printed_size: 249, card_count: 1 },
] });
database.prepare("INSERT OR REPLACE INTO catalog_metadata (key, value) VALUES ('updated_at', ?)").run(new Date().toISOString());

const webRoot = fileURLToPath(new URL("../../apps/web/dist", import.meta.url));
const app = await buildApp(database, webRoot, undefined, () => false, { passwordIterations: 1000, addressAttemptLimit: 10_000, version: "test" });
await app.listen({ port, host: "127.0.0.1" });
console.log(`Mana Vault test server on http://127.0.0.1:${port}`);
