// Browser tests for 0.22.0: notes pages with the rich text editor, child pages, links, the Wiki tab, templates, history,
// clashes, pictures, import and export, the deck's Notes tab in place of Description and the collection's Notes tab.
import { readFileSync } from "node:fs";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import type { Page } from "@playwright/test";
import { choose, menu, modeTab, signUp, status, test, expect } from "./fixtures";

const guard = { "x-mana-vault": "1" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function newWikiPage(page: Page, title: string, template?: string) {
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "New page..." }).click();
  const dialog = page.locator("dialog#dlg[open]");
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  if (template) {
    await dialog.getByRole("button", { name: /^Start from/ }).click();
    await page.locator(".pkpop .pkopt", { hasText: template }).first().click();
  }
  await dialog.getByRole("button", { name: "Make page" }).click();
  await expect(page.locator("input.ntitle")).toHaveValue(title);
}

const saved = (page: Page) => expect(page.locator(".nstatus")).toHaveText("Saved", { timeout: 6000 });
const notes = async (page: Page) => (await (await page.request.get("/api/notes")).json()) as { pages: Array<{ id: string; title: string; parentId: string | null; kind: string | null; pinned: boolean }> };
const body = async (page: Page, title: string) => {
  const found = (await notes(page)).pages.find((item) => item.title === title)!;
  return ((await (await page.request.get(`/api/notes/pages/${found.id}`)).json()) as { body: string }).body;
};

test("the Wiki makes pages with rich text, links, child pages, search and pins", async ({ page }) => {
  await signUp(page, "v22wiki");
  await modeTab(page, "Wiki");
  await expect(page.locator("#view-wiki .empty")).toContainText("Open a page from the list, or make one");
  await newWikiPage(page, "Deck ideas");
  const editor = page.locator(".notebody");
  await editor.click();
  await page.keyboard.type("# Big plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Play **many** elves, see ");
  // typing [[ opens the page list
  await page.keyboard.type("[[");
  const finder = page.locator("dialog#dlg[open]");
  await finder.getByRole("textbox", { name: "Page title" }).fill("Elf combo");
  await expect(finder.getByRole("option")).toContainText("New page: Elf combo");
  await page.keyboard.press("Enter");
  await expect(editor).toBeFocused();
  await page.keyboard.type("today.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[ ] buy lands");
  await saved(page);
  expect(await body(page, "Deck ideas")).toBe("# Big plan\n\nPlay **many** elves, see [[Elf combo]] today.\n\n- [ ] buy lands\n");
  // a link to a page that does not exist yet is red, and clicking it makes the page
  const link = editor.locator(".notelink", { hasText: "Elf combo" });
  await expect(link).toHaveClass(/missing/);
  await link.click();
  await expect(status(page)).toHaveText("Page Elf combo made");
  await expect(page.locator("input.ntitle")).toHaveValue("Elf combo");
  await expect(page.locator(".nbacklinks")).toContainText("Deck ideas");
  // a child page
  await page.locator(".nhead").getByRole("button", { name: "New child page..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("textbox", { name: "Title" }).fill("Pieces");
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Make page" }).click();
  await expect(page.locator("input.ntitle")).toHaveValue("Pieces");
  const tree = await notes(page);
  const combo = tree.pages.find((item) => item.title === "Elf combo")!;
  expect(tree.pages.find((item) => item.title === "Pieces")!.parentId).toBe(combo.id);
  await expect(page.locator(".ntree [role=treeitem][aria-level='2']", { hasText: "Pieces" })).toBeVisible();
  // back on the first page the link is no longer red
  await page.locator(".ntree [role=treeitem]", { hasText: "Deck ideas" }).click();
  await expect(page.locator(".notebody .notelink", { hasText: "Elf combo" })).not.toHaveClass(/missing/);
  // search
  await page.getByRole("textbox", { name: "Search notes" }).fill("buy lands");
  await expect(page.getByRole("listbox", { name: "Pages found" }).getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("listbox", { name: "Pages found" })).toContainText("buy lands");
  await page.getByRole("textbox", { name: "Search notes" }).fill("");
  // pin
  await page.locator(".nhead").getByRole("button", { name: "Pin" }).click();
  await expect(page.getByRole("list", { name: "Pinned pages" })).toContainText("Deck ideas");
  await expect(page.getByRole("list", { name: "Recent pages" })).toContainText("Elf combo");
  // renaming a page changes the links to it
  await page.locator(".ntree [role=treeitem]", { hasText: "Elf combo" }).click();
  await page.locator("input.ntitle").fill("Elf engine");
  await saved(page);
  await expect.poll(() => body(page, "Deck ideas")).toContain("[[Elf engine]]");
});

test("the deck's Notes tab holds its description, a template, checklists, tables and card links", async ({ page }) => {
  await signUp(page, "v22deck");
  const deck = await (await page.request.post("/api/decks", { headers: guard, data: { name: "Dragons" } })).json();
  await page.request.patch(`/api/decks/${deck.id}`, { headers: guard, data: { description: "Old primer text" } });
  await page.request.post(`/api/decks/${deck.id}/cards`, { headers: guard, data: { cardId: "shivan", quantity: 1, zone: "main" } });
  await page.reload();
  await modeTab(page, "Decks");
  await page.locator("#view-deck .switcher").first().click();
  await page.locator(".swrow", { hasText: "Dragons" }).first().dblclick();
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.locator(".ntitle")).toHaveText("Dragons");
  await expect(page.locator(".notebody")).toContainText("Old primer text");
  await expect(page.getByRole("button", { name: /^Cover card/ })).toBeVisible();
  // a child page from the Deck primer template
  await page.locator(".nhead").getByRole("button", { name: "New child page..." }).click();
  const dialog = page.locator("dialog#dlg[open]");
  await dialog.getByRole("textbox", { name: "Title" }).fill("Primer");
  await dialog.getByRole("button", { name: /^Start from/ }).click();
  await page.locator(".pkpop .pkopt", { hasText: "Deck primer" }).click();
  await dialog.getByRole("button", { name: "Make page" }).click();
  await expect(page.locator(".notebody h2", { hasText: "Game plan" })).toBeVisible();
  await expect(page.locator(".notebody table")).toBeVisible();
  // a table row and a card link
  await page.locator(".notebody table td").first().click();
  await page.getByRole("button", { name: "Add row" }).click();
  await expect(page.locator(".notebody table tr")).toHaveCount(3);
  await page.locator(".notebody h2", { hasText: "Overview" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Card link" }).click();
  await page.locator("dialog#dlg[open]").getByRole("textbox", { name: "Card name" }).fill("Shivan");
  await page.locator("dialog#dlg[open]").getByRole("option", { name: "Shivan Dragon" }).click();
  await saved(page);
  expect(await body(page, "Primer")).toContain("[[card:Shivan Dragon]]");
  await page.locator(".notebody .cardlink", { hasText: "Shivan Dragon" }).click();
  await expect(page.locator(".cardpage, #view-card, .cpage").first()).toBeVisible();
  await page.keyboard.press("Escape");
  // the top page is the description
  await page.goto("/");
  await modeTab(page, "Decks");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.locator(".ntree [role=treeitem]", { hasText: "Dragons" }).click();
  await page.locator(".notebody").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" New words");
  await saved(page);
  expect((await (await page.request.get(`/api/decks/${deck.id}`)).json()).description).toBe("Old primer text New words\n");
  // the Wiki lists the deck with its pages
  await modeTab(page, "Wiki");
  const decks = page.getByRole("tree", { name: "Deck pages" });
  await expect(decks.getByRole("treeitem", { name: /Dragons/ })).toBeVisible();
  await expect(decks.getByRole("treeitem", { name: /Primer/ })).toBeVisible();
  // the plain text export carries the notes at the end
  await modeTab(page, "Decks");
  await menu(page, "File", "Export...");
  const exportDialog = page.locator("dialog#dlg[open]");
  await choose(page, exportDialog.locator("#ex-what"), "deck");
  await choose(page, exportDialog.locator("#ex-format"), "text");
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
  const text = readFileSync(await (await download).path(), "utf8");
  expect(text).toContain("// Notes\r\n// Old primer text New words");
});

test("history restores a version, and a save that meets someone else's asks which text to keep", async ({ page }) => {
  await signUp(page, "v22hist");
  await modeTab(page, "Wiki");
  await newWikiPage(page, "Guide");
  await page.locator(".notebody").click();
  await page.keyboard.type("First text");
  await saved(page);
  const id = (await notes(page)).pages[0]!.id;
  // another device saves meanwhile
  const other = await (await page.request.get(`/api/notes/pages/${id}`)).json();
  await page.request.put(`/api/notes/pages/${id}`, { headers: guard, data: { body: "Their text\n", baseVersion: other.version } });
  await page.keyboard.type(" and mine");
  const clash = page.locator("dialog#dlg[open]");
  await expect(clash).toContainText("Choose which text to keep");
  await expect(clash.getByLabel("Their text")).toContainText("Their text");
  await expect(clash.getByLabel("Your text")).toContainText("First text and mine");
  await clash.getByRole("button", { name: "Keep both" }).click();
  await expect(status(page)).toHaveText("Your text was kept as Guide (my copy)");
  await expect(page.locator(".notebody")).toContainText("Their text");
  expect(await body(page, "Guide (my copy)")).toBe("First text and mine\n");
  // history: the version with First text and mine was replaced by theirs; restore the first one
  await page.locator(".nhead").getByRole("button", { name: "History..." }).click();
  const history = page.locator("dialog#dlg[open]");
  await expect(history.getByRole("option")).toHaveCount(2);
  await history.getByRole("option").nth(1).click();
  await expect(history.locator(".nhview .notebody")).toContainText("First text");
  await history.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("#view-wiki .notebody")).toContainText("First text");
  await expect(page.locator("#view-wiki .notebody")).not.toContainText("Their text");
});

test("collection notes, Move to..., drag and drop, delete with undo, and pictures", async ({ page }) => {
  await signUp(page, "v22coll");
  await modeTab(page, "Collection");
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.locator(".ntitle")).toHaveText("Main collection");
  await page.locator(".notebody").click();
  await page.keyboard.type("Wanted list");
  await saved(page);
  // a picture
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Picture" }).click();
  await (await chooser).setFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".notebody img.notepic")).toBeVisible();
  await saved(page);
  expect(await body(page, "Main collection")).toMatch(/!\[dot\]\(\/api\/notes\/files\/[0-9a-f-]{36}\)/);
  // pages in the Wiki: one moved under the collection with Move to..., one by dragging
  await modeTab(page, "Wiki");
  await newWikiPage(page, "Binder plan");
  await newWikiPage(page, "Loose idea");
  await page.locator(".ntree [role=treeitem]", { hasText: "Binder plan" }).click({ button: "right" });
  await page.locator("#ctxmenu [role=menuitem]", { hasText: "Move to..." }).first().click();
  const move = page.locator("dialog#dlg[open]");
  await move.getByRole("button", { name: /^Move to/ }).click();
  await page.locator(".pkpop .pkopt", { hasText: "Collection: Main collection" }).click();
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect(status(page)).toHaveText("Binder plan moved");
  const collections = page.getByRole("tree", { name: "Collection pages" });
  await expect(collections.getByRole("treeitem", { name: /Binder plan/ })).toHaveAttribute("aria-level", "2");
  await page.locator(".ntree [role=treeitem]", { hasText: "Loose idea" }).dragTo(collections.getByRole("treeitem", { name: /Binder plan/ }));
  await expect(status(page)).toHaveText("Loose idea moved");
  await expect(collections.getByRole("treeitem", { name: /Loose idea/ })).toHaveAttribute("aria-level", "3");
  // delete Binder plan with its child, then undo
  await collections.getByRole("treeitem", { name: /Binder plan/ }).click({ button: "right" });
  await page.locator("#ctxmenu [role=menuitem]", { hasText: "Delete..." }).first().click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Delete with child pages" }).click();
  await expect(status(page)).toHaveText("Binder plan deleted");
  expect((await notes(page)).pages.map((item) => item.title)).toEqual(["Main collection"]);
  await page.keyboard.press("Control+z");
  await expect(status(page)).toHaveText("Undone: Delete Binder plan");
  expect((await notes(page)).pages.map((item) => item.title).sort()).toEqual(["Binder plan", "Loose idea", "Main collection"]);
});

test("markdown import of a folder zip, export as a zip, and templates", async ({ page }) => {
  await signUp(page, "v22io");
  await modeTab(page, "Wiki");
  const zip = zipSync({
    "Vault/Decks.md": strToU8("All my decks, see [[Elves]]"),
    "Vault/Decks/Elves.md": strToU8("---\ntags: x\n---\n# Elves\n\n![[elf.png]]\n"),
    "Vault/attachments/elf.png": new Uint8Array(PNG),
  });
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "Import pages..." }).click();
  await (await chooser).setFiles({ name: "vault.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
  await expect(status(page)).toHaveText("Imported 3 pages");
  const tree = await notes(page);
  const decks = tree.pages.find((item) => item.title === "Decks")!;
  expect(tree.pages.find((item) => item.title === "Elves")!.parentId).toBe(decks.id);
  expect(decks.parentId).toBe(tree.pages.find((item) => item.title === "Vault")!.id);
  expect(await body(page, "Elves")).toMatch(/^# Elves\n\n!\[elf\.png\]\(\/api\/notes\/files\/[0-9a-f-]{36}\)\n$/);
  // export the whole Wiki
  const download = page.waitForEvent("download");
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "Export..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "The whole Wiki" }).click();
  const files = unzipSync(readFileSync(await (await download).path()));
  const names = Object.keys(files).sort();
  expect(names.filter((name) => name.endsWith(".md"))).toEqual(["Vault.md", "Vault/Decks.md", "Vault/Decks/Elves.md"]);
  expect(names.some((name) => /^attachments\/[0-9a-f-]{36}\.png$/.test(name))).toBe(true);
  expect(strFromU8(files["Vault/Decks/Elves.md"]!)).toMatch(/!\[elf\.png\]\(\.\.\/\.\.\/attachments\/[0-9a-f-]{36}\.png\)/);
  // import under a chosen page
  const under = page.waitForEvent("filechooser");
  await page.locator(".ntree [role=treeitem]", { hasText: "Elves" }).first().click({ button: "right" });
  await page.locator("#ctxmenu [role=menuitem]", { hasText: "Import pages here..." }).click();
  await (await under).setFiles({ name: "Mulligans.md", mimeType: "text/markdown", buffer: Buffer.from("Keep two lands") });
  await expect(status(page)).toHaveText("Imported 1 page");
  const after = await notes(page);
  expect(after.pages.find((item) => item.title === "Mulligans")!.parentId).toBe(after.pages.find((item) => item.title === "Elves")!.id);
  // save a page as a template, then use it
  await page.locator(".ntree [role=treeitem]", { hasText: "Decks" }).first().click({ button: "right" });
  await page.locator("#ctxmenu [role=menuitem]", { hasText: "Save as template..." }).first().click();
  await page.locator("dialog#dlg[open]").getByRole("textbox", { name: "Template name" }).fill("Deck list page");
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("Template Deck list page saved");
  await newWikiPage(page, "From my template", "Deck list page");
  await expect(page.locator(".notebody")).toContainText("All my decks");
  await page.locator("#view-wiki .wikihead").getByRole("button", { name: "Templates..." }).click();
  await expect(page.locator("dialog#dlg[open]")).toContainText("Deck primer");
  await expect(page.locator("dialog#dlg[open]")).toContainText("Deck list page");
});
