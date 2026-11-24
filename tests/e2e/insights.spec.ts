// Browser tests for 0.3.0: prices, copy details, filter tags, binder, statistics, wishlists, deck ownership and trade.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { menu, search, signUp, status, test, expect, choose, takePrinting } from "./fixtures";

const rows = (page: Page) => page.locator("#view-collection .list .row");

test("wishlist additions choose a printing and finish and cancellation adds nothing", async ({ page }) => {
  await signUp(page, "wishprinting");
  await search(page, "Lightning Bolt set:lea");
  const result = page.locator("#view-cards .row", { hasText: "Lightning Bolt" }).first();
  await result.getByRole("button", { name: /Wishlist/ }).click();
  await expect(page.locator("dialog[open] .printpick")).toBeVisible();
  await page.locator("dialog[open]").getByRole("button", { name: "Cancel" }).click();
  let collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string; kind: string }>;
  expect(collections.some((item) => item.kind === "wishlist")).toBe(false);
  await result.getByRole("button", { name: /Wishlist/ }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Foil M10 146" }).click();
  await expect(status(page)).toHaveText("1 card added to Wishlist");
  collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string; kind: string }>;
  const wishlist = collections.find((item) => item.kind === "wishlist")!;
  const cards = await (await page.request.get(`/api/collections/${wishlist.id}/cards`)).json() as Array<{ id: string; foil: number; quantity: number }>;
  expect(cards).toEqual([expect.objectContaining({ id: "bolt-m10", foil: 1, quantity: 1 })]);
});

async function add(page: Page, names: string[]) {
  await page.keyboard.press("1");
  for (const name of names) {
    await page.locator("#view-cards .row", { hasText: name }).first().click();
    await page.keyboard.press("Enter");
    await takePrinting(page);
    await expect(status(page)).toContainText(`${name} added to`);
  }
}

async function openCollection(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  await expect(page.locator("#view-collection")).toBeVisible();
}

test("prices show in search and the Card panel, in US dollars only (0.17.0)", async ({ page }) => {
  await signUp(page);
  await search(page, "Shivan the Mighty");
  await expect(page.locator("#view-cards .row")).toHaveCount(1);
  await expect(page.locator("#view-cards .row").first()).toContainText("Also printed as Shivan the Mighty");
  await expect(page.locator("#view-cards .row .price").first()).toHaveText("$900.00");
  await page.locator("#view-cards .row").first().locator(".rowtitle b").click();
  await expect(page.locator(".pgrp", { hasText: "Prices" })).toContainText("$900.00");
  // the currency choice is gone: no PRICES toggle in the status bar and no euro prices
  await expect(page.locator("#st-toggles")).not.toContainText("PRICES");
  await expect(page.locator(".pgrp", { hasText: "Prices" })).not.toContainText("800,00");
  await search(page, "usd<20");
  await expect(page.locator("#view-cards .row .rowtitle b")).toHaveText(["Atraxa, Praetors' Voice", "Lightning Bolt"]);
});

test("copy details change finish, condition, language and trade, sort by price, and undo", async ({ page }) => {
  await signUp(page);
  await add(page, ["Shivan Dragon", "Llanowar Elves", "Sol Ring"]);
  await openCollection(page);
  await page.getByRole("button", { name: /Options/ }).click();
  await choose(page, page.locator("#opt-sort"), "price-desc");
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await expect(rows(page).locator(".rowtitle b")).toHaveText(["Shivan Dragon", "Llanowar Elves", "Sol Ring"]);
  await expect(rows(page).nth(2).locator(".price")).toHaveText("No price");

  await rows(page).nth(1).locator(".rowtitle").click();
  await page.keyboard.press("e");
  await expect(page.locator("dialog[open]")).toContainText("Copy details: Llanowar Elves");
  await choose(page, page.locator("#f-foil"), "2");
  await choose(page, page.locator("#f-condition"), "LP");
  await choose(page, page.locator("#f-language"), "ja");
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
  await expect(page.locator(".binderpager .pagebox")).toHaveValue("1");
  await expect(page.locator(".binderpager")).toContainText("of 1");
  await page.keyboard.press("b");
  await expect(status(page)).toHaveText("Grid layout");
  await expect(page.locator(".cardgrid .pocket")).toHaveCount(4);
});

test("deck cards are linked to collection copies, and missing cards go to a wishlist", async ({ page }) => {
  await signUp(page);
  await add(page, ["Counterspell"]);
  await menu(page, "File", "New deck...");
  await page.keyboard.type("Blue deck");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("Blue deck created");
  await search(page, "Counterspell");
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("Shift+Enter");
  await takePrinting(page);
  await expect(status(page)).toContainText("Counterspell added to Blue deck");
  await page.keyboard.press("Shift+Enter");
  await takePrinting(page);
  await search(page, "Serra Angel");
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("Shift+Enter");
  await takePrinting(page);
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

test("a saved trade: give trade cards, get from search, change a price, complete and undo", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUp(page);
  await add(page, ["Shivan Dragon", "Dark Ritual"]);
  await openCollection(page);
  await rows(page).filter({ hasText: "Shivan Dragon" }).first().dispatchEvent("contextmenu");
  await page.locator("#ctxmenu .dd", { hasText: "Mark for trade" }).click();
  await expect(status(page)).toHaveText("Shivan Dragon marked for trade");
  await page.keyboard.press("4");
  await expect(page.locator("#view-trade .empty.compact")).toContainText("No trades yet");
  const give = page.locator('.tradecol[aria-label="You give"]');
  const get = page.locator('.tradecol[aria-label="You get"]');
  await expect(give.locator(".tsearch .row")).toHaveCount(1);
  await give.locator(".tsearch .row").getByRole("button", { name: "+ Give (1 for trade)" }).click();
  await expect(status(page)).toHaveText("Shivan Dragon added to what you give");
  await expect(page.locator("#trade-pick")).toContainText("Trade");
  await get.getByRole("textbox", { name: "Search cards you get" }).fill("Serra Angel");
  await get.locator(".tsearch .row", { hasText: "Serra Angel" }).first().getByRole("button", { name: "+ Get" }).click();
  await expect(status(page)).toHaveText("Serra Angel added to what you get");
  await expect(page.locator(".tradebalance")).toContainText("$820.00 in their favor");
  await get.getByRole("textbox", { name: "Price each of Serra Angel" }).fill("20");
  await get.getByRole("textbox", { name: "Price each of Serra Angel" }).press("Enter");
  await expect(get.locator(".badge.edited")).toBeVisible();

  await page.getByRole("button", { name: "Copy list" }).click();
  await expect(status(page)).toHaveText("Trade list copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Difference:");

  await page.getByRole("button", { name: "Complete trade..." }).click();
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toContainText("completed");
  await expect(page.locator("#view-trade .badge.status-done")).toHaveText("Done");
  await page.keyboard.press("2");
  await expect(rows(page).filter({ hasText: "Serra Angel" })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: "Shivan Dragon" })).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(status(page)).toContainText("Undone: Complete");
  await expect(rows(page).filter({ hasText: "Shivan Dragon" })).toHaveCount(1);
  await page.keyboard.press("4");
  await expect(page.locator("#view-trade .badge.status-open")).toHaveText("Open");
});

test("the Moxfield export keeps condition, language, finish and trade counts", async ({ page }) => {
  await signUp(page);
  await add(page, ["Atraxa, Praetors' Voice"]);
  await openCollection(page);
  await rows(page).first().locator(".rowtitle").click();
  await page.keyboard.press("e");
  await choose(page, page.locator("#f-foil"), "1");
  await choose(page, page.locator("#f-condition"), "MP");
  await choose(page, page.locator("#f-language"), "de");
  await page.fill("#f-trade", "1");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("Atraxa, Praetors' Voice changed");
  await menu(page, "File", "Export...");
  await choose(page, page.locator("#ex-format"), "moxfield");
  const download = page.waitForEvent("download");
  await page.locator("dialog[open]").getByRole("button", { name: "Export", exact: true }).click();
  const text = readFileSync(await (await download).path()!, "utf8");
  expect(text.split("\r\n")[1]).toBe(`"1","1","Atraxa, Praetors' Voice","c16","Moderately Played","German","foil","","","28","False","False",""`);
});
