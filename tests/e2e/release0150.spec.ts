// Browser tests for 0.15.0: the pip bar, custom set menu and Edit set, the one Symbols window, the art library,
// suggestions, set symbols, removed printings, card backs and card languages in Administration.
import type { Page } from "@playwright/test";
import { closeSuggestions, menu, modeTab, search, signUp, status, test, expect, choose } from "./fixtures";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>';
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const svgData = (text: string) => `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`;

async function openMaker(page: Page) {
  await modeTab(page, "Proxies");
  await page.getByRole("tab", { name: "Card maker" }).click();
}

const api = (page: Page, method: "post" | "patch" | "put", url: string, data: unknown) =>
  page.request[method](url, { headers: { "x-mana-vault": "1" }, data });

test("custom sets: right-click menu, Edit set with a new code and an SVG symbol, and undo", async ({ page }) => {
  await signUp(page, "v15sets");
  const code = `q${Date.now().toString(36).slice(-4)}`;
  expect((await api(page, "post", "/api/custom/sets", { code, name: "Quiet Woods", symbol: svgData(SVG) })).status()).toBe(201);
  await openMaker(page);
  await page.getByRole("button", { name: "Custom sets..." }).click();
  const row = page.locator("dialog#dlg[open] .csetrow", { hasText: "Quiet Woods" });
  await expect(row.locator("img.setsym")).toBeVisible();
  await row.click({ button: "right" });
  await expect(page.locator("#ctxmenu .dd")).toHaveText(["Edit set...", "Show its cards", "New card in this set", "Delete..."]);
  await page.locator("#ctxmenu .dd", { hasText: "Edit set..." }).click();
  const edit = page.locator("dialog#dlg[open]");
  await expect(edit.getByRole("checkbox", { name: "Rarity colors (SVG symbols)" })).toBeChecked();
  await edit.locator("#es-name").fill("Quiet Forest");
  const next = `${code}x`.slice(0, 6);
  await edit.locator("#es-code").fill(next.toUpperCase());
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(status(page)).toHaveText(`Quiet Forest (${next.toUpperCase()}) saved`);
  await expect(page.locator("dialog#dlg[open] .csetrow", { hasText: "Quiet Forest" })).toContainText(next.toUpperCase());
  // Edit, Undo puts the name and code back
  await page.keyboard.press("Escape");
  await menu(page, "Edit", "Undo");
  await expect(status(page)).toHaveText("Undone: Edit set Quiet Woods");
  const sets = await (await page.request.get("/api/custom/sets")).json() as Array<{ code: string; name: string }>;
  expect(sets.find((set) => set.code === code)?.name).toBe("Quiet Woods");
});

test("one Symbols window fills the field used last, and suggestions fill the type line", async ({ page }) => {
  await signUp(page, "v15symbols");
  await openMaker(page);
  await expect(page.locator(".makerform").getByRole("button", { name: "Symbols" })).toHaveCount(1);
  await page.locator("#cm-rules").click();
  await page.locator(".makerform").getByRole("button", { name: "Symbols" }).click();
  const window = page.locator(".symwindow");
  await expect(window).toBeVisible();
  await expect(window).toContainText("Into the rules text");
  await window.getByRole("button", { name: "Insert {T}" }).click();
  await expect(page.locator("#cm-rules")).toHaveValue("{T}");
  await page.locator("#cm-manaCost").click();
  await expect(window).toContainText("Into the mana cost");
  await window.getByRole("button", { name: "Insert {G}" }).click();
  await expect(page.locator("#cm-manaCost")).toHaveValue("{G}");
  await expect(page.locator("#cm-rules")).toHaveValue("{T}");
  await window.getByRole("button", { name: "Close" }).click();
  await expect(window).toHaveCount(0);

  await page.locator("#cm-typeLine").pressSequentially("Creature - El");
  const list = page.locator(".suggestlist");
  await expect(list.locator(".suggestitem")).toHaveText(["Elf", "Elemental", "Angel"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#cm-typeLine")).toHaveValue("Creature - Elf");
  await page.locator("#cm-rules").press("End");
  await page.locator("#cm-rules").pressSequentially("\nFly");
  await expect(list.locator(".suggestitem")).toHaveText(["Flying"]);
  await list.locator(".suggestitem").click();
  await expect(page.locator("#cm-rules")).toHaveValue("{T}\nFlying");
});

test("the art library keeps uploads, renames and deletes them, and puts art on the card", async ({ page }) => {
  await signUp(page, "v15art");
  expect((await api(page, "post", "/api/art", { name: "Green hills", picture: PNG })).status()).toBe(201);
  await openMaker(page);
  await page.getByRole("button", { name: "Art library..." }).click();
  const library = page.locator("dialog#dlg[open] .artlibrary");
  const item = library.locator(".artpick", { hasText: "Green hills" });
  await expect(item.locator("img")).toBeVisible();
  await item.click({ button: "right" });
  await expect(page.locator("#ctxmenu .dd")).toHaveText(["Use on this card", "Rename...", "Delete..."]);
  await page.locator("#ctxmenu .dd", { hasText: "Rename..." }).click();
  await library.getByRole("textbox", { name: "New name" }).fill("Rolling hills");
  await library.getByRole("button", { name: "Rename" }).click();
  await expect(library.locator(".artpick", { hasText: "Rolling hills" })).toBeVisible();
  await library.locator(".artpick", { hasText: "Rolling hills" }).click();
  await expect(status(page)).toHaveText("Rolling hills used on the card");
  await expect(page.getByRole("button", { name: "Remove art" })).toBeEnabled();
});

test("card search suggests names and types, and shows set symbols; removed printings are not found", async ({ page }) => {
  await signUp(page, "v15search");
  await page.keyboard.press("/");
  await page.keyboard.type("t:dra");
  await expect(page.locator(".suggestlist .suggestitem")).toHaveText(["Dragon"]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Search cards" })).toHaveValue("t:Dragon");
  await closeSuggestions(page);
  await search(page, "Sol Ring");
  await expect(page.locator("#view-cards .row")).toHaveCount(1);
  // the printing chooser shows the set symbol saved for the set
  const printings = await (await page.request.get("/api/cards/sol-ring/printings")).json() as Array<{ id: string }>;
  expect(printings.map((card) => card.id)).toEqual(["sol-ring"]);
  const sets = await (await page.request.get("/api/sets?q=alpha")).json() as Array<{ code: string; symbolUrl: string | null; block: string | null }>;
  expect(sets[0]).toMatchObject({ code: "lea", block: "Core Set" });
  expect((await page.request.get(sets[0]!.symbolUrl!)).headers()["content-type"]).toContain("image/svg+xml");
});

test("a copy of a removed printing shows Printing removed with Change printing", async ({ page }) => {
  await signUp(page, "v15removed");
  const collections = await (await page.request.get("/api/collections")).json() as Array<{ id: string }>;
  await api(page, "post", `/api/collections/${collections[0]!.id}/cards/add`, { items: [{ cardId: "sol-old", foil: false, condition: "NM", language: "en", quantity: 1 }] });
  await page.reload();
  await page.waitForSelector("#titlebar");
  await modeTab(page, "Collection");
  const pip = page.locator("#view-collection").getByRole("button", { name: "Printing removed" }).first();
  await expect(pip).toBeVisible();
  await pip.click();
  await expect(page.locator("dialog#dlg[open] .printpick .printrow")).toHaveCount(2);
});

test("card backs: the sheet setting asks for an uploaded back", async ({ page }) => {
  await signUp(page, "v15backs");
  await modeTab(page, "Proxies");
  await page.getByRole("tab", { name: "Print" }).click();
  await choose(page, page.locator("#ps-backs"), "mine");
  await expect(page.getByRole("button", { name: "Upload back..." })).toBeVisible();
  expect((await api(page, "put", "/api/card-backs/mine", { picture: PNG })).status()).toBe(200);
  expect(await (await page.request.get("/api/card-backs")).json()).toMatchObject({ mine: true });
  await choose(page, page.locator("#ps-backs"), "none");
});

test("Administration, Card database: card languages with an estimate, and the parts", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#name", "admin");
  await page.fill("#pw", "correct horse");
  await page.locator("#go").click();
  await page.waitForSelector("#titlebar, #ptabs");
  await page.locator("#acct").dispatchEvent("mousedown");
  await page.locator("#dropdown .dd", { hasText: "Administration..." }).click();
  await page.locator("#view-admin").getByRole("link", { name: "Card database" }).click();
  const section = page.locator("#view-admin .admsec", { hasText: "Card languages" });
  await expect(section.getByRole("radio", { name: "English and unofficial languages" })).toBeChecked();
  await section.getByRole("radio", { name: "Chosen languages" }).check();
  await section.getByRole("checkbox", { name: "Japanese" }).check();
  await expect(section).toContainText("Database growth");
  await section.getByRole("button", { name: "Save languages" }).click();
  await expect(status(page)).toHaveText("Card languages saved. The next card database update applies them");
  await expect(page.locator("#view-admin")).toContainText("Set symbols");
  await section.getByRole("radio", { name: "English and unofficial languages" }).check();
  await section.getByRole("button", { name: "Save languages" }).click();
});
