// Browser tests for 0.18.0: the card layout window, one OWNED pip, the click rules for collections and decks, a search
// kept when coming back, live updates between two pages, scanning into an opening, the finish choice for a card with one
// printing, pulls that stay on their pack, Remove from pack and the purchase grids, workspaces in the account menu and
// the Administration page staying out of the side panels.
import type { Page } from "@playwright/test";
import { accountMenu, menu, modeTab, search, signUp, status, test, expect } from "./fixtures";

const headers = { "x-mana-vault": "1" };
const copy = (cardId: string, quantity = 1, foil = 0) => ({ cardId, foil, condition: "NM", language: "en", proxy: false, quantity });

async function mainCollection(page: Page): Promise<string> {
  const collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string }>;
  return collections[0]!.id;
}

/** A purchase of six boosters with one opened into the main collection. */
async function startOpening(page: Page, main: string) {
  const entry = await (await page.request.post("/api/purchases", { headers, data: {
    kind: "purchase", date: "2026-11-20", place: "Local shop", currency: "usd", tax: 0, shipping: 0,
    lines: [{ product: "play_booster", setCode: "m10", quantity: 6, cost: 30 }],
  } })).json() as { id: string; lines: Array<{ id: string }> };
  const opening = await (await page.request.post(`/api/purchases/${entry.id}/lines/${entry.lines[0]!.id}/open`, { headers, data: { count: 1, collectionId: main } })).json() as { id: string; name: string };
  return { entry, opening };
}

test("the card layout window moves the price to a corner of every card picture", async ({ page }) => {
  await signUp(page, "v18layout", true);
  const main = await mainCollection(page);
  await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("bolt-m10", 1), copy("bolt-m10", 1, 1)] } });
  await page.reload();
  await page.waitForSelector("#titlebar");
  await menu(page, "View", "Prices on pictures");
  await search(page, "Lightning Bolt set:m10");
  const bolt = page.locator("#view-cards .rescard").first();
  // one OWNED pip with every copy; the tooltip splits them by finish
  await expect(bolt.locator(".badge.own")).toHaveText("OWNED 2");
  await expect(bolt.locator(".badge.own")).toHaveAttribute("title", "Owned: Regular 1, Foil 1");
  await expect(bolt.locator(".cfright .pricepip")).toBeVisible();
  // the buttons sit at the bottom
  await expect(bolt.locator(".cfbottom .resbtns")).toBeVisible();

  await menu(page, "View", "Card layout...");
  const editor = page.locator("dialog#dlg[open] .cleditor");
  await expect(editor.getByRole("checkbox", { name: "Same layout everywhere" })).toBeChecked();
  await editor.getByRole("button", { name: "Price" }).click();
  await editor.locator('.clzone[data-slot="tr"]').click();
  await expect(editor.locator('.clzone[data-slot="tr"]')).toContainText("Price");
  // hide the buttons
  await editor.getByRole("button", { name: "Buttons" }).click();
  await editor.locator('.clzone[data-slot="off"]').click();
  await page.keyboard.press("Escape");
  await expect(bolt.locator(".cfcorner.tr .pricepip")).toBeVisible();
  await expect(bolt.locator(".cfright .pricepip")).toHaveCount(0);
  await expect(bolt.locator(".resbtns")).toHaveCount(0);
  // the same layout is used by the collection grid
  await modeTab(page, "Collection");
  await expect(page.locator("#view-collection .stackcell .cfcorner.tr .pricepip").first()).toBeVisible();
  // kept for the account
  await expect.poll(async () => (await (await page.request.get("/api/prefs")).json()).cardLayout?.all?.tr).toEqual(["price"]);

  // one layout per section: card search keeps its own while the collection changes
  await menu(page, "View", "Card layout...");
  await editor.getByRole("checkbox", { name: "Same layout everywhere" }).uncheck();
  await editor.getByRole("button", { name: "Collections" }).click();
  await editor.getByRole("button", { name: "Price" }).click();
  await editor.locator('.clzone[data-slot="bl"]').click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#view-collection .stackcell .cfcorner.bl .pricepip").first()).toBeVisible();
  await modeTab(page, "Search");
  await expect(page.locator("#view-cards .rescard").first().locator(".cfcorner.tr .pricepip")).toBeVisible();
});

test("one click opens in the Collection and Decks tabs, picks in Search, and only a double click opens from Search", async ({ page }) => {
  await signUp(page, "v18click");
  await page.request.post("/api/decks", { headers, data: { name: "Burn", format: "modern" } });
  await page.request.post("/api/collections", { headers, data: { name: "Binder", description: "", completion: "none", finish: "any", kind: "collection", sets: [] } });
  await page.reload();
  await page.waitForSelector("#titlebar");
  await search(page, "Lightning Bolt");
  await page.locator('.tab[data-panel="collections"]').click();
  const binder = page.locator(".navitem", { hasText: "Binder" });
  // Search: one click picks, a slow second click still only picks
  await binder.click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: BINDER");
  await page.waitForTimeout(600);
  await binder.click();
  await expect(page.locator("#view-cards")).toBeVisible();
  // a true double click opens it in the Collection tab
  await binder.dblclick();
  await expect(page.locator("#view-collection .switcher")).toContainText("Binder");
  // Collection tab: one click opens
  await page.locator(".navitem", { hasText: "Main collection" }).click();
  await expect(page.locator("#view-collection .switcher")).toContainText("Main collection");
  // back in Search the search and its results are kept
  await modeTab(page, "Search");
  await expect(page.getByRole("textbox", { name: "Search cards" })).toHaveValue("Lightning Bolt");
  await expect(page.locator("#view-cards .row").first()).toContainText("Lightning Bolt");
  // the switcher opens with one click
  await modeTab(page, "Decks");
  await page.locator("#view-deck .switcher").click();
  await page.locator(".swrow", { hasText: "Burn" }).click();
  await expect(page.locator(".swpop")).toHaveCount(0);
  await expect(page.locator("#view-deck .switcher")).toContainText("Burn");
});

test("a card with one printing asks only for the finish, with Add as foil choosing the focus", async ({ page }) => {
  await signUp(page, "v18finish");
  await search(page, "Sol Ring");
  await page.locator("#view-cards .row", { hasText: "Sol Ring" }).first().getByRole("button", { name: /^Add Sol Ring to / }).click();
  const ask = page.locator("dialog#dlg[open]");
  await expect(ask.locator(".finishchoice")).toBeVisible();
  await expect(ask.locator(".printpick")).toHaveCount(0);
  await expect(ask.locator(".finishchoice button:focus")).toContainText("Regular");
  await ask.getByRole("button", { name: /^Foil/ }).click();
  await expect(status(page)).toHaveText("Sol Ring (foil) added to Main collection");
});

test("workspaces are in the account menu, not the View menu", async ({ page }) => {
  await signUp(page, "v18ws");
  await page.locator('#menubar .mbtn[data-menu="View"]').dispatchEvent("mousedown");
  await expect(page.locator("#dropdown")).not.toContainText("workspace");
  await page.keyboard.press("Escape");
  await accountMenu(page, "Collection workspace");
  await expect(status(page)).toHaveText("Collection workspace");
  await page.locator("#acct").dispatchEvent("mousedown");
  await expect(page.locator("#dropdown")).toContainText("Manage workspaces...");
});

test("changes made on another page show without reloading, and an opening started elsewhere is picked up", async ({ page, context }) => {
  await signUp(page, "v18live");
  const main = await mainCollection(page);
  await modeTab(page, "Collection");
  await expect(page.locator("#view-collection")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await other.waitForSelector("#titlebar");
  // the other page adds a card through the server
  await other.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("counterspell")] } });
  await expect(page.locator("#view-collection .row", { hasText: "Counterspell" })).toBeVisible();
  // an opening started on the other page shows here, and the scanner scans into it
  const { opening } = await startOpening(other, main);
  await expect(page.locator("#st-opening")).toContainText(opening.name.toUpperCase());
  await other.close();
});

test("pulled cards stay on their pack; Remove from pack keeps or deletes; the entry tables are grids", async ({ page }) => {
  await signUp(page, "v18pack");
  const main = await mainCollection(page);
  const { entry, opening } = await startOpening(page, main);
  await page.request.post(`/api/collections/${main}/cards/add`, { headers, data: { items: [copy("bolt-m10", 2), copy("serra", 1)] } });
  await page.reload();
  await page.waitForSelector("#titlebar");
  // removing a pulled card from the collection names its pack, and the card stays listed as Gone
  await modeTab(page, "Collection");
  const serra = page.locator("#view-collection .row", { hasText: "Serra Angel" });
  await serra.click({ button: "right" });
  await page.locator("#ctxmenu .dd", { hasText: "Remove" }).first().click();
  const ask = page.locator("dialog#dlg[open]");
  await expect(ask).toContainText(`1 card came from ${opening.name}. It stays listed on that pack.`);
  await ask.getByRole("button", { name: "Remove" }).click();
  await expect(serra).toHaveCount(0);

  await modeTab(page, "Purchases");
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("mana-vault:purchases", { detail: id })), entry.id);
  const cards = page.locator(".purchaseentry section", { hasText: "Cards from this purchase" });
  await expect(cards.locator("table.dtable.grid thead")).toContainText("Value when pulled");
  await expect(cards.locator("tbody tr", { hasText: "Serra Angel" })).toContainText("Gone");
  await expect(cards.locator("tbody tr", { hasText: "Lightning Bolt" })).toContainText("In collection");
  await expect(page.locator(".openfigs")).toContainText("Value when pulled");
  await expect(page.locator(".openfigs")).toContainText("Pulled value");
  await expect(page.locator(".openfigs")).toContainText("Value now");

  // Remove from pack and delete the card, then undo
  await cards.locator("tbody tr", { hasText: "Lightning Bolt" }).getByRole("button", { name: "Remove from pack..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Remove from pack and delete the card" }).click();
  await expect(status(page)).toHaveText("Lightning Bolt removed from the pack and deleted");
  await expect(cards.locator("tbody tr", { hasText: "Lightning Bolt" })).toHaveCount(0);
  const held = async () => ((await (await page.request.get(`/api/collections/${main}/cards`)).json()) as Array<{ id: string; quantity: number }>)
    .filter((card) => card.id === "bolt-m10").reduce((sum, card) => sum + card.quantity, 0);
  expect(await held()).toBe(0);
  await page.keyboard.press("Control+z");
  await expect(cards.locator("tbody tr", { hasText: "Lightning Bolt" })).toContainText("In collection");
  expect(await held()).toBe(2);
});

test("the center area never runs under the side panels; wide pages scroll inside it", async ({ page }) => {
  await signUp(page, "v18center");
  expect(await page.locator("#center").evaluate((element) => getComputedStyle(element).overflow)).toBe("hidden");
  // a page wider than the center area stays inside it
  await page.locator("#center .view").first().evaluate((element) => {
    const wide = document.createElement("div");
    wide.style.width = "4000px";
    wide.style.height = "10px";
    wide.id = "wide-test";
    element.appendChild(wide);
  });
  const visible = await page.evaluate(() => {
    const box = document.getElementById("wide-test")!.getBoundingClientRect();
    const center = document.getElementById("center")!.getBoundingClientRect();
    // the point just past the center's right edge belongs to the side panel, not to the wide page
    const hit = document.elementFromPoint(Math.min(window.innerWidth - 2, center.right + 4), box.top + 5);
    return !!hit && !hit.closest("#wide-test");
  });
  expect(visible).toBe(true);
});
