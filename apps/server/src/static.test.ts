import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("static app hosting", () => {
  it("serves the frontend shell from the API origin", async () => {
    const root = await mkdtemp(join(tmpdir(), "mana-vault-web-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Mana Vault test</title>", "utf8");
    await writeFile(join(root, "assets", "app.js"), "export const app = true;", "utf8");

    const database = new DatabaseSync(":memory:");
    const app = await buildApp(database, root);
    try {
      const page = await app.inject({ method: "GET", url: "/" });
      const asset = await app.inject({ method: "GET", url: "/assets/app.js" });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain("<title>Mana Vault test</title>");
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toContain("app = true");
    } finally {
      await app.close();
      database.close();
    }
  });
});
