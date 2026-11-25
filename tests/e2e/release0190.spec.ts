// Browser tests for 0.19.0: the printing chooser's Grid, List and Binder, Finish lines in the card layout, Undo and Redo
// in the top bar, picking several purchase entries and cards, Add existing copies... by collection, Match cards after
// reading a receipt, and packs opened one at a time.
import type { Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { menu, modeTab, search, signUp, status, test, expect } from "./fixtures";

const headers = { "x-mana-vault": "1" };
const copy = (cardId: string, quantity = 1, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", proxy: false, quantity });

async function mainCollection(page: Page): Promise<string> {
  return ((await (await page.request.get("/api/collections")).json()) as Array<{ id: string }>)[0]!.id;
}

async function openEntry(page: Page, id: string) {
  await modeTab(page, "Purchases");
  await page.evaluate((entryId) => window.dispatchEvent(new CustomEvent("mana-vault:purchases", { detail: entryId })), id);
  await expect(page.locator(".purchaseentry")).toBeVisible();
}

test("the printing chooser shows printings in Grid, List or Binder with the set symbol at text size", async ({ page }) => {
  await signUp(page, "v19chooser");
  await search(page, "Lightning Bolt");
  await page.locator("#view-cards .row", { hasText: "Lightning Bolt" }).first().getByRole("button", { name: /^Add Lightning Bolt to / }).click();
  const chooser = page.locator("dialog#dlg[open] .printpick");
  await expect(chooser).toHaveClass(/layout-grid/);
  await expect(chooser.locator(".printcard")).toHaveCount(2);
  const symbol = await chooser.locator(".printcard", { hasText: "Limited Edition Alpha" }).locator(".setico").boundingBox();
  expect(symbol!.width).toBeLessThanOrEqual(20);
  await expect(chooser.getByRole("button", { name: "Foil M10 146" })).toBeVisible();
  // List and Binder, kept for the account
  await chooser.getByRole("button", { name: /^Options/ }).click();
  await page.locator(".optpop").getByRole("button", { name: "List" }).click();
  await expect(chooser).toHaveClass(/layout-list/);
  await page.locator(".optpop").getByRole("button", { name: "Binder" }).click();
  await expect(chooser).toHaveClass(/layout-binder/);
  await expect.poll(async () => (await (await page.request.get("/api/prefs")).json()).chooserLayout).toBe("binder");
  // clicking a printing takes its highlighted finish
  await chooser.locator(".printcard", { hasText: "Magic 2010" }).locator(".pcpic").click();
  await expect(status(page)).toHaveText("Lightning Bolt added to Main collection");
});

test("Finish lines are a card layout item; hidden, a click on the picture asks which kind of copy", async ({ page }) => {
  await signUp(page, "v19lines", true);
  const main = await mainCollection(page);
  await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("bolt-m10", 1), copy("bolt-m10", 1, 1)] } });
  await page.reload();
  await page.waitForSelector("#titlebar");
  await modeTab(page, "Collection");
  const lines = page.getByRole("group", { name: "Copies of Lightning Bolt (M10) 146" });
  await expect(lines).toBeVisible();
  await menu(page, "View", "Card layout...");
  const editor = page.locator("dialog#dlg[open] .cleditor");
  await editor.getByRole("button", { name: "Finish lines" }).click();
  await editor.locator('.clzone[data-slot="off"]').click();
  await page.keyboard.press("Escape");
  await expect(lines).toHaveCount(0);
  await page.locator('#view-collection .pocket[title^="Lightning Bolt"]').click();
  const ask = page.locator("dialog#dlg[open] .kindchoice");
  await expect(ask.locator(".kindrow")).toHaveCount(2);
  await ask.locator(".kindrow", { hasText: "FOIL" }).click();
  await expect(page.locator("dialog#dlg[open]")).toHaveCount(0);
  await expect(page.locator("#st-msg")).not.toHaveText(/Could not/);
});

test("Undo and Redo buttons in the top bar name the change and are greyed out with nothing to do", async ({ page }) => {
  await signUp(page, "v19undo");
  const undo = page.locator('#titlebar button[data-action="undo"]');
  const redo = page.locator('#titlebar button[data-action="redo"]');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await search(page, "Sol Ring");
  await page.locator("#view-cards .row", { hasText: "Sol Ring" }).first().getByRole("button", { name: /^Add Sol Ring to / }).click();
  await page.locator("dialog#dlg[open] .finishchoice").getByRole("button", { name: /^Regular/ }).click();
  await expect(status(page)).toHaveText("Sol Ring added to Main collection");
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAttribute("title", /^Undo .*Sol Ring.*\(Ctrl\+Z\)$/);
  await undo.click();
  await expect(status(page)).toContainText("Undone");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(status(page)).toContainText("Redone");
});

test("several history entries are deleted at once with one undo step", async ({ page }) => {
  await signUp(page, "v19multi");
  for (const date of ["2026-11-01", "2026-11-02", "2026-11-03"]) {
    await page.request.post("/api/purchases", { headers, data: { kind: "purchase", date, place: "Shop", currency: "usd", tax: 0, shipping: 0, lines: [{ product: "bundle", setCode: "lea", quantity: 1, cost: 40 }] } });
  }
  await modeTab(page, "Purchases");
  await page.locator("#view-purchases").getByRole("tab", { name: "History" }).click();
  const rows = page.locator(".ptable tbody tr.prow-entry");
  await expect(rows).toHaveCount(3);
  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.locator(".pickbar")).toContainText("3 picked");
  await page.locator(".pickbar").getByRole("button", { name: "Delete picked..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("3 entries deleted");
  await expect(rows).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(3);
});

test("Add existing copies... lists the opening's collection, picks copies and ties them in one step", async ({ page }) => {
  await signUp(page, "v19tie");
  const main = await mainCollection(page);
  await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("counterspell", 2), copy("serra", 1)] } });
  const entry = await (await page.request.post("/api/purchases", { headers, data: {
    kind: "purchase", date: "2026-11-05", place: "Shop", currency: "usd", tax: 0, shipping: 0, lines: [{ product: "play_booster", setCode: "lea", quantity: 2, cost: 10 }],
  } })).json() as { id: string; lines: Array<{ id: string }> };
  await page.request.post(`/api/purchases/${entry.id}/lines/${entry.lines[0]!.id}/open`, { headers, data: { count: 1, collectionId: main } });
  await page.reload();
  await page.waitForSelector("#titlebar");
  await openEntry(page, entry.id);
  await page.locator(".purchaseentry").getByRole("button", { name: "Add existing copies..." }).first().click();
  const window = page.locator("dialog#dlg[open] .tiecopies");
  await expect(window.getByRole("button", { name: "Collection" })).toContainText("Main collection");
  await expect(window.locator(".tierow")).toHaveCount(2);
  await window.getByRole("checkbox", { name: /Pick Counterspell/ }).check();
  await expect(window.locator(".tiechosen tbody tr", { hasText: "Counterspell" }).getByRole("spinbutton")).toHaveValue("2");
  await window.getByRole("button", { name: "Tie to the opening" }).click();
  await expect(status(page)).toHaveText("2 cards tied to the opening");
  await expect(page.locator(".purchaseentry tbody tr", { hasText: "Counterspell" })).toBeVisible();
});

test("a read receipt sends card lines to Match cards, and they become single cards", async ({ page }) => {
  await signUp(page, "v19receipt");
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([400, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const rows = ["Order #A-1234", "Confirmed Oct 30", "Buy again", "Lightning Bolt [Magic 2010] $12.00", "Near Mint Foil", "Sol Ring $3.00", "Near Mint", "Bundle Limited Edition Alpha $40.00", "Taxes $4.00", "Total $59.00"];
  rows.forEach((text, index) => sheet.drawText(text, { x: 20, y: 370 - index * 24, size: 12, font }));
  const bytes = Buffer.from(await pdf.save());
  await modeTab(page, "Purchases");
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#view-purchases").getByRole("button", { name: "Read receipt..." }).click();
  await (await chooser).setFiles({ name: "order.pdf", mimeType: "application/pdf", buffer: bytes });
  const match = page.locator("dialog#dlg[open] .matchcards");
  await expect(match.locator(".matchrow")).toHaveCount(2);
  const bolt = match.locator(".matchrow", { hasText: "Lightning Bolt" });
  await expect(bolt).toContainText("(M10) 146");
  await expect(bolt.locator(".badge.foil")).toHaveText("FOIL");
  await bolt.getByRole("button", { name: "OK" }).click();
  await match.getByRole("button", { name: "Continue" }).click();
  const editor = page.locator("dialog#dlg[open] .purchaseedit");
  await expect(editor.locator(".pesingles tbody tr")).toHaveCount(2);
  await expect(editor.locator("#pe-tax")).toHaveValue(/^4(\.00)?$/);
  await expect(editor.locator("#pe-note, input[aria-label='Note']").first()).toHaveValue("Order #A-1234");
});

test("receipt matching warns when the suggested foil type may be wrong", async ({ page }) => {
  await signUp(page, "receiptfoilwarning");
  await page.route("**/api/purchases/receipts/read", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const card = body.fields.lines[0].card;
    card.promoTypes = "surgefoil";
    card.warning = "The guessed printing's foil type may not match the receipt. Check the printing.";
    await route.fulfill({ response, json: body });
  });
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([400, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  ["Lightning Bolt [Magic 2010] $12.00", "Near Mint Foil"].forEach((text, index) => sheet.drawText(text, { x: 20, y: 370 - index * 24, size: 12, font }));
  await modeTab(page, "Purchases");
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#view-purchases").getByRole("button", { name: "Read receipt..." }).click();
  await (await chooser).setFiles({ name: "order.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  const bolt = page.locator("dialog#dlg[open] .matchrow", { hasText: "Lightning Bolt" });
  await expect(bolt.locator(".badge.foil")).toHaveText("SURGE FOIL");
  await expect(bolt.locator(".note.err")).toContainText("foil type may not match");
  await bolt.getByRole("button", { name: "OK" }).click();
  await expect(bolt.locator(".note.err")).toHaveCount(0);
});

test("opening packs one at a time: Next pack, figures per pack and Move to pack", async ({ page }) => {
  await signUp(page, "v19packs");
  const main = await mainCollection(page);
  const entry = await (await page.request.post("/api/purchases", { headers, data: {
    kind: "purchase", date: "2026-11-06", place: "Shop", currency: "usd", tax: 0, shipping: 0, lines: [{ product: "booster_box", setCode: "lea", quantity: 1, cost: 72, packs: 36 }],
  } })).json() as { id: string };
  await page.reload();
  await page.waitForSelector("#titlebar");
  await openEntry(page, entry.id);
  await page.locator(".purchaseentry tbody tr", { hasText: "Booster box" }).getByRole("button", { name: "Open..." }).click();
  await expect(page.locator("dialog#dlg[open]")).toContainText("of 36 packs left");
  await page.locator("#op-count").fill("2");
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#st-opening")).toContainText("PACK 1 OF 36");
  await expect(page.locator("#st-opening")).toContainText("(1 OF 2)");
  await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("serra", 1), copy("swords", 1)] } });
  await page.locator("#st-nextpack").click();
  await expect(page.locator("#st-opening")).toContainText("PACK 2 OF 36");
  await expect(page.locator("#st-nextpack")).toHaveCount(0);
  await openEntry(page, entry.id);
  await expect(page.locator(".purchaseentry tbody tr", { hasText: "Booster box" })).toContainText("2 of 36 packs opened, 34 left");
  await expect(page.locator(".packrow").first()).toContainText("Pack cost");
  // Move to pack: Serra Angel was in pack 2
  await page.locator(".purchaseentry tbody tr", { hasText: "Serra Angel" }).getByRole("button", { name: "Move to pack..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: /^Pack 2 of 36/ }).click();
  await expect(status(page)).toContainText("Serra Angel moved to Pack 2 of 36");
  await expect(page.locator(".purchaseentry tbody tr", { hasText: "Serra Angel" })).toContainText("Pack 2");
});

test("multiple packs can be paused and resumed later", async ({ page }) => {
  await signUp(page, "v19pausepacks");
  const main = await mainCollection(page);
  const entry = await (await page.request.post("/api/purchases", { headers, data: {
    kind: "purchase", date: "2026-11-06", place: "Shop", currency: "usd", tax: 0, shipping: 0, lines: [{ product: "booster_box", setCode: "lea", quantity: 1, cost: 72, packs: 36 }],
  } })).json() as { id: string };
  await page.reload();
  await page.waitForSelector("#titlebar");
  await openEntry(page, entry.id);
  await page.locator(".purchaseentry tbody tr", { hasText: "Booster box" }).getByRole("button", { name: "Open..." }).click();
  await page.locator("#op-count").fill("3");
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Open", exact: true }).click();
  const first = page.locator(".packrow", { hasText: "Pack 1 of 36" });
  await expect(first.getByRole("button", { name: "Next pack" })).toBeVisible();
  expect((await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("serra")] } })).ok()).toBeTruthy();
  await first.getByRole("button", { name: "Done opening" }).click();
  await expect(status(page)).toHaveText("Done opening");
  await expect(page.locator("#st-opening")).toHaveCount(0);
  expect((await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("swords")] } })).ok()).toBeTruthy();

  await page.reload();
  await page.waitForSelector("#titlebar");
  await openEntry(page, entry.id);
  await expect(first.getByRole("button", { name: "Continue opening" })).toBeVisible();
  await expect(page.locator(".packrow.waiting")).toHaveCount(2);
  await first.getByRole("button", { name: "Continue opening" }).click();
  await expect(page.locator("#st-opening")).toContainText("PACK 1 OF 36");
  expect((await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("llanowar")] } })).ok()).toBeTruthy();
  await first.getByRole("button", { name: "Next pack" }).click();
  const second = page.locator(".packrow", { hasText: "Pack 2 of 36" });
  await expect(page.locator("#st-opening")).toContainText("PACK 2 OF 36");
  await second.getByRole("button", { name: "Done opening" }).click();
  await expect(page.locator("#st-opening")).toHaveCount(0);
  const third = page.locator(".packrow", { hasText: "Pack 3 of 36" });
  await third.getByRole("button", { name: "Start this pack" }).click();
  await expect(page.locator("#st-opening")).toContainText("PACK 3 OF 36");

  const full = await (await page.request.get(`/api/purchases/${entry.id}`)).json() as {
    openings: Array<{ id: string; packNumber: number; active: boolean; waiting: boolean }>;
    ties: Array<{ cardId: string; openingId: string }>;
  };
  expect(full.openings.map(({ packNumber, active, waiting }) => [packNumber, active, waiting])).toEqual([[1, false, false], [2, false, false], [3, true, false]]);
  expect(full.ties.map(({ cardId, openingId }) => [cardId, openingId])).toEqual(expect.arrayContaining([
    ["serra", full.openings[0]!.id], ["llanowar", full.openings[0]!.id],
  ]));
  expect(full.ties.some(({ cardId }) => cardId === "swords")).toBe(false);
});
