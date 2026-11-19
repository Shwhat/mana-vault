import { menu, row, search, signUp, status, test, expect } from "./fixtures";

test("sign-in protects the app and accounts work", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  const name = await signUp(page, "acct");
  await expect(page.locator("#acct")).toHaveText(name);
  await page.locator("#acct").click();
  await page.locator("#dropdown .dd", { hasText: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.fill("#name", name);
  await page.fill("#pw", "wrong password");
  await page.locator("#go").click();
  await expect(page.locator("#msg")).toHaveText("Wrong user name or password.");
  await page.fill("#pw", "correct horse");
  await page.locator("#go").click();
  await expect(page.locator("#titlebar")).toBeVisible();
});

test("search, filters and adding to the collection with undo", async ({ page }) => {
  await signUp(page);
  await search(page, "t:dragon");
  await expect(page.locator("#view-cards .row")).toHaveCount(1);
  await search(page, "mv>=5 c:w");
  await expect(page.locator("#view-cards .row")).toHaveCount(1);
  await expect(row(page, "Serra Angel")).toBeVisible();
  await search(page, "bad:filter");
  await expect(page.locator(".emptynote.err")).toContainText('Unsupported search filter "bad"');

  await search(page, "");
  await page.locator("#flt-rarity").selectOption("mythic");
  await expect(page.locator("#view-cards .row")).toHaveCount(1);
  await page.locator(".pbody .btn", { hasText: "Clear filters" }).click();

  await search(page, "Dark Ritual");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".ident")).toHaveText("Dark Ritual");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Dark Ritual added to Main collection");
  await page.keyboard.press("f");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Dark Ritual (foil) added to Main collection");
  await page.keyboard.press("f");
  await expect(page.locator(".pgrp", { hasText: "Owned" })).toContainText(/This printing\s*\d+ regular, \d+ foil/);

  await page.keyboard.press("2");
  const entry = page.locator("#view-collection .row", { hasText: "Dark Ritual" });
  await expect(entry).toHaveCount(2);
  const regular = entry.filter({ hasNot: page.locator(".badge.foil") });
  const start = Number(await regular.locator(".qn").textContent());
  await regular.getByRole("button", { name: "Add one Dark Ritual" }).click();
  await expect(regular.locator(".qn")).toHaveText(String(start + 1));
  await page.keyboard.press("Control+z");
  await expect(status(page)).toContainText("Undone");
  await expect(regular.locator(".qn")).toHaveText(String(start));
  await page.keyboard.press("Control+y");
  await expect(regular.locator(".qn")).toHaveText(String(start + 1));
  // undoing an add that brings a count to zero removes the entry
  await regular.getByRole("button", { name: /Remove Dark Ritual from collection/ }).click();
  await expect(regular).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(status(page)).toHaveText("Undone: Remove Dark Ritual");
  await expect(regular.locator(".qn")).toHaveText(String(start + 1));
  // presses made while an undo is still running are queued, not dropped
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  await expect(status(page)).toHaveText(`Redone: Dark Ritual quantity ${start + 1}`);
  await expect(regular.locator(".qn")).toHaveText(String(start + 1));
});

test("deck building with zones, moves and undo", async ({ page }) => {
  await signUp(page);
  await page.keyboard.press("Control+n");
  await expect(page.locator("dialog[open] .dlghead")).toHaveText("New deck");
  await expect(page.locator("#f-name")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Enter a deck name");
  await page.keyboard.type("Burn test");
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText("Deck: Burn test");
  // an open deck adds its groups to the Decks tab
  await expect(page.locator(".rtab.active")).toHaveText("Decks");
  await expect(page.locator(".rgroup.ctx", { hasText: "Build" })).toBeVisible();

  await search(page, "Lightning Bolt");
  await row(page, "Lightning Bolt").click();
  await page.keyboard.press("Shift+Enter");
  await expect(status(page)).toHaveText("Lightning Bolt added to Burn test");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("z");
  await expect(page.locator("#st-toggles")).toContainText("ZONE: SIDEBOARD");
  await page.locator("#view-cards .row", { hasText: "Lightning Bolt" }).nth(1).click();
  await page.keyboard.press("Shift+Enter");
  await expect(status(page)).toHaveText("Lightning Bolt added to Burn test (sideboard)");

  await page.keyboard.press("3");
  await expect(page.locator(".zonehead")).toHaveText(["Main deck 2", "Sideboard 1"]);
  const side = page.locator("#view-deck .row").nth(1);
  await side.locator(".zonesel").selectOption("main");
  await expect(page.locator(".zonehead")).toHaveText(["Main deck 3"]);
  await expect(page.locator("#view-deck .row")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".zonehead")).toHaveText(["Main deck 2", "Sideboard 1"]);
  await page.locator("#view-deck .row").first().getByRole("button", { name: /Remove Lightning Bolt from deck/ }).click();
  await expect(page.locator(".zonehead")).toHaveText(["Sideboard 1"]);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".zonehead")).toHaveText(["Main deck 2", "Sideboard 1"]);

  await menu(page, "Home", "Export...");
  await page.locator("#ex-what").selectOption("deck");
  await page.locator("#ex-format").selectOption("text");
  const download = page.waitForEvent("download");
  await page.locator("dialog[open]").getByRole("button", { name: "Export", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("burn-test.txt");
});

test("collection CSV import shows the detected format, a preview and the review panel", async ({ page }) => {
  await signUp(page);
  await menu(page, "Home", "Import...");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose file..." }).click();
  await (await chooser).setFiles({
    name: "cards.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Count,Name,Edition,Foil\n2,Sol Ring,lea,\n1,Not A Real Card,,\n3,Counterspell,,foil\n"),
  });
  await expect(page.locator("dialog[open]")).toContainText("2 rows (5 cards) match. 1 rows are skipped.");
  await expect(page.locator("#io-format option").first()).toHaveText("Detected: Moxfield CSV");
  await page.locator("dialog[open]").getByRole("button", { name: "Import", exact: true }).click();
  await expect(status(page)).toHaveText("Imported 5 cards from 2 rows into Main collection");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".revhead")).toContainText("Imported: 2 matched rows (5 cards), 1 skipped");
  await page.keyboard.press("2");
  await expect(page.locator("#view-collection .row", { hasText: "Counterspell" }).locator(".badge.foil")).toBeVisible();
  await expect(page.locator(".dgbody .msg", { hasText: "Not A Real Card" })).toContainText("No card with this name exists in the local catalog");
});

test("decklist import into a deck", async ({ page }) => {
  await signUp(page);
  await page.keyboard.press("Control+n");
  await expect(page.locator("#f-name")).toBeFocused();
  await page.keyboard.type("Imported");
  await page.keyboard.press("Enter");
  await expect(page.locator("#docname")).toHaveText("Deck: Imported");
  await menu(page, "Home", "Import...");
  await page.locator("dialog[open]").getByRole("button", { name: "Deck", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose file..." }).click();
  await (await chooser).setFiles({
    name: "deck.txt", mimeType: "text/plain",
    buffer: Buffer.from("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n4 Llanowar Elves\nSideboard\n2 Swords to Plowshares\n"),
  });
  await expect(page.locator("dialog[open]")).toContainText("4 rows (8 cards) match");
  await page.locator("dialog[open]").getByRole("button", { name: "Import", exact: true }).click();
  await expect(status(page)).toHaveText("Imported 8 cards from 4 rows into Imported");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("3");
  await expect(page.locator(".zonehead")).toHaveText(["Commander 1", "Main deck 5", "Sideboard 2"]);
});

test("theme and preferences are saved per account", async ({ page }) => {
  await signUp(page);
  await menu(page, "View", "Dark theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(status(page)).toHaveText("Dark theme");
  await page.keyboard.press("f");
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#st-toggles .pt").first()).toHaveClass(/on/);
});

test("panels close, reopen, float and workspaces apply", async ({ page }) => {
  await signUp(page);
  await page.locator('.dtabs .tab[data-panel="card"] .tabx').click();
  await expect(page.locator('.dtabs .tab[data-panel="card"]')).toHaveCount(0);
  await menu(page, "View", "Card panel");
  await expect(page.locator('.dtabs .tab[data-panel="card"]')).toHaveCount(1);

  const tab = page.locator('.dtabs .tab[data-panel="filters"]');
  const box = await tab.boundingBox();
  const target = await page.locator("#dockmid").boundingBox();
  if (!box || !target) throw new Error("layout not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator("#dockhint")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.dfloat .tab[data-panel="filters"]')).toBeVisible();

  await page.locator(".wsbox select").selectOption("Collection");
  await expect(status(page)).toHaveText("Collection workspace");
  await expect(page.locator("#view-collection")).toBeVisible();
  await expect(page.locator(".dfloat")).toHaveCount(0);
  await expect(page.locator('.dtabs .tab[data-panel="review"]')).toBeVisible();
});

test("ribbon can be customized and reset", async ({ page }) => {
  await signUp(page);
  await expect(page.locator('.rpanel [data-action="scan"]')).toBeVisible();
  await menu(page, "View", "Customize ribbon...");
  await page.locator(".cz-row", { hasText: "Scan card..." }).first().click();
  await page.locator(".cz > div").nth(2).getByRole("button", { name: "Remove" }).click();
  await page.locator(".dlgbtns .primary").click();
  await page.locator(".rtab", { hasText: "Home" }).click();
  await expect(page.locator('.rpanel [data-action="scan"]')).toHaveCount(0);
  await menu(page, "View", "Customize ribbon...");
  await page.getByRole("button", { name: "Reset ribbon" }).click();
  await page.locator(".dlgbtns .primary").click();
  await page.locator(".rtab", { hasText: "Home" }).click();
  await expect(page.locator('.rpanel [data-action="scan"]')).toBeVisible();
  // the button size is chosen in the View tab
  await menu(page, "View", "Icons only");
  await expect(page.locator("#toolbar")).toHaveClass(/rsize-icons/);
});

test("About guide opens, navigates and closes", async ({ page }) => {
  await signUp(page);
  await menu(page, "Help", "About Mana Vault");
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator(".abpage h1")).toHaveText("Overview");
  await expect(page.locator("#view-about .phwhere")).toHaveText(/^Version /);
  await page.locator(".abpager a", { hasText: "Next: Capabilities" }).click();
  await expect(page.locator(".abpage h1")).toHaveText("Capabilities");
  await page.goto("/about/decks");
  await expect(page.locator(".abpage h1")).toHaveText("Decks");
  await page.goto("/about/nope");
  await expect(page.locator(".abpage")).toContainText("Page not found");
  // right after a page load the key handler attaches a moment after the first paint
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.locator("#view-about")).toHaveCount(0, { timeout: 500 });
  }).toPass();
  await expect(page).toHaveURL(/\/$/);
});

test("backup downloads and restores after a confirmation", async ({ page }) => {
  await signUp(page);
  const download = page.waitForEvent("download");
  await menu(page, "Home", "Download backup");
  const file = await download;
  const path = await file.path();
  const chooser = page.waitForEvent("filechooser");
  await menu(page, "Home", "Restore backup...");
  await (await chooser).setFiles(path);
  await expect(page.locator("dialog[open] .dlghead")).toHaveText("Restore backup");
  await expect(page.locator("dialog[open]")).toContainText("A restore cannot be undone.");
  await page.getByRole("button", { name: "Restore backup" }).click();
  await expect(status(page)).toHaveText("Backup restored");
});

test("keyboard shortcut list and dialogs close with Escape", async ({ page }) => {
  await signUp(page);
  await menu(page, "Help", "Keyboard shortcuts");
  await expect(page.locator("dialog[open]")).toContainText("Shift+Enter");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("tabs, card page and the nested menu", async ({ page }) => {
    await signUp(page, "phone");
    await expect(page.locator("#ptabs .ptab")).toHaveText(["Home", "Search", "Collection", "Decks", "Scan"]);
    await expect(page.locator("#view-home")).toBeVisible();
    await expect(page.locator("#titlebar")).toHaveCount(0);
    await page.locator(".ptab", { hasText: "Search" }).click();
    await page.locator("#view-cards .row", { hasText: "Counterspell" }).click();
    await expect(page.locator(".cardpage h2")).toHaveText("Counterspell");
    await page.getByRole("button", { name: "Card actions" }).click();
    await page.locator(".fabmenu .pmrow", { hasText: "Add to collection" }).click();
    await expect(page.locator(".ptoast")).toHaveText("Counterspell added to Main collection");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".cardpage")).toHaveCount(0);
    // a long press opens the row menu
    await page.locator("#view-cards .row", { hasText: "Counterspell" }).dispatchEvent("contextmenu");
    await expect(page.locator("#ctxmenu")).toContainText("Add to wishlist");
    await page.keyboard.press("Escape");
    await page.locator(".ptab", { hasText: "Collection" }).click();
    await expect(page.locator("#view-collection .row", { hasText: "Counterspell" }).first()).toBeVisible();
    await page.locator(".ptab", { hasText: "Decks" }).click();
    await expect(page.locator("#pmain")).toContainText("New...");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".pmrow", { hasText: "Sign out" })).toBeVisible();
    await expect(page.locator(".pmsection > summary")).toContainText(["Home", "Collection", "Decks"]);
    await page.locator(".pmsection > summary", { hasText: "Home" }).click();
    await expect(page.locator(".pmsub > summary", { hasText: "Backup" })).toBeVisible();
    await expect(page.locator(".pmrow", { hasText: "Customize ribbon" })).toHaveCount(0);
    const box = await page.locator(".pmrow").first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.locator(".sheethead .btn").click();
    await page.locator(".ptab", { hasText: "Collection" }).click();
    await page.getByRole("button", { name: "Select" }).click();
    await page.locator("#view-collection .row", { hasText: "Counterspell" }).first().locator(".rowtitle").click();
    await expect(page.locator(".pickbar")).toContainText("1 picked");
    await expect(page.locator(".sheet")).toHaveCount(0);
    await page.locator(".pickbar").getByRole("button", { name: "Remove..." }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.locator(".ptoast")).toContainText("Removed Counterspell");
  });
});
