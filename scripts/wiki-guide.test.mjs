import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { publishGuide } from "./wiki-guide.mjs";

test("publishes guide pages and links without removing unrelated wiki pages", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mana-vault-wiki-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const wiki = join(root, "wiki");
  mkdirSync(source);
  mkdirSync(wiki);
  writeFileSync(join(source, "01-overview.md"), "# Overview\n\n[Topic](/about/topic#section)\n");
  writeFileSync(join(source, "02-topic.md"), "# Topic\n\n[Overview](/about/overview)\n");
  writeFileSync(join(wiki, "Community.md"), "Community content");
  writeFileSync(join(wiki, "retired.md"), "Old guide content");
  writeFileSync(join(wiki, ".mana-vault-guide.json"), '["retired.md"]');

  publishGuide(source, wiki, "owner/repo", "1.2.3");

  assert.match(readFileSync(join(wiki, "Home.md"), "utf8"), /Guide for Mana Vault 1\.2\.3/);
  assert.match(readFileSync(join(wiki, "Home.md"), "utf8"), /https:\/\/github\.com\/owner\/repo\/wiki\/topic#section/);
  assert.match(readFileSync(join(wiki, "topic.md"), "utf8"), /https:\/\/github\.com\/owner\/repo\/wiki\/Home/);
  assert.equal(readFileSync(join(wiki, "Community.md"), "utf8"), "Community content");
  assert.throws(() => readFileSync(join(wiki, "retired.md")), { code: "ENOENT" });
});

test("rejects links to missing guide pages before writing", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mana-vault-wiki-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "01-overview.md"), "# Overview\n\n[Missing](/about/missing)\n");
  assert.throws(() => publishGuide(root, root, "owner/repo", "1.2.3"), /Unknown About page: missing/);
});

test("rejects unsafe managed page names", (t) => {
  const root = mkdtempSync(join(tmpdir(), "mana-vault-wiki-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "01-overview.md"), "# Overview\n");
  writeFileSync(join(root, ".mana-vault-guide.json"), '["../other.md"]');
  assert.throws(() => publishGuide(root, root, "owner/repo", "1.2.3"), /Invalid wiki guide manifest/);
});
