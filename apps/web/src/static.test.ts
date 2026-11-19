// Static checks on the source: About guide structure and coverage, versions, and banned characters.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RIBBON } from "./ribbon";
import { PANELS, PRESET_NAMES } from "./dock";

const root = join(__dirname, "..", "..", "..");
const aboutDir = join(__dirname, "about");
const files = readdirSync(aboutDir).filter((name) => name.endsWith(".md")).sort();
const pages = files.map((name) => ({ name, slug: name.replace(/^\d+-/, "").replace(/\.md$/, ""), body: readFileSync(join(aboutDir, name), "utf8") }));
const guide = pages.map((page) => page.body).join("\n");
const actionsSource = readFileSync(join(__dirname, "actions.tsx"), "utf8");
const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (["node_modules", "dist", ".git", ".gradle", "build", "test-results", "playwright-report"].includes(name)) return [];
    // the Android app's copy of the built interface
    if (name === "public" && directory.endsWith(join("main", "assets"))) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("About guide", () => {
  it("numbers pages in order with one top heading each, release notes last", () => {
    files.forEach((name, index) => expect(name.slice(0, 2)).toBe(String(index + 1).padStart(2, "0")));
    for (const page of pages) {
      expect(page.body.startsWith("# ")).toBe(true);
      expect(page.body.match(/^# /gm)?.length).toBe(1);
    }
    expect(pages[0]?.slug).toBe("overview");
    expect(pages[1]?.slug).toBe("capabilities");
    expect(pages[pages.length - 2]?.slug).toBe("technical");
    expect(pages[pages.length - 1]?.slug).toBe("release-notes");
  });

  it("links only to pages that exist, and the Overview lists every page", () => {
    const slugs = new Set(pages.map((page) => page.slug));
    for (const page of pages) {
      for (const [, slug] of page.body.matchAll(/\]\(\/about\/([a-z0-9-]+)\)/g)) expect(slugs, `${page.name} links to ${slug}`).toContain(slug);
    }
    const overview = pages[0]!.body;
    for (const page of pages.slice(1)) expect(overview).toContain(`(/about/${page.slug})`);
  });

  it("has a newest release note matching the version", () => {
    const notes = pages[pages.length - 1]!.body;
    expect(notes.match(/^## (\S+) /m)?.[1]).toBe(version);
  });

  it("mentions every command, ribbon tab, group, button, panel and workspace", () => {
    const labels = [
      ...[...actionsSource.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]!),
      ...[...actionsSource.matchAll(/theme\("\w+", "([^"]+)"/g)].map((match) => match[1]!),
      ...[...actionsSource.matchAll(/short: "([^"]+)"/g)].map((match) => match[1]!),
      ...Object.values(PANELS).flatMap((panel) => [panel.title, `${panel.title} panel`]),
      ...DEFAULT_RIBBON.flatMap((tab) => [tab.name, ...tab.groups.map((group) => group.name)]),
      ...PRESET_NAMES,
    ];
    const missing = [...new Set(labels)].filter((label) => !guide.includes(label));
    expect(missing).toEqual([]);
  });

  it("lists every keyboard shortcut", () => {
    for (const [, key] of actionsSource.matchAll(/^\s+\["[^"]+", "([^"]+)", "[^"]+"\],$/gm)) expect(guide).toContain(key);
  });
});

describe("source rules", () => {
  it("keeps the version equal everywhere", () => {
    for (const path of ["apps/web/package.json", "apps/server/package.json", "apps/android/package.json"]) {
      expect((JSON.parse(readFileSync(join(root, path), "utf8")) as { version: string }).version).toBe(version);
    }
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as { version: string; packages: Record<string, { version?: string }> };
    expect(lock.version).toBe(version);
    expect(lock.packages[""]?.version).toBe(version);
    expect(lock.packages["apps/web"]?.version).toBe(version);
    expect(lock.packages["apps/server"]?.version).toBe(version);
    expect(lock.packages["apps/android"]?.version).toBe(version);
  });

  it("uses no em dashes in source, guide or documentation", () => {
    const paths = [...walk(join(root, "apps")), ...walk(join(root, "docs")), ...walk(join(root, "tests")),
      join(root, "README.md"), join(root, "docker-compose.yml"), join(root, ".env.example")]
      .filter((path) => /\.(ts|tsx|md|css|html|js|mjs|yml|json|example|java|xml|gradle)$/.test(path) || path.endsWith(".env.example"));
    const offenders = paths.filter((path) => readFileSync(path, "utf8").includes(String.fromCharCode(0x2014)));
    expect(offenders).toEqual([]);
  });
});
