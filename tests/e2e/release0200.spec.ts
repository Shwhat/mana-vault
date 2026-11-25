// Browser tests for 0.20.0: the Product name field with the named products of a set, opening a named Commander deck
// with its decklist, and the Custom sets tab with a symbol for each rarity.
import type { Page } from "@playwright/test";
import { choose, menu, modeTab, signUp, status, test, expect } from "./fixtures";

const MAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
const RARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>';

async function newPurchase(page: Page) {
  await modeTab(page, "Purchases");
  await page.locator("#view-purchases").getByRole("button", { name: "New entry..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Purchase", exact: true }).click();
  const editor = page.locator("dialog#dlg[open] .purchaseedit");
  await expect(editor).toBeVisible();
  return editor;
}

async function upload(page: Page, row: string, name: string, svg: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("group", { name: `${row} symbol`, exact: true }).getByRole("button", { name: "Upload..." }).click();
  await (await chooser).setFiles({ name, mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
}

test("a named Commander deck is picked from the set's products and opens with its decklist", async ({ page }) => {
  await signUp(page, "v20deck");
  const editor = await newPurchase(page);
  await editor.locator("#pe-date").fill("2026-11-01");
  await editor.locator("#pe-place").fill("Local shop");
  await editor.getByRole("button", { name: "Add product" }).click();
  await choose(page, editor.getByRole("button", { name: /^Product of line 1/ }), "commander_deck");
  await choose(page, editor.getByRole("button", { name: /^Set of line 1/ }), "lea");
  const name = editor.getByRole("combobox", { name: "Name of line 1" });
  await name.fill("land");
  const options = page.locator("#pe-name-0-list .pkopt");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("Alpha Commander Deck - Landing Party, decklist");
  await options.first().click();
  await expect(name).toHaveValue("Landing Party");
  await expect(editor.locator(".pelines tbody tr").first().locator(".comboadd")).toHaveText("Listed product, with decklist");
  expect(await name.evaluate((input) => input.matches(":placeholder-shown"))).toBe(false);
  const inputBox = await name.boundingBox();
  const statusBox = await editor.locator(".pelines tbody tr").first().locator(".comboadd").boundingBox();
  const productBox = await editor.getByRole("button", { name: /^Product of line 1/ }).boundingBox();
  expect(productBox!.y + productBox!.height).toBeLessThanOrEqual(inputBox!.y);
  expect(Math.abs(productBox!.x - inputBox!.x)).toBeLessThan(1);
  expect(Math.abs(productBox!.width - inputBox!.width)).toBeLessThan(1);
  expect(statusBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height);
  await editor.getByRole("textbox", { name: "Total of line 1" }).fill("60");
  await editor.getByRole("button", { name: "Save purchase" }).click();
  await expect(status(page)).toHaveText("Purchase of 2026-11-01 saved");

  const entry = page.locator(".purchaseentry");
  const row = entry.locator("tbody tr", { hasText: "Commander deck" });
  await expect(row).toContainText("Landing Party");
  await row.getByRole("button", { name: "Open..." }).click();
  const dialog = page.locator("dialog#dlg[open]");
  await expect(dialog.getByRole("checkbox", { name: "Add the decklist of Landing Party" })).toBeChecked();
  await dialog.getByRole("button", { name: "Open", exact: true }).click();
  await expect(status(page)).toHaveText("7 cards of Landing Party added to Main collection and tied to Landing Party, Limited Edition Alpha (Purchase of Nov 1)");
  // the deck's cards are in the collection, the commander foil
  const main = ((await (await page.request.get("/api/collections")).json()) as Array<{ id: string }>)[0]!.id;
  const cards = await (await page.request.get(`/api/collections/${main}/cards`)).json() as Array<{ id: string; foil: number; quantity: number }>;
  expect(cards.find((card) => card.id === "llanowar")?.quantity).toBe(4);
  expect(cards.find((card) => card.id === "serra")?.foil).toBe(1);
  // Edit, Undo takes the opening and its cards back out
  await menu(page, "Edit", "Undo");
  await expect(status(page)).toHaveText("Undone: Open Landing Party, Limited Edition Alpha (Purchase of Nov 1)");
  const after = await (await page.request.get(`/api/collections/${main}/cards`)).json() as Array<{ id: string }>;
  expect(after.find((card) => card.id === "llanowar")).toBeUndefined();
});

test("choose a precon for an unmatched Commander deck, before or after opening", async ({ page }) => {
  await signUp(page, "chooseprecon");
  const editor = await newPurchase(page);
  await editor.getByRole("button", { name: "Add product" }).click();
  await choose(page, editor.getByRole("button", { name: /^Product of line 1/ }), "commander_deck");
  await choose(page, editor.getByRole("button", { name: /^Set of line 1/ }), "lea");
  await editor.getByRole("combobox", { name: "Name of line 1" }).fill("Deck Landing Party");
  await editor.getByRole("spinbutton", { name: "Quantity of line 1" }).fill("2");
  await editor.getByRole("button", { name: "Save purchase" }).click();

  const row = page.locator(".purchaseentry tbody tr", { hasText: "Deck Landing Party" });
  await row.getByRole("button", { name: "Open...", exact: true }).click();
  let dialog = page.locator("dialog#dlg[open]");
  await dialog.locator("#op-count").fill("1");
  await dialog.getByRole("button", { name: "Open", exact: true }).click();
  const opening = page.locator(".packrow").filter({ hasText: "Deck Landing Party" }).first();
  await expect(opening).toContainText("0 cards");
  await opening.getByRole("button", { name: "Add decklist..." }).click();
  dialog = page.locator("dialog#dlg[open]");
  await dialog.getByRole("textbox", { name: "Find a precon" }).fill("Landing Party");
  await dialog.getByRole("option", { name: /Landing Party/ }).click();
  await dialog.getByRole("button", { name: "Add cards", exact: true }).click();
  await expect(opening).toContainText("7 cards");
  const main = ((await (await page.request.get("/api/collections")).json()) as Array<{ id: string }>)[0]!.id;
  const quantity = async () => ((await (await page.request.get(`/api/collections/${main}/cards`)).json()) as Array<{ id: string; quantity: number }>).find((card) => card.id === "llanowar")?.quantity ?? 0;
  expect(await quantity()).toBe(4);
  await menu(page, "Edit", "Undo");
  await expect(opening).toContainText("0 cards");
  expect(await quantity()).toBe(0);
  await menu(page, "Edit", "Redo");
  await expect(opening).toContainText("7 cards");
  expect(await quantity()).toBe(4);

  await row.getByRole("button", { name: "Open...", exact: true }).click();
  dialog = page.locator("dialog#dlg[open]");
  await dialog.getByRole("button", { name: "Choose a decklist..." }).click();
  await dialog.getByRole("textbox", { name: "Find a precon" }).fill("Landing Party");
  await dialog.getByRole("option", { name: /Landing Party/ }).click();
  await expect(dialog.getByRole("checkbox", { name: "Add the decklist of Landing Party" })).toBeChecked();
  await dialog.getByRole("button", { name: "Open", exact: true }).click();
  await expect.poll(quantity).toBe(8);
  await expect(page.locator(".packrow").filter({ hasText: "Deck Landing Party" })).toHaveCount(2);
});

test("preview and add a bundle's fixed contents to an opening", async ({ page }) => {
  await signUp(page, "bundlecontents");
  const editor = await newPurchase(page);
  await editor.getByRole("button", { name: "Add product" }).click();
  await choose(page, editor.getByRole("button", { name: /^Product of line 1/ }), "bundle");
  await choose(page, editor.getByRole("button", { name: /^Set of line 1/ }), "lea");
  const name = editor.getByRole("combobox", { name: "Name of line 1" });
  await name.fill("beam");
  await page.locator("#pe-name-0-list .pkopt").first().click();
  await editor.getByRole("button", { name: "Save purchase" }).click();
  await page.locator(".purchaseentry tbody tr", { hasText: "Beam Me Up Bundle" }).getByRole("button", { name: "Open..." }).click();
  await page.locator("dialog#dlg[open]").getByRole("button", { name: "Open", exact: true }).click();
  const opening = page.locator(".packrow").filter({ hasText: "Beam Me Up Bundle" }).first();
  await opening.getByRole("button", { name: "Product contents..." }).click();
  const dialog = page.locator("dialog#dlg[open]");
  await expect(dialog).toContainText("fixed contents for one product");
  await expect(dialog).toContainText("Variable contents are not added");
  await expect(dialog).toContainText("Serra Angel");
  await dialog.getByRole("button", { name: "Add fixed cards" }).click();
  await expect(opening).toContainText("8 cards");
  await menu(page, "Edit", "Undo");
  await expect(opening).toContainText("0 cards");
  await menu(page, "Edit", "Redo");
  await expect(opening).toContainText("8 cards");
});

test("a starter collection can record its included booster packs", async ({ page }) => {
  await signUp(page, "starterpacks");
  const editor = await newPurchase(page);
  await editor.getByRole("button", { name: "Add product" }).click();
  await choose(page, editor.getByRole("button", { name: /^Product of line 1/ }), "starter_collection");
  await editor.getByRole("spinbutton", { name: "Packs in line 1" }).fill("3");
  await editor.getByRole("button", { name: "Save purchase" }).click();
  await page.locator(".purchaseentry tbody tr", { hasText: "Starter collection" }).getByRole("button", { name: "Open..." }).click();
  await expect(page.locator("dialog#dlg[open]")).toContainText("of 3 packs left");
});

test("the product selector and name remain stacked at phone width", async ({ page }) => {
  await signUp(page, "buyproductphone");
  const editor = await newPurchase(page);
  await editor.getByRole("button", { name: "Add product" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const picker = await editor.getByRole("button", { name: /^Product of line 1/ }).boundingBox();
  const input = await editor.getByRole("combobox", { name: "Name of line 1" }).boundingBox();
  expect(picker!.y + picker!.height).toBeLessThanOrEqual(input!.y);
  expect(Math.abs(picker!.x - input!.x)).toBeLessThan(1);
  expect(Math.abs(picker!.width - input!.width)).toBeLessThan(1);
});

test("the purchase set picker shows a newly created empty custom set and its symbol", async ({ page }) => {
  await signUp(page, "buyset");
  let editor = await newPurchase(page);
  await editor.getByRole("button", { name: "Add product" }).click();
  await expect(editor.getByRole("button", { name: /^Set of line 1/ })).toBeVisible();
  await page.locator("dialog#dlg[open] .dlgbtns").getByRole("button", { name: "Cancel" }).click();

  const code = `p${Date.now().toString(36).slice(-4)}`;
  const symbol = `data:image/svg+xml;base64,${Buffer.from(MAIN_SVG).toString("base64")}`;
  const created = await page.request.post("/api/custom/sets", { headers: { "x-mana-vault": "1" }, data: { code, name: "Purchase Symbol Set", symbol } });
  expect(created.status()).toBe(201);
  try {
    editor = await newPurchase(page);
    await editor.getByRole("button", { name: "Add product" }).click();
    const picker = editor.getByRole("button", { name: /^Set of line 1/ });
    await choose(page, picker, code);
    await expect(picker).toContainText("Purchase Symbol Set");
    const icon = picker.locator("img.setico");
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  } finally {
    expect((await page.request.delete(`/api/custom/sets/${code}`, { headers: { "x-mana-vault": "1" } })).status()).toBe(200);
  }
});

test("the Custom sets tab makes a set with a main and a rare symbol, and the card maker opens it", async ({ page, browser }) => {
  await signUp(page, "v20sets");
  await modeTab(page, "Proxies");
  await page.getByRole("tab", { name: "Custom sets" }).click();
  const code = `r${Date.now().toString(36).slice(-4)}`.toUpperCase();
  await page.locator(".setmaker .makerlist").getByRole("button", { name: "New set" }).click();
  await page.locator("#sm-code").fill(code);
  await page.locator("#sm-name").fill("Rare Woods");
  await upload(page, "Main", "main.svg", MAIN_SVG);
  await upload(page, "Rare", "rare.svg", RARE_SVG);
  await expect(page.getByRole("group", { name: "Common symbol", exact: true })).toContainText("Uses the main symbol");
  await expect(page.locator(".setmaker .makerform .note").first()).toHaveText("Not saved yet");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(status(page)).toHaveText(`Custom set ${code} created`);
  await expect(page.locator(".setmaker .makerlist .navitem", { hasText: "Rare Woods" })).toContainText(code);
  const sets = await (await page.request.get("/api/custom/sets")).json() as Array<{ code: string; rarities: Record<string, unknown> }>;
  expect(Object.keys(sets.find((set) => set.code === code.toLowerCase())!.rarities)).toEqual(["rare"]);
  await expect(page.getByRole("group", { name: "Rare symbol", exact: true }).locator("img.setsym")).toBeVisible();
  // the sample card follows the rarity chosen
  await choose(page, page.locator("#sm-rarity"), "mythic");
  await expect(page.locator(".setmaker canvas.cardcanvas")).toHaveAttribute("aria-label", "Sample mythic rare card");

  // New card in this set opens the card maker; the Custom sets tab (0.21.0: no Custom sets... button there) keeps the set
  await page.locator(".setmaker .makerform").getByRole("button", { name: "New card in this set" }).click();
  await expect(page.getByRole("tab", { name: "Card maker" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#cm-set")).toContainText(`Rare Woods (${code})`);
  await expect(page.getByRole("button", { name: "Custom sets...", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Custom sets" }).click();
  await expect(page.getByRole("tab", { name: "Custom sets" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#sm-name")).toHaveValue("Rare Woods");

  // another account sees the set read only
  const context = await browser.newContext();
  const other = await context.newPage();
  await signUp(other, "v20other");
  await modeTab(other, "Proxies");
  await other.getByRole("tab", { name: "Custom sets" }).click();
  await other.locator(".setmaker .makerlist .navitem", { hasText: "Rare Woods" }).click();
  await expect(other.locator(".setmaker .makerform")).toContainText("Only its maker can change it.");
  await expect(other.locator("#sm-name")).toBeDisabled();
  await expect(other.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await context.close();
});
