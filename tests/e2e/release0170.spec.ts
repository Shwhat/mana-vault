// Browser tests for 0.17.0: shared places in the purchase window, the Places window, Send to print list... on a deck,
// list grouping, the shipping choice on a sale and USD only prices.
import type { Page } from "@playwright/test";
import { choose, modeTab, signUp, status, test, expect } from "./fixtures";

const headers = { "x-mana-vault": "1" };

test("a place added in the Places window is offered in the purchase window", async ({ page }) => {
  await signUp(page, "v17place");
  await modeTab(page, "Purchases");
  await page.locator("#view-purchases").getByRole("button", { name: "Places..." }).click();
  const places = page.locator("dialog#dlg[open]");
  await places.getByRole("textbox", { name: "Find a place" }).fill("Corner Games");
  await places.getByRole("button", { name: "Add place" }).click();
  // a new place opens for editing, to set its kind and note
  await expect(places.getByRole("textbox", { name: "Name" })).toHaveValue("Corner Games");
  await places.getByRole("button", { name: "Save" }).click();
  await expect(places.locator("tbody")).toContainText("Corner Games");
  await places.getByRole("button", { name: "Close" }).click();

  await page.locator("#view-purchases").getByRole("button", { name: "New entry..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Purchase", exact: true }).click();
  const editor = page.locator("dialog#dlg[open] .purchaseedit");
  await editor.locator("#pe-place").fill("corner");
  await editor.getByRole("option", { name: /Corner Games/ }).click();
  await expect(editor.locator("#pe-place")).toHaveValue("Corner Games");
  await expect(editor.locator(".comboadd")).toHaveCount(0);
  // the purchase window starts with no lines; single cards are found, not typed
  await expect(editor).toContainText("No sealed products");
  await expect(editor.getByRole("button", { name: "Find cards" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "From scanned list..." })).toBeVisible();
});

test("Send to print list... on a deck in the Decks panel asks what to send", async ({ page }) => {
  await signUp(page, "v17print");
  const deck = await (await page.request.post("/api/decks", { headers, data: { name: "Burn", format: "modern" } })).json() as { id: string };
  await page.request.post(`/api/decks/${deck.id}/cards`, { headers, data: { cardId: "bolt-m10", quantity: 3 } });
  await page.reload();
  await page.waitForSelector("#titlebar");
  await page.locator(".dock .tab", { hasText: "Decks" }).first().click();
  await page.locator(".navitem", { hasText: "Burn" }).first().click({ button: "right" });
  await page.locator("#ctxmenu .dd", { hasText: "Send to print list..." }).click();
  const ask = page.locator("dialog#dlg[open]");
  await expect(ask.locator(".dlghead")).toHaveText("Send Burn to the print list");
  await expect(ask.getByRole("radio", { name: /The whole deck/ })).toBeChecked();
  await ask.getByRole("radio", { name: /Missing cards only/ }).check();
  await ask.getByRole("button", { name: "Send to print list" }).click();
  await expect(status(page)).toHaveText("The missing cards of Burn added to the print list");
});

test("the collection list groups by rarity, with headings that fold", async ({ page }) => {
  await signUp(page, "v17group");
  const collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string }>;
  for (const cardId of ["sol-ring", "counterspell"]) {
    await page.request.post(`/api/collections/${collections[0]!.id}/cards`, { headers, data: { cardId, quantity: 1, foil: false } });
  }
  await page.reload();
  await page.waitForSelector("#titlebar");
  await modeTab(page, "Collection");
  await page.locator("#view-collection").getByRole("button", { name: /^Options/ }).click();
  await choose(page, page.getByRole("button", { name: /^Group by/ }), "rarity");
  await choose(page, page.locator("#opt-sort"), "price-desc");
  await page.getByRole("button", { name: "Done" }).click();
  const heads = page.locator("#view-collection .gfold");
  await expect(heads.first()).toBeVisible();
  await expect(page.locator("#view-collection")).toContainText("Uncommon");
  const first = heads.first();
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
});

test("a sale where I paid shipping takes the shipping off what was received; the buyer's shipping does not", async ({ page }) => {
  await signUp(page, "v17ship");
  const collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string }>;
  await page.request.post(`/api/collections/${collections[0]!.id}/cards`, { headers, data: { cardId: "sol-ring", quantity: 1, foil: false } });
  await page.reload();
  await page.waitForSelector("#titlebar");
  await modeTab(page, "Collection");
  await page.locator("#view-collection .row", { hasText: "Sol Ring" }).first().click({ button: "right" });
  await page.locator("#ctxmenu .dd", { hasText: "Sell..." }).click();
  const editor = page.locator("dialog#dlg[open] .purchaseedit");
  await editor.getByRole("textbox", { name: "Price of Sol Ring" }).fill("4");
  await editor.locator("#cs-fees").fill("0.5");
  await editor.locator("#cs-shipping").fill("1");
  await expect(editor.getByRole("button", { name: /^Who paid shipping/ })).toHaveAttribute("data-value", "buyer");
  await expect(editor.locator(".petotal")).toHaveText("Received $3.50");
  await choose(page, editor.getByRole("button", { name: /^Who paid shipping/ }), "me");
  await expect(editor.locator(".petotal")).toHaveText("Received $2.50");
});

test("prices are in USD only: no currency switch in the View menu", async ({ page }) => {
  await signUp(page, "v17usd");
  await page.locator("#menubar").getByRole("menuitem", { name: "View" }).click();
  await expect(page.locator(".menu .dd", { hasText: "EUR" })).toHaveCount(0);
  await expect(page.locator(".menu .dd", { hasText: "Euro" })).toHaveCount(0);
});
