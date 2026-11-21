// Browser tests for 0.8.0: search views, filters that follow the open view, All collections and the deck's Add tab.
import { choose, menu, search, signUp, status, switchTo, test, expect, takePrinting } from "./fixtures";

test("search shows pictures with owned counts, and the Filters panel filters the open view", async ({ page }) => {
  await signUp(page, "v8");
  await search(page, "Sol Ring");
  await page.locator("#view-cards .row", { hasText: "Sol Ring" }).first().dblclick();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Sol Ring added to Main collection");
  await expect(page.locator("#view-cards .row", { hasText: "Sol Ring" }).first().locator(".badge.own")).toHaveText("OWNED 1");

  await page.locator("#view-cards").getByRole("button", { name: /^Options/ }).click();
  await page.locator(".optpop").getByRole("button", { name: "Grid" }).click();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  // the owned count by finish is a pip on the picture, with no price
  const sol = page.locator("#view-cards .rescard", { has: page.locator('.pocket[title^="Sol Ring,"]') }).first();
  await expect(sol.locator(".pocket .dmarks")).toHaveText("OWNED 1");
  await expect(sol.locator(".pocketprice")).toHaveCount(0);
  await expect(sol.locator(".pocketqty")).toHaveCount(0);
  await expect(page.locator("#view-cards .phpos")).toHaveText(/^\d+ results?/);

  await search(page, "Counterspell");
  await page.locator('#view-cards .pocket[title^="Counterspell,"]').first().dblclick();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Counterspell added to Main collection");

  // the Filters panel acts on the collection while it is open, and keeps its own filters
  await search(page, "");
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  await expect(page.locator(".fltscope")).toHaveText("Filtering: Collection");
  await page.locator("#flt-type").fill("Instant");
  await expect(page.locator("#view-collection .row")).toHaveCount(1);
  await expect(page.locator("#view-collection .row")).toContainText("Counterspell");
  await expect(page.locator(".colhead .phpos")).toContainText("showing 1 of 2");

  // the filter stays when another collection opens, and All collections lists every row with its collection
  await menu(page, "File", "New collection...");
  await page.locator("#f-name").fill("Binder");
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("2");
  await switchTo(page, "collection", "Binder");
  await expect(page.locator("#flt-type")).toHaveValue("Instant");
  await switchTo(page, "collection", "All collections");
  await expect(page.locator("#view-collection .row")).toHaveCount(1);
  await page.locator(".pbody .btn", { hasText: "Clear filters" }).click();
  await expect(page.locator("#view-collection .row")).toHaveCount(2);
  await expect(page.locator("#view-collection .row").first().locator(".badge.where")).toHaveText("Main collection");

  // card search kept its own, empty filters
  await page.keyboard.press("1");
  await expect(page.locator(".fltscope")).toHaveText("Filtering: Card search");
  await expect(page.locator("#flt-type")).toHaveValue("");
});

test("the deck's Add tab searches cards and adds them to a zone, counting what is already in the deck", async ({ page }) => {
  await signUp(page, "v8deck");
  await menu(page, "File", "New deck...");
  await page.keyboard.type("Elves");
  await choose(page, page.locator("#f-format"), "casual");
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText("Deck: Elves");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("3");
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await expect(page.locator(".fltscope")).toHaveText("Filtering: Deck card search");
  await page.getByRole("textbox", { name: "Search cards to add" }).fill("Llanowar Elves");
  const result = page.locator("#view-deck .row", { hasText: "Llanowar Elves" }).first();
  await result.getByRole("button", { name: "Add Llanowar Elves to Main deck" }).click();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Llanowar Elves added to Elves");
  await expect(result.getByRole("button", { name: "Add Llanowar Elves to Main deck" }).locator(".cbadge")).toHaveText("1");
  await result.getByRole("button", { name: "Add Llanowar Elves to Sideboard" }).click();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Llanowar Elves added to Elves (sideboard)");

  await page.getByRole("tab", { name: "Cards", exact: true }).click();
  await expect(page.locator("#view-deck .boardhead")).toHaveText(["Main deck 1", "Sideboard 1"]);
  await page.getByRole("textbox", { name: "Filter deck cards" }).fill("sol");
  await expect(page.locator("#view-deck .emptynote")).toHaveText("No deck cards match the filters");
});
