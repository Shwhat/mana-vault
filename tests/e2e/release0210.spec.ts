// Browser tests for 0.21.0: tabs that keep their place, New collection... in a collection list, Change collection... on
// a pack, the main price source and the card page's new tabs.
import type { Page } from "@playwright/test";
import { choose, menu, modeTab, signUp, status, test, expect } from "./fixtures";

async function boosterPurchase(page: Page) {
  await modeTab(page, "Purchases");
  await page.locator("#view-purchases").getByRole("button", { name: "New entry..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Purchase", exact: true }).click();
  const editor = page.locator("dialog#dlg[open] .purchaseedit");
  await editor.locator("#pe-date").fill("2026-11-01");
  await editor.locator("#pe-place").fill("Local shop");
  await editor.getByRole("button", { name: "Add product" }).click();
  await choose(page, editor.getByRole("button", { name: /^Product of line 1/ }), "play_booster");
  await choose(page, editor.getByRole("button", { name: /^Set of line 1/ }), "lea");
  await editor.getByRole("spinbutton", { name: "Quantity of line 1" }).fill("3");
  await editor.getByRole("textbox", { name: "Total of line 1" }).fill("15");
  await editor.getByRole("button", { name: "Save purchase" }).click();
  await expect(status(page)).toHaveText("Purchase of 2026-11-01 saved");
}

test("each tab opens where it was left, and pressing it again goes back to its first screen", async ({ page }) => {
  await signUp(page, "v21tabs");
  await boosterPurchase(page);
  await expect(page.locator(".purchaseentry")).toBeVisible();
  // a card page opened from Search belongs to Search
  await modeTab(page, "Search");
  await page.locator("#view-cards input[type=search], #view-cards .searchbox input").first().fill("Shivan");
  await modeTab(page, "Purchases");
  // the entry that was open is shown again
  await expect(page.locator(".purchaseentry")).toBeVisible();
  // pressing Purchases while it is shown goes back to Summary
  await modeTab(page, "Purchases");
  await expect(page.locator(".purchaseentry")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true");
  // History kept with its find box
  await page.getByRole("tab", { name: "History" }).click();
  await modeTab(page, "Search");
  await modeTab(page, "Purchases");
  await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
});

test("New from the decks list can create a deck from a precon", async ({ page }) => {
  await signUp(page, "newprecon");
  await page.locator('.tab[data-panel="decks"]').click();
  const panel = page.locator(".pbody", { has: page.getByRole("textbox", { name: "Find a deck" }) });
  await panel.getByRole("button", { name: "New..." }).click();
  let dialog = page.locator("dialog#dlg[open]");
  await expect(dialog.locator(".dlghead")).toHaveText("New deck");
  await dialog.getByRole("button", { name: "Choose a precon..." }).click();
  await expect(dialog.locator(".dlghead")).toHaveText("Add precon as deck");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await (await page.request.get("/api/decks")).json()).toEqual([]);
  await panel.getByRole("button", { name: "New..." }).click();
  dialog = page.locator("dialog#dlg[open]");
  await dialog.getByRole("button", { name: "Choose a precon..." }).click();
  await dialog.getByRole("textbox", { name: "Find a precon" }).fill("Landing Party");
  await dialog.getByRole("option", { name: /Landing Party/ }).click();
  await expect(page.locator("#view-deck .switcher")).toContainText("Landing Party");
  await expect(status(page)).toHaveText("Landing Party made with 7 cards");
  const decks = await (await page.request.get("/api/decks")).json() as Array<{ id: string; name: string }>;
  expect(decks).toHaveLength(1);
  const detail = await (await page.request.get(`/api/decks/${decks[0]!.id}`)).json() as { cards: Array<{ card_id: string; quantity: number; finish: number }> };
  expect(detail.cards).toEqual(expect.arrayContaining([
    expect.objectContaining({ card_id: "serra", quantity: 1, finish: 1 }),
    expect.objectContaining({ card_id: "llanowar", quantity: 4, finish: 0 }),
    expect.objectContaining({ card_id: "swords", quantity: 2, finish: 0 }),
  ]));
});

test("New collection... makes a collection from the Open window, and Change collection... moves the pulls", async ({ page }) => {
  await signUp(page, "v21coll");
  await boosterPurchase(page);
  const row = page.locator(".purchaseentry tbody tr", { hasText: "Play booster" });
  await row.getByRole("button", { name: "Open..." }).click();
  const dialog = page.locator("dialog#dlg[open]");
  await choose(page, dialog.locator("#op-coll"), "__new_collection__");
  const name = dialog.getByRole("textbox", { name: "Name of the new collection" });
  await expect(name).toHaveValue("Limited Edition Alpha Play boosters");
  await name.fill("Alpha pulls");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.locator("#op-coll")).toContainText("Alpha pulls");
  await dialog.getByRole("button", { name: "Open", exact: true }).click();
  await expect(status(page)).toContainText("cards added to Alpha pulls are tied to it");
  const collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string; name: string }>;
  const pulls = collections.find((item) => item.name === "Alpha pulls")!;
  const main = collections.find((item) => item.name === "Main collection")!;
  await page.request.post(`/api/collections/${pulls.id}/cards/add`, { headers: { "x-mana-vault": "1" }, data: { items: [{ cardId: "shivan", foil: 0, condition: "NM", language: "en", proxy: false, quantity: 1 }] } });
  // the status bar offers Change collection... for the pack being opened
  await page.locator("#st-changecoll").click();
  const change = page.locator("dialog#dlg[open]");
  await choose(page, change.locator("#cc-coll"), main.id);
  await change.getByRole("radio", { name: "Move them to the new collection" }).check();
  await change.getByRole("button", { name: "Change", exact: true }).click();
  await expect(status(page)).toContainText("now goes to Main collection; 1 card moved there");
  const moved = await (await page.request.get(`/api/collections/${main.id}/cards`)).json() as Array<{ id: string }>;
  expect(moved.some((card) => card.id === "shivan")).toBe(true);
  await menu(page, "Edit", "Undo");
  await expect(status(page)).toContainText("Undone: Change the collection of");
  const back = await (await page.request.get(`/api/collections/${pulls.id}/cards`)).json() as Array<{ id: string }>;
  expect(back.some((card) => card.id === "shivan")).toBe(true);
});

test("the main price source is chosen in the View menu and the card page has Prices and Found in", async ({ page }) => {
  await signUp(page, "v21price");
  await menu(page, "View", "Main price source...");
  const dialog = page.locator("dialog#dlg[open]");
  await choose(page, dialog.locator("#f-source"), "cardkingdom");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(status(page)).toHaveText("Prices now come from Card Kingdom");
  const prefs = await (await page.request.get("/api/prefs")).json() as { mainPriceSource: string };
  expect(prefs.mainPriceSource).toBe("cardkingdom");
  const card = await (await page.request.get("/api/cards/shivan/market")).json() as { mainSource: string; prices: Array<{ store: string }> };
  expect(card.mainSource).toBe("cardkingdom");
  expect(card.prices.map((row) => row.store)).toEqual(["tcgplayer", "cardkingdom", "cardsphere", "cardmarket", "cardhoarder", "scryfall"]);
});
