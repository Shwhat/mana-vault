// Browser tests for 0.14.0: the card maker's symbol picker, frame styles and phone preview, the print list's sort and
// views, and prices on pictures. (The menu bar and mode tabs are in app.spec.ts, account delete in release0120.spec.ts.)
import type { Page } from "@playwright/test";
import { menu, modeTab, search, signUp, status, test, expect, choose } from "./fixtures";

async function openMaker(page: Page) {
  await modeTab(page, "Proxies");
  await page.getByRole("tab", { name: "Card maker" }).click();
}

test("the card maker: symbol picker, frame styles and a nickname", async ({ page }) => {
  await signUp(page, "v14maker");
  await openMaker(page);
  await page.locator("#cm-name").fill("Ember Hound");
  // one Symbols button opens the picker; a click inserts at the cursor of the field used last
  await page.locator("#cm-manaCost").click();
  await page.locator(".makerform").getByRole("button", { name: "Symbols" }).click();
  const picker = page.locator(".sympicker");
  await expect(picker.locator(".symname")).toHaveText(["Numbers", "Colors", "Phyrexian", "Hybrid", "Two or color", "Other"]);
  await expect(picker.locator(".symbtn")).toHaveCount(22 + 7 + 5 + 10 + 5 + 3);
  await picker.getByRole("button", { name: "Insert {2}" }).click();
  await picker.getByRole("button", { name: "Insert {R/G}" }).click();
  await picker.getByRole("button", { name: "Insert {R/P}" }).click();
  await expect(page.locator("#cm-manaCost")).toHaveValue("{2}{R/G}{R/P}");
  // the same picker fills the rules text once it is used
  await page.locator("#cm-rules").click();
  await page.locator("#cm-rules").fill("Pay ");
  await page.locator("#cm-rules").press("End");
  await page.locator(".sympicker").getByRole("button", { name: "Insert {T}" }).click();
  await expect(page.locator("#cm-rules")).toHaveValue("Pay {T}");
  await page.locator(".symwindow").getByRole("button", { name: "Close" }).click();
  await page.locator("#cm-typeLine").fill("Creature - Dog");
  await page.locator("#cm-power").fill("3");
  await page.locator("#cm-toughness").fill("2");

  // every style draws; Nickname asks for the nickname
  for (const style of ["classic", "borderless", "fullart", "showcase", "nickname"]) {
    await choose(page, page.locator("#cm-style"), style);
    if (style === "nickname") await page.locator("#cm-nickname").fill("Big Red");
    await page.waitForTimeout(150);
    await page.locator(".cardcanvas").screenshot({ path: `test-results/card-style-${style}.png` });
  }
  await expect(page.locator("#cm-nickname")).toHaveValue("Big Red");
  await choose(page, page.locator("#cm-style"), "classic");
  await expect(page.locator("#cm-nickname")).toHaveCount(0);
});

test("the print list sorts and shows as a list, grid or binder; prices on pictures", async ({ page }) => {
  await signUp(page, "v14print");
  await modeTab(page, "Proxies");
  await page.getByRole("tab", { name: "Print" }).click();
  const find = page.getByRole("textbox", { name: "Find a card to print" });
  for (const name of ["Sol Ring", "Counterspell", "Lightning Bolt"]) {
    await find.fill(name);
    await find.press("Enter");
    await page.locator(".presults .row", { hasText: name }).first().getByRole("button", { name: "+ Print" }).click();
    await expect(status(page)).toHaveText(`${name} added to the print list`);
  }
  const names = page.locator(".plines .pline .rowtitle b");
  await expect(names).toHaveText(["Sol Ring", "Counterspell", "Lightning Bolt"]);
  await choose(page, page.getByRole("button", { name: "Sort the print list" }), "name");
  await expect(names).toHaveText(["Counterspell", "Lightning Bolt", "Sol Ring"]);
  // the preview follows the list order
  await expect(page.locator(".ppage .pslot").first()).toContainText("Counterspell");

  await page.locator(".printbar").getByRole("button", { name: /^Options/ }).click();
  await page.locator(".optpop").getByRole("group", { name: "Print list layout" }).getByRole("button", { name: "Grid" }).click();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".plines .printcell")).toHaveCount(3);
  await expect(page.locator(".plines .printcell .pricepip")).toHaveCount(0);

  // View, Prices on pictures puts a price pip on every picture
  await menu(page, "View", "Prices on pictures");
  await expect(status(page)).toHaveText("Prices on pictures on");
  await expect(page.locator(".plines .printcell .pricepip").first()).toHaveText(/\$/);
  await search(page, "Counterspell");
  await page.locator("#view-cards").getByRole("button", { name: /^Options/ }).click();
  await page.locator(".optpop").getByRole("group", { name: "Search results layout" }).getByRole("button", { name: "Grid" }).click();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#view-cards .pipbar .pricepip").first()).toBeVisible();
  await menu(page, "View", "Prices on pictures");
  await expect(page.locator("#view-cards .pipbar .pricepip")).toHaveCount(0);
});

test.describe("phone card maker", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("the card maker is one page that scrolls, and a tap on the card shows it full size", async ({ page }) => {
    await signUp(page, "v14phone");
    await page.locator(".ptab", { hasText: "Proxies" }).click();
    await page.getByRole("tab", { name: "Card maker" }).click();
    const canvas = page.locator(".cardcanvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    // the whole card keeps its shape and fits the phone's width
    expect(Math.abs(box!.height / box!.width - 1040 / 745)).toBeLessThan(0.02);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    // the page scrolls as one: scrolling to the fields moves the card with it
    await page.locator("#cm-artist").scrollIntoViewIfNeeded();
    await expect(page.locator("#cm-artist")).toBeInViewport();
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/phone-card-maker.png" });
    await canvas.tap();
    await expect(page.getByRole("dialog", { name: "Card full size" })).toBeVisible();
    await page.getByRole("dialog", { name: "Card full size" }).getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog", { name: "Card full size" })).toHaveCount(0);
  });
});
