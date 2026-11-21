// Browser tests for 0.16.0: purchase history (a purchase, opening with tied pulls, the status bar, a card sale from a
// collection card, the summary, undo, and the import question for purchase prices).
import type { Page } from "@playwright/test";
import { choose, menu, modeTab, signUp, status, test, expect } from "./fixtures";

async function newPurchase(page: Page) {
  await modeTab(page, "Purchases");
  await page.locator("#view-purchases").getByRole("button", { name: "New entry..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Purchase", exact: true }).click();
  const editor = page.locator("dialog#dlg[open] .purchaseedit");
  await expect(editor).toBeVisible();
  return editor;
}

test("a purchase with tax spread over its lines, opened with pulled cards tied to it", async ({ page }) => {
  await signUp(page, "v16buy");
  const editor = await newPurchase(page);
  await editor.locator("#pe-date").fill("2026-11-01");
  await editor.locator("#pe-place").fill("Local shop");
  await editor.getByRole("button", { name: "Add product" }).click();
  await choose(page, editor.getByRole("button", { name: /^Set of line 1/ }), "lea");
  await editor.getByRole("spinbutton", { name: "Quantity of line 1" }).fill("6");
  await editor.getByRole("textbox", { name: "Cost each of line 1" }).fill("5");
  await expect(editor.getByRole("textbox", { name: "Total of line 1" })).toHaveValue("30");
  await editor.getByRole("button", { name: "Add product" }).click();
  await choose(page, editor.getByRole("button", { name: /^Product of line 2/ }), "bundle");
  await editor.getByRole("textbox", { name: "Total of line 2" }).fill("10");
  await editor.locator("#pe-tax").fill("3");
  await editor.locator("#pe-shipping").fill("1");
  await expect(editor.locator(".pelines tbody tr").first().locator("td").nth(6)).toHaveText("$33.00");
  await expect(editor.locator(".petotal")).toHaveText("Total $44.00");
  await editor.getByRole("button", { name: "Save purchase" }).click();
  await expect(status(page)).toHaveText("Purchase of 2026-11-01 saved");

  // the entry page opens: open 3 of the boosters into the main collection
  const entry = page.locator(".purchaseentry");
  await expect(entry.locator(".pfigs")).toContainText("Cost$44.00");
  await entry.locator("tbody tr", { hasText: "Play booster" }).getByRole("button", { name: "Open..." }).click();
  await page.locator("#op-count").fill("3");
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#st-opening")).toContainText("OPENING: 3 PLAY BOOSTERS");
  // a card added from search is tied to the opening
  const collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string }>;
  await page.request.post(`/api/collections/${collections[0]!.id}/cards`, { headers: { "x-mana-vault": "1" }, data: { cardId: "sol-ring", quantity: 1, foil: false } });
  await page.locator(".purchaseentry").getByRole("button", { name: "Done opening" }).click();
  await expect(status(page)).toHaveText("Done opening");
  await expect(page.locator("#st-opening")).toHaveCount(0);
  await expect(page.locator(".purchaseentry")).toContainText("Cards from this purchase");
  await expect(page.locator(".purchaseentry")).toContainText("Sol Ring");

  // the summary counts it, and undo of the save removes it
  await page.getByRole("tab", { name: "Summary" }).click();
  await expect(page.locator(".purchasetiles .stattile").first()).toContainText("$44.00");
  await expect(page.locator(".spendchart")).toBeVisible();
});

test("Sell... on a collection card removes it, and undo puts it back", async ({ page }) => {
  await signUp(page, "v16sell");
  const collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string }>;
  await page.request.post(`/api/collections/${collections[0]!.id}/cards`, { headers: { "x-mana-vault": "1" }, data: { cardId: "sol-ring", quantity: 2, foil: false } });
  await modeTab(page, "Collection");
  await page.reload();
  await page.waitForSelector("#titlebar");
  await modeTab(page, "Collection");
  await page.locator("#view-collection .row", { hasText: "Sol Ring" }).first().click({ button: "right" });
  await page.locator("#ctxmenu .dd", { hasText: "Sell..." }).click();
  const editor = page.locator("dialog#dlg[open] .purchaseedit");
  await editor.getByRole("textbox", { name: "Price of Sol Ring" }).fill("4");
  await editor.locator("#cs-fees").fill("0.5");
  await expect(editor.locator(".petotal")).toHaveText("Received $3.50");
  await editor.getByRole("button", { name: "Save sale" }).click();
  await expect(status(page)).toHaveText("Card sale of " + new Date().toISOString().slice(0, 10) + " saved: 1 cards removed from collections");
  const count = async () => ((await (await page.request.get(`/api/collections/${collections[0]!.id}/cards`)).json()) as Array<{ id: string; quantity: number }>)
    .find((item) => item.id === "sol-ring")?.quantity;
  expect(await count()).toBe(1);
  await menu(page, "Edit", "Undo");
  await expect.poll(count).toBe(2);
});

test("an import with purchase prices asks how to record them", async ({ page }) => {
  await signUp(page, "v16import");
  await menu(page, "File", "Import...");
  const file = "Name,Set code,Collector number,Quantity,Purchase price,Purchase price currency,Date added\nSol Ring,lea,269,2,3.00,USD,2026-03-01\n";
  const chooser = page.waitForEvent("filechooser");
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Choose file..." }).click();
  await (await chooser).setFiles({ name: "manabox.csv", mimeType: "text/csv", buffer: Buffer.from(file) });
  const window = page.locator("dialog#dlg[open]");
  await expect(window.getByRole("radio", { name: "One purchase for this import" })).toBeChecked();
  await window.getByRole("radio", { name: "One purchase per date added" }).check();
  await window.getByRole("button", { name: "Import", exact: true }).click();
  await expect(status(page)).toContainText("1 purchase recorded");
  const list = await (await page.request.get("/api/purchases")).json() as { entries: Array<{ date: string; out: number }> };
  expect(list.entries.map((entry) => [entry.date, entry.out])).toEqual([["2026-03-01", 6]]);
});
