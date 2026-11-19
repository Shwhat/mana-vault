import type { Browser, Page } from "@playwright/test";
import { menu, signUp, status, test, expect } from "./fixtures";

const rows = (page: Page) => page.locator("#view-collection .row");

async function newCollection(page: Page, name: string, sets: string[] = []) {
  await menu(page, "Collection", "New collection...");
  await expect(page.locator("#f-name")).toBeFocused();
  await page.keyboard.type(name);
  for (const set of sets) {
    await page.fill("#set-search", set);
    await page.locator(".setrow", { hasText: set }).first().locator("input").check();
  }
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText(`${name} created`);
}

async function addFromSearch(page: Page, names: string[]) {
  await page.keyboard.press("1");
  for (const name of names) {
    await page.locator("#view-cards .row", { hasText: name }).first().click();
    await page.keyboard.press("Enter");
    await expect(status(page)).toContainText(`${name} added to`);
  }
}

test("a new account has a Main collection that receives cards", async ({ page }) => {
  await signUp(page);
  await expect(page.locator("#st-toggles")).toContainText("ADD TO: MAIN COLLECTION");
  await addFromSearch(page, ["Sol Ring"]);
  await expect(status(page)).toHaveText("Sol Ring added to Main collection");
  await expect(page.locator(".pgrp", { hasText: "Owned" })).toContainText("Main collection");
});

test("collections link sets, show completion and missing cards", async ({ page }) => {
  await signUp(page);
  await newCollection(page, "Alpha binder", ["Limited Edition Alpha"]);
  await expect(page.locator("#view-collection .colpick")).toHaveValue(/.+/);
  await expect(page.locator(".colhead .badge.main")).toHaveCount(0);
  await page.locator(".colhead .lnk", { hasText: "Add cards here" }).click();
  await expect(page.locator("#st-toggles")).toContainText("ADD TO: ALPHA BINDER");
  await page.keyboard.press("c");
  await expect(status(page)).toHaveText("New cards go to Main collection");
  await page.keyboard.press("c");
  await expect(status(page)).toHaveText("New cards go to Alpha binder");

  await addFromSearch(page, ["Sol Ring", "Dark Ritual"]);
  await menu(page, "Collection", "Set completion");
  await expect(page.locator(".stvalue")).toHaveText("25%");
  await expect(page.locator(".mrow", { hasText: "Limited Edition Alpha" })).toContainText("2 / 8");

  await page.locator(".seg button", { hasText: "Missing" }).click();
  await expect(page.locator("#view-collection .row")).toHaveCount(6);
  await page.locator(".filterbar select").nth(1).selectOption("rare");
  await expect(page.locator("#view-collection .row")).toHaveCount(1);
  await page.locator("#view-collection .row", { hasText: "Shivan Dragon" }).getByRole("button", { name: "+ Collection" }).click();
  await expect(status(page)).toHaveText("Shivan Dragon added to Alpha binder");
  await expect(page.locator(".filterbar")).toContainText("0 of 5 missing");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export text" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("alpha-binder-missing.txt");

  await menu(page, "Collection", "Collection settings...");
  await page.locator("#f-completion").selectOption("all");
  await page.locator("#f-finish").selectOption("both");
  await page.locator(".dlgbtns .primary").click();
  await page.locator(".seg button", { hasText: "Completion" }).click();
  await expect(page.locator(".rulesline")).toContainText("Every printing (variants and promos too). One of each (regular and foil).");
  await expect(page.locator(".stsub")).toHaveText("3 of 16 owned, 13 missing");
  await expect(page.locator(".colitem", { hasText: "Alpha binder" })).toContainText("18%");
});

test("rows can be picked in bulk, removed, restored and moved", async ({ page }) => {
  await signUp(page);
  await addFromSearch(page, ["Sol Ring", "Dark Ritual", "Counterspell", "Serra Angel"]);
  await newCollection(page, "Trade box");
  await page.locator(".wsbox select").selectOption("Collection");
  await page.locator("#view-collection .colpick").selectOption({ label: "Main collection" });
  await expect(rows(page)).toHaveCount(4);

  await rows(page).nth(0).locator(".rowtitle").click();
  await rows(page).nth(2).locator(".rowtitle").click({ modifiers: ["Shift"] });
  await rows(page).nth(3).locator(".rowtitle").click({ modifiers: ["Control"] });
  await expect(page.locator(".pickbar")).toContainText("4 picked (4 cards)");
  await rows(page).nth(1).locator(".rowtitle").click({ modifiers: ["Control"] });
  await expect(page.locator(".pickbar")).toContainText("3 picked (3 cards)");
  await page.keyboard.press("Delete");
  await expect(page.locator("dialog[open]")).toContainText("Remove 3 entries (3 cards) from Main collection?");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(status(page)).toHaveText("Removed 3 entries (3 cards) from Main collection");
  await expect(rows(page)).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(status(page)).toHaveText("Undone: Remove 3 entries");
  await expect(rows(page)).toHaveCount(4);

  await page.keyboard.press("Control+a");
  await expect(page.locator(".pickbar")).toContainText("4 picked");
  await page.locator(".pickbar").getByRole("button", { name: "Move...", exact: true }).click();
  await expect(page.locator("#f-to")).toHaveValue(/.+/);
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("Moved 4 cards to Trade box");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator(".colitem", { hasText: "Trade box" })).toContainText("4 cards");
  await page.keyboard.press("Control+z");
  await expect(rows(page)).toHaveCount(4);
});

async function account(browser: Browser, prefix: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await context.newPage();
  const name = await signUp(page, prefix);
  return { page, name, context };
}

test("collections and decks can be sent to another account", async ({ page, browser }) => {
  const other = await account(browser, "friend");
  await signUp(page, "owner");
  await addFromSearch(page, ["Sol Ring"]);

  await menu(page, "Collection", "Send collection...");
  await page.locator("#f-to").selectOption({ label: other.name });
  await page.locator("#f-mode").selectOption("copy");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText(`Sent to ${other.name}. It is added when they accept it.`);

  await page.keyboard.press("Control+n");
  await expect(page.locator("#f-name")).toBeFocused();
  await page.keyboard.type("Shared deck");
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText("Deck: Shared deck");
  await menu(page, "Deck", "Send deck...");
  await page.locator("#f-to").selectOption({ label: other.name });
  await page.locator("#f-mode").selectOption("share");
  await page.locator(".dlgbtns .primary").click();

  await other.page.reload();
  await expect(other.page.locator("#acct .cbadge")).toHaveText("2");
  await other.page.locator("#acct").click();
  await other.page.locator("#dropdown .dd", { hasText: "Inbox (2)..." }).click();
  const offers = other.page.locator("dialog[open] .wsrow");
  await offers.filter({ hasText: "Main collection" }).getByRole("button", { name: "Accept..." }).click();
  await other.page.locator("#f-name").fill("Gift binder");
  await other.page.locator(".dlgbtns .primary").click();
  await expect(other.page.locator("#status #st-msg")).toHaveText("Main collection accepted");
  await expect(other.page.locator(".colitem", { hasText: "Gift binder" })).toContainText("1 cards");

  await other.page.locator("#acct").click();
  await other.page.locator("#dropdown .dd", { hasText: "Inbox (1)..." }).click();
  await other.page.locator("dialog[open] .wsrow", { hasText: "Shared deck" }).getByRole("button", { name: "Accept..." }).click();
  await other.page.locator(".dlgbtns .primary").click();
  await other.page.locator('.dtabs .tab[data-panel="decks"]').click();
  await expect(other.page.locator(".navitem", { hasText: "Shared deck" }).locator(".badge").first()).toHaveText("Shared");
  await other.page.locator(".navitem", { hasText: "Shared deck" }).click();
  await expect(other.page.locator("#view-deck, #docname").first()).toBeVisible();
  await expect(other.page.locator("#docname")).toHaveText("Deck: Shared deck");

  await menu(page, "Deck", "Rename deck...");
  await page.locator("#f-name").fill("Renamed deck");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("Deck renamed to Renamed deck");
  await menu(page, "Deck", "Delete deck...");
  await expect(page.locator("dialog[open]")).toContainText(`It is shared with ${other.name}, who will lose it too.`);
  await page.getByRole("button", { name: "Delete deck" }).click();
  await expect(status(page)).toHaveText("Renamed deck deleted");
  await other.page.reload();
  await other.page.locator('.dtabs .tab[data-panel="decks"]').click();
  await expect(other.page.locator(".navitem", { hasText: "deck" })).toHaveCount(0);
  await expect(other.page.locator("#docname")).toHaveText("No deck open");
  await other.context.close();
});
