// Browser tests for 0.11.0: exact links from Edit as text, finish badges in every deck view, Remove how many and
// Reduce to 1, Upgrade wanted, decks that keep their version, Other version owned, Add buttons with finishes and the add target.
import type { Page } from "@playwright/test";
import { choose, search, signUp, status, test, expect, takePrinting } from "./fixtures";

async function newDeck(page: Page, name: string, format = "modern") {
  await page.keyboard.press("Control+n");
  await page.keyboard.type(name);
  await choose(page, page.locator("#f-format"), format);
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText(`Deck: ${name}`);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("3");
}

/** Adds the M10 Lightning Bolt to where cards go, choosing its finish in the printing chooser. */
async function addM10Bolt(page: Page, foil: boolean) {
  await search(page, "Lightning Bolt set:m10");
  await page.locator("#view-cards .row", { hasText: "Lightning Bolt" }).first().getByRole("button", { name: /^Add Lightning Bolt to / }).click();
  if (foil) {
    await page.locator("dialog[open]").getByRole("button", { name: "Foil M10 146" }).click();
    await expect(page.locator("dialog#dlg[open]")).toHaveCount(0);
  } else await takePrinting(page);
}

async function rightClick(page: Page, target: ReturnType<Page["locator"]>, item: string) {
  await target.click({ button: "right" });
  await page.locator("#ctxmenu .dd", { hasText: item }).first().click();
}

async function deckOptions(page: Page, step: () => Promise<void>) {
  await page.locator("#view-deck").getByRole("button", { name: /^Options/ }).click();
  await step();
  await page.getByRole("dialog", { name: "Deck options" }).getByRole("button", { name: "Done" }).click();
}

test("Add buttons name the destination, add foil from search, and the status bar switches the add target", async ({ page }) => {
  await signUp(page, "v11add");
  await search(page, "Lightning Bolt set:m10");
  // one button names where the card goes; no split or foil buttons
  const result = page.locator("#view-cards .row", { hasText: "Lightning Bolt" }).first();
  await expect(result.getByRole("button", { name: /^Add Lightning Bolt to / })).toHaveCount(1);
  await expect(result.getByRole("button", { name: /as foil/ })).toHaveCount(0);
  await addM10Bolt(page, true);
  await expect(status(page)).toHaveText("Lightning Bolt (foil) added to Main collection");
  await expect(page.locator(".navitem", { hasText: "Main collection" }).locator(".target-mark")).toHaveText("Adding here");

  await newDeck(page, "Burn");
  const decks = page.locator(".pbody", { has: page.getByRole("textbox", { name: "Find a deck" }) });
  await page.locator('.tab[data-panel="decks"]').click();
  // only one mark, on where cards go
  await expect(decks.locator(".navitem", { hasText: "Burn" }).locator(".target-mark")).toHaveCount(0);
  await decks.locator(".navitem", { hasText: "Burn" }).click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: DECK BURN");
  await expect(page.locator(".navitem", { hasText: "Main collection" }).locator(".target-mark")).toHaveCount(0);
  await expect(decks.locator(".navitem", { hasText: "Burn" }).locator(".target-mark")).toHaveText("Adding here");
  await page.locator("#st-target").click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: MAIN COLLECTION");
  await expect(status(page)).toHaveText("Adding to Main collection");
});

test("Edit as text links exact printings, finish badges show in every view, and Remove asks how many", async ({ page }) => {
  await signUp(page, "v11text");
  for (let index = 0; index < 2; index += 1) {
    await addM10Bolt(page, true);
    await expect(status(page)).toHaveText("Lightning Bolt (foil) added to Main collection");
  }
  await newDeck(page, "Burn");
  await page.locator("#view-deck").getByRole("button", { name: /^Options/ }).click();
  await page.getByRole("button", { name: "Edit as text..." }).click();
  await page.locator("dialog[open] textarea").fill("Deck\n3 Lightning Bolt (M10) 146 *F*\n1 Counterspell");
  await page.locator("dialog[open]").getByRole("button", { name: "Check" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Apply" }).click();
  await expect(status(page)).toHaveText("Burn updated: 2 added, 0 changed, 0 removed, 2 linked to owned copies");
  const bolt = page.locator("#view-deck .row", { hasText: "Lightning Bolt" }).first();
  await expect(bolt.locator(".badge.foil")).toHaveText("FOIL");
  await expect(bolt.locator(".badge.miss")).toHaveText("Missing 1");
  // both foil copies are linked, so nothing more is owned
  await expect(bolt.locator(".badge.owned")).toHaveCount(0);
  // a line without a set stays missing although nothing is owned of it
  await expect(page.locator("#view-deck .row", { hasText: "Counterspell" }).locator(".badge.miss")).toHaveText("Missing");

  for (const [view, selector] of [["Text", ".tline"], ["Stacks", ".stack .dcard"]] as const) {
    await deckOptions(page, () => page.getByRole("group", { name: "Show cards as" }).getByRole("button", { name: view }).click());
    await expect(page.locator(`#view-deck ${selector}`, { hasText: view === "Text" ? "Lightning Bolt" : "" }).locator(".badge.foil").first()).toHaveText("FOIL");
  }
  // Grid: one picture per printing with a line per finish and a Total line
  await deckOptions(page, () => page.getByRole("group", { name: "Show cards as" }).getByRole("button", { name: "Grid" }).click());
  const lines = page.getByRole("group", { name: "Lightning Bolt (M10) 146" }).locator(".sline");
  await expect(lines.first()).toContainText("Foil");
  await expect(lines.first()).toContainText("Missing 1");
  await expect(lines.last()).toContainText("Total3");
  await deckOptions(page, () => page.getByRole("group", { name: "Show cards as" }).getByRole("button", { name: "List" }).click());

  // Remove on three copies asks how many; Reduce to 1 keeps one
  await bolt.getByRole("button", { name: "Remove Lightning Bolt from deck" }).click();
  await expect(page.locator("dialog[open]")).toContainText("There are 3 copies.");
  await page.locator("dialog[open]").getByRole("button", { name: "Reduce to 1" }).click();
  await expect(bolt.locator(".qn")).toHaveText("1");
  await page.keyboard.press("Control+z");
  await expect(bolt.locator(".qn")).toHaveText("3");
  // undo brings the linked copies back too
  await expect(bolt.locator(".badge.miss")).toHaveText("Missing 1");
});

test("Upgrade wanted, part of a stack changing finish, and a deck that keeps its version", async ({ page }) => {
  await signUp(page, "v11upgrade");
  await addM10Bolt(page, false);
  await expect(status(page)).toHaveText("Lightning Bolt added to Main collection");
  await newDeck(page, "Burn");
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await page.locator("#quickadd").fill("2 Lightning Bolt (M10) 146");
  await page.locator("#quickadd").press("Enter");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();
  const bolt = page.locator("#view-deck .row", { hasText: "Lightning Bolt" });
  await expect(bolt.first().locator(".badge.miss")).toHaveText("Missing 1");

  // one of the two cards becomes foil; the other stays
  await rightClick(page, bolt.first(), "Change printing...");
  await page.getByRole("spinbutton", { name: "How many to change" }).fill("1");
  await page.getByRole("button", { name: "Foil M10 146" }).click();
  await expect(status(page)).toHaveText("1 of 2 Lightning Bolt changed to (M10) 146 foil, 1 missing");
  await expect(bolt).toHaveCount(2);

  // the regular card is marked Upgrade wanted with the Alpha printing
  const regular = bolt.filter({ hasNot: page.locator(".badge.foil") });
  await rightClick(page, regular, "Mark as upgrade wanted...");
  await page.locator(".printrow", { hasText: "Limited Edition Alpha" }).click();
  await expect(status(page)).toHaveText("Lightning Bolt marked Upgrade wanted: (LEA) 161");
  await expect(regular.locator(".badge.upgrade")).toHaveText("Upgrade wanted");
  await page.getByRole("tab", { name: "Ownership" }).click();
  await expect(page.getByRole("table", { name: "Upgrade wanted" })).toContainText("(LEA) 161");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();

  // the collection copy linked to the deck changes printing; the deck keeps its version and offers the other one
  await page.locator(".navitem", { hasText: "Main collection" }).first().click();
  await page.keyboard.press("2");
  const copy = page.locator("#view-collection .row", { hasText: "Lightning Bolt" }).first();
  await rightClick(page, copy, "Change printing...");
  await page.locator(".printrow", { hasText: "Limited Edition Alpha" }).click();
  await expect(page.locator("dialog[open]")).toContainText("A copy that changes is in Burn. Change the deck too?");
  await page.locator("dialog[open]").getByRole("button", { name: "No, show it as missing" }).click();
  await expect(status(page)).toHaveText("Lightning Bolt is now (LEA) 161, decks kept their version");
  await page.locator('.tab[data-panel="decks"]').click();
  await page.locator(".navitem", { hasText: "Burn" }).first().click();
  const kept = page.locator("#view-deck .row", { hasText: "Lightning Bolt" }).filter({ hasNot: page.locator(".badge.foil") });
  await expect(kept.locator(".badge.miss")).toHaveText("Missing");
  await kept.getByRole("button", { name: "Other version owned" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Switch Lightning Bolt to (LEA) 161" }).click();
  await expect(status(page)).toHaveText("Lightning Bolt is now (LEA) 161, linked from Main collection");
  // the wanted version is linked, so the mark goes
  const switched = page.locator("#view-deck .row", { hasText: "LEA" });
  await expect(switched.locator(".badge.miss")).toHaveCount(0);
  await expect(switched.locator(".badge.upgrade")).toHaveCount(0);
});
