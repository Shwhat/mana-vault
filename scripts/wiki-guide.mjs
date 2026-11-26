import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestName = ".mana-vault-guide.json";
const managedName = /^(?:Home|[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export function publishGuide(source, destination, repository, version) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Expected a GitHub repository in owner/name form");
  const pages = readdirSync(source).filter((name) => /^\d+-[a-z0-9-]+\.md$/.test(name)).sort().map((name) => ({
    slug: name.replace(/^\d+-/, "").replace(/\.md$/, ""),
    body: readFileSync(join(source, name), "utf8"),
  }));
  const slugs = new Set(pages.map((page) => page.slug));
  if (!slugs.has("overview") || slugs.size !== pages.length) throw new Error("Guide must contain an overview and unique page slugs");

  const output = new Map();
  for (const page of pages) {
    const name = page.slug === "overview" ? "Home.md" : `${page.slug}.md`;
    const body = page.body.replace(/\]\(\/about\/([a-z0-9-]+)(#[^)\s]+)?\)/g, (_match, slug, fragment = "") => {
      if (!slugs.has(slug)) throw new Error(`Unknown About page: ${slug}`);
      return `](https://github.com/${repository}/wiki/${slug === "overview" ? "Home" : slug}${fragment})`;
    });
    output.set(name, page.slug === "overview"
      ? body.replace(/^# .+$/m, `$&\n\n> Guide for Mana Vault ${version}. The in-app About guide is the source for these pages.`)
      : body);
  }

  const manifestPath = join(destination, manifestName);
  let previous = [];
  try {
    previous = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!Array.isArray(previous) || previous.some((name) => typeof name !== "string" || !managedName.test(name))) {
    throw new Error("Invalid wiki guide manifest");
  }
  for (const name of previous) {
    if (!output.has(name)) unlinkSync(join(destination, name));
  }
  for (const [name, body] of output) writeFileSync(join(destination, name), body);
  writeFileSync(manifestPath, `${JSON.stringify([...output.keys()], null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Provide the path to the checked-out wiki");
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  publishGuide(join(root, "apps", "web", "src", "about"), resolve(process.argv[2]), process.env.GITHUB_REPOSITORY, version);
}
