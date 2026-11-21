// Tests for 0.14.0 on the server: card pictures for printing are tried again and fall back to a smaller size.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { cardInsertStatement } from "./database.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function server(answer: (url: string, count: number) => boolean) {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    const ok = answer(url, asked.filter((item) => item === url).length);
    return { ok, status: ok ? 200 : 429, headers: { get: () => (url.includes(".png") ? "image/png" : "image/jpeg") }, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
  };
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, fetcher, pictureRetryDelay: 0, pictureDownloads: false });
  closers.push(async () => { await app.close(); database.close(); });
  cardInsertStatement(database).run("p1", "o1", "Sauron, the Dark Lord", "{3}{U}{B}{R}", 6, "Legendary Creature", "", "UBR", "UBR", "{}", "hoc", "Hobbit Commander", "36", "mythic",
    "https://cards.scryfall.io/normal/front/1/1/p1.jpg?9", "2023-06-23", "Artist");
  const signup = await app.inject({ method: "POST", url: "/api/signup", headers: { "x-mana-vault": "1" }, payload: { name: "ann", password: "correct horse" } });
  const cookie = String(signup.headers["set-cookie"]).split(";")[0]!;
  const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
  return { get, asked };
}

describe("card pictures for printing", () => {
  it("tries a failed download again", async () => {
    const { get, asked } = await server((url, count) => count > 1);
    const response = await get("/api/card-images/p1");
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("https://cards.scryfall.io/png/front/1/1/p1.png?9");
    expect(asked).toEqual(["https://cards.scryfall.io/png/front/1/1/p1.png?9", "https://cards.scryfall.io/png/front/1/1/p1.png?9"]);
  });

  it("uses the large picture when the full-size one cannot be had, and answers 502 only when nothing can", async () => {
    const { get, asked } = await server((url) => url.includes("/large/"));
    const response = await get("/api/card-images/p1");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/jpeg");
    expect(asked.at(-1)).toBe("https://cards.scryfall.io/large/front/1/1/p1.jpg?9");
    const none = await server(() => false);
    expect((await none.get("/api/card-images/p1")).statusCode).toBe(502);
    expect(none.asked).toHaveLength(6);
  });
});
