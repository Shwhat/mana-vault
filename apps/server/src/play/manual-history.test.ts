import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { buildApp } from "../app.js";
import { cardExtrasStatement, cardInsertStatement } from "../database.js";

it("retains a participant's manual result and original deck snapshot after database restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "mana-vault-history-"));
  const databasePath = join(root, "history.sqlite");
  await writeFile(join(root, "index.html"), "<!doctype html><title>App</title>", "utf8");
  let database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE play_manual_tables (
      id TEXT PRIMARY KEY, invite_code TEXT NOT NULL UNIQUE,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      player_limit INTEGER NOT NULL CHECK(player_limit IN (2, 4)),
      status TEXT NOT NULL CHECK(status IN ('waiting', 'active', 'closed')),
      revision INTEGER NOT NULL DEFAULT 0, state_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const options = { passwordIterations: 1000, pictureDownloads: false, mtgjsonSchedule: false };
  let app = await buildApp(database, root, undefined, undefined, options);
  let appOpen = true;
  let databaseOpen = true;
  try {
    const guard = { "x-mana-vault": "1", "content-type": "application/json" };
    const signup = async (name: string) => {
      const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name, password: "correct horse" } });
      expect(response.statusCode).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    const host = await signup("history-host");
    const guest = await signup("history-guest");
    const outsider = await signup("history-outsider");
    for (const [id, name] of [["history-commander", "History Commander"], ["history-card", "History Card"]] as const) {
      cardInsertStatement(database).run(
        id, `${id}-oracle`, name, "", 0, "Creature", "", "", "",
        JSON.stringify({ commander: "legal" }), "tst", "Test Set", id, "rare", null, "2024-01-01", "Mana Vault test",
      );
      cardExtrasStatement(database).run("nonfoil", 0, 0, id);
    }
    const deck = async (cookie: string, name: string) => {
      const response = await app.inject({ method: "POST", url: "/api/decks", headers: { ...guard, cookie }, payload: { name, format: "commander" } });
      expect(response.statusCode).toBe(201);
      const id = String(response.json().id);
      for (const [cardId, zone, quantity] of [["history-commander", "commander", 1], ["history-card", "main", 8]] as const) {
        expect((await app.inject({
          method: "POST", url: `/api/decks/${id}/cards`, headers: { ...guard, cookie },
          payload: { cardId, zone, quantity },
        })).statusCode).toBe(201);
      }
      return id;
    };
    const hostDeck = await deck(host, "Original deck");
    const guestDeck = await deck(guest, "Guest deck");
    const created = await app.inject({
      method: "POST", url: "/api/play/manual/tables", headers: { ...guard, cookie: host },
      payload: { deckId: hostDeck, playerLimit: 2 },
    });
    expect(created.statusCode).toBe(201);
    const { table, inviteCode } = created.json();
    expect((await app.inject({
      method: "POST", url: "/api/play/manual/tables/join", headers: { ...guard, cookie: guest }, payload: { inviteCode, deckId: guestDeck },
    })).statusCode).toBe(200);
    const started = await app.inject({
      method: "POST", url: `/api/play/manual/tables/${table.id}/start`, headers: { ...guard, cookie: host }, payload: {},
    });
    expect(started.statusCode).toBe(200);
    const startTime = database.prepare("SELECT started_at FROM play_manual_tables WHERE id = ?").get(table.id)?.started_at;
    expect(startTime).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect((await app.inject({
      method: "POST", url: `/api/play/manual/tables/${table.id}/actions`, headers: { ...guard, cookie: guest },
      payload: { revision: started.json().table.revision, action: { type: "loss" } },
    })).statusCode).toBe(200);
    const endTime = database.prepare("SELECT ended_at FROM play_manual_tables WHERE id = ?").get(table.id)?.ended_at;
    expect(endTime).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    database.prepare("UPDATE decks SET name = ? WHERE id = ?").run("Renamed deck", hostDeck);
    for (let index = 0; index < 50; index += 1) {
      const id = `history-page-${index}`;
      database.prepare(
        `INSERT INTO play_manual_tables (id, invite_code, owner_id, player_limit, status, revision, state_json)
         SELECT ?, ?, owner_id, player_limit, status, revision, state_json FROM play_manual_tables WHERE id = ?`,
      ).run(id, `history-code-${index}`, table.id);
      database.prepare(
        `INSERT INTO play_manual_members (table_id, user_id, seat, player_name, deck_name, deck_snapshot)
         SELECT ?, user_id, seat, player_name, deck_name, deck_snapshot FROM play_manual_members WHERE table_id = ?`,
      ).run(id, table.id);
    }
    await app.close();
    appOpen = false;
    database.close();
    databaseOpen = false;

    database = new DatabaseSync(databasePath);
    databaseOpen = true;
    app = await buildApp(database, root, undefined, undefined, options);
    appOpen = true;
    const history = await app.inject({ method: "GET", url: "/api/play/manual/history", headers: { cookie: host } });
    expect(history.statusCode).toBe(200);
    expect(history.json().games).toHaveLength(50);
    expect(history.json().games[0]).toMatchObject({
      id: "history-page-49", completed: true, deckName: "Original deck", startedAt: null, endedAt: null,
    });
    const cursor = history.json().nextBefore;
    expect(typeof cursor).toBe("string");
    const older = await app.inject({ method: "GET", url: `/api/play/manual/history?before=${cursor}`, headers: { cookie: host } });
    expect(older.statusCode).toBe(200);
    expect(older.json().games).toMatchObject([{
      id: table.id, completed: true, deckName: "Original deck", startedAt: startTime, endedAt: endTime,
    }]);
    expect(older.json().nextBefore).toBeNull();
    expect((await app.inject({ method: "GET", url: `/api/play/manual/history?before=${table.id}`, headers: { cookie: outsider } })).statusCode).toBe(404);
    const hostResultsUrl = `/api/play/manual/decks/${hostDeck}/results`;
    const guestResultsUrl = `/api/play/manual/decks/${guestDeck}/results`;
    const hostResults = await app.inject({ method: "GET", url: hostResultsUrl, headers: { cookie: host } });
    expect(hostResults.headers["cache-control"]).toBe("no-store");
    expect(hostResults.json().results).toEqual({ completed: 51, remaining: 51, reportedLoss: 0, conceded: 0, closedEarly: 0 });
    expect((await app.inject({ method: "GET", url: guestResultsUrl, headers: { cookie: guest } })).json().results)
      .toEqual({ completed: 51, remaining: 0, reportedLoss: 51, conceded: 0, closedEarly: 0 });
    expect((await app.inject({ method: "GET", url: hostResultsUrl, headers: { cookie: outsider } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: hostResultsUrl, headers: { cookie: guest } })).statusCode).toBe(404);
    const snapshot = await app.inject({ method: "GET", url: `/api/play/manual/history/${table.id}/deck`, headers: { cookie: host } });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().snapshot.name).toBe("Original deck");
    expect(snapshot.json().snapshot.cards).toHaveLength(2);
    const another = await app.inject({
      method: "POST", url: "/api/play/manual/tables", headers: { ...guard, cookie: host },
      payload: { deckId: hostDeck, playerLimit: 2 },
    });
    expect(another.statusCode).toBe(201);
    const anotherId = another.json().table.id;
    expect((await app.inject({
      method: "POST", url: "/api/play/manual/tables/join", headers: { ...guard, cookie: guest },
      payload: { inviteCode: another.json().inviteCode, deckId: guestDeck },
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST", url: `/api/play/manual/tables/${anotherId}/start`, headers: { ...guard, cookie: host }, payload: {},
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST", url: `/api/play/manual/tables/${anotherId}/leave`, headers: { ...guard, cookie: guest }, payload: {},
    })).statusCode).toBe(200);
    const leftHistory = (await app.inject({ method: "GET", url: "/api/play/manual/history", headers: { cookie: host } })).json().games[0];
    expect(leftHistory).toMatchObject({ id: anotherId, completed: true });
    expect(leftHistory.endedAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect((await app.inject({ method: "GET", url: guestResultsUrl, headers: { cookie: guest } })).json().results)
      .toEqual({ completed: 52, remaining: 0, reportedLoss: 51, conceded: 1, closedEarly: 0 });
    const early = await app.inject({
      method: "POST", url: "/api/play/manual/tables", headers: { ...guard, cookie: host },
      payload: { deckId: hostDeck, playerLimit: 2 },
    });
    const earlyId = early.json().table.id;
    expect((await app.inject({
      method: "POST", url: "/api/play/manual/tables/join", headers: { ...guard, cookie: guest },
      payload: { inviteCode: early.json().inviteCode, deckId: guestDeck },
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST", url: `/api/play/manual/tables/${earlyId}/start`, headers: { ...guard, cookie: host }, payload: {},
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "DELETE", url: `/api/play/manual/tables/${earlyId}`, headers: { ...guard, cookie: host }, payload: {},
    })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: hostResultsUrl, headers: { cookie: host } })).json().results)
      .toEqual({ completed: 52, remaining: 52, reportedLoss: 0, conceded: 0, closedEarly: 1 });
  } finally {
    if (appOpen) await app.close();
    if (databaseOpen) database.close();
    await rm(root, { recursive: true, force: true });
  }
});
