// Browser tests for 0.12.0: Administration and Setup, invite codes, grouped card search, the printing chooser when
// adding, picture stacks with finish lines, the new filters and the About guide on the desktop.
import type { Page } from "@playwright/test";
import { menu, search, signUp, status, test, expect, takePrinting } from "./fixtures";

const guard = { "x-mana-vault": "1" };

async function openAdministration(page: Page) {
  await page.locator("#acct").dispatchEvent("mousedown");
  await page.locator("#dropdown .dd", { hasText: "Administration..." }).click();
  await expect(page.locator("#view-admin")).toBeVisible();
}

test("Administration opens for an admin, Setup can be skipped, and invite codes control sign-up", async ({ page, browser }) => {
  // the test server's first account is its admin
  await page.goto("/login");
  await page.fill("#name", "admin");
  await page.fill("#pw", "correct horse");
  await page.locator("#go").click();
  await page.waitForSelector("#titlebar");
  expect((await (await page.request.get("/api/me")).json()).admin).toBe(true);
  // Setup opens by itself while it is not done
  await page.request.put("/api/admin/settings", { headers: guard, data: { setupDone: false } });
  await page.reload();
  await expect(page.locator("#view-admin h1")).toHaveText("Setup");
  await expect(page.getByRole("checkbox", { name: "Small" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(status(page)).toHaveText("Setup skipped. Everything is in Administration.");
  await expect(page.locator("#view-admin h1")).toHaveText("Pictures");
  await page.getByRole("button", { name: "Close Administration" }).click();
  await expect(page.locator("#view-admin")).toHaveCount(0);

  await openAdministration(page);
  await page.locator(".abtoc a", { hasText: "Sign-up" }).click();
  await page.getByRole("group", { name: "Who can create an account" }).getByRole("button", { name: "Invite codes" }).click();
  await expect(status(page)).toHaveText("Sign-up is invite codes");
  await page.getByRole("button", { name: "New invite code..." }).click();
  await page.locator("#f-note").fill("Alex");
  await page.keyboard.press("Enter");
  const code = (await page.locator("dialog[open] .bigcode").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  await page.locator("dialog[open]").getByRole("button", { name: "Done" }).click();

  // a visitor needs the code to create an account
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto("/login");
  await visitor.getByRole("button", { name: "Create account" }).first().click();
  await expect(visitor.locator("#invite")).toBeVisible();
  const name = `alex${Date.now().toString(36)}`;
  await visitor.fill("#name", name);
  await visitor.fill("#pw", "correct horse");
  await visitor.fill("#pw2", "correct horse");
  await visitor.locator("#go").click();
  await expect(visitor.locator("#msg")).toHaveText("This server needs an invite code to create an account.");
  await visitor.fill("#invite", code);
  await visitor.locator("#go").click();
  await visitor.waitForSelector("#titlebar");
  // accounts that are not admins have no Administration
  await visitor.locator("#acct").dispatchEvent("mousedown");
  await expect(visitor.locator("#dropdown .dd", { hasText: "Change password..." })).toBeVisible();
  await expect(visitor.locator("#dropdown .dd", { hasText: "Administration..." })).toHaveCount(0);
  await context.close();

  await page.locator(".abtoc a", { hasText: "Accounts" }).click();
  await expect(page.locator(".admtable tr", { hasText: name })).toBeVisible();
  await page.request.put("/api/admin/settings", { headers: guard, data: { signup: "open" } });
  await page.locator(".abtoc a", { hasText: "Activity" }).click();
  await expect(page.locator(".admtable")).toContainText("Account created");
});

test("card search groups printings, adding opens the chooser, and the collection grid stacks finishes", async ({ page }) => {
  await signUp(page, "v12", true);
  await search(page, "Lightning Bolt");
  const bolt = page.locator('#view-cards .rescard', { has: page.locator('.pocket[title^="Lightning Bolt,"]') });
  await expect(bolt).toHaveCount(1);
  await expect(bolt.locator(".badge.prints")).toHaveText("2 printings");

  // Show every printing brings back one result per printing
  await page.locator("#view-cards").getByRole("button", { name: /^Options/ }).click();
  await page.locator(".optpop").getByLabel("Show every printing").check();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await expect(bolt).toHaveCount(2);
  await page.locator("#view-cards").getByRole("button", { name: /^Options/ }).click();
  await page.locator(".optpop").getByLabel("Show every printing").uncheck();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await expect(bolt).toHaveCount(1);

  // one add button names where the card goes and opens the printing chooser
  await bolt.getByRole("button", { name: "Add Lightning Bolt to Main collection" }).click();
  await expect(page.locator("dialog[open] .dlghead")).toHaveText("Add Lightning Bolt to Main collection");
  await takePrinting(page);
  await expect(status(page)).toHaveText("Lightning Bolt added to Main collection");
  await bolt.getByRole("button", { name: "Add Lightning Bolt to Main collection" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Foil M10 146" }).click();
  await expect(status(page)).toHaveText("Lightning Bolt (foil) added to Main collection");
  await expect(bolt.locator(".pocket .dmarks")).toHaveText("OWNED 1FOIL 1");

  // the collection grid shows one picture with pips and a line per finish with pips and counts, no prices
  await page.keyboard.press("Escape");
  await page.keyboard.press("2");
  await expect(page.locator(".cardgrid .stackcell")).toHaveCount(1);
  const lines = page.getByRole("group", { name: "Copies of Lightning Bolt (M10) 146" }).locator(".sline");
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toHaveText("REGULAR1");
  await expect(lines.nth(1)).toHaveText("FOIL1");
  await expect(page.locator(".cardgrid .pocket .pocketqty")).toHaveText("2");
  await expect(page.locator(".cardgrid .pocket .dmarks")).toHaveText("FOIL");
  // clicking a line selects that copy
  await lines.nth(1).click();
  await expect(lines.nth(1)).toHaveClass(/active/);
  await expect(lines.nth(0)).not.toHaveClass(/active/);
});

test("the Filters panel has the new fields, and the About guide is not squished on the desktop", async ({ page }) => {
  await signUp(page, "v12f");
  await page.locator("#flt-creature").fill("Angel");
  await expect(page.locator("#view-cards .row", { hasText: "Serra Angel" })).toBeVisible();
  await expect(page.locator("#view-cards .row", { hasText: "Llanowar Elves" })).toHaveCount(0);
  await page.locator(".pbody .btn", { hasText: "Clear filters" }).click();
  await page.locator("#flt-artist").fill("no such artist at all");
  await expect(page.locator("#view-cards .row")).toHaveCount(0);
  await page.locator(".pbody .btn", { hasText: "Clear filters" }).click();

  await menu(page, "Help", "About Mana Vault");
  await expect(page.locator(".about .abtoc")).toBeVisible();
  await expect(page.locator(".about .picker.abselect")).toBeHidden();
  const width = await page.locator(".about .abpage").evaluate((element) => element.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(500);
  await page.locator(".abtoc a", { hasText: "Administration" }).click();
  await expect(page.locator(".abpage h1")).toHaveText("Administration");
});
