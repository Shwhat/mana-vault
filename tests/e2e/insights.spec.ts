// Browser tests for 0.3.0: prices, copy details, filter tags, binder, statistics, wishlists, deck ownership and trade.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { menu, search, signUp, status, test, expect } from "./fixtures";

const rows = (page: Page) => page.locator("#view-collection .list .row");

async function add(page: Page, names: string[]) {
  await page.keyboard.press("1");
  for (const name of names) {
    await page.locator("#view-cards .row", { hasText: name }).first().click();
    await page.keyboard.press("Enter");
    await expect(status(page)).toContainText(`${name} added to`);
  }
}

async function openCollection(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  await expect(page.locator("#view-collection")).toBeVisible();
}

test("prices show in search, the Card panel and the collection, in either currency", async ({ page }) => {
  await signUp(page);
  await search(page, "Shivan the Mighty");
  await expect(page.locator("#view-cards .row")).toHaveCount(1);
  await expect(page.locator("#view-cards .row").first()).toContainText("Also printed as Shivan the Mighty");
  await expect(page.locator("#view-cards .row .price").first()).toHaveText("$900.00");
  await page.locator("#view-cards .row").first().click();
  await expect(page.locator(".pgrp", { hasText: "Prices" })).toContainText("$900.00");
  await page.locator("#st-toggles", { hasText: "PRICES: USD" }).getByText("PRICES: USD").click();
  await expect(status(page)).toHaveText("Prices in euros");
  await expect(page.locator(".pgrp", { hasText: "Prices" })).toContainText("800,00");
  await search(page, "usd<20");
  await expect(page.locator("#view-cards .row .rowtitle b")).toHaveText(["Atraxa, Praetors' Voice", "Lightning Bolt"]);
});

test("copy details change finish, condition, language and trade, sort by price, and undo", async ({ page }) => {
  await signUp(page);
  await add(page, ["Shivan Dragon", "Llanowar Elves", "Sol Ring"]);
  await openCollection(page);
  await page.locator("#view-collection .filterbar select").first().selectOption("price-desc");
  await expect(rows(page).locator(".rowtitle b")).toHaveText(["Shivan Dragon", "Llanowar Elves", "Sol Ring"]);
  await expect(rows(page).nth(2).locator(".price")).toHaveText("No price");

  await rows(page).nth(1).locator(".rowtitle").click();
  await page.keyboard.press("e");
  await expect(page.locator("dialog[open]")).toContainText("Copy details: Llanowar Elves");
  await page.locator("#f-foil").selectOption("2");
  await page.locator("#f-condition").selectOption("LP");
  await page.locator("#f-language").selectOption("ja");
  await page.fill("#f-trade", "1");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("Llanowar Elves changed");
  const elves = rows(page).filter({ hasText: "Llanowar Elves" });
  await expect(elves).toContainText("ETCHED");
  await expect(elves).toContainText("FOR TRADE 1");
  await expect(elves).toContainText("Etched, Lightly played, Japanese");
  await page.keyboard.press("Control+z");
  await expect(status(page)).toHaveText("Undone: Change Llanowar Elves");
  await expect(rows(page).filter({ hasText: "Llanowar Elves" })).not.toContainText("ETCHED");
});

test("tags and statistics bars filter the collection, and the binder shows pages", async ({ page }) => {
  await signUp(page);
  await add(page, ["Shivan Dragon", "Llanowar Elves", "Counterspell", "Dark Ritual"]);
  await openCollection(page);
  await rows(page).filter({ hasText: "Counterspell" }).getByRole("button", { name: "Uncommon" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator(".filterbar .chip")).toHaveText(/Rarity: Uncommon/);
  await page.getByRole("button", { name: "Remove filter Rarity: Uncommon" }).click();
  await expect(rows(page)).toHaveCount(4);

  await page.locator(".colhead .seg button", { hasText: "Statistics" }).click();
  await expect(page.locator(".tilerow")).toContainText("$1,150.00");
  await expect(page.locator(".chartcard", { hasText: "Mana curve" })).toBeVisible();
  await page.locator(".chartcard", { hasText: "Color" }).locator(".barrow", { hasText: "Red" }).click();
  await expect(page.getByRole("tab", { name: "Cards" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".filterbar .chip")).toHaveText(/Color: Red/);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Remove filter Color: Red" }).click();

  await page.keyboard.press("b");
  await expect(status(page)).toHaveText("Binder layout");
  await expect(page.locator(".pocket:not(.emptypocket)")).toHaveCount(4);
  await expect(page.locator(".binderpager")).toContainText("Page 1 of 1");
  await page.keyboard.press("b");
  await expect(rows(page)).toHaveCount(4);
});

test("deck cards are linked to collection copies, and missing cards go to a wishlist", async ({ page }) => {
  await signUp(page);
  await add(page, ["Counterspell"]);
  await menu(page, "Decks", "New deck...");
  await page.keyboard.type("Blue deck");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("Blue deck created");
  await search(page, "Counterspell");
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Shift+Enter");
  await search(page, "Serra Angel");
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("Shift+Enter");
  await expect(status(page)).toHaveText("Serra Angel added to Blue deck");

  await page.keyboard.press("3");
  await page.locator("#view-deck .seg button", { hasText: "Ownership" }).click();
  await expect(page.locator(".stattile")).toContainText("1 of 3 owned, 2 missing, $230.00 to buy");
  await expect(page.locator(".orow", { hasText: "Counterspell" })).toContainText("Main collection (1)");
  await page.getByRole("button", { name: "Add missing to wishlist" }).click();
  await expect(status(page)).toHaveText("2 cards added to Wishlist");
  await expect(page.locator(".colitem", { hasText: "Wishlist" })).toContainText("2 cards");
  // wishlist copies do not count as owned
  await expect(page.locator(".stattile")).toContainText("1 of 3 owned");
  await page.keyboard.press("Control+z");
  await expect(status(page)).toHaveText("Undone: Add missing cards of Blue deck to Wishlist");
  await expect(page.locator(".colitem", { hasText: "Wishlist" })).toContainText("0 cards");

  await page.locator("#view-deck .seg button", { hasText: "Statistics" }).click();
  await expect(page.locator(".tilerow")).toContainText("$380.00");
});

test("the trade list and calculator compare both sides", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUp(page);
  await add(page, ["Shivan Dragon", "Dark Ritual"]);
  await openCollection(page);
  await rows(page).filter({ hasText: "Shivan Dragon" }).locator(".rowtitle").click();
  await menu(page, "Collection", "Mark for trade");
  await expect(status(page)).toHaveText("Shivan Dragon marked for trade");
  await page.keyboard.press("4");
  await expect(page.locator(".tradelist .row")).toHaveCount(1);
  await page.locator(".tradelist .row").getByRole("button", { name: "Give" }).click();
  await search(page, "Serra Angel");
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("g");
  await expect(status(page)).toHaveText("Serra Angel added to what you get");
  await page.keyboard.press("4");
  await expect(page.locator(".tradecalc .stattile")).toContainText("$820.00");
  await expect(page.locator(".tradecalc .stattile")).toContainText("In their favor");
  await page.getByRole("button", { name: "Copy trade summary" }).click();
  await expect(status(page)).toHaveText("Trade summary copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Difference: $820.00 in their favor");
  await page.getByRole("button", { name: "Clear trade..." }).click();
  await page.locator(".dlgbtns .primary").click();
  await expect(page.locator(".tradecalc .stattile")).toContainText("Add cards to both sides");
});

test("the Moxfield export keeps condition, language, finish and trade counts", async ({ page }) => {
  await signUp(page);
  await add(page, ["Atraxa, Praetors' Voice"]);
  await openCollection(page);
  await rows(page).first().locator(".rowtitle").click();
  await page.keyboard.press("e");
  await page.locator("#f-foil").selectOption("1");
  await page.locator("#f-condition").selectOption("MP");
  await page.locator("#f-language").selectOption("de");
  await page.fill("#f-trade", "1");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("Atraxa, Praetors' Voice changed");
  await menu(page, "Home", "Export...");
  await page.locator("#ex-format").selectOption("moxfield");
  const download = page.waitForEvent("download");
  await page.locator("dialog[open]").getByRole("button", { name: "Export", exact: true }).click();
  const text = readFileSync(await (await download).path()!, "utf8");
  expect(text.split("\r\n")[1]).toBe(`"1","1","Atraxa, Praetors' Voice","c16","Moderately Played","German","foil","","","28","False","False",""`);
});
