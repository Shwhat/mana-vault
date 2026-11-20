// Browser tests for 0.7.0: the deck builder, the switcher, card views and the layout fixes.
import type { Page } from "@playwright/test";
import { menu, signUp, status, switchTo, test, expect, choose, takePrinting } from "./fixtures";

async function newDeck(page: Page, name: string, format = "commander") {
  await menu(page, "Decks", "New deck...");
  await page.keyboard.type(name);
  await choose(page, page.locator("#f-format"), format);
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText(`Deck: ${name}`);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("3");
}

/** Quick add on the deck's Add tab, then back to the Cards tab. */
async function quickAdd(page: Page, text: string, zone = "main", found = true) {
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await choose(page, page.locator("#quickzone"), zone);
  await page.locator("#quickadd").fill(text);
  await page.locator("#quickadd").press("Enter");
  // the box empties once the card is added
  if (found) await expect(page.locator("#quickadd")).toHaveValue("");
  else await expect(status(page)).toContainText("No card named");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();
}

/** Opens the deck's Options, runs the step, and closes it with Done. */
async function deckOptions(page: Page, step: () => Promise<void>) {
  await page.locator("#view-deck").getByRole("button", { name: /^Options/ }).click();
  await step();
  await page.getByRole("dialog", { name: "Deck options" }).getByRole("button", { name: "Done" }).click();
}

test("the deck builder adds by typing, checks the format, groups, shows four views and edits as text", async ({ page }) => {
  await signUp(page);
  await newDeck(page, "Atraxa");
  await quickAdd(page, "Atraxa, Praetors' Voice", "commander");
  await expect(status(page)).toHaveText("Atraxa, Praetors' Voice added to Atraxa (commander)");
  await quickAdd(page, "2 llanowar elves");
  await expect(status(page)).toHaveText("2 Llanowar Elves added to Atraxa");
  await quickAdd(page, "1 Lightning Bolt (M10) 146");
  await quickAdd(page, "Serra Angel", "maybeboard");
  await quickAdd(page, "Black Lotus", "main", false);
  await expect(status(page)).toHaveText("No card named Black Lotus in the card database");
  await expect(page.locator("#view-deck .boardhead")).toHaveText(["Commander 1", "Main deck 3", "Maybeboard 1"]);
  await expect(page.locator("#view-deck .phpos")).toContainText("4 cards");

  // two Llanowar Elves and a red card in a four-color commander deck
  await page.locator(".legalbar .lnk").first().click();
  await expect(page.locator(".legalbar")).toContainText("Not legal in Commander: 3 problems");
  await expect(page.locator(".legalbar li")).toContainText([
    "Commander decks have exactly 100 cards with the commander; this deck has 4",
    "Llanowar Elves: 2 copies, the limit is 1",
    "Lightning Bolt is outside the commander's colors (Red)",
  ]);
  await expect(page.locator("#view-deck .row", { hasText: "Llanowar Elves" }).locator(".badge.illegal")).toBeVisible();

  await expect(page.locator("#view-deck .grouphead")).toContainText(["Creatures", "Instants", "Creatures"]);
  await deckOptions(page, () => choose(page, page.locator("#deck-group"), "mana"));
  await expect(page.locator("#view-deck .grouphead").first()).toHaveText("Mana value 1 3");
  for (const [view, selector] of [["Text", ".tline"], ["Stacks", ".stack .dcard"], ["Grid", ".dgrid .dcard"]] as const) {
    await deckOptions(page, () => page.getByRole("group", { name: "Show cards as" }).getByRole("button", { name: view }).click());
    await expect(page.locator(`#view-deck ${selector}`)).toHaveCount(4);
  }
  await deckOptions(page, () => page.getByRole("group", { name: "Show cards as" }).getByRole("button", { name: "List" }).click());

  await page.locator("#view-deck").getByRole("button", { name: /^Options/ }).click();
  await page.getByRole("button", { name: "Edit as text..." }).click();
  const text = page.locator("dialog[open] textarea");
  await expect(text).toHaveValue(/^Commander\n1 Atraxa, Praetors' Voice \(C16\) 28\n\nDeck\n1 Lightning Bolt \(M10\) 146\n2 Llanowar Elves \(LEA\) 210/);
  await text.fill("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Llanowar Elves\n1 Sol Ring\n\nSideboard\n1 Counterspell");
  await page.locator("dialog[open]").getByRole("button", { name: "Check" }).click();
  await expect(page.locator(".editreport")).toContainText("2 added, 1 changed, 2 removed");
  await page.locator("dialog[open]").getByRole("button", { name: "Apply" }).click();
  await expect(status(page)).toHaveText("Atraxa updated: 2 added, 1 changed, 2 removed");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#view-deck .boardhead")).toHaveText(["Commander 1", "Main deck 2", "Sideboard 1"]);
  await page.keyboard.press("Control+z");
  await expect(page.locator("#view-deck .boardhead")).toHaveText(["Commander 1", "Main deck 3", "Maybeboard 1"]);
});

test("tags, description, cover card, history and playtest", async ({ page }) => {
  await signUp(page);
  await newDeck(page, "Elves", "casual");
  await quickAdd(page, "8 Llanowar Elves");
  await quickAdd(page, "Sol Ring");
  await page.locator("#view-deck .row", { hasText: "Sol Ring" }).click({ button: "right" });
  await page.locator("#ctxmenu .dd", { hasText: "Tags..." }).click();
  await page.locator("#f-tags").fill("Ramp, Artifacts");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Sol Ring tagged Ramp, Artifacts");
  await deckOptions(page, () => choose(page, page.locator("#deck-group"), "tag"));
  await expect(page.locator("#view-deck .grouphead")).toHaveText(["Artifacts 1", "Ramp 1", "No tag 8"]);

  await page.getByRole("tab", { name: "Description" }).click();
  await page.getByRole("button", { name: "Edit description" }).click();
  await page.getByLabel("Deck description").fill("# Plan\nPlay **elves**. [Bad](javascript:alert(1))");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(status(page)).toHaveText("Description saved");
  await expect(page.locator(".abpage.desc h1")).toHaveText("Plan");
  await expect(page.locator(".abpage.desc b")).toHaveText("elves");
  await expect(page.locator(".abpage.desc a")).toHaveCount(0);
  await choose(page, page.locator("#deck-cover"), { label: "Sol Ring" });
  await expect(status(page)).toHaveText("Cover card changed");

  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.locator(".histrow").first()).toContainText("Cover card set to Sol Ring");
  await expect(page.locator(".histrow")).toContainText(["Description changed", "Sol Ring tagged Ramp, Artifacts", "+1 Sol Ring (main deck)", "+8 Llanowar Elves (main deck)", "Deck created"]);

  await page.getByRole("tab", { name: "Playtest" }).click();
  await expect(page.locator(".ptbar .phpos")).toHaveText("Turn 1, 2 in library");
  await expect(page.locator(".playtest section", { hasText: "Hand" }).locator(".ptcard")).toHaveCount(7);
  await page.getByRole("button", { name: "Draw" }).click();
  await expect(page.locator(".ptbar .phpos")).toHaveText("Turn 1, 1 in library");
  await page.locator(".playtest section", { hasText: "Hand" }).locator(".ptcard").first().click();
  await expect(page.locator(".playtest section", { hasText: "Battlefield" }).locator(".ptcard")).toHaveCount(1);
  await page.getByRole("button", { name: "Mulligan" }).click();
  await expect(page.locator(".ptbar .phpos")).toHaveText("Turn 1, 2 in library, 1 mulligan");
  await page.locator(".playtest section", { hasText: "Hand" }).locator(".ptcard").first().click();
  await expect(page.locator(".playtest section", { hasText: "Hand" }).locator(".ptcard")).toHaveCount(6);
  await expect(page.locator(".ptbar .phpos")).toHaveText("Turn 1, 3 in library, 1 mulligan");
});

test("the switcher opens collections and decks by search and keyboard, and one click in a panel opens", async ({ page }) => {
  await signUp(page);
  await newDeck(page, "Burn", "modern");
  await newDeck(page, "Elves", "casual");
  await switchTo(page, "deck", "Burn");
  await expect(page.locator("#view-deck .switcher")).toContainText("Burn");
  await page.locator("#view-deck .switcher").click();
  await expect(page.locator(".swrow")).toHaveCount(2);
  // the most recently opened deck comes first
  await expect(page.locator(".swrow .swtitle b")).toHaveText(["Burn", "Elves"]);
  await choose(page, page.locator(".swhead .picker"), "name");
  await expect(page.locator(".swrow .swtitle b")).toHaveText(["Burn", "Elves"]);
  await page.keyboard.type("elv");
  await expect(page.locator(".swrow")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText("Deck: Elves");
  await expect(page.locator(".swpop")).toHaveCount(0);

  await menu(page, "Collection", "New collection...");
  await page.locator("#f-name").fill("Trade binder");
  await page.keyboard.press("Enter");
  await page.keyboard.press("2");
  await page.locator("#view-collection .switcher").click();
  await page.keyboard.type("main");
  await expect(page.locator(".swrow")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#view-collection .switcher")).toContainText("Main collection");
  await page.locator("#view-collection .switcher").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".swpop")).toHaveCount(0);

  // Help closes when a deck is opened from a panel, and one click opens it
  await menu(page, "Help", "About Mana Vault");
  await expect(page.locator(".about")).toBeVisible();
  await page.locator('.tab[data-panel="decks"]').click();
  await page.locator(".navitem", { hasText: "Burn" }).click();
  await expect(page.locator(".about")).toHaveCount(0);
  await expect(page.locator("#view-deck .switcher")).toContainText("Burn");
});

test("new accounts see a grid; binder pages; Options; the Trade tab and the card menu", async ({ page }) => {
  await signUp(page, "grid", true);
  await menu(page, "Trade", "Trade view");
  await expect(page.locator("#view-trade, .tradegrid").first()).toBeVisible();
  for (const name of ["Sol Ring", "Counterspell", "Dark Ritual"]) {
    await page.keyboard.press("1");
    await page.locator(`#view-cards .pocket[title^="${name},"]`).first().click();
    await page.keyboard.press("Enter");
    await takePrinting(page);
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  await expect(page.locator(".cardgrid .pocket")).toHaveCount(3);
  await expect(page.locator(".colhead .phpos")).toHaveText(/3 cards \(3 unique\)/);
  await page.locator("#view-collection").getByRole("textbox", { name: "Filter collection" }).fill("ring");
  await expect(page.locator(".colhead .phpos")).toContainText("showing 1 of 3");
  await page.locator("#view-collection").getByRole("textbox", { name: "Filter collection" }).fill("");

  await page.getByRole("button", { name: /Options/ }).click();
  await page.locator(".optpop").getByLabel("For trade only").check();
  await page.locator(".optpop").getByRole("button", { name: "Large" }).click();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Options/ }).locator(".cbadge")).toHaveText("1");
  await page.getByRole("button", { name: "Remove filter For trade" }).click();
  await expect(page.locator(".cardgrid.size-l")).toBeVisible();

  await page.locator(".cardgrid .pocket").first().click({ button: "right" });
  const item = page.locator("#ctxmenu .dd", { hasText: "Card page" });
  await expect(item).toBeVisible();
  const color = await item.evaluate((element) => getComputedStyle(element).color);
  expect(color).not.toBe("rgb(154, 163, 174)");
  await page.keyboard.press("Escape");

  await page.keyboard.press("b");
  await expect(page.locator(".binder .pocket:not(.emptypocket)")).toHaveCount(3);
  await page.locator(".pagebox").fill("1");
  await page.locator(".pagebox").press("Enter");
  await expect(page.getByRole("button", { name: "Last" })).toBeDisabled();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("home buttons keep small icons, and the deck switcher is a full sheet", async ({ page }) => {
    await signUp(page, "phone7", true);
    const icon = await page.locator(".homeacts .btn .ico").first().boundingBox();
    expect(icon?.width ?? 99).toBeLessThanOrEqual(20);
    await expect(page.locator("#view-home #pagetabs")).toBeHidden();
    await page.locator(".ptab", { hasText: "Decks" }).click();
    await page.locator("#view-deck .switcher").click();
    await expect(page.locator(".swpop.phone")).toBeVisible();
    await expect(page.locator(".swpop.phone")).toContainText("No decks yet");
  });
});
