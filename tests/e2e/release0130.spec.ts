// Browser tests for 0.13.0: one click picks where cards go and a double click opens, search sorting, no trade buttons
// outside Trade, zone buttons that show one zone, Add deck to collection and Ctrl+N left alone.
import type { Page } from "@playwright/test";
import { choose, menu, search, signUp, status, test, expect } from "./fixtures";

async function newDeck(page: Page, name: string) {
  await menu(page, "File", "New deck...");
  await expect(page.locator("#f-name")).toBeFocused();
  await page.keyboard.type(name);
  await choose(page, page.locator("#f-format"), "modern");
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

const names = (page: Page) => page.locator("#view-cards .row .rowtitle b");

test("one click picks where cards go without leaving card search; a double click opens", async ({ page }) => {
  await signUp(page, "v13pick");
  await newDeck(page, "Burn");
  await search(page, "Lightning Bolt");
  await page.locator('.tab[data-panel="decks"]').click();
  const decks = page.locator(".pbody", { has: page.getByRole("textbox", { name: "Find a deck" }) });
  // the search stays while the add target changes
  await page.locator('.tab[data-panel="collections"]').click();
  await page.locator(".navitem", { hasText: "Main collection" }).click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: MAIN COLLECTION");
  await page.locator('.tab[data-panel="decks"]').click();
  await decks.locator(".navitem", { hasText: "Burn" }).click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: DECK BURN");
  await expect(page.locator("#view-cards")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search cards" })).toHaveValue("Lightning Bolt");
  await expect(names(page).first()).toHaveText("Lightning Bolt");
  // a double click opens the deck
  await decks.locator(".navitem", { hasText: "Burn" }).dblclick();
  await expect(page.locator("#view-deck .switcher")).toContainText("Burn");

  // in the switcher one click marks the collection and keeps the list open; a double click opens it
  await page.keyboard.press("2");
  await page.locator("#view-collection .switcher").click();
  const row = page.locator(".swrow", { hasText: "Main collection" });
  await row.click();
  await expect(page.locator(".swpop")).toBeVisible();
  await expect(row.locator(".target-mark")).toHaveText("Adding here");
  await row.dblclick();
  await expect(page.locator(".swpop")).toHaveCount(0);

  // Ctrl+N no longer opens New deck
  await page.keyboard.press("1");
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("Control+n").catch(() => undefined);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("card search sorts by best match by default, keeps a sort per search, and has no trade buttons", async ({ page }) => {
  await signUp(page, "v13sort");
  await search(page, "angel");
  await expect(names(page)).toHaveText(["Serra Angel", "Atraxa, Praetors' Voice"]);
  await choose(page, page.locator("#view-cards").getByRole("button", { name: "Sort results" }), "name");
  await expect(names(page)).toHaveText(["Atraxa, Praetors' Voice", "Serra Angel"]);
  await search(page, "add");
  await choose(page, page.locator("#view-cards").getByRole("button", { name: "Sort results" }), "rarity");
  await expect(names(page).first()).toHaveText("Sol Ring");

  // the right-click menu and the Card panel have no trade buttons; T and G add nothing
  await names(page).first().click({ button: "right" });
  await expect(page.locator("#ctxmenu")).not.toContainText("Add to trade");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pbody .btnrow").getByRole("button", { name: "You get" })).toHaveCount(0);
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await page.keyboard.press("4");
  await expect(page.locator("#view-trade")).not.toContainText("Sol Ring");
  // each trade search has its own Sort
  await expect(page.locator("#view-trade").getByRole("button", { name: "Sort results" })).toHaveCount(2);
});

test("zone buttons show one zone and set where Add puts cards; Add deck to collection fills and links the deck", async ({ page }) => {
  await signUp(page, "v13zones");
  await newDeck(page, "Burn");
  await page.keyboard.press("3");
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await page.locator("#view-deck").getByRole("button", { name: "Edit as text..." }).click();
  await page.locator("dialog[open] textarea").fill("Deck\n2 Lightning Bolt (M10) 146\n\nSideboard\n1 Counterspell (LEA) 54\n");
  await page.locator("dialog[open]").getByRole("button", { name: "Check" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Apply" }).click();
  await expect(status(page)).toContainText("Burn updated");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();
  const zones = page.locator("#view-deck").getByRole("group", { name: "Zone" });
  await zones.getByRole("button", { name: "Sideboard" }).click();
  await expect(status(page)).toHaveText("Showing Sideboard. New deck cards go to the sideboard");
  await expect(page.locator("#view-deck .board")).toHaveCount(1);
  await expect(page.locator("#view-deck .board")).toHaveAttribute("aria-label", "Sideboard");
  await zones.getByRole("button", { name: "All" }).click();
  await expect(page.locator("#view-deck .board")).toHaveCount(2);
  await expect(page.locator("#view-deck .row .badge.miss").first()).toHaveText("Missing");

  // Add deck to collection: missing cards only, linked to the deck, one undo step
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await page.locator("#view-deck").getByRole("button", { name: "Add deck to collection..." }).click();
  await expect(page.locator("dialog[open] .dlghead")).toHaveText("Add Burn to a collection");
  await page.locator("dialog[open]").getByRole("button", { name: "Add cards" }).click();
  await expect(status(page)).toHaveText("3 cards added to Main collection, 3 linked to the deck");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();
  await expect(page.locator("#view-deck .row .badge.miss")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator("#view-deck .row .badge.miss").first()).toHaveText("Missing");
});
