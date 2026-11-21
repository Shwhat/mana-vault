// Browser tests for 0.9.0: finish marks, change printing, adding to the selected collection or deck, the Decks panel,
// right-click menus on collections and decks, the card maker and the print list.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { choose, search, signUp, status, test, expect, takePrinting, menu } from "./fixtures";

async function newDeck(page: Page, name: string, format = "commander") {
  await menu(page, "File", "New deck...");
  await page.keyboard.type(name);
  await choose(page, page.locator("#f-format"), format);
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText(`Deck: ${name}`);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("3");
}

async function rightClick(page: Page, target: ReturnType<Page["locator"]>, item: string) {
  await target.click({ button: "right" });
  await page.locator("#ctxmenu .dd", { hasText: item }).first().click();
}

test("finish marks, change printing of deck and collection cards, and undo", async ({ page }) => {
  await signUp(page, "v9print");
  await newDeck(page, "Burn");
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await page.locator("#quickadd").fill("1 Lightning Bolt (M10) 146 *F*");
  await page.locator("#quickadd").press("Enter");
  await expect(status(page)).toHaveText("Lightning Bolt added to Burn");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();
  const deckRow = page.locator("#view-deck .row", { hasText: "Lightning Bolt" }).first();
  await expect(deckRow).toContainText("M10");
  // the *F* mark makes the deck card foil
  await expect(deckRow.locator(".badge.foil")).toHaveText("FOIL");

  // the deck card takes another printing; without copies of it the card is missing
  await rightClick(page, deckRow, "Change printing...");
  await expect(page.locator(".printrow")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Find a printing" }).fill("alpha");
  await expect(page.locator(".printrow")).toHaveCount(1);
  await page.locator(".printrow").first().click();
  await expect(status(page)).toHaveText("Lightning Bolt is now (LEA) 161 foil, 1 missing");
  await expect(page.locator("#view-deck .row", { hasText: "Lightning Bolt" }).first()).toContainText("LEA");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#view-deck .row", { hasText: "Lightning Bolt" }).first()).toContainText("M10");

  // a collection copy added as the wrong printing changes printing, and undo changes it back
  await page.locator(".navitem", { hasText: "Main collection" }).first().click();
  await search(page, "Counterspell");
  await page.locator("#view-cards .row", { hasText: "Counterspell" }).first().dblclick();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Counterspell added to Main collection");
  await search(page, "Lightning Bolt");
  await page.locator("#view-cards .row", { hasText: "Lightning Bolt" }).first().dblclick();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Lightning Bolt added to Main collection");
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  const copy = page.locator("#view-collection .row", { hasText: "Lightning Bolt" }).first();
  await expect(copy).toContainText("M10");
  await rightClick(page, copy, "Change printing...");
  await page.locator(".printrow", { hasText: "Limited Edition Alpha" }).click();
  await expect(status(page)).toHaveText("Lightning Bolt is now (LEA) 161");
  await expect(page.locator("#view-collection .row", { hasText: "Lightning Bolt" }).first()).toContainText("LEA");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#view-collection .row", { hasText: "Lightning Bolt" }).first()).toContainText("M10");

  // the same printing in foil: the copies become foil
  await rightClick(page, page.locator("#view-collection .row", { hasText: "Lightning Bolt" }).first(), "Change printing...");
  await expect(page.locator(".printrow", { hasText: "Magic 2010" })).toContainText("Current: regular");
  await page.getByRole("button", { name: "Foil M10 146" }).click();
  await expect(status(page)).toHaveText("Lightning Bolt is now (M10) 146 foil");
  await expect(page.locator("#view-collection .row", { hasText: "Lightning Bolt" }).first().locator(".badge.foil")).toHaveText("FOIL");
  await page.keyboard.press("Control+z");
  await expect(page.locator("#view-collection .row", { hasText: "Lightning Bolt" }).first().locator(".badge.foil")).toHaveCount(0);
});

test("cards go to the collection or deck selected last, the Decks panel groups by format, and right-click renames", async ({ page }) => {
  await signUp(page, "v9target");
  await newDeck(page, "Elves", "casual");
  await newDeck(page, "Atraxa", "commander");
  const decks = page.locator(".pbody", { has: page.getByRole("textbox", { name: "Find a deck" }) });
  await page.locator('.tab[data-panel="decks"]').click();
  await expect(decks.locator(".navgroup")).toHaveText(["Commander 1", "Casual 1"]);
  await expect(decks.locator(".navitem", { hasText: "Atraxa" })).toContainText("0 cards, $0.00");

  // selecting a deck makes it the target, and no collection is highlighted
  await decks.locator(".navitem", { hasText: "Elves" }).click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: DECK ELVES");
  await expect(page.locator(".colitem.active", { hasText: "Main collection" })).toHaveCount(0);
  await search(page, "Llanowar Elves");
  await page.locator("#view-cards .row", { hasText: "Llanowar Elves" }).first().dblclick();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Llanowar Elves added to Elves");
  await expect(decks.locator(".navitem", { hasText: "Elves" })).toContainText("1 cards, $60.00");

  // selecting a collection makes it the target again
  await page.locator(".navitem", { hasText: "Main collection" }).first().click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: MAIN COLLECTION");
  await expect(decks.locator(".navitem.active")).toHaveCount(0);
  await search(page, "Sol Ring");
  await page.locator("#view-cards .row", { hasText: "Sol Ring" }).first().dblclick();
  await takePrinting(page);
  await expect(status(page)).toHaveText("Sol Ring added to Main collection");

  // right-click renames collections and decks
  await rightClick(page, page.locator(".navitem", { hasText: "Main collection" }).first(), "Rename...");
  await page.getByRole("textbox", { name: "Collection name" }).fill("Binder");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Binder saved");
  await expect(page.locator(".navitem", { hasText: "Binder" })).toHaveCount(1);
  await rightClick(page, decks.locator(".navitem", { hasText: "Atraxa" }), "Rename...");
  await page.getByRole("textbox", { name: "Deck name" }).fill("Superfriends");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Deck renamed to Superfriends");
  await expect(decks.locator(".navitem", { hasText: "Superfriends" })).toHaveCount(1);
  // the Deck list panel rows have the deck card menu
  await decks.locator(".navitem", { hasText: "Elves" }).click();
  await page.locator(".dlrow", { hasText: "Llanowar Elves" }).click({ button: "right" });
  await expect(page.locator("#ctxmenu .dd", { hasText: "Change printing..." })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the card maker saves a custom card to the card database, and the print list exports it", async ({ page }) => {
  await signUp(page, "v9maker");
  await page.keyboard.press("5");
  await page.getByRole("tab", { name: "Card maker" }).click();
  await page.locator(".makerform").getByRole("button", { name: "Create a custom set..." }).click();
  await page.locator("#cs-code").fill("XMV");
  await page.locator("#cs-name").fill("My Test Set");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(status(page)).toHaveText("Custom set XMV created");
  await expect(page.getByRole("textbox", { name: "Name of XMV" })).toHaveValue("My Test Set");
  await page.getByRole("button", { name: "Close" }).click();

  await page.locator("#cm-name").fill("Goblin Tester");
  await page.locator("#cm-manaCost").fill("{1}");
  await page.locator(".makerform").getByRole("button", { name: "Symbols" }).first().click();
  await page.locator(".sympicker").getByRole("button", { name: "Insert {R}" }).click();
  await expect(page.locator("#cm-manaCost")).toHaveValue("{1}{R}");
  await page.locator("#cm-typeLine").fill("Creature - Goblin");
  await page.locator("#cm-rules").fill("Haste (This creature can attack right away.)");
  await page.locator("#cm-power").fill("2");
  await page.locator("#cm-toughness").fill("1");
  await page.getByRole("button", { name: "Save to card database" }).click();
  await expect(status(page)).toHaveText("Goblin Tester saved to the card database");
  await expect(page.locator(".makerlist .navitem", { hasText: "Goblin Tester" })).toContainText("XMV 1");

  // the card is a card like any other: search finds it
  await search(page, "is:custom");
  const found = page.locator("#view-cards .row", { hasText: "Goblin Tester" });
  await expect(found).toHaveCount(1);
  await expect(found.locator(".badge.custom")).toHaveText("Custom");
  await found.dblclick();
  await expect(status(page)).toHaveText("Goblin Tester added to Main collection");

  // print it with a deck: a PDF, MakePlayingCards pictures and the MPC Autofill list
  await page.keyboard.press("Escape");
  await page.keyboard.press("5");
  await page.getByRole("tab", { name: "Card maker" }).click();
  await page.locator(".makerform").getByRole("button", { name: "Add to print list" }).click();
  await expect(status(page)).toHaveText("Goblin Tester added to the print list");
  await page.getByRole("tab", { name: "Print" }).click();
  await page.getByRole("textbox", { name: "Find a card to print" }).fill("Sol Ring");
  await page.getByRole("textbox", { name: "Find a card to print" }).press("Enter");
  await page.locator(".presults .row", { hasText: "Sol Ring" }).getByRole("button", { name: "+ Print" }).click();
  await expect(status(page)).toHaveText("Sol Ring added to the print list");
  // count changes are saved a moment after the last change
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/proxies/list") && response.request().method() === "PUT");
  await page.locator(".pline", { hasText: "Sol Ring" }).getByRole("button", { name: "Add one Sol Ring" }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator(".pfoot")).toContainText("2 lines, 3 cards to print");
  await expect(page.locator(".ppage")).toHaveCount(1);
  await expect(page.locator(".ppage .pslot")).toHaveCount(3);

  // the test server cannot reach Scryfall: the missing pictures are listed first (0.14.0); Try again asks again
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect(page.locator("dialog[open] .dlghead")).toHaveText("Some card pictures are missing");
  await expect(page.locator("dialog[open] .misslist")).toHaveText("Sol Ring");
  await page.locator("dialog[open]").getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("dialog[open] .misslist")).toHaveText("Sol Ring");
  const pdf = page.waitForEvent("download");
  await page.locator("dialog[open]").getByRole("button", { name: "Make it anyway" }).click();
  const pdfFile = await pdf;
  expect(pdfFile.suggestedFilename()).toBe("proxies.pdf");
  expect(readFileSync(await pdfFile.path()).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(status(page)).toHaveText("PDF with 3 cards on 1 pages saved");

  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  const list = page.waitForEvent("download", (download) => download.suggestedFilename() === "mpc-autofill.txt");
  await page.getByRole("button", { name: "MPC Autofill list" }).click();
  expect(readFileSync(await (await list).path(), "utf8")).toBe("2 Sol Ring\n");
  await expect(status(page)).toHaveText("MPC Autofill list and custom card pictures saved");
  await expect.poll(() => downloads).toContain("custom-cards.zip");

  // the list stays after a reload
  await page.reload();
  await page.waitForSelector("#titlebar");
  await page.keyboard.press("5");
  await page.getByRole("tab", { name: "Print" }).click();
  await expect(page.locator(".pline")).toHaveCount(2);
  await expect(page.locator(".pline", { hasText: "Sol Ring" }).locator(".qn")).toHaveText("2");
});
