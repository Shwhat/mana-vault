// Browser tests for 0.23.0: web pages into notes: pasting with pictures, importing .html files and saved web pages,
// and New page from web address... (the browser tests' server has a stand-in web at example.test).
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { modeTab, signUp, status, test, expect } from "./fixtures";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const saved = (page: Page) => expect(page.locator(".nstatus")).toHaveText("Saved", { timeout: 8000 });
const notes = async (page: Page) => (await (await page.request.get("/api/notes")).json()) as { pages: Array<{ id: string; title: string; parentId: string | null }> };
const body = async (page: Page, title: string) => {
  const found = (await notes(page)).pages.find((item) => item.title === title)!;
  return ((await (await page.request.get(`/api/notes/pages/${found.id}`)).json()) as { body: string }).body;
};

async function newPage(page: Page, title: string) {
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "New page...", exact: true }).click();
  await page.locator("dialog#dlg[open]").getByRole("textbox", { name: "Title" }).fill(title);
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Make page" }).click();
  await expect(page.locator("input.ntitle")).toHaveValue(title);
}

test("pasting part of a web page keeps its formatting, simplifies it and copies its pictures", async ({ page }) => {
  await signUp(page, "v23paste");
  await modeTab(page, "Wiki");
  await newPage(page, "Pasted");
  await page.locator(".notebody").click();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/html", `<meta charset="utf-8"><h2 style="color:red;font-family:Comic Sans">Combo</h2>
      <div style="display:flex"><p>Play <b>Sol Ring</b> then <a href="https://example.test/more">read more</a> or <a href="#top">jump</a>.</p></div>
      <p><img src="https://example.test/pics/elf.png" alt="Elf picture" width="300" style="border:1px solid red"></p>
      <iframe src="https://www.youtube.com/embed/xyz"></iframe>
      <ul><li>One</li><li>Two</li></ul>`);
    data.setData("text/plain", "Combo");
    document.querySelector(".notebody")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".notebody h2")).toHaveText("Combo");
  await expect(page.locator(".notebody img.notepic")).toHaveAttribute("src", /^\/api\/notes\/files\/[0-9a-f-]{36}$/);
  await saved(page);
  const text = await body(page, "Pasted");
  expect(text).toContain("## Combo");
  expect(text).toContain("Play **Sol Ring** then [read more](https://example.test/more) or jump.");
  expect(text).toMatch(/!\[Elf picture\]\(\/api\/notes\/files\/[0-9a-f-]{36}\)/);
  expect(text).toContain("[Watch the video](https://www.youtube.com/embed/xyz)");
  expect(text).toContain("- One\n- Two");
  expect(text).not.toContain("color");
});

test("New page from web address... keeps the article, its pictures and where it came from", async ({ page }) => {
  await signUp(page, "v23web");
  await modeTab(page, "Wiki");
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "From web address..." }).click();
  const dialog = page.locator("dialog#dlg[open]");
  await dialog.getByRole("textbox", { name: "Web address" }).fill("example.test/primer");
  await dialog.getByRole("button", { name: "Make page" }).click();
  await expect(status(page)).toHaveText("Page Elf ball primer made; 1 picture could not be copied and stay as links");
  await expect(page.locator("input.ntitle")).toHaveValue("Elf ball primer");
  const text = await body(page, "Elf ball primer");
  expect(text).toMatch(/^Source: \[https:\/\/example\.test\/primer\]\(https:\/\/example\.test\/primer\), copied \d{4}-\d\d-\d\d\n\n/);
  expect(text).toContain("The deck plays **many elves** and wins with [one big combo](https://example.test/combo)");
  expect(text).toMatch(/!\[An elf\]\(\/api\/notes\/files\/[0-9a-f-]{36}\)/);
  expect(text).toContain("![Gone](https://missing.example.test/gone.png)");
  expect(text).toContain("## Key cards");
  expect(text).toContain("| Turn | Play |");
  expect(text).toContain("[Watch the video](https://www.youtube.com/embed/abc123)");
  expect(text).toContain("Read the rules section");
  for (const dropped of ["Sign in", "sponsor", "Copyright", "# Elf ball primer"]) expect(text).not.toContain(dropped);
  // a refused address and a site that cannot be reached
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "From web address..." }).click();
  await dialog.getByRole("textbox", { name: "Web address" }).fill("http://192.168.1.10/admin");
  await dialog.getByRole("button", { name: "Make page" }).click();
  await expect(status(page)).toHaveText("Addresses on the server's own network are not fetched");
  await dialog.getByRole("textbox", { name: "Web address" }).fill("https://nowhere.test/");
  await dialog.getByRole("button", { name: "Make page" }).click();
  await expect(status(page)).toHaveText("Could not fetch the page: The site was not found");
});

test("Import pages... takes a saved web page with its folder of pictures, and markdown beside it", async ({ page }) => {
  await signUp(page, "v23html");
  await modeTab(page, "Wiki");
  const html = `<!DOCTYPE html>
<!-- saved from url=(0029)https://example.test/sideboard -->
<html><head><title>Sideboard guide</title></head><body><nav>Menu Home</nav>
<main><h1>Sideboard guide</h1><p>Against control decks bring in the counterspells and take out the slow creatures from the main deck.</p>
<img src="Sideboard%20guide_files/plan.png" alt="Plan"><p>Against aggro decks bring in the sweepers and take out the card draw.</p></main></body></html>`;
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "Import pages..." }).click();
  await (await chooser).setFiles([
    { name: "Sideboard guide.html", mimeType: "text/html", buffer: Buffer.from(html) },
    { name: "plan.png", mimeType: "image/png", buffer: PNG },
    { name: "Notes.md", mimeType: "text/markdown", buffer: Buffer.from("Plain markdown") },
  ]);
  await expect(status(page)).toHaveText("Imported 2 pages");
  const text = await body(page, "Sideboard guide");
  expect(text).toMatch(/^Source: \[https:\/\/example\.test\/sideboard\]\(https:\/\/example\.test\/sideboard\), copied /);
  expect(text).toContain("Against control decks bring in the counterspells");
  expect(text).toMatch(/!\[Plan\]\(\/api\/notes\/files\/[0-9a-f-]{36}\)/);
  expect(text).not.toContain("Menu Home");
  expect(await body(page, "Notes")).toBe("Plain markdown");
  void readFileSync;
});
