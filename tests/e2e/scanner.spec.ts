import type { Page } from "@playwright/test";
import { menu, signUp, status, test, expect } from "./fixtures";

type Read = { lines: string[]; info: string } | null;

/** Replaces text recognition with a queue of reads. An empty queue reads nothing, as if no card is in view. */
async function fakeReader(page: Page) {
  await page.addInitScript(() => {
    const queue: Array<{ lines: string[]; info: string } | null> = [];
    (window as unknown as { __scanQueue: typeof queue }).__scanQueue = queue;
    window.__manaVaultScanText = () => queue.shift() ?? null;
  });
}

/** Shows a card to the fake camera for `reads` reads, then takes it away for two reads. */
async function show(page: Page, read: Read, reads = 2) {
  await page.evaluate(([value, count]) => {
    const queue = (window as unknown as { __scanQueue: unknown[] }).__scanQueue;
    for (let index = 0; index < (count as number); index++) queue.push(value);
    queue.push(null, null);
  }, [read, reads] as const);
}

const listRow = (page: Page, name: string) => page.locator(".scanrow", { hasText: name });

test("the scanner reads cards continuously into the scanned list and adds them as one undo step", async ({ page }) => {
  await fakeReader(page);
  await signUp(page, "scan");
  await page.locator('.rpanel [data-action="scan"]').click();
  await expect(page.locator(".scanwin")).toBeVisible();
  await expect(page.locator(".scanlisthead")).toHaveText("0 cards scanned");

  // the set code and collector number give the exact printing at once
  await show(page, { lines: ["Lightning Bolt"], info: "0161 C\nLEA EN Christopher Rush" }, 3);
  await expect(listRow(page, "Lightning Bolt")).toContainText("1x Lightning Bolt");
  await expect(listRow(page, "Lightning Bolt")).toContainText("LEA #161");
  await expect(page.locator(".scanstatus")).toContainText("Added Lightning Bolt");

  // a misread name alone needs two matching reads and gives the newest printing
  await show(page, { lines: ["~ Counterspel1 @"], info: "" });
  await expect(listRow(page, "Counterspell")).toContainText("1x Counterspell");
  await expect(page.locator(".scanlastname")).toContainText("Counterspell");

  // the same card brought back is a second copy
  await show(page, { lines: ["Counterspell"], info: "" });
  await expect(listRow(page, "Counterspell")).toContainText("2x Counterspell");
  await expect(page.locator(".scanlisthead")).toHaveText("3 cards scanned");

  // last card controls: finish and +1
  await page.locator(".scanpill button", { hasText: "Normal" }).click();
  await expect(listRow(page, "Counterspell")).toContainText("Foil");
  await page.locator(".scanpill button", { hasText: "+1" }).click();
  await expect(listRow(page, "Counterspell")).toContainText("3x Counterspell");

  // add by name with a typing mistake
  await page.getByRole("textbox", { name: "Add a card by name" }).fill("Shivan Dragn");
  await page.getByRole("button", { name: "Add by name" }).click();
  await expect(listRow(page, "Shivan Dragon")).toContainText("1x Shivan Dragon");
  await page.getByRole("textbox", { name: "Add a card by name" }).fill("zzzz qqqq");
  await page.getByRole("button", { name: "Add by name" }).click();
  await expect(status(page)).toHaveText('No card name is close to "zzzz qqqq"');

  // edit: another printing and quantity
  await listRow(page, "Lightning Bolt").getByRole("button", { name: "Edit Lightning Bolt" }).click();
  await page.locator("#f-printing").selectOption({ label: "Magic 2010 (M10 #146), 2009" });
  await page.locator("#f-quantity").fill("2");
  await page.locator(".dlgbtns .primary").click();
  await expect(listRow(page, "Lightning Bolt")).toContainText("2x Lightning Bolt");
  await expect(listRow(page, "Lightning Bolt")).toContainText("M10 #146");

  // remove a row
  await listRow(page, "Shivan Dragon").getByRole("button", { name: "Remove Shivan Dragon" }).click();
  await expect(listRow(page, "Shivan Dragon")).toHaveCount(0);

  // Add to: the whole list goes into the collection as one undo step
  await page.getByRole("button", { name: "Add to..." }).click();
  await expect(page.locator("#f-target")).toHaveValue(/^collection:/);
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("5 cards added to Main collection");
  await expect(page.locator(".scanlisthead")).toHaveText("0 cards scanned");
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.locator(".scanwin")).toHaveCount(0);

  await page.keyboard.press("2");
  const rows = page.locator("#view-collection .row");
  await expect(rows.filter({ hasText: "Lightning Bolt" })).toContainText("2");
  await expect(rows.filter({ hasText: "Counterspell" })).toContainText(/foil/i);
  await page.keyboard.press("Control+z");
  await expect(status(page)).toHaveText("Undone: Add 5 scanned cards to Main collection");
  await expect(rows).toHaveCount(0);
});

test("the scanned list stays after a reload and can go into a deck", async ({ page }) => {
  await fakeReader(page);
  await signUp(page, "scandeck");
  await menu(page, "Deck", "New deck...");
  await page.keyboard.type("Burn");
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toContainText("Burn");

  await menu(page, "Cards", "Scan card...");
  await show(page, { lines: ["Lightning Bolt"], info: "" });
  await expect(listRow(page, "Lightning Bolt")).toBeVisible();
  await page.reload();
  await page.waitForSelector("#menubar");
  await menu(page, "Cards", "Scan card...");
  await expect(listRow(page, "Lightning Bolt")).toContainText("1x Lightning Bolt");

  await page.getByRole("button", { name: "Add to..." }).click();
  await page.locator("#f-target").selectOption({ label: "Deck: Burn" });
  await page.locator(".dlgbtns .primary").click();
  await expect(status(page)).toHaveText("1 card added to Burn");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".scanwin")).toHaveCount(0);
  await page.keyboard.press("3");
  await expect(page.locator("#view-deck .row", { hasText: "Lightning Bolt" })).toBeVisible();

  // Clear asks first
  await menu(page, "Cards", "Scan card...");
  await show(page, { lines: ["Sol Ring"], info: "" });
  await expect(listRow(page, "Sol Ring")).toBeVisible();
  await page.locator(".scanlistfoot .btn", { hasText: "Clear" }).click();
  await page.locator(".dlgbtns .primary", { hasText: "Clear" }).click();
  await expect(status(page)).toHaveText("Scanned list cleared");
  await expect(page.locator(".scanrow")).toHaveCount(0);
});

test.describe("phone scanner", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Scan tab, last card strip and the scanned list sheet", async ({ page }) => {
    await fakeReader(page);
    await signUp(page, "phonescan");
    await page.locator(".ptab", { hasText: "Scan" }).click();
    await expect(page.locator(".ptab.on")).toHaveText("Scan");
    await expect(page.locator("#pbar .ptitle")).toHaveText("Scan");
    await expect(page.locator(".scanphone .scancam")).toBeVisible();

    await show(page, { lines: ["Serra Angel"], info: "" });
    await expect(page.locator(".scanlastname")).toContainText("Serra Angel");
    await expect(page.locator(".scantool .cbadge")).toHaveText("1");
    const pill = await page.locator(".scanpill button").first().boundingBox();
    expect(pill?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.getByRole("button", { name: "Scanned list", exact: true }).click();
    await expect(page.locator(".scansheet .scanlisthead")).toContainText("1 card scanned");
    await page.getByRole("button", { name: "Add to..." }).click();
    await page.locator(".dlgbtns .primary").click();
    await expect(page.locator(".ptoast")).toHaveText("1 card added to Main collection");
    await expect(page.locator(".scansheet")).toHaveCount(0);

    await page.locator(".ptab", { hasText: "Collection" }).click();
    await expect(page.locator(".scanphone")).toHaveCount(0);
    await expect(page.locator("#view-collection .row", { hasText: "Serra Angel" })).toBeVisible();
  });
});
