// Tests for 0.23.0: web pages and pictures fetched for notes, refused addresses, and pictures that join their page.
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { NoteFetcher } from "./notes.js";
import { guardedFetcher, privateAddress, refusedUrl } from "./notes-web.js";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => { while (closers.length) await closers.pop()!(); });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ARTICLE = "<html><head><meta charset=\"windows-1252\"><title>Elves</title></head><body><article><h1>Elves</h1><p>Caf\xe9 elves</p><img src=\"/elf.png\"></article></body></html>";

/** A stand-in for the web: an article, a picture with no kind, a picture with a wrong kind, and a site that fails. */
const site: NoteFetcher = async (url, limit) => {
  if (url === "https://example.test/elves") return { url: "https://example.test/elves/", type: "text/html; charset=windows-1252", bytes: Buffer.from(ARTICLE, "latin1") };
  if (url === "https://example.test/elf.png") return { url, type: "", bytes: PNG };
  if (url === "https://example.test/fake.png") return { url, type: "image/png", bytes: Buffer.from("<html>not a picture</html>") };
  if (url === "https://example.test/data.json") return { url, type: "application/json", bytes: Buffer.from("{}") };
  if (url === "https://example.test/huge.png") throw new Error(`The file is larger than ${limit / 1024 / 1024} MB`);
  throw new Error("The site was not found");
};

async function setup() {
  const database = new DatabaseSync(":memory:");
  const app = await buildApp(database, undefined, undefined, undefined, { passwordIterations: 1000, addressAttemptLimit: 1000, pictureDownloads: false, notesFetcher: site });
  closers.push(async () => { await app.close(); database.close(); });
  const guard = { "x-mana-vault": "1" };
  const response = await app.inject({ method: "POST", url: "/api/signup", headers: guard, payload: { name: "ann", password: "correct horse" } });
  const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
  const call = (method: string, url: string, payload?: unknown) => app.inject({ method: method as "GET", url, headers: { ...(method === "GET" ? {} : guard), cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  return { app, database, call };
}

describe("web pages and pictures for notes", () => {
  it("fetches a page in its own character set and reports where it ended up", async () => {
    const { call } = await setup();
    const page = (await call("POST", "/api/notes/fetch", { url: "https://example.test/elves" })).json();
    expect(page.url).toBe("https://example.test/elves/");
    expect(page.html).toContain("Café elves");
    expect((await call("POST", "/api/notes/fetch", { url: "https://example.test/data.json" })).json().error).toBe("That address is not a web page");
    const missing = await call("POST", "/api/notes/fetch", { url: "https://nowhere.test/" });
    expect(missing.statusCode).toBe(502);
    expect(missing.json().error).toBe("Could not fetch the page: The site was not found");
  });

  it("refuses addresses that are not web addresses or are on the server's own network", async () => {
    const { call } = await setup();
    for (const url of ["ftp://example.test/", "file:///etc/passwd", "http://localhost:8080/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.2/", "http://[::1]/", "http://169.254.169.254/latest", "http://nas.local/", "http://user:pw@example.test/"]) {
      const answer = await call("POST", "/api/notes/fetch", { url });
      expect(answer.statusCode, url).toBe(400);
    }
    expect(refusedUrl("http://localhost/")).toBe("Addresses on the server's own network are not fetched");
    expect(refusedUrl("nonsense")).toBe("Type a web address that starts with http:// or https://");
    expect(refusedUrl("https://example.com/page")).toBeNull();
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(privateAddress(address), address).toBe(true);
    for (const address of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111"]) expect(privateAddress(address), address).toBe(false);
    // the real fetcher refuses a name that is a private address before any connection
    await expect(guardedFetcher("http://127.0.0.1:1/", 1000)).rejects.toThrow("Addresses on the server's own network are not fetched");
  });

  it("copies pictures, finds their kind from their bytes, and joins them to the page that shows them", async () => {
    const { call, app, database } = await setup();
    const copy = await call("POST", "/api/notes/files/copy", { url: "https://example.test/elf.png" });
    expect(copy.statusCode).toBe(201);
    const { id, url } = copy.json();
    const served = await app.inject({ method: "GET", url });
    expect(served.headers["content-type"]).toBe("image/png");
    expect(String(database.prepare("SELECT name FROM note_files WHERE id = ?").get(id)!.name)).toBe("elf.png");
    expect((await call("POST", "/api/notes/files/copy", { url: "https://example.test/fake.png" })).json().error).toBe("That address is not a PNG, JPEG, GIF, WebP, AVIF or SVG picture");
    expect((await call("POST", "/api/notes/files/copy", { url: "https://example.test/huge.png" })).json().error).toBe("Could not copy the picture: The file is larger than 20 MB");
    expect((await call("POST", "/api/notes/files/copy", { url: "http://192.168.1.1/x.png" })).statusCode).toBe(400);
    // a page made with the picture in it takes the picture
    const page = (await call("POST", "/api/notes/pages", { title: "Web", body: `![elf](${url})\n` })).json();
    expect(database.prepare("SELECT page_id FROM note_files WHERE id = ?").get(id)!.page_id).toBe(page.id);
    // and a picture copied for a page is on that page at once
    const second = (await call("POST", "/api/notes/files/copy", { url: "https://example.test/elf.png", pageId: page.id })).json();
    expect(database.prepare("SELECT page_id FROM note_files WHERE id = ?").get(second.id)!.page_id).toBe(page.id);
    expect((await call("POST", "/api/notes/files/copy", { url: "https://example.test/elf.png", pageId: "nope" })).statusCode).toBe(404);
  });
});
